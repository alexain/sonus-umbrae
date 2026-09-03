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

type SourceKind = 'voice' | 'note' | 'freq' | 'time' | 'clock' | 'trigger' | 'scalar' | 'scale';

type SourceDefinition =
  | { kind: 'scalar' }
  | { kind: 'time'; amount: number; unit: 'ms' | 'sec' | 'beat'; display: string }
  | { kind: 'clock'; internalName: string; rateLabel: string; display: string }
  | { kind: 'freq'; values: number[]; display: string }
  | { kind: 'note'; values: number[]; display: string }
  | { kind: 'scale'; values: number[]; display: string };

type VoiceState = {
  name: string;
  line: number;
  hasSound: boolean;
  soundId: string | null;
};

type FxState = {
  name: string;
  line: number;
  indentation: number;
  hasModel: boolean;
  modelId: string | null;
};

type FxParameter = 'position' | 'size' | 'pitch' | 'density' | 'texture' | 'mix' | 'spread' | 'feedback' | 'reverb';

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
};

type ModSourceDefinition = {
  internalName: string;
  ownerVoice: string | null;
};


type SelectionMode = 'order' | 'random' | 'walk' | 'shuffle' | 'reverse';

type SelectionSpec = { mode: SelectionMode; amount: number };

type TimingModifiers = {
  chance: number;
  drift: boolean;
  loose: boolean;
};

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NOTE = /^([A-Ga-g])([#b]?)(-?\d+)$/;
const NOTE_WITHOUT_OCTAVE = /^([A-Ga-g])([#b]?)$/;

const NOTE_INDEX: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};

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
};

const MIST_PARAMETERS = new Set<FxParameter>([
  'position', 'size', 'pitch', 'density', 'texture', 'mix', 'spread', 'feedback', 'reverb',
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
};


const MODE_INTERVALS: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  ionian: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
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

function midiFromNote(value: string): number | null {
  const match = value.match(NOTE);
  if (!match) return null;
  const [, rawName, accidental, rawOctave] = match;
  const name = `${rawName.toUpperCase()}${accidental}`;
  const pitchClass = NOTE_INDEX[name];
  if (pitchClass === undefined) return null;
  const octave = Number(rawOctave);
  return (octave + 1) * 12 + pitchClass;
}

function midiFromRoot(value: string, octave = 4): number | null {
  const match = value.match(NOTE_WITHOUT_OCTAVE);
  if (!match) return null;
  const [, rawName, accidental] = match;
  const name = `${rawName.toUpperCase()}${accidental}`;
  const pitchClass = NOTE_INDEX[name];
  if (pitchClass === undefined) return null;
  return (octave + 1) * 12 + pitchClass;
}

function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
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
): { values: number[]; display: string; mode: SelectionMode; amount: number } | null {
  const head = value.match(/^([A-Ga-g][#b]?)\s+([A-Za-z]+)(?:\s+with\s+(.+))?$/i);
  if (!head) return null;
  if (!MODE_INTERVALS[head[2].toLowerCase()]) return null;

  let rangeStart: string | null = null;
  let rangeEnd: string | null = null;
  let mode: SelectionMode = 'order';
  let amount = 0;
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

    const selection = parseSelectionMode([modifier], line, 'scale');
    if (selection.mode !== 'order') {
      if (!allowSelection) {
        throw new LanguageError([{
          line,
          message: `SET scale does not store sequencing modifier '${modifier}'; apply it where the scale is used`,
        }]);
      }
      if (selectionSeen) {
        throw new LanguageError([{ line, message: 'scale accepts only one sequencing modifier' }]);
      }
      mode = selection.mode;
      amount = selection.amount;
      selectionSeen = true;
      continue;
    }
  }

  const scale = scaleValues(head[1], head[2], rangeStart, rangeEnd, line);
  return { ...scale, mode, amount };
}

function parseScaleSource(value: string, line: number): { values: number[]; display: string } | null {
  const parsed = parseScaleSpec(value, line, false);
  return parsed ? { values: parsed.values, display: parsed.display } : null;
}

function sourceSequenceCode(voiceName: string, values: number[], mode: SelectionMode = 'order', amount = 0): string {
  const directive = values.length > 1 ? ` ${sequenceDirective(voiceName, values, mode, amount)}` : '';
  return `${voiceName}.freq(${values[0]});${directive}`;
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

function parseSelectionMode(modifiers: string[], line: number, property: string): SelectionSpec {
  let mode: SelectionMode = 'order';
  let amount = 0;
  let explicit = false;

  for (const modifier of modifiers) {
    const normalized = modifier.toLowerCase();

    if (['random', 'shuffle', 'reverse'].includes(normalized)) {
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

  return { mode, amount };
}

function parseTimingModifiers(modifiers: string[], line: number, unit: string): TimingModifiers {
  const result: TimingModifiers = { chance: 100, drift: false, loose: false };

  for (const modifier of modifiers) {
    const chance = modifier.match(/^chance\s+(.+)$/i);
    if (chance) {
      const value = numberValue(chance[1], line, 'chance');
      if (value < 0 || value > 100) {
        throw new LanguageError([{ line, message: 'chance must be between 0 and 100' }]);
      }
      result.chance = value;
      continue;
    }

    const normalized = modifier.toLowerCase();
    if (normalized === 'drift') {
      if (unit === 'beat') {
        throw new LanguageError([{ line, message: 'drift is available only for sec/ms timing; beat timing stays locked to the master clock' }]);
      }
      result.drift = true;
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

function sequenceDirective(name: string, values: number[], mode: SelectionMode, amount = 0): string {
  return `__sequence(${JSON.stringify(name)},${JSON.stringify(values.join('|'))},${JSON.stringify(mode)},${amount});`;
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

function parseGenerativeValue(value: string, line: number): GenerativeSpec {
  const match = value.match(/^(.*?)\s+with\s+(wander|trend|scatter|flutter)\s+(\d+(?:\.\d+)?)$/i);
  if (!match) return { base: value.trim(), mode: null, amount: 0 };
  const amount = numberValue(match[3], line, match[2].toLowerCase());
  if (amount <= 0) {
    throw new LanguageError([{ line, message: `${match[2].toLowerCase()} amount must be greater than 0` }]);
  }
  return { base: match[1].trim(), mode: match[2].toLowerCase() as GenerativeMode, amount };
}

function compileVoiceProperty(
  voice: VoiceState,
  property: string,
  rawValue: string,
  line: number,
  sourceKinds: Map<string, SourceKind>,
  sourceDefinitions: Map<string, SourceDefinition>,
  modSources: Map<string, ModSourceDefinition>,
): string {
  const key = property.toLowerCase();
  if (['harmo', 'timbre', 'morph'].includes(key)) {
    if (!voice.soundId) {
      throw new LanguageError([{ line, message: `${key} requires sound to be declared first` }]);
    }
    const parameter = SOUND_ENGINE_REGISTRY[voice.soundId]?.parameters[key];
    if (!parameter) {
      throw new LanguageError([{ line, message: `${key} is not available for ${voice.soundId}` }]);
    }
  }
  const value = rawValue.trim();



  if (['harmo', 'timbre', 'morph'].includes(key) && /^from\s+/i.test(value)) {
    const parameter = voice.soundId ? SOUND_ENGINE_REGISTRY[voice.soundId]?.parameters[key] : undefined;
    if (!parameter?.modulatable) {
      throw new LanguageError([{ line, message: `${key} is not modulatable for ${voice.soundId ?? 'this sound'}` }]);
    }
    const route = compileModulationRoute(voice, key, value, line, modSources);
    if (route) return route;
    throw new LanguageError([{ line, message: `${key} from expects MOD.output [with depth <value>]` }]);
  }


  if ((key === 'note' || key === 'freq' || key === 'scale' || key === 'cycle') && /^from\s+/i.test(value)) {
    if (key === 'scale') {
      const match = value.match(/^from\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+with\s+(.+))?$/i);
      if (!match) {
        throw new LanguageError([{ line, message: 'scale from expects a source name and optional sequencing modifier' }]);
      }
      const modifiers = (match[2] ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const selection = parseSelectionMode(modifiers, line, 'scale');
      const sourceName = match[1];
      const actual = sourceKinds.get(sourceName);
      const definition = sourceDefinitions.get(sourceName);
      if (!actual || !definition) {
        throw new LanguageError([{ line, message: `unknown source '${sourceName}'` }]);
      }
      if (definition.kind !== 'scale') {
        throw new LanguageError([{ line, message: `source '${sourceName}' is ${actual}, expected scale source for scale` }]);
      }
      return sourceSequenceCode(voice.name, definition.values, selection.mode, selection.amount);
    }

    const sourceName = value.replace(/^from\s+/i, '').trim();
    return compileFrom(voice, key, sourceName, line, sourceKinds, sourceDefinitions);
  }

  if (['harmo', 'timbre', 'morph'].includes(key)) {
    const schema = voice.soundId ? SOUND_ENGINE_REGISTRY[voice.soundId]?.parameters[key] : undefined;
    if (!schema) {
      throw new LanguageError([{ line, message: `${key} is not available for ${voice.soundId ?? 'this sound'}` }]);
    }

    const split = splitEveryClause(value);
    const generative = parseGenerativeValue(split.base, line);
    const expression = generative.base;
    if (!expression) {
      throw new LanguageError([{ line, message: `${key} expects a numeric expression` }]);
    }

    if (generative.mode) {
      if (split.every === null) {
        return `${voice.name}.${key}(${expression}); __genparamdefault("voice",${JSON.stringify(voice.name)},${JSON.stringify(key)},${JSON.stringify(expression)},${JSON.stringify(generative.mode)},${generative.amount});`;
      }
      const timing = parseEverySpec(split.every, line, sourceDefinitions);
      const prefix = timing.clockPrelude ? `${timing.clockPrelude} ` : '';
      return `${voice.name}.${key}(${expression}); ${prefix}__genparamcycle("voice",${JSON.stringify(voice.name)},${JSON.stringify(key)},${JSON.stringify(expression)},${JSON.stringify(generative.mode)},${generative.amount},${timing.amount},${JSON.stringify(timing.unit)},${timing.chance},${timing.drift},${timing.loose},${JSON.stringify(timing.clockSource)});`;
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
      const match = value.match(/^([a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*)(?:\s+with\s+(.+))?$/i);
      if (!match) {
        throw new LanguageError([{ line, message: 'sound expects engine.algorithm [with option, ...]' }]);
      }
      const soundId = match[1].toLowerCase();
      const schema = SOUND_ENGINE_REGISTRY[soundId];
      if (!schema) throw new LanguageError([{ line, message: `unknown sound '${soundId}'` }]);

      const options = (match[2] ?? '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
      const seen = new Set<string>();
      for (const option of options) {
        if (seen.has(option)) throw new LanguageError([{ line, message: `duplicate sound option '${option}'` }]);
        seen.add(option);
        if (!schema.options.has(option)) {
          throw new LanguageError([{ line, message: `${soundId} does not support sound option '${option}'` }]);
        }
      }
      voice.soundId = soundId;
      return `${voice.name}.model(${JSON.stringify(soundId)});\n${voice.name}.lpg(${seen.has('lpg')});`;
    }

    case 'note': {
      const split = splitEveryClause(value);
      const { base, modifiers } = splitWith(split.base);
      const notes = parseList(base, line, 'note');
      const frequencies = notes.map((note) => {
        const midi = midiFromNote(note);
        if (midi === null) throw new LanguageError([{ line, message: `invalid note '${note}'` }]);
        return midiToFrequency(midi);
      });
      const selection = parseSelectionMode(modifiers, line, 'note');
      if (frequencies.length === 1 && modifiers.length > 0) {
        throw new LanguageError([{ line, message: 'note selection modifiers require a list' }]);
      }
      const sequence = frequencies.length > 1 ? ` ${sequenceDirective(voice.name, frequencies, selection.mode, selection.amount)}` : '';
      const every = split.every ? ` ${everyDirective(voice.name, parseEverySpec(split.every, line, sourceDefinitions))}` : '';
      return `${voice.name}.freq(${frequencies[0]});${sequence}${every}`;
    }

    case 'freq': {
      const split = splitEveryClause(value);
      const { base, modifiers } = splitWith(split.base);
      const values = parseList(base, line, 'freq').map((item) => numberValue(item, line, 'freq'));
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
      const split = splitEveryClause(value);
      const parsed = parseScaleSpec(split.base, line, true);
      if (!parsed) {
        throw new LanguageError([{
          line,
          message: 'scale expects root and mode, optionally followed by with range <note> <note> and one sequencing modifier',
        }]);
      }
      const every = split.every ? ` ${everyDirective(voice.name, parseEverySpec(split.every, line, sourceDefinitions))}` : '';
      return `${sourceSequenceCode(voice.name, parsed.values, parsed.mode, parsed.amount)}${every}`;
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
};

function splitEveryClause(value: string): { base: string; every: string | null } {
  const match = value.match(/^(.*?)\s+every\s+(.+)$/i);
  if (!match) return { base: value.trim(), every: null };
  return { base: match[1].trim(), every: match[2].trim() };
}

function parseEverySpec(
  raw: string,
  line: number,
  sourceDefinitions: Map<string, SourceDefinition>,
): EverySpec {
  const { base, modifiers } = splitWith(raw.trim());

  let amount: number;
  let unit: 'ms' | 'sec' | 'beat';

  const literal = base.match(/^(\d+(?:\.\d+)?)\s+(ms|sec|secs|second|seconds|beat|beats)$/i);
  if (literal) {
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
    throw new LanguageError([{ line, message: 'every expects <time> or a SET time variable' }]);
  }

  if (amount <= 0) throw new LanguageError([{ line, message: 'every interval must be greater than 0' }]);
  if (unit === 'beat' && !Number.isInteger(amount)) {
    throw new LanguageError([{ line, message: 'beat timing currently requires a whole number of beats' }]);
  }

  let clockSource = 'Clock';
  let clockPrelude = '';
  const timingModifiers: string[] = [];

  for (const modifier of modifiers) {
    const clock = modifier.match(/^clock\s+(.+)$/i);
    if (!clock) {
      timingModifiers.push(modifier);
      continue;
    }
    if (unit !== 'beat') {
      throw new LanguageError([{ line, message: 'with clock is available only for beat-based every clauses' }]);
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
  return { amount, unit, ...timing, clockSource, clockPrelude };
}

function everyDirective(name: string, spec: EverySpec): string {
  const prefix = spec.clockPrelude ? `${spec.clockPrelude} ` : '';
  return `${prefix}__cycle(${JSON.stringify(name)},${spec.amount},${JSON.stringify(spec.unit)},${spec.chance},${spec.drift},${spec.loose},${JSON.stringify(spec.clockSource)});`;
}

function compileSet(
  lineText: string,
  line: number,
  sourceKinds: Map<string, SourceKind>,
  sourceDefinitions: Map<string, SourceDefinition>,
  scalarNames: Set<string>,
  voiceNames: Set<string>,
): string {
  const match = lineText.match(/^SET\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/i);
  if (!match) {
    throw new LanguageError([{ line, message: 'SET expects a name, colon, and value' }]);
  }

  const name = match[1];
  if (voiceNames.has(name) || scalarNames.has(name)) {
    throw new LanguageError([{ line, message: `duplicate object or variable: ${name}` }]);
  }

  const body = match[2].trim();

  const clockAlias = body.match(/^clock\s+([/*])\s*(\d+(?:\.\d+)?)(?:\s+with\s+(view))?$/i);
  if (clockAlias) {
    const n = numberValue(clockAlias[2], line, 'clock rate');
    if (n <= 0) throw new LanguageError([{ line, message: 'clock divisor/multiplier must be greater than 0' }]);
    const label = `${clockAlias[1]}${formatSourceNumber(n)}`;
    scalarNames.add(name);
    sourceKinds.set(name, 'clock');
    sourceDefinitions.set(name, { kind: 'clock', internalName: name, rateLabel: label, display: `clock ${label}` });
    const view = clockAlias[3] ? '.view()' : '';
    return `${name} = Clock.rate(${JSON.stringify(label)})${view};`;
  }

  const scale = parseScaleSource(body, line);
  if (scale) {
    scalarNames.add(name);
    sourceKinds.set(name, 'scale');
    sourceDefinitions.set(name, { kind: 'scale', values: scale.values, display: scale.display });
    return `${name} = ${JSON.stringify(scale.display)};`;
  }

  const noteList = body.match(/^\[([^\]]+)\]$/);
  if (noteList) {
    const items = noteList[1].trim().split(/\s+/).filter(Boolean);
    if (items.length > 0 && items.every((item) => midiFromNote(item) !== null)) {
      const values = items.map((item) => midiToFrequency(midiFromNote(item)!));
      scalarNames.add(name);
      sourceKinds.set(name, 'note');
      sourceDefinitions.set(name, { kind: 'note', values, display: `[${items.join(' ')}]` });
      return `${name} = ${JSON.stringify(`[${items.join(' ')}]`)};`;
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
    sourceDefinitions.set(name, { kind: 'freq', values, display: `[${items.join(' ')}] hz` });
    return `${name} = ${JSON.stringify(`[${items.join(' ')}] hz`)};`;
  }

  const note = body.match(/^([A-Ga-g][#b]?-?\d+)$/);
  if (note) {
    const midi = midiFromNote(note[1]);
    if (midi === null) throw new LanguageError([{ line, message: `invalid note '${note[1]}'` }]);
    const frequency = midiToFrequency(midi);
    scalarNames.add(name);
    sourceKinds.set(name, 'note');
    sourceDefinitions.set(name, { kind: 'note', values: [frequency], display: note[1] });
    return `${name} = ${JSON.stringify(note[1])};`;
  }

  const frequency = body.match(/^(\d+(?:\.\d+)?)\s+hz$/i);
  if (frequency) {
    const value = numberValue(frequency[1], line, 'frequency');
    if (value <= 0) throw new LanguageError([{ line, message: 'frequency must be greater than 0' }]);
    scalarNames.add(name);
    sourceKinds.set(name, 'freq');
    sourceDefinitions.set(name, { kind: 'freq', values: [value], display: `${formatSourceNumber(value)} hz` });
    return `${name} = ${value};`;
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
    sourceDefinitions.set(name, { kind: 'time', amount, unit, display });
    return `${name} = ${JSON.stringify(display)};`;
  }

  const cycleMatch = body.match(
    /^(.*)\s+cycle\s+(\d+(?:\.\d+)?)\s+(ms|sec|secs|second|seconds|beat|beats)(?:\s+with\s+(.+))?$/i,
  );

  const expression = (cycleMatch ? cycleMatch[1] : body).trim();
  if (!expression) {
    throw new LanguageError([{ line, message: 'SET expects a scalar expression' }]);
  }

  scalarNames.add(name);
  sourceKinds.set(name, 'scalar');
  sourceDefinitions.set(name, { kind: 'scalar' });

  if (!cycleMatch) return `${name} = ${expression};`;

  const amount = numberValue(cycleMatch[2], line, 'cycle');
  if (amount <= 0) {
    throw new LanguageError([{ line, message: 'cycle interval must be greater than 0' }]);
  }

  const unit = normalizeCycleUnit(cycleMatch[3], line);
  if (unit === 'beat' && !Number.isInteger(amount)) {
    throw new LanguageError([{ line, message: 'beat cycles currently require a whole number of beats' }]);
  }

  const modifiers = (cycleMatch[4] ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const timing = parseTimingModifiers(modifiers, line, unit);

  return `${name} = ${expression}; __setcycle(${JSON.stringify(name)},${amount},${JSON.stringify(unit)},${timing.chance},${timing.drift},${timing.loose});`;
}


function compileClock(lineText: string, line: number): string {
  const match = lineText.match(/^CLOCK\s+set\s+(.+?)\s+bpm(?:\s+with\s+(.+))?$/i);
  if (!match) {
    throw new LanguageError([{
      line,
      message: 'CLOCK expects: CLOCK set <expression> bpm [with cycle <n> <unit>, drift]',
    }]);
  }

  const expression = match[1].trim();
  if (!expression) {
    throw new LanguageError([{ line, message: 'CLOCK set expects a BPM expression' }]);
  }

  let cycleAmount: number | null = null;
  let cycleUnit: 'ms' | 'sec' | 'beat' | null = null;
  let drift = false;

  const modifiers = (match[2] ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  for (const modifier of modifiers) {
    const cycle = modifier.match(/^cycle\s+(\d+(?:\.\d+)?)\s+(ms|sec|secs|second|seconds|beat|beats)$/i);
    if (cycle) {
      if (cycleAmount !== null) {
        throw new LanguageError([{ line, message: 'CLOCK accepts only one cycle modifier' }]);
      }
      cycleAmount = numberValue(cycle[1], line, 'CLOCK cycle');
      if (cycleAmount <= 0) {
        throw new LanguageError([{ line, message: 'CLOCK cycle must be greater than 0' }]);
      }
      cycleUnit = normalizeCycleUnit(cycle[2], line);
      if (cycleUnit === 'beat' && !Number.isInteger(cycleAmount)) {
        throw new LanguageError([{ line, message: 'CLOCK beat cycles currently require a whole number of beats' }]);
      }
      continue;
    }

    if (/^drift$/i.test(modifier)) {
      drift = true;
      continue;
    }

    throw new LanguageError([{ line, message: `CLOCK does not support modifier '${modifier}'` }]);
  }

  if (cycleAmount === null || cycleUnit === null) {
    return `__masterclock(${JSON.stringify(expression)},0,"ms",${drift});`;
  }

  return `__masterclock(${JSON.stringify(expression)},${cycleAmount},${JSON.stringify(cycleUnit)},${drift});`;
}


function modSourceKey(ownerVoice: string | null, name: string): string {
  return ownerVoice ? `${ownerVoice}:${name}` : name;
}

function compileModProperty(mod: ModState, property: string, rawValue: string, line: number): string {
  const key = property.toLowerCase();
  const value = rawValue.trim();

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
  const match = value.match(/^from\s+([A-Za-z_][A-Za-z0-9_]*)\.([a-d])(?:\s+with\s+depth\s+(-?\d+(?:\.\d+)?))?$/i);
  if (!match) return null;
  const source = modSources.get(modSourceKey(voice.name, match[1])) ?? modSources.get(match[1]);
  if (!source) throw new LanguageError([{ line, message: `unknown MOD source '${match[1]}'` }]);
  const depth = match[3] === undefined ? 100 : Number(match[3]);
  if (!Number.isFinite(depth) || depth < -100 || depth > 100) {
    throw new LanguageError([{ line, message: 'modulation depth must be between -100 and 100' }]);
  }
  const port = ({ a: 1, b: 2, c: 3, d: 4 } as const)[match[2].toLowerCase() as 'a'|'b'|'c'|'d'];
  return `${source.internalName}.out${port}(${depth}) -> ${voice.name}.${parameter};`;
}


function compileFxModulation(
  fx: FxState,
  parameter: FxParameter,
  value: string,
  line: number,
  modSources: Map<string, ModSourceDefinition>,
): string | null {
  const match = value.match(/^from\s+([A-Za-z_][A-Za-z0-9_]*)\.([a-d])(?:\s+with\s+depth\s+(-?\d+(?:\.\d+)?))?$/i);
  if (!match) return null;
  const source = modSources.get(modSourceKey(fx.name, match[1])) ?? modSources.get(match[1]);
  if (!source) throw new LanguageError([{ line, message: `unknown MOD source '${match[1]}'` }]);
  const depth = match[3] === undefined ? 100 : Number(match[3]);
  if (!Number.isFinite(depth) || depth < -100 || depth > 100) {
    throw new LanguageError([{ line, message: 'modulation depth must be between -100 and 100' }]);
  }
  const channel = ({ a: 1, b: 2, c: 3, d: 4 } as const)[match[2].toLowerCase() as 'a'|'b'|'c'|'d'];
  return `__fxmod(${JSON.stringify(fx.name)},${JSON.stringify(parameter)},${JSON.stringify(source.internalName)},${channel},${depth});`;
}

function requireFxModel(fx: FxState | null, diagnostics: LanguageDiagnostic[]): void {
  if (fx && !fx.hasModel) diagnostics.push({ line: fx.line, message: `FX '${fx.name}' requires model` });
}

function semitonesFromFrequency(frequency: number): number {
  const c4 = midiToFrequency(60);
  return 12 * Math.log2(frequency / c4);
}

function fxPitchSequenceDirective(name: string, values: number[], mode: SelectionMode, amount = 0): string {
  return `__fxsequence(${JSON.stringify(name)},${JSON.stringify(values.join('|'))},${JSON.stringify(mode)},${amount});`;
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

  if (key === 'model') {
    const modelId = value.toLowerCase();
    const schema = FX_MODEL_REGISTRY[modelId];
    if (!schema) throw new LanguageError([{ line, message: `unknown FX model '${modelId}'` }]);
    fx.modelId = modelId;
    fx.hasModel = true;
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

  if (key === 'freeze' || key === 'reverse') {
    if (!/^(on|off|true|false)$/i.test(value)) {
      throw new LanguageError([{ line, message: `${key} expects on or off` }]);
    }
    const enabled = /^(on|true)$/i.test(value);
    return `${fx.name}.${key}(${enabled});`;
  }

  if (key === 'note' || key === 'scale' || key === 'freq') {
    if (!schema.musicalPitch) {
      throw new LanguageError([{ line, message: `${key} is not available for ${fx.modelId}` }]);
    }

    const split = splitEveryClause(value);
    let pitchValues: number[] = [];
    let mode: SelectionMode = 'order';
    let selectionAmount = 0;

    if (key === 'note') {
      const parsed = splitWith(split.base);
      const notes = parseList(parsed.base, line, 'note');
      pitchValues = notes.map((note) => {
        const midi = midiFromNote(note);
        if (midi === null) throw new LanguageError([{ line, message: `invalid note '${note}'` }]);
        return midi - 60;
      });
      { const selection = parseSelectionMode(parsed.modifiers, line, 'note'); mode = selection.mode; selectionAmount = selection.amount; }
    } else if (key === 'freq') {
      const parsed = splitWith(split.base);
      const frequencies = parseList(parsed.base, line, 'freq').map((item) => numberValue(item, line, 'freq'));
      if (frequencies.some((frequency) => frequency <= 0)) {
        throw new LanguageError([{ line, message: 'freq must be greater than 0' }]);
      }
      pitchValues = frequencies.map(semitonesFromFrequency);
      { const selection = parseSelectionMode(parsed.modifiers, line, 'freq'); mode = selection.mode; selectionAmount = selection.amount; }
    } else {
      const parsed = parseScaleSpec(split.base, line, true);
      if (!parsed) throw new LanguageError([{ line, message: 'scale expects root and mode with optional range and sequencing modifier' }]);
      pitchValues = parsed.values.map(semitonesFromFrequency);
      mode = parsed.mode;
      selectionAmount = parsed.amount;
    }

    if (pitchValues.some((pitch) => pitch < -48 || pitch > 48)) {
      throw new LanguageError([{ line, message: 'FX musical pitch must resolve inside -48..48 semitones relative to C4' }]);
    }

    const sequence = pitchValues.length > 1 ? ` ${fxPitchSequenceDirective(fx.name, pitchValues, mode, selectionAmount)}` : '';
    const every = split.every
      ? (() => {
          const timing = parseEverySpec(split.every!, line, sourceDefinitions);
          const prefix = timing.clockPrelude ? ` ${timing.clockPrelude}` : '';
          return `${prefix} __fxpitchcycle(${JSON.stringify(fx.name)},${timing.amount},${JSON.stringify(timing.unit)},${timing.chance},${timing.drift},${timing.loose},${JSON.stringify(timing.clockSource)});`;
        })()
      : '';
    return `${fx.name}.pitch(${pitchValues[0]});${sequence}${every}`;
  }

  if (!schema.parameters.has(key as FxParameter)) {
    throw new LanguageError([{ line, message: `unknown FX property '${property}' for ${fx.modelId}` }]);
  }

  const parameter = key as FxParameter;
  const modulation = /^from\s+/i.test(value) ? compileFxModulation(fx, parameter, value, line, modSources) : null;
  if (modulation) return modulation;

  const split = splitEveryClause(value);
  const generative = parseGenerativeValue(split.base, line);
  const expression = generative.base;
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
      return `${initial} ${prefix}__genparamcycle("fx",${JSON.stringify(fx.name)},${JSON.stringify(parameter)},${JSON.stringify(expression)},${JSON.stringify(generative.mode)},${generative.amount},${timing.amount},${JSON.stringify(timing.unit)},${timing.chance},${timing.drift},${timing.loose},${JSON.stringify(timing.clockSource)});`;
    }
    return `${initial} __genparamdefault("fx",${JSON.stringify(fx.name)},${JSON.stringify(parameter)},${JSON.stringify(expression)},${JSON.stringify(generative.mode)},${generative.amount});`;
  }

  if (split.every) {
    const timing = parseEverySpec(split.every, line, sourceDefinitions);
    const prefix = timing.clockPrelude ? `${timing.clockPrelude} ` : '';
    return `${initial} ${prefix}__fxparamcycle(${JSON.stringify(fx.name)},${JSON.stringify(parameter)},${JSON.stringify(expression)},${timing.amount},${JSON.stringify(timing.unit)},${timing.chance},${timing.drift},${timing.loose},${JSON.stringify(timing.clockSource)});`;
  }
  return `${initial} __fxparamdefault(${JSON.stringify(fx.name)},${JSON.stringify(parameter)},${JSON.stringify(expression)});`;
}

type PlayEndpoint = {
  name: string;
  channel: 'L' | 'R' | null;
  port: 'out' | 'aux' | null;
  amount: number;
};

function parsePlayEndpoint(raw: string, line: number): PlayEndpoint {
  const match = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\.(out|aux|L|R))?(?:\s+at\s+(.+))?$/i);
  if (!match) throw new LanguageError([{ line, message: `invalid PLAY endpoint '${raw.trim()}'` }]);
  const suffix = match[2]?.toLowerCase() ?? null;
  return {
    name: match[1],
    port: suffix === 'out' || suffix === 'aux' ? suffix : null,
    channel: suffix === 'l' ? 'L' : suffix === 'r' ? 'R' : null,
    amount: match[3] === undefined ? 100 : normalizedAmount(match[3].trim(), line),
  };
}

function compilePlay(
  lineText: string,
  line: number,
  voices: Set<string>,
  fxs: Set<string>,
): string {
  const body = lineText.trim().replace(/^PLAY\s+/i, '');
  if (body === lineText.trim()) throw new LanguageError([{ line, message: 'PLAY expects a source' }]);

  const pieces = body.split(/\s+(through|then)\s+/i);
  if (pieces.length < 3 || pieces[1].toLowerCase() !== 'through' || pieces.length % 2 === 0) {
    throw new LanguageError([{ line, message: 'PLAY expects source through destination [then destination ...]' }]);
  }

  const endpoints: PlayEndpoint[] = [];
  const separators: string[] = [];
  for (let index = 0; index < pieces.length; index += 2) {
    endpoints.push(parsePlayEndpoint(pieces[index], line));
    if (index + 1 < pieces.length) separators.push(pieces[index + 1].toLowerCase());
  }
  if (separators.slice(1).some((separator) => separator !== 'then')) {
    throw new LanguageError([{ line, message: "after the first 'through', PLAY chains use 'then'" }]);
  }

  const kindOf = (name: string): 'voice' | 'fx' | 'main' => {
    if (voices.has(name)) return 'voice';
    if (fxs.has(name)) return 'fx';
    if (name.toUpperCase() === 'MAIN') return 'main';
    throw new LanguageError([{ line, message: `unknown PLAY object '${name}'` }]);
  };

  const routes: string[] = [];
  for (let edge = 0; edge < endpoints.length - 1; edge += 1) {
    const source = endpoints[edge];
    const target = endpoints[edge + 1];
    const sourceKind = kindOf(source.name);
    const targetKind = kindOf(target.name);
    if (sourceKind === 'main') throw new LanguageError([{ line, message: 'MAIN cannot be used as a PLAY source' }]);
    if (targetKind === 'voice') throw new LanguageError([{ line, message: 'VOICE cannot be used as an audio destination' }]);
    if (target.port) throw new LanguageError([{ line, message: 'destination uses .L/.R channel selectors, not .out/.aux' }]);
    if (sourceKind === 'fx' && source.port) throw new LanguageError([{ line, message: 'FX outputs use .L/.R, not .out/.aux' }]);
    if (sourceKind === 'voice' && source.channel) throw new LanguageError([{ line, message: 'VOICE outputs use .out/.aux; .L/.R are for stereo FX' }]);

    const amount = source.amount;
    const sourceMono = sourceKind === 'voice' || source.channel !== null;
    const sourceMonoSignal = sourceKind === 'voice'
      ? `${source.name}.${source.port ?? 'out'}`
      : `${source.name}.${source.channel === 'R' ? 'out_R' : 'out_L'}`;

    if (targetKind === 'main') {
      if (target.channel) {
        if (!sourceMono) throw new LanguageError([{ line, message: `stereo FX '${source.name}' must select .L or .R when routing to MAIN.${target.channel}` }]);
        routes.push(`${sourceMonoSignal}(${amount}) -> Audio.out_${target.channel};`);
      } else if (sourceMono) {
        routes.push(`${sourceMonoSignal}(${amount}) -> Audio.out;`);
      } else {
        routes.push(`${source.name}.out_L(${amount}) -> Audio.out_L;`);
        routes.push(`${source.name}.out_R(${amount}) -> Audio.out_R;`);
      }
      continue;
    }

    // Target is stereo FX.
    if (target.channel) {
      if (!sourceMono) throw new LanguageError([{ line, message: `stereo FX '${source.name}' must select .L or .R when routing to ${target.name}.${target.channel}` }]);
      routes.push(`${sourceMonoSignal}(${amount}) -> ${target.name}.in${target.channel};`);
    } else if (sourceMono) {
      // Mono convenience input duplicates to both channels in the Mist engine.
      routes.push(`${sourceMonoSignal}(${amount}) -> ${target.name}.in;`);
    } else {
      routes.push(`${source.name}.out_L(${amount}) -> ${target.name}.inL;`);
      routes.push(`${source.name}.out_R(${amount}) -> ${target.name}.inR;`);
    }
  }

  if (endpoints[endpoints.length - 1].amount !== 100) {
    throw new LanguageError([{ line, message: "'at' belongs to the outgoing route; the final PLAY destination cannot have 'at'" }]);
  }

  return routes.join('\n');
}


function requireVoiceSound(voice: VoiceState | null, diagnostics: LanguageDiagnostic[]): void {
  if (voice && !voice.hasSound) {
    diagnostics.push({ line: voice.line, message: `VOICE '${voice.name}' requires sound` });
  }
}

export function compileLanguageSource(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');

  // PLAY continuations are physical lines beginning with indented THROUGH/THEN.
  // Collapse them onto the first line for parsing while preserving output line count.
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*PLAY\b/i.test(stripComment(lines[index]).trimStart())) continue;
    let combined = stripComment(lines[index]).trim();
    let next = index + 1;
    while (next < lines.length) {
      const continuationRaw = stripComment(lines[next]);
      const continuation = continuationRaw.trim();
      const indentation = continuationRaw.length - continuationRaw.trimStart().length;
      if (indentation <= 0 || !/^(through|then)\b/i.test(continuation)) break;
      combined += ` ${continuation}`;
      lines[next] = '';
      next += 1;
    }
    lines[index] = combined;
  }

  const output = Array(lines.length).fill('') as string[];
  const diagnostics: LanguageDiagnostic[] = [];
  const voices = new Set<string>();
  const fxs = new Set<string>();
  const scalarNames = new Set<string>();
  const sourceKinds = new Map<string, SourceKind>();
  const sourceDefinitions = new Map<string, SourceDefinition>();
  const modSources = new Map<string, ModSourceDefinition>();
  let currentVoice: VoiceState | null = null;
  let currentFx: FxState | null = null;
  let currentMod: ModState | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const raw = lines[index];
    const withoutComment = stripComment(raw);
    const trimmed = withoutComment.trim();

    if (!trimmed) {
      output[index] = '';
      continue;
    }

    const indentation = withoutComment.length - withoutComment.trimStart().length;

    try {
      if (currentMod && indentation <= currentMod.indentation) currentMod = null;

      const modMatch = trimmed.match(/^MOD\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+with\s+(view))?\s*:\s*$/i);
      if (modMatch) {
        const name = modMatch[1];
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
          if (voices.has(name) || fxs.has(name) || scalarNames.has(name)) {
            throw new LanguageError([{ line: lineNumber, message: `MOD '${name}' conflicts with an existing object or variable` }]);
          }
        }
        const scopeKey = modSourceKey(ownerObject, name);
        if (modSources.has(scopeKey)) throw new LanguageError([{ line: lineNumber, message: `MOD '${name}' is already defined in this scope` }]);
        const internalName = ownerObject ? `__mod_${ownerObject}_${name}` : name;
        currentMod = { name, internalName, line: lineNumber, indentation, ownerVoice: ownerObject };
        modSources.set(scopeKey, { internalName, ownerVoice: ownerObject });
        const viewDirective = modMatch[2] ? `\n${internalName}.view();` : '';
        output[index] = `${internalName} = Swell();\n__modmeta(${JSON.stringify(internalName)},${JSON.stringify(name)},${JSON.stringify(ownerObject ?? '')});${viewDirective}`;
        continue;
      }

      if (currentMod && indentation > currentMod.indentation) {
        const propertyMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/);
        if (!propertyMatch) throw new LanguageError([{ line: lineNumber, message: 'expected MOD property and value' }]);
        output[index] = compileModProperty(currentMod, propertyMatch[1], propertyMatch[2], lineNumber);
        continue;
      }

      const fxMatch = trimmed.match(/^FX\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+with\s+(view))?\s*:\s*$/i);
      if (fxMatch) {
        if (indentation > 0) throw new LanguageError([{ line: lineNumber, message: 'FX declarations are top-level only' }]);
        requireVoiceSound(currentVoice, diagnostics);
        requireFxModel(currentFx, diagnostics);
        currentVoice = null;
        currentMod = null;
        const name = fxMatch[1];
        if (fxs.has(name) || voices.has(name) || scalarNames.has(name)) {
          throw new LanguageError([{ line: lineNumber, message: `FX '${name}' is already defined` }]);
        }
        fxs.add(name);
        currentFx = { name, line: lineNumber, indentation, hasModel: false, modelId: null };
        const viewDirective = fxMatch[2] ? `\n${name}.view();` : '';
        output[index] = `${name} = Mist();\n__fxmeta(${JSON.stringify(name)});${viewDirective}`;
        continue;
      }

      const voiceMatch = trimmed.match(/^VOICE\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+with\s+(view))?\s*:\s*$/i);
      if (voiceMatch) {
        requireVoiceSound(currentVoice, diagnostics);
        requireFxModel(currentFx, diagnostics);
        currentFx = null;
        const name = voiceMatch[1];
        if (voices.has(name) || fxs.has(name) || scalarNames.has(name)) {
          throw new LanguageError([{ line: lineNumber, message: `VOICE '${name}' is already defined` }]);
        }
        voices.add(name);
        sourceKinds.set(name, 'voice');
        currentVoice = { name, line: lineNumber, hasSound: false, soundId: null };
        output[index] = voiceMatch[2] ? `${name} = Voice();\n${name}.view();` : `${name} = Voice();`;
        continue;
      }

      if (/^CLOCK\b/i.test(trimmed)) {
        requireVoiceSound(currentVoice, diagnostics);
        requireFxModel(currentFx, diagnostics);
        currentVoice = null;
        currentFx = null;
        output[index] = compileClock(trimmed, lineNumber);
        continue;
      }

      if (/^SET\b/i.test(trimmed)) {
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
          new Set([...voices, ...fxs]),
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

      if (/^PLAY\b/i.test(trimmed)) {
        requireVoiceSound(currentVoice, diagnostics);
        requireFxModel(currentFx, diagnostics);
        currentVoice = null;
        currentFx = null;
        output[index] = compilePlay(trimmed, lineNumber, voices, fxs);
        continue;
      }

      if (indentation > 0 && currentFx) {
        const propertyMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/);
        if (!propertyMatch) {
          throw new LanguageError([{ line: lineNumber, message: 'expected FX property and value' }]);
        }
        output[index] = compileFxProperty(currentFx, propertyMatch[1], propertyMatch[2], lineNumber, sourceDefinitions, modSources);
        continue;
      }

      if (indentation > 0 && currentVoice) {
        const propertyMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/);
        if (!propertyMatch) {
          throw new LanguageError([{ line: lineNumber, message: 'expected VOICE property and value' }]);
        }
        output[index] = compileVoiceProperty(currentVoice, propertyMatch[1], propertyMatch[2], lineNumber, sourceKinds, sourceDefinitions, modSources);
        if (propertyMatch[1].toLowerCase() === 'sound') currentVoice.hasSound = true;
        continue;
      }

      if (/^[A-Za-z_][A-Za-z0-9_]*\s*:/.test(trimmed)) {
        throw new LanguageError([{ line: lineNumber, message: 'only VOICE, FX and MOD blocks are supported' }]);
      }

      throw new LanguageError([{
        line: lineNumber,
        message: 'each top-level statement must begin with VOICE, FX, MOD, SET, CLOCK, MAIN, or PLAY',
      }]);
    } catch (error) {
      if (error instanceof LanguageError) diagnostics.push(...error.diagnostics);
      else throw error;
    }
  }

  requireVoiceSound(currentVoice, diagnostics);
  requireFxModel(currentFx, diagnostics);

  if (diagnostics.length > 0) throw new LanguageError(diagnostics);
  return output.join('\n');
}
