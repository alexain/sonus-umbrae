import type {
  LanguageCompositeTuneDefinition,
  LanguageConstellationReaderDefinition,
  LanguageCycleDefinition,
  LanguageDelayParamCycleDefinition,
  LanguageDelayParameter,
  LanguageDelayParamDefaultDefinition,
  LanguageDelayTimeDefinition,
  LanguageEnvelopeDefinition,
  LanguageEnvelopeSpec,
  LanguageFilterSequenceDefinition,
  LanguageFxMetadata,
  LanguageFxModulationDefinition,
  LanguageFxParameter,
  LanguageFxParameterCycleDefinition,
  LanguageFxParameterDefaultDefinition,
  LanguageFxPitchSequenceDefinition,
  LanguageGenerativeCycleDefinition,
  LanguageGenerativeMode,
  LanguageGenerativeDefaultDefinition,
  LanguageInlinePianoDefinition,
  LanguageInlineScalarDefinition,
  LanguageLifeReaderDefinition,
  LanguageLogicInput,
  LanguageLogicNodeDefinition,
  LanguageLogicOperator,
  LanguageMasterClockDefinition,
  LanguageModMetadata,
  LanguageModSetDirective,
  LanguageObjectEveryDefinition,
  LanguageParameterCycleDefinition,
  LanguageParameterDefaultDefinition,
  LanguageRegisterVoiceDefinition,
  LanguageSequenceDefinition,
  LanguageSequenceFavorEntry,
  LanguageSetCycleDefinition,
  LanguageSnakeReaderDefinition,
  LanguageVcaDefinition,
  LifeReaderMode,
} from '../runtime';
import type { LifeVariant } from './seq/life';
import type { SnakeMovement } from './seq/snake';


export type LanguageControlParameterDefinition = {
  ownerKind: 'voice' | 'fx' | 'filter';
  owner: string;
  parameter: string;
  expression: string;
  min: number;
  max: number;
};

export function parseLanguageControlParameterDirective(line: string): LanguageControlParameterDefinition | null {
  const match = line.match(/^__controlparam\("(voice|fx|filter)","([A-Za-z_]\w*)","([A-Za-z_]\w*)","((?:[^"\\]|\\.)*)",(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)$/);
  if (!match) return null;
  let expression: string;
  try { expression = JSON.parse(`"${match[4]}"`) as string; } catch { return null; }
  return {
    ownerKind: match[1] as 'voice' | 'fx' | 'filter',
    owner: match[2],
    parameter: match[3],
    expression,
    min: Number(match[5]),
    max: Number(match[6]),
  };
}

export function parseLanguageLogicDirective(line: string): { name: string; view: boolean } | null {
  const match = line.match(/^__logic\("([A-Za-z_]\w*)",(true|false)\)$/);
  if (!match) return null;
  return { name: match[1], view: match[2] === 'true' };
}

export function parseLanguageLogicNodeDirective(line: string): LanguageLogicNodeDefinition | null {
  const match = line.match(/^__logicnode\("([A-Za-z_]\w*)","([A-Za-z_]\w*)","(and|or|xor|nand|nor|divider|counter|flipflop)","((?:[^"\\]|\\.)*)",(\d+)\)$/);
  if (!match) return null;
  try {
    const inputs = JSON.parse(JSON.parse(`"${match[4]}"`)) as LanguageLogicInput[];
    return { owner: match[1], name: match[2], operator: match[3] as LanguageLogicOperator, inputs, parameter: Number(match[5]) };
  } catch {
    return null;
  }
}

export function parseLanguageRegisterDeclaration(line: string): string | null {
  return line.match(/^__register\("([A-Za-z_]\w*)"\)$/)?.[1] ?? null;
}

export function parseLanguageRegisterModel(line: string): { name: string; model: 'shift' } | null {
  const match = line.match(/^__registermodel\("([A-Za-z_]\w*)","shift"\)$/);
  return match ? { name: match[1], model: 'shift' } : null;
}

export function parseLanguageRegisterSize(line: string): { name: string; size: number } | null {
  const match = line.match(/^__registersize\("([A-Za-z_]\w*)",(\d+)\)$/);
  return match ? { name: match[1], size: Number(match[2]) } : null;
}

export function parseLanguageRegisterSource(
  line: string,
): { name: string; source: string; mode: 'direct' | LifeReaderMode; amount: number } | null {
  const match = line.match(/^__registersource\("([A-Za-z_]\w*)","([A-Za-z_]\w*)","(direct|order|random|walk|reverse|pendulum|first|last)",(\d+(?:\.\d+)?)\)$/);
  return match ? {
    name: match[1],
    source: match[2],
    mode: match[3] as 'direct' | LifeReaderMode,
    amount: Number(match[4]),
  } : null;
}

export function parseLanguageRegisterWrite(line: string): { name: string; timing: LanguageCycleDefinition } | null {
  const match = line.match(/^__registerwrite\("([A-Za-z_]\w*)",(\d+(?:\.\d+)?),"(ms|sec|beat)",(\d+(?:\.\d+)?),(true|false),(true|false),"([A-Za-z_]\w*)"\)$/);
  if (!match) return null;
  return {
    name: match[1],
    timing: {
      amount: Number(match[2]),
      unit: match[3] as 'ms' | 'sec' | 'beat',
      chance: Number(match[4]),
      drift: match[5] === 'true',
      loose: match[6] === 'true',
      clockSource: match[7],
    },
  };
}

export function parseLanguageCompositePitch(line: string): { name: string } | null {
  const match = line.match(/^__compositepitch\("([A-Za-z_]\w*)"\)$/);
  return match ? { name: match[1] } : null;
}

export function parseLanguageCompositeTune(line: string): LanguageCompositeTuneDefinition | null {
  const match = line.match(/^__compositetune\("([A-Za-z_]\w*)","([A-Za-z_]\w*)","((?:[^"\\]|\\.)*)"\)$/);
  if (!match) return null;
  try {
    const payload = JSON.parse(JSON.parse(`"${match[3]}"`));
    if (payload?.mode === 'relative') {
      return {
        owner: match[1], node: match[2], mode: 'relative', octave: Number(payload.octave ?? 0), detune: Number(payload.detune ?? 0), ratio: Number(payload.ratio ?? 1),
        values: [], selectionMode: 'order', selectionAmount: 0, favor: [], timing: null,
      };
    }
    if (payload?.mode === 'absolute' && Array.isArray(payload.values) && payload.values.length > 0) {
      const timing = payload.timing ? {
        amount: Number(payload.timing.amount), unit: payload.timing.unit as 'ms'|'sec'|'beat', chance: Number(payload.timing.chance ?? 100),
        drift: Boolean(payload.timing.drift), loose: Boolean(payload.timing.loose), clockSource: String(payload.timing.clockSource ?? 'Clock'),
      } : null;
      return {
        owner: match[1], node: match[2], mode: 'absolute', octave: 0, detune: 0, ratio: 1,
        values: payload.values.map(Number), selectionMode: payload.selectionMode ?? 'order', selectionAmount: Number(payload.selectionAmount ?? 0), favor: Array.isArray(payload.favor) ? payload.favor : [], timing,
      };
    }
  } catch { return null; }
  return null;
}

export function parseLanguageCompositeEdge(line: string): { name: string; relation: 'fm'|'pm'|'am'|'ring'|'sync'; source: string; target: string; params: Record<string, number | boolean> } | null {
  const match = line.match(/^__compositeedge\("([A-Za-z_]\w*)","(fm|pm|am|ring|sync)","([A-Za-z_]\w*)","([A-Za-z_]\w*)","((?:[^"\\]|\\.)*)"\)$/);
  if (!match) return null;
  let params: Record<string, number | boolean> = {};
  try { params = JSON.parse(JSON.parse(`"${match[5]}"`)); } catch { return null; }
  return { name: match[1], relation: match[2] as 'fm'|'pm'|'am'|'ring'|'sync', source: match[3], target: match[4], params };
}

export function parseLanguageCompositeMix(line: string): { name: string; mix: string; inputs: Array<{ source: string; level: number; octave: number; detune: number }> } | null {
  const match = line.match(/^__compositemix\("([A-Za-z_]\w*)","([A-Za-z_]\w*)","((?:[^"\\]|\\.)*)"\)$/);
  if (!match) return null;
  try {
    const inputs = JSON.parse(JSON.parse(`"${match[3]}"`));
    if (!Array.isArray(inputs)) return null;
    return { name: match[1], mix: match[2], inputs };
  } catch { return null; }
}

export function parseLanguageCompositeOutput(line: string): { name: string; outputs: Array<{ name: string; level: number }> } | null {
  const match = line.match(/^__compositeoutput\("([A-Za-z_]\w*)","((?:[^"\\]|\\.)*)"\)$/);
  if (!match) return null;
  try {
    const outputs = JSON.parse(JSON.parse(`"${match[2]}"`));
    if (!Array.isArray(outputs)) return null;
    return { name: match[1], outputs };
  } catch { return null; }
}

export function parseLanguageRegisterPitch(line: string): LanguageRegisterVoiceDefinition | null {
  const match = line.match(/^__registerpitch\("([A-Za-z_]\w*)","([A-Za-z_]\w*)",(\d+)\)$/);
  return match ? { voice: match[1], register: match[2], stage: Number(match[3]) } : null;
}

export function parseLanguageTuringDeclaration(line: string): string | null {
  return line.match(/^__seq\("([A-Za-z_]\w*)"\)$/)?.[1] ?? null;
}
export function parseLanguageTuringView(line: string): string | null {
  return line.match(/^__seqview\("([A-Za-z_]\w*)"\)$/)?.[1] ?? null;
}

export function parseLanguageSeqModel(line: string): { name: string; model: 'turing' | 'life' | 'constellation' | 'snake'; variant: LifeVariant } | null {
  const match = line.match(/^__seqmodel\("([A-Za-z_]\w*)","(turing|life|constellation|snake)","(conway|highlife|seeds|day-night|morley)"\)$/);
  return match ? { name: match[1], model: match[2] as 'turing' | 'life' | 'constellation' | 'snake', variant: match[3] as LifeVariant } : null;
}
export function parseLanguageSnakeSize(line: string): { name: string; width: number; height: number } | null {
  const match = line.match(/^__snakesize\("([A-Za-z_]\w*)",(\d+),(\d+)\)$/);
  return match ? { name: match[1], width: Number(match[2]), height: Number(match[3]) } : null;
}
export function parseLanguageSnakeMovement(line: string): { name: string; movement: SnakeMovement } | null {
  const match = line.match(/^__snakemovement\("([A-Za-z_]\w*)","(snake|rows|columns|spiral|diagonal|bounce|random|walk)"\)$/);
  return match ? { name: match[1], movement: match[2] as SnakeMovement } : null;
}
export function parseLanguageSnakeMatrix(line: string): { name: string; explicit: boolean } | null {
  const match = line.match(/^__snakematrix\("([A-Za-z_]\w*)",(true|false)\)$/);
  return match ? { name: match[1], explicit: match[2] === 'true' } : null;
}
export function parseLanguageSnakeReader(line: string): LanguageSnakeReaderDefinition | null {
  const match = line.match(/^__snakereader\("([A-Za-z_]\w*)","([A-Za-z_]\w*)"\)$/);
  return match ? { voice: match[1], seq: match[2] } : null;
}
export function parseLanguageSeqSize(line: string): { name: string; size: 8 | 16 } | null {
  const match = line.match(/^__seqsize\("([A-Za-z_]\w*)",(8|16)\)$/);
  return match ? { name: match[1], size: Number(match[2]) as 8 | 16 } : null;
}
export function parseLanguageLifeDensity(line: string): { name: string; density: number; maxDensity: number | null; respawn: boolean } | null {
  const match = line.match(/^__lifedensity\("([A-Za-z_]\w*)",(\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(true|false)\)$/);
  if (!match) return null;
  const maxDensity = Number(match[3]);
  return { name: match[1], density: Number(match[2]), maxDensity: maxDensity < 0 ? null : maxDensity, respawn: match[4] === 'true' };
}
export function parseLanguageTuringLength(line: string): { name: string; length: number } | null {
  const match = line.match(/^__seqlength\("([A-Za-z_]\w*)",(\d+)\)$/);
  return match ? { name: match[1], length: Number(match[2]) } : null;
}
export function parseLanguageTuringChange(line: string): { name: string; change: number } | null {
  const match = line.match(/^__seqchange\("([A-Za-z_]\w*)",(\d+(?:\.\d+)?)\)$/);
  return match ? { name: match[1], change: Number(match[2]) } : null;
}
export function parseLanguageTuringValues(line: string): { name: string; values: number[] } | null {
  const match = line.match(/^__seqvalues\("([A-Za-z_]\w*)","([^"]*)"\)$/);
  return match ? { name: match[1], values: match[2].split('|').filter(Boolean).map(Number) } : null;
}
export function parseLanguageSeqWeights(line: string): { name: string; weights: number[] } | null {
  const match = line.match(/^__seqweights\("([A-Za-z_]\w*)","([^"]*)"\)$/);
  return match ? { name: match[1], weights: match[2].split('|').filter(Boolean).map(Number) } : null;
}
export function parseLanguageConstellationParam(line: string): { name: string; param: 'stepwise' | 'leap' | 'repeat' | 'memory' | 'phrase' | 'mutation'; value: number } | null {
  const match = line.match(/^__constellationparam\("([A-Za-z_]\w*)","(stepwise|leap|repeat|memory|phrase|mutation)",(-?\d+(?:\.\d+)?)\)$/);
  return match ? { name: match[1], param: match[2] as 'stepwise' | 'leap' | 'repeat' | 'memory' | 'phrase' | 'mutation', value: Number(match[3]) } : null;
}
export function parseLanguageConstellationOctaves(line: string): { name: string; octaves: Array<{ octave: number; weight: number }> } | null {
  const match = line.match(/^__constellationoctaves\("([A-Za-z_]\w*)","((?:[^"\\]|\\.)*)"\)$/);
  if (!match) return null;
  try {
    return { name: match[1], octaves: JSON.parse(JSON.parse(`"${match[2]}"`) as string) as Array<{ octave: number; weight: number }> };
  } catch { return null; }
}
export function parseLanguageConstellationReader(line: string): LanguageConstellationReaderDefinition | null {
  const match = line.match(/^__constellationreader\("([A-Za-z_]\w*)","([A-Za-z_]\w*)"\)$/);
  return match ? { voice: match[1], seq: match[2] } : null;
}
export function parseLanguageTuringVoice(line: string): { voice: string; seq: string } | null {
  const match = line.match(/^__seqvoice\("([A-Za-z_]\w*)","([A-Za-z_]\w*)"\)$/);
  return match ? { voice: match[1], seq: match[2] } : null;
}
export function parseLanguageLifeReader(line: string): LanguageLifeReaderDefinition | null {
  const match = line.match(/^__lifereader\("([A-Za-z_]\w*)","([A-Za-z_]\w*)","(order|random|walk|reverse|pendulum|first|last)",(\d+(?:\.\d+)?),(true|false)\)$/);
  return match ? { voice: match[1], seq: match[2], mode: match[3] as LifeReaderMode, amount: Number(match[4]), view: match[5] === 'true' } : null;
}
export function parseLanguageLifeEvolve(line: string): { name: string; timing: LanguageCycleDefinition } | null {
  const match = line.match(/^__lifeevolve\("([A-Za-z_]\w*)",(\d+(?:\.\d+)?),"(ms|sec|beat)",(\d+(?:\.\d+)?),(true|false),(true|false),"([A-Za-z_]\w*)"\)$/);
  if (!match) return null;
  return { name: match[1], timing: { amount: Number(match[2]), unit: match[3] as 'ms'|'sec'|'beat', chance: Number(match[4]), drift: match[5] === 'true', loose: match[6] === 'true', clockSource: match[7] } };
}

export function parseLanguageSequenceDirective(
  line: string,
): ({ name: string; values: number[]; mode: LanguageSequenceDefinition['mode']; amount: number; favor: LanguageSequenceFavorEntry[] }) | null {
  const match = line.match(
    /^__sequence\("([A-Za-z_]\w*)","([^"]*)","(order|random|walk|shuffle|reverse|pendulum)",(\d+(?:\.\d+)?),"((?:[^"\\]|\\.)*)"\)$/,
  );
  if (!match) return null;
  let favor: LanguageSequenceFavorEntry[] = [];
  try {
    favor = JSON.parse(JSON.parse(`"${match[5]}"`) as string) as LanguageSequenceFavorEntry[];
  } catch {
    return null;
  }
  return {
    name: match[1],
    values: match[2].split('|').filter(Boolean).map(Number),
    mode: match[3] as LanguageSequenceDefinition['mode'],
    amount: Number(match[4]),
    favor,
  };
}

export function parseLanguageFilterSequenceDirective(line: string): LanguageFilterSequenceDefinition | null {
  const match = line.match(
    /^__filtersequence\("([A-Za-z_]\w*)","([^"]*)","(order|random|walk|shuffle|reverse|pendulum)",(\d+(?:\.\d+)?),"((?:[^"\\]|\\.)*)",(\d+(?:\.\d+)?),"(ms|sec|beat)",(\d+(?:\.\d+)?),(true|false),(true|false),"([A-Za-z_]\w*)"\)$/,
  );
  if (!match) return null;
  let favor: LanguageSequenceFavorEntry[] = [];
  try { favor = JSON.parse(JSON.parse(`"${match[5]}"`) as string) as LanguageSequenceFavorEntry[]; }
  catch { return null; }
  return {
    filter: match[1],
    values: match[2].split('|').filter(Boolean).map(Number),
    mode: match[3] as LanguageSequenceDefinition['mode'],
    amount: Number(match[4]),
    favor,
    interval: Number(match[6]),
    unit: match[7] as LanguageFilterSequenceDefinition['unit'],
    chance: Number(match[8]),
    drift: match[9] === 'true',
    loose: match[10] === 'true',
    clockSource: match[11],
  };
}

export function parseLanguageCycleDirective(
  line: string,
): ({ name: string } & LanguageCycleDefinition) | null {
  const match = line.match(
    /^__cycle\("([A-Za-z_]\w*)",(\d+(?:\.\d+)?),"(ms|sec|beat)",(\d+(?:\.\d+)?),(true|false),(true|false),"([^"]+)"\)$/,
  );
  if (!match) return null;
  return {
    name: match[1],
    amount: Number(match[2]),
    unit: match[3] as LanguageCycleDefinition['unit'],
    chance: Number(match[4]),
    drift: match[5] === 'true',
    loose: match[6] === 'true',
    clockSource: match[7],
  };
}

export function parseLanguageInlinePianoDirective(line: string): LanguageInlinePianoDefinition | null {
  const match = line.match(
    /^__inlinepiano\("(voice|fx|filter)","([A-Za-z_]\w*)","(note|scale)",(\d+),"([^"]*)"\)$/,
  );
  if (!match) return null;
  return {
    ownerKind: match[1] as 'voice' | 'fx' | 'filter',
    owner: match[2],
    property: match[3] as 'note' | 'scale',
    line: Number(match[4]),
    values: match[5].split('|').filter(Boolean).map(Number),
  };
}

export function parseLanguageInlineScalarDirective(line: string): LanguageInlineScalarDefinition | null {
  const match = line.match(
    /^__inlinescalar\("(voice|fx|filter)","([A-Za-z_]\w*)","([A-Za-z_]\w*)",(\d+),"((?:[^"\\]|\\.)*)"\)$/,
  );
  if (!match) return null;
  let expression: string;
  try { expression = JSON.parse(`"${match[5]}"`) as string; } catch { return null; }
  return {
    ownerKind: match[1] as 'voice' | 'fx' | 'filter',
    owner: match[2],
    property: match[3],
    line: Number(match[4]),
    expression,
  };
}

export function parseLanguageDelayTime(line: string): LanguageDelayTimeDefinition | null {
  const match = line.match(/^__delaytime\("([A-Za-z_]\w*)",(\d+(?:\.\d+)?),"(ms|sec|beat)"\)$/);
  return match ? { name: match[1], amount: Number(match[2]), unit: match[3] as 'ms'|'sec'|'beat' } : null;
}
export function parseLanguageDelayParam(line: string, lineNumber: number): LanguageDelayParamDefaultDefinition | null {
  const match = line.match(/^__delayparam\("([A-Za-z_]\w*)","(lines|spread|spreadloose|reverse|pitchprob|pitchcount|pitch0|pitch1|pitch2|pitch3|pitch4|pitch5|pitch6|pitch7|pitch8|pitch9|pitch10|pitch11|pitch12|pitch13|pitch14|pitch15|tape|diffusion|pingpong)",(\d+(?:\.\d+)?)\)$/);
  return match ? { name: match[1], parameter: match[2] as LanguageDelayParameter, expression: match[3], line: lineNumber } : null;
}
export function parseLanguageDelayParamDefault(line: string, lineNumber: number): LanguageDelayParamDefaultDefinition | null {
  const match = line.match(/^__delayparamdefault\("([A-Za-z_]\w*)","(lines|spread|spreadloose|reverse|pitchprob|pitchcount|pitch0|pitch1|pitch2|pitch3|pitch4|pitch5|pitch6|pitch7|pitch8|pitch9|pitch10|pitch11|pitch12|pitch13|pitch14|pitch15|tape|diffusion|pingpong)","((?:[^"\\]|\\.)*)"\)$/);
  if (!match) return null; let expression: string; try { expression = JSON.parse(`"${match[3]}"`) as string; } catch { return null; }
  return { name: match[1], parameter: match[2] as LanguageDelayParameter, expression, line: lineNumber };
}
export function parseLanguageDelayParamCycle(line: string, lineNumber: number): LanguageDelayParamCycleDefinition | null {
  const match = line.match(/^__delayparamcycle\("([A-Za-z_]\w*)","(lines|spread|spreadloose|reverse|pitchprob|pitchcount|pitch0|pitch1|pitch2|pitch3|pitch4|pitch5|pitch6|pitch7|pitch8|pitch9|pitch10|pitch11|pitch12|pitch13|pitch14|pitch15|tape|diffusion|pingpong)","((?:[^"\\]|\\.)*)",(\d+(?:\.\d+)?),"(ms|sec|beat)",(\d+(?:\.\d+)?),(true|false),(true|false),"([A-Za-z_]\w*)"\)$/);
  if (!match) return null; let expression: string; try { expression = JSON.parse(`"${match[3]}"`) as string; } catch { return null; }
  return { name: match[1], parameter: match[2] as LanguageDelayParameter, expression, line: lineNumber, amount: Number(match[4]), unit: match[5] as 'ms'|'sec'|'beat', chance: Number(match[6]), drift: match[7] === 'true', loose: match[8] === 'true', clockSource: match[9] };
}

export function parseLanguageFxMetadata(line: string): LanguageFxMetadata | null {
  const match = line.match(/^__fxmeta\("([A-Za-z_]\w*)"(?:,"([^"]+)")?\)$/);
  return match ? { name: match[1], modelId: match[2] ?? null } : null;
}

export function parseLanguageFxParameterCycleDirective(
  line: string,
  lineNumber: number,
): LanguageFxParameterCycleDefinition | null {
  const match = line.match(
    /^__fxparamcycle\("([A-Za-z_]\w*)","(position|size|pitch|density|texture|mix|spread|feedback|reverb)","((?:[^"\\]|\\.)*)",(\d+(?:\.\d+)?),"(ms|sec|beat)",(\d+(?:\.\d+)?),(true|false),(true|false),"([A-Za-z_]\w*)"\)$/,
  );
  if (!match) return null;
  let expression: string;
  try { expression = JSON.parse(`"${match[3]}"`) as string; } catch { return null; }
  return {
    fx: match[1],
    parameter: match[2] as LanguageFxParameter,
    expression,
    amount: Number(match[4]),
    unit: match[5] as LanguageFxParameterCycleDefinition['unit'],
    chance: Number(match[6]),
    drift: match[7] === 'true',
    loose: match[8] === 'true',
    clockSource: match[9],
    line: lineNumber,
  };
}

export function parseLanguageFxParameterDefaultDirective(
  line: string,
  lineNumber: number,
): LanguageFxParameterDefaultDefinition | null {
  const match = line.match(
    /^__fxparamdefault\("([A-Za-z_]\w*)","(position|size|pitch|density|texture|mix|spread|feedback|reverb)","((?:[^"\\]|\\.)*)"\)$/,
  );
  if (!match) return null;
  let expression: string;
  try { expression = JSON.parse(`"${match[3]}"`) as string; } catch { return null; }
  return { fx: match[1], parameter: match[2] as LanguageFxParameter, expression, line: lineNumber };
}

export function parseLanguageFxPitchSequenceDirective(
  line: string,
): ({ name: string } & LanguageFxPitchSequenceDefinition) | null {
  const match = line.match(
    /^__fxsequence\("([A-Za-z_]\w*)","([^"]*)","(order|random|walk|shuffle|reverse|pendulum)",(\d+(?:\.\d+)?),"((?:[^"\\]|\\.)*)"\)$/,
  );
  if (!match) return null;
  let favor: LanguageSequenceFavorEntry[] = [];
  try {
    favor = JSON.parse(JSON.parse(`"${match[5]}"`) as string) as LanguageSequenceFavorEntry[];
  } catch {
    return null;
  }
  return {
    name: match[1],
    values: match[2].split('|').filter(Boolean).map(Number),
    mode: match[3] as LanguageFxPitchSequenceDefinition['mode'],
    amount: Number(match[4]),
    favor,
  };
}

export function parseLanguageFxPitchCycleDirective(
  line: string,
): { name: string; timing: LanguageCycleDefinition } | null {
  const match = line.match(
    /^__fxpitchcycle\("([A-Za-z_]\w*)",(\d+(?:\.\d+)?),"(ms|sec|beat)",(\d+(?:\.\d+)?),(true|false),(true|false),"([A-Za-z_]\w*)"\)$/,
  );
  if (!match) return null;
  return {
    name: match[1],
    timing: {
      amount: Number(match[2]),
      unit: match[3] as LanguageCycleDefinition['unit'],
      chance: Number(match[4]),
      drift: match[5] === 'true',
      loose: match[6] === 'true',
      clockSource: match[7],
    },
  };
}

export function parseLanguageFxModulationDirective(
  line: string,
  lineNumber: number,
): LanguageFxModulationDefinition | null {
  const match = line.match(
    /^__fxmod\("([A-Za-z_]\w*)","(position|size|pitch|density|texture|mix|spread|feedback|reverb)","([A-Za-z_]\w*)",([1-4]),(-?\d+(?:\.\d+)?)\)$/,
  );
  if (!match) return null;
  return {
    fx: match[1],
    parameter: match[2] as LanguageFxParameter,
    mod: match[3],
    channel: Number(match[4]) as 1 | 2 | 3 | 4,
    depth: Number(match[5]),
    line: lineNumber,
  };
}

export function parseLanguageModSetDirective(line: string, lineNumber: number): LanguageModSetDirective | null {
  const match = line.match(
    /^__modset\("([A-Za-z_]\w*)","(model|freq|ratebeat|out1|out2|out3|out4|slope|shape|smooth|shift|output|range|spread|bias|steps|deja|length|diversity)","((?:[^"\\]|\\.)*)"\);?$/,
  );
  if (!match) return null;

  let value: string;
  try {
    value = JSON.parse(`"${match[3]}"`) as string;
  } catch {
    return null;
  }

  return {
    internalName: match[1],
    parameter: match[2] as LanguageModSetDirective['parameter'],
    value,
    line: lineNumber,
  };
}

export function parseLanguageModMetadata(line: string): LanguageModMetadata | null {
  const match = line.match(/^__modmeta\("([A-Za-z_]\w*)","([A-Za-z_]\w*)","([A-Za-z_]\w*)?"\)$/);
  if (!match) return null;
  return { internalName: match[1], displayName: match[2], ownerVoice: match[3] || null };
}

export function parseLanguageTuningDirective(line: string): number | null {
  const match = line.match(/^__tuning\((\d+(?:\.\d+)?)\);?$/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function parseLanguageClockParentDirective(line: string): { name: string; parent: string; rate: number; rateLabel: string } | null {
  const match = line.match(/^__clockparent\("([A-Za-z_]\w*)","([A-Za-z_]\w*)","([/*]\d+(?:\.\d+)?)"\)$/);
  if (!match) return null;
  const parsed = parseClockRate(match[3]);
  return parsed ? { name: match[1], parent: match[2], rate: parsed.rate, rateLabel: parsed.label } : null;
}

export function parseLanguageClockFeelDirective(line: string): { name: string; kind: 'jitter' | 'drift'; amount: number } | null {
  const match = line.match(/^__clockfeel\("([A-Za-z_]\w*)","(jitter|drift)",(\d+(?:\.\d+)?)\)$/);
  if (!match) return null;
  return { name: match[1], kind: match[2] as 'jitter' | 'drift', amount: Number(match[3]) };
}

export function parseLanguageMasterClockDirective(line: string, lineNumber: number): LanguageMasterClockDefinition | null {
  const match = line.match(/^__masterclock\("((?:[^"\\]|\\.)*)",(\d+(?:\.\d+)?),"(ms|sec|beat)",(true|false),(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)(?:,(true|false))?\)$/);
  if (!match) return null;
  let expression: string;
  try { expression = JSON.parse(`"${match[1]}"`) as string; } catch { return null; }
  return {
    expression,
    amount: Number(match[2]),
    unit: match[3] as LanguageMasterClockDefinition['unit'],
    drift: match[4] === 'true',
    jitter: Number(match[5]),
    timingDrift: Number(match[6]),
    disabled: match[7] === 'true',
    line: lineNumber,
  };
}

export function parseLanguageVcaDirective(line: string, lineNumber: number): LanguageVcaDefinition | null {
  const match = line.match(/^__voicevca\("([A-Za-z_]\w*)","([A-Za-z_]\w*)","((?:[^"\\]|\\.)*)",(\d+)\)$/);
  if (!match) return null;
  try {
    const raw = JSON.parse(`"${match[3]}"`) as string;
    const spec = JSON.parse(raw) as LanguageEnvelopeSpec;
    return { owner: match[1], output: match[2], spec, line: Number(match[4]) || lineNumber };
  } catch {
    return null;
  }
}

export function parseLanguageEnvelopeDirective(line: string, lineNumber: number): LanguageEnvelopeDefinition | null {
  const match = line.match(/^__envelopeparam\("(voice|fx|filter)","([A-Za-z_]\w*)","([A-Za-z_]\w*)","((?:[^"\\]|\\.)*)",(\d+),(\d+(?:\.\d+)?),"(ms|sec|beat)",(\d+(?:\.\d+)?),(true|false),(true|false),"([A-Za-z_]\w*)"\)$/);
  if (!match) return null;
  let raw: string;
  let spec: LanguageEnvelopeSpec;
  try {
    raw = JSON.parse(`"${match[4]}"`) as string;
    spec = JSON.parse(raw) as LanguageEnvelopeSpec;
  } catch {
    return null;
  }
  return {
    ownerKind: match[1] as LanguageEnvelopeDefinition['ownerKind'],
    owner: match[2],
    parameter: match[3],
    spec,
    line: Number(match[5]) || lineNumber,
    interval: Number(match[6]),
    unit: match[7] as LanguageEnvelopeDefinition['unit'],
    chance: Number(match[8]),
    drift: match[9] === 'true',
    loose: match[10] === 'true',
    clockSource: match[11],
  };
}

export function parseLanguageGenerativeDefaultDirective(
  line: string,
  lineNumber: number,
): LanguageGenerativeDefaultDefinition | null {
  const match = line.match(
    /^__genparamdefault\("(voice|fx|filter)","([A-Za-z_]\w*)","([A-Za-z_]\w*)","((?:[^"\\]|\\.)*)","(wander|trend|scatter|flutter)",(\d+(?:\.\d+)?)\)$/,
  );
  if (!match) return null;
  let expression: string;
  try { expression = JSON.parse(`"${match[4]}"`) as string; } catch { return null; }
  return {
    ownerKind: match[1] as 'voice' | 'fx' | 'filter',
    owner: match[2],
    parameter: match[3],
    expression,
    mode: match[5] as LanguageGenerativeMode,
    amount: Number(match[6]),
    line: lineNumber,
  };
}

export function parseLanguageGenerativeCycleDirective(
  line: string,
  lineNumber: number,
): LanguageGenerativeCycleDefinition | null {
  const match = line.match(
    /^__genparamcycle\("(voice|fx|filter)","([A-Za-z_]\w*)","([A-Za-z_]\w*)","((?:[^"\\]|\\.)*)","(wander|trend|scatter|flutter)",(\d+(?:\.\d+)?),(\d+(?:\.\d+)?),"(ms|sec|beat)",(\d+(?:\.\d+)?),(true|false),(true|false),"([A-Za-z_]\w*)"\)$/,
  );
  if (!match) return null;
  let expression: string;
  try { expression = JSON.parse(`"${match[4]}"`) as string; } catch { return null; }
  return {
    ownerKind: match[1] as 'voice' | 'fx' | 'filter',
    owner: match[2],
    parameter: match[3],
    expression,
    mode: match[5] as LanguageGenerativeMode,
    amount: Number(match[6]),
    interval: Number(match[7]),
    unit: match[8] as LanguageGenerativeCycleDefinition['unit'],
    chance: Number(match[9]),
    drift: match[10] === 'true',
    loose: match[11] === 'true',
    clockSource: match[12],
    line: lineNumber,
  };
}

export function parseLanguageParameterCycleDirective(
  line: string,
  lineNumber: number,
): LanguageParameterCycleDefinition | null {
  const match = line.match(
    /^__paramcycle\("([A-Za-z_]\w*)","(harmo|timbre|morph|width|geometry|structure|brightness|damping|position|space|bow|bowTimbre|blow|blowTimbre|strike|strikeTimbre)","((?:[^"\\]|\\.)*)",(\d+(?:\.\d+)?),"(ms|sec|beat)",(\d+(?:\.\d+)?),(true|false),(true|false),"([A-Za-z_]\w*)"\)$/,
  );
  if (!match) return null;

  let expression: string;
  try {
    expression = JSON.parse(`"${match[3]}"`) as string;
  } catch {
    return null;
  }

  return {
    voice: match[1],
    parameter: match[2] as LanguageParameterCycleDefinition['parameter'],
    expression,
    amount: Number(match[4]),
    unit: match[5] as LanguageParameterCycleDefinition['unit'],
    chance: Number(match[6]),
    drift: match[7] === 'true',
    loose: match[8] === 'true',
    clockSource: match[9],
    line: lineNumber,
  };
}

export function parseLanguageParameterDefaultDirective(
  line: string,
  lineNumber: number,
): LanguageParameterDefaultDefinition | null {
  const match = line.match(
    /^__paramdefault\("([A-Za-z_]\w*)","(harmo|timbre|morph|width|geometry|structure|brightness|damping|position|space|bow|bowTimbre|blow|blowTimbre|strike|strikeTimbre)","((?:[^"\\]|\\.)*)"\)$/,
  );
  if (!match) return null;

  let expression: string;
  try {
    expression = JSON.parse(`"${match[3]}"`) as string;
  } catch {
    return null;
  }

  return {
    voice: match[1],
    parameter: match[2] as LanguageParameterDefaultDefinition['parameter'],
    expression,
    line: lineNumber,
  };
}

export function parseLanguageObjectEveryDirective(
  line: string,
): ({ name: string } & LanguageObjectEveryDefinition) | null {
  const match = line.match(
    /^__objectevery\("([A-Za-z_]\w*)",(\d+(?:\.\d+)?),"(ms|sec|beat)",(\d+(?:\.\d+)?),(true|false),(true|false),"([^"]+)"\)$/,
  );
  if (!match) return null;
  return {
    name: match[1],
    amount: Number(match[2]),
    unit: match[3] as LanguageObjectEveryDefinition['unit'],
    chance: Number(match[4]),
    drift: match[5] === 'true',
    loose: match[6] === 'true',
    clockSource: match[7],
  };
}

export function parseLanguageDriveEvery(line: string): ({ name: string } & LanguageObjectEveryDefinition) | null {
  const match = line.match(/^__driveevery\("([A-Za-z_]\w*)",(\d+(?:\.\d+)?),"(ms|sec|beat)",(\d+(?:\.\d+)?),(true|false),(true|false),"([^"]+)"\)$/);
  if (!match) return null;
  return {
    name: match[1],
    amount: Number(match[2]),
    unit: match[3] as 'ms' | 'sec' | 'beat',
    chance: Number(match[4]),
    drift: match[5] === 'true',
    loose: match[6] === 'true',
    clockSource: match[7],
  };
}


export function parseLanguageSetCycleDirective(line: string): ({ name: string; amount: number; unit: LanguageSetCycleDefinition['unit']; chance: number; drift: boolean; loose: boolean }) | null {
  const match = line.match(/^__setcycle\("([A-Za-z_]\w*)",(\d+(?:\.\d+)?),"(ms|sec|beat)",(\d+(?:\.\d+)?),(true|false),(true|false)\)$/);
  if (!match) return null;
  return {
    name: match[1],
    amount: Number(match[2]),
    unit: match[3] as LanguageSetCycleDefinition['unit'],
    chance: Number(match[4]),
    drift: match[5] === 'true',
    loose: match[6] === 'true',
  };
}

export function parseLanguageFromDirective(line: string): ({ target: string; property: string; source: string }) | null {
  const match = line.match(/^__from\("([A-Za-z_]\w*)","(note|freq|cycle)","([A-Za-z_]\w*)"\)$/);
  return match ? { target: match[1], property: match[2], source: match[3] } : null;
}

function formatClockNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export function parseClockRate(value: string): { rate: number; label: string } | null {
  const match = value.trim().match(/^([/*])(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const n = Number(match[2]); if (!Number.isFinite(n) || n <= 0) return null;
  return { rate: match[1] === '/' ? 1 / n : n, label: `${match[1]}${formatClockNumber(n)}` };
}
