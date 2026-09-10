import { findScaleDefinition, scalesForEdo, type SupportedEdo } from '../language/scales';

export type PitchKind = 'notes' | 'freqs' | 'scale' | 'reference';

export interface PitchEditorState {
  kind: PitchKind;
  value: string;
  scaleEdo: SupportedEdo;
  scaleRoot: string;
  scaleId: string;
}

export interface PitchEditorOptions {
  editor: HTMLTextAreaElement;
  state: PitchEditorState;
  allowReference?: boolean;
  notesHint?: string;
}

export function pitchStateFromValue(value: string): PitchEditorState {
  const trimmed = value.trim() || 'pitch notes [C3]';
  const notes = trimmed.match(/^pitch\s+notes\s+/i);
  if (notes) return { kind: 'notes', value: trimmed, scaleEdo: 12, scaleRoot: 'C', scaleId: 'major' };
  const freqs = trimmed.match(/^pitch\s+freqs\s+/i);
  if (freqs) return { kind: 'freqs', value: trimmed, scaleEdo: 12, scaleRoot: 'C', scaleId: 'major' };
  const scale = trimmed.match(/^pitch\s+scale\s+([^\s]+)\s+([^\s]+)/i);
  if (scale) return { kind: 'scale', value: trimmed, scaleEdo: 12, scaleRoot: scale[1], scaleId: scale[2] };
  return { kind: 'reference', value: trimmed, scaleEdo: 12, scaleRoot: 'C', scaleId: 'major' };
}

export class PitchEditor {
  private readonly root: HTMLElement;
  private readonly pitchType: HTMLSelectElement;
  private readonly notesInput: HTMLInputElement;
  private readonly freqsInput: HTMLInputElement;
  private readonly edo: HTMLSelectElement;
  private readonly scaleRoot: HTMLSelectElement;
  private readonly scale: HTMLSelectElement;
  private readonly reference: HTMLSelectElement;
  private readonly panelElements = new Map<PitchKind, HTMLElement>();

  constructor(private readonly options: PitchEditorOptions) {
    this.root = document.createElement('section');
    this.root.className = 'object-builder-pitch-column';

    const heading = document.createElement('h3');
    heading.textContent = 'PITCH';

    this.pitchType = document.createElement('select');
    const labels: Record<PitchKind, string> = { notes: 'Notes', scale: 'Scale', freqs: 'Frequencies', reference: 'Reference' };
    const kinds: PitchKind[] = options.allowReference === false
      ? ['notes', 'scale', 'freqs']
      : ['notes', 'scale', 'freqs', 'reference'];
    for (const kind of kinds) this.pitchType.append(new Option(labels[kind], kind));
    this.pitchType.value = kinds.includes(options.state.kind) ? options.state.kind : 'notes';

    const pitchPanels = document.createElement('div');
    pitchPanels.className = 'object-builder-pitch-panels';

    this.notesInput = document.createElement('input');
    this.notesInput.type = 'text';
    this.notesInput.placeholder = 'C3 E3 G3';
    this.freqsInput = document.createElement('input');
    this.freqsInput.type = 'text';
    this.freqsInput.placeholder = '110 220 330';
    const currentBody = options.state.value
      .replace(/^pitch\s+(notes|freqs)\s+/i, '')
      .replace(/^pitch\s+/i, '')
      .replace(/^\[|\]$/g, '');
    this.notesInput.value = options.state.kind === 'notes' ? currentBody : 'C3';
    if (options.state.kind === 'freqs') this.freqsInput.value = currentBody;

    const notesPanel = document.createElement('div');
    notesPanel.className = 'object-builder-pitch-text-panel';
    notesPanel.append(
      this.labeledControl('Notes', this.notesInput),
      this.hint(options.notesHint ?? 'Weights and note modifiers remain textual so the full Sonus syntax stays available.'),
    );

    const freqsPanel = document.createElement('div');
    freqsPanel.className = 'object-builder-pitch-text-panel';
    freqsPanel.append(
      this.labeledControl('Frequencies', this.freqsInput),
      this.hint('Enter the frequency list exactly as it should appear inside PITCH FREQS [...].'),
    );

    const scalePanel = document.createElement('div');
    scalePanel.className = 'object-builder-scale-panel';
    const scaleTop = document.createElement('div');
    scaleTop.className = 'object-builder-scale-top';

    this.edo = document.createElement('select');
    for (const value of [12, 15, 19, 22, 24] as SupportedEdo[]) this.edo.append(new Option(`EDO ${value}`, String(value)));
    this.edo.value = String(options.state.scaleEdo);

    this.scaleRoot = document.createElement('select');
    for (const value of ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B']) this.scaleRoot.append(new Option(value, value));
    this.scaleRoot.value = options.state.scaleRoot;
    scaleTop.append(this.labeledControl('EDO', this.edo), this.labeledControl('Root', this.scaleRoot));

    this.scale = document.createElement('select');
    const scaleMap = document.createElement('div');
    scaleMap.className = 'object-builder-scale-map';
    scalePanel.append(scaleTop, this.labeledControl('Scale', this.scale), scaleMap);

    const fillScales = (): void => {
      const selectedEdo = Number(this.edo.value) as SupportedEdo;
      const definitions = scalesForEdo(selectedEdo);
      this.scale.replaceChildren();
      for (const definition of definitions) {
        const value = selectedEdo === 12 && definition.id === 'ionian' ? 'major' : definition.id;
        this.scale.append(new Option(definition.name, value));
      }
      const wanted = selectedEdo === options.state.scaleEdo
        ? options.state.scaleId
        : (selectedEdo === 12 ? 'major' : definitions[0]?.id ?? '');
      if ([...this.scale.options].some((option) => option.value === wanted)) this.scale.value = wanted;
      this.renderScaleMap(scaleMap, selectedEdo, this.scaleRoot.value, this.scale.value);
    };
    this.edo.addEventListener('change', fillScales);
    this.scaleRoot.addEventListener('change', () => this.renderScaleMap(scaleMap, Number(this.edo.value) as SupportedEdo, this.scaleRoot.value, this.scale.value));
    this.scale.addEventListener('change', () => this.renderScaleMap(scaleMap, Number(this.edo.value) as SupportedEdo, this.scaleRoot.value, this.scale.value));
    fillScales();

    const referencePanel = document.createElement('div');
    referencePanel.className = 'object-builder-reference-panel';
    this.reference = document.createElement('select');
    const referenceInfo = document.createElement('div');
    referenceInfo.className = 'object-builder-reference-info';
    const references = this.findPitchReferences();
    if (!references.length) this.reference.append(new Option('No compatible sources', ''));
    else for (const item of references) this.reference.append(new Option(item.name, item.name));
    const existingReference = options.state.kind === 'reference' ? options.state.value.replace(/^pitch\s+/i, '').trim() : '';
    if (existingReference && references.some((item) => item.name === existingReference)) this.reference.value = existingReference;
    const updateReferenceInfo = (): void => {
      const item = references.find((entry) => entry.name === this.reference.value);
      referenceInfo.replaceChildren();
      if (!item) {
        referenceInfo.textContent = 'Declare a compatible SET or SEQ to use it here.';
        return;
      }
      const type = document.createElement('strong');
      type.textContent = item.type;
      const detail = document.createElement('span');
      detail.textContent = item.detail;
      referenceInfo.append(type, detail);
    };
    this.reference.addEventListener('change', updateReferenceInfo);
    updateReferenceInfo();
    referencePanel.append(this.labeledControl('Source', this.reference), referenceInfo);

    this.panelElements.set('notes', notesPanel);
    this.panelElements.set('scale', scalePanel);
    this.panelElements.set('freqs', freqsPanel);
    if (options.allowReference !== false) this.panelElements.set('reference', referencePanel);
    for (const [kind, panel] of this.panelElements) {
      panel.dataset.pitchPanel = kind;
      pitchPanels.append(panel);
    }
    this.pitchType.addEventListener('change', () => this.selectPitchType());
    this.selectPitchType();

    this.root.append(heading, this.labeledControl('Type', this.pitchType), pitchPanels);
  }

  mount(): HTMLElement {
    return this.root;
  }

  getState(): PitchEditorState {
    const selectedKind = this.pitchType.value as PitchKind;
    let value: string;
    if (selectedKind === 'notes') value = `pitch notes [${this.notesInput.value.trim().replace(/^\[|\]$/g, '') || 'C3'}]`;
    else if (selectedKind === 'freqs') value = `pitch freqs [${this.freqsInput.value.trim().replace(/^\[|\]$/g, '') || '440'}]`;
    else if (selectedKind === 'scale') value = `pitch scale ${this.scaleRoot.value} ${this.scale.value}`;
    else value = this.reference.value ? `pitch ${this.reference.value}` : 'pitch notes [C3]';

    return {
      kind: selectedKind,
      value,
      scaleEdo: Number(this.edo.value) as SupportedEdo,
      scaleRoot: this.scaleRoot.value,
      scaleId: this.scale.value,
    };
  }

  private selectPitchType(): void {
    for (const [kind, panel] of this.panelElements) panel.hidden = kind !== this.pitchType.value;
  }

  private renderScaleMap(container: HTMLElement, edo: SupportedEdo, root: string, scaleId: string): void {
    const definition = findScaleDefinition(scaleId);
    container.replaceChildren();
    if (!definition || definition.edo !== edo) return;
    const title = document.createElement('div');
    title.className = 'object-builder-scale-map-title';
    title.textContent = `${root} · ${definition.name} · ${edo}-EDO`;
    container.append(title);
    if (edo === 12) {
      const keyboard = document.createElement('div');
      keyboard.className = 'object-builder-scale-keyboard';
      const rootPc = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'].indexOf(root);
      const active = new Set(definition.degrees.map((degree) => (rootPc + degree) % 12));
      for (const pc of [0, 2, 4, 5, 7, 9, 11]) {
        const key = document.createElement('div');
        key.className = 'object-builder-scale-key white';
        key.classList.toggle('active', active.has(pc));
        key.classList.toggle('root', pc === rootPc);
        key.dataset.pc = String(pc);
        keyboard.append(key);
      }
      for (const pc of [1, 3, 6, 8, 10]) {
        const key = document.createElement('div');
        key.className = 'object-builder-scale-key black';
        key.classList.toggle('active', active.has(pc));
        key.classList.toggle('root', pc === rootPc);
        key.dataset.pc = String(pc);
        keyboard.append(key);
      }
      container.append(keyboard);
    } else {
      const map = document.createElement('div');
      map.className = 'object-builder-edo-map';
      map.style.setProperty('--edo-columns', String(edo));
      const active = new Set(definition.degrees);
      for (let step = 0; step < edo; step++) {
        const cell = document.createElement('div');
        cell.className = 'object-builder-edo-step';
        cell.classList.toggle('active', active.has(step));
        cell.classList.toggle('root', step === 0);
        cell.title = `${step} · ${Math.round(step * 1200 / edo)}¢`;
        const dot = document.createElement('i');
        const label = document.createElement('span');
        label.textContent = `${Math.round(step * 1200 / edo)}¢`;
        cell.append(dot, label);
        map.append(cell);
      }
      container.append(map);
    }
  }

  private findPitchReferences(): Array<{ name: string; type: string; detail: string }> {
    const result: Array<{ name: string; type: string; detail: string }> = [];
    const lines = this.options.editor.value.split(/\r?\n/);
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
        for (let j = index + 1; j < lines.length; j++) {
          if (/^\S/.test(lines[j]) && lines[j].trim()) break;
          const item = lines[j].trim();
          if (/^(model|pitch)\b/i.test(item)) details.push(item);
        }
        result.push({ name: seq[1], type: 'SEQ', detail: details.join(' · ') || 'pitch source' });
      }
    }
    return result.filter((item, index) => result.findIndex((other) => other.name === item.name) === index);
  }

  private labeledControl(labelText: string, control: HTMLElement): HTMLElement {
    const wrap = document.createElement('label');
    wrap.className = 'object-builder-field';
    const span = document.createElement('span');
    span.textContent = labelText;
    wrap.append(span, control);
    return wrap;
  }

  private hint(text: string): HTMLElement {
    const hint = document.createElement('div');
    hint.className = 'object-builder-secondary-hint';
    hint.textContent = text;
    return hint;
  }
}
