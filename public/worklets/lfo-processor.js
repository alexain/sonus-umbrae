class SonusLfoProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.phase = 0;
    this.frequency = 0.1;
    this.outputs = [{ waveform: 'triangle', rateMultiplier: 1, phase: 0, level: 100 }, null, null, null];
    this.port.onmessage = (event) => {
      const message = event.data;
      if (!message || message.type !== 'params') return;
      if (Number.isFinite(message.frequency)) this.frequency = Math.max(0, Number(message.frequency));
      if (Array.isArray(message.outputs)) {
        this.outputs = [0, 1, 2, 3].map((index) => this.normalizeOutput(message.outputs[index]));
      }
    };
  }

  normalizeOutput(value) {
    if (!value || typeof value !== 'object') return null;
    const waveform = value.waveform;
    if (waveform !== 'sine' && waveform !== 'triangle' && waveform !== 'sawtooth'
      && waveform !== 'ramp' && waveform !== 'square') return null;
    const rateMultiplier = Number(value.rateMultiplier);
    const phase = Number(value.phase);
    const level = Number(value.level);
    return {
      waveform,
      rateMultiplier: Number.isFinite(rateMultiplier) && rateMultiplier > 0 ? rateMultiplier : 1,
      phase: Number.isFinite(phase) ? phase : 0,
      level: Number.isFinite(level) ? Math.max(0, Math.min(100, level)) : 100,
    };
  }

  sampleWaveform(waveform, phase) {
    if (waveform === 'sine') return Math.sin(phase * Math.PI * 2);
    if (waveform === 'triangle') return 1 - 4 * Math.abs(phase - 0.5);
    if (waveform === 'sawtooth') return phase * 2 - 1;
    if (waveform === 'ramp') return 1 - phase * 2;
    if (waveform === 'square') return phase < 0.5 ? 1 : -1;
    return 0;
  }

  process(_inputs, outputs) {
    const frameCount = outputs[0]?.[0]?.length ?? 0;
    if (frameCount === 0) return true;

    const phaseIncrement = this.frequency / sampleRate;
    for (let frame = 0; frame < frameCount; frame += 1) {
      const phase = this.phase;
      for (let slot = 0; slot < 4; slot += 1) {
        const channel = outputs[slot]?.[0];
        const output = this.outputs[slot];
        if (channel) {
          if (!output) {
            channel[frame] = 0;
          } else {
            let effectivePhase = phase * output.rateMultiplier + output.phase / 360;
            effectivePhase -= Math.floor(effectivePhase);
            channel[frame] = this.sampleWaveform(output.waveform, effectivePhase) * (output.level / 100);
          }
        }
      }
      // Keep an unwrapped master phase. Divided outputs must span multiple
      // base cycles without jumping when the base phase crosses 1.0.
      this.phase += phaseIncrement;
    }
    return true;
  }
}

registerProcessor('sonus-lfo', SonusLfoProcessor);
