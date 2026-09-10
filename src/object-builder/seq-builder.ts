import { TimingEditor, timingStateFromValue, type TimingEditorState } from './timing-editor';
import { PitchEditor, pitchStateFromValue, type PitchEditorState } from './pitch-editor';

type SeqModel = 'turing' | 'constellation' | 'snake' | 'life';

export class SeqBuilderPanel {
  private model: SeqModel = 'turing';
  private modelPanel!: HTMLElement;
  private turingTimingState: TimingEditorState = timingStateFromValue('every 1 beat');
  private lifeTimingState: TimingEditorState = timingStateFromValue('every 8 beat', false);
  private modal: HTMLElement | null = null;
  private readonly pitchStates: Record<SeqModel, PitchEditorState> = {
    turing: pitchStateFromValue('pitch notes [C3 E3 G3 A3]'),
    constellation: pitchStateFromValue('pitch notes [C3!80 D3!35 E3!70 G3!100]'),
    snake: pitchStateFromValue('pitch notes [C3 D3 E3 G3 A3 C4]'),
    life: pitchStateFromValue('pitch notes [C3 E3 G3 B3 D4]'),
  };

  constructor(
    private readonly form: HTMLElement,
    private readonly editor: HTMLTextAreaElement,
    private readonly onChange: () => void,
    private readonly initialName = 'mySeq',
  ) {}

  mount(): void {
    this.form.replaceChildren();

    const title = document.createElement('h2');
    title.textContent = 'SEQUENCER';
    this.form.append(title);

    this.form.append(this.row('Name', this.textInput('name', this.initialName)));
    const view = document.createElement('input');
    view.type = 'checkbox';
    view.name = 'view';
    this.form.append(this.row('View', view));

    const modelSelect = document.createElement('select');
    modelSelect.name = 'seqModel';
    for (const model of ['turing', 'constellation', 'snake', 'life'] as SeqModel[]) {
      modelSelect.append(new Option(model.toUpperCase(), model));
    }
    modelSelect.value = this.model;
    modelSelect.addEventListener('change', () => {
      this.model = modelSelect.value as SeqModel;
      this.renderModelPanel();
      this.onChange();
    });
    this.form.append(this.row('Model', modelSelect));

    this.modelPanel = document.createElement('section');
    this.modelPanel.className = 'object-builder-section object-builder-seq-panel';
    this.form.append(this.modelPanel);

    this.form.addEventListener('input', () => this.onChange());
    this.form.addEventListener('change', () => this.onChange());
    this.renderModelPanel();
  }

  validate(): string | null {
    const name = this.value('name').trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return 'SEQ name must be a valid identifier.';

    if (this.model === 'snake' && this.checked('snakeExplicit')) {
      const width = Number(this.value('snakeWidth'));
      const height = Number(this.value('snakeHeight'));
      const rows = this.value('snakeMatrix').split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
      if (rows.length !== height) return `Snake matrix requires exactly ${height} rows.`;
      for (const row of rows) {
        if (row.split(/\s+/).filter(Boolean).length !== width) return `Each Snake matrix row requires exactly ${width} notes.`;
      }
    }

    if (this.model === 'constellation') {
      const phrase = Number(this.value('phrase') || 0);
      const mutation = Number(this.value('mutation') || 0);
      if (mutation > 0 && phrase <= 0) return 'Constellation mutation requires Phrase > 0.';
    }

    if (this.model === 'life' && this.checked('lifeMaxEnabled')) {
      const density = Number(this.value('lifeDensity') || 0);
      const max = Number(this.value('lifeMax') || 0);
      if (max < density) return 'Life maximum density cannot be lower than the initial density.';
    }

    return null;
  }

  generateCode(): string {
    const name = this.value('name').trim() || this.initialName;
    const view = this.checked('view') ? ' with view' : '';
    const lines = [`SEQ ${name}${view}:`];

    if (this.model === 'life') lines.push(`    model ${this.value('lifeVariant') || 'life'}`);
    else lines.push(`    model ${this.model}`);

    if (this.model === 'turing') {
      lines.push(`    length ${this.value('turingLength') || '8'}`);
      lines.push(`    change ${this.value('turingChange') || '10'}`);
      lines.push(`    ${this.pitchLineForModel()}`);
      const timing = this.turingTimingState;
      if (timing.value.trim()) lines.push(`    ${timing.value.trim()}`);
    } else if (this.model === 'constellation') {
      lines.push(`    ${this.pitchLineForModel()}`);
      for (const id of ['stepwise', 'leap', 'repeat', 'memory']) lines.push(`    ${id} ${this.value(id) || '0'}`);
      const octave = this.value('octave').trim();
      if (octave) lines.push(`    octave ${octave}`);
      const phrase = Number(this.value('phrase') || 0);
      const mutation = Number(this.value('mutation') || 0);
      if (phrase > 0) lines.push(`    phrase ${phrase}`);
      if (mutation > 0) lines.push(`    mutation ${mutation}`);
    } else if (this.model === 'snake') {
      const width = this.value('snakeWidth') || '4';
      const height = this.value('snakeHeight') || '4';
      lines.push(`    size ${width}x${height}`);
      if (this.checked('snakeExplicit')) {
        const rows = this.value('snakeMatrix').split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
        lines.push('    matrix [');
        for (const row of rows) lines.push(`        ${row}`);
        lines.push('    ]');
      } else {
        lines.push(`    ${this.pitchLineForModel()}`);
      }
      lines.push(`    movement ${this.value('snakeMovement') || 'snake'}`);
    } else if (this.model === 'life') {
      lines.push(`    size ${this.value('lifeSize') || '8'}`);
      let density = `    density ${this.value('lifeDensity') || '34'}`;
      if (this.checked('lifeMaxEnabled')) density += ` with max ${this.value('lifeMax') || '34'}`;
      if (this.checked('lifeRespawn')) density += this.checked('lifeMaxEnabled') ? ', respawn' : ' with respawn';
      lines.push(density);
      lines.push(`    ${this.pitchLineForModel()}`);
      const evolve = this.lifeTimingState;
      if (evolve.enabled && evolve.value.trim()) lines.push(`    evolve ${evolve.value.trim()}`);
    }

    return lines.join('\n');
  }

  previewDescription(): string {
    if (this.model === 'turing') return `TURING\n${this.value('turingLength') || '8'} BIT REGISTER\nCHANGE ${this.value('turingChange') || '10'}%`;
    if (this.model === 'constellation') return `CONSTELLATION\nSTEP ${this.value('stepwise') || '60'} · LEAP ${this.value('leap') || '20'} · MEMORY ${this.value('memory') || '25'}`;
    if (this.model === 'snake') return `SNAKE\n${this.value('snakeWidth') || '4'} × ${this.value('snakeHeight') || '4'}\n${(this.value('snakeMovement') || 'snake').toUpperCase()}`;
    return `LIFE\n${(this.value('lifeVariant') || 'life').toUpperCase()} · ${this.value('lifeSize') || '8'} × ${this.value('lifeSize') || '8'}\nDENSITY ${this.value('lifeDensity') || '34'}%`;
  }

  private renderModelPanel(): void {
    this.modelPanel.replaceChildren();
    const title = document.createElement('h3');
    title.textContent = `${this.model.toUpperCase()} ENGINE`;
    this.modelPanel.append(title);

    if (this.model === 'turing') this.renderTuring();
    else if (this.model === 'constellation') this.renderConstellation();
    else if (this.model === 'snake') this.renderSnake();
    else this.renderLife();
  }

  private renderTuring(): void {
    const hero = this.hero('SHIFT REGISTER', 'Owns its advance clock. LENGTH defines the register; CHANGE controls mutation probability.');
    this.modelPanel.append(hero);

    const grid = document.createElement('div');
    grid.className = 'object-builder-seq-two-column';
    grid.append(
      this.sliderField('turingLength', 'Length', 2, 32, 8, ' steps'),
      this.sliderField('turingChange', 'Change', 0, 100, 10, '%'),
    );
    this.modelPanel.append(grid);
    this.renderPitchAction(this.modelPanel, false);

    this.renderTimingAction(this.modelPanel, 'ADVANCE TIMING', false);
  }

  private renderConstellation(): void {
    this.modelPanel.append(this.hero('MELODIC FIELD', 'Consumer-driven generator. Biases shape the next pitch; the SEQ itself has no playhead timing.'));
    this.renderPitchAction(this.modelPanel, true);

    const biases = document.createElement('div');
    biases.className = 'object-builder-seq-bias-grid';
    biases.append(
      this.sliderField('stepwise', 'Stepwise', 0, 100, 60, '%'),
      this.sliderField('leap', 'Leap', 0, 100, 20, '%'),
      this.sliderField('repeat', 'Repeat', 0, 100, 10, '%'),
      this.sliderField('memory', 'Memory', 0, 100, 25, '%'),
    );
    this.modelPanel.append(biases);

    const phrase = document.createElement('div');
    phrase.className = 'object-builder-seq-two-column';
    phrase.append(this.numberField('phrase', 'Phrase', 0, 64, 0), this.sliderField('mutation', 'Mutation', 0, 100, 0, '%'));
    this.modelPanel.append(phrase);

    const octave = this.textInput('octave', '[-1!10 0!100 1!25]');
    this.modelPanel.append(this.row('Octave weights', octave));
    this.modelPanel.append(this.hint('Pitch NOTES may use ! weights here, for example [C3!80 D3!35 E3!70 G3!100].'));
  }

  private renderSnake(): void {
    this.modelPanel.append(this.hero('PITCH MATRIX', 'Consumer-driven spatial sequencer. Size and traversal define the geometry; timing belongs to each consumer.'));

    const geometry = document.createElement('div');
    geometry.className = 'object-builder-seq-three-column';
    geometry.append(
      this.numberField('snakeWidth', 'Columns', 2, 16, 4),
      this.numberField('snakeHeight', 'Rows', 2, 16, 4),
      this.selectField('snakeMovement', 'Movement', ['snake','rows','columns','spiral','diagonal','bounce','random','walk']),
    );
    this.modelPanel.append(geometry);

    const explicit = document.createElement('input');
    explicit.type = 'checkbox'; explicit.name = 'snakeExplicit';
    const explicitRow = this.row('Explicit matrix', explicit);
    this.modelPanel.append(explicitRow);

    const generated = document.createElement('div');
    generated.className = 'object-builder-seq-generated-material';
    this.modelPanel.append(generated);
    this.renderPitchAction(generated, false);

    const matrixWrap = document.createElement('div');
    matrixWrap.className = 'object-builder-seq-matrix-wrap';
    const matrix = document.createElement('textarea');
    matrix.name = 'snakeMatrix'; matrix.rows = 6;
    matrix.value = 'C3 D3 E3 G3\nA3 C4 D4 E4\nG4 A4 C5 D5\nE5 G5 A5 C6';
    matrixWrap.append(this.row('Matrix notes', matrix));
    matrixWrap.append(this.hint('One whitespace-separated row per matrix row. Row/column count must match SIZE.'));
    this.modelPanel.append(matrixWrap);

    const refresh = (): void => {
      generated.hidden = explicit.checked;
      matrixWrap.hidden = !explicit.checked;
      this.onChange();
    };
    explicit.addEventListener('change', refresh);
    matrix.addEventListener('input', refresh);
    refresh();
  }

  private renderLife(): void {
    this.modelPanel.append(this.hero('CELLULAR PITCH POOL', 'The grid evolves independently. Consumers read the live-cell pitch pool with their own reader mode and timing.'));

    const top = document.createElement('div');
    top.className = 'object-builder-seq-three-column';
    top.append(
      this.selectField('lifeVariant', 'Rule', ['life','life.highlife','life.seeds','life.day-night','life.morley']),
      this.selectField('lifeSize', 'Grid', ['8','16']),
      this.sliderField('lifeDensity', 'Density', 0, 100, 34, '%'),
    );
    this.modelPanel.append(top);

    const controls = document.createElement('div');
    controls.className = 'object-builder-seq-life-controls';
    const maxEnabled = document.createElement('input'); maxEnabled.type = 'checkbox'; maxEnabled.name = 'lifeMaxEnabled';
    const max = document.createElement('input'); max.type = 'range'; max.name = 'lifeMax'; max.min = '0'; max.max = '100'; max.value = '50';
    const maxOut = document.createElement('output'); maxOut.textContent = '50%';
    max.addEventListener('input', () => { maxOut.textContent = `${max.value}%`; });
    const maxWrap = document.createElement('div'); maxWrap.className = 'object-builder-seq-inline-slider'; maxWrap.append(max, maxOut);
    const respawn = document.createElement('input'); respawn.type = 'checkbox'; respawn.name = 'lifeRespawn';
    controls.append(this.row('Limit density', maxEnabled), this.row('Maximum', maxWrap), this.row('Respawn', respawn));
    this.modelPanel.append(controls);

    this.renderPitchAction(this.modelPanel, false);

    this.renderTimingAction(this.modelPanel, 'EVOLVE TIMING', true);
  }

  closeSecondaryModal(): void {
    this.modal?.remove();
    this.modal = null;
  }

  private renderPitchAction(container: HTMLElement, weightedNotes: boolean): void {
    const section = document.createElement('div');
    section.className = 'object-builder-seq-material';
    const heading = document.createElement('h4');
    heading.textContent = 'PITCH MATERIAL';

    const row = document.createElement('div');
    row.className = 'object-builder-action-row';
    const left = document.createElement('div');
    const label = document.createElement('strong');
    label.className = 'object-builder-action-label';
    label.textContent = 'PITCH';
    const summary = document.createElement('span');
    summary.className = 'object-builder-action-summary';
    summary.textContent = this.pitchSummary();
    left.append(label, summary);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'EDIT PITCH';
    button.addEventListener('click', () => this.openPitchEditor(weightedNotes, summary));
    row.append(left, button);
    section.append(heading, row);
    container.append(section);
  }

  private renderTimingAction(container: HTMLElement, titleText: 'ADVANCE TIMING' | 'EVOLVE TIMING', optional: boolean): void {
    const section = document.createElement('div');
    section.className = 'object-builder-seq-material';
    const heading = document.createElement('h4');
    heading.textContent = 'TIMING';

    const row = document.createElement('div');
    row.className = 'object-builder-action-row';
    const left = document.createElement('div');
    const label = document.createElement('strong');
    label.className = 'object-builder-action-label';
    label.textContent = titleText;
    const summary = document.createElement('span');
    summary.className = 'object-builder-action-summary';
    summary.textContent = this.timingSummary(optional);
    left.append(label, summary);

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'EDIT TIMING';
    button.addEventListener('click', () => this.openTimingEditor(titleText, optional, summary));
    row.append(left, button);
    section.append(heading, row);
    container.append(section);
  }

  private openPitchEditor(weightedNotes: boolean, summary: HTMLElement): void {
    const pitchEditor = new PitchEditor({
      editor: this.editor,
      state: this.pitchStates[this.model],
      allowReference: false,
      notesHint: weightedNotes
        ? 'Notes may use ! weights, for example C3!80 D3!35 E3!70 G3!100.'
        : undefined,
    });
    const body = document.createElement('div');
    body.className = 'object-builder-pitch-editor';
    body.append(pitchEditor.mount());
    this.openSecondary('PITCH MATERIAL', body, () => {
      this.pitchStates[this.model] = pitchEditor.getState();
      summary.textContent = this.pitchSummary();
      this.onChange();
    });
    this.modal?.querySelector('.object-builder-secondary-dialog')?.classList.add('object-builder-pitch-dialog', 'object-builder-pitch-only-dialog');
  }

  private openTimingEditor(titleText: 'ADVANCE TIMING' | 'EVOLVE TIMING', optional: boolean, summary: HTMLElement): void {
    const state = optional ? this.lifeTimingState : this.turingTimingState;
    const timingEditor = new TimingEditor({
      editor: this.editor,
      state,
      showEnabledToggle: optional,
      showReaderMode: false,
      title: titleText,
    });
    const body = document.createElement('div');
    body.className = 'object-builder-seq-timing-modal';
    body.append(timingEditor.mount());
    this.openSecondary(titleText, body, () => {
      if (optional) this.lifeTimingState = timingEditor.getState();
      else this.turingTimingState = timingEditor.getState();
      summary.textContent = this.timingSummary(optional);
      this.onChange();
    });
    this.modal?.querySelector('.object-builder-secondary-dialog')?.classList.add('object-builder-timing-dialog');
  }

  private timingSummary(optional: boolean): string {
    const state = optional ? this.lifeTimingState : this.turingTimingState;
    if (optional && !state.enabled) return 'DISABLED';
    return state.value.trim() || 'every 1 beat';
  }

  private pitchLineForModel(): string {
    return this.pitchStates[this.model].value || 'pitch notes [C3]';
  }

  private pitchSummary(): string {
    return this.pitchLineForModel().replace(/^pitch\s+/i, '');
  }

  private openSecondary(titleText: string, body: HTMLElement, apply: () => void): void {
    this.closeSecondaryModal();
    const overlay = document.createElement('div');
    overlay.className = 'object-builder-secondary-overlay';
    overlay.innerHTML = `<section class="object-builder-secondary-dialog" role="dialog" aria-modal="true"><header><strong></strong><button type="button" data-close>×</button></header><div class="object-builder-secondary-body"></div><footer><button type="button" data-cancel>CANCEL</button><button type="button" class="primary" data-apply>APPLY</button></footer></section>`;
    overlay.querySelector('strong')!.textContent = titleText;
    overlay.querySelector('.object-builder-secondary-body')!.append(body);
    document.body.append(overlay);
    this.modal = overlay;
    const close = (): void => this.closeSecondaryModal();
    overlay.querySelector('[data-close]')!.addEventListener('click', close);
    overlay.querySelector('[data-cancel]')!.addEventListener('click', close);
    overlay.querySelector('[data-apply]')!.addEventListener('click', () => { apply(); close(); });
    overlay.addEventListener('pointerdown', (event) => { if (event.target === overlay) close(); });
  }

  private hero(titleText: string, bodyText: string): HTMLElement {
    const hero = document.createElement('div'); hero.className = 'object-builder-seq-hero';
    const title = document.createElement('strong'); title.textContent = titleText;
    const body = document.createElement('span'); body.textContent = bodyText;
    hero.append(title, body); return hero;
  }

  private sliderField(name: string, labelText: string, min: number, max: number, value: number, suffix: string): HTMLElement {
    const wrap = document.createElement('label'); wrap.className = 'object-builder-field object-builder-seq-slider-field';
    const label = document.createElement('span'); label.textContent = labelText;
    const line = document.createElement('div'); line.className = 'object-builder-seq-inline-slider';
    const input = document.createElement('input'); input.type = 'range'; input.name = name; input.min = String(min); input.max = String(max); input.step = '1'; input.value = String(value);
    const output = document.createElement('output'); output.textContent = `${value}${suffix}`;
    input.addEventListener('input', () => { output.textContent = `${input.value}${suffix}`; });
    line.append(input, output); wrap.append(label, line); return wrap;
  }

  private numberField(name: string, labelText: string, min: number, max: number, value: number): HTMLElement {
    const input = document.createElement('input'); input.type = 'number'; input.name = name; input.min = String(min); input.max = String(max); input.step = '1'; input.value = String(value);
    const wrap = document.createElement('label'); wrap.className = 'object-builder-field';
    const label = document.createElement('span'); label.textContent = labelText; wrap.append(label, input); return wrap;
  }

  private selectField(name: string, labelText: string, values: string[]): HTMLElement {
    const select = document.createElement('select'); select.name = name;
    for (const value of values) select.append(new Option(value.toUpperCase(), value));
    const wrap = document.createElement('label'); wrap.className = 'object-builder-field';
    const label = document.createElement('span'); label.textContent = labelText; wrap.append(label, select); return wrap;
  }

  private hint(text: string): HTMLElement { const hint = document.createElement('div'); hint.className = 'object-builder-secondary-hint'; hint.textContent = text; return hint; }
  private row(labelText: string, input: HTMLElement): HTMLElement { const row = document.createElement('div'); row.className = 'object-builder-row'; const label = document.createElement('label'); label.textContent = labelText; row.append(label, input); return row; }
  private textInput(name: string, value: string): HTMLInputElement { const input = document.createElement('input'); input.type = 'text'; input.name = name; input.value = value; return input; }
  private value(name: string): string { return (this.form.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null)?.value ?? ''; }
  private checked(name: string): boolean { return (this.form.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.checked ?? false); }
}
