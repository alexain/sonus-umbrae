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
  routes: Array<{
    source: string;
    destination: 'Main.in';
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

interface AudioRoute {
  gain: GainNode;
  amount: number;
}

export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private testOscillator: OscillatorNode | null = null;
  private testGain: GainNode | null = null;
  private oscillators = new Map<string, OscillatorVoice>();
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
      objectCount: this.oscillators.size,
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
    if (context.state !== 'running') await context.resume();
    this.emit();
  }

  async stop(): Promise<void> {
    if (!this.context) return;
    this.stopTestTone();
    if (this.context.state === 'running') await this.context.suspend();
    this.emit();
  }

  applyProgram(program: AudioProgram): void {
    const desiredOscillators = new Map(program.oscillators.map((definition) => [definition.name, definition]));
    const desiredRoutes = new Map(program.routes.map((route) => [`${route.source}.out->${route.destination}`, route]));
    const desiredViews = new Set(program.views.map((view) => view.signal));

    // Views and routes are removed before objects so their taps/connections can
    // be detached cleanly from nodes that may be retired in the same reconcile.
    for (const signal of this.views.keys()) {
      if (!desiredViews.has(signal)) this.removeView(signal);
    }

    // Remove routes first so an oscillator can be safely retired afterwards.
    for (const [key] of this.routes) {
      if (!desiredRoutes.has(key)) this.removeRoute(key);
    }

    for (const [name] of this.oscillators) {
      if (!desiredOscillators.has(name)) this.removeOscillator(name);
    }

    for (const definition of program.oscillators) {
      this.createOscillator(definition.name);
      this.setOscillatorFrequency(definition.name, definition.frequency, false);
    }

    for (const route of program.routes) {
      this.connectToMain(route.source, route.amount, false);
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

  connectToMain(name: string, amount = 100, emit = true): void {
    if (!Number.isFinite(amount) || amount < 0 || amount > 100) {
      throw new RangeError('route amount must be between 0 and 100');
    }

    const voice = this.requireOscillator(name);
    const context = this.ensureContext();
    const master = this.master;
    if (!master) throw new Error('audio engine unavailable');

    const routeKey = `${name}.out->Main.in`;
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
    voice.output.connect(gain);
    gain.connect(master);
    this.routes.set(routeKey, { gain, amount });
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
    const source = this.sourceNodeForSignal(signal);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser);
    this.views.set(signal, analyser);
  }

  private removeView(signal: string): void {
    const analyser = this.views.get(signal);
    if (!analyser) return;

    try {
      this.sourceNodeForSignal(signal).disconnect(analyser);
    } catch {
      // The source may already have been retired; disconnecting the analyser is enough.
    }
    analyser.disconnect();
    this.views.delete(signal);
  }

  private sourceNodeForSignal(signal: string): AudioNode {
    if (signal === 'Main.out') {
      this.ensureContext();
      if (!this.master) throw new Error('audio engine unavailable');
      return this.master;
    }

    const match = signal.match(/^([A-Za-z_]\w*)\.out$/);
    if (!match) throw new Error(`unknown signal: ${signal}`);
    return this.requireOscillator(match[1]).output;
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

  private requireOscillator(name: string): OscillatorVoice {
    const voice = this.oscillators.get(name);
    if (!voice) throw new Error(`unknown object: ${name}`);
    return voice;
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
