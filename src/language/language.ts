import {
  MODE_INTERVALS,
  midiFromNote,
  midiFromRoot,
  midiToFrequency,
} from './parser/pitch';

export type LanguageDiagnostic = {
  line: number;
  message: string;
};

export class LanguageError extends Error {
  readonly diagnostics: LanguageDiagnostic[];

  constructor(diagnostics: LanguageDiagnostic[]) {
    super(diagnostics.map((item) => `line ${item.line}: ${item.message}`).join('\n'));
    this.name = 'LanguageError';
    this.diagnostics = diagnostics;
  }
}


export type ProgramCapability = 'visual' | 'midi' | 'audioin' | 'osc';

export type ProgramCapabilitySet = {
  capabilities: ReadonlySet<ProgramCapability>;
  directiveLine: number | null;
  directiveText: string | null;
};

const PROGRAM_CAPABILITIES = new Set<ProgramCapability>(['visual', 'midi', 'audioin', 'osc']);

export function parseProgramCapabilities(source: string): ProgramCapabilitySet {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let directiveLine: number | null = null;
  let directiveText: string | null = null;
  const capabilities = new Set<ProgramCapability>();
  let firstStatementLine: number | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = stripComment(lines[index]).trim();
    if (!trimmed) continue;
    if (firstStatementLine === null) firstStatementLine = index + 1;
    if (!/^USE\b/i.test(trimmed)) continue;

    if (directiveLine !== null) {
      throw new LanguageError([{ line: index + 1, message: 'USE directive can only be declared once' }]);
    }
    directiveLine = index + 1;
    directiveText = trimmed;
    if (directiveLine != firstStatementLine) {
      throw new LanguageError([{ line: directiveLine, message: 'USE must be the first instruction in the script' }]);
    }

    const body = trimmed.replace(/^USE\b/i, '').trim();
    if (!body) throw new LanguageError([{ line: directiveLine, message: 'USE expects one or more capabilities separated by commas' }]);
    const items = body.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
    if (items.length == 0) throw new LanguageError([{ line: directiveLine, message: 'USE expects one or more capabilities separated by commas' }]);
    for (const item of items) {
      if (!/^[a-z][a-z0-9_-]*$/i.test(item)) {
        throw new LanguageError([{ line: directiveLine, message: `invalid USE capability '${item}'` }]);
      }
      if (!PROGRAM_CAPABILITIES.has(item as ProgramCapability)) {
        throw new LanguageError([{ line: directiveLine, message: `unknown USE capability '${item}'` }]);
      }
      if (capabilities.has(item as ProgramCapability)) {
        throw new LanguageError([{ line: directiveLine, message: `duplicate USE capability '${item}'` }]);
      }
      capabilities.add(item as ProgramCapability);
    }
  }

  return { capabilities, directiveLine, directiveText };
}

type SourceKind = 'voice' | 'note' | 'freq' | 'time' | 'clock' | 'trigger' | 'scalar' | 'scale' | 'seq' | 'register' | 'envelope' | 'kit';

type SourceDefinition =
  | { kind: 'scalar'; internalName?: string }
  | { kind: 'time'; amount: number; unit: 'ms' | 'sec' | 'beat'; display: string; internalName?: string }
  | { kind: 'clock'; internalName: string; rateLabel: string; display: string }
  | { kind: 'freq'; values: number[]; display: string; internalName?: string }
  | { kind: 'note'; values: number[]; display: string; favor: SequenceFavorEntry[]; internalName?: string }
  | { kind: 'scale'; values: number[]; display: string; internalName?: string }
  | { kind: 'seq'; model: 'turing' | 'life' | null; values: number[]; display: string; internalName?: string }
  | { kind: 'register'; size: number; display: string; internalName?: string }
  | { kind: 'envelope'; spec: EnvelopeSpec; display: string; internalName?: string }
  | { kind: 'kit'; kit: DrumKitDefinition; display: string; internalName?: string };


type EnvelopeCurve = 'lin' | 'log';
type EnvelopeTimeUnit = 'ms' | 'sec' | 'beat';
type EnvelopeTimeStage = {
  amount: number;
  unit: EnvelopeTimeUnit;
  curve: EnvelopeCurve;
};
type EnvelopeSpec = {
  delay: EnvelopeTimeStage | null;
  attack: EnvelopeTimeStage | null;
  hold: EnvelopeTimeStage | null;
  decay: EnvelopeTimeStage | null;
  sustain: number | null; // normalized 0..1
  release: EnvelopeTimeStage | null;
  range: [number, number];
  display: string;
};

type DrumVoiceId = 'kick' | 'snare' | 'clap' | 'hihat' | 'openhat' | 'lowtom' | 'hightom';

type DrumSlotDefaults = {
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

type DrumKitEntry = { source: DrumVoiceId; alias: string; defaults: DrumSlotDefaults };
type DrumKitDefinition = { entries: Map<string, DrumKitEntry> };
type DrumkitState = { name: string; line: number; indentation: number; kit: DrumKitDefinition | null };

const DRUM_DEFAULTS: DrumSlotDefaults = {
  level: 100, pan: 0, tune: 0, decay: 70,
  transient: 30, snappy: 75, color: 50, noise: 50, humanize: 0,
};

const SONUS606_KIT: DrumKitDefinition = {
  entries: new Map<string, DrumKitEntry>([
    ['kick', { source: 'kick', alias: 'kick', defaults: { ...DRUM_DEFAULTS } }],
    ['snare', { source: 'snare', alias: 'snare', defaults: { ...DRUM_DEFAULTS } }],
    ['clap', { source: 'clap', alias: 'clap', defaults: { ...DRUM_DEFAULTS } }],
    ['hihat', { source: 'hihat', alias: 'hihat', defaults: { ...DRUM_DEFAULTS, decay: 30 } }],
    ['openhat', { source: 'openhat', alias: 'openhat', defaults: { ...DRUM_DEFAULTS, decay: 75 } }],
    ['lowtom', { source: 'lowtom', alias: 'lowtom', defaults: { ...DRUM_DEFAULTS } }],
    ['hightom', { source: 'hightom', alias: 'hightom', defaults: { ...DRUM_DEFAULTS } }],
  ]),
};

function cloneDrumKit(kit: DrumKitDefinition): DrumKitDefinition {
  return { entries: new Map([...kit.entries].map(([alias, entry]) => [alias, {
    source: entry.source, alias: entry.alias, defaults: { ...entry.defaults },
  }])) };
}

function drumParameterDefaults(source: DrumVoiceId, raw: string, line: number, base: DrumSlotDefaults = DRUM_DEFAULTS): DrumSlotDefaults {
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
    if (key === 'transient' && source !== 'kick') throw new LanguageError([{ line, message: 'transient is available only for drum.kick' }]);
    if ((key === 'snappy' || key === 'color') && source !== 'snare') throw new LanguageError([{ line, message: `${key} is available only for drum.snare` }]);
    if (key === 'noise' && source !== 'clap') throw new LanguageError([{ line, message: 'noise is available only for drum.clap' }]);
    result[key] = value;
  }
  return result;
}

function parseDrumKitEntry(raw: string, line: number, kit: DrumKitDefinition): DrumKitEntry {
  const sourceEntry = raw.match(/^drum\.(kick|snare|clap|hihat|openhat|lowtom|hightom)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+with\s+(.+))?$/i);
  if (sourceEntry) {
    const source = sourceEntry[1].toLowerCase() as DrumVoiceId;
    return { source, alias: sourceEntry[2], defaults: drumParameterDefaults(source, sourceEntry[3] ?? '', line) };
  }
  const override = raw.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+with\s+(.+))?$/i);
  if (override) {
    const previous = kit.entries.get(override[1]);
    if (!previous) throw new LanguageError([{ line, message: `unknown KIT alias '${override[1]}'` }]);
    return { source: previous.source, alias: previous.alias, defaults: drumParameterDefaults(previous.source, override[2] ?? '', line, previous.defaults) };
  }
  throw new LanguageError([{ line, message: `invalid KIT entry '${raw}'` }]);
}

function applyDrumKitEntries(base: DrumKitDefinition, body: string, line: number): DrumKitDefinition {
  const result = cloneDrumKit(base);
  for (const raw of body.split(/\s*;\s*/).map((item) => item.trim()).filter(Boolean)) {
    const entry = parseDrumKitEntry(raw, line, result);
    result.entries.set(entry.alias, entry);
  }
  return result;
}

function serializeDrumParams(params: DrumSlotDefaults): string { return JSON.stringify(params); }

type VoiceState = {
  name: string;
  line: number;
  indentation: number;
  hasSound: boolean;
  soundId: string | null;
  pitchProperty: 'note' | 'scale' | 'freq' | null;
  embeddedFilter: string | null;
};

type FxState = {
  name: string;
  line: number;
  indentation: number;
  hasModel: boolean;
  modelId: string | null;
  pitchProperty: 'note' | 'scale' | 'freq' | null;
};
type FilterState = {
  name: string;
  internalName: string;
  line: number;
  indentation: number;
  ownerVoice: string | null;
  hasModel: boolean;
};

type SeqState = {
  name: string;
  line: number;
  indentation: number;
  modelId: 'turing' | 'life' | null;
  lifeVariant: 'conway' | 'highlife' | 'seeds' | 'day-night' | 'morley';
  length: number;
  change: number;
  size: 8 | 16;
  density: number;
  maxDensity: number | null;
  values: number[];
  material: 'notes' | 'scale' | 'freqs' | null;
};

type RegisterState = {
  name: string;
  line: number;
  indentation: number;
  modelId: 'shift' | null;
  size: number;
  sourceName: string | null;
  readerMode: 'direct' | 'order' | 'random' | 'walk' | 'reverse' | 'pendulum' | 'first' | 'last';
  readerAmount: number;
  hasWrite: boolean;
};


type ClockState = {
  name: string;
  line: number;
  indentation: number;
  parent: string | null;
  rate: number;
  rateLabel: string;
  jitter: number;
  drift: number;
  view: boolean;
};



type FxParameter = 'position' | 'size' | 'pitch' | 'density' | 'texture' | 'mix' | 'spread' | 'feedback' | 'reverb' | 'lines' | 'reverse' | 'tape' | 'diffusion' | 'pingpong';

type FxModelSchema = {
  lowLevelMode: string;
  parameters: ReadonlySet<FxParameter>;
  musicalPitch: boolean;
};

type ModState = {
  name: string;
  internalName: string;
  line: number;
  indentation: number;
  ownerVoice: string | null;
  modelId: 'swell' | 'dices';
};

type ModSourceDefinition = {
  internalName: string;
  ownerVoice: string | null;
  modelId: 'swell' | 'dices';
};


type SelectionMode = 'order' | 'random' | 'walk' | 'shuffle' | 'reverse' | 'pendulum';

type SequenceFavorEntry = {
  target: string;
  operator: 'weight' | 'repeat' | 'retrig';
  amount: number;
};

type SelectionSpec = {
  mode: SelectionMode;
  amount: number;
  favor: SequenceFavorEntry[];
};

type TimingModifiers = {
  chance: number;
  drift: boolean;
  loose: boolean;
};

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

type SoundParameterSchema = { min: number; max: number; modulatable: boolean };
type SoundEngineSchema = {
  parameters: Record<string, SoundParameterSchema>;
  options: ReadonlySet<string>;
};

const MACRO_PARAMETERS: Record<string, SoundParameterSchema> = {
  harmo: { min: 0, max: 100, modulatable: true },
  timbre: { min: 0, max: 100, modulatable: true },
  morph: { min: 0, max: 100, modulatable: true },
};

const MATTER_PARAMETERS: Record<string, SoundParameterSchema> = {
  geometry: { min: 0, max: 100, modulatable: false },
  brightness: { min: 0, max: 100, modulatable: false },
  damping: { min: 0, max: 100, modulatable: false },
  position: { min: 0, max: 100, modulatable: false },
  space: { min: 0, max: 100, modulatable: false },
};

const RESONATOR_PARAMETERS: Record<string, SoundParameterSchema> = {
  structure: { min: 0, max: 100, modulatable: false },
  brightness: { min: 0, max: 100, modulatable: false },
  damping: { min: 0, max: 100, modulatable: false },
  position: { min: 0, max: 100, modulatable: false },
};

const SOUND_ENGINE_REGISTRY: Record<string, SoundEngineSchema> = {
  'macro.analog': { parameters: MACRO_PARAMETERS, options: new Set(['lpg']) },
  'macro.waves': { parameters: MACRO_PARAMETERS, options: new Set(['lpg']) },
  'macro.fm': { parameters: MACRO_PARAMETERS, options: new Set(['lpg']) },
  'macro.grain': { parameters: MACRO_PARAMETERS, options: new Set(['lpg']) },
  'macro.additive': { parameters: MACRO_PARAMETERS, options: new Set(['lpg']) },
  'macro.wavetable': { parameters: MACRO_PARAMETERS, options: new Set(['lpg']) },
  'macro.chord': { parameters: MACRO_PARAMETERS, options: new Set(['lpg']) },
  'macro.speech': { parameters: MACRO_PARAMETERS, options: new Set(['lpg']) },
  'macro.swarm': { parameters: MACRO_PARAMETERS, options: new Set(['lpg']) },
  'macro.noise': { parameters: MACRO_PARAMETERS, options: new Set(['lpg']) },
  'macro.particle': { parameters: MACRO_PARAMETERS, options: new Set(['lpg']) },
  'macro.string': { parameters: MACRO_PARAMETERS, options: new Set(['lpg']) },
  'macro.analog-vcf': { parameters: MACRO_PARAMETERS, options: new Set(['lpg']) },
  'macro.phase': { parameters: MACRO_PARAMETERS, options: new Set(['lpg']) },
  'macro.terrain': { parameters: MACRO_PARAMETERS, options: new Set(['lpg']) },
  'macro.strings': { parameters: MACRO_PARAMETERS, options: new Set(['lpg']) },
  'macro.chiptune': { parameters: MACRO_PARAMETERS, options: new Set(['lpg']) },
  'matter': { parameters: MATTER_PARAMETERS, options: new Set() },
  'resonator.modal': { parameters: RESONATOR_PARAMETERS, options: new Set() },
  'resonator.sympathetic': { parameters: RESONATOR_PARAMETERS, options: new Set() },
  'resonator.strings': { parameters: RESONATOR_PARAMETERS, options: new Set() },
  'resonator.string': { parameters: RESONATOR_PARAMETERS, options: new Set() },
};

const SOUND_PARAMETER_NAMES = new Set(
  Object.values(SOUND_ENGINE_REGISTRY).flatMap((engine) => Object.keys(engine.parameters)),
);

const MIST_PARAMETERS = new Set<FxParameter>([
  'position', 'size', 'pitch', 'density', 'texture', 'mix', 'spread', 'feedback', 'reverb',
]);

const SKY_PARAMETERS = new Set<FxParameter>([
  'position', 'size', 'density', 'texture', 'mix', 'spread', 'feedback', 'reverb',
]);

const DELAY_PARAMETERS = new Set<FxParameter>([
  'mix', 'spread', 'feedback', 'lines', 'reverse', 'pitch', 'tape', 'diffusion', 'pingpong',
]);

const FX_MODEL_REGISTRY: Record<string, FxModelSchema> = {
  'mist.grain':     { lowLevelMode: 'granular',        parameters: MIST_PARAMETERS, musicalPitch: true },
  'mist.stretch':   { lowLevelMode: 'stretch',         parameters: MIST_PARAMETERS, musicalPitch: true },
  'mist.delay':     { lowLevelMode: 'looping_delay',   parameters: MIST_PARAMETERS, musicalPitch: true },
  'mist.spectral':  { lowLevelMode: 'spectral',        parameters: MIST_PARAMETERS, musicalPitch: true },
  'mist.reverb':    { lowLevelMode: 'oliverb',         parameters: MIST_PARAMETERS, musicalPitch: true },
  'mist.resonator': { lowLevelMode: 'resonestor',      parameters: MIST_PARAMETERS, musicalPitch: true },
  'mist.repeat':    { lowLevelMode: 'beat_repeat',     parameters: MIST_PARAMETERS, musicalPitch: true },
  'mist.smear':     { lowLevelMode: 'spectral_clouds', parameters: MIST_PARAMETERS, musicalPitch: true },
  'sky':            { lowLevelMode: 'sky',             parameters: SKY_PARAMETERS, musicalPitch: false },
  'delay':          { lowLevelMode: 'delay',           parameters: DELAY_PARAMETERS, musicalPitch: false },
};


function stripComment(line: string): string {
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (let i = 0; i < line.length - 1; i += 1) {
    const char = line[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '/' && line[i + 1] === '/') return line.slice(0, i);
  }
  return line;
}

function formatSourceNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function scaleValues(
  root: string,
  modeRaw: string,
  rangeStart: string | null,
  rangeEnd: string | null,
  line: number,
): { values: number[]; display: string } {
  const mode = modeRaw.toLowerCase();
  const intervals = MODE_INTERVALS[mode];
  if (!intervals) {
    throw new LanguageError([{ line, message: `unknown scale mode '${modeRaw}'` }]);
  }

  const rootClass = midiFromRoot(root, 0);
  if (rootClass === null) {
    throw new LanguageError([{ line, message: `invalid scale root '${root}'` }]);
  }
  const pitchClass = ((rootClass % 12) + 12) % 12;
  const allowed = new Set(intervals.map((interval) => (pitchClass + interval) % 12));

  if (rangeStart === null || rangeEnd === null) {
    const rootMidi = midiFromRoot(root);
    if (rootMidi === null) {
      throw new LanguageError([{ line, message: `invalid scale root '${root}'` }]);
    }
    const values = intervals.map((interval) => midiToFrequency(rootMidi + interval));
    return { values, display: `${root} ${modeRaw}` };
  }

  const startMidi = midiFromNote(rangeStart);
  const endMidi = midiFromNote(rangeEnd);
  if (startMidi === null) {
    throw new LanguageError([{ line, message: `invalid scale range note '${rangeStart}'` }]);
  }
  if (endMidi === null) {
    throw new LanguageError([{ line, message: `invalid scale range note '${rangeEnd}'` }]);
  }

  const direction = startMidi <= endMidi ? 1 : -1;
  const values: number[] = [];
  for (let midi = startMidi; direction > 0 ? midi <= endMidi : midi >= endMidi; midi += direction) {
    if (allowed.has(((midi % 12) + 12) % 12)) values.push(midiToFrequency(midi));
  }

  if (values.length === 0) {
    throw new LanguageError([{ line, message: 'scale range contains no notes from the selected scale' }]);
  }

  return {
    values,
    display: `${root} ${modeRaw} ${rangeStart}..${rangeEnd}`,
  };
}

function parseScaleSpec(
  value: string,
  line: number,
  allowSelection: boolean,
): { values: number[]; display: string; mode: SelectionMode; amount: number; favor: SequenceFavorEntry[]; view: boolean } | null {
  const head = value.match(/^([A-Ga-g][#b]?)\s+([A-Za-z][A-Za-z-]*)(?:\s+with\s+(.+))?$/i);
  if (!head) return null;
  if (!MODE_INTERVALS[head[2].toLowerCase()]) return null;

  let rangeStart: string | null = null;
  let rangeEnd: string | null = null;
  let mode: SelectionMode = 'order';
  let amount = 0;
  let favor: SequenceFavorEntry[] = [];
  let view = false;
  let selectionSeen = false;

  const modifiers = (head[3] ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  for (const modifier of modifiers) {
    const range = modifier.match(/^range\s+([A-Ga-g][#b]?-?\d+)\s+([A-Ga-g][#b]?-?\d+)$/i);
    if (range) {
      if (rangeStart !== null) {
        throw new LanguageError([{ line, message: 'scale accepts only one range modifier' }]);
      }
      rangeStart = range[1];
      rangeEnd = range[2];
      continue;
    }

    if (/^view$/i.test(modifier)) {
      view = true;
      continue;
    }

    const selection = parseSelectionMode([modifier], line, 'scale');
    if (selection.mode !== 'order' || selection.favor.length > 0 || /^order$/i.test(modifier)) {
      if (!allowSelection) {
        throw new LanguageError([{
          line,
          message: `SET scale does not store sequencing modifier '${modifier}'; apply it where the scale is used`,
        }]);
      }
      if (selection.mode !== 'order' || /^order$/i.test(modifier)) {
        if (selectionSeen) {
          throw new LanguageError([{ line, message: 'scale accepts only one sequencing modifier' }]);
        }
        mode = selection.mode;
        amount = selection.amount;
        selectionSeen = true;
      }
      if (selection.favor.length > 0) favor = selection.favor;
      continue;
    }
  }

  validateFavorForMode(favor, mode, line, 'scale');
  const scale = scaleValues(head[1], head[2], rangeStart, rangeEnd, line);
  return { ...scale, mode, amount, favor, view };
}

function parseScaleSource(value: string, line: number): { values: number[]; display: string } | null {
  const parsed = parseScaleSpec(value, line, false);
  return parsed ? { values: parsed.values, display: parsed.display } : null;
}

function inlinePianoDirective(
  ownerKind: 'voice' | 'fx' | 'filter',
  owner: string,
  property: 'note' | 'scale',
  line: number,
  values: number[],
): string {
  return `__inlinepiano(${JSON.stringify(ownerKind)},${JSON.stringify(owner)},${JSON.stringify(property)},${line},${JSON.stringify(values.join('|'))});`;
}

function inlineScalarDirective(
  ownerKind: 'voice' | 'fx' | 'filter',
  owner: string,
  property: string,
  line: number,
  base: string,
): string {
  return `__inlinescalar(${JSON.stringify(ownerKind)},${JSON.stringify(owner)},${JSON.stringify(property)},${line},${JSON.stringify(base)});`;
}

function sourceSequenceCode(
  voiceName: string,
  values: number[],
  mode: SelectionMode = 'order',
  amount = 0,
  favor: SequenceFavorEntry[] = [],
  view = false,
  line = 0,
): string {
  const directive = values.length > 1 ? ` ${sequenceDirective(voiceName, values, mode, amount, favor)}` : '';
  const piano = view ? ` ${inlinePianoDirective('voice', voiceName, 'scale', line, values)}` : '';
  return `${voiceName}.freq(${values[0]});${directive}${piano}`;
}

function parseList(value: string, line: number, property: string): string[] {
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return [trimmed];

  const content = trimmed.slice(1, -1).trim();
  if (!content) {
    throw new LanguageError([{ line, message: `${property} list cannot be empty` }]);
  }
  return content.split(/\s+/);
}

function parseNoteSequenceToken(
  token: string,
  line: number,
): { note: string; favor: SequenceFavorEntry | null } {
  const weighted = token.match(/^([A-Ga-g][#b]?-?\d+)!(\d+(?:\.\d+)?)$/);
  if (weighted) {
    const amount = numberValue(weighted[2], line, 'note weight');
    if (amount < 0 || amount > 100) {
      throw new LanguageError([{ line, message: 'note weights must be between 0 and 100' }]);
    }
    return { note: weighted[1], favor: { target: weighted[1], operator: 'weight', amount } };
  }

  const retrig = token.match(/^([A-Ga-g][#b]?-?\d+)\*\*(\d+)$/);
  if (retrig) {
    const amount = numberValue(retrig[2], line, 'retrig');
    if (!Number.isInteger(amount) || amount < 2) {
      throw new LanguageError([{ line, message: 'retrig count must be an integer >= 2' }]);
    }
    return { note: retrig[1], favor: { target: retrig[1], operator: 'retrig', amount } };
  }

  const repeated = token.match(/^([A-Ga-g][#b]?-?\d+)\*(\d+)$/);
  if (repeated) {
    const amount = numberValue(repeated[2], line, 'repeat');
    if (!Number.isInteger(amount) || amount < 2) {
      throw new LanguageError([{ line, message: 'repeat count must be an integer >= 2' }]);
    }
    return { note: repeated[1], favor: { target: repeated[1], operator: 'repeat', amount } };
  }

  return { note: token, favor: null };
}

function mergeFavor(
  inlineFavor: SequenceFavorEntry[],
  modifierFavor: SequenceFavorEntry[],
): SequenceFavorEntry[] {
  const merged = new Map<string, SequenceFavorEntry>();
  for (const entry of [...inlineFavor, ...modifierFavor]) {
    merged.set(`${entry.target.toLowerCase()}:${entry.operator}`, entry);
  }
  return [...merged.values()];
}

function numberValue(value: string, line: number, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new LanguageError([{ line, message: `${label} expects a number` }]);
  }
  return number;
}

function normalizedAmount(value: string, line: number): number {
  const number = numberValue(value, line, 'at');
  if (number < -100 || number > 100) {
    throw new LanguageError([{ line, message: 'at must be between -100 and 100' }]);
  }
  return number;
}

function splitWith(value: string): { base: string; modifiers: string[] } {
  const match = value.match(/^(.*?)\s+with\s+(.+)$/i);
  if (!match) return { base: value.trim(), modifiers: [] };
  return {
    base: match[1].trim(),
    modifiers: match[2].split(',').map((item) => item.trim()).filter(Boolean),
  };
}

function parseFavorEntries(
  modifier: string,
  line: number,
  property: string,
): SequenceFavorEntry[] {
  const match = modifier.match(/^favor\s+\[(.*)\]$/i);
  if (!match) return [];

  const content = match[1].trim();
  if (!content) throw new LanguageError([{ line, message: `${property} favor list cannot be empty` }]);

  return content.split(/\s+/).map((token) => {
    const weighted = token.match(/^([A-Ga-g][#b]?-?\d*)!(\d+(?:\.\d+)?)$/);
    if (weighted) {
      const amount = numberValue(weighted[2], line, 'favor weight');
      if (amount < 0 || amount > 100) {
        throw new LanguageError([{ line, message: 'favor weights must be between 0 and 100' }]);
      }
      return { target: weighted[1], operator: 'weight' as const, amount };
    }

    const retrig = token.match(/^([A-Ga-g][#b]?-?\d*)\*\*(\d+)$/);
    if (retrig) {
      const amount = numberValue(retrig[2], line, 'retrig');
      if (!Number.isInteger(amount) || amount < 2) {
        throw new LanguageError([{ line, message: 'retrig count must be an integer >= 2' }]);
      }
      return { target: retrig[1], operator: 'retrig' as const, amount };
    }

    const repeated = token.match(/^([A-Ga-g][#b]?-?\d*)\*(\d+)$/);
    if (repeated) {
      const amount = numberValue(repeated[2], line, 'repeat');
      if (!Number.isInteger(amount) || amount < 2) {
        throw new LanguageError([{ line, message: 'repeat count must be an integer >= 2' }]);
      }
      return { target: repeated[1], operator: 'repeat' as const, amount };
    }

    throw new LanguageError([{ line, message: `invalid favor entry '${token}'` }]);
  });
}

function validateFavorForMode(
  favor: SequenceFavorEntry[],
  mode: SelectionMode,
  line: number,
  property: string,
): void {
  if (favor.length === 0) return;

  if (mode === 'random') {
    if (favor.some((entry) => entry.operator !== 'weight')) {
      throw new LanguageError([{ line, message: `${property} random favor accepts only ! weights` }]);
    }
    return;
  }

  if (mode === 'order' || mode === 'reverse' || mode === 'pendulum') {
    if (favor.some((entry) => entry.operator === 'weight')) {
      throw new LanguageError([{ line, message: `${property} ${mode} favor accepts only * repeats and ** retrigs` }]);
    }
    return;
  }

  throw new LanguageError([{ line, message: `${property} favor is not available with ${mode}` }]);
}

function parseSelectionMode(modifiers: string[], line: number, property: string): SelectionSpec {
  let mode: SelectionMode = 'order';
  let amount = 0;
  let explicit = false;
  let favor: SequenceFavorEntry[] = [];

  for (const modifier of modifiers) {
    const normalized = modifier.toLowerCase();

    if (/^favor\s+\[/i.test(modifier)) {
      if (favor.length > 0) {
        throw new LanguageError([{ line, message: `${property} accepts only one favor modifier` }]);
      }
      favor = parseFavorEntries(modifier, line, property);
      continue;
    }

    if (['random', 'shuffle', 'reverse', 'pendulum', 'order'].includes(normalized)) {
      if (explicit) {
        throw new LanguageError([{ line, message: `${property} accepts only one selection modifier` }]);
      }
      mode = normalized as SelectionMode;
      explicit = true;
      continue;
    }

    const walk = modifier.match(/^walk(?:\s+(\d+(?:\.\d+)?))?$/i);
    if (walk) {
      if (explicit) {
        throw new LanguageError([{ line, message: `${property} accepts only one selection modifier` }]);
      }
      amount = walk[1] === undefined ? 1 : numberValue(walk[1], line, 'walk');
      if (amount <= 0) {
        throw new LanguageError([{ line, message: 'walk amount must be greater than 0' }]);
      }
      mode = 'walk';
      explicit = true;
      continue;
    }

    throw new LanguageError([{ line, message: `${property} does not support modifier '${modifier}'` }]);
  }

  validateFavorForMode(favor, mode, line, property);
  return { mode, amount, favor };
}

function parseTimingModifiers(modifiers: string[], line: number, _unit: string): TimingModifiers {
  const result: TimingModifiers = { chance: 100, drift: false, loose: false };
  let probabilityModifier: 'chance' | 'coin' | null = null;

  for (const modifier of modifiers) {
    const chance = modifier.match(/^chance\s+(.+)$/i);
    if (chance) {
      if (probabilityModifier) {
        throw new LanguageError([{ line, message: `timing cannot combine ${probabilityModifier} with chance` }]);
      }
      const value = numberValue(chance[1], line, 'chance');
      if (value < 0 || value > 100) {
        throw new LanguageError([{ line, message: 'chance must be between 0 and 100' }]);
      }
      result.chance = value;
      probabilityModifier = 'chance';
      continue;
    }

    const normalized = modifier.toLowerCase();
    if (normalized === 'coin') {
      if (probabilityModifier) {
        throw new LanguageError([{ line, message: `timing cannot combine ${probabilityModifier} with coin` }]);
      }
      result.chance = 50;
      probabilityModifier = 'coin';
      continue;
    }
    if (normalized === 'loose') {
      result.loose = true;
      continue;
    }
    throw new LanguageError([{ line, message: `timing does not support modifier '${modifier}'` }]);
  }

  return result;
}

function sequenceDirective(
  name: string,
  values: number[],
  mode: SelectionMode,
  amount = 0,
  favor: SequenceFavorEntry[] = [],
): string {
  return `__sequence(${JSON.stringify(name)},${JSON.stringify(values.join('|'))},${JSON.stringify(mode)},${amount},${JSON.stringify(JSON.stringify(favor))});`;
}

function compileFrom(
  voice: VoiceState,
  property: 'note' | 'freq' | 'scale' | 'cycle',
  sourceName: string,
  line: number,
  sourceKinds: Map<string, SourceKind>,
  sourceDefinitions: Map<string, SourceDefinition>,
): string {
  if (!IDENTIFIER.test(sourceName)) {
    throw new LanguageError([{ line, message: `invalid source name '${sourceName}'` }]);
  }

  const actual = sourceKinds.get(sourceName);
  const definition = sourceDefinitions.get(sourceName);
  if (!actual || !definition) {
    throw new LanguageError([{ line, message: `unknown source '${sourceName}'` }]);
  }

  if (property === 'cycle') {
    if (definition.kind !== 'time') {
      throw new LanguageError([{ line, message: `source '${sourceName}' is ${actual}, expected time source for cycle` }]);
    }
    return `__cycle(${JSON.stringify(voice.name)},${definition.amount},${JSON.stringify(definition.unit)},100,false,false);`;
  }

  if (property === 'scale') {
    if (definition.kind !== 'scale') {
      throw new LanguageError([{ line, message: `source '${sourceName}' is ${actual}, expected scale source for scale` }]);
    }
    return sourceSequenceCode(voice.name, definition.values);
  }

  if (property === 'note') {
    if (definition.kind !== 'note' && definition.kind !== 'scale') {
      throw new LanguageError([{ line, message: `source '${sourceName}' is ${actual}, expected note or scale source for note` }]);
    }
    return sourceSequenceCode(voice.name, definition.values);
  }

  if (definition.kind !== 'freq') {
    throw new LanguageError([{ line, message: `source '${sourceName}' is ${actual}, expected frequency source for freq` }]);
  }
  return sourceSequenceCode(voice.name, definition.values);
}

type GenerativeMode = 'wander' | 'trend' | 'scatter' | 'flutter';

type GenerativeSpec = {
  base: string;
  mode: GenerativeMode | null;
  amount: number;
};

function parseGenerativeValue(value: string, line: number): GenerativeSpec & { view: boolean } {
  const withMatch = value.match(/^(.*?)\s+with\s+(.+)$/i);
  if (!withMatch) return { base: value.trim(), mode: null, amount: 0, view: false };

  const modifiers = withMatch[2].split(',').map((item) => item.trim()).filter(Boolean);
  let mode: GenerativeMode | null = null;
  let amount = 0;
  let view = false;

  for (const modifier of modifiers) {
    if (/^view$/i.test(modifier)) {
      view = true;
      continue;
    }
    const generative = modifier.match(/^(wander|trend|scatter|flutter)\s+(\d+(?:\.\d+)?)$/i);
    if (!generative) {
      return { base: value.trim(), mode: null, amount: 0, view: false };
    }
    if (mode) throw new LanguageError([{ line, message: 'only one generative modifier is allowed' }]);
    amount = numberValue(generative[2], line, generative[1].toLowerCase());
    if (amount <= 0) {
      throw new LanguageError([{ line, message: `${generative[1].toLowerCase()} amount must be greater than 0` }]);
    }
    mode = generative[1].toLowerCase() as GenerativeMode;
  }

  if (!mode && view) {
    throw new LanguageError([{ line, message: 'inline scalar view currently requires wander, trend, scatter, or flutter' }]);
  }

  return { base: withMatch[1].trim(), mode, amount, view };
}


function claimPitchProperty(
  owner: VoiceState | FxState,
  property: 'note' | 'scale' | 'freq',
  line: number,
  label: 'VOICE' | 'FX',
): void {
  if (owner.pitchProperty && owner.pitchProperty !== property) {
    throw new LanguageError([{
      line,
      message: `${label} '${owner.name}' already uses ${owner.pitchProperty}; PITCH can be declared only once per object`,
    }]);
  }
  owner.pitchProperty = property;
}

function scalarExpressionFromSource(value: string, sourceDefinitions: Map<string, SourceDefinition>): string {
  if (!IDENTIFIER.test(value)) return value;
  const definition = sourceDefinitions.get(value);
  if (definition?.kind !== 'scalar') return value;
  return definition.internalName ?? value;
}

function envelopeFromValue(value: string, line: number, sourceDefinitions: Map<string, SourceDefinition>): EnvelopeSpec | null {
  const inline = parseEnvelopeSpec(value, line);
  if (inline) return inline;
  if (!IDENTIFIER.test(value)) return null;
  const definition = sourceDefinitions.get(value);
  return definition?.kind === 'envelope' ? definition.spec : null;
}

function compileVoiceProperty(
  voice: VoiceState,
  property: string,
  rawValue: string,
  line: number,
  sourceKinds: Map<string, SourceKind>,
  sourceDefinitions: Map<string, SourceDefinition>,
  modSources: Map<string, ModSourceDefinition>,
  live = false,
): string {
  let key = property.toLowerCase();
  let value = rawValue.trim();
  if (/^from\b/i.test(value)) {
    throw new LanguageError([{ line, message: "FROM is no longer supported; use the source name directly" }]);
  }
  if (key === 'pitch') {
    const registerEndpoint = value.match(/^([A-Za-z_][A-Za-z0-9_]*)\.(\d+)$/);
    if (registerEndpoint) {
      const definition = sourceDefinitions.get(registerEndpoint[1]);
      if (!definition || definition.kind !== 'register') {
        throw new LanguageError([{ line, message: `unknown REGISTER source '${registerEndpoint[1]}'` }]);
      }
      const stage = Number(registerEndpoint[2]);
      if (!Number.isInteger(stage) || stage < 1 || stage > definition.size) {
        throw new LanguageError([{ line, message: `REGISTER '${registerEndpoint[1]}' stage must be from 1 to ${definition.size}` }]);
      }
      claimPitchProperty(voice, 'note', line, 'VOICE');
      return `${voice.name}.freq(440); __registerpitch(${JSON.stringify(voice.name)},${JSON.stringify(registerEndpoint[1])},${stage});`;
    }

    const explicit = value.match(/^(notes|freqs|scale)\s+(.+)$/i);
    if (explicit) {
      key = explicit[1].toLowerCase() === 'notes' ? 'note' : explicit[1].toLowerCase() === 'freqs' ? 'freq' : 'scale';
      value = explicit[2].trim();
    } else {
      const split = splitEveryClause(value);
      const direct = splitWith(split.base);
      const definition = IDENTIFIER.test(direct.base) ? sourceDefinitions.get(direct.base) : undefined;
      if (!definition || !['note', 'freq', 'scale', 'seq'].includes(definition.kind)) {
        throw new LanguageError([{ line, message: 'PITCH expects SCALE ..., NOTES [...], FREQS [...], or a compatible typed source' }]);
      }
      key = definition.kind === 'freq' ? 'freq' : definition.kind === 'scale' ? 'scale' : 'note';
    }
  } else if (key === 'note' || key === 'freq' || key === 'scale') {
    throw new LanguageError([{ line, message: `\${property.toUpperCase()} is no longer a VOICE property; use PITCH SCALE ..., PITCH NOTES ..., or PITCH FREQS ...` }]);
  }
  const soundParameter = voice.soundId ? SOUND_ENGINE_REGISTRY[voice.soundId]?.parameters[key] : undefined;
  if (SOUND_PARAMETER_NAMES.has(key)) {
    if (!voice.soundId) {
      throw new LanguageError([{ line, message: `${key} requires sound to be declared first` }]);
    }
    if (!soundParameter) {
      throw new LanguageError([{ line, message: `${key} is not available for ${voice.soundId}` }]);
    }
  }

  if (soundParameter) {
    const modulation = compileModulationRoute(voice, key, value, line, modSources);
    if (modulation) {
      if (!soundParameter.modulatable) {
        throw new LanguageError([{ line, message: `${key} is not modulatable for ${voice.soundId ?? 'this sound'}` }]);
      }
      return modulation;
    }

    const envelopeSplit = splitEveryClause(value);
    const envelope = envelopeFromValue(envelopeSplit.base, line, sourceDefinitions);
    if (envelope) {
      const timing = envelopeSplit.every ? parseEverySpec(envelopeSplit.every, line, sourceDefinitions) : null;
      return envelopeParamDirective('voice', voice.name, key, envelope, line, timing);
    }
  }

  if (key === 'note' || key === 'freq' || key === 'scale' || key === 'cycle') {
    const split = splitEveryClause(value);
    const direct = splitWith(split.base);
    const sourceName = direct.base;
    const definition = IDENTIFIER.test(sourceName) ? sourceDefinitions.get(sourceName) : undefined;

    if (definition) {
      if (key === 'cycle') {
        if (direct.modifiers.length > 0) {
          throw new LanguageError([{ line, message: 'cycle source does not accept value modifiers' }]);
        }
        return compileFrom(voice, key, sourceName, line, sourceKinds, sourceDefinitions);
      }

      claimPitchProperty(voice, key, line, 'VOICE');

      if (definition.kind === 'seq') {
        if (key !== 'note') {
          throw new LanguageError([{ line, message: `SEQ source '${sourceName}' is consumed through PITCH` }]);
        }
        const initial = definition.values[0] ?? 440;
        if (definition.model === 'life') {
          const lifeModifiers = direct.modifiers.filter((modifier) => !/^view$/i.test(modifier));
          const view = direct.modifiers.some((modifier) => /^view$/i.test(modifier));
          if (lifeModifiers.length !== 1) {
            throw new LanguageError([{ line, message: `SEQ life pool '${sourceName}' requires exactly one reader mode: ORDER, RANDOM, WALK, REVERSE, PENDULUM, FIRST, or LAST` }]);
          }
          const modeMatch = lifeModifiers[0].match(/^(order|random|reverse|pendulum|first|last|walk(?:\s+\d+(?:\.\d+)?)?)$/i);
          if (!modeMatch) throw new LanguageError([{ line, message: `unsupported SEQ life reader mode '${lifeModifiers[0]}'` }]);
          const walk = lifeModifiers[0].match(/^walk(?:\s+(\d+(?:\.\d+)?))?$/i);
          const mode = walk ? 'walk' : lifeModifiers[0].toLowerCase();
          const amount = walk ? (walk[1] === undefined ? 1 : numberValue(walk[1], line, 'walk')) : 0;
          if (amount < 0) throw new LanguageError([{ line, message: 'walk amount must be greater than 0' }]);
          const every = split.every ? ` ${everyDirective(voice.name, parseEverySpec(split.every, line, sourceDefinitions))}` : '';
          return `${voice.name}.freq(${initial}); __lifereader(${JSON.stringify(voice.name)},${JSON.stringify(sourceName)},${JSON.stringify(mode)},${amount},${view ? 'true' : 'false'});${every}`;
        }
        if (direct.modifiers.length > 0) {
          throw new LanguageError([{ line, message: 'SEQ turing controls its own generation; PITCH using a Turing SEQ does not accept selection modifiers' }]);
        }
        const every = split.every ? ` ${everyDirective(voice.name, parseEverySpec(split.every, line, sourceDefinitions))}` : '';
        return `${voice.name}.freq(${initial}); __seqvoice(${JSON.stringify(voice.name)},${JSON.stringify(sourceName)});${every}`;
      }

      const view = direct.modifiers.some((modifier) => /^view$/i.test(modifier));
      const selection = parseSelectionMode(
        direct.modifiers.filter((modifier) => !/^view$/i.test(modifier)),
        line,
        key,
      );

      let values: number[];
      let storedFavor: SequenceFavorEntry[] = [];

      if (key === 'scale') {
        if (definition.kind !== 'scale') {
          throw new LanguageError([{ line, message: `source '${sourceName}' is ${definition.kind}, expected scale source for scale` }]);
        }
        values = definition.values;
      } else if (key === 'note') {
        if (definition.kind !== 'note' && definition.kind !== 'scale') {
          throw new LanguageError([{ line, message: `source '${sourceName}' is ${definition.kind}, expected note or scale source for note` }]);
        }
        values = definition.values;
        if (definition.kind === 'note') storedFavor = definition.favor;
      } else {
        if (definition.kind !== 'freq') {
          throw new LanguageError([{ line, message: `source '${sourceName}' is ${definition.kind}, expected frequency source for freq` }]);
        }
        values = definition.values;
      }

      const favor = mergeFavor(storedFavor, selection.favor);
      validateFavorForMode(favor, selection.mode, line, key);
      if (values.length === 1 && direct.modifiers.length > 0) {
        throw new LanguageError([{ line, message: `${key} selection modifiers require a list source` }]);
      }

      const sequence = values.length > 1
        ? ` ${sequenceDirective(voice.name, values, selection.mode, selection.amount, favor)}`
        : '';
      const every = split.every
        ? ` ${everyDirective(voice.name, parseEverySpec(split.every, line, sourceDefinitions))}`
        : '';
      const piano = view && (key === 'note' || key === 'scale')
        ? ` ${inlinePianoDirective('voice', voice.name, key, line, values)}`
        : '';
      return `${voice.name}.freq(${values[0]});${sequence}${every}${piano}`;
    }
  }

  if (key === 'drive') {
    if (voice.soundId !== 'matter') throw new LanguageError([{ line, message: 'drive is available only for sound matter' }]);
    const split = splitEveryClause(value);
    let spec: EnvelopeSpec | null = envelopeFromValue(split.base, line, sourceDefinitions);
    if (!spec) throw new LanguageError([{ line, message: 'drive expects ENVELOPE [...] or an ENVELOPE SET value' }]);
    const base = `${voice.name}.drive(${envelopeLegacyLiteral(spec, line)});`;
    if (!split.every) return base;
    const timing = parseEverySpec(split.every, line, sourceDefinitions);
    const prefix = timing.clockPrelude ? `${timing.clockPrelude} ` : '';
    return `${base} ${prefix}__driveevery(${JSON.stringify(voice.name)},${timing.amount},${JSON.stringify(timing.unit)},${timing.chance},${timing.drift},${timing.loose},${JSON.stringify(timing.clockSource)});`;
  }

  if (key === 'bow' || key === 'blow' || key === 'strike') {
    if (voice.soundId !== 'matter') throw new LanguageError([{ line, message: `${key} is available only for sound matter` }]);
    const withMatch = value.match(/^(.*?)(?:\s+with\s+(.+))?$/i)!;
    const level = numberValue(withMatch[1].trim(), line, key);
    if (level < 0 || level > 100) throw new LanguageError([{ line, message: `${key} expects 0..100` }]);
    let timbre = 50;
    const modifiers = (withMatch[2] ?? '').split(',').map((item) => item.trim()).filter(Boolean);
    for (const modifier of modifiers) {
      const timbreMatch = modifier.match(/^timbre\s+(.+)$/i);
      if (!timbreMatch) throw new LanguageError([{ line, message: `${key} supports only WITH TIMBRE <0..100>` }]);
      timbre = numberValue(timbreMatch[1], line, `${key} timbre`);
      if (timbre < 0 || timbre > 100) throw new LanguageError([{ line, message: `${key} timbre expects 0..100` }]);
    }
    return `${voice.name}.${key}(${level}); ${voice.name}.${key}Timbre(${timbre});`;
  }

  if (soundParameter) {
    const split = splitEveryClause(value);
    const generative = parseGenerativeValue(split.base, line);
    const expression = scalarExpressionFromSource(generative.base, sourceDefinitions);
    if (!expression) {
      throw new LanguageError([{ line, message: `${key} expects a numeric expression` }]);
    }

    if (generative.mode) {
      if (split.every === null) {
        const inline = generative.view ? ` ${inlineScalarDirective('voice', voice.name, key, line, expression)}` : '';
      return `${voice.name}.${key}(${expression}); __genparamdefault("voice",${JSON.stringify(voice.name)},${JSON.stringify(key)},${JSON.stringify(expression)},${JSON.stringify(generative.mode)},${generative.amount});${inline}`;
      }
      const timing = parseEverySpec(split.every, line, sourceDefinitions);
      const prefix = timing.clockPrelude ? `${timing.clockPrelude} ` : '';
      const inline = generative.view ? ` ${inlineScalarDirective('voice', voice.name, key, line, expression)}` : '';
      return `${voice.name}.${key}(${expression}); ${prefix}__genparamcycle("voice",${JSON.stringify(voice.name)},${JSON.stringify(key)},${JSON.stringify(expression)},${JSON.stringify(generative.mode)},${generative.amount},${timing.amount},${JSON.stringify(timing.unit)},${timing.chance},${timing.drift},${timing.loose},${JSON.stringify(timing.clockSource)});${inline}`;
    }

    if (split.every === null) {
      return `${voice.name}.${key}(${expression}); __paramdefault(${JSON.stringify(voice.name)},${JSON.stringify(key)},${JSON.stringify(expression)});`;
    }

    const timing = parseEverySpec(split.every, line, sourceDefinitions);
    const prefix = timing.clockPrelude ? `${timing.clockPrelude} ` : '';
    return `${voice.name}.${key}(${expression}); ${prefix}__paramcycle(${JSON.stringify(voice.name)},${JSON.stringify(key)},${JSON.stringify(expression)},${timing.amount},${JSON.stringify(timing.unit)},${timing.chance},${timing.drift},${timing.loose},${JSON.stringify(timing.clockSource)});`;
  }

  switch (key) {
    case 'level': {
      const level = numberValue(value, line, 'level');
      if (level < 0 || level > 100) throw new LanguageError([{ line, message: 'level expects 0..100' }]);
      return `${voice.name}.level(${level});`;
    }

    case 'sound': {
      const match = value.match(/^([a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)?)(?:\s+with\s+(.+))?$/i);
      if (!match) {
        throw new LanguageError([{ line, message: 'sound expects an engine or engine.algorithm [with option, ...]' }]);
      }
      const soundId = match[1].toLowerCase();
      const schema = SOUND_ENGINE_REGISTRY[soundId];
      if (!schema) throw new LanguageError([{ line, message: `unknown sound '${soundId}'` }]);

      const optionText = (match[2] ?? '').trim();
      if (soundId.startsWith('resonator.')) {
        let polyphony = 1;
        if (optionText) {
          const poly = optionText.match(/^([124])\s+notes?$/i);
          if (!poly) throw new LanguageError([{ line, message: `${soundId} expects WITH 1 NOTE, 2 NOTES, or 4 NOTES` }]);
          polyphony = Number(poly[1]);
        }
        voice.soundId = soundId;
        return `${voice.name}.model(${JSON.stringify(soundId)});\n${voice.name}.polyphony(${polyphony});`;
      }

      const options = optionText.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
      const seen = new Set<string>();
      for (const option of options) {
        if (seen.has(option)) throw new LanguageError([{ line, message: `duplicate sound option '${option}'` }]);
        seen.add(option);
        if (!schema.options.has(option)) {
          throw new LanguageError([{ line, message: `${soundId} does not support sound option '${option}'` }]);
        }
      }
      voice.soundId = soundId;
      const lpg = soundId === 'matter' ? '' : `\n${voice.name}.lpg(${seen.has('lpg')});`;
      return `${voice.name}.model(${JSON.stringify(soundId)});${lpg}`;
    }

    case 'note': {
      claimPitchProperty(voice, 'note', line, 'VOICE');
      const split = splitEveryClause(value);
      const { base, modifiers } = splitWith(split.base);
      const noteView = live || modifiers.some((modifier) => /^view$/i.test(modifier));
      const selectionModifiers = modifiers.filter((modifier) => !/^view$/i.test(modifier));
      const directSource = IDENTIFIER.test(base) ? sourceDefinitions.get(base) : undefined;
      let frequencies: number[];
      let inlineFavor: SequenceFavorEntry[] = [];
      if (directSource) {
        if (directSource.kind !== 'note' && directSource.kind !== 'scale') {
          throw new LanguageError([{ line, message: `source '${base}' is ${directSource.kind}, expected note or scale source for note` }]);
        }
        frequencies = directSource.values;
        if (directSource.kind === 'note') inlineFavor = directSource.favor;
      } else {
        const noteTokens = parseList(base, line, 'note').map((token) => parseNoteSequenceToken(token, line));
        const notes = noteTokens.map((token) => token.note);
        inlineFavor = noteTokens.flatMap((token) => token.favor ? [token.favor] : []);
        frequencies = notes.map((note) => {
          const midi = midiFromNote(note);
          if (midi === null) throw new LanguageError([{ line, message: `invalid note '${note}'` }]);
          return midiToFrequency(midi);
        });
      }
      const selection = parseSelectionMode(selectionModifiers, line, 'note');
      const favor = mergeFavor(inlineFavor, selection.favor);
      validateFavorForMode(favor, selection.mode, line, 'note');
      if (frequencies.length === 1 && selectionModifiers.length > 0) {
        throw new LanguageError([{ line, message: 'note selection modifiers require a list' }]);
      }
      const sequence = frequencies.length > 1 ? ` ${sequenceDirective(voice.name, frequencies, selection.mode, selection.amount, favor)}` : '';
      const every = split.every ? ` ${everyDirective(voice.name, parseEverySpec(split.every, line, sourceDefinitions))}` : '';
      const piano = noteView ? ` ${inlinePianoDirective('voice', voice.name, 'note', line, frequencies)}` : '';
      return `${voice.name}.freq(${frequencies[0]});${sequence}${every}${piano}`;
    }

    case 'freq': {
      claimPitchProperty(voice, 'freq', line, 'VOICE');
      const split = splitEveryClause(value);
      const { base, modifiers } = splitWith(split.base);
      const directSource = IDENTIFIER.test(base) ? sourceDefinitions.get(base) : undefined;
      let values: number[];
      if (directSource) {
        if (directSource.kind !== 'freq') {
          throw new LanguageError([{ line, message: `source '${base}' is ${directSource.kind}, expected frequency source for freq` }]);
        }
        values = directSource.values;
      } else {
        values = parseList(base, line, 'freq').map((item) => numberValue(item, line, 'freq'));
      }
      if (values.some((item) => item <= 0)) {
        throw new LanguageError([{ line, message: 'freq must be greater than 0' }]);
      }
      const selection = parseSelectionMode(modifiers, line, 'freq');
      if (values.length === 1 && modifiers.length > 0) {
        throw new LanguageError([{ line, message: 'freq selection modifiers require a list' }]);
      }
      const sequence = values.length > 1 ? ` ${sequenceDirective(voice.name, values, selection.mode, selection.amount)}` : '';
      const every = split.every ? ` ${everyDirective(voice.name, parseEverySpec(split.every, line, sourceDefinitions))}` : '';
      return `${voice.name}.freq(${values[0]});${sequence}${every}`;
    }

    case 'scale': {
      claimPitchProperty(voice, 'scale', line, 'VOICE');
      const split = splitEveryClause(value);
      const { base, modifiers } = splitWith(split.base);
      const directSource = IDENTIFIER.test(base) ? sourceDefinitions.get(base) : undefined;
      if (directSource) {
        if (directSource.kind !== 'scale') {
          throw new LanguageError([{ line, message: `source '${base}' is ${directSource.kind}, expected scale source for scale` }]);
        }
        const selection = parseSelectionMode(modifiers, line, 'scale');
        const every = split.every ? ` ${everyDirective(voice.name, parseEverySpec(split.every, line, sourceDefinitions))}` : '';
        return `${sourceSequenceCode(voice.name, directSource.values, selection.mode, selection.amount, selection.favor, false, line)}${every}`;
      }
      const parsed = parseScaleSpec(split.base, line, true);
      if (!parsed) {
        throw new LanguageError([{
          line,
          message: 'scale expects root and mode, optionally followed by with range <note> <note> and one sequencing modifier',
        }]);
      }
      const every = split.every ? ` ${everyDirective(voice.name, parseEverySpec(split.every, line, sourceDefinitions))}` : '';
      return `${sourceSequenceCode(voice.name, parsed.values, parsed.mode, parsed.amount, parsed.favor, parsed.view, line)}${every}`;
    }

    case 'every': {
      const timing = parseEverySpec(value, line, sourceDefinitions);
      const prefix = timing.clockPrelude ? `${timing.clockPrelude} ` : '';
      return `${prefix}__objectevery(${JSON.stringify(voice.name)},${timing.amount},${JSON.stringify(timing.unit)},${timing.chance},${timing.drift},${timing.loose},${JSON.stringify(timing.clockSource)});`;
    }

    case 'cycle':
      throw new LanguageError([{ line, message: "standalone cycle is deprecated; use 'every' or an inline 'every' clause" }]);

    default:
      throw new LanguageError([{ line, message: `unknown VOICE property '${property}'` }]);
  }
}


function normalizeCycleUnit(rawUnit: string, line: number): 'ms' | 'sec' | 'beat' {
  const unit = rawUnit.toLowerCase();
  if (unit === 'ms') return 'ms';
  if (unit === 'sec' || unit === 'secs' || unit === 'second' || unit === 'seconds') return 'sec';
  if (unit === 'beat' || unit === 'beats') return 'beat';
  throw new LanguageError([{ line, message: `unknown cycle unit '${rawUnit}'` }]);
}

type EverySpec = {
  amount: number;
  unit: 'ms' | 'sec' | 'beat';
  chance: number;
  drift: boolean;
  loose: boolean;
  clockSource: string;
  clockPrelude: string;
  euclidean: { hits: number; steps: number; rotate: number } | null;
};

function splitEveryClause(value: string): { base: string; every: string | null } {
  const match = value.match(/^(.*?)\s+every\s+(.+)$/i);
  if (!match) return { base: value.trim(), every: null };
  return { base: match[1].trim(), every: match[2].trim() };
}

function splitEveryModifiers(value: string): { base: string; modifiers: string[] } {
  const match = value.match(/^(.*?)\s+on\s+(.+)$/i);
  if (!match) return { base: value.trim(), modifiers: [] };
  return {
    base: match[1].trim(),
    modifiers: match[2].split(',').map((item) => item.trim()).filter(Boolean),
  };
}

function parsePositiveAmount(raw: string, line: number, label: string): number {
  const fraction = raw.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    if (!Number.isFinite(denominator) || denominator <= 0) {
      throw new LanguageError([{ line, message: `${label} denominator must be greater than 0` }]);
    }
    const value = Number(fraction[1]) / denominator;
    if (!Number.isFinite(value) || value <= 0) throw new LanguageError([{ line, message: `${label} must be greater than 0` }]);
    return value;
  }
  const value = numberValue(raw, line, label);
  if (value <= 0) throw new LanguageError([{ line, message: `${label} must be greater than 0` }]);
  return value;
}

function parseEverySpec(
  raw: string,
  line: number,
  sourceDefinitions: Map<string, SourceDefinition>,
): EverySpec {
  const { base, modifiers } = splitEveryModifiers(raw.trim());

  let amount: number;
  let unit: 'ms' | 'sec' | 'beat';
  let euclidean: { hits: number; steps: number; rotate: number } | null = null;

  const euclideanMatch = base.match(/^euclidean\s+(\d+)\s*\/\s*(\d+)$/i);
  const literal = base.match(/^(\d+(?:\.\d+)?)\s+(ms|sec|secs|second|seconds|beat|beats)$/i);
  if (euclideanMatch) {
    const hits = Number(euclideanMatch[1]);
    const steps = Number(euclideanMatch[2]);
    if (!Number.isInteger(steps) || steps < 1) {
      throw new LanguageError([{ line, message: 'EUCLIDEAN steps must be a positive integer' }]);
    }
    if (!Number.isInteger(hits) || hits < 1 || hits > steps) {
      throw new LanguageError([{ line, message: 'EUCLIDEAN hits must be an integer from 1 to steps' }]);
    }
    amount = 1;
    unit = 'beat';
    euclidean = { hits, steps, rotate: 0 };
  } else if (literal) {
    amount = numberValue(literal[1], line, 'every');
    unit = normalizeCycleUnit(literal[2], line);
  } else if (IDENTIFIER.test(base)) {
    const definition = sourceDefinitions.get(base);
    if (!definition) throw new LanguageError([{ line, message: `unknown timing source '${base}'` }]);
    if (definition.kind !== 'time') {
      throw new LanguageError([{ line, message: `source '${base}' is ${definition.kind}, expected time source for every` }]);
    }
    amount = definition.amount;
    unit = definition.unit;
  } else {
    throw new LanguageError([{ line, message: 'every expects <time>, EUCLIDEAN <hits>/<steps>, or a SET time variable' }]);
  }

  if (amount <= 0) throw new LanguageError([{ line, message: 'every interval must be greater than 0' }]);
  if (unit === 'beat' && !Number.isInteger(amount)) {
    throw new LanguageError([{ line, message: 'EVERY beat timing uses whole ticks; use ON CLOCK *n for subdivisions' }]);
  }

  let clockSource = 'Clock';
  let clockPrelude = '';
  const timingModifiers: string[] = [];

  for (const modifier of modifiers) {
    const rotate = modifier.match(/^rotate\s+(-?\d+)$/i);
    if (rotate) {
      if (!euclidean) {
        throw new LanguageError([{ line, message: 'ROTATE is available only for EVERY EUCLIDEAN' }]);
      }
      const rawRotate = Number(rotate[1]);
      euclidean.rotate = ((rawRotate % euclidean.steps) + euclidean.steps) % euclidean.steps;
      continue;
    }

    const clock = modifier.match(/^clock\s+(.+)$/i);
    if (!clock) {
      timingModifiers.push(modifier);
      continue;
    }
    if (unit !== 'beat') {
      throw new LanguageError([{ line, message: 'ON CLOCK is available only for beat-based EVERY clauses' }]);
    }
    const clockValue = clock[1].trim();
    const rate = clockValue.match(/^([/*])\s*(\d+(?:\.\d+)?)$/);
    if (rate) {
      const n = Number(rate[2]);
      if (!Number.isFinite(n) || n <= 0) {
        throw new LanguageError([{ line, message: 'clock divisor/multiplier must be greater than 0' }]);
      }
      const label = `${rate[1]}${formatSourceNumber(n)}`;
      const safe = label.replace('/', 'div_').replace('*', 'mul_').replace('.', '_');
      clockSource = `__clock_${line}_${safe}`;
      clockPrelude = `${clockSource} = Clock.rate(${JSON.stringify(label)});`;
      continue;
    }
    if (!IDENTIFIER.test(clockValue)) {
      throw new LanguageError([{ line, message: `invalid clock source '${clockValue}'` }]);
    }
    const definition = sourceDefinitions.get(clockValue);
    if (!definition) throw new LanguageError([{ line, message: `unknown clock source '${clockValue}'` }]);
    if (definition.kind !== 'clock') {
      throw new LanguageError([{ line, message: `source '${clockValue}' is ${definition.kind}, expected clock source` }]);
    }
    clockSource = definition.internalName;
  }

  const timing = parseTimingModifiers(timingModifiers, line, unit);
  if (euclidean) {
    clockSource = `__euclidean_${euclidean.hits}_${euclidean.steps}_${euclidean.rotate}__${clockSource}`;
  }
  return { amount, unit, ...timing, clockSource, clockPrelude, euclidean };
}

function everyDirective(name: string, spec: EverySpec): string {
  const prefix = spec.clockPrelude ? `${spec.clockPrelude} ` : '';
  return `${prefix}__cycle(${JSON.stringify(name)},${spec.amount},${JSON.stringify(spec.unit)},${spec.chance},${spec.drift},${spec.loose},${JSON.stringify(spec.clockSource)});`;
}

function requireRegisterReady(register: RegisterState | null, diagnostics: LanguageDiagnostic[]): void {
  if (!register) return;
  if (!register.modelId) diagnostics.push({ line: register.line, message: `REGISTER '${register.name}' requires model shift` });
  if (!register.sourceName) diagnostics.push({ line: register.line, message: `REGISTER '${register.name}' requires pitch <SEQ source>` });
  if (!register.hasWrite) diagnostics.push({ line: register.line, message: `REGISTER '${register.name}' requires write every ...` });
}

function compileRegisterProperty(
  register: RegisterState,
  property: string,
  rawValue: string,
  line: number,
  sourceDefinitions: Map<string, SourceDefinition>,
): string {
  const key = property.toLowerCase();
  const value = rawValue.trim();

  if (key === 'model') {
    if (!/^shift$/i.test(value)) throw new LanguageError([{ line, message: `unknown REGISTER model '${value}'` }]);
    register.modelId = 'shift';
    return `__registermodel(${JSON.stringify(register.name)},"shift");`;
  }

  if (key === 'size') {
    const size = numberValue(value, line, 'REGISTER size');
    if (!Number.isInteger(size) || size < 2 || size > 32) {
      throw new LanguageError([{ line, message: 'REGISTER size expects an integer from 2 to 32' }]);
    }
    register.size = size;
    const definition = sourceDefinitions.get(register.name);
    if (definition?.kind === 'register') definition.size = size;
    return `__registersize(${JSON.stringify(register.name)},${size});`;
  }

  if (key === 'pitch') {
    const direct = splitWith(value);
    if (!IDENTIFIER.test(direct.base)) {
      throw new LanguageError([{ line, message: 'REGISTER pitch expects a SEQ source name' }]);
    }
    const definition = sourceDefinitions.get(direct.base);
    if (!definition || definition.kind !== 'seq') {
      throw new LanguageError([{ line, message: `REGISTER pitch source '${direct.base}' must be a SEQ` }]);
    }

    let readerMode: RegisterState['readerMode'] = 'direct';
    let readerAmount = 0;
    if (definition.model === 'life') {
      if (direct.modifiers.length !== 1) {
        throw new LanguageError([{ line, message: `SEQ life pool '${direct.base}' requires one reader mode: order, random, walk, reverse, pendulum, first, or last` }]);
      }
      const reader = direct.modifiers[0].match(/^(order|random|reverse|pendulum|first|last|walk(?:\s+\d+(?:\.\d+)?)?)$/i);
      if (!reader) throw new LanguageError([{ line, message: `unsupported REGISTER Life reader mode '${direct.modifiers[0]}'` }]);
      const walk = direct.modifiers[0].match(/^walk(?:\s+(\d+(?:\.\d+)?))?$/i);
      readerMode = walk ? 'walk' : direct.modifiers[0].toLowerCase() as RegisterState['readerMode'];
      readerAmount = walk ? (walk[1] === undefined ? 1 : numberValue(walk[1], line, 'walk')) : 0;
      if (readerAmount < 0) throw new LanguageError([{ line, message: 'walk amount must be greater than 0' }]);
    } else if (direct.modifiers.length > 0) {
      throw new LanguageError([{ line, message: `SEQ turing source '${direct.base}' does not accept REGISTER reader modifiers` }]);
    }

    register.sourceName = direct.base;
    register.readerMode = readerMode;
    register.readerAmount = readerAmount;
    return `__registersource(${JSON.stringify(register.name)},${JSON.stringify(direct.base)},${JSON.stringify(readerMode)},${readerAmount});`;
  }

  if (key === 'write') {
    const match = value.match(/^every\s+(.+)$/i);
    if (!match) throw new LanguageError([{ line, message: 'REGISTER write expects every <time>' }]);
    const timing = parseEverySpec(match[1], line, sourceDefinitions);
    register.hasWrite = true;
    const prefix = timing.clockPrelude ? `${timing.clockPrelude}\n` : '';
    return `${prefix}__registerwrite(${JSON.stringify(register.name)},${timing.amount},${JSON.stringify(timing.unit)},${timing.chance},${timing.drift},${timing.loose},${JSON.stringify(timing.clockSource)});`;
  }

  throw new LanguageError([{ line, message: `unknown REGISTER property '${property}'` }]);
}

function requireSeqReady(seq: SeqState | null, diagnostics: LanguageDiagnostic[]): void {
  if (!seq) return;
  if (!seq.modelId) diagnostics.push({ line: seq.line, message: `SEQ '${seq.name}' requires a model` });
  if (seq.values.length === 0) diagnostics.push({ line: seq.line, message: `SEQ '${seq.name}' requires PITCH SCALE, PITCH NOTES, or PITCH FREQS material` });
}

function compileSeqProperty(
  seq: SeqState,
  property: string,
  rawValue: string,
  line: number,
  sourceDefinitions: Map<string, SourceDefinition>,
): string {
  const key = property.toLowerCase();
  let value = rawValue.trim();
  let effectiveKey = key;
  if (key === 'pitch') {
    const pitch = value.match(/^(notes|freqs|scale)\s+(.+)$/i);
    if (!pitch) throw new LanguageError([{ line, message: 'SEQ PITCH expects SCALE ..., NOTES [...], or FREQS [...]' }]);
    effectiveKey = pitch[1].toLowerCase();
    value = pitch[2].trim();
  } else if (key === 'notes' || key === 'scale' || key === 'freqs') {
    throw new LanguageError([{ line, message: `${property.toUpperCase()} is no longer a SEQ property; use PITCH ${property.toUpperCase()} ...` }]);
  }

  if (effectiveKey === 'model') {
    const model = value.toLowerCase();
    const lifeModel = model.match(/^life(?:\.(highlife|seeds|day-night|morley))?$/);
    if (model !== 'turing' && !lifeModel) throw new LanguageError([{ line, message: `unknown SEQ model '${value}'` }]);
    seq.modelId = model === 'turing' ? 'turing' : 'life';
    seq.lifeVariant = model === 'turing' ? 'conway' : ((lifeModel?.[1] ?? 'conway') as SeqState['lifeVariant']);
    const definition = sourceDefinitions.get(seq.name);
    if (definition?.kind === 'seq') definition.model = seq.modelId;
    return `__seqmodel(${JSON.stringify(seq.name)},${JSON.stringify(seq.modelId)},${JSON.stringify(seq.lifeVariant)});`;
  }
  if (effectiveKey === 'size') {
    if (seq.modelId !== 'life') throw new LanguageError([{ line, message: 'SEQ SIZE is available only for MODEL life' }]);
    const size = numberValue(value, line, 'SEQ life size');
    if (size !== 8 && size !== 16) throw new LanguageError([{ line, message: 'SEQ life size expects 8 or 16' }]);
    seq.size = size as 8 | 16;
    return `__seqsize(${JSON.stringify(seq.name)},${size});`;
  }
  if (effectiveKey === 'density') {
    if (seq.modelId !== 'life') throw new LanguageError([{ line, message: 'SEQ DENSITY is available only for MODEL life' }]);
    const match = value.match(/^(\d+(?:\.\d+)?)(?:\s+with\s+(?:(?:max\s+(\d+(?:\.\d+)?)(?:\s*,\s*respawn)?|respawn)))?$/i);
    if (!match) throw new LanguageError([{ line, message: 'SEQ life DENSITY expects <0..100> [WITH MAX <0..100>[, RESPAWN] | WITH RESPAWN]' }]);
    const density = numberValue(match[1], line, 'SEQ life density');
    const maxDensity = match[2] === undefined ? null : numberValue(match[2], line, 'SEQ life max density');
    const respawn = /(?:^|[,\s])respawn$/i.test(value.trim());
    if (density < 0 || density > 100) throw new LanguageError([{ line, message: 'SEQ life DENSITY expects 0..100' }]);
    if (maxDensity !== null && (maxDensity < 0 || maxDensity > 100)) throw new LanguageError([{ line, message: 'SEQ life DENSITY MAX expects 0..100' }]);
    if (maxDensity !== null && maxDensity < density) throw new LanguageError([{ line, message: 'SEQ life DENSITY MAX cannot be lower than the initial density' }]);
    seq.density = density;
    seq.maxDensity = maxDensity;
    return `__lifedensity(${JSON.stringify(seq.name)},${density},${maxDensity ?? -1},${respawn ? 'true' : 'false'});`;
  }
  if (effectiveKey === 'length') {
    if (seq.modelId === 'life') throw new LanguageError([{ line, message: 'SEQ life does not use LENGTH; use SIZE 8 or SIZE 16' }]);
    const length = numberValue(value, line, 'SEQ length');
    if (!Number.isInteger(length) || length < 2 || length > 32) throw new LanguageError([{ line, message: 'SEQ turing length expects an integer from 2 to 32' }]);
    seq.length = length;
    return `__seqlength(${JSON.stringify(seq.name)},${length});`;
  }
  if (effectiveKey === 'change') {
    if (seq.modelId === 'life') throw new LanguageError([{ line, message: 'SEQ life does not use CHANGE' }]);
    const change = numberValue(value, line, 'SEQ change');
    if (change < 0 || change > 100) throw new LanguageError([{ line, message: 'SEQ turing change expects 0..100' }]);
    seq.change = change;
    return `__seqchange(${JSON.stringify(seq.name)},${change});`;
  }
  if (effectiveKey === 'notes') {
    const list = value.match(/^\[([^\]]+)\]$/);
    if (!list) throw new LanguageError([{ line, message: 'SEQ notes expects a note list such as [C2 Eb2 G2]' }]);
    const items = list[1].trim().split(/\s+/).filter(Boolean);
    const parsed = items.map((item) => parseNoteSequenceToken(item, line));
    if (parsed.length === 0 || parsed.some((item) => midiFromNote(item.note) === null)) throw new LanguageError([{ line, message: 'SEQ notes contains an invalid note' }]);
    if (parsed.some((item) => item.favor !== null)) {
      throw new LanguageError([{ line, message: 'SEQ turing notes do not support weights, repeats, or retrigs' }]);
    }
    seq.values = parsed.map((item) => midiToFrequency(midiFromNote(item.note)!));
    seq.material = 'notes';
    const definition = sourceDefinitions.get(seq.name);
    if (definition?.kind === 'seq') definition.values = [...seq.values];
    return `__seqvalues(${JSON.stringify(seq.name)},${JSON.stringify(seq.values.join('|'))});`;
  }
  if (effectiveKey === 'freqs') {
    const parsed = splitWith(value);
    const values = parseList(parsed.base, line, 'SEQ pitch freqs').map((item) => numberValue(item, line, 'SEQ pitch freqs'));
    if (values.length === 0 || values.some((frequency) => frequency <= 0)) {
      throw new LanguageError([{ line, message: 'SEQ PITCH FREQS expects positive frequency values' }]);
    }
    if (parsed.modifiers.length > 0) throw new LanguageError([{ line, message: 'SEQ PITCH FREQS material does not accept selection modifiers; readers choose the material' }]);
    seq.values = values;
    seq.material = 'freqs';
    const definition = sourceDefinitions.get(seq.name);
    if (definition?.kind === 'seq') definition.values = [...seq.values];
    return `__seqvalues(${JSON.stringify(seq.name)},${JSON.stringify(seq.values.join('|'))});`;
  }
  if (effectiveKey === 'scale') {
    const scale = parseScaleSource(value, line);
    if (!scale) throw new LanguageError([{ line, message: 'SEQ scale expects a scale and range, for example C minor with range C2 C4' }]);
    seq.values = scale.values;
    seq.material = 'scale';
    const definition = sourceDefinitions.get(seq.name);
    if (definition?.kind === 'seq') definition.values = [...seq.values];
    return `__seqvalues(${JSON.stringify(seq.name)},${JSON.stringify(seq.values.join('|'))});`;
  }
  if (effectiveKey === 'evolve') {
    if (seq.modelId !== 'life') throw new LanguageError([{ line, message: 'EVOLVE is available only for MODEL life' }]);
    const evolve = value.match(/^every\s+(.+)$/i);
    if (!evolve) throw new LanguageError([{ line, message: 'EVOLVE expects EVERY <time> [ON ...]' }]);
    const timing = parseEverySpec(evolve[1], line, sourceDefinitions);
    const prefix = timing.clockPrelude ? `${timing.clockPrelude}\n` : '';
    return `${prefix}__lifeevolve(${JSON.stringify(seq.name)},${timing.amount},${JSON.stringify(timing.unit)},${timing.chance},${timing.drift},${timing.loose},${JSON.stringify(timing.clockSource)});`;
  }
  if (effectiveKey === 'every') {
    if (seq.modelId === 'life') throw new LanguageError([{ line, message: 'SEQ life has no playhead EVERY; use EVOLVE EVERY ... and schedule each consumer PITCH separately' }]);
    const timing = parseEverySpec(value, line, sourceDefinitions);
    const prefix = timing.clockPrelude ? `${timing.clockPrelude}\n` : '';
    return `${prefix}__objectevery(${JSON.stringify(seq.name)},${timing.amount},${JSON.stringify(timing.unit)},${timing.chance},${timing.drift},${timing.loose},${JSON.stringify(timing.clockSource)});`;
  }
  throw new LanguageError([{ line, message: `unknown SEQ property '${property}'` }]);
}

function parseEnvelopeTimeStage(raw: string, line: number, label: string, allowCurve = true): EnvelopeTimeStage {
  const match = raw.trim().match(/^(?:(lin|log)\s+)?((?:\d+(?:\.\d+)?)|(?:\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?))\s*(ms|sec|secs|second|seconds|beat|beats)$/i);
  if (!match) {
    throw new LanguageError([{ line, message: `${label} expects [LIN|LOG] <time> using ms, sec, or beat` }]);
  }
  if (!allowCurve && match[1]) {
    throw new LanguageError([{ line, message: `${label} does not use a curve` }]);
  }
  const amount = parsePositiveAmount(match[2].replace(/\s+/g, ''), line, label);
  return {
    amount,
    unit: normalizeCycleUnit(match[3], line),
    curve: (match[1]?.toLowerCase() ?? 'lin') as EnvelopeCurve,
  };
}

function parseEnvelopeSpec(value: string, line: number): EnvelopeSpec | null {
  const match = value.trim().match(/^ENVELOPE\s*\[([^\]]*)\]$/i);
  if (!match) return null;
  const parts = match[1].split(',').map((item) => item.trim()).filter(Boolean);
  if (parts.length === 0) throw new LanguageError([{ line, message: 'ENVELOPE cannot be empty' }]);

  const spec: EnvelopeSpec = {
    delay: null,
    attack: null,
    hold: null,
    decay: null,
    sustain: null,
    release: null,
    range: [0, 100],
    display: '',
  };
  const seen = new Set<string>();

  for (const part of parts) {
    const property = part.match(/^([A-Za-z]+)\s+(.+)$/);
    if (!property) throw new LanguageError([{ line, message: `invalid ENVELOPE property '${part}'` }]);
    const rawKey = property[1].toLowerCase();
    const key = ({ att: 'attack', dec: 'decay', sus: 'sustain', rel: 'release', del: 'delay' } as Record<string, string>)[rawKey] ?? rawKey;
    if (!['delay', 'attack', 'hold', 'decay', 'sustain', 'release', 'range'].includes(key)) {
      throw new LanguageError([{ line, message: `unknown ENVELOPE property '${property[1]}'` }]);
    }
    if (seen.has(key)) throw new LanguageError([{ line, message: `ENVELOPE '${key}' can be declared only once` }]);
    seen.add(key);
    const raw = property[2].trim();

    if (key === 'sustain') {
      const level = numberValue(raw, line, 'ENVELOPE sustain');
      if (level < 0 || level > 100) throw new LanguageError([{ line, message: 'ENVELOPE sustain expects 0..100' }]);
      spec.sustain = level / 100;
      continue;
    }
    if (key === 'range') {
      const range = raw.match(/^(-?\d+(?:\.\d+)?)\s+to\s+(-?\d+(?:\.\d+)?)$/i);
      if (!range) throw new LanguageError([{ line, message: 'ENVELOPE range expects <min> TO <max>' }]);
      const min = numberValue(range[1], line, 'ENVELOPE range');
      const max = numberValue(range[2], line, 'ENVELOPE range');
      if (max < min) throw new LanguageError([{ line, message: 'ENVELOPE range expects min <= max' }]);
      spec.range = [min, max];
      continue;
    }

    const stage = parseEnvelopeTimeStage(raw, line, `ENVELOPE ${key}`, key === 'attack' || key === 'decay' || key === 'release');
    (spec as unknown as Record<string, unknown>)[key] = stage;
  }

  if (!spec.attack && !spec.decay && !spec.release) {
    throw new LanguageError([{ line, message: 'ENVELOPE requires at least ATTACK, DECAY, or RELEASE' }]);
  }
  if (spec.sustain !== null && !spec.release) {
    throw new LanguageError([{ line, message: 'a sustained ENVELOPE requires RELEASE' }]);
  }
  spec.display = `ENVELOPE [${parts.join(', ')}]`;
  return spec;
}

function envelopeLiteral(spec: EnvelopeSpec): string {
  return JSON.stringify(JSON.stringify({
    delay: spec.delay,
    attack: spec.attack,
    hold: spec.hold,
    decay: spec.decay,
    sustain: spec.sustain,
    release: spec.release,
    range: spec.range,
  }));
}

function envelopeLegacyLiteral(spec: EnvelopeSpec, line: number): string {
  const stages = [spec.delay, spec.attack, spec.hold, spec.decay, spec.release].filter(Boolean) as EnvelopeTimeStage[];
  if (stages.some((stage) => stage.unit === 'beat')) {
    throw new LanguageError([{ line, message: 'Matter DRIVE currently accepts ENVELOPE stages in ms/sec only' }]);
  }
  if (stages.some((stage) => stage.curve !== 'lin') || spec.range[0] !== 0 || spec.range[1] !== 100 || spec.delay || spec.hold) {
    throw new LanguageError([{ line, message: 'Matter DRIVE currently uses linear full-range ENVELOPE without DELAY/HOLD' }]);
  }
  const seconds = (stage: EnvelopeTimeStage | null): number => !stage ? 0 : stage.unit === 'ms' ? stage.amount / 1000 : stage.amount;
  let kind: string;
  let values: number[];
  if (spec.sustain !== null) {
    if (spec.decay) { kind = 'ADSR'; values = [seconds(spec.attack), seconds(spec.decay), spec.sustain, seconds(spec.release)]; }
    else { kind = 'ASR'; values = [seconds(spec.attack), spec.sustain, seconds(spec.release)]; }
  } else if (spec.attack && spec.decay && !spec.release) {
    kind = 'AD'; values = [seconds(spec.attack), seconds(spec.decay)];
  } else if (spec.attack && spec.release && !spec.decay) {
    // The legacy Matter backend has no AR descriptor; ASR with a full sustain
    // level preserves the intended gated attack/release shape.
    kind = 'ASR'; values = [seconds(spec.attack), 1, seconds(spec.release)];
  } else {
    throw new LanguageError([{ line, message: 'Matter DRIVE ENVELOPE currently supports AD, AR/ASR, or ADSR shapes' }]);
  }
  return JSON.stringify(JSON.stringify({ kind, values }));
}

function envelopeParamDirective(
  ownerKind: 'voice' | 'fx' | 'filter',
  owner: string,
  parameter: string,
  spec: EnvelopeSpec,
  line: number,
  timing: EverySpec | null,
): string {
  if (ownerKind !== 'voice' && !timing) {
    throw new LanguageError([{ line, message: 'ENVELOPE on FILTER/FX requires EVERY because those objects have no implicit note trigger' }]);
  }
  if (spec.sustain !== null && timing) {
    throw new LanguageError([{ line, message: 'a sustained ENVELOPE follows its VOICE gate and cannot currently declare its own EVERY' }]);
  }
  const serialized = envelopeLiteral(spec);
  const base = `__envelopeparam(${JSON.stringify(ownerKind)},${JSON.stringify(owner)},${JSON.stringify(parameter)},${serialized},${line}`;
  if (!timing) return `${base},0,"ms",100,false,false,"Clock");`;
  const prefix = timing.clockPrelude ? `${timing.clockPrelude} ` : '';
  return `${prefix}${base},${timing.amount},${JSON.stringify(timing.unit)},${timing.chance},${timing.drift},${timing.loose},${JSON.stringify(timing.clockSource)});`;
}

function compileSet(
  lineText: string,
  line: number,
  sourceKinds: Map<string, SourceKind>,
  sourceDefinitions: Map<string, SourceDefinition>,
  scalarNames: Set<string>,
  voiceNames: Set<string>,
  internalName?: string,
): string {
  const match = lineText.match(/^SET\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/i);
  if (!match) {
    throw new LanguageError([{ line, message: 'SET expects a name, colon, and value' }]);
  }

  const name = match[1];
  const runtimeName = internalName ?? name;
  if (voiceNames.has(name) || scalarNames.has(name)) {
    throw new LanguageError([{ line, message: `duplicate object or variable: ${name}` }]);
  }

  const body = match[2].trim();

  const envelope = parseEnvelopeSpec(body, line);
  if (envelope) {
    scalarNames.add(name);
    sourceKinds.set(name, 'envelope');
    sourceDefinitions.set(name, { kind: 'envelope', spec: envelope, display: envelope.display, internalName: runtimeName });
    return `${runtimeName} = ${JSON.stringify(envelope.display)};`;
  }

  // CLOCK is a runtime object and must be declared with the CLOCK keyword, not SET.
  if (/^clock\b/i.test(body)) {
    throw new LanguageError([{ line, message: 'SET cannot declare a clock; use CLOCK <name> [RATE /n|*n] instead' }]);
  }

  const scale = parseScaleSource(body, line);
  if (scale) {
    scalarNames.add(name);
    sourceKinds.set(name, 'scale');
    sourceDefinitions.set(name, { kind: 'scale', values: scale.values, display: scale.display, internalName: runtimeName });
    return `${runtimeName} = ${JSON.stringify(scale.display)};`;
  }

  const noteList = body.match(/^\[([^\]]+)\]$/);
  if (noteList) {
    const items = noteList[1].trim().split(/\s+/).filter(Boolean);
    if (items.length > 0) {
      const parsed = items.map((item) => parseNoteSequenceToken(item, line));
      if (parsed.every((item) => midiFromNote(item.note) !== null)) {
        const values = parsed.map((item) => midiToFrequency(midiFromNote(item.note)!));
        const favor = parsed.flatMap((item) => item.favor ? [item.favor] : []);
        scalarNames.add(name);
        sourceKinds.set(name, 'note');
        sourceDefinitions.set(name, { kind: 'note', values, display: `[${items.join(' ')}]`, favor, internalName: runtimeName });
        return `${runtimeName} = ${JSON.stringify(`[${items.join(' ')}]`)};`;
      }
    }
  }

  const freqList = body.match(/^\[([^\]]+)\]\s+hz$/i);
  if (freqList) {
    const items = freqList[1].trim().split(/\s+/).filter(Boolean);
    const values = items.map(Number);
    if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value <= 0)) {
      throw new LanguageError([{ line, message: 'frequency list expects positive numeric values' }]);
    }
    scalarNames.add(name);
    sourceKinds.set(name, 'freq');
    sourceDefinitions.set(name, { kind: 'freq', values, display: `[${items.join(' ')}] hz`, internalName: runtimeName });
    return `${runtimeName} = ${JSON.stringify(`[${items.join(' ')}] hz`)};`;
  }

  const note = body.match(/^([A-Ga-g][#b]?-?\d+)$/);
  if (note) {
    const midi = midiFromNote(note[1]);
    if (midi === null) throw new LanguageError([{ line, message: `invalid note '${note[1]}'` }]);
    const frequency = midiToFrequency(midi);
    scalarNames.add(name);
    sourceKinds.set(name, 'note');
    sourceDefinitions.set(name, { kind: 'note', values: [frequency], display: note[1], favor: [], internalName: runtimeName });
    return `${runtimeName} = ${JSON.stringify(note[1])};`;
  }

  const frequency = body.match(/^(\d+(?:\.\d+)?)\s+hz$/i);
  if (frequency) {
    const value = numberValue(frequency[1], line, 'frequency');
    if (value <= 0) throw new LanguageError([{ line, message: 'frequency must be greater than 0' }]);
    scalarNames.add(name);
    sourceKinds.set(name, 'freq');
    sourceDefinitions.set(name, { kind: 'freq', values: [value], display: `${formatSourceNumber(value)} hz`, internalName: runtimeName });
    return `${runtimeName} = ${value};`;
  }

  const time = body.match(/^(\d+(?:\.\d+)?)\s+(ms|sec|secs|second|seconds|beat|beats)$/i);
  if (time) {
    const amount = numberValue(time[1], line, 'time');
    if (amount <= 0) throw new LanguageError([{ line, message: 'time must be greater than 0' }]);
    const unit = normalizeCycleUnit(time[2], line);
    if (unit === 'beat' && !Number.isInteger(amount)) {
      throw new LanguageError([{ line, message: 'beat time currently requires a whole number of beats' }]);
    }
    const unitDisplay = unit === 'beat' ? (amount === 1 ? 'beat' : 'beats') : unit;
    const display = `${formatSourceNumber(amount)} ${unitDisplay}`;
    scalarNames.add(name);
    sourceKinds.set(name, 'time');
    sourceDefinitions.set(name, { kind: 'time', amount, unit, display, internalName: runtimeName });
    return `${runtimeName} = ${JSON.stringify(display)};`;
  }

  const expression = body.trim();
  if (!expression) {
    throw new LanguageError([{ line, message: 'SET expects a scalar expression' }]);
  }

  scalarNames.add(name);
  sourceKinds.set(name, 'scalar');
  sourceDefinitions.set(name, { kind: 'scalar', internalName: runtimeName });
  return `${runtimeName} = ${expression};`;
}


function requireClockReady(_clock: ClockState | null, _diagnostics: LanguageDiagnostic[]): void {
  // Named clocks default to MASTER at rate *1 when no explicit parent/rate is supplied.
}

function compileClockProperty(
  clock: ClockState,
  property: string,
  rawValue: string,
  line: number,
  sourceDefinitions: Map<string, SourceDefinition>,
): string {
  const key = property.toLowerCase();
  const value = rawValue.trim();
  if (key === 'jitter' || key === 'drifter') {
    const publicKey = key;
    const amount = numberValue(value, line, `CLOCK ${publicKey}`);
    if (amount < 0 || amount > 100) throw new LanguageError([{ line, message: `CLOCK ${publicKey} expects 0..100` }]);
    if (key === 'jitter') clock.jitter = amount; else clock.drift = amount;
    const runtimeKey = key === 'jitter' ? 'jitter' : 'drift';
    return `__clockfeel(${JSON.stringify(clock.name)},${JSON.stringify(runtimeKey)},${amount});`;
  }
  if (key === 'rate') {
    const match = value.match(/^([/*])\s*(\d+(?:\.\d+)?)$/);
    if (!match) throw new LanguageError([{ line, message: 'CLOCK rate expects /n or *n' }]);
    const amount = numberValue(match[2], line, 'CLOCK rate');
    if (amount <= 0) throw new LanguageError([{ line, message: 'CLOCK rate must be greater than 0' }]);
    clock.parent = 'Clock';
    clock.rate = match[1] === '/' ? 1 / amount : amount;
    clock.rateLabel = `${match[1]}${formatSourceNumber(amount)}`;
    const definition = sourceDefinitions.get(clock.name);
    if (definition?.kind === 'clock') definition.rateLabel = clock.rateLabel;
    return `__clockparent(${JSON.stringify(clock.name)},"Clock",${JSON.stringify(clock.rateLabel)});`;
  }
  throw new LanguageError([{ line, message: `unknown CLOCK property '${property}'` }]);
}

function compileClock(lineText: string, line: number): string {
  const match = lineText.match(/^(_)?CLOCK\s+set\s+(.+?)\s+bpm(?:\s+with\s+(.+))?$/i);
  if (!match) throw new LanguageError([{ line, message: 'CLOCK expects: CLOCK set <expression> bpm [with jitter <0..100>, drifter <0..100>]' }]);
  const disabled = Boolean(match[1]);
  const expression = match[2].trim();
  if (!expression) throw new LanguageError([{ line, message: 'CLOCK set expects a BPM expression' }]);
  let jitter = 0;
  let timingDrift = 0;
  const modifiers = (match[3] ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  for (const modifier of modifiers) {
    const jitterMatch = modifier.match(/^jitter\s+(\d+(?:\.\d+)?)$/i);
    if (jitterMatch) {
      jitter = numberValue(jitterMatch[1], line, 'CLOCK jitter');
      if (jitter < 0 || jitter > 100) throw new LanguageError([{ line, message: 'CLOCK jitter expects 0..100' }]);
      continue;
    }
    const drifterMatch = modifier.match(/^drifter\s+(\d+(?:\.\d+)?)$/i);
    if (drifterMatch) {
      timingDrift = numberValue(drifterMatch[1], line, 'CLOCK drifter');
      if (timingDrift < 0 || timingDrift > 100) throw new LanguageError([{ line, message: 'CLOCK drifter expects 0..100' }]);
      continue;
    }
    if (/^view$/i.test(modifier)) throw new LanguageError([{ line, message: 'the master CLOCK view is always active; WITH VIEW is only for named clocks' }]);
    throw new LanguageError([{ line, message: `CLOCK does not support modifier '${modifier}'` }]);
  }
  return `__masterclock(${JSON.stringify(expression)},0,"ms",false,${jitter},${timingDrift},${disabled});`;
}

function compileNamedClock(
  lineText: string,
  line: number,
  sourceDefinitions: Map<string, SourceDefinition>,
  reservedNames: Set<string>,
): { name: string; output: string } | null {
  const match = lineText.match(/^(_)?CLOCK\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+RATE\s+([/*])\s*(\d+(?:\.\d+)?))?(?:\s+WITH\s+(.+))?$/i);
  if (!match || /^set$/i.test(match[2])) return null;
  const disabled = Boolean(match[1]);
  const name = match[2];
  if (reservedNames.has(name) || sourceDefinitions.has(name) || /^master$/i.test(name)) {
    throw new LanguageError([{ line, message: `CLOCK '${name}' is already defined or reserved` }]);
  }
  const op = match[3] ?? '*';
  const amount = match[4] ? numberValue(match[4], line, 'CLOCK rate') : 1;
  if (amount <= 0) throw new LanguageError([{ line, message: 'CLOCK rate must be greater than 0' }]);
  const rateLabel = `${op}${formatSourceNumber(amount)}`;
  let view = false;
  let jitter = 0;
  let drifter = 0;
  const modifiers = (match[5] ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  for (const modifier of modifiers) {
    if (/^view$/i.test(modifier)) { view = true; continue; }
    const jitterMatch = modifier.match(/^jitter\s+(\d+(?:\.\d+)?)$/i);
    if (jitterMatch) {
      jitter = numberValue(jitterMatch[1], line, 'CLOCK jitter');
      if (jitter < 0 || jitter > 100) throw new LanguageError([{ line, message: 'CLOCK jitter expects 0..100' }]);
      continue;
    }
    const drifterMatch = modifier.match(/^drifter\s+(\d+(?:\.\d+)?)$/i);
    if (drifterMatch) {
      drifter = numberValue(drifterMatch[1], line, 'CLOCK drifter');
      if (drifter < 0 || drifter > 100) throw new LanguageError([{ line, message: 'CLOCK drifter expects 0..100' }]);
      continue;
    }
    throw new LanguageError([{ line, message: `CLOCK '${name}' does not support modifier '${modifier}'` }]);
  }
  sourceDefinitions.set(name, { kind: 'clock', internalName: name, rateLabel, display: `clock ${rateLabel}` });
  const calls = `${view ? '.view()' : ''}${disabled ? '.disabled(true)' : ''}`;
  const directives = [
    `${name} = Clock.rate(${JSON.stringify(rateLabel)})${calls};`,
    `__clockparent(${JSON.stringify(name)},\"Clock\",${JSON.stringify(rateLabel)});`,
  ];
  if (jitter > 0) directives.push(`__clockfeel(${JSON.stringify(name)},\"jitter\",${jitter});`);
  if (drifter > 0) directives.push(`__clockfeel(${JSON.stringify(name)},\"drift\",${drifter});`);
  return { name, output: directives.join('\n') };
}

function modSourceKey(ownerVoice: string | null, name: string): string {
  return ownerVoice ? `${ownerVoice}:${name}` : name;
}

function compileModProperty(mod: ModState, property: string, rawValue: string, line: number): string {
  const key = property.toLowerCase();
  const value = rawValue.trim();

  if (key === 'model') {
    const model = value.toLowerCase();
    if (model !== 'swell' && model !== 'dices') {
      throw new LanguageError([{ line, message: 'MOD model expects swell or dices' }]);
    }
    mod.modelId = model as 'swell' | 'dices';
    return `__modset(${JSON.stringify(mod.internalName)},"model",${JSON.stringify(model)});`;
  }

  if (mod.modelId === 'dices') {
    if (key === 'rate') {
      let match = value.match(/^(\d+(?:\.\d+)?)\s*hz$/i);
      if (match) {
        const hz = Number(match[1]);
        if (!Number.isFinite(hz) || hz <= 0) throw new LanguageError([{ line, message: 'MOD rate must be greater than 0' }]);
        return `__modset(${JSON.stringify(mod.internalName)},"freq",${JSON.stringify(String(hz))});`;
      }
      match = value.match(/^(\d+(?:\.\d+)?)\s+beats?$/i);
      if (match) {
        const beats = Number(match[1]);
        if (!Number.isFinite(beats) || beats <= 0) throw new LanguageError([{ line, message: 'MOD rate must be greater than 0' }]);
        return `__modset(${JSON.stringify(mod.internalName)},"ratebeat",${JSON.stringify(String(beats))});`;
      }
      match = value.match(/^(\d+(?:\.\d+)?)\s+(?:sec|secs|second|seconds)$/i);
      if (match) {
        const seconds = Number(match[1]);
        if (!Number.isFinite(seconds) || seconds <= 0) throw new LanguageError([{ line, message: 'MOD rate must be greater than 0' }]);
        return `__modset(${JSON.stringify(mod.internalName)},"freq",${JSON.stringify(String(1 / seconds))});`;
      }
      match = value.match(/^(\d+(?:\.\d+)?)\s+ms$/i);
      if (match) {
        const ms = Number(match[1]);
        if (!Number.isFinite(ms) || ms <= 0) throw new LanguageError([{ line, message: 'MOD rate must be greater than 0' }]);
        return `__modset(${JSON.stringify(mod.internalName)},"freq",${JSON.stringify(String(1000 / ms))});`;
      }
      throw new LanguageError([{ line, message: 'MOD dices rate expects hz, beat, sec, or ms' }]);
    }

    if (key === 'length') {
      const amount = Number(value);
      if (!Number.isInteger(amount) || amount < 1 || amount > 16) {
        throw new LanguageError([{ line, message: 'MOD dices length expects an integer from 1 to 16' }]);
      }
      return `__modset(${JSON.stringify(mod.internalName)},"length",${JSON.stringify(String(amount))});`;
    }

    if (key === 'spread' || key === 'bias' || key === 'steps' || key === 'deja' || key === 'diversity') {
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount < 0 || amount > 100) {
        throw new LanguageError([{ line, message: `MOD dices ${key} expects 0..100` }]);
      }
      return `__modset(${JSON.stringify(mod.internalName)},${JSON.stringify(key)},${JSON.stringify(String(amount))});`;
    }

    throw new LanguageError([{ line, message: `unknown MOD dices property '${property}'` }]);
  }

  if (key === 'rate') {
    let match = value.match(/^(\d+(?:\.\d+)?)\s*hz$/i);
    if (match) {
      const hz = Number(match[1]);
      if (!Number.isFinite(hz) || hz <= 0) throw new LanguageError([{ line, message: 'MOD rate must be greater than 0' }]);
      return `__modset(${JSON.stringify(mod.internalName)},"freq",${JSON.stringify(String(hz))});`;
    }

    match = value.match(/^(\d+(?:\.\d+)?)\s+(?:sec|secs|second|seconds)$/i);
    if (match) {
      const seconds = Number(match[1]);
      if (!Number.isFinite(seconds) || seconds <= 0) throw new LanguageError([{ line, message: 'MOD rate must be greater than 0' }]);
      return `__modset(${JSON.stringify(mod.internalName)},"freq",${JSON.stringify(String(1 / seconds))});`;
    }

    match = value.match(/^(\d+(?:\.\d+)?)\s+ms$/i);
    if (match) {
      const ms = Number(match[1]);
      if (!Number.isFinite(ms) || ms <= 0) throw new LanguageError([{ line, message: 'MOD rate must be greater than 0' }]);
      return `__modset(${JSON.stringify(mod.internalName)},"freq",${JSON.stringify(String(1000 / ms))});`;
    }

    throw new LanguageError([{ line, message: 'MOD rate expects hz, sec, or ms' }]);
  }

  if (key === 'shape') {
    const normalized = value.toLowerCase();
    const presets: Record<string, Array<[string, string]>> = {
      sine: [['slope', '50'], ['shape', '50'], ['smooth', '100']],
      triangle: [['slope', '50'], ['shape', '50'], ['smooth', '0']],
      ramp: [['slope', '100'], ['shape', '50'], ['smooth', '0']],
      rise: [['slope', '100'], ['shape', '50'], ['smooth', '0']],
      fall: [['slope', '0'], ['shape', '50'], ['smooth', '0']],
    };

    const preset = presets[normalized];
    if (preset) {
      return preset
        .map(([parameter, expression]) =>
          `__modset(${JSON.stringify(mod.internalName)},${JSON.stringify(parameter)},${JSON.stringify(expression)});`)
        .join('\n');
    }

    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 100) {
      return `__modset(${JSON.stringify(mod.internalName)},"shape",${JSON.stringify(String(numeric))});`;
    }

    throw new LanguageError([{ line, message: 'MOD shape expects sine, triangle, ramp, rise, fall, or 0..100' }]);
  }

  if (key === 'relation') {
    const match = value.match(/^(phase|amplitude|frequency|different)(?:\s+with\s+shift\s+(-?\d+(?:\.\d+)?))?$/i);
    if (!match) {
      throw new LanguageError([{ line, message: 'MOD relation expects phase, amplitude, frequency, or different [with shift 0..100]' }]);
    }

    const relation = match[1].toLowerCase();
    const directives = [
      `__modset(${JSON.stringify(mod.internalName)},"output",${JSON.stringify(relation)});`,
    ];

    if (match[2] !== undefined) {
      const shift = Number(match[2]);
      if (!Number.isFinite(shift) || shift < 0 || shift > 100) {
        throw new LanguageError([{ line, message: 'MOD relation shift expects 0..100' }]);
      }
      directives.push(`__modset(${JSON.stringify(mod.internalName)},"shift",${JSON.stringify(String(shift))});`);
    }

    return directives.join('\n');
  }

  if (key === 'range') {
    const normalized = value.toLowerCase();
    if (normalized !== 'control' && normalized !== 'audio') {
      throw new LanguageError([{ line, message: 'MOD range expects control or audio' }]);
    }
    return `__modset(${JSON.stringify(mod.internalName)},"range",${JSON.stringify(normalized)});`;
  }


  if (key === 'slope' || key === 'smooth' || key === 'shift') {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0 || amount > 100) {
      throw new LanguageError([{ line, message: `MOD ${key} expects 0..100` }]);
    }
    return `__modset(${JSON.stringify(mod.internalName)},${JSON.stringify(key)},${JSON.stringify(String(amount))});`;
  }

  throw new LanguageError([{ line, message: `unknown MOD property '${property}'` }]);
}

function compileModulationRoute(
  voice: VoiceState,
  parameter: string,
  value: string,
  line: number,
  modSources: Map<string, ModSourceDefinition>,
): string | null {
  const match = value.match(/^([A-Za-z_][A-Za-z0-9_]*)\.(a|b|c|d|x1|x2|x3|y)(?:\s+with\s+depth\s+(-?\d+(?:\.\d+)?))?$/i);
  if (!match) return null;
  const source = modSources.get(modSourceKey(voice.name, match[1])) ?? modSources.get(match[1]);
  if (!source) throw new LanguageError([{ line, message: `unknown MOD source '${match[1]}'` }]);
  const depth = match[3] === undefined ? 100 : Number(match[3]);
  if (!Number.isFinite(depth) || depth < -100 || depth > 100) {
    throw new LanguageError([{ line, message: 'modulation depth must be between -100 and 100' }]);
  }
  const token = match[2].toLowerCase();
  const port = ({ a: 1, b: 2, c: 3, d: 4, x1: 1, x2: 2, x3: 3, y: 4 } as const)[token as 'a'|'b'|'c'|'d'|'x1'|'x2'|'x3'|'y'];
  const sourcePort = source.modelId === 'dices' ? (['x1','x2','x3','y'] as const)[port - 1] : `out${port}`;
  return `${source.internalName}.${sourcePort}(${depth}) -> ${voice.name}.${parameter};`;
}


function compileFxModulation(
  fx: FxState,
  parameter: FxParameter,
  value: string,
  line: number,
  modSources: Map<string, ModSourceDefinition>,
): string | null {
  const match = value.match(/^([A-Za-z_][A-Za-z0-9_]*)\.(a|b|c|d|x1|x2|x3|y)(?:\s+with\s+depth\s+(-?\d+(?:\.\d+)?))?$/i);
  if (!match) return null;
  const source = modSources.get(modSourceKey(fx.name, match[1])) ?? modSources.get(match[1]);
  if (!source) throw new LanguageError([{ line, message: `unknown MOD source '${match[1]}'` }]);
  const depth = match[3] === undefined ? 100 : Number(match[3]);
  if (!Number.isFinite(depth) || depth < -100 || depth > 100) {
    throw new LanguageError([{ line, message: 'modulation depth must be between -100 and 100' }]);
  }
  const token = match[2].toLowerCase();
  const channel = ({ a: 1, b: 2, c: 3, d: 4, x1: 1, x2: 2, x3: 3, y: 4 } as const)[token as 'a'|'b'|'c'|'d'|'x1'|'x2'|'x3'|'y'];
  return `__fxmod(${JSON.stringify(fx.name)},${JSON.stringify(parameter)},${JSON.stringify(source.internalName)},${channel},${depth});`;
}

function requireFxModel(fx: FxState | null, diagnostics: LanguageDiagnostic[]): void {
  if (fx && !fx.hasModel) diagnostics.push({ line: fx.line, message: `FX '${fx.name}' requires model` });
}

function semitonesFromFrequency(frequency: number): number {
  const c4 = midiToFrequency(60);
  return 12 * Math.log2(frequency / c4);
}

function fxPitchSequenceDirective(
  name: string,
  values: number[],
  mode: SelectionMode,
  amount = 0,
  favor: SequenceFavorEntry[] = [],
): string {
  return `__fxsequence(${JSON.stringify(name)},${JSON.stringify(values.join('|'))},${JSON.stringify(mode)},${amount},${JSON.stringify(JSON.stringify(favor))});`;
}

function compileFxProperty(
  fx: FxState,
  property: string,
  rawValue: string,
  line: number,
  sourceDefinitions: Map<string, SourceDefinition>,
  modSources: Map<string, ModSourceDefinition>,
): string {
  const key = property.toLowerCase();
  const value = rawValue.trim();

  if (key === 'note' || key === 'freq' || key === 'scale') {
    throw new LanguageError([{ line, message: `${property.toUpperCase()} is no longer an FX property; use PITCH SCALE ..., PITCH NOTES ..., or PITCH FREQS ...` }]);
  }

  if (key === 'model') {
    const modelId = value.toLowerCase();
    const schema = FX_MODEL_REGISTRY[modelId];
    if (!schema) throw new LanguageError([{ line, message: `unknown FX model '${modelId}'` }]);
    fx.modelId = modelId;
    fx.hasModel = true;
    if (modelId === 'delay') return `__fxmeta(${JSON.stringify(fx.name)},${JSON.stringify(modelId)});`;
    return `${fx.name}.mode(${JSON.stringify(schema.lowLevelMode)});\n__fxmeta(${JSON.stringify(fx.name)},${JSON.stringify(modelId)});`;
  }

  if (key === 'every') {
    const timing = parseEverySpec(value, line, sourceDefinitions);
    const prefix = timing.clockPrelude ? `${timing.clockPrelude} ` : '';
    return `${prefix}__objectevery(${JSON.stringify(fx.name)},${timing.amount},${JSON.stringify(timing.unit)},${timing.chance},${timing.drift},${timing.loose},${JSON.stringify(timing.clockSource)});`;
  }

  if (!fx.modelId) {
    throw new LanguageError([{ line, message: `${property} requires FX model to be declared first` }]);
  }
  const schema = FX_MODEL_REGISTRY[fx.modelId];
  const skyAliases: Record<string, FxParameter> = {
    decay: 'feedback',
    damp: 'texture',
    damping: 'texture',
    bloom: 'density',
    diffuse: 'density',
    predelay: 'position',
    motion: 'reverb',
    width: 'spread',
  };
  const effectiveKey = fx.modelId === 'sky' ? (skyAliases[key] ?? key) : key;

  if (fx.modelId === 'delay') {
    if (key === 'time') {
      const tm = value.match(/^((?:\d+(?:\.\d+)?)|(?:\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?))\s*(ms|sec|secs|second|seconds|beat|beats)$/i);
      if (!tm) throw new LanguageError([{ line, message: 'delay time expects <value> ms, sec, or beat' }]);
      const amount = parsePositiveAmount(tm[1], line, 'delay time');
      const unit = normalizeCycleUnit(tm[2], line);
      return `__delaytime(${JSON.stringify(fx.name)},${amount},${JSON.stringify(unit)});`;
    }
    if (key === 'spread') {
      const everySplit = splitEveryClause(value);
      const looseMatch = everySplit.base.match(/^(.*?)(?:\s+with\s+loose\s+(\d+(?:\.\d+)?))?$/i);
      if (!looseMatch) throw new LanguageError([{ line, message: 'delay spread expects <0..100> [with loose <0..100>]' }]);
      const expression = scalarExpressionFromSource(looseMatch[1].trim(), sourceDefinitions);
      const loose = looseMatch[2] === undefined ? 25 : numberValue(looseMatch[2], line, 'delay spread loose');
      const literal = Number(expression);
      if (Number.isFinite(literal) && (literal < 0 || literal > 100)) {
        throw new LanguageError([{ line, message: 'delay spread expects 0..100' }]);
      }
      if (loose < 0 || loose > 100) {
        throw new LanguageError([{ line, message: 'delay spread loose expects 0..100' }]);
      }
      const looseDirective = `__delayparamdefault(${JSON.stringify(fx.name)},"spreadloose",${JSON.stringify(String(loose))});`;
      if (everySplit.every) {
        const timing = parseEverySpec(everySplit.every, line, sourceDefinitions);
        const prefix = timing.clockPrelude ? `${timing.clockPrelude} ` : '';
        return `${looseDirective} ${prefix}__delayparamcycle(${JSON.stringify(fx.name)},"spread",${JSON.stringify(expression)},${timing.amount},${JSON.stringify(timing.unit)},${timing.chance},${timing.drift},${timing.loose},${JSON.stringify(timing.clockSource)});`;
      }
      return `__delayparamdefault(${JSON.stringify(fx.name)},"spread",${JSON.stringify(expression)}); ${looseDirective}`;
    }
    if (key === 'pitch') {
      const match = value.match(/^(\d+(?:\.\d+)?)\s+with\s+(semitones|octaves|scale)\s+(.+)$/i);
      if (!match) {
        throw new LanguageError([{ line, message: 'delay pitch expects <probability> with semitones [...], octaves [...], or scale <mode>' }]);
      }
      const probability = numberValue(match[1], line, 'delay pitch probability');
      if (probability < 0 || probability > 100) {
        throw new LanguageError([{ line, message: 'delay pitch probability expects 0..100' }]);
      }
      const kind = match[2].toLowerCase();
      const body = match[3].trim();
      let shifts: number[] = [];
      if (kind === 'scale') {
        const intervals = MODE_INTERVALS[body.toLowerCase()];
        if (!intervals) throw new LanguageError([{ line, message: `unknown delay pitch scale '${body}'` }]);
        shifts = [...intervals].filter((value) => value >= -12 && value <= 12);
      } else {
        const list = body.match(/^\[\s*([^\]]*)\s*\]$/);
        if (!list) throw new LanguageError([{ line, message: `delay pitch ${kind} expects a numeric list` }]);
        const raw = list[1].trim();
        if (!raw) throw new LanguageError([{ line, message: `delay pitch ${kind} list cannot be empty` }]);
        shifts = raw.split(/[\s,]+/).filter(Boolean).map((token) => numberValue(token, line, `delay pitch ${kind}`));
        if (kind === 'octaves') shifts = shifts.map((value) => value * 12);
      }
      if (shifts.length === 0 || shifts.some((value) => value < -12 || value > 12)) {
        throw new LanguageError([{ line, message: 'delay pitch shifts must resolve within -12..12 semitones' }]);
      }
      const paddedShifts = Array.from({ length: 16 }, (_, index) => shifts[index] ?? 0);
      return [
        `__delayparamdefault(${JSON.stringify(fx.name)},"pitchprob",${JSON.stringify(String(probability))});`,
        `__delayparamdefault(${JSON.stringify(fx.name)},"pitchcount",${JSON.stringify(String(shifts.length))});`,
        ...paddedShifts.map((shift, index) =>
          `__delayparamdefault(${JSON.stringify(fx.name)},${JSON.stringify(`pitch${index}`)},${JSON.stringify(String(shift))});`
        ),
      ].join(' ');
    }
    if (key === 'lines') {
      const n = numberValue(value, line, 'delay lines');
      if (!Number.isInteger(n) || n < 1 || n > 8) throw new LanguageError([{ line, message: 'delay lines expects an integer from 1 to 8' }]);
      return `__delayparam(${JSON.stringify(fx.name)},"lines",${n});`;
    }
    if (key === 'reverse' || key === 'tape' || key === 'diffusion' || key === 'pingpong') {
      const split = splitEveryClause(value);
      const expression = scalarExpressionFromSource(split.base, sourceDefinitions);
      const literal = Number(expression);
      if (Number.isFinite(literal) && (literal < 0 || literal > 100)) throw new LanguageError([{ line, message: `delay ${key} expects 0..100` }]);
      if (split.every) {
        const timing = parseEverySpec(split.every, line, sourceDefinitions);
        const prefix = timing.clockPrelude ? `${timing.clockPrelude} ` : '';
        return `${prefix}__delayparamcycle(${JSON.stringify(fx.name)},${JSON.stringify(key)},${JSON.stringify(expression)},${timing.amount},${JSON.stringify(timing.unit)},${timing.chance},${timing.drift},${timing.loose},${JSON.stringify(timing.clockSource)});`;
      }
      return `__delayparamdefault(${JSON.stringify(fx.name)},${JSON.stringify(key)},${JSON.stringify(expression)});`;
    }
  }

  if (key === 'freeze' || (key === 'reverse' && fx.modelId !== 'delay')) {
    if (!/^(on|off|true|false)$/i.test(value)) {
      throw new LanguageError([{ line, message: `${key} expects on or off` }]);
    }
    const enabled = /^(on|true)$/i.test(value);
    return `${fx.name}.${key}(${enabled});`;
  }

  const pitchModeMatch = key === 'pitch'
    ? value.match(/^(notes|scale|freqs)\s+(.+)$/i)
    : null;
  const musicalPitchKey = pitchModeMatch
    ? (pitchModeMatch[1].toLowerCase() === 'notes' ? 'note' : pitchModeMatch[1].toLowerCase() === 'freqs' ? 'freq' : 'scale') as 'note' | 'scale' | 'freq'
    : null;
  const musicalPitchValue = pitchModeMatch ? pitchModeMatch[2].trim() : value;

  if (musicalPitchKey) {
    claimPitchProperty(fx, musicalPitchKey, line, 'FX');
    if (!schema.musicalPitch) {
      throw new LanguageError([{ line, message: `${musicalPitchKey} pitch is not available for ${fx.modelId}` }]);
    }

    const split = splitEveryClause(musicalPitchValue);
    let pitchValues: number[] = [];
    let mode: SelectionMode = 'order';
    let selectionAmount = 0;
    let pitchFavor: SequenceFavorEntry[] = [];
    let pitchView = false;

    const directSource = splitWith(split.base);
    const sourceName = directSource.base;
    const definition = IDENTIFIER.test(sourceName) ? sourceDefinitions.get(sourceName) : undefined;
    if (definition) {
      const modifiers = directSource.modifiers;
      pitchView = modifiers.some((modifier) => /^view$/i.test(modifier));
      const selection = parseSelectionMode(
        modifiers.filter((modifier) => !/^view$/i.test(modifier)),
        line,
        `pitch ${musicalPitchKey}`,
      );
      mode = selection.mode;
      selectionAmount = selection.amount;

      if (musicalPitchKey === 'note') {
        if (definition.kind !== 'note' && definition.kind !== 'scale') {
          throw new LanguageError([{ line, message: `source '${sourceName}' is ${definition.kind}, expected note or scale source for pitch note` }]);
        }
        pitchValues = definition.values.map(semitonesFromFrequency);
        const storedFavor = definition.kind === 'note' ? definition.favor : [];
        pitchFavor = mergeFavor(storedFavor, selection.favor);
        validateFavorForMode(pitchFavor, mode, line, 'pitch note');
      } else if (musicalPitchKey === 'scale') {
        if (definition.kind !== 'scale') {
          throw new LanguageError([{ line, message: `source '${sourceName}' is ${definition.kind}, expected scale source for pitch scale` }]);
        }
        pitchValues = definition.values.map(semitonesFromFrequency);
        pitchFavor = selection.favor;
        validateFavorForMode(pitchFavor, mode, line, 'pitch scale');
      } else {
        if (definition.kind !== 'freq') {
          throw new LanguageError([{ line, message: `source '${sourceName}' is ${definition.kind}, expected frequency source for pitch freq` }]);
        }
        pitchValues = definition.values.map(semitonesFromFrequency);
        pitchFavor = selection.favor;
        validateFavorForMode(pitchFavor, mode, line, 'pitch freq');
      }
    } else
    if (musicalPitchKey === 'note') {
      const parsed = splitWith(split.base);
      pitchView = parsed.modifiers.some((modifier) => /^view$/i.test(modifier));
      const pitchModifiers = parsed.modifiers.filter((modifier) => !/^view$/i.test(modifier));
      const noteTokens = parseList(parsed.base, line, 'note').map((token) => parseNoteSequenceToken(token, line));
      const notes = noteTokens.map((token) => token.note);
      const inlineFavor = noteTokens.flatMap((token) => token.favor ? [token.favor] : []);
      pitchValues = notes.map((note) => {
        const midi = midiFromNote(note);
        if (midi === null) throw new LanguageError([{ line, message: `invalid note '${note}'` }]);
        return midi - 60;
      });
      { const selection = parseSelectionMode(pitchModifiers, line, 'note'); mode = selection.mode; selectionAmount = selection.amount; pitchFavor = mergeFavor(inlineFavor, selection.favor); validateFavorForMode(pitchFavor, mode, line, 'note'); }
    } else if (musicalPitchKey === 'freq') {
      const parsed = splitWith(split.base);
      const frequencies = parseList(parsed.base, line, 'freq').map((item) => numberValue(item, line, 'freq'));
      if (frequencies.some((frequency) => frequency <= 0)) {
        throw new LanguageError([{ line, message: 'freq must be greater than 0' }]);
      }
      pitchValues = frequencies.map(semitonesFromFrequency);
      { const selection = parseSelectionMode(parsed.modifiers, line, 'freq'); mode = selection.mode; selectionAmount = selection.amount; pitchFavor = selection.favor; }
    } else {
      const parsed = parseScaleSpec(split.base, line, true);
      if (!parsed) throw new LanguageError([{ line, message: 'scale expects root and mode with optional range and sequencing modifier' }]);
      pitchValues = parsed.values.map(semitonesFromFrequency);
      mode = parsed.mode;
      selectionAmount = parsed.amount;
      pitchFavor = parsed.favor;
      pitchView = parsed.view;
    }

    if (pitchValues.some((pitch) => pitch < -48 || pitch > 48)) {
      throw new LanguageError([{ line, message: 'FX musical pitch must resolve inside -48..48 semitones relative to C4' }]);
    }

    const sequence = pitchValues.length > 1 ? ` ${fxPitchSequenceDirective(fx.name, pitchValues, mode, selectionAmount, pitchFavor)}` : '';
    const pianoProperty = musicalPitchKey === 'note' ? 'note' : musicalPitchKey === 'scale' ? 'scale' : null;
    const piano = pitchView && pianoProperty
      ? ` ${inlinePianoDirective('fx', fx.name, pianoProperty, line, pitchValues.map((pitch) => midiToFrequency(60 + pitch)))}`
      : '';
    const every = split.every
      ? (() => {
          const timing = parseEverySpec(split.every!, line, sourceDefinitions);
          const prefix = timing.clockPrelude ? ` ${timing.clockPrelude}` : '';
          return `${prefix} __fxpitchcycle(${JSON.stringify(fx.name)},${timing.amount},${JSON.stringify(timing.unit)},${timing.chance},${timing.drift},${timing.loose},${JSON.stringify(timing.clockSource)});`;
        })()
      : '';
    return `${fx.name}.pitch(${pitchValues[0]});${sequence}${every}${piano}`;
  }

  if (!schema.parameters.has(effectiveKey as FxParameter)) {
    throw new LanguageError([{ line, message: `unknown FX property '${property}' for ${fx.modelId}` }]);
  }

  const parameter = effectiveKey as FxParameter;
  const envelopeSplit = splitEveryClause(value);
  const envelope = envelopeFromValue(envelopeSplit.base, line, sourceDefinitions);
  if (envelope) {
    const timing = envelopeSplit.every ? parseEverySpec(envelopeSplit.every, line, sourceDefinitions) : null;
    return envelopeParamDirective('fx', fx.name, parameter, envelope, line, timing);
  }
  if (/^from\b/i.test(value)) {
    throw new LanguageError([{ line, message: "FROM is no longer supported; use the source name directly" }]);
  }
  const modulation = compileFxModulation(fx, parameter, value, line, modSources);
  if (modulation) return modulation;

  const split = splitEveryClause(value);
  const generative = parseGenerativeValue(split.base, line);
  const expression = scalarExpressionFromSource(generative.base, sourceDefinitions);
  if (!expression) throw new LanguageError([{ line, message: `${parameter} expects a value` }]);

  if (parameter === 'pitch') {
    const literal = Number(expression);
    if (Number.isFinite(literal) && (literal < -48 || literal > 48)) {
      throw new LanguageError([{ line, message: 'pitch expects -48..48 semitones' }]);
    }
  }

  const initial = `${fx.name}.${parameter}(${expression});`;
  if (generative.mode) {
    if (split.every) {
      const timing = parseEverySpec(split.every, line, sourceDefinitions);
      const prefix = timing.clockPrelude ? `${timing.clockPrelude} ` : '';
      const inline = generative.view ? ` ${inlineScalarDirective('fx', fx.name, parameter, line, expression)}` : '';
      return `${initial} ${prefix}__genparamcycle("fx",${JSON.stringify(fx.name)},${JSON.stringify(parameter)},${JSON.stringify(expression)},${JSON.stringify(generative.mode)},${generative.amount},${timing.amount},${JSON.stringify(timing.unit)},${timing.chance},${timing.drift},${timing.loose},${JSON.stringify(timing.clockSource)});${inline}`;
    }
    const inline = generative.view ? ` ${inlineScalarDirective('fx', fx.name, parameter, line, expression)}` : '';
    return `${initial} __genparamdefault("fx",${JSON.stringify(fx.name)},${JSON.stringify(parameter)},${JSON.stringify(expression)},${JSON.stringify(generative.mode)},${generative.amount});${inline}`;
  }

  if (split.every) {
    const timing = parseEverySpec(split.every, line, sourceDefinitions);
    const prefix = timing.clockPrelude ? `${timing.clockPrelude} ` : '';
    return `${initial} ${prefix}__fxparamcycle(${JSON.stringify(fx.name)},${JSON.stringify(parameter)},${JSON.stringify(expression)},${timing.amount},${JSON.stringify(timing.unit)},${timing.chance},${timing.drift},${timing.loose},${JSON.stringify(timing.clockSource)});`;
  }
  return `${initial} __fxparamdefault(${JSON.stringify(fx.name)},${JSON.stringify(parameter)},${JSON.stringify(expression)});`;
}

type OutPort = 'out' | 'main' | 'aux' | 'lp' | 'hp' | 'bp' | 'np' | 'in' | 'in2' | null;

type OutEndpoint = {
  name: string;
  channel: 'L' | 'R' | null;
  port: OutPort;
  amount: number;
};

type OutObjectKind = 'voice' | 'matter' | 'resonator' | 'drumkit' | 'fx' | 'filter' | 'main';

type OutSignal =
  | { stereo: false; mono: string }
  | { stereo: true; left: string; right: string; primary: string };

type OutInput =
  | { stereo: false; mono: string }
  | { stereo: true; left: string; right: string };

function parseOutEndpoint(raw: string, line: number): OutEndpoint {
  const match = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\.(out|main|aux|lp|hp|bp|np|in|in2|L|R))?(?:\s+at\s+(.+))?$/i);
  if (!match) throw new LanguageError([{ line, message: `invalid OUT endpoint '${raw.trim()}'` }]);
  const suffix = match[2]?.toLowerCase() ?? null;
  return {
    name: match[1],
    port: suffix === 'out' || suffix === 'main' || suffix === 'aux' || suffix === 'lp' || suffix === 'hp' || suffix === 'bp' || suffix === 'np' || suffix === 'in' || suffix === 'in2' ? suffix : null,
    channel: suffix === 'l' ? 'L' : suffix === 'r' ? 'R' : null,
    amount: match[3] === undefined ? 100 : normalizedAmount(match[3].trim(), line),
  };
}

function normalizeLocalOutSource(localSource: string, raw: string, line: number): string {
  const text = raw.trim();
  if (!text) return localSource;
  const amountOnly = text.match(/^at\s+(.+)$/i);
  if (amountOnly) return `${localSource} at ${amountOnly[1]}`;
  const port = text.match(/^(out|main|aux|lp|hp|bp|np|L|R)(?:\s+at\s+(.+))?$/i);
  if (!port) {
    throw new LanguageError([{ line, message: `inside an object, OUT expects [port] [AT amount] TO destination` }]);
  }
  return `${localSource}.${port[1]}${port[2] ? ` at ${port[2]}` : ''}`;
}

function compileOut(
  lineText: string,
  line: number,
  localSource: string | null,
  voices: Set<string>,
  fxs: Set<string>,
  filters: Set<string>,
  drumkits: Set<string>,
  voiceEmbeddedFilters: Map<string, string>,
  voiceSoundIds: Map<string, string>,
): { code: string; sources: string[] } {
  const rawBody = lineText.trim().replace(/^OUT\b/i, '').trim();
  const body = localSource && /^to\b/i.test(rawBody) ? `${localSource} ${rawBody}` : rawBody;
  const rawPieces = body.split(/\s+to\s+/i);
  if (rawPieces.length < 2) {
    throw new LanguageError([{ line, message: 'OUT expects [source/port] [AT amount] TO destination [AT amount TO destination ...]' }]);
  }

  const pieces = [...rawPieces];
  if (localSource) pieces[0] = normalizeLocalOutSource(localSource, pieces[0], line);
  else if (!pieces[0].trim()) throw new LanguageError([{ line, message: 'top-level OUT requires an explicit source object' }]);

  const endpoints = pieces.map((piece) => parseOutEndpoint(piece, line));

  const kindOf = (name: string): OutObjectKind => {
    if (voices.has(name)) {
      const sound = voiceSoundIds.get(name) ?? '';
      if (sound === 'matter') return 'matter';
      if (sound.startsWith('resonator.')) return 'resonator';
      return 'voice';
    }
    if (fxs.has(name)) return 'fx';
    if (drumkits.has(name)) return 'drumkit';
    if (filters.has(name)) return 'filter';
    if (name.toUpperCase() === 'MAIN') return 'main';
    throw new LanguageError([{ line, message: `unknown OUT object '${name}'` }]);
  };

  const sourceSignal = (endpoint: OutEndpoint, kind: OutObjectKind): OutSignal => {
    if (kind === 'main') throw new LanguageError([{ line, message: 'MAIN cannot be used as an OUT source' }]);

    if (kind === 'filter') {
      if (endpoint.channel) throw new LanguageError([{ line, message: 'FILTER outputs are mono; .L/.R are not valid' }]);
      if (endpoint.port === 'in' || endpoint.port === 'in2') throw new LanguageError([{ line, message: `FILTER '${endpoint.name}' input cannot be used as an audio source` }]);
      if (endpoint.port && !['lp', 'hp', 'bp', 'np'].includes(endpoint.port)) {
        throw new LanguageError([{ line, message: `FILTER '${endpoint.name}' output must be .lp, .hp, .bp, or .np` }]);
      }
      return { stereo: false, mono: `${endpoint.name}.${endpoint.port ?? 'lp'}` };
    }

    if (kind === 'fx' || kind === 'drumkit') {
      if (endpoint.port) throw new LanguageError([{ line, message: `${kind.toUpperCase()} outputs use .L/.R, not named mono ports` }]);
      if (endpoint.channel) return { stereo: false, mono: `${endpoint.name}.${endpoint.channel === 'R' ? 'out_R' : 'out_L'}` };
      return { stereo: true, left: `${endpoint.name}.out_L`, right: `${endpoint.name}.out_R`, primary: `${endpoint.name}.out_L` };
    }

    const embeddedFilter = voiceEmbeddedFilters.get(endpoint.name);
    if (embeddedFilter) {
      if (endpoint.channel) throw new LanguageError([{ line, message: 'VOICE/FILTER outputs are mono; .L/.R are not valid' }]);
      if (endpoint.port === 'in' || endpoint.port === 'in2') throw new LanguageError([{ line, message: `input selector '${endpoint.port}' cannot be used as an output of '${endpoint.name}'` }]);
      if (endpoint.port && !['lp', 'hp', 'bp', 'np'].includes(endpoint.port)) {
        throw new LanguageError([{ line, message: `VOICE '${endpoint.name}' contains FILTER '${embeddedFilter}'; available outputs are .lp, .hp, .bp, .np` }]);
      }
      return { stereo: false, mono: `${endpoint.name}.${endpoint.port ?? 'lp'}` };
    }

    if (kind === 'voice') {
      if (endpoint.channel) throw new LanguageError([{ line, message: 'VOICE outputs are mono ports; .L/.R are not valid' }]);
      if (endpoint.port === 'in' || endpoint.port === 'in2') throw new LanguageError([{ line, message: `VOICE '${endpoint.name}' does not expose an audio input` }]);
      if (endpoint.port && !['out', 'aux'].includes(endpoint.port)) throw new LanguageError([{ line, message: `VOICE '${endpoint.name}' output must be .out or .aux` }]);
      return { stereo: false, mono: `${endpoint.name}.${endpoint.port ?? 'out'}` };
    }

    if (endpoint.channel) throw new LanguageError([{ line, message: `${kind} outputs use named MAIN/AUX ports, not .L/.R` }]);
    const outputPort = endpoint.port === 'in' || endpoint.port === 'in2' ? null : endpoint.port;
    if (outputPort && !['out', 'main', 'aux'].includes(outputPort)) throw new LanguageError([{ line, message: `${kind} '${endpoint.name}' output must be .main/.out or .aux` }]);
    if (outputPort === 'out' || outputPort === 'main') return { stereo: false, mono: `${endpoint.name}.out` };
    if (outputPort === 'aux') return { stereo: false, mono: `${endpoint.name}.aux` };
    return { stereo: true, left: `${endpoint.name}.out`, right: `${endpoint.name}.aux`, primary: `${endpoint.name}.out` };
  };

  const targetInput = (endpoint: OutEndpoint, kind: OutObjectKind): OutInput | null => {
    if (kind === 'main') return null;
    if (kind === 'voice') throw new LanguageError([{ line, message: `object '${endpoint.name}' does not expose an audio input` }]);
    if (kind === 'drumkit') throw new LanguageError([{ line, message: `DRUMKIT '${endpoint.name}' does not expose an audio input` }]);

    if (kind === 'filter') {
      if (endpoint.channel) throw new LanguageError([{ line, message: 'FILTER input is mono; .L/.R are not valid' }]);
      if (endpoint.port === 'in2') throw new LanguageError([{ line, message: `FILTER '${endpoint.name}' has no .in2 input` }]);
      if (endpoint.port && !['in', 'lp', 'hp', 'bp', 'np'].includes(endpoint.port)) throw new LanguageError([{ line, message: `FILTER '${endpoint.name}' has no input '${endpoint.port}'` }]);
      return { stereo: false, mono: `${endpoint.name}.in` };
    }

    if (kind === 'resonator') {
      if (endpoint.channel) throw new LanguageError([{ line, message: `resonator '${endpoint.name}' has one mono audio input` }]);
      if (endpoint.port === 'in2') throw new LanguageError([{ line, message: `resonator '${endpoint.name}' has no .in2 input` }]);
      if (endpoint.port && !['in', 'out', 'main', 'aux'].includes(endpoint.port)) throw new LanguageError([{ line, message: `resonator '${endpoint.name}' has no input '${endpoint.port}'` }]);
      return { stereo: false, mono: `${endpoint.name}.in` };
    }

    if (kind === 'matter') {
      if (endpoint.channel) throw new LanguageError([{ line, message: `matter '${endpoint.name}' external inputs are mono` }]);
      if (endpoint.port && !['in', 'in2', 'out', 'main', 'aux'].includes(endpoint.port)) throw new LanguageError([{ line, message: `matter '${endpoint.name}' has no input '${endpoint.port}'` }]);
      return { stereo: false, mono: `${endpoint.name}.${endpoint.port === 'in2' ? 'in2' : 'in'}` };
    }

    if (endpoint.port) throw new LanguageError([{ line, message: `FX '${endpoint.name}' input uses .L/.R channel selectors` }]);
    if (endpoint.channel) return { stereo: false, mono: `${endpoint.name}.${endpoint.channel === 'R' ? 'inR' : 'inL'}` };
    return { stereo: true, left: `${endpoint.name}.inL`, right: `${endpoint.name}.inR` };
  };

  const routes: string[] = [];
  for (let edge = 0; edge < endpoints.length - 1; edge += 1) {
    const source = endpoints[edge];
    const target = endpoints[edge + 1];
    const sourceKind = kindOf(source.name);
    const targetKind = kindOf(target.name);
    const signal = sourceSignal(source, sourceKind);
    const amount = source.amount;

    if (targetKind === 'main') {
      if (target.port) throw new LanguageError([{ line, message: 'MAIN has no named audio port; use MAIN, MAIN.L, or MAIN.R' }]);
      if (target.channel) {
        const mono = signal.stereo ? (target.channel === 'R' ? signal.right : signal.left) : signal.mono;
        routes.push(`${mono}(${amount}) -> Audio.out_${target.channel};`);
      } else if (signal.stereo) {
        routes.push(`${signal.left}(${amount}) -> Audio.out_L;`);
        routes.push(`${signal.right}(${amount}) -> Audio.out_R;`);
      } else {
        routes.push(`${signal.mono}(${amount}) -> Audio.out;`);
      }
      continue;
    }

    const input = targetInput(target, targetKind);
    if (!input) throw new LanguageError([{ line, message: `object '${target.name}' does not expose an audio input` }]);
    if (input.stereo) {
      if (signal.stereo) {
        routes.push(`${signal.left}(${amount}) -> ${input.left};`);
        routes.push(`${signal.right}(${amount}) -> ${input.right};`);
      } else {
        routes.push(`${signal.mono}(${amount}) -> ${input.left};`);
        routes.push(`${signal.mono}(${amount}) -> ${input.right};`);
      }
    } else {
      routes.push(`${signal.stereo ? signal.primary : signal.mono}(${amount}) -> ${input.mono};`);
    }
  }

  if (endpoints[endpoints.length - 1].amount !== 100) {
    throw new LanguageError([{ line, message: "'AT' belongs to the outgoing route; the final OUT destination cannot have AT" }]);
  }

  return { code: routes.join('\n'), sources: endpoints.slice(0, -1).map((endpoint) => endpoint.name) };
}


function compileFilterProperty(
  filter: FilterState,
  property: string,
  rawValue: string,
  line: number,
  sourceDefinitions: Map<string, SourceDefinition>,
): string {
  const key = property.toLowerCase();
  let value = rawValue.trim();
  if (key === 'pitch') {
    const pitch = value.match(/^(notes|freqs|scale)\s+(.+)$/i);
    if (!pitch) throw new LanguageError([{ line, message: 'FILTER PITCH expects SCALE ..., NOTES [...], or FREQS [...]' }]);
    const kind = pitch[1].toLowerCase();
    value = `${kind === 'notes' ? 'notes' : kind === 'freqs' ? 'freqs' : 'scale'} ${pitch[2].trim()}`;
  }

  if (key === 'every') {
    const timing = parseEverySpec(value, line, sourceDefinitions);
    const prefix = timing.clockPrelude ? `${timing.clockPrelude}\n` : '';
    return `${prefix}__objectevery(${JSON.stringify(filter.internalName)},${timing.amount},${JSON.stringify(timing.unit)},${timing.chance},${timing.drift},${timing.loose},${JSON.stringify(timing.clockSource)});`;
  }

  if (key === 'model') {
    if (!/^svf$/i.test(value)) {
      throw new LanguageError([{ line, message: "FILTER model expects svf" }]);
    }
    filter.hasModel = true;
    return `${filter.internalName}.model("svf");`;
  }
  if (!filter.hasModel) throw new LanguageError([{ line, message: `FILTER '${filter.name}' requires model before parameters` }]);

  if (key === 'resonance' || key === 'drive' || key === 'cutoff') {
    const envelopeSplit = splitEveryClause(value);
    const envelope = envelopeFromValue(envelopeSplit.base, line, sourceDefinitions);
    if (envelope) {
      const timing = envelopeSplit.every ? parseEverySpec(envelopeSplit.every, line, sourceDefinitions) : null;
      return envelopeParamDirective('filter', filter.internalName, key, envelope, line, timing);
    }
  }

  if (key === 'resonance') {
    const split = splitEveryClause(value);
    const generative = parseGenerativeValue(split.base, line);
    const expression = scalarExpressionFromSource(generative.base, sourceDefinitions);
    const literal = Number(expression);
    if (Number.isFinite(literal) && (literal < 0 || literal > 100)) {
      throw new LanguageError([{ line, message: 'resonance expects 0..100' }]);
    }
    const initial = `${filter.internalName}.resonance(${expression});`;
    if (generative.mode) {
      if (split.every) {
        const timing = parseEverySpec(split.every, line, sourceDefinitions);
        const prefix = timing.clockPrelude ? `${timing.clockPrelude} ` : '';
        const inline = generative.view ? ` ${inlineScalarDirective('filter', filter.internalName, 'resonance', line, expression)}` : '';
        return `${initial} ${prefix}__genparamcycle("filter",${JSON.stringify(filter.internalName)},"resonance",${JSON.stringify(expression)},${JSON.stringify(generative.mode)},${generative.amount},${timing.amount},${JSON.stringify(timing.unit)},${timing.chance},${timing.drift},${timing.loose},${JSON.stringify(timing.clockSource)});${inline}`;
      }
      const inline = generative.view ? ` ${inlineScalarDirective('filter', filter.internalName, 'resonance', line, expression)}` : '';
      return `${initial} __genparamdefault("filter",${JSON.stringify(filter.internalName)},"resonance",${JSON.stringify(expression)},${JSON.stringify(generative.mode)},${generative.amount});${inline}`;
    }
    if (split.every) throw new LanguageError([{ line, message: 'resonance every requires a generative modifier' }]);
    return initial;
  }
  if (key === 'drive') {
    const split = splitEveryClause(value);
    const generative = parseGenerativeValue(split.base, line);
    const expression = scalarExpressionFromSource(generative.base, sourceDefinitions);
    const literal = Number(expression);
    if (Number.isFinite(literal) && (literal < 0 || literal > 100)) {
      throw new LanguageError([{ line, message: 'drive expects 0..100' }]);
    }
    const initial = `${filter.internalName}.drive(${expression});`;
    if (generative.mode) {
      if (split.every) {
        const timing = parseEverySpec(split.every, line, sourceDefinitions);
        const prefix = timing.clockPrelude ? `${timing.clockPrelude} ` : '';
        const inline = generative.view ? ` ${inlineScalarDirective('filter', filter.internalName, 'drive', line, expression)}` : '';
        return `${initial} ${prefix}__genparamcycle("filter",${JSON.stringify(filter.internalName)},"drive",${JSON.stringify(expression)},${JSON.stringify(generative.mode)},${generative.amount},${timing.amount},${JSON.stringify(timing.unit)},${timing.chance},${timing.drift},${timing.loose},${JSON.stringify(timing.clockSource)});${inline}`;
      }
      const inline = generative.view ? ` ${inlineScalarDirective('filter', filter.internalName, 'drive', line, expression)}` : '';
      return `${initial} __genparamdefault("filter",${JSON.stringify(filter.internalName)},"drive",${JSON.stringify(expression)},${JSON.stringify(generative.mode)},${generative.amount});${inline}`;
    }
    if (split.every) throw new LanguageError([{ line, message: 'drive every requires a generative modifier' }]);
    return initial;
  }

  if (key !== 'cutoff' && key !== 'pitch') throw new LanguageError([{ line, message: `unknown FILTER property '${property}'` }]);

  const split = splitEveryClause(value);
  const base = split.base.trim();

  const note = base.match(/^notes\s+(.+)$/i);
  if (note) {
    const parsed = splitWith(note[1].trim());
    const view = parsed.modifiers.some((modifier) => /^view$/i.test(modifier));
    const selectionModifiers = parsed.modifiers.filter((modifier) => !/^view$/i.test(modifier));
    const tokens = parseList(parsed.base, line, 'cutoff note').map((token) => parseNoteSequenceToken(token, line));
    const values = tokens.map((token) => {
      const midi = midiFromNote(token.note);
      if (midi === null) throw new LanguageError([{ line, message: `invalid cutoff note '${token.note}'` }]);
      return midiToFrequency(midi);
    });
    const inlineFavor = tokens.flatMap((token) => token.favor ? [token.favor] : []);
    const selection = parseSelectionMode(selectionModifiers, line, 'cutoff note');
    const favor = mergeFavor(inlineFavor, selection.favor);
    validateFavorForMode(favor, selection.mode, line, 'cutoff note');
    if (values.length === 1) {
      if (split.every) throw new LanguageError([{ line, message: 'single cutoff note does not use every' }]);
      return `${filter.internalName}.cutoff(${values[0]});`;
    }
    if (!split.every) throw new LanguageError([{ line, message: 'cutoff note list requires every <time>' }]);
    const every = parseEverySpec(split.every, line, sourceDefinitions);
    const prelude = every.clockPrelude ? `${every.clockPrelude}\n` : '';
    const piano = view ? `\n${inlinePianoDirective('filter', filter.internalName, 'note', line, values)}` : '';
    return `${filter.internalName}.cutoff(${values[0]});\n${prelude}__filtersequence(${JSON.stringify(filter.internalName)},${JSON.stringify(values.join('|'))},${JSON.stringify(selection.mode)},${selection.amount},${JSON.stringify(JSON.stringify(favor))},${every.amount},${JSON.stringify(every.unit)},${every.chance},${every.drift},${every.loose},${JSON.stringify(every.clockSource)});${piano}`;
  }

  const scale = base.match(/^scale\s+(.+)$/i);
  if (scale) {
    const parsed = parseScaleSpec(scale[1], line, true);
    if (!parsed) throw new LanguageError([{ line, message: 'invalid cutoff scale' }]);
    if (!split.every) throw new LanguageError([{ line, message: 'cutoff scale requires every <time>' }]);
    const every = parseEverySpec(split.every, line, sourceDefinitions);
    const prelude = every.clockPrelude ? `${every.clockPrelude}\n` : '';
    const piano = parsed.view ? `\n${inlinePianoDirective('filter', filter.internalName, 'scale', line, parsed.values)}` : '';
    return `${filter.internalName}.cutoff(${parsed.values[0]});\n${prelude}__filtersequence(${JSON.stringify(filter.internalName)},${JSON.stringify(parsed.values.join('|'))},${JSON.stringify(parsed.mode)},${parsed.amount},${JSON.stringify(JSON.stringify(parsed.favor))},${every.amount},${JSON.stringify(every.unit)},${every.chance},${every.drift},${every.loose},${JSON.stringify(every.clockSource)});${piano}`;
  }

  const freq = base.match(/^freqs\s+(.+)$/i);
  if (freq) {
    const parsed = splitWith(freq[1].trim());
    const values = parseList(parsed.base, line, 'cutoff freq').map((item) => {
      const hz = numberValue(item, line, 'cutoff freq');
      if (hz < 20 || hz > 20000) throw new LanguageError([{ line, message: 'cutoff freq expects 20..20000 Hz' }]);
      return hz;
    });
    const selection = parseSelectionMode(parsed.modifiers, line, 'cutoff freq');
    if (values.length === 1) {
      if (split.every) throw new LanguageError([{ line, message: 'single cutoff freq does not use every' }]);
      return `${filter.internalName}.cutoff(${values[0]});`;
    }
    if (!split.every) throw new LanguageError([{ line, message: 'cutoff freq list requires every <time>' }]);
    const every = parseEverySpec(split.every, line, sourceDefinitions);
    const prelude = every.clockPrelude ? `${every.clockPrelude}\n` : '';
    return `${filter.internalName}.cutoff(${values[0]});\n${prelude}__filtersequence(${JSON.stringify(filter.internalName)},${JSON.stringify(values.join('|'))},${JSON.stringify(selection.mode)},${selection.amount},${JSON.stringify(JSON.stringify(selection.favor))},${every.amount},${JSON.stringify(every.unit)},${every.chance},${every.drift},${every.loose},${JSON.stringify(every.clockSource)});`;
  }

  const generative = parseGenerativeValue(split.base, line);
  const expression = scalarExpressionFromSource(generative.base, sourceDefinitions);
  const literal = Number(expression);
  if (Number.isFinite(literal) && (literal < 0 || literal > 100)) {
    throw new LanguageError([{ line, message: 'cutoff expects 0..100; use PITCH SCALE ..., PITCH NOTES ..., or PITCH FREQS ... for musical cutoff material' }]);
  }
  const initial = `${filter.internalName}.cutoffPercent(${expression});`;
  if (generative.mode) {
    if (split.every) {
      const timing = parseEverySpec(split.every, line, sourceDefinitions);
      const prefix = timing.clockPrelude ? `${timing.clockPrelude} ` : '';
      const inline = generative.view ? ` ${inlineScalarDirective('filter', filter.internalName, 'cutoff', line, expression)}` : '';
      return `${initial} ${prefix}__genparamcycle("filter",${JSON.stringify(filter.internalName)},"cutoff",${JSON.stringify(expression)},${JSON.stringify(generative.mode)},${generative.amount},${timing.amount},${JSON.stringify(timing.unit)},${timing.chance},${timing.drift},${timing.loose},${JSON.stringify(timing.clockSource)});${inline}`;
    }
    const inline = generative.view ? ` ${inlineScalarDirective('filter', filter.internalName, 'cutoff', line, expression)}` : '';
    return `${initial} __genparamdefault("filter",${JSON.stringify(filter.internalName)},"cutoff",${JSON.stringify(expression)},${JSON.stringify(generative.mode)},${generative.amount});${inline}`;
  }
  if (split.every) throw new LanguageError([{ line, message: 'numeric cutoff every requires a generative modifier' }]);
  return initial;
}

function requireFilterModel(filter: FilterState | null, diagnostics: LanguageDiagnostic[]): void {
  if (filter && !filter.hasModel) diagnostics.push({ line: filter.line, message: `FILTER '${filter.name}' requires model` });
}

function requireVoiceSound(voice: VoiceState | null, diagnostics: LanguageDiagnostic[]): void {
  if (voice && !voice.hasSound) {
    diagnostics.push({ line: voice.line, message: `VOICE '${voice.name}' requires sound` });
  }
}


function parseBlockPropertyStatement(
  trimmed: string,
  line: number,
  label: 'VOICE' | 'FX' | 'FILTER',
): { property: string; value: string; live: boolean } {
  const match = trimmed.match(/^(LIVE\s+)?([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/i);
  if (!match) throw new LanguageError([{ line, message: `expected ${label} property and value` }]);
  const live = Boolean(match[1]);
  const property = match[2];
  const value = match[3].trim();
  if (live && !(label === 'VOICE' && /^pitch$/i.test(property))) {
    const literal = value.match(/^(\d+(?:\.\d+)?)(?=\s|$)/);
    if (!literal) throw new LanguageError([{ line, message: 'LIVE currently requires a literal 0..100 value, except LIVE PITCH' }]);
    const amount = Number(literal[1]);
    if (!Number.isFinite(amount) || amount < 0 || amount > 100) {
      throw new LanguageError([{ line, message: 'LIVE currently requires a literal 0..100 value, except LIVE PITCH' }]);
    }
  }
  return { property, value, live };
}

function validateLiveVoiceProperty(voice: VoiceState, property: string, line: number): void {
  const key = property.toLowerCase();
  const soundParameter = voice.soundId ? SOUND_ENGINE_REGISTRY[voice.soundId]?.parameters[key] : undefined;
  if (soundParameter || key === 'level' || key === 'bow' || key === 'blow' || key === 'strike' || key === 'pitch') return;
  throw new LanguageError([{ line, message: `LIVE is available only for 0..100 VOICE parameters or PITCH; '${property}' is not eligible` }]);
}

function validateLiveFxProperty(fx: FxState, property: string, line: number): void {
  if (!fx.modelId) throw new LanguageError([{ line, message: 'LIVE parameter requires FX model to be declared first' }]);
  const key = property.toLowerCase();
  const aliases: Record<string, FxParameter> = {
    decay: 'feedback', damp: 'texture', damping: 'texture', bloom: 'density', diffuse: 'density',
    predelay: 'position', motion: 'reverb', width: 'spread',
  };
  const effectiveKey = fx.modelId === 'sky' ? (aliases[key] ?? key) : key;
  const schema = FX_MODEL_REGISTRY[fx.modelId];
  if (schema.parameters.has(effectiveKey as FxParameter) && !['pitch'].includes(effectiveKey)) return;
  throw new LanguageError([{ line, message: `LIVE is available only for 0..100 FX parameters; '${property}' is not eligible` }]);
}

function validateLiveFilterProperty(property: string, line: number): void {
  const key = property.toLowerCase();
  if (key === 'cutoff' || key === 'resonance' || key === 'drive') return;
  throw new LanguageError([{ line, message: `LIVE is available only for CUTOFF, RESONANCE, or DRIVE on FILTER` }]);
}

export function compileLanguageSource(source: string): string {
  const capabilitySet = parseProgramCapabilities(source);
  const lines = source.replace(/\r\n/g, '\n').split('\n');

  // Collapse multiline KIT lists while preserving physical line count.
  for (let index = 0; index < lines.length; index += 1) {
    const raw = stripComment(lines[index]);
    const trimmed = raw.trim();
    const start = trimmed.match(/^(SET\s+[A-Za-z_][A-Za-z0-9_]*\s*:\s*KIT(?:\s+[A-Za-z_][A-Za-z0-9_]*)?|KIT\s+[A-Za-z_][A-Za-z0-9_]*)\s*\[\s*$/i);
    if (!start) continue;
    const indentation = raw.length - raw.trimStart().length;
    const entries: string[] = [];
    let next = index + 1;
    let closed = false;
    while (next < lines.length) {
      const childRaw = stripComment(lines[next]);
      const childTrimmed = childRaw.trim();
      if (!childTrimmed) { lines[next] = ''; next += 1; continue; }
      if (childTrimmed === ']') { lines[next] = ''; closed = true; break; }
      const childIndentation = childRaw.length - childRaw.trimStart().length;
      if (childIndentation <= indentation) break;
      entries.push(childTrimmed); lines[next] = ''; next += 1;
    }
    if (!closed) throw new LanguageError([{ line: index + 1, message: 'KIT list requires a closing ]' }]);
    lines[index] = `${' '.repeat(indentation)}${start[1]} [${entries.join('; ')}]`;
  }

  // Multiline ENVELOPE values use the same bracketed structured SET syntax as KIT.
  for (let index = 0; index < lines.length; index += 1) {
    const raw = stripComment(lines[index]);
    const trimmed = raw.trim();
    const declaration = trimmed.match(/^SET\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*ENVELOPE\s*\[\s*$/i);
    if (!declaration) continue;
    const indentation = raw.length - raw.trimStart().length;
    const properties: string[] = [];
    let next = index + 1;
    let closed = false;
    while (next < lines.length) {
      const childRaw = stripComment(lines[next]);
      const childTrimmed = childRaw.trim();
      if (!childTrimmed) { lines[next] = ''; next += 1; continue; }
      if (childTrimmed === ']') { lines[next] = ''; closed = true; break; }
      const childIndentation = childRaw.length - childRaw.trimStart().length;
      if (childIndentation <= indentation) break;
      properties.push(childTrimmed);
      lines[next] = '';
      next += 1;
    }
    if (!closed || properties.length === 0) {
      throw new LanguageError([{ line: index + 1, message: 'SET <name>: ENVELOPE [ ... ] requires one or more properties and a closing ]' }]);
    }
    lines[index] = `${' '.repeat(indentation)}SET ${declaration[1]}: ENVELOPE [${properties.join(', ')}]`;
  }

  const output = Array(lines.length).fill('') as string[];
  const diagnostics: LanguageDiagnostic[] = [];
  const voices = new Set<string>();
  const fxs = new Set<string>();
  const filters = new Set<string>();
  const voiceEmbeddedFilters = new Map<string, string>();
  const voiceSoundIds = new Map<string, string>();
  const scalarNames = new Set<string>();
  const sourceKinds = new Map<string, SourceKind>();
  const sourceDefinitions = new Map<string, SourceDefinition>();
  const localSourceDefinitions = new Map<string, Map<string, SourceDefinition>>();
  const localSourceKinds = new Map<string, Map<string, SourceKind>>();
  const modSources = new Map<string, ModSourceDefinition>();
  const drumkits = new Set<string>();
  const pendingOuts: Array<{ index: number; line: number; text: string; localSource: string | null }> = [];
  const kitDefinitions = new Map<string, DrumKitDefinition>([['sonus606', cloneDrumKit(SONUS606_KIT)]]);
  const localKitDefinitions = new Map<string, Map<string, DrumKitDefinition>>();

  const scopedDefinitions = (scope: string | null, parentScope: string | null = null): Map<string, SourceDefinition> => {
    const result = new Map(sourceDefinitions);
    if (parentScope) for (const [name, definition] of localSourceDefinitions.get(parentScope) ?? []) result.set(name, definition);
    if (scope) for (const [name, definition] of localSourceDefinitions.get(scope) ?? []) result.set(name, definition);
    return result;
  };
  const scopedKinds = (scope: string | null, parentScope: string | null = null): Map<string, SourceKind> => {
    const result = new Map(sourceKinds);
    if (parentScope) for (const [name, kind] of localSourceKinds.get(parentScope) ?? []) result.set(name, kind);
    if (scope) for (const [name, kind] of localSourceKinds.get(scope) ?? []) result.set(name, kind);
    return result;
  };
  const localDefinitionMap = (scope: string): Map<string, SourceDefinition> => {
    const existing = localSourceDefinitions.get(scope);
    if (existing) return existing;
    const created = new Map<string, SourceDefinition>();
    localSourceDefinitions.set(scope, created);
    return created;
  };
  const localKindMap = (scope: string): Map<string, SourceKind> => {
    const existing = localSourceKinds.get(scope);
    if (existing) return existing;
    const created = new Map<string, SourceKind>();
    localSourceKinds.set(scope, created);
    return created;
  };
  const seqs = new Set<string>();
  const registers = new Set<string>();
  let currentSeq: SeqState | null = null;
  let currentRegister: RegisterState | null = null;
  let currentClock: ClockState | null = null;
  let currentVoice: VoiceState | null = null;
  let currentFx: FxState | null = null;
  let currentFilter: FilterState | null = null;
  let currentMod: ModState | null = null;
  let currentDrumkit: DrumkitState | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const raw = lines[index];
    const withoutComment = stripComment(raw);
    const trimmed = withoutComment.trim();

    if (!trimmed) {
      output[index] = '';
      continue;
    }

    if (capabilitySet.directiveLine === lineNumber) {
      output[index] = '';
      continue;
    }

    const indentation = withoutComment.length - withoutComment.trimStart().length;

    try {
      if (currentMod && indentation <= currentMod.indentation) currentMod = null;
      if (currentDrumkit && indentation <= currentDrumkit.indentation) { if (!currentDrumkit.kit) diagnostics.push({ line: currentDrumkit.line, message: `DRUMKIT '${currentDrumkit.name}' requires KIT` }); currentDrumkit = null; }
      if (currentSeq && indentation <= currentSeq.indentation) { requireSeqReady(currentSeq, diagnostics); currentSeq = null; }
      if (currentRegister && indentation <= currentRegister.indentation) { requireRegisterReady(currentRegister, diagnostics); currentRegister = null; }
      if (currentClock && indentation <= currentClock.indentation) { requireClockReady(currentClock, diagnostics); currentClock = null; }
      if (currentFilter && indentation <= currentFilter.indentation) {
        requireFilterModel(currentFilter, diagnostics);
        currentFilter = null;
      }

      const drumkitBlockMatch = trimmed.match(/^(_)?DRUMKIT\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*$/i);
      if (drumkitBlockMatch) {
        if (indentation > 0) throw new LanguageError([{ line: lineNumber, message: 'DRUMKIT is currently a top-level object' }]);
        const disabled = Boolean(drumkitBlockMatch[1]);
        const name = drumkitBlockMatch[2];
        if (drumkits.has(name) || voices.has(name) || fxs.has(name) || filters.has(name)) throw new LanguageError([{ line: lineNumber, message: `duplicate object: ${name}` }]);
        drumkits.add(name);
        currentDrumkit = { name, line: lineNumber, indentation, kit: null };
        currentVoice = null; currentFx = null; currentFilter = null; currentMod = null;
        output[index] = `__drumkit(${JSON.stringify(name)},${disabled});`;
        continue;
      }

      const clockBlockMatch = trimmed.match(/^(_)?CLOCK\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+with\s+(view))?\s*:\s*$/i);
      if (clockBlockMatch) {
        if (indentation > 0) throw new LanguageError([{ line: lineNumber, message: 'CLOCK declarations are top-level only' }]);
        requireVoiceSound(currentVoice, diagnostics); requireFxModel(currentFx, diagnostics); requireSeqReady(currentSeq, diagnostics);
        currentVoice = null; currentFx = null; currentFilter = null; currentMod = null; currentSeq = null;
        const disabled = Boolean(clockBlockMatch[1]);
        const name = clockBlockMatch[2];
        if (/^master$/i.test(name) || voices.has(name) || fxs.has(name) || filters.has(name) || scalarNames.has(name) || seqs.has(name) || sourceDefinitions.has(name)) {
          throw new LanguageError([{ line: lineNumber, message: `CLOCK '${name}' is already defined or reserved` }]);
        }
        sourceKinds.set(name, 'clock');
        sourceDefinitions.set(name, { kind: 'clock', internalName: name, rateLabel: '*1', display: 'clock *1' });
        currentClock = { name, line: lineNumber, indentation, parent: 'Clock', rate: 1, rateLabel: '*1', jitter: 0, drift: 0, view: Boolean(clockBlockMatch[3]) };
        output[index] = `${name} = Clock.rate("*1")${clockBlockMatch[3] ? '.view()' : ''}${disabled ? '.disabled(true)' : ''};`;
        continue;
      }

      const registerMatch = trimmed.match(/^REGISTER\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*$/i);
      if (registerMatch) {
        if (indentation > 0) throw new LanguageError([{ line: lineNumber, message: 'REGISTER declarations are top-level only' }]);
        requireVoiceSound(currentVoice, diagnostics);
        requireFxModel(currentFx, diagnostics);
        requireSeqReady(currentSeq, diagnostics);
        requireRegisterReady(currentRegister, diagnostics);
        currentVoice = null; currentFx = null; currentFilter = null; currentMod = null; currentSeq = null; currentRegister = null;
        const name = registerMatch[1];
        if (voices.has(name) || fxs.has(name) || filters.has(name) || scalarNames.has(name) || seqs.has(name) || registers.has(name) || sourceDefinitions.has(name)) {
          throw new LanguageError([{ line: lineNumber, message: `REGISTER '${name}' conflicts with an existing object or variable` }]);
        }
        registers.add(name);
        sourceKinds.set(name, 'register');
        sourceDefinitions.set(name, { kind: 'register', size: 4, display: `REGISTER ${name}` });
        currentRegister = {
          name, line: lineNumber, indentation, modelId: null, size: 4,
          sourceName: null, readerMode: 'direct', readerAmount: 0, hasWrite: false,
        };
        output[index] = `__register(${JSON.stringify(name)});`;
        continue;
      }

      const seqMatch = trimmed.match(/^SEQ\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+with\s+(view))?\s*:\s*$/i);
      if (seqMatch) {
        if (indentation > 0) throw new LanguageError([{ line: lineNumber, message: 'SEQ declarations are top-level only' }]);
        requireVoiceSound(currentVoice, diagnostics);
        requireFxModel(currentFx, diagnostics);
        requireRegisterReady(currentRegister, diagnostics);
        currentRegister = null;
        currentVoice = null; currentFx = null; currentFilter = null; currentMod = null;
        const name = seqMatch[1];
        if (voices.has(name) || fxs.has(name) || filters.has(name) || scalarNames.has(name) || seqs.has(name) || registers.has(name)) {
          throw new LanguageError([{ line: lineNumber, message: `SEQ '${name}' conflicts with an existing object or variable` }]);
        }
        seqs.add(name);
        sourceKinds.set(name, 'seq');
        sourceDefinitions.set(name, { kind: 'seq', model: null, values: [], display: `SEQ ${name}` });
        currentSeq = { name, line: lineNumber, indentation, modelId: null, lifeVariant: 'conway', length: 8, change: 10, size: 8, density: 34, maxDensity: null, values: [], material: null };
        const viewDirective = seqMatch[2] ? `\n__seqview(${JSON.stringify(name)});` : '';
        output[index] = `__seq(${JSON.stringify(name)});${viewDirective}`;
        continue;
      }

      if (currentClock && indentation > currentClock.indentation) {
        const propertyMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/);
        if (!propertyMatch) throw new LanguageError([{ line: lineNumber, message: 'expected CLOCK property and value' }]);
        output[index] = compileClockProperty(currentClock, propertyMatch[1], propertyMatch[2], lineNumber, sourceDefinitions);
        continue;
      }

      if (currentRegister && indentation > currentRegister.indentation) {
        const propertyMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/);
        if (!propertyMatch) throw new LanguageError([{ line: lineNumber, message: 'expected REGISTER property and value' }]);
        output[index] = compileRegisterProperty(currentRegister, propertyMatch[1], propertyMatch[2], lineNumber, sourceDefinitions);
        continue;
      }

      if (currentSeq && indentation > currentSeq.indentation) {
        const propertyMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/);
        if (!propertyMatch) throw new LanguageError([{ line: lineNumber, message: 'expected SEQ property and value' }]);
        output[index] = compileSeqProperty(currentSeq, propertyMatch[1], propertyMatch[2], lineNumber, sourceDefinitions);
        continue;
      }

      const modMatch = trimmed.match(/^MOD\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+with\s+(view)(?:\s+(\d+(?:\.\d+)?)\s*([vx]))?)?\s*:\s*$/i);
      if (modMatch) {
        const name = modMatch[1];
        if (modMatch[2] && modMatch[3] !== undefined) {
          const viewAmount = Number(modMatch[3]);
          if (!Number.isFinite(viewAmount) || viewAmount <= 0) {
            throw new LanguageError([{ line: lineNumber, message: 'MOD WITH VIEW scale must be greater than 0' }]);
          }
        }
        const ownerObject = indentation > 0
          ? (currentVoice?.name ?? currentFx?.name ?? null)
          : null;
        if (indentation > 0 && !ownerObject) {
          throw new LanguageError([{ line: lineNumber, message: 'local MOD must be inside a VOICE or FX' }]);
        }
        if (!ownerObject) {
          requireVoiceSound(currentVoice, diagnostics);
          requireFxModel(currentFx, diagnostics);
          currentVoice = null;
          currentFx = null;
          if (voices.has(name) || fxs.has(name) || filters.has(name) || scalarNames.has(name) || seqs.has(name)) {
            throw new LanguageError([{ line: lineNumber, message: `MOD '${name}' conflicts with an existing object or variable` }]);
          }
        }
        const scopeKey = modSourceKey(ownerObject, name);
        if (modSources.has(scopeKey)) throw new LanguageError([{ line: lineNumber, message: `MOD '${name}' is already defined in this scope` }]);
        const internalName = ownerObject ? `__mod_${ownerObject}_${name}` : name;
        currentMod = { name, internalName, line: lineNumber, indentation, ownerVoice: ownerObject, modelId: 'swell' };
        modSources.set(scopeKey, { internalName, ownerVoice: ownerObject, modelId: 'swell' });
        const viewDirective = modMatch[2] ? `\n${internalName}.view();` : '';
        output[index] = `${internalName} = Swell();\n__modmeta(${JSON.stringify(internalName)},${JSON.stringify(name)},${JSON.stringify(ownerObject ?? '')});${viewDirective}`;
        continue;
      }

      if (currentMod && indentation > currentMod.indentation) {
        const propertyMatch = trimmed.match(/^(LIVE\s+)?([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/i);
        if (!propertyMatch) throw new LanguageError([{ line: lineNumber, message: 'expected MOD property and value' }]);
        const live = Boolean(propertyMatch[1]);
        const property = propertyMatch[2];
        const value = propertyMatch[3].trim();
        if (live) {
          const key = property.toLowerCase();
          if (key === 'rate' || key === 'length' || key === 'model') {
            throw new LanguageError([{ line: lineNumber, message: `LIVE is not available for MOD ${property.toUpperCase()}` }]);
          }
          if (!['spread', 'bias', 'steps', 'deja', 'diversity'].includes(key)) {
            throw new LanguageError([{ line: lineNumber, message: `LIVE is not available for MOD property '${property}'` }]);
          }
          const literal = value.match(/^(\d+(?:\.\d+)?)(?=\s|$)/);
          if (!literal) throw new LanguageError([{ line: lineNumber, message: 'LIVE MOD currently requires a literal 0..100 value' }]);
          const amount = Number(literal[1]);
          if (!Number.isFinite(amount) || amount < 0 || amount > 100) {
            throw new LanguageError([{ line: lineNumber, message: 'LIVE MOD currently requires a literal 0..100 value' }]);
          }
        }
        output[index] = compileModProperty(currentMod, property, value, lineNumber);
        const scopeKey = modSourceKey(currentMod.ownerVoice, currentMod.name);
        const source = modSources.get(scopeKey);
        if (source) source.modelId = currentMod.modelId;
        continue;
      }

      const filterMatch = trimmed.match(/^(_)?FILTER\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*$/i);
      if (filterMatch) {
        const disabled = Boolean(filterMatch[1]);
        const name = filterMatch[2];
        const embedded = indentation > 0 && currentVoice !== null;
        if (indentation > 0 && !embedded) throw new LanguageError([{ line: lineNumber, message: 'FILTER can be top-level or directly inside a VOICE' }]);

        if (embedded) {
          if (currentVoice!.embeddedFilter) throw new LanguageError([{ line: lineNumber, message: `VOICE '${currentVoice!.name}' already contains FILTER '${currentVoice!.embeddedFilter}'` }]);
          currentVoice!.embeddedFilter = name;
          voiceEmbeddedFilters.set(currentVoice!.name, name);
        } else {
          requireVoiceSound(currentVoice, diagnostics);
          requireFxModel(currentFx, diagnostics);
          currentVoice = null; currentFx = null; currentMod = null;
          if (filters.has(name) || voices.has(name) || fxs.has(name) || scalarNames.has(name) || seqs.has(name)) {
            throw new LanguageError([{ line: lineNumber, message: `FILTER '${name}' is already defined` }]);
          }
          filters.add(name);
        }

        const internalName = embedded ? `__filter_${currentVoice!.name}_${name}` : name;
        currentFilter = { name, internalName, line: lineNumber, indentation, ownerVoice: embedded ? currentVoice!.name : null, hasModel: false };
        output[index] = `${internalName} = Filter();\n${internalName}.owner(${JSON.stringify(currentFilter.ownerVoice ?? '')});\n${internalName}.displayName(${JSON.stringify(name)});${disabled ? `\n${internalName}.disabled(true);` : ''}`;
        continue;
      }

      const fxMatch = trimmed.match(/^(_)?FX\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+with\s+(view))?\s*:\s*$/i);
      if (fxMatch) {
        if (indentation > 0) throw new LanguageError([{ line: lineNumber, message: 'FX declarations are top-level only' }]);
        requireVoiceSound(currentVoice, diagnostics);
        requireFxModel(currentFx, diagnostics);
        currentVoice = null;
        currentMod = null;
        const disabled = Boolean(fxMatch[1]);
        const name = fxMatch[2];
        if (fxs.has(name) || voices.has(name) || filters.has(name) || scalarNames.has(name) || seqs.has(name)) {
          throw new LanguageError([{ line: lineNumber, message: `FX '${name}' is already defined` }]);
        }
        fxs.add(name);
        currentFx = { name, line: lineNumber, indentation, hasModel: false, modelId: null, pitchProperty: null };
        const viewDirective = fxMatch[3] ? `\n${name}.view();` : '';
        const disabledDirective = disabled ? `\n${name}.disabled(true);` : '';
        output[index] = `${name} = Mist();\n__fxmeta(${JSON.stringify(name)});${viewDirective}${disabledDirective}`;
        continue;
      }

      const voiceMatch = trimmed.match(/^(_)?VOICE\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+with\s+(view))?\s*:\s*$/i);
      if (voiceMatch) {
        requireVoiceSound(currentVoice, diagnostics);
        requireFxModel(currentFx, diagnostics);
        currentFx = null;
        const disabled = Boolean(voiceMatch[1]);
        const name = voiceMatch[2];
        if (voices.has(name) || fxs.has(name) || scalarNames.has(name) || seqs.has(name)) {
          throw new LanguageError([{ line: lineNumber, message: `VOICE '${name}' is already defined` }]);
        }
        voices.add(name);
        sourceKinds.set(name, 'voice');
        currentVoice = { name, line: lineNumber, indentation, hasSound: false, soundId: null, pitchProperty: null, embeddedFilter: null };
        const viewDirective = voiceMatch[3] ? `\n${name}.view();` : '';
        const disabledDirective = disabled ? `\n${name}.disabled(true);` : '';
        output[index] = `${name} = Voice();${viewDirective}${disabledDirective}`;
        continue;
      }

      if (/^_?CLOCK\b/i.test(trimmed)) {
        const localOwner = indentation > 0
          ? (currentFilter
              ? `filter:${currentFilter.internalName}`
              : currentVoice
                ? `voice:${currentVoice.name}`
                : currentFx
                  ? `fx:${currentFx.name}`
                  : currentDrumkit
                    ? `drumkit:${currentDrumkit.name}`
                    : null)
          : null;
        const parentScope = currentFilter?.ownerVoice ? `voice:${currentFilter.ownerVoice}` : null;
        if (localOwner) {
          if (/^_?CLOCK\s+SET\b/i.test(trimmed)) {
            throw new LanguageError([{ line: lineNumber, message: 'CLOCK SET is global; local scopes can declare only named clocks' }]);
          }
          const definitions = scopedDefinitions(localOwner, parentScope);
          const localDefs = localDefinitionMap(localOwner);
          const localKinds = localKindMap(localOwner);
          const localMatch = trimmed.match(/^(_)?CLOCK\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+RATE\s+([/*])\s*(\d+(?:\.\d+)?))?(?:\s+WITH\s+(.+))?$/i);
          if (!localMatch) throw new LanguageError([{ line: lineNumber, message: 'local CLOCK expects CLOCK <name> [RATE /n|*n] [WITH ...]' }]);
          const publicName = localMatch[2];
          if (localDefs.has(publicName)) throw new LanguageError([{ line: lineNumber, message: `CLOCK '${publicName}' is already defined in this scope` }]);
          const internalName = `__clock_${localOwner.replace(/[^A-Za-z0-9_]/g, '_')}_${publicName}`;
          const synthetic = `${localMatch[1] ?? ''}CLOCK ${internalName}${localMatch[3] ? ` RATE ${localMatch[3]}${localMatch[4]}` : ''}${localMatch[5] ? ` WITH ${localMatch[5]}` : ''}`;
          const namedClock = compileNamedClock(synthetic, lineNumber, definitions, new Set());
          if (!namedClock) throw new LanguageError([{ line: lineNumber, message: 'invalid local CLOCK declaration' }]);
          const definition = definitions.get(internalName);
          if (!definition || definition.kind !== 'clock') throw new LanguageError([{ line: lineNumber, message: 'failed to create local CLOCK' }]);
          localDefs.set(publicName, { ...definition, internalName });
          localKinds.set(publicName, 'clock');
          output[index] = namedClock.output;
          continue;
        }

        requireVoiceSound(currentVoice, diagnostics);
        requireFxModel(currentFx, diagnostics);
        requireSeqReady(currentSeq, diagnostics);
        requireClockReady(currentClock, diagnostics);
        currentVoice = null; currentFx = null; currentSeq = null; currentClock = null;
        const namedClock = compileNamedClock(
          trimmed,
          lineNumber,
          sourceDefinitions,
          new Set([...voices, ...fxs, ...filters, ...scalarNames, ...seqs]),
        );
        if (namedClock) sourceKinds.set(namedClock.name, 'clock');
        output[index] = namedClock ? namedClock.output : compileClock(trimmed, lineNumber);
        continue;
      }

      if (/^SET\b/i.test(trimmed)) {
        const setKit = trimmed.match(/^SET\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*KIT(?:\s+([A-Za-z_][A-Za-z0-9_]*))?\s*\[(.*)\]\s*$/i);
        if (setKit) {
          const setName = setKit[1];
          const local = currentDrumkit !== null && indentation > currentDrumkit.indentation;
          const scoped = local ? (localKitDefinitions.get(currentDrumkit!.name) ?? new Map<string, DrumKitDefinition>()) : null;
          if (local && scoped && !localKitDefinitions.has(currentDrumkit!.name)) localKitDefinitions.set(currentDrumkit!.name, scoped);
          if (!local && indentation > 0) throw new LanguageError([{ line: lineNumber, message: 'local KIT SET is currently supported inside DRUMKIT' }]);
          const baseName = setKit[2];
          const base = baseName ? (scoped?.get(baseName) ?? kitDefinitions.get(baseName.toLowerCase()) ?? kitDefinitions.get(baseName)) : { entries: new Map<string, DrumKitEntry>() };
          if (!base) throw new LanguageError([{ line: lineNumber, message: `unknown KIT '${baseName}'` }]);
          const defined = applyDrumKitEntries(base, setKit[3], lineNumber);
          if (local) scoped!.set(setName, defined); else kitDefinitions.set(setName, defined);
          output[index] = '';
          continue;
        }
        const localOwner = indentation > 0
          ? (currentFilter
              ? `filter:${currentFilter.internalName}`
              : currentVoice
                ? `voice:${currentVoice.name}`
                : currentFx
                  ? `fx:${currentFx.name}`
                  : currentDrumkit
                    ? `drumkit:${currentDrumkit.name}`
                    : null)
          : null;
        const parentScope = currentFilter?.ownerVoice ? `voice:${currentFilter.ownerVoice}` : null;
        if (localOwner) {
          const localDefs = localDefinitionMap(localOwner);
          const localKinds = localKindMap(localOwner);
          const nameMatch = trimmed.match(/^SET\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/i);
          if (!nameMatch) throw new LanguageError([{ line: lineNumber, message: 'SET expects a name, colon, and value' }]);
          const publicName = nameMatch[1];
          if (localDefs.has(publicName)) throw new LanguageError([{ line: lineNumber, message: `SET '${publicName}' is already defined in this scope` }]);
          const internalName = `__set_${localOwner.replace(/[^A-Za-z0-9_]/g, '_')}_${publicName}`;
          const tempKinds = scopedKinds(localOwner, parentScope);
          const tempDefs = scopedDefinitions(localOwner, parentScope);
          output[index] = compileSet(trimmed, lineNumber, tempKinds, tempDefs, new Set(), new Set(), internalName);
          const definition = tempDefs.get(publicName);
          const kind = tempKinds.get(publicName);
          if (definition && kind) {
            localDefs.set(publicName, definition);
            localKinds.set(publicName, kind);
          }
          continue;
        }

        requireVoiceSound(currentVoice, diagnostics);
        requireFxModel(currentFx, diagnostics);
        currentVoice = null;
        currentFx = null;
        output[index] = compileSet(
          trimmed,
          lineNumber,
          sourceKinds,
          sourceDefinitions,
          scalarNames,
          new Set([...voices, ...fxs, ...filters]),
        );
        continue;
      }

      const mainMatch = trimmed.match(/^MAIN\s+level\s+(.+)$/i);
      if (mainMatch) {
        requireVoiceSound(currentVoice, diagnostics);
        requireFxModel(currentFx, diagnostics);
        currentVoice = null;
        currentFx = null;
        currentMod = null;
        const level = numberValue(mainMatch[1].trim(), lineNumber, 'MAIN level');
        if (level < 0 || level > 100) throw new LanguageError([{ line: lineNumber, message: 'MAIN level expects 0..100' }]);
        output[index] = `Audio.level(${level});`;
        continue;
      }

      if (/^OUT\b/i.test(trimmed)) {
        const localSource = indentation > 0
          ? (currentFilter
              ? (currentFilter.ownerVoice ?? currentFilter.name)
              : currentVoice
                ? currentVoice.name
                : currentFx
                  ? currentFx.name
                  : currentDrumkit
                    ? currentDrumkit.name
                    : null)
          : null;
        if (indentation > 0 && !localSource) {
          throw new LanguageError([{ line: lineNumber, message: 'OUT can be local only inside an audio object' }]);
        }
        pendingOuts.push({ index, line: lineNumber, text: trimmed, localSource });
        output[index] = '';
        continue;
      }

      if (currentDrumkit && indentation > currentDrumkit.indentation) {
        const kitLine = trimmed.match(/^KIT\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*\[(.*)\])?\s*$/i);
        if (kitLine) {
          const local = localKitDefinitions.get(currentDrumkit.name);
          const base = local?.get(kitLine[1]) ?? kitDefinitions.get(kitLine[1].toLowerCase()) ?? kitDefinitions.get(kitLine[1]);
          if (!base) throw new LanguageError([{ line: lineNumber, message: `unknown KIT '${kitLine[1]}'` }]);
          currentDrumkit.kit = kitLine[2] === undefined ? cloneDrumKit(base) : applyDrumKitEntries(base, kitLine[2], lineNumber);
          output[index] = `__drumkitmeta(${JSON.stringify(currentDrumkit.name)},${JSON.stringify(kitLine[1])});`;
          continue;
        }
        if (!currentDrumkit.kit) throw new LanguageError([{ line: lineNumber, message: `DRUMKIT '${currentDrumkit.name}' requires KIT before instrument lines` }]);
        const split = splitEveryClause(trimmed);
        const soundPart = split.base.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+with\s+(.+))?$/i);
        if (!soundPart) throw new LanguageError([{ line: lineNumber, message: `invalid DRUMKIT instrument line '${trimmed}'` }]);
        const alias = soundPart[1];
        const entry = currentDrumkit.kit.entries.get(alias);
        if (!entry) throw new LanguageError([{ line: lineNumber, message: `unknown KIT alias '${alias}'` }]);
        const params = drumParameterDefaults(entry.source, soundPart[2] ?? '', lineNumber, entry.defaults);
        if (!split.every) {
          output[index] = `__drumslot(${JSON.stringify(currentDrumkit.name)},${JSON.stringify(alias)},${JSON.stringify(entry.source)},${JSON.stringify(serializeDrumParams(params))},0,"ms",100,false,false,"Clock");`;
          continue;
        }
        const timing = parseEverySpec(split.every, lineNumber, scopedDefinitions(`drumkit:${currentDrumkit.name}`));
        const prefix = timing.clockPrelude ? `${timing.clockPrelude} ` : '';
        output[index] = `${prefix}__drumslot(${JSON.stringify(currentDrumkit.name)},${JSON.stringify(alias)},${JSON.stringify(entry.source)},${JSON.stringify(serializeDrumParams(params))},${timing.amount},${JSON.stringify(timing.unit)},${timing.chance},${timing.drift},${timing.loose},${JSON.stringify(timing.clockSource)});`;
        continue;
      }

      if (currentFilter && indentation > currentFilter.indentation) {
        const statement = parseBlockPropertyStatement(trimmed, lineNumber, 'FILTER');
        if (statement.live) validateLiveFilterProperty(statement.property, lineNumber);
        output[index] = compileFilterProperty(currentFilter, statement.property, statement.value, lineNumber, scopedDefinitions(`filter:${currentFilter.internalName}`, currentFilter.ownerVoice ? `voice:${currentFilter.ownerVoice}` : null));
        continue;
      }

      if (indentation > 0 && currentFx) {
        const statement = parseBlockPropertyStatement(trimmed, lineNumber, 'FX');
        if (statement.live) validateLiveFxProperty(currentFx, statement.property, lineNumber);
        output[index] = compileFxProperty(currentFx, statement.property, statement.value, lineNumber, scopedDefinitions(`fx:${currentFx.name}`), modSources);
        continue;
      }

      if (indentation > 0 && currentVoice) {
        const statement = parseBlockPropertyStatement(trimmed, lineNumber, 'VOICE');
        if (statement.live) validateLiveVoiceProperty(currentVoice, statement.property, lineNumber);
        output[index] = compileVoiceProperty(currentVoice, statement.property, statement.value, lineNumber, scopedKinds(`voice:${currentVoice.name}`), scopedDefinitions(`voice:${currentVoice.name}`), modSources, statement.live);
        if (statement.property.toLowerCase() === 'sound') {
          currentVoice.hasSound = true;
          if (currentVoice.soundId) voiceSoundIds.set(currentVoice.name, currentVoice.soundId);
        }
        continue;
      }

      if (/^[A-Za-z_][A-Za-z0-9_]*\s*:/.test(trimmed)) {
        throw new LanguageError([{ line: lineNumber, message: 'only VOICE, FX, FILTER, MOD, SEQ, REGISTER, DRUMKIT and CLOCK blocks are supported' }]);
      }

      throw new LanguageError([{
        line: lineNumber,
        message: 'each top-level statement must begin with VOICE, FX, FILTER, MOD, SEQ, REGISTER, DRUMKIT, SET, CLOCK, MAIN, or OUT',
      }]);
    } catch (error) {
      if (error instanceof LanguageError) diagnostics.push(...error.diagnostics);
      else throw error;
    }
  }

  requireVoiceSound(currentVoice, diagnostics);
  requireFxModel(currentFx, diagnostics);
  requireFilterModel(currentFilter, diagnostics);
  requireSeqReady(currentSeq, diagnostics);
  requireRegisterReady(currentRegister, diagnostics);
  if (currentDrumkit && !currentDrumkit.kit) diagnostics.push({ line: currentDrumkit.line, message: `DRUMKIT '${currentDrumkit.name}' requires KIT` });

  const explicitRouteSources = new Set<string>();
  for (const pending of pendingOuts) {
    try {
      const compiled = compileOut(
        pending.text,
        pending.line,
        pending.localSource,
        voices,
        fxs,
        filters,
        drumkits,
        voiceEmbeddedFilters,
        voiceSoundIds,
      );
      output[pending.index] = compiled.code;
      for (const sourceName of compiled.sources) explicitRouteSources.add(sourceName);
    } catch (error) {
      if (error instanceof LanguageError) diagnostics.push(...error.diagnostics);
      else throw error;
    }
  }

  const implicitRoutes: string[] = [];
  const autoRoute = (name: string): void => {
    if (explicitRouteSources.has(name)) return;
    try {
      implicitRoutes.push(compileOut(`OUT ${name} TO MAIN`, 0, null, voices, fxs, filters, drumkits, voiceEmbeddedFilters, voiceSoundIds).code);
    } catch (error) {
      if (error instanceof LanguageError) diagnostics.push(...error.diagnostics);
      else throw error;
    }
  };
  for (const name of voices) autoRoute(name);
  for (const name of fxs) autoRoute(name);
  for (const name of filters) autoRoute(name);
  for (const name of drumkits) autoRoute(name);

  if (diagnostics.length > 0) throw new LanguageError(diagnostics);
  return [...output, ...implicitRoutes].join('\n');
}
