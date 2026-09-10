type ModModel =
  | 'lfo'
  | 'noise.white'
  | 'noise.dust'
  | 'noise.clocked'
  | 'noise.fractal'
  | 'swell'
  | 'dices';

type RateUnit = 'hz' | 'beat' | 'sec' | 'ms';
type LfoWaveform = 'sine' | 'triangle' | 'sawtooth' | 'ramp' | 'square';

type LfoLane = {
  waveform: LfoWaveform;
  rateMode: 'same' | 'multiply' | 'divide';
  factor: number;
  phase: number;
  level: number;
};

const MODELS: readonly ModModel[] = [
  'lfo',
  'noise.white',
  'noise.dust',
  'noise.clocked',
  'noise.fractal',
  'swell',
  'dices',
];

export class ModBuilderPanel {
  private model: ModModel = 'lfo';
  private view = false;

  private rateValue = 4;
  private rateUnit: RateUnit = 'sec';

  private lfoOutputs: LfoLane[] = [
    { waveform: 'triangle', rateMode: 'same', factor: 1, phase: 0, level: 100 },
  ];

  private density = 50;

  private swell = {
    slope: 50,
    shape: 50,
    smooth: 50,
    shift: 50,
    relation: 'phase' as 'phase' | 'amplitude' | 'frequency' | 'different',
    range: 'control' as 'control' | 'audio',
  };

  private dices = {
    spread: 50,
    bias: 50,
    steps: 50,
    deja: 0,
    length: 8,
    diversity: 50,
  };

  constructor(
    private readonly form: HTMLElement,
    private readonly onChange: () => void,
    private readonly initialName = 'myMod',
  ) {}

  mount(): void {
    this.form.replaceChildren();

    const title = document.createElement('h2');
    title.textContent = 'MODULATOR';
    this.form.append(title);

    this.form.append(this.row('Name', this.textInput('name', this.initialName)));

    const model = document.createElement('select');
    model.name = 'modModel';
    for (const id of MODELS) model.append(new Option(this.modelLabel(id), id));
    const composite = new Option('Composite — code only', 'composite');
    composite.disabled = true;
    model.append(composite);
    model.value = this.model;
    model.addEventListener('change', () => {
      this.model = model.value as ModModel;
      this.setRateDefault();
      this.renderModel();
      this.onChange();
    });
    this.form.append(this.row('Model', model));

    const view = document.createElement('input');
    view.type = 'checkbox';
    view.checked = this.view;
    view.addEventListener('change', () => {
      this.view = view.checked;
      this.onChange();
    });
    this.form.append(this.row('View', view));

    const workspace = document.createElement('section');
    workspace.className = 'object-builder-section object-builder-mod-workspace';
    workspace.dataset.modWorkspace = 'true';
    this.form.append(workspace);

    this.renderModel();
  }

  closeSecondaryModal(): void {}

  validate(): string | null {
    const name = this.value('name').trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return 'MOD name must be a valid identifier.';

    if (this.supportsRate() && (!(this.rateValue > 0) || !Number.isFinite(this.rateValue))) {
      return 'MOD rate must be greater than zero.';
    }

    if (this.model === 'lfo') {
      if (this.lfoOutputs.length < 1 || this.lfoOutputs.length > 4) return 'LFO expects from one to four outputs.';
      for (const lane of this.lfoOutputs) {
        if (lane.rateMode !== 'same' && (!(lane.factor > 0) || !Number.isFinite(lane.factor))) {
          return 'LFO output rate factor must be greater than zero.';
        }
      }
    }

    return null;
  }

  generateCode(): string {
    const name = this.value('name').trim() || this.initialName;
    const lines = [`MOD ${name}${this.view ? ' WITH VIEW' : ''}:`, `    model ${this.model}`];

    if (this.supportsRate()) lines.push(`    rate ${this.formatNumber(this.rateValue)} ${this.rateUnit}`);

    if (this.model === 'lfo') {
      this.lfoOutputs.forEach((lane, index) => {
        let value = lane.waveform;
        if (lane.rateMode === 'multiply') value += ` *${this.formatNumber(lane.factor)}`;
        if (lane.rateMode === 'divide') value += ` /${this.formatNumber(lane.factor)}`;
        const modifiers: string[] = [];
        if (lane.phase !== 0) modifiers.push(`phase ${this.formatNumber(lane.phase)}`);
        if (lane.level !== 100) modifiers.push(`level ${this.formatNumber(lane.level)}`);
        if (modifiers.length) value += ` with ${modifiers.join(', ')}`;
        lines.push(`    out${index + 1} ${value}`);
      });
    } else if (this.model === 'noise.dust') {
      lines.push(`    density ${this.formatNumber(this.density)}`);
    } else if (this.model === 'swell') {
      lines.push(`    slope ${this.formatNumber(this.swell.slope)}`);
      lines.push(`    shape ${this.formatNumber(this.swell.shape)}`);
      lines.push(`    smooth ${this.formatNumber(this.swell.smooth)}`);
      lines.push(`    shift ${this.formatNumber(this.swell.shift)}`);
      lines.push(`    relation ${this.swell.relation}`);
      lines.push(`    range ${this.swell.range}`);
    } else if (this.model === 'dices') {
      lines.push(`    spread ${this.formatNumber(this.dices.spread)}`);
      lines.push(`    bias ${this.formatNumber(this.dices.bias)}`);
      lines.push(`    steps ${this.formatNumber(this.dices.steps)}`);
      lines.push(`    deja ${this.formatNumber(this.dices.deja)}`);
      lines.push(`    length ${this.dices.length}`);
      lines.push(`    diversity ${this.formatNumber(this.dices.diversity)}`);
    }

    return lines.join('\n');
  }

  previewDescription(): string {
    return `${this.model.toUpperCase()} · ${this.outputLabels().join(' · ')}`;
  }

  renderOutputPreview(): HTMLElement {
    const root = document.createElement('div');
    root.className = 'object-builder-mod-output-preview';

    const title = document.createElement('strong');
    title.textContent = 'MOD OUTPUTS';
    root.append(title);

    const outputs = document.createElement('div');
    outputs.className = 'object-builder-mod-output-list';
    for (const label of this.outputLabels()) {
      const node = document.createElement('span');
      node.textContent = label;
      outputs.append(node);
    }
    root.append(outputs);

    const hint = document.createElement('p');
    hint.textContent = 'Reference these outputs from compatible parameters using the MOD name and port.';
    root.append(hint);
    return root;
  }

  private renderModel(): void {
    const workspace = this.form.querySelector<HTMLElement>('[data-mod-workspace]');
    if (!workspace) return;
    workspace.replaceChildren();

    const head = document.createElement('div');
    head.className = 'object-builder-mod-head';
    head.innerHTML = `<div><strong>${this.modelLabel(this.model).toUpperCase()}</strong><span>${this.modelMeta()}</span></div>`;
    workspace.append(head);

    if (this.supportsRate()) workspace.append(this.renderRate());

    if (this.model === 'lfo') {
      workspace.append(this.renderLfo());
      return;
    }

    if (this.model === 'noise.dust') {
      const block = this.block('NOISE');
      block.append(this.slider('Density', 0, 100, this.density, (value) => { this.density = value; }));
      workspace.append(block);
      return;
    }

    if (this.model === 'noise.white' || this.model === 'noise.fractal' || this.model === 'noise.clocked') {
      const notice = document.createElement('div');
      notice.className = 'object-builder-notice';
      notice.textContent = this.model === 'noise.clocked'
        ? 'CLOCKED noise uses RATE as its clock frequency and exposes one modulation output.'
        : 'This noise model has no additional public parameters and exposes one modulation output.';
      workspace.append(notice);
      return;
    }

    if (this.model === 'swell') {
      workspace.append(this.renderSwell());
      return;
    }

    workspace.append(this.renderDices());
  }

  private renderRate(): HTMLElement {
    const block = this.block('RATE');
    const grid = document.createElement('div');
    grid.className = 'object-builder-mod-rate-grid';

    const amount = document.createElement('input');
    amount.type = 'number';
    amount.min = '0.001';
    amount.step = '0.001';
    amount.value = String(this.rateValue);
    amount.addEventListener('input', () => {
      this.rateValue = Number(amount.value);
      this.onChange();
    });

    const unit = document.createElement('select');
    for (const value of ['hz', 'beat', 'sec', 'ms'] as const) {
      unit.append(new Option(value === 'beat' ? 'BEAT' : value.toUpperCase(), value));
    }
    unit.value = this.rateUnit;
    unit.addEventListener('change', () => {
      this.rateUnit = unit.value as RateUnit;
      this.onChange();
    });

    grid.append(this.field('Value', amount), this.field('Unit', unit));
    block.append(grid);
    return block;
  }

  private renderLfo(): HTMLElement {
    const block = this.block('OUTPUTS');

    const list = document.createElement('div');
    list.className = 'object-builder-mod-lfo-list';

    this.lfoOutputs.forEach((lane, index) => {
      const row = document.createElement('div');
      row.className = 'object-builder-mod-lfo-row';

      const port = document.createElement('strong');
      port.textContent = `OUT${index + 1}`;

      const waveform = document.createElement('select');
      for (const value of ['sine', 'triangle', 'sawtooth', 'ramp', 'square'] as const) {
        waveform.append(new Option(value.toUpperCase(), value));
      }
      waveform.value = lane.waveform;
      waveform.addEventListener('change', () => {
        lane.waveform = waveform.value as LfoWaveform;
        this.onChange();
      });

      const rateMode = document.createElement('select');
      rateMode.append(new Option('BASE RATE', 'same'));
      rateMode.append(new Option('MULTIPLY', 'multiply'));
      rateMode.append(new Option('DIVIDE', 'divide'));
      rateMode.value = lane.rateMode;
      rateMode.addEventListener('change', () => {
        lane.rateMode = rateMode.value as LfoLane['rateMode'];
        factor.disabled = lane.rateMode === 'same';
        this.onChange();
      });

      const factor = document.createElement('input');
      factor.type = 'number';
      factor.min = '0.001';
      factor.step = '0.001';
      factor.value = String(lane.factor);
      factor.disabled = lane.rateMode === 'same';
      factor.addEventListener('input', () => {
        lane.factor = Number(factor.value);
        this.onChange();
      });

      const phase = document.createElement('input');
      phase.type = 'number';
      phase.step = '1';
      phase.value = String(lane.phase);
      phase.addEventListener('input', () => {
        lane.phase = Number(phase.value);
        this.onChange();
      });

      const level = document.createElement('input');
      level.type = 'range';
      level.min = '0';
      level.max = '100';
      level.step = '1';
      level.value = String(lane.level);

      const levelOut = document.createElement('output');
      levelOut.textContent = `${lane.level}%`;
      level.addEventListener('input', () => {
        lane.level = Number(level.value);
        levelOut.textContent = `${level.value}%`;
        this.onChange();
      });

      const levelWrap = document.createElement('div');
      levelWrap.className = 'object-builder-mod-level';
      levelWrap.append(level, levelOut);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'object-builder-small-button';
      remove.textContent = '×';
      remove.disabled = this.lfoOutputs.length === 1;
      remove.addEventListener('click', () => {
        this.lfoOutputs.splice(index, 1);
        this.renderModel();
        this.onChange();
      });

      row.append(
        port,
        this.field('Wave', waveform),
        this.field('Rate', rateMode),
        this.field('Factor', factor),
        this.field('Phase °', phase),
        this.field('Level', levelWrap),
        remove,
      );
      list.append(row);
    });

    block.append(list);

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'object-builder-small-button object-builder-mod-add-output';
    add.textContent = '+ ADD OUTPUT';
    add.disabled = this.lfoOutputs.length >= 4;
    add.addEventListener('click', () => {
      if (this.lfoOutputs.length >= 4) return;
      this.lfoOutputs.push({ waveform: 'triangle', rateMode: 'same', factor: 1, phase: 0, level: 100 });
      this.renderModel();
      this.onChange();
    });
    block.append(add);

    return block;
  }

  private renderSwell(): HTMLElement {
    const block = this.block('SHAPE');

    const grid = document.createElement('div');
    grid.className = 'object-builder-mod-param-grid';
    grid.append(
      this.slider('Slope', 0, 100, this.swell.slope, (value) => { this.swell.slope = value; }),
      this.slider('Shape', 0, 100, this.swell.shape, (value) => { this.swell.shape = value; }),
      this.slider('Smooth', 0, 100, this.swell.smooth, (value) => { this.swell.smooth = value; }),
      this.slider('Shift', 0, 100, this.swell.shift, (value) => { this.swell.shift = value; }),
    );
    block.append(grid);

    const modes = document.createElement('div');
    modes.className = 'object-builder-mod-rate-grid';

    const relation = document.createElement('select');
    for (const value of ['phase', 'amplitude', 'frequency', 'different'] as const) {
      relation.append(new Option(value.toUpperCase(), value));
    }
    relation.value = this.swell.relation;
    relation.addEventListener('change', () => {
      this.swell.relation = relation.value as typeof this.swell.relation;
      this.onChange();
    });

    const range = document.createElement('select');
    range.append(new Option('CONTROL', 'control'));
    range.append(new Option('AUDIO', 'audio'));
    range.value = this.swell.range;
    range.addEventListener('change', () => {
      this.swell.range = range.value as typeof this.swell.range;
      this.onChange();
    });

    modes.append(this.field('Relation', relation), this.field('Range', range));
    block.append(modes);
    return block;
  }

  private renderDices(): HTMLElement {
    const block = this.block('RANDOM VOLTAGE');

    const grid = document.createElement('div');
    grid.className = 'object-builder-mod-param-grid';
    grid.append(
      this.slider('Spread', 0, 100, this.dices.spread, (value) => { this.dices.spread = value; }),
      this.slider('Bias', 0, 100, this.dices.bias, (value) => { this.dices.bias = value; }),
      this.slider('Steps', 0, 100, this.dices.steps, (value) => { this.dices.steps = value; }),
      this.slider('Déjà', 0, 100, this.dices.deja, (value) => { this.dices.deja = value; }),
      this.slider('Diversity', 0, 100, this.dices.diversity, (value) => { this.dices.diversity = value; }),
    );
    block.append(grid);

    const length = document.createElement('input');
    length.type = 'number';
    length.min = '1';
    length.max = '16';
    length.step = '1';
    length.value = String(this.dices.length);
    length.addEventListener('input', () => {
      this.dices.length = Number(length.value);
      this.onChange();
    });
    block.append(this.field('Loop length', length));

    return block;
  }

  private slider(labelText: string, min: number, max: number, value: number, set: (value: number) => void): HTMLElement {
    const row = document.createElement('label');
    row.className = 'object-builder-mod-slider';

    const label = document.createElement('span');
    label.textContent = labelText.toUpperCase();

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = '1';
    input.value = String(value);

    const output = document.createElement('output');
    output.textContent = String(value);

    input.addEventListener('input', () => {
      const next = Number(input.value);
      set(next);
      output.textContent = input.value;
      this.onChange();
    });

    row.append(label, input, output);
    return row;
  }

  private supportsRate(): boolean {
    return this.model === 'lfo'
      || this.model === 'noise.clocked'
      || this.model === 'swell'
      || this.model === 'dices';
  }

  private setRateDefault(): void {
    if (this.model === 'noise.clocked') {
      this.rateValue = 2;
      this.rateUnit = 'beat';
    } else if (this.model === 'lfo') {
      this.rateValue = 4;
      this.rateUnit = 'sec';
    } else {
      this.rateValue = 4;
      this.rateUnit = 'sec';
    }
  }

  private outputLabels(): string[] {
    if (this.model === 'lfo') return this.lfoOutputs.map((_, index) => `out${index + 1}`);
    if (this.model === 'dices') return ['x1', 'x2', 'x3', 'y'];
    if (this.model === 'swell') return ['out1', 'out2', 'out3', 'out4'];
    return ['out'];
  }

  private block(titleText: string): HTMLElement {
    const block = document.createElement('div');
    block.className = 'object-builder-mod-block';
    const title = document.createElement('h3');
    title.textContent = titleText;
    block.append(title);
    return block;
  }

  private field(labelText: string, control: HTMLElement): HTMLElement {
    const label = document.createElement('label');
    label.className = 'object-builder-field object-builder-mod-field';
    const text = document.createElement('span');
    text.textContent = labelText.toUpperCase();
    label.append(text, control);
    return label;
  }

  private row(labelText: string, control: HTMLElement): HTMLElement {
    const row = document.createElement('div');
    row.className = 'object-builder-row';
    const label = document.createElement('label');
    label.textContent = labelText;
    row.append(label, control);
    return row;
  }

  private textInput(name: string, value: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.name = name;
    input.value = value;
    input.addEventListener('input', this.onChange);
    return input;
  }

  private value(name: string): string {
    return this.form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? '';
  }

  private modelLabel(model: ModModel): string {
    if (model.startsWith('noise.')) return `Noise ${model.slice(6)}`;
    if (model === 'lfo') return 'LFO';
    if (model === 'swell') return 'Swell';
    return 'Dices';
  }

  private modelMeta(): string {
    if (this.model === 'lfo') return 'Up to four waveform outputs with independent phase, level and rate relationship.';
    if (this.model === 'noise.dust') return 'Dust noise modulation with density control.';
    if (this.model === 'noise.clocked') return 'Clocked random modulation driven by the common MOD rate.';
    if (this.model === 'noise.fractal') return 'Fractal continuous noise modulation.';
    if (this.model === 'noise.white') return 'White continuous noise modulation.';
    if (this.model === 'swell') return 'Tides-derived synchronized modulation with four outputs.';
    return 'Marbles-derived random-voltage modulation with X/Y outputs.';
  }

  private formatNumber(value: number): string {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
  }
}
