import { isValidIdentifier } from '../language/identifier';

export type SnippetExpansion = {
  text: string;
  label: string;
};

type VoiceTemplate = {
  sound: string;
  parameters?: readonly string[];
};

type FxTemplate = {
  model: string;
  parameters?: readonly string[];
};

const VOICE_TEMPLATES: Record<string, VoiceTemplate> = {
  sine: { sound: 'sine' },
  triangle: { sound: 'triangle' },
  saw: { sound: 'sawtooth' },
  sawtooth: { sound: 'sawtooth' },
  ramp: { sound: 'ramp' },
  square: { sound: 'square', parameters: ['width 50'] },

  'macro.analog': { sound: 'macro.analog', parameters: ['harmo 50', 'timbre 50', 'morph 50'] },
  'macro.waves': { sound: 'macro.waves', parameters: ['harmo 50', 'timbre 50', 'morph 50'] },
  'macro.fm': { sound: 'macro.fm', parameters: ['harmo 50', 'timbre 50', 'morph 50'] },
  'macro.grain': { sound: 'macro.grain', parameters: ['harmo 50', 'timbre 50', 'morph 50'] },
  'macro.additive': { sound: 'macro.additive', parameters: ['harmo 50', 'timbre 50', 'morph 50'] },
  'macro.wavetable': { sound: 'macro.wavetable', parameters: ['harmo 50', 'timbre 50', 'morph 50'] },
  'macro.chord': { sound: 'macro.chord', parameters: ['harmo 50', 'timbre 50', 'morph 50'] },
  'macro.speech': { sound: 'macro.speech', parameters: ['harmo 50', 'timbre 50', 'morph 50'] },
  'macro.swarm': { sound: 'macro.swarm', parameters: ['harmo 50', 'timbre 50', 'morph 50'] },
  'macro.noise': { sound: 'macro.noise', parameters: ['harmo 50', 'timbre 50', 'morph 50'] },
  'macro.particle': { sound: 'macro.particle', parameters: ['harmo 50', 'timbre 50', 'morph 50'] },
  'macro.string': { sound: 'macro.string', parameters: ['harmo 50', 'timbre 50', 'morph 50'] },
  'macro.analog-vcf': { sound: 'macro.analog-vcf', parameters: ['harmo 50', 'timbre 50', 'morph 50'] },
  'macro.phase': { sound: 'macro.phase', parameters: ['harmo 50', 'timbre 50', 'morph 50'] },
  'macro.terrain': { sound: 'macro.terrain', parameters: ['harmo 50', 'timbre 50', 'morph 50'] },
  'macro.strings': { sound: 'macro.strings', parameters: ['harmo 50', 'timbre 50', 'morph 50'] },
  'macro.chiptune': { sound: 'macro.chiptune', parameters: ['harmo 50', 'timbre 50', 'morph 50'] },

  'resonator.modal': { sound: 'resonator.modal', parameters: ['structure 50', 'brightness 50', 'damping 50', 'position 50'] },
  'resonator.sympathetic': { sound: 'resonator.sympathetic', parameters: ['structure 50', 'brightness 50', 'damping 50', 'position 50'] },
  'resonator.strings': { sound: 'resonator.strings', parameters: ['structure 50', 'brightness 50', 'damping 50', 'position 50'] },
  'resonator.string': { sound: 'resonator.string', parameters: ['structure 50', 'brightness 50', 'damping 50', 'position 50'] },

  'noise.white': { sound: 'noise.white' },
  'noise.dust': { sound: 'noise.dust' },
  'noise.clocked': { sound: 'noise.clocked' },
  'noise.fractal': { sound: 'noise.fractal' },

  matter: { sound: 'matter', parameters: ['geometry 50', 'brightness 50', 'damping 50', 'position 50', 'space 50'] },
};

const FX_TEMPLATES: Record<string, FxTemplate> = {
  mist: { model: 'mist.reverb', parameters: ['position 50', 'size 50', 'pitch 0', 'density 50', 'texture 50', 'mix 100', 'spread 50', 'feedback 0', 'reverb 0'] },
  'mist.grain': { model: 'mist.grain', parameters: ['position 50', 'size 50', 'pitch 0', 'density 50', 'texture 50', 'mix 100', 'spread 50', 'feedback 0', 'reverb 0'] },
  'mist.stretch': { model: 'mist.stretch', parameters: ['position 50', 'size 50', 'pitch 0', 'density 50', 'texture 50', 'mix 100', 'spread 50', 'feedback 0', 'reverb 0'] },
  'mist.delay': { model: 'mist.delay', parameters: ['position 50', 'size 50', 'pitch 0', 'density 50', 'texture 50', 'mix 100', 'spread 50', 'feedback 0', 'reverb 0'] },
  'mist.spectral': { model: 'mist.spectral', parameters: ['position 50', 'size 50', 'pitch 0', 'density 50', 'texture 50', 'mix 100', 'spread 50', 'feedback 0', 'reverb 0'] },
  'mist.reverb': { model: 'mist.reverb', parameters: ['position 50', 'size 50', 'pitch 0', 'density 50', 'texture 50', 'mix 100', 'spread 50', 'feedback 0', 'reverb 0'] },
  'mist.resonator': { model: 'mist.resonator', parameters: ['position 50', 'size 50', 'pitch 0', 'density 50', 'texture 50', 'mix 100', 'spread 50', 'feedback 0', 'reverb 0'] },
  'mist.repeat': { model: 'mist.repeat', parameters: ['position 50', 'size 50', 'pitch 0', 'density 50', 'texture 50', 'mix 100', 'spread 50', 'feedback 0', 'reverb 0'] },
  'mist.smear': { model: 'mist.smear', parameters: ['position 50', 'size 50', 'pitch 0', 'density 50', 'texture 50', 'mix 100', 'spread 50', 'feedback 0', 'reverb 0'] },
  sky: { model: 'sky', parameters: ['position 50', 'size 50', 'density 50', 'texture 50', 'mix 100', 'spread 50', 'feedback 0', 'reverb 0'] },
  delay: { model: 'delay', parameters: ['mix 50', 'spread 50', 'feedback 35', 'lines 1', 'reverse 0', 'pitch 0', 'tape 0', 'diffusion 0', 'pingpong 0'] },
};

const ENVELOPE_SHAPES: Record<string, readonly string[]> = {
  ad: ['ATTACK 5 ms', 'DECAY 180 ms'],
  ar: ['ATTACK 5 ms', 'RELEASE 180 ms'],
  adr: ['ATTACK 5 ms', 'DECAY 120 ms', 'RELEASE 180 ms'],
  adsr: ['ATTACK 5 ms', 'DECAY 120 ms', 'SUSTAIN 70', 'RELEASE 180 ms'],
  adhsr: ['ATTACK 5 ms', 'DECAY 120 ms', 'HOLD 100 ms', 'SUSTAIN 70', 'RELEASE 300 ms'],
};

function indentLines(lines: readonly string[], indentation: string): string {
  return lines.map((line) => `${indentation}${line}`).join('\n');
}

function splitFullSuffix(raw: string): { key: string; full: boolean } {
  const normalized = raw.toLowerCase();
  if (normalized.endsWith('.full')) return { key: normalized.slice(0, -5), full: true };
  return { key: normalized, full: false };
}

function expandVoice(name: string, rawTemplate: string): SnippetExpansion | null {
  const sampleMatch = rawTemplate.match(/^sample\.(.+?)(\.full)?$/i);
  if (sampleMatch) {
    const alias = sampleMatch[1];
    const full = Boolean(sampleMatch[2]);
    if (!alias || /\s/.test(alias)) return null;
    const body = [
      `VOICE ${name}:`,
      `    sound sample.${alias}${full ? ' with root C3' : ''}`,
      '    pitch notes [C3]',
    ];
    if (full) body.push('    region 0 100');
    return { text: body.join('\n'), label: `VOICE sample.${alias}${full ? '.full' : ''}` };
  }

  const { key, full } = splitFullSuffix(rawTemplate);
  const template = VOICE_TEMPLATES[key];
  if (!template) return null;
  const body = [`VOICE ${name}:`, `    sound ${template.sound}`, '    pitch notes [C3]'];
  if (full) body.push(...(template.parameters ?? []).map((line) => `    ${line}`));
  return { text: body.join('\n'), label: `VOICE ${key}${full ? '.full' : ''}` };
}

function expandFx(name: string, rawTemplate: string): SnippetExpansion | null {
  const { key, full } = splitFullSuffix(rawTemplate);
  const template = FX_TEMPLATES[key];
  if (!template) return null;
  const body = [`FX ${name}:`, `    model ${template.model}`];
  if (full) body.push(...(template.parameters ?? []).map((line) => `    ${line}`));
  return { text: body.join('\n'), label: `FX ${key}${full ? '.full' : ''}` };
}

function expandEnvelope(name: string, rawShape: string): SnippetExpansion | null {
  const shape = rawShape.toLowerCase().replace(/^\./, '');
  const stages = ENVELOPE_SHAPES[shape];
  if (!stages) return null;
  return {
    text: [`SET ${name}: ENVELOPE [`, indentLines(stages, '    '), ']'].join('\n'),
    label: `ENVELOPE ${shape.toUpperCase()}`,
  };
}

function expandSeq(name: string, modelRaw: string): SnippetExpansion | null {
  const model = modelRaw.toLowerCase();
  if (model === 'turing') {
    return {
      text: [
        `SEQ ${name}:`,
        '    model turing',
        '    length 8',
        '    change 12',
        '    pitch scale C minor with range C2 C4',
        '    every 1 beat',
      ].join('\n'),
      label: 'SEQ TURING',
    };
  }
  if (model === 'constellation') {
    return {
      text: [
        `SEQ ${name}:`,
        '    model constellation',
        '    pitch notes [C3 D3 E3 G3 A3]',
        '    stepwise 70',
        '    leap 20',
        '    repeat 10',
        '    memory 35',
        '    phrase 8',
        '    mutation 15',
      ].join('\n'),
      label: 'SEQ CONSTELLATION',
    };
  }
  if (model === 'snake') {
    return {
      text: [
        `SEQ ${name}:`,
        '    model snake',
        '    size 4x4',
        '    pitch scale C minor with range C3 C5',
        '    movement snake',
      ].join('\n'),
      label: 'SEQ SNAKE',
    };
  }
  if (model === 'life') {
    return {
      text: [
        `SEQ ${name}:`,
        '    model life',
        '    size 16',
        '    density 34',
        '    pitch scale C minor with range C2 C5',
        '    evolve every 8 beat',
      ].join('\n'),
      label: 'SEQ LIFE',
    };
  }
  return null;
}

function expandDrumkit(name: string): SnippetExpansion {
  return {
    text: [
      `DRUMKIT ${name}:`,
      '    kit sonus606',
    ].join('\n'),
    label: 'DRUMKIT SONUS606',
  };
}

function expandMod(name: string, rawModel: string): SnippetExpansion | null {
  const model = rawModel.toLowerCase();
  if (model === 'lfo') {
    return {
      text: [
        `MOD ${name}:`,
        '    model lfo',
        '    rate 0.1 hz',
      ].join('\n'),
      label: 'MOD LFO',
    };
  }
  if (model === 'noise' || model === 'noise.white' || model === 'noise.dust' || model === 'noise.clocked' || model === 'noise.fractal') {
    const noiseModel = model === 'noise' ? 'noise.white' : model;
    return {
      text: [
        `MOD ${name}:`,
        `    model ${noiseModel}`,
      ].join('\n'),
      label: `MOD ${noiseModel.toUpperCase()}`,
    };
  }
  if (model === 'swell') {
    return {
      text: [
        `MOD ${name}:`,
        '    model swell',
        '    rate 0.25 hz',
        '    shape sine',
        '    relation phase',
        '    range control',
      ].join('\n'),
      label: 'MOD SWELL',
    };
  }
  if (model === 'dices') {
    return {
      text: [
        `MOD ${name}:`,
        '    model dices',
        '    rate 1 beat',
        '    spread 50',
        '    bias 50',
        '    steps 50',
        '    deja 0',
        '    length 8',
        '    diversity 50',
      ].join('\n'),
      label: 'MOD DICES',
    };
  }
  if (model === 'composite') {
    return {
      text: [
        `MOD ${name}:`,
        '    model composite',
      ].join('\n'),
      label: 'MOD COMPOSITE',
    };
  }
  return null;
}

function expandClock(parts: readonly string[]): SnippetExpansion | null {
  if (parts.length === 2 && /^\d+(?:\.\d+)?$/.test(parts[1])) {
    const bpm = Number(parts[1]);
    if (!Number.isFinite(bpm) || bpm <= 0) return null;
    return { text: `CLOCK set ${parts[1]} bpm`, label: `CLOCK ${parts[1]} BPM` };
  }
  if (parts.length === 3 && isValidIdentifier(parts[1])) {
    const rate = parts[2];
    const match = rate.match(/^([/*])\s*(\d+(?:\.\d+)?)$/);
    if (!match) return null;
    const amount = Number(match[2]);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return { text: `CLOCK ${parts[1]} RATE ${match[1]}${match[2]}`, label: `CLOCK ${parts[1]} ${match[1]}${match[2]}` };
  }
  return null;
}

export function expandEditorSnippet(raw: string): SnippetExpansion | null {
  const command = raw.trim();
  if (!command.startsWith('@')) return null;

  const parts = command.slice(1).trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const kind = parts[0].toLowerCase();
  if (kind === 'c' || kind === 'clock') return expandClock(parts);
  if (!isValidIdentifier(parts[1])) return null;

  if ((kind === 'v' || kind === 'voice') && parts.length === 3) return expandVoice(parts[1], parts[2]);
  if (kind === 'env' && parts.length === 2) return expandEnvelope(parts[1], 'adsr');
  if (kind === 'env' && parts.length === 3) return expandEnvelope(parts[1], parts[2]);
  if (kind === 'fx' && parts.length === 3) return expandFx(parts[1], parts[2]);
  if (kind === 'seq' && parts.length === 3) return expandSeq(parts[1], parts[2]);
  if (kind === 'mod' && parts.length === 3) return expandMod(parts[1], parts[2]);
  if ((kind === 'd' || kind === 'drum' || kind === 'drumkit') && parts.length === 2) return expandDrumkit(parts[1]);

  return null;
}
