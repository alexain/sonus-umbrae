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
    const results: EvaluationResult[] = [];
    const diagnostics: SonusDiagnostic[] = [];

    const lines = source
      .split(/\r?\n/)
      .map((line, index) => ({ source: line.trim(), line: index + 1 }))
      .filter(({ source: line }) => line.length > 0 && !line.startsWith('#'));

    // Pass 1: declarations. Collect every declaration error so the editor can
    // mark all invalid lines in a single evaluation pass.
    for (const { source: line, line: lineNumber } of lines) {
      const match = line.match(/^([A-Za-z_]\w*)\s*=\s*osc\(\s*\)\s*$/);
      if (!match) continue;

      const name = match[1];
      if (oscillators.has(name)) {
        diagnostics.push({ line: lineNumber, message: `duplicate object: ${name}` });
        continue;
      }

      oscillators.set(name, { frequency: 440 });
      results.push({ message: `${name} = osc` });
    }

    // Pass 2: parameters and routes. Invalid lines do not stop validation of
    // later lines. The audio program is only applied if the whole document is valid.
    for (const { source: line, line: lineNumber } of lines) {
      if (/^([A-Za-z_]\w*)\s*=\s*osc\(\s*\)\s*$/.test(line)) continue;

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

        oscillator.frequency = 440 * 2 ** ((note - 69) / 12);
        results.push({ message: `${name}.note ${formatNumber(note)}` });
        continue;
      }

      match = line.match(/^([A-Za-z_]\w*)\.out(?:\(\s*(-?\d+(?:\.\d+)?)\s*\))?\s*->\s*out\.main\s*$/);
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

        routes.set(`${name}.out->out.main`, { source: name, amount });
        results.push({ message: `${name}.out -> out.main @ ${formatNumber(amount)}%` });
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
        destination: 'out.main' as const,
        amount: route.amount,
      })),
    };

    this.audio.applyProgram(program);
    return results.length > 0 ? results : [{ message: 'ok' }];
  }
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
