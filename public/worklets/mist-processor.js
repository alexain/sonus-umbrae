class SonusMistProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    const wasmBytes = options.processorOptions?.wasmBytes;
    if (!(wasmBytes instanceof ArrayBuffer)) throw new Error('Mist DSP WASM was not supplied');

    const module = new WebAssembly.Module(wasmBytes);
    const instance = new WebAssembly.Instance(module, {
      env: { abort: () => { throw new Error('Mist DSP aborted'); } },
    });

    this.exports = instance.exports;
    this.memory = this.exports.memory;

    this.call('su_mist_init');
    this.call('su_mist_set_sample_rate', sampleRate);

    this.inL = this.call('su_mist_in_l');
    this.inR = this.call('su_mist_in_r');
    this.trig = this.call('su_mist_trig');
    this.outL = this.call('su_mist_out_l');
    this.outR = this.call('su_mist_out_r');

    this.port.onmessage = (event) => {
      const message = event.data;
      if (!message || message.type !== 'params') return;

      const setters = [
        ['mix', 'su_mist_set_mix'],
        ['position', 'su_mist_set_position'],
        ['size', 'su_mist_set_size'],
        ['pitch', 'su_mist_set_pitch'],
        ['density', 'su_mist_set_density'],
        ['texture', 'su_mist_set_texture'],
        ['spread', 'su_mist_set_spread'],
        ['feedback', 'su_mist_set_feedback'],
        ['reverb', 'su_mist_set_reverb'],
      ];

      for (const [field, setter] of setters) {
        if (message[field] !== undefined) this.call(setter, message[field]);
      }
      if (message.mode !== undefined) this.call('su_mist_set_mode', message.mode);
      if (message.freeze !== undefined) this.call('su_mist_set_freeze', message.freeze ? 1 : 0);
      if (message.reverse !== undefined) this.call('su_mist_set_reverse', message.reverse ? 1 : 0);
    };
  }

  call(name, ...args) {
    const fn = this.exports[name] ?? this.exports[`_${name}`];
    if (typeof fn !== 'function') throw new Error(`Mist DSP export missing: ${name}`);
    return fn(...args);
  }

  process(inputs, outputs) {
    const left = outputs[0]?.[0];
    const right = outputs[1]?.[0];
    const frames = left?.length ?? right?.length ?? 128;
    const memory = new Float32Array(this.memory.buffer);

    const copyInput = (source, pointer) => {
      const target = memory.subarray(pointer >>> 2, (pointer >>> 2) + frames);
      if (source) target.set(source);
      else target.fill(0);
    };

    const inputL = inputs[0]?.[0];
    const inputR = inputs[1]?.[0] ?? inputL;
    copyInput(inputL, this.inL);
    copyInput(inputR, this.inR);
    copyInput(inputs[2]?.[0], this.trig);

    this.call('su_mist_process', frames);

    if (left) {
      const offset = this.outL >>> 2;
      left.set(memory.subarray(offset, offset + frames));
    }
    if (right) {
      const offset = this.outR >>> 2;
      right.set(memory.subarray(offset, offset + frames));
    }

    return true;
  }
}

registerProcessor('sonus-mist', SonusMistProcessor);
