import { builderModelDefinition } from './catalog';
import type { BuilderModelDefinition, BuilderParameterDefinition } from './types';

type SoundParamValue = { value: string | boolean; live: boolean };
type RoutingMode = 'default' | 'custom' | 'disabled';
type PitchKind = 'notes' | 'freqs' | 'scale' | 'reference' | 'raw';
type BehaviorKind = 'none' | 'every' | 'euclidean';
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
  private vcaMode: VcaMode = 'none';
  private vcaValue = '';
  private routingMode: RoutingMode = 'default';
  private routingConnections: RoutingConnection[] = [];
  private activeRoutingSource = 'out';
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

    const pitch = this.actionRow('pitch', 'notes [C3]', 'CONFIGURE');
    pitch.querySelector('.object-builder-action-label')!.textContent = 'PITCH';
    this.form.append(pitch);

    this.form.append(this.sliderRow('level', 'Level', 50, true));

    const vca = this.actionRow('vca', 'None', 'CONFIGURE');
    vca.querySelector('.object-builder-action-label')!.textContent = 'VCA';
    this.form.append(vca);

    const behavior = this.actionRow('behavior', 'None', 'CONFIGURE');
    behavior.querySelector('.object-builder-action-label')!.textContent = 'BEHAVIOR';
    this.form.append(behavior);


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
      syncModelSelect(); this.onChange();
    });
    modelSelect.addEventListener('change', () => {
      this.model = modelSelect.value;
      this.soundParams.clear();
      this.routingMode = 'default';
      this.routingConnections = [];
      this.activeRoutingSource = this.outputPorts()[0]?.id ?? 'out';
      this.updateCustomizeRow(); this.onChange();
    });
    this.form.querySelector('[data-action="soundCustomize"]')?.addEventListener('click', () => this.openSoundEditor());
    this.form.querySelector('[data-action="pitch"]')?.addEventListener('click', () => this.openPitchEditor());
    this.form.querySelector('[data-action="vca"]')?.addEventListener('click', () => this.openVcaEditor());
    this.form.querySelector('[data-action="behavior"]')?.addEventListener('click', () => this.openBehaviorEditor());
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
    const behavior = this.behaviorValue ? ` ${this.behaviorValue}` : '';
    lines.push(`    ${this.pitchValue || 'pitch notes [C3]'}${behavior}`);
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
    const body = document.createElement('div'); body.className = 'object-builder-secondary-fields';
    const kind = document.createElement('select');
    for (const value of ['notes','freqs','scale','reference','raw']) kind.append(new Option(value, value));
    kind.value = this.pitchKind;
    const input = document.createElement('input'); input.type = 'text'; input.placeholder = 'C3 E3 G3';
    const currentBody = this.pitchValue.replace(/^pitch\s+(notes|freqs|scale)\s+/i, '').replace(/^pitch\s+/i, '');
    input.value = currentBody.replace(/^\[|\]$/g, '');
    const hint = document.createElement('div'); hint.className = 'object-builder-secondary-hint';
    const updateHint = (): void => {
      const hints: Record<string,string> = { notes: 'Notes, e.g. C3 Eb3 G3', freqs: 'Frequencies, e.g. 110 220 330', scale: 'Scale expression, e.g. C minor with range C3 C5', reference: 'Existing SEQ / REGISTER pitch source', raw: 'Advanced pitch body after the PITCH keyword' };
      hint.textContent = hints[kind.value] ?? '';
    };
    body.append(this.labeledControl('Type', kind), this.labeledControl('Value', input), hint); updateHint(); kind.addEventListener('change', updateHint);
    this.openSecondary('PITCH', body, () => {
      const raw = input.value.trim(); if (!raw) { this.pitchValue = ''; }
      else if (kind.value === 'notes' || kind.value === 'freqs') this.pitchValue = `pitch ${kind.value} [${raw.replace(/^\[|\]$/g, '')}]`;
      else if (kind.value === 'scale') this.pitchValue = `pitch scale ${raw}`;
      else this.pitchValue = `pitch ${raw}`;
      this.pitchKind = kind.value as PitchKind; this.updateActionSummary('pitch', this.pitchValue || 'Not configured'); this.onChange();
    });
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
      const input = document.createElement('input'); input.type = 'range'; input.min = '0'; input.dataset.stage = id;
      const output = document.createElement('output');
      let unitSelect: HTMLSelectElement | null = null;
      if (isTime) {
        unitSelect = document.createElement('select'); unitSelect.dataset.unitFor = id;
        for (const u of ['ms','sec','beat']) unitSelect.append(new Option(u,u));
      }
      const saved = existingInline.get(id);
      if (saved && unitSelect) unitSelect.value = saved.unit;
      const configureRange = (resetValue = false): void => {
        if (!isTime) { input.max = '100'; input.step = '1'; }
        else if (unitSelect?.value === 'sec') { input.max = '120'; input.step = '0.1'; }
        else if (unitSelect?.value === 'beat') { input.max = '16'; input.step = '1'; }
        else { input.max = '5000'; input.step = '1'; }
        if (resetValue) input.value = '0';
        else if (Number(input.value) > Number(input.max)) input.value = input.max;
        output.value = input.value;
        output.textContent = input.value;
      };
      input.value = saved?.value ?? '0';
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

  private openBehaviorEditor(): void {
    const body = document.createElement('div'); body.className = 'object-builder-secondary-fields';
    const type = document.createElement('select'); for (const item of ['none','every','euclidean']) type.append(new Option(item,item)); type.value = this.behaviorKind;
    const every = document.createElement('div'); every.className = 'object-builder-behavior-fields';
    const amount = document.createElement('input'); amount.type = 'text'; amount.value = '1';
    const unit = document.createElement('select'); for (const u of ['beat','sec','ms']) unit.append(new Option(u,u));
    const clock = document.createElement('select'); for (const c of ['master', ...this.findClockNames()]) clock.append(new Option(c,c));
    every.append(this.labeledControl('Interval', amount), this.labeledControl('Unit', unit), this.labeledControl('Clock', clock));
    const euclid = document.createElement('div'); euclid.className = 'object-builder-behavior-fields';
    const pulses = document.createElement('input'); pulses.type='number'; pulses.min='1'; pulses.value='5'; const steps=document.createElement('input'); steps.type='number'; steps.min='1'; steps.value='16';
    euclid.append(this.labeledControl('Pulses', pulses), this.labeledControl('Steps', steps));
    const sync = (): void => { every.hidden = type.value !== 'every'; euclid.hidden = type.value !== 'euclidean'; };
    type.addEventListener('change', sync); body.append(this.labeledControl('Type', type), every, euclid); sync();
    this.openSecondary('BEHAVIOR / TIMING', body, () => {
      this.behaviorKind = type.value as BehaviorKind;
      if (type.value === 'every') this.behaviorValue = `every ${amount.value || '1'} ${unit.value}${clock.value !== 'master' ? ` on clock ${clock.value}` : ''}`;
      else if (type.value === 'euclidean') this.behaviorValue = `every euclidean ${pulses.value || '1'}/${steps.value || '16'}`;
      else this.behaviorValue = '';
      this.updateActionSummary('behavior', this.behaviorValue || 'None'); this.onChange();
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

  renderRoutingPreview(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'object-builder-routing-preview object-builder-routing-inline';

    const disabledLabel = document.createElement('label');
    disabledLabel.className = 'object-builder-routing-disabled';
    const disabled = document.createElement('input');
    disabled.type = 'checkbox';
    disabled.checked = this.routingMode === 'disabled';
    disabledLabel.append(disabled, document.createTextNode(' Disable output'));

    const canvas = document.createElement('div');
    canvas.className = 'object-builder-routing-preview-canvas object-builder-routing-canvas';
    canvas.classList.toggle('disabled', disabled.checked);

    const left = document.createElement('div');
    left.className = 'object-builder-routing-preview-column object-builder-routing-column';
    const right = document.createElement('div');
    right.className = 'object-builder-routing-preview-column object-builder-routing-column';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('object-builder-routing-wires');

    const connections = this.effectiveRoutingConnections().map((item) => ({ ...item }));
    const ports = this.outputPorts();
    if (!ports.some((port) => port.id === this.activeRoutingSource)) {
      this.activeRoutingSource = ports[0]?.id ?? 'out';
    }

    const commitConnections = (next: RoutingConnection[]): void => {
      if (this.sameRouting(next, this.defaultRoutingConnections())) {
        this.routingMode = 'default';
        this.routingConnections = [];
      } else {
        this.routingMode = 'custom';
        this.routingConnections = next.map((item) => ({ ...item }));
      }
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
        for (const item of left.querySelectorAll<HTMLElement>('.object-builder-port')) {
          const sourceId = item.dataset.port ?? '';
          item.classList.toggle('active', sourceId === this.activeRoutingSource);
          item.classList.toggle('routed', connections.some((entry) => entry.source === sourceId));
        }
        for (const item of right.querySelectorAll<HTMLElement>('.object-builder-port')) {
          item.classList.toggle('connected', connections.some((entry) => entry.source === this.activeRoutingSource && entry.destination === item.dataset.destination));
        }
      });
      left.append(port);
    }

    for (const destination of this.routingDestinations()) {
      const port = document.createElement('button');
      port.type = 'button';
      port.className = 'object-builder-port object-builder-preview-port destination';
      port.dataset.destination = destination;
      port.disabled = disabled.checked;
      port.classList.toggle('connected', connections.some((entry) => entry.source === this.activeRoutingSource && entry.destination === destination));
      port.innerHTML = `<i></i><span>${destination}</span>`;
      port.addEventListener('click', () => {
        const next = this.effectiveRoutingConnections().map((item) => ({ ...item }));
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
    panel.append(disabledLabel, canvas);
    requestAnimationFrame(() => this.drawRoutingWires(canvas, svg, connections));
    return panel;
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
