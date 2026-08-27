import './style.css';

type Screen = 'live' | 'config' | 'help';

const VERSION = '0.0.1';

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
        <div id="editor" class="editor" contenteditable="true" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Live coding editor"></div>
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
          <span>:START</span><span>AUDIO NOT IMPLEMENTED</span>
          <span>:STOP</span><span>AUDIO NOT IMPLEMENTED</span>
        </div>
        <div class="system-copy muted">ESC  RETURN TO LIVE</div>
      </div>

      <div id="phosphor-layer" class="phosphor-layer" aria-hidden="true"></div>
      <div id="message" class="message" aria-live="polite"></div>
    </section>

    <footer id="commandbar" class="commandbar hidden">
      <span class="prompt">:</span>
      <input id="command" class="command" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Command" />
    </footer>
  </main>
`;

const editor = must<HTMLDivElement>('editor');
const commandbar = must<HTMLElement>('commandbar');
const command = must<HTMLInputElement>('command');
const liveScreen = must<HTMLElement>('live-screen');
const configScreen = must<HTMLElement>('config-screen');
const helpScreen = must<HTMLElement>('help-screen');
const phosphorLayer = must<HTMLElement>('phosphor-layer');
const message = must<HTMLElement>('message');

let screen: Screen = 'live';
let commandMode = false;
let messageTimer = 0;

editor.textContent = '';
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
}

function enterCommandMode(): void {
  if (screen !== 'live') return;
  commandMode = true;
  commandbar.classList.remove('hidden');
  command.value = '';
  command.focus();
}

function leaveCommandMode(): void {
  commandMode = false;
  commandbar.classList.add('hidden');
  command.value = '';
  editor.focus();
}

function notify(text: string): void {
  window.clearTimeout(messageTimer);
  message.textContent = text.toUpperCase();
  message.classList.add('visible');
  messageTimer = window.setTimeout(() => message.classList.remove('visible'), 1800);
}

function sourceText(): string {
  return editor.innerText.replace(/\u00a0/g, ' ');
}

function setSourceText(text: string): void {
  editor.textContent = text.replace(/\r\n/g, '\n');
  placeCaretAtEnd(editor);
}

function placeCaretAtEnd(element: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function flashAtCaret(text: string): void {
  if (!text || text === '\n') return;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  const host = phosphorLayer.getBoundingClientRect();
  if (!rect.width && !rect.height) return;
  const ghost = document.createElement('span');
  ghost.className = 'phosphor-ghost';
  ghost.textContent = text.slice(-1);
  ghost.style.left = `${rect.left - host.left}px`;
  ghost.style.top = `${rect.top - host.top}px`;
  phosphorLayer.appendChild(ghost);
  window.setTimeout(() => ghost.remove(), 420);
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
    case 'stop':
      leaveCommandMode();
      notify('audio engine not implemented');
      return;
    default:
      leaveCommandMode();
      notify(`unknown command: ${name}`);
  }
}

async function saveSource(fileName?: string): Promise<void> {
  const text = sourceText();
  const suggested = fileName?.endsWith('.su') ? fileName : `${fileName || 'untitled'}.su`;

  try {
    const picker = (window as Window & {
      showSaveFilePicker?: (options: unknown) => Promise<FileSystemFileHandle>;
    }).showSaveFilePicker;

    if (picker) {
      const handle = await picker({
        suggestedName: suggested,
        types: [{ description: 'Sonus Umbrae source', accept: { 'text/plain': ['.su'] } }],
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
  input.accept = '.su,text/plain';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    setSourceText(await file.text());
    notify(`loaded ${file.name}`);
  }, { once: true });
  input.click();
}

editor.addEventListener('beforeinput', (event) => {
  const input = event as InputEvent;
  if (input.inputType === 'insertText' && input.data) flashAtCaret(input.data);
});

editor.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    enterCommandMode();
  }

  if (event.key === 'Tab') {
    event.preventDefault();
    document.execCommand('insertText', false, '  ');
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
});
