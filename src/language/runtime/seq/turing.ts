export function turingMask(length: number): number {
  return length >= 32 ? 0xffffffff : (2 ** length - 1);
}

export function turingBits(value: number, length: number): number[] {
  return Array.from({ length }, (_, index) => (value >>> index) & 1);
}

export function turingFrequency(
  register: number,
  length: number,
  values: number[],
  fallback: number,
): number {
  if (values.length === 0) return fallback;
  const mask = turingMask(length);
  const normalized = register / Math.max(1, mask);
  const index = Math.min(values.length - 1, Math.floor(normalized * values.length));
  return values[index] ?? fallback;
}

export function initializeTuringRegister(
  length: number,
  random: () => number,
): number {
  const mask = turingMask(length);
  let register = (Math.floor(random() * Math.max(1, mask)) || 1) >>> 0;
  if (length < 32) register &= mask;
  return register;
}

export function advanceTuringRegister(
  register: number,
  length: number,
  change: number,
  random: () => number,
): number {
  const mask = turingMask(length);
  const feedbackBit = register & 1;
  const nextBit = random() * 100 < change ? (random() < 0.5 ? 0 : 1) : feedbackBit;
  let next = ((register >>> 1) | (nextBit << (length - 1))) >>> 0;
  if (length < 32) next &= mask;
  return next;
}
