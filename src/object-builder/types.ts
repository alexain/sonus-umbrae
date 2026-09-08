export type BuilderObjectKind =
  | 'clock'
  | 'voice'
  | 'mod'
  | 'envelope'
  | 'fx'
  | 'filter'
  | 'drumkit'
  | 'logic'
  | 'register'
  | 'seq';

export type BuilderDomain = 'audio' | 'signal' | 'gate' | 'trigger' | 'pitch' | 'event';
export type BuilderControl =
  | 'text'
  | 'number'
  | 'slider'
  | 'toggle'
  | 'select'
  | 'time'
  | 'pitch'
  | 'scale'
  | 'notes'
  | 'sample'
  | 'routing'
  | 'expression'
  | 'matrix'
  | 'pattern';

export type BuilderPreview =
  | 'none'
  | 'clock'
  | 'waveform'
  | 'envelope'
  | 'sample-waveform'
  | 'logic-diagram'
  | 'turing'
  | 'constellation'
  | 'snake'
  | 'life'
  | 'routing'
  | 'pattern';

export interface BuilderPortDefinition {
  id: string;
  label: string;
  domain: BuilderDomain;
  direction: 'input' | 'output';
  multiple?: boolean;
  dynamic?: boolean;
}

export interface BuilderParameterDefinition {
  id: string;
  label: string;
  control: BuilderControl;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: readonly string[];
  defaultValue?: string | number | boolean;
  models?: readonly string[];
  excludeModels?: readonly string[];
  referenceKinds?: readonly BuilderObjectKind[];
  description?: string;
  liveCapable?: boolean;
}

export interface BuilderModelDefinition {
  id: string;
  label: string;
  preview?: BuilderPreview;
  parameters?: readonly BuilderParameterDefinition[];
  ports?: readonly BuilderPortDefinition[];
  defaultDestination?: 'MAIN' | null;
  aliases?: readonly string[];
  note?: string;
}

export interface BuilderObjectDefinition {
  kind: BuilderObjectKind;
  keyword: string;
  label: string;
  named: boolean;
  supportsView: boolean;
  preview: BuilderPreview;
  models?: readonly BuilderModelDefinition[];
  parameters: readonly BuilderParameterDefinition[];
  ports: readonly BuilderPortDefinition[];
  defaultDestination?: 'MAIN' | null;
  note?: string;
}
