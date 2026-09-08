import type {
  BuilderModelDefinition,
  BuilderObjectDefinition,
  BuilderParameterDefinition,
  BuilderPortDefinition,
} from './types';

const audioOut: BuilderPortDefinition = { id: 'out', label: 'OUT', domain: 'audio', direction: 'output' };
const stereoIn: BuilderPortDefinition = { id: 'in', label: 'IN', domain: 'audio', direction: 'input' };
const signalOut: BuilderPortDefinition = { id: 'out', label: 'OUT', domain: 'signal', direction: 'output' };

const nameParameter: BuilderParameterDefinition = {
  id: 'name', label: 'Name', control: 'text', required: true,
};
const viewParameter: BuilderParameterDefinition = {
  id: 'view', label: 'View', control: 'toggle', defaultValue: false,
};
const everyParameter: BuilderParameterDefinition = {
  id: 'every', label: 'Timing / Every', control: 'time', description: 'Normal Sonus EVERY / PATTERN / Euclidean timing.',
};
const pitchParameter: BuilderParameterDefinition = {
  id: 'pitch', label: 'Pitch', control: 'pitch', description: 'Notes, scale, frequencies, SEQ/REGISTER source, selection and EVERY modifiers.',
};
const routeParameter: BuilderParameterDefinition = {
  id: 'out', label: 'Output routing', control: 'routing', defaultValue: 'MAIN', description: 'Defaults to MAIN when the object has an automatic main audio route.',
};

const macroModels = [
  'macro.analog', 'macro.waves', 'macro.fm', 'macro.grain', 'macro.additive', 'macro.wavetable',
  'macro.chord', 'macro.speech', 'macro.swarm', 'macro.noise', 'macro.particle', 'macro.string',
  'macro.analog-vcf', 'macro.phase', 'macro.terrain', 'macro.strings', 'macro.chiptune',
] as const;

const resonatorModels = ['resonator.modal', 'resonator.sympathetic', 'resonator.strings', 'resonator.string'] as const;

const voiceModels: BuilderModelDefinition[] = [
  ...['sine', 'triangle', 'sawtooth', 'ramp'].map((id) => ({ id, label: id, preview: 'waveform' as const })),
  { id: 'square', label: 'square', preview: 'waveform', parameters: [{ id: 'width', label: 'Width', control: 'slider', min: 0, max: 100, unit: '%' }] },
  { id: 'noise.white', label: 'noise.white', preview: 'waveform' },
  { id: 'noise.dust', label: 'noise.dust', preview: 'waveform', parameters: [{ id: 'density', label: 'Density', control: 'slider', min: 0, max: 100, unit: '%' }] },
  { id: 'noise.clocked', label: 'noise.clocked', preview: 'waveform' },
  { id: 'noise.fractal', label: 'noise.fractal', preview: 'waveform' },
  ...macroModels.map((id) => ({
    id,
    label: id,
    parameters: [
      { id: 'harmo', label: 'Harmonics', control: 'slider' as const, min: 0, max: 100, unit: '%' },
      { id: 'timbre', label: 'Timbre', control: 'slider' as const, min: 0, max: 100, unit: '%' },
      { id: 'morph', label: 'Morph', control: 'slider' as const, min: 0, max: 100, unit: '%' },
      { id: 'lpg', label: 'LPG', control: 'toggle' as const },
    ],
  })),
  { id: 'matter', label: 'matter', parameters: ['geometry', 'brightness', 'damping', 'position', 'space'].map((id) => ({ id, label: id, control: 'slider' as const, min: 0, max: 100, unit: '%' })) },
  ...resonatorModels.map((id) => ({ id, label: id, parameters: ['structure', 'brightness', 'damping', 'position'].map((p) => ({ id: p, label: p, control: 'slider' as const, min: 0, max: 100, unit: '%' })) })),
  { id: 'sample', label: 'sample', preview: 'sample-waveform', parameters: [
    { id: 'asset', label: 'Sample', control: 'sample', required: true },
    { id: 'region', label: 'Region', control: 'expression' },
    { id: 'slices', label: 'Slices', control: 'number', min: 1 },
    { id: 'loop', label: 'Loop', control: 'toggle' },
    { id: 'reverse', label: 'Reverse', control: 'toggle' },
  ] },
  { id: 'composite', label: 'composite', preview: 'routing', parameters: [
    { id: 'components', label: 'Components', control: 'routing', referenceKinds: ['voice'] },
    { id: 'tune', label: 'Tune', control: 'expression' },
    { id: 'fm', label: 'FM', control: 'routing', referenceKinds: ['voice', 'mod'] },
    { id: 'pm', label: 'PM', control: 'routing', referenceKinds: ['voice', 'mod'] },
    { id: 'am', label: 'AM', control: 'routing', referenceKinds: ['voice', 'mod'] },
    { id: 'ring', label: 'Ring', control: 'routing', referenceKinds: ['voice', 'mod'] },
    { id: 'sync', label: 'Sync', control: 'routing', referenceKinds: ['voice', 'mod'] },
    { id: 'output', label: 'Composite outputs', control: 'routing' },
  ], ports: [{ id: 'out', label: 'OUT', domain: 'audio', direction: 'output', dynamic: true }] },
];

const lfoOutputs = ['out1', 'out2', 'out3', 'out4'].map((id) => ({
  id, label: id.toUpperCase(), control: 'expression' as const,
  description: 'Waveform plus optional *N or /N, phase and level.',
}));

const modModels: BuilderModelDefinition[] = [
  { id: 'lfo', label: 'LFO', preview: 'waveform', parameters: [
    { id: 'rate', label: 'Rate', control: 'time', required: true }, ...lfoOutputs,
  ], ports: ['out1', 'out2', 'out3', 'out4'].map((id) => ({ id, label: id.toUpperCase(), domain: 'signal' as const, direction: 'output' as const })) },
  { id: 'noise.white', label: 'White noise', preview: 'waveform', ports: [signalOut], aliases: ['noise'] },
  { id: 'noise.dust', label: 'Dust noise', preview: 'waveform', parameters: [{ id: 'density', label: 'Density', control: 'slider', min: 0, max: 100, unit: '%' }], ports: [signalOut] },
  { id: 'noise.clocked', label: 'Clocked noise', preview: 'waveform', parameters: [{ id: 'rate', label: 'Rate', control: 'time', required: true }], ports: [signalOut] },
  { id: 'noise.fractal', label: 'Fractal noise', preview: 'waveform', ports: [signalOut] },
  { id: 'swell', label: 'Swell', preview: 'waveform', parameters: [
    { id: 'rate', label: 'Rate', control: 'time' },
    ...['shape', 'slope', 'smooth', 'shift'].map((id) => ({ id, label: id, control: 'slider' as const, min: 0, max: 100, unit: '%' })),
    { id: 'relation', label: 'Relation', control: 'select', options: ['phase', 'amplitude', 'frequency', 'different'] },
    { id: 'range', label: 'Range', control: 'select', options: ['control', 'audio'] },
  ], ports: ['out1', 'out2', 'out3', 'out4'].map((id) => ({ id, label: id.toUpperCase(), domain: 'signal' as const, direction: 'output' as const })) },
  { id: 'dices', label: 'Dices', preview: 'waveform', parameters: [
    { id: 'rate', label: 'Rate', control: 'time' },
    ...['spread', 'bias', 'steps', 'deja', 'diversity'].map((id) => ({ id, label: id, control: 'slider' as const, min: 0, max: 100, unit: '%' })),
    { id: 'length', label: 'Length', control: 'number', min: 1, max: 16 },
  ], ports: ['x1', 'x2', 'x3', 'y'].map((id) => ({ id, label: id.toUpperCase(), domain: 'signal' as const, direction: 'output' as const })) },
  { id: 'composite', label: 'Composite MOD', preview: 'routing', parameters: [
    { id: 'tune', label: 'Tune', control: 'expression' },
    { id: 'fm', label: 'FM', control: 'routing', referenceKinds: ['mod'] },
    { id: 'pm', label: 'PM', control: 'routing', referenceKinds: ['mod'] },
    { id: 'am', label: 'AM', control: 'routing', referenceKinds: ['mod'] },
    { id: 'ring', label: 'Ring', control: 'routing', referenceKinds: ['mod'] },
    { id: 'sync', label: 'Sync', control: 'routing', referenceKinds: ['mod'] },
    { id: 'output', label: 'Outputs', control: 'routing' },
  ], ports: [{ id: 'out', label: 'OUT', domain: 'signal', direction: 'output', dynamic: true }] },
];

const mistModels = ['mist.grain', 'mist.stretch', 'mist.delay', 'mist.spectral', 'mist.reverb', 'mist.resonator', 'mist.repeat', 'mist.smear'] as const;
const mistParams = ['position', 'size', 'pitch', 'density', 'texture', 'mix', 'spread', 'feedback', 'reverb'] as const;
const fxModels: BuilderModelDefinition[] = [
  ...mistModels.map((id) => ({ id, label: id, parameters: mistParams.map((p) => ({ id: p, label: p, control: 'slider' as const, min: p === 'pitch' ? -48 : 0, max: p === 'pitch' ? 48 : 100 })) })),
  { id: 'sky', label: 'sky', parameters: ['position', 'size', 'density', 'texture', 'mix', 'spread', 'feedback', 'reverb'].map((p) => ({ id: p, label: p, control: 'slider' as const, min: 0, max: 100 })) },
  { id: 'delay', label: 'delay', parameters: [
    { id: 'time', label: 'Time', control: 'time' },
    { id: 'mix', label: 'Mix', control: 'slider', min: 0, max: 100 },
    { id: 'spread', label: 'Spread', control: 'slider', min: 0, max: 100 },
    { id: 'feedback', label: 'Feedback', control: 'slider', min: 0, max: 100 },
    { id: 'lines', label: 'Lines', control: 'number', min: 1 },
    ...['reverse', 'tape', 'diffusion', 'pingpong'].map((id) => ({ id, label: id, control: 'toggle' as const })),
    { id: 'pitch', label: 'Pitch shift', control: 'pitch' },
  ] },
];

const seqModels: BuilderModelDefinition[] = [
  { id: 'turing', label: 'Turing', preview: 'turing', parameters: [
    { id: 'length', label: 'Length', control: 'number', min: 2, max: 32, defaultValue: 8 },
    { id: 'change', label: 'Change', control: 'slider', min: 0, max: 100, unit: '%', defaultValue: 10 },
    pitchParameter, everyParameter,
  ] },
  { id: 'constellation', label: 'Constellation', preview: 'constellation', parameters: [
    pitchParameter,
    ...['stepwise', 'leap', 'repeat', 'memory', 'mutation'].map((id) => ({ id, label: id, control: 'slider' as const, min: 0, max: 100, unit: '%' })),
    { id: 'octave', label: 'Octave weights', control: 'expression' },
    { id: 'phrase', label: 'Phrase', control: 'number', min: 0, max: 64 },
  ] },
  { id: 'snake', label: 'Snake', preview: 'snake', parameters: [
    { id: 'size', label: 'Matrix size', control: 'select', options: ['2x2', '3x3', '4x4', '8x8', '16x16'] },
    pitchParameter,
    { id: 'matrix', label: 'Matrix', control: 'matrix' },
    { id: 'movement', label: 'Movement', control: 'select', options: ['snake', 'rows', 'columns', 'spiral', 'diagonal', 'bounce', 'random', 'walk'] },
  ] },
  ...['life', 'life.highlife', 'life.seeds', 'life.day-night', 'life.morley'].map((id) => ({
    id, label: id, preview: 'life' as const, parameters: [
      { id: 'size', label: 'Grid size', control: 'select' as const, options: ['8', '16'] },
      pitchParameter,
      { id: 'density', label: 'Density', control: 'slider' as const, min: 0, max: 100, unit: '%' },
      { id: 'evolve', label: 'Evolve', control: 'time' as const },
    ],
  })),
];

export const OBJECT_BUILDER_CATALOG: readonly BuilderObjectDefinition[] = [
  {
    kind: 'clock', keyword: 'CLOCK', label: 'Clock', named: true, supportsView: true, preview: 'clock', ports: [],
    parameters: [nameParameter, viewParameter,
      { id: 'bpm', label: 'BPM', control: 'number', min: 1 },
      { id: 'parent', label: 'Parent clock', control: 'select', referenceKinds: ['clock'] },
      { id: 'rate', label: 'Derived rate', control: 'expression' },
      { id: 'jitter', label: 'Jitter', control: 'slider', min: 0, max: 100, unit: '%' },
      { id: 'drifter', label: 'Drifter', control: 'slider', min: 0, max: 100, unit: '%' },
    ],
  },
  {
    kind: 'voice', keyword: 'VOICE', label: 'Voice', named: true, supportsView: true, preview: 'routing', models: voiceModels,
    ports: [audioOut], defaultDestination: 'MAIN', parameters: [nameParameter, viewParameter, pitchParameter, routeParameter,
      { id: 'level', label: 'Level', control: 'slider', min: 0, max: 100, unit: '%' },
      { id: 'pan', label: 'Pan', control: 'slider', min: -100, max: 100 },
      { id: 'vca', label: 'VCA envelope', control: 'expression' },
      everyParameter,
    ],
  },
  {
    kind: 'mod', keyword: 'MOD', label: 'Modulator', named: true, supportsView: true, preview: 'waveform', models: modModels,
    ports: [signalOut], defaultDestination: null, parameters: [nameParameter, viewParameter],
  },
  {
    kind: 'envelope', keyword: 'SET', label: 'Envelope', named: true, supportsView: false, preview: 'envelope', ports: [{ id: 'out', label: 'OUT', domain: 'signal', direction: 'output' }],
    parameters: [nameParameter,
      { id: 'delay', label: 'Delay', control: 'time' }, { id: 'attack', label: 'Attack', control: 'time' },
      { id: 'hold', label: 'Hold', control: 'time' }, { id: 'decay', label: 'Decay', control: 'time' },
      { id: 'sustain', label: 'Sustain', control: 'slider', min: 0, max: 100, unit: '%' },
      { id: 'release', label: 'Release', control: 'time' },
      { id: 'range', label: 'Range', control: 'expression' },
    ], note: 'Public language form is SET <name>: ENVELOPE [...].',
  },
  {
    kind: 'fx', keyword: 'FX', label: 'Effect', named: true, supportsView: true, preview: 'routing', models: fxModels,
    ports: [stereoIn, audioOut], defaultDestination: 'MAIN', parameters: [nameParameter, viewParameter, routeParameter, everyParameter],
  },
  {
    kind: 'filter', keyword: 'FILTER', label: 'Filter', named: true, supportsView: false, preview: 'routing',
    ports: [stereoIn, audioOut], parameters: [nameParameter, viewParameter,
      { id: 'model', label: 'Model', control: 'select', options: ['svf'], defaultValue: 'svf' },
      { id: 'cutoff', label: 'Cutoff', control: 'expression' },
      { id: 'resonance', label: 'Resonance', control: 'slider', min: 0, max: 100, unit: '%' },
      { id: 'drive', label: 'Drive', control: 'slider', min: 0, max: 100, unit: '%' }, routeParameter,
    ],
  },
  {
    kind: 'drumkit', keyword: 'DRUMKIT', label: 'Drumkit', named: true, supportsView: true, preview: 'pattern',
    ports: [audioOut], defaultDestination: 'MAIN', parameters: [nameParameter, viewParameter,
      { id: 'kit', label: 'Kit / lanes', control: 'pattern' }, routeParameter,
    ],
  },
  {
    kind: 'logic', keyword: 'LOGIC', label: 'Logic', named: true, supportsView: true, preview: 'logic-diagram',
    ports: [{ id: 'nodes', label: 'Named nodes', domain: 'event', direction: 'output', dynamic: true }],
    parameters: [nameParameter, viewParameter,
      { id: 'nodes', label: 'Logic nodes', control: 'pattern', description: 'AND, OR, XOR, NAND, NOR, divider, counter and flipflop nodes.' },
    ],
  },
  {
    kind: 'register', keyword: 'REGISTER', label: 'Register', named: true, supportsView: false, preview: 'routing', models: [{ id: 'shift', label: 'Shift register' }],
    ports: [{ id: 'stages', label: 'Stages', domain: 'pitch', direction: 'output', dynamic: true }], parameters: [nameParameter,
      { id: 'size', label: 'Size', control: 'number', min: 2, max: 32 },
      { id: 'pitch', label: 'Pitch source', control: 'pitch', referenceKinds: ['seq'] },
      { id: 'write', label: 'Write timing', control: 'time' },
    ],
  },
  {
    kind: 'seq', keyword: 'SEQ', label: 'Sequencer', named: true, supportsView: true, preview: 'turing', models: seqModels,
    ports: [{ id: 'pitch', label: 'Pitch source', domain: 'pitch', direction: 'output' }], parameters: [nameParameter, viewParameter],
  },
] as const;

export function builderObjectDefinition(kind: BuilderObjectDefinition['kind']): BuilderObjectDefinition | undefined {
  return OBJECT_BUILDER_CATALOG.find((definition) => definition.kind === kind);
}

export function builderModelDefinition(kind: BuilderObjectDefinition['kind'], modelId: string): BuilderModelDefinition | undefined {
  return builderObjectDefinition(kind)?.models?.find((model) => model.id === modelId || model.aliases?.includes(modelId));
}
