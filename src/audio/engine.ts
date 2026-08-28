export type AudioEngineState = 'idle' | 'running' | 'suspended';

export interface AudioEngineSnapshot {
  state: AudioEngineState;
  sampleRate: number | null;
  testFrequency: number | null;
  objectCount: number;
  routeCount: number;
}

export type SignalKind = 'signal' | 'gate' | 'trigger';

const DEFAULT_HARDWARE_OUTPUT_GAIN = 0.12;

export interface AudioProgram {
  clock: { bpm: number };
  clockSources: Array<{ name: string; rate: number }>;
  oscillators: Array<{
    name: string;
    frequency: number;
  }>;
  voices: Array<{
    name: string;
    model: number;
    frequency: number;
    harmo: number;
    timbre: number;
    morph: number;
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
    rate: number;
    jitter: number;
    gateBias: number;
    gateLength: number;
    gateJitter: number;
    spread: number;
    bias: number;
    steps: number;
    deja: number;
    length: number;
    scale: number;
  }>;
  mists: Array<{
    name: string;
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
  node: AudioWorkletNode;
  vOctInput: GainNode;
  harmoInput: GainNode;
  timbreInput: GainNode;
  morphInput: GainNode;
  model: number;
  frequency: number;
  harmo: number;
  timbre: number;
  morph: number;
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
}

interface DicesVoice {
  node: AudioWorkletNode;
  rate: number;
  jitter: number;
  gateBias: number;
  gateLength: number;
  gateJitter: number;
  spread: number;
  bias: number;
  steps: number;
  deja: number;
  length: number;
  scale: number;
}

interface MistVoice {
  node: AudioWorkletNode;
  monoInput: GainNode;
  inputL: GainNode;
  inputR: GainNode;
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
  node: AudioWorkletNode;
  rate: number;
  lastTriggerTime: number | null;
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
  private master: GainNode | null = null;
  private hardwareGain: GainNode | null = null;
  private testOscillator: OscillatorNode | null = null;
  private testGain: GainNode | null = null;
  private oscillators = new Map<string, OscillatorVoice>();
  private gains = new Map<string, GainVoice>();
  private voices = new Map<string, MacroVoice>();
  private swells = new Map<string, SwellVoice>();
  private dices = new Map<string, DicesVoice>();
  private mists = new Map<string, MistVoice>();
  private clocks = new Map<string, ClockSource>();
  private clockTriggerListeners = new Map<string, Set<() => void>>();
  private masterClockBpm = 0;
  private clockTransportRunning = true;
  private voiceWasmBytes: ArrayBuffer | null = null;
  private swellWasmBytes: ArrayBuffer | null = null;
  private dicesWasmBytes: ArrayBuffer | null = null;
  private mistWasmBytes: ArrayBuffer | null = null;
  private voiceWorkletLoaded = false;
  private swellWorkletLoaded = false;
  private dicesWorkletLoaded = false;
  private mistWorkletLoaded = false;
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
      objectCount: this.oscillators.size + this.gains.size + this.voices.size + this.swells.size + this.dices.size + this.clocks.size,
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
    await this.ensureVoiceRuntime();
    await this.ensureSwellRuntime();
    await this.ensureDicesRuntime();
    await this.ensureMistRuntime();
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

  applyProgram(program: AudioProgram): void {
    if ((program.voices.length > 0 && !this.voiceWorkletLoaded) ||
        (program.swells.length > 0 && !this.swellWorkletLoaded) ||
        (program.dices.length > 0 && !this.dicesWorkletLoaded) ||
        (program.mists.length > 0 && !this.mistWorkletLoaded)) {
      this.pendingProgram = program;
      return;
    }

    this.masterClockBpm = program.clock.bpm;
    const desiredClockSources = new Map(program.clockSources.map((definition) => [definition.name, definition]));
    const desiredOscillators = new Map(program.oscillators.map((definition) => [definition.name, definition]));
    const desiredVoices = new Map(program.voices.map((definition) => [definition.name, definition]));
    const desiredSwells = new Map(program.swells.map((definition) => [definition.name, definition]));
    const desiredDices = new Map(program.dices.map((definition) => [definition.name, definition]));
    const desiredMists = new Map(program.mists.map((definition) => [definition.name, definition]));
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

    for (const [name] of this.voices) {
      if (!desiredVoices.has(name)) this.removeVoice(name);
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

    for (const definition of program.clockSources) this.createOrUpdateClock(definition.name, definition.rate);
    this.updateAllClocks();

    for (const definition of program.oscillators) {
      this.createOscillator(definition.name);
      this.setOscillatorFrequency(definition.name, definition.frequency, false);
    }

    for (const definition of program.voices) {
      this.createVoice(definition);
      this.updateVoice(definition);
    }

    for (const definition of program.swells) {
      this.createSwell(definition);
      this.updateSwell(definition);
    }

    for (const definition of program.dices) {
      this.createDices(definition);
      this.updateDices(definition);
    }

    for (const definition of program.mists) {
      this.createMist(definition);
      this.updateMist(definition);
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
    const vOctInput = context.createGain();
    const harmoInput = context.createGain();
    const timbreInput = context.createGain();
    const morphInput = context.createGain();
    vOctInput.gain.value = 1;
    harmoInput.gain.value = 1;
    timbreInput.gain.value = 1;
    morphInput.gain.value = 1;
    vOctInput.connect(node, 0, 1);
    harmoInput.connect(node, 0, 2);
    timbreInput.connect(node, 0, 3);
    morphInput.connect(node, 0, 4);

    this.voices.set(definition.name, {
      node,
      vOctInput,
      harmoInput,
      timbreInput,
      morphInput,
      model: definition.model,
      frequency: definition.frequency,
      harmo: definition.harmo,
      timbre: definition.timbre,
      morph: definition.morph,
    });
  }

  private updateVoice(definition: AudioProgram['voices'][number]): void {
    const voice = this.voices.get(definition.name);
    if (!voice) return;
    voice.model = definition.model;
    voice.frequency = definition.frequency;
    voice.harmo = definition.harmo;
    voice.timbre = definition.timbre;
    voice.morph = definition.morph;
    voice.node.port.postMessage({
      type: 'params',
      model: definition.model,
      frequency: definition.frequency,
      harmo: definition.harmo / 100,
      timbre: definition.timbre / 100,
      morph: definition.morph / 100,
    });
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
    });
  }

  private updateSwell(definition: AudioProgram['swells'][number]): void {
    const swell = this.swells.get(definition.name);
    if (!swell) return;
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

  private createDices(definition: AudioProgram['dices'][number]): void {
    if (this.dices.has(definition.name)) return;
    if (!this.dicesWorkletLoaded || !this.dicesWasmBytes) {
      throw new Error('Dices DSP is not ready; run :start after building the DSP');
    }
    const context = this.ensureContext();
    const node = new AudioWorkletNode(context, 'sonus-dices', {
      numberOfInputs: 1,
      numberOfOutputs: 7,
      outputChannelCount: [1, 1, 1, 1, 1, 1, 1],
      processorOptions: { wasmBytes: this.dicesWasmBytes.slice(0) },
    });
    this.dices.set(definition.name, {
      node,
      rate: definition.rate,
      jitter: definition.jitter,
      gateBias: definition.gateBias,
      gateLength: definition.gateLength,
      gateJitter: definition.gateJitter,
      spread: definition.spread,
      bias: definition.bias,
      steps: definition.steps,
      deja: definition.deja,
      length: definition.length,
      scale: definition.scale,
    });
  }

  private updateDices(definition: AudioProgram['dices'][number]): void {
    const dices = this.dices.get(definition.name);
    if (!dices) return;
    dices.rate = definition.rate;
    dices.jitter = definition.jitter;
    dices.gateBias = definition.gateBias;
    dices.gateLength = definition.gateLength;
    dices.gateJitter = definition.gateJitter;
    dices.spread = definition.spread;
    dices.bias = definition.bias;
    dices.steps = definition.steps;
    dices.deja = definition.deja;
    dices.length = definition.length;
    dices.scale = definition.scale;
    dices.node.port.postMessage({
      type: 'params',
      rate: definition.rate / 100,
      jitter: definition.jitter / 100,
      gateBias: definition.gateBias / 100,
      gateLength: definition.gateLength / 100,
      gateJitter: definition.gateJitter / 100,
      spread: definition.spread / 100,
      bias: definition.bias / 100,
      steps: definition.steps / 100,
      deja: definition.deja / 100,
      length: definition.length,
      scale: definition.scale,
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

    inputL.connect(node, 0, 0);
    inputR.connect(node, 0, 1);

    inputL.connect(dryL);
    inputR.connect(dryR);
    dryL.connect(outputL);
    dryR.connect(outputR);

    node.connect(wetL, 0, 0);
    node.connect(wetR, 1, 0);
    wetL.connect(outputL);
    wetR.connect(outputR);

    this.mists.set(definition.name, {
      node,
      monoInput,
      inputL,
      inputR,
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
    Object.assign(mist, definition);

    const context = this.ensureContext();
    const mix = Math.max(0, Math.min(1, definition.mix / 100));
    const dryGain = Math.cos(mix * Math.PI * 0.5);
    const wetGain = Math.sin(mix * Math.PI * 0.5);

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

    const swellMatch = signal.match(/^([A-Za-z_]\w*)\.out[1-4]$/);
    const swell = swellMatch ? this.swells.get(swellMatch[1]) : undefined;
    const dicesMatch = signal.match(/^([A-Za-z_]\w*)\.y$/);
    const dicesY = dicesMatch ? this.dices.get(dicesMatch[1]) : undefined;

    if (!swell && !dicesY) {
      view.analyser.getFloatTimeDomainData(target);
      return true;
    }

    if (swell && swell.frequency >= 12) {
      view.analyser.getFloatTimeDomainData(target);
      for (let i = 0; i < target.length; i += 1) target[i] /= 5;
      return true;
    }

    const probe = new Float32Array(32);
    view.analyser.getFloatTimeDomainData(probe);
    const now = performance.now() / 1000;
    const seconds = dicesY
      ? 12
      : Math.min(20, Math.max(2, 2 / Math.max(0.05, swell!.frequency)));
    const interval = seconds / Math.max(1, target.length - 1);
    let history = this.slowScopeHistory.get(signal);
    if (!history) {
      history = { values: [], lastSampleAt: now - interval };
      this.slowScopeHistory.set(signal, history);
    }

    if (now - history.lastSampleAt >= interval) {
      const raw = probe[probe.length - 1] ?? 0;
      // Swell and Dices.Y are Eurorack-style CV signals. Keep routing values
      // in volts, but map +/-5V to the oscilloscope's normalized +/-1 domain.
      history.values.push(raw / 5);
      history.lastSampleAt = now;
      if (history.values.length > target.length) history.values.splice(0, history.values.length - target.length);
    }

    const rawFill = probe[probe.length - 1] ?? 0;
    const fill = history.values[0] ?? rawFill / 5;
    target.fill(fill);
    const offset = target.length - history.values.length;
    for (let i = 0; i < history.values.length; i += 1) target[offset + i] = history.values[i];
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

    const dicesOutput = signal.match(/^([A-Za-z_]\w*)\.(t[1-3]|x[1-3]|y)$/);
    if (dicesOutput) {
      const dices = this.dices.get(dicesOutput[1]);
      if (!dices) throw new Error(`unknown Dices object: ${dicesOutput[1]}`);
      const port = dicesOutput[2];
      const outputs: Record<string, number> = {
        t1: 0, t2: 1, t3: 2,
        x1: 3, x2: 4, x3: 5,
        y: 6,
      };
      return { node: dices.node, output: outputs[port] };
    }

    const mistOutput = signal.match(/^([A-Za-z_]\w*)\.(outL|outR)$/);
    if (mistOutput) {
      const mist = this.mists.get(mistOutput[1]);
      if (!mist) throw new Error(`unknown Mist object: ${mistOutput[1]}`);
      return { node: mistOutput[2] === 'outR' ? mist.outputR : mist.outputL, output: 0 };
    }

    const match = signal.match(/^([A-Za-z_]\w*)\.(out|aux)$/);
    if (!match) throw new Error(`unknown signal: ${signal}`);
    const [, name, port] = match;

    const voice = this.voices.get(name);
    if (voice) return { node: voice.node, output: port === 'aux' ? 1 : 0 };

    if (port === 'aux') throw new Error(`aux output is not available on ${name}`);
    const oscillator = this.oscillators.get(name);
    if (oscillator) return { node: oscillator.output, output: 0 };
    const gain = this.gains.get(name);
    if (gain) return { node: gain.node, output: 0 };
    throw new Error(`unknown object: ${name}`);
  }

  private destinationForPort(port: string): SignalDestination {
    if (port === 'Audio.out') {
      this.ensureContext();
      if (!this.master) throw new Error('audio engine unavailable');
      return { node: this.master, input: 0 };
    }

    const mistInput = port.match(/^([A-Za-z_]\w*)\.(in|inL|inR)$/);
    if (mistInput) {
      const mist = this.mists.get(mistInput[1]);
      if (!mist) throw new Error(`unknown Mist input: ${mistInput[1]}`);
      if (mistInput[2] === 'in') return { node: mist.monoInput, input: 0 };
      return { node: mistInput[2] === 'inR' ? mist.inputR : mist.inputL, input: 0 };
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
      const dices = this.dices.get(clock[1]);
      if (dices) return { node: dices.node, input: 0 };
      throw new Error(`clock input is only available on Swell or Dices objects: ${clock[1]}`);
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

  setVoiceParameter(name: string, parameter: 'freq' | 'model' | 'harmo' | 'timbre' | 'morph', value: number): void {
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
    voice[parameter] = value;
    voice.node.port.postMessage({ type: 'params', [parameter]: value / 100 });
  }

  setClockTransport(running: boolean): void {
    this.clockTransportRunning = running;
    this.updateAllClocks();
    this.emit();
  }

  getClockStatus(): { bpm: number; running: boolean } {
    return { bpm: this.masterClockBpm, running: this.clockTransportRunning && this.masterClockBpm > 0 };
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

  private createOrUpdateClock(name: string, rate: number): void {
    if (!this.clockWorkletLoaded) return;
    let clock = this.clocks.get(name);
    if (!clock) {
      const context = this.ensureContext();
      const node = new AudioWorkletNode(context, 'sonus-clock', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { bpm: this.masterClockBpm, rate },
      });
      clock = { node, rate, lastTriggerTime: null, triggerCount: 0, visualEvents: [] };
      node.port.onmessage = (event) => {
        const message = event.data;
        if (!message || message.type !== 'trigger' || !Number.isFinite(message.frame)) return;
        const current = this.clocks.get(name);
        if (!current || !this.context) return;
        const emittedAt = message.frame / this.context.sampleRate;
        current.lastTriggerTime = emittedAt;
        current.triggerCount += 1;
        for (const listener of this.clockTriggerListeners.get(name) ?? []) listener();
        const effectiveBpm = this.masterClockBpm * current.rate;
        if (effectiveBpm > 0) {
          const periodAtEmission = 60 / effectiveBpm;
          current.visualEvents.push({
            emittedAt,
            travelDuration: Math.max(0.05, periodAtEmission * 4),
          });
          if (current.visualEvents.length > 128) current.visualEvents.splice(0, current.visualEvents.length - 128);
        }
      };
      this.clocks.set(name, clock);
    }
    clock.rate = rate;
    clock.node.port.postMessage({ type: 'clock', bpm: this.masterClockBpm, rate, running: this.clockTransportRunning });
  }

  private updateAllClocks(): void {
    for (const clock of this.clocks.values()) {
      clock.node.port.postMessage({ type: 'clock', bpm: this.masterClockBpm, rate: clock.rate, running: this.clockTransportRunning });
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

  panic(): void {
    this.stopTestTone();
    if (this.hardwareGain && this.context) {
      const now = this.context.currentTime;
      this.hardwareGain.gain.cancelScheduledValues(now);
      this.hardwareGain.gain.setValueAtTime(0, now);
      this.hardwareGain.gain.linearRampToValueAtTime(DEFAULT_HARDWARE_OUTPUT_GAIN, now + 0.01);
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
    for (const signal of [...this.views.keys()]) {
      if (signal.startsWith(`${name}.`)) this.removeView(signal);
    }
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

  private removeVoice(name: string): void {
    const voice = this.voices.get(name);
    if (!voice) return;
    this.removeView(`${name}.out`);
    this.removeView(`${name}.aux`);
    const controlMonitor = this.controlMonitors.get(`${name}.v_oct`);
    if (controlMonitor) {
      voice.vOctInput.disconnect(controlMonitor);
      controlMonitor.disconnect();
      this.controlMonitors.delete(`${name}.v_oct`);
    }
    voice.vOctInput.disconnect();
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
    const response = await fetch('/dsp/swell.wasm');
    if (!response.ok) {
      throw new Error('Swell DSP missing. Run npm run dsp:setup and npm run dsp:build.');
    }
    this.swellWasmBytes = await response.arrayBuffer();
    await context.audioWorklet.addModule('/worklets/swell-processor.js');
    this.swellWorkletLoaded = true;
  }

  private async ensureDicesRuntime(): Promise<void> {
    if (this.dicesWorkletLoaded && this.dicesWasmBytes) return;
    const context = this.ensureContext();
    const response = await fetch('/dsp/dices.wasm');
    if (!response.ok) {
      throw new Error('Dices DSP missing. Run npm run dsp:setup and npm run dsp:build.');
    }
    this.dicesWasmBytes = await response.arrayBuffer();
    await context.audioWorklet.addModule('/worklets/dices-processor.js');
    this.dicesWorkletLoaded = true;
  }

  private async ensureMistRuntime(): Promise<void> {
    if (this.mistWorkletLoaded && this.mistWasmBytes) return;
    const context = this.ensureContext();
    const response = await fetch('/dsp/mist.wasm');
    if (!response.ok) {
      throw new Error('Mist DSP missing. Run npm run dsp:setup and npm run dsp:build.');
    }
    this.mistWasmBytes = await response.arrayBuffer();
    await context.audioWorklet.addModule('/worklets/mist-processor.js');
    this.mistWorkletLoaded = true;
  }

  private async ensureClockRuntime(): Promise<void> {
    if (this.clockWorkletLoaded) return;
    const context = this.ensureContext();
    await context.audioWorklet.addModule('/worklets/clock-processor.js');
    this.clockWorkletLoaded = true;
  }

  private async ensureVoiceRuntime(): Promise<void> {
    if (this.voiceWorkletLoaded && this.voiceWasmBytes) return;

    const context = this.ensureContext();
    const response = await fetch('/dsp/voice.wasm');
    if (!response.ok) {
      throw new Error('Voice DSP missing. Run npm run dsp:setup and npm run dsp:build.');
    }
    this.voiceWasmBytes = await response.arrayBuffer();
    await context.audioWorklet.addModule('/worklets/voice-processor.js');
    this.voiceWorkletLoaded = true;
  }

  private ensureContext(): AudioContext {
    if (this.context && this.master && this.hardwareGain) return this.context;

    const context = new AudioContext({ latencyHint: 'interactive' });

    const master = context.createGain();
    master.gain.value = 1;

    const hardwareGain = context.createGain();
    hardwareGain.gain.value = DEFAULT_HARDWARE_OUTPUT_GAIN;

    master.connect(hardwareGain);
    hardwareGain.connect(context.destination);

    context.addEventListener('statechange', () => this.emit());
    this.context = context;
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
