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

type SourceKind = 'voice' | 'note' | 'freq' | 'time' | 'trigger';

type VoiceState = {
  name: string;
  line: number;
  hasSound: boolean;
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
  property: 'note' | 'freq' | 'cycle',
  sourceName: string,
  line: number,
  sourceKinds: Map<string, SourceKind>,
): string {
  if (!IDENTIFIER.test(sourceName)) {
    throw new LanguageError([{ line, message: `invalid source name '${sourceName}'` }]);
  }
  const actual = sourceKinds.get(sourceName);
  if (!actual) {
    throw new LanguageError([{ line, message: `unknown source '${sourceName}'` }]);
  }

  const compatible = property === 'note'
    ? actual === 'note'
    : property === 'freq'
      ? actual === 'freq'
      : actual === 'time' || actual === 'trigger';

  if (!compatible) {
    const expected = property === 'note'
      ? 'note source'
      : property === 'freq'
        ? 'frequency source'
        : 'time or trigger source';
    throw new LanguageError([{
      line,
      message: `source '${sourceName}' is ${actual}, expected ${expected} for ${property}`,
    }]);
  }

  return `__from(${JSON.stringify(voice.name)},${JSON.stringify(property)},${JSON.stringify(sourceName)});`;
}

function compileVoiceProperty(
  voice: VoiceState,
  property: string,
  rawValue: string,
  line: number,
  sourceKinds: Map<string, SourceKind>,
): string {
  const key = property.toLowerCase();
  const value = rawValue.trim();

  if ((key === 'note' || key === 'freq' || key === 'cycle') && /^from\s+/i.test(value)) {
    const sourceName = value.replace(/^from\s+/i, '').trim();
    return compileFrom(voice, key, sourceName, line, sourceKinds);
  }

  switch (key) {
    case 'sound': {
      if (!value || /\s/.test(value)) {
        throw new LanguageError([{ line, message: 'sound expects one sound identifier' }]);
      }
      const sound = value.toLowerCase().startsWith('plaits.') ? value.slice('plaits.'.length) : value;
      return `${voice.name}.model(${JSON.stringify(sound)});`;
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
      const { base, modifiers } = splitWith(value);
      const parts = base.split(/\s+/).filter(Boolean);
      if (parts.length !== 2) {
        throw new LanguageError([{ line, message: 'scale expects root and mode, e.g. scale C minor' }]);
      }
      const [root, modeRaw] = parts;
      const modeName = modeRaw.toLowerCase();
      const intervals = MODE_INTERVALS[modeName];
      if (!intervals) {
        throw new LanguageError([{ line, message: `unknown scale mode '${modeRaw}'` }]);
      }
      const rootMidi = midiFromRoot(root);
      if (rootMidi === null) {
        throw new LanguageError([{ line, message: `invalid scale root '${root}'` }]);
      }
      const frequencies = intervals.map((interval) => midiToFrequency(rootMidi + interval));
      const mode = parseSelectionMode(modifiers, line, 'scale');
      return `${voice.name}.freq(${frequencies[0]}); ${sequenceDirective(voice.name, frequencies, mode)}`;
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

function compilePlay(lineText: string, line: number): string {
  const tokens = lineText.trim().split(/\s+/);
  if (tokens.length < 4 || tokens[0].toUpperCase() !== 'PLAY') {
    throw new LanguageError([{ line, message: 'invalid PLAY statement' }]);
  }

  const name = tokens[1];
  if (!IDENTIFIER.test(name)) {
    throw new LanguageError([{ line, message: `invalid voice name '${name}'` }]);
  }

  if (tokens[2].toLowerCase() !== 'through') {
    throw new LanguageError([{ line, message: "PLAY expects 'through' after the voice name" }]);
  }

  const target = tokens[3];
  if (target.toUpperCase() !== 'MAIN') {
    throw new LanguageError([{ line, message: `unknown PLAY target '${target}'` }]);
  }

  let amount = 100;
  if (tokens.length > 4) {
    if (tokens.length !== 6 || tokens[4].toLowerCase() !== 'at') {
      throw new LanguageError([{ line, message: "PLAY currently accepts only the optional modifier 'at <value>'" }]);
    }
    amount = normalizedAmount(tokens[5], line);
  }

  return `${name}.out(${amount}) -> Audio.out;`;
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
  const sourceKinds = new Map<string, SourceKind>();
  let currentVoice: VoiceState | null = null;

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
      const voiceMatch = trimmed.match(/^VOICE\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*$/i);
      if (voiceMatch) {
        requireVoiceSound(currentVoice, diagnostics);
        const name = voiceMatch[1];
        if (voices.has(name)) {
          throw new LanguageError([{ line: lineNumber, message: `VOICE '${name}' is already defined` }]);
        }
        voices.add(name);
        sourceKinds.set(name, 'voice');
        currentVoice = { name, line: lineNumber, hasSound: false };
        output[index] = `${name} = Voice();`;
        continue;
      }

      if (/^PLAY\b/i.test(trimmed)) {
        requireVoiceSound(currentVoice, diagnostics);
        currentVoice = null;
        const playName = trimmed.split(/\s+/)[1] ?? '';
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
        output[index] = compileVoiceProperty(currentVoice, propertyMatch[1], propertyMatch[2], lineNumber, sourceKinds);
        if (propertyMatch[1].toLowerCase() === 'sound') currentVoice.hasSound = true;
        continue;
      }

      if (/^[A-Za-z_][A-Za-z0-9_]*\s*:/.test(trimmed)) {
        throw new LanguageError([{ line: lineNumber, message: 'only VOICE blocks are supported in language v1' }]);
      }

      throw new LanguageError([{
        line: lineNumber,
        message: 'each top-level statement must begin with VOICE or PLAY',
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
