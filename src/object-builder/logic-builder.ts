import { TimingEditor, timingStateFromValue, type TimingEditorState } from './timing-editor';

export type LogicOperator = 'and' | 'or' | 'xor' | 'nand' | 'nor' | 'divider' | 'counter' | 'flipflop';

type LogicNode = {
  name: string;
  operator: LogicOperator;
  inputs: string[];
  param: number;
};

type LogicGraphAnalysis = {
  outputNode: string | null;
  sinks: string[];
  cycle: string[] | null;
};

export class LogicBuilderPanel {
  private nodes: LogicNode[] = [];
  private list!: HTMLElement;
  private modal: HTMLElement | null = null;

  constructor(
    private readonly form: HTMLElement,
    private readonly editor: HTMLTextAreaElement,
    private readonly onChange: () => void,
    private readonly initialName = 'myLogic',
  ) {}

  mount(): void {
    this.form.replaceChildren();
    const title = document.createElement('h2');
    title.textContent = 'LOGIC';
    this.form.append(title);

    this.form.append(this.row('Name', this.textInput('name', this.initialName)));
    const view = document.createElement('input');
    view.type = 'checkbox'; view.name = 'view';
    this.form.append(this.row('View', view));

    const section = document.createElement('section');
    section.className = 'object-builder-section object-builder-logic-section';
    const heading = document.createElement('h3');
    heading.textContent = 'LOGIC GRAPH';
    this.list = document.createElement('div');
    this.list.className = 'object-builder-logic-list';
    const add = document.createElement('button');
    add.type = 'button'; add.className = 'object-builder-button object-builder-logic-add'; add.textContent = '+ ADD LOGIC NODE';
    add.addEventListener('click', () => this.openOperatorModal());
    section.append(heading, this.list, add);
    this.form.append(section);

    this.form.addEventListener('input', () => this.onChange());
    this.form.addEventListener('change', () => this.onChange());
    this.renderList();
  }

  closeSecondaryModal(): void {
    this.modal?.remove();
    this.modal = null;
  }

  validate(): string | null {
    const name = (this.form.querySelector<HTMLInputElement>('input[name=name]')?.value ?? '').trim();
    if (!name) return 'Name is required.';
    if (this.nodes.length === 0) return 'Add at least one logic node.';
    const graph = this.analyzeGraph();
    if (graph.cycle) return `Logic graph contains a cycle: ${graph.cycle.join(' -> ')}`;
    if (graph.sinks.length === 0) return 'Logic graph has no output node.';
    if (graph.sinks.length > 1) return `Logic graph has ${graph.sinks.length} disconnected output branches: ${graph.sinks.join(', ')}. Connect them before adding LOGIC.`;
    return null;
  }

  generateCode(): string {
    const name = (this.form.querySelector<HTMLInputElement>('input[name=name]')?.value ?? '').trim() || this.initialName;
    const view = this.form.querySelector<HTMLInputElement>('input[name=view]')?.checked ? ' with view' : '';
    const lines = [`LOGIC ${name}${view}:`];
    for (const node of this.nodes) {
      let line = `    ${node.operator} ${node.name} [${node.inputs.join(', ')}]`;
      if (node.operator === 'divider') line += ` by ${node.param}`;
      else if (node.operator === 'counter') line += ` count ${node.param}`;
      lines.push(line);
    }
    const outputNode = this.analyzeGraph().outputNode;
    if (outputNode) lines.push(`    out ${outputNode}`);
    return lines.join('\n');
  }

  previewDescription(): string {
    if (this.nodes.length === 0) return 'NO LOGIC NODES';
    const graph = this.analyzeGraph();
    const output = graph.outputNode ? `OUT ${graph.outputNode}` : graph.cycle ? 'INVALID CYCLE' : `${graph.sinks.length} OPEN BRANCHES`;
    return `${output}\n\n${this.nodes.map((node) => `${node.operator.toUpperCase()} ${node.name}\n← ${node.inputs.join(', ')}`).join('\n\n')}`;
  }

  private renderList(): void {
    this.list.replaceChildren();
    if (this.nodes.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'object-builder-secondary-hint';
      empty.textContent = 'Add nodes freely, then connect every branch into one final output.';
      this.list.append(empty);
      return;
    }

    const analysis = this.analyzeGraph();
    const nodeNames = new Set(this.nodes.map((node) => node.name));
    const externalSources = [...new Set(
      this.nodes.flatMap((node) => node.inputs).filter((input) => !nodeNames.has(input)),
    )];

    const levels = new Map<string, number>();
    const levelOf = (name: string, visiting = new Set<string>()): number => {
      const cached = levels.get(name);
      if (cached != null) return cached;
      if (visiting.has(name)) return 1;
      const node = this.nodes.find((candidate) => candidate.name === name);
      if (!node) return 0;
      const next = new Set(visiting);
      next.add(name);
      const dependencies = node.inputs.filter((input) => nodeNames.has(input));
      const level = dependencies.length
        ? Math.max(...dependencies.map((input) => levelOf(input, next))) + 1
        : 1;
      levels.set(name, level);
      return level;
    };
    for (const node of this.nodes) levelOf(node.name);
    const maxLevel = Math.max(1, ...levels.values());

    const graph = document.createElement('div');
    graph.className = 'object-builder-logic-graph object-builder-logic-canvas';
    graph.style.setProperty('--logic-columns', String(maxLevel + 2));

    const wires = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    wires.classList.add('object-builder-logic-wires');
    graph.append(wires);

    const elementByKey = new Map<string, HTMLElement>();
    const place = (element: HTMLElement, column: number, row: number): void => {
      element.style.gridColumn = String(column);
      element.style.gridRow = String(row);
    };

    externalSources.forEach((source, index) => {
      const sourceNode = document.createElement('div');
      sourceNode.className = 'object-builder-logic-source';
      sourceNode.dataset.graphKey = `source:${source}`;
      const label = document.createElement('span');
      label.textContent = source;
      const socket = document.createElement('i');
      sourceNode.append(label, socket);
      place(sourceNode, 1, index + 1);
      graph.append(sourceNode);
      elementByKey.set(`source:${source}`, sourceNode);
    });

    const rowsByLevel = new Map<number, number>();
    this.nodes.forEach((node, index) => {
      const level = levels.get(node.name) ?? 1;
      const row = (rowsByLevel.get(level) ?? 0) + 1;
      rowsByLevel.set(level, row);

      const card = document.createElement('div');
      card.className = 'object-builder-logic-card object-builder-logic-node';
      card.dataset.graphKey = `node:${node.name}`;
      if (analysis.outputNode === node.name) card.classList.add('output');
      if (analysis.sinks.includes(node.name) && analysis.sinks.length > 1) card.classList.add('open-branch');
      place(card, level + 1, row);

      const inputSockets = document.createElement('div');
      inputSockets.className = 'object-builder-logic-input-sockets';
      node.inputs.forEach((_, inputIndex) => {
        const socket = document.createElement('i');
        socket.dataset.inputIndex = String(inputIndex);
        inputSockets.append(socket);
      });

      const text = document.createElement('div');
      const label = document.createElement('strong');
      label.textContent = node.operator.toUpperCase();
      const name = document.createElement('span');
      name.className = 'object-builder-logic-node-name';
      name.textContent = node.name;
      const suffix = node.operator === 'divider'
        ? `BY ${node.param}`
        : node.operator === 'counter'
          ? `COUNT ${node.param}`
          : '';
      const param = document.createElement('small');
      param.textContent = suffix;
      text.append(label, name);
      if (suffix) text.append(param);

      const outputSocket = document.createElement('i');
      outputSocket.className = 'object-builder-logic-output-socket';

      const actions = document.createElement('div');
      actions.className = 'object-builder-logic-node-actions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'EDIT';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      const referenced = this.nodes.some((candidate, candidateIndex) =>
        candidateIndex !== index && candidate.inputs.includes(node.name),
      );
      remove.disabled = referenced;
      if (referenced) remove.title = 'This node is used by another logic node.';
      edit.addEventListener('click', () => this.openOperatorModal(index));
      remove.addEventListener('click', () => {
        this.nodes.splice(index, 1);
        this.renderList();
        this.onChange();
      });
      actions.append(edit, remove);

      card.append(inputSockets, text, outputSocket, actions);
      graph.append(card);
      elementByKey.set(`node:${node.name}`, card);
    });

    const output = document.createElement('div');
    output.className = 'object-builder-logic-out-terminal';
    const outputSocket = document.createElement('i');
    const outputLabel = document.createElement('span');
    outputLabel.textContent = 'OUT';
    output.append(outputSocket, outputLabel);
    place(output, maxLevel + 2, 1);
    if (!analysis.outputNode) output.classList.add('invalid');
    graph.append(output);
    elementByKey.set('out', output);

    const status = document.createElement('div');
    status.className = 'object-builder-logic-status';
    status.style.gridColumn = `1 / ${maxLevel + 3}`;
    if (analysis.cycle) {
      status.classList.add('invalid');
      status.textContent = `CYCLE  ${analysis.cycle.join(' -> ')}`;
    } else if (analysis.outputNode) {
      status.classList.add('valid');
      status.textContent = `OUT  ${analysis.outputNode}`;
    } else {
      status.classList.add('invalid');
      status.textContent = `${analysis.sinks.length} OPEN BRANCHES  ${analysis.sinks.join(' · ')}`;
    }
    graph.append(status);
    this.list.append(graph);

    const drawWires = (): void => {
      if (!graph.isConnected) return;
      const graphRect = graph.getBoundingClientRect();
      if (graphRect.width <= 0 || graphRect.height <= 0) return;
      wires.setAttribute('viewBox', `0 0 ${graphRect.width} ${graphRect.height}`);
      wires.replaceChildren();

      const point = (element: Element, side: 'left' | 'right') => {
        const rect = element.getBoundingClientRect();
        return {
          x: (side === 'left' ? rect.left : rect.right) - graphRect.left,
          y: rect.top + rect.height / 2 - graphRect.top,
        };
      };
      const addWire = (from: { x: number; y: number }, to: { x: number; y: number }, className = ''): void => {
        const curve = Math.max(28, Math.abs(to.x - from.x) * .45);
        const wire = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        wire.setAttribute('d', `M ${from.x} ${from.y} C ${from.x + curve} ${from.y}, ${to.x - curve} ${to.y}, ${to.x} ${to.y}`);
        if (className) wire.setAttribute('class', className);
        wires.append(wire);
      };

      for (const node of this.nodes) {
        const target = elementByKey.get(`node:${node.name}`);
        if (!target) continue;
        const sockets = target.querySelectorAll<HTMLElement>('.object-builder-logic-input-sockets i');
        node.inputs.forEach((input, inputIndex) => {
          const source = elementByKey.get(nodeNames.has(input) ? `node:${input}` : `source:${input}`);
          const socket = sockets[inputIndex];
          if (source && socket) addWire(point(source, 'right'), point(socket, 'left'));
        });
      }

      if (analysis.outputNode) {
        const source = elementByKey.get(`node:${analysis.outputNode}`);
        if (source) addWire(point(source, 'right'), point(outputSocket, 'left'), 'output');
      }
    };

    requestAnimationFrame(drawWires);
  }

  private openOperatorModal(editIndex: number | null = null): void {
    this.closeSecondaryModal();
    const editing = editIndex != null ? this.nodes[editIndex] : null;
    const overlay = document.createElement('div');
    overlay.className = 'object-builder-secondary-overlay';
    const dialog = document.createElement('section');
    dialog.className = 'object-builder-secondary-dialog object-builder-logic-dialog object-builder-logic-dialog-wide';
    dialog.innerHTML = `<header><strong>${editing ? 'EDIT' : 'ADD'} LOGIC NODE</strong><button type="button" data-close>×</button></header><div class="object-builder-secondary-body"></div><footer><button type="button" data-cancel>CANCEL</button><button type="button" class="primary" data-save>${editing ? 'UPDATE' : 'ADD NODE'}</button></footer>`;
    overlay.append(dialog); document.body.append(overlay); this.modal = overlay;
    const body = dialog.querySelector<HTMLElement>('.object-builder-secondary-body')!;
    const workspace = document.createElement('div'); workspace.className = 'object-builder-logic-workspace';
    const fields = document.createElement('div'); fields.className = 'object-builder-secondary-fields object-builder-logic-operator-fields';
    const timingPane = document.createElement('aside'); timingPane.className = 'object-builder-logic-timing-pane';
    const timingEmpty = document.createElement('div'); timingEmpty.className = 'object-builder-secondary-hint'; timingEmpty.textContent = 'Select an Inline timing source to edit it here.';
    timingPane.append(timingEmpty); workspace.append(fields, timingPane); body.append(workspace);

    const nodeName = this.textInput('logicNodeName', editing?.name ?? this.nextNodeName());
    fields.append(this.modalRow('Node name', nodeName));

    const operator = document.createElement('select');
    operator.name = 'logicOperator';
    for (const value of ['and','or','xor','nand','nor','divider','counter','flipflop'] as LogicOperator[]) operator.append(new Option(value.toUpperCase(), value));
    operator.value = editing?.operator ?? 'and';
    fields.append(this.modalRow('Operator', operator));

    const inputsWrap = document.createElement('div'); inputsWrap.className = 'object-builder-logic-inputs';
    fields.append(this.modalRow('Sources', inputsWrap));

    const param = document.createElement('input'); param.type = 'number'; param.min = '2'; param.max = '64'; param.step = '1'; param.value = String(editing?.param || 2);
    const paramRow = this.modalRow('By', param); fields.append(paramRow);

    const error = document.createElement('div'); error.className = 'object-builder-error'; error.hidden = true; body.append(error);

    let inputs = editing?.inputs.slice() ?? this.defaultInputs(operator.value as LogicOperator, editIndex);
    const inlineStates = new Map<number, TimingEditorState>();
    inputs.forEach((value, index) => {
      if (!this.availableSources(editIndex).includes(value)) inlineStates.set(index, timingStateFromValue(value));
    });
    let activeInlineIndex: number | null = null;
    let activeTimingEditor: TimingEditor | null = null;

    const persistActiveTiming = (): void => {
      if (activeInlineIndex == null || !activeTimingEditor) return;
      const state = activeTimingEditor.getState();
      inlineStates.set(activeInlineIndex, state);
      inputs[activeInlineIndex] = state.value;
    };
    const showInlineTiming = (index: number): void => {
      persistActiveTiming();
      activeInlineIndex = index;
      const state = inlineStates.get(index) ?? timingStateFromValue(inputs[index] || 'every 1 beat');
      inlineStates.set(index, state);
      timingPane.replaceChildren();
      activeTimingEditor = new TimingEditor({ editor: this.editor, state, showEnabledToggle: false, showReaderMode: false, title: `INLINE TIMING · SOURCE ${index + 1}` });
      timingPane.append(activeTimingEditor.mount());
    };
    const clearInlineTiming = (): void => {
      persistActiveTiming(); activeInlineIndex = null; activeTimingEditor = null;
      timingPane.replaceChildren(); timingPane.append(timingEmpty);
    };

    const renderInputs = (): void => {
      inputsWrap.replaceChildren();
      const single = this.isSingleInput(operator.value as LogicOperator);
      const desired = single ? 1 : Math.max(2, inputs.length);
      while (inputs.length < desired) inputs.push(this.defaultSource(editIndex));
      if (single && inputs.length > 1) { inputs = [inputs[0] ?? this.defaultSource(editIndex)]; inlineStates.clear(); }
      inputs.forEach((value, index) => {
        const line = document.createElement('div'); line.className = 'object-builder-logic-source-row';
        const known = this.availableSources(editIndex);
        const select = document.createElement('select');
        for (const source of known) select.append(new Option(source, source));
        select.append(new Option('Inline timing…', '__inline__'));
        const inline = !known.includes(value);
        select.value = inline ? '__inline__' : value;
        if (inline && !inlineStates.has(index)) inlineStates.set(index, timingStateFromValue(value));
        select.addEventListener('change', () => {
          persistActiveTiming();
          if (select.value === '__inline__') {
            const state = inlineStates.get(index) ?? timingStateFromValue('every 1 beat');
            inlineStates.set(index, state); inputs[index] = state.value;
          } else {
            inlineStates.delete(index); inputs[index] = select.value;
            if (activeInlineIndex === index) clearInlineTiming();
          }
          renderInputs();
          if (select.value === '__inline__') showInlineTiming(index);
        });
        line.append(select);
        if (inline) {
          const editTiming = document.createElement('button'); editTiming.type = 'button'; editTiming.className = 'object-builder-button object-builder-logic-inline-edit'; editTiming.textContent = activeInlineIndex === index ? 'EDITING' : 'EDIT TIMING';
          editTiming.addEventListener('click', () => { showInlineTiming(index); renderInputs(); });
          line.append(editTiming);
        }
        if (!single) {
          const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '−'; remove.disabled = inputs.length <= 2;
          remove.addEventListener('click', () => {
            persistActiveTiming(); inputs.splice(index, 1);
            const remapped = new Map<number, TimingEditorState>();
            for (const [key, state] of inlineStates) { if (key < index) remapped.set(key, state); else if (key > index) remapped.set(key - 1, state); }
            inlineStates.clear(); for (const [key, state] of remapped) inlineStates.set(key, state);
            if (activeInlineIndex === index) clearInlineTiming(); else if (activeInlineIndex != null && activeInlineIndex > index) activeInlineIndex -= 1;
            renderInputs();
          });
          line.append(remove);
        }
        inputsWrap.append(line);
      });
      if (!single) {
        const add = document.createElement('button'); add.type = 'button'; add.className = 'object-builder-button'; add.textContent = '+ ADD SOURCE';
        add.addEventListener('click', () => { persistActiveTiming(); inputs.push(this.defaultSource(editIndex)); renderInputs(); });
        inputsWrap.append(add);
      }
    };

    const refreshOperator = (): void => {
      const op = operator.value as LogicOperator;
      const parameterized = op === 'divider' || op === 'counter';
      paramRow.style.display = parameterized ? '' : 'none';
      paramRow.querySelector('label')!.textContent = op === 'counter' ? 'Count' : 'By';
      renderInputs();
    };
    operator.addEventListener('change', refreshOperator);
    refreshOperator();

    const close = (): void => this.closeSecondaryModal();
    dialog.querySelector('[data-close]')!.addEventListener('click', close);
    dialog.querySelector('[data-cancel]')!.addEventListener('click', close);
    overlay.addEventListener('pointerdown', (event) => { if (event.target === overlay) close(); });
    dialog.querySelector('[data-save]')!.addEventListener('click', () => {
      persistActiveTiming();
      const op = operator.value as LogicOperator;
      const name = nodeName.value.trim();
      const normalizedInputs = inputs.map((item) => item.trim()).filter(Boolean);
      const duplicate = this.nodes.some((node, index) => index !== editIndex && node.name === name);
      let message = '';
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) message = 'Node name must be a valid identifier.';
      else if (duplicate) message = `Logic node '${name}' already exists.`;
      else if (this.isSingleInput(op) && normalizedInputs.length !== 1) message = `${op.toUpperCase()} requires exactly one source.`;
      else if (!this.isSingleInput(op) && normalizedInputs.length < 2) message = `${op.toUpperCase()} requires at least two sources.`;
      const number = Number(param.value || 2);
      if (!message && (op === 'divider' || op === 'counter') && (!Number.isInteger(number) || number < 2 || number > 64)) message = `${op.toUpperCase()} requires a value from 2 to 64.`;
      if (message) { error.hidden = false; error.textContent = message; return; }
      const node: LogicNode = { name, operator: op, inputs: normalizedInputs, param: number };
      if (editIndex == null) this.nodes.push(node);
      else {
        const previousName = this.nodes[editIndex].name;
        this.nodes[editIndex] = node;
        if (previousName !== name) {
          for (const candidate of this.nodes) {
            candidate.inputs = candidate.inputs.map((input) => input === previousName ? name : input);
          }
        }
      }
      close(); this.renderList(); this.onChange();
    });
  }

  private analyzeGraph(): LogicGraphAnalysis {
    const names = new Set(this.nodes.map((node) => node.name));
    const consumed = new Set<string>();
    for (const node of this.nodes) {
      for (const input of node.inputs) if (names.has(input)) consumed.add(input);
    }
    const sinks = this.nodes.map((node) => node.name).filter((name) => !consumed.has(name));

    const visiting = new Set<string>();
    const visited = new Set<string>();
    let cycle: string[] | null = null;
    const visit = (name: string, path: string[]): void => {
      if (cycle || visited.has(name)) return;
      if (visiting.has(name)) {
        const start = path.indexOf(name);
        cycle = [...path.slice(start), name];
        return;
      }
      visiting.add(name);
      const node = this.nodes.find((candidate) => candidate.name === name);
      if (node) {
        for (const input of node.inputs) if (names.has(input)) visit(input, [...path, name]);
      }
      visiting.delete(name);
      visited.add(name);
    };
    for (const node of this.nodes) visit(node.name, []);

    return { outputNode: !cycle && sinks.length === 1 ? sinks[0] : null, sinks, cycle };
  }

  private availableSources(editIndex: number | null = null): string[] {
    const sources: string[] = [];
    for (const raw of this.editor.value.split(/\r?\n/)) {
      const match = raw.match(/^\s*SET\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*RHYTHM\b/i);
      if (match && !sources.includes(match[1])) sources.push(match[1]);
    }
    this.nodes.forEach((node, index) => {
      if (index !== editIndex && !sources.includes(node.name)) sources.push(node.name);
    });
    return sources;
  }

  private defaultSource(editIndex: number | null = null): string { return this.availableSources(editIndex)[0] ?? 'every 1 beat'; }
  private defaultInputs(operator: LogicOperator, editIndex: number | null = null): string[] { const first = this.defaultSource(editIndex); return this.isSingleInput(operator) ? [first] : [first, first]; }
  private isSingleInput(operator: LogicOperator): boolean { return operator === 'divider' || operator === 'counter' || operator === 'flipflop'; }
  private nextNodeName(): string { let i = 1; while (this.nodes.some((node) => node.name === `node${i}`)) i += 1; return `node${i}`; }

  private row(labelText: string, input: HTMLElement): HTMLElement {
    const row = document.createElement('div'); row.className = 'object-builder-row';
    const label = document.createElement('label'); label.textContent = labelText; row.append(label, input); return row;
  }
  private modalRow(labelText: string, input: HTMLElement): HTMLElement {
    const row = document.createElement('div'); row.className = 'object-builder-row object-builder-logic-modal-row';
    const label = document.createElement('label'); label.textContent = labelText; row.append(label, input); return row;
  }
  private textInput(name: string, value: string): HTMLInputElement {
    const input = document.createElement('input'); input.type = 'text'; input.name = name; input.value = value; return input;
  }
}
