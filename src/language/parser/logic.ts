import { LanguageError } from '../diagnostics';

export type LogicOperator = 'and' | 'or' | 'xor' | 'nand' | 'nor' | 'divider' | 'counter' | 'flipflop';

export type LogicNodeDraft = {
  name: string;
  operator: LogicOperator;
  inputs: string[];
  parameter: number;
  line: number;
};

export type LogicState = {
  name: string;
  line: number;
  indentation: number;
  view: boolean;
  nodes: Map<string, LogicNodeDraft>;
  outputNode: string | null;
  outputLine: number | null;
};

export type ResolvedLogicInput =
  | { kind: 'node'; name: string }
  | { kind: 'rhythm'; name: string; spec: unknown };

export type LogicExternalInputResolution = {
  input: ResolvedLogicInput;
  preludes?: string[];
};

export function createLogicState(name: string, line: number, indentation: number, view: boolean): LogicState {
  return { name, line, indentation, view, nodes: new Map(), outputNode: null, outputLine: null };
}

export function parseLogicStatement(logic: LogicState, raw: string, line: number): void {
  const outputMatch = raw.trim().match(/^out\s+([A-Za-z_][A-Za-z0-9_]*)$/i);
  if (outputMatch) {
    if (logic.outputNode !== null) {
      throw new LanguageError([{ line, message: `LOGIC '${logic.name}' already declares OUT '${logic.outputNode}'` }]);
    }
    logic.outputNode = outputMatch[1];
    logic.outputLine = line;
    return;
  }

  const match = raw.trim().match(/^(and|or|xor|nand|nor|divider|counter|flipflop)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\[(.*)\](?:\s+(?:by|count)\s+(\d+))?$/i);
  if (!match) throw new LanguageError([{ line, message: 'LOGIC expects <operator> <name> [inputs] [BY|COUNT n] or OUT <node>' }]);

  const operator = match[1].toLowerCase() as LogicOperator;
  const name = match[2];
  if (logic.nodes.has(name)) throw new LanguageError([{ line, message: `LOGIC '${logic.name}' already defines '${name}'` }]);

  const rawInputs = match[3].trim();
  const inputs = (rawInputs.includes(';') ? rawInputs.split(';') : rawInputs.split(','))
    .map((item) => item.trim())
    .filter(Boolean);

  if (operator === 'divider' || operator === 'counter' || operator === 'flipflop') {
    if (inputs.length !== 1) throw new LanguageError([{ line, message: `LOGIC ${operator.toUpperCase()} expects exactly one input` }]);
  } else if (inputs.length < 2) {
    throw new LanguageError([{ line, message: `LOGIC ${operator.toUpperCase()} expects at least two inputs` }]);
  }

  const parameter = match[4] ? Number(match[4]) : (operator === 'divider' || operator === 'counter' ? 2 : 0);
  if ((operator === 'divider' || operator === 'counter') && (!Number.isInteger(parameter) || parameter < 2 || parameter > 64)) {
    throw new LanguageError([{ line, message: `LOGIC ${operator.toUpperCase()} expects BY/COUNT 2..64` }]);
  }

  logic.nodes.set(name, { name, operator, inputs, parameter, line });
}

function nodeDependencies(logic: LogicState, node: LogicNodeDraft): string[] {
  return node.inputs.filter((input) => logic.nodes.has(input));
}

function validateAcyclic(logic: LogicState): string[] {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const order: string[] = [];

  const visit = (name: string, path: string[]): void => {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      const start = path.indexOf(name);
      const cycle = [...path.slice(start), name].join(' -> ');
      const node = logic.nodes.get(name)!;
      throw new LanguageError([{ line: node.line, message: `LOGIC '${logic.name}' contains a cycle: ${cycle}` }]);
    }
    visiting.add(name);
    const node = logic.nodes.get(name)!;
    for (const dependency of nodeDependencies(logic, node)) visit(dependency, [...path, name]);
    visiting.delete(name);
    visited.add(name);
    order.push(name);
  };

  for (const name of logic.nodes.keys()) visit(name, []);
  return order;
}

function validateAllNodesReachOutput(logic: LogicState, outputNode: string): void {
  const contributing = new Set<string>();
  const visit = (name: string): void => {
    if (contributing.has(name)) return;
    contributing.add(name);
    const node = logic.nodes.get(name)!;
    for (const dependency of nodeDependencies(logic, node)) visit(dependency);
  };
  visit(outputNode);

  const orphaned = [...logic.nodes.values()].filter((node) => !contributing.has(node.name));
  if (orphaned.length === 0) return;
  throw new LanguageError(orphaned.map((node) => ({
    line: node.line,
    message: `LOGIC '${logic.name}' node '${node.name}' is not connected to output '${outputNode}'`,
  })));
}

export function finalizeLogic(
  logic: LogicState,
  resolveExternal: (input: string, line: number) => LogicExternalInputResolution,
): { directives: string[]; preludes: string[]; outputNode: string } {
  if (logic.nodes.size === 0) {
    throw new LanguageError([{ line: logic.line, message: `LOGIC '${logic.name}' requires at least one operator` }]);
  }
  if (!logic.outputNode) {
    throw new LanguageError([{ line: logic.line, message: `LOGIC '${logic.name}' requires OUT <node>` }]);
  }
  if (!logic.nodes.has(logic.outputNode)) {
    throw new LanguageError([{ line: logic.outputLine ?? logic.line, message: `LOGIC '${logic.name}' output node '${logic.outputNode}' does not exist` }]);
  }

  const topologicalOrder = validateAcyclic(logic);
  validateAllNodesReachOutput(logic, logic.outputNode);

  const preludes: string[] = [];
  const directives: string[] = [];
  for (const name of topologicalOrder) {
    const node = logic.nodes.get(name)!;
    const resolved = node.inputs.map((input): ResolvedLogicInput => {
      if (logic.nodes.has(input)) return { kind: 'node', name: input };
      const external = resolveExternal(input, node.line);
      if (external.preludes) preludes.push(...external.preludes);
      return external.input;
    });
    directives.push(`__logicnode(${JSON.stringify(logic.name)},${JSON.stringify(node.name)},${JSON.stringify(node.operator)},${JSON.stringify(JSON.stringify(resolved))},${node.parameter});`);
  }
  directives.push(`__logicout(${JSON.stringify(logic.name)},${JSON.stringify(logic.outputNode)});`);
  return { directives, preludes, outputNode: logic.outputNode };
}
