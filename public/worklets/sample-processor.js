class SonusSampleProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const bytes = options.processorOptions?.wasmBytes;
    if (!(bytes instanceof ArrayBuffer)) throw new Error('Sample WASM bytes missing');
    this.instance = new WebAssembly.Instance(new WebAssembly.Module(bytes), {
      env: { abort: () => { throw new Error('Sample DSP aborted'); } },
    });
    this.exports = this.instance.exports;
    this.memory = this.exports.memory;
    this.handle = this.call('su_sample_create');
    this.call('su_sample_set_sample_rate', this.handle, sampleRate);
    this.leftPtr = this.call('su_sample_out_l', this.handle);
    this.rightPtr = this.call('su_sample_out_r', this.handle);
    this.params = {
      start: 0,
      end: 1,
      loop: false,
      reverse: false,
      level: 1,
      frequency: 130.8127826502993,
      rootFrequency: 130.8127826502993,
    };
    this.progressCounter = 0;
    this.port.onmessage = (event) => this.onMessage(event.data);
  }

  call(name, ...args) {
    const fn = this.exports[name] ?? this.exports[`_${name}`];
    if (typeof fn !== 'function') throw new Error(`Sample export missing: ${name}`);
    return fn(...args);
  }

  onMessage(message) {
    if (!message) return;
    if (message.type === 'sample') {
      this.loadSample(message);
      return;
    }
    if (message.type === 'params') {
      Object.assign(this.params, message);
      this.applyParams();
      return;
    }
    if (message.type === 'trigger') {
      this.call('su_sample_trigger', this.handle);
      return;
    }
    if (message.type === 'stop') this.call('su_sample_stop', this.handle);
  }

  applyParams() {
    this.call(
      'su_sample_set_params',
      this.handle,
      Number(this.params.start) || 0,
      Number(this.params.end) || 0,
      this.params.loop ? 1 : 0,
      this.params.reverse ? 1 : 0,
      Number(this.params.level) || 0,
      Number(this.params.frequency) || 130.8127826502993,
      Number(this.params.rootFrequency) || 130.8127826502993,
    );
  }

  loadSample(message) {
    const channels = Array.isArray(message.channels) ? message.channels : [];
    if (channels.length === 0) return;
    const left = channels[0] instanceof Float32Array ? channels[0] : new Float32Array(channels[0]);
    const right = channels[1] instanceof Float32Array ? channels[1] : left;
    const frames = Math.min(left.length, right.length);
    const malloc = this.exports.malloc ?? this.exports._malloc;
    const free = this.exports.free ?? this.exports._free;
    if (typeof malloc !== 'function' || typeof free !== 'function') throw new Error('Sample DSP allocator exports missing');
    const bytes = frames * 4;
    const leftPtr = malloc(bytes);
    const rightPtr = malloc(bytes);
    new Float32Array(this.memory.buffer, leftPtr, frames).set(left.subarray(0, frames));
    new Float32Array(this.memory.buffer, rightPtr, frames).set(right.subarray(0, frames));
    const ok = this.call(
      'su_sample_load',
      this.handle,
      leftPtr,
      rightPtr,
      frames,
      Number(message.sampleRate) || sampleRate,
    );
    free(leftPtr);
    free(rightPtr);
    if (!ok) throw new Error('Sample DSP failed to load PCM');
    this.applyParams();
    this.port.postMessage({ type: 'sample-ready', alias: String(message.alias || ''), frames });
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const frames = out?.[0]?.length ?? 128;
    this.call('su_sample_process', this.handle, frames);
    const memory = new Float32Array(this.memory.buffer);
    if (out?.[0]) out[0].set(memory.subarray(this.leftPtr >>> 2, (this.leftPtr >>> 2) + frames));
    if (out?.[1]) out[1].set(memory.subarray(this.rightPtr >>> 2, (this.rightPtr >>> 2) + frames));
    this.progressCounter += frames;
    if (this.progressCounter >= sampleRate / 30) {
      this.progressCounter = 0;
      this.port.postMessage({
        type: 'progress',
        position: this.call('su_sample_position', this.handle),
        active: Boolean(this.call('su_sample_active', this.handle)),
      });
    }
    return true;
  }
}

registerProcessor('sonus-sample', SonusSampleProcessor);
