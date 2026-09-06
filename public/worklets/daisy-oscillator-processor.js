const WAVEFORMS = Object.freeze({
  sine: 0,
  triangle: 1,
  sawtooth: 2,
  ramp: 3,
  square: 4,
});

class SonusDaisyOscillatorProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    const wasmBytes = options.processorOptions?.wasmBytes;
    if (!(wasmBytes instanceof ArrayBuffer)) {
      throw new Error('DaisySP oscillator WASM was not supplied');
    }

    const module = new WebAssembly.Module(wasmBytes);
    const instance = new WebAssembly.Instance(module, {
      env: {
        abort: () => { throw new Error('DaisySP oscillator DSP aborted'); },
      },
    });

    this.exports = instance.exports;
    this.memory = this.exports.memory;
    this.handle = this.call('su_daisy_oscillator_create');
    this.outPtr = this.call('su_daisy_oscillator_out', this.handle);
    this.baseFrequency = 440;
    this.waveform = 'sine';
    this.width = 0.5;

    const hostSampleRate = Number(options.processorOptions?.hostSampleRate ?? sampleRate);
    this.call('su_daisy_oscillator_set_sample_rate', this.handle, hostSampleRate);
    this.call('su_daisy_oscillator_set_frequency', this.handle, this.baseFrequency);
    this.call('su_daisy_oscillator_set_waveform', this.handle, WAVEFORMS[this.waveform]);
    this.call('su_daisy_oscillator_set_width', this.handle, this.width);

    this.port.onmessage = (event) => {
      const message = event.data;
      if (!message || message.type !== 'params') return;

      if (message.waveform !== undefined) {
        const waveform = String(message.waveform).toLowerCase();
        if (Object.hasOwn(WAVEFORMS, waveform)) {
          this.waveform = waveform;
          this.call('su_daisy_oscillator_set_waveform', this.handle, WAVEFORMS[waveform]);
        }
      }
      if (message.frequency !== undefined && Number.isFinite(message.frequency) && message.frequency > 0) {
        this.baseFrequency = message.frequency;
      }
      if (message.width !== undefined && Number.isFinite(message.width)) {
        this.width = Math.max(0, Math.min(1, message.width));
        this.call('su_daisy_oscillator_set_width', this.handle, this.width);
      }
    };
  }

  call(name, ...args) {
    const fn = this.exports[name] ?? this.exports[`_${name}`];
    if (typeof fn !== 'function') throw new Error(`DaisySP oscillator export missing: ${name}`);
    return fn(...args);
  }

  process(inputs, outputs) {
    const vOctInput = inputs[0]?.[0];
    const vOct = vOctInput && vOctInput.length > 0 ? vOctInput[vOctInput.length - 1] : 0;
    const frequency = this.baseFrequency * (2 ** vOct);
    this.call('su_daisy_oscillator_set_frequency', this.handle, frequency);

    const frames = outputs[0]?.[0]?.length ?? 128;
    this.call('su_daisy_oscillator_process', this.handle, frames);

    const memory = new Float32Array(this.memory.buffer);
    const out = memory.subarray(this.outPtr >>> 2, (this.outPtr >>> 2) + frames);
    if (outputs[0]?.[0]) outputs[0][0].set(out);
    return true;
  }
}

registerProcessor('sonus-daisy-oscillator', SonusDaisyOscillatorProcessor);
