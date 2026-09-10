import { TimingEditor, timingStateFromValue, type TimingEditorState } from './timing-editor';

type DrumSource = 'kick' | 'snare' | 'clap' | 'hihat' | 'openhat' | 'lowtom' | 'hightom' | 'sample';

type DrumParams = {
  level: number;
  pan: number;
  tune: number;
  decay: number;
  transient: number;
  snappy: number;
  color: number;
  noise: number;
  humanize: number;
};

type KitEntry = {
  alias: string;
  source: DrumSource;
  sampleAlias: string | null;
  defaults: DrumParams;
};

type KitDefinition = {
  name: string;
  entries: KitEntry[];
};

type LaneState = {
  id: number;
  alias: string;
  source: DrumSource;
  sampleAlias: string | null;
  defaults: DrumParams;
  params: DrumParams;
  timing: TimingEditorState;
};

const DEFAULTS: DrumParams = {
  level: 100, pan: 0, tune: 0, decay: 70,
  transient: 30, snappy: 75, color: 50, noise: 50, humanize: 0,
};

const SONUS606: KitDefinition = {
  name: 'sonus606',
  entries: [
    ['kick', 'kick', 70],
    ['snare', 'snare', 70],
    ['clap', 'clap', 70],
    ['hihat', 'hihat', 30],
    ['openhat', 'openhat', 75],
    ['lowtom', 'lowtom', 70],
    ['hightom', 'hightom', 70],
  ].map(([alias, source, decay]) => ({
    alias: String(alias),
    source: source as DrumSource,
    sampleAlias: null,
    defaults: { ...DEFAULTS, decay: Number(decay) },
  })),
};

export class DrumkitBuilderPanel {
  private kitSelect!: HTMLSelectElement;
  private laneList!: HTMLElement;
  private viewEnabled = false;
  private viewSteps = 16;
  private lanes: LaneState[] = [];
  private nextLaneId = 1;
  private modal: HTMLElement | null = null;

  constructor(
    private readonly form: HTMLElement,
    private readonly editor: HTMLTextAreaElement,
    private readonly onChange: () => void,
    private readonly initialName = 'myDrumkit',
  ) {}

  mount(): void {
    this.form.replaceChildren();

    const title = document.createElement('h2');
    title.textContent = 'DRUMKIT';
    this.form.append(title);
    this.form.append(this.row('Name', this.textInput('name', this.initialName)));

    const kitRow = document.createElement('div');
    kitRow.className = 'object-builder-row';
    const kitLabel = document.createElement('label');
    kitLabel.textContent = 'Kit';
    this.kitSelect = document.createElement('select');
    this.kitSelect.name = 'drumkitKit';
    for (const kit of this.findKits()) this.kitSelect.append(new Option(kit.name, kit.name));
    this.kitSelect.value = 'sonus606';
    this.kitSelect.addEventListener('change', () => {
      this.resetLanesForKit();
      this.renderLanes();
      this.onChange();
    });
    kitRow.append(kitLabel, this.kitSelect);
    this.form.append(kitRow);

    const viewRow = document.createElement('div');
    viewRow.className = 'object-builder-drumkit-view-row';
    const viewToggle = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = this.viewEnabled;
    checkbox.addEventListener('change', () => {
      this.viewEnabled = checkbox.checked;
      steps.disabled = !this.viewEnabled;
      this.onChange();
    });
    viewToggle.append(checkbox, document.createTextNode(' WITH VIEW'));
    const steps = document.createElement('select');
    for (let n = 4; n <= 64; n += 4) steps.append(new Option(`${n} STEPS`, String(n)));
    steps.value = String(this.viewSteps);
    steps.disabled = true;
    steps.addEventListener('change', () => {
      this.viewSteps = Number(steps.value);
      this.onChange();
    });
    viewRow.append(viewToggle, steps);
    this.form.append(viewRow);

    const section = document.createElement('section');
    section.className = 'object-builder-section object-builder-drumkit-section';
    const head = document.createElement('div');
    head.className = 'object-builder-drumkit-head';
    head.innerHTML = '<div><strong>LANES</strong><span>Add only the sounds you want to use from the selected KIT</span></div>';
    section.append(head);

    this.laneList = document.createElement('div');
    this.laneList.className = 'object-builder-drumkit-lanes';
    section.append(this.laneList);

    const add = this.button('+ ADD LANE', () => this.addLane());
    add.className = 'object-builder-button object-builder-drumkit-add';
    section.append(add);
    this.form.append(section);

    this.resetLanesForKit();
    this.renderLanes();
  }

  closeSecondaryModal(): void {
    this.modal?.remove();
    this.modal = null;
  }

  validate(): string | null {
    const name = this.value('name').trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return 'DRUMKIT name must be a valid identifier.';
    if (!this.kitSelect.value) return 'DRUMKIT requires a KIT.';
    if (this.lanes.length === 0) return 'DRUMKIT requires at least one lane.';
    return null;
  }

  generateCode(): string {
    const name = this.value('name').trim() || this.initialName;
    const view = this.viewEnabled ? ` with view ${this.viewSteps} steps` : '';
    const lines = [`DRUMKIT ${name}${view}:`, `    KIT ${this.kitSelect.value}`];

    for (const lane of this.lanes) {
      const modifiers = this.serializeParams(lane);
      const withParams = modifiers.length ? ` WITH ${modifiers.join(', ')}` : '';
      const timing = lane.timing.enabled && lane.timing.value ? ` ${lane.timing.value.toUpperCase()}` : '';
      lines.push(`    ${lane.alias}${withParams}${timing}`);
    }
    return lines.join('\n');
  }

  previewDescription(): string {
    return `${this.kitSelect.value.toUpperCase()} · ${this.lanes.length} LANES`;
  }

  private resetLanesForKit(): void {
    this.lanes = [];
  }

  private makeLane(entry: KitEntry): LaneState {
    return {
      id: this.nextLaneId++,
      alias: entry.alias,
      source: entry.source,
      sampleAlias: entry.sampleAlias,
      defaults: { ...entry.defaults },
      params: { ...entry.defaults },
      timing: timingStateFromValue(''),
    };
  }

  private addLane(): void {
    const kit = this.selectedKit();
    const used = new Set(this.lanes.map((lane) => lane.alias));
    const available = kit.entries.filter((entry) => !used.has(entry.alias));
    if (available.length === 0) return;

    const overlay = this.createDialog('ADD LANE');
    const body = overlay.querySelector<HTMLElement>('.object-builder-secondary-body')!;
    const select = document.createElement('select');
    for (const entry of available) {
      const source = entry.source === 'sample' ? `SAMPLE ${entry.sampleAlias ?? ''}` : `DRUM.${entry.source}`;
      select.append(new Option(`${entry.alias} · ${source}`, entry.alias));
    }
    body.append(this.row('Kit alias', select));

    this.dialogDone(overlay, () => {
      const entry = available.find((candidate) => candidate.alias === select.value);
      if (entry) this.lanes.push(this.makeLane(entry));
      this.renderLanes();
      this.onChange();
    });
  }

  private renderLanes(): void {
    this.laneList.replaceChildren();
    const kit = this.selectedKit();

    for (const lane of this.lanes) {
      const card = document.createElement('div');
      card.className = 'object-builder-drumkit-lane';

      const identity = document.createElement('div');
      identity.className = 'object-builder-drumkit-lane-name';
      const source = lane.source === 'sample' ? `SAMPLE ${lane.sampleAlias ?? ''}` : `DRUM.${lane.source}`;
      identity.innerHTML = `<strong>${lane.alias.toUpperCase()}</strong><span>${source.toUpperCase()}</span>`;

      const summary = document.createElement('div');
      summary.className = 'object-builder-drumkit-lane-summary';
      summary.textContent = lane.timing.enabled && lane.timing.value ? lane.timing.value : 'SILENT · NO TIMING';

      const timing = this.button('TIMING', () => this.openTiming(lane));
      const edit = this.button('EDIT', () => this.openLaneEditor(lane));
      const remove = this.button('×', () => {
        this.lanes = this.lanes.filter((candidate) => candidate.id !== lane.id);
        this.renderLanes();
        this.onChange();
      });
      remove.title = `Remove ${lane.alias}`;

      card.append(identity, summary, timing, edit, remove);
      this.laneList.append(card);
    }

    const add = this.form.querySelector<HTMLButtonElement>('.object-builder-drumkit-add');
    if (add) {
      const used = new Set(this.lanes.map((lane) => lane.alias));
      add.disabled = kit.entries.every((entry) => used.has(entry.alias));
    }
  }

  private openTiming(lane: LaneState): void {
    const timingEditor = new TimingEditor({
      editor: this.editor,
      state: lane.timing,
      showEnabledToggle: true,
      showReaderMode: false,
      title: `${lane.alias.toUpperCase()} TIMING`,
    });
    const overlay = this.createDialog(`${lane.alias.toUpperCase()} · TIMING`, 'object-builder-timing-dialog');
    const body = overlay.querySelector<HTMLElement>('.object-builder-secondary-body')!;
    body.append(timingEditor.mount());

    this.dialogDone(overlay, () => {
      lane.timing = timingEditor.getState();
      this.renderLanes();
      this.onChange();
    });
  }

  private openLaneEditor(lane: LaneState): void {
    const overlay = this.createDialog(`${lane.alias.toUpperCase()} · LANE`);
    const body = overlay.querySelector<HTMLElement>('.object-builder-secondary-body')!;
    const fields = document.createElement('div');
    fields.className = 'object-builder-drumkit-param-grid';

    const specs: Array<[keyof DrumParams, string, number, number]> = [
      ['level', 'Level', 0, 100],
      ['pan', 'Pan', -100, 100],
      ['tune', 'Tune', -24, 24],
      ['decay', 'Decay', 0, 100],
    ];
    if (lane.source === 'kick') specs.push(['transient', 'Transient', 0, 100]);
    if (lane.source === 'snare') specs.push(['snappy', 'Snappy', 0, 100], ['color', 'Color', 0, 100]);
    if (lane.source === 'clap') specs.push(['noise', 'Noise', 0, 100]);
    specs.push(['humanize', 'Humanize', 0, 100]);

    const pending = { ...lane.params };
    for (const [key, label, min, max] of specs) {
      const row = document.createElement('label');
      row.className = 'object-builder-drumkit-param';
      const name = document.createElement('span');
      name.textContent = label.toUpperCase();
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = '1';
      input.value = String(pending[key]);
      const output = document.createElement('output');
      output.textContent = input.value;
      input.addEventListener('input', () => {
        pending[key] = Number(input.value);
        output.textContent = input.value;
      });
      row.append(name, input, output);
      fields.append(row);
    }
    body.append(fields);

    this.dialogDone(overlay, () => {
      lane.params = pending;
      this.onChange();
    });
  }

  private serializeParams(lane: LaneState): string[] {
    const keys: Array<keyof DrumParams> = ['level', 'pan', 'tune', 'decay'];
    if (lane.source === 'kick') keys.push('transient');
    if (lane.source === 'snare') keys.push('snappy', 'color');
    if (lane.source === 'clap') keys.push('noise');
    keys.push('humanize');
    return keys
      .filter((key) => lane.params[key] !== lane.defaults[key])
      .map((key) => `${key} ${lane.params[key]}`);
  }

  private selectedKit(): KitDefinition {
    return this.findKits().find((kit) => kit.name === this.kitSelect.value) ?? SONUS606;
  }

  private findKits(): KitDefinition[] {
    const kits = new Map<string, KitDefinition>([['sonus606', SONUS606]]);
    const source = this.editor.value;
    const regex = /^\s*SET\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*KIT(?:\s+([A-Za-z_][A-Za-z0-9_]*))?\s*\[([\s\S]*?)\]/gim;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(source)) !== null) {
      const name = match[1];
      const base = match[2] ? kits.get(match[2]) ?? kits.get(match[2].toLowerCase()) : undefined;
      const entries = new Map<string, KitEntry>((base?.entries ?? []).map((entry) => [entry.alias, {
        ...entry, defaults: { ...entry.defaults },
      }]));

      const rawEntries = match[3]
        .split(/\s*;\s*|\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);

      for (const raw of rawEntries) {
        const synth = raw.match(/^drum\.(kick|snare|clap|hihat|openhat|lowtom|hightom)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+with\s+(.+))?$/i);
        const sample = raw.match(/^sample\s+([A-Za-z_][A-Za-z0-9_]*)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+with\s+(.+))?$/i);
        const override = raw.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+with\s+(.+))?$/i);

        if (synth) {
          const defaults = this.applyParams({ ...DEFAULTS }, synth[3] ?? '');
          entries.set(synth[2], { alias: synth[2], source: synth[1].toLowerCase() as DrumSource, sampleAlias: null, defaults });
        } else if (sample) {
          const defaults = this.applyParams({ ...DEFAULTS, decay: 100 }, sample[3] ?? '');
          entries.set(sample[2], { alias: sample[2], source: 'sample', sampleAlias: sample[1], defaults });
        } else if (override) {
          const previous = entries.get(override[1]);
          if (previous) entries.set(previous.alias, { ...previous, defaults: this.applyParams(previous.defaults, override[2] ?? '') });
        }
      }
      kits.set(name, { name, entries: [...entries.values()] });
    }
    return [...kits.values()];
  }

  private applyParams(base: DrumParams, raw: string): DrumParams {
    const result = { ...base };
    for (const part of raw.split(',').map((item) => item.trim()).filter(Boolean)) {
      const match = part.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+(-?\d+(?:\.\d+)?)$/);
      if (!match || !(match[1].toLowerCase() in result)) continue;
      result[match[1].toLowerCase() as keyof DrumParams] = Number(match[2]);
    }
    return result;
  }

  private createDialog(title: string, extraClass = ''): HTMLElement {
    this.closeSecondaryModal();
    const overlay = document.createElement('div');
    overlay.className = 'object-builder-secondary-overlay';
    const dialog = document.createElement('section');
    dialog.className = `object-builder-secondary-dialog object-builder-drumkit-dialog ${extraClass}`.trim();
    dialog.innerHTML = `<header><strong>${title}</strong><button type="button" data-close>×</button></header><div class="object-builder-secondary-body"></div><footer></footer>`;
    overlay.append(dialog);
    document.body.append(overlay);
    this.modal = overlay;
    return overlay;
  }

  private dialogDone(overlay: HTMLElement, commit: () => void): void {
    const dialog = overlay.querySelector<HTMLElement>('.object-builder-secondary-dialog')!;
    const footer = dialog.querySelector<HTMLElement>('footer')!;
    const done = document.createElement('button');
    done.type = 'button';
    done.textContent = 'DONE';
    done.className = 'object-builder-button primary';
    footer.append(done);
    const finish = (): void => {
      commit();
      this.closeSecondaryModal();
    };
    done.addEventListener('click', finish);
    dialog.querySelector<HTMLButtonElement>('[data-close]')?.addEventListener('click', finish);
    overlay.addEventListener('pointerdown', (event) => {
      if (event.target === overlay) finish();
    });
  }

  private value(name: string): string {
    return this.form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? '';
  }

  private textInput(name: string, value: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.name = name;
    input.value = value;
    input.addEventListener('input', () => this.onChange());
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
