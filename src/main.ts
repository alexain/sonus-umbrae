import './style.css';
import { AudioEngine, type AudioLatencyMode } from './audio/engine';
import { SonusEvaluationError, SonusRuntime, type DrumkitViewState, type InlineViewState, type LifeViewState, type ConstellationViewState, type SnakeViewState, type LogicViewState, type ParameterViewState, type TuringViewState, type SchemeConnection, type SchemeModel, type SchemeNode } from './language/runtime';
import { compileLanguageSource, LanguageError, parseProgramCapabilities, type ProgramCapability } from './language/language';
import { parameterUpdatePolicy, type ParameterUpdatePolicy } from './language/parameter-policy';
import { expandEditorSnippet } from './editor/snippets';
import { AssetLibrary } from './editor/assets';

type Screen = 'live' | 'config' | 'help' | 'about' | 'scheme';

const VERSION = '0.6.0';

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
          <div id="line-gutter" class="line-gutter" aria-label="Object controls and statement numbers"><div id="line-gutter-content" class="line-gutter-content"></div></div>
          <div class="editor-stack"><div id="syntax-layer" class="syntax-layer" aria-hidden="true"></div><textarea id="editor" class="editor" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Live coding editor"></textarea><div id="live-control-layer" class="live-control-layer" aria-label="Live parameter controls"></div><div id="inline-view-layer" class="inline-view-layer" aria-hidden="true"></div></div>
        </div>
        <aside id="view-panel" class="view-panel hidden" aria-label="Signal views">
          <div id="view-stack" class="view-stack"></div>
        </aside>
      </div>

      <div id="config-screen" class="screen system-screen hidden" aria-hidden="true">
        <div class="system-title">CONFIGURATION</div>
        <div class="rule"></div>
        <div class="system-subtitle">AUDIO</div>
        <div class="config-grid" id="config-grid">
          <label class="config-row" data-config-key="output"><span>OUTPUT DEVICE</span><select id="config-output"><option value="">SYSTEM DEFAULT</option></select></label>
          <label class="config-row" data-config-key="sampleRate"><span>SAMPLE RATE</span><select id="config-sample-rate"><option value="0">DEVICE DEFAULT</option><option value="44100">44100 HZ</option><option value="48000">48000 HZ</option><option value="88200">88200 HZ</option><option value="96000">96000 HZ</option></select></label>
          <label class="config-row" data-config-key="latencyMode"><span>LATENCY MODE</span><select id="config-latency-mode"><option value="interactive">INTERACTIVE</option><option value="balanced">BALANCED</option><option value="playback">PLAYBACK</option></select></label>
          <label class="config-row" data-config-key="outputLevel"><span>OUTPUT LEVEL</span><span><input id="config-output-level" type="range" min="0" max="200" step="1" value="100" aria-label="Output level" /> <span id="config-output-level-value">100%</span></span></label>
          <div class="config-info-row"><span>ACTIVE FORMAT</span><span id="config-audio-format">--</span></div>
          <div class="config-info-row"><span>LATENCY</span><span id="config-audio-latency">--</span></div>
        </div>
        <div class="system-subtitle">INTERFACE</div>
        <div class="config-grid">
          <label class="config-row" data-config-key="vars"><span>VARIABLE INSPECTOR</span><input id="config-vars" type="checkbox" /></label>
          <label class="config-row" data-config-key="metrics"><span>METRICS PANEL</span><input id="config-metrics" type="checkbox" /></label>
          <label class="config-row" data-config-key="assets"><span>ASSETS PANEL</span><input id="config-assets" type="checkbox" /></label>
          <label class="config-row" data-config-key="dsp"><span>DSP STATUS</span><input id="config-dsp" type="checkbox" /></label>
          <label class="config-row" data-config-key="liveRate"><span>LIVE CONTROL RATE</span><select id="config-live-rate"><option value="60">60 HZ</option><option value="30">30 HZ</option><option value="20">20 HZ</option><option value="15">15 HZ</option></select></label>
          <label class="config-row" data-config-key="objectShortcut"><span>OBJECT TOGGLE KEY</span><input id="config-object-shortcut" type="text" maxlength="1" size="2" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Object toggle shortcut key" /></label>
          <label class="config-row" data-config-key="schemeShortcut"><span>SCHEME TOGGLE KEY</span><input id="config-scheme-shortcut" type="text" maxlength="1" size="2" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Scheme toggle shortcut key" /></label>
        </div>
        <div class="system-copy muted">↑ ↓ SELECT &nbsp; ← → CHANGE &nbsp; ENTER TOGGLE / SELECT</div>
        <div class="system-copy muted">OUTPUT LEVEL APPLIES IMMEDIATELY · DEVICE, SAMPLE RATE OR LATENCY MODE CHANGES REQUIRE ENGINE RESTART</div>
        <div class="system-copy muted">ESC  RETURN TO CODE</div>
      </div>

      <div id="about-screen" class="screen system-screen hidden" aria-hidden="true">
        <div class="system-title">ABOUT SONUS UMBRAE</div>
        <div class="rule"></div>
        <div class="about-copy">A LIVE CODING LANGUAGE AND ENVIRONMENT FOR GENERATIVE AUDIO, MODULATION, SYNTHESIS AND SIGNAL ROUTING.</div>
        <div class="about-grid">
          <span>VERSION</span><span>${VERSION}</span>
          <span>RUNTIME</span><span>TYPESCRIPT · WEB AUDIO · AUDIOWORKLET · WASM</span>
          <span>DSP</span><span>MULTIPLE PERMISSIVELY-LICENSED ENGINES AND NATIVE SONUS COMPONENTS</span>
          <span>LICENSES</span><span>SEE THIRD_PARTY_LICENSES.md AND THIRD_PARTY_NOTICES.md</span>
          <span>LANGUAGE</span><span>SEE docs/LANGUAGE.md</span>
          <span>COPYRIGHT</span><span>(C) 2026 Alessandro Capano</span>
          <span>GITHUB</span><span><a class="about-link" href="https://github.com/alexain/sonus-umbrae" target="_blank" rel="noreferrer">github.com/alexain/sonus-umbrae</a></span>
        </div>
        <div class="system-copy muted">ESC  RETURN TO CODE</div>
      </div>

      <div id="help-screen" class="screen system-screen hidden" aria-hidden="true">
        <div class="system-title">COMMANDS</div>
        <div class="rule"></div>
        <div class="help-grid">
          <span>&gt;CONFIG</span><span>OPEN CONFIGURATION</span>
          <span>&gt;HELP</span><span>SHOW THIS SCREEN</span>
          <span>&gt;ABOUT</span><span>ABOUT SONUS UMBRAE</span>
          <span>&gt;SCHEME</span><span>SHOW READ-ONLY SIGNAL SCHEME</span>
          <span>ESC</span><span>OPEN QUICK MENU</span>
          <span>&gt;</span><span>OPEN COMMAND PROMPT</span>
          <span>TAB / SHIFT+TAB</span><span>INDENT / DEDENT</span>
          <span id="help-object-shortcut">CMD/CTRL+\\</span><span>TOGGLE CURRENT OBJECT</span>
          <span id="help-scheme-shortcut">CMD/CTRL+1</span><span>TOGGLE LIVE / SCHEME</span>
          <span>CMD/CTRL+/</span><span>COMMENT / UNCOMMENT LINE(S)</span>
          <span>CMD/CTRL+↑ / ↓</span><span>PREVIOUS / NEXT OBJECT</span>
          <span>&gt;SAVE</span><span>SAVE SOURCE FILE</span>
          <span>&gt;LOAD</span><span>LOAD SOURCE FILE</span>
          <span>&gt;NEW</span><span>CLEAR SOURCE</span>
          <span>&gt;CLEAR</span><span>CLEAR SOURCE</span>
          <span>&gt;START</span><span>START / RESUME AUDIO ENGINE</span>
          <span>&gt;STOP</span><span>SUSPEND AUDIO ENGINE</span>
          <span>&gt;RUN</span><span>START / RELOAD LIVE CODE</span>
          <span>&gt;RUN STOP</span><span>STOP TRANSPORT / KEEP FX TAILS</span>
          <span>&gt;TEST 440</span><span>PLAY DIAGNOSTIC SINE TONE</span>
          <span>&gt;TEST STOP</span><span>STOP DIAGNOSTIC TONE</span>
          <span>&gt;CLOCK START</span><span>START MASTER CLOCK TRANSPORT</span>
          <span>&gt;CLOCK STOP</span><span>STOP MASTER CLOCK TRANSPORT</span>
          <span>&gt;PANIC</span><span>STOP CURRENT AUDIO IMMEDIATELY</span>
          <span>ENTER</span><span>INSERT NEW LINE</span>
          <span>CMD/CTRL+ENTER</span><span>RECOMPILE / START LIVE CODE</span>
          <span>CMD/CTRL+BACKSPACE</span><span>STOP TRANSPORT / KEEP FX TAILS</span>
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
        <div id="scheme-hints" class="scheme-hints">ESC / CMD/CTRL+1&nbsp;&nbsp;LIVE</div>
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

      <div id="capability-restart-overlay" class="capability-restart-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="capability-restart-title">
        <div class="capability-restart-card">
          <div id="capability-restart-title" class="audio-start-title">RUNTIME USE CHANGED</div>
          <div class="rule"></div>
          <div class="system-copy">CHANGING USE RESTARTS THE SONUS RUNTIME AND MAY INTERRUPT AUDIO BRIEFLY.</div>
          <div class="capability-diff"><span>CURRENT</span><code id="capability-current">NONE</code><span>NEW</span><code id="capability-next">NONE</code></div>
          <div class="capability-actions"><button id="capability-cancel" class="audio-start-button" type="button">CANCEL</button><button id="capability-apply" class="audio-start-button" type="button">RESTART AND APPLY</button></div>
        </div>
      </div>

      <div id="quick-menu-overlay" class="quick-menu-overlay hidden" role="dialog" aria-modal="true" aria-label="Quick menu">
        <div class="quick-menu-card">
          <div class="audio-start-title">QUICK MENU</div>
          <div class="rule"></div>
          <div class="quick-menu-grid">
            <span>C</span><span>CONFIG</span>
            <span>A</span><span>ABOUT</span>
            <span>S</span><span>SAVE SCRIPT / PROJECT</span>
            <span>L</span><span>LOAD SCRIPT / PROJECT</span>
            <span>R</span><span>RESTART ENGINE</span>
            <span>N</span><span>NEW PROJECT</span>
          </div>
          <div class="system-copy muted">ESC  CLOSE &nbsp;&nbsp; &gt;  COMMAND PROMPT</div>
        </div>
      </div>

      <div id="audio-config-restart-overlay" class="capability-restart-overlay hidden" role="dialog" aria-modal="true" aria-label="Restart audio engine">
        <div class="capability-restart-card">
          <div class="audio-start-title">AUDIO CONFIGURATION CHANGED</div>
          <div class="rule"></div>
          <div class="system-copy">OUTPUT DEVICE, SAMPLE RATE OR LATENCY MODE CHANGES REQUIRE RESTARTING THE AUDIO ENGINE.</div>
          <div class="capability-diff"><span>CURRENT</span><code id="audio-config-current">--</code><span>NEW</span><code id="audio-config-next">--</code></div>
          <div class="capability-actions"><button id="audio-config-cancel" class="audio-start-button" type="button">CANCEL</button><button id="audio-config-apply" class="audio-start-button" type="button">RESTART AND APPLY</button></div>
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
      <span class="prompt">&gt;</span>
      <input id="command" class="command" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Command" />
    </footer>
  </main>
`;

const inlineViewStyle = document.createElement('style');
inlineViewStyle.textContent = `
  .editor-stack { position: relative; }
  .inline-view-layer { display: none; }
  .live-control-layer {
    position: absolute;
    inset: 0;
    z-index: 3;
    pointer-events: none;
    overflow: hidden;
  }
  .live-parameter-control {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 3px;
    height: 1.08em;
    pointer-events: auto;
  }
  .live-parameter-control input[type=range] {
    -webkit-appearance: none;
    appearance: none;
    width: 84px;
    height: 14px;
    margin: 0 0 0 2px;
    background: linear-gradient(to right, rgb(224 228 236 / .9), rgb(224 228 236 / .9)) center / 100% 3px no-repeat;
    cursor: ew-resize;
  }
  .live-parameter-control input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 17px;
    height: 17px;
    border-radius: 50%;
    border: 2px solid rgb(236 239 246);
    background: rgb(69 70 79);
    box-shadow: 0 0 4px rgb(112 224 213 / .25);
  }
  .live-parameter-control input[type=range]::-moz-range-track {
    height: 3px;
    border: 0;
    background: rgb(224 228 236 / .9);
  }
  .live-parameter-control input[type=range]::-moz-range-thumb {
    width: 15px;
    height: 15px;
    border-radius: 50%;
    border: 2px solid rgb(236 239 246);
    background: rgb(69 70 79);
    box-shadow: 0 0 4px rgb(112 224 213 / .25);
  }
  .live-parameter-value {
    min-width: 1.8em;
    font-size: 10px;
    line-height: 1;
    text-align: right;
    color: rgb(112 226 223);
    text-shadow: 0 0 3px rgb(112 226 223 / .35);
  }

  .line-number {
    position: relative;
  }
  .object-toggle-led {
    position: absolute;
    left: 1px;
    top: 50%;
    width: 16px;
    height: 16px;
    padding: 0;
    border: 0;
    background: transparent;
    transform: translateY(-50%);
    cursor: pointer;
    color: rgb(112 226 223);
    z-index: 2;
  }
  .object-toggle-led::before {
    content: '';
    display: block;
    width: 7px;
    height: 7px;
    margin: 4.5px;
    border: 1px solid currentColor;
    border-radius: 50%;
    box-sizing: border-box;
    background: currentColor;
    box-shadow: 0 0 5px rgb(112 226 223 / .65);
  }
  .object-toggle-led.disabled {
    color: rgb(148 150 158);
  }
  .object-toggle-led.disabled::before {
    background: transparent;
    box-shadow: none;
  }
  .object-toggle-led:hover::before,
  .object-toggle-led:focus-visible::before {
    box-shadow: 0 0 8px currentColor;
  }
  .object-toggle-led:focus {
    outline: none;
  }
  .line-number.collapsible {
    cursor: pointer;
  }
  .line-number.collapsible:hover .object-fold-arrow {
    opacity: 1;
  }
  .line-number-label {
    position: relative;
  }
  .object-fold-arrow {
    position: absolute;
    left: 100%;
    top: 50%;
    margin-left: -1px;
    padding: 5px 6px;
    font-size: .62em;
    line-height: 1;
    transform: translateY(-50%);
    opacity: .62;
    color: rgb(176 180 190);
    cursor: pointer;
  }
  .syntax-fold-placeholder {
    opacity: .34;
    letter-spacing: .08em;
  }

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
const liveControlLayer = must<HTMLElement>('live-control-layer');
const lineGutterContent = must<HTMLElement>('line-gutter-content');
const commandbar = must<HTMLElement>('commandbar');
const command = must<HTMLInputElement>('command');
const liveScreen = must<HTMLElement>('live-screen');
const configScreen = must<HTMLElement>('config-screen');
const helpScreen = must<HTMLElement>('help-screen');
const aboutScreen = must<HTMLElement>('about-screen');
const schemeScreen = must<HTMLElement>('scheme-screen');
const schemeViewport = must<HTMLElement>('scheme-viewport');
const schemeWorld = must<HTMLElement>('scheme-world');
const schemeEdges = must<SVGSVGElement>('scheme-edges');
const schemeNodes = must<HTMLElement>('scheme-nodes');
const schemeHints = must<HTMLElement>('scheme-hints');
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
const configVars = must<HTMLInputElement>('config-vars');
const configMetrics = must<HTMLInputElement>('config-metrics');
const configAssets = must<HTMLInputElement>('config-assets');
const configDsp = must<HTMLInputElement>('config-dsp');
const configLiveRate = must<HTMLSelectElement>('config-live-rate');
const configObjectShortcut = must<HTMLInputElement>('config-object-shortcut');
const configSchemeShortcut = must<HTMLInputElement>('config-scheme-shortcut');
const helpObjectShortcut = must<HTMLElement>('help-object-shortcut');
const helpSchemeShortcut = must<HTMLElement>('help-scheme-shortcut');
const configOutput = must<HTMLSelectElement>('config-output');
const configSampleRate = must<HTMLSelectElement>('config-sample-rate');
const configLatencyMode = must<HTMLSelectElement>('config-latency-mode');
const configOutputLevel = must<HTMLInputElement>('config-output-level');
const configOutputLevelValue = must<HTMLElement>('config-output-level-value');
const configAudioFormat = must<HTMLElement>('config-audio-format');
const configAudioLatency = must<HTMLElement>('config-audio-latency');
const quickMenuOverlay = must<HTMLElement>('quick-menu-overlay');
const audioConfigRestartOverlay = must<HTMLElement>('audio-config-restart-overlay');
const audioConfigCurrent = must<HTMLElement>('audio-config-current');
const audioConfigNext = must<HTMLElement>('audio-config-next');
const audioConfigCancel = must<HTMLButtonElement>('audio-config-cancel');
const audioConfigApply = must<HTMLButtonElement>('audio-config-apply');
const capabilityRestartOverlay = must<HTMLElement>('capability-restart-overlay');
const capabilityCurrent = must<HTMLElement>('capability-current');
const capabilityNext = must<HTMLElement>('capability-next');
const capabilityCancel = must<HTMLButtonElement>('capability-cancel');
const capabilityApply = must<HTMLButtonElement>('capability-apply');

const audioEngine = new AudioEngine();
const runtime = new SonusRuntime(audioEngine);
const assetLibrary = new AssetLibrary({
  maxDecodedBytes: 256 * 1024 * 1024,
  onChange: () => syncViews(),
  onMessage: (text) => notify(text),
  onSampleReady: (asset) => audioEngine.registerDrumSample({
    alias: asset.alias,
    sampleRate: asset.sampleRate,
    channels: asset.pcmChannels,
  }),
  onSampleRemoved: (alias) => audioEngine.unregisterDrumSample(alias),
});

function compileSource(source: string): string {
  return compileLanguageSource(source, {
    hasSampleAsset: (alias) => assetLibrary.getByAlias(alias) !== undefined,
  });
}

let screen: Screen = 'live';
let commandMode = false;
let messageTimer = 0;
let previewTimer = 0;
let scopeFrame = 0;
let inlineViewFrame = 0;
let inlineViewLastPaint = 0;
let liveControlRefreshMs = 16;
let liveControlCommitTimer = 0;
let liveControlRuntimeTimer = 0;
let pendingLiveControlRuntimeUpdate: { kind: string; name: string; property: string; value: number } | null = null;
let savedEditorSelection: { start: number; end: number; direction: 'forward' | 'backward' | 'none' } | null = null;
let audioAutoStartPending = true;
let codeRunning = false;
let editingInlineViews: InlineViewState[] | null = null;
let pendingLiveUpdate: { compiled: string; hasMasterClock: boolean } | null = null;
let pendingLiveUpdateUnsubscribe: (() => void) | null = null;
let diagnosticLines = new Set<number>();
const CONFIG_STATE_KEY = 'sonus-umbrae.config';
type SampleRateChoice = 0 | 44100 | 48000 | 88200 | 96000;
type AppConfig = {
  showVariables: boolean;
  showMetrics: boolean;
  showAssets: boolean;
  showDspStatus: boolean;
  liveControlHz: 60 | 30 | 20 | 15;
  sampleRate: SampleRateChoice;
  outputDeviceId: string;
  latencyMode: AudioLatencyMode;
  outputLevel: number;
  objectToggleKey: string;
  schemeToggleKey: string;
};
let appConfig: AppConfig = {
  showVariables: false,
  showMetrics: false,
  showAssets: false,
  showDspStatus: true,
  liveControlHz: 60,
  sampleRate: 0,
  outputDeviceId: '',
  latencyMode: 'interactive',
  outputLevel: 100,
  objectToggleKey: '\\',
  schemeToggleKey: '1',
};
let configSelectionIndex = 0;
let pendingAudioConfig: { sampleRate: SampleRateChoice; outputDeviceId: string; latencyMode: AudioLatencyMode } | null = null;
let activeTuningHz = 440;
let activeCapabilities = new Set<ProgramCapability>();
let activeUseDirective: string | null = null;
let pendingCapabilityRestart: { source: string; capabilities: Set<ProgramCapability>; tuningHz: number; directive: string | null } | null = null;

const PANEL_STATE_KEY = 'sonus-umbrae.monitor-panels';
const panelCollapsed = new Map<string, boolean>();
const panelExplicitState = new Set<string>();
let panelOrder: string[] = [];
let draggedPanelId: string | null = null;
let clockWasActive = false;
let lastCaretTrailPosition: { left: number; top: number } | null = null;

loadPanelState();
loadAppConfig();
audioEngine.setPreferredAudioConfiguration({
  sampleRate: appConfig.sampleRate === 0 ? null : appConfig.sampleRate,
  outputDeviceId: appConfig.outputDeviceId || null,
  latencyMode: appConfig.latencyMode,
});
audioEngine.setHardwareOutputLevel(appConfig.outputLevel);
applyAppConfig();


function normalizeShortcutKey(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const characters = Array.from(value.trim());
  if (characters.length !== 1 || characters[0] === '/') return fallback;
  const key = characters[0];
  return /^[A-Z]$/i.test(key) ? key.toLowerCase() : key;
}

function shortcutMatches(event: KeyboardEvent, configuredKey: string): boolean {
  const eventKey = /^[A-Z]$/i.test(event.key) ? event.key.toLowerCase() : event.key;
  const targetKey = /^[A-Z]$/i.test(configuredKey) ? configuredKey.toLowerCase() : configuredKey;
  return eventKey === targetKey;
}

function loadAppConfig(): void {
  try {
    const raw = localStorage.getItem(CONFIG_STATE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    const hz = parsed.liveControlHz;
    appConfig = {
      showVariables: parsed.showVariables ?? false,
      showMetrics: parsed.showMetrics ?? false,
      showAssets: parsed.showAssets ?? false,
      showDspStatus: parsed.showDspStatus ?? true,
      liveControlHz: hz === 30 || hz === 20 || hz === 15 ? hz : 60,
      sampleRate: parsed.sampleRate === 44100 || parsed.sampleRate === 48000 || parsed.sampleRate === 88200 || parsed.sampleRate === 96000 ? parsed.sampleRate : 0,
      outputDeviceId: typeof parsed.outputDeviceId === 'string' ? parsed.outputDeviceId : '',
      latencyMode: parsed.latencyMode === 'balanced' || parsed.latencyMode === 'playback' ? parsed.latencyMode : 'interactive',
      outputLevel: Number.isFinite(parsed.outputLevel)
        ? Math.max(0, Math.min(200, Number(parsed.outputLevel)))
        : 100,
      objectToggleKey: normalizeShortcutKey(parsed.objectToggleKey, '\\'),
      // v2 briefly shipped '|' as the Scheme default. Migrate that default
      // because modifier handling varies across keyboard layouts/browsers.
      schemeToggleKey: normalizeShortcutKey(parsed.schemeToggleKey === '|' ? undefined : parsed.schemeToggleKey, '1'),
    };
  } catch {
    appConfig = { showVariables: false, showMetrics: false, showAssets: false, showDspStatus: true, liveControlHz: 60, sampleRate: 0, outputDeviceId: '', latencyMode: 'interactive', outputLevel: 100, objectToggleKey: '\\', schemeToggleKey: '1' };
  }
}

function saveAppConfig(): void {
  localStorage.setItem(CONFIG_STATE_KEY, JSON.stringify(appConfig));
}

function applyAppConfig(): void {
  configVars.checked = appConfig.showVariables;
  configMetrics.checked = appConfig.showMetrics;
  configAssets.checked = appConfig.showAssets;
  configDsp.checked = appConfig.showDspStatus;
  configLiveRate.value = String(appConfig.liveControlHz);
  configObjectShortcut.value = appConfig.objectToggleKey;
  configSchemeShortcut.value = appConfig.schemeToggleKey;
  helpObjectShortcut.textContent = `CMD/CTRL+${appConfig.objectToggleKey}`;
  helpSchemeShortcut.textContent = `CMD/CTRL+${appConfig.schemeToggleKey}`;
  schemeHints.textContent = `ESC / CMD/CTRL+${appConfig.schemeToggleKey}  LIVE`;
  configSampleRate.value = String(appConfig.sampleRate);
  configOutput.value = appConfig.outputDeviceId;
  configLatencyMode.value = appConfig.latencyMode;
  configOutputLevel.value = String(appConfig.outputLevel);
  configOutputLevelValue.textContent = `${Math.round(appConfig.outputLevel)}%`;
  audioEngine.setHardwareOutputLevel(appConfig.outputLevel);
  dspStatus.closest('.status-item')?.classList.toggle('hidden', !appConfig.showDspStatus);
  liveControlRefreshMs = Math.round(1000 / appConfig.liveControlHz);
  syncViews();
}

function commitShortcutKey(kind: 'object' | 'scheme', rawValue: string): void {
  const fallback = kind === 'object' ? appConfig.objectToggleKey : appConfig.schemeToggleKey;
  const input = kind === 'object' ? configObjectShortcut : configSchemeShortcut;
  const rawCharacters = Array.from(rawValue.trim());
  if (rawCharacters.length !== 1 || rawCharacters[0] === '/') {
    input.value = fallback;
    notify(rawCharacters[0] === '/' ? 'cmd/ctrl+/ is reserved for comments' : 'shortcut key must be one character');
    return;
  }
  const normalized = normalizeShortcutKey(rawCharacters[0], fallback);
  const other = kind === 'object' ? appConfig.schemeToggleKey : appConfig.objectToggleKey;
  if (normalized === other) {
    input.value = fallback;
    notify('shortcut conflict');
    return;
  }
  if (kind === 'object') appConfig.objectToggleKey = normalized;
  else appConfig.schemeToggleKey = normalized;
  input.value = normalized;
  saveAppConfig();
  applyAppConfig();
}

function configRows(): HTMLElement[] {
  return [...configScreen.querySelectorAll<HTMLElement>('.config-row[data-config-key]')];
}

function updateConfigSelection(): void {
  const rows = configRows();
  if (rows.length === 0) return;
  configSelectionIndex = Math.max(0, Math.min(rows.length - 1, configSelectionIndex));
  rows.forEach((row, index) => row.classList.toggle('selected', index === configSelectionIndex));
  rows[configSelectionIndex].scrollIntoView({ block: 'nearest' });
}

function cycleSelect(select: HTMLSelectElement, direction: -1 | 1): void {
  if (select.options.length === 0 || select.disabled) return;
  const index = Math.max(0, select.selectedIndex);
  const next = (index + direction + select.options.length) % select.options.length;
  select.selectedIndex = next;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function activateConfigRow(direction: -1 | 0 | 1): void {
  const row = configRows()[configSelectionIndex];
  if (!row) return;
  const control = row.querySelector<HTMLInputElement | HTMLSelectElement>('input, select');
  if (!control || control.disabled) return;
  if (control instanceof HTMLInputElement && control.type === 'checkbox') {
    control.checked = direction === 0 ? !control.checked : direction > 0;
    control.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (control instanceof HTMLInputElement && control.type === 'text') {
    if (direction === 0) { control.focus(); control.select(); }
  } else if (control instanceof HTMLInputElement && control.type === 'range') {
    if (direction === 0) return;
    const step = Number(control.step || '1') || 1;
    const min = Number(control.min || '0');
    const max = Number(control.max || '100');
    control.value = String(Math.max(min, Math.min(max, Number(control.value) + direction * step)));
    control.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (control instanceof HTMLSelectElement) {
    cycleSelect(control, direction === 0 ? 1 : direction);
  }
}

async function refreshAudioConfigUi(): Promise<void> {
  const snapshot = audioEngine.getAudioConfiguration();
  const effective = snapshot.effectiveSampleRate;
  configAudioFormat.textContent = effective ? `${effective} HZ · WEB AUDIO FLOAT` : 'ENGINE NOT STARTED';
  const latencies = [
    snapshot.baseLatencyMs === null ? null : `BASE ${snapshot.baseLatencyMs.toFixed(1)} MS`,
    snapshot.outputLatencyMs === null ? null : `OUTPUT ${snapshot.outputLatencyMs.toFixed(1)} MS`,
  ].filter(Boolean);
  configAudioLatency.textContent = latencies.length > 0 ? latencies.join(' · ') : '--';

  const previous = configOutput.value || appConfig.outputDeviceId;
  configOutput.replaceChildren(new Option('SYSTEM DEFAULT', ''));
  try {
    const devices = await audioEngine.listOutputDevices();
    for (const device of devices) configOutput.add(new Option(device.label, device.deviceId));
    const known = [...configOutput.options].some((option) => option.value === previous);
    configOutput.value = known ? previous : '';
  } catch {
    configOutput.value = '';
  }
  const selectable = audioEngine.supportsOutputDeviceSelection();
  configOutput.disabled = !selectable;
  if (!selectable) configOutput.options[0].text = 'SYSTEM DEFAULT · BROWSER CONTROLLED';
  updateConfigSelection();
}

function formatAudioConfig(config: { sampleRate: SampleRateChoice; outputDeviceId: string; latencyMode: AudioLatencyMode }): string {
  const device = [...configOutput.options].find((option) => option.value === config.outputDeviceId)?.text ?? 'SYSTEM DEFAULT';
  const rate = config.sampleRate === 0 ? 'DEVICE DEFAULT' : `${config.sampleRate} HZ`;
  return `${device} · ${rate} · ${config.latencyMode.toUpperCase()}`;
}

function requestAudioConfigRestart(next: { sampleRate: SampleRateChoice; outputDeviceId: string; latencyMode: AudioLatencyMode }): void {
  if (next.sampleRate === appConfig.sampleRate && next.outputDeviceId === appConfig.outputDeviceId && next.latencyMode === appConfig.latencyMode) return;
  pendingAudioConfig = next;
  audioConfigCurrent.textContent = formatAudioConfig(appConfig);
  audioConfigNext.textContent = formatAudioConfig(next);
  audioConfigRestartOverlay.classList.remove('hidden');
  audioConfigApply.focus();
}

function cancelAudioConfigRestart(): void {
  pendingAudioConfig = null;
  configSampleRate.value = String(appConfig.sampleRate);
  configOutput.value = appConfig.outputDeviceId;
  configLatencyMode.value = appConfig.latencyMode;
  audioConfigRestartOverlay.classList.add('hidden');
  notify('audio configuration unchanged');
}

async function restartEngineWithConfig(next = { sampleRate: appConfig.sampleRate, outputDeviceId: appConfig.outputDeviceId, latencyMode: appConfig.latencyMode }): Promise<void> {
  const source = sourceText();
  const shouldRun = codeRunning;
  const compiled = source.trim() ? compileSource(source) : '';
  runtime.stopExecution({ preserveTails: false });
  audioEngine.setClockTransport(false);
  setCodeRunning(false);
  await audioEngine.restartAudioConfiguration({
    sampleRate: next.sampleRate === 0 ? null : next.sampleRate,
    outputDeviceId: next.outputDeviceId || null,
    latencyMode: next.latencyMode,
  });
  await audioEngine.start();
  if (source.trim()) {
    const hasMasterClock = /^\s*_?CLOCK\s+SET\b/im.test(source);
    audioEngine.setClockTransport(hasMasterClock);
    runtime.evaluate(compiled, shouldRun ? undefined : { applyAudio: false });
  } else runtime.evaluate('');
  if (shouldRun) setCodeRunning(true);
  syncViews();
  await refreshAudioConfigUi();
}

async function applyAudioConfigRestart(): Promise<void> {
  const next = pendingAudioConfig;
  if (!next) return;
  audioConfigApply.disabled = true;
  audioConfigCancel.disabled = true;
  try {
    await restartEngineWithConfig(next);
    appConfig.sampleRate = next.sampleRate;
    appConfig.outputDeviceId = next.outputDeviceId;
    appConfig.latencyMode = next.latencyMode;
    saveAppConfig();
    pendingAudioConfig = null;
    audioConfigRestartOverlay.classList.add('hidden');
    notify('audio engine restarted');
  } catch (error) {
    notify(error instanceof Error ? error.message : 'audio restart failed');
    configSampleRate.value = String(appConfig.sampleRate);
    configOutput.value = appConfig.outputDeviceId;
    configLatencyMode.value = appConfig.latencyMode;
  } finally {
    audioConfigApply.disabled = false;
    audioConfigCancel.disabled = false;
  }
}

function openQuickMenu(): void {
  if (screen !== 'live' || commandMode) return;
  quickMenuOverlay.classList.remove('hidden');
}

function closeQuickMenu(): void {
  quickMenuOverlay.classList.add('hidden');
  editor.focus();
  requestAnimationFrame(positionBlockCaret);
}

async function runQuickMenuAction(key: string): Promise<void> {
  closeQuickMenu();
  switch (key.toLowerCase()) {
    case 'c': showScreen('config'); await refreshAudioConfigUi(); return;
    case 'a': showScreen('about'); return;
    case 's': await saveSource(); return;
    case 'l': await loadSource(); return;
    case 'r':
      try { await restartEngineWithConfig(); notify('audio engine restarted'); }
      catch (error) { notify(error instanceof Error ? error.message : 'audio restart failed'); }
      return;
    case 'n':
      setSourceText('');
      runtime.evaluate('');
      setCodeRunning(false);
      activeCapabilities = new Set();
      activeTuningHz = 440;
      activeUseDirective = null;
      syncViews();
      notify('new project');
      return;
  }
}

function capabilityKey(capabilities: ReadonlySet<ProgramCapability>): string {
  return [...capabilities].sort().join(',');
}

function formatCapabilities(capabilities: ReadonlySet<ProgramCapability>): string {
  const names = [...capabilities].sort();
  return names.length > 0 ? `USE ${names.join(', ')}` : 'NO USE';
}

function capabilitySetChanged(next: ReadonlySet<ProgramCapability>, tuningHz: number): boolean {
  return capabilityKey(next) !== capabilityKey(activeCapabilities) || Math.abs(tuningHz - activeTuningHz) > 0.0001;
}

function rememberActiveCapabilities(source: string): void {
  const parsed = parseProgramCapabilities(source);
  activeCapabilities = new Set(parsed.capabilities);
  activeTuningHz = parsed.tuningHz;
  activeUseDirective = parsed.directiveText;
}

function requestCapabilityRestart(source: string): boolean {
  const parsed = parseProgramCapabilities(source);
  if (!capabilitySetChanged(parsed.capabilities, parsed.tuningHz)) return false;
  pendingCapabilityRestart = {
    source,
    capabilities: new Set(parsed.capabilities),
    tuningHz: parsed.tuningHz,
    directive: parsed.directiveText,
  };
  capabilityCurrent.textContent = `${formatCapabilities(activeCapabilities)} · A4 ${activeTuningHz}Hz`;
  capabilityNext.textContent = `${formatCapabilities(parsed.capabilities)} · A4 ${parsed.tuningHz}Hz`;
  capabilityRestartOverlay.classList.remove('hidden');
  capabilityApply.focus();
  return true;
}

function replaceUseDirective(source: string, directive: string | null): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const useIndex = lines.findIndex((line) => /^\s*USE\b/i.test(line.replace(/\/\/.*$/, '').trim()));
  if (useIndex >= 0) {
    if (directive) lines[useIndex] = directive;
    else lines.splice(useIndex, 1);
    return lines.join('\n');
  }
  if (!directive) return lines.join('\n');
  let insertAt = 0;
  while (insertAt < lines.length) {
    const trimmed = lines[insertAt].trim();
    if (!trimmed || trimmed.startsWith('//')) { insertAt += 1; continue; }
    break;
  }
  lines.splice(insertAt, 0, directive);
  return lines.join('\n');
}

function cancelCapabilityRestart(): void {
  if (!pendingCapabilityRestart) return;
  const restored = replaceUseDirective(editor.value, activeUseDirective);
  setSourceText(restored);
  pendingCapabilityRestart = null;
  capabilityRestartOverlay.classList.add('hidden');
  notify('capability change cancelled');
}

async function applyCapabilityRestart(): Promise<void> {
  const pending = pendingCapabilityRestart;
  if (!pending) return;
  capabilityApply.disabled = true;
  capabilityCancel.disabled = true;
  try {
    clearDiagnostic();
    const compiled = pending.source.trim() ? compileSource(pending.source) : '';
    runtime.stopExecution({ preserveTails: false });
    audioEngine.setClockTransport(false);
    setCodeRunning(false);

    // Capability modules are intentionally a no-op in 0.2.x. This is the
    // lifecycle hook where future USE backends (visual, MIDI, audio input,
    // OSC) are dynamically loaded/unloaded before the program is rebuilt.
    await Promise.resolve();

    const hasMasterClock = /^\s*_?CLOCK\s+SET\b/im.test(pending.source);
    audioEngine.setClockTransport(hasMasterClock);
    runtime.evaluate(compiled);
    rememberActiveCapabilities(pending.source);
    setCodeRunning(true);
    syncViews();
    notify('runtime restarted · capabilities applied');
    pendingCapabilityRestart = null;
    capabilityRestartOverlay.classList.add('hidden');
  } catch (error) {
    if (error instanceof LanguageError || error instanceof SonusEvaluationError) showDiagnostics(error.diagnostics);
    else notify(error instanceof Error ? error.message : 'runtime restart failed');
  } finally {
    capabilityApply.disabled = false;
    capabilityCancel.disabled = false;
  }
}

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
  aboutScreen.classList.toggle('hidden', next !== 'about');
  schemeScreen.classList.toggle('hidden', next !== 'scheme');
  liveScreen.setAttribute('aria-hidden', String(next !== 'live'));
  configScreen.setAttribute('aria-hidden', String(next !== 'config'));
  helpScreen.setAttribute('aria-hidden', String(next !== 'help'));
  aboutScreen.setAttribute('aria-hidden', String(next !== 'about'));
  schemeScreen.setAttribute('aria-hidden', String(next !== 'scheme'));
  if (next === 'scheme') renderScheme();
  if (next === 'config') { configSelectionIndex = 0; updateConfigSelection(); void refreshAudioConfigUi(); }
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
      /^(\s*)(_?)(use|voice|drumkit|fx|filter|seq|register|logic|set|clock|main)(?=\s|$)/gim,
      (_match, indentation: string, disabled: string, commandName: string) =>
        `${indentation}${disabled}${commandName.toUpperCase()}`,
    )
    .replace(
      /^(\s*)live(?=\s+[A-Za-z_]\w*\s+)/gim,
      (_match, indentation: string) => `${indentation}LIVE`,
    )
    .replace(
      /^(\s*)mod(?=\s+[A-Za-z_]\w*(?:\s+with\s+view(?:\s+\d+(?:\.\d+)?\s*[vx])?)?\s*:)/gim,
      (_match, indentation: string) => `${indentation}MOD`,
    )
    .replace(
      /^(\s+)model(?=\s)/gim,
      (_match, indentation: string) => `${indentation}model`,
    )
    .replace(
      /^(\s*OUT\b.*)$/gim,
      (line: string) => line
        .replace(/\bmain\b/gi, 'MAIN')
        .replace(/\.([lr])\b/gi, (_match, channel: string) => `.${channel.toUpperCase()}`),
    )
    .replace(
      /^(\s*(?:pitch\s+)?scale\s+)([a-g])([#b]?)(?=\s|$)/gim,
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

type CollapsedEditorBlock = { body: string };

const collapsedEditorBlocks = new Map<string, CollapsedEditorBlock>();
let nextCollapsedEditorBlockId = 1;

function foldMarkerId(line: string): string | null {
  const match = line.match(/^\s*\/\/~F(\d+)\s*$/);
  return match?.[1] ?? null;
}

type FoldMarkerRange = {
  start: number;
  end: number;
  headerEnd: number;
  nextLineStart: number | null;
};

function foldMarkerRanges(value = editor.value): FoldMarkerRange[] {
  const lines = value.split('\n');
  const ranges: FoldMarkerRange[] = [];
  let offset = 0;
  let previousLineStart = 0;
  let previousLineLength = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (foldMarkerId(line)) {
      const end = offset + line.length;
      ranges.push({
        start: offset,
        end,
        headerEnd: index > 0 ? previousLineStart + previousLineLength : offset,
        nextLineStart: index < lines.length - 1 ? end + 1 : null,
      });
    }
    previousLineStart = offset;
    previousLineLength = line.length;
    offset += line.length + 1;
  }
  return ranges;
}

function keepCaretOutOfFoldMarker(): boolean {
  if (document.activeElement !== editor || editor.selectionStart !== editor.selectionEnd) return false;
  const caret = editor.selectionStart;
  const marker = foldMarkerRanges().find((range) => caret >= range.start && caret <= range.end);
  if (!marker) return false;
  editor.setSelectionRange(marker.headerEnd, marker.headerEnd);
  return true;
}

function skipFoldMarkerWithArrow(direction: 'up' | 'down'): boolean {
  if (editor.selectionStart !== editor.selectionEnd) return false;
  const caret = editor.selectionStart;
  for (const marker of foldMarkerRanges()) {
    if (direction === 'down' && caret <= marker.headerEnd && caret >= editor.value.lastIndexOf('\n', Math.max(0, marker.headerEnd - 1)) + 1) {
      if (marker.nextLineStart === null) return true;
      editor.setSelectionRange(marker.nextLineStart, marker.nextLineStart);
      return true;
    }
    if (direction === 'up' && marker.nextLineStart !== null) {
      const nextLineEndAt = editor.value.indexOf('\n', marker.nextLineStart);
      const nextLineEnd = nextLineEndAt < 0 ? editor.value.length : nextLineEndAt;
      if (caret >= marker.nextLineStart && caret <= nextLineEnd) {
        editor.setSelectionRange(marker.headerEnd, marker.headerEnd);
        return true;
      }
    }
  }
  return false;
}

function protectFoldMarkerBoundary(key: 'Backspace' | 'Delete'): boolean {
  if (editor.selectionStart !== editor.selectionEnd) return false;
  const caret = editor.selectionStart;
  for (const marker of foldMarkerRanges()) {
    if (key === 'Delete' && caret === marker.headerEnd) return true;
    if (key === 'Backspace' && marker.nextLineStart !== null && caret === marker.nextLineStart) return true;
  }
  return false;
}

function expandFoldMarkers(value: string): string {
  let expanded = value;
  for (let pass = 0; pass < 64; pass += 1) {
    let changed = false;
    const lines = expanded.split('\n');
    const rebuilt: string[] = [];
    for (const line of lines) {
      const id = foldMarkerId(line);
      const block = id ? collapsedEditorBlocks.get(id) : undefined;
      if (!block) {
        rebuilt.push(line);
        continue;
      }
      changed = true;
      const body = block.body.endsWith('\n') ? block.body.slice(0, -1) : block.body;
      rebuilt.push(...body.split('\n'));
    }
    expanded = rebuilt.join('\n');
    if (!changed) break;
  }
  return expanded;
}

function sourceText(): string {
  return expandFoldMarkers(editor.value.replace(/\r\n/g, '\n'));
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
    syncLiveDisableSnapshot();
    renderSyntaxLayer();
    renderLineGutter();
    startInlineViewLoop();
  } else {
    editingInlineViews = null;
    clearInlineViews();
  }
}

function refreshStoppedPreview(): boolean {
  if (codeRunning) return false;

  try {
    const source = sourceText();
    const compiled = source.trim() ? compileSource(source) : '';
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

function cancelPendingLiveUpdate(): void {
  pendingLiveUpdate = null;
  pendingLiveUpdateUnsubscribe?.();
  pendingLiveUpdateUnsubscribe = null;
}

function applyPendingLiveUpdate(): void {
  const pending = pendingLiveUpdate;
  if (!pending) return;
  cancelPendingLiveUpdate();
  try {
    audioEngine.setClockTransport(pending.hasMasterClock);
    const results = runtime.evaluate(pending.compiled, { hotReload: true });
    editingInlineViews = null;
    syncLiveDisableSnapshot();
    clearDiagnostic();
    syncViews();
    notify(results.at(-1)?.message ? `updated · ${results.at(-1)!.message}` : 'updated');
  } catch (error) {
    if (error instanceof SonusEvaluationError) showDiagnostics(error.diagnostics);
    else notify(error instanceof Error ? error.message : 'live update failed');
    syncViews();
  }
}

function queueLiveUpdate(): boolean {
  try {
    clearDiagnostic();
    const source = sourceText();
    const compiled = source.trim() ? compileSource(source) : '';
    runtime.validate(compiled);
    const hasMasterClock = /^\s*_?CLOCK\s+SET\b/im.test(source);
    pendingLiveUpdate = { compiled, hasMasterClock };
    pendingLiveUpdateUnsubscribe?.();
    pendingLiveUpdateUnsubscribe = null;

    if (!audioEngine.getClockStatus().running) {
      applyPendingLiveUpdate();
      return true;
    }

    const unsubscribe = audioEngine.subscribeClockTrigger('Clock', () => {
      unsubscribe();
      if (pendingLiveUpdateUnsubscribe === unsubscribe) pendingLiveUpdateUnsubscribe = null;
      applyPendingLiveUpdate();
    });
    pendingLiveUpdateUnsubscribe = unsubscribe;
    notify('update pending · next beat');
    return true;
  } catch (error) {
    if (error instanceof LanguageError) showDiagnostics(error.diagnostics);
    else if (error instanceof SonusEvaluationError) showDiagnostics(error.diagnostics);
    else notify(error instanceof Error ? error.message : 'evaluation failed');
    syncViews();
    return false;
  }
}

function recompileLiveCode(): boolean {
  window.clearTimeout(previewTimer);
  previewTimer = 0;
  if (codeRunning) {
    try { if (requestCapabilityRestart(sourceText())) return false; }
    catch (error) { if (error instanceof LanguageError) showDiagnostics(error.diagnostics); return false; }
    return queueLiveUpdate();
  }
  const applied = evaluateLiveSource();
  if (applied) {
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
      rememberActiveCapabilities(source);
      syncViews();
      notify('ok');
      return true;
    }

    if (requestCapabilityRestart(source)) return false;
    const compiled = compileSource(source);
    const hasMasterClock = /^\s*_?CLOCK\s+SET\b/im.test(source);
    // Build all scheduler jobs while transport is stopped, then start the
    // musical epoch. Starting the clock before runtime.evaluate() can emit the
    // first beat before DRUMKIT/SEQ jobs have subscribed, shifting patterns by
    // one beat after Cmd/Ctrl+Backspace.
    audioEngine.setClockTransport(false);
    runtime.restartMusicalEpoch();
    const results = runtime.evaluate(compiled);
    audioEngine.setClockTransport(hasMasterClock);
    rememberActiveCapabilities(source);
    editingInlineViews = null;
    syncLiveDisableSnapshot(source);
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

type ModuleViewScale =
  | { mode: 'default' }
  | { mode: 'volts'; value: number }
  | { mode: 'zoom'; value: number };

function parseModuleViewScales(source: string): Map<string, ModuleViewScale> {
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

function isDicesSignal(signal: string): boolean {
  return /\.(?:x1|x2|x3|y)$/i.test(signal);
}

function naturalScopeRange(signals: readonly string[]): number {
  return signals.some(isDicesSignal) ? 5 : 1;
}

function effectiveScopeRange(signals: readonly string[], scale: ModuleViewScale | undefined): number {
  const natural = naturalScopeRange(signals);
  if (!scale || scale.mode === 'default') return natural;
  if (scale.mode === 'volts') return Math.max(0.0001, scale.value);
  return Math.max(0.0001, natural / scale.value);
}

function scopeScaleLabel(signals: readonly string[], scale: ModuleViewScale | undefined): string {
  const range = effectiveScopeRange(signals, scale);
  if (signals.some(isDicesSignal) || scale?.mode === 'volts') {
    return `±${Number.isInteger(range) ? range : Number(range.toFixed(2))}V`;
  }
  if (scale?.mode === 'zoom') return `${scale.value}X`;
  return '';
}

function syncViews(): void {
  const signalViews = new Map(audioEngine.getViewSignals().map((view) => [view.signal, view.kind]));
  const explicitSignals = new Set(runtime.getExplicitSignalViews().map((view) => view.signal));
  const moduleViews = new Set(runtime.getModuleViews());
  const parameterViews = new Map(runtime.getParameterViews().map((view) => [view.signal, view]));
  const variables = runtime.getVariableViews();
  const turingViews = runtime.getTuringViews();
  const lifeViews = runtime.getLifeViews();
  const constellationViews = runtime.getConstellationViews();
  const snakeViews = runtime.getSnakeViews();
  const logicViews = runtime.getLogicViews();
  const drumkitViews = runtime.getDrumkitViews();
  const scheme = runtime.getSchemeModel();
  const nodes = new Map(scheme.nodes.map((node) => [node.id, node]));
  const moduleViewScales = parseModuleViewScales(sourceText());
  const panels: HTMLElement[] = [];

  if (appConfig.showVariables) panels.push(buildVariablesPanel(variables));
  if (appConfig.showMetrics) panels.push(buildMetricsPanel(scheme, variables.length));
  if (appConfig.showAssets) panels.push(assetLibrary.buildPanel(createMonitorCard));
  for (const view of turingViews) panels.push(buildTuringPanel(view));
  for (const view of lifeViews) panels.push(buildLifePanel(view));
  for (const view of constellationViews) panels.push(buildConstellationPanel(view));
  for (const view of snakeViews) panels.push(buildSnakePanel(view));
  for (const view of logicViews) panels.push(buildLogicPanel(view));
  for (const view of drumkitViews) panels.push(buildDrumkitPanel(view));

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

  const clockViewEnabled = /^\s*_?CLOCK\s+SET\b[^\n]*\bWITH\s+VIEW\b/im.test(sourceText());
  if (clockViewEnabled) {
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
  } else {
    clockWasActive = false;
  }

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
    const sampleView = moduleViews.has(node.id)
      ? node.views?.find((view) => view.display === 'sample')
      : undefined;
    const compositeSignals = moduleViews.has(node.id)
      ? node.views?.find((view) => (view.signals?.length ?? 0) > 0)?.signals ?? []
      : [];

    // User-created modules exist in VARIABLES and SCHEME automatically, but a
    // LIVE monitor panel is created only by an explicit .view(). Merely
    // creating or changing a module must not consume monitor space.
    if (signals.length === 0 && details.length === 0 && compositeSignals.length === 0 && !sampleView) continue;

    panels.push(buildModuleMonitorPanel({
      id: node.id,
      title: node.label,
      parameters: [],
      signals,
      compositeSignals,
      parameterDetails: details,
      sampleView,
      viewScale: moduleViewScales.get(node.id),
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


function buildMetricsPanel(scheme: SchemeModel, variableCount: number): HTMLElement {
  const card = createMonitorCard('Metrics', 'METRICS', false);
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
    ['SAMPLE RATE', audioEngine.snapshot().sampleRate ? `${Math.round(audioEngine.snapshot().sampleRate!)} HZ` : '--'],
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

function buildLifePanel(view: LifeViewState): HTMLElement {
  const card = createMonitorCard(`SEQ:${view.name}`, `${view.name.toUpperCase()} : SEQ / LIFE`, false);
  card.classList.add('life-monitor-card');
  const body = card.querySelector<HTMLElement>('.monitor-body');
  if (!body) return card;

  const grid = document.createElement('div');
  grid.className = 'life-grid';
  grid.dataset.lifeName = view.name;
  grid.dataset.revision = String(view.revision);
  grid.style.setProperty('--life-size', String(view.size));
  grid.setAttribute('role', 'img');
  grid.setAttribute('aria-label', `${view.name} Life grid`);

  for (const alive of view.cells) {
    const cell = document.createElement('span');
    cell.className = `life-cell ${alive ? 'on' : 'off'}`;
    grid.append(cell);
  }

  body.append(grid);
  return card;
}

const SNAKE_CELL_GAP = 32;
const SNAKE_FIELD_PAD = 20;
const SNAKE_MIN_FIELD_WIDTH = 140;
const SNAKE_MIN_FIELD_HEIGHT = 140;

function snakeFieldGeometry(width: number, height: number): { fieldWidth: number; fieldHeight: number; originX: number; originY: number } {
  const gridWidth = Math.max(0, width - 1) * SNAKE_CELL_GAP;
  const gridHeight = Math.max(0, height - 1) * SNAKE_CELL_GAP;
  const fieldWidth = Math.max(SNAKE_MIN_FIELD_WIDTH, gridWidth + SNAKE_FIELD_PAD * 2);
  const fieldHeight = Math.max(SNAKE_MIN_FIELD_HEIGHT, gridHeight + SNAKE_FIELD_PAD * 2);
  return {
    fieldWidth,
    fieldHeight,
    originX: (fieldWidth - gridWidth) / 2,
    originY: (fieldHeight - gridHeight) / 2,
  };
}

function sizeSnakeField(field: HTMLElement, width: number, height: number): void {
  const geometry = snakeFieldGeometry(width, height);
  field.style.setProperty('--snake-field-width', `${geometry.fieldWidth}px`);
  field.style.setProperty('--snake-field-height', `${geometry.fieldHeight}px`);
}

function snakeCellPosition(cell: number, width: number, height: number): { x: number; y: number } {
  const column = cell % width;
  const row = Math.floor(cell / width);
  const geometry = snakeFieldGeometry(width, height);
  return {
    x: ((geometry.originX + column * SNAKE_CELL_GAP) / geometry.fieldWidth) * 100,
    y: ((geometry.originY + row * SNAKE_CELL_GAP) / geometry.fieldHeight) * 100,
  };
}

function positionSnakeRunner(element: HTMLElement, cell: number, width: number, height: number): void {
  const point = snakeCellPosition(cell, width, height);
  element.style.left = `${point.x}%`;
  element.style.top = `${point.y}%`;
}

function updateSnakeRunnerConnector(
  path: SVGPolylineElement,
  currentCell: number | null,
  recent: number[],
  width: number,
  height: number,
): void {
  const cells = [recent[2], recent[1], currentCell]
    .filter((cell): cell is number => cell !== undefined && cell !== null);
  const unique: number[] = [];
  for (const cell of cells) {
    if (unique.length === 0 || unique[unique.length - 1] !== cell) unique.push(cell);
  }
  if (unique.length < 2) {
    path.setAttribute('points', '');
    return;
  }
  path.setAttribute('points', unique.map((cell) => {
    const point = snakeCellPosition(cell, width, height);
    return `${point.x},${point.y}`;
  }).join(' '));
}

function buildSnakePanel(view: SnakeViewState): HTMLElement {
  const card = createMonitorCard(`SEQ:${view.name}`, `${view.name.toUpperCase()} : SEQ / SNAKE`, false);
  card.classList.add('snake-monitor-card');
  const body = card.querySelector<HTMLElement>('.monitor-body');
  if (!body) return card;

  const field = document.createElement('div');
  field.className = 'snake-field';
  field.dataset.snakeName = view.name;
  field.dataset.revision = String(view.revision);
  field.style.setProperty('--snake-cols', String(view.width));
  field.style.setProperty('--snake-rows', String(view.height));
  sizeSnakeField(field, view.width, view.height);
  field.setAttribute('role', 'img');
  field.setAttribute('aria-label', `${view.name} Snake ${view.width} by ${view.height} matrix`);

  const cells = document.createElement('div');
  cells.className = 'snake-cells';
  for (let index = 0; index < view.width * view.height; index += 1) {
    const cell = document.createElement('span');
    cell.className = 'snake-cell';
    positionSnakeRunner(cell, index, view.width, view.height);
    cells.append(cell);
  }
  field.append(cells);

  const runner = document.createElement('div');
  runner.className = 'snake-runner-layer';

  const connector = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  connector.classList.add('snake-runner-connector');
  connector.setAttribute('viewBox', '0 0 100 100');
  connector.setAttribute('preserveAspectRatio', 'none');
  const connectorPath = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  connectorPath.classList.add('snake-runner-connector-path');
  connector.append(connectorPath);
  runner.append(connector);

  const recent = view.history.slice(-3).reverse();
  for (let age = 2; age >= 1; age -= 1) {
    const tail = document.createElement('span');
    tail.className = `snake-runner tail tail-${age}`;
    tail.dataset.tailAge = String(age);
    const cell = recent[age];
    if (cell !== undefined) {
      positionSnakeRunner(tail, cell, view.width, view.height);
    } else {
      tail.classList.add('hidden');
    }
    runner.append(tail);
  }
  const head = document.createElement('span');
  head.className = 'snake-runner head';
  head.dataset.snakeHead = 'true';
  if (view.currentCell !== null) {
    positionSnakeRunner(head, view.currentCell, view.width, view.height);
  } else {
    head.classList.add('hidden');
  }
  runner.append(head);
  updateSnakeRunnerConnector(connectorPath, view.currentCell, recent, view.width, view.height);
  field.append(runner);

  body.append(field);
  return card;
}

function compactLogicInputLabel(label: string): string {
  const trimmed = label.trim();
  let match = trimmed.match(/^every\s+(\d+(?:\.\d+)?)\s+(beat|sec|ms)(?:\s+.*)?$/i);
  if (match) return `${match[1]} ${match[2].toUpperCase()}`;
  match = trimmed.match(/^every\s+euclidean\s+(\d+)\s*\/\s*(\d+)/i);
  if (match) return `EUCL ${match[1]}/${match[2]}`;
  match = trimmed.match(/^pattern\s+\[([^\]]+)\]/i);
  if (match) {
    const body = match[1].trim().replace(/\s+/g, ' ');
    return `PAT ${body.length > 13 ? `${body.slice(0, 12)}…` : body}`;
  }
  return trimmed;
}

function appendLogicGateStubs(
  gate: SVGSVGElement,
  inputCount: number,
): void {
  const count = Math.max(1, inputCount);
  const top = count === 1 ? 30 : 14;
  const bottom = count === 1 ? 30 : 46;
  for (let index = 0; index < count; index += 1) {
    const y = count === 1 ? 30 : top + ((bottom - top) * index) / (count - 1);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '4');
    line.setAttribute('x2', '18');
    line.setAttribute('y1', String(y));
    line.setAttribute('y2', String(y));
    line.classList.add('logic-gate-stub');
    gate.append(line);
  }
  const out = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  out.setAttribute('x1', '70');
  out.setAttribute('x2', '84');
  out.setAttribute('y1', '30');
  out.setAttribute('y2', '30');
  out.classList.add('logic-gate-stub');
  gate.append(out);
}

function logicGatePath(operator: LogicViewState['nodes'][number]['operator']): string {
  if (operator === 'and' || operator === 'nand') return 'M 18 10 L 42 10 C 68 10 68 50 42 50 L 18 50 Z';
  if (operator === 'or' || operator === 'nor' || operator === 'xor') return 'M 16 10 C 31 18 31 42 16 50 C 37 48 57 43 70 30 C 57 17 37 12 16 10 Z';
  return 'M 18 12 H 66 V 48 H 18 Z';
}

function buildLogicPanel(view: LogicViewState): HTMLElement {
  const card = createMonitorCard(`LOGIC:${view.name}`, `${view.name.toUpperCase()} : LOGIC`, false);
  card.classList.add('logic-monitor-card');
  const body = card.querySelector<HTMLElement>('.monitor-body');
  if (!body) return card;

  const circuit = document.createElement('div');
  circuit.className = 'logic-circuit logic-hardware-rack';
  circuit.dataset.logicName = view.name;
  circuit.dataset.revision = String(view.revision);

  for (const node of view.nodes) {
    const module = document.createElement('section');
    module.className = 'logic-node-row logic-module';
    module.dataset.logicNode = node.name;

    const face = document.createElement('div');
    face.className = 'logic-module-face';

    const header = document.createElement('div');
    header.className = 'logic-module-header';
    const opName = document.createElement('span');
    opName.className = 'logic-module-op';
    opName.textContent = node.operator.toUpperCase();
    const nodeName = document.createElement('span');
    nodeName.className = 'logic-module-name';
    nodeName.textContent = node.name;
    header.append(opName, nodeName);

    const core = document.createElement('div');
    core.className = 'logic-module-core';

    const inputs = document.createElement('div');
    inputs.className = 'logic-inputs logic-jack-bank';
    for (const input of node.inputs) {
      const lane = document.createElement('div');
      lane.className = `logic-input-lane logic-jack-row${input.active ? ' active' : ''}`;
      lane.dataset.logicInput = input.label;

      const label = document.createElement('span');
      label.className = 'logic-port-label';
      label.textContent = compactLogicInputLabel(input.label);
      label.title = input.label;
      if ((label.textContent?.length ?? 0) > 12) label.classList.add('long');

      const jack = document.createElement('span');
      jack.className = 'logic-jack logic-jack-in';
      const led = document.createElement('span');
      led.className = 'logic-jack-led';
      jack.append(led);

      lane.append(label, jack);
      inputs.append(lane);
    }

    const gateWrap = document.createElement('div');
    gateWrap.className = 'logic-gate-wrap';
    const gate = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    gate.classList.add('logic-gate');
    gate.setAttribute('viewBox', '0 0 88 60');
    gate.dataset.operator = node.operator;
    appendLogicGateStubs(gate, node.inputs.length);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', logicGatePath(node.operator));
    path.classList.add('logic-gate-shape');
    gate.append(path);
    if (node.operator === 'xor') {
      const extra = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      extra.setAttribute('d', 'M 10 10 C 25 18 25 42 10 50');
      extra.classList.add('logic-gate-extra');
      gate.append(extra);
    }
    if (node.operator === 'nand' || node.operator === 'nor') {
      const bubble = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      bubble.setAttribute('cx', '72');
      bubble.setAttribute('cy', '30');
      bubble.setAttribute('r', '5');
      bubble.classList.add('logic-gate-bubble');
      gate.append(bubble);
    }
    if (node.operator === 'divider' || node.operator === 'counter' || node.operator === 'flipflop') {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', '42');
      text.setAttribute('y', '35');
      text.setAttribute('text-anchor', 'middle');
      text.classList.add('logic-gate-text');
      text.textContent = node.operator === 'divider' ? `÷${node.parameter}` : node.operator === 'counter' ? `CNT ${node.parameter}` : 'T';
      gate.append(text);
    }
    gateWrap.append(gate);

    const output = document.createElement('div');
    output.className = `logic-output-lane logic-jack-row${node.outputActive ? ' active' : ''}`;
    const outJack = document.createElement('span');
    outJack.className = 'logic-jack logic-jack-out';
    const outLed = document.createElement('span');
    outLed.className = 'logic-jack-led';
    outJack.append(outLed);
    const outLabel = document.createElement('span');
    outLabel.className = 'logic-port-label';
    outLabel.textContent = 'OUT';
    output.append(outJack, outLabel);

    core.append(inputs, gateWrap, output);
    face.append(header, core);
    module.append(face);
    circuit.append(module);
  }

  body.append(circuit);
  return card;
}

function updateLogicViews(): void {
  const states = new Map(runtime.getLogicViews().map((view) => [view.name, view]));
  for (const circuit of viewPanel.querySelectorAll<HTMLElement>('.logic-circuit[data-logic-name]')) {
    const state = states.get(circuit.dataset.logicName ?? '');
    if (!state) continue;
    circuit.dataset.revision = String(state.revision);
    for (const nodeEl of circuit.querySelectorAll<HTMLElement>('.logic-node-row[data-logic-node]')) {
      const node = state.nodes.find((candidate) => candidate.name === nodeEl.dataset.logicNode);
      if (!node) continue;
      nodeEl.querySelector<HTMLElement>('.logic-output-lane')?.classList.toggle('active', node.outputActive);
      for (const lane of nodeEl.querySelectorAll<HTMLElement>('.logic-input-lane[data-logic-input]')) {
        const input = node.inputs.find((candidate) => candidate.label === lane.dataset.logicInput);
        lane.classList.toggle('active', Boolean(input?.active));
      }
    }
  }
}

function constellationMidi(frequency: number): number {
  return 69 + 12 * Math.log2(Math.max(0.0001, frequency) / 440);
}

function constellationNoteLabel(frequency: number): string {
  const midi = constellationMidi(frequency);
  const nearest = Math.round(midi);
  const pitchClasses = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const pitchClass = ((nearest % 12) + 12) % 12;
  const octave = Math.floor(nearest / 12) - 1;
  const cents = Math.round((midi - nearest) * 100);
  return `${pitchClasses[pitchClass]}${octave}${Math.abs(cents) >= 8 ? `${cents > 0 ? '+' : ''}${cents}c` : ''}`;
}

function constellationHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function constellationLayout(view: ConstellationViewState): Map<number, { x: number; y: number }> {
  const unique = [...new Set(view.frequencies.map((item) => Number(item.toFixed(6))))].sort((a, b) => a - b);
  const count = Math.max(1, unique.length);
  const stepwise = Math.max(0, Math.min(100, view.stepwise));
  const leap = Math.max(0, Math.min(100, view.leap));
  const totalMotion = Math.max(1, stepwise + leap);
  const locality = stepwise / totalMotion;
  const dispersion = leap / totalMotion;

  // High memory keeps a constellation generation alive longer. When a new
  // generation appears the stars drift toward another deterministic layout.
  const generationSpan = 3 + Math.round((Math.max(0, Math.min(100, view.memory)) / 100) * 13);
  const generation = Math.floor(Math.max(0, view.revision - 1) / generationSpan);

  const points = unique.map((key, index) => {
    const normalizedIndex = count <= 1 ? 0.5 : index / (count - 1);
    const seed = `${view.name}:${key}:${generation}`;
    const randomX = constellationHash(`${seed}:x`);
    const randomY = constellationHash(`${seed}:y`);

    // Stepwise keeps a loose melodic neighbourhood; leap releases the stars
    // further into the field. The random component keeps the result celestial
    // instead of turning it into a hidden grid.
    const angle = normalizedIndex * Math.PI * 1.65 - Math.PI * 0.82;
    const radius = 34 + normalizedIndex * 34;
    const spineX = 160 + Math.cos(angle) * radius;
    const spineY = 72 + Math.sin(angle) * radius * 0.62;
    const randomXPos = 18 + randomX * 284;
    const randomYPos = 14 + randomY * 117;
    const randomBlend = 0.38 + dispersion * 0.62;
    const orderedBlend = locality * 0.52;
    const normalizer = Math.max(0.001, randomBlend + orderedBlend);

    return {
      key,
      x: (randomXPos * randomBlend + spineX * orderedBlend) / normalizer,
      y: (randomYPos * randomBlend + spineY * orderedBlend) / normalizer,
    };
  });

  const fieldLeft = 18;
  const fieldRight = 302;
  const fieldTop = 16;
  const fieldBottom = 129;

  if (points.length <= 1) {
    return new Map(points.map((point) => [point.key, { x: 160, y: 72 }]));
  }

  // First stretch the cloud to the useful field so the constellation always
  // occupies the drawing instead of collapsing around its centre.
  const rawMinX = Math.min(...points.map((point) => point.x));
  const rawMaxX = Math.max(...points.map((point) => point.x));
  const rawMinY = Math.min(...points.map((point) => point.y));
  const rawMaxY = Math.max(...points.map((point) => point.y));
  const rawSpanX = Math.max(1, rawMaxX - rawMinX);
  const rawSpanY = Math.max(1, rawMaxY - rawMinY);
  for (const point of points) {
    point.x = fieldLeft + ((point.x - rawMinX) / rawSpanX) * (fieldRight - fieldLeft);
    point.y = fieldTop + ((point.y - rawMinY) / rawSpanY) * (fieldBottom - fieldTop);
  }

  // Keep the four extreme stars anchored near the useful borders while the
  // remaining points repel each other. This gives labels breathing room but
  // preserves the full-field silhouette of the constellation.
  const leftAnchor = points.reduce((best, point) => point.x < best.x ? point : best);
  const rightAnchor = points.reduce((best, point) => point.x > best.x ? point : best);
  const topAnchor = points.reduce((best, point) => point.y < best.y ? point : best);
  const bottomAnchor = points.reduce((best, point) => point.y > best.y ? point : best);
  const minDistance = 30 + dispersion * 7;

  for (let iteration = 0; iteration < 18; iteration += 1) {
    for (let a = 0; a < points.length; a += 1) {
      for (let b = a + 1; b < points.length; b += 1) {
        const first = points[a];
        const second = points[b];
        let dx = second.x - first.x;
        let dy = second.y - first.y;
        let distance = Math.hypot(dx, dy);
        if (distance >= minDistance) continue;
        if (distance < 0.001) {
          const angle = constellationHash(`${view.name}:${first.key}:${second.key}:separate`) * Math.PI * 2;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }
        const push = (minDistance - distance) * 0.48;
        const nx = dx / distance;
        const ny = dy / distance;
        if (first !== leftAnchor && first !== rightAnchor) first.x -= nx * push;
        if (first !== topAnchor && first !== bottomAnchor) first.y -= ny * push;
        if (second !== leftAnchor && second !== rightAnchor) second.x += nx * push;
        if (second !== topAnchor && second !== bottomAnchor) second.y += ny * push;
      }
    }

    for (const point of points) {
      point.x = Math.max(fieldLeft, Math.min(fieldRight, point.x));
      point.y = Math.max(fieldTop, Math.min(fieldBottom, point.y));
    }
    leftAnchor.x = fieldLeft;
    rightAnchor.x = fieldRight;
    topAnchor.y = fieldTop;
    bottomAnchor.y = fieldBottom;
  }

  return new Map(points.map((point) => [point.key, { x: point.x, y: point.y }]));
}

function constellationPointPosition(
  frequency: number,
  layout: ReadonlyMap<number, { x: number; y: number }>,
): { x: number; y: number } {
  return layout.get(Number(frequency.toFixed(6))) ?? { x: 160, y: 72 };
}

function renderConstellationField(svg: SVGSVGElement, view: ConstellationViewState): void {
  const ns = 'http://www.w3.org/2000/svg';
  svg.replaceChildren();

  const unique = [...new Set(view.frequencies.map((frequency) => Number(frequency.toFixed(6))))];
  const layout = constellationLayout(view);

  // One quiet line only: the most recent motion. Older motion survives as a
  // fading trail of filled stars instead of accumulating geometry.
  const path = view.history.slice(-2);
  if (path.length === 2 && Math.abs(path[0] - path[1]) > 0.000001) {
    const from = constellationPointPosition(path[0], layout);
    const to = constellationPointPosition(path[1], layout);
    const segment = document.createElementNS(ns, 'line');
    segment.setAttribute('x1', String(from.x)); segment.setAttribute('y1', String(from.y));
    segment.setAttribute('x2', String(to.x)); segment.setAttribute('y2', String(to.y));
    segment.setAttribute('class', 'constellation-trail');
    svg.append(segment);
  }

  // Keep a short luminous memory of visited nodes. Repeated visits naturally
  // reinforce the same star instead of drawing zero-length lines.
  const recent = view.history.slice(-7, -1);
  recent.forEach((frequency, index) => {
    const point = constellationPointPosition(frequency, layout);
    const age = recent.length - 1 - index;
    const ghost = document.createElementNS(ns, 'circle');
    ghost.setAttribute('cx', String(point.x)); ghost.setAttribute('cy', String(point.y));
    ghost.setAttribute('r', String(Math.max(1.7, 3.8 - age * 0.36)));
    ghost.setAttribute('class', 'constellation-ghost');
    ghost.setAttribute('opacity', String(Math.max(0.05, 0.42 - age * 0.065)));
    svg.append(ghost);
  });

  for (const frequency of unique) {
    const point = constellationPointPosition(frequency, layout);
    const node = document.createElementNS(ns, 'circle');
    node.setAttribute('cx', String(point.x)); node.setAttribute('cy', String(point.y));
    node.setAttribute('r', '3.1');
    node.setAttribute('class', 'constellation-node');
    svg.append(node);

    const label = document.createElementNS(ns, 'text');
    const labelRight = point.x < 248;
    label.setAttribute('x', String(point.x + (labelRight ? 6 : -6)));
    label.setAttribute('y', String(point.y - 5));
    label.setAttribute('text-anchor', labelRight ? 'start' : 'end');
    label.setAttribute('class', 'constellation-note-label');
    label.textContent = constellationNoteLabel(frequency);
    svg.append(label);
  }

  if (view.currentFrequency !== null) {
    const point = constellationPointPosition(view.currentFrequency, layout);
    const halo = document.createElementNS(ns, 'circle');
    halo.setAttribute('cx', String(point.x)); halo.setAttribute('cy', String(point.y));
    halo.setAttribute('r', '8'); halo.setAttribute('class', 'constellation-current-halo');
    const current = document.createElementNS(ns, 'circle');
    current.setAttribute('cx', String(point.x)); current.setAttribute('cy', String(point.y));
    current.setAttribute('r', '5'); current.setAttribute('class', 'constellation-current');
    svg.append(halo, current);
  }
}

function buildConstellationPanel(view: ConstellationViewState): HTMLElement {
  const card = createMonitorCard(`SEQ:${view.name}`, `${view.name.toUpperCase()} : SEQ / CONSTELLATION`, false);
  card.classList.add('constellation-monitor-card');
  const body = card.querySelector<HTMLElement>('.monitor-body');
  if (!body) return card;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('constellation-field');
  svg.dataset.constellationName = view.name;
  svg.dataset.revision = String(view.revision);
  svg.setAttribute('viewBox', '0 0 320 145');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${view.name} constellation melody field`);
  renderConstellationField(svg, view);
  body.append(svg);
  return card;
}

function buildDrumkitPanel(view: DrumkitViewState): HTMLElement {
  const card = createMonitorCard(`DRUMKIT:${view.name}`, `${view.name.toUpperCase()} : DRUMKIT`, false);
  card.classList.add('drumkit-monitor-card');
  const body = card.querySelector<HTMLElement>('.monitor-body');
  if (!body) return card;

  const grid = document.createElement('div');
  grid.className = 'drumkit-pattern';
  grid.dataset.drumkitName = view.name;
  for (const lane of view.lanes) {
    const row = document.createElement('div');
    row.className = 'drumkit-lane';
    row.dataset.drumkitLane = lane.alias;

    const label = document.createElement('span');
    label.className = 'drumkit-lane-label';
    label.textContent = lane.alias.toUpperCase();

    const steps = document.createElement('span');
    steps.className = 'drumkit-lane-steps';
    steps.style.setProperty('--drumkit-steps', String(lane.steps));
    lane.hits.forEach((hit, index) => {
      const cell = document.createElement('span');
      cell.className = `drumkit-step ${hit ? 'hit' : 'empty'}${index === lane.cursor ? ' cursor' : ''}`;
      cell.dataset.step = String(index);
      cell.textContent = hit ? '◆' : '·';
      steps.append(cell);
    });

    const page = document.createElement('span');
    page.className = 'drumkit-lane-page';
    page.textContent = lane.pageCount > 1 ? `${lane.page + 1}/${lane.pageCount}` : '';

    row.append(label, steps, page);
    grid.append(row);
  }

  if (view.lanes.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'monitor-empty';
    empty.textContent = 'NO ACTIVE LANES';
    grid.append(empty);
  }

  body.append(grid);
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
  sampleView?: { owner?: string; sampleAlias?: string; sampleStart?: number; sampleEnd?: number; sampleSlices?: number };
  viewScale?: ModuleViewScale;
  defaultCollapsed: boolean;
}): HTMLElement {
  const card = createMonitorCard(options.id, options.title, options.defaultCollapsed);
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

function updateLifeViews(): void {
  const states = new Map(runtime.getLifeViews().map((view) => [view.name, view]));
  for (const grid of document.querySelectorAll<HTMLElement>('.life-grid[data-life-name]')) {
    const name = grid.dataset.lifeName;
    if (!name) continue;
    const state = states.get(name);
    if (!state) continue;
    const revision = Number(grid.dataset.revision ?? '-1');
    if (revision === state.revision && grid.children.length === state.cells.length) continue;

    grid.dataset.revision = String(state.revision);
    grid.style.setProperty('--life-size', String(state.size));
    grid.replaceChildren(...state.cells.map((alive) => {
      const cell = document.createElement('span');
      cell.className = `life-cell ${alive ? 'on' : 'off'} life-cell-change`;
      return cell;
    }));
  }
}

function updateConstellationViews(): void {
  const states = new Map(runtime.getConstellationViews().map((view) => [view.name, view]));
  for (const svg of document.querySelectorAll<SVGSVGElement>('.constellation-field[data-constellation-name]')) {
    const name = svg.dataset.constellationName;
    if (!name) continue;
    const state = states.get(name);
    if (!state) continue;
    const revision = Number(svg.dataset.revision ?? '-1');
    if (revision === state.revision) continue;
    svg.dataset.revision = String(state.revision);
    renderConstellationField(svg, state);
  }
}

function updateSnakeViews(): void {
  const states = new Map(runtime.getSnakeViews().map((view) => [view.name, view]));
  for (const field of document.querySelectorAll<HTMLElement>('.snake-field[data-snake-name]')) {
    const name = field.dataset.snakeName;
    if (!name) continue;
    const state = states.get(name);
    if (!state) continue;
    const revision = Number(field.dataset.revision ?? '-1');
    if (revision === state.revision) continue;

    field.dataset.revision = String(state.revision);
    field.style.setProperty('--snake-cols', String(state.width));
    field.style.setProperty('--snake-rows', String(state.height));
    sizeSnakeField(field, state.width, state.height);

    const cells = field.querySelector<HTMLElement>('.snake-cells');
    const expectedCells = state.width * state.height;
    if (cells) {
      if (cells.childElementCount !== expectedCells) {
        cells.replaceChildren(...Array.from({ length: expectedCells }, () => {
          const cell = document.createElement('span');
          cell.className = 'snake-cell';
          return cell;
        }));
      }
      Array.from(cells.children).forEach((child, index) => {
        if (child instanceof HTMLElement) positionSnakeRunner(child, index, state.width, state.height);
      });
    }

    const recent = state.history.slice(-3).reverse();
    const connectorPath = field.querySelector<SVGPolylineElement>('.snake-runner-connector-path');
    if (connectorPath) updateSnakeRunnerConnector(connectorPath, state.currentCell, recent, state.width, state.height);

    const head = field.querySelector<HTMLElement>('.snake-runner.head');
    if (head) {
      if (state.currentCell !== null) {
        head.classList.remove('hidden');
        positionSnakeRunner(head, state.currentCell, state.width, state.height);
      } else {
        head.classList.add('hidden');
      }
    }

    for (let age = 1; age <= 2; age += 1) {
      const tail = field.querySelector<HTMLElement>(`.snake-runner.tail-${age}`);
      if (!tail) continue;
      const cell = recent[age];
      if (cell === undefined) {
        tail.classList.add('hidden');
      } else {
        tail.classList.remove('hidden');
        positionSnakeRunner(tail, cell, state.width, state.height);
      }
    }
  }
}

function updateDrumkitViews(): void {
  const states = new Map(runtime.getDrumkitViews().map((view) => [view.name, view]));
  const now = performance.now();
  for (const pattern of document.querySelectorAll<HTMLElement>('.drumkit-pattern[data-drumkit-name]')) {
    const name = pattern.dataset.drumkitName;
    if (!name) continue;
    const state = states.get(name);
    if (!state) continue;
    for (const lane of state.lanes) {
      const row = [...pattern.querySelectorAll<HTMLElement>('.drumkit-lane')]
        .find((candidate) => candidate.dataset.drumkitLane === lane.alias);
      if (!row) continue;
      const steps = row.querySelector<HTMLElement>('.drumkit-lane-steps');
      if (!steps) continue;
      steps.style.setProperty('--drumkit-steps', String(lane.steps));
      let cells = [...steps.querySelectorAll<HTMLElement>('.drumkit-step')];
      if (cells.length !== lane.hits.length) {
        steps.replaceChildren(...lane.hits.map((hit, index) => {
          const cell = document.createElement('span');
          cell.className = `drumkit-step ${hit ? 'hit' : 'empty'}`;
          cell.dataset.step = String(index);
          cell.textContent = hit ? '◆' : '·';
          return cell;
        }));
        cells = [...steps.querySelectorAll<HTMLElement>('.drumkit-step')];
      }
      cells.forEach((cell, index) => {
        cell.classList.toggle('hit', lane.hits[index]);
        cell.classList.toggle('empty', !lane.hits[index]);
        cell.classList.toggle('cursor', index === lane.cursor);
        cell.classList.toggle('triggered', lane.lastTriggeredStep === index && lane.lastTriggeredAt !== null && now - lane.lastTriggeredAt < 130);
        cell.textContent = lane.hits[index] ? '◆' : '·';
      });
      const page = row.querySelector<HTMLElement>('.drumkit-lane-page');
      if (page) page.textContent = lane.pageCount > 1 ? `${lane.page + 1}/${lane.pageCount}` : '';
    }
  }
}

function updateSampleWaveformViews(): void {
  const styles = getComputedStyle(document.documentElement);
  const phosphor = styles.getPropertyValue('--phosphor-hot').trim() || '#ffe783';
  const sliceGuide = styles.getPropertyValue('--sample-slice-guide').trim() || '#63e6e2';
  for (const canvas of document.querySelectorAll<HTMLCanvasElement>('canvas.sample-waveform-canvas')) {
    const alias = canvas.dataset.sampleAlias ?? '';
    const owner = canvas.dataset.sampleOwner ?? '';
    const asset = alias ? assetLibrary.getByAlias(alias) : undefined;
    const width = Math.max(1, Math.floor(canvas.clientWidth * window.devicePixelRatio));
    const height = Math.max(1, Math.floor(canvas.clientHeight * window.devicePixelRatio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const ctx = canvas.getContext('2d'); if (!ctx) continue;
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = phosphor; ctx.fillStyle = phosphor; ctx.lineWidth = Math.max(1, window.devicePixelRatio);
    ctx.globalAlpha = 0.18; ctx.beginPath(); ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); ctx.stroke(); ctx.globalAlpha = 1;
    const channel = asset?.pcmChannels[0];
    if (channel?.length) {
      const bins = Math.max(1, Math.min(width, Math.floor(width / Math.max(1, window.devicePixelRatio))));
      const step = channel.length / bins;
      ctx.beginPath();
      for (let x = 0; x < bins; x += 1) {
        const from = Math.floor(x * step), to = Math.max(from + 1, Math.min(channel.length, Math.floor((x + 1) * step)));
        let lo = 1, hi = -1;
        for (let i = from; i < to; i += 1) { const v = channel[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
        const px = x / Math.max(1, bins - 1) * width;
        ctx.moveTo(px, height * (0.5 - hi * 0.45)); ctx.lineTo(px, height * (0.5 - lo * 0.45));
      }
      ctx.stroke();
    }
    const start = Math.max(0, Math.min(100, Number(canvas.dataset.sampleStart ?? 0))) / 100;
    const end = Math.max(0, Math.min(100, Number(canvas.dataset.sampleEnd ?? 100))) / 100;
    ctx.globalAlpha = 0.25;
    ctx.fillRect(0, 0, start * width, height); ctx.fillRect(end * width, 0, (1 - end) * width, height);
    ctx.globalAlpha = 1;
    const configuredSlices = Math.max(0, Math.floor(Number(canvas.dataset.sampleSlices ?? 0)));
    if (configuredSlices > 0 && end > start) {
      const previousStroke = ctx.strokeStyle;
      ctx.strokeStyle = sliceGuide;
      ctx.globalAlpha = 0.72;
      ctx.lineWidth = Math.max(1, window.devicePixelRatio);
      for (let slice = 0; slice <= configuredSlices; slice += 1) {
        const x = (start + (end - start) * (slice / configuredSlices)) * width;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      ctx.strokeStyle = previousStroke;
      ctx.globalAlpha = 1;
    }
    const progress = owner ? audioEngine.getSampleVoiceProgress(owner) : null;
    if (progress?.activeSlice && configuredSlices > 0) {
      const sliceStart = start + (end - start) * ((progress.activeSlice - 1) / configuredSlices);
      const sliceEnd = start + (end - start) * (progress.activeSlice / configuredSlices);
      ctx.globalAlpha = 0.12; ctx.fillRect(sliceStart * width, 0, (sliceEnd - sliceStart) * width, height); ctx.globalAlpha = 1;
    }
    const position = progress?.position ?? start;
    ctx.lineWidth = Math.max(1, 2 * window.devicePixelRatio); ctx.beginPath(); ctx.moveTo(position * width, 0); ctx.lineTo(position * width, height); ctx.stroke();
    if (progress?.active) { ctx.globalAlpha = 0.14; ctx.fillRect(start * width, 0, Math.max(0, (position - start) * width), height); ctx.globalAlpha = 1; }
  }
}

function drawScopes(): void {
  scopeFrame = 0;
  updateVariableValues();
  updateTuringViews();
  updateLifeViews();
  updateConstellationViews();
  updateSnakeViews();
  updateLogicViews();
  updateDrumkitViews();
  updateSampleWaveformViews();
  updateSchemeLiveValues();
  const canvases = [...document.querySelectorAll<HTMLCanvasElement>('canvas.scope-canvas')];
  const liveValues = document.querySelectorAll<HTMLElement>('.scheme-live-value');
  const turingRegisters = document.querySelectorAll<HTMLElement>('.turing-register');
  const lifeGrids = document.querySelectorAll<HTMLElement>('.life-grid');
  const constellationFields = document.querySelectorAll<SVGSVGElement>('.constellation-field');
  const snakeFields = document.querySelectorAll<HTMLElement>('.snake-field');
  const drumkitPatterns = document.querySelectorAll<HTMLElement>('.drumkit-pattern');
  const sampleWaveforms = document.querySelectorAll<HTMLCanvasElement>('.sample-waveform-canvas');
  if (canvases.length === 0 && liveValues.length === 0 && turingRegisters.length === 0 && lifeGrids.length === 0 && constellationFields.length === 0 && snakeFields.length === 0 && drumkitPatterns.length === 0 && sampleWaveforms.length === 0) return;

  const styles = getComputedStyle(document.documentElement);
  const phosphor = styles.getPropertyValue('--phosphor-hot').trim() || '#ffe783';

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
          const displayValue = scopeDisplayValue(traceSignal, data[i], canvas);
          const y = height * 0.5 - displayValue * height * 0.42;
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
        const displayValue = scopeDisplayValue(signal, data[i], canvas);
        const y = height * 0.5 - displayValue * height * 0.42;
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

function scopeDisplayValue(signal: string, value: number, canvas: HTMLCanvasElement): number {
  const configured = Number(canvas.dataset.scopeRange);
  const range = Number.isFinite(configured) && configured > 0
    ? configured
    : naturalScopeRange([signal]);
  return value / range;
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
  const moduleViewScales = parseModuleViewScales(sourceText());

  schemeNodes.replaceChildren();
  schemeEdges.replaceChildren();

  const nodeElements = new Map<string, HTMLElement>();
  for (const node of model.nodes) {
    const element = buildSchemeNode(node, moduleViewScales.get(node.id));
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

function buildSchemeNode(node: SchemeNode, viewScale?: ModuleViewScale): HTMLElement {
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

  const views = editingInlineViews ?? runtime.getInlineViews();
  for (const view of views) {
    const list = grouped.get(view.line) ?? [];
    list.push(view);
    grouped.set(view.line, list);
  }
  return grouped;
}

function refreshInlineViewEditingPreview(): void {
  if (!codeRunning) {
    editingInlineViews = null;
    return;
  }
  try {
    const source = sourceText();
    const compiled = source.trim() ? compileSource(source) : '';
    editingInlineViews = runtime.previewInlineViews(compiled);
  } catch (error) {
    // While a line is being typed it can be transiently incomplete. Keep the
    // previous valid inline layout until the next syntactically valid edit.
    if (!(error instanceof LanguageError) && !(error instanceof SonusEvaluationError)) console.warn(error);
  }
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

function liveDisableHeader(line: string): { disabled: boolean } | null {
  const commentAt = commentStart(line);
  const code = commentAt < 0 ? line : line.slice(0, commentAt);
  const match = code.match(/^\s*(_?)(VOICE|DRUMKIT|FX|FILTER|CLOCK)\b/i);
  if (!match) return null;
  return { disabled: match[1] === '_' };
}

function toggleObjectDisabledAtPhysicalLine(physicalLine: number): void {
  const lines = editor.value.split('\n');
  if (physicalLine < 1 || physicalLine > lines.length) return;
  const targetLine = lines[physicalLine - 1];
  if (!liveDisableHeader(targetLine)) return;

  const targetStart = lines.slice(0, physicalLine - 1).reduce((total, line) => total + line.length + 1, 0);
  const match = targetLine.match(/^(\s*)(_?)/);
  const indentation = match?.[1] ?? '';
  const disabled = match?.[2] === '_';
  const markerStart = targetStart + indentation.length;
  const originalStart = editor.selectionStart;
  const originalEnd = editor.selectionEnd;
  const direction = editor.selectionDirection ?? 'none';

  if (disabled) editor.setRangeText('', markerStart, markerStart + 1, 'preserve');
  else editor.setRangeText('_', markerStart, markerStart, 'preserve');

  const delta = disabled ? -1 : 1;
  const selectionStart = Math.max(0, originalStart + (originalStart > markerStart ? delta : 0));
  const selectionEnd = Math.max(selectionStart, originalEnd + (originalEnd > markerStart ? delta : 0));
  editor.setSelectionRange(selectionStart, selectionEnd, direction);
  afterEditorMutation();
}

function collapsibleObjectHeader(line: string): { indentation: string } | null {
  const commentAt = commentStart(line);
  const code = commentAt < 0 ? line : line.slice(0, commentAt);
  const match = code.match(/^(\s*)_?(VOICE|DRUMKIT|FX|FILTER|MOD|SEQ|REGISTER|LOGIC)\s+[A-Za-z_][A-Za-z0-9_]*\b[^:]*:\s*$/i);
  if (!match) return null;
  return { indentation: match[1] };
}

function foldedMarkerAfterLine(lines: string[], index: number): string | null {
  if (index + 1 >= lines.length) return null;
  return foldMarkerId(lines[index + 1]);
}

function toggleCollapsedObjectAtPhysicalLine(physicalLine: number): void {
  const lines = editor.value.split('\n');
  const index = physicalLine - 1;
  if (index < 0 || index >= lines.length) return;
  const header = collapsibleObjectHeader(lines[index]);
  if (!header) return;

  const lineStarts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }

  const existingId = foldedMarkerAfterLine(lines, index);
  if (existingId) {
    const block = collapsedEditorBlocks.get(existingId);
    if (!block) return;
    const markerStart = lineStarts[index + 1];
    const markerEnd = markerStart + lines[index + 1].length + (index + 1 < lines.length - 1 ? 1 : 0);
    const restoredBody = block.body.endsWith('\n\n')
      ? block.body
      : block.body.endsWith('\n')
        ? `${block.body}\n`
        : `${block.body}\n\n`;
    editor.setRangeText(restoredBody, markerStart, markerEnd, 'preserve');
    collapsedEditorBlocks.delete(existingId);
    afterEditorMutation();
    return;
  }

  const headerIndent = header.indentation.length;
  let endLine = index + 1;
  while (endLine < lines.length) {
    const line = lines[endLine];
    if (!line.trim()) {
      endLine += 1;
      continue;
    }
    const commentAt = commentStart(line);
    const code = commentAt < 0 ? line : line.slice(0, commentAt);
    const indentation = code.length - code.trimStart().length;
    if (indentation <= headerIndent) break;
    endLine += 1;
  }

  if (endLine === index + 1) return;
  const bodyStart = lineStarts[index + 1];
  const bodyEnd = endLine < lines.length ? lineStarts[endLine] : editor.value.length;
  const body = editor.value.slice(bodyStart, bodyEnd);
  if (!body.trim()) return;

  const selectionStart = editor.selectionStart;
  const selectionEnd = editor.selectionEnd;
  const selectionInsideBody = selectionStart < bodyEnd && selectionEnd >= bodyStart;
  const headerCaret = lineStarts[index] + lines[index].length;

  const id = String(nextCollapsedEditorBlockId++);
  collapsedEditorBlocks.set(id, { body });
  const marker = `${header.indentation}    //~F${id}${body.endsWith('\n') ? '\n' : ''}`;
  editor.setRangeText(marker, bodyStart, bodyEnd, 'preserve');
  if (selectionInsideBody) editor.setSelectionRange(headerCaret, headerCaret);
  afterEditorMutation();
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
    label.className = 'line-number-label';
    label.textContent = labels[index] ?? '';

    const collapsible = collapsibleObjectHeader(lines[index]);
    if (collapsible) {
      const collapsed = Boolean(foldedMarkerAfterLine(lines, index));
      row.classList.add('collapsible');
      row.title = collapsed ? 'Expand object' : 'Collapse object';
      const arrow = document.createElement('span');
      arrow.className = 'object-fold-arrow';
      arrow.textContent = collapsed ? '▴' : '▾';
      label.append(arrow);
      row.addEventListener('pointerdown', (event) => {
        const target = event.target as Element;
        if (target.closest('.object-toggle-led')) return;
        event.preventDefault();
      });
      row.addEventListener('click', (event) => {
        const target = event.target as Element;
        if (target.closest('.object-toggle-led')) return;
        event.preventDefault();
        event.stopPropagation();
        toggleCollapsedObjectAtPhysicalLine(physicalLine);
        editor.focus();
      });
    }

    const objectState = liveDisableHeader(lines[index]);
    if (objectState) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = `object-toggle-led${objectState.disabled ? ' disabled' : ''}`;
      toggle.setAttribute('aria-label', `${objectState.disabled ? 'Enable' : 'Disable'} object on line ${physicalLine}`);
      toggle.title = objectState.disabled ? 'Enable object' : 'Disable object';
      toggle.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      toggle.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleObjectDisabledAtPhysicalLine(physicalLine);
        editor.focus();
      });
      row.append(toggle);
    }

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
    if (/^_?(VOICE|DRUMKIT|FX|FILTER|MOD|SEQ|REGISTER|LOGIC|SET|CLOCK|OUT)\b/i.test(trimmed)) {
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

type LiveControlSource = {
  line: number;
  start: number;
  end: number;
  value: number;
  property: string;
  prefixColumns: number;
  targetKind: 'voice' | 'fx' | 'filter' | 'mod';
  targetName: string;
  updatePolicy: ParameterUpdatePolicy;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
};

type LiveBlockScope = {
  kind: 'voice' | 'fx' | 'filter' | 'mod' | 'other';
  name: string;
  targetName: string;
  indentation: number;
  ownerVoice?: string;
};

const LIVE_CONTROL_GAP_COLUMNS = 8;
const LIVE_CONTROL_GAP = ' '.repeat(LIVE_CONTROL_GAP_COLUMNS);

type LiveControlGap = { start: number; end: number };

function liveControlGapRanges(source: string): LiveControlGap[] {
  const ranges: LiveControlGap[] = [];
  for (const control of scanLiveControls(source)) {
    let end = control.end;
    while (end < source.length && source[end] === ' ') end += 1;
    if (end - control.end >= LIVE_CONTROL_GAP_COLUMNS) ranges.push({ start: control.end, end });
  }
  return ranges;
}

function normalizeLiveControlSpacing(): boolean {
  const source = editor.value;
  const controls = scanLiveControls(source);
  const edits: Array<{ start: number; end: number; replacement: string }> = [];

  for (const control of controls) {
    const lineEndAt = source.indexOf('\n', control.end);
    const lineEnd = lineEndAt < 0 ? source.length : lineEndAt;
    let gapEnd = control.end;
    while (gapEnd < lineEnd && (source[gapEnd] === ' ' || source[gapEnd] === '\t')) gapEnd += 1;
    const current = source.slice(control.end, gapEnd);
    if (current !== LIVE_CONTROL_GAP) {
      edits.push({ start: control.end, end: gapEnd, replacement: LIVE_CONTROL_GAP });
    }
  }

  // Remove a reserved LIVE gap if the LIVE qualifier itself has been deleted.
  // This deliberately targets only the exact spacer width generated above.
  const lines = source.split('\n');
  const controlledLines = new Set(controls.map((control) => control.line));
  let offset = 0;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!controlledLines.has(lineIndex + 1) && !/\bLIVE\b/i.test(line)) {
      let local = 0;
      while ((local = line.indexOf(LIVE_CONTROL_GAP, local)) >= 0) {
        const before = line.slice(0, local);
        const after = line.slice(local + LIVE_CONTROL_GAP.length);
        if (/-?\d+(?:\.\d+)?$/.test(before) && /^(?:,|\]|\s+WITH\b|\s*\/\/|$)/i.test(after)) {
          edits.push({ start: offset + local, end: offset + local + LIVE_CONTROL_GAP.length, replacement: /^\s+WITH\b/i.test(after) ? ' ' : '' });
        }
        local += LIVE_CONTROL_GAP.length;
      }
    }
    offset += line.length + 1;
  }

  if (edits.length === 0) return false;
  let selectionStart = editor.selectionStart;
  let selectionEnd = editor.selectionEnd;
  const direction = editor.selectionDirection ?? 'none';
  const shift = (position: number, edit: { start: number; end: number; replacement: string }): number => {
    if (position <= edit.start) return position;
    if (position >= edit.end) return position + edit.replacement.length - (edit.end - edit.start);
    return edit.start + edit.replacement.length;
  };

  const uniqueEdits = [...new Map(edits.map((edit) => [`${edit.start}:${edit.end}`, edit])).values()]
    .sort((a, b) => b.start - a.start);
  for (const edit of uniqueEdits) {
    selectionStart = shift(selectionStart, edit);
    selectionEnd = shift(selectionEnd, edit);
    editor.setRangeText(edit.replacement, edit.start, edit.end, 'preserve');
  }
  editor.setSelectionRange(selectionStart, selectionEnd, direction);
  return true;
}

function moveCaretAcrossLiveControlGap(direction: 'forward' | 'backward' | 'nearest' = 'nearest'): boolean {
  if (editor.selectionStart !== editor.selectionEnd) return false;
  const caret = editor.selectionStart;
  for (const gap of liveControlGapRanges(editor.value)) {
    const inside = caret >= gap.start && caret <= gap.end;
    if (!inside) continue;
    let target = gap.end;
    if (direction === 'backward') target = gap.start;
    else if (direction === 'nearest') target = caret - gap.start < gap.end - caret ? gap.start : gap.end;
    if (target === caret) return false;
    editor.setSelectionRange(target, target);
    return true;
  }
  return false;
}

function scanLiveControls(source: string): LiveControlSource[] {
  const controls: LiveControlSource[] = [];
  const lines = source.split('\n');
  const scopes: LiveBlockScope[] = [];
  let offset = 0;
  let activeLiveMix: { name: string; indentation: number; scope: LiveBlockScope } | null = null;

  const activeScope = (): LiveBlockScope | undefined => [...scopes].reverse().find((candidate) =>
    candidate.kind === 'voice' || candidate.kind === 'fx' || candidate.kind === 'filter' || candidate.kind === 'mod'
  );
  const addCompositeControl = (
    lineIndex: number, lineOffset: number, localStart: number, literal: string,
    scope: LiveBlockScope, property: string, label: string, min: number, max: number, step: number,
  ): void => {
    const value = Number(literal);
    if (!Number.isFinite(value)) return;
    controls.push({
      line: lineIndex + 1,
      start: lineOffset + localStart,
      end: lineOffset + localStart + literal.length,
      value,
      property,
      prefixColumns: localStart + literal.length,
      targetKind: scope.kind as 'voice' | 'fx' | 'filter' | 'mod',
      targetName: scope.targetName,
      updatePolicy: 'continuous',
      min, max, step, label,
    });
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const commentAt = commentStart(line);
    const code = commentAt < 0 ? line : line.slice(0, commentAt);
    const trimmed = code.trim();
    const indentation = code.length - code.trimStart().length;

    if (activeLiveMix) {
      if (trimmed === ']' && indentation <= activeLiveMix.indentation) activeLiveMix = null;
      else if (trimmed && indentation > activeLiveMix.indentation) {
        const input = code.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s+at\s+(-?\d+(?:\.\d+)?)/i);
        if (input) {
          const literal = input[2];
          const localStart = input.index! + input[0].lastIndexOf(literal);
          addCompositeControl(index, offset, localStart, literal, activeLiveMix.scope,
            `mix:${activeLiveMix.name}:${input[1]}`, `${input[1]} at`, 0, 100, 1);
        }
      } else if (trimmed && indentation <= activeLiveMix.indentation) activeLiveMix = null;
    }

    if (trimmed) {
      while (scopes.length > 0 && indentation <= scopes[scopes.length - 1].indentation) scopes.pop();

      const header = trimmed.match(/^_?(VOICE|FX|FILTER|MOD|SEQ)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+WITH\s+VIEW(?:\s+\d+(?:\.\d+)?\s*[VX])?)?\s*:/i);
      if (header) {
        const keyword = header[1].toLowerCase();
        const name = header[2];
        if (keyword === 'voice') scopes.push({ kind: 'voice', name, targetName: name, indentation });
        else if (keyword === 'fx') scopes.push({ kind: 'fx', name, targetName: name, indentation });
        else if (keyword === 'filter') {
          const ownerVoice = [...scopes].reverse().find((scope) => scope.kind === 'voice')?.name;
          const targetName = ownerVoice ? `__filter_${ownerVoice}_${name}` : name;
          scopes.push({ kind: 'filter', name, targetName, indentation, ownerVoice });
        } else if (keyword === 'mod') scopes.push({ kind: 'mod', name, targetName: name, indentation });
        else scopes.push({ kind: 'other', name, targetName: name, indentation });
      }
    }

    const scope = activeScope();
    const mixStart = code.match(/^\s*LIVE\s+mix\s+([A-Za-z_][A-Za-z0-9_]*)\s*\[\s*$/i);
    if (mixStart && scope && (scope.kind === 'voice' || scope.kind === 'mod')) {
      activeLiveMix = { name: mixStart[1], indentation, scope };
      offset += line.length + 1;
      continue;
    }

    const tune = code.match(/^\s*LIVE\s+tune\s+([A-Za-z_][A-Za-z0-9_]*)\s+with\s+(.+)$/i);
    if (tune && scope && (scope.kind === 'voice' || scope.kind === 'mod')) {
      const modifierText = tune[2];
      const modifierBase = code.indexOf(modifierText, tune.index ?? 0);
      const regex = /(octave|detune|ratio)\s+(-?\d+(?:\.\d+)?)/gi;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(modifierText))) {
        const key = match[1].toLowerCase();
        const literal = match[2];
        const localStart = modifierBase + match.index + match[0].lastIndexOf(literal);
        const range = key === 'octave' ? [-8, 8, 1] : key === 'detune' ? [-1200, 1200, 1] : [0.125, 32, 0.01];
        addCompositeControl(index, offset, localStart, literal, scope,
          `tune:${tune[1]}:${key}`, key, range[0], range[1], range[2]);
      }
      offset += line.length + 1;
      continue;
    }

    const output = code.match(/^\s*LIVE\s+output\s+(.+)$/i);
    if (output && scope && (scope.kind === 'voice' || scope.kind === 'mod')) {
      const body = output[1];
      const bodyBase = code.indexOf(body, output.index ?? 0);
      const regex = /([A-Za-z_][A-Za-z0-9_]*)\s+at\s+(-?\d+(?:\.\d+)?)/gi;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(body))) {
        const literal = match[2];
        const localStart = bodyBase + match.index + match[0].lastIndexOf(literal);
        addCompositeControl(index, offset, localStart, literal, scope,
          `output:${match[1]}`, `${match[1]} at`, 0, 100, 1);
      }
      offset += line.length + 1;
      continue;
    }

    const inlineMix = code.match(/^\s*LIVE\s+mix\s+([A-Za-z_][A-Za-z0-9_]*)\s*\[(.*)\]\s*$/i);
    if (inlineMix && scope && scope.kind === 'voice') {
      const body = inlineMix[2];
      const bodyBase = code.indexOf(body, inlineMix.index ?? 0);
      const regex = /([A-Za-z_][A-Za-z0-9_]*)\s+at\s+(-?\d+(?:\.\d+)?)/gi;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(body))) {
        const literal = match[2];
        const localStart = bodyBase + match.index + match[0].lastIndexOf(literal);
        addCompositeControl(index, offset, localStart, literal, scope,
          `mix:${inlineMix[1]}:${match[1]}`, `${match[1]} at`, 0, 100, 1);
      }
      offset += line.length + 1;
      continue;
    }

    const match = code.match(/^(\s*)LIVE\s+([A-Za-z_][A-Za-z0-9_]*)\s+(\d+(?:\.\d+)?)(?=\s|$)/i);
    if (match) {
      const literal = match[3];
      const localStart = match.index! + match[0].lastIndexOf(literal);
      const value = Number(literal);
      if (scope && Number.isFinite(value) && value >= 0 && value <= 100) {
        controls.push({
          line: index + 1,
          start: offset + localStart,
          end: offset + localStart + literal.length,
          value,
          property: match[2],
          prefixColumns: localStart + literal.length,
          targetKind: scope.kind as 'voice' | 'fx' | 'filter' | 'mod',
          targetName: scope.targetName,
          updatePolicy: parameterUpdatePolicy(scope.kind as 'voice' | 'fx' | 'filter' | 'mod', match[2]),
          min: 0, max: 100, step: 1,
        });
      }
    }
    offset += line.length + 1;
  }
  return controls;
}

function applyLiveControlRuntime(kind: string, name: string, property: string, value: number): void {
  if (!codeRunning) return;
  const key = property.toLowerCase();
  try {
    const tune = property.match(/^tune:([A-Za-z_][A-Za-z0-9_]*):(octave|detune|ratio)$/i);
    if (tune) {
      audioEngine.setCompositeOperatorTune(name, tune[1], { mode: 'relative', [tune[2].toLowerCase()]: value });
      return;
    }
    const mix = property.match(/^mix:([A-Za-z_][A-Za-z0-9_]*):([A-Za-z_][A-Za-z0-9_]*)$/i);
    if (mix) { audioEngine.setCompositeMixLevel(name, mix[1], mix[2], value); return; }
    const output = property.match(/^output:([A-Za-z_][A-Za-z0-9_]*)$/i);
    if (output) { audioEngine.setCompositeOutputLevel(name, output[1], value); return; }
    if (kind === 'filter') {
      if (key === 'cutoff') audioEngine.setFilterCutoff(name, 20 * (1000 ** (value / 100)));
      else if (key === 'resonance') audioEngine.setFilterResonance(name, value);
      else if (key === 'drive') audioEngine.setFilterDrive(name, value);
      return;
    }

    if (kind === 'fx') {
      if (key === 'reverse' || key === 'tape' || key === 'diffusion' || key === 'pingpong' || key === 'lines') {
        audioEngine.setDelayParameter(name, key as 'reverse'|'tape'|'diffusion'|'pingpong'|'lines', value);
        return;
      }
      const aliases: Record<string, 'position' | 'size' | 'density' | 'texture' | 'mix' | 'spread' | 'feedback' | 'reverb'> = {
        position: 'position', predelay: 'position', size: 'size', density: 'density', bloom: 'density', diffuse: 'density',
        texture: 'texture', damp: 'texture', damping: 'texture', mix: 'mix', spread: 'spread', width: 'spread',
        feedback: 'feedback', decay: 'feedback', reverb: 'reverb', motion: 'reverb',
      };
      const mapped = aliases[key];
      if (mapped) audioEngine.setMistParameter(name, mapped, value);
      return;
    }

    if (kind === 'voice') {
      if (key === 'level') { audioEngine.setVoiceLevel(name, value); return; }
      const aliases: Record<string, 'harmo' | 'timbre' | 'morph' | 'geometry' | 'structure' | 'brightness' | 'damping' | 'position' | 'space' | 'bow' | 'blow' | 'strike'> = {
        harmo: 'harmo', harmonics: 'harmo', timbre: 'timbre', morph: 'morph', geometry: 'geometry', structure: 'structure',
        brightness: 'brightness', damping: 'damping', position: 'position', space: 'space', bow: 'bow', blow: 'blow', strike: 'strike',
      };
      const mapped = aliases[key];
      if (mapped) audioEngine.setVoiceParameter(name, mapped, value);
    }
  } catch (error) {
    console.warn('[LIVE] realtime parameter update failed', error);
  }
}

function scheduleLiveControlRuntimeUpdate(kind: string, name: string, property: string, value: number): void {
  pendingLiveControlRuntimeUpdate = { kind, name, property, value };
  if (liveControlRuntimeTimer) return;
  liveControlRuntimeTimer = window.setTimeout(() => {
    liveControlRuntimeTimer = 0;
    const pending = pendingLiveControlRuntimeUpdate;
    pendingLiveControlRuntimeUpdate = null;
    if (pending) applyLiveControlRuntime(pending.kind, pending.name, pending.property, pending.value);
  }, liveControlRefreshMs);
}

function commitLiveControlSource(): void {
  if (!codeRunning) return;
  window.clearTimeout(liveControlCommitTimer);
  liveControlCommitTimer = window.setTimeout(() => {
    liveControlCommitTimer = 0;
    try {
      const source = sourceText();
      const compiled = source.trim() ? compileSource(source) : '';
      runtime.evaluate(compiled, { hotReload: true });
      editingInlineViews = null;
      clearDiagnostic();
      syncViews();
    } catch (error) {
      if (error instanceof LanguageError) showDiagnostics(error.diagnostics);
      else if (error instanceof SonusEvaluationError) showDiagnostics(error.diagnostics);
    }
  }, 0);
}

function positionLiveControl(control: HTMLElement): void {
  const sourceEnd = Number(control.dataset.sourceEnd);
  if (!Number.isFinite(sourceEnd)) return;
  const anchor = editorOffsetRect(sourceEnd);
  if (!anchor) return;
  const host = liveControlLayer.getBoundingClientRect();
  control.style.left = `${anchor.left - host.left + 3}px`;
  control.style.top = `${anchor.top - host.top + 3}px`;
}

function repositionLiveControls(): void {
  for (const control of liveControlLayer.querySelectorAll<HTMLElement>('.live-parameter-control')) {
    positionLiveControl(control);
  }
}

function replaceLiveControlValue(
  control: HTMLElement,
  value: number,
  updatePolicy: ParameterUpdatePolicy,
): void {
  const start = Number(control.dataset.sourceStart);
  const end = Number(control.dataset.sourceEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return;
  const step = Number(control.dataset.step ?? '1');
  const replacement = step < 1 ? Number(value).toFixed(Math.max(0, Math.ceil(-Math.log10(step)))).replace(/0+$/, '').replace(/\.$/, '') : String(Math.round(value));
  const selectionStart = editor.selectionStart;
  const selectionEnd = editor.selectionEnd;
  const selectionDirection = editor.selectionDirection ?? 'none';
  const before = editor.value.slice(0, start);
  const after = editor.value.slice(end);
  editor.value = `${before}${replacement}${after}`;
  const delta = replacement.length - (end - start);
  control.dataset.sourceEnd = String(end + delta);
  for (const other of liveControlLayer.querySelectorAll<HTMLElement>('.live-parameter-control')) {
    if (other === control) continue;
    const otherStart = Number(other.dataset.sourceStart);
    const otherEnd = Number(other.dataset.sourceEnd);
    if (Number.isFinite(otherStart) && otherStart >= end) other.dataset.sourceStart = String(otherStart + delta);
    if (Number.isFinite(otherEnd) && otherEnd >= end) other.dataset.sourceEnd = String(otherEnd + delta);
  }
  const shift = (position: number): number => position <= start ? position : position >= end ? position + delta : start + replacement.length;
  editor.setSelectionRange(shift(selectionStart), shift(selectionEnd), selectionDirection);
  const readout = control.querySelector<HTMLElement>('.live-parameter-value');
  if (readout) readout.textContent = replacement;
  repositionLiveControls();
  if (updatePolicy === 'continuous') {
    scheduleLiveControlRuntimeUpdate(
      control.dataset.targetKind ?? '',
      control.dataset.targetName ?? '',
      control.dataset.property ?? '',
      Number(replacement),
    );
  }
}

function renderLiveControls(): void {
  liveControlLayer.replaceChildren();
  const controls = scanLiveControls(editor.value);
  if (controls.length === 0) return;
  for (const entry of controls) {
    const control = document.createElement('div');
    control.className = 'live-parameter-control';
    control.dataset.sourceStart = String(entry.start);
    control.dataset.sourceEnd = String(entry.end);
    control.dataset.sourceLine = String(entry.line);
    control.dataset.targetKind = entry.targetKind;
    control.dataset.targetName = entry.targetName;
    control.dataset.property = entry.property;
    control.dataset.updatePolicy = entry.updatePolicy;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(entry.min ?? 0);
    slider.max = String(entry.max ?? 100);
    slider.step = String(entry.step ?? 1);
    control.dataset.step = String(entry.step ?? 1);
    slider.value = String(entry.value);
    slider.setAttribute('aria-label', `Live ${entry.label ?? entry.property}`);
    control.title = entry.label ?? entry.property;
    slider.addEventListener('pointerdown', (event) => event.stopPropagation());
    slider.addEventListener('input', () =>
      replaceLiveControlValue(control, Number(slider.value), entry.updatePolicy)
    );
    slider.addEventListener('change', () => {
      // `continuous` controls have already streamed their intermediate values.
      // `commit` controls reach the runtime only here, through one hot-reload.
      commitLiveControlSource();
      renderSyntaxLayer();
      renderLineGutter();
      renderLiveControls();
    });

    const readout = document.createElement('span');
    readout.className = 'live-parameter-value';
    readout.textContent = (entry.step ?? 1) < 1 ? String(entry.value) : String(Math.round(entry.value));
    control.append(slider, readout);
    liveControlLayer.append(control);
    positionLiveControl(control);
  }
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
  let disabledBlockIndent: number | null = null;
  lines.forEach((line, index) => {
    const physicalLine = index + 1;
    const row = document.createElement('div');
    row.className = 'syntax-line';
    if (foldMarkerId(line)) {
      row.classList.add('syntax-fold-placeholder');
      row.textContent = '⋯';
      syntaxLayer.append(row);
      return;
    }
    const commentAt = commentStart(line);
    const codePart = commentAt < 0 ? line : line.slice(0, commentAt);
    const trimmedCode = codePart.trim();
    const indentation = codePart.length - codePart.trimStart().length;
    if (trimmedCode && disabledBlockIndent !== null && indentation <= disabledBlockIndent) disabledBlockIndent = null;
    const disabledHeader = /^_(?:VOICE|FILTER|FX|CLOCK|DRUMKIT)\b/i.test(trimmedCode);
    if (disabledHeader) disabledBlockIndent = indentation;
    if (disabledHeader || (disabledBlockIndent !== null && (!trimmedCode || indentation > disabledBlockIndent))) {
      row.classList.add('syntax-disabled-object');
    }
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

  renderLiveControls();
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
  renderLiveControls();
}

function syncLineGutter(): void {
  lineGutterContent.style.transform = `translateY(${-editor.scrollTop}px)`;
}

function setSourceText(text: string): void {
  clearDiagnostic();
  savedEditorSelection = null;
  collapsedEditorBlocks.clear();
  nextCollapsedEditorBlockId = 1;
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

function editorOffsetRect(offset: number): DOMRect | null {
  const safeOffset = Math.max(0, Math.min(editor.value.length, offset));
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
  mirror.style.tabSize = style.tabSize;

  mirror.append(document.createTextNode(editor.value.slice(0, safeOffset)));
  const marker = document.createElement('span');
  marker.style.display = 'inline-block';
  marker.style.width = '0';
  marker.style.height = '1em';
  marker.style.verticalAlign = 'top';
  marker.textContent = '\u200b';
  mirror.append(marker);
  document.body.append(mirror);

  const markerRect = marker.getBoundingClientRect();
  mirror.remove();

  const left = markerRect.left - editor.scrollLeft;
  const physicalLine = editor.value.slice(0, safeOffset).split('\n').length;
  const top = markerRect.top - editor.scrollTop + inlineSpacerBeforePhysicalLine(physicalLine);
  return new DOMRect(left, top, 0, markerRect.height || Number.parseFloat(style.lineHeight) || 24);
}

function caretRect(): DOMRect | null {
  return editorOffsetRect(editorCaretOffset());
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
  cancelPendingLiveUpdate();
  runtime.stopExecution({ preserveTails: true });
  audioEngine.setClockTransport(false);
  setCodeRunning(false);
  syncViews();
  notify('transport stopped · fx tails preserved');
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
    case 'about':
      leaveCommandMode();
      showScreen('about');
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
      activeCapabilities = new Set();
      activeTuningHz = 440;
      activeUseDirective = null;
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
      const applied = codeRunning ? recompileLiveCode() : evaluateLiveSource();
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
    case 'life': {
      const action = args[0]?.toLowerCase();
      if (action !== 'reset' || args.length > 2) {
        notify('usage: :life reset [name]');
        leaveCommandMode();
        return;
      }
      const target = args[1];
      const reset = runtime.resetLife(target);
      syncViews();
      leaveCommandMode();
      if (reset.length === 0) notify(target ? `unknown SEQ life: ${target}` : 'no active SEQ life');
      else notify(target ? `life ${target} reset` : `reset ${reset.length} life sequence${reset.length === 1 ? '' : 's'}`);
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

type LiveDisableDescriptor = {
  kind: 'voice' | 'filter' | 'fx' | 'clock' | 'drumkit';
  name: string;
  disabled: boolean;
};

let liveDisableSnapshot = new Map<string, boolean>();

function liveDisableDescriptors(source: string): LiveDisableDescriptor[] {
  const descriptors: LiveDisableDescriptor[] = [];
  const scopes: Array<{ indent: number; kind: string; name: string }> = [];

  for (const rawLine of source.split('\n')) {
    const code = rawLine.slice(0, commentStart(rawLine) < 0 ? rawLine.length : commentStart(rawLine));
    const trimmed = code.trim();
    if (!trimmed) continue;
    const indent = code.length - code.trimStart().length;
    while (scopes.length > 0 && indent <= scopes[scopes.length - 1].indent) scopes.pop();

    const master = trimmed.match(/^(_)?CLOCK\s+SET\b/i);
    if (master) {
      descriptors.push({ kind: 'clock', name: 'Clock', disabled: Boolean(master[1]) });
      continue;
    }
    const namedClock = trimmed.match(/^(_)?CLOCK\s+([A-Za-z_][A-Za-z0-9_]*)\b/i);
    if (namedClock && !/^set$/i.test(namedClock[2])) {
      descriptors.push({ kind: 'clock', name: namedClock[2], disabled: Boolean(namedClock[1]) });
      continue;
    }
    const drumkit = trimmed.match(/^(_)?DRUMKIT\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+WITH\s+VIEW(?:\s+\d+\s+STEPS)?)?\s*:/i);
    if (drumkit) {
      descriptors.push({ kind: 'drumkit', name: drumkit[2], disabled: Boolean(drumkit[1]) });
      scopes.push({ indent, kind: 'drumkit', name: drumkit[2] });
      continue;
    }
    const voice = trimmed.match(/^(_)?VOICE\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/i);
    if (voice) {
      descriptors.push({ kind: 'voice', name: voice[2], disabled: Boolean(voice[1]) });
      scopes.push({ indent, kind: 'voice', name: voice[2] });
      continue;
    }
    const fx = trimmed.match(/^(_)?FX\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/i);
    if (fx) {
      descriptors.push({ kind: 'fx', name: fx[2], disabled: Boolean(fx[1]) });
      scopes.push({ indent, kind: 'fx', name: fx[2] });
      continue;
    }
    const filter = trimmed.match(/^(_)?FILTER\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/i);
    if (filter) {
      const owner = [...scopes].reverse().find((scope) => scope.kind === 'voice');
      const name = owner ? `__filter_${owner.name}_${filter[2]}` : filter[2];
      descriptors.push({ kind: 'filter', name, disabled: Boolean(filter[1]) });
      scopes.push({ indent, kind: 'filter', name });
    }
  }
  return descriptors;
}

function syncLiveDisableSnapshot(source = sourceText()): void {
  liveDisableSnapshot = new Map(
    liveDisableDescriptors(source).map((descriptor) => [`${descriptor.kind}:${descriptor.name}`, descriptor.disabled]),
  );
}

function applyImmediateLiveDisableEdits(): void {
  if (!codeRunning) return;
  const next = liveDisableDescriptors(sourceText());
  const nextSnapshot = new Map<string, boolean>();
  for (const descriptor of next) {
    const key = `${descriptor.kind}:${descriptor.name}`;
    nextSnapshot.set(key, descriptor.disabled);
    const previous = liveDisableSnapshot.get(key);
    if (previous === undefined || previous === descriptor.disabled) continue;
    if (descriptor.kind === 'clock' && descriptor.name === 'Clock' && previous && !descriptor.disabled) {
      runtime.restartMusicalEpoch();
    }
    if (descriptor.kind === 'drumkit') runtime.setLiveDrumkitDisabled(descriptor.name, descriptor.disabled);
    else audioEngine.setLiveObjectDisabled(descriptor.kind, descriptor.name, descriptor.disabled);
  }
  liveDisableSnapshot = nextSnapshot;
}

function afterEditorMutation(): void {
  normalizeLanguageCommandCase();
  applyImmediateLiveDisableEdits();
  refreshInlineViewEditingPreview();
  renderSyntaxLayer();
  renderLineGutter();
  scheduleStoppedPreview();
  requestAnimationFrame(positionBlockCaret);
}

function toggleLineComments(): void {
  const value = editor.value;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const direction = editor.selectionDirection ?? 'none';
  const firstLineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const effectiveEnd = end > start && value[end - 1] === '\n' ? end - 1 : end;
  const nextNewline = value.indexOf('\n', effectiveEnd);
  const lastLineEnd = nextNewline < 0 ? value.length : nextNewline;
  const block = value.slice(firstLineStart, lastLineEnd);
  const lines = block.split('\n');
  const nonBlank = lines.filter((line) => line.length > 0);
  const uncomment = nonBlank.length > 0 && nonBlank.every((line) => line.startsWith('//'));
  const transformed = lines.map((line) => {
    if (!line) return line;
    if (uncomment) return line.startsWith('// ') ? line.slice(3) : line.startsWith('//') ? line.slice(2) : line;
    return `// ${line}`;
  });
  const replacement = transformed.join('\n');
  const firstDelta = transformed[0].length - lines[0].length;
  const totalDelta = replacement.length - block.length;

  editor.setRangeText(replacement, firstLineStart, lastLineEnd, 'preserve');
  if (start === end) {
    const caret = Math.max(firstLineStart, start + firstDelta);
    editor.setSelectionRange(caret, caret, direction);
  } else {
    const nextStart = Math.max(firstLineStart, start + firstDelta);
    const nextEnd = Math.max(nextStart, end + totalDelta);
    editor.setSelectionRange(nextStart, nextEnd, direction);
  }
  afterEditorMutation();
}

function objectHeaderOffsets(source: string): number[] {
  const offsets: number[] = [];
  const lines = source.split('\n');
  let offset = 0;
  for (const line of lines) {
    const commentAt = commentStart(line);
    const code = commentAt < 0 ? line : line.slice(0, commentAt);
    if (/^\s*_?(VOICE|DRUMKIT|FX|FILTER|MOD|SEQ|REGISTER|LOGIC|CLOCK)\b/i.test(code)) {
      offsets.push(offset + (line.match(/^\s*/)?.[0].length ?? 0));
    }
    offset += line.length + 1;
  }
  return offsets;
}

function navigateObject(direction: -1 | 1): void {
  const headers = objectHeaderOffsets(editor.value);
  if (headers.length === 0) {
    notify('no objects');
    return;
  }

  const caret = editor.selectionStart;
  let target: number | undefined;
  if (direction > 0) {
    target = headers.find((offset) => offset > caret);
  } else {
    const currentOrPrevious = headers.filter((offset) => offset < caret);
    target = currentOrPrevious.at(-1);
  }

  if (target === undefined) {
    notify(direction > 0 ? 'last object' : 'first object');
    return;
  }

  editor.focus();
  editor.setSelectionRange(target, target);
  requestAnimationFrame(positionBlockCaret);
}

function toggleCurrentObjectDisabled(): void {
  const value = editor.value;
  const caret = editor.selectionStart;
  const lineEnd = value.indexOf('\n', caret);
  const throughCurrentLine = value.slice(0, lineEnd < 0 ? value.length : lineEnd);
  const lines = throughCurrentLine.split('\n');
  let targetStart = -1;
  let targetLine = '';

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (/^\s*_?(VOICE|DRUMKIT|FX|FILTER|MOD|SEQ|REGISTER|LOGIC|CLOCK)\b/i.test(line)) {
      targetStart = lines.slice(0, index).reduce((total, item) => total + item.length + 1, 0);
      targetLine = line;
      break;
    }
  }

  if (targetStart < 0) {
    notify('no object at cursor');
    return;
  }

  const match = targetLine.match(/^(\s*)(_?)/);
  const indentation = match?.[1] ?? '';
  const disabled = match?.[2] === '_';
  const markerStart = targetStart + indentation.length;
  const originalStart = editor.selectionStart;
  const originalEnd = editor.selectionEnd;
  const direction = editor.selectionDirection ?? 'none';
  if (disabled) editor.setRangeText('', markerStart, markerStart + 1, 'preserve');
  else editor.setRangeText('_', markerStart, markerStart, 'preserve');

  const delta = disabled ? -1 : 1;
  const selectionStart = Math.max(0, originalStart + (originalStart > markerStart ? delta : 0));
  const selectionEnd = Math.max(selectionStart, originalEnd + (originalEnd > markerStart ? delta : 0));
  editor.setSelectionRange(selectionStart, selectionEnd, direction);
  afterEditorMutation();
}

document.addEventListener('selectionchange', () => {
  keepCaretOutOfFoldMarker();
  requestAnimationFrame(positionBlockCaret);
});
editor.addEventListener('input', () => {
  normalizeLanguageCommandCase();
  normalizeLiveControlSpacing();
  applyImmediateLiveDisableEdits();
  refreshInlineViewEditingPreview();
  renderSyntaxLayer();
  renderLineGutter();
  scheduleStoppedPreview();
  requestAnimationFrame(positionBlockCaret);
});
editor.addEventListener('keyup', () => requestAnimationFrame(positionBlockCaret));
editor.addEventListener('pointerdown', () => leaveBlockCaretTrail());
editor.addEventListener('pointerup', () => requestAnimationFrame(() => {
  moveCaretAcrossLiveControlGap('nearest');
  keepCaretOutOfFoldMarker();
  positionBlockCaret();
}));
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
  if (input.inputType.startsWith('insert') && editor.selectionStart === editor.selectionEnd) {
    keepCaretOutOfFoldMarker();
    moveCaretAcrossLiveControlGap('forward');
  }
  if (input.inputType === 'insertText' && input.data) flashAtCaret(input.data);
});

editor.addEventListener('keydown', (event) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
    leaveBlockCaretTrail();
  }

  if (event.key === 'ArrowDown' && skipFoldMarkerWithArrow('down')) {
    event.preventDefault();
    requestAnimationFrame(positionBlockCaret);
    return;
  }
  if (event.key === 'ArrowUp' && skipFoldMarkerWithArrow('up')) {
    event.preventDefault();
    requestAnimationFrame(positionBlockCaret);
    return;
  }
  if ((event.key === 'Backspace' || event.key === 'Delete') && protectFoldMarkerBoundary(event.key)) {
    event.preventDefault();
    return;
  }

  if (event.key === 'ArrowRight' && editor.selectionStart === editor.selectionEnd) {
    const caret = editor.selectionStart;
    const gap = liveControlGapRanges(editor.value).find((candidate) => candidate.start === caret);
    if (gap) { event.preventDefault(); editor.setSelectionRange(gap.end, gap.end); requestAnimationFrame(positionBlockCaret); return; }
  }
  if (event.key === 'ArrowLeft' && editor.selectionStart === editor.selectionEnd) {
    const caret = editor.selectionStart;
    const gap = liveControlGapRanges(editor.value).find((candidate) => candidate.end === caret);
    if (gap) { event.preventDefault(); editor.setSelectionRange(gap.start, gap.start); requestAnimationFrame(positionBlockCaret); return; }
  }
  if (event.key === 'Backspace' && editor.selectionStart === editor.selectionEnd) {
    const caret = editor.selectionStart;
    const gap = liveControlGapRanges(editor.value).find((candidate) => candidate.end === caret);
    if (gap) editor.setSelectionRange(gap.start, gap.start);
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    openQuickMenu();
    return;
  }

  if (event.key === '>' && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    enterCommandMode();
    return;
  }

  if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && (event.metaKey || event.ctrlKey) && !event.altKey) {
    event.preventDefault();
    event.stopPropagation();
    navigateObject(event.key === 'ArrowUp' ? -1 : 1);
    return;
  }

  if (event.key === '/' && (event.metaKey || event.ctrlKey) && !event.altKey) {
    event.preventDefault();
    event.stopPropagation();
    toggleLineComments();
    return;
  }

  if (event.key === 'Backspace' && (event.metaKey || event.ctrlKey)) {
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
    const currentLineStart = before.lastIndexOf('\n') + 1;
    const currentLineEndAt = editor.value.indexOf('\n', start);
    const currentLineEnd = currentLineEndAt < 0 ? editor.value.length : currentLineEndAt;
    const currentLine = editor.value.slice(currentLineStart, currentLineEnd);
    const trimmed = currentLine.trim();
    const currentIndent = currentLine.match(/^\s*/)?.[0] ?? '';

    // A collapsed block is editor-atomic. Enter on its header creates a new
    // peer line after the fold placeholder instead of reopening/editing its body.
    if (start === end && collapsibleObjectHeader(currentLine)) {
      const markerStart = currentLineEndAt < 0 ? -1 : currentLineEndAt + 1;
      if (markerStart >= 0) {
        const markerLineEndAt = editor.value.indexOf('\n', markerStart);
        const markerLineEnd = markerLineEndAt < 0 ? editor.value.length : markerLineEndAt;
        const markerLine = editor.value.slice(markerStart, markerLineEnd);
        if (foldMarkerId(markerLine)) {
          editor.setRangeText('\n', markerLineEnd, markerLineEnd, 'end');
          refreshInlineViewEditingPreview();
          renderSyntaxLayer();
          renderLineGutter();
          scheduleStoppedPreview();
          requestAnimationFrame(positionBlockCaret);
          return;
        }
      }
    }

    let indentation = currentIndent;
    if (!trimmed) indentation = currentIndent.length >= 4 ? currentIndent.slice(0, -4) : '';
    else if (/^_?(VOICE|DRUMKIT|FX|FILTER|MOD|SEQ|LOGIC|CLOCK)\b.*:\s*$/i.test(trimmed)) indentation = `${currentIndent}    `;

    editor.setRangeText(`\n${indentation}`, start, end, 'end');

    renderSyntaxLayer();
    renderLineGutter();
    scheduleStoppedPreview();

    requestAnimationFrame(positionBlockCaret);
    return;
  }

  if (event.key === 'Tab') {
    event.preventDefault();

    const start = editor.selectionStart;
    const end = editor.selectionEnd;

    // Emmet-style editor snippets. They are editor-only shorthand: the @ line
    // is replaced by normal Sonus source before the compiler/runtime sees it.
    if (!event.shiftKey && start === end) {
      const value = editor.value;
      const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
      const lineEndAt = value.indexOf('\n', start);
      const lineEnd = lineEndAt < 0 ? value.length : lineEndAt;
      const line = value.slice(lineStart, lineEnd);
      const indentation = line.match(/^\s*/)?.[0] ?? '';
      const snippetSource = line.trim();
      const expansion = expandEditorSnippet(snippetSource);
      if (expansion) {
        const replacement = expansion.text
          .split('\n')
          .map((item) => `${indentation}${item}`)
          .join('\n');
        editor.setRangeText(replacement, lineStart, lineEnd, 'end');
        refreshInlineViewEditingPreview();
        renderSyntaxLayer();
        renderLineGutter();
        scheduleStoppedPreview();
        notify(`expanded ${expansion.label}`);
        requestAnimationFrame(positionBlockCaret);
        return;
      }
      if (snippetSource.startsWith('@')) {
        notify(`unknown snippet: ${snippetSource}`);
        requestAnimationFrame(positionBlockCaret);
        return;
      }
    }

    const direction = editor.selectionDirection ?? 'none';
    const value = editor.value;
    const firstLineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const lastLineEndAt = value.indexOf('\n', end);
    const lastLineEnd = lastLineEndAt < 0 ? value.length : lastLineEndAt;
    const spansMultipleLines = value.slice(start, end).includes('\n');

    if (!event.shiftKey && start === end) {
      editor.setRangeText('    ', start, end, 'end');
    } else {
      const block = value.slice(firstLineStart, lastLineEnd);
      const lines = block.split('\n');
      const transformed = event.shiftKey
        ? lines.map((line) => line.startsWith('    ') ? line.slice(4) : line.replace(/^ {1,3}/, ''))
        : lines.map((line) => `    ${line}`);
      const replacement = transformed.join('\n');

      let nextStart = start;
      let nextEnd = end;
      if (event.shiftKey) {
        const removedFirst = lines[0].length - transformed[0].length;
        const removedTotal = block.length - replacement.length;
        nextStart = Math.max(firstLineStart, start - removedFirst);
        nextEnd = Math.max(nextStart, end - removedTotal);
      } else {
        nextStart = start + 4;
        nextEnd = end + 4 * lines.length;
      }

      editor.setRangeText(replacement, firstLineStart, lastLineEnd, 'preserve');
      if (start === end && !spansMultipleLines) {
        editor.setSelectionRange(nextStart, nextStart, direction);
      } else {
        editor.setSelectionRange(nextStart, nextEnd, direction);
      }
    }

    refreshInlineViewEditingPreview();
    renderSyntaxLayer();
    renderLineGutter();
    scheduleStoppedPreview();
    requestAnimationFrame(positionBlockCaret);
    return;
  }
});


configVars.addEventListener('change', () => {
  appConfig.showVariables = configVars.checked;
  saveAppConfig();
  applyAppConfig();
});
configMetrics.addEventListener('change', () => {
  appConfig.showMetrics = configMetrics.checked;
  saveAppConfig();
  applyAppConfig();
});
configAssets.addEventListener('change', () => {
  appConfig.showAssets = configAssets.checked;
  saveAppConfig();
  applyAppConfig();
});
configDsp.addEventListener('change', () => {
  appConfig.showDspStatus = configDsp.checked;
  saveAppConfig();
  applyAppConfig();
});
configLiveRate.addEventListener('change', () => {
  const hz = Number(configLiveRate.value);
  appConfig.liveControlHz = hz === 30 || hz === 20 || hz === 15 ? hz : 60;
  saveAppConfig();
  applyAppConfig();
});
configObjectShortcut.addEventListener('change', () => commitShortcutKey('object', configObjectShortcut.value));
configSchemeShortcut.addEventListener('change', () => commitShortcutKey('scheme', configSchemeShortcut.value));
configObjectShortcut.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); configObjectShortcut.blur(); }
});
configSchemeShortcut.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); configSchemeShortcut.blur(); }
});
configOutputLevel.addEventListener('input', () => {
  const level = Math.max(0, Math.min(200, Number(configOutputLevel.value)));
  appConfig.outputLevel = level;
  configOutputLevelValue.textContent = `${Math.round(level)}%`;
  audioEngine.setHardwareOutputLevel(level);
  saveAppConfig();
});
configSampleRate.addEventListener('change', () => {
  const value = Number(configSampleRate.value);
  const sampleRate: SampleRateChoice = value === 44100 || value === 48000 || value === 88200 || value === 96000 ? value : 0;
  requestAudioConfigRestart({ sampleRate, outputDeviceId: configOutput.value, latencyMode: configLatencyMode.value as AudioLatencyMode });
});
configOutput.addEventListener('change', () => {
  requestAudioConfigRestart({ sampleRate: Number(configSampleRate.value) as SampleRateChoice, outputDeviceId: configOutput.value, latencyMode: configLatencyMode.value as AudioLatencyMode });
});
configLatencyMode.addEventListener('change', () => {
  requestAudioConfigRestart({ sampleRate: Number(configSampleRate.value) as SampleRateChoice, outputDeviceId: configOutput.value, latencyMode: configLatencyMode.value as AudioLatencyMode });
});
audioConfigCancel.addEventListener('click', cancelAudioConfigRestart);
audioConfigApply.addEventListener('click', () => { void applyAudioConfigRestart(); });
configScreen.addEventListener('pointerdown', (event) => {
  const row = (event.target as Element).closest<HTMLElement>('.config-row[data-config-key]');
  if (!row) return;
  const rows = configRows();
  const index = rows.indexOf(row);
  if (index >= 0) { configSelectionIndex = index; updateConfigSelection(); }
});
capabilityCancel.addEventListener('click', cancelCapabilityRestart);
capabilityApply.addEventListener('click', () => { void applyCapabilityRestart(); });

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
  if (!audioConfigRestartOverlay.classList.contains('hidden')) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); cancelAudioConfigRestart(); }
    else if (event.key === 'Enter') { event.preventDefault(); event.stopImmediatePropagation(); void applyAudioConfigRestart(); }
    return;
  }

  if (!quickMenuOverlay.classList.contains('hidden')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.key === 'Escape') closeQuickMenu();
    else if (event.key === '>') { closeQuickMenu(); enterCommandMode(); }
    else if (/^[caslrn]$/i.test(event.key)) void runQuickMenuAction(event.key);
    return;
  }

  if (!capabilityRestartOverlay.classList.contains('hidden')) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); cancelCapabilityRestart(); }
    else if (event.key === 'Enter') { event.preventDefault(); event.stopImmediatePropagation(); void applyCapabilityRestart(); }
    return;
  }

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

  if (screen === 'config') {
    const activeTextInput = document.activeElement === configObjectShortcut || document.activeElement === configSchemeShortcut;
    if (activeTextInput) {
      if (event.key === 'Escape') { event.preventDefault(); (document.activeElement as HTMLInputElement).blur(); return; }
      if (event.key === 'Enter') { event.preventDefault(); (document.activeElement as HTMLInputElement).blur(); return; }
      return;
    }
    if (event.key === 'Escape') { event.preventDefault(); showScreen('live'); return; }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const rows = configRows();
      if (rows.length > 0) configSelectionIndex = (configSelectionIndex + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      updateConfigSelection();
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      activateConfigRow(event.key === 'ArrowRight' ? 1 : -1);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activateConfigRow(0);
      return;
    }
  }

  if (commandMode) return;

  if (screen === 'live' && event.key === '>' && document.activeElement !== command) {
    event.preventDefault();
    event.stopImmediatePropagation();
    enterCommandMode();
    return;
  }

  const commandModifier = event.metaKey || event.ctrlKey;
  if (commandModifier && !event.altKey && screen === 'live' && document.activeElement === editor && shortcutMatches(event, appConfig.objectToggleKey)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleCurrentObjectDisabled();
    return;
  }

  if (commandModifier && !event.altKey && (screen === 'live' || screen === 'scheme') && shortcutMatches(event, appConfig.schemeToggleKey)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    showScreen(screen === 'live' ? 'scheme' : 'live');
    return;
  }

  if (event.key === 'Escape' && screen === 'live') {
    event.preventDefault();
    openQuickMenu();
    return;
  }
  if (event.key === 'Escape' && (screen === 'help' || screen === 'about' || screen === 'scheme')) {
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
