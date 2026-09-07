import type { ParameterViewState, SchemeModel } from '../language/runtime';

const PANEL_STATE_KEY = 'sonus-umbrae.monitor-panels';

export type ModuleViewScale =
  | { mode: 'default' }
  | { mode: 'volts'; value: number }
  | { mode: 'zoom'; value: number };

export function parseModuleViewScales(source: string, commentStart: (line: string) => number): Map<string, ModuleViewScale> {
  const result = new Map<string, ModuleViewScale>();
  const scopes: Array<{ kind: 'voice' | 'fx' | 'other'; name: string; indentation: number }> = [];

  for (const rawLine of source.split('\n')) {
    const commentAt = commentStart(rawLine);
    const code = commentAt < 0 ? rawLine : rawLine.slice(0, commentAt);
    const trimmed = code.trim();
    if (!trimmed) continue;
    const indentation = code.length - code.trimStart().length;
    while (scopes.length > 0 && indentation <= scopes[scopes.length - 1].indentation) scopes.pop();

    const owner = trimmed.match(/^_?(VOICE|FX)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+WITH\s+VIEW(?:\s+\d+(?:\.\d+)?\s*[VX])?)?\s*:/i);
    if (owner) {
      scopes.push({ kind: owner[1].toLowerCase() as 'voice' | 'fx', name: owner[2], indentation });
      continue;
    }

    const mod = trimmed.match(/^MOD\s+([A-Za-z_][A-Za-z0-9_]*)\s+WITH\s+VIEW(?:\s+(\d+(?:\.\d+)?)\s*([VX]))?\s*:/i);
    if (!mod) continue;
    const ownerScope = [...scopes].reverse().find((scope) => scope.kind === 'voice' || scope.kind === 'fx');
    const internalName = ownerScope ? `__mod_${ownerScope.name}_${mod[1]}` : mod[1];
    if (mod[2] === undefined) result.set(internalName, { mode: 'default' });
    else if (mod[3].toLowerCase() === 'v') result.set(internalName, { mode: 'volts', value: Number(mod[2]) });
    else result.set(internalName, { mode: 'zoom', value: Number(mod[2]) });
  }
  return result;
}

export function isDicesSignal(signal: string): boolean {
  return /\.(?:x1|x2|x3|y)$/i.test(signal);
}

export function naturalScopeRange(signals: readonly string[]): number {
  return signals.some(isDicesSignal) ? 5 : 1;
}

export function effectiveScopeRange(signals: readonly string[], scale: ModuleViewScale | undefined): number {
  const natural = naturalScopeRange(signals);
  if (!scale || scale.mode === 'default') return natural;
  if (scale.mode === 'volts') return Math.max(0.0001, scale.value);
  return Math.max(0.0001, natural / scale.value);
}

export function scopeScaleLabel(signals: readonly string[], scale: ModuleViewScale | undefined): string {
  const range = effectiveScopeRange(signals, scale);
  if (signals.some(isDicesSignal) || scale?.mode === 'volts') {
    return `±${Number.isInteger(range) ? range : Number(range.toFixed(2))}V`;
  }
  if (scale?.mode === 'zoom') return `${scale.value}X`;
  return '';
}

export class MonitorPanels {
  private readonly collapsed = new Map<string, boolean>();
  private readonly explicitState = new Set<string>();
  private order: string[] = [];
  private draggedPanelId: string | null = null;

  constructor(
    private readonly viewStack: HTMLElement,
    private readonly onPanelExpanded: () => void,
  ) {
    this.loadState();
    this.viewStack.addEventListener('dragover', (event) => this.handleDragOver(event));
    this.viewStack.addEventListener('drop', (event) => this.handleDrop(event));
  }

  createCard(id: string, titleText: string, defaultCollapsed: boolean): HTMLElement {
    const card = document.createElement('section');
    card.className = 'view-card monitor-card';
    card.dataset.panelId = id;

    const collapsed = this.collapsed.get(id) ?? defaultCollapsed;
    this.collapsed.set(id, collapsed);
    card.classList.toggle('collapsed', collapsed);

    const header = document.createElement('div');
    header.className = 'view-title monitor-title';
    header.draggable = true;
    header.title = 'Click to collapse; drag to reorder';

    const disclosure = document.createElement('span');
    disclosure.className = 'monitor-disclosure';
    disclosure.textContent = collapsed ? '▸' : '▾';
    const name = document.createElement('span');
    name.className = 'monitor-title-text';
    name.textContent = titleText;
    header.append(disclosure, name);

    const body = document.createElement('div');
    body.className = 'monitor-body';

    header.addEventListener('click', () => {
      const next = !card.classList.contains('collapsed');
      card.classList.toggle('collapsed', next);
      disclosure.textContent = next ? '▸' : '▾';
      this.collapsed.set(id, next);
      this.explicitState.add(id);
      this.saveState();
      if (!next) this.onPanelExpanded();
    });

    header.addEventListener('dragstart', (event) => {
      this.draggedPanelId = id;
      card.classList.add('dragging');
      event.dataTransfer?.setData('text/plain', id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    header.addEventListener('dragend', () => {
      this.draggedPanelId = null;
      card.classList.remove('dragging');
      this.saveOrderFromDom();
    });

    card.append(header, body);
    return card;
  }

  buildMetricsPanel(scheme: SchemeModel, variableCount: number, sampleRate: number | null | undefined): HTMLElement {
    const card = this.createCard('Metrics', 'METRICS', false);
    const body = card.querySelector<HTMLElement>('.monitor-body');
    if (!body) return card;
    const rows = document.createElement('div');
    rows.className = 'variables-readout';
    const activeNodes = scheme.nodes.filter((node) => node.id !== 'Audio' && node.id !== 'Clock').length;
    const routes = scheme.connections.filter((connection) => connection.type !== 'view').length;
    const values: Array<[string, string]> = [
      ['OBJECTS', String(activeNodes)],
      ['ROUTES', String(routes)],
      ['VARIABLES', String(variableCount)],
      ['SAMPLE RATE', sampleRate ? `${Math.round(sampleRate)} HZ` : '--'],
    ];
    for (const [label, value] of values) {
      const row = document.createElement('div');
      row.className = 'variable-row';
      const name = document.createElement('span');
      name.className = 'variable-name';
      name.textContent = label;
      const readout = document.createElement('span');
      readout.className = 'variable-value';
      readout.textContent = value;
      row.append(name, readout);
      rows.append(row);
    }
    body.append(rows);
    return card;
  }

  buildVariablesPanel(variables: Array<{ name: string; value: string }>): HTMLElement {
    const card = this.createCard('Variables', 'VARIABLES', false);
    const body = card.querySelector<HTMLElement>('.monitor-body');
    if (!body) return card;

    const readout = document.createElement('div');
    readout.className = 'variables-readout';
    if (variables.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'monitor-empty';
      empty.textContent = 'NO VARIABLES';
      readout.append(empty);
    } else {
      for (const variable of variables) {
        const row = document.createElement('div');
        row.className = 'variable-row';
        const name = document.createElement('span');
        name.className = 'variable-name';
        name.textContent = variable.name;
        const value = document.createElement('span');
        value.className = 'variable-value';
        value.dataset.variableName = variable.name;
        value.textContent = variable.value;
        row.append(name, value);
        readout.append(row);
      }
    }
    body.append(readout);
    return card;
  }

  buildModulePanel(options: {
    id: string;
    title: string;
    parameters: Array<{ name: string; value: string; liveSignal?: string }>;
    signals: Array<{ signal: string; kind: string; label: string }>;
    compositeSignals?: string[];
    stereoLegend?: boolean;
    parameterDetails?: ParameterViewState[];
    sampleView?: { owner?: string; sampleAlias?: string; sampleStart?: number; sampleEnd?: number; sampleSlices?: number };
    viewScale?: ModuleViewScale;
    defaultCollapsed: boolean;
  }): HTMLElement {
    const card = this.createCard(options.id, options.title, options.defaultCollapsed);
    const body = card.querySelector<HTMLElement>('.monitor-body');
    if (!body) return card;

    if (options.sampleView) {
      const section = document.createElement('div');
      section.className = 'monitor-signal monitor-sample';
      const label = document.createElement('div');
      label.className = 'monitor-section-label';
      const alias = options.sampleView.sampleAlias ?? 'SAMPLE';
      const start = options.sampleView.sampleStart ?? 0;
      const end = options.sampleView.sampleEnd ?? 100;
      label.textContent = `${alias} · ${start}%–${end}%`;

      const canvas = document.createElement('canvas');
      canvas.className = 'sample-waveform-canvas monitor-sample-waveform';
      canvas.dataset.sampleAlias = options.sampleView.sampleAlias ?? '';
      canvas.dataset.sampleOwner = options.sampleView.owner ?? options.id;
      canvas.dataset.sampleStart = String(start);
      canvas.dataset.sampleEnd = String(end);
      canvas.dataset.sampleSlices = String(options.sampleView.sampleSlices ?? 0);
      canvas.setAttribute('aria-label', `${alias} waveform`);
      section.append(label, canvas);
      body.append(section);
    }

    if ((options.compositeSignals?.length ?? 0) > 0) {
      const section = document.createElement('div');
      section.className = 'monitor-signal monitor-composite';
      const label = document.createElement('div');
      label.className = 'monitor-section-label';
      const compositeIsDices = options.compositeSignals!.some(isDicesSignal);
      const scaleLabel = scopeScaleLabel(options.compositeSignals!, options.viewScale);
      const compositePortNames = options.compositeSignals!.map((signal) =>
        signal.slice(signal.lastIndexOf('.') + 1).toUpperCase()
      );
      const isGenericMod = / : MOD(?:\s+[A-Z0-9_-]+)?$/i.test(options.title);
      label.textContent = options.id === 'Audio'
        ? 'STEREO OUT'
        : (/: (?:MIST|FX)$/.test(options.title))
          ? 'OUT L / R'
          : compositeIsDices
            ? `X1 / X2 / X3 / Y${scaleLabel ? ` · ${scaleLabel}` : ''}`
            : isGenericMod
              ? `${compositePortNames.join(' / ')}${scaleLabel ? ` · ${scaleLabel}` : ''}`
              : options.compositeSignals!.length === 2
                ? 'OUT / AUX'
                : compositePortNames.join(' / ');

      if (options.stereoLegend || (/: (?:MIST|FX)$/.test(options.title) && options.compositeSignals?.length === 2)) {
        const legend = document.createElement('span');
        legend.className = 'scope-stereo-legend';
        legend.innerHTML = '<span class="scope-legend-l">● L</span><span class="scope-legend-r">● R</span>';
        label.append(legend);
      } else if (isGenericMod && (options.compositeSignals?.length ?? 0) > 1) {
        const legend = document.createElement('span');
        legend.className = 'scope-stereo-legend';
        legend.innerHTML = compositePortNames.map((name, index) =>
          `<span style="color:var(--scope-trace-${(index % 4) + 1})">● ${name}</span>`
        ).join('');
        label.append(legend);
      }
      const canvas = document.createElement('canvas');
      canvas.className = 'scope-canvas view-signal composite-scope';
      canvas.dataset.signals = options.compositeSignals!.join(',');
      canvas.dataset.kind = 'multi-signal';
      canvas.dataset.scopeRange = String(effectiveScopeRange(options.compositeSignals!, options.viewScale));
      if (isGenericMod) {
        canvas.dataset.modScope = 'true';
        canvas.dataset.modName = options.id;
      }
      canvas.setAttribute('aria-label', `${options.title} multi-channel signal monitor`);
      section.append(label, canvas);
      body.append(section);
    }

    for (const signal of options.signals) {
      const section = document.createElement('div');
      section.className = 'monitor-signal';
      const label = document.createElement('div');
      label.className = 'monitor-section-label';
      label.textContent = signal.label;
      const canvas = document.createElement('canvas');
      canvas.className = `scope-canvas view-${signal.kind}`;
      canvas.dataset.signal = signal.signal;
      canvas.dataset.kind = signal.kind;
      canvas.dataset.scopeRange = String(effectiveScopeRange([signal.signal], options.viewScale));
      canvas.setAttribute('aria-label', `${signal.signal} ${signal.kind} monitor`);
      section.append(label, canvas);
      body.append(section);
    }

    if (options.parameters.length > 0) {
      const params = document.createElement('div');
      params.className = 'monitor-parameters';
      for (const parameter of options.parameters) {
        const row = document.createElement('div');
        row.className = 'monitor-parameter-row';
        const name = document.createElement('span');
        name.textContent = parameter.name;
        const value = document.createElement('span');
        value.textContent = parameter.value;
        if (parameter.liveSignal) {
          value.className = 'scheme-live-value';
          value.dataset.liveSignal = parameter.liveSignal;
        }
        row.append(name, value);
        params.append(row);
      }
      body.append(params);
    }

    for (const detail of options.parameterDetails ?? []) {
      const detailBox = document.createElement('div');
      detailBox.className = 'monitor-parameter-detail';
      const label = document.createElement('div');
      label.className = 'monitor-section-label';
      label.textContent = detail.signal.split('.').at(-1)?.toUpperCase() ?? detail.label;
      const value = document.createElement('div');
      value.className = 'parameter-row';
      value.innerHTML = `<span>VALUE</span><span>${detail.value}</span>`;
      const base = document.createElement('div');
      base.className = 'parameter-row parameter-base-row';
      base.innerHTML = `<span>BASE</span><span>${detail.base}</span>`;
      detailBox.append(label, value, base);
      body.append(detailBox);
    }

    return card;
  }

  hasExplicitState(id: string): boolean {
    return this.explicitState.has(id);
  }

  setCollapsed(id: string, collapsed: boolean): void {
    this.collapsed.set(id, collapsed);
  }

  applySavedOrder(): void {
    if (this.order.length === 0) return;
    const rank = new Map(this.order.map((id, index) => [id, index]));
    const cards = [...this.viewStack.querySelectorAll<HTMLElement>('.monitor-card')];
    cards.sort((a, b) => (rank.get(a.dataset.panelId ?? '') ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.dataset.panelId ?? '') ?? Number.MAX_SAFE_INTEGER));
    for (const card of cards) this.viewStack.append(card);
  }

  private handleDragOver(event: DragEvent): void {
    if (!this.draggedPanelId) return;
    event.preventDefault();
    const dragging = this.viewStack.querySelector<HTMLElement>(`[data-panel-id="${CSS.escape(this.draggedPanelId)}"]`);
    if (!dragging) return;
    const siblings = [...this.viewStack.querySelectorAll<HTMLElement>('.monitor-card:not(.dragging)')];
    const next = siblings.find((card) => event.clientY < card.getBoundingClientRect().top + card.offsetHeight / 2);
    if (next) this.viewStack.insertBefore(dragging, next); else this.viewStack.append(dragging);
  }

  private handleDrop(event: DragEvent): void {
    if (!this.draggedPanelId) return;
    event.preventDefault();
    this.saveOrderFromDom();
  }

  private loadState(): void {
    try {
      const raw = localStorage.getItem(PANEL_STATE_KEY);
      if (!raw) return;
      const state = JSON.parse(raw) as { collapsed?: Record<string, boolean>; order?: string[] };
      for (const [id, collapsed] of Object.entries(state.collapsed ?? {})) {
        this.collapsed.set(id, Boolean(collapsed));
        this.explicitState.add(id);
      }
      this.order = Array.isArray(state.order) ? state.order.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      // UI preferences are intentionally non-critical.
    }
  }

  private saveState(): void {
    try {
      localStorage.setItem(PANEL_STATE_KEY, JSON.stringify({
        collapsed: Object.fromEntries(this.collapsed),
        order: this.order,
      }));
    } catch {
      // Ignore unavailable or disabled local storage.
    }
  }

  private saveOrderFromDom(): void {
    this.order = [...this.viewStack.querySelectorAll<HTMLElement>('.monitor-card')]
      .map((card) => card.dataset.panelId)
      .filter((id): id is string => Boolean(id));
    this.saveState();
  }
}
