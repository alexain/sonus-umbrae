import { builderModelDefinition } from './catalog';
import type { BuilderModelDefinition, BuilderParameterDefinition } from './types';
import { findScaleDefinition, scalesForEdo, type SupportedEdo } from '../language/scales';

type SoundParamValue = { value: string | boolean; live: boolean };
type RoutingMode = 'default' | 'custom' | 'disabled';
type PitchKind = 'notes' | 'freqs' | 'scale' | 'reference';
type BehaviorKind = 'none' | 'every' | 'euclidean' | 'pattern' | 'reference';
type VcaMode = 'none' | 'existing' | 'inline';

interface RoutingConnection { source: string; destination: string; }

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
  private routingMode: RoutingMode = 'default';
  private routingConnections: RoutingConnection[] = [];
  private activeRoutingSource = 'out';
  private visibleRoutingDestinationGroups = new Set<string>();
  private modal: HTMLElement | null = null;

  constructor(
    private readonly form: HTMLElement,
    private readonly editor: HTMLTextAreaElement,
    private readonly onChange: () => void,
    private readonly initialName = 'myVoice',
  ) {}

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
      this.routingMode = 'default';
      this.routingConnections = [];
      this.activeRoutingSource = this.outputPorts()[0]?.id ?? 'out';
      this.visibleRoutingDestinationGroups.clear();
      syncModelSelect(); this.onChange();
    });
    modelSelect.addEventListener('change', () => {
      this.model = modelSelect.value;
      this.soundParams.clear();
      this.routingMode = 'default';
      this.routingConnections = [];
      this.activeRoutingSource = this.outputPorts()[0]?.id ?? 'out';
      this.visibleRoutingDestinationGroups.clear();
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
      if (id === 'lpg') continue;
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
    if (this.routingMode === 'disabled') lines.push('    out mute');
    if (this.routingMode === 'custom') {
      for (const connection of this.routingConnections) {
        const source = this.routingSourceSyntax(connection.source);
        lines.push(`    out${source ? ` ${source}` : ''} to ${connection.destination}`);
      }
    }
    return lines.join('\n');
  }

  previewDescription(): string {
    const outputs = this.outputPorts().map((port) => port.label).join(', ');
    return `VOICE / ${this.model}\n\nOUTPUTS  ${outputs}\nPITCH    ${this.pitchValue}\nVCA      ${this.vcaValue || 'none'}\nROUTING  ${this.routingSummary()}`;
  }

  isSecondaryModalOpen(): boolean { return this.modal !== null; }
  closeSecondaryModal(): void { this.modal?.remove(); this.modal = null; }

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
      const label = document.createElement('label'); label.textContent = parameter.label;
      let control: HTMLInputElement;
      if (parameter.control === 'toggle') {
        control = document.createElement('input'); control.type = 'checkbox'; control.checked = draft.get(parameter.id)?.value === true;
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
        const value = control.type === 'checkbox' ? control.checked : control.value;
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
    const timingColumn = document.createElement('section'); timingColumn.className = 'object-builder-timing-column';
    const timingHeader = document.createElement('div'); timingHeader.className = 'object-builder-timing-column-header';
    const timingHeading = document.createElement('h3'); timingHeading.textContent = 'TIMING';
    const timingToggle = document.createElement('label'); timingToggle.className = 'object-builder-timing-enable';
    const timingCheck = document.createElement('input'); timingCheck.type = 'checkbox'; timingCheck.checked = this.timingEnabled;
    timingToggle.append(timingCheck, document.createTextNode(' Enabled')); timingHeader.append(timingHeading, timingToggle);
    const timingFields = document.createElement('div'); timingFields.className = 'object-builder-timing-fields';

    const timingType = document.createElement('select');
    timingType.append(new Option('Every', 'every'), new Option('Euclidean', 'euclidean'), new Option('Pattern', 'pattern'), new Option('Reference', 'reference'));
    timingType.value = this.behaviorKind === 'none' ? 'every' : this.behaviorKind;

    const modeOptions = (includeShuffle = false): HTMLSelectElement => {
      const select = document.createElement('select');
      const modes = includeShuffle ? ['forward','reverse','pendulum','random','shuffle','walk'] : ['forward','reverse','pendulum','random','walk'];
      for (const mode of modes) select.append(new Option(mode[0].toUpperCase() + mode.slice(1), mode));
      return select;
    };
    const renderModePreview = (container: HTMLElement, mode: string): void => {
      const patterns: Record<string, string[]> = {
        forward: ['1','2','3','4'], reverse: ['4','3','2','1'], pendulum: ['1','2','3','4','3','2'],
        random: ['2','4','1','3'], shuffle: ['3','1','4','2'], walk: ['2','3','2','1','2','3'],
      };
      container.replaceChildren();
      const values = patterns[mode] ?? patterns.forward;
      values.forEach((value, index) => {
        const node = document.createElement('span'); node.className = 'object-builder-reader-node'; node.textContent = value; container.append(node);
        if (index < values.length - 1) { const arrow = document.createElement('i'); arrow.textContent = mode === 'walk' ? '↔' : '→'; container.append(arrow); }
      });
    };

    const everyParts = this.behaviorEveryParts();
    const everyPanel = document.createElement('div'); everyPanel.className = 'object-builder-timing-mode-panel';
    const everyMain = document.createElement('div'); everyMain.className = 'object-builder-timing-compact-row';
    const amount = document.createElement('input'); amount.type = 'text'; amount.value = everyParts.amount;
    const unit = document.createElement('select'); for (const u of ['beat','sec','ms']) unit.append(new Option(u,u)); unit.value = everyParts.unit;
    const everyMode = modeOptions(true); everyMode.value = this.behaviorKind === 'every' ? this.timingReaderMode : 'forward';
    everyMain.append(this.labeledControl('Interval', amount), this.labeledControl('Unit', unit), this.labeledControl('Mode', everyMode));
    const walkAmount = document.createElement('input'); walkAmount.type = 'number'; walkAmount.min = '0.01'; walkAmount.step = '0.01'; walkAmount.value = this.timingReaderAmount;
    const walkField = this.labeledControl('Walk amount', walkAmount); walkField.classList.add('object-builder-walk-amount');
    const everyModePreview = document.createElement('div'); everyModePreview.className = 'object-builder-reader-preview';
    const redrawEveryMode = (): void => { walkField.hidden = everyMode.value !== 'walk'; renderModePreview(everyModePreview, everyMode.value); };
    everyMode.addEventListener('change', redrawEveryMode); redrawEveryMode();
    everyPanel.append(everyMain, walkField, everyModePreview);

    const euclidParts = this.behaviorEuclideanParts();
    const euclidPanel = document.createElement('div'); euclidPanel.className = 'object-builder-timing-mode-panel';
    const steps = document.createElement('input'); steps.type = 'number'; steps.min = '1'; steps.max = '32'; steps.step = '1'; steps.value = String(Math.min(32, Number(euclidParts.steps) || 16));
    euclidPanel.append(this.labeledControl('Steps', steps));
    let pulseCount = Math.max(1, Math.min(Number(steps.value) || 16, Number(euclidParts.pulses) || 1));
    let rotateCount = Math.max(0, Math.min((Number(steps.value) || 16) - 1, Number(euclidParts.rotate) || 0));
    const euclidPreviewRow = document.createElement('div'); euclidPreviewRow.className = 'object-builder-euclidean-preview-row';
    const minusPulse = document.createElement('button'); minusPulse.type = 'button'; minusPulse.className = 'object-builder-euclidean-pulse-button'; minusPulse.textContent = '−'; minusPulse.title = 'Remove one pulse';
    const plusPulse = document.createElement('button'); plusPulse.type = 'button'; plusPulse.className = 'object-builder-euclidean-pulse-button'; plusPulse.textContent = '+'; plusPulse.title = 'Add one pulse';
    const euclidPreview = document.createElement('div'); euclidPreview.className = 'object-builder-euclidean-preview';
    const rotateRow = document.createElement('div'); rotateRow.className = 'object-builder-rotate-row';
    const rotateLeft = document.createElement('button'); rotateLeft.type = 'button'; rotateLeft.textContent = '◀'; rotateLeft.title = 'Rotate left';
    const rotateValue = document.createElement('output'); rotateValue.textContent = String(rotateCount);
    const rotateRight = document.createElement('button'); rotateRight.type = 'button'; rotateRight.textContent = '▶'; rotateRight.title = 'Rotate right';
    rotateRow.append(this.hint('Rotate'), rotateLeft, rotateValue, rotateRight);
    const renderEuclidean = (): void => {
      const stepCount = Math.max(1, Math.min(32, Math.floor(Number(steps.value) || 16)));
      if (Number(steps.value) !== stepCount) steps.value = String(stepCount);
      pulseCount = Math.max(1, Math.min(stepCount, pulseCount)); rotateCount = ((rotateCount % stepCount) + stepCount) % stepCount;
      rotateValue.textContent = String(rotateCount);
      minusPulse.disabled = !timingCheck.checked || pulseCount <= 1; plusPulse.disabled = !timingCheck.checked || pulseCount >= stepCount;
      const size = 190, center = 95, radius = 72;
      const base = Array.from({ length: stepCount }, (_, step) => ((step * pulseCount) % stepCount) < pulseCount);
      const rotated = rotateCount === 0 ? base : base.map((_, step) => base[(step - rotateCount + stepCount) % stepCount]);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
      svg.setAttribute('aria-label', `${pulseCount} pulses over ${stepCount} steps, rotate ${rotateCount}`);
      const ring = document.createElementNS(svg.namespaceURI, 'circle'); ring.setAttribute('cx', String(center)); ring.setAttribute('cy', String(center)); ring.setAttribute('r', String(radius)); ring.setAttribute('class', 'euclidean-ring'); svg.append(ring);
      rotated.forEach((hit, step) => {
        const angle = -Math.PI / 2 + (step / stepCount) * Math.PI * 2;
        const dot = document.createElementNS(svg.namespaceURI, 'circle'); dot.setAttribute('cx', String(center + Math.cos(angle) * radius)); dot.setAttribute('cy', String(center + Math.sin(angle) * radius));
        dot.setAttribute('r', hit ? '5.5' : '3.5'); dot.setAttribute('class', hit ? 'euclidean-step active' : 'euclidean-step'); svg.append(dot);
      });
      const label = document.createElementNS(svg.namespaceURI, 'text'); label.setAttribute('x', String(center)); label.setAttribute('y', String(center + 4)); label.setAttribute('text-anchor', 'middle'); label.setAttribute('class', 'euclidean-label'); label.textContent = `${pulseCount}/${stepCount}`; svg.append(label);
      euclidPreview.replaceChildren(svg);
    };
    minusPulse.addEventListener('click', () => { pulseCount = Math.max(1, pulseCount - 1); renderEuclidean(); });
    plusPulse.addEventListener('click', () => { pulseCount = Math.min(Number(steps.value) || 16, pulseCount + 1); renderEuclidean(); });
    rotateLeft.addEventListener('click', () => { rotateCount -= 1; renderEuclidean(); }); rotateRight.addEventListener('click', () => { rotateCount += 1; renderEuclidean(); });
    steps.addEventListener('input', renderEuclidean); renderEuclidean(); euclidPreviewRow.append(minusPulse, euclidPreview, plusPulse); euclidPanel.append(euclidPreviewRow, rotateRow);

    const patternParts = this.behaviorPatternParts();
    const patternPanel = document.createElement('div'); patternPanel.className = 'object-builder-timing-mode-panel';
    const patternTop = document.createElement('div'); patternTop.className = 'object-builder-timing-compact-row two';
    const patternSteps = document.createElement('input'); patternSteps.type = 'number'; patternSteps.min = '1'; patternSteps.max = '128'; patternSteps.step = '1'; patternSteps.value = patternParts.steps;
    const patternMode = modeOptions(false); patternMode.value = patternParts.mode;
    patternTop.append(this.labeledControl('Steps', patternSteps), this.labeledControl('Mode', patternMode));
    let patternEvents = new Set<number>(patternParts.events.length ? patternParts.events : [1, 5, 9, 13]);
    let patternPage = 0;
    const patternPager = document.createElement('div'); patternPager.className = 'object-builder-pattern-pager';
    const patternGrid = document.createElement('div'); patternGrid.className = 'object-builder-pattern-grid';
    const renderPattern = (): void => {
      const count = Math.max(1, Math.min(128, Math.floor(Number(patternSteps.value) || 16))); patternSteps.value = String(count);
      patternEvents = new Set([...patternEvents].filter((step) => step <= count)); if (!patternEvents.size) patternEvents.add(1);
      const pageCount = Math.ceil(count / 32); patternPage = Math.min(patternPage, pageCount - 1);
      patternPager.replaceChildren();
      const previous = document.createElement('button'); previous.type = 'button'; previous.className = 'object-builder-pattern-page-nav'; previous.textContent = '‹'; previous.disabled = patternPage === 0;
      previous.addEventListener('click', () => { patternPage = Math.max(0, patternPage - 1); renderPattern(); }); patternPager.append(previous);
      for (let page = 0; page < pageCount; page++) {
        const pageButton = document.createElement('button'); pageButton.type = 'button'; pageButton.className = 'object-builder-pattern-page'; pageButton.textContent = String(page + 1); pageButton.classList.toggle('active', page === patternPage);
        pageButton.addEventListener('click', () => { patternPage = page; renderPattern(); }); patternPager.append(pageButton);
      }
      const next = document.createElement('button'); next.type = 'button'; next.className = 'object-builder-pattern-page-nav'; next.textContent = '›'; next.disabled = patternPage >= pageCount - 1;
      next.addEventListener('click', () => { patternPage = Math.min(pageCount - 1, patternPage + 1); renderPattern(); }); patternPager.append(next);
      patternGrid.replaceChildren();
      const firstStep = patternPage * 32 + 1; const lastStep = Math.min(count, firstStep + 31);
      for (let step = firstStep; step <= lastStep; step++) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'object-builder-pattern-step'; button.textContent = String(step); button.classList.toggle('active', patternEvents.has(step));
        button.addEventListener('click', () => { if (patternEvents.has(step) && patternEvents.size > 1) patternEvents.delete(step); else patternEvents.add(step); renderPattern(); }); patternGrid.append(button);
      }
    };
    patternSteps.addEventListener('input', () => { patternPage = 0; renderPattern(); }); renderPattern(); patternPanel.append(patternTop, patternPager, patternGrid, this.hint('32 steps per page (16 + 16), up to 128. Click steps to toggle events.'));

    const timingReferencePanel = document.createElement('div'); timingReferencePanel.className = 'object-builder-timing-mode-panel object-builder-reference-panel';
    const timingReference = document.createElement('select');
    const timingReferenceInfo = document.createElement('div'); timingReferenceInfo.className = 'object-builder-reference-info';
    const timingReferences = this.findTimingReferences();
    if (!timingReferences.length) timingReference.append(new Option('No RHYTHM sources', ''));
    else for (const item of timingReferences) timingReference.append(new Option(item.name, item.name));
    const timingReferenceParts = this.behaviorReferenceParts();
    if (timingReferenceParts.name && timingReferences.some((item) => item.name === timingReferenceParts.name)) timingReference.value = timingReferenceParts.name;
    const updateTimingReference = (): void => {
      const item = timingReferences.find((entry) => entry.name === timingReference.value); timingReferenceInfo.replaceChildren();
      if (!item) { timingReferenceInfo.textContent = 'Declare SET name: RHYTHM ... to reuse a complete timing structure.'; return; }
      const type = document.createElement('strong'); type.textContent = 'SET · RHYTHM'; const detail = document.createElement('span'); detail.textContent = item.detail; timingReferenceInfo.append(type, detail);
    };
    timingReference.addEventListener('change', updateTimingReference); updateTimingReference(); timingReferencePanel.append(this.labeledControl('Rhythm', timingReference), timingReferenceInfo);

    const makeChanceEditor = () => {
      const row = document.createElement('div'); row.className = 'object-builder-chance-row';
      const slider = document.createElement('input'); slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.step = '1';
      const initial = this.behaviorTimingModifiers(); slider.value = initial.chance;
      const out = document.createElement('output'); out.textContent = `${slider.value}%`; slider.addEventListener('input', () => out.textContent = `${slider.value}%`);
      const chanceWrap = document.createElement('div'); chanceWrap.className = 'object-builder-mini-slider'; chanceWrap.append(slider, out);
      const looseLabel = document.createElement('label'); looseLabel.className = 'object-builder-clock-extra-toggle'; const loose = document.createElement('input'); loose.type = 'checkbox'; loose.checked = initial.loose; looseLabel.append(loose, document.createTextNode(' Loose'));
      row.append(this.labeledControl('Chance', chanceWrap), looseLabel); return { row, slider, loose };
    };
    const chance = makeChanceEditor();

    const makeClockEditor = () => {
      const wrap = document.createElement('div'); wrap.className = 'object-builder-inline-clock';
      const source = document.createElement('select'); source.append(new Option('Master', 'master')); for (const c of this.findClockNames()) source.append(new Option(c, c));
      const extraLabel = document.createElement('label'); extraLabel.className = 'object-builder-clock-extra-toggle'; const extras = document.createElement('input'); extras.type = 'checkbox'; extraLabel.append(extras, document.createTextNode(' Derived / feel'));
      const head = document.createElement('div'); head.className = 'object-builder-clock-head'; head.append(this.labeledControl('Clock', source), extraLabel);
      const inline = document.createElement('div'); inline.className = 'object-builder-inline-clock-fields';
      const rate = document.createElement('input'); rate.type = 'text'; rate.value = '/2'; rate.placeholder = '/4 or *2';
      const slider = (label: string) => { const input = document.createElement('input'); input.type = 'range'; input.min = '0'; input.max = '100'; input.step = '1'; input.value = '0'; const out = document.createElement('output'); out.textContent = '0'; input.addEventListener('input', () => out.textContent = input.value); const w = document.createElement('div'); w.className = 'object-builder-mini-slider'; w.append(input, out); return { field: this.labeledControl(label, w), input, out }; };
      const jitter = slider('Jitter'), drifter = slider('Drifter'); inline.append(this.labeledControl('Derived rate', rate), jitter.field, drifter.field);
      const sync = (): void => { inline.hidden = !extras.checked; }; extras.addEventListener('change', sync); sync(); wrap.append(head, inline);
      return { wrap, source, extras, rate, jitter: jitter.input, drifter: drifter.input, jitterOut: jitter.out, drifterOut: drifter.out, sync };
    };
    const clock = makeClockEditor();
    const currentClock = this.timingClockParts(this.behaviorValue);
    clock.source.value = [...clock.source.options].some((option) => option.value === currentClock.clock) ? currentClock.clock : 'master'; clock.extras.checked = currentClock.extras;
    clock.rate.value = currentClock.rate; clock.jitter.value = currentClock.jitter; clock.drifter.value = currentClock.drifter; clock.jitterOut.textContent = clock.jitter.value; clock.drifterOut.textContent = clock.drifter.value; clock.sync();
    const clockModifiers = (): string[] => {
      const sourceName = clock.source.value;
      if (!clock.extras.checked) return sourceName === 'master' ? [] : [`clock ${sourceName}`];
      const rateValue = /^[/*]\s*\d+(?:\.\d+)?$/.test(clock.rate.value.trim()) ? clock.rate.value.trim().replace(/\s+/g, '') : '/1';
      const parent = sourceName === 'master' ? '' : `${sourceName} `; const result = [`clock ${parent}${rateValue}`];
      if (Number(clock.jitter.value) > 0) result.push(`jitter ${clock.jitter.value}`); if (Number(clock.drifter.value) > 0) result.push(`drifter ${clock.drifter.value}`); return result;
    };
    const localModifiers = (): string[] => { const mods: string[] = []; if (Number(chance.slider.value) < 100) mods.push(`chance ${chance.slider.value}`); if (chance.loose.checked) mods.push('loose'); return mods; };
    const onClause = (mods: string[]): string => mods.length ? ` on ${mods.join(', ')}` : '';

    const timingPanels = [everyPanel, euclidPanel, patternPanel, timingReferencePanel];
    const syncTiming = (): void => {
      timingFields.classList.toggle('disabled', !timingCheck.checked); timingType.disabled = !timingCheck.checked;
      const selected = timingType.value; everyPanel.hidden = selected !== 'every'; euclidPanel.hidden = selected !== 'euclidean'; patternPanel.hidden = selected !== 'pattern'; timingReferencePanel.hidden = selected !== 'reference';
      chance.row.hidden = selected === 'pattern'; clock.wrap.hidden = selected === 'reference';
      const beatBased = selected !== 'every' || unit.value === 'beat'; clock.wrap.classList.toggle('disabled', !beatBased);
      for (const panel of timingPanels) for (const control of panel.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button')) control.disabled = !timingCheck.checked;
      for (const control of chance.row.querySelectorAll<HTMLInputElement>('input')) control.disabled = !timingCheck.checked;
      for (const control of clock.wrap.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')) control.disabled = !timingCheck.checked || !beatBased;
      renderEuclidean();
    };
    timingCheck.addEventListener('change', syncTiming); timingType.addEventListener('change', syncTiming); unit.addEventListener('change', syncTiming);
    timingFields.append(this.labeledControl('Type', timingType), everyPanel, euclidPanel, patternPanel, timingReferencePanel, chance.row, clock.wrap);
    timingColumn.append(timingHeader, timingFields); syncTiming();

    columns.append(pitchColumn, timingColumn); body.append(columns);
    this.openSecondary('PITCH & TIMING', body, () => {
      const selectedKind = pitchType.value as PitchKind; this.pitchKind = selectedKind;
      if (selectedKind === 'notes') this.pitchValue = `pitch notes [${notesInput.value.trim().replace(/^\[|\]$/g, '') || 'C3'}]`;
      else if (selectedKind === 'freqs') this.pitchValue = `pitch freqs [${freqsInput.value.trim().replace(/^\[|\]$/g, '') || '440'}]`;
      else if (selectedKind === 'scale') { this.scaleEdo = Number(edo.value) as SupportedEdo; this.scaleRoot = root.value; this.scaleId = scale.value; this.pitchValue = `pitch scale ${this.scaleRoot} ${this.scaleId}`; }
      else this.pitchValue = reference.value ? `pitch ${reference.value}` : 'pitch notes [C3]';

      this.timingEnabled = timingCheck.checked;
      if (!this.timingEnabled) { this.behaviorKind = 'none'; this.behaviorValue = ''; this.timingReaderMode = 'forward'; }
      else if (timingType.value === 'every') {
        this.behaviorKind = 'every'; this.timingReaderMode = everyMode.value as typeof this.timingReaderMode; this.timingReaderAmount = walkAmount.value || '1';
        const timingMods = unit.value === 'beat' ? [...clockModifiers(), ...localModifiers()] : localModifiers();
        this.behaviorValue = `every ${amount.value || '1'} ${unit.value}${onClause(timingMods)}`;
      } else if (timingType.value === 'euclidean') {
        this.behaviorKind = 'euclidean'; this.timingReaderMode = 'forward'; const mods = rotateCount > 0 ? [`rotate ${rotateCount}`] : []; mods.push(...clockModifiers(), ...localModifiers());
        this.behaviorValue = `every euclidean ${pulseCount}/${steps.value || '16'}${onClause(mods)}`;
      } else if (timingType.value === 'pattern') {
        this.behaviorKind = 'pattern'; this.timingReaderMode = 'forward';
        const count = Math.max(1, Math.min(128, Math.floor(Number(patternSteps.value) || 16))); const events = [...patternEvents].filter((step) => step <= count).sort((a,b) => a-b);
        const mode = patternMode.value !== 'forward' ? `mode ${patternMode.value} ` : '';
        const patternClock = clockModifiers();
        // PATTERN needs an explicit master-rate clock to avoid its historical *4 default.
        const clockText = patternClock.length ? ` on clock ${patternClock[0].replace(/^clock\s+/, '')}${patternClock.slice(1).length ? `, ${patternClock.slice(1).join(', ')}` : ''}` : ' on clock /1';
        this.behaviorValue = `${mode}pattern [${events.join(' ')}] steps ${count}${clockText}`;
      } else {
        this.behaviorKind = 'reference'; this.timingReaderMode = 'forward'; const mods = localModifiers(); this.behaviorValue = timingReference.value ? `rhythm ${timingReference.value}${mods.length ? ` ${mods.join(', ')}` : ''}` : '';
      }
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

  private findTimingReferences(): Array<{ name: string; detail: string }> {
    const result: Array<{ name: string; detail: string }> = [];
    for (const line of this.editor.value.split(/\r?\n/)) {
      const match = line.match(/^\s*SET\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*RHYTHM\s+(.+)$/i);
      if (match) result.push({ name: match[1], detail: match[2].trim() });
    }
    return result.filter((item, index) => result.findIndex((other) => other.name === item.name) === index);
  }

  private behaviorTimingModifiers(): { chance: string; loose: boolean } {
    return {
      chance: this.behaviorValue.match(/\bchance\s+(\d+(?:\.\d+)?)/i)?.[1] ?? '100',
      loose: /(?:^|[,\s])loose(?:,|$)/i.test(this.behaviorValue),
    };
  }

  private behaviorPatternParts(): { steps: string; mode: string; events: number[] } {
    const match = this.behaviorValue.match(/^(?:mode\s+(forward|reverse|pendulum|walk|random)\s+)?pattern\s+\[([^\]]+)\](?:\s+steps\s+(\d+))?/i);
    if (!match) return { steps: '16', mode: 'forward', events: [1, 5, 9, 13] };
    const events = match[2].trim().split(/\s+/).map((token) => Number(token.match(/^\d+/)?.[0])).filter((value) => Number.isInteger(value) && value > 0);
    return { steps: match[3] ?? '16', mode: match[1]?.toLowerCase() ?? 'forward', events };
  }

  private behaviorReferenceParts(): { name: string } {
    return { name: this.behaviorValue.match(/^rhythm\s+([A-Za-z_][A-Za-z0-9_]*)/i)?.[1] ?? '' };
  }

  private timingClockParts(value: string): { clock: string; extras: boolean; rate: string; jitter: string; drifter: string } {
    const match = value.match(/\bon\s+clock\s+([^,]+)(.*)$/i);
    if (!match) return { clock: 'master', extras: false, rate: '/2', jitter: '0', drifter: '0' };
    const head = match[1].trim();
    const derived = head.match(/^(?:(\w+)\s+)?([/*]\s*\d+(?:\.\d+)?)$/);
    const tail = match[2] ?? '';
    const jitter = tail.match(/\bjitter\s+(\d+(?:\.\d+)?)/i)?.[1] ?? '0';
    const drifter = tail.match(/\bdrifter\s+(\d+(?:\.\d+)?)/i)?.[1] ?? '0';
    if (derived) return { clock: derived[1] ?? 'master', extras: true, rate: derived[2].replace(/\s+/g, ''), jitter, drifter };
    return { clock: head, extras: false, rate: '/2', jitter: '0', drifter: '0' };
  }

  private behaviorEveryParts(): { amount: string; unit: string; clock: string; extras: boolean; rate: string; jitter: string; drifter: string } {
    const match = this.behaviorValue.match(/^every\s+([^\s]+)\s+(beat|sec|ms)/i);
    return { amount: match?.[1] ?? '1', unit: match?.[2] ?? 'beat', ...this.timingClockParts(this.behaviorValue) };
  }

  private behaviorEuclideanParts(): { pulses: string; steps: string; rotate: string; clock: string; extras: boolean; rate: string; jitter: string; drifter: string } {
    const match = this.behaviorValue.match(/^every\s+euclidean\s+(\d+)\/(\d+)/i);
    const rotate = this.behaviorValue.match(/\brotate\s+(\d+)/i)?.[1] ?? '0';
    return { pulses: match?.[1] ?? '1', steps: match?.[2] ?? '16', rotate, ...this.timingClockParts(this.behaviorValue) };
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

  private routingColor(source: string): string {
    const palette = ['#f0bf24', '#35d6d3', '#ef6fcf', '#7fdc72'];
    const index = Math.max(0, this.outputPorts().findIndex((port) => port.id === source));
    return palette[index % palette.length];
  }

  private drawRoutingWires(canvas: HTMLElement, svg: SVGSVGElement, connections: RoutingConnection[]): void {
    const bounds=canvas.getBoundingClientRect(); svg.setAttribute('viewBox',`0 0 ${bounds.width} ${bounds.height}`);
    for(const connection of connections){const a=canvas.querySelector<HTMLElement>(`.object-builder-port[data-port="${CSS.escape(connection.source)}"] i`);const b=canvas.querySelector<HTMLElement>(`.object-builder-port[data-destination="${CSS.escape(connection.destination)}"] i`);if(!a||!b)continue;const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();const x1=ar.left+ar.width/2-bounds.left,y1=ar.top+ar.height/2-bounds.top,x2=br.left+br.width/2-bounds.left,y2=br.top+br.height/2-bounds.top;const path=document.createElementNS('http://www.w3.org/2000/svg','path');const c=Math.max(40,(x2-x1)*0.45);path.setAttribute('d',`M ${x1} ${y1} C ${x1+c} ${y1}, ${x2-c} ${y2}, ${x2} ${y2}`);path.style.stroke=this.routingColor(connection.source);svg.append(path);}
  }

  private defaultRoutingConnections(): RoutingConnection[] {
    if (this.model === 'sample') return [{ source: 'L', destination: 'MAIN.L' }, { source: 'R', destination: 'MAIN.R' }];
    if (this.model === 'matter' || this.model.startsWith('resonator.')) return [{ source: 'main', destination: 'MAIN.L' }, { source: 'aux', destination: 'MAIN.R' }];
    if (this.model.startsWith('macro.')) return [{ source: 'main', destination: 'MAIN.L' }, { source: 'main', destination: 'MAIN.R' }];
    return [{ source: 'out', destination: 'MAIN.L' }, { source: 'out', destination: 'MAIN.R' }];
  }

  private effectiveRoutingConnections(): RoutingConnection[] {
    if (this.routingMode === 'disabled') return [];
    return this.routingMode === 'custom' ? this.routingConnections : this.defaultRoutingConnections();
  }

  private sameRouting(a: RoutingConnection[], b: RoutingConnection[]): boolean {
    const normalize = (items: RoutingConnection[]) => items.map((item) => `${item.source}→${item.destination}`).sort().join('|');
    return normalize(a) === normalize(b);
  }

  private routingSummary(): string {
    if (this.routingMode === 'disabled') return 'Disabled · out mute';
    const connections = this.effectiveRoutingConnections();
    if (!connections.length) return 'No connections';
    const grouped = new Map<string, string[]>();
    for (const connection of connections) {
      const list = grouped.get(connection.source) ?? []; list.push(connection.destination); grouped.set(connection.source, list);
    }
    return [...grouped].map(([source, destinations]) => `${source} → ${destinations.join(' + ')}`).join(' · ');
  }

  private routingDestinationGroup(destination: string): string {
    const dot = destination.indexOf('.');
    return dot >= 0 ? destination.slice(0, dot) : destination;
  }

  private visibleRoutingDestinations(showAll: boolean): string[] {
    const all = this.routingDestinations();
    if (showAll) return all;
    const visibleGroups = new Set<string>(['MAIN', ...this.visibleRoutingDestinationGroups]);
    for (const connection of this.effectiveRoutingConnections()) {
      visibleGroups.add(this.routingDestinationGroup(connection.destination));
    }
    return all.filter((destination) => visibleGroups.has(this.routingDestinationGroup(destination)));
  }

  renderRoutingPreview(): HTMLElement {
    return this.renderRoutingPanel(false);
  }

  private renderRoutingPanel(showAll: boolean): HTMLElement {
    const panel = document.createElement('div');
    panel.className = `object-builder-routing-preview object-builder-routing-inline${showAll ? ' expanded' : ''}`;

    const toolbar = document.createElement('div');
    toolbar.className = 'object-builder-routing-toolbar';

    const disabledLabel = document.createElement('label');
    disabledLabel.className = 'object-builder-routing-disabled';
    const disabled = document.createElement('input');
    disabled.type = 'checkbox';
    disabled.checked = this.routingMode === 'disabled';
    disabledLabel.append(disabled, document.createTextNode(' Disable output'));
    toolbar.append(disabledLabel);

    if (!showAll) {
      const actions = document.createElement('div');
      actions.className = 'object-builder-routing-actions';
      const add = document.createElement('select');
      add.className = 'object-builder-routing-add';
      add.append(new Option('+ Add destination', ''));
      const allGroups = [...new Set(this.routingDestinations().map((destination) => this.routingDestinationGroup(destination)))];
      const visibleGroups = new Set(this.visibleRoutingDestinations(false).map((destination) => this.routingDestinationGroup(destination)));
      for (const group of allGroups) {
        if (group === 'MAIN' || visibleGroups.has(group)) continue;
        add.append(new Option(group, group));
      }
      add.disabled = disabled.checked || add.options.length <= 1;
      add.addEventListener('change', () => {
        if (!add.value) return;
        this.visibleRoutingDestinationGroups.add(add.value);
        this.onChange();
      });

      const expand = document.createElement('button');
      expand.type = 'button';
      expand.className = 'object-builder-routing-expand';
      expand.title = 'Expand routing';
      expand.setAttribute('aria-label', 'Expand routing');
      expand.textContent = '↗';
      expand.disabled = disabled.checked;
      expand.addEventListener('click', () => this.openExpandedRouting());
      actions.append(add, expand);
      toolbar.append(actions);
    }

    const canvas = document.createElement('div');
    canvas.className = 'object-builder-routing-preview-canvas object-builder-routing-canvas';
    canvas.classList.toggle('disabled', disabled.checked);

    const left = document.createElement('div');
    left.className = 'object-builder-routing-preview-column object-builder-routing-column';
    const right = document.createElement('div');
    right.className = 'object-builder-routing-preview-column object-builder-routing-column';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('object-builder-routing-wires');

    let connections = this.effectiveRoutingConnections().map((item) => ({ ...item }));
    const ports = this.outputPorts();
    if (!ports.some((port) => port.id === this.activeRoutingSource)) {
      this.activeRoutingSource = ports[0]?.id ?? 'out';
    }

    const redraw = (): void => {
      svg.replaceChildren();
      requestAnimationFrame(() => this.drawRoutingWires(canvas, svg, connections));
      for (const item of left.querySelectorAll<HTMLElement>('.object-builder-port')) {
        const sourceId = item.dataset.port ?? '';
        item.classList.toggle('active', sourceId === this.activeRoutingSource);
        item.classList.toggle('routed', connections.some((entry) => entry.source === sourceId));
      }
      for (const item of right.querySelectorAll<HTMLElement>('.object-builder-port')) {
        item.classList.toggle('connected', connections.some((entry) => entry.source === this.activeRoutingSource && entry.destination === item.dataset.destination));
      }
    };

    const commitConnections = (next: RoutingConnection[]): void => {
      connections = next.map((item) => ({ ...item }));
      if (this.sameRouting(next, this.defaultRoutingConnections())) {
        this.routingMode = 'default';
        this.routingConnections = [];
      } else {
        this.routingMode = 'custom';
        this.routingConnections = next.map((item) => ({ ...item }));
      }
      redraw();
      this.onChange();
    };

    for (const source of ports) {
      const port = document.createElement('button');
      port.type = 'button';
      port.className = 'object-builder-port object-builder-preview-port';
      port.dataset.port = source.id;
      port.style.setProperty('--route-color', this.routingColor(source.id));
      port.disabled = disabled.checked;
      port.classList.toggle('active', source.id === this.activeRoutingSource);
      port.classList.toggle('routed', connections.some((entry) => entry.source === source.id));
      port.innerHTML = `<span>${source.label}</span><i></i>`;
      port.addEventListener('click', () => {
        this.activeRoutingSource = source.id;
        redraw();
      });
      left.append(port);
    }

    for (const destination of this.visibleRoutingDestinations(showAll)) {
      const port = document.createElement('button');
      port.type = 'button';
      port.className = 'object-builder-port object-builder-preview-port destination';
      port.dataset.destination = destination;
      port.disabled = disabled.checked;
      port.classList.toggle('connected', connections.some((entry) => entry.source === this.activeRoutingSource && entry.destination === destination));
      port.innerHTML = `<i></i><span>${destination}</span>`;
      port.addEventListener('click', () => {
        const next = connections.map((item) => ({ ...item }));
        const index = next.findIndex((entry) => entry.source === this.activeRoutingSource && entry.destination === destination);
        if (index >= 0) next.splice(index, 1);
        else next.push({ source: this.activeRoutingSource, destination });
        commitConnections(next);
      });
      right.append(port);
    }

    disabled.addEventListener('change', () => {
      if (disabled.checked) {
        this.routingMode = 'disabled';
        this.routingConnections = [];
      } else {
        this.routingMode = 'default';
        this.routingConnections = [];
      }
      this.onChange();
    });

    canvas.append(left, svg, right);
    panel.append(toolbar, canvas);
    requestAnimationFrame(() => this.drawRoutingWires(canvas, svg, connections));
    return panel;
  }

  private openExpandedRouting(): void {
    const body = document.createElement('div');
    body.className = 'object-builder-routing-expanded-body';
    body.append(this.renderRoutingPanel(true));
    this.openSecondary('VOICE ROUTING', body, () => this.onChange());
    this.modal?.querySelector('.object-builder-secondary-dialog')?.classList.add('object-builder-routing-expanded-dialog');
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
  private findClockNames(): string[] { const out:string[]=[]; for(const line of this.editor.value.split(/\r?\n/)){const m=line.match(/^\s*CLOCK\s+([A-Za-z_][A-Za-z0-9_]*)\b/i);if(m&&!/^set$/i.test(m[1]))out.push(m[1]);} return [...new Set(out)]; }

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
