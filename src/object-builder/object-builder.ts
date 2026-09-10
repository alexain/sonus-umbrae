import './object-builder.css';
import { OBJECT_BUILDER_CATALOG, builderModelDefinition } from './catalog';
import type { BuilderObjectDefinition, BuilderParameterDefinition } from './types';
import { VoiceBuilderPanel } from './voice-builder';
import { RoutingPanel } from './routing-panel';
import { LogicBuilderPanel } from './logic-builder';
import { SeqBuilderPanel } from './seq-builder';
import { RegisterBuilderPanel } from './register-builder';
import { DrumkitBuilderPanel } from './drumkit-builder';
import { FxBuilderPanel } from './fx-builder';
import { ModBuilderPanel } from './mod-builder';

export interface ObjectBuilderOptions {
  editor: HTMLTextAreaElement;
  toolbar: HTMLElement;
  evaluateAfterAdd: () => boolean;
  getSampleAssetAliases: () => readonly string[];
}

export class ObjectBuilder {
  private overlay!: HTMLElement;
  private form!: HTMLElement;
  private info!: HTMLElement;
  private code!: HTMLElement;
  private selected: BuilderObjectDefinition = OBJECT_BUILDER_CATALOG[0];
  private clockMode: 'master' | 'derived' = 'master';
  private existingMasterLine: { start: number; end: number; text: string } | null = null;
  private voicePanel: VoiceBuilderPanel | null = null;
  private logicPanel: LogicBuilderPanel | null = null;
  private seqPanel: SeqBuilderPanel | null = null;
  private registerPanel: RegisterBuilderPanel | null = null;
  private drumkitPanel: DrumkitBuilderPanel | null = null;
  private fxPanel: FxBuilderPanel | null = null;
  private modPanel: ModBuilderPanel | null = null;
  private readonly filterRouting: RoutingPanel;

  constructor(private readonly options: ObjectBuilderOptions) {
    this.filterRouting = new RoutingPanel({
      sources: () => this.filterOutputs(),
      destinations: () => this.routingDestinations(),
      defaultConnections: () => [{ source: 'lp', destination: 'MAIN.L' }, { source: 'lp', destination: 'MAIN.R' }],
      onChange: () => this.refreshPreview(),
      expandedTitle: 'FILTER ROUTING',
    });
    this.mount();
  }

  open(): void {
    this.existingMasterLine = this.findMasterClockLine();
    this.overlay.classList.remove('hidden');
    this.render();
  }
  close(): void { this.voicePanel?.closeSecondaryModal(); this.logicPanel?.closeSecondaryModal(); this.seqPanel?.closeSecondaryModal(); this.registerPanel?.closeSecondaryModal(); this.drumkitPanel?.closeSecondaryModal(); this.fxPanel?.closeSecondaryModal(); this.modPanel?.closeSecondaryModal(); this.filterRouting.closeExpanded(); this.overlay.classList.add('hidden'); this.options.editor.focus(); }
  isOpen(): boolean { return !this.overlay.classList.contains('hidden'); }

  private mount(): void {
    const launch = this.options.toolbar.querySelector<HTMLButtonElement>('#object-builder-launcher');
    if (!launch) throw new Error('Missing #object-builder-launcher');
    launch.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
    });
    launch.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.open();
    });

    this.overlay = document.createElement('div');
    this.overlay.className = 'object-builder-overlay hidden';
    this.overlay.innerHTML = `<section class="object-builder-dialog" role="dialog" aria-modal="true" aria-label="Add Object">
      <header class="object-builder-head"><strong>ADD OBJECT</strong><span>BUILD SONUS CODE VISUALLY</span></header>
      <div class="object-builder-body"><nav class="object-builder-kinds"></nav><div class="object-builder-form"></div><aside class="object-builder-info"></aside></div>
      <footer class="object-builder-foot"><button class="object-builder-button" data-action="cancel">CANCEL</button><button class="object-builder-button primary" data-action="add">ADD</button></footer>
    </section>`;
    document.body.append(this.overlay);
    this.form = this.overlay.querySelector('.object-builder-form')!;
    this.info = this.overlay.querySelector('.object-builder-info')!;
    this.code = document.createElement('pre'); this.code.className = 'object-builder-code';
    this.overlay.querySelector('[data-action=cancel]')!.addEventListener('click', () => this.close());
    this.overlay.querySelector('[data-action=add]')!.addEventListener('click', () => this.insert());
    this.overlay.addEventListener('pointerdown', (e) => { if (e.target === this.overlay) this.close(); });
    this.renderKinds();
  }

  private renderKinds(): void {
    const nav = this.overlay.querySelector('.object-builder-kinds')!; nav.replaceChildren();
    for (const definition of OBJECT_BUILDER_CATALOG) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'object-builder-kind';
      button.textContent = definition.label.toUpperCase(); button.dataset.kind = definition.kind;
      button.addEventListener('click', () => { this.selected = definition; this.render(); }); nav.append(button);
    }
  }

  private render(): void {
    this.overlay.querySelectorAll('.object-builder-kind').forEach((el) => el.classList.toggle('active', (el as HTMLElement).dataset.kind === this.selected.kind));
    this.form.replaceChildren();
    this.voicePanel = null;
    this.logicPanel = null;
    this.seqPanel = null;
    this.registerPanel = null;
    this.drumkitPanel = null;
    this.fxPanel = null;
    this.modPanel = null;
    if (this.selected.kind === 'voice') {
      this.voicePanel = new VoiceBuilderPanel(
        this.form,
        this.options.editor,
        () => this.refreshPreview(),
        this.options.getSampleAssetAliases,
        this.suggestAvailableName('myVoice'),
      );
      this.voicePanel.mount(); this.refreshPreview(); return;
    }
    if (this.selected.kind === 'logic') {
      this.logicPanel = new LogicBuilderPanel(this.form, this.options.editor, () => this.refreshPreview(), this.suggestAvailableName('myLogic'));
      this.logicPanel.mount(); this.refreshPreview(); return;
    }
    if (this.selected.kind === 'seq') {
      this.seqPanel = new SeqBuilderPanel(this.form, this.options.editor, () => this.refreshPreview(), this.suggestAvailableName('mySeq'));
      this.seqPanel.mount(); this.refreshPreview(); return;
    }
    if (this.selected.kind === 'register') {
      this.registerPanel = new RegisterBuilderPanel(this.form, this.options.editor, () => this.refreshPreview(), this.suggestAvailableName('myRegister'));
      this.registerPanel.mount(); this.refreshPreview(); return;
    }
    if (this.selected.kind === 'drumkit') {
      this.drumkitPanel = new DrumkitBuilderPanel(this.form, this.options.editor, () => this.refreshPreview(), this.suggestAvailableName('myDrumkit'));
      this.drumkitPanel.mount(); this.refreshPreview(); return;
    }
    if (this.selected.kind === 'fx') {
      this.fxPanel = new FxBuilderPanel(
        this.form,
        this.options.editor,
        () => this.refreshPreview(),
        () => this.routingDestinations(),
        this.suggestAvailableName('myFx'),
      );
      this.fxPanel.mount(); this.refreshPreview(); return;
    }
    if (this.selected.kind === 'mod') {
      this.modPanel = new ModBuilderPanel(
        this.form,
        () => this.refreshPreview(),
        this.suggestAvailableName('myMod'),
      );
      this.modPanel.mount(); this.refreshPreview(); return;
    }
    const title = document.createElement('h2'); title.textContent = this.selected.label.toUpperCase(); this.form.append(title);
    if (this.selected.kind === 'clock') { this.renderClockForm(); this.refreshPreview(); return; }
    if (this.selected.kind === 'filter') { this.renderFilterForm(); this.refreshPreview(); return; }
    if (this.selected.models?.length) this.form.append(this.selectRow('model', 'Model', this.selected.models.map((m) => m.id)));
    for (const parameter of this.selected.parameters) {
      const resolved = parameter.id === 'name' && parameter.defaultValue == null
        ? { ...parameter, defaultValue: this.suggestAvailableName(this.defaultObjectName()) }
        : parameter;
      this.form.append(this.parameterRow(resolved));
    }
    this.form.addEventListener('input', () => this.refreshPreview(), { once: true });
    this.form.addEventListener('change', () => { this.renderModelParameters(); this.refreshPreview(); }, { once: true });
    this.renderModelParameters(); this.refreshPreview();
  }


  private renderFilterForm(): void {
    this.filterRouting.reset();
    const name = this.parameterRow({ id: 'name', label: 'Name', control: 'text', required: true, defaultValue: this.suggestAvailableName('myFilter') });
    const model = this.selectRow('model', 'Model', ['svf']);
    const cutoff = this.parameterRow({ id: 'cutoff', label: 'Cutoff', control: 'slider', min: 0, max: 100, step: 1, unit: '%', defaultValue: 50 });
    const resonance = this.parameterRow({ id: 'resonance', label: 'Resonance', control: 'slider', min: 0, max: 100, step: 1, unit: '%', defaultValue: 0 });
    const drive = this.parameterRow({ id: 'drive', label: 'Drive', control: 'slider', min: 0, max: 100, step: 1, unit: '%', defaultValue: 0 });
    for (const row of [name, model, cutoff, resonance, drive]) this.form.append(row);
    for (const row of [cutoff, resonance, drive]) this.decorateSliderRow(row);

    const placementTitle = document.createElement('h3');
    placementTitle.textContent = 'PLACEMENT';
    this.form.append(placementTitle);

    const embedRow = this.parameterRow({ id: 'embedVoice', label: 'Embed in existing VOICE', control: 'toggle', defaultValue: false });
    const voiceRow = this.selectRow('embedVoiceName', 'Voice', []);
    const embed = embedRow.querySelector<HTMLInputElement>('input[name=embedVoice]')!;
    const voice = voiceRow.querySelector<HTMLSelectElement>('select[name=embedVoiceName]')!;
    const notice = document.createElement('div');
    notice.className = 'object-builder-notice';

    const blocks = this.findVoiceBlocks();
    for (const block of blocks) {
      const unavailable = block.hasEmbeddedFilter || block.hasExplicitOut;
      const label = block.hasEmbeddedFilter
        ? `${block.name} — already has FILTER`
        : block.hasExplicitOut
          ? `${block.name} — explicit routing`
          : block.name;
      const option = new Option(label, block.name);
      option.disabled = unavailable;
      voice.append(option);
    }
    const firstAvailable = Array.from(voice.options).find((option) => !option.disabled);
    if (firstAvailable) voice.value = firstAvailable.value;
    voice.disabled = true;
    if (!firstAvailable) embed.disabled = true;

    const refreshPlacement = (): void => {
      voice.disabled = !embed.checked;
      if (!blocks.length) notice.textContent = 'No existing VOICE is available for embedding.';
      else if (!firstAvailable) notice.textContent = 'No compatible VOICE: embedded filters and explicit voice routing must be resolved first.';
      else if (embed.checked) notice.textContent = `The FILTER will be appended inside VOICE '${voice.value}'. Routing uses that VOICE's .lp/.hp/.bp/.np outputs.`;
      else notice.textContent = 'Top-level FILTER. Enable embedding to place it inside an existing VOICE.';
      this.refreshPreview();
    };

    embed.addEventListener('change', refreshPlacement);
    voice.addEventListener('change', refreshPlacement);
    this.form.append(embedRow, voiceRow, notice);
    refreshPlacement();

    this.form.addEventListener('input', () => this.refreshPreview());
    this.form.addEventListener('change', () => this.refreshPreview());
  }

  private decorateSliderRow(row: HTMLElement): void {
    const input = row.querySelector<HTMLInputElement>('input[type=range]');
    if (!input) return;
    const wrap = document.createElement('div'); wrap.className = 'object-builder-slider';
    const output = document.createElement('output'); output.textContent = input.value;
    input.replaceWith(wrap); wrap.append(input, output);
    input.addEventListener('input', () => { output.textContent = input.value; });
  }

  private filterOutputs(): Array<{ id: string; label: string }> {
    return [
      { id: 'lp', label: 'LP' },
      { id: 'hp', label: 'HP' },
      { id: 'bp', label: 'BP' },
      { id: 'np', label: 'NOTCH' },
    ];
  }

  private routingDestinations(): string[] {
    const destinations = ['MAIN.L', 'MAIN.R'];
    const lines = this.options.editor.value.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const top = lines[i].match(/^\s*(FX|FILTER|VOICE)\s+([A-Za-z_][A-Za-z0-9_]*)\b/i);
      if (!top) continue;
      const kind = top[1].toUpperCase(), name = top[2];
      if (kind === 'FX') destinations.push(`${name}.L`, `${name}.R`);
      else if (kind === 'FILTER') destinations.push(`${name}.in`);
      else {
        let sound = '';
        for (let j = i + 1; j < lines.length && (lines[j].trim() === '' || /^\s/.test(lines[j])); j += 1) {
          const match = lines[j].trim().match(/^sound\s+([^\s]+)/i); if (match) { sound = match[1]; break; }
        }
        if (sound === 'matter') destinations.push(`${name}.in`, `${name}.in2`);
        else if (sound.startsWith('resonator.')) destinations.push(`${name}.in`);
      }
    }
    const currentName = (this.form.querySelector('[name=name]') as HTMLInputElement | null)?.value;
    const embeddedVoice = this.filterEmbedded() ? this.selectedEmbedVoiceName() : '';
    return [...new Set(destinations)].filter((destination) => {
      if (currentName && destination.startsWith(`${currentName}.`)) return false;
      if (embeddedVoice && destination.startsWith(`${embeddedVoice}.`)) return false;
      return true;
    });
  }

  private filterEmbedded(): boolean {
    return (this.form.querySelector('[name=embedVoice]') as HTMLInputElement | null)?.checked ?? false;
  }

  private selectedEmbedVoiceName(): string {
    return (this.form.querySelector('[name=embedVoiceName]') as HTMLSelectElement | null)?.value ?? '';
  }

  private findVoiceBlocks(): Array<{ name: string; start: number; insertAt: number; hasEmbeddedFilter: boolean; hasExplicitOut: boolean }> {
    const source = this.options.editor.value;
    const rawLines = source.match(/.*(?:\r?\n|$)/g)?.filter((line) => line.length > 0) ?? [];
    const starts: number[] = [];
    let offset = 0;
    for (const line of rawLines) { starts.push(offset); offset += line.length; }
    const blocks: Array<{ name: string; start: number; insertAt: number; hasEmbeddedFilter: boolean; hasExplicitOut: boolean }> = [];

    for (let i = 0; i < rawLines.length; i += 1) {
      const lineText = rawLines[i].replace(/\r?\n$/, '');
      if (/^\s/.test(lineText)) continue;
      const match = lineText.trim().match(/^_?VOICE\s+([A-Za-z_][A-Za-z0-9_]*)\b.*:\s*$/i);
      if (!match) continue;
      let endLine = rawLines.length;
      for (let j = i + 1; j < rawLines.length; j += 1) {
        const candidate = rawLines[j].replace(/\r?\n$/, '');
        if (candidate.trim() && !/^\s/.test(candidate)) { endLine = j; break; }
      }
      let contentEnd = endLine;
      while (contentEnd > i + 1 && rawLines[contentEnd - 1].trim() === '') contentEnd -= 1;
      const body = rawLines.slice(i + 1, endLine).map((line) => line.replace(/\r?\n$/, ''));
      blocks.push({
        name: match[1],
        start: starts[i],
        insertAt: contentEnd < starts.length ? starts[contentEnd] : source.length,
        hasEmbeddedFilter: body.some((line) => /^\s+_?FILTER\s+[A-Za-z_][A-Za-z0-9_]*\s*:/i.test(line)),
        hasExplicitOut: body.some((line) => /^\s+OUT\b/i.test(line)),
      });
      i = endLine - 1;
    }
    return blocks;
  }

  private renderClockForm(): void {
    const mode = this.selectRow('clockMode', 'Clock type', ['master', 'derived']);
    const modeSelect = mode.querySelector('select')!;
    modeSelect.value = this.clockMode;
    modeSelect.addEventListener('change', () => {
      this.clockMode = modeSelect.value === 'derived' ? 'derived' : 'master';
      this.render();
    });
    this.form.append(mode);

    const existing = this.existingMasterLine ? this.parseMasterClock(this.existingMasterLine.text) : null;
    if (this.clockMode === 'master' && this.existingMasterLine) {
      const notice = document.createElement('div');
      notice.className = 'object-builder-notice';
      notice.textContent = 'A master clock already exists. ADD will update that line instead of creating a second master clock.';
      this.form.append(notice);
    }

    const name = this.parameterRow({ id: 'name', label: 'Name', control: 'text', required: true, defaultValue: this.clockMode === 'master' ? 'master' : this.suggestAvailableName('myClock') });
    const nameInput = name.querySelector('input')!;
    nameInput.disabled = this.clockMode === 'master';
    this.form.append(name);

    const parentChoices = ['master', ...this.findNamedClockNames()];
    const parent = this.selectRow('parent', 'Parent clock', parentChoices);
    const parentSelect = parent.querySelector('select')!;
    parentSelect.disabled = this.clockMode === 'master';
    parentSelect.title = this.clockMode === 'master'
      ? 'The master clock has no parent.'
      : 'Choose the master clock or an already-declared named clock.';
    this.form.append(parent);

    const bpm = this.parameterRow({ id: 'bpm', label: 'BPM', control: 'number', min: 1, defaultValue: existing?.bpm ?? 120 });
    const bpmInput = bpm.querySelector('input')!;
    bpmInput.disabled = this.clockMode === 'derived';
    this.form.append(bpm);

    const rate = this.parameterRow({ id: 'rate', label: 'Derived rate', control: 'expression', defaultValue: '/2' });
    const rateInput = rate.querySelector('input')!;
    rateInput.disabled = this.clockMode === 'master';
    this.form.append(rate);

    this.form.append(this.clockSliderRow('jitter', 'Jitter', existing?.jitter ?? 0));
    this.form.append(this.clockSliderRow('drifter', 'Drifter', existing?.drifter ?? 0));

    const view = this.parameterRow({ id: 'view', label: 'View', control: 'toggle', defaultValue: existing?.view ?? false });
    this.form.append(view);

    this.form.addEventListener('input', () => this.refreshPreview());
    this.form.addEventListener('change', () => this.refreshPreview());
  }

  private clockSliderRow(id: string, labelText: string, value: number): HTMLElement {
    const row = document.createElement('div'); row.className = 'object-builder-row';
    const label = document.createElement('label'); label.textContent = labelText;
    const wrap = document.createElement('div'); wrap.className = 'object-builder-slider';
    const input = document.createElement('input'); input.type = 'range'; input.name = id; input.min = '0'; input.max = '100'; input.step = '1'; input.value = String(value);
    const output = document.createElement('output'); output.textContent = input.value;
    input.addEventListener('input', () => { output.textContent = input.value; });
    wrap.append(input, output); row.append(label, wrap); return row;
  }

  private renderModelParameters(): void {
    this.form.querySelectorAll('[data-model-parameter]').forEach((el) => el.remove());
    const model = (this.form.querySelector('[name=model]') as HTMLSelectElement | null)?.value;
    if (!model) return;
    const definition = builderModelDefinition(this.selected.kind, model);
    for (const parameter of definition?.parameters ?? []) { const row = this.parameterRow(parameter); row.dataset.modelParameter = 'true'; this.form.append(row); }
  }

  private parameterRow(parameter: BuilderParameterDefinition): HTMLElement {
    const row = document.createElement('div'); row.className = 'object-builder-row';
    const label = document.createElement('label'); label.textContent = parameter.label; row.append(label);
    let input: HTMLInputElement | HTMLSelectElement;
    if (parameter.control === 'toggle') { input = document.createElement('input'); input.type = 'checkbox'; (input as HTMLInputElement).checked = parameter.defaultValue === true; }
    else if (parameter.control === 'select' && parameter.options) { input = document.createElement('select'); for (const value of parameter.options) input.append(new Option(value, value)); }
    else { input = document.createElement('input'); input.type = parameter.control === 'slider' ? 'range' : parameter.control === 'number' ? 'number' : 'text'; if (parameter.min != null) input.min = String(parameter.min); if (parameter.max != null) input.max = String(parameter.max); if (parameter.step != null) input.step = String(parameter.step); if (parameter.defaultValue != null && typeof parameter.defaultValue !== 'boolean') input.value = String(parameter.defaultValue); }
    input.name = parameter.id; if (parameter.required) input.required = true; row.append(input); return row;
  }

  private selectRow(name: string, labelText: string, values: readonly string[]): HTMLElement {
    const row = document.createElement('div'); row.className = 'object-builder-row'; const label = document.createElement('label'); label.textContent = labelText;
    const select = document.createElement('select'); select.name = name; for (const value of values) select.append(new Option(value, value)); row.append(label, select); return row;
  }

  private refreshPreview(): void {
    const model = (this.form.querySelector('[name=model]') as HTMLSelectElement | null)?.value;
    const modelDef = model ? builderModelDefinition(this.selected.kind, model) : undefined;
    const ports = modelDef?.ports ?? this.selected.ports;
    const diagram = this.selected.kind === 'voice' && this.voicePanel
      ? this.voicePanel.previewDescription()
      : this.selected.kind === 'logic' && this.logicPanel
        ? this.logicPanel.previewDescription()
        : this.selected.kind === 'seq' && this.seqPanel
          ? this.seqPanel.previewDescription()
          : this.selected.kind === 'register' && this.registerPanel
            ? this.registerPanel.previewDescription()
            : this.selected.kind === 'drumkit' && this.drumkitPanel
              ? this.drumkitPanel.previewDescription()
              : this.selected.kind === 'fx' && this.fxPanel
                ? this.fxPanel.previewDescription()
                : this.selected.kind === 'mod' && this.modPanel
                  ? this.modPanel.previewDescription()
          : (ports.length ? ports.map((p) => `${p.direction === 'input' ? '→' : '←'} ${p.label}  ${p.domain.toUpperCase()}`).join('\n') : 'NO EXTERNAL PORTS');
    if (this.selected.kind === 'voice' && this.voicePanel) {
      this.info.innerHTML = `<h3>OUTPUT ROUTING</h3>`;
      this.info.append(this.voicePanel.renderRoutingPreview());
      const codeTitle = document.createElement('h3'); codeTitle.textContent = 'GENERATED CODE'; this.info.append(codeTitle);
    } else if (this.selected.kind === 'filter') {
      this.info.innerHTML = `<h3>OUTPUT ROUTING</h3>`;
      this.info.append(this.filterRouting.renderPreview());
      const codeTitle = document.createElement('h3'); codeTitle.textContent = 'GENERATED CODE'; this.info.append(codeTitle);
    } else if (this.selected.kind === 'fx' && this.fxPanel) {
      this.info.innerHTML = `<h3>OUTPUT ROUTING</h3>`;
      this.info.append(this.fxPanel.renderRoutingPreview());
      const codeTitle = document.createElement('h3'); codeTitle.textContent = 'GENERATED CODE'; this.info.append(codeTitle);
    } else if (this.selected.kind === 'mod' && this.modPanel) {
      this.info.innerHTML = '';
      this.info.append(this.modPanel.renderOutputPreview());
      const codeTitle = document.createElement('h3'); codeTitle.textContent = 'GENERATED CODE'; this.info.append(codeTitle);
    } else if (this.selected.kind === 'register' && this.registerPanel) {
      this.info.innerHTML = `<h3>REGISTER OUTPUTS</h3>`;
      this.info.append(this.registerPanel.renderInfoPreview());
      const codeTitle = document.createElement('h3'); codeTitle.textContent = 'GENERATED CODE'; this.info.append(codeTitle);
    } else {
      this.info.innerHTML = `<h3>INFO / PREVIEW</h3><div class="object-builder-diagram"></div><h3>GENERATED CODE</h3>`;
      (this.info.querySelector('.object-builder-diagram') as HTMLElement).textContent = `${(modelDef?.preview ?? this.selected.preview).toUpperCase()}\n\n${diagram}`;
    }
    this.code.textContent = this.generateCode(); this.info.append(this.code);
  }

  private generateCode(): string {
    const data = new FormData(this.form.closest('form') as HTMLFormElement ?? document.createElement('form'));
    const value = (name: string) => (this.form.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement | null)?.value ?? '';
    const checked = (name: string) => (this.form.querySelector(`[name="${name}"]`) as HTMLInputElement | null)?.checked ?? false;
    void data;
    if (this.selected.kind === 'clock') return this.generateClockCode(value, checked);
    if (this.selected.kind === 'voice' && this.voicePanel) return this.voicePanel.generateCode();
    if (this.selected.kind === 'logic' && this.logicPanel) return this.logicPanel.generateCode();
    if (this.selected.kind === 'seq' && this.seqPanel) return this.seqPanel.generateCode();
    if (this.selected.kind === 'register' && this.registerPanel) return this.registerPanel.generateCode();
    if (this.selected.kind === 'drumkit' && this.drumkitPanel) return this.drumkitPanel.generateCode();
    if (this.selected.kind === 'fx' && this.fxPanel) return this.fxPanel.generateCode();
    if (this.selected.kind === 'mod' && this.modPanel) return this.modPanel.generateCode();
    if (this.selected.kind === 'filter') return this.generateFilterCode(value);
    const name = value('name') || this.selected.kind;
    const model = value('model');
    const view = checked('view') ? ' with view' : '';
    if (this.selected.kind === 'envelope') return `SET ${name}:\n    ENVELOPE [${['delay','attack','hold','decay','sustain','release'].map(value).filter(Boolean).join(' ')}]`;
    const lines = [`${this.selected.keyword} ${name}${view}:`];
    if (model) lines.push(`    ${this.selected.kind === 'voice' ? 'sound' : 'model'} ${model}`);
    for (const input of Array.from(this.form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input[name], select[name]'))) {
      if (['name','view','model','out'].includes(input.name)) continue;
      if (input instanceof HTMLInputElement && input.type === 'checkbox') { if (input.checked) lines.push(`    ${input.name} on`); continue; }
      if (input.value) lines.push(`    ${input.name} ${input.value}`);
    }
    const out = value('out'); if (out) lines.push(`    out ${out}`);
    return lines.join('\n');
  }

  private generateFilterCode(value: (name: string) => string): string {
    const name = value('name') || 'myFilter';
    const embedded = this.filterEmbedded();
    if (!embedded) {
      const lines = [`FILTER ${name}:`, '    model svf', `    cutoff ${value('cutoff') || '50'}`, `    resonance ${value('resonance') || '0'}`, `    drive ${value('drive') || '0'}`];
      if (this.filterRouting.getMode() === 'disabled') lines.push('    out mute');
      else if (this.filterRouting.getMode() === 'custom') {
        for (const route of this.filterRouting.getConnections()) lines.push(`    out ${route.source} to ${route.destination}`);
      }
      return lines.join('\n');
    }

    const lines = [
      `    FILTER ${name}:`,
      '        model svf',
      `        cutoff ${value('cutoff') || '50'}`,
      `        resonance ${value('resonance') || '0'}`,
      `        drive ${value('drive') || '0'}`,
    ];
    if (this.filterRouting.getMode() === 'disabled') lines.push('    OUT MUTE');
    else if (this.filterRouting.getMode() === 'custom') {
      for (const route of this.filterRouting.getConnections()) lines.push(`    OUT ${route.source} TO ${route.destination}`);
    }
    return lines.join('\n');
  }

  private generateClockCode(
    value: (name: string) => string,
    checked: (name: string) => boolean,
  ): string {
    const jitter = Number(value('jitter') || 0);
    const drifter = Number(value('drifter') || 0);
    const modifiers: string[] = [];
    if (jitter > 0) modifiers.push(`jitter ${jitter}`);
    if (drifter > 0) modifiers.push(`drifter ${drifter}`);
    if (checked('view')) modifiers.push('view');
    const withModifiers = modifiers.length ? ` with ${modifiers.join(', ')}` : '';

    if (this.clockMode === 'master') {
      return `CLOCK set ${value('bpm') || '120'} bpm${withModifiers}`;
    }
    const name = value('name').trim() || 'myClock';
    const parent = value('parent').trim() || 'master';
    const rate = value('rate').trim() || '*1';
    const fromParent = parent === 'master' ? '' : ` from ${parent}`;
    return `CLOCK ${name}${fromParent} ${rate}${withModifiers}`;
  }

  private findMasterClockLine(): { start: number; end: number; text: string } | null {
    const source = this.options.editor.value;
    const regex = /^\s*_?CLOCK\s+set\s+.+?\s+bpm(?:\s+with\s+.*)?\s*$/gim;
    const match = regex.exec(source);
    if (!match) return null;
    return { start: match.index, end: match.index + match[0].length, text: match[0] };
  }

  private parseMasterClock(text: string): { bpm: string; jitter: number; drifter: number; view: boolean } | null {
    const match = text.trim().match(/^_?CLOCK\s+set\s+(.+?)\s+bpm(?:\s+with\s+(.+))?$/i);
    if (!match) return null;
    let jitter = 0; let drifter = 0; let view = false;
    for (const modifier of (match[2] ?? '').split(',').map((part) => part.trim())) {
      const jitterMatch = modifier.match(/^jitter\s+(\d+(?:\.\d+)?)$/i);
      const drifterMatch = modifier.match(/^drifter\s+(\d+(?:\.\d+)?)$/i);
      if (jitterMatch) jitter = Number(jitterMatch[1]);
      else if (drifterMatch) drifter = Number(drifterMatch[1]);
      else if (/^view$/i.test(modifier)) view = true;
    }
    return { bpm: match[1].trim(), jitter, drifter, view };
  }

  private findNamedClockNames(): string[] {
    const names: string[] = [];
    for (const rawLine of this.options.editor.value.split(/\r?\n/)) {
      if (/^\s/.test(rawLine)) continue;
      const match = rawLine.trim().match(/^_?CLOCK\s+([A-Za-z_][A-Za-z0-9_]*)\b/i);
      if (!match || /^set$/i.test(match[1])) continue;
      if (!names.includes(match[1])) names.push(match[1]);
    }
    return names;
  }

  private defaultObjectName(): string {
    const suffixByKind: Partial<Record<BuilderObjectDefinition['kind'], string>> = {
      clock: 'Clock',
      voice: 'Voice',
      mod: 'Mod',
      envelope: 'Envelope',
      fx: 'Fx',
      filter: 'Filter',
      drumkit: 'Drumkit',
      logic: 'Logic',
      register: 'Register',
      seq: 'Seq',
    };
    return `my${suffixByKind[this.selected.kind] ?? this.selected.label.replace(/\s+/g, '')}`;
  }

  private suggestAvailableName(base: string): string {
    if (!this.findDeclaredObject(base)) return base;
    let index = 2;
    while (this.findDeclaredObject(`${base}_${index}`)) index += 1;
    return `${base}_${index}`;
  }

  private findDeclaredObject(name: string): { kind: string; name: string } | null {
    for (const rawLine of this.options.editor.value.split(/\r?\n/)) {
      if (/^\s/.test(rawLine)) continue;
      const line = rawLine.trim();
      const object = line.match(/^_?(VOICE|FX|FILTER|MOD|SEQ|REGISTER|LOGIC|DRUMKIT|CLOCK)\s+([A-Za-z_][A-Za-z0-9_]*)\b/i);
      if (object && !(/^CLOCK$/i.test(object[1]) && /^set$/i.test(object[2])) && object[2] === name) {
        return { kind: object[1].toUpperCase(), name: object[2] };
      }
      const set = line.match(/^SET\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/i);
      if (set && set[1] === name) return { kind: 'SET', name: set[1] };
    }
    return null;
  }

  private showError(message: string): void {
    let error = this.form.querySelector<HTMLElement>('.object-builder-error');
    if (!error) {
      error = document.createElement('div');
      error.className = 'object-builder-error';
      this.form.prepend(error);
    }
    error.textContent = message;
  }

  private clearError(): void {
    this.form.querySelector('.object-builder-error')?.remove();
  }

  private validateBeforeInsert(): boolean {
    this.clearError();
    if (this.selected.kind === 'voice' && this.voicePanel) {
      const voiceError = this.voicePanel.validate();
      if (voiceError) { this.showError(voiceError); return false; }
    }
    if (this.selected.kind === 'logic' && this.logicPanel) {
      const logicError = this.logicPanel.validate();
      if (logicError) { this.showError(logicError); return false; }
    }
    if (this.selected.kind === 'seq' && this.seqPanel) {
      const seqError = this.seqPanel.validate();
      if (seqError) { this.showError(seqError); return false; }
    }
    if (this.selected.kind === 'register' && this.registerPanel) {
      const registerError = this.registerPanel.validate();
      if (registerError) { this.showError(registerError); return false; }
    }
    if (this.selected.kind === 'drumkit' && this.drumkitPanel) {
      const drumkitError = this.drumkitPanel.validate();
      if (drumkitError) { this.showError(drumkitError); return false; }
    }
    if (this.selected.kind === 'fx' && this.fxPanel) {
      const fxError = this.fxPanel.validate();
      if (fxError) { this.showError(fxError); return false; }
    }
    if (this.selected.kind === 'mod' && this.modPanel) {
      const modError = this.modPanel.validate();
      if (modError) { this.showError(modError); return false; }
    }
    if (this.selected.kind === 'filter' && this.filterEmbedded()) {
      const voiceName = this.selectedEmbedVoiceName();
      const block = this.findVoiceBlocks().find((candidate) => candidate.name === voiceName);
      if (!block) { this.showError('Choose an existing VOICE for the embedded FILTER.'); return false; }
      if (block.hasEmbeddedFilter) { this.showError(`VOICE '${voiceName}' already contains a FILTER.`); return false; }
      if (block.hasExplicitOut) {
        this.showError(`VOICE '${voiceName}' already has explicit OUT routing. Remove or reconcile that routing before embedding a FILTER.`);
        return false;
      }
    }
    if (!this.selected.named || (this.selected.kind === 'clock' && this.clockMode === 'master')) return true;
    const name = (this.form.querySelector('[name="name"]') as HTMLInputElement | null)?.value.trim() ?? '';
    if (!name) {
      this.showError('Name is required.');
      return false;
    }
    const existing = this.findDeclaredObject(name);
    if (existing) {
      const suggested = this.suggestAvailableName(name);
      const nameInput = this.form.querySelector('[name="name"]') as HTMLInputElement | null;
      if (nameInput) nameInput.value = suggested;
      this.refreshPreview();
      this.showError(`'${name}' is already used by ${existing.kind}. Proposed '${suggested}'.`);
      return false;
    }
    return true;
  }

  private appendObject(code: string): void {
    const editor = this.options.editor;
    const source = editor.value;

    // New top-level declarations always go at the end of the program. This
    // avoids inserting a declaration inside the object currently under the
    // editor caret and keeps one blank line between existing and new code.
    let separator = '';
    if (source.length > 0) {
      if (source.endsWith('\n\n')) separator = '';
      else if (source.endsWith('\n')) separator = '\n';
      else separator = '\n\n';
    }

    editor.setRangeText(`${separator}${code}\n\n`, source.length, source.length, 'end');
  }

  private insertEmbeddedFilter(code: string): boolean {
    const voiceName = this.selectedEmbedVoiceName();
    const block = this.findVoiceBlocks().find((candidate) => candidate.name === voiceName);
    if (!block) return false;
    const editor = this.options.editor;
    const source = editor.value;
    const before = source.slice(0, block.insertAt);
    const separator = before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    editor.setRangeText(`${separator}${code}\n`, block.insertAt, block.insertAt, 'end');
    return true;
  }

  private insert(): void {
    if (!this.validateBeforeInsert()) return;
    const code = this.generateCode();
    const editor = this.options.editor;
    if (this.selected.kind === 'filter' && this.filterEmbedded()) {
      if (!this.insertEmbeddedFilter(code)) {
        this.showError('The selected VOICE could not be found.');
        return;
      }
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      this.close();
      this.options.evaluateAfterAdd();
      return;
    }
    if (this.selected.kind === 'clock' && this.clockMode === 'master') {
      const existing = this.findMasterClockLine();
      if (existing) {
        editor.setRangeText(code, existing.start, existing.end, 'end');
      } else {
        this.appendObject(code);
      }
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      this.close();
      this.options.evaluateAfterAdd();
      return;
    }
    this.appendObject(code);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    this.close();
    this.options.evaluateAfterAdd();
  }
}
