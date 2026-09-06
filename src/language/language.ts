import {
  MODE_INTERVALS,
  midiFromNote,
  midiFromRoot,
  midiToFrequency,
  setReferenceTuningHz,
} from './parser/pitch';
import { findScaleDefinition, type SupportedEdo } from './scales';

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
  tuningHz: number;
  directiveLine: number | null;
  directiveText: string | null;
};

const PROGRAM_CAPABILITIES = new Set<ProgramCapability>(['visual', 'midi', 'audioin', 'osc']);
export const DEFAULT_TUNING_HZ = 440;
export const MIN_TUNING_HZ = 400;
export const MAX_TUNING_HZ = 480;

export function parseProgramCapabilities(source: string): ProgramCapabilitySet {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let directiveLine: number | null = null;
  let directiveText: string | null = null;
  const capabilities = new Set<ProgramCapability>();
  let tuningHz = DEFAULT_TUNING_HZ;
  let tuningDeclared = false;
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
      const tuning = item.match(/^(\d+(?:\.\d+)?)hz$/i);
      if (tuning) {
        if (tuningDeclared) throw new LanguageError([{ line: directiveLine, message: 'USE can declare tuning only once' }]);
        const value = Number(tuning[1]);
        if (!Number.isFinite(value) || value < MIN_TUNING_HZ || value > MAX_TUNING_HZ) {
          throw new LanguageError([{ line: directiveLine, message: `USE tuning must be between ${MIN_TUNING_HZ}hz and ${MAX_TUNING_HZ}hz` }]);
        }
        tuningHz = value;
        tuningDeclared = true;
        continue;
      }
      if (!/^[a-z][a-z0-9_-]*$/i.test(item)) {
        throw new LanguageError([{ line: directiveLine, message: `invalid USE item '${item}'` }]);
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

  return { capabilities, tuningHz, directiveLine, directiveText };
}

type SourceKind = 'voice' | 'note' | 'freq' | 'time' | 'clock' | 'trigger' | 'scalar' | 'scale' | 'seq' | 'register' | 'envelope' | 'kit' | 'rhythm' | 'logic';

type SourceDefinition =
  | { kind: 'scalar'; internalName?: string }
  | { kind: 'time'; amount: number; unit: 'ms' | 'sec' | 'beat'; display: string; internalName?: string }
  | { kind: 'clock'; internalName: string; rateLabel: string; display: string }
  | { kind: 'freq'; values: number[]; display: string; internalName?: string }
  | { kind: 'note'; values: number[]; display: string; favor: SequenceFavorEntry[]; internalName?: string }
  | { kind: 'scale'; values: number[]; display: string; internalName?: string }
  | { kind: 'seq'; model: 'turing' | 'life' | 'constellation' | 'snake' | null; values: number[]; display: string; internalName?: string }
  | { kind: 'register'; size: number; display: string; internalName?: string }
  | { kind: 'envelope'; spec: EnvelopeSpec; display: string; internalName?: string }
  | { kind: 'kit'; kit: DrumKitDefinition; display: string; internalName?: string }
  | { kind: 'rhythm'; spec: EverySpec; display: string; internalName?: string }
  | { kind: 'logic'; display: string; internalName?: string };


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
type DrumkitState = { name: string; line: number; indentation: number; kit: DrumKitDefinition | null; viewSteps: number };

type LogicOperator = 'and' | 'or' | 'xor' | 'nand' | 'nor' | 'divider' | 'counter' | 'flipflop';
type LogicState = { name: string; line: number; indentation: number; view: boolean; nodes: Set<string> };

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
  vcaTargets: Set<string>;
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
  modelId: 'turing' | 'life' | 'constellation' | 'snake' | null;
  lifeVariant: 'conway' | 'highlife' | 'seeds' | 'day-night' | 'morley';
  length: number;
  change: number;
  size: 8 | 16;
  density: number;
  maxDensity: number | null;
  values: number[];
  weights: number[];
  material: 'notes' | 'scale' | 'freqs' | null;
  stepwise: number;
  leap: number;
  repeat: number;
  memory: number;
  octaves: Array<{ octave: number; weight: number }>;
  phrase: number;
  mutation: number;
  snakeWidth: number;
  snakeHeight: number;
  snakeMovement: 'snake' | 'rows' | 'columns' | 'spiral' | 'diagonal' | 'bounce' | 'random' | 'walk';
  matrixExplicit: boolean;
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
  modelId: 'swell' | 'dices' | 'composite';
};

type ModSourceDefinition = {
  internalName: string;
  ownerVoice: string | null;
  modelId: 'swell' | 'dices' | 'composite';
  outputs: Set<string>;
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


const SQUARE_PARAMETERS: Record<string, SoundParameterSchema> = {
  width: { min: 0, max: 100, modulatable: false },
};

const SOUND_ENGINE_REGISTRY: Record<string, SoundEngineSchema> = {
  'sine': { parameters: {}, options: new Set() },
  'triangle': { parameters: {}, options: new Set() },
  'sawtooth': { parameters: {}, options: new Set() },
  'ramp': { parameters: {}, options: new Set() },
  'square': { parameters: SQUARE_PARAMETERS, options: new Set() },
  'composite': { parameters: {}, options: new Set() },

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


const EDO_NOTE = /^n(\d+)@(-?\d+)$/i;
function parseEdoModifier(
  modifiers: string[],
  line: number,
  property: string,
): { edo: SupportedEdo; modifiers: string[]; explicit: boolean } {
  let edo: SupportedEdo = 12;
  let explicit = false;
  const remaining: string[] = [];
  for (const modifier of modifiers) {
    const match = modifier.match(/^edo\s*(12|15|19|22|24)$/i);
    if (!match) {
      remaining.push(modifier);
      continue;
    }
    if (explicit) throw new LanguageError([{ line, message: `${property} accepts only one EDO modifier` }]);
    edo = Number(match[1]) as SupportedEdo;
    explicit = true;
  }
  return { edo, modifiers: remaining, explicit };
}

function edoNoteFrequency(token: string, edo: SupportedEdo, line: number, property: string): number {
  const match = token.match(EDO_NOTE);
  if (!match) throw new LanguageError([{ line, message: `invalid ${property} EDO note '${token}'; use n<step>@<octave>` }]);
  const noteNumber = Number(match[1]);
  const octave = Number(match[2]);
  if (!Number.isInteger(noteNumber) || noteNumber < 1 || noteNumber > edo) {
    throw new LanguageError([{ line, message: `${property} ${edo}-EDO note expects n1..n${edo}` }]);
  }
  const cMidi = midiFromNote(`C${octave}`);
  if (cMidi === null) throw new LanguageError([{ line, message: `invalid ${property} octave '${octave}'` }]);
  return midiToFrequency(cMidi) * 2 ** ((noteNumber - 1) / edo);
}

function scaleValues(
  root: string,
  modeRaw: string,
  rangeStart: string | null,
  rangeEnd: string | null,
  line: number,
): { values: number[]; display: string; edo: SupportedEdo } {
  const scale = findScaleDefinition(modeRaw);
  if (!scale) throw new LanguageError([{ line, message: `unknown scale '${modeRaw}'` }]);

  if (rangeStart === null || rangeEnd === null) {
    const rootMidi = midiFromRoot(root);
    if (rootMidi === null) throw new LanguageError([{ line, message: `invalid scale root '${root}'` }]);
    const rootHz = midiToFrequency(rootMidi);
    return {
      values: scale.degrees.map((degree) => rootHz * 2 ** (degree / scale.edo)),
      display: `${root} ${scale.id}`,
      edo: scale.edo,
    };
  }

  const numericStart = EDO_NOTE.test(rangeStart);
  const numericEnd = EDO_NOTE.test(rangeEnd);
  if (numericStart !== numericEnd) {
    throw new LanguageError([{ line, message: 'scale range cannot mix note names with n<degree>@<octave> notation' }]);
  }

  if (numericStart && numericEnd) {
    const start = rangeStart.match(EDO_NOTE)!;
    const end = rangeEnd.match(EDO_NOTE)!;
    const startDegree = Number(start[1]);
    const startOctave = Number(start[2]);
    const endDegree = Number(end[1]);
    const endOctave = Number(end[2]);
    if (startDegree < 1 || startDegree > scale.degrees.length || endDegree < 1 || endDegree > scale.degrees.length) {
      throw new LanguageError([{ line, message: `scale '${scale.id}' range expects n1..n${scale.degrees.length}` }]);
    }
    const startOrdinal = startOctave * scale.degrees.length + (startDegree - 1);
    const endOrdinal = endOctave * scale.degrees.length + (endDegree - 1);
    const direction = startOrdinal <= endOrdinal ? 1 : -1;
    const values: number[] = [];
    for (let ordinal = startOrdinal; direction > 0 ? ordinal <= endOrdinal : ordinal >= endOrdinal; ordinal += direction) {
      const octave = Math.floor(ordinal / scale.degrees.length);
      const degreeIndex = ((ordinal % scale.degrees.length) + scale.degrees.length) % scale.degrees.length;
      const rootMidi = midiFromRoot(root, octave);
      if (rootMidi === null) throw new LanguageError([{ line, message: `invalid scale root '${root}'` }]);
      values.push(midiToFrequency(rootMidi) * 2 ** (scale.degrees[degreeIndex] / scale.edo));
    }
    return { values, display: `${root} ${scale.id} ${rangeStart}..${rangeEnd}`, edo: scale.edo };
  }

  if (scale.edo !== 12) {
    throw new LanguageError([{
      line,
      message: `${scale.edo}-EDO scale '${scale.id}' requires degree ranges such as n1@3 n${scale.degrees.length}@4`,
    }]);
  }

  const rootClass = midiFromRoot(root, 0);
  if (rootClass === null) throw new LanguageError([{ line, message: `invalid scale root '${root}'` }]);
  const pitchClass = ((rootClass % 12) + 12) % 12;
  const allowed = new Set(scale.degrees.map((degree) => (pitchClass + degree) % 12));
  const startMidi = midiFromNote(rangeStart);
  const endMidi = midiFromNote(rangeEnd);
  if (startMidi === null) throw new LanguageError([{ line, message: `invalid scale range note '${rangeStart}'` }]);
  if (endMidi === null) throw new LanguageError([{ line, message: `invalid scale range note '${rangeEnd}'` }]);

  const direction = startMidi <= endMidi ? 1 : -1;
  const values: number[] = [];
  for (let midi = startMidi; direction > 0 ? midi <= endMidi : midi >= endMidi; midi += direction) {
    if (allowed.has(((midi % 12) + 12) % 12)) values.push(midiToFrequency(midi));
  }
  if (values.length === 0) throw new LanguageError([{ line, message: 'scale range contains no notes from the selected scale' }]);
  return { values, display: `${root} ${scale.id} ${rangeStart}..${rangeEnd}`, edo: scale.edo };
}

function parseScaleSpec(
  value: string,
  line: number,
  allowSelection: boolean,
): { values: number[]; display: string; mode: SelectionMode; amount: number; favor: SequenceFavorEntry[]; view: boolean; edo: SupportedEdo } | null {
  const head = value.match(/^([A-Ga-g][#b]?)\s+([A-Za-z_][A-Za-z0-9_-]*)(?:\s+with\s+(.+))?$/i);
  if (!head) return null;
  if (!findScaleDefinition(head[2])) return null;

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
    const range = modifier.match(/^range\s+([A-Ga-g][#b]?-?\d+|n\d+@-?\d+)\s+([A-Ga-g][#b]?-?\d+|n\d+@-?\d+)$/i);
    if (range) {
      if (rangeStart !== null) throw new LanguageError([{ line, message: 'scale accepts only one range modifier' }]);
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
        if (selectionSeen) throw new LanguageError([{ line, message: 'scale accepts only one sequencing modifier' }]);
        mode = selection.mode;
        amount = selection.amount;
        selectionSeen = true;
      }
      if (selection.favor.length > 0) favor = selection.favor;
      continue;
    }
  }

  validateFavorForMode(favor, mode, line, 'scale');
  const resolved = scaleValues(head[1], head[2], rangeStart, rangeEnd, line);
  return { ...resolved, mode, amount, favor, view };
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
  const notePattern = '([A-Ga-g][#b]?-?\\d+|n\\d+@-?\\d+)';
  const weighted = token.match(new RegExp(`^${notePattern}!(\\d+(?:\\.\\d+)?)$`, 'i'));
  if (weighted) {
    const amount = numberValue(weighted[2], line, 'note weight');
    if (amount < 0 || amount > 100) {
      throw new LanguageError([{ line, message: 'note weights must be between 0 and 100' }]);
    }
    return { note: weighted[1], favor: { target: weighted[1], operator: 'weight', amount } };
  }

  const retrig = token.match(new RegExp(`^${notePattern}\\*\\*(\\d+)$`, 'i'));
  if (retrig) {
    const amount = numberValue(retrig[2], line, 'retrig');
    if (!Number.isInteger(amount) || amount < 2) {
      throw new LanguageError([{ line, message: 'retrig count must be an integer >= 2' }]);
    }
    return { note: retrig[1], favor: { target: retrig[1], operator: 'retrig', amount } };
  }

  const repeated = token.match(new RegExp(`^${notePattern}\\*(\\d+)$`, 'i'));
  if (repeated) {
    const amount = numberValue(repeated[2], line, 'repeat');
    if (!Number.isInteger(amount) || amount < 2) {
      throw new LanguageError([{ line, message: 'repeat count must be an integer >= 2' }]);
    }
    return { note: repeated[1], favor: { target: repeated[1], operator: 'repeat', amount } };
  }

  return { note: token, favor: null };
}


function parseInlineNoteMaterial(
  base: string,
  modifiers: string[],
  line: number,
  property: string,
): {
  frequencies: number[];
  favor: SequenceFavorEntry[];
  modifiers: string[];
  edo: SupportedEdo;
  numeric: boolean;
} {
  const edoSpec = parseEdoModifier(modifiers, line, property);
  const tokens = parseList(base, line, property).map((token) => parseNoteSequenceToken(token, line));
  if (tokens.length === 0) throw new LanguageError([{ line, message: `${property} requires at least one note` }]);

  const numericFlags = tokens.map((token) => EDO_NOTE.test(token.note));
  const numeric = numericFlags.every(Boolean);
  const named = numericFlags.every((flag) => !flag);
  if (!numeric && !named) {
    throw new LanguageError([{ line, message: `${property} cannot mix named notes with n<step>@<octave> notation` }]);
  }
  if (edoSpec.edo !== 12 && !numeric) {
    throw new LanguageError([{ line, message: `${property} with edo${edoSpec.edo} requires n1@<octave>..n${edoSpec.edo}@<octave> notation` }]);
  }

  const frequencies = tokens.map((token) => {
    if (numeric) return edoNoteFrequency(token.note, edoSpec.edo, line, property);
    const midi = midiFromNote(token.note);
    if (midi === null) throw new LanguageError([{ line, message: `invalid note '${token.note}'` }]);
    return midiToFrequency(midi);
  });
  return {
    frequencies,
    favor: tokens.flatMap((token) => token.favor ? [token.favor] : []),
    modifiers: edoSpec.modifiers,
    edo: edoSpec.edo,
    numeric,
  };
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
  if (owner.pitchProperty) {
    throw new LanguageError([{
      line,
      message: `${label} '${owner.name}' already declares PITCH; PITCH can be declared only once per object`,
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

function compileCompositeEdgeDirective(ownerName: string, relation: string, value: string, line: number): string {
  if (!['fm', 'pm', 'am', 'ring', 'sync'].includes(relation)) {
    throw new LanguageError([{ line, message: `unknown composite relation '${relation}'` }]);
  }
  const edge = value.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+to\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+with\s+(.+))?$/i);
  if (!edge) throw new LanguageError([{ line, message: `${relation} expects <source> to <target> [with parameter value, ...]` }]);
  const params: Record<string, number | boolean> = {};
  const allowed: Record<string, Set<string>> = {
    fm: new Set(['depth', 'feedback', 'invert']),
    pm: new Set(['depth', 'feedback', 'phase', 'invert']),
    am: new Set(['depth', 'bias', 'mix', 'invert']),
    ring: new Set(['depth', 'mix', 'drive', 'invert']),
    sync: new Set(['phase', 'invert']),
  };
  for (const item of (edge[3] ?? '').split(',').map((part) => part.trim()).filter(Boolean)) {
    if (/^invert$/i.test(item)) {
      if (!allowed[relation].has('invert')) throw new LanguageError([{ line, message: `${relation} does not support invert` }]);
      params.invert = true;
      continue;
    }
    const parsed = item.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s+(-?\d+(?:\.\d+)?)$/);
    if (!parsed) throw new LanguageError([{ line, message: `invalid ${relation} parameter '${item}'` }]);
    const name = parsed[1].toLowerCase();
    const number = Number(parsed[2]);
    if (!allowed[relation].has(name)) throw new LanguageError([{ line, message: `${name} is not available for ${relation}` }]);
    if (number < 0 || number > 100) throw new LanguageError([{ line, message: `${relation} ${name} expects 0..100` }]);
    params[name] = number;
  }
  if ((relation === 'fm' || relation === 'pm' || relation === 'am' || relation === 'ring') && params.depth === undefined) params.depth = 100;
  return `__compositeedge(${JSON.stringify(ownerName)},${JSON.stringify(relation)},${JSON.stringify(edge[1])},${JSON.stringify(edge[2])},${JSON.stringify(JSON.stringify(params))});`;
}


function compileCompositeTuneDirective(
  ownerName: string,
  value: string,
  line: number,
  sourceDefinitions: Map<string, SourceDefinition>,
): string {
  const target = value.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/i);
  if (!target) throw new LanguageError([{ line, message: 'tune expects <node> pitch <PitchExpression> or <node> with octave/detune/ratio modifiers' }]);
  const node = target[1];
  const body = target[2].trim();

  const relative = body.match(/^with\s+(.+)$/i);
  if (relative) {
    let octave = 0;
    let detune = 0;
    let ratio = 1;
    let seen = 0;
    for (const item of relative[1].split(',').map((part) => part.trim()).filter(Boolean)) {
      const parsed = item.match(/^(octave|detune|ratio)\s+(-?\d+(?:\.\d+)?)$/i);
      if (!parsed) throw new LanguageError([{ line, message: `invalid tune modifier '${item}'; use octave <integer>, detune <cents>, or ratio <number>` }]);
      const key = parsed[1].toLowerCase();
      const amount = Number(parsed[2]);
      if (key === 'octave') {
        if (!Number.isInteger(amount) || amount < -8 || amount > 8) throw new LanguageError([{ line, message: 'tune octave expects an integer from -8 to 8' }]);
        octave = amount;
      } else if (key === 'detune') {
        if (amount < -1200 || amount > 1200) throw new LanguageError([{ line, message: 'tune detune expects -1200..1200 cents' }]);
        detune = amount;
      } else {
        if (!Number.isFinite(amount) || amount <= 0 || amount > 32) throw new LanguageError([{ line, message: 'tune ratio expects a value greater than 0 and at most 32' }]);
        ratio = amount;
      }
      seen += 1;
    }
    if (seen === 0) throw new LanguageError([{ line, message: 'tune with requires octave, detune, or ratio' }]);
    const payload = { mode: 'relative', octave, detune, ratio };
    return `__compositetune(${JSON.stringify(ownerName)},${JSON.stringify(node)},${JSON.stringify(JSON.stringify(payload))});`;
  }

  const absolute = body.match(/^pitch\s+(.+)$/i);
  if (!absolute) throw new LanguageError([{ line, message: 'tune expects either PITCH ... or WITH octave/detune/ratio; the two modes cannot be combined' }]);
  const split = splitEveryClause(absolute[1].trim());
  const pitchText = split.base.trim();
  const explicit = pitchText.match(/^(notes|freqs|scale)\s+(.+)$/i);
  if (!explicit) {
    throw new LanguageError([{ line, message: 'tune <node> pitch expects NOTES [...], FREQS [...], or SCALE ...' }]);
  }

  const kind = explicit[1].toLowerCase();
  let values: number[] = [];
  let selectionMode: SelectionMode = 'order';
  let selectionAmount = 0;
  let favor: SequenceFavorEntry[] = [];

  if (kind === 'scale') {
    const direct = splitWith(explicit[2].trim());
    const source = IDENTIFIER.test(direct.base) ? sourceDefinitions.get(direct.base) : undefined;
    if (source) {
      if (source.kind !== 'scale') throw new LanguageError([{ line, message: `source '${direct.base}' is ${source.kind}, expected SCALE source` }]);
      values = source.values;
      const selection = parseSelectionMode(direct.modifiers, line, 'tune scale');
      selectionMode = selection.mode;
      selectionAmount = selection.amount;
      favor = selection.favor;
    } else {
      const parsed = parseScaleSpec(explicit[2].trim(), line, true);
      if (!parsed) throw new LanguageError([{ line, message: 'tune pitch scale expects root and mode, optionally WITH RANGE and a selection modifier' }]);
      values = parsed.values;
      selectionMode = parsed.mode;
      selectionAmount = parsed.amount;
      favor = parsed.favor;
    }
  } else {
    const direct = splitWith(explicit[2].trim());
    const source = IDENTIFIER.test(direct.base) ? sourceDefinitions.get(direct.base) : undefined;
    if (kind === 'notes') {
      let inlineFavor: SequenceFavorEntry[] = [];
      let noteModifiers: string[];
      if (source) {
        if (source.kind !== 'note' && source.kind !== 'scale') throw new LanguageError([{ line, message: `source '${direct.base}' is ${source.kind}, expected NOTES-compatible source` }]);
        const edoSpec = parseEdoModifier(direct.modifiers, line, 'tune notes');
        if (edoSpec.explicit) throw new LanguageError([{ line, message: 'EDO modifiers apply only to inline tune PITCH NOTES material' }]);
        noteModifiers = edoSpec.modifiers;
        values = source.values;
        if (source.kind === 'note') inlineFavor = source.favor;
      } else {
        const parsedNotes = parseInlineNoteMaterial(direct.base, direct.modifiers, line, 'tune notes');
        values = parsedNotes.frequencies;
        inlineFavor = parsedNotes.favor;
        noteModifiers = parsedNotes.modifiers;
      }
      const selection = parseSelectionMode(noteModifiers, line, 'tune notes');
      selectionMode = selection.mode;
      selectionAmount = selection.amount;
      favor = mergeFavor(inlineFavor, selection.favor);
      validateFavorForMode(favor, selectionMode, line, 'tune notes');
    } else {
      if (source) {
        if (source.kind !== 'freq') throw new LanguageError([{ line, message: `source '${direct.base}' is ${source.kind}, expected FREQS source` }]);
        values = source.values;
      } else {
        values = parseList(direct.base, line, 'tune freqs').map((item) => numberValue(item, line, 'tune freq'));
      }
      if (values.some((item) => item <= 0)) throw new LanguageError([{ line, message: 'tune frequencies must be greater than 0' }]);
      const selection = parseSelectionMode(direct.modifiers, line, 'tune freqs');
      selectionMode = selection.mode;
      selectionAmount = selection.amount;
      favor = selection.favor;
    }
    const effectiveModifiers = kind === 'notes'
      ? parseEdoModifier(direct.modifiers, line, 'tune notes').modifiers
      : direct.modifiers;
    if (values.length === 1 && effectiveModifiers.length > 0) throw new LanguageError([{ line, message: 'tune pitch selection modifiers require more than one value' }]);
  }

  if (values.length === 0) throw new LanguageError([{ line, message: 'tune pitch requires at least one pitch value' }]);
  const timing = split.every ? parseEverySpec(split.every, line, sourceDefinitions) : null;
  const payload = {
    mode: 'absolute', values, selectionMode, selectionAmount, favor,
    timing: timing ? { amount: timing.amount, unit: timing.unit, chance: timing.chance, drift: timing.drift, loose: timing.loose, clockSource: timing.clockSource } : null,
  };
  const prefix = timing?.clockPrelude ? `${timing.clockPrelude} ` : '';
  return `${prefix}__compositetune(${JSON.stringify(ownerName)},${JSON.stringify(node)},${JSON.stringify(JSON.stringify(payload))});`;
}

function compileCompositeOutputDirective(ownerName: string, value: string, line: number): string {
  const items = value.split(',').map((item) => item.trim()).filter(Boolean);
  if (items.length === 0) throw new LanguageError([{ line, message: 'output expects one or more node names separated by commas' }]);
  const outputs = items.map((item) => {
    const parsed = item.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+at\s+(-?\d+(?:\.\d+)?))?$/i);
    if (!parsed) throw new LanguageError([{ line, message: `invalid output '${item}'; use <node> [at 0..100]` }]);
    const level = parsed[2] === undefined ? 100 : Number(parsed[2]);
    if (level < 0 || level > 100) throw new LanguageError([{ line, message: `output '${parsed[1]}' level expects 0..100` }]);
    return { name: parsed[1], level };
  });
  if (new Set(outputs.map((item) => item.name)).size !== outputs.length) throw new LanguageError([{ line, message: 'output contains duplicate node names' }]);
  return `__compositeoutput(${JSON.stringify(ownerName)},${JSON.stringify(JSON.stringify(outputs))});`;
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
  const compositePitchMarker = key === 'pitch' && voice.soundId === 'composite'
    ? `__compositepitch(${JSON.stringify(voice.name)}); `
    : '';
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
      return `${compositePitchMarker}${voice.name}.freq(440); __registerpitch(${JSON.stringify(voice.name)},${JSON.stringify(registerEndpoint[1])},${stage});`;
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

  if (key === 'vca') {
    let target = 'out';
    let envelopeText = value;
    const targetMatch = value.match(/^(.*)\s+to\s+([A-Za-z_][A-Za-z0-9_]*)$/i);
    if (targetMatch) {
      envelopeText = targetMatch[1].trim();
      target = targetMatch[2];
    }
    const envelope = envelopeFromValue(envelopeText, line, sourceDefinitions);
    if (!envelope) throw new LanguageError([{ line, message: 'vca expects ENVELOPE [...] or an ENVELOPE SET value, optionally followed by TO <output>' }]);
    if (envelope.range[0] < 0 || envelope.range[1] > 100) throw new LanguageError([{ line, message: 'VCA ENVELOPE range must stay within 0..100' }]);
    if (voice.vcaTargets.has(target)) throw new LanguageError([{ line, message: `VOICE '${voice.name}' already declares a VCA for output '${target}'` }]);
    voice.vcaTargets.add(target);
    return `__voicevca(${JSON.stringify(voice.name)},${JSON.stringify(target)},${envelopeLiteral(envelope)},${line});`;
  }

  if (key === 'tune') {
    if (voice.soundId !== 'composite') throw new LanguageError([{ line, message: 'tune is available only for sound composite' }]);
    return compileCompositeTuneDirective(voice.name, value, line, sourceDefinitions);
  }

  if (key === 'mix') {
    if (voice.soundId !== 'composite') throw new LanguageError([{ line, message: 'mix is available only for sound composite' }]);
    const match = value.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\[(.*)\]$/);
    if (!match) throw new LanguageError([{ line, message: 'mix expects <name> [ <source> at <level>; ... ]' }]);
    const mixName = match[1];
    const entries = match[2].split(';').map((item) => item.trim()).filter(Boolean);
    if (entries.length === 0) throw new LanguageError([{ line, message: `mix '${mixName}' requires at least one input` }]);
    const inputs = entries.map((entry) => {
      const input = entry.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+at\s+(-?\d+(?:\.\d+)?))?$/i);
      if (!input) {
        if (/\s+with\s+/i.test(entry)) throw new LanguageError([{ line, message: `mix input '${entry}' no longer accepts tuning modifiers; use tune <node> with octave/detune/ratio` }]);
        throw new LanguageError([{ line, message: `invalid mix input '${entry}'` }]);
      }
      const level = input[2] === undefined ? 100 : Number(input[2]);
      if (level < 0 || level > 100) throw new LanguageError([{ line, message: `mix '${mixName}' input level expects 0..100` }]);
      return { source: input[1], level, octave: 0, detune: 0 };
    });
    return `__compositemix(${JSON.stringify(voice.name)},${JSON.stringify(mixName)},${JSON.stringify(JSON.stringify(inputs))});`;
  }

  if (key === 'fm' || key === 'pm' || key === 'am' || key === 'ring' || key === 'sync') {
    if (voice.soundId !== 'composite') throw new LanguageError([{ line, message: `${key} is available only for sound composite` }]);
    return compileCompositeEdgeDirective(voice.name, key, value, line);
  }

  if (key === 'output') {
    if (voice.soundId !== 'composite') throw new LanguageError([{ line, message: 'output is available only for sound composite' }]);
    return compileCompositeOutputDirective(voice.name, value, line);
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
          return `${compositePitchMarker}${voice.name}.freq(${initial}); __lifereader(${JSON.stringify(voice.name)},${JSON.stringify(sourceName)},${JSON.stringify(mode)},${amount},${view ? 'true' : 'false'});${every}`;
        }
        if (definition.model === 'constellation') {
          if (direct.modifiers.length > 0) throw new LanguageError([{ line, message: 'SEQ constellation controls its own pitch selection and does not accept reader modifiers' }]);
          const every = split.every ? ` ${everyDirective(voice.name, parseEverySpec(split.every, line, sourceDefinitions))}` : '';
          return `${compositePitchMarker}${voice.name}.freq(${initial}); __constellationreader(${JSON.stringify(voice.name)},${JSON.stringify(sourceName)});${every}`;
        }
        if (definition.model === 'snake') {
          if (direct.modifiers.length > 0) throw new LanguageError([{ line, message: 'SEQ snake controls its own matrix traversal and does not accept reader modifiers' }]);
          const every = split.every ? ` ${everyDirective(voice.name, parseEverySpec(split.every, line, sourceDefinitions))}` : '';
          return `${compositePitchMarker}${voice.name}.freq(${initial}); __snakereader(${JSON.stringify(voice.name)},${JSON.stringify(sourceName)});${every}`;
        }
        if (direct.modifiers.length > 0) {
          throw new LanguageError([{ line, message: 'SEQ turing controls its own generation; PITCH using a Turing SEQ does not accept selection modifiers' }]);
        }
        const every = split.every ? ` ${everyDirective(voice.name, parseEverySpec(split.every, line, sourceDefinitions))}` : '';
        return `${compositePitchMarker}${voice.name}.freq(${initial}); __seqvoice(${JSON.stringify(voice.name)},${JSON.stringify(sourceName)});${every}`;
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
      return `${compositePitchMarker}${voice.name}.freq(${values[0]});${sequence}${every}${piano}`;
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
      if (voice.hasSound) throw new LanguageError([{ line, message: `VOICE '${voice.name}' can declare SOUND only once` }]);
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
      const lpg = soundId.startsWith('macro.') ? `\n${voice.name}.lpg(${seen.has('lpg')});` : '';
      return `${voice.name}.model(${JSON.stringify(soundId)});${lpg}`;
    }

    case 'note': {
      claimPitchProperty(voice, 'note', line, 'VOICE');
      const split = splitEveryClause(value);
      const { base, modifiers } = splitWith(split.base);
      const noteView = live || modifiers.some((modifier) => /^view$/i.test(modifier));
      const directSource = IDENTIFIER.test(base) ? sourceDefinitions.get(base) : undefined;
      let frequencies: number[];
      let inlineFavor: SequenceFavorEntry[] = [];
      let selectionModifiers: string[];
      if (directSource) {
        if (directSource.kind !== 'note' && directSource.kind !== 'scale') {
          throw new LanguageError([{ line, message: `source '${base}' is ${directSource.kind}, expected note or scale source for note` }]);
        }
        const edoSpec = parseEdoModifier(modifiers.filter((modifier) => !/^view$/i.test(modifier)), line, 'note');
        if (edoSpec.explicit) throw new LanguageError([{ line, message: 'EDO modifiers apply only to inline PITCH NOTES material' }]);
        selectionModifiers = edoSpec.modifiers;
        frequencies = directSource.values;
        if (directSource.kind === 'note') inlineFavor = directSource.favor;
      } else {
        const parsedNotes = parseInlineNoteMaterial(
          base,
          modifiers.filter((modifier) => !/^view$/i.test(modifier)),
          line,
          'note',
        );
        frequencies = parsedNotes.frequencies;
        inlineFavor = parsedNotes.favor;
        selectionModifiers = parsedNotes.modifiers;
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
      return `${compositePitchMarker}${voice.name}.freq(${frequencies[0]});${sequence}${every}${piano}`;
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
      return `${compositePitchMarker}${voice.name}.freq(${values[0]});${sequence}${every}`;
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
        return `${compositePitchMarker}${sourceSequenceCode(voice.name, directSource.values, selection.mode, selection.amount, selection.favor, false, line)}${every}`;
      }
      const parsed = parseScaleSpec(split.base, line, true);
      if (!parsed) {
        throw new LanguageError([{
          line,
          message: 'scale expects root and mode, optionally followed by with range <note> <note> and one sequencing modifier',
        }]);
      }
      const every = split.every ? ` ${everyDirective(voice.name, parseEverySpec(split.every, line, sourceDefinitions))}` : '';
      return `${compositePitchMarker}${sourceSequenceCode(voice.name, parsed.values, parsed.mode, parsed.amount, parsed.favor, parsed.view, line)}${every}`;
    }

    case 'every': {
      const timing = parseEverySpec(value, line, sourceDefinitions);
      const prefix = timing.clockPrelude ? `${timing.clockPrelude} ` : '';
      return `${prefix}__objectevery(${JSON.stringify(voice.name)},${timing.amount},${JSON.stringify(timing.unit)},${timing.chance},${timing.drift},${timing.loose},${JSON.stringify(timing.clockSource)});`;
    }

    case 'pattern':
      return objectPatternDirective(voice.name, value, line, sourceDefinitions);

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
  const logic = value.match(/^(.*?)\s+logic\s+([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)(.*)$/i);
  if (logic) {
    const tail = logic[4].trim();
    const modifiers = tail ? ` ON ${tail.replace(/^,\s*/, '').trim()}` : '';
    return { base: logic[1].trim(), every: `LOGIC ${logic[2]}.${logic[3]}${modifiers}` };
  }

  const rhythm = value.match(/^(.*?)\s+rhythm\s+([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)(.*)$/i);
  if (rhythm) {
    const tail = rhythm[3].trim();
    let modifiers = '';
    if (tail) {
      const normalized = tail.replace(/^,\s*/, '').trim();
      if (!normalized) throw new LanguageError([{ line: 1, message: 'RHYTHM has an empty modifier list' }]);
      const parts = normalized.split(',').map((item) => item.trim()).filter(Boolean);
      // For the common single-modifier form, allow `RHYTHM groove CHANCE 80`
      // without requiring a comma. Multiple modifiers remain comma-separated.
      modifiers = ` ON ${parts.join(', ')}`;
    }
    return { base: rhythm[1].trim(), every: `RHYTHM ${rhythm[2]}${modifiers}` };
  }

  const every = value.match(/^(.*?)(?:\s+mode\s+(forward|reverse|pendulum|walk|random))?\s+every\s+(.+)$/i);
  if (every) {
    const mode = every[2]?.toLowerCase();
    let timing = every[3].trim();
    if (mode) {
      timing = /\s+on\s+/i.test(timing)
        ? `${timing}, MODE ${mode}`
        : `${timing} ON MODE ${mode}`;
    }
    return { base: every[1].trim(), every: timing };
  }

  const pattern = value.match(/^(.*?)(?:\s+mode\s+(forward|reverse|pendulum|walk|random))?\s+pattern\s+\[([^\]]+)\](?:\s+steps\s+(\d+))?(?:\s+on\s+clock\s+(.+))?$/i);
  if (!pattern) return { base: value.trim(), every: null };
  const mode = pattern[2] ? ` MODE ${pattern[2]}` : '';
  const steps = pattern[4] ? ` STEPS ${pattern[4]}` : '';
  const clock = pattern[5] ? ` ON CLOCK ${pattern[5].trim()}` : '';
  return { base: pattern[1].trim(), every: `PATTERN [${pattern[3].trim()}]${steps}${mode}${clock}` };
}

type PatternReaderMode = 'forward' | 'reverse' | 'pendulum' | 'walk' | 'random';
type PatternStepSpec = { index: number; retrig: number; chance: number; cycle: { position: number; length: number } | null };

function parsePatternTimingSpec(raw: string, line: number, sourceDefinitions: Map<string, SourceDefinition>): EverySpec | null {
  const match = raw.trim().match(/^PATTERN\s+\[([^\]]+)\](?:\s+STEPS\s+(\d+))?(?:\s+MODE\s+(forward|reverse|pendulum|walk|random))?(?:\s+ON\s+CLOCK\s+(.+))?$/i);
  if (!match) return null;

  const steps = match[2] === undefined ? 16 : Number(match[2]);
  if (!Number.isInteger(steps) || steps < 1 || steps > 128) throw new LanguageError([{ line, message: 'PATTERN STEPS expects an integer from 1 to 128' }]);
  const mode = (match[3]?.toLowerCase() ?? 'forward') as PatternReaderMode;
  const tokens = match[1].trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) throw new LanguageError([{ line, message: 'PATTERN cannot be empty' }]);

  const seen = new Set<number>();
  const events: PatternStepSpec[] = tokens.map((token) => {
    const parsed = token.match(/^(\d+)(?:\*(\d+))?(?:!(?:(\d+)|(\d+):(\d+)))?$/);
    if (!parsed) throw new LanguageError([{ line, message: `invalid PATTERN step '${token}'` }]);
    const index = Number(parsed[1]);
    if (index < 1 || index > steps) throw new LanguageError([{ line, message: `PATTERN step ${index} is outside 1..${steps}` }]);
    if (seen.has(index)) throw new LanguageError([{ line, message: `duplicate PATTERN step ${index}` }]);
    seen.add(index);
    let retrig = 1;
    if (parsed[2] !== undefined) {
      retrig = Number(parsed[2]);
      if (!Number.isInteger(retrig) || retrig < 2 || retrig > 16) {
        throw new LanguageError([{ line, message: 'PATTERN retrig expects *2 through *16' }]);
      }
    }
    let chance = 100;
    let cycle: PatternStepSpec['cycle'] = null;
    if (parsed[3] !== undefined) {
      chance = Number(parsed[3]);
      if (!Number.isInteger(chance) || chance < 1 || chance > 100) throw new LanguageError([{ line, message: 'PATTERN step chance expects an integer from 1 to 100' }]);
    } else if (parsed[4] !== undefined) {
      const position = Number(parsed[4]);
      const length = Number(parsed[5]);
      if (length < 1 || position < 1 || position > length) throw new LanguageError([{ line, message: `PATTERN cycle condition '${parsed[4]}:${parsed[5]}' expects 1 <= position <= length` }]);
      cycle = { position, length };
    }
    return { index, retrig, chance, cycle };
  });
  if ((mode === 'walk' || mode === 'random') && events.some((event) => event.cycle !== null)) {
    throw new LanguageError([{ line, message: `PATTERN cycle conditions !A:B are not available with MODE ${mode}` }]);
  }

  let clockSource: string;
  let clockPrelude = '';
  const clockParts = (match[4] ?? '*4').split(',').map((item) => item.trim()).filter(Boolean);
  const clockValue = clockParts.shift() ?? '*4';
  const { feel: inlineClockFeel, remaining: unknownClockModifiers } = parseInlineClockFeel(clockParts, line);
  if (unknownClockModifiers.length > 0) {
    throw new LanguageError([{ line, message: `PATTERN ON CLOCK does not support modifier '${unknownClockModifiers[0]}'` }]);
  }
  const rate = clockValue.match(/^([/*])\s*(\d+(?:\.\d+)?)$/);
  if (rate) {
    const n = Number(rate[2]);
    if (!Number.isFinite(n) || n <= 0) throw new LanguageError([{ line, message: 'PATTERN clock divisor/multiplier must be greater than 0' }]);
    const label = `${rate[1]}${formatSourceNumber(n)}`;
    const safe = label.replace('/', 'div_').replace('*', 'mul_').replace('.', '_');
    clockSource = `__clock_pattern_${line}_${safe}`;
    const feelPrelude = inlineClockFeelPrelude(clockSource, inlineClockFeel);
    clockPrelude = `${clockSource} = Clock.rate(${JSON.stringify(label)}); __clockparent(${JSON.stringify(clockSource)},"Clock",${JSON.stringify(label)});${feelPrelude ? ` ${feelPrelude}` : ''}`;
  } else {
    if (inlineClockFeel.jitter !== null || inlineClockFeel.drifter !== null) {
      throw new LanguageError([{ line, message: 'jitter/drifter after PATTERN ON CLOCK require an inline clock rate such as /4 or *2; named CLOCK objects define their own feel' }]);
    }
    if (!IDENTIFIER.test(clockValue)) throw new LanguageError([{ line, message: `invalid PATTERN clock source '${clockValue}'` }]);
    const definition = sourceDefinitions.get(clockValue);
    if (!definition) throw new LanguageError([{ line, message: `unknown clock source '${clockValue}'` }]);
    if (definition.kind !== 'clock') throw new LanguageError([{ line, message: `source '${clockValue}' is ${definition.kind}, expected clock source` }]);
    clockSource = definition.internalName;
  }

  const payload = encodeURIComponent(JSON.stringify({ steps, mode, events }));
  return { amount: 1, unit: 'beat', chance: 100, drift: false, loose: false, clockSource: `__pattern__${payload}__${clockSource}`, clockPrelude, euclidean: null };
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

type InlineClockFeel = { jitter: number | null; drifter: number | null };

function parseInlineClockFeel(
  modifiers: string[],
  line: number,
): { feel: InlineClockFeel; remaining: string[] } {
  const feel: InlineClockFeel = { jitter: null, drifter: null };
  let sawJitter = false;
  let sawDrifter = false;
  const remaining: string[] = [];

  for (const modifier of modifiers) {
    const jitter = modifier.match(/^jitter\s+(.+)$/i);
    if (jitter) {
      if (sawJitter) throw new LanguageError([{ line, message: 'ON CLOCK accepts only one jitter modifier' }]);
      const value = numberValue(jitter[1], line, 'ON CLOCK jitter');
      if (value < 0 || value > 100) throw new LanguageError([{ line, message: 'ON CLOCK jitter expects 0..100' }]);
      feel.jitter = value;
      sawJitter = true;
      continue;
    }
    const drifter = modifier.match(/^drifter\s+(.+)$/i);
    if (drifter) {
      if (sawDrifter) throw new LanguageError([{ line, message: 'ON CLOCK accepts only one drifter modifier' }]);
      const value = numberValue(drifter[1], line, 'ON CLOCK drifter');
      if (value < 0 || value > 100) throw new LanguageError([{ line, message: 'ON CLOCK drifter expects 0..100' }]);
      feel.drifter = value;
      sawDrifter = true;
      continue;
    }
    remaining.push(modifier);
  }
  return { feel, remaining };
}

function inlineClockFeelPrelude(clockSource: string, feel: InlineClockFeel): string {
  const directives: string[] = [];
  if (feel.jitter !== null) directives.push(`__clockfeel(${JSON.stringify(clockSource)},"jitter",${feel.jitter});`);
  if (feel.drifter !== null) directives.push(`__clockfeel(${JSON.stringify(clockSource)},"drift",${feel.drifter});`);
  return directives.join(' ');
}

function parseEverySpec(
  raw: string,
  line: number,
  sourceDefinitions: Map<string, SourceDefinition>,
): EverySpec {
  const logic = raw.trim().match(/^LOGIC\s+([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)(?:\s+ON\s+(.+))?$/i);
  if (logic) {
    const key = `${logic[1]}.${logic[2]}`;
    const definition = sourceDefinitions.get(key);
    if (!definition || definition.kind !== 'logic') throw new LanguageError([{ line, message: `unknown LOGIC output '${key}'` }]);
    const modifiers = logic[3] ? logic[3].split(',').map((item) => item.trim()).filter(Boolean) : [];
    const local = parseTimingModifiers(modifiers, line, 'beat');
    return { amount: 1, unit: 'beat', chance: local.chance, drift: local.drift, loose: local.loose, clockSource: `__logic__${key}`, clockPrelude: '', euclidean: null };
  }

  const rhythm = raw.trim().match(/^RHYTHM\s+([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)(?:\s+ON\s+(.+))?$/i);
  if (rhythm) {
    const sourceName = rhythm[1];
    const definition = sourceDefinitions.get(sourceName);
    if (!definition) throw new LanguageError([{ line, message: `unknown RHYTHM source '${sourceName}'` }]);
    const localModifiers = rhythm[2]
      ? rhythm[2].split(',').map((item) => item.trim()).filter(Boolean)
      : [];
    if (definition.kind === 'logic') {
      const local = parseTimingModifiers(localModifiers, line, 'beat');
      return {
        amount: 1,
        unit: 'beat',
        chance: local.chance,
        drift: local.drift,
        loose: local.loose,
        clockSource: `__logic__${sourceName}`,
        clockPrelude: '',
        euclidean: null,
      };
    }
    if (definition.kind !== 'rhythm') {
      throw new LanguageError([{ line, message: `source '${sourceName}' is ${definition.kind}, expected RHYTHM or LOGIC trigger source` }]);
    }
    const local = parseTimingModifiers(localModifiers, line, definition.spec.unit);
    return {
      ...definition.spec,
      chance: local.chance,
      drift: local.drift,
      loose: local.loose,
    };
  }

  const pattern = parsePatternTimingSpec(raw, line, sourceDefinitions);
  if (pattern) return pattern;
  const { base, modifiers } = splitEveryModifiers(raw.trim());
  const { feel: inlineClockFeel, remaining: modifiersWithoutClockFeel } = parseInlineClockFeel(modifiers, line);

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
  let readerMode: PatternReaderMode = 'forward';
  let readerModeExplicit = false;
  const timingModifiers: string[] = [];

  let inlineClockCreated = false;

  for (const modifier of modifiersWithoutClockFeel) {
    const mode = modifier.match(/^mode\s+(forward|reverse|pendulum|walk|random)$/i);
    if (mode) {
      if (!euclidean) {
        throw new LanguageError([{ line, message: 'MODE with EVERY is available only for EVERY EUCLIDEAN' }]);
      }
      if (readerModeExplicit) {
        throw new LanguageError([{ line, message: 'EVERY EUCLIDEAN accepts only one MODE reader' }]);
      }
      readerMode = mode[1].toLowerCase() as PatternReaderMode;
      readerModeExplicit = true;
      continue;
    }

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
      const feelPrelude = inlineClockFeelPrelude(clockSource, inlineClockFeel);
      clockPrelude = `${clockSource} = Clock.rate(${JSON.stringify(label)}); __clockparent(${JSON.stringify(clockSource)},"Clock",${JSON.stringify(label)});${feelPrelude ? ` ${feelPrelude}` : ''}`;
      inlineClockCreated = true;
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


  if ((inlineClockFeel.jitter !== null || inlineClockFeel.drifter !== null) && !inlineClockCreated) {
    throw new LanguageError([{ line, message: 'jitter/drifter after ON CLOCK require an inline clock rate such as /4 or *2; named CLOCK objects define their own feel' }]);
  }

  const timing = parseTimingModifiers(timingModifiers, line, unit);
  if (euclidean) {
    if (readerModeExplicit) {
      const basePattern = Array.from({ length: euclidean.steps }, (_, step) =>
        ((step * euclidean.hits) % euclidean.steps) < euclidean.hits
      );
      const rotatedPattern = euclidean.rotate === 0
        ? basePattern
        : basePattern.map((_, step) => basePattern[(step - euclidean.rotate + euclidean.steps) % euclidean.steps]);
      const events: PatternStepSpec[] = rotatedPattern.flatMap((hit, step) =>
        hit ? [{ index: step + 1, retrig: 1, chance: 100, cycle: null }] : []
      );
      const payload = encodeURIComponent(JSON.stringify({ steps: euclidean.steps, mode: readerMode, events }));
      clockSource = `__pattern__${payload}__${clockSource}`;
    } else {
      clockSource = `__euclidean_${euclidean.hits}_${euclidean.steps}_${euclidean.rotate}__${clockSource}`;
    }
  }
  return { amount, unit, ...timing, clockSource, clockPrelude, euclidean };
}

function everyDirective(name: string, spec: EverySpec): string {
  const prefix = spec.clockPrelude ? `${spec.clockPrelude} ` : '';
  return `${prefix}__cycle(${JSON.stringify(name)},${spec.amount},${JSON.stringify(spec.unit)},${spec.chance},${spec.drift},${spec.loose},${JSON.stringify(spec.clockSource)});`;
}

function objectPatternDirective(name: string, raw: string, line: number, sourceDefinitions: Map<string, SourceDefinition>): string {
  const timing = parseEverySpec(`PATTERN ${raw}`, line, sourceDefinitions);
  const prefix = timing.clockPrelude ? `${timing.clockPrelude} ` : '';
  return `${prefix}__objectevery(${JSON.stringify(name)},${timing.amount},${JSON.stringify(timing.unit)},${timing.chance},${timing.drift},${timing.loose},${JSON.stringify(timing.clockSource)});`;
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
      throw new LanguageError([{ line, message: `SEQ ${definition.model ?? 'turing'} source '${direct.base}' does not accept REGISTER reader modifiers` }]);
    }

    register.sourceName = direct.base;
    register.readerMode = readerMode;
    register.readerAmount = readerAmount;
    return `__registersource(${JSON.stringify(register.name)},${JSON.stringify(direct.base)},${JSON.stringify(readerMode)},${readerAmount});`;
  }

  if (key === 'write') {
    const match = value.match(/^(every\s+(.+)|pattern\s+(.+))$/i);
    if (!match) throw new LanguageError([{ line, message: 'REGISTER write expects EVERY <time> or PATTERN [...]' }]);
    const timing = parseEverySpec(match[2] ?? `PATTERN ${match[3]}`, line, sourceDefinitions);
    register.hasWrite = true;
    const prefix = timing.clockPrelude ? `${timing.clockPrelude}\n` : '';
    return `${prefix}__registerwrite(${JSON.stringify(register.name)},${timing.amount},${JSON.stringify(timing.unit)},${timing.chance},${timing.drift},${timing.loose},${JSON.stringify(timing.clockSource)});`;
  }

  throw new LanguageError([{ line, message: `unknown REGISTER property '${property}'` }]);
}

function compileLogicNode(
  logic: LogicState,
  raw: string,
  line: number,
  sourceDefinitions: Map<string, SourceDefinition>,
  emittedClockPreludes: Set<string>,
): string {
  const match = raw.trim().match(/^(and|or|xor|nand|nor|divider|counter|flipflop)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\[(.*)\](?:\s+(?:by|count)\s+(\d+))?$/i);
  if (!match) throw new LanguageError([{ line, message: 'LOGIC node expects <operator> <name> [inputs] [BY|COUNT n]' }]);
  const operator = match[1].toLowerCase() as LogicOperator;
  const name = match[2];
  if (logic.nodes.has(name)) throw new LanguageError([{ line, message: `LOGIC '${logic.name}' already defines '${name}'` }]);
  const rawInputs = match[3].trim();
  const inputs = (rawInputs.includes(';') ? rawInputs.split(';') : rawInputs.split(','))
    .map((item) => item.trim())
    .filter(Boolean);
  if (operator === 'divider' || operator === 'counter' || operator === 'flipflop') {
    if (inputs.length !== 1) throw new LanguageError([{ line, message: `LOGIC ${operator.toUpperCase()} expects exactly one input` }]);
  } else if (inputs.length < 2) {
    throw new LanguageError([{ line, message: `LOGIC ${operator.toUpperCase()} expects at least two inputs` }]);
  }
  const param = match[4] ? Number(match[4]) : (operator === 'divider' || operator === 'counter' ? 2 : 0);
  if ((operator === 'divider' || operator === 'counter') && (!Number.isInteger(param) || param < 2 || param > 64)) {
    throw new LanguageError([{ line, message: `LOGIC ${operator.toUpperCase()} expects BY/COUNT 2..64` }]);
  }
  const preludes: string[] = [];
  const resolved = inputs.map((input) => {
    if (logic.nodes.has(input)) return { kind: 'node', name: input };

    const source = sourceDefinitions.get(input);
    let spec: EverySpec;
    if (source) {
      if (source.kind !== 'rhythm') {
        throw new LanguageError([{ line, message: `LOGIC input '${input}' must be a RHYTHM SET, inline timing expression, or an earlier node in this LOGIC object` }]);
      }
      spec = source.spec;
    } else {
      const inlineEvery = input.match(/^every\s+(.+)$/i);
      const inlinePattern = /^pattern\s+\[/i.test(input);
      if (!inlineEvery && !inlinePattern) {
        throw new LanguageError([{ line, message: `unknown LOGIC trigger source '${input}'` }]);
      }
      spec = parseEverySpec(inlineEvery ? inlineEvery[1] : input, line, sourceDefinitions);
      if (spec.chance !== 100 || spec.drift || spec.loose) {
        throw new LanguageError([{ line, message: 'inline LOGIC inputs do not accept CHANCE, COIN, or LOOSE; apply those modifiers to the consumer instead' }]);
      }
    }

    if (spec.clockPrelude && !emittedClockPreludes.has(spec.clockPrelude)) {
      emittedClockPreludes.add(spec.clockPrelude);
      preludes.push(spec.clockPrelude);
    }
    const runtimeSpec = { ...spec, clockPrelude: '' };
    return { kind: 'rhythm', name: input, spec: runtimeSpec };
  });
  logic.nodes.add(name);
  sourceDefinitions.set(`${logic.name}.${name}`, { kind: 'logic', display: `LOGIC ${logic.name}.${name}` });
  const directive = `__logicnode(${JSON.stringify(logic.name)},${JSON.stringify(name)},${JSON.stringify(operator)},${JSON.stringify(JSON.stringify(resolved))},${param});`;
  return preludes.length > 0 ? `${preludes.join('\n')}\n${directive}` : directive;
}

function requireSeqReady(seq: SeqState | null, diagnostics: LanguageDiagnostic[]): void {
  if (!seq) return;
  if (!seq.modelId) diagnostics.push({ line: seq.line, message: `SEQ '${seq.name}' requires a model` });
  if (seq.values.length === 0) diagnostics.push({ line: seq.line, message: `SEQ '${seq.name}' requires PITCH SCALE, PITCH NOTES, or PITCH FREQS material` });
  if (seq.modelId !== 'constellation' && seq.weights.some((weight) => weight !== 100)) diagnostics.push({ line: seq.line, message: 'weighted SEQ notes are available only for MODEL constellation' });
  if (seq.modelId === 'constellation' && seq.mutation > 0 && seq.phrase <= 0) diagnostics.push({ line: seq.line, message: 'SEQ constellation MUTATION requires PHRASE > 0' });
  if (seq.modelId === 'snake' && seq.matrixExplicit && seq.values.length !== seq.snakeWidth * seq.snakeHeight) diagnostics.push({ line: seq.line, message: `SEQ snake MATRIX must contain exactly ${seq.snakeWidth * seq.snakeHeight} notes` });
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
    if (model !== 'turing' && model !== 'constellation' && model !== 'snake' && !lifeModel) throw new LanguageError([{ line, message: `unknown SEQ model '${value}'` }]);
    seq.modelId = model === 'turing' ? 'turing' : model === 'constellation' ? 'constellation' : model === 'snake' ? 'snake' : 'life';
    seq.lifeVariant = lifeModel ? ((lifeModel?.[1] ?? 'conway') as SeqState['lifeVariant']) : 'conway';
    const definition = sourceDefinitions.get(seq.name);
    if (definition?.kind === 'seq') definition.model = seq.modelId;
    return `__seqmodel(${JSON.stringify(seq.name)},${JSON.stringify(seq.modelId)},${JSON.stringify(seq.lifeVariant)});`;
  }
  if (effectiveKey === 'size' && seq.modelId === 'snake') {
    const match = value.match(/^(\d+)\s*x\s*(\d+)$/i);
    if (!match) throw new LanguageError([{ line, message: 'SEQ snake SIZE expects <columns>x<rows>, for example 4x4' }]);
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || width > 16 || height > 16) {
      throw new LanguageError([{ line, message: 'SEQ snake SIZE expects dimensions from 2x2 to 16x16' }]);
    }
    seq.snakeWidth = width;
    seq.snakeHeight = height;
    return `__snakesize(${JSON.stringify(seq.name)},${width},${height});`;
  }
  if (effectiveKey === 'movement') {
    if (seq.modelId !== 'snake') throw new LanguageError([{ line, message: 'SEQ MOVEMENT is available only for MODEL snake' }]);
    const movement = value.toLowerCase();
    if (!/^(snake|rows|columns|spiral|diagonal|bounce|random|walk)$/.test(movement)) {
      throw new LanguageError([{ line, message: "SEQ snake MOVEMENT expects snake, rows, columns, spiral, diagonal, bounce, random, or walk" }]);
    }
    seq.snakeMovement = movement as SeqState['snakeMovement'];
    return `__snakemovement(${JSON.stringify(seq.name)},${JSON.stringify(movement)});`;
  }
  if (effectiveKey === 'matrix') {
    if (seq.modelId !== 'snake') throw new LanguageError([{ line, message: 'SEQ MATRIX is available only for MODEL snake' }]);
    const match = value.match(/^\[([\s\S]+)\]$/);
    if (!match) throw new LanguageError([{ line, message: 'SEQ snake MATRIX expects a bracketed note matrix' }]);
    const rows = match[1].split(/\s*;\s*/).map((row) => row.trim()).filter(Boolean);
    if (rows.length !== seq.snakeHeight) throw new LanguageError([{ line, message: `SEQ snake MATRIX expects ${seq.snakeHeight} rows for SIZE ${seq.snakeWidth}x${seq.snakeHeight}` }]);
    const values: number[] = [];
    for (const row of rows) {
      const tokens = row.split(/\s+/).filter(Boolean);
      if (tokens.length !== seq.snakeWidth) throw new LanguageError([{ line, message: `each SEQ snake MATRIX row expects ${seq.snakeWidth} notes` }]);
      for (const token of tokens) {
        const parsed = parseNoteSequenceToken(token, line);
        if (parsed.favor) throw new LanguageError([{ line, message: 'SEQ snake MATRIX does not use note weights' }]);
        const midi = midiFromNote(parsed.note);
        if (midi === null) throw new LanguageError([{ line, message: `invalid SEQ snake MATRIX note '${parsed.note}'` }]);
        values.push(midiToFrequency(midi));
      }
    }
    seq.values = values;
    seq.weights = values.map(() => 100);
    seq.material = 'notes';
    seq.matrixExplicit = true;
    const definition = sourceDefinitions.get(seq.name);
    if (definition?.kind === 'seq') definition.values = [...values];
    return `__seqvalues(${JSON.stringify(seq.name)},${JSON.stringify(values.join('|'))}); __snakematrix(${JSON.stringify(seq.name)},true);`;
  }
  if (effectiveKey === 'size') {
    if (seq.modelId !== 'life') throw new LanguageError([{ line, message: 'SEQ SIZE is available only for MODEL life or snake' }]);
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
    if (seq.modelId !== 'turing') throw new LanguageError([{ line, message: `SEQ ${seq.modelId ?? ''} does not use LENGTH` }]);
    const length = numberValue(value, line, 'SEQ length');
    if (!Number.isInteger(length) || length < 2 || length > 32) throw new LanguageError([{ line, message: 'SEQ turing length expects an integer from 2 to 32' }]);
    seq.length = length;
    return `__seqlength(${JSON.stringify(seq.name)},${length});`;
  }
  if (effectiveKey === 'change') {
    if (seq.modelId !== 'turing') throw new LanguageError([{ line, message: `SEQ ${seq.modelId ?? ''} does not use CHANGE` }]);
    const change = numberValue(value, line, 'SEQ change');
    if (change < 0 || change > 100) throw new LanguageError([{ line, message: 'SEQ turing change expects 0..100' }]);
    seq.change = change;
    return `__seqchange(${JSON.stringify(seq.name)},${change});`;
  }
  if (effectiveKey === 'notes') {
    const direct = splitWith(value);
    const parsedNotes = parseInlineNoteMaterial(direct.base, direct.modifiers, line, 'SEQ notes');
    const parsed = parseList(direct.base, line, 'SEQ notes').map((item) => parseNoteSequenceToken(item, line));
    const favors = parsedNotes.favor;
    if (parsedNotes.modifiers.length > 0) {
      throw new LanguageError([{ line, message: `SEQ notes does not support modifier '${parsedNotes.modifiers[0]}'` }]);
    }
    if (favors.some((entry) => entry.operator !== 'weight')) {
      throw new LanguageError([{ line, message: 'SEQ notes support only ! weights' }]);
    }
    if (seq.modelId !== 'constellation' && favors.length > 0) {
      throw new LanguageError([{ line, message: 'weighted SEQ notes are available only for MODEL constellation' }]);
    }
    seq.values = parsedNotes.frequencies;
    seq.weights = parsed.map((item) => item.favor?.operator === 'weight' ? item.favor.amount : 100);
    seq.material = 'notes';
    const definition = sourceDefinitions.get(seq.name);
    if (definition?.kind === 'seq') definition.values = [...seq.values];
    return `__seqvalues(${JSON.stringify(seq.name)},${JSON.stringify(seq.values.join('|'))}); __seqweights(${JSON.stringify(seq.name)},${JSON.stringify(seq.weights.join('|'))});`;
  }
  if (effectiveKey === 'freqs') {
    const parsed = splitWith(value);
    const values = parseList(parsed.base, line, 'SEQ pitch freqs').map((item) => numberValue(item, line, 'SEQ pitch freqs'));
    if (values.length === 0 || values.some((frequency) => frequency <= 0)) {
      throw new LanguageError([{ line, message: 'SEQ PITCH FREQS expects positive frequency values' }]);
    }
    if (parsed.modifiers.length > 0) throw new LanguageError([{ line, message: 'SEQ PITCH FREQS material does not accept selection modifiers; readers choose the material' }]);
    seq.values = values;
    seq.weights = values.map(() => 100);
    seq.material = 'freqs';
    const definition = sourceDefinitions.get(seq.name);
    if (definition?.kind === 'seq') definition.values = [...seq.values];
    return `__seqvalues(${JSON.stringify(seq.name)},${JSON.stringify(seq.values.join('|'))}); __seqweights(${JSON.stringify(seq.name)},${JSON.stringify(seq.weights.join('|'))});`;
  }
  if (effectiveKey === 'scale') {
    const scale = parseScaleSource(value, line);
    if (!scale) throw new LanguageError([{ line, message: 'SEQ scale expects a scale and range, for example C minor with range C2 C4' }]);
    seq.values = scale.values;
    seq.weights = scale.values.map(() => 100);
    seq.material = 'scale';
    const definition = sourceDefinitions.get(seq.name);
    if (definition?.kind === 'seq') definition.values = [...seq.values];
    return `__seqvalues(${JSON.stringify(seq.name)},${JSON.stringify(seq.values.join('|'))}); __seqweights(${JSON.stringify(seq.name)},${JSON.stringify(seq.weights.join('|'))});`;
  }
  if (['stepwise', 'leap', 'repeat', 'memory', 'mutation'].includes(effectiveKey)) {
    if (seq.modelId !== 'constellation') throw new LanguageError([{ line, message: `SEQ ${effectiveKey.toUpperCase()} is available only for MODEL constellation` }]);
    const amount = numberValue(value, line, `SEQ constellation ${effectiveKey}`);
    if (amount < 0 || amount > 100) throw new LanguageError([{ line, message: `SEQ constellation ${effectiveKey.toUpperCase()} expects 0..100` }]);
    (seq as unknown as Record<string, unknown>)[effectiveKey] = amount;
    return `__constellationparam(${JSON.stringify(seq.name)},${JSON.stringify(effectiveKey)},${amount});`;
  }
  if (effectiveKey === 'phrase') {
    if (seq.modelId !== 'constellation') throw new LanguageError([{ line, message: 'SEQ PHRASE is available only for MODEL constellation' }]);
    const amount = numberValue(value, line, 'SEQ constellation phrase');
    if (!Number.isInteger(amount) || amount < 0 || amount > 64) throw new LanguageError([{ line, message: 'SEQ constellation PHRASE expects an integer from 0 to 64' }]);
    seq.phrase = amount;
    return `__constellationparam(${JSON.stringify(seq.name)},"phrase",${amount});`;
  }
  if (effectiveKey === 'octave') {
    if (seq.modelId !== 'constellation') throw new LanguageError([{ line, message: 'SEQ OCTAVE is available only for MODEL constellation' }]);
    const match = value.match(/^\[([^\]]+)\]$/);
    if (!match) throw new LanguageError([{ line, message: 'SEQ constellation OCTAVE expects a weighted list such as [-1!10 0!100 1!30]' }]);
    const entries = match[1].trim().split(/\s+/).filter(Boolean).map((token) => {
      const parsed = token.match(/^(-?\d+)(?:!(\d+(?:\.\d+)?))?$/);
      if (!parsed) throw new LanguageError([{ line, message: `invalid constellation octave entry '${token}'` }]);
      const octave = Number(parsed[1]);
      const weight = parsed[2] === undefined ? 100 : Number(parsed[2]);
      if (octave < -6 || octave > 6) throw new LanguageError([{ line, message: 'constellation octave offsets expect -6..6' }]);
      if (weight < 0 || weight > 100) throw new LanguageError([{ line, message: 'constellation octave weights expect 0..100' }]);
      return { octave, weight };
    });
    seq.octaves = entries;
    return `__constellationoctaves(${JSON.stringify(seq.name)},${JSON.stringify(JSON.stringify(entries))});`;
  }
  if (effectiveKey === 'evolve') {
    if (seq.modelId !== 'life') throw new LanguageError([{ line, message: 'EVOLVE is available only for MODEL life' }]);
    const evolve = value.match(/^(every\s+(.+)|pattern\s+(.+))$/i);
    if (!evolve) throw new LanguageError([{ line, message: 'EVOLVE expects EVERY <time> [ON ...] or PATTERN [...]' }]);
    const timing = parseEverySpec(evolve[2] ?? `PATTERN ${evolve[3]}`, line, sourceDefinitions);
    const prefix = timing.clockPrelude ? `${timing.clockPrelude}\n` : '';
    return `${prefix}__lifeevolve(${JSON.stringify(seq.name)},${timing.amount},${JSON.stringify(timing.unit)},${timing.chance},${timing.drift},${timing.loose},${JSON.stringify(timing.clockSource)});`;
  }
  if (effectiveKey === 'every') {
    if (seq.modelId === 'life' || seq.modelId === 'constellation' || seq.modelId === 'snake') throw new LanguageError([{ line, message: `SEQ ${seq.modelId} has no playhead EVERY; schedule each consumer PITCH separately` }]);
    const timing = parseEverySpec(value, line, sourceDefinitions);
    const prefix = timing.clockPrelude ? `${timing.clockPrelude}\n` : '';
    return `${prefix}__objectevery(${JSON.stringify(seq.name)},${timing.amount},${JSON.stringify(timing.unit)},${timing.chance},${timing.drift},${timing.loose},${JSON.stringify(timing.clockSource)});`;
  }
  if (effectiveKey === 'pattern') {
    if (seq.modelId === 'life' || seq.modelId === 'constellation' || seq.modelId === 'snake') throw new LanguageError([{ line, message: `SEQ ${seq.modelId} has no playhead PATTERN; schedule each consumer PITCH separately` }]);
    return objectPatternDirective(seq.name, value, line, sourceDefinitions);
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

  const rhythm = body.match(/^RHYTHM\s+(.+)$/i);
  if (rhythm) {
    let timingText = rhythm[1].trim();
    if (/^every\b/i.test(timingText)) timingText = timingText.replace(/^every\s+/i, '');
    if (!timingText) throw new LanguageError([{ line, message: 'RHYTHM expects EVERY ..., EVERY EUCLIDEAN ..., or PATTERN ...' }]);

    // Probability/humanization belongs to each consumer. A reusable RHYTHM SET
    // stores only the shared pulse structure and clock feel.
    const eventModifier = timingText.match(/(?:^|[,\s])(?:chance\s+[^,]+|coin|loose)(?=,|$)/i);
    if (eventModifier) {
      throw new LanguageError([{ line, message: 'RHYTHM SET values cannot contain chance, coin, or loose; apply them where the RHYTHM is consumed' }]);
    }

    const spec = parseEverySpec(timingText, line, sourceDefinitions);
    scalarNames.add(name);
    sourceKinds.set(name, 'rhythm');
    sourceDefinitions.set(name, { kind: 'rhythm', spec, display: `RHYTHM ${rhythm[1].trim()}`, internalName: runtimeName });
    return `${runtimeName} = ${JSON.stringify(`RHYTHM ${rhythm[1].trim()}`)};`;
  }

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

function compileModProperty(mod: ModState, property: string, rawValue: string, line: number, sourceDefinitions: Map<string, SourceDefinition>): string {
  const key = property.toLowerCase();
  const value = rawValue.trim();

  if (key === 'model') {
    const model = value.toLowerCase();
    if (model !== 'swell' && model !== 'dices' && model !== 'composite') {
      throw new LanguageError([{ line, message: 'MOD model expects swell, dices, or composite' }]);
    }
    mod.modelId = model as 'swell' | 'dices' | 'composite';
    return `__modset(${JSON.stringify(mod.internalName)},"model",${JSON.stringify(model)});`;
  }

  if (mod.modelId === 'composite') {
    if (key === 'tune') return compileCompositeTuneDirective(mod.internalName, value, line, sourceDefinitions);
    if (key === 'mix') throw new LanguageError([{ line, message: 'mix is not available for MOD composite; each output must remain one signal' }]);
    if (key === 'fm' || key === 'pm' || key === 'am' || key === 'ring' || key === 'sync') {
      return compileCompositeEdgeDirective(mod.internalName, key, value, line);
    }
    if (key === 'output') return compileCompositeOutputDirective(mod.internalName, value, line);
    throw new LanguageError([{ line, message: `unknown MOD composite property '${property}'` }]);
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
  const match = value.match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)(?:\s+with\s+depth\s+(-?\d+(?:\.\d+)?))?$/i);
  if (!match) return null;
  const source = modSources.get(modSourceKey(voice.name, match[1])) ?? modSources.get(match[1]);
  if (!source) throw new LanguageError([{ line, message: `unknown MOD source '${match[1]}'` }]);
  const depth = match[3] === undefined ? 100 : Number(match[3]);
  if (!Number.isFinite(depth) || depth < -100 || depth > 100) {
    throw new LanguageError([{ line, message: 'modulation depth must be between -100 and 100' }]);
  }
  const token = match[2].toLowerCase();
  let sourcePort: string;
  if (source.modelId === 'composite') {
    if (token !== 'out' && !source.outputs.has(token)) {
      throw new LanguageError([{ line, message: `MOD composite '${match[1]}' does not expose '${match[2]}'` }]);
    }
    sourcePort = token;
  } else {
    const aliases = ({ a: 1, b: 2, c: 3, d: 4, x1: 1, x2: 2, x3: 3, y: 4 } as const);
    const port = aliases[token as keyof typeof aliases];
    if (!port) return null;
    sourcePort = source.modelId === 'dices' ? (['x1','x2','x3','y'] as const)[port - 1] : `out${port}`;
  }
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
  if (key === 'pattern') return objectPatternDirective(fx.name, value, line, sourceDefinitions);


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
      const parsedNotes = parseInlineNoteMaterial(
        parsed.base,
        parsed.modifiers.filter((modifier) => !/^view$/i.test(modifier)),
        line,
        'FX pitch notes',
      );
      pitchValues = parsedNotes.frequencies.map(semitonesFromFrequency);
      { const selection = parseSelectionMode(parsedNotes.modifiers, line, 'note'); mode = selection.mode; selectionAmount = selection.amount; pitchFavor = mergeFavor(parsedNotes.favor, selection.favor); validateFavorForMode(pitchFavor, mode, line, 'note'); }
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

type OutPort = string | null;

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
  const match = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\.([A-Za-z_][A-Za-z0-9_]*|L|R))?(?:\s+at\s+(.+))?$/i);
  if (!match) throw new LanguageError([{ line, message: `invalid OUT endpoint '${raw.trim()}'` }]);
  const suffix = match[2]?.toLowerCase() ?? null;
  return {
    name: match[1],
    port: suffix === 'l' || suffix === 'r' ? null : suffix,
    channel: suffix === 'l' ? 'L' : suffix === 'r' ? 'R' : null,
    amount: match[3] === undefined ? 100 : normalizedAmount(match[3].trim(), line),
  };
}

function normalizeLocalOutSource(localSource: string, raw: string, line: number): string {
  const text = raw.trim();
  if (!text) return localSource;
  const amountOnly = text.match(/^at\s+(.+)$/i);
  if (amountOnly) return `${localSource} at ${amountOnly[1]}`;
  const port = text.match(/^([A-Za-z_][A-Za-z0-9_]*|L|R)(?:\s+at\s+(.+))?$/i);
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
  const rawPieces = rawBody.split(/\s+to\s+/i);
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
      const sound = voiceSoundIds.get(endpoint.name) ?? '';
      if (sound === 'composite') return { stereo: false, mono: `${endpoint.name}.${endpoint.port ?? 'out'}` };
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
  if (key === 'pattern') return objectPatternDirective(filter.internalName, value, line, sourceDefinitions);


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

function requireVoiceReady(voice: VoiceState | null, diagnostics: LanguageDiagnostic[]): void {
  if (!voice) return;
  if (!voice.hasSound) diagnostics.push({ line: voice.line, message: `VOICE '${voice.name}' requires sound` });
  if (!voice.pitchProperty) diagnostics.push({ line: voice.line, message: `VOICE '${voice.name}' requires pitch` });
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
  if (live && !(label === 'VOICE' && (/^pitch$/i.test(property) || /^(tune|mix|output)$/i.test(property)))) {
    const literal = value.match(/^(\d+(?:\.\d+)?)(?=\s|$)/);
    if (!literal) throw new LanguageError([{ line, message: 'LIVE currently requires a literal 0..100 value, except LIVE PITCH and composite TUNE/MIX/OUTPUT' }]);
    const amount = Number(literal[1]);
    if (!Number.isFinite(amount) || amount < 0 || amount > 100) {
      throw new LanguageError([{ line, message: 'LIVE currently requires a literal 0..100 value, except LIVE PITCH and composite TUNE/MIX/OUTPUT' }]);
    }
  }
  return { property, value, live };
}

function validateLiveVoiceProperty(voice: VoiceState, property: string, line: number): void {
  const key = property.toLowerCase();
  const soundParameter = voice.soundId ? SOUND_ENGINE_REGISTRY[voice.soundId]?.parameters[key] : undefined;
  if (soundParameter || key === 'level' || key === 'bow' || key === 'blow' || key === 'strike' || key === 'pitch') return;
  if (voice.soundId === 'composite' && (key === 'tune' || key === 'mix' || key === 'output')) return;
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
  setReferenceTuningHz(capabilitySet.tuningHz);
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

  // Multiline composite MIX buses keep one source per physical line so commas
  // remain easy to edit and can host one LIVE level slider per source.
  for (let index = 0; index < lines.length; index += 1) {
    const raw = stripComment(lines[index]);
    const trimmed = raw.trim();
    const declaration = trimmed.match(/^(live\s+)?mix\s+([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*$/i);
    if (!declaration) continue;
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
      entries.push(childTrimmed.replace(/,\s*$/, '').trim());
      lines[next] = '';
      next += 1;
    }
    if (!closed || entries.length === 0) {
      throw new LanguageError([{ line: index + 1, message: 'mix <name> [ ... ] requires one or more inputs and a closing ]' }]);
    }
    lines[index] = `${' '.repeat(indentation)}${declaration[1] ? 'live ' : ''}mix ${declaration[2]} [${entries.join('; ')}]`;
  }

  // Multiline SEQ snake MATRIX keeps the visual matrix in source code while
  // compiling to one structured property line.
  for (let index = 0; index < lines.length; index += 1) {
    const raw = stripComment(lines[index]);
    const trimmed = raw.trim();
    if (!/^matrix\s*\[\s*$/i.test(trimmed)) continue;
    const indentation = raw.length - raw.trimStart().length;
    const rows: string[] = [];
    let next = index + 1;
    let closed = false;
    while (next < lines.length) {
      const childRaw = stripComment(lines[next]);
      const childTrimmed = childRaw.trim();
      if (!childTrimmed) { lines[next] = ''; next += 1; continue; }
      if (childTrimmed === ']') { lines[next] = ''; closed = true; break; }
      const childIndentation = childRaw.length - childRaw.trimStart().length;
      if (childIndentation <= indentation) break;
      rows.push(childTrimmed.replace(/,\s*$/, '').trim());
      lines[next] = '';
      next += 1;
    }
    if (!closed || rows.length === 0) throw new LanguageError([{ line: index + 1, message: 'SEQ snake MATRIX requires one or more rows and a closing ]' }]);
    lines[index] = `${' '.repeat(indentation)}matrix [${rows.join('; ')}]`;
  }

  // Multiline LOGIC node input lists compile to one structured line.
  for (let index = 0; index < lines.length; index += 1) {
    const raw = stripComment(lines[index]);
    const trimmed = raw.trim();
    const declaration = trimmed.match(/^(and|or|xor|nand|nor|divider|counter|flipflop)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*$/i);
    if (!declaration) continue;
    const indentation = raw.length - raw.trimStart().length;
    const entries: string[] = [];
    let next = index + 1;
    let closed = false;
    let suffix = '';
    while (next < lines.length) {
      const childRaw = stripComment(lines[next]);
      const childTrimmed = childRaw.trim();
      if (!childTrimmed) { lines[next] = ''; next += 1; continue; }
      const closing = childTrimmed.match(/^\](?:\s+((?:by|count)\s+\d+))?\s*$/i);
      if (closing) { lines[next] = ''; closed = true; suffix = closing[1] ? ` ${closing[1]}` : ''; break; }
      const childIndentation = childRaw.length - childRaw.trimStart().length;
      if (childIndentation <= indentation) break;
      entries.push(childTrimmed.replace(/,\s*$/, '').trim());
      lines[next] = '';
      next += 1;
    }
    if (!closed || entries.length === 0) throw new LanguageError([{ line: index + 1, message: 'LOGIC node input list requires one or more inputs and a closing ]' }]);
    lines[index] = `${' '.repeat(indentation)}${declaration[1]} ${declaration[2]} [${entries.join('; ')}]${suffix}`;
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
  const mutedRouteSources = new Set<string>();
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
  const logics = new Set<string>();
  const emittedLogicClockPreludes = new Set<string>();
  let currentLogic: LogicState | null = null;
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
      output[index] = `__tuning(${capabilitySet.tuningHz});`;
      continue;
    }

    const indentation = withoutComment.length - withoutComment.trimStart().length;

    try {
      if (currentLogic && indentation <= currentLogic.indentation) currentLogic = null;
      if (currentMod && indentation <= currentMod.indentation) currentMod = null;
      if (currentDrumkit && indentation <= currentDrumkit.indentation) { if (!currentDrumkit.kit) diagnostics.push({ line: currentDrumkit.line, message: `DRUMKIT '${currentDrumkit.name}' requires KIT` }); currentDrumkit = null; }
      if (currentSeq && indentation <= currentSeq.indentation) { requireSeqReady(currentSeq, diagnostics); currentSeq = null; }
      if (currentRegister && indentation <= currentRegister.indentation) { requireRegisterReady(currentRegister, diagnostics); currentRegister = null; }
      if (currentClock && indentation <= currentClock.indentation) { requireClockReady(currentClock, diagnostics); currentClock = null; }
      if (currentFilter && indentation <= currentFilter.indentation) {
        requireFilterModel(currentFilter, diagnostics);
        currentFilter = null;
      }

      const drumkitBlockMatch = trimmed.match(/^(_)?DRUMKIT\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+with\s+view(?:\s+(\d+)\s+steps?)?)?\s*:\s*$/i);
      if (drumkitBlockMatch) {
        if (indentation > 0) throw new LanguageError([{ line: lineNumber, message: 'DRUMKIT is currently a top-level object' }]);
        const disabled = Boolean(drumkitBlockMatch[1]);
        const name = drumkitBlockMatch[2];
        const viewRequested = /\bwith\s+view\b/i.test(trimmed);
        const viewSteps = viewRequested ? Number(drumkitBlockMatch[3] ?? 16) : 0;
        if (viewRequested && (!Number.isInteger(viewSteps) || viewSteps < 4 || viewSteps > 64 || viewSteps % 4 !== 0)) {
          throw new LanguageError([{ line: lineNumber, message: 'DRUMKIT WITH VIEW expects 4..64 STEPS in multiples of 4' }]);
        }
        if (drumkits.has(name) || voices.has(name) || fxs.has(name) || filters.has(name)) throw new LanguageError([{ line: lineNumber, message: `duplicate object: ${name}` }]);
        drumkits.add(name);
        currentDrumkit = { name, line: lineNumber, indentation, kit: null, viewSteps };
        currentVoice = null; currentFx = null; currentFilter = null; currentMod = null;
        output[index] = `__drumkit(${JSON.stringify(name)},${disabled},${viewSteps});`;
        continue;
      }

      const clockBlockMatch = trimmed.match(/^(_)?CLOCK\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+with\s+(view))?\s*:\s*$/i);
      if (clockBlockMatch) {
        if (indentation > 0) throw new LanguageError([{ line: lineNumber, message: 'CLOCK declarations are top-level only' }]);
        requireVoiceReady(currentVoice, diagnostics); requireFxModel(currentFx, diagnostics); requireSeqReady(currentSeq, diagnostics);
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
        requireVoiceReady(currentVoice, diagnostics);
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

      const logicMatch = trimmed.match(/^LOGIC\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+with\s+(view))?\s*:\s*$/i);
      if (logicMatch) {
        if (indentation > 0) throw new LanguageError([{ line: lineNumber, message: 'LOGIC declarations are top-level only' }]);
        requireVoiceReady(currentVoice, diagnostics); requireFxModel(currentFx, diagnostics); requireSeqReady(currentSeq, diagnostics); requireRegisterReady(currentRegister, diagnostics);
        currentVoice = null; currentFx = null; currentFilter = null; currentMod = null; currentSeq = null; currentRegister = null; currentClock = null;
        const name = logicMatch[1];
        if (voices.has(name) || fxs.has(name) || filters.has(name) || scalarNames.has(name) || seqs.has(name) || registers.has(name) || logics.has(name) || sourceDefinitions.has(name)) {
          throw new LanguageError([{ line: lineNumber, message: `LOGIC '${name}' conflicts with an existing object or variable` }]);
        }
        logics.add(name);
        currentLogic = { name, line: lineNumber, indentation, view: Boolean(logicMatch[2]), nodes: new Set() };
        output[index] = `__logic(${JSON.stringify(name)},${logicMatch[2] ? 'true' : 'false'});`;
        continue;
      }

      const seqMatch = trimmed.match(/^SEQ\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+with\s+(view))?\s*:\s*$/i);
      if (seqMatch) {
        if (indentation > 0) throw new LanguageError([{ line: lineNumber, message: 'SEQ declarations are top-level only' }]);
        requireVoiceReady(currentVoice, diagnostics);
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
        currentSeq = { name, line: lineNumber, indentation, modelId: null, lifeVariant: 'conway', length: 8, change: 10, size: 8, density: 34, maxDensity: null, values: [], weights: [], material: null, stepwise: 60, leap: 20, repeat: 10, memory: 25, octaves: [{ octave: 0, weight: 100 }], phrase: 0, mutation: 0, snakeWidth: 4, snakeHeight: 4, snakeMovement: 'snake', matrixExplicit: false };
        const viewDirective = seqMatch[2] ? `\n__seqview(${JSON.stringify(name)});` : '';
        output[index] = `__seq(${JSON.stringify(name)});${viewDirective}`;
        continue;
      }

      if (currentLogic && indentation > currentLogic.indentation) {
        output[index] = compileLogicNode(currentLogic, trimmed, lineNumber, sourceDefinitions, emittedLogicClockPreludes);
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
          requireVoiceReady(currentVoice, diagnostics);
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
        modSources.set(scopeKey, { internalName, ownerVoice: ownerObject, modelId: 'swell', outputs: new Set() });
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
          if (currentMod.modelId === 'composite' && (key === 'tune' || key === 'output')) {
            if (key === 'tune' && /\bpitch\b/i.test(value)) {
              throw new LanguageError([{ line: lineNumber, message: 'LIVE TUNE exposes sliders only for WITH octave/detune/ratio; TUNE PITCH remains a structured pitch expression' }]);
            }
          } else {
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
        }
        output[index] = compileModProperty(currentMod, property, value, lineNumber, currentMod.ownerVoice ? scopedDefinitions(`voice:${currentMod.ownerVoice}`) : sourceDefinitions);
        const scopeKey = modSourceKey(currentMod.ownerVoice, currentMod.name);
        const source = modSources.get(scopeKey);
        if (source) {
          source.modelId = currentMod.modelId;
          if (currentMod.modelId === 'composite' && property.toLowerCase() === 'output') {
            source.outputs = new Set(value.split(',').map((item) => item.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)/)?.[1]).filter((item): item is string => Boolean(item)));
          }
        }
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
          requireVoiceReady(currentVoice, diagnostics);
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
        requireVoiceReady(currentVoice, diagnostics);
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
        requireVoiceReady(currentVoice, diagnostics);
        requireFxModel(currentFx, diagnostics);
        currentFx = null;
        const disabled = Boolean(voiceMatch[1]);
        const name = voiceMatch[2];
        if (voices.has(name) || fxs.has(name) || scalarNames.has(name) || seqs.has(name)) {
          throw new LanguageError([{ line: lineNumber, message: `VOICE '${name}' is already defined` }]);
        }
        voices.add(name);
        sourceKinds.set(name, 'voice');
        currentVoice = { name, line: lineNumber, indentation, hasSound: false, soundId: null, pitchProperty: null, vcaTargets: new Set(), embeddedFilter: null };
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

        requireVoiceReady(currentVoice, diagnostics);
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

        requireVoiceReady(currentVoice, diagnostics);
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
        requireVoiceReady(currentVoice, diagnostics);
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
        if (/^OUT\s+MUTE$/i.test(trimmed)) {
          if (!localSource) throw new LanguageError([{ line: lineNumber, message: 'OUT MUTE is valid only inside an audio object' }]);
          mutedRouteSources.add(localSource);
          output[index] = '';
          continue;
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
          output[index] = `__drumslot(${JSON.stringify(currentDrumkit.name)},${JSON.stringify(alias)},${JSON.stringify(entry.source)},${JSON.stringify(serializeDrumParams(params))},0,"ms",100,false,false,"Clock",0,0,0);`;
          continue;
        }
        const timing = parseEverySpec(split.every, lineNumber, scopedDefinitions(`drumkit:${currentDrumkit.name}`));
        const prefix = timing.clockPrelude ? `${timing.clockPrelude} ` : '';
        const euclidean = timing.euclidean ?? { hits: 0, steps: 0, rotate: 0 };
        output[index] = `${prefix}__drumslot(${JSON.stringify(currentDrumkit.name)},${JSON.stringify(alias)},${JSON.stringify(entry.source)},${JSON.stringify(serializeDrumParams(params))},${timing.amount},${JSON.stringify(timing.unit)},${timing.chance},${timing.drift},${timing.loose},${JSON.stringify(timing.clockSource)},${euclidean.hits},${euclidean.steps},${euclidean.rotate});`;
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
        if (statement.live) {
          validateLiveVoiceProperty(currentVoice, statement.property, lineNumber);
          if (currentVoice.soundId === 'composite' && statement.property.toLowerCase() === 'tune' && /\bpitch\b/i.test(statement.value)) {
            throw new LanguageError([{ line: lineNumber, message: 'LIVE TUNE exposes sliders only for WITH octave/detune/ratio; TUNE PITCH remains a structured pitch expression' }]);
          }
        }
        output[index] = compileVoiceProperty(currentVoice, statement.property, statement.value, lineNumber, scopedKinds(`voice:${currentVoice.name}`), scopedDefinitions(`voice:${currentVoice.name}`), modSources, statement.live);
        if (statement.property.toLowerCase() === 'sound') {
          currentVoice.hasSound = true;
          if (currentVoice.soundId) voiceSoundIds.set(currentVoice.name, currentVoice.soundId);
        }
        continue;
      }

      if (/^[A-Za-z_][A-Za-z0-9_]*\s*:/.test(trimmed)) {
        throw new LanguageError([{ line: lineNumber, message: 'only VOICE, FX, FILTER, MOD, SEQ, REGISTER, DRUMKIT, LOGIC and CLOCK blocks are supported' }]);
      }

      throw new LanguageError([{
        line: lineNumber,
        message: 'each top-level statement must begin with VOICE, FX, FILTER, MOD, SEQ, REGISTER, DRUMKIT, LOGIC, SET, CLOCK, MAIN, or OUT',
      }]);
    } catch (error) {
      if (error instanceof LanguageError) diagnostics.push(...error.diagnostics);
      else throw error;
    }
  }

  requireVoiceReady(currentVoice, diagnostics);
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
    if (explicitRouteSources.has(name) || mutedRouteSources.has(name)) return;
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
