const WAVEFORMS = Object.freeze({ sine: 0, triangle: 1, sawtooth: 2, ramp: 3, square: 4 });
const RELATIONS = Object.freeze({ fm: 0, pm: 1, am: 2, ring: 3, sync: 4 });

class SonusCompositeProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const wasmBytes = options.processorOptions?.wasmBytes;
    if (!(wasmBytes instanceof ArrayBuffer)) throw new Error('Composite WASM was not supplied');
    const module = new WebAssembly.Module(wasmBytes);
    const instance = new WebAssembly.Instance(module, { env: { abort: () => { throw new Error('Composite DSP aborted'); } } });
    this.exports = instance.exports;
    this.memory = this.exports.memory;
    this.handle = this.call('su_composite_create');
    this.operators = [];
    this.outputSpecs = [];
    this.domain = 'voice';
    this.pitchFrequency = null;
    this.tunes = new Map();
    this.mixes = [];
    this.operatorIndex = new Map();
    this.mixIndex = new Map();
    this.call('su_composite_set_sample_rate', this.handle, Number(options.processorOptions?.hostSampleRate ?? sampleRate));
    this.port.onmessage = (event) => this.onMessage(event.data);
  }
  call(name, ...args) {
    const fn = this.exports[name] ?? this.exports[`_${name}`];
    if (typeof fn !== 'function') throw new Error(`Composite export missing: ${name}`);
    return fn(...args);
  }
  operatorFrequency(operator, index) {
    const tune = this.tunes.get(operator.name);
    if (tune?.mode === 'absolute') {
      const frequency = Number(tune.frequency);
      return Number.isFinite(frequency) && frequency > 0 ? frequency : Number(operator.frequency ?? 440);
    }
    const base = this.pitchFrequency ?? Number(operator.frequency ?? 440);
    const ratio = tune?.mode === 'relative' ? Number(tune.ratio ?? 1) : 1;
    const octave = tune?.mode === 'relative' ? Number(tune.octave ?? 0) : 0;
    const detune = tune?.mode === 'relative' ? Number(tune.detune ?? 0) : 0;
    return base * ratio * Math.pow(2, octave) * Math.pow(2, detune / 1200);
  }
  applyOperator(index) {
    const operator = this.operators[index];
    if (!operator) return;
    this.call('su_composite_set_operator', this.handle, index, WAVEFORMS[operator.waveform] ?? 0,
      this.operatorFrequency(operator, index), Number(operator.width ?? 50) / 100, Number(operator.level ?? 100) / 100);
  }
  applyMixInput(mixIndex, inputIndex) {
    const mix = this.mixes[mixIndex];
    const input = mix?.inputs?.[inputIndex];
    if (!input) return;
    this.call('su_composite_set_mix_input', this.handle, mixIndex, inputIndex, this.operatorIndex.get(input.source) ?? -1,
      Number(input.level ?? 100) / 100, Number(input.octave ?? 0), Number(input.detune ?? 0));
  }

  configure(config) {
    this.domain = config.domain === 'mod' ? 'mod' : 'voice';
    this.operators = Array.isArray(config.operators) ? config.operators : [];
    const requestedPitch = config.pitchFrequency;
    this.pitchFrequency = requestedPitch === null || requestedPitch === undefined
      ? null
      : (Number.isFinite(Number(requestedPitch)) && Number(requestedPitch) > 0 ? Number(requestedPitch) : null);
    this.operatorIndex = new Map(this.operators.map((operator, i) => [operator.name, i]));
    this.tunes = new Map((Array.isArray(config.tunes) ? config.tunes : []).map((tune) => [tune.node, { ...tune }]));
    this.call('su_composite_set_operator_count', this.handle, this.operators.length);
    this.operators.forEach((operator, i) => {
      this.applyOperator(i);
    });

    const edges = Array.isArray(config.edges) ? config.edges : [];
    this.call('su_composite_set_edge_count', this.handle, edges.length);
    edges.forEach((edge, i) => {
      const p = edge.params ?? {};
      let depth = Number(p.depth ?? 100) / 100;
      let p1 = 0, p2 = 0;
      if (edge.relation === 'fm' || edge.relation === 'pm') p1 = Number(p.feedback ?? 0) / 100;
      else if (edge.relation === 'am') { p1 = Number(p.bias ?? 0) / 100; p2 = Number(p.mix ?? 100) / 100; }
      else if (edge.relation === 'ring') { p1 = Number(p.mix ?? p.depth ?? 100) / 100; p2 = Number(p.drive ?? 0) / 100; }
      else if (edge.relation === 'sync') { depth = 1; p1 = Number(p.phase ?? 0) / 100; }
      this.call('su_composite_set_edge', this.handle, i, RELATIONS[edge.relation] ?? 0,
        this.operatorIndex.get(edge.source) ?? -1, this.operatorIndex.get(edge.target) ?? -1, depth, p1, p2, p.invert ? 1 : 0);
    });

    this.mixes = Array.isArray(config.mixes) ? config.mixes.map((mix) => ({ ...mix, inputs: (mix.inputs ?? []).map((input) => ({ ...input })) })) : [];
    this.mixIndex = new Map(this.mixes.map((mix, i) => [mix.name, i]));
    this.call('su_composite_set_mix_count', this.handle, this.mixes.length);
    this.mixes.forEach((mix, m) => {
      const inputs = Array.isArray(mix.inputs) ? mix.inputs : [];
      this.call('su_composite_set_mix_input_count', this.handle, m, inputs.length);
      inputs.forEach((input, i) => {
        this.applyMixInput(m, i);
      });
    });

    this.outputSpecs = Array.isArray(config.outputs) ? config.outputs : [];
    this.call('su_composite_set_output_count', this.handle, this.outputSpecs.length);
    this.outputSpecs.forEach((output, i) => {
      if (this.mixIndex.has(output.name)) this.call('su_composite_set_output', this.handle, i, 1, this.mixIndex.get(output.name));
      else this.call('su_composite_set_output', this.handle, i, 0, this.operatorIndex.get(output.name) ?? -1);
    });
  }
  onMessage(message) {
    if (!message) return;
    if (message.type === 'config') this.configure(message);
    if (message.type === 'operator') {
      const i = this.operators.findIndex((operator) => operator.name === message.name);
      if (i < 0) return;
      this.operators[i] = { ...this.operators[i], ...message.patch };
      const operator = this.operators[i];
      this.applyOperator(i);
    }
    if (message.type === 'tune') {
      const i = this.operatorIndex.get(message.node);
      if (i === undefined) return;
      const current = this.tunes.get(message.node) ?? { node: message.node, mode: 'relative', octave: 0, detune: 0, ratio: 1 };
      const next = { ...current, ...message.patch, node: message.node };
      this.tunes.set(message.node, next);
      this.applyOperator(i);
    }
    if (message.type === 'mix-level') {
      const m = this.mixIndex.get(message.mix);
      if (m === undefined) return;
      const i = this.mixes[m]?.inputs?.findIndex((input) => input.source === message.source) ?? -1;
      if (i < 0) return;
      this.mixes[m].inputs[i].level = Number(message.level);
      this.applyMixInput(m, i);
    }
    if (message.type === 'output-level') {
      const output = this.outputSpecs.find((item) => item.name === message.output);
      if (output) output.level = Number(message.level);
    }
    if (message.type === 'pitch') {
      const frequency = Number(message.frequency);
      if (!Number.isFinite(frequency) || frequency <= 0) return;
      this.pitchFrequency = frequency;
      this.operators.forEach((_operator, i) => this.applyOperator(i));
    }
  }
  process(_inputs, outputs) {
    const frames = outputs[0]?.[0]?.length ?? 128;
    this.call('su_composite_process', this.handle, frames);
    const memory = new Float32Array(this.memory.buffer);
    const master = outputs[0]?.[0];
    if (master) master.fill(0);
    for (let tap = 0; tap < this.outputSpecs.length; ++tap) {
      const ptr = this.call('su_composite_out', this.handle, tap);
      if (!ptr) continue;
      const raw = memory.subarray(ptr >>> 2, (ptr >>> 2) + frames);
      const named = outputs[tap + 1]?.[0];
      if (named) named.set(raw);
      if (master) {
        if (this.domain === 'voice') {
          const level = Math.max(0, Math.min(1, Number(this.outputSpecs[tap]?.level ?? 100) / 100));
          for (let frame = 0; frame < frames; ++frame) master[frame] += raw[frame] * level;
        } else if (this.outputSpecs.length === 1 && tap === 0) {
          master.set(raw);
        }
      }
    }
    return true;
  }
}
registerProcessor('sonus-composite', SonusCompositeProcessor);
