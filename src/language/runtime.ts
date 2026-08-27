import { AudioEngine, type AudioProgram } from '../audio/engine';

export interface EvaluationResult {
  message: string;
}

export interface SonusDiagnostic {
  line: number;
  message: string;
}

export interface SchemeParameter {
  name: string;
  value: string;
}

export interface SchemeNode {
  id: string;
  label: string;
  kind: 'module' | 'view';
  parameters: SchemeParameter[];
  signal?: string;
}

export interface SchemeConnection {
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
  type: 'audio' | 'view';
  amount?: number;
}

export interface SchemeModel {
  nodes: SchemeNode[];
  connections: SchemeConnection[];
}

export class SonusEvaluationError extends SyntaxError {
  constructor(public readonly diagnostics: SonusDiagnostic[]) {
    super(diagnostics[0]?.message ?? 'evaluation failed');
    this.name = 'SonusEvaluationError';
  }
}

interface OscillatorDefinition {
  frequency: number;
  parameters: Map<string, string>;
}

interface GainDefinition {
  level: number;
  parameters: Map<string, string>;
}

interface VoiceDefinition {
  model: number;
  frequency: number;
  harmo: number;
  timbre: number;
  morph: number;
  parameters: Map<string, string>;
}

interface RouteDefinition {
  source: string;
  target: string;
  amount: number;
}

export class SonusRuntime {
  private scheme: SchemeModel = {
    nodes: [{ id: 'Main', label: 'MAIN', kind: 'module', parameters: [] }],
    connections: [],
  };

  constructor(private readonly audio: AudioEngine) {}

  getSchemeModel(): SchemeModel {
    return {
      nodes: this.scheme.nodes.map((node) => ({
        ...node,
        parameters: node.parameters.map((parameter) => ({ ...parameter })),
      })),
      connections: this.scheme.connections.map((connection) => ({ ...connection })),
    };
  }

  evaluate(source: string): EvaluationResult[] {
    const oscillators = new Map<string, OscillatorDefinition>();
    const gains = new Map<string, GainDefinition>();
    const voices = new Map<string, VoiceDefinition>();
    const routes = new Map<string, RouteDefinition>();
    const views = new Set<string>();
    const results: EvaluationResult[] = [];
    const diagnostics: SonusDiagnostic[] = [];

    const lines = source
      .split(/\r?\n/)
      .map((line, index) => ({ source: line.trim(), line: index + 1 }))
      .filter(({ source: line }) => line.length > 0 && !line.startsWith('#'));

    // Pass 1: declarations. Objects are collected before the remaining statements
    // so the source remains declarative rather than execution-order dependent.
    for (const { source: line, line: lineNumber } of lines) {
      const oscillatorDeclaration = parseOscillatorDeclaration(line);
      if (oscillatorDeclaration) {
        const { name, calls } = oscillatorDeclaration;
        if (reservedOrDuplicate(name, oscillators, gains, voices, diagnostics, lineNumber)) continue;

        const definition: OscillatorDefinition = { frequency: 440, parameters: new Map() };
        oscillators.set(name, definition);
        for (const call of calls) {
          const error = applyOscillatorCall(name, definition, call, views);
          if (error) diagnostics.push({ line: lineNumber, message: error });
        }
        results.push({ message: `${name} = osc` });
        continue;
      }

      const gainDeclaration = parseGainDeclaration(line);
      if (gainDeclaration) {
        const { name, calls } = gainDeclaration;
        if (reservedOrDuplicate(name, oscillators, gains, voices, diagnostics, lineNumber)) continue;

        const definition: GainDefinition = { level: 100, parameters: new Map() };
        gains.set(name, definition);
        for (const call of calls) {
          const error = applyGainCall(name, definition, call, views);
          if (error) diagnostics.push({ line: lineNumber, message: error });
        }
        results.push({ message: `${name} = gain` });
      }

      const voiceDeclaration = parseVoiceDeclaration(line);
      if (voiceDeclaration) {
        const { name, calls } = voiceDeclaration;
        if (reservedOrDuplicate(name, oscillators, gains, voices, diagnostics, lineNumber)) continue;

        const definition: VoiceDefinition = {
          model: 1,
          frequency: 440,
          harmo: 50,
          timbre: 50,
          morph: 50,
          parameters: new Map(),
        };
        voices.set(name, definition);
        for (const call of calls) {
          const error = applyVoiceCall(name, definition, call, views);
          if (error) diagnostics.push({ line: lineNumber, message: error });
        }
        results.push({ message: `${name} = Voice` });
      }
    }

    // Pass 2: parameters, views and routes. Invalid lines do not stop validation
    // of later lines. The audio program is applied only if the whole document is valid.
    for (const { source: line, line: lineNumber } of lines) {
      if (parseOscillatorDeclaration(line) || parseGainDeclaration(line) || parseVoiceDeclaration(line)) continue;

      let match = line.match(/^([A-Za-z_]\w*)\.freq\(\s*(-?\d+(?:\.\d+)?)\s*\)\s*$/);
      if (match) {
        const [, name, rawFrequency] = match;
        const oscillator = oscillators.get(name);
        const voice = voices.get(name);
        if (!oscillator && !voice) {
          diagnostics.push({ line: lineNumber, message: `unknown frequency-capable object: ${name}` });
          continue;
        }

        const frequency = Number(rawFrequency);
        const error = frequencyError(frequency);
        if (error) {
          diagnostics.push({ line: lineNumber, message: error });
          continue;
        }

        if (oscillator) {
          oscillator.frequency = frequency;
          oscillator.parameters.delete('NOTE');
          oscillator.parameters.set('FREQ', `${formatNumber(frequency)} HZ`);
        } else if (voice) {
          voice.frequency = frequency;
          voice.parameters.set('FREQ', `${formatNumber(frequency)} HZ`);
        }
        results.push({ message: `${name}.freq ${formatNumber(frequency)} hz` });
        continue;
      }

      match = line.match(/^([A-Za-z_]\w*)\.note\(\s*(-?\d+(?:\.\d+)?)\s*\)\s*$/);
      if (match) {
        const [, name, rawNote] = match;
        const oscillator = oscillators.get(name);
        if (!oscillator) {
          diagnostics.push({ line: lineNumber, message: `unknown osc object: ${name}` });
          continue;
        }

        const note = Number(rawNote);
        const error = noteError(note);
        if (error) {
          diagnostics.push({ line: lineNumber, message: error });
          continue;
        }

        oscillator.frequency = midiToFrequency(note);
        oscillator.parameters.delete('FREQ');
        oscillator.parameters.set('NOTE', formatNumber(note));
        results.push({ message: `${name}.note ${formatNumber(note)}` });
        continue;
      }

      match = line.match(/^([A-Za-z_]\w*)\.level\(\s*(-?\d+(?:\.\d+)?)\s*\)\s*$/);
      if (match) {
        const [, name, rawLevel] = match;
        const gain = gains.get(name);
        if (!gain) {
          diagnostics.push({ line: lineNumber, message: `unknown gain object: ${name}` });
          continue;
        }

        const level = Number(rawLevel);
        const error = gainLevelError(level);
        if (error) {
          diagnostics.push({ line: lineNumber, message: error });
          continue;
        }

        gain.level = level;
        gain.parameters.set('LEVEL', `${formatNumber(level)}%`);
        results.push({ message: `${name}.level ${formatNumber(level)}%` });
        continue;
      }

      match = line.match(/^([A-Za-z_]\w*)\.model\(\s*(.+?)\s*\)\s*$/);
      if (match) {
        const [, name, rawModel] = match;
        const voice = voices.get(name);
        if (!voice) {
          diagnostics.push({ line: lineNumber, message: `unknown Voice object: ${name}` });
          continue;
        }
        const model = parseVoiceModel(rawModel);
        if (model === null) {
          diagnostics.push({ line: lineNumber, message: 'model expects 1..24 or a known model name' });
          continue;
        }
        voice.model = model;
        voice.parameters.set('MODEL', formatVoiceModel(model));
        results.push({ message: `${name}.model ${formatVoiceModel(model)}` });
        continue;
      }

      match = line.match(/^([A-Za-z_]\w*)\.(harmo|timbre|morph)\(\s*(-?\d+(?:\.\d+)?)\s*\)\s*$/);
      if (match) {
        const [, name, parameter, rawValue] = match;
        const voice = voices.get(name);
        if (!voice) {
          diagnostics.push({ line: lineNumber, message: `unknown Voice object: ${name}` });
          continue;
        }
        const value = Number(rawValue);
        const error = percentError(value, parameter);
        if (error) {
          diagnostics.push({ line: lineNumber, message: error });
          continue;
        }
        voice[parameter as 'harmo' | 'timbre' | 'morph'] = value;
        voice.parameters.set(parameter.toUpperCase(), `${formatNumber(value)}%`);
        results.push({ message: `${name}.${parameter} ${formatNumber(value)}%` });
        continue;
      }

      if (/^Main(?:\.out)?\.view\(\s*\)\s*$/.test(line)) {
        views.add('Main.out');
        results.push({ message: 'Main.out view' });
        continue;
      }

      match = line.match(/^([A-Za-z_]\w*)\.aux\.view\(\s*\)\s*$/);
      if (match) {
        const name = match[1];
        if (!voices.has(name)) {
          diagnostics.push({ line: lineNumber, message: `aux output is only available on Voice objects: ${name}` });
          continue;
        }
        views.add(`${name}.aux`);
        results.push({ message: `${name}.aux view` });
        continue;
      }

      match = line.match(/^([A-Za-z_]\w*)(?:\.out)?\.view\(\s*\)\s*$/);
      if (match) {
        const name = match[1];
        if (!objectExists(name, oscillators, gains, voices)) {
          diagnostics.push({ line: lineNumber, message: `unknown object: ${name}` });
          continue;
        }

        views.add(`${name}.out`);
        results.push({ message: `${name}.out view` });
        continue;
      }

      match = line.match(/^([A-Za-z_]\w*)\.(out|aux)(?:\(\s*(-?\d+(?:\.\d+)?)\s*\))?\s*->\s*([A-Za-z_]\w*)\.in\s*$/);
      if (match) {
        const [, sourceName, sourcePort, rawAmount, targetName] = match;
        if (!objectExists(sourceName, oscillators, gains, voices)) {
          diagnostics.push({ line: lineNumber, message: `unknown source object: ${sourceName}` });
          continue;
        }
        if (sourcePort === 'aux' && !voices.has(sourceName)) {
          diagnostics.push({ line: lineNumber, message: `aux output is only available on Voice objects: ${sourceName}` });
          continue;
        }
        if (targetName !== 'Main' && !gains.has(targetName)) {
          diagnostics.push({ line: lineNumber, message: `unknown or non-input object: ${targetName}` });
          continue;
        }

        const amount = rawAmount === undefined ? 100 : Number(rawAmount);
        const error = routeAmountError(amount);
        if (error) {
          diagnostics.push({ line: lineNumber, message: error });
          continue;
        }

        const source = `${sourceName}.${sourcePort}`;
        const target = `${targetName}.in`;
        routes.set(`${source}->${target}`, { source, target, amount });
        results.push({ message: `${source} -> ${target} @ ${formatNumber(amount)}%` });
        continue;
      }

      diagnostics.push({ line: lineNumber, message: `cannot evaluate: ${line}` });
    }

    if (diagnostics.length > 0) throw new SonusEvaluationError(diagnostics);

    const schemeNodes: SchemeNode[] = [
      ...[...oscillators.entries()].map(([name, definition]) => ({
        id: name,
        label: `${name.toUpperCase()} : OSC`,
        kind: 'module' as const,
        parameters: [...definition.parameters.entries()].map(([parameterName, value]) => ({
          name: parameterName,
          value,
        })),
      })),
      ...[...voices.entries()].map(([name, definition]) => ({
        id: name,
        label: `${name.toUpperCase()} : VOICE`,
        kind: 'module' as const,
        parameters: [...definition.parameters.entries()].map(([parameterName, value]) => ({
          name: parameterName,
          value,
        })),
      })),
      ...[...gains.entries()].map(([name, definition]) => ({
        id: name,
        label: `${name.toUpperCase()} : GAIN`,
        kind: 'module' as const,
        parameters: [...definition.parameters.entries()].map(([parameterName, value]) => ({
          name: parameterName,
          value,
        })),
      })),
      { id: 'Main', label: 'MAIN', kind: 'module' as const, parameters: [] },
      ...[...views].map((signal) => ({
        id: `view:${signal}`,
        label: `VIEW : ${signal.toUpperCase()}`,
        kind: 'view' as const,
        parameters: [],
        signal,
      })),
    ];

    const schemeConnections: SchemeConnection[] = [
      ...[...routes.values()].map((route) => ({
        source: route.source.replace(/\.(out|aux)$/, ''),
        target: route.target === 'Main.in' ? 'Main' : route.target.replace(/\.in$/, ''),
        sourcePort: route.source.endsWith('.aux') ? 'AUX' : 'OUT',
        targetPort: 'IN',
        type: 'audio' as const,
        amount: route.amount,
      })),
      ...[...views].map((signal) => {
        const source = signal === 'Main.out' ? 'Main' : signal.replace(/\.(out|aux)$/, '');
        return {
          source,
          target: `view:${signal}`,
          sourcePort: signal.endsWith('.aux') ? 'AUX' : 'OUT',
          type: 'view' as const,
        };
      }),
    ];

    this.scheme = { nodes: schemeNodes, connections: schemeConnections };

    const program: AudioProgram = {
      oscillators: [...oscillators.entries()].map(([name, definition]) => ({
        name,
        frequency: definition.frequency,
      })),
      voices: [...voices.entries()].map(([name, definition]) => ({
        name,
        model: definition.model,
        frequency: definition.frequency,
        harmo: definition.harmo,
        timbre: definition.timbre,
        morph: definition.morph,
      })),
      gains: [...gains.entries()].map(([name, definition]) => ({
        name,
        level: definition.level,
      })),
      routes: [...routes.values()].map((route) => ({
        source: route.source,
        destination: route.target,
        amount: route.amount,
      })),
      views: [...views].map((signal) => ({ signal })),
    };

    this.audio.applyProgram(program);
    return results.length > 0 ? results : [{ message: 'ok' }];
  }
}

interface ChainedCall {
  name: string;
  argument: string;
}

interface ObjectDeclaration {
  name: string;
  calls: ChainedCall[];
}

function parseOscillatorDeclaration(line: string): ObjectDeclaration | null {
  return parseDeclaration(line, 'osc');
}

function parseGainDeclaration(line: string): ObjectDeclaration | null {
  return parseDeclaration(line, 'gain');
}

function parseVoiceDeclaration(line: string): ObjectDeclaration | null {
  return parseDeclaration(line, 'Voice');
}

function parseDeclaration(line: string, constructorName: string): ObjectDeclaration | null {
  const match = line.match(new RegExp(`^([A-Za-z_]\\w*)\\s*=\\s*${constructorName}\\(\\s*\\)(.*)$`));
  if (!match) return null;

  const name = match[1];
  const tail = match[2].trim();
  if (!tail) return { name, calls: [] };

  const calls: ChainedCall[] = [];
  let consumed = '';
  const callPattern = /\.([A-Za-z_]\w*)\(\s*([^()]*)\s*\)/g;
  let callMatch: RegExpExecArray | null;
  while ((callMatch = callPattern.exec(tail)) !== null) {
    if (callMatch.index !== consumed.length) return null;
    consumed += callMatch[0];
    calls.push({ name: callMatch[1], argument: callMatch[2].trim() });
  }

  return consumed === tail ? { name, calls } : null;
}

function reservedOrDuplicate(
  name: string,
  oscillators: Map<string, OscillatorDefinition>,
  gains: Map<string, GainDefinition>,
  voices: Map<string, VoiceDefinition>,
  diagnostics: SonusDiagnostic[],
  lineNumber: number,
): boolean {
  if (name === 'Main') {
    diagnostics.push({ line: lineNumber, message: 'Main is a built-in singleton and cannot be assigned' });
    return true;
  }
  if (objectExists(name, oscillators, gains, voices)) {
    diagnostics.push({ line: lineNumber, message: `duplicate object: ${name}` });
    return true;
  }
  return false;
}

function objectExists(
  name: string,
  oscillators: Map<string, OscillatorDefinition>,
  gains: Map<string, GainDefinition>,
  voices: Map<string, VoiceDefinition>,
): boolean {
  return oscillators.has(name) || gains.has(name) || voices.has(name);
}

function applyOscillatorCall(
  objectName: string,
  oscillator: OscillatorDefinition,
  call: ChainedCall,
  views: Set<string>,
): string | null {
  switch (call.name) {
    case 'freq': {
      const frequency = parseSingleNumber(call.argument);
      if (frequency === null) return 'freq expects one numeric value';
      const error = frequencyError(frequency);
      if (error) return error;
      oscillator.frequency = frequency;
      oscillator.parameters.delete('NOTE');
      oscillator.parameters.set('FREQ', `${formatNumber(frequency)} HZ`);
      return null;
    }
    case 'note': {
      const note = parseSingleNumber(call.argument);
      if (note === null) return 'note expects one numeric value';
      const error = noteError(note);
      if (error) return error;
      oscillator.frequency = midiToFrequency(note);
      oscillator.parameters.delete('FREQ');
      oscillator.parameters.set('NOTE', formatNumber(note));
      return null;
    }
    case 'view':
      if (call.argument.length > 0) return 'view does not accept parameters yet';
      views.add(`${objectName}.out`);
      return null;
    default:
      return `unknown osc method: ${call.name}`;
  }
}

function applyGainCall(
  objectName: string,
  gain: GainDefinition,
  call: ChainedCall,
  views: Set<string>,
): string | null {
  switch (call.name) {
    case 'level': {
      const level = parseSingleNumber(call.argument);
      if (level === null) return 'level expects one numeric value';
      const error = gainLevelError(level);
      if (error) return error;
      gain.level = level;
      gain.parameters.set('LEVEL', `${formatNumber(level)}%`);
      return null;
    }
    case 'view':
      if (call.argument.length > 0) return 'view does not accept parameters yet';
      views.add(`${objectName}.out`);
      return null;
    default:
      return `unknown gain method: ${call.name}`;
  }
}

const VOICE_MODEL_NAMES = [
  'analog', 'waves', 'fm', 'grain', 'additive', 'wavetable', 'chord', 'speech',
  'swarm', 'noise', 'particle', 'string', 'modal', 'kick', 'snare', 'hat',
  'analog-vcf', 'phase', 'fm6-a', 'fm6-b', 'fm6-c', 'terrain', 'strings', 'chiptune',
] as const;

function applyVoiceCall(
  objectName: string,
  voice: VoiceDefinition,
  call: ChainedCall,
  views: Set<string>,
): string | null {
  switch (call.name) {
    case 'model': {
      const model = parseVoiceModel(call.argument);
      if (model === null) return 'model expects 1..24 or a known model name';
      voice.model = model;
      voice.parameters.set('MODEL', formatVoiceModel(model));
      return null;
    }
    case 'freq': {
      const frequency = parseSingleNumber(call.argument);
      if (frequency === null) return 'freq expects one numeric value';
      const error = frequencyError(frequency);
      if (error) return error;
      voice.frequency = frequency;
      voice.parameters.set('FREQ', `${formatNumber(frequency)} HZ`);
      return null;
    }
    case 'harmo':
    case 'timbre':
    case 'morph': {
      const value = parseSingleNumber(call.argument);
      if (value === null) return `${call.name} expects one numeric value`;
      const error = percentError(value, call.name);
      if (error) return error;
      voice[call.name] = value;
      voice.parameters.set(call.name.toUpperCase(), `${formatNumber(value)}%`);
      return null;
    }
    case 'view':
      if (call.argument.length > 0) return 'view does not accept parameters yet';
      views.add(`${objectName}.out`);
      return null;
    default:
      return `unknown Voice method: ${call.name}`;
  }
}

function parseVoiceModel(value: string): number | null {
  const numeric = parseSingleNumber(value);
  if (numeric !== null && Number.isInteger(numeric) && numeric >= 1 && numeric <= 24) return numeric;
  const stringMatch = value.match(/^['\"]([^'\"]+)['\"]$/);
  if (!stringMatch) return null;
  const normalized = stringMatch[1].trim().toLowerCase();
  const index = VOICE_MODEL_NAMES.indexOf(normalized as typeof VOICE_MODEL_NAMES[number]);
  return index >= 0 ? index + 1 : null;
}

function formatVoiceModel(model: number): string {
  return `${model} ${VOICE_MODEL_NAMES[model - 1]?.toUpperCase() ?? ''}`.trim();
}

function percentError(value: number, name: string): string | null {
  return !Number.isFinite(value) || value < 0 || value > 100
    ? `${name} must be between 0 and 100`
    : null;
}

function parseSingleNumber(value: string): number | null {
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function midiToFrequency(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

function frequencyError(value: number): string | null {
  return !Number.isFinite(value) || value < 20 || value > 20000
    ? 'frequency must be between 20 and 20000 Hz'
    : null;
}

function noteError(value: number): string | null {
  return !Number.isFinite(value) || value < 0 || value > 127
    ? 'note must be between 0 and 127'
    : null;
}

function gainLevelError(value: number): string | null {
  return !Number.isFinite(value) || value < 0 || value > 100
    ? 'gain level must be between 0 and 100'
    : null;
}

function routeAmountError(value: number): string | null {
  return !Number.isFinite(value) || value < 0 || value > 100
    ? 'route amount must be between 0 and 100'
    : null;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
