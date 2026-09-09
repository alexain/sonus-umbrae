import type { LogicViewNodeState, LogicViewState } from '../language/runtime';

export type MonitorCardFactory = (id: string, titleText: string, defaultCollapsed: boolean) => HTMLElement;

type GraphItem = {
  key: string;
  kind: 'source' | 'node' | 'output';
  label: string;
  level: number;
  row: number;
  node?: LogicViewNodeState;
};

type GraphEdge = {
  from: string;
  to: string;
  inputLabel: string;
};

function compactLogicInputLabel(label: string): string {
  const trimmed = label.trim();
  let match = trimmed.match(/^every\s+(\d+(?:\.\d+)?)\s+(beat|sec|ms)(?:\s+.*)?$/i);
  if (match) return `${match[1]} ${match[2].toUpperCase()}`;
  match = trimmed.match(/^every\s+euclidean\s+(\d+)\s*\/\s*(\d+)/i);
  if (match) return `EUCL ${match[1]}/${match[2]}`;
  match = trimmed.match(/^pattern\s+\[([^\]]+)\]/i);
  if (match) {
    const body = match[1].trim().replace(/\s+/g, ' ');
    return `PAT ${body.length > 13 ? `${body.slice(0, 12)}…` : body}`;
  }
  return trimmed;
}

function appendLogicGateStubs(gate: SVGSVGElement, inputCount: number): void {
  const count = Math.max(1, inputCount);
  const top = count === 1 ? 30 : 14;
  const bottom = count === 1 ? 30 : 46;
  for (let index = 0; index < count; index += 1) {
    const y = count === 1 ? 30 : top + ((bottom - top) * index) / (count - 1);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '4');
    line.setAttribute('x2', '18');
    line.setAttribute('y1', String(y));
    line.setAttribute('y2', String(y));
    line.classList.add('logic-gate-stub');
    gate.append(line);
  }
  const out = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  out.setAttribute('x1', '70');
  out.setAttribute('x2', '84');
  out.setAttribute('y1', '30');
  out.setAttribute('y2', '30');
  out.classList.add('logic-gate-stub');
  gate.append(out);
}

function logicGatePath(operator: LogicViewNodeState['operator']): string {
  if (operator === 'and' || operator === 'nand') return 'M 18 10 L 42 10 C 68 10 68 50 42 50 L 18 50 Z';
  if (operator === 'or' || operator === 'nor' || operator === 'xor') return 'M 16 10 C 31 18 31 42 16 50 C 37 48 57 43 70 30 C 57 17 37 12 16 10 Z';
  return 'M 18 12 H 66 V 48 H 18 Z';
}

function buildGraph(view: LogicViewState): { items: GraphItem[]; edges: GraphEdge[]; columns: number; rows: number } {
  const nodes = new Map(view.nodes.map((node) => [node.name, node]));
  const levelMemo = new Map<string, number>();
  const visiting = new Set<string>();
  const nodeLevel = (name: string): number => {
    const cached = levelMemo.get(name);
    if (cached !== undefined) return cached;
    if (visiting.has(name)) return 1;
    visiting.add(name);
    const node = nodes.get(name);
    let level = 1;
    if (node) {
      for (const input of node.inputs) {
        if (nodes.has(input.label)) level = Math.max(level, nodeLevel(input.label) + 1);
      }
    }
    visiting.delete(name);
    levelMemo.set(name, level);
    return level;
  };

  const externalLabels: string[] = [];
  const seenExternal = new Set<string>();
  const edges: GraphEdge[] = [];
  for (const node of view.nodes) {
    for (const input of node.inputs) {
      const from = nodes.has(input.label) ? `node:${input.label}` : `source:${input.label}`;
      if (!nodes.has(input.label) && !seenExternal.has(input.label)) {
        seenExternal.add(input.label);
        externalLabels.push(input.label);
      }
      edges.push({ from, to: `node:${node.name}`, inputLabel: input.label });
    }
  }

  const byLevel = new Map<number, LogicViewNodeState[]>();
  let maxLevel = 1;
  for (const node of view.nodes) {
    const level = nodeLevel(node.name);
    maxLevel = Math.max(maxLevel, level);
    const list = byLevel.get(level) ?? [];
    list.push(node);
    byLevel.set(level, list);
  }

  const maxRows = Math.max(1, externalLabels.length, ...[...byLevel.values()].map((list) => list.length));
  const items: GraphItem[] = externalLabels.map((label, index) => ({
    key: `source:${label}`,
    kind: 'source',
    label,
    level: 0,
    row: index + 1,
  }));
  for (const [level, list] of [...byLevel.entries()].sort((a, b) => a[0] - b[0])) {
    const offset = Math.max(0, Math.floor((maxRows - list.length) / 2));
    list.forEach((node, index) => items.push({
      key: `node:${node.name}`,
      kind: 'node',
      label: node.name,
      level,
      row: offset + index + 1,
      node,
    }));
  }

  const outputNode = nodes.get(view.outputNode) ?? view.nodes[view.nodes.length - 1];
  if (outputNode) {
    const outputLevel = Math.max(maxLevel + 1, nodeLevel(outputNode.name) + 1);
    items.push({
      key: 'output:out',
      kind: 'output',
      label: 'OUT',
      level: outputLevel,
      row: Math.ceil(maxRows / 2),
      node: outputNode,
    });
    edges.push({ from: `node:${outputNode.name}`, to: 'output:out', inputLabel: 'OUT' });
    maxLevel = outputLevel;
  }

  return { items, edges, columns: maxLevel + 1, rows: maxRows };
}

function createGate(node: LogicViewNodeState): SVGSVGElement {
  const gate = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  gate.classList.add('logic-gate');
  gate.setAttribute('viewBox', '0 0 88 60');
  gate.dataset.operator = node.operator;
  appendLogicGateStubs(gate, node.inputs.length);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', logicGatePath(node.operator));
  path.classList.add('logic-gate-shape');
  gate.append(path);
  if (node.operator === 'xor') {
    const extra = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    extra.setAttribute('d', 'M 10 10 C 25 18 25 42 10 50');
    extra.classList.add('logic-gate-extra');
    gate.append(extra);
  }
  if (node.operator === 'nand' || node.operator === 'nor') {
    const bubble = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bubble.setAttribute('cx', '72');
    bubble.setAttribute('cy', '30');
    bubble.setAttribute('r', '5');
    bubble.classList.add('logic-gate-bubble');
    gate.append(bubble);
  }
  if (node.operator === 'divider' || node.operator === 'counter' || node.operator === 'flipflop') {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '42');
    text.setAttribute('y', '35');
    text.setAttribute('text-anchor', 'middle');
    text.classList.add('logic-gate-text');
    text.textContent = node.operator === 'divider' ? `÷${node.parameter}` : node.operator === 'counter' ? `CNT ${node.parameter}` : 'T';
    gate.append(text);
  }
  return gate;
}

function drawGraphConnections(circuit: HTMLElement, edges: readonly GraphEdge[]): void {
  const svg = circuit.querySelector<SVGSVGElement>('.logic-graph-wires');
  if (!svg) return;
  svg.replaceChildren();
  const circuitRect = circuit.getBoundingClientRect();
  if (circuitRect.width <= 0 || circuitRect.height <= 0) return;
  svg.setAttribute('viewBox', `0 0 ${circuitRect.width} ${circuitRect.height}`);
  circuit.dataset.logicGraphWidth = String(circuitRect.width);
  circuit.dataset.logicGraphHeight = String(circuitRect.height);

  for (const edge of edges) {
    const from = circuit.querySelector<HTMLElement>(`[data-logic-graph-key="${CSS.escape(edge.from)}"]`);
    const to = circuit.querySelector<HTMLElement>(`[data-logic-graph-key="${CSS.escape(edge.to)}"]`);
    if (!from || !to) continue;
    const fromRect = from.getBoundingClientRect();
    const toRect = to.getBoundingClientRect();
    const x1 = fromRect.right - circuitRect.left;
    const y1 = fromRect.top + fromRect.height / 2 - circuitRect.top;
    const x2 = toRect.left - circuitRect.left;
    const y2 = toRect.top + toRect.height / 2 - circuitRect.top;
    const bend = Math.max(24, (x2 - x1) * 0.46);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`);
    path.classList.add('logic-graph-wire');
    path.dataset.logicFrom = edge.from;
    path.dataset.logicTo = edge.to;
    path.dataset.logicInput = edge.inputLabel;
    svg.append(path);
  }
}

function scheduleGraphConnections(circuit: HTMLElement, edges: readonly GraphEdge[]): void {
  requestAnimationFrame(() => drawGraphConnections(circuit, edges));
}

export function buildLogicPanel(view: LogicViewState, createMonitorCard: MonitorCardFactory): HTMLElement {
  const card = createMonitorCard(`LOGIC:${view.name}`, `${view.name.toUpperCase()} : LOGIC`, false);
  card.classList.add('logic-monitor-card');
  const body = card.querySelector<HTMLElement>('.monitor-body');
  if (!body) return card;

  const viewport = document.createElement('div');
  viewport.className = 'logic-graph-viewport';
  const circuit = document.createElement('div');
  circuit.className = 'logic-circuit logic-graph';
  circuit.dataset.logicName = view.name;
  circuit.dataset.revision = String(view.revision);

  const graph = buildGraph(view);
  circuit.style.setProperty('--logic-graph-columns', String(graph.columns));
  circuit.style.setProperty('--logic-graph-rows', String(graph.rows));
  const wires = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  wires.classList.add('logic-graph-wires');
  wires.setAttribute('aria-hidden', 'true');
  circuit.append(wires);

  for (const item of graph.items) {
    if (item.kind === 'source') {
      const source = document.createElement('div');
      source.className = 'logic-graph-source';
      source.dataset.logicGraphKey = item.key;
      source.style.gridColumn = String(item.level + 1);
      source.style.gridRow = String(item.row);
      source.title = item.label;
      const jack = document.createElement('span');
      jack.className = 'logic-graph-terminal';
      const label = document.createElement('span');
      label.textContent = compactLogicInputLabel(item.label);
      source.append(label, jack);
      circuit.append(source);
      continue;
    }

    if (item.kind === 'output') {
      const output = document.createElement('div');
      output.className = `logic-graph-output${item.node?.outputActive ? ' active' : ''}`;
      output.dataset.logicGraphKey = item.key;
      output.style.gridColumn = String(item.level + 1);
      output.style.gridRow = String(item.row);
      const terminal = document.createElement('span');
      terminal.className = 'logic-graph-terminal';
      const label = document.createElement('span');
      label.textContent = 'OUT';
      output.append(terminal, label);
      circuit.append(output);
      continue;
    }

    const node = item.node!;
    const module = document.createElement('section');
    module.className = `logic-node-row logic-graph-node${node.outputActive ? ' active' : ''}`;
    module.dataset.logicNode = node.name;
    module.dataset.logicGraphKey = item.key;
    module.style.gridColumn = String(item.level + 1);
    module.style.gridRow = String(item.row);

    const header = document.createElement('div');
    header.className = 'logic-graph-node-header';
    const opName = document.createElement('span');
    opName.textContent = node.operator.toUpperCase();
    const nodeName = document.createElement('span');
    nodeName.textContent = node.name;
    header.append(opName, nodeName);

    const gateWrap = document.createElement('div');
    gateWrap.className = 'logic-gate-wrap';
    gateWrap.append(createGate(node));

    const state = document.createElement('span');
    state.className = 'logic-graph-node-state';
    state.textContent = node.operator === 'counter' || node.operator === 'divider' || node.operator === 'flipflop' ? String(node.stateValue) : '';

    module.append(header, gateWrap, state);
    circuit.append(module);
  }

  viewport.append(circuit);
  body.append(viewport);
  scheduleGraphConnections(circuit, graph.edges);
  return card;
}

export function updateLogicViews(views: readonly LogicViewState[], root: ParentNode = document): void {
  const states = new Map(views.map((view) => [view.name, view]));
  for (const circuit of root.querySelectorAll<HTMLElement>('.logic-circuit[data-logic-name]')) {
    const state = states.get(circuit.dataset.logicName ?? '');
    if (!state) continue;
    circuit.dataset.revision = String(state.revision);
    const nodeNames = new Set(state.nodes.map((node) => node.name));
    for (const nodeEl of circuit.querySelectorAll<HTMLElement>('.logic-node-row[data-logic-node]')) {
      const node = state.nodes.find((candidate) => candidate.name === nodeEl.dataset.logicNode);
      if (!node) continue;
      nodeEl.classList.toggle('active', node.outputActive);
      const stateEl = nodeEl.querySelector<HTMLElement>('.logic-graph-node-state');
      if (stateEl && (node.operator === 'counter' || node.operator === 'divider' || node.operator === 'flipflop')) stateEl.textContent = String(node.stateValue);
    }
    const outputNode = state.nodes.find((node) => node.name === state.outputNode);
    circuit.querySelector<HTMLElement>('.logic-graph-output')?.classList.toggle('active', Boolean(outputNode?.outputActive));
    const rect = circuit.getBoundingClientRect();
    const previousWidth = Number(circuit.dataset.logicGraphWidth ?? 0);
    const previousHeight = Number(circuit.dataset.logicGraphHeight ?? 0);
    if (rect.width > 0 && rect.height > 0 && (Math.abs(rect.width - previousWidth) > 0.5 || Math.abs(rect.height - previousHeight) > 0.5)) {
      const edges = [...circuit.querySelectorAll<SVGPathElement>('.logic-graph-wire')].map((wire) => ({
        from: wire.dataset.logicFrom ?? '',
        to: wire.dataset.logicTo ?? '',
        inputLabel: wire.dataset.logicInput ?? '',
      })).filter((edge) => edge.from && edge.to);
      drawGraphConnections(circuit, edges);
    }
    for (const wire of circuit.querySelectorAll<SVGPathElement>('.logic-graph-wire')) {
      const toName = (wire.dataset.logicTo ?? '').replace(/^node:/, '');
      const inputLabel = wire.dataset.logicInput ?? '';
      const target = state.nodes.find((node) => node.name === toName);
      const input = target?.inputs.find((candidate) => candidate.label === inputLabel);
      const internalSource = (wire.dataset.logicFrom ?? '').replace(/^node:/, '');
      const upstream = nodeNames.has(internalSource) ? state.nodes.find((node) => node.name === internalSource) : undefined;
      const isOutputWire = wire.dataset.logicTo === 'output:out';
      wire.classList.toggle('active', isOutputWire ? Boolean(outputNode?.outputActive) : Boolean(input?.active || upstream?.outputActive));
    }
  }
}
