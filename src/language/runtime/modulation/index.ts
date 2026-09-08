import { applyCommonModSetDirective, createModDefinition } from './common';
import { applyModelModSetDirective, modRateError, modSupportsRate, modViewSignals, MOD_MODEL_CAPABILITIES } from './models';
import type { ModDefinition, ModSetDirective } from './types';

export * from './common';
export * from './models';
export * from './types';

export function applyModSetDirective(
  mod: ModDefinition,
  directive: ModSetDirective,
  clockBpm: number,
  formatNumber: (value: number) => string,
): string | null {
  if (directive.parameter === 'model') {
    const rawModel = directive.value.toLowerCase();
    const noiseMatch = rawModel.match(/^noise\.(white|dust|clocked|fractal)$/);
    if (rawModel === 'noise' || noiseMatch) {
      const noiseModel = (noiseMatch?.[1] ?? 'white') as typeof mod.noiseModel;
      const candidate = { model: 'noise' as const, noiseModel };
      if (mod.parameters.has('RATE') && !modSupportsRate(candidate)) return modRateError(candidate);
      mod.model = 'noise';
      mod.noiseModel = noiseModel;
      mod.parameters.set('MODEL', `NOISE.${mod.noiseModel.toUpperCase()}`);
      return null;
    }
    if (rawModel !== 'lfo' && rawModel !== 'swell' && rawModel !== 'dices' && rawModel !== 'composite') {
      return 'MOD model expects lfo, noise.white, noise.dust, noise.clocked, noise.fractal, swell, dices, or composite';
    }
    const candidate = { model: rawModel as ModDefinition['model'], noiseModel: mod.noiseModel };
    if (mod.parameters.has('RATE') && !modSupportsRate(candidate)) return modRateError(candidate);
    mod.model = rawModel;
    mod.parameters.set('MODEL', rawModel.toUpperCase());
    return null;
  }

  // RATE remains a common MOD property, but concrete models declare whether
  // they consume it. Generic MOD accepts RATE so property ordering stays free;
  // MODEL validates an already-declared RATE when it is encountered later.
  if ((directive.parameter === 'freq' || directive.parameter === 'ratebeat') && mod.model !== 'generic' && !modSupportsRate(mod)) {
    return modRateError(mod);
  }
  const commonError = applyCommonModSetDirective(mod, directive, clockBpm, formatNumber);
  if (commonError !== undefined) return commonError;

  if (mod.model === 'generic') return 'MOD requires MODEL before model-specific properties';
  return applyModelModSetDirective(mod, directive, formatNumber);
}

export { createModDefinition, modViewSignals, MOD_MODEL_CAPABILITIES };
