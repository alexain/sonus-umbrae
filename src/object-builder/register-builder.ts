import { TimingEditor, timingStateFromValue, type TimingEditorState } from './timing-editor';

type SeqSource = {
  name: string;
  model: 'turing' | 'constellation' | 'snake' | 'life';
};

const LIFE_READERS = ['order', 'random', 'walk', 'reverse', 'pendulum', 'first', 'last'] as const;

export class RegisterBuilderPanel {
  private size = 2;
  private timingState: TimingEditorState = timingStateFromValue('every 1 beat');
  private sourceSelect!: HTMLSelectElement;
  private readerRow!: HTMLElement;
  private readerSelect!: HTMLSelectElement;
  private preview!: HTMLElement;
  private timingSummary!: HTMLElement;
  private modal: HTMLElement | null = null;

  constructor(
    private readonly form: HTMLElement,
    private readonly editor: HTMLTextAreaElement,
    private readonly onChange: () => void,
    private readonly initialName = 'myRegister',
  ) {}

  mount(): void {
    this.form.replaceChildren();

    const title = document.createElement('h2');
    title.textContent = 'REGISTER';
    this.form.append(title);

    this.form.append(this.row('Name', this.textInput('name', this.initialName)));

    const model = document.createElement('div');
    model.className = 'object-builder-register-model';
    model.innerHTML = '<span>MODEL</span><strong>SHIFT</strong><small>Newest value enters stage .1</small>';
    this.form.append(model);

    const controls = document.createElement('section');
    controls.className = 'object-builder-section object-builder-register-controls';

    const stageHeader = document.createElement('div');
    stageHeader.className = 'object-builder-register-control-head';
    const stageTitle = document.createElement('div');
    stageTitle.innerHTML = '<strong>STAGES</strong><span>2–32 pitch stages</span>';
    const stageStepper = document.createElement('div');
    stageStepper.className = 'object-builder-register-stepper';
    const minus = this.button('−', () => this.changeSize(-1));
    const count = document.createElement('output');
    count.dataset.role = 'register-size';
    count.textContent = String(this.size);
    const plus = this.button('+', () => this.changeSize(1));
    stageStepper.append(minus, count, plus);
    stageHeader.append(stageTitle, stageStepper);
    controls.append(stageHeader);

    const sources = this.findSeqSources();
    this.sourceSelect = document.createElement('select');
    this.sourceSelect.name = 'registerSource';
    if (sources.length === 0) {
      this.sourceSelect.append(new Option('No SEQ available', ''));
      this.sourceSelect.disabled = true;
    } else {
      for (const source of sources) {
        this.sourceSelect.append(new Option(`${source.name} · ${source.model.toUpperCase()}`, source.name));
      }
    }
    this.sourceSelect.addEventListener('change', () => {
      this.syncReader();
      this.renderPreview();
      this.onChange();
    });
    controls.append(this.row('Pitch source', this.sourceSelect));

    this.readerSelect = document.createElement('select');
    this.readerSelect.name = 'registerReader';
    for (const reader of LIFE_READERS) this.readerSelect.append(new Option(reader.toUpperCase(), reader));
    this.readerSelect.value = 'random';
    this.readerSelect.addEventListener('change', () => this.onChange());
    this.readerRow = this.row('Life reader', this.readerSelect);
    controls.append(this.readerRow);

    const timing = document.createElement('div');
    timing.className = 'object-builder-register-timing';
    const timingLeft = document.createElement('div');
    timingLeft.innerHTML = '<strong>WRITE TIMING</strong>';
    this.timingSummary = document.createElement('span');
    this.timingSummary.textContent = this.timingState.value;
    timingLeft.append(this.timingSummary);
    const timingButton = this.button('EDIT TIMING', () => this.openTimingEditor());
    timing.append(timingLeft, timingButton);
    controls.append(timing);

    this.form.append(controls);

    const viewSection = document.createElement('section');
    viewSection.className = 'object-builder-section object-builder-register-view';
    const viewHead = document.createElement('div');
    viewHead.className = 'object-builder-register-view-head';
    viewHead.innerHTML = '<div><strong>SHIFT FLOW</strong><span>Each WRITE pushes older pitch values one stage down</span></div>';
    viewSection.append(viewHead);
    this.preview = document.createElement('div');
    this.preview.className = 'object-builder-register-preview';
    viewSection.append(this.preview);
    this.form.append(viewSection);

    this.syncReader();
    this.renderPreview();
  }

  closeSecondaryModal(): void {
    this.modal?.remove();
    this.modal = null;
  }

  validate(): string | null {
    const name = this.value('name').trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return 'REGISTER name must be a valid identifier.';
    if (!this.sourceSelect.value) return 'REGISTER requires an existing SEQ pitch source.';
    return null;
  }

  generateCode(): string {
    const name = this.value('name').trim() || this.initialName;
    const source = this.sourceSelect.value;
    const sourceInfo = this.findSeqSources().find((entry) => entry.name === source);
    const reader = sourceInfo?.model === 'life' ? ` with ${this.readerSelect.value || 'random'}` : '';
    return [
      `REGISTER ${name}:`,
      '    model shift',
      `    size ${this.size}`,
      `    pitch ${source}${reader}`,
      `    write ${this.timingState.value || 'every 1 beat'}`,
    ].join('\n');
  }

  previewDescription(): string {
    const source = this.sourceSelect.value || 'SEQ';
    return `SHIFT REGISTER · ${this.size} STAGES\n${source} → .1 → .2 → … → .${this.size}`;
  }

  renderInfoPreview(): HTMLElement {
    const box = document.createElement('div');
    box.className = 'object-builder-register-info-preview';
    const title = document.createElement('strong');
    title.textContent = `${this.size} STAGES`;
    const endpoints = document.createElement('div');
    endpoints.className = 'object-builder-register-endpoints';
    const visible = Math.min(this.size, 8);
    for (let i = 1; i <= visible; i += 1) {
      const chip = document.createElement('span');
      chip.textContent = `.${i}`;
      endpoints.append(chip);
    }
    if (this.size > visible) {
      const more = document.createElement('span');
      more.textContent = `… .${this.size}`;
      endpoints.append(more);
    }
    box.append(title, endpoints);
    return box;
  }

  private changeSize(delta: number): void {
    this.size = Math.max(2, Math.min(32, this.size + delta));
    const output = this.form.querySelector<HTMLOutputElement>('[data-role=register-size]');
    if (output) output.textContent = String(this.size);
    this.renderPreview();
    this.onChange();
  }

  private syncReader(): void {
    const source = this.findSeqSources().find((entry) => entry.name === this.sourceSelect.value);
    this.readerRow.hidden = source?.model !== 'life';
  }

  private renderPreview(): void {
    this.preview.replaceChildren();

    const canvas = document.createElement('div');
    canvas.className = 'object-builder-register-stage-canvas';

    const source = document.createElement('div');
    source.className = 'object-builder-register-source-node';
    const selected = this.findSeqSources().find((entry) => entry.name === this.sourceSelect.value);
    source.innerHTML = `
      <strong>${this.sourceSelect.value || 'SEQ'}</strong>
      <span>${selected?.model?.toUpperCase() ?? 'PITCH SOURCE'}</span>
      <small>1 pitch / WRITE</small>
    `;
    canvas.append(source);

    const stages = document.createElement('div');
    stages.className = 'object-builder-register-stage-strip';

    const columns: HTMLElement[] = [];
    const visibleCells = 6;
    const previewStages = Math.min(this.size, 5);

    for (let stageIndex = 1; stageIndex <= previewStages; stageIndex += 1) {
      const column = document.createElement('div');
      column.className = 'object-builder-register-stage-column';

      const label = document.createElement('div');
      label.className = 'object-builder-register-stage-label';
      label.innerHTML = `
        <strong>.${stageIndex}</strong>
        <span>${stageIndex === 1 ? 'NEW' : `−${stageIndex - 1}`}</span>
      `;
      column.append(label);

      const cells = document.createElement('div');
      cells.className = 'object-builder-register-stage-cells';

      /*
       * The vertical stack is intentionally schematic: it shows a short window
       * of the pitch stream at each public output.  Each successive stage is
       * delayed by one WRITE.  For deep registers the tracked "1" is clamped
       * inside the six-cell window and the leading ellipsis communicates that
       * earlier positions are outside the preview.
       */
      const referenceRow = Math.min(stageIndex - 1, visibleCells - 2);

      for (let row = 0; row < visibleCells; row += 1) {
        const cell = document.createElement('div');
        cell.className = 'object-builder-register-stage-cell';

        const value = document.createElement('b');
        if (row < referenceRow) {
          value.textContent = '…';
          cell.classList.add('ellipsis');
        } else if (row === referenceRow) {
          value.textContent = '1';
          cell.classList.add('reference');
        } else if (row === visibleCells - 1) {
          value.textContent = 'N…';
          cell.classList.add('tail');
        } else {
          value.textContent = String(row - referenceRow + 1);
        }

        if (stageIndex === 1 && row === 0) cell.classList.add('incoming');
        cell.append(value);
        cells.append(cell);
      }

      column.append(cells);
      stages.append(column);
      columns.push(column);
    }

    if (this.size > previewStages) {
      const continuation = document.createElement('div');
      continuation.className = 'object-builder-register-stage-continuation';
      continuation.setAttribute('aria-label', `Stages continue through .${this.size}`);
      continuation.innerHTML = `
        <span aria-hidden="true">→</span>
        <span aria-hidden="true">•••</span>
        <strong>.${this.size}</strong>
      `;
      Object.assign(continuation.style, {
        alignSelf: 'center',
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        marginLeft: '4px',
        color: 'var(--accent-cyan, #35d6d3)',
        whiteSpace: 'nowrap',
        fontSize: '10px',
      });
      stages.append(continuation);
    }

    canvas.append(stages);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('object-builder-register-stage-wires');
    canvas.append(svg);

    this.preview.append(canvas);

    const legend = document.createElement('div');
    legend.className = 'object-builder-register-legend';
    legend.innerHTML = `
      <span><i class="cyan"></i>pitch 1 through the stages</span>
      <span><i class="yellow"></i>new pitch enters .1</span>
      <span>${this.size} stages = ${this.size} outputs (.1….${
        this.size
      })</span>
      <span>vertical cells are a short conceptual stream; N… continues</span>
    `;
    this.preview.append(legend);

    requestAnimationFrame(() => this.drawStageWires(canvas, source, columns, svg));
  }

  private drawStageWires(
    canvas: HTMLElement,
    source: HTMLElement,
    columns: HTMLElement[],
    svg: SVGSVGElement,
  ): void {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;

    svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
    svg.setAttribute('width', String(bounds.width));
    svg.setAttribute('height', String(bounds.height));
    svg.replaceChildren();

    const ns = 'http://www.w3.org/2000/svg';
    const defs = document.createElementNS(ns, 'defs');
    const marker = document.createElementNS(ns, 'marker');
    marker.setAttribute('id', 'register-stage-arrow-cyan');
    marker.setAttribute('markerWidth', '7');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('refX', '6');
    marker.setAttribute('refY', '3.5');
    marker.setAttribute('orient', 'auto');
    const head = document.createElementNS(ns, 'path');
    head.setAttribute('d', 'M0,0 L7,3.5 L0,7 z');
    marker.append(head);
    defs.append(marker);
    svg.append(defs);

    const refs = columns
      .map((column) => column.querySelector<HTMLElement>('.object-builder-register-stage-cell.reference'))
      .filter((cell): cell is HTMLElement => cell !== null);

    const sourceBounds = source.getBoundingClientRect();
    if (refs.length > 0) {
      const firstBounds = refs[0].getBoundingClientRect();
      this.appendWire(
        svg,
        bounds,
        sourceBounds.right,
        sourceBounds.top + sourceBounds.height / 2,
        firstBounds.left,
        firstBounds.top + firstBounds.height / 2,
        'register-stage-arrow-cyan',
      );
    }

    for (let i = 0; i < refs.length - 1; i += 1) {
      const from = refs[i].getBoundingClientRect();
      const to = refs[i + 1].getBoundingClientRect();
      this.appendWire(
        svg,
        bounds,
        from.right,
        from.top + from.height / 2,
        to.left,
        to.top + to.height / 2,
        'register-stage-arrow-cyan',
      );
    }
  }

  private appendWire(
    svg: SVGSVGElement,
    canvasBounds: DOMRect,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    markerId: string,
  ): void {
    const ns = 'http://www.w3.org/2000/svg';
    const x1 = fromX - canvasBounds.left + 3;
    const y1 = fromY - canvasBounds.top;
    const x2 = toX - canvasBounds.left - 5;
    const y2 = toY - canvasBounds.top;
    const bend = Math.max(12, (x2 - x1) * 0.42);

    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`);
    path.setAttribute('class', 'object-builder-register-stage-wire');
    path.setAttribute('marker-end', `url(#${markerId})`);
    svg.append(path);
  }

  private openTimingEditor(): void {
    const timingEditor = new TimingEditor({
      editor: this.editor,
      state: this.timingState,
      showEnabledToggle: false,
      showReaderMode: false,
      title: 'WRITE TIMING',
    });
    const body = document.createElement('div');
    body.className = 'object-builder-register-timing-modal';
    body.append(timingEditor.mount());

    const overlay = document.createElement('div');
    overlay.className = 'object-builder-secondary-overlay';
    const dialog = document.createElement('section');
    dialog.className = 'object-builder-secondary-dialog object-builder-timing-dialog';
    dialog.innerHTML = '<header><strong>WRITE TIMING</strong><button type="button" data-close>×</button></header>';
    dialog.append(body);
    const footer = document.createElement('footer');
    const done = document.createElement('button');
    done.type = 'button';
    done.textContent = 'DONE';
    done.className = 'object-builder-button primary';
    footer.append(done);
    dialog.append(footer);
    overlay.append(dialog);
    document.body.append(overlay);
    this.modal = overlay;

    const finish = (): void => {
      this.timingState = timingEditor.getState();
      this.timingSummary.textContent = this.timingState.value || 'every 1 beat';
      this.closeSecondaryModal();
      this.onChange();
    };
    done.addEventListener('click', finish);
    dialog.querySelector<HTMLButtonElement>('[data-close]')?.addEventListener('click', finish);
    overlay.addEventListener('pointerdown', (event) => {
      if (event.target === overlay) finish();
    });
  }

  private findSeqSources(): SeqSource[] {
    const lines = this.editor.value.split(/\r?\n/);
    const result: SeqSource[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      const match = lines[i].match(/^\s*SEQ\s+([A-Za-z_][A-Za-z0-9_]*)\b/i);
      if (!match) continue;
      let model: SeqSource['model'] = 'turing';
      for (let j = i + 1; j < lines.length; j += 1) {
        if (lines[j].trim() && !/^\s/.test(lines[j])) break;
        const modelMatch = lines[j].trim().match(/^model\s+([^\s]+)/i);
        if (!modelMatch) continue;
        const id = modelMatch[1].toLowerCase();
        if (id === 'constellation') model = 'constellation';
        else if (id === 'snake') model = 'snake';
        else if (id.startsWith('life')) model = 'life';
        else model = 'turing';
        break;
      }
      result.push({ name: match[1], model });
    }
    return result.filter((item, index) => result.findIndex((other) => other.name === item.name) === index);
  }

  private value(name: string): string {
    return (this.form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? '');
  }

  private textInput(name: string, value: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.name = name;
    input.value = value;
    return input;
  }

  private button(text: string, action: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.addEventListener('click', action);
    return button;
  }

  private row(labelText: string, control: HTMLElement): HTMLElement {
    const row = document.createElement('div');
    row.className = 'object-builder-row';
    const label = document.createElement('label');
    label.textContent = labelText;
    row.append(label, control);
    return row;
  }
}
