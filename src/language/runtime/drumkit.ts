import { parseRuntimePatternSource } from './scheduler';

export type LanguageDrumVoiceId = 'kick' | 'snare' | 'clap' | 'hihat' | 'openhat' | 'lowtom' | 'hightom';

export interface LanguageDrumSlotDefinition {
  drumkit: string;
  alias: string;
  voice: LanguageDrumVoiceId | 'sample';
  sampleAlias: string | null;
  params: {
    level: number;
    pan: number;
    tune: number;
    decay: number;
    transient: number;
    snappy: number;
    color: number;
    noise: number;
    humanize: number;
  };
  amount: number;
  unit: 'ms' | 'sec' | 'beat';
  chance: number;
  drift: boolean;
  loose: boolean;
  clockSource: string;
  euclidean: { hits: number; steps: number; rotate: number } | null;
}

export function parseLanguageDrumkitDirective(line: string): { name: string; disabled: boolean; viewSteps: number } | null {
  const match = line.match(/^__drumkit\("([A-Za-z_]\w*)",(true|false),(\d+)\)$/);
  return match ? { name: match[1], disabled: match[2] === 'true', viewSteps: Number(match[3]) } : null;
}

export function parseLanguageDrumkitMetaDirective(line: string): { name: string; kit: string } | null {
  const match = line.match(/^__drumkitmeta\("([A-Za-z_]\w*)","([A-Za-z_]\w*)"\)$/);
  return match ? { name: match[1], kit: match[2] } : null;
}

export function parseLanguageDrumSlotDirective(line: string): LanguageDrumSlotDefinition | null {
  const match = line.match(/^__drumslot\("([A-Za-z_]\w*)","([A-Za-z_]\w*)","(kick|snare|clap|hihat|openhat|lowtom|hightom)","((?:[^"\\]|\\.)*)",(\d+(?:\.\d+)?),"(ms|sec|beat)",(\d+(?:\.\d+)?),(true|false),(true|false),"([^"]+)",(\d+),(\d+),(\d+)\)$/);
  if (!match) return null;
  let encoded = '';
  try { encoded = JSON.parse(`"${match[4]}"`) as string; } catch { return null; }
  let params: LanguageDrumSlotDefinition['params'];
  try { params = JSON.parse(encoded) as LanguageDrumSlotDefinition['params']; } catch { return null; }
  const hits = Number(match[11]);
  const steps = Number(match[12]);
  const rotate = Number(match[13]);
  return {
    drumkit: match[1],
    alias: match[2],
    voice: match[3] as LanguageDrumVoiceId,
    sampleAlias: null,
    params,
    amount: Number(match[5]),
    unit: match[6] as 'ms' | 'sec' | 'beat',
    chance: Number(match[7]),
    drift: match[8] === 'true',
    loose: match[9] === 'true',
    clockSource: match[10],
    euclidean: hits > 0 && steps > 0 ? { hits, steps, rotate } : null,
  };
}

export function parseLanguageDrumSampleSlotDirective(line: string): LanguageDrumSlotDefinition | null {
  const match = line.match(/^__drumsampleslot\("([A-Za-z_]\w*)","([A-Za-z_]\w*)","([A-Za-z_]\w*)","((?:[^"\\]|\\.)*)",(\d+(?:\.\d+)?),"(ms|sec|beat)",(\d+(?:\.\d+)?),(true|false),(true|false),"([^"]+)",(\d+),(\d+),(\d+)\)$/);
  if (!match) return null;
  let encoded = '';
  try { encoded = JSON.parse(`"${match[4]}"`) as string; } catch { return null; }
  let params: LanguageDrumSlotDefinition['params'];
  try { params = JSON.parse(encoded) as LanguageDrumSlotDefinition['params']; } catch { return null; }
  const hits = Number(match[11]);
  const steps = Number(match[12]);
  const rotate = Number(match[13]);
  return {
    drumkit: match[1],
    alias: match[2],
    voice: 'sample',
    sampleAlias: match[3],
    params,
    amount: Number(match[5]),
    unit: match[6] as 'ms' | 'sec' | 'beat',
    chance: Number(match[7]),
    drift: match[8] === 'true',
    loose: match[9] === 'true',
    clockSource: match[10],
    euclidean: hits > 0 && steps > 0 ? { hits, steps, rotate } : null,
  };
}

function buildEuclideanPattern(hits: number, steps: number, rotate: number): boolean[] {
  const pattern = Array.from({ length: steps }, () => false);
  if (hits <= 0 || steps <= 0) return pattern;
  for (let hit = 0; hit < hits; hit += 1) {
    const base = Math.floor(hit * steps / hits);
    const index = ((base + rotate) % steps + steps) % steps;
    pattern[index] = true;
  }
  return pattern;
}

export function drumViewLaneSteps(
  slot: LanguageDrumSlotDefinition,
  sourceClockRate: number,
  fallbackSteps: number,
): number {
  const pattern = parseRuntimePatternSource(slot.clockSource);
  if (pattern) return pattern.spec.steps;
  if (slot.unit !== 'beat') return Math.max(1, fallbackSteps);
  const rate = Number.isFinite(sourceClockRate) && sourceClockRate > 0 ? sourceClockRate : 1;
  return Math.max(1, Math.ceil(4 * rate - 1e-9));
}

export function drumViewPattern(
  slot: LanguageDrumSlotDefinition,
  laneSteps: number,
  masterBeatMs: number,
): boolean[] {
  const result = Array.from({ length: laneSteps }, () => false);
  if (slot.amount <= 0) return result;

  const pattern = parseRuntimePatternSource(slot.clockSource);
  if (pattern) {
    for (const event of pattern.spec.events) {
      const index = event.index - 1;
      if (index >= 0 && index < result.length) result[index] = true;
    }
    return result;
  }

  if (slot.unit !== 'beat') {
    const intervalMs = slot.unit === 'sec' ? slot.amount * 1000 : slot.amount;
    if (!Number.isFinite(masterBeatMs) || masterBeatMs <= 0 || intervalMs <= 0) return result;
    const intervalBeats = intervalMs / masterBeatMs;
    for (let beat = 0; beat < 4 - 1e-9; beat += intervalBeats) {
      const cell = Math.floor((beat / 4) * laneSteps);
      if (cell >= 0 && cell < laneSteps) result[cell] = true;
    }
    return result;
  }

  const euclidean = slot.euclidean;
  const euclideanPattern = euclidean ? buildEuclideanPattern(euclidean.hits, euclidean.steps, euclidean.rotate) : null;
  for (let tick = 0; tick < laneSteps; tick += 1) {
    const due = euclideanPattern
      ? euclideanPattern[tick % euclideanPattern.length]
      : tick % slot.amount === 0;
    if (due) result[tick] = true;
  }
  return result;
}
