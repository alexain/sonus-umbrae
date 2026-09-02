import { AudioEngine, type AudioProgram, type SignalKind } from '../audio/engine';
import { evaluateExpression, ExpressionError, type ScalarValue } from './expression';


const RESERVED_IDENTIFIERS = new Set([
  // Built-in objects and constructors.
  'audio',
  'clock',
  'midi',
  'voice',
  'swell',
  'dices',
  'mist',
  'pattern',
  'scale',
  'osc',
  'gain',

  // Current expression functions.
  'rnd',
  'choose',
  'coin',
  'clamp',
  'map',
  'min',
  'max',
  'abs',
  'round',
  'floor',
  'ceil',

  // Language keywords reserved before their implementation.
  'when',
  'prob',
  'every',
  'skip',
  'if',
  'else',
  'for',
  'while',
  'after',
  'repeat',
  'walk',
  'chaos',
  'seed',
  'wrap',
  'quantize',
  'slew',
]);

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
  liveSignal?: string;
}

export type ViewKind = SignalKind | 'parameter';

export interface ParameterViewState {
  signal: string;
  label: string;
  value: string;
  base: string;
}

export interface VariableViewState {
  name: string;
  value: string;
}

export interface SchemeEmbeddedView {
  signal: string;
  signals?: string[];
  signalKind: SignalKind;
  port: string;
}

export interface SchemeNode {
  id: string;
  label: string;
  kind: 'module';
  parameters: SchemeParameter[];
  views?: SchemeEmbeddedView[];
}

export interface SchemeConnection {
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
  type: SignalKind | 'view';
  amount?: number;
  signalKind?: ViewKind;
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

interface SwellDefinition {
  frequency: number;
  slope: number;
  shape: number;
  smooth: number;
  shift: number;
  mode: number;
  outputMode: number;
  range: number;
  parameters: Map<string, string>;
}

interface DicesDefinition {
  rate: number;
  jitter: number;
  gateBias: number;
  gateLength: number;
  gateJitter: number;
  spread: number;
  bias: number;
  steps: number;
  deja: number;
  length: number;
  scale: number;
  parameters: Map<string, string>;
}

interface MistDefinition {
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

interface RouteDefinition {
  source: string;
  target: string;
  amount: number;
  kind: SignalKind;
}

interface ClockDefinition {
  rate: number;
  rateLabel: string;
  parameters: Map<string, string>;
}

interface LanguageSequenceDefinition {
  values: number[];
  mode: 'order' | 'random' | 'walk' | 'shuffle' | 'reverse';
}

interface LanguageCycleDefinition {
  amount: number;
  unit: 'ms' | 'sec' | 'beat';
  chance: number;
  drift: boolean;
  loose: boolean;
}

export class SonusRuntime {
  private parameterViews: ParameterViewState[] = [];
  private variableViews: VariableViewState[] = [];
  private explicitSignalViews: Array<{ signal: string; kind: SignalKind }> = [];
  private moduleViews = new Set<string>();

  private scheme: SchemeModel = {
    nodes: [{ id: 'Audio', label: 'AUDIO OUT', kind: 'module', parameters: [] }],
    connections: [],
  };

  private whenUnsubscribers: Array<() => void> = [];
  private cycleUnsubscribers: Array<() => void> = [];

  constructor(private readonly audio: AudioEngine) {}

  getParameterViews(): ParameterViewState[] {
    return this.parameterViews.map((view) => ({ ...view }));
  }

  getVariableViews(): VariableViewState[] {
    return this.variableViews.map((view) => ({ ...view }));
  }

  getExplicitSignalViews(): Array<{ signal: string; kind: SignalKind }> {
    return this.explicitSignalViews.map((view) => ({ ...view }));
  }

  getModuleViews(): string[] {
    return [...this.moduleViews];
  }

  getSchemeModel(): SchemeModel {
    return {
      nodes: this.scheme.nodes.map((node) => ({
        ...node,
        parameters: node.parameters.map((parameter) => ({ ...parameter })),
        views: node.views?.map((view) => ({ ...view })),
      })),
      connections: this.scheme.connections.map((connection) => ({ ...connection })),
    };
  }

  evaluate(source: string): EvaluationResult[] {
    const oscillators = new Map<string, OscillatorDefinition>();
    const gains = new Map<string, GainDefinition>();
    const voices = new Map<string, VoiceDefinition>();
    const swells = new Map<string, SwellDefinition>();
    const dices = new Map<string, DicesDefinition>();
    const mists = new Map<string, MistDefinition>();
    const routes = new Map<string, RouteDefinition>();
    const clockSources = new Map<string, ClockDefinition>();
    let clockBpm = 0;
    const views = new Map<string, ViewKind>();
    const moduleViews = new Set<string>();
    const parameterViews = new Map<string, ParameterViewState>();
    const variableViewRequests: Array<{ name: string; line: number }> = [];
    const variables = new Map<string, ScalarValue>();
    const generativeState = new Map<string, number | { x: number; y: number }>();
    let randomState = 0x6d2b79f5;
    const random = (): number => {
      // xorshift32: small, deterministic, and sufficient for musical/generative use.
      let x = randomState | 0;
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      randomState = x >>> 0;
      return randomState / 0x100000000;
    };
    const results: EvaluationResult[] = [];
    const diagnostics: SonusDiagnostic[] = [];

    const parsedWhen = extractWhenBlocks(source);
    if (parsedWhen.diagnostics.length > 0) throw new SonusEvaluationError(parsedWhen.diagnostics);
    const lines = parseStatements(parsedWhen.source);

    const languageSequences = new Map<string, LanguageSequenceDefinition>();
    const languageCycles = new Map<string, LanguageCycleDefinition>();
    for (const { source: line, line: lineNumber } of lines) {
      const sequence = parseLanguageSequenceDirective(line);
      if (sequence) {
        if (sequence.values.length === 0 || sequence.values.some((value) => !Number.isFinite(value) || value <= 0)) {
          diagnostics.push({ line: lineNumber, message: 'invalid internal sequence values' });
        } else {
          languageSequences.set(sequence.name, { values: sequence.values, mode: sequence.mode });
        }
        continue;
      }

      const cycle = parseLanguageCycleDirective(line);
      if (cycle) {
        languageCycles.set(cycle.name, {
          amount: cycle.amount,
          unit: cycle.unit,
          chance: cycle.chance,
          drift: cycle.drift,
          loose: cycle.loose,
        });
      }
    }

    // Pass 1: declarations. Objects are collected before the remaining statements
    // so the source remains declarative rather than execution-order dependent.
    for (const { source: line, line: lineNumber } of lines) {
      const clockDeclaration = parseClockDeclaration(line);
      if (clockDeclaration) {
        const { name, rate, label, calls } = clockDeclaration;
        const reservationError = identifierReservationError(name);
        if (reservationError) {
          diagnostics.push({ line: lineNumber, message: reservationError });
          continue;
        }
        if (objectExists(name, oscillators, gains, voices) || clockSources.has(name)) {
          diagnostics.push({ line: lineNumber, message: `duplicate object: ${name}` });
          continue;
        }
        const definition: ClockDefinition = { rate, rateLabel: label, parameters: new Map([['RATE', label]]) };
        clockSources.set(name, definition);
        for (const call of calls) {
          if (call.name === 'view' && call.argument.length === 0) views.set(`${name}.out`, 'trigger');
          else diagnostics.push({ line: lineNumber, message: `unknown clock method: ${call.name}` });
        }
        results.push({ message: `${name} = Clock ${label}` });
        continue;
      }

      const oscillatorDeclaration = parseOscillatorDeclaration(line);
      if (oscillatorDeclaration) {
        const { name, calls } = oscillatorDeclaration;
        if (swells.has(name) || dices.has(name) || reservedOrDuplicate(name, oscillators, gains, voices, diagnostics, lineNumber)) { if (swells.has(name) || dices.has(name)) diagnostics.push({ line: lineNumber, message: `duplicate object: ${name}` }); continue; }

        const definition: OscillatorDefinition = { frequency: 440, parameters: new Map() };
        oscillators.set(name, definition);
        void calls;
        results.push({ message: `${name} = osc` });
        continue;
      }

      const gainDeclaration = parseGainDeclaration(line);
      if (gainDeclaration) {
        const { name, calls } = gainDeclaration;
        if (swells.has(name) || dices.has(name) || reservedOrDuplicate(name, oscillators, gains, voices, diagnostics, lineNumber)) { if (swells.has(name) || dices.has(name)) diagnostics.push({ line: lineNumber, message: `duplicate object: ${name}` }); continue; }

        const definition: GainDefinition = { level: 100, parameters: new Map() };
        gains.set(name, definition);
        void calls;
        results.push({ message: `${name} = gain` });
        continue;
      }

      const voiceDeclaration = parseVoiceDeclaration(line);
      if (voiceDeclaration) {
        const { name, calls } = voiceDeclaration;
        if (swells.has(name) || dices.has(name) || reservedOrDuplicate(name, oscillators, gains, voices, diagnostics, lineNumber)) { if (swells.has(name) || dices.has(name)) diagnostics.push({ line: lineNumber, message: `duplicate object: ${name}` }); continue; }

        const definition: VoiceDefinition = {
          model: 1,
          frequency: 440,
          harmo: 50,
          timbre: 50,
          morph: 50,
          parameters: new Map(),
        };
        voices.set(name, definition);
        void calls;
        results.push({ message: `${name} = Voice` });
        continue;
      }

      const swellDeclaration = parseSwellDeclaration(line);
      if (swellDeclaration) {
        const { name } = swellDeclaration;
        const reservationError = identifierReservationError(name);
        if (reservationError) {
          diagnostics.push({ line: lineNumber, message: reservationError });
          continue;
        }
        if (objectExists(name, oscillators, gains, voices) || swells.has(name) || dices.has(name) || clockSources.has(name)) {
          diagnostics.push({ line: lineNumber, message: `duplicate object: ${name}` });
          continue;
        }
        swells.set(name, {
          frequency: 0.25,
          slope: 50,
          shape: 50,
          smooth: 50,
          shift: 50,
          mode: 1,
          outputMode: 2,
          range: 0,
          parameters: new Map(),
        });
        results.push({ message: `${name} = Swell` });
        continue;
      }

      const dicesDeclaration = parseDicesDeclaration(line);
      if (dicesDeclaration) {
        const { name } = dicesDeclaration;
        const reservationError = identifierReservationError(name);
        if (reservationError) {
          diagnostics.push({ line: lineNumber, message: reservationError });
          continue;
        }
        if (objectExists(name, oscillators, gains, voices) || swells.has(name) || dices.has(name) || clockSources.has(name)) {
          diagnostics.push({ line: lineNumber, message: `duplicate object: ${name}` });
          continue;
        }
        dices.set(name, {
          rate: 50,
          jitter: 0,
          gateBias: 50,
          gateLength: 45,
          gateJitter: 0,
          spread: 50,
          bias: 50,
          steps: 75,
          deja: 0,
          length: 8,
          scale: 0,
          parameters: new Map(),
        });
        results.push({ message: `${name} = Dices` });
        continue;
      }

      const mistDeclaration = parseMistDeclaration(line);
      if (mistDeclaration) {
        const { name } = mistDeclaration;
        const reservationError = identifierReservationError(name);
        if (reservationError) {
          diagnostics.push({ line: lineNumber, message: reservationError });
          continue;
        }
        if (objectExists(name, oscillators, gains, voices) || swells.has(name) || dices.has(name) || mists.has(name) || clockSources.has(name)) {
          diagnostics.push({ line: lineNumber, message: `duplicate object: ${name}` });
          continue;
        }
        mists.set(name, {
          position: 50,
          size: 50,
          pitch: 0,
          density: 50,
          texture: 50,
          mix: 0,
          spread: 50,
          feedback: 0,
          reverb: 0,
          freeze: false,
          reverse: false,
          mode: 0,
          parameters: new Map([
            ['MODE', 'GRANULAR'],
            ['BACKEND', 'SUPERPARASITES'],
          ]),
        });
        results.push({ message: `${name} = Mist` });
        continue;
      }
    }

    const resolveMember = (path: string[]): ScalarValue | undefined => {
      if (path.length < 2 || path.length > 3) return undefined;
      const [name, parameter, qualifier] = path;
      if (qualifier !== undefined && qualifier !== 'base') return undefined;
      if (name === 'Clock' && parameter === 'bpm') return clockBpm;
      const oscillator = oscillators.get(name);
      const voice = voices.get(name);
      const gain = gains.get(name);
      const swell = swells.get(name);
      if (parameter === 'freq') return oscillator?.frequency ?? voice?.frequency ?? swell?.frequency;
      if (parameter === 'level') return gain?.level;
      if (parameter === 'model') return voice?.model;
      if (voice && (parameter === 'harmo' || parameter === 'timbre' || parameter === 'morph')) return voice[parameter];
      if (swell && (parameter === 'slope' || parameter === 'shape' || parameter === 'smooth' || parameter === 'shift')) return swell[parameter];
      return undefined;
    };

    const evalValue = (expression: string, lineNumber: number): ScalarValue | undefined => {
      try {
        return evaluateExpression(expression, {
          resolveIdentifier: (name) => variables.get(name),
          resolveMember,
          callFunction: (name, args, position) => {
            const lower = name.toLowerCase();
            const site = `${lineNumber}:${expression}:${position}:${lower}`;

            const numeric = (value: ScalarValue, label: string): number => {
              if (typeof value !== 'number' || !Number.isFinite(value)) throw new ExpressionError(`${label} expects numeric values`);
              return value;
            };

            if (lower === 'rnd') {
              if (args.length !== 2) throw new ExpressionError('rnd expects 2 arguments');
              const min = numeric(args[0], 'rnd');
              const max = numeric(args[1], 'rnd');
              if (max < min) throw new ExpressionError('rnd expects min <= max');
              return min + random() * (max - min);
            }

            if (lower === 'choose') {
              if (args.length === 0) throw new ExpressionError('choose expects at least one value');
              return args[Math.floor(random() * args.length)];
            }

            if (lower === 'coin') {
              if (args.length > 1) throw new ExpressionError('coin expects zero or one probability value');
              const probability = args.length === 0 ? 50 : numeric(args[0], 'coin');
              if (probability < 0 || probability > 100) throw new ExpressionError('coin probability must be between 0 and 100');
              return random() * 100 < probability;
            }

            if (lower === 'wrap') {
              if (args.length !== 3) throw new ExpressionError('wrap expects 3 arguments');
              const value = numeric(args[0], 'wrap');
              const min = numeric(args[1], 'wrap');
              const max = numeric(args[2], 'wrap');
              if (max <= min) throw new ExpressionError('wrap expects min < max');
              const width = max - min;
              return ((value - min) % width + width) % width + min;
            }

            if (lower === 'quantize') {
              if (args.length !== 2) throw new ExpressionError('quantize expects 2 arguments');
              const value = numeric(args[0], 'quantize');
              const step = numeric(args[1], 'quantize');
              if (step <= 0) throw new ExpressionError('quantize step must be > 0');
              return Math.round(value / step) * step;
            }

            if (lower === 'walk') {
              if (args.length !== 3) throw new ExpressionError('walk expects 3 arguments: min, max, step');
              const min = numeric(args[0], 'walk');
              const max = numeric(args[1], 'walk');
              const step = Math.abs(numeric(args[2], 'walk'));
              if (max < min) throw new ExpressionError('walk expects min <= max');
              const previous = typeof generativeState.get(site) === 'number'
                ? generativeState.get(site) as number
                : (min + max) / 2;
              const direction = Math.floor(random() * 3) - 1;
              const value = Math.min(max, Math.max(min, previous + direction * step));
              generativeState.set(site, value);
              return value;
            }

            if (lower === 'slew') {
              if (args.length !== 2) throw new ExpressionError('slew expects 2 arguments: value, amount');
              const target = numeric(args[0], 'slew');
              const amount = numeric(args[1], 'slew');
              if (amount < 0 || amount > 100) throw new ExpressionError('slew amount must be between 0 and 100');
              const previous = typeof generativeState.get(site) === 'number'
                ? generativeState.get(site) as number
                : target;
              const value = previous + (target - previous) * (1 - amount / 100);
              generativeState.set(site, value);
              return value;
            }

            if (lower === 'chaos') {
              if (args.length < 3 || args.length > 4) throw new ExpressionError('chaos expects type, min, max [, amount]');
              if (typeof args[0] !== 'string') throw new ExpressionError('chaos type must be a string');
              const type = args[0].toLowerCase();
              const min = numeric(args[1], 'chaos');
              const max = numeric(args[2], 'chaos');
              const amount = args.length === 4 ? numeric(args[3], 'chaos') : undefined;
              if (max < min) throw new ExpressionError('chaos expects min <= max');

              let normalized: number;
              if (type === 'logistic') {
                const r = amount ?? 3.91;
                if (r <= 0 || r > 4) throw new ExpressionError('logistic chaos amount must be > 0 and <= 4');
                const previous = typeof generativeState.get(site) === 'number' ? generativeState.get(site) as number : 0.371;
                normalized = r * previous * (1 - previous);
                generativeState.set(site, normalized);
              } else if (type === 'cubic') {
                const r = amount ?? 2.59;
                const previous = typeof generativeState.get(site) === 'number' ? generativeState.get(site) as number : 0.173;
                const raw = r * previous * (1 - previous * previous);
                normalized = Math.min(1, Math.max(0, Math.abs(raw)));
                generativeState.set(site, normalized);
              } else if (type === 'henon') {
                const a = amount ?? 1.4;
                const state = generativeState.get(site);
                const previous = typeof state === 'object' ? state : { x: 0.1, y: 0.3 };
                const x = 1 - a * previous.x * previous.x + previous.y;
                const y = 0.3 * previous.x;
                generativeState.set(site, { x, y });
                normalized = Math.min(1, Math.max(0, (x + 1.5) / 3));
              } else {
                throw new ExpressionError(`unknown chaos type: ${args[0]}`);
              }

              return min + normalized * (max - min);
            }

            return undefined;
          },
        });
      } catch (error) {
        const message = error instanceof ExpressionError ? error.message : String(error);
        diagnostics.push({ line: lineNumber, message });
        return undefined;
      }
    };

    const evalNumber = (expression: string, lineNumber: number, label: string): number | undefined => {
      const value = evalValue(expression, lineNumber);
      if (value === undefined) return undefined;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        diagnostics.push({ line: lineNumber, message: `${label} expects a numeric expression` });
        return undefined;
      }
      return value;
    };

    // Pass 2: scalar assignments, parameters, views and routes are evaluated in
    // source order. All module declarations already exist, so references between
    // modules are still independent from declaration order.
    for (const { source: line, line: lineNumber } of lines) {
      if (parseLanguageSequenceDirective(line) || parseLanguageCycleDirective(line) || parseLanguageFromDirective(line)) continue;

      const oscillatorDeclaration = parseOscillatorDeclaration(line);
      if (oscillatorDeclaration) {
        const definition = oscillators.get(oscillatorDeclaration.name)!;
        for (const call of oscillatorDeclaration.calls) {
          const error = applyOscillatorCall(oscillatorDeclaration.name, definition, call, views, (expr) => evalValue(expr, lineNumber));
          if (error) diagnostics.push({ line: lineNumber, message: error });
        }
        continue;
      }
      const gainDeclaration = parseGainDeclaration(line);
      if (gainDeclaration) {
        const definition = gains.get(gainDeclaration.name)!;
        for (const call of gainDeclaration.calls) {
          const error = applyGainCall(gainDeclaration.name, definition, call, views, (expr) => evalValue(expr, lineNumber));
          if (error) diagnostics.push({ line: lineNumber, message: error });
        }
        continue;
      }
      const voiceDeclaration = parseVoiceDeclaration(line);
      if (voiceDeclaration) {
        const definition = voices.get(voiceDeclaration.name)!;
        for (const call of voiceDeclaration.calls) {
          const error = applyVoiceCall(voiceDeclaration.name, definition, call, moduleViews, (expr) => evalValue(expr, lineNumber));
          if (error) diagnostics.push({ line: lineNumber, message: error });
        }
        continue;
      }
      const swellDeclaration = parseSwellDeclaration(line);
      if (swellDeclaration) {
        const definition = swells.get(swellDeclaration.name)!;
        for (const call of swellDeclaration.calls) {
          const error = applySwellCall(swellDeclaration.name, definition, call, moduleViews, (expr) => evalValue(expr, lineNumber));
          if (error) diagnostics.push({ line: lineNumber, message: error });
        }
        continue;
      }
      const dicesDeclaration = parseDicesDeclaration(line);
      if (dicesDeclaration) {
        const definition = dices.get(dicesDeclaration.name)!;
        for (const call of dicesDeclaration.calls) {
          const error = applyDicesCall(dicesDeclaration.name, definition, call, moduleViews, (expr) => evalValue(expr, lineNumber));
          if (error) diagnostics.push({ line: lineNumber, message: error });
        }
        continue;
      }
      const mistDeclaration = parseMistDeclaration(line);
      if (mistDeclaration) {
        const definition = mists.get(mistDeclaration.name)!;
        for (const call of mistDeclaration.calls) {
          const error = applyMistCall(mistDeclaration.name, definition, call, moduleViews, (expr) => evalValue(expr, lineNumber));
          if (error) diagnostics.push({ line: lineNumber, message: error });
        }
        continue;
      }
      if (parseClockDeclaration(line)) continue;

      const setterAssignment = line.match(/^([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)\.(freq|note|level|model|harmo|timbre|morph|bpm)\(\s*(.+)\s*\)$/);
      if (setterAssignment) {
        const [, variableName, objectName, parameter, rawValue] = setterAssignment;
        const reservationError = identifierReservationError(variableName);
        if (reservationError) {
          diagnostics.push({ line: lineNumber, message: reservationError });
          continue;
        }
        if (objectExists(variableName, oscillators, gains, voices) || clockSources.has(variableName)) {
          diagnostics.push({ line: lineNumber, message: `cannot assign scalar value to object: ${variableName}` });
          continue;
        }

        let assignedValue: ScalarValue | undefined;

        if (objectName === 'Clock' && parameter === 'bpm') {
          const bpm = evalNumber(rawValue, lineNumber, 'Clock.bpm');
          if (bpm === undefined) continue;
          if (bpm < 0 || bpm > 300) {
            diagnostics.push({ line: lineNumber, message: 'Clock.bpm expects 0..300' });
            continue;
          }
          clockBpm = bpm;
          assignedValue = bpm;
          results.push({ message: `Clock ${formatNumber(bpm)} BPM` });
        } else if (parameter === 'freq') {
          const oscillator = oscillators.get(objectName);
          const voice = voices.get(objectName);
          if (!oscillator && !voice) {
            diagnostics.push({ line: lineNumber, message: `unknown frequency-capable object: ${objectName}` });
            continue;
          }
          const frequency = evalNumber(rawValue, lineNumber, 'freq');
          if (frequency === undefined) continue;
          const error = frequencyError(frequency);
          if (error) { diagnostics.push({ line: lineNumber, message: error }); continue; }
          if (oscillator) {
            oscillator.frequency = frequency;
            oscillator.parameters.delete('NOTE');
            oscillator.parameters.set('FREQ', `${formatNumber(frequency)} HZ`);
          } else if (voice) {
            voice.frequency = frequency;
            voice.parameters.set('FREQ', `${formatNumber(frequency)} HZ`);
          }
          assignedValue = frequency;
        } else if (parameter === 'note') {
          const oscillator = oscillators.get(objectName);
          if (!oscillator) {
            diagnostics.push({ line: lineNumber, message: `unknown osc object: ${objectName}` });
            continue;
          }
          const note = evalNumber(rawValue, lineNumber, 'note');
          if (note === undefined) continue;
          const error = noteError(note);
          if (error) { diagnostics.push({ line: lineNumber, message: error }); continue; }
          oscillator.frequency = midiToFrequency(note);
          oscillator.parameters.delete('FREQ');
          oscillator.parameters.set('NOTE', formatNumber(note));
          assignedValue = note;
        } else if (parameter === 'level') {
          const gain = gains.get(objectName);
          if (!gain) {
            diagnostics.push({ line: lineNumber, message: `unknown gain object: ${objectName}` });
            continue;
          }
          const level = evalNumber(rawValue, lineNumber, 'level');
          if (level === undefined) continue;
          const error = gainLevelError(level);
          if (error) { diagnostics.push({ line: lineNumber, message: error }); continue; }
          gain.level = level;
          gain.parameters.set('LEVEL', `${formatNumber(level)}%`);
          assignedValue = level;
        } else if (parameter === 'model') {
          const voice = voices.get(objectName);
          if (!voice) {
            diagnostics.push({ line: lineNumber, message: `unknown Voice object: ${objectName}` });
            continue;
          }
          const modelValue = evalValue(rawValue, lineNumber);
          if (modelValue === undefined) continue;
          const model = parseVoiceModelValue(modelValue);
          if (model === null) {
            diagnostics.push({ line: lineNumber, message: 'model expects 1..24 or a known model name' });
            continue;
          }
          voice.model = model;
          voice.parameters.set('MODEL', formatVoiceModel(model));
          assignedValue = model;
        } else if (parameter === 'harmo' || parameter === 'timbre' || parameter === 'morph') {
          const voice = voices.get(objectName);
          if (!voice) {
            diagnostics.push({ line: lineNumber, message: `unknown Voice object: ${objectName}` });
            continue;
          }
          const value = evalNumber(rawValue, lineNumber, parameter);
          if (value === undefined) continue;
          const error = percentError(value, parameter);
          if (error) { diagnostics.push({ line: lineNumber, message: error }); continue; }
          voice[parameter] = value;
          voice.parameters.set(parameter.toUpperCase(), `${formatNumber(value)}%`);
          assignedValue = value;
        } else {
          diagnostics.push({ line: lineNumber, message: `parameter ${parameter} is not available on ${objectName}` });
          continue;
        }

        if (assignedValue !== undefined) {
          variables.set(variableName, assignedValue);
          results.push({ message: `${variableName} = ${formatScalar(assignedValue)}` });
        }
        continue;
      }

      const scalarAssignment = line.match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/);
      if (scalarAssignment) {
        const [, name, expression] = scalarAssignment;
        const reservationError = identifierReservationError(name);
        if (reservationError) {
          diagnostics.push({ line: lineNumber, message: reservationError });
          continue;
        }
        if (objectExists(name, oscillators, gains, voices) || clockSources.has(name)) {
          diagnostics.push({ line: lineNumber, message: `cannot assign scalar value to object: ${name}` });
          continue;
        }
        const value = evalValue(expression, lineNumber);
        if (value !== undefined) {
          variables.set(name, value);
          results.push({ message: `${name} = ${formatScalar(value)}` });
        }
        continue;
      }

      let match = line.match(/^seed\(\s*(.+)\s*\)\s*$/);
      if (match) {
        const seedValue = evalNumber(match[1], lineNumber, 'seed');
        if (seedValue === undefined) continue;
        randomState = (Math.trunc(seedValue) >>> 0) || 0x6d2b79f5;
        generativeState.clear();
        results.push({ message: `seed ${Math.trunc(seedValue)}` });
        continue;
      }

      match = line.match(/^Clock\.bpm\(\s*(.+)\s*\)\s*$/);
      if (match) {
        const bpm = evalNumber(match[1], lineNumber, 'Clock.bpm');
        if (bpm === undefined) continue;
        if (!Number.isFinite(bpm) || bpm < 0 || bpm > 300) diagnostics.push({ line: lineNumber, message: 'Clock.bpm expects 0..300' });
        else { clockBpm = bpm; results.push({ message: `Clock ${formatNumber(bpm)} BPM` }); }
        continue;
      }

      if (/^Clock(?:\.out)?\.view\(\s*\)\s*$/.test(line)) { views.set('Clock.out', 'trigger'); results.push({ message: 'Clock.out view' }); continue; }

      match = line.match(/^([A-Za-z_]\w*)\.freq\(\s*(.+)\s*\)\s*$/);
      if (match) {
        const [, name, rawFrequency] = match;
        const oscillator = oscillators.get(name);
        const voice = voices.get(name);
        const swell = swells.get(name);
        if (!oscillator && !voice && !swell) {
          diagnostics.push({ line: lineNumber, message: `unknown frequency-capable object: ${name}` });
          continue;
        }

        const frequency = evalNumber(rawFrequency, lineNumber, 'freq');
        if (frequency === undefined) continue;

        if (swell) {
          if (!Number.isFinite(frequency) || frequency <= 0 || frequency > 10000) {
            diagnostics.push({ line: lineNumber, message: 'Swell.freq expects > 0 and <= 10000 Hz' });
            continue;
          }
          swell.frequency = frequency;
          swell.parameters.set('FREQ', `${formatNumber(frequency)} HZ`);
        } else {
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
        }
        results.push({ message: `${name}.freq ${formatNumber(frequency)} hz` });
        continue;
      }

      match = line.match(/^([A-Za-z_]\w*)\.note\(\s*(.+)\s*\)\s*$/);
      if (match) {
        const [, name, rawNote] = match;
        const oscillator = oscillators.get(name);
        if (!oscillator) {
          diagnostics.push({ line: lineNumber, message: `unknown osc object: ${name}` });
          continue;
        }

        const note = evalNumber(rawNote, lineNumber, 'note');
        if (note === undefined) continue;
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

      match = line.match(/^([A-Za-z_]\w*)\.level\(\s*(.+)\s*\)\s*$/);
      if (match) {
        const [, name, rawLevel] = match;
        const gain = gains.get(name);
        if (!gain) {
          diagnostics.push({ line: lineNumber, message: `unknown gain object: ${name}` });
          continue;
        }

        const level = evalNumber(rawLevel, lineNumber, 'level');
        if (level === undefined) continue;
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
        const modelValue = evalValue(rawModel, lineNumber);
        if (modelValue === undefined) continue;
        const model = parseVoiceModelValue(modelValue);
        if (model === null) {
          diagnostics.push({ line: lineNumber, message: 'model expects 1..24 or a known model name' });
          continue;
        }
        voice.model = model;
        voice.parameters.set('MODEL', formatVoiceModel(model));
        results.push({ message: `${name}.model ${formatVoiceModel(model)}` });
        continue;
      }

      match = line.match(/^([A-Za-z_]\w*)\.(harmo|timbre|morph)\(\s*(.+)\s*\)\s*$/);
      if (match) {
        const [, name, parameter, rawValue] = match;
        const voice = voices.get(name);
        if (!voice) {
          diagnostics.push({ line: lineNumber, message: `unknown Voice object: ${name}` });
          continue;
        }
        const value = evalNumber(rawValue, lineNumber, parameter);
        if (value === undefined) continue;
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

      match = line.match(/^([A-Za-z_]\w*)\.(slope|shape|smooth|shift)\(\s*(.+)\s*\)\s*$/);
      if (match) {
        const [, name, parameter, rawValue] = match;
        const swell = swells.get(name);
        if (!swell) {
          diagnostics.push({ line: lineNumber, message: `unknown Swell object: ${name}` });
          continue;
        }
        const value = evalNumber(rawValue, lineNumber, parameter);
        if (value === undefined) continue;
        const error = percentError(value, parameter);
        if (error) { diagnostics.push({ line: lineNumber, message: error }); continue; }
        swell[parameter as 'slope' | 'shape' | 'smooth' | 'shift'] = value;
        swell.parameters.set(parameter.toUpperCase(), `${formatNumber(value)}%`);
        results.push({ message: `${name}.${parameter} ${formatNumber(value)}%` });
        continue;
      }

      match = line.match(/^([A-Za-z_]\w*)\.(rate|jitter|gate_bias|gate_length|gate_jitter|spread|bias|steps|deja|length)\(\s*(.+)\s*\)\s*$/);
      if (match) {
        const [, name, parameter, rawValue] = match;
        const definition = dices.get(name);
        if (!definition) {
          diagnostics.push({ line: lineNumber, message: `unknown Dices object: ${name}` });
          continue;
        }
        const value = evalNumber(rawValue, lineNumber, parameter);
        if (value === undefined) continue;

        if (parameter === 'length') {
          if (!Number.isInteger(value) || value < 1 || value > 16) {
            diagnostics.push({ line: lineNumber, message: 'length expects an integer from 1 to 16' });
            continue;
          }
          definition.length = value;
          definition.parameters.set('LENGTH', formatNumber(value));
        } else {
          const error = percentError(value, parameter);
          if (error) { diagnostics.push({ line: lineNumber, message: error }); continue; }
          if (parameter === 'gate_bias') definition.gateBias = value;
          else if (parameter === 'gate_length') definition.gateLength = value;
          else if (parameter === 'gate_jitter') definition.gateJitter = value;
          else definition[parameter as 'rate' | 'jitter' | 'spread' | 'bias' | 'steps' | 'deja'] = value;
          definition.parameters.set(parameter.toUpperCase(), `${formatNumber(value)}%`);
        }
        results.push({ message: `${name}.${parameter} ${formatNumber(value)}` });
        continue;
      }

      match = line.match(/^([A-Za-z_]\w*)\.scale\(\s*["']([^"']+)["']\s*\)\s*$/);
      if (match && dices.has(match[1])) {
        const [, name, rawScale] = match;
        const scale = parseDicesScale(rawScale);
        if (scale === null) {
          diagnostics.push({ line: lineNumber, message: 'scale expects major, minor, pentatonic, chromatic, dorian, or fifths' });
          continue;
        }
        const definition = dices.get(name)!;
        definition.scale = scale;
        definition.parameters.set('SCALE', rawScale.toUpperCase());
        results.push({ message: `${name}.scale ${rawScale}` });
        continue;
      }

      match = line.match(/^([A-Za-z_]\w*)\.(freq|harmo|timbre|morph|model|level|slope|shape|smooth|shift)\.view\(\s*\)\s*$/);
      if (match) {
        const [, name, parameter] = match;
        const oscillator = oscillators.get(name);
        const voice = voices.get(name);
        const gain = gains.get(name);
        const swell = swells.get(name);
        let value: string | null = null;

        if (parameter === 'freq') {
          if (oscillator) value = `${formatNumber(oscillator.frequency)} HZ`;
          else if (voice) value = `${formatNumber(voice.frequency)} HZ`;
          else if (swell) value = `${formatNumber(swell.frequency)} HZ`;
        } else if (parameter === 'model' && voice) {
          value = formatVoiceModel(voice.model);
        } else if ((parameter === 'harmo' || parameter === 'timbre' || parameter === 'morph') && voice) {
          value = `${formatNumber(voice[parameter])}%`;
        } else if (parameter === 'level' && gain) {
          value = `${formatNumber(gain.level)}%`;
        } else if (swell && (parameter === 'slope' || parameter === 'shape' || parameter === 'smooth' || parameter === 'shift')) {
          value = `${formatNumber(swell[parameter])}%`;
        }

        if (value === null) {
          diagnostics.push({ line: lineNumber, message: `parameter ${parameter} is not available on ${name}` });
          continue;
        }

        const signal = `${name}.${parameter}`;
        views.set(signal, 'parameter');
        results.push({ message: `${signal} view` });
        continue;
      }

      if (/^Audio(?:\.out)?\.view\(\s*\)\s*$/.test(line)) {
        views.set('Audio.out_L', 'signal');
        views.set('Audio.out_R', 'signal');
        results.push({ message: 'Audio.out stereo view' });
        continue;
      }

      match = line.match(/^([A-Za-z_]\w*)\.view\(\s*\)\s*$/);
      if (match && clockSources.has(match[1])) { views.set(`${match[1]}.out`, 'trigger'); results.push({ message: `${match[1]}.out view` }); continue; }

      match = line.match(/^([A-Za-z_]\w*)\.out([1-4])\.view\(\s*\)\s*$/);
      if (match) {
        const [, name, port] = match;
        if (!swells.has(name)) {
          diagnostics.push({ line: lineNumber, message: `out${port} is only available on Swell objects: ${name}` });
          continue;
        }
        views.set(`${name}.out${port}`, 'signal');
        results.push({ message: `${name}.out${port} view` });
        continue;
      }

      match = line.match(/^([A-Za-z_]\w*)\.view\(\s*\)\s*$/);
      if (match && swells.has(match[1])) {
        moduleViews.add(match[1]);
        results.push({ message: `${match[1]} module view` });
        continue;
      }

      match = line.match(/^([A-Za-z_]\w*)\.(t[1-3]|x[1-3]|y)\.view\(\s*\)\s*$/);
      if (match) {
        const [, name, port] = match;
        if (!dices.has(name)) {
          diagnostics.push({ line: lineNumber, message: `${port} is only available on Dices objects: ${name}` });
          continue;
        }
        views.set(`${name}.${port}`, port.startsWith('t') ? 'gate' : 'signal');
        results.push({ message: `${name}.${port} view` });
        continue;
      }

      match = line.match(/^([A-Za-z_]\w*)\.view\(\s*\)\s*$/);
      if (match && dices.has(match[1])) {
        moduleViews.add(match[1]);
        results.push({ message: `${match[1]} module view` });
        continue;
      }

      match = line.match(/^([A-Za-z_]\w*)\.(out_L|out_R)\.view\(\s*\)\s*$/);
      if (match && mists.has(match[1])) {
        views.set(`${match[1]}.${match[2]}`, 'signal');
        results.push({ message: `${match[1]}.${match[2]} view` });
        continue;
      }

      match = line.match(/^([A-Za-z_]\w*)\.view\(\s*\)\s*$/);
      if (match && mists.has(match[1])) {
        moduleViews.add(match[1]);
        results.push({ message: `${match[1]} module view` });
        continue;
      }

      match = line.match(/^([A-Za-z_]\w*)\.view\(\s*\)\s*$/);
      if (match && voices.has(match[1])) {
        moduleViews.add(match[1]);
        results.push({ message: `${match[1]} module view` });
        continue;
      }

      match = line.match(/^([A-Za-z_]\w*)\.aux\.view\(\s*\)\s*$/);
      if (match) {
        const name = match[1];
        if (!voices.has(name)) {
          diagnostics.push({ line: lineNumber, message: `aux output is only available on Voice objects: ${name}` });
          continue;
        }
        views.set(`${name}.aux`, 'signal');
        results.push({ message: `${name}.aux view` });
        continue;
      }

      match = line.match(/^([A-Za-z_]\w*)(\.out)?\.view\(\s*\)\s*$/);
      if (match) {
        const name = match[1];
        const explicitOut = Boolean(match[2]);
        if (voices.has(name) && explicitOut) {
          views.set(`${name}.out`, 'signal');
          results.push({ message: `${name}.out view` });
        } else if (oscillators.has(name) || gains.has(name)) {
          views.set(`${name}.out`, 'signal');
          results.push({ message: `${name}.out view` });
        } else {
          // A bare name.view() can observe a scalar variable. Resolve it after
          // the complete source has been evaluated so the view can appear
          // before or after the variable assignment in the document.
          variableViewRequests.push({ name, line: lineNumber });
        }
        continue;
      }

      const parsedRoute = parseRouteLine(line);
      if (parsedRoute) {
        const { sourceName, sourcePort, amountExpression, targetName, targetPort } = parsedRoute;
        if (sourceName !== 'Clock' && !clockSources.has(sourceName) && !objectExists(sourceName, oscillators, gains, voices) && !swells.has(sourceName) && !dices.has(sourceName) && !mists.has(sourceName)) {
          diagnostics.push({ line: lineNumber, message: `unknown source object: ${sourceName}` });
          continue;
        }
        if (sourcePort === 'aux' && !voices.has(sourceName)) {
          diagnostics.push({ line: lineNumber, message: `aux output is only available on Voice objects: ${sourceName}` });
          continue;
        }
        if (/^out[1-4]$/.test(sourcePort) && !swells.has(sourceName)) {
          diagnostics.push({ line: lineNumber, message: `${sourcePort} is only available on Swell objects: ${sourceName}` });
          continue;
        }
        if ((sourcePort === 'out_L' || sourcePort === 'out_R') && !mists.has(sourceName)) {
          diagnostics.push({ line: lineNumber, message: `${sourcePort} is only available on stereo objects: ${sourceName}` });
          continue;
        }
        if (/^(t[1-3]|x[1-3]|y)$/.test(sourcePort) && !dices.has(sourceName)) {
          diagnostics.push({ line: lineNumber, message: `${sourcePort} is only available on Dices objects: ${sourceName}` });
          continue;
        }
        if (targetPort === 'trig') {
          if (!voices.has(targetName) && !swells.has(targetName) && !mists.has(targetName)) { diagnostics.push({ line: lineNumber, message: `trigger input is only available on Voice, Swell or Mist objects: ${targetName}` }); continue; }
        } else if (targetPort === 'clock') {
          if (!swells.has(targetName) && !dices.has(targetName)) { diagnostics.push({ line: lineNumber, message: `clock input is only available on Swell or Dices objects: ${targetName}` }); continue; }
        } else if (targetPort === 'v_oct') {
          if (!voices.has(targetName) && !swells.has(targetName)) { diagnostics.push({ line: lineNumber, message: `v_oct input is only available on Voice or Swell objects: ${targetName}` }); continue; }
        } else if (targetPort === 'harmo' || targetPort === 'timbre' || targetPort === 'morph') {
          if (!voices.has(targetName)) { diagnostics.push({ line: lineNumber, message: `${targetPort} input is only available on Voice objects: ${targetName}` }); continue; }
        } else if (targetPort === 'out_L' || targetPort === 'out_R') {
          if (targetName !== 'Audio') {
            diagnostics.push({ line: lineNumber, message: `${targetPort} is only available on Audio for now: ${targetName}` });
            continue;
          }
        } else if (targetPort === 'inL' || targetPort === 'inR') {
          if (!mists.has(targetName)) { diagnostics.push({ line: lineNumber, message: `${targetPort} is only available on Mist objects: ${targetName}` }); continue; }
        } else if (targetPort === 'in' && mists.has(targetName)) {
          // Mono convenience input feeding both Mist channels.
        } else if (!(targetName === 'Audio' && targetPort === 'out') && !gains.has(targetName)) {
          diagnostics.push({ line: lineNumber, message: `unknown or non-input object: ${targetName}` });
          continue;
        }

        const amount = amountExpression === null ? 100 : evalNumber(amountExpression, lineNumber, 'route amount');
        if (amount === undefined) continue;
        const error = routeAmountError(amount);
        if (error) {
          diagnostics.push({ line: lineNumber, message: error });
          continue;
        }

        const kind: SignalKind = sourceName === 'Clock' || clockSources.has(sourceName)
          ? 'trigger'
          : /^t[1-3]$/.test(sourcePort)
            ? 'gate'
            : 'signal';

        const addRoute = (source: string, target: string): void => {
          routes.set(`${source}->${target}`, { source, target, amount, kind });
        };

        const sourceIsStereoShorthand = mists.has(sourceName) && sourcePort === 'out';
        const targetIsAudioStereo = targetName === 'Audio' && targetPort === 'out';

        if (targetIsAudioStereo) {
          if (sourceIsStereoShorthand) {
            addRoute(`${sourceName}.out_L`, 'Audio.out_L');
            addRoute(`${sourceName}.out_R`, 'Audio.out_R');
            results.push({ message: `${sourceName}.out stereo -> Audio.out stereo @ ${formatNumber(amount)}%` });
          } else {
            const source = `${sourceName}.${sourcePort}`;
            // Mono -> stereo duplicates to both channels.
            addRoute(source, 'Audio.out_L');
            addRoute(source, 'Audio.out_R');
            results.push({ message: `${source} -> Audio.out stereo @ ${formatNumber(amount)}%` });
          }
        } else {
          if (sourceIsStereoShorthand) {
            diagnostics.push({
              line: lineNumber,
              message: `${sourceName}.out is stereo; select ${sourceName}.out_L or ${sourceName}.out_R for a mono destination`,
            });
            continue;
          }

          const source = `${sourceName}.${sourcePort}`;
          const target = `${targetName}.${targetPort}`;
          addRoute(source, target);
          results.push({ message: `${source} -> ${target} @ ${formatNumber(amount)}%` });
        }
        continue;
      }

      diagnostics.push({ line: lineNumber, message: `cannot evaluate: ${line}` });
    }

    for (const name of languageCycles.keys()) {
      if (!voices.has(name)) diagnostics.push({ line: 1, message: `cycle references unknown Voice object: ${name}` });
    }

    const variableViews: VariableViewState[] = [];
    const seenVariableViews = new Set<string>();
    for (const request of variableViewRequests) {
      const value = variables.get(request.name);
      if (value === undefined) {
        diagnostics.push({ line: request.line, message: `unknown object or variable: ${request.name}` });
        continue;
      }
      if (seenVariableViews.has(request.name)) continue;
      seenVariableViews.add(request.name);
      variableViews.push({ name: request.name, value: formatScalar(value) });
      results.push({ message: `${request.name} view` });
    }

    const whenHandlers: Array<{
      sourceName: string;
      rate: number;
      cycle: CycleCondition | null;
      probability: number;
      body: string;
      line: number;
    }> = [];

    for (const block of parsedWhen.blocks) {
      const parsed = parseWhenHeader(block.header);
      if (!parsed) {
        diagnostics.push({ line: block.line, message: 'invalid when() expression' });
        continue;
      }
      if (parsed.probability < 0 || parsed.probability > 100) {
        diagnostics.push({ line: block.line, message: 'prob() expects 0..100' });
        continue;
      }
      const sourceName = parsed.rate === 1 ? 'Clock' : `__when_${whenHandlers.length + 1}`;
      for (const statement of parseStatements(block.body)) {
        const statementLine = block.line + statement.line - 1;
        const bodyLine = statement.source;

        let match = bodyLine.match(/^([A-Za-z_]\w*)\.(freq|model|harmo|timbre|morph)\(\s*(.+)\s*\)$/);
        if (match) {
          const [, name, parameter, rawValue] = match;
          const voice = voices.get(name);
          if (!voice) {
            diagnostics.push({ line: statementLine, message: `unknown Voice object: ${name}` });
            continue;
          }

          // Validate the expression now without consuming stateful generators.
          // Numeric validity/range is checked again when the event actually runs.
          try {
            evaluateExpression(rawValue, {
              resolveIdentifier: (identifier) => variables.get(identifier),
              resolveMember,
              callFunction: (functionName, args) => {
                const lower = functionName.toLowerCase();
                if (lower === 'walk' || lower === 'slew') return 0;
                if (lower === 'chaos') return 0;
                if (lower === 'rnd') return 0;
                if (lower === 'choose') return args[0] ?? 0;
                if (lower === 'coin') return false;
                return undefined;
              },
            });
          } catch (error) {
            const message = error instanceof ExpressionError ? error.message : String(error);
            diagnostics.push({ line: statementLine, message });
          }

          if (parameter === 'freq') continue;
          if (parameter === 'model') continue;
          if (parameter === 'harmo' || parameter === 'timbre' || parameter === 'morph') continue;
        }

        match = bodyLine.match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/);
        if (match) {
          const [, name] = match;
          const reservationError = identifierReservationError(name);
          if (reservationError) diagnostics.push({ line: statementLine, message: reservationError });
          else if (objectExists(name, oscillators, gains, voices) || clockSources.has(name)) {
            diagnostics.push({ line: statementLine, message: `cannot assign scalar value to object: ${name}` });
          }
          continue;
        }

        diagnostics.push({ line: statementLine, message: `unsupported statement inside when: ${bodyLine}` });
      }

      whenHandlers.push({
        sourceName,
        rate: parsed.rate,
        cycle: parsed.cycle,
        probability: parsed.probability,
        body: block.body,
        line: block.line,
      });
    }

    if (diagnostics.length > 0) throw new SonusEvaluationError(diagnostics);

    // VARIABLES is the runtime symbol table for user-created names. Scalars
    // show their current value, while object references show their object type.
    // Built-in singletons such as Audio and Clock are intentionally omitted.
    variableViews.length = 0;
    for (const [name] of voices) variableViews.push({ name, value: 'Voice' });
    for (const [name] of swells) variableViews.push({ name, value: 'Swell' });
    for (const [name] of dices) variableViews.push({ name, value: 'Dices' });
    for (const [name] of mists) variableViews.push({ name, value: 'Mist' });
    for (const [name] of clockSources) variableViews.push({ name, value: 'Clock' });
    for (const [name] of oscillators) variableViews.push({ name, value: 'Osc' });
    for (const [name] of gains) variableViews.push({ name, value: 'Gain' });
    for (const [name, value] of variables) variableViews.push({ name, value: formatScalar(value) });

    // Parameter views are declarative like the rest of the source. Resolve their
    // values only after every parameter statement has been applied, so the view
    // reflects the final document state regardless of where .view() appears.
    for (const [signal, kind] of views.entries()) {
      if (kind !== 'parameter') continue;

      const [name, parameter] = signal.split('.');
      const oscillator = oscillators.get(name);
      const voice = voices.get(name);
      const gain = gains.get(name);
      const swell = swells.get(name);
      let value: string | null = null;

      if (parameter === 'freq') {
        if (oscillator) value = `${formatNumber(oscillator.frequency)} HZ`;
        else if (voice) value = `${formatNumber(voice.frequency)} HZ`;
        else if (swell) value = `${formatNumber(swell.frequency)} HZ`;
      } else if (parameter === 'model' && voice) {
        value = formatVoiceModel(voice.model);
      } else if ((parameter === 'harmo' || parameter === 'timbre' || parameter === 'morph') && voice) {
        value = `${formatNumber(voice[parameter])}%`;
      } else if (parameter === 'level' && gain) {
        value = `${formatNumber(gain.level)}%`;
      } else if (swell && (parameter === 'slope' || parameter === 'shape' || parameter === 'smooth' || parameter === 'shift')) {
        value = `${formatNumber(swell[parameter])}%`;
      }

      if (value !== null) {
        parameterViews.set(signal, {
          signal,
          label: signal.toUpperCase(),
          value,
          base: value,
        });
      }
    }

    const embeddedViews = new Map<string, SchemeEmbeddedView[]>();
    const addEmbeddedView = (signal: string, signalKind: SignalKind): void => {
      const owner = /^Audio\.out_[LR]$/.test(signal)
        ? 'Audio'
        : signal === 'Clock.out'
          ? 'Clock'
          : signal.replace(/\.(out|aux|out[1-4]|out_[LR])$/, '');
      const portMatch = signal.match(/\.(out|aux|out[1-4]|out_[LR])$/);
      const port = portMatch ? portMatch[1].toUpperCase() : 'OUT';
      const ownerViews = embeddedViews.get(owner) ?? [];
      if (!ownerViews.some((view) => view.signal === signal)) {
        ownerViews.push({ signal, signalKind, port });
        embeddedViews.set(owner, ownerViews);
      }
    };

    // Keep Scheme compact: only structural/global monitors are automatic.
    // Module outputs, secondary ports and derived clocks require .view().
    embeddedViews.set('Audio', [{
      signal: 'Audio.out_L',
      signals: ['Audio.out_L', 'Audio.out_R'],
      signalKind: 'signal',
      port: 'OUT L / R',
    }]);
    addEmbeddedView('Clock.out', 'trigger');

    for (const [signal, signalKind] of views) {
      if (signalKind === 'parameter') continue;
      addEmbeddedView(signal, signalKind as SignalKind);
    }

    for (const name of moduleViews) {
      const ownerViews = embeddedViews.get(name) ?? [];
      if (swells.has(name)) {
        ownerViews.push({
          signal: `${name}.out1`,
          signals: [1, 2, 3, 4].map((port) => `${name}.out${port}`),
          signalKind: 'signal',
          port: 'OUT 1-4',
        });
      } else if (voices.has(name)) {
        ownerViews.push({
          signal: `${name}.out`,
          signals: [`${name}.out`, `${name}.aux`],
          signalKind: 'signal',
          port: 'OUT / AUX',
        });
      } else if (dices.has(name)) {
        ownerViews.push({
          signal: `${name}.x1`,
          signals: [`${name}.t1`, `${name}.t2`, `${name}.t3`, `${name}.x1`, `${name}.x2`, `${name}.x3`],
          signalKind: 'signal',
          port: 'SEQUENCE',
        });
      } else if (mists.has(name)) {
        ownerViews.push({
          signal: `${name}.out_L`,
          signals: [`${name}.out_L`, `${name}.out_R`],
          signalKind: 'signal',
          port: 'OUT L / R',
        });
      } else {
        continue;
      }
      embeddedViews.set(name, ownerViews);
    }

    const schemeNodes: SchemeNode[] = [
      { id: 'Clock', label: 'CLOCK', kind: 'module' as const, parameters: clockBpm > 0 ? [{ name: 'BPM', value: formatNumber(clockBpm) }] : [], views: embeddedViews.get('Clock') },
      ...[...clockSources.entries()].map(([name, definition]) => ({ id: name, label: `${name.toUpperCase()} : CLOCK`, kind: 'module' as const, parameters: [...definition.parameters.entries()].map(([parameterName, value]) => ({ name: parameterName, value })), views: embeddedViews.get(name) })),
      ...[...oscillators.entries()].map(([name, definition]) => ({
        id: name,
        label: `${name.toUpperCase()} : OSC`,
        kind: 'module' as const,
        parameters: [...definition.parameters.entries()].map(([parameterName, value]) => ({
          name: parameterName,
          value,
        })),
        views: embeddedViews.get(name),
      })),
      ...[...voices.entries()].map(([name, definition]) => ({
        id: name,
        label: `${name.toUpperCase()} : VOICE`,
        kind: 'module' as const,
        parameters: [
          ...[...definition.parameters.entries()].map(([parameterName, value]) => ({
            name: parameterName,
            value,
          })),
          ...([...routes.values()].some((route) => route.target === `${name}.v_oct`)
            ? [{ name: 'V_OCT', value: '--', liveSignal: `${name}.v_oct` }]
            : []),
        ],
        views: embeddedViews.get(name),
      })),
      ...[...swells.entries()].map(([name, definition]) => ({
        id: name,
        label: `${name.toUpperCase()} : SWELL`,
        kind: 'module' as const,
        parameters: [...definition.parameters.entries()].map(([parameterName, value]) => ({ name: parameterName, value })),
        views: embeddedViews.get(name),
      })),
      ...[...dices.entries()].map(([name, definition]) => ({
        id: name,
        label: `${name.toUpperCase()} : DICES`,
        kind: 'module' as const,
        parameters: [...definition.parameters.entries()].map(([parameterName, value]) => ({
          name: parameterName,
          value,
        })),
        views: embeddedViews.get(name),
      })),
      ...[...mists.entries()].map(([name, definition]) => ({
        id: name,
        label: `${name.toUpperCase()} : MIST`,
        kind: 'module' as const,
        parameters: [...definition.parameters.entries()].map(([parameterName, value]) => ({
          name: parameterName,
          value,
        })),
        views: embeddedViews.get(name),
      })),
      ...[...gains.entries()].map(([name, definition]) => ({
        id: name,
        label: `${name.toUpperCase()} : GAIN`,
        kind: 'module' as const,
        parameters: [...definition.parameters.entries()].map(([parameterName, value]) => ({
          name: parameterName,
          value,
        })),
        views: embeddedViews.get(name),
      })),
      { id: 'Audio', label: 'AUDIO OUT', kind: 'module' as const, parameters: [], views: embeddedViews.get('Audio') },
    ];

    const schemeConnections: SchemeConnection[] = [
      ...[...routes.values()].map((route) => ({
        source: route.source.replace(/\.(out|aux|out[1-4]|out_[LR]|t[1-3]|x[1-3]|y)$/, ''),
        target: route.target.startsWith('Audio.')
          ? 'Audio'
          : route.target.replace(/\.(out_[LR]|inL|inR|in|trig|clock|v_oct|harmo|timbre|morph)$/, ''),
        sourcePort: (route.source.match(/\.(out|aux|out[1-4]|out_[LR]|t[1-3]|x[1-3]|y)$/)?.[1] ?? 'out').toUpperCase(),
        targetPort: route.target.endsWith('.trig')
          ? 'TRIG'
          : route.target.endsWith('.clock')
            ? 'CLOCK'
            : route.target.endsWith('.v_oct')
              ? 'V/OCT'
              : route.target.endsWith('.out')
                ? 'OUT'
                : route.target.match(/\.(harmo|timbre|morph)$/)?.[1].toUpperCase() ?? 'IN',
        type: route.kind,
        amount: route.amount,
      })),
    ];

    this.scheme = { nodes: schemeNodes, connections: schemeConnections };

    const program: AudioProgram = {
      clock: { bpm: clockBpm },
      clockSources: [
        { name: 'Clock', rate: 1 },
        ...[...clockSources.entries()].map(([name, definition]) => ({ name, rate: definition.rate })),
        ...whenHandlers.filter((handler) => handler.sourceName !== 'Clock').map((handler) => ({ name: handler.sourceName, rate: handler.rate })),
      ],
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
      swells: [...swells.entries()].map(([name, definition]) => ({
        name,
        frequency: definition.frequency,
        slope: definition.slope,
        shape: definition.shape,
        smooth: definition.smooth,
        shift: definition.shift,
        mode: definition.mode,
        outputMode: definition.outputMode,
        range: definition.range,
      })),
      dices: [...dices.entries()].map(([name, definition]) => ({
        name,
        rate: definition.rate,
        jitter: definition.jitter,
        gateBias: definition.gateBias,
        gateLength: definition.gateLength,
        gateJitter: definition.gateJitter,
        spread: definition.spread,
        bias: definition.bias,
        steps: definition.steps,
        deja: definition.deja,
        length: definition.length,
        scale: definition.scale,
      })),
      mists: [...mists.entries()].map(([name, definition]) => ({
        name,
        position: definition.position,
        size: definition.size,
        pitch: definition.pitch,
        density: definition.density,
        texture: definition.texture,
        mix: definition.mix,
        spread: definition.spread,
        feedback: definition.feedback,
        reverb: definition.reverb,
        freeze: definition.freeze,
        reverse: definition.reverse,
        mode: definition.mode,
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
      views: [...views.entries()]
        .filter(([, kind]) => kind !== 'parameter')
        .map(([signal, kind]) => ({ signal, kind: kind as SignalKind })),
      monitorViews: (() => {
        const monitors = new Map<string, SignalKind>();
        monitors.set('Audio.out_L', 'signal');
        monitors.set('Audio.out_R', 'signal');
        monitors.set('Clock.out', 'trigger');
        for (const [signal, kind] of views) {
          if (kind !== 'parameter') monitors.set(signal, kind as SignalKind);
        }
        for (const name of moduleViews) {
          if (swells.has(name)) {
            for (let port = 1; port <= 4; port += 1) monitors.set(`${name}.out${port}`, 'signal');
          } else if (voices.has(name)) {
            monitors.set(`${name}.out`, 'signal');
            monitors.set(`${name}.aux`, 'signal');
          } else if (dices.has(name)) {
            for (let port = 1; port <= 3; port += 1) {
              monitors.set(`${name}.t${port}`, 'gate');
              monitors.set(`${name}.x${port}`, 'signal');
            }
            monitors.set(`${name}.y`, 'signal');
          } else if (mists.has(name)) {
            monitors.set(`${name}.out_L`, 'signal');
            monitors.set(`${name}.out_R`, 'signal');
          }
        }
        return [...monitors].map(([signal, kind]) => ({ signal, kind }));
      })(),
    };

    this.parameterViews = [...parameterViews.values()];
    this.variableViews = variableViews;
    this.explicitSignalViews = [...views.entries()]
      .filter(([, kind]) => kind !== 'parameter')
      .map(([signal, kind]) => ({ signal, kind: kind as SignalKind }));
    this.moduleViews = new Set(moduleViews);
    for (const unsubscribe of this.whenUnsubscribers) unsubscribe();
    this.whenUnsubscribers = [];
    for (const unsubscribe of this.cycleUnsubscribers) unsubscribe();
    this.cycleUnsubscribers = [];

    this.audio.applyProgram(program);

    for (const [name, cycle] of languageCycles) {
      const voice = voices.get(name);
      if (!voice) continue;
      const sequence = languageSequences.get(name);
      let cursor = 0;
      let walkCursor = 0;
      let shuffleOrder: number[] = [];
      let shuffleCursor = 0;
      let driftRatio = 1;

      const reshuffle = (): void => {
        const count = sequence?.values.length ?? 0;
        shuffleOrder = Array.from({ length: count }, (_, index) => index);
        for (let index = shuffleOrder.length - 1; index > 0; index -= 1) {
          const swap = Math.floor(random() * (index + 1));
          [shuffleOrder[index], shuffleOrder[swap]] = [shuffleOrder[swap], shuffleOrder[index]];
        }
        shuffleCursor = 0;
      };

      const nextFrequency = (): number => {
        if (!sequence || sequence.values.length === 0) return voice.frequency;
        const values = sequence.values;
        if (values.length === 1) return values[0];

        if (sequence.mode === 'random') return values[Math.floor(random() * values.length)];
        if (sequence.mode === 'walk') {
          const direction = random() < 0.5 ? -1 : 1;
          walkCursor += direction;
          if (walkCursor < 0) walkCursor = 1;
          if (walkCursor >= values.length) walkCursor = Math.max(0, values.length - 2);
          return values[walkCursor];
        }
        if (sequence.mode === 'shuffle') {
          if (shuffleOrder.length !== values.length || shuffleCursor >= shuffleOrder.length) reshuffle();
          return values[shuffleOrder[shuffleCursor++]];
        }
        if (sequence.mode === 'reverse') {
          cursor = (cursor - 1 + values.length) % values.length;
          return values[cursor];
        }

        cursor = (cursor + 1) % values.length;
        return values[cursor];
      };

      const fire = (): void => {
        if (cycle.chance < 100 && random() * 100 >= cycle.chance) return;
        const frequency = nextFrequency();
        voice.frequency = frequency;
        this.audio.setVoiceParameter(name, 'freq', frequency);
      };

      if (cycle.unit === 'beat') {
        let beats = 0;
        let pendingTimeout: ReturnType<typeof setTimeout> | null = null;
        const unsubscribeClock = this.audio.subscribeClockTrigger('Clock', () => {
          beats += 1;
          if (beats < cycle.amount) return;
          beats = 0;
          if (!cycle.loose) {
            fire();
            return;
          }
          const bpm = this.audio.getClockStatus().bpm;
          const beatMs = bpm > 0 ? 60000 / bpm : 0;
          pendingTimeout = setTimeout(fire, beatMs * 0.08 * random());
        });
        this.cycleUnsubscribers.push(() => {
          unsubscribeClock();
          if (pendingTimeout !== null) clearTimeout(pendingTimeout);
        });
        continue;
      }

      let active = true;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      const baseMs = cycle.unit === 'sec' ? cycle.amount * 1000 : cycle.amount;
      const schedule = (): void => {
        if (!active) return;
        if (cycle.drift) {
          driftRatio += (random() - 0.5) * 0.06;
          driftRatio = Math.min(1.2, Math.max(0.8, driftRatio));
        } else {
          driftRatio = 1;
        }
        const looseRatio = cycle.loose ? 0.94 + random() * 0.12 : 1;
        timeout = setTimeout(() => {
          fire();
          schedule();
        }, Math.max(1, baseMs * driftRatio * looseRatio));
      };
      schedule();
      this.cycleUnsubscribers.push(() => {
        active = false;
        if (timeout !== null) clearTimeout(timeout);
      });
    }

    for (const handler of whenHandlers) {
      let eventIndex = 0;
      const unsubscribe = this.audio.subscribeClockTrigger(handler.sourceName, () => {
        eventIndex += 1;
        if (!matchesCycle(handler.cycle, eventIndex)) return;
        if (handler.probability < 100 && random() * 100 >= handler.probability) return;

        for (const statement of parseStatements(handler.body)) {
          const lineNumber = handler.line + statement.line - 1;
          const line = statement.source;

          let match = line.match(/^([A-Za-z_]\w*)\.(freq|model|harmo|timbre|morph)\(\s*(.+)\s*\)$/);
          if (match) {
            const [, name, parameter, rawValue] = match;
            const voice = voices.get(name);
            if (!voice) return;
            const value = evalNumber(rawValue, lineNumber, parameter);
            if (value === undefined) continue;
            if (parameter === 'freq') {
              if (frequencyError(value)) continue;
              voice.frequency = value;
            } else if (parameter === 'model') {
              const model = parseVoiceModelValue(value);
              if (model === null) continue;
              voice.model = model;
              this.audio.setVoiceParameter(name, 'model', model);
              continue;
            } else {
              if (percentError(value, parameter)) continue;
              const modulationParameter = parameter as 'harmo' | 'timbre' | 'morph';
              voice[modulationParameter] = value;
            }
            this.audio.setVoiceParameter(name, parameter as 'freq' | 'harmo' | 'timbre' | 'morph', value);
            continue;
          }

          match = line.match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/);
          if (match) {
            const [, name, expression] = match;
            if (identifierReservationError(name) || objectExists(name, oscillators, gains, voices) || clockSources.has(name)) continue;
            const value = evalValue(expression, lineNumber);
            if (value !== undefined) {
              variables.set(name, value);
              const existing = this.variableViews.find((view) => view.name === name);
              if (existing) existing.value = formatScalar(value);
              else this.variableViews.push({ name, value: formatScalar(value) });
            }
          }
        }
      });
      this.whenUnsubscribers.push(unsubscribe);
    }

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


interface WhenBlock {
  header: string;
  body: string;
  line: number;
}

interface CycleCondition {
  position?: number;
  length?: number;
  first?: boolean;
  notFirst?: boolean;
}

function extractWhenBlocks(source: string): { source: string; blocks: WhenBlock[]; diagnostics: SonusDiagnostic[] } {
  const blocks: WhenBlock[] = [];
  const diagnostics: SonusDiagnostic[] = [];
  const chars = [...source];
  let i = 0;

  while (i < source.length) {
    const match = /\bwhen\s*\(/g;
    match.lastIndex = i;
    const found = match.exec(source);
    if (!found) break;

    const start = found.index;
    let p = match.lastIndex;
    let depth = 1;
    let quote: string | null = null;
    while (p < source.length && depth > 0) {
      const ch = source[p++];
      if (quote) {
        if (ch === '\\') p += 1;
        else if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
    }
    if (depth !== 0) {
      diagnostics.push({ line: lineAt(source, start), message: 'unterminated when()' });
      break;
    }

    const header = source.slice(match.lastIndex, p - 1).trim();
    while (p < source.length && /\s/.test(source[p])) p += 1;
    if (source[p] !== '{') {
      diagnostics.push({ line: lineAt(source, start), message: 'when() expects a block' });
      i = p;
      continue;
    }

    const bodyStart = ++p;
    let braceDepth = 1;
    quote = null;
    while (p < source.length && braceDepth > 0) {
      const ch = source[p++];
      if (quote) {
        if (ch === '\\') p += 1;
        else if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '{') braceDepth += 1;
      else if (ch === '}') braceDepth -= 1;
    }
    if (braceDepth !== 0) {
      diagnostics.push({ line: lineAt(source, start), message: 'unterminated when block' });
      break;
    }

    blocks.push({ header, body: source.slice(bodyStart, p - 1), line: lineAt(source, start) });
    for (let n = start; n < p; n += 1) if (chars[n] !== '\n') chars[n] = ' ';
    i = p;
  }

  return { source: chars.join(''), blocks, diagnostics };
}

function lineAt(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

function splitTopLevelArguments(value: string): string[] {
  const result: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === ',' && depth === 0) {
      result.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  result.push(value.slice(start).trim());
  return result.filter(Boolean);
}

function parseWhenHeader(header: string): { rate: number; cycle: CycleCondition | null; probability: number } | null {
  const args = splitTopLevelArguments(header);
  if (args.length === 0) return null;

  const source = args[0].match(/^Clock\.out(?:\(\s*["']([^"']+)["']\s*\))?$/);
  if (!source) return null;
  const rate = source[1] ? parseClockRate(source[1])?.rate : 1;
  if (rate === undefined) return null;

  let cycle: CycleCondition | null = null;
  let probability = 100;

  for (const modifier of args.slice(1)) {
    const cycleMatch = modifier.match(/^cycle\(\s*["']([^"']+)["']\s*\)$/);
    if (cycleMatch) {
      if (cycle !== null) return null;
      cycle = parseCycleCondition(cycleMatch[1]);
      if (!cycle) return null;
      continue;
    }
    const probMatch = modifier.match(/^prob\(\s*(\d+(?:\.\d+)?)\s*\)$/);
    if (probMatch) {
      probability = Number(probMatch[1]);
      continue;
    }
    return null;
  }

  return { rate, cycle, probability };
}

function parseCycleCondition(value: string): CycleCondition | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'first') return { first: true };
  if (normalized === '!first') return { notFirst: true };
  const match = normalized.match(/^(\d+):(\d+)$/);
  if (!match) return null;
  const position = Number(match[1]);
  const length = Number(match[2]);
  if (position < 1 || length < 1 || position > length) return null;
  return { position, length };
}

function matchesCycle(condition: CycleCondition | null, eventIndex: number): boolean {
  if (!condition) return true;
  if (condition.first) return eventIndex === 1;
  if (condition.notFirst) return eventIndex > 1;
  return ((eventIndex - 1) % condition.length!) + 1 === condition.position;
}

function parseLanguageSequenceDirective(line: string): ({ name: string; values: number[]; mode: LanguageSequenceDefinition['mode'] }) | null {
  const match = line.match(/^__sequence\("([A-Za-z_]\w*)","([^"]*)","(order|random|walk|shuffle|reverse)"\)$/);
  if (!match) return null;
  return { name: match[1], values: match[2].split('|').filter(Boolean).map(Number), mode: match[3] as LanguageSequenceDefinition['mode'] };
}

function parseLanguageCycleDirective(line: string): ({ name: string; amount: number; unit: LanguageCycleDefinition['unit']; chance: number; drift: boolean; loose: boolean }) | null {
  const match = line.match(/^__cycle\("([A-Za-z_]\w*)",(\d+(?:\.\d+)?),"(ms|sec|beat)",(\d+(?:\.\d+)?),(true|false),(true|false)\)$/);
  if (!match) return null;
  return {
    name: match[1],
    amount: Number(match[2]),
    unit: match[3] as LanguageCycleDefinition['unit'],
    chance: Number(match[4]),
    drift: match[5] === 'true',
    loose: match[6] === 'true',
  };
}

function parseLanguageFromDirective(line: string): ({ target: string; property: string; source: string }) | null {
  const match = line.match(/^__from\("([A-Za-z_]\w*)","(note|freq|cycle)","([A-Za-z_]\w*)"\)$/);
  return match ? { target: match[1], property: match[2], source: match[3] } : null;
}

function parseStatements(source: string): Array<{ source: string; line: number }> {
  const statements: Array<{ source: string; line: number }> = [];
  let buffer = '';
  let startLine = 1;
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let inComment = false;
  let physicalLine = 1;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (inComment) {
      if (char === '\n') {
        inComment = false;
        if (buffer.length > 0 && !buffer.endsWith(' ')) buffer += ' ';
        physicalLine += 1;
      }
      continue;
    }

    if (quote) {
      buffer += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      if (char === '\n') physicalLine += 1;
      continue;
    }

    if ((char === '"' || char === "'")) {
      quote = char;
      buffer += char;
      continue;
    }

    if (char === '/' && next === '/') {
      inComment = true;
      i += 1;
      continue;
    }

    if (char === ';') {
      const statement = buffer.trim();
      if (statement.length > 0) statements.push({ source: statement, line: startLine });
      buffer = '';
      startLine = physicalLine;
      continue;
    }

    if (char === '\n') {
      if (buffer.trim().length === 0) startLine = physicalLine + 1;
      else if (!buffer.endsWith(' ')) buffer += ' ';
      physicalLine += 1;
      continue;
    }

    if (buffer.length === 0 && !/\s/.test(char)) startLine = physicalLine;
    buffer += char;
  }

  // An unterminated tail is deliberately ignored: while live-coding it is an
  // incomplete statement, not a syntax error. The last valid program remains active.
  return statements;
}

function parseClockDeclaration(line: string): (ObjectDeclaration & { rate: number; label: string }) | null {
  const match = line.match(/^([A-Za-z_]\w*)\s*=\s*Clock\.rate\(\s*["']([^"']+)["']\s*\)(.*)$/);
  if (!match) return null;
  const parsed = parseClockRate(match[2]);
  if (!parsed) return null;
  const tail = match[3].trim();
  const calls: ChainedCall[] = [];
  if (tail) {
    const callPattern = /\.([A-Za-z_]\w*)\(\s*([^()]*)\s*\)/g;
    let consumed = ''; let m: RegExpExecArray | null;
    while ((m = callPattern.exec(tail)) !== null) { if (m.index !== consumed.length) return null; consumed += m[0]; calls.push({ name: m[1], argument: m[2].trim() }); }
    if (consumed !== tail) return null;
  }
  return { name: match[1], calls, rate: parsed.rate, label: parsed.label };
}

function parseClockRate(value: string): { rate: number; label: string } | null {
  const match = value.trim().match(/^([/*])(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const n = Number(match[2]); if (!Number.isFinite(n) || n <= 0) return null;
  return { rate: match[1] === '/' ? 1 / n : n, label: `${match[1]}${formatNumber(n)}` };
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

function parseSwellDeclaration(line: string): ObjectDeclaration | null {
  return parseDeclaration(line, 'Swell');
}

function parseDicesDeclaration(line: string): ObjectDeclaration | null {
  return parseDeclaration(line, 'Dices');
}

function parseMistDeclaration(line: string): ObjectDeclaration | null {
  return parseDeclaration(line, 'Mist');
}

function parseDeclaration(line: string, constructorName: string): ObjectDeclaration | null {
  const match = line.match(new RegExp(`^([A-Za-z_]\\w*)\\s*=\\s*${constructorName}\\(\\s*\\)(.*)$`));
  if (!match) return null;
  const calls = parseChainedCalls(match[2].trim());
  return calls === null ? null : { name: match[1], calls };
}

function parseChainedCalls(tail: string): ChainedCall[] | null {
  if (!tail) return [];
  const calls: ChainedCall[] = [];
  let index = 0;
  while (index < tail.length) {
    if (tail[index] !== '.') return null;
    index += 1;
    const nameStart = index;
    if (!/[A-Za-z_]/.test(tail[index] ?? '')) return null;
    index += 1;
    while (/[A-Za-z0-9_]/.test(tail[index] ?? '')) index += 1;
    const name = tail.slice(nameStart, index);
    while (/\s/.test(tail[index] ?? '')) index += 1;
    if (tail[index] !== '(') return null;
    const argumentStart = ++index;
    let depth = 1;
    let quote: string | null = null;
    while (index < tail.length && depth > 0) {
      const char = tail[index];
      if (quote !== null) {
        if (char === '\\') index += 2;
        else if (char === quote) { quote = null; index += 1; }
        else index += 1;
        continue;
      }
      if (char === '"' || char === "'") { quote = char; index += 1; continue; }
      if (char === '(') depth += 1;
      else if (char === ')') depth -= 1;
      index += 1;
    }
    if (depth !== 0) return null;
    const argument = tail.slice(argumentStart, index - 1).trim();
    calls.push({ name, argument });
    while (/\s/.test(tail[index] ?? '')) index += 1;
  }
  return calls;
}

interface ParsedRoute {
  sourceName: string;
  sourcePort: 'out' | 'out_L' | 'out_R' | 'aux' | 'out1' | 'out2' | 'out3' | 'out4' | 't1' | 't2' | 't3' | 'x1' | 'x2' | 'x3' | 'y';
  amountExpression: string | null;
  targetName: string;
  targetPort: 'out' | 'out_L' | 'out_R' | 'in' | 'inL' | 'inR' | 'trig' | 'clock' | 'v_oct' | 'harmo' | 'timbre' | 'morph';
}

function parseRouteLine(line: string): ParsedRoute | null {
  const arrow = line.indexOf('->');
  if (arrow < 0 || line.indexOf('->', arrow + 2) >= 0) return null;

  const left = line.slice(0, arrow).trim();
  const right = line.slice(arrow + 2).trim();

  const target = right.match(
    /^([A-Za-z_]\w*)\.(out|out_L|out_R|inL|inR|in|trig|clock|v_oct|harmo|timbre|morph)$/,
  );
  if (!target) return null;

  const source = left.match(
    /^([A-Za-z_]\w*)\.(out_L|out_R|out1|out2|out3|out4|t1|t2|t3|x1|x2|x3|y|out|aux)(.*)$/,
  );
  if (!source) return null;

  const suffix = source[3].trim();
  let amountExpression: string | null = null;

  if (suffix) {
    if (!suffix.startsWith('(') || !suffix.endsWith(')')) return null;
    amountExpression = suffix.slice(1, -1).trim();
    if (!amountExpression) return null;
  }

  return {
    sourceName: source[1],
    sourcePort: source[2] as ParsedRoute['sourcePort'],
    amountExpression,
    targetName: target[1],
    targetPort: target[2] as ParsedRoute['targetPort'],
  };
}

function identifierReservationError(name: string): string | null {
  if (name.startsWith('__')) {
    return `identifiers beginning with '__' are reserved: ${name}`;
  }
  if (RESERVED_IDENTIFIERS.has(name.toLowerCase())) {
    return `reserved identifier: ${name}`;
  }
  return null;
}

function reservedOrDuplicate(
  name: string,
  oscillators: Map<string, OscillatorDefinition>,
  gains: Map<string, GainDefinition>,
  voices: Map<string, VoiceDefinition>,
  diagnostics: SonusDiagnostic[],
  lineNumber: number,
): boolean {
  const reservationError = identifierReservationError(name);
  if (reservationError) {
    diagnostics.push({ line: lineNumber, message: reservationError });
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

function applyMistCall(
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
      };

      const mode = modes[normalized];
      if (!mode) {
        return 'mode expects granular, stretch, looping_delay, spectral, oliverb, resonestor, beat_repeat, or spectral_clouds';
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

function parseDicesScale(value: string): number | null {
  const scales: Record<string, number> = {
    major: 0,
    minor: 1,
    pentatonic: 2,
    chromatic: 3,
    dorian: 4,
    fifths: 5,
  };
  return scales[value.trim().toLowerCase()] ?? null;
}

function applyDicesCall(
  objectName: string,
  definition: DicesDefinition,
  call: ChainedCall,
  moduleViews: Set<string>,
  evaluate: (expression: string) => ScalarValue | undefined,
): string | null {
  const percent = (parameter: 'rate' | 'jitter' | 'spread' | 'bias' | 'steps' | 'deja' | 'gateBias' | 'gateLength' | 'gateJitter'): string | null => {
    const value = evaluate(call.argument);
    if (value === undefined) return null;
    if (typeof value !== 'number') return `${call.name} expects one numeric expression`;
    const error = percentError(value, call.name);
    if (error) return error;
    definition[parameter] = value;
    definition.parameters.set(call.name.toUpperCase(), `${formatNumber(value)}%`);
    return null;
  };

  switch (call.name) {
    case 'rate': return percent('rate');
    case 'jitter': return percent('jitter');
    case 'gate_bias': return percent('gateBias');
    case 'gate_length': return percent('gateLength');
    case 'gate_jitter': return percent('gateJitter');
    case 'spread': return percent('spread');
    case 'bias': return percent('bias');
    case 'steps': return percent('steps');
    case 'deja': return percent('deja');
    case 'length': {
      const value = evaluate(call.argument);
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 16) {
        return 'length expects an integer from 1 to 16';
      }
      definition.length = value;
      definition.parameters.set('LENGTH', formatNumber(value));
      return null;
    }
    case 'scale': {
      const value = evaluate(call.argument);
      if (typeof value !== 'string') return 'scale expects a scale name';
      const scale = parseDicesScale(value);
      if (scale === null) return 'scale expects major, minor, pentatonic, chromatic, dorian, or fifths';
      definition.scale = scale;
      definition.parameters.set('SCALE', value.toUpperCase());
      return null;
    }
    case 'view':
      if (call.argument.length > 0) return 'view does not accept parameters yet';
      moduleViews.add(objectName);
      return null;
    default:
      return `unknown Dices method: ${call.name}`;
  }
}

function applySwellCall(
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

function applyOscillatorCall(
  objectName: string,
  oscillator: OscillatorDefinition,
  call: ChainedCall,
  views: Map<string, ViewKind>,
  evaluate: (expression: string) => ScalarValue | undefined,
): string | null {
  switch (call.name) {
    case 'freq': {
      const value = evaluate(call.argument);
      if (value === undefined) return null;
      if (typeof value !== 'number') return 'freq expects one numeric expression';
      const error = frequencyError(value);
      if (error) return error;
      oscillator.frequency = value;
      oscillator.parameters.delete('NOTE');
      oscillator.parameters.set('FREQ', `${formatNumber(value)} HZ`);
      return null;
    }
    case 'note': {
      const value = evaluate(call.argument);
      if (value === undefined) return null;
      if (typeof value !== 'number') return 'note expects one numeric expression';
      const error = noteError(value);
      if (error) return error;
      oscillator.frequency = midiToFrequency(value);
      oscillator.parameters.delete('FREQ');
      oscillator.parameters.set('NOTE', formatNumber(value));
      return null;
    }
    case 'view':
      if (call.argument.length > 0) return 'view does not accept parameters yet';
      views.set(`${objectName}.out`, 'signal');
      return null;
    default:
      return `unknown osc method: ${call.name}`;
  }
}

function applyGainCall(
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

const VOICE_MODEL_NAMES = [
  'analog', 'waves', 'fm', 'grain', 'additive', 'wavetable', 'chord', 'speech',
  'swarm', 'noise', 'particle', 'string', 'modal', 'kick', 'snare', 'hat',
  'analog-vcf', 'phase', 'fm6-a', 'fm6-b', 'fm6-c', 'terrain', 'strings', 'chiptune',
] as const;

function applyVoiceCall(
  objectName: string,
  voice: VoiceDefinition,
  call: ChainedCall,
  moduleViews: Set<string>,
  evaluate: (expression: string) => ScalarValue | undefined,
): string | null {
  switch (call.name) {
    case 'model': {
      const value = evaluate(call.argument);
      if (value === undefined) return null;
      const model = parseVoiceModelValue(value);
      if (model === null) return 'model expects 1..24 or a known model name';
      voice.model = model;
      voice.parameters.set('MODEL', formatVoiceModel(model));
      return null;
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
    case 'morph': {
      const value = evaluate(call.argument);
      if (value === undefined) return null;
      if (typeof value !== 'number') return `${call.name} expects one numeric expression`;
      const error = percentError(value, call.name);
      if (error) return error;
      voice[call.name] = value;
      voice.parameters.set(call.name.toUpperCase(), `${formatNumber(value)}%`);
      return null;
    }
    case 'view':
      if (call.argument.length > 0) return 'view does not accept parameters yet';
      moduleViews.add(objectName);
      return null;
    default:
      return `unknown Voice method: ${call.name}`;
  }
}

function parseVoiceModelValue(value: ScalarValue): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 24) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
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
  return !Number.isFinite(value) || value < -100 || value > 100
    ? 'gain level must be between 0 and 100'
    : null;
}

function routeAmountError(value: number): string | null {
  return !Number.isFinite(value) || value < -100 || value > 100
    ? 'route amount must be between -100 and 100'
    : null;
}

function formatScalar(value: ScalarValue): string {
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'string') return `\"${value}\"`;
  return value ? 'true' : 'false';
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
