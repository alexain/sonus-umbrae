class SonusDicesProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const bytes = options.processorOptions?.wasmBytes;
    if (!bytes) throw new Error('Dices WASM bytes missing');

    const module = new WebAssembly.Module(bytes);
    this.instance = new WebAssembly.Instance(module, {});
    this.exports = this.instance.exports;
    this.memory = this.exports.memory;
    this.handle = this.call('su_dices_create');
    this.call('su_dices_set_sample_rate', this.handle, sampleRate);

    this.ptrs = [
      this.call('su_dices_x1', this.handle),
      this.call('su_dices_x2', this.handle),
      this.call('su_dices_x3', this.handle),
      this.call('su_dices_y', this.handle),
    ];
    this.monitorCounter = 0;

    this.port.onmessage = (event) => {
      const m = event.data;
      if (!m || m.type !== 'params') return;
      const setters = [
        ['rate', 'su_dices_set_rate'],
        ['spread', 'su_dices_set_spread'],
        ['bias', 'su_dices_set_bias'],
        ['steps', 'su_dices_set_steps'],
        ['deja', 'su_dices_set_deja'],
        ['length', 'su_dices_set_length'],
        ['diversity', 'su_dices_set_diversity'],
      ];
      for (const [field, setter] of setters) {
        if (m[field] !== undefined) this.call(setter, this.handle, m[field]);
      }
    };
  }

  call(name, ...args) {
    const fn = this.exports[name] ?? this.exports[`_${name}`];
    if (typeof fn !== 'function') throw new Error(`Dices DSP export missing: ${name}`);
    return fn(...args);
  }

  process(_inputs, outputs) {
    const frames = outputs[0]?.[0]?.length ?? 128;
    this.call('su_dices_process', this.handle, frames);
    const mem = new Float32Array(this.memory.buffer);
    const values = [];
    for (let ch = 0; ch < 4; ch += 1) {
      const src = mem.subarray(this.ptrs[ch] >>> 2, (this.ptrs[ch] >>> 2) + frames);
      if (outputs[ch]?.[0]) outputs[ch][0].set(src);
      values.push(src[Math.max(0, frames - 1)] ?? 0);
    }
    this.monitorCounter += frames;
    if (this.monitorCounter >= sampleRate / 30) {
      this.monitorCounter = 0;
      this.port.postMessage({ type: 'monitor', values });
    }
    return true;
  }
}
registerProcessor('sonus-dices', SonusDicesProcessor);
