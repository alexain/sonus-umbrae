class SonusVastProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const wasmBytes = options.processorOptions?.wasmBytes;
    if (!(wasmBytes instanceof ArrayBuffer)) throw new Error('Vast DSP WASM was not supplied');

    const module = new WebAssembly.Module(wasmBytes);
    const instance = new WebAssembly.Instance(module, { env: { abort: () => { throw new Error('Vast DSP aborted'); } } });
    this.exports = instance.exports;
    this.memory = this.exports.memory;
    this.handle = this.call('su_vast_create');
    this.inL = this.call('su_vast_in_l', this.handle);
    this.inR = this.call('su_vast_in_r', this.handle);
    this.outL = this.call('su_vast_out_l', this.handle);
    this.outR = this.call('su_vast_out_r', this.handle);
    this.call('su_vast_set_sample_rate', this.handle, sampleRate);

    this.port.onmessage = (event) => {
      const m = event.data;
      if (!m || m.type !== 'params') return;
      const setters = [
        ['size','su_vast_set_size'], ['decay','su_vast_set_decay'],
        ['damp','su_vast_set_damp'], ['diffuse','su_vast_set_diffuse'],
        ['predelay','su_vast_set_predelay'], ['motion','su_vast_set_motion'],
        ['spread','su_vast_set_spread'],
      ];
      for (const [field,setter] of setters) if (m[field] !== undefined) this.call(setter, this.handle, m[field]);
      if (m.freeze !== undefined) this.call('su_vast_set_freeze', this.handle, m.freeze ? 1 : 0);
    };
  }
  call(name, ...args) {
    const fn = this.exports[name] ?? this.exports[`_${name}`];
    if (typeof fn !== 'function') throw new Error(`Vast DSP export missing: ${name}`);
    return fn(...args);
  }
  process(inputs, outputs) {
    const frames = outputs[0]?.[0]?.length ?? outputs[1]?.[0]?.length ?? 128;
    const memory = new Float32Array(this.memory.buffer);
    const copy = (src, ptr) => {
      const dst = memory.subarray(ptr >>> 2, (ptr >>> 2) + frames);
      if (src) dst.set(src.subarray(0, frames)); else dst.fill(0);
    };
    const l = inputs[0]?.[0];
    const r = inputs[1]?.[0] ?? l;
    copy(l, this.inL); copy(r, this.inR);
    this.call('su_vast_process', this.handle, frames);
    if (outputs[0]?.[0]) outputs[0][0].set(memory.subarray(this.outL>>>2,(this.outL>>>2)+frames));
    if (outputs[1]?.[0]) outputs[1][0].set(memory.subarray(this.outR>>>2,(this.outR>>>2)+frames));
    return true;
  }
}
registerProcessor('sonus-vast', SonusVastProcessor);
