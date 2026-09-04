class SonusSkyProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const wasmBytes = options.processorOptions?.wasmBytes;
    if (!(wasmBytes instanceof ArrayBuffer)) throw new Error('Sky DSP WASM was not supplied');

    const module = new WebAssembly.Module(wasmBytes);
    const env = {
      abort: () => { throw new Error('Sky DSP aborted'); },
      // Emscripten emits this import when memory growth is enabled.  Sonus does
      // not use Emscripten's generated JS heap views; the worklet creates a
      // fresh Float32Array from exports.memory on each process quantum, so no
      // view refresh is required here.  Keep the no-op for compatibility with
      // sky.wasm files built before v7.5.
      emscripten_notify_memory_growth: () => {},
    };
    const instance = new WebAssembly.Instance(module, { env });
    this.exports = instance.exports;
    this.memory = this.exports.memory;

    // STANDALONE_WASM modules built from C++ can export an explicit
    // initializer for runtime/static constructors.  Most of the smaller Sonus
    // DSPs do not need it, but CloudSeedCore uses enough C++ runtime machinery
    // that we must run it before allocating the reverb object.
    const initialize = this.exports._initialize ?? this.exports.__wasm_call_ctors;
    if (typeof initialize === 'function') initialize();

    this.handle = this.call('su_sky_create');
    this.inL = this.call('su_sky_in_l', this.handle);
    this.inR = this.call('su_sky_in_r', this.handle);
    this.outL = this.call('su_sky_out_l', this.handle);
    this.outR = this.call('su_sky_out_r', this.handle);
    this.call('su_sky_set_sample_rate', this.handle, sampleRate);

    this.port.onmessage = (event) => {
      const m = event.data;
      if (!m || m.type !== 'params') return;
      const setters = [
        ['size', 'su_sky_set_size'], ['decay', 'su_sky_set_decay'],
        ['damp', 'su_sky_set_damp'], ['bloom', 'su_sky_set_bloom'],
        ['predelay', 'su_sky_set_predelay'], ['motion', 'su_sky_set_motion'],
        ['width', 'su_sky_set_width'],
      ];
      for (const [field, setter] of setters) {
        if (m[field] !== undefined) this.call(setter, this.handle, m[field]);
      }
      if (m.freeze !== undefined) this.call('su_sky_set_freeze', this.handle, m.freeze ? 1 : 0);
    };
  }

  call(name, ...args) {
    const fn = this.exports[name] ?? this.exports[`_${name}`];
    if (typeof fn !== 'function') throw new Error(`Sky DSP export missing: ${name}`);
    return fn(...args);
  }

  process(inputs, outputs) {
    const output = outputs[0];
    const frames = output?.[0]?.length ?? output?.[1]?.length ?? 128;
    const memory = new Float32Array(this.memory.buffer);
    const copy = (src, ptr) => {
      const dst = memory.subarray(ptr >>> 2, (ptr >>> 2) + frames);
      if (src) dst.set(src.subarray(0, frames));
      else dst.fill(0);
    };

    // Sky is a stereo DSP.  Keep it as one two-channel WebAudio stream at the
    // worklet boundary; the engine uses a merger/splitter only at the graph
    // edges where Sonus exposes explicit L/R ports.
    const input = inputs[0];
    const left = input?.[0];
    const right = input?.[1] ?? left;
    copy(left, this.inL);
    copy(right, this.inR);

    this.call('su_sky_process', this.handle, frames);
    const wetL = memory.subarray(this.outL >>> 2, (this.outL >>> 2) + frames);
    const wetR = memory.subarray(this.outR >>> 2, (this.outR >>> 2) + frames);
    if (output?.[0]) output[0].set(wetL);
    if (output?.[1]) output[1].set(wetR);
    return true;
  }
}

registerProcessor('sonus-sky', SonusSkyProcessor);
