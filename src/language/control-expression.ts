export type ControlRateUnit = 'hz' | 'beat' | 'sec' | 'ms';
export type InlineLfoWaveform = 'sine' | 'triangle' | 'sawtooth' | 'ramp' | 'square';

export interface ControlRateExpression {
  value: number;
  unit: ControlRateUnit;
  /** Reserved for named-clock synchronization. Omitted means master Clock. */
  clock?: string;
}

export type ControlExpression =
  | { kind: 'number'; value: number }
  | { kind: 'reference'; path: string[] }
  | { kind: 'unary'; operator: '+' | '-'; operand: ControlExpression }
  | { kind: 'binary'; operator: '+' | '-' | '*' | '/'; left: ControlExpression; right: ControlExpression }
  | { kind: 'inline-lfo'; waveform: InlineLfoWaveform; rate: ControlRateExpression; site: number }
  | { kind: 'inline-random'; rate: ControlRateExpression; site: number };

export interface InlineControlState {
  phase?: number;
  lastTime?: number;
  randomValue?: number;
  elapsed?: number;
}

export interface ControlExpressionContext {
  resolveScalar(path: string[]): number | undefined;
  resolveMod(path: string[]): number | undefined;
  nowSeconds: number;
  bpm: number;
  random(): number;
  state: Map<string, InlineControlState>;
  statePrefix: string;
}

type TokenKind = 'number' | 'identifier' | 'operator' | 'punctuation' | 'eof';
interface Token { kind: TokenKind; value: string; position: number; }

export class ControlExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ControlExpressionError';
  }
}


export function splitTopLevelCommaList(source: string): string[] {
  const items: string[] = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth < 0) throw new ControlExpressionError(`unexpected ')' at column ${index + 1}`);
    } else if (char === ',' && depth === 0) {
      const item = source.slice(start, index).trim();
      if (item) items.push(item);
      start = index + 1;
    }
  }
  if (depth !== 0) throw new ControlExpressionError('unbalanced parentheses in control modifier list');
  const tail = source.slice(start).trim();
  if (tail) items.push(tail);
  return items;
}

export function parseControlExpression(source: string): ControlExpression {
  const parser = new Parser(tokenize(source));
  return parser.parse();
}

export function evaluateControlExpression(expression: ControlExpression, context: ControlExpressionContext): number {
  const evalNode = (node: ControlExpression): number => {
    switch (node.kind) {
      case 'number': return node.value;
      case 'reference': {
        const scalar = context.resolveScalar(node.path);
        if (scalar !== undefined) return scalar;
        const mod = context.resolveMod(node.path);
        if (mod !== undefined) return mod;
        throw new ControlExpressionError(`unknown control reference: ${node.path.join('.')}`);
      }
      case 'unary': {
        const value = evalNode(node.operand);
        return node.operator === '-' ? -value : value;
      }
      case 'binary': {
        const left = evalNode(node.left);
        const right = evalNode(node.right);
        if (node.operator === '+') return left + right;
        if (node.operator === '-') return left - right;
        if (node.operator === '*') return left * right;
        if (right === 0) throw new ControlExpressionError('division by zero');
        return left / right;
      }
      case 'inline-lfo': {
        const stateKey = `${context.statePrefix}:lfo:${node.site}`;
        const state = context.state.get(stateKey) ?? {};
        const now = context.nowSeconds;
        const lastTime = state.lastTime ?? now;
        const delta = Math.max(0, Math.min(0.25, now - lastTime));
        const frequency = rateToHz(node.rate, context.bpm);
        state.phase = (state.phase ?? 0) + delta * frequency;
        state.lastTime = now;
        context.state.set(stateKey, state);
        const phase = state.phase - Math.floor(state.phase);
        return sampleWaveform(node.waveform, phase);
      }
      case 'inline-random': {
        const stateKey = `${context.statePrefix}:random:${node.site}`;
        const state = context.state.get(stateKey) ?? {};
        const now = context.nowSeconds;
        const lastTime = state.lastTime ?? now;
        const delta = Math.max(0, Math.min(0.25, now - lastTime));
        const period = 1 / rateToHz(node.rate, context.bpm);
        state.elapsed = (state.elapsed ?? period) + delta;
        if (state.randomValue === undefined || state.elapsed >= period) {
          state.randomValue = context.random() * 2 - 1;
          state.elapsed %= period;
        }
        state.lastTime = now;
        context.state.set(stateKey, state);
        return state.randomValue;
      }
    }
  };

  const result = evalNode(expression);
  if (!Number.isFinite(result)) throw new ControlExpressionError('control expression produced a non-finite value');
  return result;
}

function rateToHz(rate: ControlRateExpression, bpm: number): number {
  if (rate.unit === 'hz') return rate.value;
  if (rate.unit === 'sec') return 1 / rate.value;
  if (rate.unit === 'ms') return 1000 / rate.value;
  return Math.max(1e-9, bpm) / 60 / rate.value;
}

function sampleWaveform(waveform: InlineLfoWaveform, phase: number): number {
  if (waveform === 'sine') return Math.sin(phase * Math.PI * 2);
  if (waveform === 'triangle') return 1 - 4 * Math.abs(phase - 0.5);
  if (waveform === 'sawtooth') return phase * 2 - 1;
  if (waveform === 'ramp') return 1 - phase * 2;
  return phase < 0.5 ? 1 : -1;
}

class Parser {
  private index = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): ControlExpression {
    const expression = this.parseAdditive();
    if (!this.is('eof')) throw this.error(`unexpected token '${this.peek().value}'`);
    return expression;
  }

  private parseAdditive(): ControlExpression {
    let left = this.parseMultiplicative();
    while (this.isOperator('+') || this.isOperator('-')) {
      const operator = this.advance().value as '+' | '-';
      left = { kind: 'binary', operator, left, right: this.parseMultiplicative() };
    }
    return left;
  }

  private parseMultiplicative(): ControlExpression {
    let left = this.parseUnary();
    while (this.isOperator('*') || this.isOperator('/')) {
      const operator = this.advance().value as '*' | '/';
      left = { kind: 'binary', operator, left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): ControlExpression {
    if (this.isOperator('+') || this.isOperator('-')) {
      const operator = this.advance().value as '+' | '-';
      return { kind: 'unary', operator, operand: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ControlExpression {
    const token = this.peek();
    if (token.kind === 'number') {
      this.advance();
      return { kind: 'number', value: Number(token.value) };
    }
    if (token.kind === 'identifier') return this.parseIdentifier();
    if (this.matchPunctuation('(')) {
      const expression = this.parseAdditive();
      this.expectPunctuation(')');
      return expression;
    }
    throw this.error(`expected control expression, found '${token.value}'`);
  }

  private parseIdentifier(): ControlExpression {
    const token = this.advance();
    const name = token.value;
    if (this.matchPunctuation('(')) {
      const lower = name.toLowerCase();
      if (lower === 'lfo') return this.parseInlineLfo(token.position);
      if (lower === 'random') return this.parseInlineRandom(token.position);
      throw this.error(`unknown inline modulator '${name}'`);
    }

    const path = [name];
    while (this.matchPunctuation('.')) {
      const member = this.peek();
      if (member.kind !== 'identifier') throw this.error('expected member name after dot');
      path.push(this.advance().value);
    }
    return { kind: 'reference', path };
  }

  private parseInlineLfo(site: number): ControlExpression {
    const waveformToken = this.peek();
    if (waveformToken.kind !== 'identifier') throw this.error('lfo expects waveform as first argument');
    const waveform = this.advance().value.toLowerCase() as InlineLfoWaveform;
    if (!['sine', 'triangle', 'sawtooth', 'ramp', 'square'].includes(waveform)) {
      throw this.error('lfo waveform expects sine, triangle, sawtooth, ramp, or square');
    }
    this.expectPunctuation(',');
    const rate = this.parseRate();
    this.expectPunctuation(')');
    return { kind: 'inline-lfo', waveform, rate, site };
  }

  private parseInlineRandom(site: number): ControlExpression {
    const rate = this.parseRate();
    this.expectPunctuation(')');
    return { kind: 'inline-random', rate, site };
  }

  private parseRate(): ControlRateExpression {
    const number = this.peek();
    if (number.kind !== 'number') throw this.error('inline modulator rate expects a positive number and unit');
    const value = Number(this.advance().value);
    if (!Number.isFinite(value) || value <= 0) throw this.error('inline modulator rate must be greater than 0');
    const unitToken = this.peek();
    if (unitToken.kind !== 'identifier') throw this.error('inline modulator rate expects hz, beat, sec, or ms');
    const rawUnit = this.advance().value.toLowerCase();
    const unit = rawUnit === 'hz' ? 'hz'
      : rawUnit === 'beat' || rawUnit === 'beats' ? 'beat'
      : rawUnit === 'sec' || rawUnit === 'secs' || rawUnit === 'second' || rawUnit === 'seconds' ? 'sec'
      : rawUnit === 'ms' ? 'ms' : null;
    if (!unit) throw this.error('inline modulator rate expects hz, beat, sec, or ms');
    return { value, unit };
  }

  private peek(): Token { return this.tokens[this.index]; }
  private advance(): Token { return this.tokens[this.index++]; }
  private is(kind: TokenKind): boolean { return this.peek().kind === kind; }
  private isOperator(value: string): boolean { return this.peek().kind === 'operator' && this.peek().value === value; }
  private matchPunctuation(value: string): boolean {
    if (this.peek().kind !== 'punctuation' || this.peek().value !== value) return false;
    this.index += 1;
    return true;
  }
  private expectPunctuation(value: string): void {
    if (!this.matchPunctuation(value)) throw this.error(`expected '${value}'`);
  }
  private error(message: string): ControlExpressionError {
    return new ControlExpressionError(`${message} at column ${this.peek().position + 1}`);
  }
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) { index += 1; continue; }
    if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(source[index + 1] ?? ''))) {
      const start = index;
      let sawDot = false;
      while (index < source.length) {
        const next = source[index];
        if (next === '.') {
          if (sawDot) break;
          sawDot = true;
          index += 1;
          continue;
        }
        if (!/[0-9]/.test(next)) break;
        index += 1;
      }
      const raw = source.slice(start, index);
      if (!/^\d+(?:\.\d+)?$/.test(raw)) throw new ControlExpressionError(`invalid number '${raw}' at column ${start + 1}`);
      tokens.push({ kind: 'number', value: raw, position: start });
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) index += 1;
      tokens.push({ kind: 'identifier', value: source.slice(start, index), position: start });
      continue;
    }
    if ('+-*/'.includes(char)) {
      tokens.push({ kind: 'operator', value: char, position: index++ });
      continue;
    }
    if ('(),.'.includes(char)) {
      tokens.push({ kind: 'punctuation', value: char, position: index++ });
      continue;
    }
    throw new ControlExpressionError(`unexpected character '${char}' at column ${index + 1}`);
  }
  tokens.push({ kind: 'eof', value: '', position: source.length });
  return tokens;
}
