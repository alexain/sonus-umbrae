import { RoutingPanel } from './routing-panel';
import { PitchEditor, pitchStateFromValue, type PitchEditorState } from './pitch-editor';

type FxModel =
  | 'mist.grain'
  | 'mist.stretch'
  | 'mist.delay'
  | 'mist.spectral'
  | 'mist.reverb'
  | 'mist.resonator'
  | 'mist.repeat'
  | 'mist.smear'
  | 'sky'
  | 'delay';

type SliderSpec = {
  id: string;
  label: string;
  min: number;
  max: number;
  value: number;
};

const MIST_MODELS: readonly FxModel[] = [
  'mist.grain',
  'mist.stretch',
  'mist.delay',
  'mist.spectral',
  'mist.reverb',
  'mist.resonator',
  'mist.repeat',
  'mist.smear',
];

const MIST_PARAMS: readonly SliderSpec[] = [
  { id: 'position', label: 'Position', min: 0, max: 100, value: 50 },
  { id: 'size', label: 'Size', min: 0, max: 100, value: 50 },
  { id: 'density', label: 'Density', min: 0, max: 100, value: 50 },
  { id: 'texture', label: 'Texture', min: 0, max: 100, value: 50 },
  { id: 'mix', label: 'Mix', min: 0, max: 100, value: 100 },
  { id: 'spread', label: 'Spread', min: 0, max: 100, value: 50 },
  { id: 'feedback', label: 'Feedback', min: 0, max: 100, value: 0 },
  { id: 'reverb', label: 'Reverb', min: 0, max: 100, value: 0 },
];

const SKY_PARAMS: readonly SliderSpec[] = [
  { id: 'position', label: 'Predelay / Position', min: 0, max: 100, value: 50 },
  { id: 'size', label: 'Size', min: 0, max: 100, value: 50 },
  { id: 'density', label: 'Bloom / Density', min: 0, max: 100, value: 50 },
  { id: 'texture', label: 'Damping / Texture', min: 0, max: 100, value: 50 },
  { id: 'mix', label: 'Mix', min: 0, max: 100, value: 100 },
  { id: 'spread', label: 'Width / Spread', min: 0, max: 100, value: 50 },
  { id: 'feedback', label: 'Decay / Feedback', min: 0, max: 100, value: 0 },
  { id: 'reverb', label: 'Motion / Reverb', min: 0, max: 100, value: 0 },
];

const DELAY_PARAMS: readonly SliderSpec[] = [
  { id: 'mix', label: 'Mix', min: 0, max: 100, value: 50 },
  { id: 'spread', label: 'Spread', min: 0, max: 100, value: 50 },
  { id: 'feedback', label: 'Feedback', min: 0, max: 100, value: 35 },
  { id: 'reverse', label: 'Reverse', min: 0, max: 100, value: 0 },
  { id: 'tape', label: 'Tape', min: 0, max: 100, value: 0 },
  { id: 'diffusion', label: 'Diffusion', min: 0, max: 100, value: 0 },
  { id: 'pingpong', label: 'Ping-pong', min: 0, max: 100, value: 0 },
];

export class FxBuilderPanel {
  private model: FxModel = 'mist.reverb';
  private view = false;
  private params = new Map<string, number>();
  private delayTime = 1;
  private delayTimeUnit: 'ms' | 'sec' | 'beat' = 'beat';
  private delayLines = 1;
  private delayLoose = 25;
  private mistPitch: PitchEditorState = pitchStateFromValue('pitch notes [C4]');
  private modal: HTMLElement | null = null;
  private routing: RoutingPanel;

  constructor(
    private readonly form: HTMLElement,
    private readonly editor: HTMLTextAreaElement,
    private readonly onChange: () => void,
    private readonly destinations: () => string[],
    private readonly initialName = 'myFx',
  ) {
    this.routing = new RoutingPanel({
      sources: () => [{ id: 'L', label: 'L' }, { id: 'R', label: 'R' }],
      destinations: this.destinations,
      defaultConnections: () => [
        { source: 'L', destination: 'MAIN.L' },
        { source: 'R', destination: 'MAIN.R' },
      ],
      onChange: this.onChange,
      expandedTitle: 'FX OUTPUT ROUTING',
    });
    this.resetParams();
  }

  mount(): void {
    this.form.replaceChildren();

    const title = document.createElement('h2');
    title.textContent = 'EFFECT';
    this.form.append(title);

    this.form.append(this.row('Name', this.textInput('name', this.initialName)));

    const model = document.createElement('select');
    model.name = 'fxModel';
    for (const id of [...MIST_MODELS, 'sky', 'delay'] as FxModel[]) {
      model.append(new Option(this.modelLabel(id), id));
    }
    model.value = this.model;
    model.addEventListener('change', () => {
      this.model = model.value as FxModel;
      this.resetParams();
      this.renderEditor();
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

    const inputNotice = document.createElement('div');
    inputNotice.className = 'object-builder-notice object-builder-fx-input-notice';
    inputNotice.innerHTML = '<strong>STEREO INPUT</strong><span>Route an existing source to this FX using its .L/.R inputs after the object is added.</span>';
    this.form.append(inputNotice);

    const workspace = document.createElement('section');
    workspace.className = 'object-builder-section object-builder-fx-workspace';
    workspace.dataset.fxWorkspace = 'true';
    this.form.append(workspace);

    this.renderEditor();
  }

  closeSecondaryModal(): void {
    this.modal?.remove();
    this.modal = null;
    this.routing.closeExpanded();
  }

  validate(): string | null {
    const name = this.value('name').trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return 'FX name must be a valid identifier.';
    if (this.model === 'delay') {
      if (!(this.delayTime > 0)) return 'Delay time must be greater than zero.';
      if (!Number.isInteger(this.delayLines) || this.delayLines < 1 || this.delayLines > 8) return 'Delay lines must be an integer from 1 to 8.';
    }
    return null;
  }

  generateCode(): string {
    const name = this.value('name').trim() || this.initialName;
    const header = `FX ${name}${this.view ? ' with view' : ''}:`;
    const lines = [header, `    model ${this.model}`];

    if (this.model === 'delay') {
      lines.push(`    time ${this.formatNumber(this.delayTime)} ${this.delayTimeUnit}`);
      lines.push(`    lines ${this.delayLines}`);
      for (const spec of DELAY_PARAMS) {
        const value = this.params.get(spec.id) ?? spec.value;
        if (spec.id === 'spread') lines.push(`    spread ${this.formatNumber(value)} with loose ${this.delayLoose}`);
        else lines.push(`    ${spec.id} ${this.formatNumber(value)}`);
      }
    } else {
      for (const spec of this.currentSpecs()) {
        lines.push(`    ${spec.id} ${this.formatNumber(this.params.get(spec.id) ?? spec.value)}`);
      }
      if (this.model.startsWith('mist.')) lines.push(`    ${this.mistPitch.value}`);
    }

    if (this.routing.getMode() === 'disabled') {
      lines.push('    OUT MUTE');
    } else if (this.routing.getMode() === 'custom') {
      for (const route of this.routing.getConnections()) {
        lines.push(`    OUT ${route.source} TO ${route.destination}`);
      }
    }
    return lines.join('\n');
  }

  renderRoutingPreview(): HTMLElement {
    return this.routing.renderPreview();
  }

  previewDescription(): string {
    return `${this.model.toUpperCase()} · STEREO FX`;
  }

  private renderEditor(): void {
    const workspace = this.form.querySelector<HTMLElement>('[data-fx-workspace]');
    if (!workspace) return;
    workspace.replaceChildren();

    const head = document.createElement('div');
    head.className = 'object-builder-fx-head';
    const meta = this.modelMeta();
    head.innerHTML = `<div><strong>${this.modelLabel(this.model).toUpperCase()}</strong><span>${meta}</span></div>`;
    workspace.append(head);

    if (this.model === 'delay') {
      const timeSection = document.createElement('div');
      timeSection.className = 'object-builder-fx-block';
      const blockTitle = document.createElement('h3');
      blockTitle.textContent = 'TIME';
      timeSection.append(blockTitle);

      const timeGrid = document.createElement('div');
      timeGrid.className = 'object-builder-fx-time-grid';

      const amount = document.createElement('input');
      amount.type = 'number';
      amount.min = '0.001';
      amount.step = '0.001';
      amount.value = String(this.delayTime);
      amount.addEventListener('input', () => {
        this.delayTime = Number(amount.value);
        this.onChange();
      });

      const unit = document.createElement('select');
      for (const value of ['ms', 'sec', 'beat'] as const) unit.append(new Option(value.toUpperCase(), value));
      unit.value = this.delayTimeUnit;
      unit.addEventListener('change', () => {
        this.delayTimeUnit = unit.value as 'ms' | 'sec' | 'beat';
        this.onChange();
      });

      const lines = document.createElement('input');
      lines.type = 'number';
      lines.min = '1';
      lines.max = '8';
      lines.step = '1';
      lines.value = String(this.delayLines);
      lines.addEventListener('input', () => {
        this.delayLines = Number(lines.value);
        this.onChange();
      });

      timeGrid.append(this.field('Time', amount), this.field('Unit', unit), this.field('Lines', lines));
      timeSection.append(timeGrid);
      workspace.append(timeSection);
    }

    if (this.model.startsWith('mist.')) {
      const pitchBlock = document.createElement('div');
      pitchBlock.className = 'object-builder-fx-block';

      const pitchTitle = document.createElement('h3');
      pitchTitle.textContent = 'PITCH';

      const pitchRow = document.createElement('div');
      pitchRow.className = 'object-builder-action-row';
      const pitchInfo = document.createElement('div');
      const pitchLabel = document.createElement('strong');
      pitchLabel.className = 'object-builder-action-label';
      pitchLabel.textContent = 'MUSICAL PITCH';
      const pitchSummary = document.createElement('span');
      pitchSummary.className = 'object-builder-action-summary';
      pitchSummary.textContent = this.pitchSummary();
      pitchInfo.append(pitchLabel, pitchSummary);

      const pitchButton = document.createElement('button');
      pitchButton.type = 'button';
      pitchButton.textContent = 'EDIT PITCH';
      pitchButton.addEventListener('click', () => this.openPitchEditor(pitchSummary));

      pitchRow.append(pitchInfo, pitchButton);
      pitchBlock.append(pitchTitle, pitchRow);
      workspace.append(pitchBlock);
    }

    const paramsBlock = document.createElement('div');
    paramsBlock.className = 'object-builder-fx-block';
    const paramsTitle = document.createElement('h3');
    paramsTitle.textContent = this.model === 'delay' ? 'CHARACTER' : 'PARAMETERS';
    paramsBlock.append(paramsTitle);

    const grid = document.createElement('div');
    grid.className = 'object-builder-fx-param-grid';
    for (const spec of this.currentSpecs()) grid.append(this.slider(spec));
    paramsBlock.append(grid);
    workspace.append(paramsBlock);

    if (this.model === 'delay') {
      const loose = document.createElement('input');
      loose.type = 'range';
      loose.min = '0';
      loose.max = '100';
      loose.step = '1';
      loose.value = String(this.delayLoose);
      const output = document.createElement('output');
      output.textContent = loose.value;
      loose.addEventListener('input', () => {
        this.delayLoose = Number(loose.value);
        output.textContent = loose.value;
        this.onChange();
      });
      const row = document.createElement('label');
      row.className = 'object-builder-fx-slider';
      const label = document.createElement('span');
      label.textContent = 'SPREAD LOOSE';
      row.append(label, loose, output);
      paramsBlock.append(row);

      const advanced = document.createElement('div');
      advanced.className = 'object-builder-secondary-hint';
      advanced.textContent = 'Delay pitch-shift probability is intentionally left to code for now; its DSL supports semitone, octave, or scale sets.';
      workspace.append(advanced);
    }
  }

  private slider(spec: SliderSpec): HTMLElement {
    const row = document.createElement('label');
    row.className = 'object-builder-fx-slider';

    const label = document.createElement('span');
    label.textContent = spec.label.toUpperCase();

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = '1';
    input.value = String(this.params.get(spec.id) ?? spec.value);

    const output = document.createElement('output');
    output.textContent = input.value;

    input.addEventListener('input', () => {
      this.params.set(spec.id, Number(input.value));
      output.textContent = input.value;
      this.onChange();
    });

    row.append(label, input, output);
    return row;
  }

  private openPitchEditor(summary: HTMLElement): void {
    const pitchEditor = new PitchEditor({
      editor: this.editor,
      state: this.mistPitch,
      allowReference: true,
      notesHint: 'C4 is the zero-semitone reference for Mist pitch. Notes, scales, frequencies and compatible references use the normal Sonus pitch reader.',
    });

    const body = document.createElement('div');
    body.className = 'object-builder-pitch-editor';
    body.append(pitchEditor.mount());

    this.openSecondary('MIST PITCH', body, () => {
      this.mistPitch = pitchEditor.getState();
      summary.textContent = this.pitchSummary();
      this.onChange();
    });

    this.modal?.querySelector('.object-builder-secondary-dialog')?.classList.add(
      'object-builder-pitch-dialog',
      'object-builder-pitch-only-dialog',
    );
  }

  private openSecondary(titleText: string, body: HTMLElement, apply: () => void): void {
    this.modal?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'object-builder-secondary-overlay';
    overlay.innerHTML = `<section class="object-builder-secondary-dialog" role="dialog" aria-modal="true">
      <header><strong></strong><button type="button" data-close>×</button></header>
      <div class="object-builder-secondary-body"></div>
      <footer><button type="button" data-cancel>CANCEL</button><button type="button" class="primary" data-apply>APPLY</button></footer>
    </section>`;
    overlay.querySelector('strong')!.textContent = titleText;
    overlay.querySelector('.object-builder-secondary-body')!.append(body);
    document.body.append(overlay);
    this.modal = overlay;

    const close = (): void => {
      overlay.remove();
      if (this.modal === overlay) this.modal = null;
    };
    overlay.querySelector('[data-close]')!.addEventListener('click', close);
    overlay.querySelector('[data-cancel]')!.addEventListener('click', close);
    overlay.querySelector('[data-apply]')!.addEventListener('click', () => {
      apply();
      close();
    });
    overlay.addEventListener('pointerdown', (event) => {
      if (event.target === overlay) close();
    });
  }

  private pitchSummary(): string {
    return this.mistPitch.value.replace(/^pitch\s+/i, '');
  }

  private currentSpecs(): readonly SliderSpec[] {
    if (this.model === 'sky') return SKY_PARAMS;
    if (this.model === 'delay') return DELAY_PARAMS;
    return MIST_PARAMS;
  }

  private resetParams(): void {
    this.params.clear();
    for (const spec of this.currentSpecs()) this.params.set(spec.id, spec.value);
    if (this.model === 'delay') {
      this.delayTime = 1;
      this.delayTimeUnit = 'beat';
      this.delayLines = 1;
      this.delayLoose = 25;
    }
  }

  private modelLabel(model: FxModel): string {
    if (model === 'sky') return 'Sky Reverb';
    if (model === 'delay') return 'Delay';
    return model;
  }

  private modelMeta(): string {
    if (this.model === 'sky') return 'CloudSeed-based stereo reverb';
    if (this.model === 'delay') return 'Multiline stereo delay';
    return 'Mist / SuperParasites effect model';
  }

  private value(name: string): string {
    return this.form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? '';
  }

  private textInput(name: string, value: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.name = name;
    input.value = value;
    input.addEventListener('input', this.onChange);
    return input;
  }

  private row(labelText: string, control: HTMLElement): HTMLElement {
    const row = document.createElement('div');
    row.className = 'object-builder-row';
    const label = document.createElement('label');
    label.textContent = labelText;
    row.append(label, control);
    return row;
  }

  private field(labelText: string, control: HTMLElement): HTMLElement {
    const label = document.createElement('label');
    label.className = 'object-builder-field';
    const text = document.createElement('span');
    text.textContent = labelText.toUpperCase();
    label.append(text, control);
    return label;
  }

  private formatNumber(value: number): string {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
  }
}
