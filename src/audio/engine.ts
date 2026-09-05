export type AudioEngineState = 'idle' | 'running' | 'suspended';

export interface AudioEngineSnapshot {
  state: AudioEngineState;
  sampleRate: number | null;
  testFrequency: number | null;
  objectCount: number;
  routeCount: number;
}

export type SignalKind = 'signal' | 'gate' | 'trigger';

function publicAssetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  const cleanPath = path.replace(/^\/+/, '');
  return `${cleanBase}${cleanPath}`;
}

const DEFAULT_HARDWARE_OUTPUT_GAIN = 0.12;
const DEFAULT_HARDWARE_OUTPUT_LEVEL = 100;

export interface AudioProgram {
  clock: { bpm: number; jitter: number; drift: number };
  mainLevel: number;
  clockSources: Array<{ name: string; rate: number; jitter: number; drift: number; enabled: boolean }>;
  oscillators: Array<{
    name: string;
    frequency: number;
  }>;
  voices: Array<{
    name: string;
    enabled: boolean;
    model: number;
    lpg: boolean;
    level: number;
    frequency: number;
    dynamicPitch?: boolean;
    harmo: number;
    timbre: number;
    morph: number;
  }>;
  matters: Array<{
    name: string;
    enabled: boolean;
    note: number;
    dynamicPitch?: boolean;
    level: number;
    drive: { kind: string; values: number[] } | null;
    bowLevel: number;
    bowTimbre: number;
    blowLevel: number;
    blowMeta: number;
    blowTimbre: number;
    strikeLevel: number;
    strikeMeta: number;
    strikeTimbre: number;
    signature: number;
    geometry: number;
    brightness: number;
    damping: number;
    position: number;
    space: number;
  }>;
  resonators: Array<{
    name: string;
    enabled: boolean;
    model: number;
    polyphony: 1 | 2 | 4;
    note: number;
    dynamicPitch?: boolean;
    level: number;
    structure: number;
    brightness: number;
    damping: number;
    position: number;
  }>;
  swells: Array<{
    name: string;
    frequency: number;
    slope: number;
    shape: number;
    smooth: number;
    shift: number;
    mode: number;
    outputMode: number;
    range: number;
  }>;
  dices: Array<{
    name: string;
    frequency: number;
    spread: number;
    bias: number;
    steps: number;
    deja: number;
    length: number;
    diversity: number;
  }>;
  mists: Array<{
    name: string;
    bypassed: boolean;
    position: number;
    size: number;
    pitch: number;
    density: number;
    texture: number;
    mix: number;
    spread: number;
    feedback: number;
    reverb: number;
    freeze: boolean;
    reverse: boolean;
    mode: number;
  }>;
  skies: Array<{
    name: string;
    bypassed: boolean;
    size: number;
    decay: number;
    damp: number;
    bloom: number;
    predelay: number;
    motion: number;
    width: number;
    mix: number;
    freeze: boolean;
  }>;
  delays: Array<{
    name: string;
    bypassed: boolean;
    lines: number;
    timeMs: number;
    spread: number;
    spreadLoose: number;
    feedback: number;
    reverse: number;
    pitchProbability: number;
    pitchShifts: number[];
    tape: number;
    diffusion: number;
    pingpong: number;
    mix: number;
  }>;
  filters: Array<{
    name: string;
    bypassed: boolean;
    model: 'svf';
    ownerVoice: string | null;
    displayName: string;
    cutoff: number;
    resonance: number;
    drive: number;
  }>;
  gains: Array<{
    name: string;
    level: number;
  }>;
  routes: Array<{
    source: string;
    destination: string;
    amount: number;
  }>;
  views: Array<{
    signal: string;
    kind: SignalKind;
  }>;
  monitorViews: Array<{
    signal: string;
    kind: SignalKind;
  }>;
}

export type AudioEngineListener = (snapshot: AudioEngineSnapshot) => void;
export type AudioOutputDevice = { deviceId: string; label: string };

export type AudioLatencyMode = 'interactive' | 'balanced' | 'playback';

export type AudioEngineConfiguration = {
  requestedSampleRate: number | null;
  requestedOutputDeviceId: string | null;
  requestedLatencyMode: AudioLatencyMode;
  effectiveSampleRate: number | null;
  baseLatencyMs: number | null;
  outputLatencyMs: number | null;
};


interface OscillatorVoice {
  oscillator: OscillatorNode;
  output: GainNode;
  frequency: number;
}

interface GainVoice {
  node: GainNode;
  level: number;
}

interface MacroVoice {
  enabled: boolean;
  node: AudioWorkletNode;
  outGain: GainNode;
  auxGain: GainNode;
  vOctInput: GainNode;
  harmoInput: GainNode;
  timbreInput: GainNode;
  morphInput: GainNode;
  model: number;
  lpg: boolean;
  level: number;
  frequency: number;
  harmo: number;
  timbre: number;
  morph: number;
}

interface MatterVoice {
  enabled: boolean;
  node: AudioWorkletNode;
  mainGain: GainNode;
  auxGain: GainNode;
  note: number;
  level: number;
  drive: { kind: string; values: number[] } | null;
  bowLevel: number;
  bowTimbre: number;
  blowLevel: number;
  blowMeta: number;
  blowTimbre: number;
  strikeLevel: number;
  strikeMeta: number;
  strikeTimbre: number;
  signature: number;
  geometry: number;
  brightness: number;
  damping: number;
  position: number;
  space: number;
}

interface ResonatorVoice {
  enabled: boolean;
  node: AudioWorkletNode;
  mainGain: GainNode;
  auxGain: GainNode;
  note: number;
  level: number;
  model: number;
  polyphony: 1 | 2 | 4;
  structure: number;
  brightness: number;
  damping: number;
  position: number;
}

interface SwellVoice {
  node: AudioWorkletNode;
  frequency: number;
  slope: number;
  shape: number;
  smooth: number;
  shift: number;
  mode: number;
  outputMode: number;
  range: number;
  monitorValues: [number, number, number, number];
}

interface DicesVoice {
  node: AudioWorkletNode;
  frequency: number;
  spread: number;
  bias: number;
  steps: number;
  deja: number;
  length: number;
  diversity: number;
  monitorValues: [number, number, number, number];
}


interface MistVoice {
  bypassed: boolean;
  node: AudioWorkletNode;
  monoInput: GainNode;
  inputL: GainNode;
  inputR: GainNode;
  wetInputL: GainNode;
  wetInputR: GainNode;
  dryL: GainNode;
  dryR: GainNode;
  wetL: GainNode;
  wetR: GainNode;
  outputL: GainNode;
  outputR: GainNode;
  position: number;
  size: number;
  pitch: number;
  density: number;
  texture: number;
  mix: number;
  spread: number;
  feedback: number;
  reverb: number;
  freeze: boolean;
  reverse: boolean;
  mode: number;
}

interface SkyVoice {
  bypassed: boolean;
  node: AudioWorkletNode;
  inputMerger: ChannelMergerNode;
  outputSplitter: ChannelSplitterNode;
  monoInput: GainNode;
  inputL: GainNode;
  inputR: GainNode;
  wetInputL: GainNode;
  wetInputR: GainNode;
  dryL: GainNode;
  dryR: GainNode;
  wetL: GainNode;
  wetR: GainNode;
  outputL: GainNode;
  outputR: GainNode;
  size: number;
  decay: number;
  damp: number;
  bloom: number;
  predelay: number;
  motion: number;
  width: number;
  mix: number;
  freeze: boolean;
}

interface DelayVoice {
  bypassed: boolean;
  node: AudioWorkletNode;
  inputMerger: ChannelMergerNode;
  outputSplitter: ChannelSplitterNode;
  monoInput: GainNode;
  inputL: GainNode;
  inputR: GainNode;
  outputL: GainNode;
  outputR: GainNode;
  lines: number;
  timeMs: number;
  spread: number;
  spreadLoose: number;
  feedback: number;
  reverse: number;
  pitchProbability: number;
  pitchShifts: number[];
  tape: number;
  diffusion: number;
  pingpong: number;
  mix: number;
}

interface SvfFilterVoice {
  bypassed: boolean;
  node: AudioWorkletNode;
  input: GainNode;
  lowOut: GainNode;
  highOut: GainNode;
  bandOut: GainNode;
  notchOut: GainNode;
  peakOut: GainNode;
  ownerVoice: string | null;
  displayName: string;
  cutoff: number;
  resonance: number;
  drive: number;
}

interface SignalSource {
  node: AudioNode;
  output: number;
}

interface SignalDestination {
  node: AudioNode;
  input: number;
}

interface TriggerVisualEvent {
  emittedAt: number;
  travelDuration: number;
}

interface ClockSource {
  enabled: boolean;
  node: AudioWorkletNode;
  rate: number;
  jitter: number;
  drift: number;
  lastTriggerTime: number | null;
  lastPeriodMs: number | null;
  triggerCount: number;
  visualEvents: TriggerVisualEvent[];
}

interface ViewTap {
  analyser: AnalyserNode;
  kind: SignalKind;
}

interface AudioRoute {
  gain: GainNode;
  amount: number;
  source: string;
  destination: string;
}

export class AudioEngine {
  private context: AudioContext | null = null;
  private requestedSampleRate: number | null = null;
  private requestedOutputDeviceId: string | null = null;
  private requestedLatencyMode: AudioLatencyMode = 'interactive';
  private master: GainNode | null = null;
  private audioOutL: GainNode | null = null;
  private audioOutR: GainNode | null = null;
  private audioMerger: ChannelMergerNode | null = null;
  private hardwareGain: GainNode | null = null;
  private hardwareOutputLevel = DEFAULT_HARDWARE_OUTPUT_LEVEL;
  private testOscillator: OscillatorNode | null = null;
  private testGain: GainNode | null = null;
  private oscillators = new Map<string, OscillatorVoice>();
  private gains = new Map<string, GainVoice>();
  private voices = new Map<string, MacroVoice>();
  private matters = new Map<string, MatterVoice>();
  private resonators = new Map<string, ResonatorVoice>();
  private swells = new Map<string, SwellVoice>();
  private dices = new Map<string, DicesVoice>();
  private mists = new Map<string, MistVoice>();
  private skies = new Map<string, SkyVoice>();
  private delays = new Map<string, DelayVoice>();
  private filters = new Map<string, SvfFilterVoice>();
  private clocks = new Map<string, ClockSource>();
  private clockTriggerListeners = new Map<string, Set<() => void>>();
  private masterClockBpm = 0;
  private masterClockEnabled = true;
  private clockTransportRunning = true;
  private voiceWasmBytes: ArrayBuffer | null = null;
  private matterWasmBytes: ArrayBuffer | null = null;
  private resonatorWasmBytes: ArrayBuffer | null = null;
  private swellWasmBytes: ArrayBuffer | null = null;
  private dicesWasmBytes: ArrayBuffer | null = null;
  private mistWasmBytes: ArrayBuffer | null = null;
  private skyWasmBytes: ArrayBuffer | null = null;
  private delayWasmBytes: ArrayBuffer | null = null;
  private daisyFiltersWasmBytes: ArrayBuffer | null = null;
  private voiceWorkletLoaded = false;
  private matterWorkletLoaded = false;
  private resonatorWorkletLoaded = false;
  private swellWorkletLoaded = false;
  private dicesWorkletLoaded = false;
  private mistWorkletLoaded = false;
  private skyWorkletLoaded = false;
  private delayWorkletLoaded = false;
  private daisyFiltersWorkletLoaded = false;
  private clockWorkletLoaded = false;
  private pendingProgram: AudioProgram | null = null;
  private routes = new Map<string, AudioRoute>();
  private views = new Map<string, ViewTap>();
  private controlMonitors = new Map<string, AnalyserNode>();
  private listeners = new Set<AudioEngineListener>();
  private slowScopeHistory = new Map<string, { values: number[]; lastSampleAt: number }>();

  snapshot(): AudioEngineSnapshot {
    return {
      state: this.context === null
        ? 'idle'
        : this.context.state === 'running'
          ? 'running'
          : 'suspended',
      sampleRate: this.context?.sampleRate ?? null,
      testFrequency: this.testOscillator?.frequency.value ?? null,
      objectCount: this.oscillators.size + this.gains.size + this.voices.size + this.matters.size + this.resonators.size + this.swells.size + this.dices.size + this.mists.size + this.skies.size + this.delays.size + this.filters.size + this.clocks.size,
      routeCount: this.routes.size,
    };
  }

  subscribe(listener: AudioEngineListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    const context = this.ensureContext();
    await this.applyRequestedOutputDevice(context);
    await this.ensureVoiceRuntime();
    await this.ensureMatterRuntime();
    await this.ensureResonatorRuntime();
    await this.ensureSwellRuntime();
    await this.ensureDicesRuntime();
    await this.ensureMistRuntime();
    await this.ensureSkyRuntime();
    await this.ensureDelayRuntime();
    await this.ensureDaisyFiltersRuntime();
    await this.ensureClockRuntime();
    if (context.state !== 'running') await context.resume();
    if (this.pendingProgram) {
      const program = this.pendingProgram;
      this.pendingProgram = null;
      this.applyProgram(program);
    }
    this.emit();
  }

  async stop(): Promise<void> {
    if (!this.context) return;
    this.stopTestTone();
    if (this.context.state === 'running') await this.context.suspend();
    this.emit();
  }

  setPreferredAudioConfiguration(options: { sampleRate: number | null; outputDeviceId: string | null; latencyMode?: AudioLatencyMode }): void {
    if (this.context) return;
    this.requestedSampleRate = options.sampleRate;
    this.requestedOutputDeviceId = options.outputDeviceId;
    this.requestedLatencyMode = options.latencyMode ?? this.requestedLatencyMode;
  }

  getAudioConfiguration(): AudioEngineConfiguration {
    const context = this.context;
    const outputLatency = context && 'outputLatency' in context
      ? Number((context as AudioContext & { outputLatency?: number }).outputLatency ?? NaN)
      : NaN;
    return {
      requestedSampleRate: this.requestedSampleRate,
      requestedOutputDeviceId: this.requestedOutputDeviceId,
      requestedLatencyMode: this.requestedLatencyMode,
      effectiveSampleRate: context?.sampleRate ?? null,
      baseLatencyMs: context ? context.baseLatency * 1000 : null,
      outputLatencyMs: Number.isFinite(outputLatency) ? outputLatency * 1000 : null,
    };
  }

  setHardwareOutputLevel(level: number): void {
    if (!Number.isFinite(level) || level < 0 || level > 200) {
      throw new RangeError('hardware output level must be between 0 and 200 percent');
    }
    this.hardwareOutputLevel = level;
    if (!this.hardwareGain || !this.context) return;
    const gain = DEFAULT_HARDWARE_OUTPUT_GAIN * (level / 100);
    this.hardwareGain.gain.setTargetAtTime(gain, this.context.currentTime, 0.008);
  }

  getHardwareOutputLevel(): number {
    return this.hardwareOutputLevel;
  }

  async listOutputDevices(): Promise<AudioOutputDevice[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((device) => device.kind === 'audiooutput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Audio output ${index + 1}`,
      }));
  }

  supportsOutputDeviceSelection(): boolean {
    if (typeof AudioContext === 'undefined') return false;
    return 'setSinkId' in AudioContext.prototype;
  }

  async restartAudioConfiguration(options: { sampleRate: number | null; outputDeviceId: string | null; latencyMode?: AudioLatencyMode }): Promise<void> {
    const wasRunning = this.context?.state === 'running';
    this.requestedSampleRate = options.sampleRate;
    this.requestedOutputDeviceId = options.outputDeviceId;
    this.requestedLatencyMode = options.latencyMode ?? this.requestedLatencyMode;
    await this.disposeAudioContext();
    const context = this.ensureContext();
    await this.applyRequestedOutputDevice(context);
    if (wasRunning && context.state !== 'running') await context.resume();
    this.emit();
  }

  applyProgram(program: AudioProgram, options: { hotReload?: boolean } = {}): void {
    const hotReload = options.hotReload ?? false;
    if ((program.voices.length > 0 && !this.voiceWorkletLoaded) ||
        (program.matters.length > 0 && !this.matterWorkletLoaded) ||
        (program.resonators.length > 0 && !this.resonatorWorkletLoaded) ||
        (program.swells.length > 0 && !this.swellWorkletLoaded) ||
        (program.dices.length > 0 && !this.dicesWorkletLoaded) ||
        (program.mists.length > 0 && !this.mistWorkletLoaded) ||
        (program.skies.length > 0 && !this.skyWorkletLoaded) ||
        (program.delays.length > 0 && !this.delayWorkletLoaded) ||
        (program.filters.length > 0 && !this.daisyFiltersWorkletLoaded)) {
      this.pendingProgram = program;
      return;
    }

    this.masterClockBpm = program.clock.bpm;
    const context = this.ensureContext();
    if (this.audioOutL && this.audioOutR) {
      const level = Math.max(0, Math.min(1, program.mainLevel / 100));
      this.audioOutL.gain.setTargetAtTime(level, context.currentTime, 0.008);
      this.audioOutR.gain.setTargetAtTime(level, context.currentTime, 0.008);
    }
    const desiredClockSources = new Map(program.clockSources.map((definition) => [definition.name, definition]));
    const desiredOscillators = new Map(program.oscillators.map((definition) => [definition.name, definition]));
    const desiredVoices = new Map(program.voices.map((definition) => [definition.name, definition]));
    const desiredMatters = new Map(program.matters.map((definition) => [definition.name, definition]));
    const desiredResonators = new Map(program.resonators.map((definition) => [definition.name, definition]));
    const desiredSwells = new Map(program.swells.map((definition) => [definition.name, definition]));
    const desiredDices = new Map(program.dices.map((definition) => [definition.name, definition]));
    const desiredMists = new Map(program.mists.map((definition) => [definition.name, definition]));
    const desiredSkies = new Map(program.skies.map((definition) => [definition.name, definition]));
    const desiredDelays = new Map(program.delays.map((definition) => [definition.name, definition]));
    const desiredFilters = new Map(program.filters.map((definition) => [definition.name, definition]));
    const desiredGains = new Map(program.gains.map((definition) => [definition.name, definition]));
    const desiredRoutes = new Map(program.routes.map((route) => [`${route.source}->${route.destination}`, route]));
    const desiredViews = new Map(program.monitorViews.map((view) => [view.signal, view]));

    for (const signal of this.views.keys()) {
      if (!desiredViews.has(signal)) this.removeView(signal);
    }

    for (const [name] of this.clocks) {
      if (!desiredClockSources.has(name)) this.removeClock(name);
    }

    for (const [key] of this.routes) {
      if (!desiredRoutes.has(key)) this.removeRoute(key);
    }

    for (const [name] of this.oscillators) {
      if (!desiredOscillators.has(name)) this.removeOscillator(name);
    }

    for (const [name] of this.gains) {
      if (!desiredGains.has(name)) this.removeGain(name);
    }

    for (const [name] of this.filters) {
      if (!desiredFilters.has(name)) this.removeFilter(name);
    }

    for (const [name] of this.voices) {
      if (!desiredVoices.has(name)) this.removeVoice(name);
    }

    for (const [name] of this.matters) {
      if (!desiredMatters.has(name)) this.removeMatter(name);
    }

    for (const [name] of this.resonators) {
      if (!desiredResonators.has(name)) this.removeResonator(name);
    }

    for (const [name] of this.swells) {
      if (!desiredSwells.has(name)) this.removeSwell(name);
    }


    for (const [name] of this.dices) {
      if (!desiredDices.has(name)) this.removeDices(name);
    }

    for (const [name] of this.mists) {
      if (!desiredMists.has(name)) this.removeMist(name);
    }

    for (const [name] of this.skies) {
      if (!desiredSkies.has(name)) this.removeSky(name);
    }
    for (const [name] of this.delays) {
      if (!desiredDelays.has(name)) this.removeDelay(name);
    }

    this.masterClockEnabled = desiredClockSources.get('Clock')?.enabled ?? true;
    for (const definition of program.clockSources) this.createOrUpdateClock(definition.name, definition.rate, definition.jitter, definition.drift, definition.enabled);
    this.updateAllClocks();

    for (const definition of program.oscillators) {
      this.createOscillator(definition.name);
      this.setOscillatorFrequency(definition.name, definition.frequency, false);
    }

    for (const definition of program.voices) {
      this.createVoice(definition);
      this.updateVoice(definition, hotReload);
    }

    for (const definition of program.matters) {
      this.createMatter(definition);
      this.updateMatter(definition, hotReload);
    }

    for (const definition of program.resonators) {
      this.createResonator(definition);
      this.updateResonator(definition, hotReload);
    }

    for (const definition of program.filters) {
      this.createFilter(definition);
      this.updateFilter(definition);
    }

    for (const definition of program.swells) {
      this.createSwell(definition);
      this.updateSwell(definition);
    }
    for (const definition of program.dices) {
      this.createDices(definition);
      this.updateDices(definition);
    }
    this.setModTransport(true);


    for (const definition of program.mists) {
      this.createMist(definition);
      this.updateMist(definition);
    }

    for (const definition of program.skies) {
      this.createSky(definition);
      this.updateSky(definition);
    }
    for (const definition of program.delays) {
      this.createDelay(definition);
      this.updateDelay(definition);
    }

    for (const definition of program.gains) {
      this.createGain(definition.name);
      this.setGainLevel(definition.name, definition.level, false);
    }

    for (const route of program.routes) {
      this.connect(route.source, route.destination, route.amount, false);
    }

    for (const view of program.monitorViews) this.createView(view.signal, view.kind);

    this.emit();
  }

  createOscillator(name: string): void {
    if (this.oscillators.has(name)) return;

    const context = this.ensureContext();
    const oscillator = context.createOscillator();
    const output = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, context.currentTime);
    output.gain.value = 1;
    oscillator.connect(output);
    oscillator.start();

    this.oscillators.set(name, {
      oscillator,
      output,
      frequency: 440,
    });
  }

  private createVoice(definition: AudioProgram['voices'][number]): void {
    if (this.voices.has(definition.name)) return;
    if (!this.voiceWorkletLoaded || !this.voiceWasmBytes) {
      throw new Error('Voice DSP is not ready; run :start after building the DSP');
    }

    const context = this.ensureContext();
    const wasmBytes = this.voiceWasmBytes.slice(0);
    const node = new AudioWorkletNode(context, 'sonus-voice', {
      numberOfInputs: 5,
      numberOfOutputs: 2,
      outputChannelCount: [1, 1],
      processorOptions: { wasmBytes },
    });
    const outGain = context.createGain();
    const auxGain = context.createGain();
    const vOctInput = context.createGain();
    const harmoInput = context.createGain();
    const timbreInput = context.createGain();
    const morphInput = context.createGain();
    outGain.gain.value = definition.level / 100;
    auxGain.gain.value = definition.level / 100;
    node.connect(outGain, 0, 0);
    node.connect(auxGain, 1, 0);
    vOctInput.gain.value = 1;
    harmoInput.gain.value = 1;
    timbreInput.gain.value = 1;
    morphInput.gain.value = 1;
    vOctInput.connect(node, 0, 1);
    harmoInput.connect(node, 0, 2);
    timbreInput.connect(node, 0, 3);
    morphInput.connect(node, 0, 4);

    this.voices.set(definition.name, {
      enabled: definition.enabled,
      node,
      outGain,
      auxGain,
      vOctInput,
      harmoInput,
      timbreInput,
      morphInput,
      model: definition.model,
      lpg: definition.lpg,
      level: definition.level,
      frequency: definition.frequency,
      harmo: definition.harmo,
      timbre: definition.timbre,
      morph: definition.morph,
    });
  }

  private updateVoice(definition: AudioProgram['voices'][number], hotReload = false): void {
    const voice = this.voices.get(definition.name);
    if (!voice) return;
    const frequency = hotReload && definition.dynamicPitch ? voice.frequency : definition.frequency;
    const unchanged = voice.enabled === definition.enabled
      && voice.model === definition.model
      && voice.lpg === definition.lpg
      && voice.level === definition.level
      && Math.abs(voice.frequency - frequency) < 0.0001
      && voice.harmo === definition.harmo
      && voice.timbre === definition.timbre
      && voice.morph === definition.morph;
    if (unchanged) return;

    const context = this.ensureContext();
    if (voice.enabled !== definition.enabled || voice.level !== definition.level) {
      const level = definition.enabled ? Math.max(0, Math.min(1, definition.level / 100)) : 0;
      voice.outGain.gain.setTargetAtTime(level, context.currentTime, 0.008);
      voice.auxGain.gain.setTargetAtTime(level, context.currentTime, 0.008);
    }
    voice.enabled = definition.enabled;
    voice.model = definition.model;
    voice.lpg = definition.lpg;
    voice.level = definition.level;
    voice.frequency = frequency;
    voice.harmo = definition.harmo;
    voice.timbre = definition.timbre;
    voice.morph = definition.morph;
    voice.node.port.postMessage({
      type: 'params',
      model: definition.model,
      lpg: definition.lpg,
      frequency,
      harmo: definition.harmo / 100,
      timbre: definition.timbre / 100,
      morph: definition.morph / 100,
    });
  }

  private createMatter(definition: AudioProgram['matters'][number]): void {
    if (this.matters.has(definition.name)) return;
    if (!this.matterWorkletLoaded || !this.matterWasmBytes) {
      throw new Error('Matter DSP is not ready; run :start after building the DSP');
    }

    const context = this.ensureContext();
    const node = new AudioWorkletNode(context, 'sonus-matter', {
      numberOfInputs: 2,
      numberOfOutputs: 2,
      outputChannelCount: [1, 1],
      processorOptions: { wasmBytes: this.matterWasmBytes.slice(0), hostSampleRate: context.sampleRate },
    });
    const mainGain = context.createGain();
    const auxGain = context.createGain();
    const level = Math.max(0, Math.min(1, definition.level / 100));
    mainGain.gain.value = level;
    auxGain.gain.value = level;
    node.connect(mainGain, 0, 0);
    node.connect(auxGain, 1, 0);
    this.matters.set(definition.name, {
      enabled: definition.enabled,
      node,
      mainGain,
      auxGain,
      note: definition.note,
      level: definition.level,
      drive: definition.drive,
      bowLevel: definition.bowLevel,
      bowTimbre: definition.bowTimbre,
      blowLevel: definition.blowLevel,
      blowMeta: definition.blowMeta,
      blowTimbre: definition.blowTimbre,
      strikeLevel: definition.strikeLevel,
      strikeMeta: definition.strikeMeta,
      strikeTimbre: definition.strikeTimbre,
      signature: definition.signature,
      geometry: definition.geometry,
      brightness: definition.brightness,
      damping: definition.damping,
      position: definition.position,
      space: definition.space,
    });
  }

  private updateMatter(definition: AudioProgram['matters'][number], hotReload = false): void {
    const matter = this.matters.get(definition.name);
    if (!matter) return;
    const note = hotReload && definition.dynamicPitch ? matter.note : definition.note;
    const sameDrive = JSON.stringify(matter.drive) === JSON.stringify(definition.drive);
    const unchanged = matter.enabled === definition.enabled
      && Math.abs(matter.note - note) < 0.0001
      && matter.level === definition.level
      && sameDrive
      && matter.bowLevel === definition.bowLevel
      && matter.bowTimbre === definition.bowTimbre
      && matter.blowLevel === definition.blowLevel
      && matter.blowMeta === definition.blowMeta
      && matter.blowTimbre === definition.blowTimbre
      && matter.strikeLevel === definition.strikeLevel
      && matter.strikeMeta === definition.strikeMeta
      && matter.strikeTimbre === definition.strikeTimbre
      && matter.signature === definition.signature
      && matter.geometry === definition.geometry
      && matter.brightness === definition.brightness
      && matter.damping === definition.damping
      && matter.position === definition.position
      && matter.space === definition.space;
    if (unchanged) return;

    const context = this.ensureContext();
    if (matter.enabled !== definition.enabled || matter.level !== definition.level) {
      const level = definition.enabled ? Math.max(0, Math.min(1, definition.level / 100)) : 0;
      matter.mainGain.gain.setTargetAtTime(level, context.currentTime, 0.008);
      matter.auxGain.gain.setTargetAtTime(level, context.currentTime, 0.008);
    }
    Object.assign(matter, {
      enabled: definition.enabled, note, level: definition.level, drive: definition.drive,
      bowLevel: definition.bowLevel, bowTimbre: definition.bowTimbre,
      blowLevel: definition.blowLevel, blowMeta: definition.blowMeta, blowTimbre: definition.blowTimbre,
      strikeLevel: definition.strikeLevel, strikeMeta: definition.strikeMeta, strikeTimbre: definition.strikeTimbre,
      signature: definition.signature, geometry: definition.geometry, brightness: definition.brightness,
      damping: definition.damping, position: definition.position, space: definition.space,
    });
    matter.node.port.postMessage({
      type: 'params', note, drive: definition.drive,
      bowLevel: definition.bowLevel / 100, bowTimbre: definition.bowTimbre / 100,
      blowLevel: definition.blowLevel / 100, blowMeta: definition.blowMeta / 100, blowTimbre: definition.blowTimbre / 100,
      strikeLevel: definition.strikeLevel / 100, strikeMeta: definition.strikeMeta / 100, strikeTimbre: definition.strikeTimbre / 100,
      signature: definition.signature / 100, geometry: definition.geometry / 100,
      brightness: definition.brightness / 100, damping: definition.damping / 100,
      position: definition.position / 100, space: definition.space / 100,
    });
  }

  triggerMatter(name: string): void {
    const matter = this.matters.get(name);
    if (!matter) throw new Error(`unknown Matter object: ${name}`);
    matter.node.port.postMessage({ type: 'trigger' });
  }

  private createResonator(definition: AudioProgram['resonators'][number]): void {
    if (this.resonators.has(definition.name)) return;
    if (!this.resonatorWorkletLoaded || !this.resonatorWasmBytes) {
      throw new Error('Resonator DSP is not ready; run :start after building the DSP');
    }

    const context = this.ensureContext();
    const node = new AudioWorkletNode(context, 'sonus-resonator', {
      numberOfInputs: 1,
      numberOfOutputs: 2,
      outputChannelCount: [1, 1],
      processorOptions: { wasmBytes: this.resonatorWasmBytes.slice(0), hostSampleRate: context.sampleRate },
    });
    const mainGain = context.createGain();
    const auxGain = context.createGain();
    const level = Math.max(0, Math.min(1, definition.level / 100));
    mainGain.gain.value = level;
    auxGain.gain.value = level;
    node.connect(mainGain, 0, 0);
    node.connect(auxGain, 1, 0);
    this.resonators.set(definition.name, {
      enabled: definition.enabled,
      node, mainGain, auxGain, note: definition.note, level: definition.level,
      model: definition.model, polyphony: definition.polyphony,
      structure: definition.structure,
      brightness: definition.brightness,
      damping: definition.damping,
      position: definition.position,
    });
    // The worklet starts with Rings' own defaults (model 0/modal). Send the
    // complete initial definition immediately so the first strum already uses
    // the SOUND selected by the program. Port message ordering guarantees this
    // params message is handled before a subsequent trigger/strum message.
    node.port.postMessage({
      type: 'params', model: definition.model, polyphony: definition.polyphony, note: definition.note,
      structure: definition.structure / 100, brightness: definition.brightness / 100,
      damping: definition.damping / 100, position: definition.position / 100,
    });
  }

  private updateResonator(definition: AudioProgram['resonators'][number], hotReload = false): void {
    const resonator = this.resonators.get(definition.name);
    if (!resonator) return;
    const note = hotReload && definition.dynamicPitch ? resonator.note : definition.note;
    const noteChanged = Math.abs(resonator.note - note) > 0.0001;
    const unchanged = resonator.enabled === definition.enabled
      && !noteChanged
      && resonator.level === definition.level
      && resonator.model === definition.model
      && resonator.polyphony === definition.polyphony
      && resonator.structure === definition.structure
      && resonator.brightness === definition.brightness
      && resonator.damping === definition.damping
      && resonator.position === definition.position;
    if (unchanged) return;

    const context = this.ensureContext();
    if (resonator.enabled !== definition.enabled || resonator.level !== definition.level) {
      const level = definition.enabled ? Math.max(0, Math.min(1, definition.level / 100)) : 0;
      resonator.mainGain.gain.setTargetAtTime(level, context.currentTime, 0.008);
      resonator.auxGain.gain.setTargetAtTime(level, context.currentTime, 0.008);
    }
    Object.assign(resonator, {
      enabled: definition.enabled, note, level: definition.level, model: definition.model,
      polyphony: definition.polyphony, structure: definition.structure,
      brightness: definition.brightness, damping: definition.damping, position: definition.position,
    });
    resonator.node.port.postMessage({
      type: 'params', model: definition.model, polyphony: definition.polyphony, note,
      structure: definition.structure / 100, brightness: definition.brightness / 100,
      damping: definition.damping / 100, position: definition.position / 100,
    });
    if (noteChanged) resonator.node.port.postMessage({ type: 'strum' });
  }

  triggerResonator(name: string): void {
    const resonator = this.resonators.get(name);
    if (!resonator) throw new Error(`unknown Resonator object: ${name}`);
    resonator.node.port.postMessage({ type: 'strum' });
  }

  private createFilter(definition: AudioProgram['filters'][number]): void {
    if (this.filters.has(definition.name)) return;
    if (!this.daisyFiltersWorkletLoaded || !this.daisyFiltersWasmBytes) {
      throw new Error('DaisySP FILTER DSP is not ready; run :start after building the DSP');
    }
    const context = this.ensureContext();
    const node = new AudioWorkletNode(context, 'sonus-daisy-filters', {
      numberOfInputs: 1,
      numberOfOutputs: 5,
      outputChannelCount: [1, 1, 1, 1, 1],
      processorOptions: { wasmBytes: this.daisyFiltersWasmBytes.slice(0) },
    });
    node.addEventListener('processorerror', () => console.error('[SVF] AudioWorklet processor failed'));

    const input = context.createGain();
    const lowOut = context.createGain();
    const highOut = context.createGain();
    const bandOut = context.createGain();
    const notchOut = context.createGain();
    const peakOut = context.createGain();
    input.connect(node, 0, 0);
    node.connect(lowOut, 0, 0);
    node.connect(highOut, 1, 0);
    node.connect(bandOut, 2, 0);
    node.connect(notchOut, 3, 0);
    node.connect(peakOut, 4, 0);

    this.filters.set(definition.name, {
      bypassed: definition.bypassed,
      node, input, lowOut, highOut, bandOut, notchOut, peakOut,
      ownerVoice: definition.ownerVoice,
      displayName: definition.displayName,
      cutoff: definition.cutoff,
      resonance: definition.resonance,
      drive: definition.drive,
    });

    if (definition.ownerVoice) {
      const voice = this.voices.get(definition.ownerVoice);
      const matter = this.matters.get(definition.ownerVoice);
      if (!voice && !matter) throw new Error(`embedded FILTER '${definition.displayName}' references unknown VOICE '${definition.ownerVoice}'`);
      if (voice) {
        voice.outGain.connect(input);
        voice.auxGain.connect(input);
      } else if (matter) {
        matter.mainGain.connect(input);
        matter.auxGain.connect(input);
      }
    }
  }

  private updateFilter(definition: AudioProgram['filters'][number]): void {
    const filter = this.filters.get(definition.name);
    if (!filter) return;
    if (filter.bypassed === definition.bypassed
      && Math.abs(filter.cutoff - definition.cutoff) < 0.0001
      && filter.resonance === definition.resonance
      && filter.drive === definition.drive) return;
    filter.bypassed = definition.bypassed;
    filter.cutoff = definition.cutoff;
    filter.resonance = definition.resonance;
    filter.drive = definition.drive;
    filter.node.port.postMessage({
      type: 'params', bypassed: definition.bypassed, cutoff: definition.cutoff,
      resonance: definition.resonance / 100, drive: definition.drive / 100,
    });
  }

  setFilterCutoff(name: string, cutoff: number): void {
    const filter = this.filters.get(name);
    if (!filter) throw new Error(`unknown FILTER object: ${name}`);
    if (!Number.isFinite(cutoff) || cutoff < 20 || cutoff > 20000) throw new RangeError('FILTER cutoff must be 20..20000 Hz');
    filter.cutoff = cutoff;
    filter.node.port.postMessage({ type: 'params', cutoff });
  }

  setFilterResonance(name: string, resonance: number): void {
    const filter = this.filters.get(name);
    if (!filter) throw new Error(`unknown FILTER object: ${name}`);
    if (!Number.isFinite(resonance) || resonance < 0 || resonance > 100) {
      throw new RangeError('FILTER resonance must be 0..100');
    }
    filter.resonance = resonance;
    filter.node.port.postMessage({ type: 'params', resonance: resonance / 100 });
  }

  setFilterDrive(name: string, drive: number): void {
    const filter = this.filters.get(name);
    if (!filter) throw new Error(`unknown FILTER object: ${name}`);
    if (!Number.isFinite(drive) || drive < 0 || drive > 100) {
      throw new RangeError('FILTER drive must be 0..100');
    }
    filter.drive = drive;
    filter.node.port.postMessage({ type: 'params', drive: drive / 100 });
  }

  private createSwell(definition: AudioProgram['swells'][number]): void {
    if (this.swells.has(definition.name)) return;
    if (!this.swellWorkletLoaded || !this.swellWasmBytes) {
      throw new Error('Swell DSP is not ready; run :start after building the DSP');
    }
    const context = this.ensureContext();
    const node = new AudioWorkletNode(context, 'sonus-swell', {
      numberOfInputs: 3,
      numberOfOutputs: 4,
      outputChannelCount: [1, 1, 1, 1],
      processorOptions: { wasmBytes: this.swellWasmBytes.slice(0), sampleRate: context.sampleRate },
    });
    this.swells.set(definition.name, {
      node,
      frequency: definition.frequency,
      slope: definition.slope,
      shape: definition.shape,
      smooth: definition.smooth,
      shift: definition.shift,
      mode: definition.mode,
      outputMode: definition.outputMode,
      range: definition.range,
      monitorValues: [0, 0, 0, 0],
    });

    node.port.onmessage = (event) => {
      const message = event.data;
      if (!message || message.type !== 'monitor' || !Array.isArray(message.values)) return;
      const swell = this.swells.get(definition.name);
      if (!swell) return;
      for (let channel = 0; channel < 4; channel += 1) {
        const value = Number(message.values[channel]);
        swell.monitorValues[channel] = Number.isFinite(value) ? value : 0;
      }
    };
  }

  private updateSwell(definition: AudioProgram['swells'][number]): void {
    const swell = this.swells.get(definition.name);
    if (!swell) return;
    if (swell.frequency === definition.frequency && swell.slope === definition.slope
      && swell.shape === definition.shape && swell.smooth === definition.smooth
      && swell.shift === definition.shift && swell.mode === definition.mode
      && swell.outputMode === definition.outputMode && swell.range === definition.range) return;
    swell.frequency = definition.frequency;
    swell.slope = definition.slope;
    swell.shape = definition.shape;
    swell.smooth = definition.smooth;
    swell.shift = definition.shift;
    swell.mode = definition.mode;
    swell.outputMode = definition.outputMode;
    swell.range = definition.range;
    swell.node.port.postMessage({
      type: 'params',
      frequency: definition.frequency,
      slope: definition.slope / 100,
      shape: definition.shape / 100,
      smooth: definition.smooth / 100,
      shift: definition.shift / 100,
      mode: definition.mode,
      outputMode: definition.outputMode,
      range: definition.range,
    });
  }


  private createMist(definition: AudioProgram['mists'][number]): void {
    if (this.mists.has(definition.name)) return;
    if (!this.mistWorkletLoaded || !this.mistWasmBytes) {
      throw new Error('Mist DSP is not ready; run :start after building the DSP');
    }

    const context = this.ensureContext();
    const node = new AudioWorkletNode(context, 'sonus-mist', {
      numberOfInputs: 3,
      numberOfOutputs: 2,
      outputChannelCount: [1, 1],
      processorOptions: { wasmBytes: this.mistWasmBytes.slice(0) },
    });

    node.addEventListener('processorerror', () => {
      console.error('[Mist] AudioWorklet processor failed');
    });

    const monoInput = context.createGain();
    const inputL = context.createGain();
    const inputR = context.createGain();
    const wetInputL = context.createGain();
    const wetInputR = context.createGain();
    const dryL = context.createGain();
    const dryR = context.createGain();
    const wetL = context.createGain();
    const wetR = context.createGain();
    const outputL = context.createGain();
    const outputR = context.createGain();

    monoInput.gain.value = 1;
    inputL.gain.value = 1;
    inputR.gain.value = 1;
    dryL.gain.value = 1;
    dryR.gain.value = 1;
    wetL.gain.value = 0;
    wetR.gain.value = 0;
    outputL.gain.value = 1;
    outputR.gain.value = 1;

    monoInput.connect(inputL);
    monoInput.connect(inputR);

    inputL.connect(wetInputL);
    inputR.connect(wetInputR);
    wetInputL.connect(node, 0, 0);
    wetInputR.connect(node, 0, 1);

    inputL.connect(dryL);
    inputR.connect(dryR);
    dryL.connect(outputL);
    dryR.connect(outputR);

    node.connect(wetL, 0, 0);
    node.connect(wetR, 1, 0);
    wetL.connect(outputL);
    wetR.connect(outputR);

    this.mists.set(definition.name, {
      bypassed: definition.bypassed,
      node,
      monoInput,
      inputL,
      inputR,
      wetInputL,
      wetInputR,
      dryL,
      dryR,
      wetL,
      wetR,
      outputL,
      outputR,
      position: definition.position,
      size: definition.size,
      pitch: definition.pitch,
      density: definition.density,
      texture: definition.texture,
      mix: definition.mix,
      spread: definition.spread,
      feedback: definition.feedback,
      reverb: definition.reverb,
      freeze: definition.freeze,
      reverse: definition.reverse,
      mode: definition.mode,
    });
  }

  private updateMist(definition: AudioProgram['mists'][number]): void {
    const mist = this.mists.get(definition.name);
    if (!mist) return;
    if (mist.bypassed === definition.bypassed && mist.position === definition.position
      && mist.size === definition.size && mist.pitch === definition.pitch
      && mist.density === definition.density && mist.texture === definition.texture
      && mist.mix === definition.mix && mist.spread === definition.spread
      && mist.feedback === definition.feedback && mist.reverb === definition.reverb
      && mist.freeze === definition.freeze && mist.reverse === definition.reverse
      && mist.mode === definition.mode) return;
    Object.assign(mist, definition);

    const context = this.ensureContext();
    const mix = Math.max(0, Math.min(1, definition.mix / 100));
    const dryGain = definition.bypassed ? 1 : Math.cos(mix * Math.PI * 0.5);
    const wetGain = Math.sin(mix * Math.PI * 0.5);
    mist.wetInputL.gain.setTargetAtTime(definition.bypassed ? 0 : 1, context.currentTime, 0.008);
    mist.wetInputR.gain.setTargetAtTime(definition.bypassed ? 0 : 1, context.currentTime, 0.008);

    mist.dryL.gain.setTargetAtTime(dryGain, context.currentTime, 0.008);
    mist.dryR.gain.setTargetAtTime(dryGain, context.currentTime, 0.008);
    mist.wetL.gain.setTargetAtTime(wetGain, context.currentTime, 0.008);
    mist.wetR.gain.setTargetAtTime(wetGain, context.currentTime, 0.008);

    mist.node.port.postMessage({
      type: 'params',
      mode: definition.mode,
      mix: definition.mix / 100,
      position: definition.position / 100,
      size: definition.size / 100,
      pitch: definition.pitch,
      density: definition.density / 100,
      texture: definition.texture / 100,
      spread: definition.spread / 100,
      feedback: definition.feedback / 100,
      reverb: definition.reverb / 100,
      freeze: definition.freeze,
      reverse: definition.reverse,
    });
  }


  private createSky(definition: AudioProgram['skies'][number]): void {
    if (this.skies.has(definition.name)) return;
    if (!this.skyWorkletLoaded || !this.skyWasmBytes) {
      throw new Error('Sky DSP is not ready; run :start after building the DSP');
    }
    const context = this.ensureContext();
    const node = new AudioWorkletNode(context, 'sonus-sky', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete',
      processorOptions: { wasmBytes: this.skyWasmBytes.slice(0) },
    });
    node.addEventListener('processorerror', () => console.error('[Sky] AudioWorklet processor failed'));
    const monoInput=context.createGain(), inputL=context.createGain(), inputR=context.createGain();
    const wetInputL=context.createGain(), wetInputR=context.createGain();
    const inputMerger=context.createChannelMerger(2), outputSplitter=context.createChannelSplitter(2);
    const dryL=context.createGain(), dryR=context.createGain(), wetL=context.createGain(), wetR=context.createGain();
    const outputL=context.createGain(), outputR=context.createGain();
    monoInput.connect(inputL); monoInput.connect(inputR);
    inputL.connect(wetInputL); inputR.connect(wetInputR); wetInputL.connect(inputMerger,0,0); wetInputR.connect(inputMerger,0,1); inputMerger.connect(node);
    inputL.connect(dryL); inputR.connect(dryR); dryL.connect(outputL); dryR.connect(outputR);
    node.connect(outputSplitter);
    outputSplitter.connect(wetL,0,0); outputSplitter.connect(wetR,1,0); wetL.connect(outputL); wetR.connect(outputR);

    this.skies.set(definition.name, { node, inputMerger, outputSplitter, monoInput, inputL, inputR, wetInputL, wetInputR, dryL, dryR, wetL, wetR, outputL, outputR, ...definition });
  }

  private updateSky(definition: AudioProgram['skies'][number]): void {
    const sky=this.skies.get(definition.name); if(!sky) return;
    if (sky.bypassed===definition.bypassed && sky.size===definition.size && sky.decay===definition.decay
      && sky.damp===definition.damp && sky.bloom===definition.bloom && sky.predelay===definition.predelay
      && sky.motion===definition.motion && sky.width===definition.width && sky.mix===definition.mix
      && sky.freeze===definition.freeze) return;
    Object.assign(sky,definition);
    const context=this.ensureContext();
    const mix=Math.max(0,Math.min(1,definition.mix/100));
    const dryGain=definition.bypassed?1:Math.cos(mix*Math.PI*0.5), wetGain=Math.sin(mix*Math.PI*0.5);
    sky.wetInputL.gain.setTargetAtTime(definition.bypassed?0:1,context.currentTime,0.008);
    sky.wetInputR.gain.setTargetAtTime(definition.bypassed?0:1,context.currentTime,0.008);
    sky.dryL.gain.setTargetAtTime(dryGain,context.currentTime,0.008);
    sky.dryR.gain.setTargetAtTime(dryGain,context.currentTime,0.008);
    sky.wetL.gain.setTargetAtTime(wetGain,context.currentTime,0.008);
    sky.wetR.gain.setTargetAtTime(wetGain,context.currentTime,0.008);
    sky.node.port.postMessage({ type:'params', size:definition.size/100, decay:definition.decay/100,
      damp:definition.damp/100, bloom:definition.bloom/100, predelay:definition.predelay/100,
      motion:definition.motion/100, width:definition.width/100, freeze:definition.freeze });
  }

  private createDelay(definition: AudioProgram['delays'][number]): void {
    if (this.delays.has(definition.name)) return;
    if (!this.delayWorkletLoaded || !this.delayWasmBytes) throw new Error('Delay DSP is not ready; run :start after building the DSP');
    const context = this.ensureContext();
    const node = new AudioWorkletNode(context, 'sonus-delay', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'discrete', processorOptions: { wasmBytes: this.delayWasmBytes.slice(0) } });
    node.addEventListener('processorerror', () => console.error('[Delay] AudioWorklet processor failed'));
    const monoInput=context.createGain(), inputL=context.createGain(), inputR=context.createGain();
    const inputMerger=context.createChannelMerger(2), outputSplitter=context.createChannelSplitter(2);
    const outputL=context.createGain(), outputR=context.createGain();
    monoInput.connect(inputL); monoInput.connect(inputR); inputL.connect(inputMerger,0,0); inputR.connect(inputMerger,0,1); inputMerger.connect(node);
    node.connect(outputSplitter); outputSplitter.connect(outputL,0,0); outputSplitter.connect(outputR,1,0);
    this.delays.set(definition.name, { node,inputMerger,outputSplitter,monoInput,inputL,inputR,outputL,outputR,...definition });
  }

  private updateDelay(definition: AudioProgram['delays'][number]): void {
    const delay=this.delays.get(definition.name); if(!delay) return;
    Object.assign(delay,definition);
    delay.node.port.postMessage({ type:'params', lines:definition.lines, timeMs:definition.timeMs, spread:definition.spread/100, spreadLoose:definition.spreadLoose/100, feedback:definition.feedback/100, reverse:definition.reverse/100, pitchProbability:definition.pitchProbability/100, pitchShifts:definition.pitchShifts, tape:definition.tape/100, diffusion:definition.diffusion/100, pingpong:definition.pingpong/100, mix:definition.bypassed?0:definition.mix/100 });
  }

  setDelayParameter(name: string, parameter: 'lines'|'reverse'|'tape'|'diffusion'|'pingpong'|'spread'|'feedback'|'mix', value: number): void {
    const delay=this.delays.get(name); if(!delay) throw new Error(`unknown Delay object: ${name}`);
    if (parameter==='lines') delay.lines=Math.max(1,Math.min(8,Math.round(value))); else (delay as unknown as Record<string,unknown>)[parameter]=value;
    const field=parameter;
    delay.node.port.postMessage({ type:'params', [field]: parameter==='lines'?delay.lines:value/100 });
  }

  setDelaySpread(name: string, spread: number, loose: number): void {
    const delay=this.delays.get(name); if(!delay) throw new Error(`unknown Delay object: ${name}`);
    delay.spread=Math.max(0,Math.min(100,spread));
    delay.spreadLoose=Math.max(0,Math.min(100,loose));
    delay.node.port.postMessage({ type:'params', spread:delay.spread/100, spreadLoose:delay.spreadLoose/100 });
  }

  setDelaySpreadLoose(name: string, loose: number): void {
    const delay=this.delays.get(name); if(!delay) throw new Error(`unknown Delay object: ${name}`);
    delay.spreadLoose=Math.max(0,Math.min(100,loose));
    delay.node.port.postMessage({ type:'params', spreadLoose:delay.spreadLoose/100 });
  }

  createGain(name: string): void {
    if (this.gains.has(name)) return;
    const context = this.ensureContext();
    const node = context.createGain();
    node.gain.value = 1;
    this.gains.set(name, { node, level: 100 });
  }

  setOscillatorFrequency(name: string, frequency: number, emit = true): void {
    if (!Number.isFinite(frequency) || frequency < 20 || frequency > 20000) {
      throw new RangeError('frequency must be between 20 and 20000 Hz');
    }

    const voice = this.requireOscillator(name);
    const context = this.ensureContext();
    voice.frequency = frequency;
    voice.oscillator.frequency.setTargetAtTime(frequency, context.currentTime, 0.008);
    if (emit) this.emit();
  }

  setOscillatorNote(name: string, midiNote: number): void {
    if (!Number.isFinite(midiNote) || midiNote < 0 || midiNote > 127) {
      throw new RangeError('note must be between 0 and 127');
    }

    const frequency = 440 * 2 ** ((midiNote - 69) / 12);
    this.setOscillatorFrequency(name, frequency);
  }

  setGainLevel(name: string, level: number, emit = true): void {
    if (!Number.isFinite(level) || level < 0 || level > 100) {
      throw new RangeError('gain level must be between 0 and 100');
    }

    const voice = this.requireGain(name);
    const context = this.ensureContext();
    voice.level = level;
    voice.node.gain.setTargetAtTime(level / 100, context.currentTime, 0.008);
    if (emit) this.emit();
  }

  connect(source: string, destination: string, amount = 100, emit = true): void {
    if (!Number.isFinite(amount) || amount < -100 || amount > 100) {
      throw new RangeError('route amount must be between -100 and 100');
    }

    const context = this.ensureContext();
    const sourceSignal = this.sourceForSignal(source);
    const destinationPort = destination;
    const destinationTarget = this.destinationForPort(destinationPort);
    const routeKey = `${source}->${destinationPort}`;
    const existing = this.routes.get(routeKey);
    const normalized = amount / 100;

    if (existing) {
      if (existing.amount === amount) return;
      existing.amount = amount;
      existing.gain.gain.setTargetAtTime(normalized, context.currentTime, 0.008);
      if (emit) this.emit();
      return;
    }

    const gain = context.createGain();
    gain.gain.value = normalized;
    sourceSignal.node.connect(gain, sourceSignal.output, 0);
    gain.connect(destinationTarget.node, 0, destinationTarget.input);
    this.routes.set(routeKey, { gain, amount, source, destination: destinationPort });
    if (emit) this.emit();
  }

  readLatestSignal(signal: string): number | null {
    const view = this.views.get(signal);
    if (!view) return null;
    const data = new Float32Array(32);
    view.analyser.getFloatTimeDomainData(data);
    return data[data.length - 1] ?? 0;
  }

  getViewSignals(): Array<{ signal: string; kind: SignalKind }> {
    return [...this.views.entries()].map(([signal, view]) => ({ signal, kind: view.kind }));
  }

  readOscilloscope(signal: string, target: Float32Array<ArrayBuffer>): boolean {
    const view = this.views.get(signal);
    if (!view) return false;

    const swellMatch = signal.match(/^([A-Za-z_]\w*)\.out([1-4])$/);
    const dicesMatch = signal.match(/^([A-Za-z_]\w*)\.(x1|x2|x3|y)$/);
    const swell = swellMatch ? this.swells.get(swellMatch[1]) : undefined;
    const dices = dicesMatch ? this.dices.get(dicesMatch[1]) : undefined;
    const swellChannel = swellMatch ? Number(swellMatch[2]) - 1 : -1;
    const dicesChannel = dicesMatch
      ? ({ x1: 0, x2: 1, x3: 2, y: 3 } as const)[dicesMatch[2] as 'x1'|'x2'|'x3'|'y']
      : -1;
    const modFrequency = swell?.frequency ?? dices?.frequency ?? 0;
    const monitorValues = swell?.monitorValues ?? dices?.monitorValues;
    const monitorChannel = swell ? swellChannel : dicesChannel;
    if (!swell && !dices) {
      view.analyser.getFloatTimeDomainData(target);
      return true;
    }

    if (modFrequency >= 12) {
      // Preserve the real control-voltage domain here. Display scaling belongs
      // to the view renderer, which knows whether the user requested ±nV or nX.
      view.analyser.getFloatTimeDomainData(target);
      return true;
    }

    const now = performance.now() / 1000;
    const seconds = Math.min(20, Math.max(2, 2 / Math.max(0.05, modFrequency)));
    const interval = seconds / Math.max(1, target.length - 1);
    let history = this.slowScopeHistory.get(signal);
    if (!history) {
      history = { values: [], lastSampleAt: now - interval };
      this.slowScopeHistory.set(signal, history);
    }

    if (now - history.lastSampleAt >= interval) {
      const raw = monitorValues?.[monitorChannel] ?? 0;
      // Keep the original routing-domain value in history. The UI renderer
      // owns vertical scale/zoom; storing normalized values here would destroy
      // information before WITH VIEW <n>V / <n>X can use it.
      history.values.push(raw);
      history.lastSampleAt = now;
      if (history.values.length > target.length) history.values.splice(0, history.values.length - target.length);
    }

    const values = history.values;
    target.fill(0);
    if (values.length === 0) return true;

    // Fixed horizontal history only. Do not clamp or apply vertical gain here:
    // the renderer needs the untouched CV values for explicit V/X view scales.
    const visibleCount = Math.min(values.length, target.length);
    const sourceOffset = values.length - visibleCount;
    const targetOffset = target.length - visibleCount;
    for (let i = 0; i < visibleCount; i += 1) {
      target[targetOffset + i] = values[sourceOffset + i];
    }
    return true;
  }

  private createView(signal: string, kind: SignalKind): void {
    const existing = this.views.get(signal);
    if (existing) { existing.kind = kind; return; }

    const context = this.ensureContext();
    const source = this.sourceForSignal(signal);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0;
    source.node.connect(analyser, source.output, 0);
    this.views.set(signal, { analyser, kind });
  }

  private removeView(signal: string): void {
    const view = this.views.get(signal);
    if (!view) return;

    try {
      this.sourceForSignal(signal).node.disconnect(view.analyser);
    } catch {
      // The source may already have been retired; disconnecting the analyser is enough.
    }
    view.analyser.disconnect();
    this.views.delete(signal);
    this.slowScopeHistory.delete(signal);
  }

  private sourceForSignal(signal: string): SignalSource {
    if (signal === 'Clock.out') {
      const clock = this.clocks.get('Clock');
      if (!clock) throw new Error('Clock source unavailable');
      return { node: clock.node, output: 0 };
    }

    const derivedClock = signal.match(/^([A-Za-z_]\w*)\.out$/);
    if (derivedClock && this.clocks.has(derivedClock[1])) {
      return { node: this.clocks.get(derivedClock[1])!.node, output: 0 };
    }

    if (signal === 'Audio.out_L' || signal === 'Audio.out_R') {
      this.ensureContext();
      const node = signal === 'Audio.out_R' ? this.audioOutR : this.audioOutL;
      if (!node) throw new Error('audio engine unavailable');
      return { node, output: 0 };
    }

    // Internal compatibility alias: Audio.out observes the post-merge stereo bus.
    if (signal === 'Audio.out') {
      this.ensureContext();
      if (!this.master) throw new Error('audio engine unavailable');
      return { node: this.master, output: 0 };
    }

    const swellOutput = signal.match(/^([A-Za-z_]\w*)\.out([1-4])$/);
    if (swellOutput) {
      const swell = this.swells.get(swellOutput[1]);
      if (!swell) throw new Error(`unknown Swell object: ${swellOutput[1]}`);
      return { node: swell.node, output: Number(swellOutput[2]) - 1 };
    }

    const dicesOutput = signal.match(/^([A-Za-z_]\w*)\.(x1|x2|x3|y)$/);
    if (dicesOutput) {
      const dices = this.dices.get(dicesOutput[1]);
      if (!dices) throw new Error(`unknown Dices MOD: ${dicesOutput[1]}`);
      const output = ({ x1: 0, x2: 1, x3: 2, y: 3 } as const)[dicesOutput[2] as 'x1'|'x2'|'x3'|'y'];
      return { node: dices.node, output };
    }


    const mistOutput = signal.match(/^([A-Za-z_]\w*)\.(out_L|out_R)$/);
    if (mistOutput) {
      const fx = this.mists.get(mistOutput[1]) ?? this.skies.get(mistOutput[1]) ?? this.delays.get(mistOutput[1]);
      if (!fx) throw new Error(`unknown stereo FX object: ${mistOutput[1]}`);
      return { node: mistOutput[2] === 'out_R' ? fx.outputR : fx.outputL, output: 0 };
    }

    const filterOutput = signal.match(/^([A-Za-z_]\w*)\.(lp|hp|bp|np)$/);
    if (filterOutput) {
      const [, name, port] = filterOutput;
      let filter = this.filters.get(name);
      if (!filter) filter = [...this.filters.values()].find((candidate) => candidate.ownerVoice === name);
      if (!filter) throw new Error(`unknown FILTER output: ${signal}`);
      const node = port === 'hp' ? filter.highOut
        : port === 'bp' ? filter.bandOut
        : port === 'np' ? filter.notchOut
        : filter.lowOut;
      return { node, output: 0 };
    }

    const match = signal.match(/^([A-Za-z_]\w*)\.(out|aux)$/);
    if (!match) throw new Error(`unknown signal: ${signal}`);
    const [, name, port] = match;

    const voice = this.voices.get(name);
    if (voice) return { node: port === 'aux' ? voice.auxGain : voice.outGain, output: 0 };
    const matter = this.matters.get(name);
    if (matter) return { node: port === 'aux' ? matter.auxGain : matter.mainGain, output: 0 };
    const resonator = this.resonators.get(name);
    if (resonator) return { node: port === 'aux' ? resonator.auxGain : resonator.mainGain, output: 0 };

    if (port === 'aux') throw new Error(`aux output is not available on ${name}`);
    const oscillator = this.oscillators.get(name);
    if (oscillator) return { node: oscillator.output, output: 0 };
    const gain = this.gains.get(name);
    if (gain) return { node: gain.node, output: 0 };
    throw new Error(`unknown object: ${name}`);
  }

  private destinationForPort(port: string): SignalDestination {
    if (port === 'Audio.out_L' || port === 'Audio.out_R') {
      this.ensureContext();
      const node = port === 'Audio.out_R' ? this.audioOutR : this.audioOutL;
      if (!node) throw new Error('audio engine unavailable');
      return { node, input: 0 };
    }

    // Audio.out routes are normally expanded to out_L/out_R by the runtime.
    // Keep this alias for backwards compatibility with older serialized programs.
    if (port === 'Audio.out') {
      this.ensureContext();
      if (!this.audioOutL) throw new Error('audio engine unavailable');
      return { node: this.audioOutL, input: 0 };
    }

    const mistInput = port.match(/^([A-Za-z_]\w*)\.(in|inL|inR)$/);
    if (mistInput) {
      const fx = this.mists.get(mistInput[1]) ?? this.skies.get(mistInput[1]) ?? this.delays.get(mistInput[1]);
      // `.in` is shared by mono destinations such as FILTER/resonator/gain.
      // Claim the destination here only when the object is actually a stereo FX;
      // otherwise let the more specific destination resolvers below handle it.
      if (fx) {
        if (mistInput[2] === 'in') return { node: fx.monoInput, input: 0 };
        return { node: mistInput[2] === 'inR' ? fx.inputR : fx.inputL, input: 0 };
      }
      if (mistInput[2] !== 'in') {
        throw new Error(`unknown stereo FX input: ${mistInput[1]}`);
      }
    }

    const trigger = port.match(/^([A-Za-z_]\w*)\.trig$/);
    if (trigger) {
      const voice = this.voices.get(trigger[1]);
      if (voice) return { node: voice.node, input: 0 };
      const swell = this.swells.get(trigger[1]);
      if (swell) return { node: swell.node, input: 0 };
      const mist = this.mists.get(trigger[1]);
      if (mist) return { node: mist.node, input: 2 };
      throw new Error(`unknown trigger input: ${trigger[1]}`);
    }

    const clock = port.match(/^([A-Za-z_]\w*)\.clock$/);
    if (clock) {
      const swell = this.swells.get(clock[1]);
      if (swell) return { node: swell.node, input: 1 };
      throw new Error(`clock input is only available on Swell objects: ${clock[1]}`);
    }

    const vOct = port.match(/^([A-Za-z_]\w*)\.v_oct$/);
    if (vOct) {
      const voice = this.voices.get(vOct[1]);
      if (voice) return { node: voice.vOctInput, input: 0 };
      const swell = this.swells.get(vOct[1]);
      if (swell) return { node: swell.node, input: 2 };
      throw new Error(`unknown v_oct input: ${vOct[1]}`);
    }

    const parameter = port.match(/^([A-Za-z_]\w*)\.(harmo|timbre|morph)$/);
    if (parameter) {
      const voice = this.voices.get(parameter[1]);
      if (!voice) throw new Error(`unknown Voice parameter input: ${parameter[1]}`);
      const input = parameter[2] === 'harmo'
        ? voice.harmoInput
        : parameter[2] === 'timbre'
          ? voice.timbreInput
          : voice.morphInput;
      return { node: input, input: 0 };
    }

    const matterInput = port.match(/^([A-Za-z_]\w*)\.(in|in2)$/);
    if (matterInput && this.matters.has(matterInput[1])) {
      return { node: this.matters.get(matterInput[1])!.node, input: matterInput[2] === 'in2' ? 1 : 0 };
    }

    const resonatorInput = port.match(/^([A-Za-z_]\w*)\.in$/);
    if (resonatorInput && this.resonators.has(resonatorInput[1])) {
      return { node: this.resonators.get(resonatorInput[1])!.node, input: 0 };
    }

    const filterInput = port.match(/^([A-Za-z_]\w*)\.in$/);
    if (filterInput && this.filters.has(filterInput[1])) {
      return { node: this.filters.get(filterInput[1])!.input, input: 0 };
    }

    const match = port.match(/^([A-Za-z_]\w*)\.in$/);
    if (!match) throw new Error(`unknown destination: ${port}`);
    return { node: this.requireGain(match[1]).node, input: 0 };
  }


  readVoicePitchMidi(name: string): number | null {
    const voice = this.voices.get(name);
    if (!voice) return null;

    // The analyser is intentionally short: v/oct is a control signal and the
    // latest block value is more useful here than a long averaged waveform.
    const context = this.ensureContext();
    const analyserKey = `${name}.v_oct`;
    let analyser = this.controlMonitors.get(analyserKey);
    if (!analyser) {
      analyser = context.createAnalyser();
      analyser.fftSize = 32;
      analyser.smoothingTimeConstant = 0;
      voice.vOctInput.connect(analyser);
      this.controlMonitors.set(analyserKey, analyser);
    }
    const data = new Float32Array(32);
    analyser.getFloatTimeDomainData(data);
    const volts = data[data.length - 1] ?? 0;
    const baseMidi = 69 + 12 * Math.log2(voice.frequency / 440);
    return baseMidi + volts * 12;
  }


  subscribeClockTrigger(name: string, listener: () => void): () => void {
    const listeners = this.clockTriggerListeners.get(name) ?? new Set<() => void>();
    listeners.add(listener);
    this.clockTriggerListeners.set(name, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.clockTriggerListeners.delete(name);
    };
  }

  triggerVoice(name: string): void {
    const resonator = this.resonators.get(name);
    if (resonator) {
      resonator.node.port.postMessage({ type: 'strum' });
      return;
    }
    const matter = this.matters.get(name);
    if (matter) {
      matter.node.port.postMessage({ type: 'trigger' });
      return;
    }
    const voice = this.voices.get(name);
    if (!voice || !voice.lpg) return;
    voice.node.port.postMessage({ type: 'trigger' });
  }

  setVoiceLevel(name: string, level: number): void {
    if (!Number.isFinite(level) || level < 0 || level > 100) throw new RangeError('VOICE level must be 0..100');
    const context = this.ensureContext();
    const gain = level / 100;
    const resonator = this.resonators.get(name);
    if (resonator) {
      resonator.level = level;
      resonator.mainGain.gain.setTargetAtTime(gain, context.currentTime, 0.008);
      resonator.auxGain.gain.setTargetAtTime(gain, context.currentTime, 0.008);
      return;
    }
    const matter = this.matters.get(name);
    if (matter) {
      matter.level = level;
      matter.mainGain.gain.setTargetAtTime(gain, context.currentTime, 0.008);
      matter.auxGain.gain.setTargetAtTime(gain, context.currentTime, 0.008);
      return;
    }
    const voice = this.voices.get(name);
    if (!voice) throw new Error(`unknown Voice object: ${name}`);
    voice.level = level;
    voice.outGain.gain.setTargetAtTime(gain, context.currentTime, 0.008);
    voice.auxGain.gain.setTargetAtTime(gain, context.currentTime, 0.008);
  }

  setVoiceParameter(
    name: string,
    parameter: 'freq' | 'model' | 'harmo' | 'timbre' | 'morph' | 'geometry' | 'structure' | 'brightness' | 'damping' | 'position' | 'space' | 'bow' | 'bowTimbre' | 'blow' | 'blowTimbre' | 'strike' | 'strikeTimbre',
    value: number,
  ): void {
    const resonator = this.resonators.get(name);
    if (resonator) {
      if (parameter === 'freq') {
        const note = 69 + 12 * Math.log2(value / 440);
        resonator.note = note;
        resonator.node.port.postMessage({ type: 'params', note });
        return;
      }
      if (parameter === 'model') {
        resonator.model = value;
        resonator.node.port.postMessage({ type: 'params', model: value });
        return;
      }
      if (parameter === 'brightness' || parameter === 'damping' || parameter === 'position' || parameter === 'structure') {
        resonator.node.port.postMessage({ type: 'params', [parameter]: value / 100 });
      }
      return;
    }
    const matter = this.matters.get(name);
    if (matter) {
      if (parameter === 'freq') {
        const note = 69 + 12 * Math.log2(value / 440);
        matter.note = note;
        matter.node.port.postMessage({ type: 'params', note });
        return;
      }
      if (parameter === 'model' || parameter === 'harmo' || parameter === 'timbre' || parameter === 'morph') return;
      const map = {
        geometry: 'geometry', brightness: 'brightness', damping: 'damping', position: 'position', space: 'space',
        bow: 'bowLevel', bowTimbre: 'bowTimbre', blow: 'blowLevel', blowTimbre: 'blowTimbre',
        strike: 'strikeLevel', strikeTimbre: 'strikeTimbre',
      } as const;
      const target = map[parameter as keyof typeof map];
      if (!target) return;
      matter.node.port.postMessage({ type: 'params', [target]: value / 100 });
      return;
    }

    const voice = this.voices.get(name);
    if (!voice) throw new Error(`unknown Voice object: ${name}`);
    if (parameter === 'freq') {
      voice.frequency = value;
      voice.node.port.postMessage({ type: 'params', frequency: value });
      return;
    }
    if (parameter === 'model') {
      voice.model = value;
      voice.node.port.postMessage({ type: 'params', model: value });
      return;
    }
    if (parameter !== 'harmo' && parameter !== 'timbre' && parameter !== 'morph') return;
    voice[parameter] = value;
    voice.node.port.postMessage({ type: 'params', [parameter]: value / 100 });
  }

  setMistParameter(
    name: string,
    parameter: 'position' | 'size' | 'pitch' | 'density' | 'texture' | 'mix' | 'spread' | 'feedback' | 'reverb',
    value: number,
  ): void {
    const delay = this.delays.get(name);
    if (delay) {
      if (parameter === 'spread' || parameter === 'feedback' || parameter === 'mix') this.setDelayParameter(name, parameter, value);
      else throw new RangeError(`Delay does not expose ${parameter} through generic FX parameters`);
      return;
    }
    const sky = this.skies.get(name);
    if (sky) {
      if (!Number.isFinite(value) || value < 0 || value > 100) throw new RangeError(`Sky ${parameter} must be between 0 and 100`);
      const map = { position:'predelay', size:'size', density:'bloom', texture:'damp', mix:'mix', spread:'width', feedback:'decay', reverb:'motion' } as const;
      if (parameter === 'pitch') throw new RangeError('Sky does not expose pitch');
      const mapped = map[parameter];
      (sky as unknown as Record<string, unknown>)[mapped] = value;
      if (mapped === 'mix') {
        const context=this.ensureContext(), mix=Math.max(0,Math.min(1,value/100));
        const dryGain=Math.cos(mix*Math.PI*0.5), wetGain=Math.sin(mix*Math.PI*0.5);
        sky.dryL.gain.setTargetAtTime(dryGain,context.currentTime,0.008); sky.dryR.gain.setTargetAtTime(dryGain,context.currentTime,0.008);
        sky.wetL.gain.setTargetAtTime(wetGain,context.currentTime,0.008); sky.wetR.gain.setTargetAtTime(wetGain,context.currentTime,0.008);
      } else {
        sky.node.port.postMessage({ type:'params', [mapped]: value/100 });
      }
      return;
    }
    const mist = this.mists.get(name);
    if (!mist) throw new Error(`unknown Mist object: ${name}`);

    if (parameter === 'pitch') {
      if (!Number.isFinite(value) || value < -48 || value > 48) {
        throw new RangeError('Mist pitch must be between -48 and 48 semitones');
      }
    } else if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new RangeError(`Mist ${parameter} must be between 0 and 100`);
    }

    mist[parameter] = value;
    const context = this.ensureContext();

    if (parameter === 'mix') {
      const mix = Math.max(0, Math.min(1, value / 100));
      const dryGain = Math.cos(mix * Math.PI * 0.5);
      const wetGain = Math.sin(mix * Math.PI * 0.5);
      mist.dryL.gain.setTargetAtTime(dryGain, context.currentTime, 0.008);
      mist.dryR.gain.setTargetAtTime(dryGain, context.currentTime, 0.008);
      mist.wetL.gain.setTargetAtTime(wetGain, context.currentTime, 0.008);
      mist.wetR.gain.setTargetAtTime(wetGain, context.currentTime, 0.008);
    }

    mist.node.port.postMessage({
      type: 'params',
      [parameter]: parameter === 'pitch' ? value : value / 100,
    });
  }

  setLiveObjectDisabled(kind: 'voice' | 'filter' | 'fx' | 'clock', name: string, disabled: boolean): void {
    const context = this.ensureContext();

    if (kind === 'voice') {
      const resonator = this.resonators.get(name);
      if (resonator) {
        resonator.enabled = !disabled;
        const level = disabled ? 0 : Math.max(0, Math.min(1, resonator.level / 100));
        resonator.mainGain.gain.setTargetAtTime(level, context.currentTime, 0.008);
        resonator.auxGain.gain.setTargetAtTime(level, context.currentTime, 0.008);
        return;
      }
      const matter = this.matters.get(name);
      if (matter) {
        matter.enabled = !disabled;
        const level = disabled ? 0 : Math.max(0, Math.min(1, matter.level / 100));
        matter.mainGain.gain.setTargetAtTime(level, context.currentTime, 0.008);
        matter.auxGain.gain.setTargetAtTime(level, context.currentTime, 0.008);
        return;
      }
      const voice = this.voices.get(name);
      if (!voice) return;
      voice.enabled = !disabled;
      const level = disabled ? 0 : Math.max(0, Math.min(1, voice.level / 100));
      voice.outGain.gain.setTargetAtTime(level, context.currentTime, 0.008);
      voice.auxGain.gain.setTargetAtTime(level, context.currentTime, 0.008);
      return;
    }

    if (kind === 'filter') {
      const filter = this.filters.get(name);
      if (!filter) return;
      filter.bypassed = disabled;
      filter.node.port.postMessage({ type: 'params', bypassed: disabled });
      return;
    }

    if (kind === 'fx') {
      const delay = this.delays.get(name);
      if (delay) {
        delay.bypassed = disabled;
        delay.node.port.postMessage({ type:'params', mix: disabled ? 0 : delay.mix / 100 });
        return;
      }
      const sky = this.skies.get(name);
      if (sky) {
        sky.bypassed = disabled;
        const mix = Math.max(0, Math.min(1, sky.mix / 100));
        sky.wetInputL.gain.setTargetAtTime(disabled ? 0 : 1, context.currentTime, 0.008);
        sky.wetInputR.gain.setTargetAtTime(disabled ? 0 : 1, context.currentTime, 0.008);
        sky.dryL.gain.setTargetAtTime(disabled ? 1 : Math.cos(mix * Math.PI * 0.5), context.currentTime, 0.008);
        sky.dryR.gain.setTargetAtTime(disabled ? 1 : Math.cos(mix * Math.PI * 0.5), context.currentTime, 0.008);
        return;
      }
      const mist = this.mists.get(name);
      if (!mist) return;
      mist.bypassed = disabled;
      const mix = Math.max(0, Math.min(1, mist.mix / 100));
      mist.wetInputL.gain.setTargetAtTime(disabled ? 0 : 1, context.currentTime, 0.008);
      mist.wetInputR.gain.setTargetAtTime(disabled ? 0 : 1, context.currentTime, 0.008);
      mist.dryL.gain.setTargetAtTime(disabled ? 1 : Math.cos(mix * Math.PI * 0.5), context.currentTime, 0.008);
      mist.dryR.gain.setTargetAtTime(disabled ? 1 : Math.cos(mix * Math.PI * 0.5), context.currentTime, 0.008);
      return;
    }

    if (name === 'Clock') {
      this.masterClockEnabled = !disabled;
      const master = this.clocks.get('Clock');
      if (master) master.enabled = !disabled;
      // Stop emitting new clock triggers, but keep already-emitted visual
      // particles alive until they naturally travel off the monitor. This
      // matches the transport-stop visual behaviour.
      this.updateAllClocks();
      this.emit();
      return;
    }

    const clock = this.clocks.get(name);
    if (!clock) return;
    clock.enabled = !disabled;
    // Preserve already-emitted visual particles while a named clock is
    // paused; only future trigger generation is stopped.
    clock.node.port.postMessage({
      type: 'clock',
      bpm: this.masterClockBpm,
      rate: clock.rate,
      jitter: clock.jitter,
      drift: clock.drift,
      running: this.clockTransportRunning && this.masterClockEnabled && clock.enabled,
    });
    this.emit();
  }

  readModOutput(name: string, channel: 1 | 2 | 3 | 4): number | null {
    const swell = this.swells.get(name);
    if (swell) return swell.monitorValues[channel - 1] ?? null;
    const dices = this.dices.get(name);
    return dices ? dices.monitorValues[channel - 1] ?? null : null;
  }

  setMasterClockBpm(bpm: number): void {
    if (!Number.isFinite(bpm) || bpm < 0 || bpm > 300) {
      throw new RangeError('master clock BPM must be between 0 and 300');
    }
    this.masterClockBpm = bpm;
    this.updateAllClocks();
    this.emit();
  }


  private createDices(definition: AudioProgram['dices'][number]): void {
    if (this.dices.has(definition.name)) return;
    if (!this.dicesWorkletLoaded || !this.dicesWasmBytes) {
      throw new Error('Dices DSP is not ready; run :start after building the DSP');
    }
    const context = this.ensureContext();
    const node = new AudioWorkletNode(context, 'sonus-dices', {
      numberOfInputs: 0,
      numberOfOutputs: 4,
      outputChannelCount: [1, 1, 1, 1],
      processorOptions: { wasmBytes: this.dicesWasmBytes.slice(0), sampleRate: context.sampleRate },
    });
    this.dices.set(definition.name, {
      node,
      frequency: definition.frequency,
      spread: definition.spread,
      bias: definition.bias,
      steps: definition.steps,
      deja: definition.deja,
      length: definition.length,
      diversity: definition.diversity,
      monitorValues: [0, 0, 0, 0],
    });
    node.port.onmessage = (event) => {
      const message = event.data;
      if (!message || message.type !== 'monitor' || !Array.isArray(message.values)) return;
      const dices = this.dices.get(definition.name);
      if (!dices) return;
      for (let channel = 0; channel < 4; channel += 1) {
        const value = Number(message.values[channel]);
        dices.monitorValues[channel] = Number.isFinite(value) ? value : 0;
      }
    };
  }

  private updateDices(definition: AudioProgram['dices'][number]): void {
    const dices = this.dices.get(definition.name);
    if (!dices) return;
    Object.assign(dices, definition);
    dices.node.port.postMessage({
      type: 'params',
      rate: definition.frequency,
      spread: definition.spread / 100,
      bias: definition.bias / 100,
      steps: definition.steps / 100,
      deja: definition.deja / 100,
      length: definition.length,
      diversity: definition.diversity / 100,
    });
  }

  setModTransport(running: boolean): void {
    for (const swell of this.swells.values()) {
      swell.node.port.postMessage({ type: 'transport', running });
      if (!running) {
        swell.monitorValues = [0, 0, 0, 0];
      }
    }
    if (!running) this.slowScopeHistory.clear();
  }

  setClockTransport(running: boolean): void {
    this.clockTransportRunning = running;
    this.updateAllClocks();
    this.emit();
  }

  getClockStatus(): { bpm: number; running: boolean } {
    return { bpm: this.masterClockBpm, running: this.clockTransportRunning && this.masterClockEnabled && this.masterClockBpm > 0 };
  }

  getClockTiming(name = 'Clock'): { beatDurationMs: number; running: boolean } {
    const clock = this.clocks.get(name);
    const rate = clock?.rate ?? (name === 'Clock' ? 1 : 0);
    const enabled = clock?.enabled ?? (name === 'Clock' ? this.masterClockEnabled : false);
    const effectiveBpm = this.masterClockBpm * rate;
    const nominal = effectiveBpm > 0 ? 60000 / effectiveBpm : Infinity;
    return {
      beatDurationMs: clock?.lastPeriodMs && clock.lastPeriodMs > 0 ? clock.lastPeriodMs : nominal,
      running: this.clockTransportRunning && this.masterClockEnabled && enabled && effectiveBpm > 0,
    };
  }

  getTriggerViewEvents(signal: string): Array<{ progress: number; age: number }> {
    const name = signal === 'Clock.out' ? 'Clock' : signal.match(/^([A-Za-z_]\w*)\.out$/)?.[1];
    if (!name || !this.context) return [];
    const clock = this.clocks.get(name);
    if (!clock) return [];

    const now = this.context.currentTime;
    clock.visualEvents = clock.visualEvents.filter((event) => now - event.emittedAt < event.travelDuration);
    return clock.visualEvents.map((event) => {
      const age = Math.max(0, now - event.emittedAt);
      return {
        progress: Math.max(0, Math.min(1, age / event.travelDuration)),
        age,
      };
    });
  }

  private createOrUpdateClock(name: string, rate: number, jitter: number, drift: number, enabled = true): void {
    if (!this.clockWorkletLoaded) return;
    let clock = this.clocks.get(name);
    if (!clock) {
      const context = this.ensureContext();
      const node = new AudioWorkletNode(context, 'sonus-clock', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { bpm: this.masterClockBpm, rate, jitter, drift },
      });
      clock = { enabled, node, rate, jitter, drift, lastTriggerTime: null, lastPeriodMs: null, triggerCount: 0, visualEvents: [] };
      node.port.onmessage = (event) => {
        const message = event.data;
        if (!message || message.type !== 'trigger' || !Number.isFinite(message.frame)) return;
        const current = this.clocks.get(name);
        if (!current || !this.context) return;
        const emittedAt = message.frame / this.context.sampleRate;
        current.lastTriggerTime = emittedAt;
        current.triggerCount += 1;
        for (const listener of this.clockTriggerListeners.get(name) ?? []) listener();
        const periodAtEmission = Number.isFinite(message.periodSamples) && message.periodSamples > 0
          ? message.periodSamples / this.context.sampleRate
          : (this.masterClockBpm * current.rate > 0 ? 60 / (this.masterClockBpm * current.rate) : 0);
        current.lastPeriodMs = periodAtEmission > 0 ? periodAtEmission * 1000 : null;
        if (periodAtEmission > 0) {
          current.visualEvents.push({ emittedAt, travelDuration: Math.max(0.05, periodAtEmission * 4) });
          if (current.visualEvents.length > 128) current.visualEvents.splice(0, current.visualEvents.length - 128);
        }
      };
      this.clocks.set(name, clock);
    }
    clock.enabled = enabled;
    if (name === 'Clock') this.masterClockEnabled = enabled;
    clock.rate = rate;
    clock.jitter = jitter;
    clock.drift = drift;
    clock.node.port.postMessage({ type: 'clock', bpm: this.masterClockBpm, rate, jitter, drift, running: this.clockTransportRunning && this.masterClockEnabled && enabled });
  }

  private updateAllClocks(): void {
    for (const clock of this.clocks.values()) {
      clock.node.port.postMessage({
        type: 'clock',
        bpm: this.masterClockBpm,
        rate: clock.rate,
        jitter: clock.jitter,
        drift: clock.drift,
        running: this.clockTransportRunning && this.masterClockEnabled && clock.enabled,
      });
    }
  }

  private removeClock(name: string): void {
    const clock = this.clocks.get(name);
    if (!clock) return;
    this.removeView(`${name}.out`);
    clock.node.disconnect();
    clock.node.port.close();
    this.clocks.delete(name);
  }

  async testTone(frequency = 440): Promise<void> {
    if (!Number.isFinite(frequency) || frequency < 20 || frequency > 20000) {
      throw new RangeError('test frequency must be between 20 and 20000 Hz');
    }

    await this.start();
    const context = this.context;
    const master = this.master;
    if (!context || !master) throw new Error('audio engine unavailable');

    if (this.testOscillator && this.testGain) {
      this.testOscillator.frequency.setTargetAtTime(frequency, context.currentTime, 0.01);
      this.emit();
      return;
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    gain.gain.setValueAtTime(0.0, context.currentTime);
    gain.gain.linearRampToValueAtTime(0.08, context.currentTime + 0.02);

    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start();

    this.testOscillator = oscillator;
    this.testGain = gain;
    this.emit();
  }

  stopTestTone(): void {
    const context = this.context;
    const oscillator = this.testOscillator;
    const gain = this.testGain;

    this.testOscillator = null;
    this.testGain = null;

    if (!oscillator || !gain || !context) {
      this.emit();
      return;
    }

    const now = context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.015);
    oscillator.stop(now + 0.02);
    oscillator.addEventListener('ended', () => {
      oscillator.disconnect();
      gain.disconnect();
    }, { once: true });
    this.emit();
  }

  stopProgramOutput(): void {
    // Stop the audible program without destroying DSP objects or runtime state.
    // A later applyProgram() recreates the declarative routes.
    for (const key of [...this.routes.keys()]) this.removeRoute(key);
  }

  stopMusicalSources(): void {
    // Disconnect only generator/modulator sources. Downstream processors and
    // their routes stay alive, allowing reverb/delay/filter tails to decay.
    const musicalSources = new Set([
      ...this.oscillators.keys(),
      ...this.voices.keys(),
      ...this.matters.keys(),
      ...this.resonators.keys(),
      ...this.swells.keys(),
      ...[...this.filters.entries()]
        .filter(([, filter]) => Boolean(filter.ownerVoice))
        .map(([name]) => name),
    ]);
    for (const [key, route] of [...this.routes.entries()]) {
      const sourceName = route.source.match(/^([A-Za-z_]\w*)\./)?.[1];
      if (sourceName && musicalSources.has(sourceName)) this.removeRoute(key);
    }

    // FILTER is not a tail-preserving effect. Clear the SVF integrator state on
    // musical stop so high resonance cannot remain audible after transport stops.
    for (const filter of this.filters.values()) filter.node.port.postMessage({ type: 'reset' });
  }

  panic(): void {
    this.stopTestTone();
    if (this.hardwareGain && this.context) {
      const now = this.context.currentTime;
      this.hardwareGain.gain.cancelScheduledValues(now);
      this.hardwareGain.gain.setValueAtTime(0, now);
      this.hardwareGain.gain.linearRampToValueAtTime(
        DEFAULT_HARDWARE_OUTPUT_GAIN * (this.hardwareOutputLevel / 100),
        now + 0.01,
      );
    }
    this.emit();
  }

  private removeRoute(key: string): void {
    const route = this.routes.get(key);
    if (!route) return;

    try {
      this.sourceForSignal(route.source).node.disconnect(route.gain);
    } catch {
      // Source may already have gone away during reconcile.
    }

    const context = this.context;
    if (context) {
      const now = context.currentTime;
      route.gain.gain.cancelScheduledValues(now);
      route.gain.gain.setValueAtTime(route.gain.gain.value, now);
      route.gain.gain.linearRampToValueAtTime(0, now + 0.01);
      window.setTimeout(() => route.gain.disconnect(), 15);
    } else {
      route.gain.disconnect();
    }

    this.routes.delete(key);
  }

  private removeOscillator(name: string): void {
    const voice = this.oscillators.get(name);
    if (!voice) return;

    const context = this.context;
    if (context) {
      const now = context.currentTime;
      voice.output.gain.cancelScheduledValues(now);
      voice.output.gain.setValueAtTime(voice.output.gain.value, now);
      voice.output.gain.linearRampToValueAtTime(0, now + 0.01);
      voice.oscillator.stop(now + 0.015);
    } else {
      voice.oscillator.stop();
    }

    this.removeView(`${name}.out`);

    voice.oscillator.addEventListener('ended', () => {
      voice.oscillator.disconnect();
      voice.output.disconnect();
    }, { once: true });
    this.oscillators.delete(name);
  }

  private removeSwell(name: string): void {
    const swell = this.swells.get(name);
    if (!swell) return;
    try { swell.node.disconnect(); } catch {}
    swell.node.port.close();
    this.swells.delete(name);
    for (const signal of [...this.slowScopeHistory.keys()]) {
      if (signal.startsWith(`${name}.`)) this.slowScopeHistory.delete(signal);
    }
  }


  private removeDices(name: string): void {
    const dices = this.dices.get(name);
    if (!dices) return;
    try { dices.node.disconnect(); } catch {}
    dices.node.port.close();
    this.dices.delete(name);
    for (const signal of [...this.slowScopeHistory.keys()]) {
      if (signal.startsWith(`${name}.`)) this.slowScopeHistory.delete(signal);
    }
  }


  private removeFilter(name: string): void {
    const filter = this.filters.get(name);
    if (!filter) return;
    if (filter.ownerVoice) {
      const voice = this.voices.get(filter.ownerVoice);
      const matter = this.matters.get(filter.ownerVoice);
      if (voice) {
        try { voice.outGain.disconnect(filter.input); } catch {}
        try { voice.auxGain.disconnect(filter.input); } catch {}
      }
      if (matter) {
        try { matter.mainGain.disconnect(filter.input); } catch {}
        try { matter.auxGain.disconnect(filter.input); } catch {}
      }
    }
    for (const node of [filter.input, filter.lowOut, filter.highOut, filter.bandOut, filter.notchOut, filter.peakOut]) {
      try { node.disconnect(); } catch {}
    }
    try { filter.node.disconnect(); } catch {}
    filter.node.port.close();
    this.filters.delete(name);
  }

  private removeDelay(name: string): void {
    const delay=this.delays.get(name); if(!delay) return;
    for(const node of [delay.monoInput,delay.inputL,delay.inputR,delay.inputMerger,delay.outputSplitter,delay.outputL,delay.outputR]) { try { node.disconnect(); } catch {} }
    try { delay.node.disconnect(); } catch {} delay.node.port.close(); this.delays.delete(name);
  }

  private removeSky(name: string): void {
    const sky=this.skies.get(name); if(!sky) return;
    for(const node of [sky.monoInput,sky.inputL,sky.inputR,sky.inputMerger,sky.outputSplitter,sky.dryL,sky.dryR,sky.wetL,sky.wetR,sky.outputL,sky.outputR]) {
      try { node.disconnect(); } catch {}
    }
    try { sky.node.disconnect(); } catch {}
    sky.node.port.close();
    this.skies.delete(name);
  }

  private removeMist(name: string): void {
    const mist = this.mists.get(name);
    if (!mist) return;

    for (const node of [
      mist.monoInput,
      mist.inputL,
      mist.inputR,
      mist.dryL,
      mist.dryR,
      mist.wetL,
      mist.wetR,
      mist.outputL,
      mist.outputR,
    ]) {
      try { node.disconnect(); } catch {}
    }
    try { mist.node.disconnect(); } catch {}
    mist.node.port.close();

    this.mists.delete(name);
    for (const signal of [...this.views.keys()]) {
      if (signal.startsWith(`${name}.`)) this.removeView(signal);
    }
  }

  private removeMatter(name: string): void {
    const matter = this.matters.get(name);
    if (!matter) return;
    this.removeView(`${name}.out`);
    this.removeView(`${name}.aux`);
    matter.mainGain.disconnect();
    matter.auxGain.disconnect();
    matter.node.disconnect();
    matter.node.port.close();
    this.matters.delete(name);
  }

  private removeResonator(name: string): void {
    const resonator = this.resonators.get(name);
    if (!resonator) return;
    this.removeView(`${name}.out`);
    this.removeView(`${name}.aux`);
    resonator.mainGain.disconnect();
    resonator.auxGain.disconnect();
    resonator.node.disconnect();
    resonator.node.port.close();
    this.resonators.delete(name);
  }

  private removeVoice(name: string): void {
    const voice = this.voices.get(name);
    if (!voice) return;
    this.removeView(`${name}.out`);
    this.removeView(`${name}.aux`);
    this.removeView(`${name}.low`);
    this.removeView(`${name}.high`);
    this.removeView(`${name}.band`);
    this.removeView(`${name}.notch`);
    this.removeView(`${name}.peak`);
    const controlMonitor = this.controlMonitors.get(`${name}.v_oct`);
    if (controlMonitor) {
      voice.vOctInput.disconnect(controlMonitor);
      controlMonitor.disconnect();
      this.controlMonitors.delete(`${name}.v_oct`);
    }
    voice.vOctInput.disconnect();
    voice.outGain.disconnect();
    voice.auxGain.disconnect();
    voice.node.disconnect();
    voice.node.port.close();
    this.voices.delete(name);
  }

  private removeGain(name: string): void {
    const voice = this.gains.get(name);
    if (!voice) return;
    this.removeView(`${name}.out`);
    voice.node.disconnect();
    this.gains.delete(name);
  }

  private requireOscillator(name: string): OscillatorVoice {
    const voice = this.oscillators.get(name);
    if (!voice) throw new Error(`unknown object: ${name}`);
    return voice;
  }

  private requireGain(name: string): GainVoice {
    const voice = this.gains.get(name);
    if (!voice) throw new Error(`unknown gain: ${name}`);
    return voice;
  }


  private async ensureSwellRuntime(): Promise<void> {
    if (this.swellWorkletLoaded && this.swellWasmBytes) return;
    const context = this.ensureContext();
    const response = await fetch(publicAssetUrl('/dsp/swell.wasm'));
    if (!response.ok) {
      throw new Error('Swell DSP missing. Run npm run dsp:setup and npm run dsp:build.');
    }
    this.swellWasmBytes = await response.arrayBuffer();
    await context.audioWorklet.addModule(publicAssetUrl('/worklets/swell-processor.js'));
    this.swellWorkletLoaded = true;
  }


  private async ensureDicesRuntime(): Promise<void> {
    if (this.dicesWorkletLoaded && this.dicesWasmBytes) return;
    const context = this.ensureContext();
    const response = await fetch(publicAssetUrl('/dsp/dices.wasm'));
    if (!response.ok) {
      throw new Error('Dices DSP missing. Run npm run dsp:setup and npm run dsp:build.');
    }
    this.dicesWasmBytes = await response.arrayBuffer();
    await context.audioWorklet.addModule(publicAssetUrl('/worklets/dices-processor.js'));
    this.dicesWorkletLoaded = true;
  }

  private async ensureMistRuntime(): Promise<void> {
    if (this.mistWorkletLoaded && this.mistWasmBytes) return;
    const context = this.ensureContext();
    const response = await fetch(publicAssetUrl('/dsp/mist.wasm'));
    if (!response.ok) {
      throw new Error('Mist DSP missing. Run npm run dsp:setup and npm run dsp:build.');
    }
    this.mistWasmBytes = await response.arrayBuffer();
    await context.audioWorklet.addModule(publicAssetUrl('/worklets/mist-processor.js'));
    this.mistWorkletLoaded = true;
  }

  private async ensureSkyRuntime(): Promise<void> {
    if (this.skyWorkletLoaded && this.skyWasmBytes) return;
    const context=this.ensureContext();
    const response=await fetch(publicAssetUrl('/dsp/sky.wasm'));
    if (!response.ok) throw new Error('Sky DSP missing. Run npm run dsp:setup and npm run dsp:build.');
    this.skyWasmBytes=await response.arrayBuffer();
    await context.audioWorklet.addModule(publicAssetUrl('/worklets/sky-processor.js'));
    this.skyWorkletLoaded=true;
  }

  private async ensureDelayRuntime(): Promise<void> {
    if (this.delayWorkletLoaded && this.delayWasmBytes) return;
    const context=this.ensureContext(); const response=await fetch(publicAssetUrl('/dsp/delay.wasm'));
    if (!response.ok) throw new Error('Delay DSP missing. Run npm run dsp:setup and npm run dsp:build.');
    this.delayWasmBytes=await response.arrayBuffer(); await context.audioWorklet.addModule(publicAssetUrl('/worklets/delay-processor.js')); this.delayWorkletLoaded=true;
  }

  private async ensureDaisyFiltersRuntime(): Promise<void> {
    if (this.daisyFiltersWorkletLoaded && this.daisyFiltersWasmBytes) return;
    const context = this.ensureContext();
    const response = await fetch(publicAssetUrl('/dsp/daisy-filters.wasm'));
    if (!response.ok) throw new Error('DaisySP filter DSP missing. Run npm run dsp:setup and npm run dsp:build.');
    this.daisyFiltersWasmBytes = await response.arrayBuffer();
    await context.audioWorklet.addModule(publicAssetUrl('/worklets/daisy-filters-processor.js'));
    this.daisyFiltersWorkletLoaded = true;
  }

  private async ensureClockRuntime(): Promise<void> {
    if (this.clockWorkletLoaded) return;
    const context = this.ensureContext();
    await context.audioWorklet.addModule(publicAssetUrl('/worklets/clock-processor.js'));
    this.clockWorkletLoaded = true;
  }

  private async ensureMatterRuntime(): Promise<void> {
    if (this.matterWorkletLoaded && this.matterWasmBytes) return;
    const context = this.ensureContext();
    const response = await fetch(publicAssetUrl('/dsp/matter.wasm'));
    if (!response.ok) {
      throw new Error('Matter DSP missing. Run npm run dsp:setup and npm run dsp:build.');
    }
    this.matterWasmBytes = await response.arrayBuffer();
    await context.audioWorklet.addModule(publicAssetUrl('/worklets/matter-processor.js'));
    this.matterWorkletLoaded = true;
  }

  private async ensureResonatorRuntime(): Promise<void> {
    if (this.resonatorWorkletLoaded && this.resonatorWasmBytes) return;
    const context = this.ensureContext();
    const response = await fetch(publicAssetUrl('/dsp/resonator.wasm'));
    if (!response.ok) {
      throw new Error('Resonator DSP missing. Run npm run dsp:setup and npm run dsp:build.');
    }
    this.resonatorWasmBytes = await response.arrayBuffer();
    await context.audioWorklet.addModule(publicAssetUrl('/worklets/resonator-processor.js'));
    this.resonatorWorkletLoaded = true;
  }

  private async ensureVoiceRuntime(): Promise<void> {
    if (this.voiceWorkletLoaded && this.voiceWasmBytes) return;

    const context = this.ensureContext();
    const response = await fetch(publicAssetUrl('/dsp/voice.wasm'));
    if (!response.ok) {
      throw new Error('Voice DSP missing. Run npm run dsp:setup and npm run dsp:build.');
    }
    this.voiceWasmBytes = await response.arrayBuffer();
    await context.audioWorklet.addModule(publicAssetUrl('/worklets/voice-processor.js'));
    this.voiceWorkletLoaded = true;
  }

  private async applyRequestedOutputDevice(context: AudioContext): Promise<void> {
    if (!this.requestedOutputDeviceId) return;
    const selectable = context as AudioContext & { setSinkId?: (sinkId: string) => Promise<void> };
    if (typeof selectable.setSinkId !== 'function') return;
    await selectable.setSinkId(this.requestedOutputDeviceId);
  }

  private async disposeAudioContext(): Promise<void> {
    const context = this.context;
    if (!context) return;

    this.stopTestTone();
    for (const key of [...this.routes.keys()]) this.removeRoute(key);
    for (const name of [...this.clocks.keys()]) this.removeClock(name);
    for (const name of [...this.filters.keys()]) this.removeFilter(name);
    for (const name of [...this.delays.keys()]) this.removeDelay(name);
    for (const name of [...this.skies.keys()]) this.removeSky(name);
    for (const name of [...this.mists.keys()]) this.removeMist(name);
    for (const name of [...this.swells.keys()]) this.removeSwell(name);
    for (const name of [...this.dices.keys()]) this.removeDices(name);
    for (const name of [...this.resonators.keys()]) this.removeResonator(name);
    for (const name of [...this.matters.keys()]) this.removeMatter(name);
    for (const name of [...this.voices.keys()]) this.removeVoice(name);
    for (const name of [...this.oscillators.keys()]) this.removeOscillator(name);
    for (const name of [...this.gains.keys()]) this.removeGain(name);
    for (const signal of [...this.views.keys()]) this.removeView(signal);
    for (const monitor of this.controlMonitors.values()) { try { monitor.disconnect(); } catch {} }
    this.controlMonitors.clear();

    for (const node of [this.audioOutL, this.audioOutR, this.audioMerger, this.master, this.hardwareGain]) {
      try { node?.disconnect(); } catch {}
    }
    this.audioOutL = null;
    this.audioOutR = null;
    this.audioMerger = null;
    this.master = null;
    this.hardwareGain = null;
    this.context = null;
    this.pendingProgram = null;
    this.voiceWorkletLoaded = false;
    this.matterWorkletLoaded = false;
    this.resonatorWorkletLoaded = false;
    this.swellWorkletLoaded = false;
    this.mistWorkletLoaded = false;
    this.skyWorkletLoaded = false;
    this.daisyFiltersWorkletLoaded = false;
    this.clockWorkletLoaded = false;
    this.slowScopeHistory.clear();
    if (context.state !== 'closed') await context.close();
  }

  private ensureContext(): AudioContext {
    if (
      this.context &&
      this.master &&
      this.audioOutL &&
      this.audioOutR &&
      this.audioMerger &&
      this.hardwareGain
    ) return this.context;

    const context = new AudioContext({
      latencyHint: this.requestedLatencyMode,
      ...(this.requestedSampleRate ? { sampleRate: this.requestedSampleRate } : {}),
    });

    // Logical stereo main bus. L/R stay independent until the final merger.
    const audioOutL = context.createGain();
    const audioOutR = context.createGain();
    const audioMerger = context.createChannelMerger(2);
    const master = context.createGain();
    const hardwareGain = context.createGain();

    audioOutL.gain.value = 1;
    audioOutR.gain.value = 1;
    master.gain.value = 1;
    hardwareGain.gain.value = DEFAULT_HARDWARE_OUTPUT_GAIN * (this.hardwareOutputLevel / 100);

    audioOutL.connect(audioMerger, 0, 0);
    audioOutR.connect(audioMerger, 0, 1);
    audioMerger.connect(master);
    master.connect(hardwareGain);
    hardwareGain.connect(context.destination);

    context.addEventListener('statechange', () => this.emit());
    this.context = context;
    this.audioOutL = audioOutL;
    this.audioOutR = audioOutR;
    this.audioMerger = audioMerger;
    this.master = master;
    this.hardwareGain = hardwareGain;
    this.emit();
    return context;
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
