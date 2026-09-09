import { builderModelDefinition } from './catalog';
import type { BuilderModelDefinition, BuilderParameterDefinition } from './types';
import { findScaleDefinition, scalesForEdo, type SupportedEdo } from '../language/scales';
import { RoutingPanel } from './routing-panel';
import { TimingEditor } from './timing-editor';

type SoundParamValue = { value: string | boolean; live: boolean };
type PitchKind = 'notes' | 'freqs' | 'scale' | 'reference';
type BehaviorKind = 'none' | 'every' | 'euclidean' | 'pattern' | 'reference';
type VcaMode = 'none' | 'existing' | 'inline';

const FAMILY_ORDER = ['oscillator', 'noise', 'macro', 'matter', 'resonator', 'sample', 'composite'] as const;

function familyForModel(model: string): string {
  if (['sine', 'triangle', 'sawtooth', 'ramp', 'square'].includes(model)) return 'oscillator';
  if (model.startsWith('noise.')) return 'noise';
  if (model.startsWith('macro.')) return 'macro';
  if (model.startsWith('resonator.')) return 'resonator';
  return model;
}

function shortModelName(model: string, family: string): string {
  return model.startsWith(`${family}.`) ? model.slice(family.length + 1) : model;
}

function isLiveCapable(parameter: BuilderParameterDefinition): boolean {
  return parameter.liveCapable === true;
}

const MACRO_PARAMETER_DISPLAY_NAMES: Record<string, Partial<Record<'harmo' | 'timbre' | 'morph', string>>> = {
  'macro.analog': { harmo: 'Detuning', timbre: 'Square Shape', morph: 'Triangle Shape' },
  'macro.waves': { harmo: 'Waveform', timbre: 'Wavefolder', morph: 'Asymmetry' },
  'macro.fm': { harmo: 'Frequency Ratio', timbre: 'Mod Index', morph: 'Feedback' },
  'macro.grain': { harmo: 'Formant 2 Ratio', timbre: 'Formant 1 Freq', morph: 'Shape' },
  'macro.additive': { harmo: 'Bumps', timbre: 'Predominant', morph: 'Bumps Shape' },
  'macro.wavetable': { harmo: 'Bank', timbre: 'X', morph: 'Y' },
  'macro.chord': { harmo: 'Chord Type', timbre: 'Inversion', morph: 'Waveform' },
  'macro.speech': { harmo: 'Type', timbre: 'Voice Timbre', morph: 'Phoneme / Word' },
  'macro.swarm': { harmo: 'Pitch Random', timbre: 'Grain Density', morph: 'Grain Size' },
  'macro.noise': { harmo: 'Filter', timbre: 'Clock', morph: 'Resonance' },
  'macro.particle': { harmo: 'Freq Random', timbre: 'Dust Density', morph: 'Filter' },
  'macro.string': { harmo: 'Inharmonicity', timbre: 'Dust Density / Brightness', morph: 'Decay' },
  'macro.analog-vcf': { harmo: 'Resonance', timbre: 'Low-Pass', morph: 'Waveform' },
  'macro.phase': { harmo: 'Distortion Freq', timbre: 'Distortion Amount', morph: 'Asymmetry' },
  'macro.terrain': { harmo: 'Terrain', timbre: 'Radius', morph: 'Offset' },
  'macro.strings': { harmo: 'Chord', timbre: 'Filter & Chorus', morph: 'Waveform' },
  'macro.chiptune': { harmo: 'Chord', timbre: 'Inversion', morph: 'Pulse Width / Sync' },
};

function appendSoundParameterLabel(label: HTMLLabelElement, model: string, parameter: BuilderParameterDefinition): void {
  label.textContent = parameter.label;
  const displayName = MACRO_PARAMETER_DISPLAY_NAMES[model]?.[parameter.id as 'harmo' | 'timbre' | 'morph'];
  if (!displayName) return;
  label.classList.add('object-builder-sound-param-label');
  const alias = document.createElement('span');
  alias.className = 'object-builder-sound-param-alias';
  alias.textContent = displayName;
  label.append(alias);
}

export class VoiceBuilderPanel {
  private family = 'oscillator';
  private model = 'sine';
  private soundParams = new Map<string, SoundParamValue>();
  private pitchKind: PitchKind = 'notes';
  private pitchValue = 'pitch notes [C3]';
  private behaviorKind: BehaviorKind = 'none';
  private behaviorValue = '';
  private timingEnabled = false;
  private timingReaderMode: 'forward' | 'reverse' | 'pendulum' | 'random' | 'shuffle' | 'walk' = 'forward';
  private timingReaderAmount = '1';
  private scaleEdo: SupportedEdo = 12;
  private scaleRoot = 'C';
  private scaleId = 'major';
  private vcaMode: VcaMode = 'none';
  private vcaValue = '';
  private readonly routing: RoutingPanel;
  private modal: HTMLElement | null = null;

  constructor(
    private readonly form: HTMLElement,
    private readonly editor: HTMLTextAreaElement,
    private readonly onChange: () => void,
    private readonly initialName = 'myVoice',
  ) {
    this.routing = new RoutingPanel({
      sources: () => this.outputPorts(),
      destinations: () => this.routingDestinations(),
      defaultConnections: () => this.defaultRoutingConnections(),
      onChange: this.onChange,
      expandedTitle: 'VOICE ROUTING',
    });
  }

  mount(): void {
    this.form.replaceChildren();
    const title = document.createElement('h2'); title.textContent = 'VOICE'; this.form.append(title);

    this.form.append(this.textRow('name', 'Name', this.initialName, true));
    this.form.append(this.toggleRow('view', 'View', false));

    const soundSection = this.section('SOUND');
    const soundGrid = document.createElement('div'); soundGrid.className = 'object-builder-sound-grid';
    const familySelect = document.createElement('select'); familySelect.name = 'voiceFamily';
    for (const family of this.availableFamilies()) familySelect.append(new Option(family, family));
    familySelect.value = this.family;
    const modelSelect = document.createElement('select'); modelSelect.name = 'voiceModel';
    soundGrid.append(this.labeledControl('Family', familySelect), this.labeledControl('Model', modelSelect));
    soundSection.append(soundGrid);
    const customize = this.actionRow('soundCustomize', 'No sound customization', 'CUSTOMIZE SOUND');
    soundSection.append(customize);
    this.form.append(soundSection);

    const pitch = this.actionRow('pitch', this.pitchTimingSummary(), 'CONFIGURE');
    pitch.querySelector('.object-builder-action-label')!.textContent = 'PITCH & TIMING';
    this.form.append(pitch);

    const vca = this.actionRow('vca', 'None', 'CONFIGURE');
    vca.querySelector('.object-builder-action-label')!.textContent = 'VCA';
    this.form.append(vca);

    this.form.append(this.sliderRow('level', 'Level', 50, true));


    const syncModelSelect = (): void => {
      const models = this.modelsForFamily(this.family);
      modelSelect.replaceChildren(...models.map((entry) => new Option(shortModelName(entry.id, this.family), entry.id)));
      if (!models.some((entry) => entry.id === this.model)) this.model = models[0]?.id ?? 'sine';
      modelSelect.value = this.model;
      modelSelect.disabled = models.length <= 1;
      this.updateCustomizeRow();
    };

    familySelect.addEventListener('change', () => {
      this.family = familySelect.value;
      const models = this.modelsForFamily(this.family);
      this.model = models[0]?.id ?? 'sine';
      this.soundParams.clear();
      this.routing.reset();
      syncModelSelect(); this.onChange();
    });
    modelSelect.addEventListener('change', () => {
      this.model = modelSelect.value;
      this.soundParams.clear();
      this.routing.reset();
      this.updateCustomizeRow(); this.onChange();
    });
    this.form.querySelector('[data-action="soundCustomize"]')?.addEventListener('click', () => this.openSoundEditor());
    this.form.querySelector('[data-action="pitch"]')?.addEventListener('click', () => this.openPitchEditor());
    this.form.querySelector('[data-action="vca"]')?.addEventListener('click', () => this.openVcaEditor());
    this.form.addEventListener('input', this.onChange);
    this.form.addEventListener('change', this.onChange);
    syncModelSelect();
  }

  validate(): string | null {
    const name = this.value('name').trim();
    if (!name) return 'Name is required.';
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return 'Name must be a valid Sonus identifier.';
    return null;
  }

  generateCode(): string {
    const name = this.value('name').trim() || 'myVoice';
    const withView = this.checked('view') ? ' with view' : '';
    const lines = [`VOICE ${name}${withView}:`];
    lines.push(`    sound ${this.soundExpression()}`);
    for (const [id, state] of this.soundParams) {
      if (id === 'lpg' || id === 'polyphony') continue;
      if (state.value === '' || state.value === false) continue;
      lines.push(`    ${state.live ? 'live ' : ''}${id} ${state.value}`);
    }
    const behavior = this.timingEnabled && this.behaviorValue ? ` ${this.behaviorValue}` : '';
    const selection = this.timingEnabled && this.behaviorKind === 'every' && this.timingReaderMode !== 'forward'
      ? ` with ${this.timingReaderMode}${this.timingReaderMode === 'walk' ? ` ${this.timingReaderAmount || '1'}` : ''}`
      : '';
    lines.push(`    ${this.pitchValue || 'pitch notes [C3]'}${selection}${behavior}`);
    lines.push(`    ${this.checked('levelLive') ? 'live ' : ''}level ${this.value('level') || '50'}`);
    if (this.vcaValue) lines.push(`    ${this.vcaValue}`);
    if (this.routing.getMode() === 'disabled') lines.push('    out mute');
    if (this.routing.getMode() === 'custom') {
      for (const connection of this.routing.getConnections()) {
        const source = this.routingSourceSyntax(connection.source);
        lines.push(`    out${source ? ` ${source}` : ''} to ${connection.destination}`);
      }
    }
    return lines.join('\n');
  }

  previewDescription(): string {
    const outputs = this.outputPorts().map((port) => port.label).join(', ');
    return `VOICE / ${this.model}\n\nOUTPUTS  ${outputs}\nPITCH    ${this.pitchValue}\nVCA      ${this.vcaValue || 'none'}\nROUTING  ${this.routing.summary()}`;
  }

  isSecondaryModalOpen(): boolean { return this.modal !== null; }
  closeSecondaryModal(): void { this.modal?.remove(); this.modal = null; this.routing.closeExpanded(); }

  private availableFamilies(): string[] {
    const present = new Set(this.voiceModels().map((model) => familyForModel(model.id)));
    return FAMILY_ORDER.filter((family) => present.has(family));
  }

  private voiceModels(): BuilderModelDefinition[] {
    const candidates = ['sine','triangle','sawtooth','ramp','square','noise.white','noise.dust','noise.clocked','noise.fractal',
      'macro.analog','macro.waves','macro.fm','macro.grain','macro.additive','macro.wavetable','macro.chord','macro.speech','macro.swarm','macro.noise','macro.particle','macro.string','macro.analog-vcf','macro.phase','macro.terrain','macro.strings','macro.chiptune',
      'matter','resonator.modal','resonator.sympathetic','resonator.strings','resonator.string','sample','composite'];
    return candidates.map((id) => builderModelDefinition('voice', id)).filter((value): value is BuilderModelDefinition => Boolean(value));
  }

  private modelsForFamily(family: string): BuilderModelDefinition[] { return this.voiceModels().filter((model) => familyForModel(model.id) === family); }

  private soundExpression(): string {
    let sound = this.model;
    if (this.model === 'sample') {
      const asset = this.soundParams.get('asset')?.value;
      sound = asset && typeof asset === 'string' ? `sample.${asset}` : 'sample';
    }
    if (this.model.startsWith('resonator.')) {
      const polyphony = this.soundParams.get('polyphony')?.value;
      if (typeof polyphony === 'string' && polyphony !== '1 note') sound += ` with ${polyphony}`;
    }
    if (this.soundParams.get('lpg')?.value === true) sound += ' with lpg';
    return sound;
  }

  private openSoundEditor(): void {
    const definition = builderModelDefinition('voice', this.model);
    const parameters = definition?.parameters ?? [];
    if (!parameters.length) return;
    const body = document.createElement('div'); body.className = 'object-builder-secondary-fields';
    const draft = new Map(this.soundParams);
    for (const parameter of parameters) {
      const row = document.createElement('div'); row.className = 'object-builder-secondary-param';
      const label = document.createElement('label'); appendSoundParameterLabel(label, this.model, parameter);
      let control: HTMLInputElement | HTMLSelectElement;
      if (parameter.control === 'toggle') {
        control = document.createElement('input'); control.type = 'checkbox'; control.checked = draft.get(parameter.id)?.value === true;
      } else if (parameter.control === 'select') {
        control = document.createElement('select');
        for (const option of parameter.options ?? []) control.append(new Option(option, option));
        control.value = String(draft.get(parameter.id)?.value ?? parameter.defaultValue ?? parameter.options?.[0] ?? '');
      } else {
        control = document.createElement('input');
        control.type = parameter.control === 'slider' ? 'range' : parameter.control === 'number' ? 'number' : 'text';
        if (parameter.min != null) control.min = String(parameter.min);
        if (parameter.max != null) control.max = String(parameter.max);
        if (parameter.step != null) control.step = String(parameter.step);
        const existing = draft.get(parameter.id)?.value;
        if (existing !== undefined && existing !== false) control.value = String(existing);
        else if (parameter.control === 'slider') control.value = String(parameter.defaultValue ?? 50);
      }
      control.name = `sound-${parameter.id}`;
      const liveWrap = document.createElement('label'); liveWrap.className = 'object-builder-live-toggle';
      const live = document.createElement('input'); live.type = 'checkbox'; live.checked = draft.get(parameter.id)?.live ?? false;
      live.disabled = !isLiveCapable(parameter) || parameter.control === 'toggle';
      liveWrap.append(live, document.createTextNode(' Live'));
      row.append(label, control, liveWrap); body.append(row);
      const defaultValue = parameter.control === 'toggle' ? false : parameter.defaultValue ?? (parameter.control === 'slider' ? 50 : '');
      const sync = (): void => {
        const value = control instanceof HTMLInputElement && control.type === 'checkbox' ? control.checked : control.value;
        const liveEnabled = live.checked && !live.disabled;
        const matchesDefault = String(value) === String(defaultValue);
        if (matchesDefault && !liveEnabled) draft.delete(parameter.id);
        else draft.set(parameter.id, { value, live: liveEnabled });
      };
      control.addEventListener('input', sync);
      control.addEventListener('change', sync);
      live.addEventListener('change', sync);
    }
    this.openSecondary(`CUSTOMIZE SOUND — ${this.model}`, body, () => {
      this.soundParams = draft; this.updateCustomizeRow(); this.onChange();
    });
  }

  private openPitchEditor(): void {
    const body = document.createElement('div');
    body.className = 'object-builder-pitch-editor';
    const columns = document.createElement('div');
    columns.className = 'object-builder-pitch-timing-grid';

    // PITCH -----------------------------------------------------------------
    const pitchColumn = document.createElement('section');
    pitchColumn.className = 'object-builder-pitch-column';
    const pitchHeading = document.createElement('h3'); pitchHeading.textContent = 'PITCH';
    const kinds: PitchKind[] = ['notes', 'scale', 'freqs', 'reference'];
    const pitchType = document.createElement('select');
    const pitchLabels: Record<PitchKind, string> = { notes: 'Notes', scale: 'Scale', freqs: 'Frequencies', reference: 'Reference' };
    for (const kind of kinds) pitchType.append(new Option(pitchLabels[kind], kind));
    pitchType.value = this.pitchKind;

    const pitchPanels = document.createElement('div');
    pitchPanels.className = 'object-builder-pitch-panels';
    const panelElements = new Map<PitchKind, HTMLElement>();

    const notesInput = document.createElement('input'); notesInput.type = 'text'; notesInput.placeholder = 'C3 E3 G3';
    const freqsInput = document.createElement('input'); freqsInput.type = 'text'; freqsInput.placeholder = '110 220 330';
    const currentBody = this.pitchValue.replace(/^pitch\s+(notes|freqs)\s+/i, '').replace(/^pitch\s+/i, '').replace(/^\[|\]$/g, '');
    notesInput.value = this.pitchKind === 'notes' ? currentBody : 'C3';
    if (this.pitchKind === 'freqs') freqsInput.value = currentBody;
    const notesPanel = document.createElement('div'); notesPanel.className = 'object-builder-pitch-text-panel';
    notesPanel.append(this.labeledControl('Notes', notesInput), this.hint('Weights and note modifiers remain textual so the full Sonus syntax stays available.'));
    const freqsPanel = document.createElement('div'); freqsPanel.className = 'object-builder-pitch-text-panel';
    freqsPanel.append(this.labeledControl('Frequencies', freqsInput), this.hint('Enter the frequency list exactly as it should appear inside PITCH FREQS [...].'));

    const scalePanel = document.createElement('div'); scalePanel.className = 'object-builder-scale-panel';
    const scaleTop = document.createElement('div'); scaleTop.className = 'object-builder-scale-top';
    const edo = document.createElement('select');
    for (const value of [12, 15, 19, 22, 24] as SupportedEdo[]) edo.append(new Option(`EDO ${value}`, String(value)));
    edo.value = String(this.scaleEdo);
    const root = document.createElement('select');
    for (const value of ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B']) root.append(new Option(value, value));
    root.value = this.scaleRoot;
    scaleTop.append(this.labeledControl('EDO', edo), this.labeledControl('Root', root));
    const scale = document.createElement('select');
    const scaleMap = document.createElement('div'); scaleMap.className = 'object-builder-scale-map';
    scalePanel.append(scaleTop, this.labeledControl('Scale', scale), scaleMap);
    const fillScales = (): void => {
      const selectedEdo = Number(edo.value) as SupportedEdo;
      const definitions = scalesForEdo(selectedEdo);
      scale.replaceChildren();
      for (const definition of definitions) {
        const value = selectedEdo === 12 && definition.id === 'ionian' ? 'major' : definition.id;
        scale.append(new Option(definition.name, value));
      }
      const wanted = selectedEdo === this.scaleEdo ? this.scaleId : (selectedEdo === 12 ? 'major' : definitions[0]?.id ?? '');
      if ([...scale.options].some((option) => option.value === wanted)) scale.value = wanted;
      this.renderScaleMap(scaleMap, selectedEdo, root.value, scale.value);
    };
    edo.addEventListener('change', fillScales);
    root.addEventListener('change', () => this.renderScaleMap(scaleMap, Number(edo.value) as SupportedEdo, root.value, scale.value));
    scale.addEventListener('change', () => this.renderScaleMap(scaleMap, Number(edo.value) as SupportedEdo, root.value, scale.value));
    fillScales();

    const referencePanel = document.createElement('div'); referencePanel.className = 'object-builder-reference-panel';
    const reference = document.createElement('select');
    const referenceInfo = document.createElement('div'); referenceInfo.className = 'object-builder-reference-info';
    const references = this.findPitchReferences();
    if (!references.length) reference.append(new Option('No compatible sources', ''));
    else for (const item of references) reference.append(new Option(item.name, item.name));
    const existingReference = this.pitchKind === 'reference' ? this.pitchValue.replace(/^pitch\s+/i, '').trim() : '';
    if (existingReference && references.some((item) => item.name === existingReference)) reference.value = existingReference;
    const updateReferenceInfo = (): void => {
      const item = references.find((entry) => entry.name === reference.value);
      referenceInfo.replaceChildren();
      if (!item) { referenceInfo.textContent = 'Declare a compatible SET or SEQ to use it here.'; return; }
      const type = document.createElement('strong'); type.textContent = item.type;
      const detail = document.createElement('span'); detail.textContent = item.detail;
      referenceInfo.append(type, detail);
    };
    reference.addEventListener('change', updateReferenceInfo); updateReferenceInfo();
    referencePanel.append(this.labeledControl('Source', reference), referenceInfo);

    panelElements.set('notes', notesPanel); panelElements.set('scale', scalePanel); panelElements.set('freqs', freqsPanel); panelElements.set('reference', referencePanel);
    for (const [kind, panel] of panelElements) { panel.dataset.pitchPanel = kind; pitchPanels.append(panel); }
    const selectPitchType = (): void => { for (const [kind, panel] of panelElements) panel.hidden = kind !== pitchType.value; };
    pitchType.addEventListener('change', selectPitchType); selectPitchType();
    pitchColumn.append(pitchHeading, this.labeledControl('Type', pitchType), pitchPanels);

    // TIMING ----------------------------------------------------------------
    const timingEditor = new TimingEditor({
      editor: this.editor,
      state: {
        enabled: this.timingEnabled,
        kind: this.behaviorKind,
        value: this.behaviorValue,
        readerMode: this.timingReaderMode,
        readerAmount: this.timingReaderAmount,
      },
      showEnabledToggle: true,
    });
    const timingColumn = timingEditor.mount();

    columns.append(pitchColumn, timingColumn); body.append(columns);
    this.openSecondary('PITCH & TIMING', body, () => {
      const selectedKind = pitchType.value as PitchKind; this.pitchKind = selectedKind;
      if (selectedKind === 'notes') this.pitchValue = `pitch notes [${notesInput.value.trim().replace(/^\[|\]$/g, '') || 'C3'}]`;
      else if (selectedKind === 'freqs') this.pitchValue = `pitch freqs [${freqsInput.value.trim().replace(/^\[|\]$/g, '') || '440'}]`;
      else if (selectedKind === 'scale') { this.scaleEdo = Number(edo.value) as SupportedEdo; this.scaleRoot = root.value; this.scaleId = scale.value; this.pitchValue = `pitch scale ${this.scaleRoot} ${this.scaleId}`; }
      else this.pitchValue = reference.value ? `pitch ${reference.value}` : 'pitch notes [C3]';

      const timingState = timingEditor.getState();
      this.timingEnabled = timingState.enabled;
      this.behaviorKind = timingState.kind;
      this.behaviorValue = timingState.value;
      this.timingReaderMode = timingState.readerMode;
      this.timingReaderAmount = timingState.readerAmount;
      this.updateActionSummary('pitch', this.pitchTimingSummary()); this.onChange();
    });
    this.modal?.querySelector('.object-builder-secondary-dialog')?.classList.add('object-builder-pitch-dialog');
  }

  private hint(text: string): HTMLElement { const hint = document.createElement('div'); hint.className = 'object-builder-secondary-hint'; hint.textContent = text; return hint; }

  private pitchTimingSummary(): string {
    const pitch = this.pitchValue.replace(/^pitch\s+/i, '');
    if (!this.timingEnabled || !this.behaviorValue) return `${pitch} · timing off`;
    const mode = this.behaviorKind === 'every' && this.timingReaderMode !== 'forward' ? ` · ${this.timingReaderMode}${this.timingReaderMode === 'walk' ? ` ${this.timingReaderAmount}` : ''}` : '';
    return `${pitch} · ${this.behaviorValue}${mode}`;
  }

  private renderScaleMap(container: HTMLElement, edo: SupportedEdo, root: string, scaleId: string): void {
    const definition = findScaleDefinition(scaleId);
    container.replaceChildren();
    if (!definition || definition.edo !== edo) return;
    const title = document.createElement('div'); title.className = 'object-builder-scale-map-title'; title.textContent = `${root} · ${definition.name} · ${edo}-EDO`;
    container.append(title);
    if (edo === 12) {
      const keyboard = document.createElement('div'); keyboard.className = 'object-builder-scale-keyboard';
      const rootPc = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'].indexOf(root);
      const active = new Set(definition.degrees.map((degree) => (rootPc + degree) % 12));
      for (const pc of [0, 2, 4, 5, 7, 9, 11]) {
        const key = document.createElement('div'); key.className = 'object-builder-scale-key white';
        key.classList.toggle('active', active.has(pc)); key.classList.toggle('root', pc === rootPc); key.dataset.pc = String(pc); keyboard.append(key);
      }
      for (const pc of [1, 3, 6, 8, 10]) {
        const key = document.createElement('div'); key.className = 'object-builder-scale-key black';
        key.classList.toggle('active', active.has(pc)); key.classList.toggle('root', pc === rootPc); key.dataset.pc = String(pc); keyboard.append(key);
      }
      container.append(keyboard);
    } else {
      const map = document.createElement('div'); map.className = 'object-builder-edo-map'; map.style.setProperty('--edo-columns', String(edo));
      const active = new Set(definition.degrees);
      for (let step = 0; step < edo; step++) {
        const cell = document.createElement('div'); cell.className = 'object-builder-edo-step'; cell.classList.toggle('active', active.has(step)); cell.classList.toggle('root', step === 0);
        cell.title = `${step} · ${Math.round(step * 1200 / edo)}¢`; const dot = document.createElement('i'); const label = document.createElement('span'); label.textContent = `${Math.round(step * 1200 / edo)}¢`; cell.append(dot, label); map.append(cell);
      }
      container.append(map);
    }
  }

  private findPitchReferences(): Array<{ name: string; type: string; detail: string }> {
    const result: Array<{ name: string; type: string; detail: string }> = [];
    const lines = this.editor.value.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const set = line.match(/^\s*SET\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/i);
      if (set) {
        const body = set[2].trim();
        if (/^\[[^\]]+\]$/.test(body)) result.push({ name: set[1], type: 'SET · NOTES', detail: body });
        else if (/^\[[^\]]+\]\s*hz$/i.test(body) || /^\d+(?:\.\d+)?\s*hz$/i.test(body)) result.push({ name: set[1], type: 'SET · FREQS', detail: body });
        else if (/^[A-Ga-g][#b]?-?\d+$/.test(body)) result.push({ name: set[1], type: 'SET · NOTE', detail: body });
        else if (/^[A-Ga-g][#b]?\s+[A-Za-z_][A-Za-z0-9_-]*/.test(body) && findScaleDefinition(body.split(/\s+/)[1])) result.push({ name: set[1], type: 'SET · SCALE', detail: body });
      }
      const seq = line.match(/^\s*SEQ\s+([A-Za-z_][A-Za-z0-9_]*)\b/i);
      if (seq) {
        const details: string[] = [];
        for (let j = index + 1; j < lines.length; j++) { if (/^\S/.test(lines[j]) && lines[j].trim()) break; const item = lines[j].trim(); if (/^(model|pitch)\b/i.test(item)) details.push(item); }
        result.push({ name: seq[1], type: 'SEQ', detail: details.join(' · ') || 'pitch source' });
      }
    }
    return result.filter((item, index) => result.findIndex((other) => other.name === item.name) === index);
  }

  private openVcaEditor(): void {
    const body = document.createElement('div'); body.className = 'object-builder-secondary-fields';
    const existing = document.createElement('select');
    const envs = this.findEnvelopeNames();
    existing.append(new Option('— none —', ''));
    for (const name of envs) existing.append(new Option(name, name));
    if (this.vcaMode === 'existing') existing.value = this.vcaValue.replace(/^vca\s+/i, '');

    const stages = document.createElement('div'); stages.className = 'object-builder-envelope-stages';
    const stageDefs: Array<[string,string,boolean]> = [['del','Delay',true],['att','Attack',true],['hold','Hold',true],['dec','Decay',true],['sus','Sustain',false],['rel','Release',true]];
    const existingInline = this.inlineEnvelopeStages();
    for (const [id,label,isTime] of stageDefs) {
      const sliderWrap = document.createElement('div'); sliderWrap.className = 'object-builder-envelope-slider';
      const input = document.createElement('input'); input.type = 'range'; input.dataset.stage = id;
      const output = document.createElement('output');
      let unitSelect: HTMLSelectElement | null = null;
      if (isTime) {
        unitSelect = document.createElement('select'); unitSelect.dataset.unitFor = id;
        for (const u of ['ms','sec','beat']) unitSelect.append(new Option(u,u));
      }
      const saved = existingInline.get(id);
      if (saved && unitSelect) unitSelect.value = saved.unit;
      const configureRange = (resetValue = false): void => {
        const isAttack = id === 'att';
        if (!isTime) { input.min = '0'; input.max = '100'; input.step = '1'; }
        else if (unitSelect?.value === 'sec') {
          input.min = isAttack ? '0.001' : '0'; input.max = '120'; input.step = isAttack ? '0.001' : '0.1';
        } else if (unitSelect?.value === 'beat') {
          input.min = isAttack ? '0.001' : '0'; input.max = '16'; input.step = isAttack ? '0.001' : '1';
        } else {
          input.min = isAttack ? '0.01' : '0'; input.max = '5000'; input.step = isAttack ? '0.01' : '1';
        }
        if (resetValue) input.value = input.min;
        else if (Number(input.value) < Number(input.min)) input.value = input.min;
        else if (Number(input.value) > Number(input.max)) input.value = input.max;
        output.value = input.value;
        output.textContent = input.value;
      };
      input.value = saved?.value ?? (id === 'att' ? '0.01' : '0');
      input.addEventListener('input', () => { output.value = input.value; output.textContent = input.value; });
      unitSelect?.addEventListener('change', () => configureRange(true));
      configureRange();
      sliderWrap.append(input, output);
      const field = this.labeledControl(label, sliderWrap);
      stages.append(field);
      if (unitSelect) stages.append(unitSelect);
      else {
        const spacer = document.createElement('span'); spacer.className = 'object-builder-envelope-unit-spacer'; stages.append(spacer);
      }
    }
    const graph = document.createElement('div'); graph.className = 'object-builder-envelope-preview';
    const redraw = (): void => { graph.innerHTML = this.envelopeSvg(stages); };
    stages.addEventListener('input', redraw); stages.addEventListener('change', redraw); redraw();
    const syncEnvelopeSource = (): void => {
      const locked = existing.value !== '';
      stages.classList.toggle('disabled', locked);
      stages.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach((control) => { control.disabled = locked; });
      graph.classList.toggle('disabled', locked);
    };
    existing.addEventListener('change', syncEnvelopeSource);
    body.append(this.labeledControl('Envelope', existing), stages, graph); syncEnvelopeSource();
    this.openSecondary('VCA / ENVELOPE', body, () => {
      if (existing.value) {
        this.vcaMode = 'existing';
        this.vcaValue = `vca ${existing.value}`;
      } else {
        const chunks: string[] = [];
        for (const [id,,isTime] of stageDefs) {
          const input = stages.querySelector<HTMLInputElement>(`[data-stage="${id}"]`)!;
          const amount = Number(input.value || 0); if (amount <= 0) continue;
          const unit = isTime ? stages.querySelector<HTMLSelectElement>(`[data-unit-for="${id}"]`)!.value : '';
          chunks.push(`${id} ${amount}${isTime ? ` ${unit}` : ''}`);
        }
        this.vcaMode = chunks.length ? 'inline' : 'none';
        this.vcaValue = chunks.length ? `vca ENVELOPE [${chunks.join(', ')}]` : '';
      }
      this.updateActionSummary('vca', this.vcaValue || 'None'); this.onChange();
    });
  }

  private outputPorts(): Array<{ id: string; label: string }> {
    if (this.model === 'sample') return [{id:'L',label:'L'},{id:'R',label:'R'}];
    if (this.model.startsWith('macro.')) return [{id:'main',label:'MAIN'},{id:'aux',label:'AUX'}];
    if (this.model === 'matter' || this.model.startsWith('resonator.')) return [{id:'main',label:'MAIN'},{id:'aux',label:'AUX'}];
    return [{id:'out',label:'OUT'}];
  }

  private routingSourceSyntax(source: string): string {
    if (source === 'out') return '';
    if (source === 'main') return (this.model === 'matter' || this.model.startsWith('resonator.')) ? 'main' : '';
    return source;
  }

  private routingDestinations(): string[] {
    const destinations = ['MAIN.L','MAIN.R'];
    const source = this.editor.value; const lines = source.split(/\r?\n/);
    for (let i=0;i<lines.length;i+=1) {
      const top=lines[i].match(/^\s*(FX|FILTER|VOICE)\s+([A-Za-z_][A-Za-z0-9_]*)\b/i); if(!top)continue;
      const kind=top[1].toUpperCase(), name=top[2];
      if(kind==='FX') destinations.push(`${name}.L`,`${name}.R`);
      else if(kind==='FILTER') destinations.push(`${name}.in`);
      else {
        let sound=''; for(let j=i+1;j<lines.length && (lines[j].trim()===''||/^\s/.test(lines[j]));j+=1){const m=lines[j].trim().match(/^sound\s+([^\s]+)/i);if(m){sound=m[1];break;}}
        if(sound==='matter') destinations.push(`${name}.in`,`${name}.in2`);
        else if(sound.startsWith('resonator.')) destinations.push(`${name}.in`);
      }
    }
    return [...new Set(destinations)];
  }


  private defaultRoutingConnections(): Array<{ source: string; destination: string }> {
    if (this.model === 'sample') return [{ source: 'L', destination: 'MAIN.L' }, { source: 'R', destination: 'MAIN.R' }];
    if (this.model === 'matter' || this.model.startsWith('resonator.')) return [{ source: 'main', destination: 'MAIN.L' }, { source: 'aux', destination: 'MAIN.R' }];
    if (this.model.startsWith('macro.')) return [{ source: 'main', destination: 'MAIN.L' }, { source: 'main', destination: 'MAIN.R' }];
    return [{ source: 'out', destination: 'MAIN.L' }, { source: 'out', destination: 'MAIN.R' }];
  }

  renderRoutingPreview(): HTMLElement {
    return this.routing.renderPreview();
  }

  private inlineEnvelopeStages(): Map<string, { value: string; unit: string }> {
    const result = new Map<string, { value: string; unit: string }>();
    const match = this.vcaValue.match(/^vca\s+ENVELOPE\s*\[([^\]]*)\]/i);
    if (!match) return result;
    for (const chunk of match[1].split(',')) {
      const stage = chunk.trim().match(/^(del|att|hold|dec|sus|rel)\s+([0-9.]+)(?:\s+(ms|sec|beat))?$/i);
      if (!stage) continue;
      result.set(stage[1].toLowerCase(), { value: stage[2], unit: stage[3]?.toLowerCase() ?? '%' });
    }
    return result;
  }

  private findEnvelopeNames(): string[] { const out:string[]=[]; for(const line of this.editor.value.split(/\r?\n/)){const m=line.match(/^\s*SET\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*ENVELOPE\b/i);if(m)out.push(m[1]);} return [...new Set(out)]; }

  private envelopeSvg(stages: HTMLElement): string {
    const fraction = (id: string): number => {
      const input = stages.querySelector<HTMLInputElement>(`[data-stage="${id}"]`);
      if (!input) return 0;
      if (id === 'sus') return Math.max(0, Math.min(1, Number(input.value || 0) / 100));
      const unit = stages.querySelector<HTMLSelectElement>(`[data-unit-for="${id}"]`)?.value ?? 'ms';
      const value = Math.max(0, Number(input.value || 0));
      // Use a common visual time basis so 5 sec is visibly much longer than
      // 5 ms. Beats remain discrete and use their own 1..16 relative scale
      // because the Builder does not know a playback BPM here.
      if (unit === 'beat') return Math.max(0, Math.min(1, value / 16));
      const milliseconds = unit === 'sec' ? value * 1000 : value;
      return Math.max(0, Math.min(1, milliseconds / 5000));
    };
    const sustain = Math.max(0, Math.min(100, Number(stages.querySelector<HTMLInputElement>('[data-stage="sus"]')?.value || 0)));
    const baseY = 90;
    const peakY = 18;
    const sustainY = baseY - (sustain / 100) * (baseY - peakY);
    const segment = 30;
    const startX = 10;
    const xDelay = startX + segment * fraction('del');
    const xAttack = xDelay + segment * fraction('att');
    const xHold = xAttack + segment * fraction('hold');
    const xDecay = xHold + segment * fraction('dec');
    const xSustain = xDecay + 20;
    const xRelease = xSustain + segment * fraction('rel');
    return `<svg viewBox="0 0 200 100" aria-label="Envelope preview"><path d="M ${startX} ${baseY} L ${xDelay} ${baseY} L ${xAttack} ${peakY} L ${xHold} ${peakY} L ${xDecay} ${sustainY} L ${xSustain} ${sustainY} L ${xRelease} ${baseY}" fill="none" vector-effect="non-scaling-stroke"/></svg>`;
  }

  private openSecondary(titleText: string, body: HTMLElement, apply: () => void): void {
    this.closeSecondaryModal(); const overlay=document.createElement('div'); overlay.className='object-builder-secondary-overlay'; overlay.innerHTML=`<section class="object-builder-secondary-dialog" role="dialog" aria-modal="true"><header><strong></strong><button type="button" data-close>×</button></header><div class="object-builder-secondary-body"></div><footer><button type="button" data-cancel>CANCEL</button><button type="button" class="primary" data-apply>APPLY</button></footer></section>`; overlay.querySelector('strong')!.textContent=titleText; overlay.querySelector('.object-builder-secondary-body')!.append(body); document.body.append(overlay); this.modal=overlay; const close=()=>this.closeSecondaryModal(); overlay.querySelector('[data-close]')!.addEventListener('click',close);overlay.querySelector('[data-cancel]')!.addEventListener('click',close);overlay.querySelector('[data-apply]')!.addEventListener('click',()=>{apply();close();});overlay.addEventListener('pointerdown',(event)=>{if(event.target===overlay)close();});
  }

  private section(labelText:string):HTMLElement{const section=document.createElement('section');section.className='object-builder-section';const title=document.createElement('h3');title.textContent=labelText;section.append(title);return section;}
  private labeledControl(labelText:string, control:HTMLElement):HTMLElement{const wrap=document.createElement('label');wrap.className='object-builder-field';const span=document.createElement('span');span.textContent=labelText;wrap.append(span,control);return wrap;}
  private textRow(name:string,labelText:string,defaultValue:string,required=false):HTMLElement{const input=document.createElement('input');input.type='text';input.name=name;input.value=defaultValue;input.required=required;const row=document.createElement('div');row.className='object-builder-row';const label=document.createElement('label');label.textContent=labelText;row.append(label,input);return row;}
  private toggleRow(name:string,labelText:string,checked:boolean):HTMLElement{const input=document.createElement('input');input.type='checkbox';input.name=name;input.checked=checked;const row=document.createElement('div');row.className='object-builder-row';const label=document.createElement('label');label.textContent=labelText;row.append(label,input);return row;}
  private sliderRow(name:string,labelText:string,value:number,liveCapable=false):HTMLElement{const row=document.createElement('div');row.className='object-builder-row';const label=document.createElement('label');label.textContent=labelText;const wrap=document.createElement('div');wrap.className='object-builder-slider';const input=document.createElement('input');input.type='range';input.name=name;input.min='0';input.max='100';input.value=String(value);const output=document.createElement('output');output.textContent=String(value);input.addEventListener('input',()=>output.textContent=input.value);wrap.append(input,output);if(liveCapable){const live=document.createElement('label');live.className='object-builder-live-toggle';const check=document.createElement('input');check.type='checkbox';check.name=`${name}Live`;live.append(check,document.createTextNode(' Live'));wrap.append(live);}row.append(label,wrap);return row;}
  private actionRow(action:string,summary:string,buttonText:string):HTMLElement{const row=document.createElement('div');row.className='object-builder-action-row';const left=document.createElement('div');left.innerHTML=`<strong class="object-builder-action-label"></strong><span class="object-builder-action-summary"></span>`;left.querySelector('strong')!.textContent=action.toUpperCase();left.querySelector('span')!.textContent=summary;const button=document.createElement('button');button.type='button';button.dataset.action=action;button.textContent=buttonText;row.append(left,button);return row;}
  private updateActionSummary(action:string,summary:string):void{const row=this.form.querySelector<HTMLElement>(`[data-action="${action}"]`)?.closest('.object-builder-action-row');if(row)row.querySelector<HTMLElement>('.object-builder-action-summary')!.textContent=summary;}
  private updateCustomizeRow():void{const definition=builderModelDefinition('voice',this.model);const button=this.form.querySelector<HTMLButtonElement>('[data-action="soundCustomize"]');if(!button)return;const count=this.soundParams.size;button.disabled=!(definition?.parameters?.length);button.textContent=count?`MODIFY SOUND · ${count}`:'CUSTOMIZE SOUND';this.updateActionSummary('soundCustomize',definition?.parameters?.length?`${definition.parameters.length} model parameter${definition.parameters.length===1?'':'s'}`:'No additional parameters');}
  private value(name:string):string{return (this.form.querySelector(`[name="${name}"]`) as HTMLInputElement|HTMLSelectElement|null)?.value??'';}
  private checked(name:string):boolean{return (this.form.querySelector(`[name="${name}"]`) as HTMLInputElement|null)?.checked??false;}
}
