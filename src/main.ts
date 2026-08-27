import './style.css';
import { AudioEngine } from './audio/engine';
import { SonusEvaluationError, SonusRuntime } from './language/runtime';

type Screen = 'live' | 'config' | 'help';

const VERSION = '0.0.3';

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
          <textarea id="editor" class="editor" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Live coding editor"></textarea>
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
          <span>:SAVE</span><span>SAVE SOURCE FILE</span>
          <span>:LOAD</span><span>LOAD SOURCE FILE</span>
          <span>:NEW</span><span>CLEAR SOURCE</span>
          <span>:CLEAR</span><span>CLEAR SOURCE</span>
          <span>:START</span><span>START / RESUME AUDIO ENGINE</span>
          <span>:STOP</span><span>SUSPEND AUDIO ENGINE</span>
          <span>:TEST 440</span><span>PLAY DIAGNOSTIC SINE TONE</span>
          <span>:TEST STOP</span><span>STOP DIAGNOSTIC TONE</span>
          <span>:PANIC</span><span>STOP CURRENT AUDIO IMMEDIATELY</span>
          <span>ENTER</span><span>EVALUATE SOURCE AND INSERT NEW LINE</span>
          <span>SHIFT+ENTER</span><span>INSERT NEW LINE WITHOUT EVALUATING</span>
          <span>CMD+ENTER</span><span>EVALUATE ENTIRE SOURCE</span>
        </div>
        <div class="system-copy muted">ESC  RETURN TO LIVE</div>
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
const commandbar = must<HTMLElement>('commandbar');
const command = must<HTMLInputElement>('command');
const liveScreen = must<HTMLElement>('live-screen');
const configScreen = must<HTMLElement>('config-screen');
const helpScreen = must<HTMLElement>('help-screen');
const phosphorLayer = must<HTMLElement>('phosphor-layer');
const message = must<HTMLElement>('message');
const blockCaret = must<HTMLElement>('block-caret');
const errorOverlays = must<HTMLElement>('error-overlays');
const viewPanel = must<HTMLElement>('view-panel');
const viewStack = must<HTMLElement>('view-stack');
const diagnostic = must<HTMLElement>('diagnostic');
const liveDot = must<HTMLElement>('live-dot');
const dspStatus = must<HTMLElement>('dsp-status');

const audioEngine = new AudioEngine();
const runtime = new SonusRuntime(audioEngine);

let screen: Screen = 'live';
let commandMode = false;
let messageTimer = 0;
let scopeFrame = 0;
let savedEditorSelection: { start: number; end: number; direction: 'forward' | 'backward' | 'none' } | null = null;

audioEngine.subscribe((snapshot) => {
  const isRunning = snapshot.state === 'running';
  liveDot.classList.toggle('on', isRunning);
  liveDot.classList.toggle('off', !isRunning);
  liveDot.setAttribute('aria-label', isRunning ? 'engine running' : 'engine stopped');
  dspStatus.textContent = snapshot.sampleRate ? `${Math.round(snapshot.sampleRate / 1000)}K` : '--';
  dspStatus.classList.toggle('disabled', snapshot.sampleRate === null);
  syncViews();
});

editor.value = '';
editor.focus();

function must<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}

function showScreen(next: Screen): void {
  screen = next;
  liveScreen.classList.toggle('hidden', next !== 'live');
  configScreen.classList.toggle('hidden', next !== 'config');
  helpScreen.classList.toggle('hidden', next !== 'help');
  liveScreen.setAttribute('aria-hidden', String(next !== 'live'));
  configScreen.setAttribute('aria-hidden', String(next !== 'config'));
  helpScreen.setAttribute('aria-hidden', String(next !== 'help'));
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
  const signals = audioEngine.getViewSignals();
  const hasViews = signals.length > 0;
  liveScreen.classList.toggle('with-views', hasViews);
  viewPanel.classList.toggle('hidden', !hasViews);

  const existing = new Map(
    [...viewStack.querySelectorAll<HTMLElement>('.view-card')].map((card) => [card.dataset.signal ?? '', card]),
  );

  for (const signal of signals) {
    let card = existing.get(signal);
    if (card) {
      existing.delete(signal);
      continue;
    }

    card = document.createElement('section');
    card.className = 'view-card';
    card.dataset.signal = signal;

    const title = document.createElement('div');
    title.className = 'view-title';
    title.textContent = signal.toUpperCase();

    const canvas = document.createElement('canvas');
    canvas.className = 'scope-canvas';
    canvas.dataset.signal = signal;
    canvas.setAttribute('aria-label', `${signal} oscilloscope`);

    card.append(title, canvas);
    viewStack.append(card);
  }

  for (const card of existing.values()) card.remove();

  if (hasViews && scopeFrame === 0) scopeFrame = requestAnimationFrame(drawScopes);
  requestAnimationFrame(positionBlockCaret);
}

function drawScopes(): void {
  scopeFrame = 0;
  const canvases = [...viewStack.querySelectorAll<HTMLCanvasElement>('canvas.scope-canvas')];
  if (canvases.length === 0) return;

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

    const data = new Float32Array(512);
    if (!audioEngine.readOscilloscope(signal, data)) continue;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = phosphor;
    ctx.lineWidth = Math.max(1, window.devicePixelRatio);
    ctx.shadowColor = phosphor;
    ctx.shadowBlur = 3 * window.devicePixelRatio;
    ctx.beginPath();
    for (let i = 0; i < data.length; i += 1) {
      const x = (i / (data.length - 1)) * width;
      const y = height * 0.5 - data[i] * height * 0.42;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  scopeFrame = requestAnimationFrame(drawScopes);
}

function clearDiagnostic(): void {
  errorOverlays.replaceChildren();
  diagnostic.classList.add('hidden');
  diagnostic.textContent = '';
}

function showDiagnostics(items: Array<{ line: number; message: string }>): void {
  errorOverlays.replaceChildren();
  const host = phosphorLayer.getBoundingClientRect();
  const style = getComputedStyle(editor);
  const fontSize = Number.parseFloat(style.fontSize) || 20;

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

    const marker = document.createElement('span');
    marker.className = 'error-marker';
    marker.textContent = '!';
    marker.style.fontSize = `${fontSize}px`;
    marker.style.left = `${Math.max(2, rect.left - host.left - fontSize * 0.9)}px`;
    marker.style.top = `${rect.top - host.top}px`;
    errorOverlays.append(marker);
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

function setSourceText(text: string): void {
  clearDiagnostic();
  savedEditorSelection = null;
  editor.value = text.replace(/\r\n/g, '\n');
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
        notify('audio engine running');
      } catch {
        notify('audio start failed');
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
editor.addEventListener('input', () => requestAnimationFrame(positionBlockCaret));
editor.addEventListener('keyup', () => requestAnimationFrame(positionBlockCaret));
editor.addEventListener('pointerup', () => requestAnimationFrame(positionBlockCaret));
liveScreen.addEventListener('scroll', () => {
  clearDiagnostic();
  requestAnimationFrame(positionBlockCaret);
});
editor.addEventListener('scroll', () => {
  clearDiagnostic();
  requestAnimationFrame(positionBlockCaret);
});
window.addEventListener('resize', () => {
  requestAnimationFrame(positionBlockCaret);
});

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
    editor.setRangeText('\n', start, end, 'end');

    if (!event.shiftKey) evaluateLiveSource();

    requestAnimationFrame(positionBlockCaret);
    return;
  }

  if (event.key === 'Tab') {
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
  if (event.key !== 'Escape' || commandMode) return;
  if (screen === 'config' || screen === 'help') {
    event.preventDefault();
    showScreen('live');
  }
});

window.addEventListener('pointerdown', (event) => {
  if (screen !== 'live' || commandMode) return;
  if (event.target === editor || editor.contains(event.target as Node)) return;
  editor.focus();
  requestAnimationFrame(positionBlockCaret);
});
