export type RoutingMode = 'default' | 'custom' | 'disabled';
export interface RoutingConnection { source: string; destination: string; }
export interface RoutingSource { id: string; label: string; }

export interface RoutingPanelOptions {
  sources: () => RoutingSource[];
  destinations: () => string[];
  defaultConnections: () => RoutingConnection[];
  onChange: () => void;
  expandedTitle?: string;
}

export class RoutingPanel {
  private mode: RoutingMode = 'default';
  private connections: RoutingConnection[] = [];
  private activeSource = '';
  private visibleDestinationGroups = new Set<string>();
  private expandedOverlay: HTMLElement | null = null;

  constructor(private readonly options: RoutingPanelOptions) {
    this.activeSource = this.options.sources()[0]?.id ?? '';
  }

  reset(): void {
    this.mode = 'default';
    this.connections = [];
    this.activeSource = this.options.sources()[0]?.id ?? '';
    this.visibleDestinationGroups.clear();
    this.closeExpanded();
  }

  closeExpanded(): void {
    this.expandedOverlay?.remove();
    this.expandedOverlay = null;
  }

  getMode(): RoutingMode { return this.mode; }
  getConnections(): readonly RoutingConnection[] { return this.connections; }

  summary(): string {
    if (this.mode === 'disabled') return 'Disabled · out mute';
    const connections = this.effectiveConnections();
    if (!connections.length) return 'No connections';
    const grouped = new Map<string, string[]>();
    for (const connection of connections) {
      const list = grouped.get(connection.source) ?? [];
      list.push(connection.destination);
      grouped.set(connection.source, list);
    }
    return [...grouped].map(([source, destinations]) => `${source} → ${destinations.join(' + ')}`).join(' · ');
  }

  renderPreview(): HTMLElement { return this.renderPanel(false); }

  private sourceColor(source: string): string {
    const palette = ['#f0bf24', '#35d6d3', '#ef6fcf', '#7fdc72'];
    const index = Math.max(0, this.options.sources().findIndex((port) => port.id === source));
    return palette[index % palette.length];
  }

  private effectiveConnections(): RoutingConnection[] {
    if (this.mode === 'disabled') return [];
    return this.mode === 'custom' ? this.connections : this.options.defaultConnections();
  }

  private sameConnections(a: readonly RoutingConnection[], b: readonly RoutingConnection[]): boolean {
    const normalize = (items: readonly RoutingConnection[]) => items.map((item) => `${item.source}→${item.destination}`).sort().join('|');
    return normalize(a) === normalize(b);
  }

  private destinationGroup(destination: string): string {
    const dot = destination.indexOf('.');
    return dot >= 0 ? destination.slice(0, dot) : destination;
  }

  private visibleDestinations(showAll: boolean): string[] {
    const all = this.options.destinations();
    if (showAll) return all;
    const visibleGroups = new Set<string>(['MAIN', ...this.visibleDestinationGroups]);
    for (const connection of this.effectiveConnections()) visibleGroups.add(this.destinationGroup(connection.destination));
    return all.filter((destination) => visibleGroups.has(this.destinationGroup(destination)));
  }

  private drawWires(canvas: HTMLElement, svg: SVGSVGElement, connections: readonly RoutingConnection[]): void {
    const bounds = canvas.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
    for (const connection of connections) {
      const a = canvas.querySelector<HTMLElement>(`.object-builder-port[data-port="${CSS.escape(connection.source)}"] i`);
      const b = canvas.querySelector<HTMLElement>(`.object-builder-port[data-destination="${CSS.escape(connection.destination)}"] i`);
      if (!a || !b) continue;
      const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
      const x1 = ar.left + ar.width / 2 - bounds.left, y1 = ar.top + ar.height / 2 - bounds.top;
      const x2 = br.left + br.width / 2 - bounds.left, y2 = br.top + br.height / 2 - bounds.top;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const c = Math.max(40, (x2 - x1) * 0.45);
      path.setAttribute('d', `M ${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`);
      path.style.stroke = this.sourceColor(connection.source);
      svg.append(path);
    }
  }

  private renderPanel(showAll: boolean): HTMLElement {
    const panel = document.createElement('div');
    panel.className = `object-builder-routing-preview object-builder-routing-inline${showAll ? ' expanded' : ''}`;

    const toolbar = document.createElement('div');
    toolbar.className = 'object-builder-routing-toolbar';
    const disabledLabel = document.createElement('label');
    disabledLabel.className = 'object-builder-routing-disabled';
    const disabled = document.createElement('input');
    disabled.type = 'checkbox';
    disabled.checked = this.mode === 'disabled';
    disabledLabel.append(disabled, document.createTextNode(' Disable output'));
    toolbar.append(disabledLabel);

    if (!showAll) {
      const actions = document.createElement('div');
      actions.className = 'object-builder-routing-actions';
      const add = document.createElement('select');
      add.className = 'object-builder-routing-add';
      add.append(new Option('+ Add destination', ''));
      const allGroups = [...new Set(this.options.destinations().map((destination) => this.destinationGroup(destination)))];
      const visibleGroups = new Set(this.visibleDestinations(false).map((destination) => this.destinationGroup(destination)));
      for (const group of allGroups) {
        if (group === 'MAIN' || visibleGroups.has(group)) continue;
        add.append(new Option(group, group));
      }
      add.disabled = disabled.checked || add.options.length <= 1;
      add.addEventListener('change', () => {
        if (!add.value) return;
        this.visibleDestinationGroups.add(add.value);
        this.options.onChange();
      });

      const expand = document.createElement('button');
      expand.type = 'button';
      expand.className = 'object-builder-routing-expand';
      expand.title = 'Expand routing';
      expand.setAttribute('aria-label', 'Expand routing');
      expand.textContent = '↗';
      expand.disabled = disabled.checked;
      expand.addEventListener('click', () => this.openExpanded());
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

    let connections = this.effectiveConnections().map((item) => ({ ...item }));
    const sources = this.options.sources();
    if (!sources.some((source) => source.id === this.activeSource)) this.activeSource = sources[0]?.id ?? '';

    const redraw = (): void => {
      svg.replaceChildren();
      requestAnimationFrame(() => this.drawWires(canvas, svg, connections));
      for (const item of left.querySelectorAll<HTMLElement>('.object-builder-port')) {
        const sourceId = item.dataset.port ?? '';
        item.classList.toggle('active', sourceId === this.activeSource);
        item.classList.toggle('routed', connections.some((entry) => entry.source === sourceId));
      }
      for (const item of right.querySelectorAll<HTMLElement>('.object-builder-port')) {
        item.classList.toggle('connected', connections.some((entry) => entry.source === this.activeSource && entry.destination === item.dataset.destination));
      }
    };

    const commitConnections = (next: RoutingConnection[]): void => {
      connections = next.map((item) => ({ ...item }));
      if (this.sameConnections(next, this.options.defaultConnections())) {
        this.mode = 'default';
        this.connections = [];
      } else {
        this.mode = 'custom';
        this.connections = next.map((item) => ({ ...item }));
      }
      redraw();
      this.options.onChange();
    };

    for (const source of sources) {
      const port = document.createElement('button');
      port.type = 'button';
      port.className = 'object-builder-port object-builder-preview-port';
      port.dataset.port = source.id;
      port.style.setProperty('--route-color', this.sourceColor(source.id));
      port.disabled = disabled.checked;
      port.classList.toggle('active', source.id === this.activeSource);
      port.classList.toggle('routed', connections.some((entry) => entry.source === source.id));
      port.innerHTML = `<span>${source.label}</span><i></i>`;
      port.addEventListener('click', () => { this.activeSource = source.id; redraw(); });
      left.append(port);
    }

    for (const destination of this.visibleDestinations(showAll)) {
      const port = document.createElement('button');
      port.type = 'button';
      port.className = 'object-builder-port object-builder-preview-port destination';
      port.dataset.destination = destination;
      port.disabled = disabled.checked;
      port.classList.toggle('connected', connections.some((entry) => entry.source === this.activeSource && entry.destination === destination));
      port.innerHTML = `<i></i><span>${destination}</span>`;
      port.addEventListener('click', () => {
        const next = connections.map((item) => ({ ...item }));
        const index = next.findIndex((entry) => entry.source === this.activeSource && entry.destination === destination);
        if (index >= 0) next.splice(index, 1);
        else next.push({ source: this.activeSource, destination });
        commitConnections(next);
      });
      right.append(port);
    }

    disabled.addEventListener('change', () => {
      this.mode = disabled.checked ? 'disabled' : 'default';
      this.connections = [];
      this.options.onChange();
    });

    canvas.append(left, svg, right);
    panel.append(toolbar, canvas);
    requestAnimationFrame(() => this.drawWires(canvas, svg, connections));
    return panel;
  }

  private openExpanded(): void {
    this.closeExpanded();
    const overlay = document.createElement('div');
    overlay.className = 'object-builder-secondary-overlay';
    overlay.innerHTML = `<section class="object-builder-secondary-dialog object-builder-routing-expanded-dialog" role="dialog" aria-modal="true">
      <header class="object-builder-secondary-head"><strong>${this.options.expandedTitle ?? 'OUTPUT ROUTING'}</strong><button type="button" data-action="close">×</button></header>
      <div class="object-builder-secondary-body object-builder-routing-expanded-body"></div>
    </section>`;
    overlay.querySelector('.object-builder-secondary-body')!.append(this.renderPanel(true));
    overlay.querySelector('[data-action=close]')!.addEventListener('click', () => this.closeExpanded());
    overlay.addEventListener('pointerdown', (event) => { if (event.target === overlay) this.closeExpanded(); });
    document.body.append(overlay);
    this.expandedOverlay = overlay;
  }
}
