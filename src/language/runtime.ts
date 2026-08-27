import { AudioEngine, type AudioProgram, type SignalKind } from '../audio/engine';
import { evaluateExpression, ExpressionError, type ScalarValue } from './expression';

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

export class SonusRuntime {
  private parameterViews: ParameterViewState[] = [];
  private variableViews: VariableViewState[] = [];
  private explicitSignalViews: Array<{ signal: string; kind: SignalKind }> = [];

  private scheme: SchemeModel = {
    nodes: [{ id: 'Main', label: 'MAIN', kind: 'module', parameters: [] }],
    connections: [],
  };

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
    const routes = new Map<string, RouteDefinition>();
    const clockSources = new Map<string, ClockDefinition>();
    let clockBpm = 0;
    const views = new Map<string, ViewKind>();
    const parameterViews = new Map<string, ParameterViewState>();
    const variableViewRequests: Array<{ name: string; line: number }> = [];
    const variables = new Map<string, ScalarValue>();
    const results: EvaluationResult[] = [];
    const diagnostics: SonusDiagnostic[] = [];

    const lines = parseStatements(source);

    // Pass 1: declarations. Objects are collected before the remaining statements
    // so the source remains declarative rather than execution-order dependent.
    for (const { source: line, line: lineNumber } of lines) {
      const clockDeclaration = parseClockDeclaration(line);
      if (clockDeclaration) {
        const { name, rate, label, calls } = clockDeclaration;
        if (name === 'Main' || name === 'Clock' || objectExists(name, oscillators, gains, voices) || clockSources.has(name)) {
          diagnostics.push({ line: lineNumber, message: `reserved or duplicate object: ${name}` });
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
        if (reservedOrDuplicate(name, oscillators, gains, voices, diagnostics, lineNumber)) continue;

        const definition: OscillatorDefinition = { frequency: 440, parameters: new Map() };
        oscillators.set(name, definition);
        void calls;
        results.push({ message: `${name} = osc` });
        continue;
      }

      const gainDeclaration = parseGainDeclaration(line);
      if (gainDeclaration) {
        const { name, calls } = gainDeclaration;
        if (reservedOrDuplicate(name, oscillators, gains, voices, diagnostics, lineNumber)) continue;

        const definition: GainDefinition = { level: 100, parameters: new Map() };
        gains.set(name, definition);
        void calls;
        results.push({ message: `${name} = gain` });
        continue;
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
        void calls;
        results.push({ message: `${name} = Voice` });
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
      if (parameter === 'freq') return oscillator?.frequency ?? voice?.frequency;
      if (parameter === 'level') return gain?.level;
      if (parameter === 'model') return voice?.model;
      if (voice && (parameter === 'harmo' || parameter === 'timbre' || parameter === 'morph')) return voice[parameter];
      return undefined;
    };

    const evalValue = (expression: string, lineNumber: number): ScalarValue | undefined => {
      try {
        return evaluateExpression(expression, {
          resolveIdentifier: (name) => variables.get(name),
          resolveMember,
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
          const error = applyVoiceCall(voiceDeclaration.name, definition, call, views, (expr) => evalValue(expr, lineNumber));
          if (error) diagnostics.push({ line: lineNumber, message: error });
        }
        continue;
      }
      if (parseClockDeclaration(line)) continue;

      const setterAssignment = line.match(/^([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)\.(freq|note|level|model|harmo|timbre|morph|bpm)\(\s*(.+)\s*\)$/);
      if (setterAssignment) {
        const [, variableName, objectName, parameter, rawValue] = setterAssignment;
        if (variableName === 'Main' || variableName === 'Clock' || objectExists(variableName, oscillators, gains, voices) || clockSources.has(variableName)) {
          diagnostics.push({ line: lineNumber, message: `cannot assign scalar value to object or reserved name: ${variableName}` });
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
        if (name === 'Main' || name === 'Clock' || objectExists(name, oscillators, gains, voices) || clockSources.has(name)) {
          diagnostics.push({ line: lineNumber, message: `cannot assign scalar value to object or reserved name: ${name}` });
          continue;
        }
        const value = evalValue(expression, lineNumber);
        if (value !== undefined) {
          variables.set(name, value);
          results.push({ message: `${name} = ${formatScalar(value)}` });
        }
        continue;
      }

      let match = line.match(/^Clock\.bpm\(\s*(.+)\s*\)\s*$/);
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
        if (!oscillator && !voice) {
          diagnostics.push({ line: lineNumber, message: `unknown frequency-capable object: ${name}` });
          continue;
        }

        const frequency = evalNumber(rawFrequency, lineNumber, 'freq');
        if (frequency === undefined) continue;
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

      match = line.match(/^([A-Za-z_]\w*)\.(freq|harmo|timbre|morph|model|level)\.view\(\s*\)\s*$/);
      if (match) {
        const [, name, parameter] = match;
        const oscillator = oscillators.get(name);
        const voice = voices.get(name);
        const gain = gains.get(name);
        let value: string | null = null;

        if (parameter === 'freq') {
          if (oscillator) value = `${formatNumber(oscillator.frequency)} HZ`;
          else if (voice) value = `${formatNumber(voice.frequency)} HZ`;
        } else if (parameter === 'model' && voice) {
          value = formatVoiceModel(voice.model);
        } else if ((parameter === 'harmo' || parameter === 'timbre' || parameter === 'morph') && voice) {
          value = `${formatNumber(voice[parameter])}%`;
        } else if (parameter === 'level' && gain) {
          value = `${formatNumber(gain.level)}%`;
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

      if (/^Main(?:\.out)?\.view\(\s*\)\s*$/.test(line)) {
        views.set('Main.out', 'signal');
        results.push({ message: 'Main.out view' });
        continue;
      }

      match = line.match(/^([A-Za-z_]\w*)\.view\(\s*\)\s*$/);
      if (match && clockSources.has(match[1])) { views.set(`${match[1]}.out`, 'trigger'); results.push({ message: `${match[1]}.out view` }); continue; }

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

      match = line.match(/^([A-Za-z_]\w*)(?:\.out)?\.view\(\s*\)\s*$/);
      if (match) {
        const name = match[1];
        if (objectExists(name, oscillators, gains, voices)) {
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
        if (sourceName !== 'Clock' && !clockSources.has(sourceName) && !objectExists(sourceName, oscillators, gains, voices)) {
          diagnostics.push({ line: lineNumber, message: `unknown source object: ${sourceName}` });
          continue;
        }
        if (sourcePort === 'aux' && !voices.has(sourceName)) {
          diagnostics.push({ line: lineNumber, message: `aux output is only available on Voice objects: ${sourceName}` });
          continue;
        }
        if (targetPort === 'trig') {
          if (!voices.has(targetName)) { diagnostics.push({ line: lineNumber, message: `trigger input is only available on Voice objects: ${targetName}` }); continue; }
        } else if (targetPort === 'v_oct') {
          if (!voices.has(targetName)) { diagnostics.push({ line: lineNumber, message: `v_oct input is only available on Voice objects: ${targetName}` }); continue; }
        } else if (targetName !== 'Main' && !gains.has(targetName)) {
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

        const source = `${sourceName}.${sourcePort}`;
        const target = `${targetName}.${targetPort}`;
        const kind: SignalKind = sourceName === 'Clock' || clockSources.has(sourceName) ? 'trigger' : 'signal';
        routes.set(`${source}->${target}`, { source, target, amount, kind });
        results.push({ message: `${source} -> ${target} @ ${formatNumber(amount)}%` });
        continue;
      }

      diagnostics.push({ line: lineNumber, message: `cannot evaluate: ${line}` });
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

    if (diagnostics.length > 0) throw new SonusEvaluationError(diagnostics);

    // VARIABLES is the runtime symbol table for user-created names. Scalars
    // show their current value, while object references show their object type.
    // Built-in singletons such as Main and Clock are intentionally omitted.
    variableViews.length = 0;
    for (const [name] of voices) variableViews.push({ name, value: 'Voice' });
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
      let value: string | null = null;

      if (parameter === 'freq') {
        if (oscillator) value = `${formatNumber(oscillator.frequency)} HZ`;
        else if (voice) value = `${formatNumber(voice.frequency)} HZ`;
      } else if (parameter === 'model' && voice) {
        value = formatVoiceModel(voice.model);
      } else if ((parameter === 'harmo' || parameter === 'timbre' || parameter === 'morph') && voice) {
        value = `${formatNumber(voice[parameter])}%`;
      } else if (parameter === 'level' && gain) {
        value = `${formatNumber(gain.level)}%`;
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
      const owner = signal === 'Main.out'
        ? 'Main'
        : signal === 'Clock.out'
          ? 'Clock'
          : signal.replace(/\.(out|aux)$/, '');
      const port = signal.endsWith('.aux') ? 'AUX' : 'OUT';
      const ownerViews = embeddedViews.get(owner) ?? [];
      if (!ownerViews.some((view) => view.signal === signal)) {
        ownerViews.push({ signal, signalKind, port });
        embeddedViews.set(owner, ownerViews);
      }
    };

    // Keep Scheme compact: only structural/global monitors are automatic.
    // Module outputs, secondary ports and derived clocks require .view().
    addEmbeddedView('Main.out', 'signal');
    addEmbeddedView('Clock.out', 'trigger');

    for (const [signal, signalKind] of views) {
      if (signalKind === 'parameter') continue;
      addEmbeddedView(signal, signalKind as SignalKind);
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
      { id: 'Main', label: 'MAIN', kind: 'module' as const, parameters: [], views: embeddedViews.get('Main') },
    ];

    const schemeConnections: SchemeConnection[] = [
      ...[...routes.values()].map((route) => ({
        source: route.source.replace(/\.(out|aux)$/, ''),
        target: route.target.startsWith('Main.') ? 'Main' : route.target.replace(/\.(in|trig|v_oct)$/, ''),
        sourcePort: route.source.endsWith('.aux') ? 'AUX' : 'OUT',
        targetPort: route.target.endsWith('.trig') ? 'TRIG' : route.target.endsWith('.v_oct') ? 'V/OCT' : 'IN',
        type: route.kind,
        amount: route.amount,
      })),
    ];

    this.scheme = { nodes: schemeNodes, connections: schemeConnections };

    const program: AudioProgram = {
      clock: { bpm: clockBpm },
      clockSources: [{ name: 'Clock', rate: 1 }, ...[...clockSources.entries()].map(([name, definition]) => ({ name, rate: definition.rate }))],
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
      views: [...views.entries()]
        .filter(([, kind]) => kind !== 'parameter')
        .map(([signal, kind]) => ({ signal, kind: kind as SignalKind })),
      monitorViews: (() => {
        const monitors = new Map<string, SignalKind>();
        monitors.set('Main.out', 'signal');
        monitors.set('Clock.out', 'trigger');
        for (const [signal, kind] of views) {
          if (kind !== 'parameter') monitors.set(signal, kind as SignalKind);
        }
        return [...monitors].map(([signal, kind]) => ({ signal, kind }));
      })(),
    };

    this.parameterViews = [...parameterViews.values()];
    this.variableViews = variableViews;
    this.explicitSignalViews = [...views.entries()]
      .filter(([, kind]) => kind !== 'parameter')
      .map(([signal, kind]) => ({ signal, kind: kind as SignalKind }));
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
  sourcePort: 'out' | 'aux';
  amountExpression: string | null;
  targetName: string;
  targetPort: 'in' | 'trig' | 'v_oct';
}

function parseRouteLine(line: string): ParsedRoute | null {
  const arrow = line.indexOf('->');
  if (arrow < 0 || line.indexOf('->', arrow + 2) >= 0) return null;
  const left = line.slice(0, arrow).trim();
  const right = line.slice(arrow + 2).trim();
  const target = right.match(/^([A-Za-z_]\w*)\.(in|trig|v_oct)$/);
  if (!target) return null;
  const source = left.match(/^([A-Za-z_]\w*)\.(out|aux)(.*)$/);
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
    sourcePort: source[2] as 'out' | 'aux',
    amountExpression,
    targetName: target[1],
    targetPort: target[2] as 'in' | 'trig' | 'v_oct',
  };
}

function reservedOrDuplicate(
  name: string,
  oscillators: Map<string, OscillatorDefinition>,
  gains: Map<string, GainDefinition>,
  voices: Map<string, VoiceDefinition>,
  diagnostics: SonusDiagnostic[],
  lineNumber: number,
): boolean {
  if (name === 'Main' || name === 'Clock') {
    diagnostics.push({ line: lineNumber, message: `${name} is a built-in singleton and cannot be assigned` });
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
  views: Map<string, ViewKind>,
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
      views.set(`${objectName}.out`, 'signal');
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
