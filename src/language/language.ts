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

type SourceKind = 'voice' | 'note' | 'freq' | 'time' | 'trigger' | 'scalar' | 'scale';

type SourceDefinition =
  | { kind: 'scalar' }
  | { kind: 'time'; amount: number; unit: 'ms' | 'sec' | 'beat'; display: string }
  | { kind: 'freq'; values: number[]; display: string }
  | { kind: 'note'; values: number[]; display: string }
  | { kind: 'scale'; values: number[]; display: string };

type VoiceState = {
  name: string;
  line: number;
  hasSound: boolean;
  soundId: string | null;
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
): { values: number[]; display: string; mode: SelectionMode } | null {
  const head = value.match(/^([A-Ga-g][#b]?)\s+([A-Za-z]+)(?:\s+with\s+(.+))?$/i);
  if (!head) return null;
  if (!MODE_INTERVALS[head[2].toLowerCase()]) return null;

  let rangeStart: string | null = null;
  let rangeEnd: string | null = null;
  let mode: SelectionMode = 'order';
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

    const normalized = modifier.toLowerCase();
    if (['random', 'walk', 'shuffle', 'reverse'].includes(normalized)) {
      if (!allowSelection) {
        throw new LanguageError([{
          line,
          message: `SET scale does not store sequencing modifier '${modifier}'; apply it where the scale is used`,
        }]);
      }
      if (selectionSeen) {
        throw new LanguageError([{ line, message: 'scale accepts only one sequencing modifier' }]);
      }
      mode = normalized as SelectionMode;
      selectionSeen = true;
      continue;
    }

    throw new LanguageError([{ line, message: `scale does not support modifier '${modifier}'` }]);
  }

  const scale = scaleValues(head[1], head[2], rangeStart, rangeEnd, line);
  return { ...scale, mode };
}

function parseScaleSource(value: string, line: number): { values: number[]; display: string } | null {
  const parsed = parseScaleSpec(value, line, false);
  return parsed ? { values: parsed.values, display: parsed.display } : null;
}

function sourceSequenceCode(voiceName: string, values: number[], mode: SelectionMode = 'order'): string {
  const directive = values.length > 1 ? ` ${sequenceDirective(voiceName, values, mode)}` : '';
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

function parseSelectionMode(modifiers: string[], line: number, property: string): SelectionMode {
  let mode: SelectionMode = 'order';
  let explicit = false;

  for (const modifier of modifiers) {
    const normalized = modifier.toLowerCase();
    if (!['random', 'walk', 'shuffle', 'reverse'].includes(normalized)) {
      throw new LanguageError([{ line, message: `${property} does not support modifier '${modifier}'` }]);
    }
    if (explicit) {
      throw new LanguageError([{ line, message: `${property} accepts only one selection modifier` }]);
    }
    mode = normalized as SelectionMode;
    explicit = true;
  }
  return mode;
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
        throw new LanguageError([{ line, message: 'drift is available only for sec/ms cycles; beat cycles stay locked to the master clock' }]);
      }
      result.drift = true;
      continue;
    }
    if (normalized === 'loose') {
      result.loose = true;
      continue;
    }
    throw new LanguageError([{ line, message: `cycle does not support modifier '${modifier}'` }]);
  }

  return result;
}

function sequenceDirective(name: string, values: number[], mode: SelectionMode): string {
  return `__sequence(${JSON.stringify(name)},${JSON.stringify(values.join('|'))},${JSON.stringify(mode)});`;
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
      const mode = parseSelectionMode(modifiers, line, 'scale');
      const sourceName = match[1];
      const actual = sourceKinds.get(sourceName);
      const definition = sourceDefinitions.get(sourceName);
      if (!actual || !definition) {
        throw new LanguageError([{ line, message: `unknown source '${sourceName}'` }]);
      }
      if (definition.kind !== 'scale') {
        throw new LanguageError([{ line, message: `source '${sourceName}' is ${actual}, expected scale source for scale` }]);
      }
      return sourceSequenceCode(voice.name, definition.values, mode);
    }

    const sourceName = value.replace(/^from\s+/i, '').trim();
    return compileFrom(voice, key, sourceName, line, sourceKinds, sourceDefinitions);
  }

  if (['harmo', 'timbre', 'morph'].includes(key)) {
    const schema = voice.soundId ? SOUND_ENGINE_REGISTRY[voice.soundId]?.parameters[key] : undefined;
    if (!schema) {
      throw new LanguageError([{ line, message: `${key} is not available for ${voice.soundId ?? 'this sound'}` }]);
    }

    const cycleMatch = value.match(
      /^(.*?)\s+cycle\s+(\d+(?:\.\d+)?)\s+(ms|sec|secs|second|seconds|beat|beats)(?:\s+with\s+(.+))?$/i,
    );
    const expression = (cycleMatch ? cycleMatch[1] : value).trim();
    if (!expression) {
      throw new LanguageError([{ line, message: `${key} expects a numeric expression` }]);
    }

    if (!cycleMatch) {
      return `${voice.name}.${key}(${expression});`;
    }

    const amount = numberValue(cycleMatch[2], line, `${key} cycle`);
    if (amount <= 0) {
      throw new LanguageError([{ line, message: `${key} cycle interval must be greater than 0` }]);
    }
    const unit = normalizeCycleUnit(cycleMatch[3], line);
    if (unit === 'beat' && !Number.isInteger(amount)) {
      throw new LanguageError([{ line, message: `${key} beat cycles currently require a whole number of beats` }]);
    }

    const modifiers = (cycleMatch[4] ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const timing = parseTimingModifiers(modifiers, line, unit);

    return `${voice.name}.${key}(${expression}); __paramcycle(${JSON.stringify(voice.name)},${JSON.stringify(key)},${JSON.stringify(expression)},${amount},${JSON.stringify(unit)},${timing.chance},${timing.drift},${timing.loose});`;
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
      const { base, modifiers } = splitWith(value);
      const notes = parseList(base, line, 'note');
      const frequencies = notes.map((note) => {
        const midi = midiFromNote(note);
        if (midi === null) throw new LanguageError([{ line, message: `invalid note '${note}'` }]);
        return midiToFrequency(midi);
      });
      const mode = parseSelectionMode(modifiers, line, 'note');
      if (frequencies.length === 1 && modifiers.length > 0) {
        throw new LanguageError([{ line, message: 'note selection modifiers require a list' }]);
      }
      const directive = frequencies.length > 1 ? ` ${sequenceDirective(voice.name, frequencies, mode)}` : '';
      return `${voice.name}.freq(${frequencies[0]});${directive}`;
    }

    case 'freq': {
      const { base, modifiers } = splitWith(value);
      const values = parseList(base, line, 'freq').map((item) => numberValue(item, line, 'freq'));
      if (values.some((item) => item <= 0)) {
        throw new LanguageError([{ line, message: 'freq must be greater than 0' }]);
      }
      const mode = parseSelectionMode(modifiers, line, 'freq');
      if (values.length === 1 && modifiers.length > 0) {
        throw new LanguageError([{ line, message: 'freq selection modifiers require a list' }]);
      }
      const directive = values.length > 1 ? ` ${sequenceDirective(voice.name, values, mode)}` : '';
      return `${voice.name}.freq(${values[0]});${directive}`;
    }

    case 'scale': {
      const parsed = parseScaleSpec(value, line, true);
      if (!parsed) {
        throw new LanguageError([{
          line,
          message: 'scale expects root and mode, optionally followed by with range <note> <note> and one sequencing modifier',
        }]);
      }
      return sourceSequenceCode(voice.name, parsed.values, parsed.mode);
    }

    case 'cycle': {
      const { base, modifiers } = splitWith(value);
      const parts = base.split(/\s+/).filter(Boolean);
      if (parts.length !== 2) {
        throw new LanguageError([{ line, message: 'cycle expects a number followed by ms, sec, beat, or beats' }]);
      }
      const amount = numberValue(parts[0], line, 'cycle');
      if (amount <= 0) {
        throw new LanguageError([{ line, message: 'cycle interval must be greater than 0' }]);
      }

      const rawUnit = parts[1].toLowerCase();
      const unit = rawUnit === 'ms'
        ? 'ms'
        : rawUnit === 'sec' || rawUnit === 'secs' || rawUnit === 'second' || rawUnit === 'seconds'
          ? 'sec'
          : rawUnit === 'beat' || rawUnit === 'beats'
            ? 'beat'
            : null;
      if (!unit) {
        throw new LanguageError([{ line, message: `unknown cycle unit '${parts[1]}'` }]);
      }
      if (unit === 'beat' && !Number.isInteger(amount)) {
        throw new LanguageError([{ line, message: 'beat cycles currently require a whole number of beats' }]);
      }

      const timing = parseTimingModifiers(modifiers, line, unit);
      return `__cycle(${JSON.stringify(voice.name)},${amount},${JSON.stringify(unit)},${timing.chance},${timing.drift},${timing.loose});`;
    }

    case 'level': {
      const level = numberValue(value, line, 'level');
      if (level < 0 || level > 100) {
        throw new LanguageError([{ line, message: 'level must be between 0 and 100' }]);
      }
      return `${voice.name}.level(${level});`;
    }

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

function compilePlay(lineText: string, line: number): string {
  const match = lineText.trim().match(
    /^PLAY\s+([A-Za-z_][A-Za-z0-9_]*)(?:\.(out|aux))?(?:\s+at\s+(.+?))?\s+through\s+MAIN(?:\.(L|R))?$/i,
  );
  if (!match) {
    throw new LanguageError([{
      line,
      message: 'PLAY expects: PLAY <voice>[.out|.aux] [at <value>] through MAIN[.L|.R]',
    }]);
  }

  const name = match[1];
  const sourcePort = (match[2] ?? 'out').toLowerCase();
  const amount = match[3] === undefined ? 100 : normalizedAmount(match[3].trim(), line);
  const targetChannel = match[4]?.toUpperCase() ?? null;
  const source = `${name}.${sourcePort}`;
  const target = targetChannel === 'L' ? 'Audio.out_L' : targetChannel === 'R' ? 'Audio.out_R' : 'Audio.out';
  return `${source}(${amount}) -> ${target};`;
}

function requireVoiceSound(voice: VoiceState | null, diagnostics: LanguageDiagnostic[]): void {
  if (voice && !voice.hasSound) {
    diagnostics.push({ line: voice.line, message: `VOICE '${voice.name}' requires sound` });
  }
}

export function compileLanguageSource(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const output = Array(lines.length).fill('') as string[];
  const diagnostics: LanguageDiagnostic[] = [];
  const voices = new Set<string>();
  const scalarNames = new Set<string>();
  const sourceKinds = new Map<string, SourceKind>();
  const sourceDefinitions = new Map<string, SourceDefinition>();
  const modSources = new Map<string, ModSourceDefinition>();
  let currentVoice: VoiceState | null = null;
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
        const ownerVoice = indentation > 0 && currentVoice ? currentVoice.name : null;
        if (indentation > 0 && !ownerVoice) throw new LanguageError([{ line: lineNumber, message: 'local MOD must be inside a VOICE' }]);
        if (!ownerVoice) {
          requireVoiceSound(currentVoice, diagnostics);
          currentVoice = null;
        }
        const scopeKey = modSourceKey(ownerVoice, name);
        if (modSources.has(scopeKey)) throw new LanguageError([{ line: lineNumber, message: `MOD '${name}' is already defined in this scope` }]);
        const internalName = ownerVoice ? `__mod_${ownerVoice}_${name}` : name;
        currentMod = { name, internalName, line: lineNumber, indentation, ownerVoice };
        modSources.set(scopeKey, { internalName, ownerVoice });
        const viewDirective = modMatch[2] ? `\n${internalName}.view();` : '';
        output[index] = `${internalName} = Swell();\n__modmeta(${JSON.stringify(internalName)},${JSON.stringify(name)},${JSON.stringify(ownerVoice ?? '')});${viewDirective}`;
        continue;
      }

      if (currentMod && indentation > currentMod.indentation) {
        const propertyMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/);
        if (!propertyMatch) throw new LanguageError([{ line: lineNumber, message: 'expected MOD property and value' }]);
        output[index] = compileModProperty(currentMod, propertyMatch[1], propertyMatch[2], lineNumber);
        continue;
      }

      const voiceMatch = trimmed.match(/^VOICE\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+with\s+(view))?\s*:\s*$/i);
      if (voiceMatch) {
        requireVoiceSound(currentVoice, diagnostics);
        const name = voiceMatch[1];
        if (voices.has(name) || scalarNames.has(name)) {
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
        currentVoice = null;
        output[index] = compileClock(trimmed, lineNumber);
        continue;
      }

      if (/^SET\b/i.test(trimmed)) {
        requireVoiceSound(currentVoice, diagnostics);
        currentVoice = null;
        output[index] = compileSet(trimmed, lineNumber, sourceKinds, sourceDefinitions, scalarNames, voices);
        continue;
      }

      const mainMatch = trimmed.match(/^MAIN\s+level\s+(.+)$/i);
      if (mainMatch) {
        requireVoiceSound(currentVoice, diagnostics);
        currentVoice = null;
        currentMod = null;
        const level = numberValue(mainMatch[1].trim(), lineNumber, 'MAIN level');
        if (level < 0 || level > 100) throw new LanguageError([{ line: lineNumber, message: 'MAIN level expects 0..100' }]);
        output[index] = `Audio.level(${level});`;
        continue;
      }

      if (/^PLAY\b/i.test(trimmed)) {
        requireVoiceSound(currentVoice, diagnostics);
        currentVoice = null;
        const playToken = trimmed.split(/\s+/)[1] ?? '';
        const playName = playToken.replace(/\.(?:out|aux)$/i, '');
        if (!voices.has(playName)) {
          throw new LanguageError([{ line: lineNumber, message: `unknown voice '${playName}'` }]);
        }
        output[index] = compilePlay(trimmed, lineNumber);
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
        throw new LanguageError([{ line: lineNumber, message: 'only VOICE and MOD blocks are supported' }]);
      }

      throw new LanguageError([{
        line: lineNumber,
        message: 'each top-level statement must begin with VOICE, MOD, SET, CLOCK, MAIN, or PLAY',
      }]);
    } catch (error) {
      if (error instanceof LanguageError) diagnostics.push(...error.diagnostics);
      else throw error;
    }
  }

  requireVoiceSound(currentVoice, diagnostics);

  if (diagnostics.length > 0) throw new LanguageError(diagnostics);
  return output.join('\n');
}
