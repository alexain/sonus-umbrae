
class SonusLiquidProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const wasmBytes = options.processorOptions?.wasmBytes;
    if (!(wasmBytes instanceof ArrayBuffer)) throw new Error('Liquid DSP WASM was not supplied');

    const module = new WebAssembly.Module(wasmBytes);
    const instance = new WebAssembly.Instance(module, { env: { abort: () => { throw new Error('Liquid DSP aborted'); } } });
    this.exports = instance.exports;
    this.memory = this.exports.memory;
    this.handle = this.call('su_liquid_create');
    this.inPtr = this.call('su_liquid_in', this.handle);
    this.bpPtr = this.call('su_liquid_bp12', this.handle);
    this.lp12Ptr = this.call('su_liquid_lp12', this.handle);
    this.lp24Ptr = this.call('su_liquid_lp24', this.handle);
    this.call('su_liquid_set_sample_rate', this.handle, sampleRate);

    this.port.onmessage = (event) => {
      const m = event.data;
      if (!m || m.type !== 'params') return;
      if (m.cutoff !== undefined) this.call('su_liquid_set_cutoff', this.handle, m.cutoff);
      if (m.resonance !== undefined) this.call('su_liquid_set_resonance', this.handle, m.resonance);
    };
  }
  call(name, ...args) {
    const fn = this.exports[name] ?? this.exports[`_${name}`];
    if (typeof fn !== 'function') throw new Error(`Liquid DSP export missing: ${name}`);
    return fn(...args);
  }
  process(inputs, outputs) {
    const frames = outputs[0]?.[0]?.length ?? 128;
    const memory = new Float32Array(this.memory.buffer);
    const input = memory.subarray(this.inPtr>>>2,(this.inPtr>>>2)+frames);
    input.fill(0);
    const source = inputs[0]?.[0];
    if (source) input.set(source.subarray(0,frames));
    this.call('su_liquid_process', this.handle, frames);

    const bp=memory.subarray(this.bpPtr>>>2,(this.bpPtr>>>2)+frames);
    const lp12=memory.subarray(this.lp12Ptr>>>2,(this.lp12Ptr>>>2)+frames);
    const lp24=memory.subarray(this.lp24Ptr>>>2,(this.lp24Ptr>>>2)+frames);
    if(outputs[0]?.[0]) outputs[0][0].set(lp12);
    if(outputs[1]?.[0]) outputs[1][0].set(bp);
    if(outputs[2]?.[0]) outputs[2][0].set(lp24);
    return true;
  }
}
registerProcessor('sonus-liquid', SonusLiquidProcessor);
