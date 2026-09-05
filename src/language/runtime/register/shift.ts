export function createShiftRegister(size: number, initial = 440): number[] {
  return Array.from({ length: size }, () => initial);
}

export function resizeShiftRegister(values: number[], size: number, initial = 440): number[] {
  const next = values.slice(0, size);
  while (next.length < size) next.push(initial);
  return next;
}

export function writeShiftRegister(values: number[], value: number, size: number): number[] {
  return [value, ...values].slice(0, size);
}

export function readShiftRegister(values: number[], stage: number, fallback = 440): number {
  return values[stage - 1] ?? fallback;
}
