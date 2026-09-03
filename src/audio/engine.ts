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
  clock: { bpm: number; jitter: number; drift: number };
  mainLevel: number;
  clockSources: Array<{ name: string; rate: number; jitter: number; drift: number }>;
  oscillators: Array<{
    name: string;
    frequency: number;
  }>;
  voices: Array<{
    name: string;
    model: number;
    lpg: boolean;
    level: number;
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
  vasts: Array<{
    name: string;
    size: number;
    decay: number;
    damp: number;
    diffuse: number;
    predelay: number;
    motion: number;
    spread: number;
    mix: number;
    freeze: boolean;
  }>;
  filters: Array<{
    name: string;
    model: 'liquid.mono';
    ownerVoice: string | null;
    displayName: string;
    cutoff: number;
    resonance: number;
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

interface VastVoice {
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
  size: number;
  decay: number;
  damp: number;
  diffuse: number;
  predelay: number;
  motion: number;
  spread: number;
  mix: number;
  freeze: boolean;
}

interface LiquidFilterVoice {
  node: AudioWorkletNode;
  input: GainNode;
  lp12Out: GainNode;
  bp12Out: GainNode;
  lp24Out: GainNode;
  ownerVoice: string | null;
  displayName: string;
  cutoff: number;
  resonance: number;
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
  jitter: number;
  drift: number;
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
  private audioOutL: GainNode | null = null;
  private audioOutR: GainNode | null = null;
  private audioMerger: ChannelMergerNode | null = null;
  private hardwareGain: GainNode | null = null;
  private testOscillator: OscillatorNode | null = null;
  private testGain: GainNode | null = null;
  private oscillators = new Map<string, OscillatorVoice>();
  private gains = new Map<string, GainVoice>();
  private voices = new Map<string, MacroVoice>();
  private swells = new Map<string, SwellVoice>();
  private mists = new Map<string, MistVoice>();
  private vasts = new Map<string, VastVoice>();
  private filters = new Map<string, LiquidFilterVoice>();
  private clocks = new Map<string, ClockSource>();
  private clockTriggerListeners = new Map<string, Set<() => void>>();
  private masterClockBpm = 0;
  private clockTransportRunning = true;
  private voiceWasmBytes: ArrayBuffer | null = null;
  private swellWasmBytes: ArrayBuffer | null = null;
  private mistWasmBytes: ArrayBuffer | null = null;
  private vastWasmBytes: ArrayBuffer | null = null;
  private liquidWasmBytes: ArrayBuffer | null = null;
  private voiceWorkletLoaded = false;
  private swellWorkletLoaded = false;
  private mistWorkletLoaded = false;
  private vastWorkletLoaded = false;
  private liquidWorkletLoaded = false;
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
      objectCount: this.oscillators.size + this.gains.size + this.voices.size + this.swells.size + this.mists.size + this.vasts.size + this.filters.size + this.clocks.size,
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
    await this.ensureMistRuntime();
    await this.ensureVastRuntime();
    await this.ensureLiquidRuntime();
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
        (program.mists.length > 0 && !this.mistWorkletLoaded) ||
        (program.vasts.length > 0 && !this.vastWorkletLoaded) ||
        (program.filters.length > 0 && !this.liquidWorkletLoaded)) {
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
    const desiredSwells = new Map(program.swells.map((definition) => [definition.name, definition]));
    const desiredMists = new Map(program.mists.map((definition) => [definition.name, definition]));
    const desiredVasts = new Map(program.vasts.map((definition) => [definition.name, definition]));
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

    for (const [name] of this.swells) {
      if (!desiredSwells.has(name)) this.removeSwell(name);
    }


    for (const [name] of this.mists) {
      if (!desiredMists.has(name)) this.removeMist(name);
    }

    for (const [name] of this.vasts) {
      if (!desiredVasts.has(name)) this.removeVast(name);
    }

    for (const definition of program.clockSources) this.createOrUpdateClock(definition.name, definition.rate, definition.jitter, definition.drift);
    this.updateAllClocks();

    for (const definition of program.oscillators) {
      this.createOscillator(definition.name);
      this.setOscillatorFrequency(definition.name, definition.frequency, false);
    }

    for (const definition of program.voices) {
      this.createVoice(definition);
      this.updateVoice(definition);
    }

    for (const definition of program.filters) {
      this.createFilter(definition);
      this.updateFilter(definition);
    }

    for (const definition of program.swells) {
      this.createSwell(definition);
      this.updateSwell(definition);
    }
    this.setModTransport(true);


    for (const definition of program.mists) {
      this.createMist(definition);
      this.updateMist(definition);
    }

    for (const definition of program.vasts) {
      this.createVast(definition);
      this.updateVast(definition);
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

  private updateVoice(definition: AudioProgram['voices'][number]): void {
    const voice = this.voices.get(definition.name);
    if (!voice) return;
    voice.model = definition.model;
    voice.lpg = definition.lpg;
    voice.level = definition.level;
    const level = Math.max(0, Math.min(1, definition.level / 100));
    voice.outGain.gain.setTargetAtTime(level, this.ensureContext().currentTime, 0.008);
    voice.auxGain.gain.setTargetAtTime(level, this.ensureContext().currentTime, 0.008);
    voice.frequency = definition.frequency;
    voice.harmo = definition.harmo;
    voice.timbre = definition.timbre;
    voice.morph = definition.morph;
    voice.node.port.postMessage({
      type: 'params',
      model: definition.model,
      lpg: definition.lpg,
      frequency: definition.frequency,
      harmo: definition.harmo / 100,
      timbre: definition.timbre / 100,
      morph: definition.morph / 100,
    });
  }

  private createFilter(definition: AudioProgram['filters'][number]): void {
    if (this.filters.has(definition.name)) return;
    if (!this.liquidWorkletLoaded || !this.liquidWasmBytes) {
      throw new Error('Liquid FILTER DSP is not ready; run :start after building the DSP');
    }
    const context = this.ensureContext();
    const node = new AudioWorkletNode(context, 'sonus-liquid', {
      numberOfInputs: 1,
      numberOfOutputs: 3,
      outputChannelCount: [1,1,1],
      processorOptions: { wasmBytes: this.liquidWasmBytes.slice(0) },
    });
    const input = context.createGain();
    const lp12Out = context.createGain();
    const bp12Out = context.createGain();
    const lp24Out = context.createGain();
    input.connect(node,0,0);
    node.connect(lp12Out,0,0);
    node.connect(bp12Out,1,0);
    node.connect(lp24Out,2,0);

    this.filters.set(definition.name, {
      node,input,lp12Out,bp12Out,lp24Out,
      ownerVoice: definition.ownerVoice,
      displayName: definition.displayName,
      cutoff: definition.cutoff,
      resonance: definition.resonance,
    });

    if (definition.ownerVoice) {
      const voice = this.voices.get(definition.ownerVoice);
      if (!voice) throw new Error(`embedded FILTER '${definition.displayName}' references unknown VOICE '${definition.ownerVoice}'`);
      voice.outGain.connect(input);
      voice.auxGain.connect(input);
    }
  }

  private updateFilter(definition: AudioProgram['filters'][number]): void {
    const filter = this.filters.get(definition.name);
    if (!filter) return;
    filter.cutoff = definition.cutoff;
    filter.resonance = definition.resonance;
    filter.node.port.postMessage({
      type: 'params',
      cutoff: definition.cutoff,
      resonance: definition.resonance / 100,
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


  private createVast(definition: AudioProgram['vasts'][number]): void {
    if (this.vasts.has(definition.name)) return;
    if (!this.vastWorkletLoaded || !this.vastWasmBytes) {
      throw new Error('Vast DSP is not ready; run :start after building the DSP');
    }
    const context = this.ensureContext();
    const node = new AudioWorkletNode(context, 'sonus-vast', {
      numberOfInputs: 2,
      numberOfOutputs: 2,
      outputChannelCount: [1, 1],
      processorOptions: { wasmBytes: this.vastWasmBytes.slice(0) },
    });
    node.addEventListener('processorerror', () => console.error('[Vast] AudioWorklet processor failed'));

    const monoInput=context.createGain(), inputL=context.createGain(), inputR=context.createGain();
    const dryL=context.createGain(), dryR=context.createGain(), wetL=context.createGain(), wetR=context.createGain();
    const outputL=context.createGain(), outputR=context.createGain();
    monoInput.connect(inputL); monoInput.connect(inputR);
    inputL.connect(node,0,0); inputR.connect(node,0,1);
    inputL.connect(dryL); inputR.connect(dryR); dryL.connect(outputL); dryR.connect(outputR);
    node.connect(wetL,0,0); node.connect(wetR,1,0); wetL.connect(outputL); wetR.connect(outputR);

    this.vasts.set(definition.name, { node, monoInput, inputL, inputR, dryL, dryR, wetL, wetR, outputL, outputR, ...definition });
  }

  private updateVast(definition: AudioProgram['vasts'][number]): void {
    const vast=this.vasts.get(definition.name); if(!vast) return;
    Object.assign(vast,definition);
    const context=this.ensureContext();
    const mix=Math.max(0,Math.min(1,definition.mix/100));
    const dryGain=Math.cos(mix*Math.PI*0.5), wetGain=Math.sin(mix*Math.PI*0.5);
    vast.dryL.gain.setTargetAtTime(dryGain,context.currentTime,0.008);
    vast.dryR.gain.setTargetAtTime(dryGain,context.currentTime,0.008);
    vast.wetL.gain.setTargetAtTime(wetGain,context.currentTime,0.008);
    vast.wetR.gain.setTargetAtTime(wetGain,context.currentTime,0.008);
    vast.node.port.postMessage({ type:'params', size:definition.size/100, decay:definition.decay/100,
      damp:definition.damp/100, diffuse:definition.diffuse/100, predelay:definition.predelay/100,
      motion:definition.motion/100, spread:definition.spread/100, freeze:definition.freeze });
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

    const swellMatch = signal.match(/^([A-Za-z_]\w*)\.out([1-4])$/);
    const swell = swellMatch ? this.swells.get(swellMatch[1]) : undefined;
    const swellChannel = swellMatch ? Number(swellMatch[2]) - 1 : -1;
    if (!swell) {
      view.analyser.getFloatTimeDomainData(target);
      return true;
    }

    if (swell && swell.frequency >= 12) {
      view.analyser.getFloatTimeDomainData(target);
      for (let i = 0; i < target.length; i += 1) target[i] /= 5;
      return true;
    }

    const now = performance.now() / 1000;
    const seconds = Math.min(20, Math.max(2, 2 / Math.max(0.05, swell!.frequency)));
    const interval = seconds / Math.max(1, target.length - 1);
    let history = this.slowScopeHistory.get(signal);
    if (!history) {
      history = { values: [], lastSampleAt: now - interval };
      this.slowScopeHistory.set(signal, history);
    }

    if (now - history.lastSampleAt >= interval) {
      const raw = swell.monitorValues[swellChannel] ?? 0;
      // The Swell/Tides backend already exposes its rendered channel value in
      // a useful normalized display domain. Routing keeps its existing CV
      // semantics; the slow oscilloscope should not attenuate it by another /5.
      // Worklet telemetry now carries the real routing-domain CV (+/-5V).
      // Normalize to +/-1 before storing display history.
      history.values.push(raw / 5);
      history.lastSampleAt = now;
      if (history.values.length > target.length) history.values.splice(0, history.values.length - target.length);
    }

    const values = history.values;
    target.fill(0);
    if (values.length === 0) return true;

    // Fixed slow-scope scale: no autoscaling and no horizontal stretching.
    // New samples accumulate from the right until the history fills the scope.
    const displayGain = 10;
    const visibleCount = Math.min(values.length, target.length);
    const sourceOffset = values.length - visibleCount;
    const targetOffset = target.length - visibleCount;
    for (let i = 0; i < visibleCount; i += 1) {
      target[targetOffset + i] = Math.max(-1, Math.min(1, values[sourceOffset + i] * displayGain));
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


    const mistOutput = signal.match(/^([A-Za-z_]\w*)\.(out_L|out_R)$/);
    if (mistOutput) {
      const fx = this.mists.get(mistOutput[1]) ?? this.vasts.get(mistOutput[1]);
      if (!fx) throw new Error(`unknown stereo FX object: ${mistOutput[1]}`);
      return { node: mistOutput[2] === 'out_R' ? fx.outputR : fx.outputL, output: 0 };
    }

    const filterOutput = signal.match(/^([A-Za-z_]\w*)\.(lp12|bp12|lp24)$/);
    if (filterOutput) {
      const [, name, port] = filterOutput;
      let filter = this.filters.get(name);
      if (!filter) filter = [...this.filters.values()].find((candidate) => candidate.ownerVoice === name);
      if (!filter) throw new Error(`unknown FILTER output: ${signal}`);
      const node = port === 'lp12' ? filter.lp12Out : port === 'bp12' ? filter.bp12Out : filter.lp24Out;
      return { node, output: 0 };
    }

    const match = signal.match(/^([A-Za-z_]\w*)\.(out|aux)$/);
    if (!match) throw new Error(`unknown signal: ${signal}`);
    const [, name, port] = match;

    const voice = this.voices.get(name);
    if (voice) return { node: port === 'aux' ? voice.auxGain : voice.outGain, output: 0 };

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
      const fx = this.mists.get(mistInput[1]) ?? this.vasts.get(mistInput[1]);
      if (!fx) throw new Error(`unknown stereo FX input: ${mistInput[1]}`);
      if (mistInput[2] === 'in') return { node: fx.monoInput, input: 0 };
      return { node: mistInput[2] === 'inR' ? fx.inputR : fx.inputL, input: 0 };
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
    const voice = this.voices.get(name);
    if (!voice || !voice.lpg) return;
    voice.node.port.postMessage({ type: 'trigger' });
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

  setMistParameter(
    name: string,
    parameter: 'position' | 'size' | 'pitch' | 'density' | 'texture' | 'mix' | 'spread' | 'feedback' | 'reverb',
    value: number,
  ): void {
    const vast = this.vasts.get(name);
    if (vast) {
      if (!Number.isFinite(value) || value < 0 || value > 100) throw new RangeError(`Vast ${parameter} must be between 0 and 100`);
      const map = { position:'predelay', size:'size', density:'diffuse', texture:'damp', mix:'mix', spread:'spread', feedback:'decay', reverb:'motion' } as const;
      if (parameter === 'pitch') throw new RangeError('Vast does not expose pitch');
      const mapped = map[parameter];
      (vast as unknown as Record<string, unknown>)[mapped] = value;
      if (mapped === 'mix') {
        const context=this.ensureContext(), mix=Math.max(0,Math.min(1,value/100));
        const dryGain=Math.cos(mix*Math.PI*0.5), wetGain=Math.sin(mix*Math.PI*0.5);
        vast.dryL.gain.setTargetAtTime(dryGain,context.currentTime,0.008); vast.dryR.gain.setTargetAtTime(dryGain,context.currentTime,0.008);
        vast.wetL.gain.setTargetAtTime(wetGain,context.currentTime,0.008); vast.wetR.gain.setTargetAtTime(wetGain,context.currentTime,0.008);
      } else {
        vast.node.port.postMessage({ type:'params', [mapped]: value/100 });
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

  readModOutput(name: string, channel: 1 | 2 | 3 | 4): number | null {
    const swell = this.swells.get(name);
    return swell ? swell.monitorValues[channel - 1] : null;
  }

  setMasterClockBpm(bpm: number): void {
    if (!Number.isFinite(bpm) || bpm < 0 || bpm > 300) {
      throw new RangeError('master clock BPM must be between 0 and 300');
    }
    this.masterClockBpm = bpm;
    this.updateAllClocks();
    this.emit();
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

  private createOrUpdateClock(name: string, rate: number, jitter: number, drift: number): void {
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
      clock = { node, rate, jitter, drift, lastTriggerTime: null, triggerCount: 0, visualEvents: [] };
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
        if (periodAtEmission > 0) {
          current.visualEvents.push({ emittedAt, travelDuration: Math.max(0.05, periodAtEmission * 4) });
          if (current.visualEvents.length > 128) current.visualEvents.splice(0, current.visualEvents.length - 128);
        }
      };
      this.clocks.set(name, clock);
    }
    clock.rate = rate;
    clock.jitter = jitter;
    clock.drift = drift;
    clock.node.port.postMessage({ type: 'clock', bpm: this.masterClockBpm, rate, jitter, drift, running: this.clockTransportRunning });
  }

  private updateAllClocks(): void {
    for (const clock of this.clocks.values()) {
      clock.node.port.postMessage({
        type: 'clock',
        bpm: this.masterClockBpm,
        rate: clock.rate,
        jitter: clock.jitter,
        drift: clock.drift,
        running: this.clockTransportRunning,
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


  private removeFilter(name: string): void {
    const filter = this.filters.get(name);
    if (!filter) return;
    if (filter.ownerVoice) {
      const voice = this.voices.get(filter.ownerVoice);
      if (voice) {
        try { voice.outGain.disconnect(filter.input); } catch {}
        try { voice.auxGain.disconnect(filter.input); } catch {}
      }
    }
    for (const node of [filter.input,filter.lp12Out,filter.bp12Out,filter.lp24Out]) {
      try { node.disconnect(); } catch {}
    }
    try { filter.node.disconnect(); } catch {}
    filter.node.port.close();
    this.filters.delete(name);
  }

  private removeVast(name: string): void {
    const vast=this.vasts.get(name); if(!vast) return;
    for(const node of [vast.monoInput,vast.inputL,vast.inputR,vast.dryL,vast.dryR,vast.wetL,vast.wetR,vast.outputL,vast.outputR]) {
      try { node.disconnect(); } catch {}
    }
    try { vast.node.disconnect(); } catch {}
    vast.node.port.close();
    this.vasts.delete(name);
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
    this.removeView(`${name}.lp12`);
    this.removeView(`${name}.bp12`);
    this.removeView(`${name}.lp24`);
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
    const response = await fetch('/dsp/swell.wasm');
    if (!response.ok) {
      throw new Error('Swell DSP missing. Run npm run dsp:setup and npm run dsp:build.');
    }
    this.swellWasmBytes = await response.arrayBuffer();
    await context.audioWorklet.addModule('/worklets/swell-processor.js');
    this.swellWorkletLoaded = true;
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

  private async ensureVastRuntime(): Promise<void> {
    if (this.vastWorkletLoaded && this.vastWasmBytes) return;
    const context=this.ensureContext();
    const response=await fetch('/dsp/vast.wasm');
    if (!response.ok) throw new Error('Vast DSP missing. Run npm run dsp:setup and npm run dsp:build.');
    this.vastWasmBytes=await response.arrayBuffer();
    await context.audioWorklet.addModule('/worklets/vast-processor.js');
    this.vastWorkletLoaded=true;
  }

  private async ensureLiquidRuntime(): Promise<void> {
    if (this.liquidWorkletLoaded && this.liquidWasmBytes) return;
    const context = this.ensureContext();
    const response = await fetch('/dsp/liquid.wasm');
    if (!response.ok) throw new Error('Liquid DSP missing. Run npm run dsp:build.');
    this.liquidWasmBytes = await response.arrayBuffer();
    await context.audioWorklet.addModule('/worklets/liquid-processor.js');
    this.liquidWorkletLoaded = true;
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
    if (
      this.context &&
      this.master &&
      this.audioOutL &&
      this.audioOutR &&
      this.audioMerger &&
      this.hardwareGain
    ) return this.context;

    const context = new AudioContext({ latencyHint: 'interactive' });

    // Logical stereo main bus. L/R stay independent until the final merger.
    const audioOutL = context.createGain();
    const audioOutR = context.createGain();
    const audioMerger = context.createChannelMerger(2);
    const master = context.createGain();
    const hardwareGain = context.createGain();

    audioOutL.gain.value = 1;
    audioOutR.gain.value = 1;
    master.gain.value = 1;
    hardwareGain.gain.value = DEFAULT_HARDWARE_OUTPUT_GAIN;

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
