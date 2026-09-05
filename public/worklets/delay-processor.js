class SonusDelayProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const wasmBytes = options.processorOptions?.wasmBytes;
    if (!(wasmBytes instanceof ArrayBuffer)) throw new Error('Delay DSP WASM was not supplied');

    const module = new WebAssembly.Module(wasmBytes);
    const instance = new WebAssembly.Instance(module, {
      env: {
        abort: () => { throw new Error('Delay DSP aborted'); },
        emscripten_notify_memory_growth: () => {},
      },
    });
    this.exports = instance.exports;
    this.memory = this.exports.memory;
    const initialize = this.exports._initialize ?? this.exports.__wasm_call_ctors;
    if (typeof initialize === 'function') initialize();

    this.handle = this.call('su_delay_create');
    this.inL = this.call('su_delay_in_l', this.handle);
    this.inR = this.call('su_delay_in_r', this.handle);
    this.outL = this.call('su_delay_out_l', this.handle);
    this.outR = this.call('su_delay_out_r', this.handle);
    this.call('su_delay_set_sample_rate', this.handle, sampleRate);

    this.port.onmessage = (event) => {
      const m = event.data;
      if (!m || m.type !== 'params') return;
      if (Array.isArray(m.pitchShifts)) {
        const setCount = this.exports.su_delay_set_pitch_shift_count ?? this.exports._su_delay_set_pitch_shift_count;
        const setValue = this.exports.su_delay_set_pitch_shift_value ?? this.exports._su_delay_set_pitch_shift_value;
        if (typeof setCount === 'function' && typeof setValue === 'function') {
          const count = Math.min(16, m.pitchShifts.length);
          setCount(this.handle, count);
          for (let i = 0; i < count; i += 1) setValue(this.handle, i, m.pitchShifts[i]);
        }
      }
      const setters = [
        ['lines', 'su_delay_set_lines'],
        ['timeMs', 'su_delay_set_time_ms'],
        ['spread', 'su_delay_set_spread'],
        ['spreadLoose', 'su_delay_set_spread_loose'],
        ['feedback', 'su_delay_set_feedback'],
        ['reverse', 'su_delay_set_reverse'],
        ['pitchProbability', 'su_delay_set_pitch_probability'],
        ['tape', 'su_delay_set_tape'],
        ['diffusion', 'su_delay_set_diffusion'],
        ['mix', 'su_delay_set_mix'],
        ['pingpong', 'su_delay_set_pingpong'],
      ];
      for (const [field, setter] of setters) {
        if (m[field] === undefined) continue;
        const fn = this.exports[setter] ?? this.exports[`_${setter}`];
        if (typeof fn !== 'function') {
          console.warn(`[sonus-delay] optional DSP setter missing: ${setter}`);
          continue;
        }
        fn(this.handle, m[field]);
      }
    };
  }

  call(name, ...args) {
    const fn = this.exports[name] ?? this.exports[`_${name}`];
    if (typeof fn !== 'function') throw new Error(`Delay DSP export missing: ${name}`);
    return fn(...args);
  }

  process(inputs, outputs) {
    const output = outputs[0];
    const frames = output?.[0]?.length ?? output?.[1]?.length ?? 128;
    const memory = new Float32Array(this.memory.buffer);
    const input = inputs[0];
    const left = input?.[0];
    const right = input?.[1] ?? left;

    const copy = (src, ptr) => {
      const dst = memory.subarray(ptr >>> 2, (ptr >>> 2) + frames);
      if (src) dst.set(src.subarray(0, frames)); else dst.fill(0);
    };
    copy(left, this.inL);
    copy(right, this.inR);

    this.call('su_delay_process', this.handle, frames);
    const wetL = memory.subarray(this.outL >>> 2, (this.outL >>> 2) + frames);
    const wetR = memory.subarray(this.outR >>> 2, (this.outR >>> 2) + frames);
    if (output?.[0]) output[0].set(wetL);
    if (output?.[1]) output[1].set(wetR);
    return true;
  }
}

registerProcessor('sonus-delay', SonusDelayProcessor);
