import './object-builder.css';
import { OBJECT_BUILDER_CATALOG, builderModelDefinition } from './catalog';
import type { BuilderObjectDefinition, BuilderParameterDefinition } from './types';
import { VoiceBuilderPanel } from './voice-builder';

export interface ObjectBuilderOptions {
  editor: HTMLTextAreaElement;
  toolbar: HTMLElement;
  evaluateAfterAdd: () => boolean;
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

  constructor(private readonly options: ObjectBuilderOptions) { this.mount(); }

  open(): void {
    this.existingMasterLine = this.findMasterClockLine();
    this.overlay.classList.remove('hidden');
    this.render();
  }
  close(): void { this.voicePanel?.closeSecondaryModal(); this.overlay.classList.add('hidden'); this.options.editor.focus(); }
  isOpen(): boolean { return !this.overlay.classList.contains('hidden'); }

  private mount(): void {
    const launch = document.createElement('button');
    launch.type = 'button'; launch.className = 'object-builder-launcher'; launch.textContent = '+ ADD OBJECT';
    launch.title = 'Add Object (Cmd/Ctrl+Shift+A)'; launch.addEventListener('click', () => this.open());
    this.options.toolbar.append(launch);

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
    if (this.selected.kind === 'voice') {
      this.voicePanel = new VoiceBuilderPanel(this.form, this.options.editor, () => this.refreshPreview(), this.suggestAvailableName('myVoice'));
      this.voicePanel.mount(); this.refreshPreview(); return;
    }
    const title = document.createElement('h2'); title.textContent = this.selected.label.toUpperCase(); this.form.append(title);
    if (this.selected.kind === 'clock') { this.renderClockForm(); this.refreshPreview(); return; }
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
      : (ports.length ? ports.map((p) => `${p.direction === 'input' ? '→' : '←'} ${p.label}  ${p.domain.toUpperCase()}`).join('\n') : 'NO EXTERNAL PORTS');
    if (this.selected.kind === 'voice' && this.voicePanel) {
      this.info.innerHTML = `<h3>OUTPUT ROUTING</h3>`;
      this.info.append(this.voicePanel.renderRoutingPreview());
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

  private insertObjectOnOwnLine(code: string): void {
    const editor = this.options.editor;
    const source = editor.value;
    const caret = editor.selectionEnd;

    // Object declarations are line-oriented. Insert after the physical line
    // containing the caret instead of risking concatenation with existing code.
    const nextLineBreak = source.indexOf('\n', caret);
    const insertAt = nextLineBreak >= 0 ? nextLineBreak + 1 : source.length;
    const needsLeadingBreak = insertAt === source.length && source.length > 0 && !source.endsWith('\n');
    const text = `${needsLeadingBreak ? '\n' : ''}${code}\n\n`;

    editor.setRangeText(text, insertAt, insertAt, 'end');
  }

  private insert(): void {
    if (!this.validateBeforeInsert()) return;
    const code = this.generateCode();
    const editor = this.options.editor;
    if (this.selected.kind === 'clock' && this.clockMode === 'master') {
      const existing = this.findMasterClockLine();
      if (existing) {
        editor.setRangeText(code, existing.start, existing.end, 'end');
      } else {
        const prefix = editor.value.length ? `${code}\n` : code;
        editor.setRangeText(prefix, 0, 0, 'end');
      }
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      this.close();
      this.options.evaluateAfterAdd();
      return;
    }
    this.insertObjectOnOwnLine(code);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    this.close();
    this.options.evaluateAfterAdd();
  }
}
