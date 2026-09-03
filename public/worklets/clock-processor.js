class SonusClockProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.bpm = options.processorOptions?.bpm ?? 0;
    this.rate = options.processorOptions?.rate ?? 1;
    this.jitter = options.processorOptions?.jitter ?? 0;
    this.drift = options.processorOptions?.drift ?? 0;
    this.running = true;
    this.phase = 0;
    this.pulseSamples = Math.max(1, Math.round(sampleRate * 0.01));
    this.remainingPulse = 0;
    this.driftOffset = 0;
    this.randomState = ((Math.random() * 0xffffffff) >>> 0) || 0x6d2b79f5;

    this.port.onmessage = (event) => {
      const message = event.data;
      if (!message) return;
      if (message.type === 'clock') {
        if (Number.isFinite(message.bpm)) this.bpm = Math.max(0, message.bpm);
        if (Number.isFinite(message.rate)) this.rate = Math.max(0, message.rate);
        if (Number.isFinite(message.jitter)) this.jitter = Math.max(0, Math.min(100, message.jitter));
        if (Number.isFinite(message.drift)) this.drift = Math.max(0, Math.min(100, message.drift));
        if (typeof message.running === 'boolean') this.running = message.running;
        if (!this.running || this.bpm <= 0 || this.rate <= 0) {
          this.phase = 0;
          this.remainingPulse = 0;
          this.driftOffset = 0;
        }
      }
    };
  }

  random() {
    let x = this.randomState | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.randomState = x >>> 0;
    return this.randomState / 0x100000000;
  }

  nextPeriodSamples() {
    const effectiveBpm = this.bpm * this.rate;
    const nominal = sampleRate * 60 / effectiveBpm;
    const jitterRange = this.jitter / 100;
    const driftRange = this.drift / 100;

    // Jitter is immediate, independent interval variation around the nominal beat.
    const jitterOffset = (this.random() * 2 - 1) * jitterRange;

    // Drift is a bounded random walk, therefore slow and correlated from beat to beat.
    if (driftRange > 0) {
      const step = Math.max(0.0005, driftRange * 0.035);
      this.driftOffset += (this.random() * 2 - 1) * step;
      this.driftOffset = Math.max(-driftRange, Math.min(driftRange, this.driftOffset));
    } else {
      this.driftOffset *= 0.9;
      if (Math.abs(this.driftOffset) < 1e-5) this.driftOffset = 0;
    }

    // Keep extreme settings playable: never collapse an interval to zero.
    const ratio = Math.max(0.10, Math.min(3.0, 1 + jitterOffset + this.driftOffset));
    return Math.max(1, nominal * ratio);
  }

  process(_inputs, outputs) {
    const output = outputs[0]?.[0];
    if (!output) return true;
    output.fill(0);

    const effectiveBpm = this.bpm * this.rate;
    if (!this.running || effectiveBpm <= 0) return true;

    for (let i = 0; i < output.length; i += 1) {
      if (this.phase <= 0) {
        this.remainingPulse = this.pulseSamples;
        const periodSamples = this.nextPeriodSamples();
        this.phase += periodSamples;
        this.port.postMessage({ type: 'trigger', frame: currentFrame + i, periodSamples });
      }
      if (this.remainingPulse > 0) {
        output[i] = 1;
        this.remainingPulse -= 1;
      }
      this.phase -= 1;
    }
    return true;
  }
}

registerProcessor('sonus-clock', SonusClockProcessor);
