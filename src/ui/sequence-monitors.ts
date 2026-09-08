import type {
  ConstellationViewState,
  DrumkitViewState,
  LifeViewState,
  LogicViewState,
  SnakeViewState,
  TuringViewState,
} from '../language/runtime';

export type MonitorCardFactory = (id: string, titleText: string, defaultCollapsed: boolean) => HTMLElement;

export function buildTuringPanel(view: TuringViewState, createMonitorCard: MonitorCardFactory): HTMLElement {
  const card = createMonitorCard(`SEQ:${view.name}`, `${view.name.toUpperCase()} : SEQ / TURING`, false);
  card.classList.add('turing-monitor-card');
  const body = card.querySelector<HTMLElement>('.monitor-body');
  if (!body) return card;

  const meta = document.createElement('div');
  meta.className = 'turing-meta';
  meta.innerHTML = `<span>LENGTH ${view.length}</span><span>CHANGE ${Number.isInteger(view.change) ? view.change : view.change.toFixed(1)}%</span>`;

  const register = document.createElement('div');
  register.className = 'turing-register';
  register.dataset.turingName = view.name;
  register.dataset.revision = String(view.revision);
  register.style.setProperty('--turing-length', String(view.length));

  for (const bit of view.bits) {
    const cell = document.createElement('span');
    cell.className = `turing-bit ${bit ? 'on' : 'off'}`;
    register.append(cell);
  }

  const readout = document.createElement('div');
  readout.className = 'turing-readout';
  const label = document.createElement('span');
  label.textContent = 'NOTE';
  const value = document.createElement('span');
  value.className = 'turing-note-value';
  value.dataset.turingName = view.name;
  value.textContent = formatFrequencyAsNote(view.currentFrequency);
  readout.append(label, value);

  body.append(meta, register, readout);
  return card;
}

export function buildLifePanel(view: LifeViewState, createMonitorCard: MonitorCardFactory): HTMLElement {
  const card = createMonitorCard(`SEQ:${view.name}`, `${view.name.toUpperCase()} : SEQ / LIFE`, false);
  card.classList.add('life-monitor-card');
  const body = card.querySelector<HTMLElement>('.monitor-body');
  if (!body) return card;

  const grid = document.createElement('div');
  grid.className = 'life-grid';
  grid.dataset.lifeName = view.name;
  grid.dataset.revision = String(view.revision);
  grid.style.setProperty('--life-size', String(view.size));
  grid.setAttribute('role', 'img');
  grid.setAttribute('aria-label', `${view.name} Life grid`);

  for (const alive of view.cells) {
    const cell = document.createElement('span');
    cell.className = `life-cell ${alive ? 'on' : 'off'}`;
    grid.append(cell);
  }

  body.append(grid);
  return card;
}

const SNAKE_CELL_GAP = 32;
const SNAKE_FIELD_PAD = 20;
const SNAKE_MIN_FIELD_WIDTH = 140;
const SNAKE_MIN_FIELD_HEIGHT = 140;

function snakeFieldGeometry(width: number, height: number): { fieldWidth: number; fieldHeight: number; originX: number; originY: number } {
  const gridWidth = Math.max(0, width - 1) * SNAKE_CELL_GAP;
  const gridHeight = Math.max(0, height - 1) * SNAKE_CELL_GAP;
  const fieldWidth = Math.max(SNAKE_MIN_FIELD_WIDTH, gridWidth + SNAKE_FIELD_PAD * 2);
  const fieldHeight = Math.max(SNAKE_MIN_FIELD_HEIGHT, gridHeight + SNAKE_FIELD_PAD * 2);
  return {
    fieldWidth,
    fieldHeight,
    originX: (fieldWidth - gridWidth) / 2,
    originY: (fieldHeight - gridHeight) / 2,
  };
}

function sizeSnakeField(field: HTMLElement, width: number, height: number): void {
  const geometry = snakeFieldGeometry(width, height);
  field.style.setProperty('--snake-field-width', `${geometry.fieldWidth}px`);
  field.style.setProperty('--snake-field-height', `${geometry.fieldHeight}px`);
}

function snakeCellPosition(cell: number, width: number, height: number): { x: number; y: number } {
  const column = cell % width;
  const row = Math.floor(cell / width);
  const geometry = snakeFieldGeometry(width, height);
  return {
    x: ((geometry.originX + column * SNAKE_CELL_GAP) / geometry.fieldWidth) * 100,
    y: ((geometry.originY + row * SNAKE_CELL_GAP) / geometry.fieldHeight) * 100,
  };
}

function positionSnakeRunner(element: HTMLElement, cell: number, width: number, height: number): void {
  const point = snakeCellPosition(cell, width, height);
  element.style.left = `${point.x}%`;
  element.style.top = `${point.y}%`;
}

function updateSnakeRunnerConnector(
  path: SVGPolylineElement,
  currentCell: number | null,
  recent: number[],
  width: number,
  height: number,
): void {
  const cells = [recent[2], recent[1], currentCell]
    .filter((cell): cell is number => cell !== undefined && cell !== null);
  const unique: number[] = [];
  for (const cell of cells) {
    if (unique.length === 0 || unique[unique.length - 1] !== cell) unique.push(cell);
  }
  if (unique.length < 2) {
    path.setAttribute('points', '');
    return;
  }
  path.setAttribute('points', unique.map((cell) => {
    const point = snakeCellPosition(cell, width, height);
    return `${point.x},${point.y}`;
  }).join(' '));
}

export function buildSnakePanel(view: SnakeViewState, createMonitorCard: MonitorCardFactory): HTMLElement {
  const card = createMonitorCard(`SEQ:${view.name}`, `${view.name.toUpperCase()} : SEQ / SNAKE`, false);
  card.classList.add('snake-monitor-card');
  const body = card.querySelector<HTMLElement>('.monitor-body');
  if (!body) return card;

  const field = document.createElement('div');
  field.className = 'snake-field';
  field.dataset.snakeName = view.name;
  field.dataset.revision = String(view.revision);
  field.style.setProperty('--snake-cols', String(view.width));
  field.style.setProperty('--snake-rows', String(view.height));
  sizeSnakeField(field, view.width, view.height);
  field.setAttribute('role', 'img');
  field.setAttribute('aria-label', `${view.name} Snake ${view.width} by ${view.height} matrix`);

  const cells = document.createElement('div');
  cells.className = 'snake-cells';
  for (let index = 0; index < view.width * view.height; index += 1) {
    const cell = document.createElement('span');
    cell.className = 'snake-cell';
    positionSnakeRunner(cell, index, view.width, view.height);
    cells.append(cell);
  }
  field.append(cells);

  const runner = document.createElement('div');
  runner.className = 'snake-runner-layer';

  const connector = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  connector.classList.add('snake-runner-connector');
  connector.setAttribute('viewBox', '0 0 100 100');
  connector.setAttribute('preserveAspectRatio', 'none');
  const connectorPath = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  connectorPath.classList.add('snake-runner-connector-path');
  connector.append(connectorPath);
  runner.append(connector);

  const recent = view.history.slice(-3).reverse();
  for (let age = 2; age >= 1; age -= 1) {
    const tail = document.createElement('span');
    tail.className = `snake-runner tail tail-${age}`;
    tail.dataset.tailAge = String(age);
    const cell = recent[age];
    if (cell !== undefined) {
      positionSnakeRunner(tail, cell, view.width, view.height);
    } else {
      tail.classList.add('hidden');
    }
    runner.append(tail);
  }
  const head = document.createElement('span');
  head.className = 'snake-runner head';
  head.dataset.snakeHead = 'true';
  if (view.currentCell !== null) {
    positionSnakeRunner(head, view.currentCell, view.width, view.height);
  } else {
    head.classList.add('hidden');
  }
  runner.append(head);
  updateSnakeRunnerConnector(connectorPath, view.currentCell, recent, view.width, view.height);
  field.append(runner);

  body.append(field);
  return card;
}

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

function appendLogicGateStubs(
  gate: SVGSVGElement,
  inputCount: number,
): void {
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

function logicGatePath(operator: LogicViewState['nodes'][number]['operator']): string {
  if (operator === 'and' || operator === 'nand') return 'M 18 10 L 42 10 C 68 10 68 50 42 50 L 18 50 Z';
  if (operator === 'or' || operator === 'nor' || operator === 'xor') return 'M 16 10 C 31 18 31 42 16 50 C 37 48 57 43 70 30 C 57 17 37 12 16 10 Z';
  return 'M 18 12 H 66 V 48 H 18 Z';
}

export function buildLogicPanel(view: LogicViewState, createMonitorCard: MonitorCardFactory): HTMLElement {
  const card = createMonitorCard(`LOGIC:${view.name}`, `${view.name.toUpperCase()} : LOGIC`, false);
  card.classList.add('logic-monitor-card');
  const body = card.querySelector<HTMLElement>('.monitor-body');
  if (!body) return card;

  const circuit = document.createElement('div');
  circuit.className = 'logic-circuit logic-hardware-rack';
  circuit.dataset.logicName = view.name;
  circuit.dataset.revision = String(view.revision);

  for (const node of view.nodes) {
    const module = document.createElement('section');
    module.className = 'logic-node-row logic-module';
    module.dataset.logicNode = node.name;

    const face = document.createElement('div');
    face.className = 'logic-module-face';

    const header = document.createElement('div');
    header.className = 'logic-module-header';
    const opName = document.createElement('span');
    opName.className = 'logic-module-op';
    opName.textContent = node.operator.toUpperCase();
    const nodeName = document.createElement('span');
    nodeName.className = 'logic-module-name';
    nodeName.textContent = node.name;
    header.append(opName, nodeName);

    const core = document.createElement('div');
    core.className = 'logic-module-core';

    const inputs = document.createElement('div');
    inputs.className = 'logic-inputs logic-jack-bank';
    for (const input of node.inputs) {
      const lane = document.createElement('div');
      lane.className = `logic-input-lane logic-jack-row${input.active ? ' active' : ''}`;
      lane.dataset.logicInput = input.label;

      const label = document.createElement('span');
      label.className = 'logic-port-label';
      label.textContent = compactLogicInputLabel(input.label);
      label.title = input.label;
      if ((label.textContent?.length ?? 0) > 12) label.classList.add('long');

      const jack = document.createElement('span');
      jack.className = 'logic-jack logic-jack-in';
      const led = document.createElement('span');
      led.className = 'logic-jack-led';
      jack.append(led);

      lane.append(label, jack);
      inputs.append(lane);
    }

    const gateWrap = document.createElement('div');
    gateWrap.className = 'logic-gate-wrap';
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
    gateWrap.append(gate);

    const output = document.createElement('div');
    output.className = `logic-output-lane logic-jack-row${node.outputActive ? ' active' : ''}`;
    const outJack = document.createElement('span');
    outJack.className = 'logic-jack logic-jack-out';
    const outLed = document.createElement('span');
    outLed.className = 'logic-jack-led';
    outJack.append(outLed);
    const outLabel = document.createElement('span');
    outLabel.className = 'logic-port-label';
    outLabel.textContent = 'OUT';
    output.append(outJack, outLabel);

    core.append(inputs, gateWrap, output);
    face.append(header, core);
    module.append(face);
    circuit.append(module);
  }

  body.append(circuit);
  return card;
}

export function updateLogicViews(views: readonly LogicViewState[], root: ParentNode = document): void {
  const states = new Map(views.map((view) => [view.name, view]));
  for (const circuit of root.querySelectorAll<HTMLElement>('.logic-circuit[data-logic-name]')) {
    const state = states.get(circuit.dataset.logicName ?? '');
    if (!state) continue;
    circuit.dataset.revision = String(state.revision);
    for (const nodeEl of circuit.querySelectorAll<HTMLElement>('.logic-node-row[data-logic-node]')) {
      const node = state.nodes.find((candidate) => candidate.name === nodeEl.dataset.logicNode);
      if (!node) continue;
      nodeEl.querySelector<HTMLElement>('.logic-output-lane')?.classList.toggle('active', node.outputActive);
      for (const lane of nodeEl.querySelectorAll<HTMLElement>('.logic-input-lane[data-logic-input]')) {
        const input = node.inputs.find((candidate) => candidate.label === lane.dataset.logicInput);
        lane.classList.toggle('active', Boolean(input?.active));
      }
    }
  }
}

function constellationMidi(frequency: number): number {
  return 69 + 12 * Math.log2(Math.max(0.0001, frequency) / 440);
}

function constellationNoteLabel(frequency: number): string {
  const midi = constellationMidi(frequency);
  const nearest = Math.round(midi);
  const pitchClasses = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const pitchClass = ((nearest % 12) + 12) % 12;
  const octave = Math.floor(nearest / 12) - 1;
  const cents = Math.round((midi - nearest) * 100);
  return `${pitchClasses[pitchClass]}${octave}${Math.abs(cents) >= 8 ? `${cents > 0 ? '+' : ''}${cents}c` : ''}`;
}

function constellationHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function constellationLayout(view: ConstellationViewState): Map<number, { x: number; y: number }> {
  const unique = [...new Set(view.frequencies.map((item) => Number(item.toFixed(6))))].sort((a, b) => a - b);
  const count = Math.max(1, unique.length);
  const stepwise = Math.max(0, Math.min(100, view.stepwise));
  const leap = Math.max(0, Math.min(100, view.leap));
  const totalMotion = Math.max(1, stepwise + leap);
  const locality = stepwise / totalMotion;
  const dispersion = leap / totalMotion;

  // High memory keeps a constellation generation alive longer. When a new
  // generation appears the stars drift toward another deterministic layout.
  const generationSpan = 3 + Math.round((Math.max(0, Math.min(100, view.memory)) / 100) * 13);
  const generation = Math.floor(Math.max(0, view.revision - 1) / generationSpan);

  const points = unique.map((key, index) => {
    const normalizedIndex = count <= 1 ? 0.5 : index / (count - 1);
    const seed = `${view.name}:${key}:${generation}`;
    const randomX = constellationHash(`${seed}:x`);
    const randomY = constellationHash(`${seed}:y`);

    // Stepwise keeps a loose melodic neighbourhood; leap releases the stars
    // further into the field. The random component keeps the result celestial
    // instead of turning it into a hidden grid.
    const angle = normalizedIndex * Math.PI * 1.65 - Math.PI * 0.82;
    const radius = 34 + normalizedIndex * 34;
    const spineX = 160 + Math.cos(angle) * radius;
    const spineY = 72 + Math.sin(angle) * radius * 0.62;
    const randomXPos = 18 + randomX * 284;
    const randomYPos = 14 + randomY * 117;
    const randomBlend = 0.38 + dispersion * 0.62;
    const orderedBlend = locality * 0.52;
    const normalizer = Math.max(0.001, randomBlend + orderedBlend);

    return {
      key,
      x: (randomXPos * randomBlend + spineX * orderedBlend) / normalizer,
      y: (randomYPos * randomBlend + spineY * orderedBlend) / normalizer,
    };
  });

  const fieldLeft = 18;
  const fieldRight = 302;
  const fieldTop = 16;
  const fieldBottom = 129;

  if (points.length <= 1) {
    return new Map(points.map((point) => [point.key, { x: 160, y: 72 }]));
  }

  // First stretch the cloud to the useful field so the constellation always
  // occupies the drawing instead of collapsing around its centre.
  const rawMinX = Math.min(...points.map((point) => point.x));
  const rawMaxX = Math.max(...points.map((point) => point.x));
  const rawMinY = Math.min(...points.map((point) => point.y));
  const rawMaxY = Math.max(...points.map((point) => point.y));
  const rawSpanX = Math.max(1, rawMaxX - rawMinX);
  const rawSpanY = Math.max(1, rawMaxY - rawMinY);
  for (const point of points) {
    point.x = fieldLeft + ((point.x - rawMinX) / rawSpanX) * (fieldRight - fieldLeft);
    point.y = fieldTop + ((point.y - rawMinY) / rawSpanY) * (fieldBottom - fieldTop);
  }

  // Keep the four extreme stars anchored near the useful borders while the
  // remaining points repel each other. This gives labels breathing room but
  // preserves the full-field silhouette of the constellation.
  const leftAnchor = points.reduce((best, point) => point.x < best.x ? point : best);
  const rightAnchor = points.reduce((best, point) => point.x > best.x ? point : best);
  const topAnchor = points.reduce((best, point) => point.y < best.y ? point : best);
  const bottomAnchor = points.reduce((best, point) => point.y > best.y ? point : best);
  const minDistance = 30 + dispersion * 7;

  for (let iteration = 0; iteration < 18; iteration += 1) {
    for (let a = 0; a < points.length; a += 1) {
      for (let b = a + 1; b < points.length; b += 1) {
        const first = points[a];
        const second = points[b];
        let dx = second.x - first.x;
        let dy = second.y - first.y;
        let distance = Math.hypot(dx, dy);
        if (distance >= minDistance) continue;
        if (distance < 0.001) {
          const angle = constellationHash(`${view.name}:${first.key}:${second.key}:separate`) * Math.PI * 2;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }
        const push = (minDistance - distance) * 0.48;
        const nx = dx / distance;
        const ny = dy / distance;
        if (first !== leftAnchor && first !== rightAnchor) first.x -= nx * push;
        if (first !== topAnchor && first !== bottomAnchor) first.y -= ny * push;
        if (second !== leftAnchor && second !== rightAnchor) second.x += nx * push;
        if (second !== topAnchor && second !== bottomAnchor) second.y += ny * push;
      }
    }

    for (const point of points) {
      point.x = Math.max(fieldLeft, Math.min(fieldRight, point.x));
      point.y = Math.max(fieldTop, Math.min(fieldBottom, point.y));
    }
    leftAnchor.x = fieldLeft;
    rightAnchor.x = fieldRight;
    topAnchor.y = fieldTop;
    bottomAnchor.y = fieldBottom;
  }

  return new Map(points.map((point) => [point.key, { x: point.x, y: point.y }]));
}

function constellationPointPosition(
  frequency: number,
  layout: ReadonlyMap<number, { x: number; y: number }>,
): { x: number; y: number } {
  return layout.get(Number(frequency.toFixed(6))) ?? { x: 160, y: 72 };
}

function renderConstellationField(svg: SVGSVGElement, view: ConstellationViewState): void {
  const ns = 'http://www.w3.org/2000/svg';
  svg.replaceChildren();

  const unique = [...new Set(view.frequencies.map((frequency) => Number(frequency.toFixed(6))))];
  const layout = constellationLayout(view);

  // One quiet line only: the most recent motion. Older motion survives as a
  // fading trail of filled stars instead of accumulating geometry.
  const path = view.history.slice(-2);
  if (path.length === 2 && Math.abs(path[0] - path[1]) > 0.000001) {
    const from = constellationPointPosition(path[0], layout);
    const to = constellationPointPosition(path[1], layout);
    const segment = document.createElementNS(ns, 'line');
    segment.setAttribute('x1', String(from.x)); segment.setAttribute('y1', String(from.y));
    segment.setAttribute('x2', String(to.x)); segment.setAttribute('y2', String(to.y));
    segment.setAttribute('class', 'constellation-trail');
    svg.append(segment);
  }

  // Keep a short luminous memory of visited nodes. Repeated visits naturally
  // reinforce the same star instead of drawing zero-length lines.
  const recent = view.history.slice(-7, -1);
  recent.forEach((frequency, index) => {
    const point = constellationPointPosition(frequency, layout);
    const age = recent.length - 1 - index;
    const ghost = document.createElementNS(ns, 'circle');
    ghost.setAttribute('cx', String(point.x)); ghost.setAttribute('cy', String(point.y));
    ghost.setAttribute('r', String(Math.max(1.7, 3.8 - age * 0.36)));
    ghost.setAttribute('class', 'constellation-ghost');
    ghost.setAttribute('opacity', String(Math.max(0.05, 0.42 - age * 0.065)));
    svg.append(ghost);
  });

  for (const frequency of unique) {
    const point = constellationPointPosition(frequency, layout);
    const node = document.createElementNS(ns, 'circle');
    node.setAttribute('cx', String(point.x)); node.setAttribute('cy', String(point.y));
    node.setAttribute('r', '3.1');
    node.setAttribute('class', 'constellation-node');
    svg.append(node);

    const label = document.createElementNS(ns, 'text');
    const labelRight = point.x < 248;
    label.setAttribute('x', String(point.x + (labelRight ? 6 : -6)));
    label.setAttribute('y', String(point.y - 5));
    label.setAttribute('text-anchor', labelRight ? 'start' : 'end');
    label.setAttribute('class', 'constellation-note-label');
    label.textContent = constellationNoteLabel(frequency);
    svg.append(label);
  }

  if (view.currentFrequency !== null) {
    const point = constellationPointPosition(view.currentFrequency, layout);
    const halo = document.createElementNS(ns, 'circle');
    halo.setAttribute('cx', String(point.x)); halo.setAttribute('cy', String(point.y));
    halo.setAttribute('r', '8'); halo.setAttribute('class', 'constellation-current-halo');
    const current = document.createElementNS(ns, 'circle');
    current.setAttribute('cx', String(point.x)); current.setAttribute('cy', String(point.y));
    current.setAttribute('r', '5'); current.setAttribute('class', 'constellation-current');
    svg.append(halo, current);
  }
}

export function buildConstellationPanel(view: ConstellationViewState, createMonitorCard: MonitorCardFactory): HTMLElement {
  const card = createMonitorCard(`SEQ:${view.name}`, `${view.name.toUpperCase()} : SEQ / CONSTELLATION`, false);
  card.classList.add('constellation-monitor-card');
  const body = card.querySelector<HTMLElement>('.monitor-body');
  if (!body) return card;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('constellation-field');
  svg.dataset.constellationName = view.name;
  svg.dataset.revision = String(view.revision);
  svg.setAttribute('viewBox', '0 0 320 145');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${view.name} constellation melody field`);
  renderConstellationField(svg, view);
  body.append(svg);
  return card;
}

export function buildDrumkitPanel(view: DrumkitViewState, createMonitorCard: MonitorCardFactory): HTMLElement {
  const card = createMonitorCard(`DRUMKIT:${view.name}`, `${view.name.toUpperCase()} : DRUMKIT`, false);
  card.classList.add('drumkit-monitor-card');
  const body = card.querySelector<HTMLElement>('.monitor-body');
  if (!body) return card;

  const grid = document.createElement('div');
  grid.className = 'drumkit-pattern';
  grid.dataset.drumkitName = view.name;
  for (const lane of view.lanes) {
    const row = document.createElement('div');
    row.className = 'drumkit-lane';
    row.dataset.drumkitLane = lane.alias;

    const label = document.createElement('span');
    label.className = 'drumkit-lane-label';
    label.textContent = lane.alias.toUpperCase();

    const steps = document.createElement('span');
    steps.className = 'drumkit-lane-steps';
    steps.style.setProperty('--drumkit-steps', String(lane.steps));
    lane.hits.forEach((hit, index) => {
      const cell = document.createElement('span');
      cell.className = `drumkit-step ${hit ? 'hit' : 'empty'}${index === lane.cursor ? ' cursor' : ''}`;
      cell.dataset.step = String(index);
      cell.textContent = hit ? '◆' : '·';
      steps.append(cell);
    });

    const page = document.createElement('span');
    page.className = 'drumkit-lane-page';
    page.textContent = lane.pageCount > 1 ? `${lane.page + 1}/${lane.pageCount}` : '';

    row.append(label, steps, page);
    grid.append(row);
  }

  if (view.lanes.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'monitor-empty';
    empty.textContent = 'NO ACTIVE LANES';
    grid.append(empty);
  }

  body.append(grid);
  return card;
}

function formatFrequencyAsNote(frequency: number): string {
  if (!Number.isFinite(frequency) || frequency <= 0) return '--';
  const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const name = names[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

export function updateTuringViews(views: readonly TuringViewState[]): void {
  const states = new Map(views.map((view) => [view.name, view]));
  for (const register of document.querySelectorAll<HTMLElement>('.turing-register[data-turing-name]')) {
    const name = register.dataset.turingName;
    if (!name) continue;
    const state = states.get(name);
    if (!state) continue;
    const revision = Number(register.dataset.revision ?? '-1');
    if (revision !== state.revision || register.children.length !== state.bits.length) {
      register.dataset.revision = String(state.revision);
      register.style.setProperty('--turing-length', String(state.length));
      register.replaceChildren(...state.bits.map((bit) => {
        const cell = document.createElement('span');
        cell.className = `turing-bit ${bit ? 'on' : 'off'} turing-bit-shift`;
        return cell;
      }));
    }
  }
  for (const value of document.querySelectorAll<HTMLElement>('.turing-note-value[data-turing-name]')) {
    const name = value.dataset.turingName;
    if (!name) continue;
    const state = states.get(name);
    if (state) value.textContent = formatFrequencyAsNote(state.currentFrequency);
  }
}

export function updateLifeViews(views: readonly LifeViewState[]): void {
  const states = new Map(views.map((view) => [view.name, view]));
  for (const grid of document.querySelectorAll<HTMLElement>('.life-grid[data-life-name]')) {
    const name = grid.dataset.lifeName;
    if (!name) continue;
    const state = states.get(name);
    if (!state) continue;
    const revision = Number(grid.dataset.revision ?? '-1');
    if (revision === state.revision && grid.children.length === state.cells.length) continue;

    grid.dataset.revision = String(state.revision);
    grid.style.setProperty('--life-size', String(state.size));
    grid.replaceChildren(...state.cells.map((alive) => {
      const cell = document.createElement('span');
      cell.className = `life-cell ${alive ? 'on' : 'off'} life-cell-change`;
      return cell;
    }));
  }
}

export function updateConstellationViews(views: readonly ConstellationViewState[]): void {
  const states = new Map(views.map((view) => [view.name, view]));
  for (const svg of document.querySelectorAll<SVGSVGElement>('.constellation-field[data-constellation-name]')) {
    const name = svg.dataset.constellationName;
    if (!name) continue;
    const state = states.get(name);
    if (!state) continue;
    const revision = Number(svg.dataset.revision ?? '-1');
    if (revision === state.revision) continue;
    svg.dataset.revision = String(state.revision);
    renderConstellationField(svg, state);
  }
}

export function updateSnakeViews(views: readonly SnakeViewState[]): void {
  const states = new Map(views.map((view) => [view.name, view]));
  for (const field of document.querySelectorAll<HTMLElement>('.snake-field[data-snake-name]')) {
    const name = field.dataset.snakeName;
    if (!name) continue;
    const state = states.get(name);
    if (!state) continue;
    const revision = Number(field.dataset.revision ?? '-1');
    if (revision === state.revision) continue;

    field.dataset.revision = String(state.revision);
    field.style.setProperty('--snake-cols', String(state.width));
    field.style.setProperty('--snake-rows', String(state.height));
    sizeSnakeField(field, state.width, state.height);

    const cells = field.querySelector<HTMLElement>('.snake-cells');
    const expectedCells = state.width * state.height;
    if (cells) {
      if (cells.childElementCount !== expectedCells) {
        cells.replaceChildren(...Array.from({ length: expectedCells }, () => {
          const cell = document.createElement('span');
          cell.className = 'snake-cell';
          return cell;
        }));
      }
      Array.from(cells.children).forEach((child, index) => {
        if (child instanceof HTMLElement) positionSnakeRunner(child, index, state.width, state.height);
      });
    }

    const recent = state.history.slice(-3).reverse();
    const connectorPath = field.querySelector<SVGPolylineElement>('.snake-runner-connector-path');
    if (connectorPath) updateSnakeRunnerConnector(connectorPath, state.currentCell, recent, state.width, state.height);

    const head = field.querySelector<HTMLElement>('.snake-runner.head');
    if (head) {
      if (state.currentCell !== null) {
        head.classList.remove('hidden');
        positionSnakeRunner(head, state.currentCell, state.width, state.height);
      } else {
        head.classList.add('hidden');
      }
    }

    for (let age = 1; age <= 2; age += 1) {
      const tail = field.querySelector<HTMLElement>(`.snake-runner.tail-${age}`);
      if (!tail) continue;
      const cell = recent[age];
      if (cell === undefined) {
        tail.classList.add('hidden');
      } else {
        tail.classList.remove('hidden');
        positionSnakeRunner(tail, cell, state.width, state.height);
      }
    }
  }
}

export function updateDrumkitViews(views: readonly DrumkitViewState[], now = performance.now()): void {
  const states = new Map(views.map((view) => [view.name, view]));
  for (const pattern of document.querySelectorAll<HTMLElement>('.drumkit-pattern[data-drumkit-name]')) {
    const name = pattern.dataset.drumkitName;
    if (!name) continue;
    const state = states.get(name);
    if (!state) continue;
    for (const lane of state.lanes) {
      const row = [...pattern.querySelectorAll<HTMLElement>('.drumkit-lane')]
        .find((candidate) => candidate.dataset.drumkitLane === lane.alias);
      if (!row) continue;
      const steps = row.querySelector<HTMLElement>('.drumkit-lane-steps');
      if (!steps) continue;
      steps.style.setProperty('--drumkit-steps', String(lane.steps));
      let cells = [...steps.querySelectorAll<HTMLElement>('.drumkit-step')];
      if (cells.length !== lane.hits.length) {
        steps.replaceChildren(...lane.hits.map((hit, index) => {
          const cell = document.createElement('span');
          cell.className = `drumkit-step ${hit ? 'hit' : 'empty'}`;
          cell.dataset.step = String(index);
          cell.textContent = hit ? '◆' : '·';
          return cell;
        }));
        cells = [...steps.querySelectorAll<HTMLElement>('.drumkit-step')];
      }
      cells.forEach((cell, index) => {
        cell.classList.toggle('hit', lane.hits[index]);
        cell.classList.toggle('empty', !lane.hits[index]);
        cell.classList.toggle('cursor', index === lane.cursor);
        cell.classList.toggle('triggered', lane.lastTriggeredStep === index && lane.lastTriggeredAt !== null && now - lane.lastTriggeredAt < 130);
        cell.textContent = lane.hits[index] ? '◆' : '·';
      });
      const page = row.querySelector<HTMLElement>('.drumkit-lane-page');
      if (page) page.textContent = lane.pageCount > 1 ? `${lane.page + 1}/${lane.pageCount}` : '';
    }
  }
}
