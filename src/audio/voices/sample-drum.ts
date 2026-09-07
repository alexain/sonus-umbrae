import type { AudioProgram } from '../engine';

const DRUMKIT_OUTPUT_TRIM = 6.0;

export interface DrumkitVoice {
  node: AudioWorkletNode;
  outputSplitter: ChannelSplitterNode;
  outputL: GainNode;
  outputR: GainNode;
  loadedSamples: Set<string>;
}

export interface DrumSample {
  alias: string;
  sampleRate: number;
  channels: readonly Float32Array[];
}

export interface SampleVoiceRuntime {
  node: AudioWorkletNode;
  outputSplitter: ChannelSplitterNode;
  outputL: GainNode;
  outputR: GainNode;
  alias: string;
  level: number;
  frequency: number;
  rootFrequency: number;
  start: number;
  end: number;
  loop: boolean;
  reverse: boolean;
  slices: number;
  activeSlice: number;
  sliceReverse: boolean;
  progress: number;
  active: boolean;
}

export type DrumVoiceName = 'kick' | 'snare' | 'clap' | 'hihat' | 'openhat' | 'lowtom' | 'hightom';

export interface DrumTriggerParams {
  level: number;
  pan: number;
  tune: number;
  decay: number;
  transient: number;
  snappy: number;
  color: number;
  noise: number;
}

export interface DrumSampleTriggerParams {
  level: number;
  pan: number;
  tune: number;
  decay: number;
}

export class SampleDrumRuntime {
  readonly drumkits = new Map<string, DrumkitVoice>();
  readonly drumSamples = new Map<string, DrumSample>();
  readonly samples = new Map<string, SampleVoiceRuntime>();

  createDrumkit(context: AudioContext, wasmBytes: ArrayBuffer, definition: AudioProgram['drumkits'][number]): void {
    if (this.drumkits.has(definition.name)) return;
    const node = new AudioWorkletNode(context, 'sonus-drumkit', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete',
      processorOptions: { wasmBytes: wasmBytes.slice(0) },
    });
    const outputSplitter = context.createChannelSplitter(2);
    const outputL = context.createGain();
    const outputR = context.createGain();
    outputL.gain.value = DRUMKIT_OUTPUT_TRIM;
    outputR.gain.value = DRUMKIT_OUTPUT_TRIM;
    node.connect(outputSplitter);
    outputSplitter.connect(outputL, 0, 0);
    outputSplitter.connect(outputR, 1, 0);
    this.drumkits.set(definition.name, { node, outputSplitter, outputL, outputR, loadedSamples: new Set() });
  }

  triggerDrumkit(name: string, voice: DrumVoiceName, params: DrumTriggerParams): void {
    const drumkit = this.drumkits.get(name);
    if (!drumkit) throw new Error(`unknown DRUMKIT object: ${name}`);
    drumkit.node.port.postMessage({
      type: 'trigger',
      voice,
      level: Math.max(0, Math.min(1, params.level / 100)),
      pan: Math.max(-1, Math.min(1, params.pan / 100)),
      tune: params.tune,
      decay: Math.max(0, Math.min(1, params.decay / 100)),
      transient: Math.max(0, Math.min(1, params.transient / 100)),
      snappy: Math.max(0, Math.min(1, params.snappy / 100)),
      color: 2 ** ((params.color - 50) / 25),
      noise: Math.max(0, Math.min(1, params.noise / 100)),
    });
  }

  hasDrumSample(alias: string): boolean {
    return this.drumSamples.has(alias);
  }

  registerDrumSample(sample: DrumSample): void {
    this.drumSamples.set(sample.alias, {
      alias: sample.alias,
      sampleRate: sample.sampleRate,
      channels: sample.channels,
    });
  }

  unregisterDrumSample(alias: string): void {
    if (!this.drumSamples.delete(alias)) return;
    for (const drumkit of this.drumkits.values()) {
      if (!drumkit.loadedSamples.delete(alias)) continue;
      drumkit.node.port.postMessage({ type: 'remove-sample', alias });
    }
  }

  prepareDrumkitSample(name: string, alias: string): void {
    const drumkit = this.drumkits.get(name);
    if (!drumkit) throw new Error(`unknown DRUMKIT object: ${name}`);
    const sample = this.drumSamples.get(alias);
    if (!sample) throw new Error(`unknown audio sample: ${alias}`);
    if (drumkit.loadedSamples.has(alias)) return;
    this.sendSamplePcm(drumkit.node, sample);
    drumkit.loadedSamples.add(alias);
  }

  triggerDrumkitSample(name: string, alias: string, params: DrumSampleTriggerParams): void {
    const drumkit = this.drumkits.get(name);
    if (!drumkit) throw new Error(`unknown DRUMKIT object: ${name}`);
    this.prepareDrumkitSample(name, alias);
    drumkit.node.port.postMessage({
      type: 'trigger-sample',
      alias,
      level: Math.max(0, Math.min(1, params.level / 100)),
      pan: Math.max(-1, Math.min(1, params.pan / 100)),
      tune: params.tune,
      decay: Math.max(0, Math.min(1, params.decay / 100)),
    });
  }

  createSampleVoice(context: AudioContext, wasmBytes: ArrayBuffer, definition: AudioProgram['samples'][number]): void {
    if (this.samples.has(definition.name)) return;
    const sample = this.drumSamples.get(definition.alias);
    if (!sample) throw new Error(`unknown audio sample: ${definition.alias}`);
    const node = new AudioWorkletNode(context, 'sonus-sample', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete',
      processorOptions: { wasmBytes: wasmBytes.slice(0) },
    });
    const outputSplitter = context.createChannelSplitter(2);
    const outputL = context.createGain();
    const outputR = context.createGain();
    node.connect(outputSplitter);
    outputSplitter.connect(outputL, 0);
    outputSplitter.connect(outputR, 1);
    const runtime: SampleVoiceRuntime = {
      node,
      outputSplitter,
      outputL,
      outputR,
      alias: definition.alias,
      level: definition.level,
      frequency: definition.frequency,
      rootFrequency: definition.rootFrequency,
      start: definition.start,
      end: definition.end,
      loop: definition.loop,
      reverse: definition.reverse,
      slices: definition.slices,
      activeSlice: 0,
      sliceReverse: false,
      progress: definition.start / 100,
      active: false,
    };
    node.port.onmessage = (event) => {
      const message = event.data;
      if (message?.type === 'progress') {
        runtime.progress = Number(message.position) || 0;
        runtime.active = Boolean(message.active);
      }
    };
    this.samples.set(definition.name, runtime);
    this.sendSamplePcm(node, sample);
  }

  updateSampleVoice(definition: AudioProgram['samples'][number]): void {
    const voice = this.samples.get(definition.name);
    if (!voice) return;
    if (voice.alias !== definition.alias) {
      const sample = this.drumSamples.get(definition.alias);
      if (!sample) throw new Error(`unknown audio sample: ${definition.alias}`);
      voice.alias = definition.alias;
      this.sendSamplePcm(voice.node, sample);
    }
    voice.level = definition.level;
    voice.frequency = definition.frequency;
    voice.rootFrequency = definition.rootFrequency;
    voice.start = definition.start;
    voice.end = definition.end;
    voice.loop = definition.loop;
    voice.reverse = definition.reverse;
    voice.slices = definition.slices;
    voice.activeSlice = 0;
    voice.sliceReverse = false;
    voice.outputL.gain.value = definition.enabled ? 1 : 0;
    voice.outputR.gain.value = definition.enabled ? 1 : 0;

    let playbackStart = definition.start;
    let playbackEnd = definition.end;
    let playbackReverse = definition.reverse;
    if (definition.slices > 0 && definition.initialSlice > 0) {
      const span = (definition.end - definition.start) / definition.slices;
      playbackStart = definition.start + span * (definition.initialSlice - 1);
      playbackEnd = definition.start + span * definition.initialSlice;
      playbackReverse = definition.initialSliceReverse;
      voice.activeSlice = definition.initialSlice;
      voice.sliceReverse = definition.initialSliceReverse;
    }
    voice.node.port.postMessage({
      type: 'params',
      start: playbackStart / 100,
      end: playbackEnd / 100,
      loop: definition.slices > 0 ? false : definition.loop,
      reverse: playbackReverse,
      level: definition.level / 100,
      frequency: definition.frequency,
      rootFrequency: definition.rootFrequency,
    });
  }

  getSampleVoiceProgress(name: string): { position: number; active: boolean; slices: number; activeSlice: number; sliceReverse: boolean } | null {
    const voice = this.samples.get(name);
    return voice
      ? { position: voice.progress, active: voice.active, slices: voice.slices, activeSlice: voice.activeSlice, sliceReverse: voice.sliceReverse }
      : null;
  }

  setSampleSlice(name: string, index: number, count: number, regionStart: number, regionEnd: number, reverse: boolean): void {
    const voice = this.samples.get(name);
    if (!voice || count < 1 || index < 1 || index > count) return;
    const start = Math.max(0, Math.min(100, regionStart));
    const end = Math.max(start, Math.min(100, regionEnd));
    const span = (end - start) / count;
    const sliceStart = start + span * (index - 1);
    const sliceEnd = start + span * index;
    voice.slices = count;
    voice.activeSlice = index;
    voice.sliceReverse = reverse;
    voice.node.port.postMessage({ type: 'params', start: sliceStart / 100, end: sliceEnd / 100, loop: false, reverse });
  }

  triggerSampleSlice(name: string, index: number, count: number, regionStart: number, regionEnd: number, reverse: boolean): void {
    this.setSampleSlice(name, index, count, regionStart, regionEnd, reverse);
    this.samples.get(name)?.node.port.postMessage({ type: 'trigger' });
  }

  stopSamples(): void {
    for (const sample of this.samples.values()) {
      sample.node.port.postMessage({ type: 'stop' });
      sample.active = false;
    }
  }

  removeDrumkit(name: string): void {
    const drumkit = this.drumkits.get(name);
    if (!drumkit) return;
    for (const node of [drumkit.outputSplitter, drumkit.outputL, drumkit.outputR]) {
      try { node.disconnect(); } catch {}
    }
    try { drumkit.node.disconnect(); } catch {}
    drumkit.node.port.close();
    this.drumkits.delete(name);
  }

  removeSampleVoice(name: string): SampleVoiceRuntime | null {
    const voice = this.samples.get(name);
    if (!voice) return null;
    for (const node of [voice.outputSplitter, voice.outputL, voice.outputR]) {
      try { node.disconnect(); } catch {}
    }
    try { voice.node.disconnect(); } catch {}
    voice.node.port.close();
    this.samples.delete(name);
    return voice;
  }

  private sendSamplePcm(node: AudioWorkletNode, sample: DrumSample): void {
    const channels = sample.channels.map((channel) => channel.slice());
    node.port.postMessage({
      type: 'sample',
      alias: sample.alias,
      sampleRate: sample.sampleRate,
      channels,
    }, channels.map((channel) => channel.buffer));
  }
}
