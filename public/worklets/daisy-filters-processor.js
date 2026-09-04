class SonusDaisyFiltersProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const wasmBytes = options?.processorOptions?.wasmBytes;
    if (!(wasmBytes instanceof ArrayBuffer)) throw new Error('Daisy filter DSP WASM was not supplied');

    const module = new WebAssembly.Module(wasmBytes);
    const instance = new WebAssembly.Instance(module, {
      env: {
        abort: () => { throw new Error('Daisy filter DSP aborted'); },
      },
    });
    this.exports = instance.exports;
    this.memory = this.exports.memory;

    // C++ STANDALONE_WASM modules may expose an explicit runtime/static
    // constructor initializer. Run it before allocating the DaisySP state,
    // just as we already do for the CloudSeedCore backend.
    const initialize = this.exports._initialize ?? this.exports.__wasm_call_ctors;
    if (typeof initialize === 'function') initialize();

    this.handle = this.call('su_daisy_filters_create');
    this.inPtr = this.call('su_daisy_filters_in', this.handle);
    this.outPtrs = [
      this.call('su_daisy_filters_low', this.handle),
      this.call('su_daisy_filters_high', this.handle),
      this.call('su_daisy_filters_band', this.handle),
      this.call('su_daisy_filters_notch', this.handle),
      this.call('su_daisy_filters_peak', this.handle),
    ];
    this.sampleRate = sampleRate;
    this.cutoff = 1000;
    this.resonance = 0;
    this.drive = 0;
    this.bypassed = false;
    this.call('su_daisy_filters_set_sample_rate', this.handle, this.sampleRate);

    this.port.onmessage = (event) => {
      const message = event.data ?? {};
      if (message.type === 'reset') {
        this.call('su_daisy_filters_reset', this.handle);
        this.call('su_daisy_filters_set_cutoff', this.handle, this.cutoff);
        this.call('su_daisy_filters_set_resonance', this.handle, this.resonance);
        this.call('su_daisy_filters_set_drive', this.handle, this.drive);
        return;
      }
      if (message.type !== 'params') return;
      if (message.bypassed !== undefined) this.bypassed = Boolean(message.bypassed);
      if (message.cutoff !== undefined) { this.cutoff = message.cutoff; this.call('su_daisy_filters_set_cutoff', this.handle, message.cutoff); }
      if (message.resonance !== undefined) { this.resonance = message.resonance; this.call('su_daisy_filters_set_resonance', this.handle, message.resonance); }
      if (message.drive !== undefined) { this.drive = message.drive; this.call('su_daisy_filters_set_drive', this.handle, message.drive); }
    };
  }

  call(name, ...args) {
    const fn = this.exports[name] ?? this.exports[`_${name}`];
    if (typeof fn !== 'function') throw new Error(`Daisy filter DSP export missing: ${name}`);
    return fn(...args);
  }

  process(inputs, outputs) {
    const frames = outputs[0]?.[0]?.length ?? 128;
    const memory = new Float32Array(this.memory.buffer);
    const input = inputs[0]?.[0];
    const inputOffset = this.inPtr >>> 2;
    for (let i = 0; i < frames; ++i) memory[inputOffset + i] = input?.[i] ?? 0;

    if (!this.bypassed) this.call('su_daisy_filters_process', this.handle, frames);

    for (let outputIndex = 0; outputIndex < 5; ++outputIndex) {
      const output = outputs[outputIndex]?.[0];
      if (!output) continue;
      const sourceOffset = this.outPtrs[outputIndex] >>> 2;
      for (let i = 0; i < frames; ++i) output[i] = this.bypassed ? (input?.[i] ?? 0) : memory[sourceOffset + i];
    }
    return true;
  }
}

registerProcessor('sonus-daisy-filters', SonusDaisyFiltersProcessor);
