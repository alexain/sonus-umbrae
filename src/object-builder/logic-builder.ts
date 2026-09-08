import { TimingEditor, timingStateFromValue, type TimingEditorState } from './timing-editor';

export type LogicOperator = 'and' | 'or' | 'xor' | 'nand' | 'nor' | 'divider' | 'counter' | 'flipflop';

type LogicNode = {
  name: string;
  operator: LogicOperator;
  inputs: string[];
  param: number;
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
    heading.textContent = 'LOGIC OPERATORS';
    this.list = document.createElement('div');
    this.list.className = 'object-builder-logic-list';
    const add = document.createElement('button');
    add.type = 'button'; add.className = 'object-builder-button object-builder-logic-add'; add.textContent = '+ ADD LOGIC OPERATOR';
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
    if (this.nodes.length === 0) return 'Add at least one logic operator.';
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
    return lines.join('\n');
  }

  previewDescription(): string {
    if (this.nodes.length === 0) return 'NO LOGIC OPERATORS';
    return this.nodes.map((node) => `${node.operator.toUpperCase()} ${node.name}\n← ${node.inputs.join(', ')}`).join('\n\n');
  }

  private renderList(): void {
    this.list.replaceChildren();
    if (this.nodes.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'object-builder-secondary-hint';
      empty.textContent = 'No operators yet. Add one or more event-domain logic operators.';
      this.list.append(empty);
      return;
    }

    this.nodes.forEach((node, index) => {
      const card = document.createElement('div');
      card.className = 'object-builder-logic-card';
      const text = document.createElement('div');
      const label = document.createElement('strong');
      label.textContent = `${node.operator.toUpperCase()}  ${node.name}`;
      const summary = document.createElement('span');
      const suffix = node.operator === 'divider' ? ` · BY ${node.param}` : node.operator === 'counter' ? ` · COUNT ${node.param}` : '';
      summary.textContent = `${node.inputs.join(' + ')}${suffix}`;
      text.append(label, summary);

      const actions = document.createElement('div');
      const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'EDIT';
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'REMOVE';
      const referenced = this.nodes.slice(index + 1).some((candidate) => candidate.inputs.includes(node.name));
      remove.disabled = referenced;
      if (referenced) remove.title = 'This output is used by a later logic operator.';
      edit.addEventListener('click', () => this.openOperatorModal(index));
      remove.addEventListener('click', () => { this.nodes.splice(index, 1); this.renderList(); this.onChange(); });
      actions.append(edit, remove);
      card.append(text, actions);
      this.list.append(card);
    });
  }

  private openOperatorModal(editIndex: number | null = null): void {
    this.closeSecondaryModal();
    const editing = editIndex != null ? this.nodes[editIndex] : null;
    const overlay = document.createElement('div');
    overlay.className = 'object-builder-secondary-overlay';
    const dialog = document.createElement('section');
    dialog.className = 'object-builder-secondary-dialog object-builder-logic-dialog object-builder-logic-dialog-wide';
    dialog.innerHTML = `<header><strong>${editing ? 'EDIT' : 'ADD'} LOGIC OPERATOR</strong><button type="button" data-close>×</button></header><div class="object-builder-secondary-body"></div><footer><button type="button" data-cancel>CANCEL</button><button type="button" class="primary" data-save>${editing ? 'UPDATE' : 'ADD OPERATOR'}</button></footer>`;
    overlay.append(dialog); document.body.append(overlay); this.modal = overlay;
    const body = dialog.querySelector<HTMLElement>('.object-builder-secondary-body')!;
    const workspace = document.createElement('div'); workspace.className = 'object-builder-logic-workspace';
    const fields = document.createElement('div'); fields.className = 'object-builder-secondary-fields object-builder-logic-operator-fields';
    const timingPane = document.createElement('aside'); timingPane.className = 'object-builder-logic-timing-pane';
    const timingEmpty = document.createElement('div'); timingEmpty.className = 'object-builder-secondary-hint'; timingEmpty.textContent = 'Select an Inline timing source to edit it here.';
    timingPane.append(timingEmpty); workspace.append(fields, timingPane); body.append(workspace);

    const nodeName = this.textInput('logicNodeName', editing?.name ?? this.nextNodeName());
    fields.append(this.modalRow('Output name', nodeName));

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
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) message = 'Output name must be a valid identifier.';
      else if (duplicate) message = `Logic output '${name}' already exists.`;
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
          for (const later of this.nodes.slice(editIndex + 1)) {
            later.inputs = later.inputs.map((input) => input === previousName ? name : input);
          }
        }
      }
      close(); this.renderList(); this.onChange();
    });
  }

  private availableSources(beforeIndex: number | null = null): string[] {
    const sources: string[] = [];
    for (const raw of this.editor.value.split(/\r?\n/)) {
      const match = raw.match(/^\s*SET\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*RHYTHM\b/i);
      if (match && !sources.includes(match[1])) sources.push(match[1]);
    }
    const earlierNodes = beforeIndex == null ? this.nodes : this.nodes.slice(0, beforeIndex);
    for (const node of earlierNodes) if (!sources.includes(node.name)) sources.push(node.name);
    return sources;
  }

  private defaultSource(beforeIndex: number | null = null): string { return this.availableSources(beforeIndex)[0] ?? 'every 1 beat'; }
  private defaultInputs(operator: LogicOperator, beforeIndex: number | null = null): string[] { const first = this.defaultSource(beforeIndex); return this.isSingleInput(operator) ? [first] : [first, first]; }
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
