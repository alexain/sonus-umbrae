class SonusDicesProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const wasmBytes = options.processorOptions?.wasmBytes;
    if (!(wasmBytes instanceof ArrayBuffer)) throw new Error('Dices DSP WASM was not supplied');

    const module = new WebAssembly.Module(wasmBytes);
    const instance = new WebAssembly.Instance(module, {
      env: { abort: () => { throw new Error('Dices DSP aborted'); } },
    });

    this.exports = instance.exports;
    this.memory = this.exports.memory;
    this.handle = this.call('su_dices_create');
    this.clockPtr = this.call('su_dices_clock', this.handle);
    this.outputPtrs = ['t1', 't2', 't3', 'x1', 'x2', 'x3', 'y']
      .map((port) => this.call(`su_dices_${port}`, this.handle));

    this.call('su_dices_set_sample_rate', this.handle, sampleRate);

    this.port.onmessage = (event) => {
      const m = event.data;
      if (!m || m.type !== 'params') return;
      if (m.rate !== undefined) this.call('su_dices_set_rate', this.handle, m.rate);
      if (m.jitter !== undefined) this.call('su_dices_set_jitter', this.handle, m.jitter);
      if (m.gateBias !== undefined) this.call('su_dices_set_gate_bias', this.handle, m.gateBias);
      if (m.gateLength !== undefined) this.call('su_dices_set_gate_length', this.handle, m.gateLength);
      if (m.gateJitter !== undefined) this.call('su_dices_set_gate_jitter', this.handle, m.gateJitter);
      if (m.spread !== undefined) this.call('su_dices_set_spread', this.handle, m.spread);
      if (m.bias !== undefined) this.call('su_dices_set_bias', this.handle, m.bias);
      if (m.steps !== undefined) this.call('su_dices_set_steps', this.handle, m.steps);
      if (m.deja !== undefined) this.call('su_dices_set_deja', this.handle, m.deja);
      if (m.length !== undefined) this.call('su_dices_set_length', this.handle, m.length);
      if (m.scale !== undefined) this.call('su_dices_set_scale', this.handle, m.scale);
    };
  }

  call(name, ...args) {
    const fn = this.exports[name] ?? this.exports[`_${name}`];
    if (typeof fn !== 'function') throw new Error(`Dices DSP export missing: ${name}`);
    return fn(...args);
  }

  process(inputs, outputs) {
    const frames = outputs[0]?.[0]?.length ?? 128;
    const memory = new Float32Array(this.memory.buffer);

    const clock = inputs[0]?.[0];
    const clockTarget = memory.subarray(this.clockPtr >>> 2, (this.clockPtr >>> 2) + frames);
    if (clock) clockTarget.set(clock);
    else clockTarget.fill(0);
    this.call('su_dices_set_clock_patched', this.handle, clock ? 1 : 0);

    this.call('su_dices_process', this.handle, frames);

    for (let i = 0; i < this.outputPtrs.length; i += 1) {
      const destination = outputs[i]?.[0];
      if (!destination) continue;
      const ptr = this.outputPtrs[i] >>> 2;
      destination.set(memory.subarray(ptr, ptr + frames));
    }
    return true;
  }
}

registerProcessor('sonus-dices', SonusDicesProcessor);
