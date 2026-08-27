export type AudioEngineState = 'idle' | 'running' | 'suspended';

export interface AudioEngineSnapshot {
  state: AudioEngineState;
  sampleRate: number | null;
  testFrequency: number | null;
}

export type AudioEngineListener = (snapshot: AudioEngineSnapshot) => void;

export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private testOscillator: OscillatorNode | null = null;
  private testGain: GainNode | null = null;
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

  private ensureContext(): AudioContext {
    if (this.context && this.master) return this.context;

    const context = new AudioContext({ latencyHint: 'interactive' });
    const master = context.createGain();
    master.gain.value = 1;
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
