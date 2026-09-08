import type { ModDefinition, ModModel, ModSetDirective } from './types';

export const MOD_COMMON_PARAMETERS = new Set(['rate']);

export function createModDefinition(model: ModModel = 'generic'): ModDefinition {
  return {
    model,
    frequency: 0.25,
    noiseModel: 'white',
    density: 50,
    outputs: [{ waveform: 'triangle', rateMultiplier: 1, phase: 0, level: 100, levelExpression: null }, null, null, null],
    slope: 50,
    shape: 50,
    smooth: 50,
    shift: 50,
    mode: 1,
    outputMode: 2,
    range: 0,
    spread: 50,
    bias: 50,
    steps: 50,
    deja: 0,
    length: 8,
    diversity: 50,
    parameters: new Map(),
  };
}

export function applyCommonModSetDirective(
  mod: ModDefinition,
  directive: ModSetDirective,
  clockBpm: number,
  formatNumber: (value: number) => string,
): string | null | undefined {
  if (directive.parameter === 'ratebeat') {
    const beats = Number(directive.value);
    if (!Number.isFinite(beats) || beats <= 0) return 'MOD rate beat value must be greater than 0';
    mod.frequency = Math.max(0.001, clockBpm / 60 / beats);
    mod.parameters.set('RATE', `${formatNumber(beats)} BEAT`);
    return null;
  }

  if (directive.parameter === 'freq') {
    const value = Number(directive.value);
    if (!Number.isFinite(value) || value <= 0 || value > 10000) return 'MOD rate resolves outside the supported frequency range';
    mod.frequency = value;
    mod.parameters.set('RATE', `${formatNumber(value)} HZ`);
    return null;
  }

  return undefined;
}
