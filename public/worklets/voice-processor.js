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
    this.baseHarmo = 0.5;
    this.baseTimbre = 0.5;
    this.baseMorph = 0.5;

    this.port.onmessage = (event) => {
      const message = event.data;
      if (!message || message.type !== 'params') return;
      if (message.model !== undefined) this.call('su_voice_set_model', this.handle, message.model);
      if (message.frequency !== undefined) this.call('su_voice_set_frequency', this.handle, message.frequency);
      if (message.harmo !== undefined) this.baseHarmo = message.harmo;
      if (message.timbre !== undefined) this.baseTimbre = message.timbre;
      if (message.morph !== undefined) this.baseMorph = message.morph;
    };
  }

  call(name, ...args) {
    const fn = this.exports[name] ?? this.exports[`_${name}`];
    if (typeof fn !== 'function') throw new Error(`Voice DSP export missing: ${name}`);
    return fn(...args);
  }

  process(inputs, outputs) {
    const triggerInput = inputs[0]?.[0];
    let trigger = 0;
    if (triggerInput) {
      for (let i = 0; i < triggerInput.length; i += 1) trigger = Math.max(trigger, triggerInput[i]);
    }
    this.call('su_voice_set_trigger', this.handle, trigger, triggerInput ? 1 : 0);

    const vOctInput = inputs[1]?.[0];
    const vOct = vOctInput && vOctInput.length > 0 ? vOctInput[0] : 0;
    this.call('su_voice_set_v_oct', this.handle, vOct);

    const latest = (input) => input && input.length > 0 ? input[input.length - 1] : 0;
    // Modulation inputs use Eurorack-style logical volts. ±5V spans the
    // full normalized parameter range before the route attenuverter.
    const cv = (input) => latest(input) / 5;
    this.call('su_voice_set_harmo', this.handle, Math.max(0, Math.min(1, this.baseHarmo + cv(inputs[2]?.[0]))));
    this.call('su_voice_set_timbre', this.handle, Math.max(0, Math.min(1, this.baseTimbre + cv(inputs[3]?.[0]))));
    this.call('su_voice_set_morph', this.handle, Math.max(0, Math.min(1, this.baseMorph + cv(inputs[4]?.[0]))));

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
