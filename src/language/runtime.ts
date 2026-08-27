import { AudioEngine, type AudioProgram } from '../audio/engine';

export interface EvaluationResult {
  message: string;
}

export interface SonusDiagnostic {
  line: number;
  message: string;
}

export class SonusEvaluationError extends SyntaxError {
  constructor(public readonly diagnostics: SonusDiagnostic[]) {
    super(diagnostics[0]?.message ?? 'evaluation failed');
    this.name = 'SonusEvaluationError';
  }
}

interface OscillatorDefinition {
  frequency: number;
}

interface RouteDefinition {
  source: string;
  amount: number;
}

export class SonusRuntime {
  constructor(private readonly audio: AudioEngine) {}

  evaluate(source: string): EvaluationResult[] {
    const oscillators = new Map<string, OscillatorDefinition>();
    const routes = new Map<string, RouteDefinition>();
    const views = new Set<string>();
    const results: EvaluationResult[] = [];
    const diagnostics: SonusDiagnostic[] = [];

    const lines = source
      .split(/\r?\n/)
      .map((line, index) => ({ source: line.trim(), line: index + 1 }))
      .filter(({ source: line }) => line.length > 0 && !line.startsWith('#'));

    // Pass 1: declarations. Declarations are collected before the remaining
    // statements so the source is declarative rather than execution-order dependent.
    for (const { source: line, line: lineNumber } of lines) {
      const declaration = parseOscillatorDeclaration(line);
      if (!declaration) continue;

      const { name, calls } = declaration;
      if (name === 'Main') {
        diagnostics.push({ line: lineNumber, message: 'Main is a built-in singleton and cannot be assigned' });
        continue;
      }
      if (oscillators.has(name)) {
        diagnostics.push({ line: lineNumber, message: `duplicate object: ${name}` });
        continue;
      }

      const definition: OscillatorDefinition = { frequency: 440 };
      oscillators.set(name, definition);

      for (const call of calls) {
        const error = applyOscillatorCall(name, definition, call, views);
        if (error) diagnostics.push({ line: lineNumber, message: error });
      }

      results.push({ message: `${name} = osc` });
    }

    // Pass 2: parameters, views and routes. Invalid lines do not stop validation
    // of later lines. The audio program is applied only if the whole document is valid.
    for (const { source: line, line: lineNumber } of lines) {
      if (parseOscillatorDeclaration(line)) continue;

      let match = line.match(/^([A-Za-z_]\w*)\.freq\(\s*(-?\d+(?:\.\d+)?)\s*\)\s*$/);
      if (match) {
        const [, name, rawFrequency] = match;
        const oscillator = oscillators.get(name);
        if (!oscillator) {
          diagnostics.push({ line: lineNumber, message: `unknown object: ${name}` });
          continue;
        }

        const frequency = Number(rawFrequency);
        const error = frequencyError(frequency);
        if (error) {
          diagnostics.push({ line: lineNumber, message: error });
          continue;
        }

        oscillator.frequency = frequency;
        results.push({ message: `${name}.freq ${formatNumber(frequency)} hz` });
        continue;
      }

      match = line.match(/^([A-Za-z_]\w*)\.note\(\s*(-?\d+(?:\.\d+)?)\s*\)\s*$/);
      if (match) {
        const [, name, rawNote] = match;
        const oscillator = oscillators.get(name);
        if (!oscillator) {
          diagnostics.push({ line: lineNumber, message: `unknown object: ${name}` });
          continue;
        }

        const note = Number(rawNote);
        const error = noteError(note);
        if (error) {
          diagnostics.push({ line: lineNumber, message: error });
          continue;
        }

        oscillator.frequency = midiToFrequency(note);
        results.push({ message: `${name}.note ${formatNumber(note)}` });
        continue;
      }

      if (/^Main(?:\.out)?\.view\(\s*\)\s*$/.test(line)) {
        views.add('Main.out');
        results.push({ message: 'Main.out view' });
        continue;
      }

      match = line.match(/^([A-Za-z_]\w*)(?:\.out)?\.view\(\s*\)\s*$/);
      if (match) {
        const name = match[1];
        if (!oscillators.has(name)) {
          diagnostics.push({ line: lineNumber, message: `unknown object: ${name}` });
          continue;
        }

        views.add(`${name}.out`);
        results.push({ message: `${name}.out view` });
        continue;
      }

      match = line.match(/^([A-Za-z_]\w*)\.out(?:\(\s*(-?\d+(?:\.\d+)?)\s*\))?\s*->\s*Main\.in\s*$/);
      if (match) {
        const [, name, rawAmount] = match;
        if (!oscillators.has(name)) {
          diagnostics.push({ line: lineNumber, message: `unknown object: ${name}` });
          continue;
        }

        const amount = rawAmount === undefined ? 100 : Number(rawAmount);
        const error = routeAmountError(amount);
        if (error) {
          diagnostics.push({ line: lineNumber, message: error });
          continue;
        }

        routes.set(`${name}.out->Main.in`, { source: name, amount });
        results.push({ message: `${name}.out -> Main.in @ ${formatNumber(amount)}%` });
        continue;
      }

      diagnostics.push({ line: lineNumber, message: `cannot evaluate: ${line}` });
    }

    if (diagnostics.length > 0) throw new SonusEvaluationError(diagnostics);

    const program: AudioProgram = {
      oscillators: [...oscillators.entries()].map(([name, definition]) => ({
        name,
        frequency: definition.frequency,
      })),
      routes: [...routes.values()].map((route) => ({
        source: route.source,
        destination: 'Main.in' as const,
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

interface OscillatorDeclaration {
  name: string;
  calls: ChainedCall[];
}

function parseOscillatorDeclaration(line: string): OscillatorDeclaration | null {
  const match = line.match(/^([A-Za-z_]\w*)\s*=\s*osc\(\s*\)(.*)$/);
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
      return null;
    }
    case 'note': {
      const note = parseSingleNumber(call.argument);
      if (note === null) return 'note expects one numeric value';
      const error = noteError(note);
      if (error) return error;
      oscillator.frequency = midiToFrequency(note);
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

function routeAmountError(value: number): string | null {
  return !Number.isFinite(value) || value < 0 || value > 100
    ? 'route amount must be between 0 and 100'
    : null;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
