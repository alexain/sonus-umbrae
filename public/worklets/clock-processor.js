class SonusClockProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.bpm = options.processorOptions?.bpm ?? 0;
    this.rate = options.processorOptions?.rate ?? 1;
    this.running = true;
    this.phase = 0;
    this.pulseSamples = Math.max(1, Math.round(sampleRate * 0.01));
    this.remainingPulse = 0;

    this.port.onmessage = (event) => {
      const message = event.data;
      if (!message) return;
      if (message.type === 'clock') {
        if (Number.isFinite(message.bpm)) this.bpm = Math.max(0, message.bpm);
        if (Number.isFinite(message.rate)) this.rate = Math.max(0, message.rate);
        if (typeof message.running === 'boolean') this.running = message.running;
        if (!this.running || this.bpm <= 0 || this.rate <= 0) {
          this.phase = 0;
          this.remainingPulse = 0;
        }
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0]?.[0];
    if (!output) return true;
    output.fill(0);

    const effectiveBpm = this.bpm * this.rate;
    if (!this.running || effectiveBpm <= 0) return true;

    const samplesPerBeat = sampleRate * 60 / effectiveBpm;
    for (let i = 0; i < output.length; i += 1) {
      if (this.phase <= 0) {
        this.remainingPulse = this.pulseSamples;
        this.phase += samplesPerBeat;
        this.port.postMessage({ type: 'trigger', frame: currentFrame + i });
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
