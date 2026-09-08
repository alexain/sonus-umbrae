const NOISE_MODELS = Object.freeze({
  white: 0,
  dust: 1,
  clocked: 2,
  fractal: 3,
});

class SonusNoiseProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const wasmBytes = options.processorOptions?.wasmBytes;
    if (!(wasmBytes instanceof ArrayBuffer)) throw new Error('Noise WASM was not supplied');

    const module = new WebAssembly.Module(wasmBytes);
    const instance = new WebAssembly.Instance(module, {
      env: { abort: () => { throw new Error('Noise DSP aborted'); } },
    });
    this.exports = instance.exports;
    this.memory = this.exports.memory;
    const hostSampleRate = Number(options.processorOptions?.hostSampleRate) || sampleRate;
    this.handle = this.call('su_noise_create', hostSampleRate);
    this.outPtr = this.call('su_noise_out', this.handle);

    this.port.onmessage = (event) => {
      const message = event.data;
      if (!message || message.type !== 'params') return;
      const model = NOISE_MODELS[message.noiseModel] ?? NOISE_MODELS.white;
      this.call('su_noise_set_model', this.handle, model);
      if (Number.isFinite(message.frequency) && message.frequency > 0) {
        this.call('su_noise_set_frequency', this.handle, message.frequency);
      }
      if (Number.isFinite(message.density)) {
        this.call('su_noise_set_density', this.handle, Math.max(0, Math.min(1, message.density)));
      }
    };
  }

  call(name, ...args) {
    const fn = this.exports[name] ?? this.exports[`_${name}`];
    if (typeof fn !== 'function') throw new Error(`Noise DSP export missing: ${name}`);
    return fn(...args);
  }

  process(_inputs, outputs) {
    const frames = outputs[0]?.[0]?.length ?? 128;
    this.call('su_noise_process', this.handle, frames);
    const memory = new Float32Array(this.memory.buffer);
    const out = memory.subarray(this.outPtr >>> 2, (this.outPtr >>> 2) + frames);
    if (outputs[0]?.[0]) outputs[0][0].set(out);
    return true;
  }
}

registerProcessor('sonus-noise', SonusNoiseProcessor);
