class SonusSwellProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const wasmBytes = options.processorOptions?.wasmBytes;
    if (!(wasmBytes instanceof ArrayBuffer)) throw new Error('Swell DSP WASM was not supplied');

    const module = new WebAssembly.Module(wasmBytes);
    const instance = new WebAssembly.Instance(module, {
      env: { abort: () => { throw new Error('Swell DSP aborted'); } },
    });
    this.exports = instance.exports;
    this.memory = this.exports.memory;
    this.handle = this.call('su_swell_create');
    this.call('su_swell_set_sample_rate', this.handle, options.processorOptions?.sampleRate ?? sampleRate);
    this.ptrs = [1, 2, 3, 4].map((n) => this.call(`su_swell_out${n}`, this.handle));
    this.triggerPtr = this.call('su_swell_trigger', this.handle);
    this.clockPtr = this.call('su_swell_clock', this.handle);
    this.vOctPtr = this.call('su_swell_v_oct', this.handle);
    this.running = true;
    this.monitorCounter = 0;
    this.monitorIntervalFrames = Math.max(
      128,
      Math.floor((options.processorOptions?.sampleRate ?? sampleRate) / 60),
    );

    this.port.onmessage = (event) => {
      const m = event.data;
      if (!m) return;
      if (m.type === 'transport') {
        const nextRunning = Boolean(m.running);
        if (nextRunning !== this.running) {
          this.running = nextRunning;
          this.call('su_swell_reset', this.handle);
          this.monitorCounter = 0;
        }
        return;
      }
      if (m.type !== 'params') return;
      if (m.frequency !== undefined) this.call('su_swell_set_frequency', this.handle, m.frequency);
      if (m.slope !== undefined) this.call('su_swell_set_slope', this.handle, m.slope);
      if (m.shape !== undefined) this.call('su_swell_set_shape', this.handle, m.shape);
      if (m.smooth !== undefined) this.call('su_swell_set_smooth', this.handle, m.smooth);
      if (m.shift !== undefined) this.call('su_swell_set_shift', this.handle, m.shift);
      if (m.mode !== undefined) this.call('su_swell_set_mode', this.handle, m.mode);
      if (m.outputMode !== undefined) this.call('su_swell_set_output_mode', this.handle, m.outputMode);
      if (m.range !== undefined) this.call('su_swell_set_range', this.handle, m.range);
    };
  }

  call(name, ...args) {
    const fn = this.exports[name] ?? this.exports[`_${name}`];
    if (typeof fn !== 'function') throw new Error(`Swell DSP export missing: ${name}`);
    return fn(...args);
  }

  process(inputs, outputs) {
    const frames = outputs[0]?.[0]?.length ?? 128;
    const memory = new Float32Array(this.memory.buffer);

    if (!this.running) {
      for (let channel = 0; channel < 4; channel += 1) {
        outputs[channel]?.[0]?.fill(0);
      }
      return true;
    }

    const copyInput = (index, ptr) => {
      const source = inputs[index]?.[0];
      const target = memory.subarray(ptr >>> 2, (ptr >>> 2) + frames);
      if (source) target.set(source);
      else target.fill(0);
      return Boolean(source);
    };

    const triggerPatched = copyInput(0, this.triggerPtr);
    const clockPatched = copyInput(1, this.clockPtr);
    copyInput(2, this.vOctPtr);
    this.call('su_swell_set_trigger_patched', this.handle, triggerPatched ? 1 : 0);
    this.call('su_swell_set_clock_patched', this.handle, clockPatched ? 1 : 0);

    this.call('su_swell_process', this.handle, frames);
    for (let channel = 0; channel < 4; channel += 1) {
      const output = outputs[channel]?.[0];
      if (!output) continue;
      const ptr = this.ptrs[channel] >>> 2;
      output.set(memory.subarray(ptr, ptr + frames));
    }

    this.monitorCounter += frames;
    if (this.monitorCounter >= this.monitorIntervalFrames) {
      this.monitorCounter %= this.monitorIntervalFrames;
      const last = Math.max(0, frames - 1);
      this.port.postMessage({
        type: 'monitor',
        values: this.ptrs.map((ptr) => memory[(ptr >>> 2) + last] ?? 0),
      });
    }
    return true;
  }
}
registerProcessor('sonus-swell', SonusSwellProcessor);
