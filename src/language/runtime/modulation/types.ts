export type ModModel = 'generic' | 'lfo' | 'noise' | 'swell' | 'dices' | 'composite';
export type LfoWaveform = 'sine' | 'triangle' | 'sawtooth' | 'ramp' | 'square';
export type NoiseModel = 'white' | 'dust' | 'clocked' | 'fractal';

export interface LfoOutputDefinition {
  waveform: LfoWaveform;
  /** Output rate relative to the MOD base rate. 0.5 = /2, 2 = *2. */
  rateMultiplier: number;
  /** Phase offset in degrees, normalized to 0..<360. */
  phase: number;
  /** Canonical output amplitude in percent. */
  level: number;
  /** Parenthesized dynamic control expression, without the outer parentheses. */
  levelExpression: string | null;
}

/** Parameters owned by MOD itself, independently of the concrete model. */
export interface ModCommonDefinition {
  model: ModModel;
  /** Canonical modulation rate in Hz. Beat/sec/ms syntax is resolved before runtime use. */
  frequency: number;
  /** Concrete noise variant when model === 'noise'. */
  noiseModel: NoiseModel;
  /** Dust event density in normalized 0..100 domain. */
  density: number;
  /** Human-readable parameter values exposed by runtime/Scheme views. */
  parameters: Map<string, string>;
}

export interface LfoModDefinition {
  /** Canonical MOD outputs. out is a routing alias for out1. */
  outputs: [LfoOutputDefinition | null, LfoOutputDefinition | null, LfoOutputDefinition | null, LfoOutputDefinition | null];
}

export interface SwellModDefinition {
  slope: number;
  shape: number;
  smooth: number;
  shift: number;
  mode: number;
  outputMode: number;
  /** Swell/Tides frequency range: control=0, audio=1. Not MOD polarity. */
  range: number;
}

export interface DicesModDefinition {
  spread: number;
  bias: number;
  steps: number;
  deja: number;
  length: number;
  diversity: number;
}

/**
 * Runtime representation kept flat while the audio backends are still legacy
 * Swell/Dices nodes. Common MOD state is nevertheless explicitly separated
 * from model-owned state so new models do not inherit Swell semantics.
 */
export interface ModDefinition extends ModCommonDefinition, LfoModDefinition, SwellModDefinition, DicesModDefinition {}

export type ModSetParameter =
  | 'model'
  | 'freq'
  | 'ratebeat'
  | 'out1'
  | 'out2'
  | 'out3'
  | 'out4'
  | 'slope'
  | 'shape'
  | 'smooth'
  | 'shift'
  | 'output'
  | 'range'
  | 'spread'
  | 'bias'
  | 'steps'
  | 'deja'
  | 'length'
  | 'diversity'
  | 'density';

export type ModSetDirective = {
  parameter: ModSetParameter;
  value: string;
};

export type ModModelCapabilities = {
  outputs: readonly string[] | 'dynamic';
  parameters: ReadonlySet<string>;
};
