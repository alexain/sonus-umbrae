class SonusMatterProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const wasmBytes = options.processorOptions?.wasmBytes;
    if (!(wasmBytes instanceof ArrayBuffer)) throw new Error('Matter DSP WASM was not supplied');

    const module = new WebAssembly.Module(wasmBytes);
    const instance = new WebAssembly.Instance(module, {
      env: { abort: () => { throw new Error('Matter DSP aborted'); } },
    });
    this.exports = instance.exports;
    this.memory = this.exports.memory;
    this.handle = this.call('su_matter_create');
    this.blockSize = this.call('su_matter_block_size');
    this.sourceRate = this.call('su_matter_sample_rate');
    this.hostRate = options.processorOptions?.hostSampleRate || sampleRate;
    this.ratio = this.sourceRate / this.hostRate;
    this.mainPtr = this.call('su_matter_main', this.handle);
    this.auxPtr = this.call('su_matter_aux', this.handle);
    this.blockIndex = this.blockSize;
    this.currentMain = 0;
    this.currentAux = 0;
    this.nextMain = 0;
    this.nextAux = 0;
    this.phase = 0;

    // Envelope state is intentionally local to each Matter worklet instance.
    // The runtime scheduler only emits triggers; the DSP-rate envelope runs here.
    this.drive = { kind: 'AD', values: [0.005, 0.5] };
    this.envLevel = 0;
    this.envStage = 'idle';
    this.envStageStart = 0;
    this.envStageTarget = 0;
    this.envStageSamples = 0;
    this.envStageElapsed = 0;
    this.envIndex = 0;
    this.envGate = false;

    this.setDefaults();
    [this.currentMain, this.currentAux] = this.nextSourceSample();
    [this.nextMain, this.nextAux] = this.nextSourceSample();

    this.port.onmessage = (event) => {
      const message = event.data;
      if (!message) return;
      if (message.type === 'trigger') {
        this.triggerEnvelope();
        return;
      }
      if (message.type === 'release') {
        this.releaseEnvelope();
        return;
      }
      if (message.type !== 'params') return;
      this.applyParams(message);
    };
  }

  call(name, ...args) {
    const fn = this.exports[name] ?? this.exports[`_${name}`];
    if (typeof fn !== 'function') throw new Error(`Matter DSP export missing: ${name}`);
    return fn(...args);
  }

  setDefaults() {
    this.call('su_matter_set_note', this.handle, 60);
    this.call('su_matter_set_strength', this.handle, 0.0);
    this.call('su_matter_set_envelope', this.handle, 0.5);
    this.call('su_matter_set_bow_level', this.handle, 0.0);
    this.call('su_matter_set_bow_timbre', this.handle, 0.5);
    this.call('su_matter_set_blow_level', this.handle, 0.0);
    this.call('su_matter_set_blow_meta', this.handle, 0.5);
    this.call('su_matter_set_blow_timbre', this.handle, 0.5);
    this.call('su_matter_set_strike_level', this.handle, 0.0);
    this.call('su_matter_set_strike_meta', this.handle, 0.5);
    this.call('su_matter_set_strike_timbre', this.handle, 0.5);
    this.call('su_matter_set_signature', this.handle, 0.0);
    this.call('su_matter_set_geometry', this.handle, 0.45);
    this.call('su_matter_set_brightness', this.handle, 0.65);
    this.call('su_matter_set_damping', this.handle, 0.55);
    this.call('su_matter_set_position', this.handle, 0.35);
    this.call('su_matter_set_space', this.handle, 0.25);
    this.call('su_matter_set_gate', this.handle, 0);
  }

  applyParams(message) {
    if (message.drive) {
      const kind = String(message.drive.kind || '').toUpperCase();
      const values = Array.isArray(message.drive.values) ? message.drive.values.map(Number) : [];
      if (['AD', 'ADR', 'ASR', 'ADSR', 'DAHDSR'].includes(kind) && values.every(Number.isFinite)) {
        this.drive = { kind, values };
      }
    }

    const setters = {
      note: 'note',
      bowLevel: 'bow_level', bowTimbre: 'bow_timbre',
      blowLevel: 'blow_level', blowMeta: 'blow_meta', blowTimbre: 'blow_timbre',
      strikeLevel: 'strike_level', strikeMeta: 'strike_meta', strikeTimbre: 'strike_timbre',
      signature: 'signature', geometry: 'geometry', brightness: 'brightness',
      damping: 'damping', position: 'position', space: 'space',
    };
    for (const [key, suffix] of Object.entries(setters)) {
      if (message[key] !== undefined) this.call(`su_matter_set_${suffix}`, this.handle, message[key]);
    }
  }

  setStage(name, target, seconds) {
    this.envStage = name;
    this.envStageStart = this.envLevel;
    this.envStageTarget = Math.max(0, Math.min(1, target));
    this.envStageSamples = Math.max(0, Math.round(Math.max(0, seconds) * this.sourceRate));
    this.envStageElapsed = 0;
    if (this.envStageSamples === 0) {
      this.envLevel = this.envStageTarget;
      this.advanceEnvelope();
    }
  }

  triggerEnvelope() {
    // Retrigger from the current level to avoid a forced discontinuity.
    this.envGate = true;
    this.envIndex = 0;
    const k = this.drive.kind;
    const v = this.drive.values;
    if (k === 'DAHDSR') {
      if ((v[0] || 0) > 0) this.setStage('delay', this.envLevel, v[0]);
      else this.setStage('attack', 1, v[1] || 0);
      return;
    }
    this.setStage('attack', 1, v[0] || 0);
  }

  releaseEnvelope() {
    this.envGate = false;
    const k = this.drive.kind;
    const v = this.drive.values;
    const release = k === 'ADR' ? v[2]
      : k === 'ASR' ? v[2]
      : k === 'ADSR' ? v[3]
      : k === 'DAHDSR' ? v[5]
      : 0;
    if (release > 0) this.setStage('release', 0, release);
    else if (k !== 'AD') this.setStage('release', 0, 0);
  }

  advanceEnvelope() {
    const k = this.drive.kind;
    const v = this.drive.values;
    if (this.envStage === 'delay') {
      this.setStage('attack', 1, v[1] || 0);
      return;
    }
    if (this.envStage === 'attack') {
      if (k === 'AD' || k === 'ADR') { this.setStage('decay', 0, v[1] || 0); return; }
      if (k === 'ASR') { this.envLevel = Math.max(0, Math.min(1, v[1] ?? 1)); this.envStage = 'sustain'; return; }
      if (k === 'ADSR') { this.setStage('decay', v[2] ?? 1, v[1] || 0); return; }
      if (k === 'DAHDSR') { this.setStage('hold', 1, v[2] || 0); return; }
    }
    if (this.envStage === 'hold') {
      this.setStage('decay', v[4] ?? 1, v[3] || 0);
      return;
    }
    if (this.envStage === 'decay') {
      if (k === 'AD' || k === 'ADR') { this.envLevel = 0; this.envStage = 'idle'; this.envGate = false; return; }
      this.envStage = 'sustain';
      return;
    }
    if (this.envStage === 'release') {
      this.envLevel = 0;
      this.envStage = 'idle';
      return;
    }
  }

  stepEnvelope() {
    if (this.envStage === 'idle' || this.envStage === 'sustain') return this.envLevel;
    if (this.envStageSamples <= 0) return this.envLevel;
    this.envStageElapsed += 1;
    const t = Math.min(1, this.envStageElapsed / this.envStageSamples);
    this.envLevel = this.envStageStart + (this.envStageTarget - this.envStageStart) * t;
    if (t >= 1) this.advanceEnvelope();
    return this.envLevel;
  }

  renderBlock() {
    // Advance the DRIVE envelope at source-sample rate. Performance.strength is
    // the continuous excitation amplitude; gate remains high while the envelope
    // is active, so bow/blow evolve continuously and strike reacts to its edge.
    let sum = 0;
    for (let i = 0; i < this.blockSize; i += 1) sum += this.stepEnvelope();
    const drive = sum / this.blockSize;
    this.call('su_matter_set_strength', this.handle, Math.max(0, Math.min(1, drive)));
    this.call('su_matter_set_gate', this.handle, drive > 0.00001 ? 1 : 0);
    this.call('su_matter_process', this.handle);
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

  process(_inputs, outputs) {
    const mainOut = outputs[0]?.[0];
    const auxOut = outputs[1]?.[0];
    const frames = mainOut?.length ?? auxOut?.length ?? 128;
    for (let i = 0; i < frames; i += 1) {
      const main = this.currentMain + (this.nextMain - this.currentMain) * this.phase;
      const aux = this.currentAux + (this.nextAux - this.currentAux) * this.phase;
      if (mainOut) mainOut[i] = Number.isFinite(main) ? main : 0;
      if (auxOut) auxOut[i] = Number.isFinite(aux) ? aux : 0;
      this.phase += this.ratio;
      while (this.phase >= 1) {
        this.phase -= 1;
        this.currentMain = this.nextMain;
        this.currentAux = this.nextAux;
        [this.nextMain, this.nextAux] = this.nextSourceSample();
      }
    }
    return true;
  }
}

registerProcessor('sonus-matter', SonusMatterProcessor);
