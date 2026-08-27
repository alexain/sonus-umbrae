export type AudioEngineState = 'idle' | 'running' | 'suspended';

export interface AudioEngineSnapshot {
  state: AudioEngineState;
  sampleRate: number | null;
  testFrequency: number | null;
  objectCount: number;
  routeCount: number;
}

export interface AudioProgram {
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
  model: number;
  frequency: number;
  harmo: number;
  timbre: number;
  morph: number;
}

interface SignalSource {
  node: AudioNode;
  output: number;
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
  private testOscillator: OscillatorNode | null = null;
  private testGain: GainNode | null = null;
  private oscillators = new Map<string, OscillatorVoice>();
  private gains = new Map<string, GainVoice>();
  private voices = new Map<string, MacroVoice>();
  private voiceWasmBytes: ArrayBuffer | null = null;
  private voiceWorkletLoaded = false;
  private pendingProgram: AudioProgram | null = null;
  private routes = new Map<string, AudioRoute>();
  private views = new Map<string, AnalyserNode>();
  private listeners = new Set<AudioEngineListener>();

  snapshot(): AudioEngineSnapshot {
    return {
      state: this.context === null
        ? 'idle'
        : this.context.state === 'running'
          ? 'running'
          : 'suspended',
      sampleRate: this.context?.sampleRate ?? null,
      testFrequency: this.testOscillator?.frequency.value ?? null,
      objectCount: this.oscillators.size + this.gains.size + this.voices.size,
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
    if (program.voices.length > 0 && !this.voiceWorkletLoaded) {
      this.pendingProgram = program;
      return;
    }

    const desiredOscillators = new Map(program.oscillators.map((definition) => [definition.name, definition]));
    const desiredVoices = new Map(program.voices.map((definition) => [definition.name, definition]));
    const desiredGains = new Map(program.gains.map((definition) => [definition.name, definition]));
    const desiredRoutes = new Map(program.routes.map((route) => [`${route.source}->${route.destination}`, route]));
    const desiredViews = new Set(program.views.map((view) => view.signal));

    for (const signal of this.views.keys()) {
      if (!desiredViews.has(signal)) this.removeView(signal);
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

    for (const definition of program.oscillators) {
      this.createOscillator(definition.name);
      this.setOscillatorFrequency(definition.name, definition.frequency, false);
    }

    for (const definition of program.voices) {
      this.createVoice(definition);
      this.updateVoice(definition);
    }

    for (const definition of program.gains) {
      this.createGain(definition.name);
      this.setGainLevel(definition.name, definition.level, false);
    }

    for (const route of program.routes) {
      this.connect(route.source, route.destination, route.amount, false);
    }

    for (const view of program.views) this.createView(view.signal);

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
      numberOfInputs: 0,
      numberOfOutputs: 2,
      outputChannelCount: [1, 1],
      processorOptions: { wasmBytes },
    });

    this.voices.set(definition.name, {
      node,
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
    if (!Number.isFinite(amount) || amount < 0 || amount > 100) {
      throw new RangeError('route amount must be between 0 and 100');
    }

    const context = this.ensureContext();
    const sourceSignal = this.sourceForSignal(source);
    const destinationNode = this.destinationNodeForPort(destination);
    const routeKey = `${source}->${destination}`;
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
    gain.connect(destinationNode);
    this.routes.set(routeKey, { gain, amount, source, destination });
    if (emit) this.emit();
  }

  getViewSignals(): string[] {
    return [...this.views.keys()];
  }

  readOscilloscope(signal: string, target: Float32Array<ArrayBuffer>): boolean {
    const analyser = this.views.get(signal);
    if (!analyser) return false;
    analyser.getFloatTimeDomainData(target);
    return true;
  }

  private createView(signal: string): void {
    if (this.views.has(signal)) return;

    const context = this.ensureContext();
    const source = this.sourceForSignal(signal);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0;
    source.node.connect(analyser, source.output, 0);
    this.views.set(signal, analyser);
  }

  private removeView(signal: string): void {
    const analyser = this.views.get(signal);
    if (!analyser) return;

    try {
      this.sourceForSignal(signal).node.disconnect(analyser);
    } catch {
      // The source may already have been retired; disconnecting the analyser is enough.
    }
    analyser.disconnect();
    this.views.delete(signal);
  }

  private sourceForSignal(signal: string): SignalSource {
    if (signal === 'Main.out') {
      this.ensureContext();
      if (!this.master) throw new Error('audio engine unavailable');
      return { node: this.master, output: 0 };
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

  private destinationNodeForPort(port: string): AudioNode {
    if (port === 'Main.in') {
      this.ensureContext();
      if (!this.master) throw new Error('audio engine unavailable');
      return this.master;
    }

    const match = port.match(/^([A-Za-z_]\w*)\.in$/);
    if (!match) throw new Error(`unknown destination: ${port}`);
    return this.requireGain(match[1]).node;
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
    if (this.master && this.context) {
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(0, now);
      this.master.gain.linearRampToValueAtTime(1, now + 0.01);
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

  private removeVoice(name: string): void {
    const voice = this.voices.get(name);
    if (!voice) return;
    this.removeView(`${name}.out`);
    this.removeView(`${name}.aux`);
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
    if (this.context && this.master) return this.context;

    const context = new AudioContext({ latencyHint: 'interactive' });
    const master = context.createGain();
    master.gain.value = 0.12;
    master.connect(context.destination);

    context.addEventListener('statechange', () => this.emit());
    this.context = context;
    this.master = master;
    this.emit();
    return context;
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
