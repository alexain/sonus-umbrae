export interface LanguageSampleSliceItem {
  index: number;
  reverse: boolean;
  weight: number;
}

export interface LanguageSampleSliceDefinition {
  voice: string;
  items: LanguageSampleSliceItem[];
  mode: 'forward' | 'reverse' | 'random' | 'walk' | 'pendulum';
  amount: number;
  unit: 'ms' | 'sec' | 'beat';
  chance: number;
  drift: boolean;
  loose: boolean;
  clockSource: string;
  line: number;
}

export function parseLanguageSampleSlicesDirective(line: string): { voice: string; count: number } | null {
  const match = line.match(/^__sampleslices\("([A-Za-z_]\w*)",(\d+)\)$/);
  if (!match) return null;
  return { voice: match[1], count: Number(match[2]) };
}

export function parseLanguageSampleSliceDirective(line: string): LanguageSampleSliceDefinition | null {
  const match = line.match(/^__sampleslicedef\("([A-Za-z_]\w*)","((?:[^"\\]|\\.)*)","(forward|reverse|random|walk|pendulum)",(\d+(?:\.\d+)?),"(ms|sec|beat)",(\d+(?:\.\d+)?),(true|false),(true|false),"([^"]+)",(\d+)\)$/);
  if (!match) return null;
  let raw: string;
  try { raw = JSON.parse(`"${match[2]}"`) as string; } catch { return null; }
  let items: LanguageSampleSliceItem[];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    items = parsed.map((item) => {
      if (!item || typeof item !== 'object') throw new Error('invalid slice item');
      const value = item as { index?: unknown; reverse?: unknown; weight?: unknown };
      if (!Number.isInteger(value.index) || typeof value.reverse !== 'boolean' || !Number.isFinite(value.weight)) {
        throw new Error('invalid slice item');
      }
      return { index: Number(value.index), reverse: value.reverse, weight: Number(value.weight) };
    });
  } catch { return null; }
  return {
    voice: match[1],
    items,
    mode: match[3] as LanguageSampleSliceDefinition['mode'],
    amount: Number(match[4]),
    unit: match[5] as LanguageSampleSliceDefinition['unit'],
    chance: Number(match[6]),
    drift: match[7] === 'true',
    loose: match[8] === 'true',
    clockSource: match[9],
    line: Number(match[10]),
  };
}
