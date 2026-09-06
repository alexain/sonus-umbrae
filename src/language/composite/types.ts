export type CompositeDomain = 'voice' | 'mod';
export type CompositeRelation = 'fm' | 'pm' | 'am' | 'ring' | 'sync';

export type CompositeOperatorDefinition = {
  name: string;
  waveform: 'sine' | 'triangle' | 'sawtooth' | 'ramp' | 'square';
  level: number;
  frequency: number;
  width: number;
};

export type CompositeEdgeDefinition = {
  relation: CompositeRelation;
  source: string;
  target: string;
  params: Record<string, number | boolean>;
};

export type CompositeMixDefinition = {
  name: string;
  inputs: Array<{ source: string; level: number; octave: number; detune: number }>;
};

export type CompositeOutputDefinition = { name: string; level: number };

export type CompositeDefinition = {
  name: string;
  domain: CompositeDomain;
  enabled: boolean;
  level: number;
  pitchFrequency: number | null;
  dynamicPitch?: boolean;
  operators: CompositeOperatorDefinition[];
  edges: CompositeEdgeDefinition[];
  mixes: CompositeMixDefinition[];
  outputs: CompositeOutputDefinition[];
};

export const COMPOSITE_DOMAIN_POLICY: Record<CompositeDomain, { allowMix: boolean; masterBus: 'mix' | 'single' }> = {
  voice: { allowMix: true, masterBus: 'mix' },
  mod: { allowMix: false, masterBus: 'single' },
};
