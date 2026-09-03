import './style.css';
import { AudioEngine } from './audio/engine';
import { SonusEvaluationError, SonusRuntime, type InlineViewState, type ParameterViewState, type TuringViewState, type SchemeConnection, type SchemeModel, type SchemeNode } from './language/runtime';
import { compileLanguageSource, LanguageError } from './language/language';

type Screen = 'live' | 'config' | 'help' | 'scheme';

const VERSION = '0.1.0';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app');

app.innerHTML = `
  <main class="machine" aria-label="Sonus Umbrae live coding environment">
    <header class="statusbar">
      <span class="brand">SONUS UMBRAE / ${VERSION}</span>
      <span class="status-item"><span class="label">CLK</span> <span id="clock-status" class="disabled">--.-</span></span>
      <span class="status-item"><span class="label">AUDIO ENGINE</span> <span id="live-dot" class="dot off" aria-label="engine stopped"></span></span>
      <span class="status-item"><span class="label">LIVE</span> <span id="code-status" class="disabled" aria-label="code stopped">○</span></span>
      <span class="status-item optional"><span class="label">DSP</span> <span id="dsp-status" class="disabled">--%</span></span>
    </header>

    <section id="surface" class="surface">
      <div id="live-screen" class="screen live-screen">
        <div class="editor-pane">
          <div id="line-gutter" class="line-gutter" aria-hidden="true"><div id="line-gutter-content" class="line-gutter-content"></div></div>
          <div class="editor-stack"><div id="syntax-layer" class="syntax-layer" aria-hidden="true"></div><textarea id="editor" class="editor" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Live coding editor"></textarea><div id="inline-view-layer" class="inline-view-layer" aria-hidden="true"></div></div>
        </div>
        <aside id="view-panel" class="view-panel hidden" aria-label="Signal views">
          <div id="view-stack" class="view-stack"></div>
        </aside>
      </div>

      <div id="config-screen" class="screen system-screen hidden" aria-hidden="true">
        <div class="system-title">CONFIGURATION</div>
        <div class="rule"></div>
        <div class="system-copy">NO CONFIGURABLE PARAMETERS IN ${VERSION}</div>
        <div class="system-copy muted">ESC  RETURN TO CODE</div>
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
          <span>:RUN</span><span>START / RELOAD LIVE CODE</span>
          <span>:RUN STOP</span><span>STOP LIVE CODE</span>
          <span>:TEST 440</span><span>PLAY DIAGNOSTIC SINE TONE</span>
          <span>:TEST STOP</span><span>STOP DIAGNOSTIC TONE</span>
          <span>:CLOCK START</span><span>START MASTER CLOCK TRANSPORT</span>
          <span>:CLOCK STOP</span><span>STOP MASTER CLOCK TRANSPORT</span>
          <span>:PANIC</span><span>STOP CURRENT AUDIO IMMEDIATELY</span>
          <span>ENTER</span><span>INSERT NEW LINE</span>
          <span>CMD/CTRL+ENTER</span><span>RECOMPILE / START LIVE CODE</span>
          <span>CMD+BACKSPACE</span><span>STOP LIVE CODE</span>
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

      <div id="audio-start-overlay" class="audio-start-overlay" role="dialog" aria-modal="true" aria-label="Start audio engine">
        <div class="audio-start-card">
          <div class="audio-start-title">SONUS UMBRAE</div>
          <div class="rule"></div>
          <div class="audio-start-copy">AUDIO ENGINE SUSPENDED</div>
          <button id="audio-start-button" class="audio-start-button" type="button">START AUDIO</button>
          <div id="audio-start-status" class="system-copy muted">BROWSER REQUIRES USER INTERACTION</div>
        </div>
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

const inlineViewStyle = document.createElement('style');
inlineViewStyle.textContent = `
  .editor-stack { position: relative; }
  .inline-view-layer { display: none; }

  .syntax-inline-spacer {
    position: relative;
    height: 38px;
    min-height: 38px;
    width: 100%;
    box-sizing: border-box;
  }
  .syntax-inline-slot {
    position: absolute;
    left: 1.5em;
    right: 12px;
    top: 3px;
    height: 31px;
    box-sizing: border-box;
    opacity: .94;
    color: rgb(112 224 213);
    filter: drop-shadow(0 0 3px rgb(112 224 213 / .55));
  }
  .syntax-inline-slot.inline-piano {
    right: auto;
    width: auto;
    max-width: calc(100% - 2.5em);
    overflow: hidden;
  }
  .syntax-inline-slot.inline-scalar {
    right: auto;
    width: 180px;
    max-width: calc(100% - 2.5em);
  }
  .syntax-inline-slot svg {
    height: 100%;
    display: block;
    overflow: visible;
  }
  .syntax-inline-slot.inline-scalar svg {
    width: 100%;
  }

  .line-number-inline-spacer {
    height: 38px;
    min-height: 38px;
  }

  .inline-piano .key-white {
    fill: transparent;
    stroke: currentColor;
    stroke-opacity: .34;
  }
  .inline-piano .key-white.available {
    fill: currentColor;
    fill-opacity: .30;
    stroke-opacity: .86;
  }
  .inline-piano .key-black-mask {
    fill: rgb(2 4 2);
    stroke: none;
  }
  .inline-piano .key-black {
    fill: currentColor;
    fill-opacity: .03;
    stroke: currentColor;
    stroke-opacity: .42;
  }
  .inline-piano .key-black.available {
    fill-opacity: .68;
    stroke-opacity: .92;
  }
  .inline-piano .current-dot {
    fill: currentColor;
    stroke: rgb(2 4 2);
    stroke-width: 1;
  }

  .inline-scalar .scalar-track {
    stroke: currentColor;
    stroke-opacity: .48;
    stroke-width: 1.2;
  }
  .inline-scalar .scalar-base {
    stroke: currentColor;
    stroke-opacity: .88;
    stroke-width: 1.2;
  }
  .inline-scalar .scalar-trail {
    fill: currentColor;
  }
  .inline-scalar .scalar-current {
    fill: currentColor;
    stroke: rgb(2 4 2);
    stroke-width: 1;
  }
`;
document.head.append(inlineViewStyle);

const editor = must<HTMLTextAreaElement>('editor');
const syntaxLayer = must<HTMLElement>('syntax-layer');
const inlineViewLayer = must<HTMLElement>('inline-view-layer');
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
const audioStartOverlay = must<HTMLElement>('audio-start-overlay');
const audioStartButton = must<HTMLButtonElement>('audio-start-button');
const audioStartStatus = must<HTMLElement>('audio-start-status');
const phosphorLayer = must<HTMLElement>('phosphor-layer');
const message = must<HTMLElement>('message');
const blockCaret = must<HTMLElement>('block-caret');
const errorOverlays = must<HTMLElement>('error-overlays');
const viewPanel = must<HTMLElement>('view-panel');
const viewStack = must<HTMLElement>('view-stack');
const diagnostic = must<HTMLElement>('diagnostic');
const liveDot = must<HTMLElement>('live-dot');
const codeStatus = must<HTMLElement>('code-status');
const dspStatus = must<HTMLElement>('dsp-status');
const clockStatus = must<HTMLElement>('clock-status');

const audioEngine = new AudioEngine();
const runtime = new SonusRuntime(audioEngine);

let screen: Screen = 'live';
let commandMode = false;
let messageTimer = 0;
let previewTimer = 0;
let scopeFrame = 0;
let inlineViewFrame = 0;
let inlineViewLastPaint = 0;
let savedEditorSelection: { start: number; end: number; direction: 'forward' | 'backward' | 'none' } | null = null;
let audioAutoStartPending = true;
let codeRunning = false;
let diagnosticLines = new Set<number>();
const PANEL_STATE_KEY = 'sonus-umbrae.monitor-panels';
const panelCollapsed = new Map<string, boolean>();
const panelExplicitState = new Set<string>();
let panelOrder: string[] = [];
let draggedPanelId: string | null = null;
let clockWasActive = false;
let lastCaretTrailPosition: { left: number; top: number } | null = null;

loadPanelState();

async function tryAutoStartAudio(): Promise<void> {
  if (!audioAutoStartPending) return;
  try {
    await audioEngine.start();
    if (audioEngine.snapshot().state !== 'running') throw new Error('audio start blocked');
    audioAutoStartPending = false;
    if (!sourceText().trim()) runtime.evaluate('');
    syncViews();
  } catch {
    notify('audio waiting for browser permission');
  }
}

async function startAudioFromOverlay(): Promise<void> {
  if (!audioAutoStartPending) {
    audioStartOverlay.classList.add('hidden');
    return;
  }

  audioStartButton.disabled = true;
  audioStartButton.textContent = 'STARTING...';
  audioStartStatus.textContent = 'INITIALIZING AUDIO ENGINE';

  try {
    await tryAutoStartAudio();

    if (audioEngine.snapshot().state !== 'running') {
      throw new Error('audio start blocked');
    }

    audioStartOverlay.classList.add('hidden');
    audioStartButton.disabled = false;
    audioStartButton.textContent = 'START AUDIO';
    audioStartStatus.textContent = 'BROWSER REQUIRES USER INTERACTION';
    editor.focus();
  } catch {
    audioStartButton.disabled = false;
    audioStartButton.textContent = 'RETRY AUDIO';
    audioStartStatus.textContent = 'AUDIO START FAILED — TRY AGAIN';
  }
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

// Web Audio requires an explicit user gesture.
// Keep the engine suspended until the user activates the startup gate.
audioStartButton.focus();

function must<T extends Element>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as unknown as T;
}

function showScreen(next: Screen): void {
  if (next !== 'live') clearDiagnostic();
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

function normalizeLanguageCommandCase(): void {
  const normalized = editor.value
    .replace(
      /^(\s*)(voice|fx|filter|seq|play|set|clock|main)(?=\s|$)/gim,
      (_match, indentation: string, commandName: string) => `${indentation}${commandName.toUpperCase()}`,
    )
    .replace(
      /^(\s*)mod(?=\s+[A-Za-z_]\w*(?:\s+with\s+view)?\s*:)/gim,
      (_match, indentation: string) => `${indentation}MOD`,
    )
    .replace(
      /^(\s+)model(?=\s)/gim,
      (_match, indentation: string) => `${indentation}model`,
    )
    .replace(
      /^(\s*PLAY\s+[A-Za-z_]\w*(?:\.(?:out|aux))?\s+through\s+)main(?:\.([lr]))?/gim,
      (_match, prefix: string, channel: string | undefined) =>
        `${prefix}MAIN${channel ? `.${channel.toUpperCase()}` : ''}`,
    )
    .replace(
      /^(\s*PLAY\b.*)$/gim,
      (line: string) => line
        .replace(/\bmain\b/gi, 'MAIN')
        .replace(/\.([lr])\b/gi, (_match, channel: string) => `.${channel.toUpperCase()}`),
    )
    .replace(
      /^(\s*(?:through|then)\b.*)$/gim,
      (line: string) => line
        .replace(/\bmain\b/gi, 'MAIN')
        .replace(/\.([lr])\b/gi, (_match, channel: string) => `.${channel.toUpperCase()}`),
    )
    .replace(
      /^(\s*scale\s+)([a-g])([#b]?)(?=\s|$)/gim,
      (_match, prefix: string, note: string, accidental: string) =>
        `${prefix}${note.toUpperCase()}${accidental}`,
    );

  if (normalized === editor.value) return;

  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const direction = editor.selectionDirection ?? 'none';
  editor.value = normalized;
  editor.setSelectionRange(start, end, direction);
}

function sourceText(): string {
  return editor.value.replace(/\r\n/g, '\n');
}

function setCodeRunning(running: boolean): void {
  codeRunning = running;
  if (running) {
    window.clearTimeout(previewTimer);
    previewTimer = 0;
  }
  codeStatus.textContent = running ? '▶' : '○';
  codeStatus.classList.toggle('disabled', !running);
  codeStatus.setAttribute('aria-label', running ? 'code running' : 'code stopped');
  if (running) {
    renderSyntaxLayer();
    renderLineGutter();
    startInlineViewLoop();
  } else {
    clearInlineViews();
  }
}

function refreshStoppedPreview(): boolean {
  if (codeRunning) return false;

  try {
    const source = sourceText();
    const compiled = source.trim() ? compileLanguageSource(source) : '';
    runtime.evaluate(compiled, { applyAudio: false });
    clearDiagnostic();
    syncViews();
    return true;
  } catch (error) {
    // While editing with LIVE stopped, incomplete/invalid source is expected.
    // Keep the last valid preview and avoid surfacing transient diagnostics.
    if (error instanceof LanguageError || error instanceof SonusEvaluationError) return false;
    return false;
  }
}

function scheduleStoppedPreview(delay = 90): void {
  if (codeRunning) return;
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => {
    previewTimer = 0;
    refreshStoppedPreview();
  }, delay);
}

function recompileLiveCode(): boolean {
  window.clearTimeout(previewTimer);
  previewTimer = 0;
  const applied = evaluateLiveSource();
  if (applied && !codeRunning) {
    setCodeRunning(true);
    notify('live code running');
  }
  return applied;
}

function evaluateLiveSource(): boolean {
  try {
    clearDiagnostic();
    const source = sourceText();
    if (!source.trim()) {
      runtime.evaluate('');
      syncViews();
      notify('ok');
      return true;
    }

    const compiled = compileLanguageSource(source);
    const hasMasterClock = /^\s*CLOCK\b/im.test(source);
    audioEngine.setClockTransport(hasMasterClock);
    const results = runtime.evaluate(compiled);
    const last = results.at(-1);
    syncViews();
    notify(last?.message ?? 'ok');
    return true;
  } catch (error) {
    if (error instanceof LanguageError) {
      showDiagnostics(error.diagnostics);
      syncViews();
      return false;
    }

    if (error instanceof SonusEvaluationError) {
      showDiagnostics(error.diagnostics);
      syncViews();
      return false;
    }

    notify(error instanceof Error ? error.message : 'evaluation failed');
    syncViews();
    return false;
  }
}


function clearInlineViews(): void {
  if (inlineViewFrame !== 0) {
    cancelAnimationFrame(inlineViewFrame);
    inlineViewFrame = 0;
  }
  inlineViewLastPaint = 0;
  inlineViewLayer.replaceChildren();
  renderSyntaxLayer();
  renderLineGutter();
}

function startInlineViewLoop(): void {
  if (!codeRunning || inlineViewFrame !== 0) return;
  const frame = (time: number): void => {
    inlineViewFrame = 0;
    if (!codeRunning) {
      inlineViewLayer.replaceChildren();
      return;
    }
    if (time - inlineViewLastPaint >= 50) {
      inlineViewLastPaint = time;
      renderInlineViews();
    }
    inlineViewFrame = requestAnimationFrame(frame);
  };
  inlineViewFrame = requestAnimationFrame(frame);
}

function renderInlineViews(): void {
  if (!codeRunning || screen !== 'live') return;

  const states = new Map(runtime.getInlineViews().map((view) => [view.id, view]));
  const slots = syntaxLayer.querySelectorAll<HTMLElement>('.syntax-inline-slot[data-inline-view-id]');

  for (const slot of slots) {
    const id = slot.dataset.inlineViewId;
    if (!id) continue;
    const state = states.get(id);
    if (!state) continue;
    slot.replaceChildren(state.kind === 'piano' ? buildInlinePiano(state) : buildInlineSparkline(state));
  }
}

function buildInlinePiano(state: Extract<InlineViewState, { kind: 'piano' }>): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  const minMidi = Math.min(...state.availableMidi);
  const maxMidi = Math.max(...state.availableMidi);
  const blackClasses = new Set([1, 3, 6, 8, 10]);
  const available = new Set(state.availableMidi);

  // Keep the keyboard proportional: every white key has a fixed on-screen width.
  // If the requested range starts/ends on a black key, include its neighbouring
  // white key so the black key has a physical surface to sit on.
  let first = Math.max(0, minMidi);
  let last = Math.min(127, maxMidi);
  if (blackClasses.has(((first % 12) + 12) % 12)) first = Math.max(0, first - 1);
  if (blackClasses.has(((last % 12) + 12) % 12)) last = Math.min(127, last + 1);

  const whites: number[] = [];
  for (let midi = first; midi <= last; midi += 1) {
    if (!blackClasses.has(((midi % 12) + 12) % 12)) whites.push(midi);
  }

  const whiteWidth = 18;
  const whiteHeight = 30;
  const blackWidth = 10;
  const blackHeight = 18;
  const totalWidth = Math.max(whiteWidth, whites.length * whiteWidth);

  svg.setAttribute('viewBox', `0 0 ${totalWidth} ${whiteHeight}`);
  svg.setAttribute('width', String(totalWidth));
  svg.setAttribute('height', String(whiteHeight));
  svg.style.width = `${totalWidth}px`;
  svg.style.minWidth = `${totalWidth}px`;
  svg.style.maxWidth = 'none';
  svg.setAttribute('preserveAspectRatio', 'xMinYMid meet');

  const whiteX = new Map<number, number>();
  whites.forEach((midi, index) => {
    const x = index * whiteWidth;
    whiteX.set(midi, x);
    const key = document.createElementNS(ns, 'rect');
    key.setAttribute('x', String(x + 0.5));
    key.setAttribute('y', '0.5');
    key.setAttribute('width', String(whiteWidth - 1));
    key.setAttribute('height', String(whiteHeight - 1));
    key.setAttribute('rx', '1');
    key.setAttribute('class', `key-white${available.has(midi) ? ' available' : ''}`);
    svg.append(key);
  });

  // Draw black keys after white keys. The opaque mask underneath each black key
  // hides the white-key divider behind it, so the divider resumes only below the
  // black key as on a real piano keyboard.
  for (let midi = first; midi <= last; midi += 1) {
    if (!blackClasses.has(((midi % 12) + 12) % 12)) continue;

    let previousWhite = midi - 1;
    while (previousWhite >= first && blackClasses.has(((previousWhite % 12) + 12) % 12)) previousWhite -= 1;
    const baseX = whiteX.get(previousWhite);
    if (baseX === undefined) continue;

    const x = baseX + whiteWidth - blackWidth / 2;

    const mask = document.createElementNS(ns, 'rect');
    mask.setAttribute('x', String(x - 1));
    mask.setAttribute('y', '0');
    mask.setAttribute('width', String(blackWidth + 2));
    mask.setAttribute('height', String(blackHeight + 1));
    mask.setAttribute('rx', '1');
    mask.setAttribute('class', 'key-black-mask');
    svg.append(mask);

    const key = document.createElementNS(ns, 'rect');
    key.setAttribute('x', String(x));
    key.setAttribute('y', '0.5');
    key.setAttribute('width', String(blackWidth));
    key.setAttribute('height', String(blackHeight));
    key.setAttribute('rx', '1');
    key.setAttribute('class', `key-black${available.has(midi) ? ' available' : ''}`);
    svg.append(key);
  }

  const current = Math.max(first, Math.min(last, state.currentMidi));
  const isBlack = blackClasses.has(((current % 12) + 12) % 12);
  let dotX = totalWidth / 2;
  let dotY = whiteHeight - 7;

  if (isBlack) {
    let previousWhite = current - 1;
    while (previousWhite >= first && blackClasses.has(((previousWhite % 12) + 12) % 12)) previousWhite -= 1;
    const baseX = whiteX.get(previousWhite);
    if (baseX !== undefined) dotX = baseX + whiteWidth;
    dotY = blackHeight * 0.55;
  } else {
    const x = whiteX.get(current);
    if (x !== undefined) dotX = x + whiteWidth / 2;
  }

  const dot = document.createElementNS(ns, 'circle');
  dot.setAttribute('cx', String(dotX));
  dot.setAttribute('cy', String(dotY));
  dot.setAttribute('r', '2.4');
  dot.setAttribute('class', 'current-dot');
  svg.append(dot);
  return svg;
}

function buildInlineSparkline(state: Extract<InlineViewState, { kind: 'scalar' }>): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  const width = 180;
  const height = 26;
  const left = 5;
  const right = width - 5;
  const centerY = 13;

  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.style.width = `${width}px`;
  svg.style.minWidth = `${width}px`;
  svg.style.maxWidth = 'none';

  const recent = state.history.slice(-12);
  const recentMin = recent.length > 0 ? Math.min(...recent, state.base) : state.base;
  const recentMax = recent.length > 0 ? Math.max(...recent, state.base) : state.base;

  // Use a local window around the base so small musical movement is obvious,
  // but expand it when the recent generator history escapes that window.
  const fullSpan = Math.max(1, state.max - state.min);
  const defaultHalfWindow = Math.max(fullSpan * 0.15, 8);
  let visibleMin = Math.min(state.base - defaultHalfWindow, recentMin - 2);
  let visibleMax = Math.max(state.base + defaultHalfWindow, recentMax + 2);
  visibleMin = Math.max(state.min, visibleMin);
  visibleMax = Math.min(state.max, visibleMax);
  if (visibleMax - visibleMin < 1) visibleMax = visibleMin + 1;

  const xFor = (value: number): number => {
    const normalized = (value - visibleMin) / (visibleMax - visibleMin);
    return left + Math.max(0, Math.min(1, normalized)) * (right - left);
  };

  const track = document.createElementNS(ns, 'line');
  track.setAttribute('x1', String(left));
  track.setAttribute('x2', String(right));
  track.setAttribute('y1', String(centerY));
  track.setAttribute('y2', String(centerY));
  track.setAttribute('class', 'scalar-track');
  svg.append(track);

  const baseX = xFor(state.base);
  const baseMarker = document.createElementNS(ns, 'line');
  baseMarker.setAttribute('x1', String(baseX));
  baseMarker.setAttribute('x2', String(baseX));
  baseMarker.setAttribute('y1', '5');
  baseMarker.setAttribute('y2', '21');
  baseMarker.setAttribute('class', 'scalar-base');
  svg.append(baseMarker);

  const trailValues = state.history.slice(-6, -1);
  trailValues.forEach((value, index) => {
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', String(xFor(value)));
    dot.setAttribute('cy', String(centerY));
    dot.setAttribute('r', String(1.2 + index * 0.18));
    dot.setAttribute('opacity', String(0.12 + index * 0.11));
    dot.setAttribute('class', 'scalar-trail');
    svg.append(dot);
  });

  const current = document.createElementNS(ns, 'circle');
  current.setAttribute('cx', String(xFor(state.current)));
  current.setAttribute('cy', String(centerY));
  current.setAttribute('r', '3.2');
  current.setAttribute('class', 'scalar-current');
  svg.append(current);

  return svg;
}

function syncViews(): void {
  const signalViews = new Map(audioEngine.getViewSignals().map((view) => [view.signal, view.kind]));
  const explicitSignals = new Set(runtime.getExplicitSignalViews().map((view) => view.signal));
  const moduleViews = new Set(runtime.getModuleViews());
  const parameterViews = new Map(runtime.getParameterViews().map((view) => [view.signal, view]));
  const variables = runtime.getVariableViews();
  const turingViews = runtime.getTuringViews();
  const scheme = runtime.getSchemeModel();
  const nodes = new Map(scheme.nodes.map((node) => [node.id, node]));
  const panels: HTMLElement[] = [];

  panels.push(buildVariablesPanel(variables));
  for (const view of turingViews) panels.push(buildTuringPanel(view));

  const audio = nodes.get('Audio');
  panels.push(buildModuleMonitorPanel({
    id: 'Audio',
    title: 'AUDIO OUT',
    parameters: audio?.parameters ?? [],
    signals: [],
    compositeSignals: ['Audio.out_L', 'Audio.out_R'],
    stereoLegend: true,
    defaultCollapsed: false,
  }));

  const clock = nodes.get('Clock');
  const clockBpm = audioEngine.getClockStatus().bpm;
  const clockActive = clockBpm > 0;
  if (clockActive && !clockWasActive && !panelExplicitState.has('Clock')) panelCollapsed.set('Clock', false);
  if (!clockActive && !panelExplicitState.has('Clock')) panelCollapsed.set('Clock', true);
  clockWasActive = clockActive;
  panels.push(buildModuleMonitorPanel({
    id: 'Clock',
    title: 'CLOCK',
    parameters: clock?.parameters ?? [],
    signals: signalViews.has('Clock.out') ? [{ signal: 'Clock.out', kind: 'trigger', label: 'OUT' }] : [],
    defaultCollapsed: !clockActive,
  }));

  for (const node of scheme.nodes) {
    if (node.id === 'Audio' || node.id === 'Clock') continue;
    const isDerivedClock = / : CLOCK$/i.test(node.label);
    const primarySignal = `${node.id}.out`;
    const explicitPrimary = explicitSignals.has(primarySignal);
    if (isDerivedClock && !explicitPrimary) continue;

    const signals: Array<{ signal: string; kind: string; label: string }> = [];
    const primaryKind = signalViews.get(primarySignal);
    if (primaryKind && explicitPrimary) {
      signals.push({ signal: primarySignal, kind: primaryKind, label: 'OUT' });
    }

    for (const signal of explicitSignals) {
      if (!signal.startsWith(`${node.id}.`) || signal === primarySignal) continue;
      const kind = signalViews.get(signal);
      if (!kind) continue;
      const port = signal.slice(node.id.length + 1).toUpperCase();
      signals.push({ signal, kind, label: port });
    }

    const details = [...parameterViews.values()].filter((view) => view.signal.startsWith(`${node.id}.`));
    const compositeSignals = moduleViews.has(node.id)
      ? / : (?:SWELL|MOD)$/i.test(node.label)
        ? [1, 2, 3, 4].map((port) => `${node.id}.out${port}`)
        : / : VOICE$/i.test(node.label)
          ? [`${node.id}.out`, `${node.id}.aux`]
          : / : (?:MIST|FX)$/i.test(node.label)
            ? [`${node.id}.out_L`, `${node.id}.out_R`]
            : []
      : [];

    // User-created modules exist in VARIABLES and SCHEME automatically, but a
    // LIVE monitor panel is created only by an explicit .view(). Merely
    // creating or changing a module must not consume monitor space.
    if (signals.length === 0 && details.length === 0 && compositeSignals.length === 0) continue;

    panels.push(buildModuleMonitorPanel({
      id: node.id,
      title: node.label,
      parameters: [],
      signals,
      compositeSignals,
      parameterDetails: details,
      defaultCollapsed: false,
    }));
  }

  viewStack.replaceChildren(...panels);
  applySavedPanelOrder();
  liveScreen.classList.add('with-views');
  viewPanel.classList.remove('hidden');

  if (scopeFrame === 0) scopeFrame = requestAnimationFrame(drawScopes);
  requestAnimationFrame(positionBlockCaret);
}

function buildVariablesPanel(variables: Array<{ name: string; value: string }>): HTMLElement {
  const card = createMonitorCard('Variables', 'VARIABLES', false);
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

function buildTuringPanel(view: TuringViewState): HTMLElement {
  const card = createMonitorCard(`SEQ:${view.name}`, `${view.name.toUpperCase()} : SEQ / TURING`, false);
  card.classList.add('turing-monitor-card');
  const body = card.querySelector<HTMLElement>('.monitor-body');
  if (!body) return card;

  const meta = document.createElement('div');
  meta.className = 'turing-meta';
  meta.innerHTML = `<span>LENGTH ${view.length}</span><span>CHANGE ${Number.isInteger(view.change) ? view.change : view.change.toFixed(1)}%</span>`;

  const register = document.createElement('div');
  register.className = 'turing-register';
  register.dataset.turingName = view.name;
  register.dataset.revision = String(view.revision);
  register.style.setProperty('--turing-length', String(view.length));

  for (const bit of view.bits) {
    const cell = document.createElement('span');
    cell.className = `turing-bit ${bit ? 'on' : 'off'}`;
    register.append(cell);
  }

  const readout = document.createElement('div');
  readout.className = 'turing-readout';
  const label = document.createElement('span');
  label.textContent = 'NOTE';
  const value = document.createElement('span');
  value.className = 'turing-note-value';
  value.dataset.turingName = view.name;
  value.textContent = formatFrequencyAsNote(view.currentFrequency);
  readout.append(label, value);

  body.append(meta, register, readout);
  return card;
}

function formatFrequencyAsNote(frequency: number): string {
  if (!Number.isFinite(frequency) || frequency <= 0) return '--';
  const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
  return formatMidiNote(midi);
}

function buildModuleMonitorPanel(options: {
  id: string;
  title: string;
  parameters: Array<{ name: string; value: string; liveSignal?: string }>;
  signals: Array<{ signal: string; kind: string; label: string }>;
  compositeSignals?: string[];
  stereoLegend?: boolean;
  parameterDetails?: ParameterViewState[];
  defaultCollapsed: boolean;
}): HTMLElement {
  const card = createMonitorCard(options.id, options.title, options.defaultCollapsed);
  const body = card.querySelector<HTMLElement>('.monitor-body');
  if (!body) return card;


  if ((options.compositeSignals?.length ?? 0) > 0) {
    const section = document.createElement('div');
    section.className = 'monitor-signal monitor-composite';
    const label = document.createElement('div');
    label.className = 'monitor-section-label';
    label.textContent = options.id === 'Audio'
      ? 'STEREO OUT'
      : (/: (?:MIST|FX)$/.test(options.title))
        ? 'OUT L / R'
        : options.compositeSignals!.length === 2
          ? 'OUT / AUX'
          : options.title.endsWith(': MOD')
            ? 'A / B / C / D'
            : 'OUT 1-4';

    if (options.stereoLegend || (/: (?:MIST|FX)$/.test(options.title) && options.compositeSignals?.length === 2)) {
      const legend = document.createElement('span');
      legend.className = 'scope-stereo-legend';
      legend.innerHTML = '<span class="scope-legend-l">● L</span><span class="scope-legend-r">● R</span>';
      label.append(legend);
    } else if (options.title.endsWith(': MOD') && options.compositeSignals?.length === 4) {
      const legend = document.createElement('span');
      legend.className = 'scope-stereo-legend';
      legend.innerHTML = [
        '<span style="color:var(--scope-trace-1)">● A</span>',
        '<span style="color:var(--scope-trace-2)">● B</span>',
        '<span style="color:var(--scope-trace-3)">● C</span>',
        '<span style="color:var(--scope-trace-4)">● D</span>',
      ].join('');
      label.append(legend);
    }
    const canvas = document.createElement('canvas');
    canvas.className = 'scope-canvas view-signal composite-scope';
    canvas.dataset.signals = options.compositeSignals!.join(',');
    canvas.dataset.kind = 'multi-signal';
    if (options.title.endsWith(': MOD')) {
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

function createMonitorCard(id: string, titleText: string, defaultCollapsed: boolean): HTMLElement {
  const card = document.createElement('section');
  card.className = 'view-card monitor-card';
  card.dataset.panelId = id;

  const collapsed = panelCollapsed.get(id) ?? defaultCollapsed;
  panelCollapsed.set(id, collapsed);
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
    panelCollapsed.set(id, next);
    panelExplicitState.add(id);
    savePanelState();
    if (!next && scopeFrame === 0) scopeFrame = requestAnimationFrame(drawScopes);
  });

  header.addEventListener('dragstart', (event) => {
    draggedPanelId = id;
    card.classList.add('dragging');
    event.dataTransfer?.setData('text/plain', id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  });
  header.addEventListener('dragend', () => {
    draggedPanelId = null;
    card.classList.remove('dragging');
    savePanelOrderFromDom();
  });

  card.append(header, body);
  return card;
}

viewStack.addEventListener('dragover', (event) => {
  if (!draggedPanelId) return;
  event.preventDefault();
  const dragging = viewStack.querySelector<HTMLElement>(`[data-panel-id="${CSS.escape(draggedPanelId)}"]`);
  if (!dragging) return;
  const siblings = [...viewStack.querySelectorAll<HTMLElement>('.monitor-card:not(.dragging)')];
  const next = siblings.find((card) => event.clientY < card.getBoundingClientRect().top + card.offsetHeight / 2);
  if (next) viewStack.insertBefore(dragging, next); else viewStack.append(dragging);
});

viewStack.addEventListener('drop', (event) => {
  if (!draggedPanelId) return;
  event.preventDefault();
  savePanelOrderFromDom();
});

function loadPanelState(): void {
  try {
    const raw = localStorage.getItem(PANEL_STATE_KEY);
    if (!raw) return;
    const state = JSON.parse(raw) as { collapsed?: Record<string, boolean>; order?: string[] };
    for (const [id, collapsed] of Object.entries(state.collapsed ?? {})) {
      panelCollapsed.set(id, Boolean(collapsed));
      panelExplicitState.add(id);
    }
    panelOrder = Array.isArray(state.order) ? state.order.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    // UI preferences are intentionally non-critical.
  }
}

function savePanelState(): void {
  try {
    localStorage.setItem(PANEL_STATE_KEY, JSON.stringify({
      collapsed: Object.fromEntries(panelCollapsed),
      order: panelOrder,
    }));
  } catch {
    // Ignore unavailable or disabled local storage.
  }
}

function savePanelOrderFromDom(): void {
  panelOrder = [...viewStack.querySelectorAll<HTMLElement>('.monitor-card')]
    .map((card) => card.dataset.panelId)
    .filter((id): id is string => Boolean(id));
  savePanelState();
}

function applySavedPanelOrder(): void {
  if (panelOrder.length === 0) return;
  const rank = new Map(panelOrder.map((id, index) => [id, index]));
  const cards = [...viewStack.querySelectorAll<HTMLElement>('.monitor-card')];
  cards.sort((a, b) => (rank.get(a.dataset.panelId ?? '') ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.dataset.panelId ?? '') ?? Number.MAX_SAFE_INTEGER));
  for (const card of cards) viewStack.append(card);
}


function updateVariableValues(): void {
  const values = new Map(runtime.getVariableViews().map((variable) => [variable.name, variable.value]));
  for (const element of document.querySelectorAll<HTMLElement>('.variable-value[data-variable-name]')) {
    const name = element.dataset.variableName;
    if (!name) continue;
    const value = values.get(name);
    if (value !== undefined) element.textContent = value;
  }
}

function updateTuringViews(): void {
  const states = new Map(runtime.getTuringViews().map((view) => [view.name, view]));
  for (const register of document.querySelectorAll<HTMLElement>('.turing-register[data-turing-name]')) {
    const name = register.dataset.turingName;
    if (!name) continue;
    const state = states.get(name);
    if (!state) continue;
    const revision = Number(register.dataset.revision ?? '-1');
    if (revision !== state.revision || register.children.length !== state.bits.length) {
      register.dataset.revision = String(state.revision);
      register.style.setProperty('--turing-length', String(state.length));
      register.replaceChildren(...state.bits.map((bit) => {
        const cell = document.createElement('span');
        cell.className = `turing-bit ${bit ? 'on' : 'off'} turing-bit-shift`;
        return cell;
      }));
    }
  }
  for (const value of document.querySelectorAll<HTMLElement>('.turing-note-value[data-turing-name]')) {
    const name = value.dataset.turingName;
    if (!name) continue;
    const state = states.get(name);
    if (state) value.textContent = formatFrequencyAsNote(state.currentFrequency);
  }
}

function drawScopes(): void {
  scopeFrame = 0;
  updateVariableValues();
  updateTuringViews();
  updateSchemeLiveValues();
  const canvases = [...document.querySelectorAll<HTMLCanvasElement>('canvas.scope-canvas')];
  const liveValues = document.querySelectorAll<HTMLElement>('.scheme-live-value');
  const turingRegisters = document.querySelectorAll<HTMLElement>('.turing-register');
  if (canvases.length === 0 && liveValues.length === 0 && turingRegisters.length === 0) return;

  const phosphor = getComputedStyle(document.documentElement).getPropertyValue('--phosphor-hot').trim() || '#ffe783';


  for (const canvas of canvases) {
    const signal = canvas.dataset.signal;
    const compositeSignals = canvas.dataset.signals?.split(',').filter(Boolean) ?? [];
    if (!signal && compositeSignals.length === 0) continue;

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
    if (kind === 'multi-signal') {
      const styles = getComputedStyle(document.documentElement);
      const traceColors = [
        styles.getPropertyValue('--scope-trace-1').trim() || phosphor,
        styles.getPropertyValue('--scope-trace-2').trim() || phosphor,
        styles.getPropertyValue('--scope-trace-3').trim() || phosphor,
        styles.getPropertyValue('--scope-trace-4').trim() || phosphor,
      ];

      compositeSignals.forEach((traceSignal, traceIndex) => {
        const data = new Float32Array(512);
        if (!audioEngine.readOscilloscope(traceSignal, data)) return;
        const traceColor = traceColors[traceIndex % traceColors.length];
        ctx.strokeStyle = traceColor;
        ctx.shadowColor = traceColor;
        ctx.beginPath();
        for (let i = 0; i < data.length; i += 1) {
          const x = (i / (data.length - 1)) * width;
          const y = height * 0.5 - data[i] * height * 0.42;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });
      continue;
    }
    if (kind === 'trigger') {
      drawTriggerPhase(ctx, width, height, signal!, phosphor);
      continue;
    }

    const data = new Float32Array(512);
    if (!signal || !audioEngine.readOscilloscope(signal, data)) continue;
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
  const rawModel = runtime.getSchemeModel();

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
  const model: SchemeModel = { nodes, connections: rawModel.connections };

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
    if (view.signals?.length) {
      canvas.dataset.signals = view.signals.join(',');
      canvas.dataset.kind = 'multi-signal';
      canvas.classList.add('composite-scope');
      if (node.label.endsWith(': MOD') && view.signals.length === 4) {
        canvas.dataset.modScope = 'true';
        canvas.dataset.modName = node.id;
      }
    } else {
      canvas.dataset.kind = view.signalKind;
    }
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

  const labels = statementLabels(editor.value);
  const summary = items
    .slice(0, 4)
    .map((item) => {
      const statement = statementNumberForPhysicalLine(labels, item.line);
      return `! ${statement === null ? `LINE ${item.line}` : `STATEMENT ${statement}`}: ${item.message}`;
    })
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


const INLINE_VIEW_ROW_HEIGHT = 38;

function activeInlineViewsByLine(): Map<number, InlineViewState[]> {
  const grouped = new Map<number, InlineViewState[]>();
  if (!codeRunning) return grouped;

  for (const view of runtime.getInlineViews()) {
    const list = grouped.get(view.line) ?? [];
    list.push(view);
    grouped.set(view.line, list);
  }
  return grouped;
}


function inlineSpacerBeforePhysicalLine(line: number): number {
  if (!codeRunning || line <= 1) return 0;
  const grouped = activeInlineViewsByLine();
  let total = 0;
  for (const [viewLine, views] of grouped) {
    if (viewLine < line) total += views.length * INLINE_VIEW_ROW_HEIGHT;
  }
  return total;
}

function updateEditorInlineScrollExtent(): void {
  const total = [...activeInlineViewsByLine().values()]
    .reduce((sum, views) => sum + views.length * INLINE_VIEW_ROW_HEIGHT, 0);
  editor.style.paddingBottom = total > 0 ? `${total + 8}px` : '';
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
  const inlineByLine = activeInlineViewsByLine();
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

    const views = inlineByLine.get(physicalLine) ?? [];
    for (let viewIndex = 0; viewIndex < views.length; viewIndex += 1) {
      const spacer = document.createElement('div');
      spacer.className = 'line-number-inline-spacer';
      spacer.style.height = `${INLINE_VIEW_ROW_HEIGHT}px`;
      lineGutterContent.append(spacer);
    }
  });
  mirror.remove();
  syncLineGutter();
}

function statementLabels(source: string): string[] {
  const lines = source.split('\n');
  const labels = Array(lines.length).fill('') as string[];
  let statement = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed || trimmed.startsWith('//')) continue;
    if (/^(VOICE|FX|FILTER|MOD|SEQ|SET|CLOCK|PLAY)\b/i.test(trimmed)) {
      statement += 1;
      labels[index] = String(statement);
    }
  }

  return labels;
}

function statementNumberForPhysicalLine(labels: string[], physicalLine: number): number | null {
  if (physicalLine < 1 || physicalLine > labels.length) return null;
  for (let index = physicalLine - 1; index >= 0; index -= 1) {
    const label = labels[index];
    if (label) return Number(label);
  }
  return null;
}

function renderSyntaxLayer(): void {
  const source = editor.value;
  const editorStyle = getComputedStyle(editor);
  const inlineByLine = activeInlineViewsByLine();

  syntaxLayer.style.width = `${editor.clientWidth}px`;
  syntaxLayer.style.fontFamily = editorStyle.fontFamily;
  syntaxLayer.style.fontSize = editorStyle.fontSize;
  syntaxLayer.style.fontWeight = editorStyle.fontWeight;
  syntaxLayer.style.lineHeight = editorStyle.lineHeight;
  syntaxLayer.style.letterSpacing = editorStyle.letterSpacing;
  syntaxLayer.replaceChildren();

  const lines = source.split('\n');
  lines.forEach((line, index) => {
    const physicalLine = index + 1;
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

    const views = inlineByLine.get(physicalLine) ?? [];
    for (const view of views) {
      const spacer = document.createElement('div');
      spacer.className = 'syntax-inline-spacer';
      spacer.style.height = `${INLINE_VIEW_ROW_HEIGHT}px`;

      const slot = document.createElement('div');
      slot.className = `syntax-inline-slot ${view.kind === 'piano' ? 'inline-piano' : 'inline-scalar'}`;
      slot.dataset.inlineViewId = view.id;
      slot.append(view.kind === 'piano' ? buildInlinePiano(view) : buildInlineSparkline(view));

      spacer.append(slot);
      syntaxLayer.append(spacer);
    }
  });

  updateEditorInlineScrollExtent();
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
  const physicalLine = editor.value.slice(0, offset).split('\n').length;
  const top = markerRect.top - editor.scrollTop + inlineSpacerBeforePhysicalLine(physicalLine);
  return new DOMRect(left, top, 0, markerRect.height || Number.parseFloat(style.lineHeight) || 24);
}

function leaveBlockCaretTrail(): void {
  if (screen !== 'live' || commandMode || document.activeElement !== editor) return;
  if (blockCaret.classList.contains('hidden')) return;

  const left = blockCaret.style.left;
  const top = blockCaret.style.top;
  if (!left || !top) return;

  const trail = document.createElement('span');
  trail.className = 'block-caret-trail';
  trail.style.fontSize = blockCaret.style.fontSize;
  trail.style.left = left;
  trail.style.top = top;
  phosphorLayer.append(trail);
  window.setTimeout(() => trail.remove(), 360);
}

function positionBlockCaret(): void {
  if (screen !== 'live' || commandMode || document.activeElement !== editor) {
    blockCaret.classList.add('hidden');
    lastCaretTrailPosition = null;
    return;
  }

  const rect = caretRect();
  if (!rect) {
    blockCaret.classList.add('hidden');
    lastCaretTrailPosition = null;
    return;
  }

  const host = phosphorLayer.getBoundingClientRect();
  const editorStyle = getComputedStyle(editor);
  const fontSize = Number.parseFloat(editorStyle.fontSize) || 20;
  const left = rect.left - host.left;
  const caretHeight = fontSize * 0.92;
  const top = rect.top - host.top + Math.max(0, (rect.height - caretHeight) * 0.5);

  if (lastCaretTrailPosition && (Math.abs(lastCaretTrailPosition.left - left) > 0.5 || Math.abs(lastCaretTrailPosition.top - top) > 0.5)) {
    const trail = document.createElement('span');
    trail.className = 'block-caret-trail';
    trail.style.fontSize = `${fontSize}px`;
    trail.style.left = `${lastCaretTrailPosition.left}px`;
    trail.style.top = `${lastCaretTrailPosition.top}px`;
    phosphorLayer.append(trail);
    window.setTimeout(() => trail.remove(), 360);
  }

  lastCaretTrailPosition = { left, top };
  blockCaret.style.fontSize = `${fontSize}px`;
  blockCaret.style.left = `${left}px`;
  blockCaret.style.top = `${top}px`;
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

function stopLiveCode(): void {
  runtime.stopExecution();
  audioEngine.setClockTransport(false);
  setCodeRunning(false);
  syncViews();
  notify('live code stopped');
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
      runtime.evaluate('');
      setCodeRunning(false);
      syncViews();
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
    case 'run': {
      leaveCommandMode();
      const action = args[0]?.toLowerCase();
      if (action === 'stop') {
        stopLiveCode();
        return;
      }
      if (action !== undefined) {
        notify('usage: :run | :run stop');
        return;
      }
      const applied = evaluateLiveSource();
      if (applied) {
        setCodeRunning(true);
        notify('live code running');
      }
      return;
    }
    case 'start':
      leaveCommandMode();
      try {
        await audioEngine.start();
        audioAutoStartPending = false;
    if (!sourceText().trim()) runtime.evaluate('');
    syncViews();
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
    const applied = codeRunning ? evaluateLiveSource() : refreshStoppedPreview();
    if (applied) notify(`loaded ${file.name}`);
    else notify(`loaded ${file.name} — runtime unchanged`);
  }, { once: true });
  input.click();
}

audioStartButton.addEventListener('click', () => {
  void startAudioFromOverlay();
});

document.addEventListener('selectionchange', () => requestAnimationFrame(positionBlockCaret));
editor.addEventListener('input', () => {
  normalizeLanguageCommandCase();
  renderSyntaxLayer();
  renderLineGutter();
  scheduleStoppedPreview();
  requestAnimationFrame(positionBlockCaret);
});
editor.addEventListener('keyup', () => requestAnimationFrame(positionBlockCaret));
editor.addEventListener('pointerdown', () => leaveBlockCaretTrail());
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
  renderSyntaxLayer();
  renderLineGutter();
  requestAnimationFrame(positionBlockCaret);
});

editor.addEventListener('beforeinput', (event) => {
  const input = event as InputEvent;
  if (input.inputType === 'insertText' && input.data) flashAtCaret(input.data);
});

editor.addEventListener('keydown', (event) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
    leaveBlockCaretTrail();
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    enterCommandMode();
    return;
  }

  if (event.key === 'Backspace' && event.metaKey) {
    event.preventDefault();
    event.stopPropagation();
    stopLiveCode();
    requestAnimationFrame(positionBlockCaret);
    return;
  }

  if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    event.stopPropagation();

    const value = editor.value;
    const caret = editor.selectionStart;
    const lineStart = value.lastIndexOf('\n', Math.max(0, caret - 1)) + 1;
    const nextNewline = value.indexOf('\n', caret);
    const hasFollowingLine = nextNewline !== -1;
    const deleteEnd = hasFollowingLine ? nextNewline + 1 : value.length;
    const deleteStart = hasFollowingLine || lineStart === 0 ? lineStart : lineStart - 1;
    const nextCaret = hasFollowingLine ? lineStart : Math.max(0, deleteStart);

    editor.setRangeText('', deleteStart, deleteEnd, 'start');
    editor.setSelectionRange(nextCaret, nextCaret);

    renderSyntaxLayer();
    renderLineGutter();
    scheduleStoppedPreview();
    requestAnimationFrame(positionBlockCaret);
    return;
  }

  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    normalizeLanguageCommandCase();
    recompileLiveCode();
    requestAnimationFrame(positionBlockCaret);
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();

    normalizeLanguageCommandCase();

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const before = editor.value.slice(0, start);
    const currentLine = before.slice(before.lastIndexOf('\n') + 1);
    const trimmed = currentLine.trim();
    const currentIndent = currentLine.match(/^\s*/)?.[0] ?? '';

    let indentation = currentIndent;
    if (!trimmed) indentation = currentIndent.length >= 4 ? currentIndent.slice(0, -4) : '';
    else if (/^(VOICE|FX|FILTER|MOD)\b.*:\s*$/i.test(trimmed)) indentation = `${currentIndent}    `;
    else if (/^PLAY\b/i.test(trimmed) && !/\bthrough\b/i.test(trimmed)) indentation = `${currentIndent}    `;
    else if (currentIndent.length > 0 && /^(through|then)\b/i.test(trimmed)) indentation = currentIndent;

    editor.setRangeText(`\n${indentation}`, start, end, 'end');

    renderSyntaxLayer();
    renderLineGutter();
    scheduleStoppedPreview();

    requestAnimationFrame(positionBlockCaret);
    return;
  }

  if (event.key === 'Tab' && event.shiftKey) {
    event.preventDefault();
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.setRangeText('  ', start, end, 'end');
    scheduleStoppedPreview();
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
  if (!audioStartOverlay.classList.contains('hidden')) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopImmediatePropagation();
      void startAudioFromOverlay();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      audioStartButton.focus();
    }
    return;
  }

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
  if (screen !== 'live' || commandMode) return;
  if (event.target === editor || editor.contains(event.target as Node)) return;
  editor.focus();
  requestAnimationFrame(positionBlockCaret);
});

setCodeRunning(false);
renderSyntaxLayer();
requestAnimationFrame(renderLineGutter);
