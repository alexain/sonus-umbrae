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

export const MODE_INTERVALS: Readonly<Record<string, readonly number[]>> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  ionian: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  'major-pentatonic': [0, 2, 4, 7, 9],
  'minor-pentatonic': [0, 3, 5, 7, 10],
};

export function midiFromNote(value: string): number | null {
  const match = value.match(NOTE);
  if (!match) return null;
  const [, rawName, accidental, rawOctave] = match;
  const name = `${rawName.toUpperCase()}${accidental}`;
  const pitchClass = NOTE_INDEX[name];
  if (pitchClass === undefined) return null;
  const octave = Number(rawOctave);
  return (octave + 1) * 12 + pitchClass;
}

export function midiFromRoot(value: string, octave = 4): number | null {
  const match = value.match(NOTE_WITHOUT_OCTAVE);
  if (!match) return null;
  const [, rawName, accidental] = match;
  const name = `${rawName.toUpperCase()}${accidental}`;
  const pitchClass = NOTE_INDEX[name];
  if (pitchClass === undefined) return null;
  return (octave + 1) * 12 + pitchClass;
}

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}
