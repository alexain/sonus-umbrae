class SonusVoiceProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    const wasmBytes = options.processorOptions?.wasmBytes;
    if (!(wasmBytes instanceof ArrayBuffer)) {
      throw new Error('Voice DSP WASM was not supplied');
    }

    const module = new WebAssembly.Module(wasmBytes);
    const instance = new WebAssembly.Instance(module, {
      env: {
        abort: () => { throw new Error('Voice DSP aborted'); },
      },
    });

    this.exports = instance.exports;
    this.memory = this.exports.memory;
    this.handle = this.call('su_voice_create');
    this.outPtr = this.call('su_voice_out', this.handle);
    this.auxPtr = this.call('su_voice_aux', this.handle);

    this.port.onmessage = (event) => {
      const message = event.data;
      if (!message || message.type !== 'params') return;
      if (message.model !== undefined) this.call('su_voice_set_model', this.handle, message.model);
      if (message.frequency !== undefined) this.call('su_voice_set_frequency', this.handle, message.frequency);
      if (message.harmo !== undefined) this.call('su_voice_set_harmo', this.handle, message.harmo);
      if (message.timbre !== undefined) this.call('su_voice_set_timbre', this.handle, message.timbre);
      if (message.morph !== undefined) this.call('su_voice_set_morph', this.handle, message.morph);
    };
  }

  call(name, ...args) {
    const fn = this.exports[name] ?? this.exports[`_${name}`];
    if (typeof fn !== 'function') throw new Error(`Voice DSP export missing: ${name}`);
    return fn(...args);
  }

  process(_inputs, outputs) {
    const frames = outputs[0]?.[0]?.length ?? 128;
    this.call('su_voice_process', this.handle, frames);

    const memory = new Float32Array(this.memory.buffer);
    const out = memory.subarray(this.outPtr >>> 2, (this.outPtr >>> 2) + frames);
    const aux = memory.subarray(this.auxPtr >>> 2, (this.auxPtr >>> 2) + frames);

    if (outputs[0]?.[0]) outputs[0][0].set(out);
    if (outputs[1]?.[0]) outputs[1][0].set(aux);
    return true;
  }
}

registerProcessor('sonus-voice', SonusVoiceProcessor);
