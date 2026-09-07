import { LanguageError } from '../diagnostics';

export type DrumVoiceId = 'kick' | 'snare' | 'clap' | 'hihat' | 'openhat' | 'lowtom' | 'hightom';
export type DrumSourceId = DrumVoiceId | 'sample';

export type DrumSlotDefaults = {
  level: number;
  pan: number;
  tune: number;
  decay: number;
  transient: number;
  snappy: number;
  color: number;
  noise: number;
  humanize: number;
};

export type DrumKitEntry = { source: DrumSourceId; sampleAlias: string | null; alias: string; defaults: DrumSlotDefaults };
export type DrumKitDefinition = { entries: Map<string, DrumKitEntry> };
export type DrumkitState = { name: string; line: number; indentation: number; kit: DrumKitDefinition | null; viewSteps: number };

export const DRUM_DEFAULTS: DrumSlotDefaults = {
  level: 100, pan: 0, tune: 0, decay: 70,
  transient: 30, snappy: 75, color: 50, noise: 50, humanize: 0,
};

export const SONUS606_KIT: DrumKitDefinition = {
  entries: new Map<string, DrumKitEntry>([
    ['kick', { source: 'kick', sampleAlias: null, alias: 'kick', defaults: { ...DRUM_DEFAULTS } }],
    ['snare', { source: 'snare', sampleAlias: null, alias: 'snare', defaults: { ...DRUM_DEFAULTS } }],
    ['clap', { source: 'clap', sampleAlias: null, alias: 'clap', defaults: { ...DRUM_DEFAULTS } }],
    ['hihat', { source: 'hihat', sampleAlias: null, alias: 'hihat', defaults: { ...DRUM_DEFAULTS, decay: 30 } }],
    ['openhat', { source: 'openhat', sampleAlias: null, alias: 'openhat', defaults: { ...DRUM_DEFAULTS, decay: 75 } }],
    ['lowtom', { source: 'lowtom', sampleAlias: null, alias: 'lowtom', defaults: { ...DRUM_DEFAULTS } }],
    ['hightom', { source: 'hightom', sampleAlias: null, alias: 'hightom', defaults: { ...DRUM_DEFAULTS } }],
  ]),
};

export function cloneDrumKit(kit: DrumKitDefinition): DrumKitDefinition {
  return { entries: new Map([...kit.entries].map(([alias, entry]) => [alias, {
    source: entry.source, sampleAlias: entry.sampleAlias, alias: entry.alias, defaults: { ...entry.defaults },
  }])) };
}

export function drumParameterDefaults(source: DrumSourceId, raw: string, line: number, base: DrumSlotDefaults = DRUM_DEFAULTS): DrumSlotDefaults {
  const result = { ...base };
  const modifiers = raw.trim() ? raw.split(',').map((item) => item.trim()).filter(Boolean) : [];
  for (const modifier of modifiers) {
    const match = modifier.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+(-?\d+(?:\.\d+)?)$/);
    if (!match) throw new LanguageError([{ line, message: `invalid drum WITH parameter '${modifier}'` }]);
    const key = match[1].toLowerCase() as keyof DrumSlotDefaults;
    const value = Number(match[2]);
    if (key === 'level' || key === 'decay' || key === 'transient' || key === 'snappy' || key === 'color' || key === 'noise' || key === 'humanize') {
      if (value < 0 || value > 100) throw new LanguageError([{ line, message: `drum ${key} expects 0..100` }]);
    } else if (key === 'pan') {
      if (value < -100 || value > 100) throw new LanguageError([{ line, message: 'drum pan expects -100..100' }]);
    } else if (key === 'tune') {
      if (value < -24 || value > 24) throw new LanguageError([{ line, message: 'drum tune expects -24..24 semitones' }]);
    } else throw new LanguageError([{ line, message: `unknown drum parameter '${match[1]}'` }]);
    if (source === 'sample' && (key === 'transient' || key === 'snappy' || key === 'color' || key === 'noise')) {
      throw new LanguageError([{ line, message: `${key} is not available for drum samples` }]);
    }
    if (key === 'transient' && source !== 'kick') throw new LanguageError([{ line, message: 'transient is available only for drum.kick' }]);
    if ((key === 'snappy' || key === 'color') && source !== 'snare') throw new LanguageError([{ line, message: `${key} is available only for drum.snare` }]);
    if (key === 'noise' && source !== 'clap') throw new LanguageError([{ line, message: 'noise is available only for drum.clap' }]);
    result[key] = value;
  }
  return result;
}

export function parseDrumKitEntry(raw: string, line: number, kit: DrumKitDefinition): DrumKitEntry {
  const sourceEntry = raw.match(/^drum\.(kick|snare|clap|hihat|openhat|lowtom|hightom)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+with\s+(.+))?$/i);
  if (sourceEntry) {
    const source = sourceEntry[1].toLowerCase() as DrumVoiceId;
    return { source, sampleAlias: null, alias: sourceEntry[2], defaults: drumParameterDefaults(source, sourceEntry[3] ?? '', line) };
  }
  const sampleEntry = raw.match(/^sample\s+([A-Za-z_][A-Za-z0-9_]*)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+with\s+(.+))?$/i);
  if (sampleEntry) {
    return {
      source: 'sample',
      sampleAlias: sampleEntry[1],
      alias: sampleEntry[2],
      defaults: drumParameterDefaults('sample', sampleEntry[3] ?? '', line, { ...DRUM_DEFAULTS, decay: 100 }),
    };
  }
  const override = raw.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+with\s+(.+))?$/i);
  if (override) {
    const previous = kit.entries.get(override[1]);
    if (!previous) throw new LanguageError([{ line, message: `unknown KIT alias '${override[1]}'` }]);
    return { source: previous.source, sampleAlias: previous.sampleAlias, alias: previous.alias, defaults: drumParameterDefaults(previous.source, override[2] ?? '', line, previous.defaults) };
  }
  throw new LanguageError([{ line, message: `invalid KIT entry '${raw}'` }]);
}

export function applyDrumKitEntries(base: DrumKitDefinition, body: string, line: number): DrumKitDefinition {
  const result = cloneDrumKit(base);
  for (const raw of body.split(/\s*;\s*/).map((item) => item.trim()).filter(Boolean)) {
    const entry = parseDrumKitEntry(raw, line, result);
    result.entries.set(entry.alias, entry);
  }
  return result;
}

export function serializeDrumParams(params: DrumSlotDefaults): string { return JSON.stringify(params); }
