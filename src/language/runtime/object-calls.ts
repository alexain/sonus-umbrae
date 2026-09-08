import type { ScalarValue } from '../expression';

type ViewKind = 'signal' | 'gate' | 'trigger' | 'parameter';

interface ChainedCall {
  name: string;
  argument: string;
}

interface GainDefinition {
  level: number;
  parameters: Map<string, string>;
}

type VoiceEngineKind = 'macro' | 'matter' | 'resonator' | 'oscillator' | 'noise' | 'composite' | 'sample';
type VoiceParameterName = 'harmo' | 'timbre' | 'morph' | 'width' | 'density' | 'geometry' | 'structure' | 'brightness' | 'damping' | 'position' | 'space' | 'bow' | 'bowTimbre' | 'blow' | 'blowTimbre' | 'strike' | 'strikeTimbre';

interface VoiceDefinition {
  disabled: boolean;
  engine: VoiceEngineKind;
  soundId: string;
  model: number;
  polyphony: 1 | 2 | 4;
  lpg: boolean;
  level: number;
  frequency: number;
  harmo: number;
  timbre: number;
  morph: number;
  width: number;
  density: number;
  geometry: number;
  structure: number;
  brightness: number;
  damping: number;
  position: number;
  space: number;
  bow: number;
  bowTimbre: number;
  blow: number;
  blowTimbre: number;
  strike: number;
  strikeTimbre: number;
  drive: { kind: string; values: number[] } | null;
  sampleAlias: string | null;
  sampleRootFrequency: number;
  sampleStart: number;
  sampleEnd: number;
  sampleLoop: boolean;
  sampleReverse: boolean;
  sampleSlices: number;
  sampleInitialSlice: number;
  sampleInitialSliceReverse: boolean;
  parameters: Map<string, string>;
}

interface SwellDefinition {
  model: 'generic' | 'lfo' | 'noise' | 'swell' | 'dices' | 'composite';
  frequency: number;
  slope: number;
  shape: number;
  smooth: number;
  shift: number;
  mode: number;
  outputMode: number;
  range: number;
  spread: number;
  bias: number;
  steps: number;
  deja: number;
  length: number;
  diversity: number;
  parameters: Map<string, string>;
}

interface MistDefinition {
  disabled: boolean;
  position: number;
  size: number;
  pitch: number;
  density: number;
  texture: number;
  mix: number;
  spread: number;
  feedback: number;
  reverb: number;
  freeze: boolean;
  reverse: boolean;
  mode: number;
  parameters: Map<string, string>;
}

interface FilterDefinition {
  disabled: boolean;
  model: 'svf';
  ownerVoice: string | null;
  displayName: string;
  cutoff: number;
  cutoffPercent: number | null;
  resonance: number;
  drive: number;
  parameters: Map<string, string>;
}

export function applyFilterCall(
  definition: FilterDefinition,
  call: ChainedCall,
  evaluate: (expression: string) => ScalarValue | undefined,
): string | null {
  switch (call.name) {
    case 'disabled': {
      const value = evaluate(call.argument);
      if (typeof value !== 'boolean') return 'disabled expects true or false';
      definition.disabled = value;
      return null;
    }
    case 'model': {
      const value = evaluate(call.argument);
      if (value !== 'svf') return 'FILTER model expects svf';
      definition.model = 'svf';
      definition.parameters.set('MODEL', 'SVF');
      return null;
    }
    case 'owner': {
      const value = evaluate(call.argument);
      if (typeof value !== 'string') return 'owner expects a string';
      definition.ownerVoice = value || null;
      return null;
    }
    case 'displayName': {
      const value = evaluate(call.argument);
      if (typeof value !== 'string') return 'displayName expects a string';
      definition.displayName = value;
      return null;
    }
    case 'cutoff': {
      const value = evaluate(call.argument);
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 20 || value > 20000) return 'cutoff expects 20..20000 Hz';
      definition.cutoff = value;
      definition.cutoffPercent = null;
      definition.parameters.set('CUTOFF', `${formatNumber(value)} HZ`);
      return null;
    }
    case 'cutoffPercent': {
      const value = evaluate(call.argument);
      if (typeof value !== 'number' || value < 0 || value > 100) return 'cutoff expects 0..100';
      definition.cutoffPercent = value;
      definition.cutoff = 20 * (1000 ** (value / 100));
      definition.parameters.set('CUTOFF', `${formatNumber(value)}%`);
      return null;
    }
    case 'resonance': {
      const value = evaluate(call.argument);
      if (typeof value !== 'number' || value < 0 || value > 100) return 'resonance expects 0..100';
      definition.resonance = value;
      definition.parameters.set('RESONANCE', `${formatNumber(value)}%`);
      return null;
    }
    case 'drive': {
      const value = evaluate(call.argument);
      if (typeof value !== 'number' || value < 0 || value > 100) return 'drive expects 0..100';
      definition.drive = value;
      definition.parameters.set('DRIVE', `${formatNumber(value)}%`);
      return null;
    }
    default: return `unknown Filter method: ${call.name}`;
  }
}

export function applyMistCall(
  objectName: string,
  definition: MistDefinition,
  call: ChainedCall,
  moduleViews: Set<string>,
  evaluate: (expression: string) => ScalarValue | undefined,
): string | null {
  const percent = (
    parameter: 'position' | 'size' | 'density' | 'texture' | 'mix' | 'spread' | 'feedback' | 'reverb',
  ): string | null => {
    const value = evaluate(call.argument);
    if (typeof value !== 'number') return `${call.name} expects one numeric expression`;
    const error = percentError(value, call.name);
    if (error) return error;
    definition[parameter] = value;
    definition.parameters.set(call.name.toUpperCase(), `${formatNumber(value)}%`);
    return null;
  };

  switch (call.name) {
    case 'disabled': {
      const value = evaluate(call.argument);
      if (typeof value !== 'boolean') return 'disabled expects true or false';
      definition.disabled = value;
      return null;
    }
    case 'position': return percent('position');
    case 'size': return percent('size');
    case 'density': return percent('density');
    case 'texture': return percent('texture');
    case 'mix': return percent('mix');
    case 'spread': return percent('spread');
    case 'feedback': return percent('feedback');
    case 'reverb': return percent('reverb');
    case 'pitch': {
      const value = evaluate(call.argument);
      if (typeof value !== 'number' || value < -48 || value > 48) return 'pitch expects -48..48 semitones';
      definition.pitch = value;
      definition.parameters.set('PITCH', `${formatNumber(value)} ST`);
      return null;
    }
    case 'freeze': {
      const value = evaluate(call.argument);
      if (typeof value !== 'boolean') return 'freeze expects true or false';
      definition.freeze = value;
      definition.parameters.set('FREEZE', value ? 'ON' : 'OFF');
      return null;
    }
    case 'mode': {
      const value = evaluate(call.argument);
      if (typeof value !== 'string') return 'mode expects a mode name';

      const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
      const modes: Record<string, { id: number; label: string }> = {
        granular: { id: 0, label: 'GRANULAR' },
        stretch: { id: 1, label: 'STRETCH' },
        looping_delay: { id: 2, label: 'LOOPING DELAY' },
        delay: { id: 2, label: 'LOOPING DELAY' },
        spectral: { id: 3, label: 'SPECTRAL' },
        oliverb: { id: 4, label: 'OLIVERB' },
        resonestor: { id: 5, label: 'RESONESTOR' },
        beat_repeat: { id: 6, label: 'BEAT REPEAT' },
        kammerl: { id: 6, label: 'BEAT REPEAT' },
        spectral_clouds: { id: 7, label: 'SPECTRAL CLOUDS' },
        spectral_cloud: { id: 7, label: 'SPECTRAL CLOUDS' },
        sky: { id: 8, label: 'SKY / CLOUDSEEDCORE' },
      };

      const mode = modes[normalized];
      if (!mode) {
        return 'mode expects granular, stretch, looping_delay, spectral, oliverb, resonestor, beat_repeat, spectral_clouds, or sky';
      }

      definition.mode = mode.id;
      definition.parameters.set('MODE', mode.label);
      return null;
    }
    case 'reverse': {
      const value = evaluate(call.argument);
      if (typeof value !== 'boolean') return 'reverse expects true or false';
      definition.reverse = value;
      definition.parameters.set('REVERSE', value ? 'ON' : 'OFF');
      return null;
    }
    case 'view':
      if (call.argument.length > 0) return 'view does not accept parameters yet';
      moduleViews.add(objectName);
      return null;
    default:
      return `unknown Mist method: ${call.name}`;
  }
}


export function applySwellCall(
  objectName: string,
  swell: SwellDefinition,
  call: ChainedCall,
  moduleViews: Set<string>,
  evaluate: (expression: string) => ScalarValue | undefined,
): string | null {
  switch (call.name) {
    case 'freq': {
      const value = evaluate(call.argument);
      if (value === undefined) return null;
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 10000) return 'freq expects > 0 and <= 10000 Hz';
      swell.frequency = value;
      swell.parameters.set('FREQ', `${formatNumber(value)} HZ`);
      return null;
    }
    case 'slope':
    case 'shape':
    case 'smooth':
    case 'shift': {
      const value = evaluate(call.argument);
      if (value === undefined) return null;
      if (typeof value !== 'number') return `${call.name} expects one numeric expression`;
      const error = percentError(value, call.name);
      if (error) return error;
      swell[call.name] = value;
      swell.parameters.set(call.name.toUpperCase(), `${formatNumber(value)}%`);
      return null;
    }
    case 'mode': {
      const value = evaluate(call.argument);
      if (typeof value !== 'string') return 'mode expects "ad", "loop", or "ar"';
      const normalized = value.toLowerCase();
      const modes: Record<string, number> = { ad: 0, loop: 1, looping: 1, ar: 2 };
      const mode = modes[normalized];
      if (mode === undefined) return 'mode expects "ad", "loop", or "ar"';
      swell.mode = mode;
      swell.parameters.set('MODE', normalized === 'looping' ? 'LOOP' : normalized.toUpperCase());
      return null;
    }
    case 'output': {
      const value = evaluate(call.argument);
      if (typeof value !== 'string') return 'output expects "different", "amplitude", "phase", or "frequency"';
      const normalized = value.toLowerCase();
      const modes: Record<string, number> = {
        different: 0,
        shapes: 0,
        amplitude: 1,
        phase: 2,
        time: 2,
        frequency: 3,
      };
      const outputMode = modes[normalized];
      if (outputMode === undefined) return 'output expects "different", "amplitude", "phase", or "frequency"';
      swell.outputMode = outputMode;
      swell.parameters.set('OUTPUT', normalized.toUpperCase());
      return null;
    }
    case 'range': {
      const value = evaluate(call.argument);
      if (typeof value !== 'string') return 'range expects "control" or "audio"';
      const normalized = value.toLowerCase();
      if (normalized === 'control' || normalized === 'low' || normalized === 'medium') {
        swell.range = 0;
        swell.parameters.set('RANGE', normalized === 'control' ? 'CONTROL' : normalized.toUpperCase());
        return null;
      }
      if (normalized === 'audio' || normalized === 'high') {
        swell.range = 1;
        swell.parameters.set('RANGE', normalized === 'high' ? 'HIGH' : 'AUDIO');
        return null;
      }
      return 'range expects "control" or "audio"';
    }
    case 'view':
      if (call.argument) return 'view expects no arguments';
      moduleViews.add(objectName);
      return null;
    default:
      return `unknown Swell method: ${call.name}`;
  }
}

export function applyGainCall(
  objectName: string,
  gain: GainDefinition,
  call: ChainedCall,
  views: Map<string, ViewKind>,
  evaluate: (expression: string) => ScalarValue | undefined,
): string | null {
  switch (call.name) {
    case 'level': {
      const value = evaluate(call.argument);
      if (value === undefined) return null;
      if (typeof value !== 'number') return 'level expects one numeric expression';
      const error = gainLevelError(value);
      if (error) return error;
      gain.level = value;
      gain.parameters.set('LEVEL', `${formatNumber(value)}%`);
      return null;
    }
    case 'view':
      if (call.argument.length > 0) return 'view does not accept parameters yet';
      views.set(`${objectName}.out`, 'signal');
      return null;
    default:
      return `unknown gain method: ${call.name}`;
  }
}

const VOICE_MODEL_BACKEND_NAMES = [
  'analog', 'waves', 'fm', 'grain', 'additive', 'wavetable', 'chord', 'speech',
  'swarm', 'noise', 'particle', 'string', 'modal', 'kick', 'snare', 'hat',
  'analog-vcf', 'phase', 'fm6-a', 'fm6-b', 'fm6-c', 'terrain', 'strings', 'chiptune',
] as const;

const MACRO_MODEL_IDS = new Map<string, number>([
  ['analog', 1],
  ['waves', 2],
  ['fm', 3],
  ['grain', 4],
  ['additive', 5],
  ['wavetable', 6],
  ['chord', 7],
  ['speech', 8],
  ['swarm', 9],
  ['noise', 10],
  ['particle', 11],
  ['string', 12],
  // Backend slots 13..16 are intentionally not part of the public macro family:
  // modal synthesis and the three percussion engines are reserved for future
  // dedicated resonator/physical/drum families.
  ['analog-vcf', 17],
  ['phase', 18],
  ['terrain', 22],
  ['strings', 23],
  ['chiptune', 24],
]);

export function applyVoiceCall(
  objectName: string,
  voice: VoiceDefinition,
  call: ChainedCall,
  moduleViews: Set<string>,
  evaluate: (expression: string) => ScalarValue | undefined,
): string | null {
  switch (call.name) {
    case 'disabled': {
      const value = evaluate(call.argument);
      if (typeof value !== 'boolean') return 'disabled expects true or false';
      voice.disabled = value;
      return null;
    }
    case 'model': {
      const value = evaluate(call.argument);
      if (value === undefined) return null;
      return applyVoiceModelValue(voice, value);
    }
    case 'freq': {
      const value = evaluate(call.argument);
      if (value === undefined) return null;
      if (typeof value !== 'number') return 'freq expects one numeric expression';
      const error = frequencyError(value);
      if (error) return error;
      voice.frequency = value;
      voice.parameters.set('FREQ', `${formatNumber(value)} HZ`);
      return null;
    }
    case 'harmo':
    case 'timbre':
    case 'morph':
    case 'width':
    case 'density':
    case 'geometry':
    case 'structure':
    case 'brightness':
    case 'damping':
    case 'position':
    case 'space':
    case 'bow':
    case 'bowTimbre':
    case 'blow':
    case 'blowTimbre':
    case 'strike':
    case 'strikeTimbre': {
      const value = evaluate(call.argument);
      if (value === undefined) return null;
      if (typeof value !== 'number') return `${call.name} expects one numeric expression`;
      const error = percentError(value, call.name);
      if (error) return error;
      const parameter = call.name as VoiceParameterName;
      voice[parameter] = value;
      voice.parameters.set(call.name.toUpperCase(), `${formatNumber(value)}%`);
      return null;
    }
    case 'sample': {
      const value = evaluate(call.argument);
      if (typeof value !== 'string' || !value) return 'sample expects an asset alias';
      voice.sampleAlias = value; voice.parameters.set('SAMPLE', value); return null;
    }
    case 'sampleRoot': {
      const value = evaluate(call.argument);
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 'sample root expects a positive frequency';
      voice.sampleRootFrequency = value;
      voice.parameters.set('ROOT', `${formatNumber(value)} HZ`);
      return null;
    }
    case 'sampleRegion': {
      const parts = call.argument.split(',').map((part) => part.trim());
      if (parts.length !== 4) return 'invalid sample region';
      const start = Number(parts[0]);
      const end = Number(parts[1]);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > 100 || end < start || end > 100) return 'region expects 0..100 with end >= start';
      if (!/^(true|false)$/i.test(parts[2]) || !/^(true|false)$/i.test(parts[3])) return 'invalid sample region modifiers';
      voice.sampleStart = start;
      voice.sampleEnd = end;
      voice.sampleLoop = parts[2].toLowerCase() === 'true';
      voice.sampleReverse = parts[3].toLowerCase() === 'true';
      const flags = [voice.sampleLoop ? 'LOOP' : '', voice.sampleReverse ? 'REVERSE' : ''].filter(Boolean).join(', ');
      voice.parameters.set('REGION', `${formatNumber(start)}–${formatNumber(end)}%${flags ? ` · ${flags}` : ''}`);
      return null;
    }
    case 'polyphony': {
      const value = evaluate(call.argument);
      if (value === undefined) return null;
      if (typeof value !== 'number' || ![1, 2, 4].includes(value)) return 'polyphony expects 1, 2, or 4';
      voice.polyphony = value as 1 | 2 | 4;
      voice.parameters.set('POLYPHONY', `${value} NOTES`);
      return null;
    }
    case 'drive': {
      if (typeof call.argument !== 'string') return 'drive expects an envelope descriptor';
      try {
        const parsed = JSON.parse(call.argument);
        if (!parsed || typeof parsed.kind !== 'string' || !Array.isArray(parsed.values)) return 'invalid drive envelope';
        voice.drive = { kind: parsed.kind, values: parsed.values.map(Number) };
        voice.parameters.set('DRIVE', parsed.kind);
        return null;
      } catch { return 'invalid drive envelope'; }
    }
    case 'view':
      if (call.argument.length > 0) return 'view does not accept parameters yet';
      moduleViews.add(objectName);
      return null;
    default:
      return `unknown Voice method: ${call.name}`;
  }
}

export function applyVoiceModelValue(voice: VoiceDefinition, value: ScalarValue): string | null {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'composite') {
      voice.engine = 'composite';
      voice.soundId = normalized;
      voice.lpg = false;
      voice.parameters.set('MODEL', 'COMPOSITE');
      return null;
    }
    if (normalized === 'sample') {
      voice.engine = 'sample'; voice.soundId = normalized; voice.lpg = false; voice.parameters.set('MODEL', 'SAMPLE'); return null;
    }
    if (/^noise\.(?:white|dust|clocked|fractal)$/.test(normalized)) {
      voice.engine = 'noise';
      voice.soundId = normalized;
      voice.lpg = false;
      voice.parameters.set('MODEL', normalized.toUpperCase());
      return null;
    }
    if (normalized === 'matter') {
      voice.engine = 'matter';
      voice.soundId = normalized;
      voice.lpg = false;
      voice.parameters.set('MODEL', normalized.toUpperCase());
      return null;
    }
    if (normalized === 'sine' || normalized === 'triangle' || normalized === 'sawtooth' || normalized === 'ramp' || normalized === 'square') {
      voice.engine = 'oscillator';
      voice.soundId = normalized;
      voice.lpg = false;
      voice.parameters.set('MODEL', normalized.toUpperCase());
      return null;
    }
    const resonatorModels: Record<string, number> = {
      'resonator.modal': 0,
      'resonator.sympathetic': 1,
      'resonator.strings': 1,
      'resonator.string': 2,
    };
    if (normalized in resonatorModels) {
      voice.engine = 'resonator';
      voice.soundId = normalized;
      voice.model = resonatorModels[normalized];
      voice.lpg = false;
      voice.parameters.set('MODEL', normalized.toUpperCase());
      return null;
    }
  }
  const model = parseVoiceModelValue(value);
  if (model === null) return 'model expects macro.*, noise.white, noise.dust, noise.clocked, noise.fractal, matter, resonator.*, sine, triangle, sawtooth, ramp, square, composite, or sample';
  voice.engine = 'macro';
  voice.model = model;
  voice.soundId = formatVoiceModelId(model);
  voice.parameters.set('MODEL', formatVoiceModel(model));
  return null;
}

export function formatVoiceModelId(model: number): string {
  for (const [algorithm, id] of MACRO_MODEL_IDS) if (id === model) return `macro.${algorithm}`;
  return `internal.${model}`;
}

export function parseVoiceModelValue(value: ScalarValue): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 24) return value;
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  const macro = normalized.match(/^macro\.([a-z0-9_-]+)$/);
  if (macro) return MACRO_MODEL_IDS.get(macro[1]) ?? null;

  // Low-level compatibility: backend model names remain accepted internally,
  // but the high-level language exposes only engine.algorithm identifiers.
  const backendIndex = VOICE_MODEL_BACKEND_NAMES.indexOf(normalized as typeof VOICE_MODEL_BACKEND_NAMES[number]);
  return backendIndex >= 0 ? backendIndex + 1 : null;
}

export function formatVoiceModel(model: number): string {
  for (const [algorithm, id] of MACRO_MODEL_IDS) {
    if (id === model) return `${model} MACRO.${algorithm.toUpperCase()}`;
  }
  return `${model} INTERNAL`;
}
function percentError(value: number, name: string): string | null {
  return !Number.isFinite(value) || value < 0 || value > 100
    ? `${name} must be between 0 and 100`
    : null;
}

function frequencyError(value: number): string | null {
  return !Number.isFinite(value) || value < 20 || value > 20000
    ? 'frequency must be between 20 and 20000 Hz'
    : null;
}

function gainLevelError(value: number): string | null {
  return !Number.isFinite(value) || value < -100 || value > 100
    ? 'gain level must be between 0 and 100'
    : null;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
