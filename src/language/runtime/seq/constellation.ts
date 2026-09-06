export interface ConstellationOctaveWeight {
  octave: number;
  weight: number;
}

export interface ConstellationDefinition {
  values: number[];
  weights: number[];
  stepwise: number;
  leap: number;
  repeat: number;
  memory: number;
  octaves: ConstellationOctaveWeight[];
  phrase: number;
  mutation: number;
}

export interface ConstellationReaderState {
  currentIndex: number | null;
  recent: number[];
  phrase: Array<{ index: number; octave: number }>;
  phraseCursor: number;
}

export interface ConstellationStepResult {
  frequency: number;
  index: number;
  octave: number;
  state: ConstellationReaderState;
}

function chooseWeighted(weights: number[], random: () => number): number {
  const safe = weights.map((value) => Math.max(0, Number.isFinite(value) ? value : 0));
  const total = safe.reduce((sum, value) => sum + value, 0);
  if (safe.length === 0) return 0;
  if (total <= 0) return Math.floor(random() * safe.length);
  let cursor = random() * total;
  for (let index = 0; index < safe.length; index += 1) {
    cursor -= safe[index];
    if (cursor <= 0) return index;
  }
  return safe.length - 1;
}

function chooseOctave(octaves: ConstellationOctaveWeight[], random: () => number): number {
  if (octaves.length === 0) return 0;
  const index = chooseWeighted(octaves.map((entry) => entry.weight), random);
  return octaves[index]?.octave ?? 0;
}

function choosePitchIndex(
  definition: ConstellationDefinition,
  state: ConstellationReaderState,
  random: () => number,
): number {
  const count = definition.values.length;
  if (count <= 1) return 0;
  const base = definition.weights.length === count ? definition.weights : Array(count).fill(100);
  const current = state.currentIndex;
  const scores = base.map((weight, index) => {
    let score = Math.max(0.0001, weight);
    if (current !== null) {
      const distance = Math.abs(index - current);
      if (distance === 0) {
        score *= 1 + (definition.repeat / 100) * 5;
      } else {
        const span = Math.max(1, count - 1);
        const normalized = Math.min(1, distance / span);
        const near = 1 - normalized;
        score *= 1 + near * (definition.stepwise / 100) * 3;
        score *= 1 + normalized * (definition.leap / 100) * 3;
      }
    }
    if (definition.memory > 0 && state.recent.length > 0) {
      const occurrences = state.recent.filter((entry) => entry === index).length;
      if (occurrences > 0) score *= 1 + Math.min(2, occurrences) * (definition.memory / 100);
    }
    return score;
  });
  return chooseWeighted(scores, random);
}

function generateChoice(
  definition: ConstellationDefinition,
  state: ConstellationReaderState,
  random: () => number,
): { index: number; octave: number } {
  return {
    index: choosePitchIndex(definition, state, random),
    octave: chooseOctave(definition.octaves, random),
  };
}

export function nextConstellationStep(
  definition: ConstellationDefinition,
  previous: ConstellationReaderState | undefined,
  random: () => number,
): ConstellationStepResult {
  const state: ConstellationReaderState = previous
    ? {
        currentIndex: previous.currentIndex,
        recent: [...previous.recent],
        phrase: previous.phrase.map((entry) => ({ ...entry })),
        phraseCursor: previous.phraseCursor,
      }
    : { currentIndex: null, recent: [], phrase: [], phraseCursor: 0 };

  let choice: { index: number; octave: number };
  if (definition.phrase > 0) {
    const length = Math.max(1, Math.round(definition.phrase));
    if (state.phrase.length !== length) {
      state.phrase = [];
      state.phraseCursor = 0;
    }
    const position = state.phraseCursor % length;
    const existing = state.phrase[position];
    if (!existing || random() * 100 < definition.mutation) {
      choice = generateChoice(definition, state, random);
      state.phrase[position] = choice;
    } else {
      choice = { ...existing };
    }
    state.phraseCursor = (position + 1) % length;
  } else {
    choice = generateChoice(definition, state, random);
    state.phrase = [];
    state.phraseCursor = 0;
  }

  state.currentIndex = choice.index;
  state.recent.push(choice.index);
  if (state.recent.length > 16) state.recent.splice(0, state.recent.length - 16);

  const base = definition.values[choice.index] ?? definition.values[0] ?? 440;
  return {
    frequency: base * (2 ** choice.octave),
    index: choice.index,
    octave: choice.octave,
    state,
  };
}

export function constellationPossibleFrequencies(definition: ConstellationDefinition): number[] {
  const octaves = definition.octaves.length > 0 ? definition.octaves : [{ octave: 0, weight: 100 }];
  return definition.values.flatMap((frequency) => octaves.map((entry) => frequency * (2 ** entry.octave)));
}
