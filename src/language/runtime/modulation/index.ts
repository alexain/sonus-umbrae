import { applyCommonModSetDirective, createModDefinition } from './common';
import { applyModelModSetDirective, modViewSignals, MOD_MODEL_CAPABILITIES } from './models';
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
      mod.model = 'noise';
      mod.noiseModel = (noiseMatch?.[1] ?? 'white') as typeof mod.noiseModel;
      mod.parameters.set('MODEL', `NOISE.${mod.noiseModel.toUpperCase()}`);
      return null;
    }
    if (rawModel !== 'lfo' && rawModel !== 'swell' && rawModel !== 'dices' && rawModel !== 'composite') {
      return 'MOD model expects lfo, noise.white, noise.dust, noise.clocked, noise.fractal, swell, dices, or composite';
    }
    mod.model = rawModel;
    mod.parameters.set('MODEL', rawModel.toUpperCase());
    return null;
  }

  // Rate belongs to MOD, not to a concrete backend. Resolve it before model
  // validation so common properties remain independent from MODEL ordering.
  const commonError = applyCommonModSetDirective(mod, directive, clockBpm, formatNumber);
  if (commonError !== undefined) return commonError;

  if (mod.model === 'generic') return 'MOD requires MODEL before model-specific properties';
  return applyModelModSetDirective(mod, directive, formatNumber);
}

export { createModDefinition, modViewSignals, MOD_MODEL_CAPABILITIES };
