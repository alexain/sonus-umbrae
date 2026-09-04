class SonusResonatorProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const wasmBytes = options.processorOptions?.wasmBytes;
    if (!(wasmBytes instanceof ArrayBuffer)) throw new Error('Resonator DSP WASM was not supplied');

    const module = new WebAssembly.Module(wasmBytes);
    const instance = new WebAssembly.Instance(module, {
      env: { abort: () => { throw new Error('Resonator DSP aborted'); } },
    });
    this.exports = instance.exports;
    this.memory = this.exports.memory;
    this.handle = this.call('su_resonator_create');
    this.blockSize = this.call('su_resonator_block_size');
    this.sourceRate = this.call('su_resonator_sample_rate');
    this.hostRate = options.processorOptions?.hostSampleRate || sampleRate;
    this.outputRatio = this.sourceRate / this.hostRate;

    this.inputPtr = this.call('su_resonator_in', this.handle);
    this.mainPtr = this.call('su_resonator_main', this.handle);
    this.auxPtr = this.call('su_resonator_aux', this.handle);

    this.blockIndex = this.blockSize;
    this.currentMain = 0;
    this.currentAux = 0;
    this.nextMain = 0;
    this.nextAux = 0;
    this.outputPhase = 0;

    // Host-rate input is accumulated and resampled into each native 48 kHz / 24-frame Rings block.
    this.hostInput = [];
    this.inputReadPhase = 0;
    this.inputStep = this.hostRate / this.sourceRate;
    this.externalInputConnected = false;

    this.setDefaults();
    [this.currentMain, this.currentAux] = this.nextSourceSample();
    [this.nextMain, this.nextAux] = this.nextSourceSample();

    this.port.onmessage = (event) => {
      const message = event.data;
      if (!message) return;
      if (message.type === 'strum' || message.type === 'trigger') {
        this.call('su_resonator_strum', this.handle);
        return;
      }
      if (message.type !== 'params') return;
      this.applyParams(message);
    };
  }

  call(name, ...args) {
    const fn = this.exports[name] ?? this.exports[`_${name}`];
    if (typeof fn !== 'function') throw new Error(`Resonator DSP export missing: ${name}`);
    return fn(...args);
  }

  setDefaults() {
    this.call('su_resonator_set_model', this.handle, 0);
    this.call('su_resonator_set_polyphony', this.handle, 1);
    this.call('su_resonator_set_note', this.handle, 60);
    this.call('su_resonator_set_structure', this.handle, 0.5);
    this.call('su_resonator_set_brightness', this.handle, 0.5);
    this.call('su_resonator_set_damping', this.handle, 0.5);
    this.call('su_resonator_set_position', this.handle, 0.5);
    this.call('su_resonator_set_internal_exciter', this.handle, 1);
  }

  applyParams(message) {
    const setters = {
      model: ['model', false],
      polyphony: ['polyphony', false],
      note: ['note', false],
      structure: ['structure', true],
      brightness: ['brightness', true],
      damping: ['damping', true],
      position: ['position', true],
    };
    for (const [key, [suffix, normalized]] of Object.entries(setters)) {
      if (message[key] === undefined) continue;
      const value = normalized ? Math.max(0, Math.min(1, Number(message[key]))) : Number(message[key]);
      this.call(`su_resonator_set_${suffix}`, this.handle, value);
    }
  }

  appendHostInput(input) {
    if (!input || input.length === 0) return;
    for (let i = 0; i < input.length; i += 1) this.hostInput.push(Number.isFinite(input[i]) ? input[i] : 0);
  }

  nextInputSample() {
    if (this.hostInput.length === 0) return 0;
    const index = Math.floor(this.inputReadPhase);
    const frac = this.inputReadPhase - index;
    const a = this.hostInput[Math.min(index, this.hostInput.length - 1)] || 0;
    const b = this.hostInput[Math.min(index + 1, this.hostInput.length - 1)] || a;
    const value = a + (b - a) * frac;
    this.inputReadPhase += this.inputStep;
    const consumed = Math.floor(this.inputReadPhase);
    if (consumed > 0) {
      this.hostInput.splice(0, Math.min(consumed, this.hostInput.length));
      this.inputReadPhase -= consumed;
    }
    return value;
  }

  renderBlock() {
    const memory = new Float32Array(this.memory.buffer);
    const base = this.inputPtr >>> 2;
    for (let i = 0; i < this.blockSize; i += 1) memory[base + i] = this.externalInputConnected ? this.nextInputSample() : 0;
    this.call('su_resonator_set_internal_exciter', this.handle, this.externalInputConnected ? 0 : 1);
    this.call('su_resonator_process', this.handle);
    this.blockIndex = 0;
  }

  nextSourceSample() {
    if (this.blockIndex >= this.blockSize) this.renderBlock();
    const memory = new Float32Array(this.memory.buffer);
    const main = memory[(this.mainPtr >>> 2) + this.blockIndex] || 0;
    const aux = memory[(this.auxPtr >>> 2) + this.blockIndex] || 0;
    this.blockIndex += 1;
    return [main, aux];
  }

  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    this.externalInputConnected = !!input;
    if (input) this.appendHostInput(input);

    const mainOut = outputs[0]?.[0];
    const auxOut = outputs[1]?.[0];
    const frames = mainOut?.length ?? auxOut?.length ?? 128;
    for (let i = 0; i < frames; i += 1) {
      const main = this.currentMain + (this.nextMain - this.currentMain) * this.outputPhase;
      const aux = this.currentAux + (this.nextAux - this.currentAux) * this.outputPhase;
      if (mainOut) mainOut[i] = Number.isFinite(main) ? main : 0;
      if (auxOut) auxOut[i] = Number.isFinite(aux) ? aux : 0;
      this.outputPhase += this.outputRatio;
      while (this.outputPhase >= 1) {
        this.outputPhase -= 1;
        this.currentMain = this.nextMain;
        this.currentAux = this.nextAux;
        [this.nextMain, this.nextAux] = this.nextSourceSample();
      }
    }
    return true;
  }
}

registerProcessor('sonus-resonator', SonusResonatorProcessor);
