import './style.css';
import { AudioEngine } from './audio/engine';
import { SonusEvaluationError, SonusRuntime, type ParameterViewState, type SchemeConnection, type SchemeModel, type SchemeNode } from './language/runtime';

type Screen = 'live' | 'config' | 'help' | 'scheme';

const VERSION = '0.0.4';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app');

app.innerHTML = `
  <main class="machine" aria-label="Sonus Umbrae live coding environment">
    <header class="statusbar">
      <span class="brand">SONUS UMBRAE / ${VERSION}</span>
      <span class="status-item"><span class="label">CLK</span> <span id="clock-status" class="disabled">--.-</span></span>
      <span class="status-item"><span class="label">LIVE</span> <span id="live-dot" class="dot off" aria-label="engine stopped"></span></span>
      <span class="status-item optional"><span class="label">DSP</span> <span id="dsp-status" class="disabled">--%</span></span>
    </header>

    <section id="surface" class="surface">
      <div id="live-screen" class="screen live-screen">
        <div class="editor-pane">
          <div id="line-gutter" class="line-gutter" aria-hidden="true"><div id="line-gutter-content" class="line-gutter-content"></div></div>
          <div class="editor-stack"><div id="syntax-layer" class="syntax-layer" aria-hidden="true"></div><textarea id="editor" class="editor" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Live coding editor"></textarea></div>
        </div>
        <aside id="view-panel" class="view-panel hidden" aria-label="Signal views">
          <div id="view-stack" class="view-stack"></div>
        </aside>
      </div>

      <div id="config-screen" class="screen system-screen hidden" aria-hidden="true">
        <div class="system-title">CONFIGURATION</div>
        <div class="rule"></div>
        <div class="system-copy">NO CONFIGURABLE PARAMETERS IN ${VERSION}</div>
        <div class="system-copy muted">ESC  RETURN TO LIVE</div>
      </div>

      <div id="help-screen" class="screen system-screen hidden" aria-hidden="true">
        <div class="system-title">COMMANDS</div>
        <div class="rule"></div>
        <div class="help-grid">
          <span>:CONFIG</span><span>OPEN CONFIGURATION</span>
          <span>:HELP</span><span>SHOW THIS SCREEN</span>
          <span>:SCHEME</span><span>SHOW READ-ONLY SIGNAL SCHEME</span>
          <span>TAB</span><span>TOGGLE LIVE / SCHEME</span>
          <span>:SAVE</span><span>SAVE SOURCE FILE</span>
          <span>:LOAD</span><span>LOAD SOURCE FILE</span>
          <span>:NEW</span><span>CLEAR SOURCE</span>
          <span>:CLEAR</span><span>CLEAR SOURCE</span>
          <span>:START</span><span>START / RESUME AUDIO ENGINE</span>
          <span>:STOP</span><span>SUSPEND AUDIO ENGINE</span>
          <span>:TEST 440</span><span>PLAY DIAGNOSTIC SINE TONE</span>
          <span>:TEST STOP</span><span>STOP DIAGNOSTIC TONE</span>
          <span>:CLOCK START</span><span>START MASTER CLOCK TRANSPORT</span>
          <span>:CLOCK STOP</span><span>STOP MASTER CLOCK TRANSPORT</span>
          <span>:PANIC</span><span>STOP CURRENT AUDIO IMMEDIATELY</span>
          <span>ENTER</span><span>EVALUATE SOURCE AND INSERT NEW LINE</span>
          <span>SHIFT+ENTER</span><span>INSERT NEW LINE WITHOUT EVALUATING</span>
          <span>CMD+ENTER</span><span>EVALUATE ENTIRE SOURCE</span>
        </div>
        <div class="system-copy muted">ESC  RETURN TO LIVE</div>
      </div>

      <div id="scheme-screen" class="screen scheme-screen hidden" aria-hidden="true">
        <div class="scheme-title">SCHEME</div>
        <div id="scheme-viewport" class="scheme-viewport">
          <div id="scheme-world" class="scheme-world">
            <svg id="scheme-edges" class="scheme-edges" aria-hidden="true"></svg>
            <div id="scheme-nodes" class="scheme-nodes"></div>
          </div>
        </div>
        <div class="scheme-hints">ESC / TAB&nbsp;&nbsp;LIVE</div>
      </div>

      <div id="phosphor-layer" class="phosphor-layer" aria-hidden="true">
        <span id="error-overlays" class="error-overlays"></span>
        <span id="block-caret" class="block-caret hidden"></span>
      </div>
      <div id="diagnostic" class="diagnostic hidden" aria-live="polite"></div>
      <div id="message" class="message" aria-live="polite"></div>
    </section>

    <footer id="commandbar" class="commandbar hidden">
      <span class="prompt">:</span>
      <input id="command" class="command" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Command" />
    </footer>
  </main>
`;

const editor = must<HTMLTextAreaElement>('editor');
const syntaxLayer = must<HTMLElement>('syntax-layer');
const lineGutter = must<HTMLElement>('line-gutter');
const lineGutterContent = must<HTMLElement>('line-gutter-content');
const commandbar = must<HTMLElement>('commandbar');
const command = must<HTMLInputElement>('command');
const liveScreen = must<HTMLElement>('live-screen');
const configScreen = must<HTMLElement>('config-screen');
const helpScreen = must<HTMLElement>('help-screen');
const schemeScreen = must<HTMLElement>('scheme-screen');
const schemeViewport = must<HTMLElement>('scheme-viewport');
const schemeWorld = must<HTMLElement>('scheme-world');
const schemeEdges = must<SVGSVGElement>('scheme-edges');
const schemeNodes = must<HTMLElement>('scheme-nodes');
const phosphorLayer = must<HTMLElement>('phosphor-layer');
const message = must<HTMLElement>('message');
const blockCaret = must<HTMLElement>('block-caret');
const errorOverlays = must<HTMLElement>('error-overlays');
const viewPanel = must<HTMLElement>('view-panel');
const viewStack = must<HTMLElement>('view-stack');
const diagnostic = must<HTMLElement>('diagnostic');
const liveDot = must<HTMLElement>('live-dot');
const dspStatus = must<HTMLElement>('dsp-status');
const clockStatus = must<HTMLElement>('clock-status');

const audioEngine = new AudioEngine();
const runtime = new SonusRuntime(audioEngine);

let screen: Screen = 'live';
let commandMode = false;
let messageTimer = 0;
let scopeFrame = 0;
let savedEditorSelection: { start: number; end: number; direction: 'forward' | 'backward' | 'none' } | null = null;
let audioAutoStartPending = true;
let diagnosticLines = new Set<number>();

async function tryAutoStartAudio(): Promise<void> {
  if (!audioAutoStartPending) return;
  try {
    await audioEngine.start();
    if (audioEngine.snapshot().state !== 'running') throw new Error('audio start blocked');
    audioAutoStartPending = false;
  } catch {
    notify('audio waiting for browser permission');
  }
}

function retryAutoStartFromGesture(): void {
  if (!audioAutoStartPending) return;
  void tryAutoStartAudio();
}

audioEngine.subscribe((snapshot) => {
  const isRunning = snapshot.state === 'running';
  liveDot.classList.toggle('on', isRunning);
  liveDot.classList.toggle('off', !isRunning);
  liveDot.setAttribute('aria-label', isRunning ? 'engine running' : 'engine stopped');
  dspStatus.textContent = snapshot.sampleRate ? `${Math.round(snapshot.sampleRate / 1000)}K` : '--';
  dspStatus.classList.toggle('disabled', snapshot.sampleRate === null);
  const clock = audioEngine.getClockStatus();
  clockStatus.textContent = clock.bpm > 0 ? `${clock.bpm.toFixed(clock.bpm % 1 ? 1 : 0)}${clock.running ? '' : ' ○'}` : '--.-';
  clockStatus.classList.toggle('disabled', clock.bpm <= 0);
  syncViews();
});

editor.value = '';
editor.focus();
void tryAutoStartAudio();

function must<T extends Element>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as unknown as T;
}

function showScreen(next: Screen): void {
  screen = next;
  liveScreen.classList.toggle('hidden', next !== 'live');
  configScreen.classList.toggle('hidden', next !== 'config');
  helpScreen.classList.toggle('hidden', next !== 'help');
  schemeScreen.classList.toggle('hidden', next !== 'scheme');
  liveScreen.setAttribute('aria-hidden', String(next !== 'live'));
  configScreen.setAttribute('aria-hidden', String(next !== 'config'));
  helpScreen.setAttribute('aria-hidden', String(next !== 'help'));
  schemeScreen.setAttribute('aria-hidden', String(next !== 'scheme'));
  if (next === 'scheme') renderScheme();
  if (next === 'live') editor.focus();
  requestAnimationFrame(positionBlockCaret);
}

function enterCommandMode(): void {
  if (screen !== 'live') return;
  saveEditorSelection();
  commandMode = true;
  commandbar.classList.remove('hidden');
  command.value = '';
  command.focus();
  positionBlockCaret();
}

function leaveCommandMode(): void {
  commandMode = false;
  commandbar.classList.add('hidden');
  command.value = '';
  restoreEditorSelection();
  requestAnimationFrame(positionBlockCaret);
}

function saveEditorSelection(): void {
  savedEditorSelection = {
    start: editor.selectionStart,
    end: editor.selectionEnd,
    direction: editor.selectionDirection ?? 'none',
  };
}

function restoreEditorSelection(): void {
  editor.focus();

  if (savedEditorSelection) {
    const max = editor.value.length;
    editor.setSelectionRange(
      Math.min(savedEditorSelection.start, max),
      Math.min(savedEditorSelection.end, max),
      savedEditorSelection.direction,
    );
  } else {
    placeCaretAtEnd(editor);
  }

  savedEditorSelection = null;
}

function notify(text: string): void {
  window.clearTimeout(messageTimer);
  message.textContent = text.toUpperCase();
  message.classList.add('visible');
  messageTimer = window.setTimeout(() => message.classList.remove('visible'), 1800);
}

function sourceText(): string {
  return editor.value.replace(/\r\n/g, '\n');
}

function evaluateLiveSource(): void {
  try {
    clearDiagnostic();
    const source = sourceText();
    if (!source.trim()) {
      runtime.evaluate('');
      notify('ok');
      return;
    }

    const results = runtime.evaluate(source);
    const last = results.at(-1);
    notify(last?.message ?? 'ok');
  } catch (error) {
    if (error instanceof SonusEvaluationError) {
      showDiagnostics(error.diagnostics);
      return;
    }

    notify(error instanceof Error ? error.message : 'evaluation failed');
  }
}


function syncViews(): void {
  const signalViews = audioEngine.getViewSignals();
  const parameterViews = runtime.getParameterViews();
  const variableViews = runtime.getVariableViews();
  const views = [
    ...signalViews.map((view) => ({ signal: view.signal, kind: view.kind as string, parameter: null as ParameterViewState | null })),
    ...parameterViews.map((view) => ({ signal: view.signal, kind: 'parameter', parameter: view })),
  ];
  const hasViews = views.length > 0 || variableViews.length > 0;
  liveScreen.classList.toggle('with-views', hasViews);
  viewPanel.classList.toggle('hidden', !hasViews);

  const existing = new Map(
    [...viewStack.querySelectorAll<HTMLElement>('.view-card')].map((card) => [card.dataset.signal ?? '', card]),
  );

  for (const view of views) {
    const { signal, kind, parameter } = view;
    let card = existing.get(signal);
    if (card) {
      card.dataset.kind = kind;
      if (kind === 'parameter' && parameter) {
        const value = card.querySelector<HTMLElement>('.parameter-value');
        const base = card.querySelector<HTMLElement>('.parameter-base');
        if (value) value.textContent = parameter.value;
        if (base) base.textContent = parameter.base;
      }
      existing.delete(signal);
      continue;
    }

    card = document.createElement('section');
    card.className = 'view-card';
    card.dataset.signal = signal;
    card.dataset.kind = kind;

    const title = document.createElement('div');
    title.className = 'view-title';
    title.textContent = `${signal.toUpperCase()} / ${kind.toUpperCase()}`;

    if (kind === 'parameter' && parameter) {
      const readout = document.createElement('div');
      readout.className = 'parameter-readout';
      readout.dataset.signal = signal;

      const valueRow = document.createElement('div');
      valueRow.className = 'parameter-row';
      valueRow.innerHTML = `<span>VALUE</span><span class="parameter-value">${parameter.value}</span>`;

      const baseRow = document.createElement('div');
      baseRow.className = 'parameter-row parameter-base-row';
      baseRow.innerHTML = `<span>BASE</span><span class="parameter-base">${parameter.base}</span>`;
      readout.append(valueRow, baseRow);
      card.append(title, readout);
    } else {
      const canvas = document.createElement('canvas');
      canvas.className = `scope-canvas view-${kind}`;
      canvas.dataset.signal = signal;
      canvas.dataset.kind = kind;
      canvas.setAttribute('aria-label', `${signal} ${kind} monitor`);
      card.append(title, canvas);
    }
    viewStack.append(card);
  }

  const variablesKey = '__variables__';
  if (variableViews.length > 0) {
    let card = existing.get(variablesKey);
    if (!card) {
      card = document.createElement('section');
      card.className = 'view-card variables-card';
      card.dataset.signal = variablesKey;

      const title = document.createElement('div');
      title.className = 'view-title';
      title.textContent = 'VARIABLES';

      const readout = document.createElement('div');
      readout.className = 'variables-readout';
      card.append(title, readout);
      viewStack.append(card);
    }

    const readout = card.querySelector<HTMLElement>('.variables-readout');
    if (readout) {
      const rows = new Map(
        [...readout.querySelectorAll<HTMLElement>('.variable-row')].map((row) => [row.dataset.name ?? '', row]),
      );

      for (const variable of variableViews) {
        let row = rows.get(variable.name);
        if (!row) {
          row = document.createElement('div');
          row.className = 'variable-row';
          row.dataset.name = variable.name;

          const name = document.createElement('span');
          name.className = 'variable-name';
          name.textContent = variable.name;

          const value = document.createElement('span');
          value.className = 'variable-value';
          row.append(name, value);
          readout.append(row);
        }
        const value = row.querySelector<HTMLElement>('.variable-value');
        if (value) value.textContent = variable.value;
        rows.delete(variable.name);
      }

      for (const row of rows.values()) row.remove();
    }
    existing.delete(variablesKey);
  }

  for (const card of existing.values()) card.remove();

  if (hasViews && scopeFrame === 0) scopeFrame = requestAnimationFrame(drawScopes);
  requestAnimationFrame(positionBlockCaret);
}

function drawScopes(): void {
  scopeFrame = 0;
  updateSchemeLiveValues();
  const canvases = [...document.querySelectorAll<HTMLCanvasElement>('canvas.scope-canvas')];
  const liveValues = document.querySelectorAll<HTMLElement>('.scheme-live-value');
  if (canvases.length === 0 && liveValues.length === 0) return;

  const phosphor = getComputedStyle(document.documentElement).getPropertyValue('--phosphor-hot').trim() || '#ffe783';
  for (const canvas of canvases) {
    const signal = canvas.dataset.signal;
    if (!signal) continue;

    const width = Math.max(1, Math.floor(canvas.clientWidth * window.devicePixelRatio));
    const height = Math.max(1, Math.floor(canvas.clientHeight * window.devicePixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = phosphor;
    ctx.fillStyle = phosphor;
    ctx.lineWidth = Math.max(1, window.devicePixelRatio);
    ctx.shadowColor = phosphor;
    ctx.shadowBlur = 3 * window.devicePixelRatio;
    const kind = canvas.dataset.kind ?? 'signal';
    if (kind === 'trigger') {
      drawTriggerPhase(ctx, width, height, signal, phosphor);
      continue;
    }

    const data = new Float32Array(512);
    if (!audioEngine.readOscilloscope(signal, data)) continue;
    if (kind === 'gate') {
      ctx.beginPath();
      for (let i = 0; i < data.length; i += 1) {
        const x = (i / (data.length - 1)) * width;
        const y = data[i] > 0.3 ? height * 0.25 : height * 0.72;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else {
      ctx.beginPath();
      for (let i = 0; i < data.length; i += 1) {
        const x = (i / (data.length - 1)) * width;
        const y = height * 0.5 - data[i] * height * 0.42;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  scopeFrame = requestAnimationFrame(drawScopes);
}



function drawTriggerPhase(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  signal: string,
  phosphor: string,
): void {
  const ratio = window.devicePixelRatio;
  const events = audioEngine.getTriggerViewEvents(signal);
  const left = Math.max(14 * ratio, width * 0.06);
  const right = width - left;
  const span = Math.max(1, right - left);
  const y = height * 0.56;

  ctx.save();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--phosphor-dim').trim() || phosphor;
  ctx.globalAlpha = 0.32;
  ctx.lineWidth = Math.max(1, ratio);
  ctx.beginPath();
  ctx.moveTo(left, y);
  ctx.lineTo(right, y);
  ctx.stroke();

  for (const event of events) {
    const x = left + span * event.progress;
    const radius = Math.max(3.0 * ratio, height * 0.05);

    // Each trigger is an independent particle. Its speed is frozen at the
    // moment it is emitted, so later clock changes do not affect particles
    // already travelling across the monitor.
    for (let trail = 5; trail >= 1; trail -= 1) {
      const trailX = Math.max(left, x - trail * 4.5 * ratio);
      ctx.globalAlpha = 0.035 * (6 - trail);
      ctx.fillStyle = phosphor;
      ctx.beginPath();
      ctx.arc(trailX, y, radius * (0.32 + (6 - trail) * 0.055), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.fillStyle = phosphor;
    ctx.shadowColor = phosphor;
    ctx.shadowBlur = 8 * ratio;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}


function updateSchemeLiveValues(): void {
  for (const element of document.querySelectorAll<HTMLElement>('.scheme-live-value')) {
    const signal = element.dataset.liveSignal;
    const match = signal?.match(/^([A-Za-z_]\w*)\.v_oct$/);
    if (!match) continue;
    const midi = audioEngine.readVoicePitchMidi(match[1]);
    element.textContent = midi === null ? '--' : formatMidiNote(midi);
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

function renderScheme(): void {
  const model = runtime.getSchemeModel();
  schemeNodes.replaceChildren();
  schemeEdges.replaceChildren();

  const nodeElements = new Map<string, HTMLElement>();
  for (const node of model.nodes) {
    const element = buildSchemeNode(node);
    nodeElements.set(node.id, element);
    schemeNodes.append(element);
  }

  requestAnimationFrame(() => {
    layoutScheme(model, nodeElements);
    drawSchemeConnections(model.connections, nodeElements);
    if ((model.nodes.some((node) => (node.views?.length ?? 0) > 0) || document.querySelector('.scheme-live-value')) && scopeFrame === 0) {
      scopeFrame = requestAnimationFrame(drawScopes);
    }
  });
}

function buildSchemeNode(node: SchemeNode): HTMLElement {
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
    label.textContent = view.port;

    const canvas = document.createElement('canvas');
    canvas.className = `scope-canvas scheme-scope view-${view.signalKind}`;
    canvas.dataset.signal = view.signal;
    canvas.dataset.kind = view.signalKind;
    canvas.setAttribute('aria-label', `${view.signal} ${view.signalKind} monitor`);
    embedded.append(label, canvas);
    element.append(embedded);
  }

  return element;
}

function layoutScheme(model: SchemeModel, elements: Map<string, HTMLElement>): void {
  const levels = calculateSchemeLevels(model);
  const grouped = new Map<number, SchemeNode[]>();
  for (const node of model.nodes) {
    const level = levels.get(node.id) ?? 0;
    const group = grouped.get(level) ?? [];
    group.push(node);
    grouped.set(level, group);
  }

  const levelNumbers = [...grouped.keys()].sort((a, b) => a - b);
  const columnGap = 110;
  const rowGap = 34;
  const padding = 34;
  let x = padding;
  let worldHeight = 0;

  for (const level of levelNumbers) {
    const nodes = grouped.get(level) ?? [];
    const width = Math.max(...nodes.map((node) => elements.get(node.id)?.offsetWidth ?? 120), 120);
    let y = padding;
    for (const node of nodes) {
      const element = elements.get(node.id);
      if (!element) continue;
      element.style.left = `${x}px`;
      element.style.top = `${y}px`;
      y += element.offsetHeight + rowGap;
    }
    worldHeight = Math.max(worldHeight, y);
    x += width + columnGap;
  }

  const worldWidth = Math.max(x - columnGap + padding, schemeViewport.clientWidth);
  worldHeight = Math.max(worldHeight + padding, schemeViewport.clientHeight);
  schemeWorld.style.width = `${worldWidth}px`;
  schemeWorld.style.height = `${worldHeight}px`;
  schemeEdges.setAttribute('width', String(worldWidth));
  schemeEdges.setAttribute('height', String(worldHeight));
  schemeEdges.setAttribute('viewBox', `0 0 ${worldWidth} ${worldHeight}`);
}

function calculateSchemeLevels(model: SchemeModel): Map<string, number> {
  const levels = new Map(model.nodes.map((node) => [node.id, 0]));
  const nonViewIds = new Set(model.nodes.map((node) => node.id));
  const graphEdges = model.connections.filter((connection) => connection.type !== 'view' && nonViewIds.has(connection.source) && nonViewIds.has(connection.target));

  // Relax edges instead of requiring a strict DAG. This gives a stable left-to-right
  // layout now and will degrade safely when feedback/cycles are introduced later.
  for (let pass = 0; pass < nonViewIds.size; pass += 1) {
    let changed = false;
    for (const edge of graphEdges) {
      const sourceLevel = levels.get(edge.source) ?? 0;
      const targetLevel = levels.get(edge.target) ?? 0;
      if (sourceLevel + 1 > targetLevel && sourceLevel + 1 < nonViewIds.size) {
        levels.set(edge.target, sourceLevel + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return levels;
}

function drawSchemeConnections(connections: SchemeConnection[], elements: Map<string, HTMLElement>): void {
  const ns = 'http://www.w3.org/2000/svg';
  const defs = document.createElementNS(ns, 'defs');
  const marker = document.createElementNS(ns, 'marker');
  marker.setAttribute('id', 'scheme-arrow');
  marker.setAttribute('viewBox', '0 0 8 8');
  marker.setAttribute('refX', '7');
  marker.setAttribute('refY', '4');
  marker.setAttribute('markerWidth', '6');
  marker.setAttribute('markerHeight', '6');
  marker.setAttribute('orient', 'auto-start-reverse');
  const arrow = document.createElementNS(ns, 'path');
  arrow.setAttribute('d', 'M 0 0 L 8 4 L 0 8 z');
  arrow.setAttribute('class', 'scheme-arrow-head');
  marker.append(arrow);
  defs.append(marker);
  schemeEdges.append(defs);

  const parallelGroups = new Map<string, SchemeConnection[]>();
  for (const connection of connections) {
    const key = `${connection.source}->${connection.target}:${connection.type}`;
    const group = parallelGroups.get(key) ?? [];
    group.push(connection);
    parallelGroups.set(key, group);
  }

  const worldRect = schemeWorld.getBoundingClientRect();
  for (const connection of connections) {
    const source = elements.get(connection.source);
    const target = elements.get(connection.target);
    if (!source || !target) continue;

    const a = source.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const groupKey = `${connection.source}->${connection.target}:${connection.type}`;
    const group = parallelGroups.get(groupKey) ?? [connection];
    const edgeIndex = Math.max(0, group.indexOf(connection));
    const edgeOffset = (edgeIndex - (group.length - 1) / 2) * 16;

    const x1 = a.right - worldRect.left;
    const y1 = a.top - worldRect.top + a.height / 2 + edgeOffset;
    const x2 = b.left - worldRect.left;
    const y2 = b.top - worldRect.top + b.height / 2 + edgeOffset;
    const bend = Math.max(36, (x2 - x1) * 0.5);

    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`);
    path.setAttribute('class', `scheme-edge scheme-edge-${connection.type}`);
    path.setAttribute('marker-end', 'url(#scheme-arrow)');
    schemeEdges.append(path);

    const labelParts: string[] = [];
    if (connection.amount !== undefined && connection.amount !== 100) labelParts.push(`${formatSchemeNumber(connection.amount)}%`);
    if (connection.type !== 'view' && (connection.sourcePort || connection.targetPort)) {
      labelParts.push(`${connection.sourcePort ?? ''}${connection.sourcePort && connection.targetPort ? ' → ' : ''}${connection.targetPort ?? ''}`);
    }
    if (labelParts.length > 0) {
      const label = document.createElementNS(ns, 'text');
      label.setAttribute('x', String((x1 + x2) / 2));
      label.setAttribute('y', String((y1 + y2) / 2 - 7));
      label.setAttribute('class', 'scheme-edge-label');
      label.textContent = labelParts.join('  ');
      schemeEdges.append(label);
    }
  }
}

function formatSchemeNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

function clearDiagnostic(): void {
  errorOverlays.replaceChildren();
  diagnosticLines = new Set<number>();
  renderLineGutter();
  diagnostic.classList.add('hidden');
  diagnostic.textContent = '';
}

function showDiagnostics(items: Array<{ line: number; message: string }>): void {
  errorOverlays.replaceChildren();
  const host = phosphorLayer.getBoundingClientRect();
  diagnosticLines = new Set(items.map((item) => item.line));
  renderLineGutter();

  for (const item of items) {
    const rect = lineRect(item.line);
    if (!rect) continue;

    const line = document.createElement('span');
    line.className = 'error-line';
    line.style.left = `${rect.left - host.left - 4}px`;
    line.style.top = `${rect.top - host.top}px`;
    line.style.width = `${Math.max(24, rect.width + 8)}px`;
    line.style.height = `${rect.height}px`;
    errorOverlays.append(line);
  }

  const summary = items
    .slice(0, 4)
    .map((item) => `! LINE ${item.line}: ${item.message}`)
    .join('\n');
  const remaining = items.length - 4;
  diagnostic.textContent = (remaining > 0 ? `${summary}\n! +${remaining} MORE ERROR${remaining === 1 ? '' : 'S'}` : summary).toUpperCase();
  diagnostic.classList.remove('hidden');
}

function lineRect(lineNumber: number): DOMRect | null {
  const lines = editor.value.split('\n');
  if (lineNumber < 1 || lineNumber > lines.length) return null;

  let offset = 0;
  for (let index = 0; index < lineNumber - 1; index += 1) offset += lines[index].length + 1;

  const editorRect = editor.getBoundingClientRect();
  const style = getComputedStyle(editor);
  const mirror = document.createElement('div');
  mirror.setAttribute('aria-hidden', 'true');
  mirror.style.position = 'fixed';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.left = `${editorRect.left}px`;
  mirror.style.top = `${editorRect.top}px`;
  mirror.style.width = `${editor.clientWidth}px`;
  mirror.style.margin = '0';
  mirror.style.padding = style.padding;
  mirror.style.border = style.border;
  mirror.style.boxSizing = style.boxSizing;
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = style.overflowWrap;
  mirror.style.wordBreak = style.wordBreak;
  mirror.style.fontFamily = style.fontFamily;
  mirror.style.fontSize = style.fontSize;
  mirror.style.fontWeight = style.fontWeight;
  mirror.style.fontStyle = style.fontStyle;
  mirror.style.fontVariant = style.fontVariant;
  mirror.style.lineHeight = style.lineHeight;
  mirror.style.letterSpacing = style.letterSpacing;

  mirror.append(document.createTextNode(editor.value.slice(0, offset)));
  const marker = document.createElement('span');
  marker.style.display = 'inline-block';
  marker.style.height = style.lineHeight;
  marker.textContent = lines[lineNumber - 1] || '\u200b';
  mirror.append(marker);
  document.body.append(mirror);

  const markerRect = marker.getBoundingClientRect();
  mirror.remove();

  return new DOMRect(
    markerRect.left - editor.scrollLeft,
    markerRect.top - editor.scrollTop,
    markerRect.width,
    markerRect.height || Number.parseFloat(style.lineHeight) || 24,
  );
}


function renderLineGutter(): void {
  const lines = editor.value.split('\n');
  const style = getComputedStyle(editor);
  const mirror = document.createElement('div');
  mirror.setAttribute('aria-hidden', 'true');
  mirror.style.position = 'fixed';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.width = `${editor.clientWidth}px`;
  mirror.style.margin = '0';
  mirror.style.padding = '0';
  mirror.style.border = '0';
  mirror.style.boxSizing = 'border-box';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = style.overflowWrap;
  mirror.style.wordBreak = style.wordBreak;
  mirror.style.fontFamily = style.fontFamily;
  mirror.style.fontSize = style.fontSize;
  mirror.style.fontWeight = style.fontWeight;
  mirror.style.fontStyle = style.fontStyle;
  mirror.style.fontVariant = style.fontVariant;
  mirror.style.lineHeight = style.lineHeight;
  mirror.style.letterSpacing = style.letterSpacing;

  const measured: HTMLElement[] = [];
  for (const text of lines) {
    const row = document.createElement('div');
    row.style.minHeight = style.lineHeight;
    row.textContent = text || '\u200b';
    mirror.append(row);
    measured.push(row);
  }
  document.body.append(mirror);

  const labels = statementLabels(editor.value);
  lineGutterContent.replaceChildren();
  lines.forEach((_, index) => {
    const physicalLine = index + 1;
    const row = document.createElement('div');
    row.className = diagnosticLines.has(physicalLine) ? 'line-number error' : 'line-number';
    row.style.height = `${measured[index].getBoundingClientRect().height}px`;
    const marker = document.createElement('span');
    marker.className = 'line-number-marker';
    marker.textContent = diagnosticLines.has(physicalLine) ? '!' : '';
    const label = document.createElement('span');
    label.textContent = labels[index] ?? '';
    row.append(marker, label);
    lineGutterContent.append(row);
  });
  mirror.remove();
  syncLineGutter();
}

function statementLabels(source: string): string[] {
  const lines = source.split('\n');
  const labels = Array(lines.length).fill('') as string[];
  let statement = 0;
  let pending = false;
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    let hasCode = false;
    let terminates = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];
      if (quote) {
        hasCode = true;
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) quote = null;
        continue;
      }
      if (char === '"' || char === "'") { quote = char; hasCode = true; continue; }
      if (char === '/' && next === '/') break;
      if (!/\s/.test(char)) hasCode = true;
      if (char === ';') terminates = true;
    }
    if (hasCode && !pending) {
      statement += 1;
      labels[lineIndex] = String(statement);
      pending = true;
    }
    if (terminates) pending = false;
  }
  return labels;
}

function statementCompleteBeforeCaret(source: string): boolean {
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let inComment = false;
  let lastSignificant = '';
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (inComment) { if (char === '\n') inComment = false; continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; lastSignificant = char; continue; }
    if (char === '/' && next === '/') { inComment = true; i += 1; continue; }
    if (!/\s/.test(char)) lastSignificant = char;
  }
  return lastSignificant === ';';
}

function renderSyntaxLayer(): void {
  const source = editor.value;
  syntaxLayer.replaceChildren();
  const lines = source.split('\n');
  lines.forEach((line, index) => {
    const row = document.createElement('div');
    row.className = 'syntax-line';
    const commentAt = commentStart(line);
    if (commentAt < 0) row.append(document.createTextNode(line || '\u200b'));
    else {
      row.append(document.createTextNode(line.slice(0, commentAt)));
      const comment = document.createElement('span');
      comment.className = 'syntax-comment';
      comment.textContent = line.slice(commentAt);
      row.append(comment);
    }
    syntaxLayer.append(row);
  });
  syncSyntaxLayer();
}

function commentStart(line: string): number {
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (let i = 0; i < line.length - 1; i += 1) {
    const char = line[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '/' && line[i + 1] === '/') return i;
  }
  return -1;
}

function syncSyntaxLayer(): void {
  syntaxLayer.style.transform = `translate(${-editor.scrollLeft}px, ${-editor.scrollTop}px)`;
}

function syncLineGutter(): void {
  lineGutterContent.style.transform = `translateY(${-editor.scrollTop}px)`;
}

function setSourceText(text: string): void {
  clearDiagnostic();
  savedEditorSelection = null;
  editor.value = text.replace(/\r\n/g, '\n');
  renderSyntaxLayer();
  renderLineGutter();
  placeCaretAtEnd(editor);
}

function placeCaretAtEnd(element: HTMLTextAreaElement): void {
  const end = element.value.length;
  element.focus();
  element.setSelectionRange(end, end);
}

function editorCaretOffset(): number {
  return editor.selectionStart;
}

function caretRect(): DOMRect | null {
  const offset = editorCaretOffset();
  const editorRect = editor.getBoundingClientRect();
  const style = getComputedStyle(editor);
  const mirror = document.createElement('div');
  mirror.setAttribute('aria-hidden', 'true');
  mirror.style.position = 'fixed';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.left = `${editorRect.left}px`;
  mirror.style.top = `${editorRect.top}px`;
  mirror.style.width = `${editor.clientWidth}px`;
  mirror.style.height = 'auto';
  mirror.style.margin = '0';
  mirror.style.padding = style.padding;
  mirror.style.border = style.border;
  mirror.style.boxSizing = style.boxSizing;
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = style.overflowWrap;
  mirror.style.wordBreak = style.wordBreak;
  mirror.style.fontFamily = style.fontFamily;
  mirror.style.fontSize = style.fontSize;
  mirror.style.fontWeight = style.fontWeight;
  mirror.style.fontStyle = style.fontStyle;
  mirror.style.fontVariant = style.fontVariant;
  mirror.style.lineHeight = style.lineHeight;
  mirror.style.letterSpacing = style.letterSpacing;
  mirror.style.textTransform = style.textTransform;

  mirror.append(document.createTextNode(editor.value.slice(0, offset)));
  const marker = document.createElement('span');
  marker.style.display = 'inline-block';
  marker.style.width = '0';
  marker.style.height = '1em';
  marker.textContent = '\u200b';
  mirror.append(marker);
  document.body.append(mirror);

  const markerRect = marker.getBoundingClientRect();
  mirror.remove();

  const left = markerRect.left - editor.scrollLeft;
  const top = markerRect.top - editor.scrollTop;
  return new DOMRect(left, top, 0, markerRect.height || Number.parseFloat(style.lineHeight) || 24);
}

function positionBlockCaret(): void {
  if (screen !== 'live' || commandMode || document.activeElement !== editor) {
    blockCaret.classList.add('hidden');
    return;
  }

  const rect = caretRect();
  if (!rect) {
    blockCaret.classList.add('hidden');
    return;
  }

  const host = phosphorLayer.getBoundingClientRect();
  const editorStyle = getComputedStyle(editor);
  const fontSize = Number.parseFloat(editorStyle.fontSize) || 20;
  blockCaret.style.fontSize = `${fontSize}px`;
  blockCaret.style.left = `${rect.left - host.left}px`;
  const caretHeight = fontSize * 0.78;
  blockCaret.style.top = `${rect.top - host.top + Math.max(0, (rect.height - caretHeight) * 0.5)}px`;
  blockCaret.classList.remove('hidden');
}

function flashAtCaret(text: string): void {
  if (!text || text === '\n') return;
  const rect = caretRect();
  if (!rect) return;

  const host = phosphorLayer.getBoundingClientRect();
  const editorStyle = getComputedStyle(editor);
  const fontSize = Number.parseFloat(editorStyle.fontSize) || 20;
  const pulse = document.createElement('span');
  pulse.className = 'phosphor-pulse';
  pulse.style.fontSize = `${fontSize}px`;
  pulse.style.left = `${rect.left - host.left}px`;
  pulse.style.top = `${rect.top - host.top + Math.max(0, (rect.height - fontSize * 0.82) * 0.5)}px`;
  phosphorLayer.appendChild(pulse);
  window.setTimeout(() => pulse.remove(), 320);
}

async function runCommand(raw: string): Promise<void> {
  const [name = '', ...args] = raw.trim().toLowerCase().split(/\s+/);

  switch (name) {
    case '':
      leaveCommandMode();
      return;
    case 'config':
      leaveCommandMode();
      showScreen('config');
      return;
    case 'help':
      leaveCommandMode();
      showScreen('help');
      return;
    case 'scheme':
      leaveCommandMode();
      showScreen('scheme');
      return;
    case 'new':
    case 'clear':
      setSourceText('');
      leaveCommandMode();
      notify('source cleared');
      return;
    case 'save':
      leaveCommandMode();
      await saveSource(args[0]);
      return;
    case 'load':
      leaveCommandMode();
      await loadSource();
      return;
    case 'start':
      leaveCommandMode();
      try {
        await audioEngine.start();
        audioAutoStartPending = false;
        notify('audio engine running');
      } catch (error) {
        notify(error instanceof Error ? error.message : 'audio start failed');
      }
      return;
    case 'stop':
      leaveCommandMode();
      try {
        await audioEngine.stop();
        notify('audio engine stopped');
      } catch {
        notify('audio stop failed');
      }
      return;
    case 'test': {
      leaveCommandMode();
      if (args[0] === 'stop') {
        audioEngine.stopTestTone();
        notify('test tone stopped');
        return;
      }

      const frequency = args[0] === undefined ? 440 : Number(args[0]);
      try {
        await audioEngine.testTone(frequency);
        notify(`test tone ${Math.round(frequency)} hz`);
      } catch (error) {
        notify(error instanceof RangeError ? error.message : 'test tone failed');
      }
      return;
    }
    case 'clock': {
      const action = args[0]?.toLowerCase();
      if (action === 'start') { audioEngine.setClockTransport(true); notify('clock started'); }
      else if (action === 'stop') { audioEngine.setClockTransport(false); notify('clock stopped'); }
      else notify('usage: :clock start | :clock stop');
      leaveCommandMode();
      return;
    }
    case 'panic':
      leaveCommandMode();
      audioEngine.panic();
      notify('panic');
      return;
    default:
      leaveCommandMode();
      notify(`unknown command: ${name}`);
  }
}

async function saveSource(fileName?: string): Promise<void> {
  const text = sourceText();
  const suggested = fileName?.endsWith('.sum') ? fileName : `${fileName || 'untitled'}.sum`;

  try {
    const picker = (window as Window & {
      showSaveFilePicker?: (options: unknown) => Promise<FileSystemFileHandle>;
    }).showSaveFilePicker;

    if (picker) {
      const handle = await picker({
        suggestedName: suggested,
        types: [{ description: 'Sonus Umbrae source', accept: { 'text/plain': ['.sum'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      notify('saved');
      return;
    }

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = suggested;
    anchor.click();
    URL.revokeObjectURL(url);
    notify('saved');
  } catch (error) {
    if ((error as DOMException).name !== 'AbortError') notify('save failed');
  }
}

async function loadSource(): Promise<void> {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.sum,text/plain';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    setSourceText(await file.text());
    notify(`loaded ${file.name}`);
  }, { once: true });
  input.click();
}

document.addEventListener('selectionchange', () => requestAnimationFrame(positionBlockCaret));
editor.addEventListener('input', () => {
  renderSyntaxLayer();
  renderLineGutter();
  requestAnimationFrame(positionBlockCaret);
});
editor.addEventListener('keyup', () => requestAnimationFrame(positionBlockCaret));
editor.addEventListener('pointerup', () => requestAnimationFrame(positionBlockCaret));
liveScreen.addEventListener('scroll', () => {
  clearDiagnostic();
  requestAnimationFrame(positionBlockCaret);
});
editor.addEventListener('scroll', () => {
  syncLineGutter();
  syncSyntaxLayer();
  requestAnimationFrame(positionBlockCaret);
});
window.addEventListener('resize', () => {
  renderLineGutter();
  requestAnimationFrame(positionBlockCaret);
});
window.addEventListener('keydown', retryAutoStartFromGesture, { capture: true });

editor.addEventListener('beforeinput', (event) => {
  const input = event as InputEvent;
  if (input.inputType === 'insertText' && input.data) flashAtCaret(input.data);
});

editor.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    enterCommandMode();
    return;
  }

  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    evaluateLiveSource();
    requestAnimationFrame(positionBlockCaret);
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const before = editor.value.slice(0, start);
    const complete = statementCompleteBeforeCaret(before);
    const indentation = complete ? '' : '    ';
    editor.setRangeText(`\n${indentation}`, start, end, 'end');

    renderSyntaxLayer();
    renderLineGutter();
    if (!event.shiftKey && complete) evaluateLiveSource();

    requestAnimationFrame(positionBlockCaret);
    return;
  }

  if (event.key === 'Tab' && event.shiftKey) {
    event.preventDefault();
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.setRangeText('  ', start, end, 'end');
    requestAnimationFrame(positionBlockCaret);
  }
});

command.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    leaveCommandMode();
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    void runCommand(command.value);
  }
});

document.addEventListener('keydown', (event) => {
  if (commandMode) return;

  if (event.key === 'Tab' && !event.shiftKey) {
    if (screen === 'live' || screen === 'scheme') {
      event.preventDefault();
      event.stopPropagation();
      showScreen(screen === 'live' ? 'scheme' : 'live');
      return;
    }
  }

  if (event.key === 'Escape' && (screen === 'config' || screen === 'help' || screen === 'scheme')) {
    event.preventDefault();
    showScreen('live');
  }
}, { capture: true });

window.addEventListener('pointerdown', (event) => {
  retryAutoStartFromGesture();
  if (screen !== 'live' || commandMode) return;
  if (event.target === editor || editor.contains(event.target as Node)) return;
  editor.focus();
  requestAnimationFrame(positionBlockCaret);
});

renderSyntaxLayer();
requestAnimationFrame(renderLineGutter);
