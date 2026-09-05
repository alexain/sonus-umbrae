export type ParameterUpdatePolicy = 'continuous' | 'commit';

export type ParameterTargetKind = 'voice' | 'fx' | 'filter' | 'mod' | 'register' | 'seq';

type ParameterPolicyTable = Readonly<Record<string, ParameterUpdatePolicy>>;

const DEFAULT_POLICY: ParameterUpdatePolicy = 'continuous';

/**
 * Runtime/UI update semantics for mutable parameters.
 *
 * `continuous`: the DSP/runtime receives intermediate values while a LIVE
 * slider is dragged.
 *
 * `commit`: the editor/readout may preview intermediate values, but the
 * runtime receives the new value only when the edit is committed (for a
 * slider: pointer/key release -> change).
 *
 * Keep this table as the single policy source for editor controls and future
 * external control surfaces.
 */
const PARAMETER_UPDATE_POLICIES: Readonly<
  Partial<Record<ParameterTargetKind, ParameterPolicyTable>>
> = {
  voice: {
    level: 'continuous',
    harmo: 'continuous',
    harmonics: 'continuous',
    timbre: 'continuous',
    morph: 'continuous',
    geometry: 'continuous',
    structure: 'continuous',
    brightness: 'continuous',
    damping: 'continuous',
    position: 'continuous',
    space: 'continuous',
    bow: 'continuous',
    blow: 'continuous',
    strike: 'continuous',

    // Structural/discrete voice settings are intentionally committed.
    poly: 'commit',
    polyphony: 'commit',
    model: 'commit',
    mode: 'commit',
  },

  fx: {
    position: 'continuous',
    predelay: 'continuous',
    size: 'continuous',
    density: 'continuous',
    bloom: 'continuous',
    diffuse: 'continuous',
    texture: 'continuous',
    damp: 'continuous',
    damping: 'continuous',
    mix: 'continuous',
    spread: 'continuous',
    width: 'continuous',
    feedback: 'continuous',
    decay: 'continuous',
    reverb: 'continuous',
    motion: 'continuous',

    // Capture/structural controls for current and future effects.
    reverse: 'commit',
    pitch: 'commit',
    lines: 'commit',
    model: 'commit',
    mode: 'commit',
  },

  filter: {
    cutoff: 'continuous',
    resonance: 'continuous',
    drive: 'continuous',
    model: 'commit',
    mode: 'commit',
  },

  mod: {
    // Dices has no dedicated AudioEngine realtime setter yet. Commit on
    // release still gives LIVE its editor slider and hot-reloads atomically.
    rate: 'commit',
    spread: 'commit',
    bias: 'commit',
    steps: 'commit',
    deja: 'commit',
    length: 'commit',
    diversity: 'commit',
    model: 'commit',
  },

  register: {
    size: 'commit',
    model: 'commit',
  },

  seq: {
    size: 'commit',
    length: 'commit',
    model: 'commit',
  },
};

export function parameterUpdatePolicy(
  targetKind: ParameterTargetKind,
  property: string,
): ParameterUpdatePolicy {
  return PARAMETER_UPDATE_POLICIES[targetKind]?.[property.toLowerCase()] ?? DEFAULT_POLICY;
}

export function isContinuousParameter(
  targetKind: ParameterTargetKind,
  property: string,
): boolean {
  return parameterUpdatePolicy(targetKind, property) === 'continuous';
}
