export type ScalarValue = number | string | boolean;

export interface ExpressionContext {
  resolveIdentifier(name: string): ScalarValue | undefined;
  resolveMember(path: string[]): ScalarValue | undefined;
  callFunction?(name: string, args: ScalarValue[], position: number): ScalarValue | undefined;
}

type TokenType = 'number' | 'string' | 'identifier' | 'operator' | 'punctuation' | 'eof';

interface Token {
  type: TokenType;
  value: string;
  position: number;
}

export class ExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExpressionError';
  }
}

export function evaluateExpression(source: string, context: ExpressionContext): ScalarValue {
  const parser = new ExpressionParser(tokenize(source), context);
  const value = parser.parse();
  return value;
}

class ExpressionParser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly context: ExpressionContext,
  ) {}

  parse(): ScalarValue {
    const value = this.parseOr();
    if (!this.is('eof')) throw this.error(`unexpected token '${this.peek().value}'`);
    return value;
  }

  private parseOr(): ScalarValue {
    let left = this.parseAnd();
    while (this.matchOperator('||')) {
      const right = this.parseAnd();
      left = this.asBoolean(left, '||') || this.asBoolean(right, '||');
    }
    return left;
  }

  private parseAnd(): ScalarValue {
    let left = this.parseEquality();
    while (this.matchOperator('&&')) {
      const right = this.parseEquality();
      left = this.asBoolean(left, '&&') && this.asBoolean(right, '&&');
    }
    return left;
  }

  private parseEquality(): ScalarValue {
    let left = this.parseComparison();
    while (this.isOperator('==') || this.isOperator('!=')) {
      const operator = this.advance().value;
      const right = this.parseComparison();
      left = operator === '==' ? left === right : left !== right;
    }
    return left;
  }

  private parseComparison(): ScalarValue {
    let left = this.parseAdditive();
    while (['<', '<=', '>', '>='].some((operator) => this.isOperator(operator))) {
      const operator = this.advance().value;
      const right = this.parseAdditive();
      const a = this.asNumber(left, operator);
      const b = this.asNumber(right, operator);
      if (operator === '<') left = a < b;
      else if (operator === '<=') left = a <= b;
      else if (operator === '>') left = a > b;
      else left = a >= b;
    }
    return left;
  }

  private parseAdditive(): ScalarValue {
    let left = this.parseMultiplicative();
    while (this.isOperator('+') || this.isOperator('-')) {
      const operator = this.advance().value;
      const right = this.parseMultiplicative();
      left = operator === '+'
        ? this.asNumber(left, '+') + this.asNumber(right, '+')
        : this.asNumber(left, '-') - this.asNumber(right, '-');
    }
    return left;
  }

  private parseMultiplicative(): ScalarValue {
    let left = this.parsePower();
    while (this.isOperator('*') || this.isOperator('/') || this.isOperator('%')) {
      const operator = this.advance().value;
      const right = this.parsePower();
      const a = this.asNumber(left, operator);
      const b = this.asNumber(right, operator);
      if ((operator === '/' || operator === '%') && b === 0) throw this.error('division by zero');
      if (operator === '*') left = a * b;
      else if (operator === '/') left = a / b;
      else left = a % b;
    }
    return left;
  }

  private parsePower(): ScalarValue {
    const left = this.parseUnary();
    if (!this.matchOperator('^')) return left;
    const right = this.parsePower();
    return this.asNumber(left, '^') ** this.asNumber(right, '^');
  }

  private parseUnary(): ScalarValue {
    if (this.matchOperator('-')) return -this.asNumber(this.parseUnary(), 'unary -');
    if (this.matchOperator('+')) return this.asNumber(this.parseUnary(), 'unary +');
    if (this.matchOperator('!')) return !this.asBoolean(this.parseUnary(), '!');
    return this.parsePrimary();
  }

  private parsePrimary(): ScalarValue {
    const token = this.peek();
    if (token.type === 'number') {
      this.advance();
      return Number(token.value);
    }
    if (token.type === 'string') {
      this.advance();
      return token.value;
    }
    if (token.type === 'identifier') {
      return this.parseIdentifier();
    }
    if (this.matchPunctuation('(')) {
      const value = this.parseOr();
      this.expectPunctuation(')');
      return value;
    }
    throw this.error(`expected expression, found '${token.value}'`);
  }

  private parseIdentifier(): ScalarValue {
    const firstToken = this.advance();
    const first = firstToken.value;

    if (this.matchPunctuation('(')) {
      const args: ScalarValue[] = [];
      if (!this.matchPunctuation(')')) {
        do {
          args.push(this.parseOr());
        } while (this.matchPunctuation(','));
        this.expectPunctuation(')');
      }
      return this.callFunction(first, args, firstToken.position);
    }

    if (first === 'true') return true;
    if (first === 'false') return false;

    const path = [first];
    while (this.matchPunctuation('.')) {
      const member = this.peek();
      if (member.type !== 'identifier') throw this.error('expected member name after dot');
      path.push(this.advance().value);
    }

    if (path.length > 1) {
      const value = this.context.resolveMember(path);
      if (value === undefined) throw this.error(`unknown value: ${path.join('.')}`);
      return value;
    }

    const value = this.context.resolveIdentifier(first);
    if (value === undefined) throw this.error(`unknown variable: ${first}`);
    return value;
  }

  private callFunction(name: string, args: ScalarValue[], position: number): ScalarValue {
    const externalValue = this.context.callFunction?.(name, args, position);
    if (externalValue !== undefined) return externalValue;

    switch (name.toLowerCase()) {
      case 'rnd': {
        this.expectArity(name, args, 2);
        const min = this.asNumber(args[0], name);
        const max = this.asNumber(args[1], name);
        if (max < min) throw this.error('rnd expects min <= max');
        return min + Math.random() * (max - min);
      }
      case 'choose': {
        if (args.length === 0) throw this.error('choose expects at least one value');
        return args[Math.floor(Math.random() * args.length)];
      }
      case 'coin': {
        if (args.length > 1) throw this.error('coin expects zero or one probability value');
        const probability = args.length === 0 ? 50 : this.asNumber(args[0], name);
        if (probability < 0 || probability > 100) throw this.error('coin probability must be between 0 and 100');
        return Math.random() * 100 < probability;
      }
      case 'clamp': {
        this.expectArity(name, args, 3);
        const value = this.asNumber(args[0], name);
        const min = this.asNumber(args[1], name);
        const max = this.asNumber(args[2], name);
        if (max < min) throw this.error('clamp expects min <= max');
        return Math.min(max, Math.max(min, value));
      }
      case 'map': {
        this.expectArity(name, args, 5);
        const value = this.asNumber(args[0], name);
        const inMin = this.asNumber(args[1], name);
        const inMax = this.asNumber(args[2], name);
        const outMin = this.asNumber(args[3], name);
        const outMax = this.asNumber(args[4], name);
        if (inMax === inMin) throw this.error('map input range cannot be zero');
        return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
      }
      case 'min': {
        if (args.length === 0) throw this.error('min expects at least one value');
        return Math.min(...args.map((value) => this.asNumber(value, name)));
      }
      case 'max': {
        if (args.length === 0) throw this.error('max expects at least one value');
        return Math.max(...args.map((value) => this.asNumber(value, name)));
      }
      case 'abs': {
        this.expectArity(name, args, 1);
        return Math.abs(this.asNumber(args[0], name));
      }
      case 'round': {
        this.expectArity(name, args, 1);
        return Math.round(this.asNumber(args[0], name));
      }
      case 'floor': {
        this.expectArity(name, args, 1);
        return Math.floor(this.asNumber(args[0], name));
      }
      case 'ceil': {
        this.expectArity(name, args, 1);
        return Math.ceil(this.asNumber(args[0], name));
      }
      default:
        throw this.error(`unknown function: ${name}`);
    }
  }

  private expectArity(name: string, args: ScalarValue[], arity: number): void {
    if (args.length !== arity) throw this.error(`${name} expects ${arity} argument${arity === 1 ? '' : 's'}`);
  }

  private asNumber(value: ScalarValue, context: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw this.error(`${context} expects numeric values`);
    return value;
  }

  private asBoolean(value: ScalarValue, context: string): boolean {
    if (typeof value !== 'boolean') throw this.error(`${context} expects boolean values`);
    return value;
  }

  private peek(): Token { return this.tokens[this.index]; }
  private advance(): Token { return this.tokens[this.index++]; }
  private is(type: TokenType): boolean { return this.peek().type === type; }
  private isOperator(value: string): boolean { return this.peek().type === 'operator' && this.peek().value === value; }
  private matchOperator(value: string): boolean { if (!this.isOperator(value)) return false; this.advance(); return true; }
  private matchPunctuation(value: string): boolean { if (this.peek().type !== 'punctuation' || this.peek().value !== value) return false; this.advance(); return true; }
  private expectPunctuation(value: string): void { if (!this.matchPunctuation(value)) throw this.error(`expected '${value}'`); }
  private error(message: string): ExpressionError { return new ExpressionError(message); }
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (/\s/.test(char)) { i += 1; continue; }

    if (/\d/.test(char) || (char === '.' && /\d/.test(source[i + 1] ?? ''))) {
      const start = i;
      if (char === '.') i += 1;
      while (/\d/.test(source[i] ?? '')) i += 1;
      if (source[i] === '.') { i += 1; while (/\d/.test(source[i] ?? '')) i += 1; }
      const value = source.slice(start, i);
      if (!/^\d+(?:\.\d+)?$|^\.\d+$/.test(value)) throw new ExpressionError(`invalid number '${value}'`);
      tokens.push({ type: 'number', value, position: start });
      continue;
    }

    if (char === '"' || char === "'") {
      const quote = char;
      const start = i;
      i += 1;
      let value = '';
      let closed = false;
      while (i < source.length) {
        if (source[i] === quote) { i += 1; closed = true; break; }
        if (source[i] === '\\') {
          const next = source[i + 1];
          if (next === undefined) break;
          const escapes: Record<string, string> = { n: '\n', r: '\r', t: '\t', '\\': '\\', '"': '"', "'": "'" };
          value += escapes[next] ?? next;
          i += 2;
          continue;
        }
        value += source[i++];
      }
      if (!closed) throw new ExpressionError(`unterminated string at ${start + 1}`);
      tokens.push({ type: 'string', value, position: start });
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const start = i++;
      while (/[A-Za-z0-9_]/.test(source[i] ?? '')) i += 1;
      tokens.push({ type: 'identifier', value: source.slice(start, i), position: start });
      continue;
    }

    const two = source.slice(i, i + 2);
    if (['<=', '>=', '==', '!=', '&&', '||'].includes(two)) {
      tokens.push({ type: 'operator', value: two, position: i });
      i += 2;
      continue;
    }

    if ('+-*/%^<>!'.includes(char)) {
      tokens.push({ type: 'operator', value: char, position: i++ });
      continue;
    }

    if ('(),.'.includes(char)) {
      tokens.push({ type: 'punctuation', value: char, position: i++ });
      continue;
    }

    throw new ExpressionError(`unexpected character '${char}'`);
  }
  tokens.push({ type: 'eof', value: '', position: source.length });
  return tokens;
}
