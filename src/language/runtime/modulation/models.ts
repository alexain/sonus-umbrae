import { ControlExpressionError, parseControlExpression } from '../../control-expression';
import type { LfoOutputDefinition, LfoWaveform, ModDefinition, ModModelCapabilities, ModSetDirective } from './types';

export const MOD_MODEL_CAPABILITIES: Record<'lfo' | 'noise' | 'swell' | 'dices' | 'composite', ModModelCapabilities> = {
  lfo: {
    outputs: ['out1', 'out2', 'out3', 'out4'],
    parameters: new Set(['out1', 'out2', 'out3', 'out4']),
    rate: true,
  },
  noise: {
    outputs: ['out1'],
    parameters: new Set(['density']),
    rate: 'clocked-only',
  },
  swell: {
    outputs: ['out1', 'out2', 'out3', 'out4'],
    parameters: new Set(['shape', 'slope', 'smooth', 'relation', 'shift', 'range']),
    rate: true,
  },
  dices: {
    outputs: ['x1', 'x2', 'x3', 'y'],
    parameters: new Set(['spread', 'bias', 'steps', 'deja', 'length', 'diversity']),
    rate: true,
  },
  composite: {
    outputs: 'dynamic',
    parameters: new Set(['tune', 'fm', 'pm', 'am', 'ring', 'sync', 'output']),
    rate: false,
  },
};


export function modSupportsRate(mod: Pick<ModDefinition, 'model' | 'noiseModel'>): boolean {
  if (mod.model === 'generic') return true;
  const capability = MOD_MODEL_CAPABILITIES[mod.model];
  if (capability.rate === 'clocked-only') return mod.noiseModel === 'clocked';
  return capability.rate;
}

export function modRateError(mod: Pick<ModDefinition, 'model' | 'noiseModel'>): string {
  if (mod.model === 'noise') {
    return `MOD noise.${mod.noiseModel} does not support rate; RATE is available only for noise.clocked`;
  }
  return `MOD ${mod.model} does not support rate`;
}

export function applyModelModSetDirective(
  mod: ModDefinition,
  directive: ModSetDirective,
  formatNumber: (value: number) => string,
): string | null {
  const parameter = directive.parameter;


  if (parameter === 'density') {
    const value = Number(directive.value);
    if (!Number.isFinite(value) || value < 0 || value > 100) return 'MOD noise density expects 0..100';
    if (mod.noiseModel !== 'dust') return 'MOD noise density is available only for noise.dust';
    mod.density = value;
    mod.parameters.set('DENSITY', `${formatNumber(value)}%`);
    return null;
  }

  if (parameter === 'out1' || parameter === 'out2' || parameter === 'out3' || parameter === 'out4') {
    const parts = directive.value.split('|');
    const waveform = parts[0]?.toLowerCase() as LfoWaveform;
    const rateMultiplier = Number(parts[1] ?? '1');
    const phase = Number(parts[2] ?? '0');
    const rawLevel = parts[3] ?? '100';
    let level = 100;
    let levelExpression: string | null = null;
    if (!['sine', 'triangle', 'sawtooth', 'ramp', 'square'].includes(waveform)) {
      return `MOD lfo ${parameter} expects sine, triangle, sawtooth, ramp, or square`;
    }
    if (!Number.isFinite(rateMultiplier) || rateMultiplier <= 0) return `MOD lfo ${parameter} rate factor must be greater than 0`;
    if (!Number.isFinite(phase)) return `MOD lfo ${parameter} phase must be a number`;
    if (rawLevel.startsWith('(') && rawLevel.endsWith(')')) {
      levelExpression = rawLevel.slice(1, -1).trim();
      try {
        parseControlExpression(levelExpression);
      } catch (error) {
        const message = error instanceof ControlExpressionError ? error.message : String(error);
        return `MOD lfo ${parameter} level: ${message}`;
      }
    } else {
      level = Number(rawLevel);
      if (!Number.isFinite(level) || level < 0 || level > 100) return `MOD lfo ${parameter} level expects 0..100`;
    }
    const output: LfoOutputDefinition = {
      waveform,
      rateMultiplier,
      phase: ((phase % 360) + 360) % 360,
      level,
      levelExpression,
    };
    const slot = Number(parameter.slice(3)) - 1;
    mod.outputs[slot] = output;
    const rateLabel = Math.abs(rateMultiplier - 1) < 1e-12 ? '' : ` ×${formatNumber(rateMultiplier)}`;
    const phaseLabel = Math.abs(output.phase) < 1e-12 ? '' : ` PHASE ${formatNumber(output.phase)}°`;
    const levelLabel = output.levelExpression !== null ? ` LEVEL (${output.levelExpression})` : Math.abs(output.level - 100) < 1e-12 ? '' : ` LEVEL ${formatNumber(output.level)}%`;
    mod.parameters.set(parameter.toUpperCase(), `${waveform.toUpperCase()}${rateLabel}${phaseLabel}${levelLabel}`);
    return null;
  }

  if (parameter === 'slope' || parameter === 'shape' || parameter === 'smooth' || parameter === 'shift') {
    const value = Number(directive.value);
    if (!Number.isFinite(value) || value < 0 || value > 100) return `MOD ${parameter} expects 0..100`;
    mod[parameter] = value;
    mod.parameters.set(parameter.toUpperCase(), `${formatNumber(value)}%`);
    return null;
  }

  if (parameter === 'spread' || parameter === 'bias' || parameter === 'steps' || parameter === 'deja' || parameter === 'diversity') {
    const value = Number(directive.value);
    if (!Number.isFinite(value) || value < 0 || value > 100) return `MOD dices ${parameter} expects 0..100`;
    mod[parameter] = value;
    mod.parameters.set(parameter.toUpperCase(), `${formatNumber(value)}%`);
    return null;
  }

  if (parameter === 'length') {
    const value = Number(directive.value);
    if (!Number.isInteger(value) || value < 1 || value > 16) return 'MOD dices length expects 1..16';
    mod.length = value;
    mod.parameters.set('LENGTH', `${value}`);
    return null;
  }

  if (parameter === 'output') {
    const modes: Record<string, number> = { different: 0, amplitude: 1, phase: 2, frequency: 3 };
    const mode = modes[directive.value.toLowerCase()];
    if (mode === undefined) return 'MOD relation expects phase, amplitude, frequency, or different';
    mod.outputMode = mode;
    mod.parameters.set('RELATION', directive.value.toUpperCase());
    return null;
  }

  if (parameter === 'range') {
    const normalized = directive.value.toLowerCase();
    if (normalized !== 'control' && normalized !== 'audio') return 'MOD range expects control or audio';
    mod.range = normalized === 'audio' ? 1 : 0;
    mod.parameters.set('RANGE', normalized.toUpperCase());
  }

  return null;
}

export function modViewSignals(
  name: string,
  mod: ModDefinition,
  compositeOutputs: readonly string[] = [],
): string[] {
  if (mod.model === 'generic') return [];
  if (mod.model === 'lfo') return mod.outputs.flatMap((output, index) => output ? [`${name}.out${index + 1}`] : []);
  if (mod.model === 'noise') return [`${name}.out`];
  if (mod.model === 'dices') return [`${name}.x1`, `${name}.x2`, `${name}.x3`, `${name}.y`];
  if (mod.model === 'composite') return compositeOutputs.map((output) => `${name}.${output}`);
  return [1, 2, 3, 4].map((port) => `${name}.out${port}`);
}
