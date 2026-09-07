import type { SchemeModel, SchemeNode } from '../language/runtime';
import { drawSchemeConnections, layoutScheme } from './scheme-layout';
import {
  effectiveScopeRange,
  isDicesSignal,
  parseModuleViewScales,
  scopeScaleLabel,
  type ModuleViewScale,
} from './monitor-panels';

type SchemeRendererOptions = {
  viewport: HTMLElement;
  world: HTMLElement;
  edges: SVGSVGElement;
  nodes: HTMLElement;
  readVoicePitchMidi: (voiceName: string) => number | null;
  requestScopeFrame: () => void;
};

export class SchemeRenderer {
  constructor(private readonly options: SchemeRendererOptions) {}

  render(rawModel: SchemeModel, source: string, commentStart: (line: string) => number): void {
    const model = this.normalizeModel(rawModel);
    const moduleViewScales = parseModuleViewScales(source, commentStart);

    this.options.nodes.replaceChildren();
    this.options.edges.replaceChildren();

    const nodeElements = new Map<string, HTMLElement>();
    for (const node of model.nodes) {
      const element = this.buildNode(node, moduleViewScales.get(node.id));
      nodeElements.set(node.id, element);
      this.options.nodes.append(element);
    }

    requestAnimationFrame(() => {
      layoutScheme(model, nodeElements, this.options.viewport, this.options.world, this.options.edges);
      drawSchemeConnections(model.connections, nodeElements, this.options.world, this.options.edges);
      if (model.nodes.some((node) => (node.views?.length ?? 0) > 0) || document.querySelector('.scheme-live-value')) {
        this.options.requestScopeFrame();
      }
    });
  }

  updateLiveValues(): void {
    for (const element of document.querySelectorAll<HTMLElement>('.scheme-live-value')) {
      const signal = element.dataset.liveSignal;
      const match = signal?.match(/^([A-Za-z_]\w*)\.v_oct$/);
      if (!match) continue;
      const midi = this.options.readVoicePitchMidi(match[1]);
      element.textContent = midi === null ? '--' : formatMidiNote(midi);
    }
  }

  private normalizeModel(rawModel: SchemeModel): SchemeModel {
    // The master clock has a dedicated canonical node. Be defensive here as well:
    // older/runtime-derived paths may still yield another plain CLOCK node.
    // Keep exactly the first master CLOCK while preserving named derived clocks
    // such as HALF : CLOCK.
    let masterClockSeen = false;
    const nodes = rawModel.nodes.filter((node) => {
      const isMasterClock = node.id.toLowerCase() === 'clock' || node.label.trim().toUpperCase() === 'CLOCK';
      if (!isMasterClock) return true;
      if (masterClockSeen) return false;
      masterClockSeen = true;
      return true;
    });
    return { nodes, connections: rawModel.connections };
  }

  private buildNode(node: SchemeNode, viewScale?: ModuleViewScale): HTMLElement {
    const element = document.createElement('section');
    element.className = 'scheme-node scheme-module-node';
    element.dataset.nodeId = node.id;

    const title = document.createElement('div');
    title.className = 'scheme-node-title';
    title.textContent = node.label;
    element.append(title);

    for (const parameter of node.parameters) {
      const row = document.createElement('div');
      row.className = 'scheme-param';
      const name = document.createElement('span');
      name.textContent = parameter.name;
      const value = document.createElement('span');
      value.textContent = parameter.value;
      if (parameter.liveSignal) {
        value.classList.add('scheme-live-value');
        value.dataset.liveSignal = parameter.liveSignal;
      }
      row.append(name, value);
      element.append(row);
    }

    for (const view of node.views ?? []) {
      const embedded = document.createElement('div');
      embedded.className = 'scheme-embedded-view';

      const label = document.createElement('div');
      label.className = 'scheme-view-label';
      const viewSignals = view.signals?.length ? view.signals : [view.signal];
      const viewIsDices = viewSignals.some(isDicesSignal);
      const scaleLabel = scopeScaleLabel(viewSignals, viewScale);
      label.textContent = view.display === 'sample'
        ? `${view.sampleAlias ?? 'SAMPLE'} · ${view.sampleStart ?? 0}%–${view.sampleEnd ?? 100}%`
        : viewIsDices
          ? `X1 / X2 / X3 / Y${scaleLabel ? ` · ${scaleLabel}` : ''}`
          : view.port;

      const canvas = document.createElement('canvas');
      if (view.display === 'sample') {
        canvas.className = 'sample-waveform-canvas scheme-sample-waveform';
        canvas.dataset.sampleAlias = view.sampleAlias ?? '';
        canvas.dataset.sampleOwner = view.owner ?? node.id;
        canvas.dataset.sampleStart = String(view.sampleStart ?? 0);
        canvas.dataset.sampleEnd = String(view.sampleEnd ?? 100);
        canvas.dataset.sampleSlices = String(view.sampleSlices ?? 0);
        canvas.setAttribute('aria-label', `${view.sampleAlias ?? 'sample'} waveform`);
      } else {
        canvas.className = `scope-canvas scheme-scope view-${view.signalKind}`;
        canvas.dataset.signal = view.signal;
        canvas.dataset.scopeRange = String(effectiveScopeRange(viewSignals, viewScale));
        if (view.signals?.length) {
          canvas.dataset.signals = view.signals.join(',');
          canvas.dataset.kind = 'multi-signal';
          canvas.classList.add('composite-scope');
          if (/ : MOD(?:\s+DICES)?$/i.test(node.label) && view.signals.length === 4) {
            canvas.dataset.modScope = 'true';
            canvas.dataset.modName = node.id;
          }
        } else {
          canvas.dataset.kind = view.signalKind;
        }
        canvas.setAttribute('aria-label', `${view.signal} ${view.signalKind} monitor`);
      }
      embedded.append(label, canvas);
      element.append(embedded);
    }

    return element;
  }
}

function formatMidiNote(midi: number): string {
  if (!Number.isFinite(midi)) return '--';
  const nearest = Math.round(midi);
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const name = names[((nearest % 12) + 12) % 12];
  const octave = Math.floor(nearest / 12) - 1;
  const cents = Math.round((midi - nearest) * 100);
  return cents === 0 ? `${name}${octave}` : `${name}${octave} ${cents > 0 ? '+' : ''}${cents}c`;
}
