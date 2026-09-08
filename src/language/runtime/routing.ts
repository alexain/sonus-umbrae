import type { SignalKind } from '../../audio/engine';

export interface RouteDefinition {
  source: string;
  target: string;
  amount: number;
  kind: SignalKind;
}

export interface RoutingDiagnostic {
  line: number;
  message: string;
}

export interface RoutingContext {
  sourceExists(name: string): boolean;
  isClockSource(name: string): boolean;
  isVoice(name: string): boolean;
  isGain(name: string): boolean;
  voiceEngine(name: string): string | undefined;
  isSwell(name: string): boolean;
  isMist(name: string): boolean;
  isFilter(name: string): boolean;
  isDrumkit(name: string): boolean;
  hasEmbeddedFilter(name: string): boolean;
  compositeOutputs(name: string): readonly string[];
}

interface ParsedRoute {
  sourceName: string;
  sourcePort: string;
  amountExpression: string | null;
  targetName: string;
  targetPort: 'out' | 'out_L' | 'out_R' | 'in' | 'in2' | 'inL' | 'inR' | 'trig' | 'clock' | 'v_oct' | 'harmo' | 'timbre' | 'morph';
}

export interface ResolvedRouteLine {
  routes: RouteDefinition[];
  messages: string[];
  diagnostics: RoutingDiagnostic[];
}

const STANDARD_SOURCE_PORTS = new Set([
  'out', 'aux', 'out_L', 'out_R',
  'out1', 'out2', 'out3', 'out4',
  't1', 't2', 't3', 'x1', 'x2', 'x3', 'y',
  'lp', 'hp', 'bp', 'np',
]);

export function resolveRouteLine(
  line: string,
  lineNumber: number,
  context: RoutingContext,
  evaluateAmount: (expression: string, line: number, label: string) => number | undefined,
  existingRouteKeys: ReadonlySet<string>,
): ResolvedRouteLine | null {
  const parsedRoute = parseRouteLine(line);
  if (!parsedRoute) return null;

  const diagnostics: RoutingDiagnostic[] = [];
  const messages: string[] = [];
  const routes: RouteDefinition[] = [];
  const { sourceName, sourcePort, amountExpression, targetName, targetPort } = parsedRoute;

  if (!context.sourceExists(sourceName)) {
    diagnostics.push({ line: lineNumber, message: `unknown source object: ${sourceName}` });
    return { routes, messages, diagnostics };
  }

  const compositeSource = context.voiceEngine(sourceName) === 'composite';
  if (compositeSource) {
    if (sourcePort !== 'out' && !context.compositeOutputs(sourceName).includes(sourcePort)) {
      diagnostics.push({ line: lineNumber, message: `composite '${sourceName}' does not expose output '${sourcePort}'` });
      return { routes, messages, diagnostics };
    }
  } else if (!STANDARD_SOURCE_PORTS.has(sourcePort)) {
    diagnostics.push({ line: lineNumber, message: `unknown output '${sourcePort}' on ${sourceName}` });
    return { routes, messages, diagnostics };
  }

  if (sourcePort === 'aux' && (!context.isVoice(sourceName) || compositeSource)) {
    diagnostics.push({ line: lineNumber, message: `aux output is only available on Voice objects: ${sourceName}` });
    return { routes, messages, diagnostics };
  }

  if (sourcePort === 'lp' || sourcePort === 'hp' || sourcePort === 'bp' || sourcePort === 'np') {
    if (!context.isFilter(sourceName) && !context.hasEmbeddedFilter(sourceName)) {
      diagnostics.push({ line: lineNumber, message: `${sourcePort} output requires a FILTER: ${sourceName}` });
      return { routes, messages, diagnostics };
    }
  }

  if (/^out[1-4]$/.test(sourcePort) && !context.isSwell(sourceName)) {
    diagnostics.push({ line: lineNumber, message: `${sourcePort} is only available on Swell objects: ${sourceName}` });
    return { routes, messages, diagnostics };
  }

  if ((sourcePort === 'out_L' || sourcePort === 'out_R')
    && !context.isMist(sourceName)
    && !context.isDrumkit(sourceName)
    && context.voiceEngine(sourceName) !== 'sample') {
    diagnostics.push({ line: lineNumber, message: `${sourcePort} is only available on stereo objects: ${sourceName}` });
    return { routes, messages, diagnostics };
  }

  if (targetPort === 'trig') {
    if (!context.isVoice(targetName) && !context.isSwell(targetName) && !context.isMist(targetName)) {
      diagnostics.push({ line: lineNumber, message: `trigger input is only available on Voice, Swell or Mist objects: ${targetName}` });
      return { routes, messages, diagnostics };
    }
  } else if (targetPort === 'clock') {
    if (!context.isSwell(targetName)) {
      diagnostics.push({ line: lineNumber, message: `clock input is only available on Swell objects: ${targetName}` });
      return { routes, messages, diagnostics };
    }
  } else if (targetPort === 'v_oct') {
    if (!context.isVoice(targetName) && !context.isSwell(targetName)) {
      diagnostics.push({ line: lineNumber, message: `v_oct input is only available on Voice or Swell objects: ${targetName}` });
      return { routes, messages, diagnostics };
    }
  } else if (targetPort === 'harmo' || targetPort === 'timbre' || targetPort === 'morph') {
    if (!context.isVoice(targetName)) {
      diagnostics.push({ line: lineNumber, message: `${targetPort} input is only available on Voice objects: ${targetName}` });
      return { routes, messages, diagnostics };
    }
  } else if (targetPort === 'out_L' || targetPort === 'out_R') {
    if (targetName !== 'Audio') {
      diagnostics.push({ line: lineNumber, message: `${targetPort} is only available on Audio for now: ${targetName}` });
      return { routes, messages, diagnostics };
    }
  } else if (targetPort === 'inL' || targetPort === 'inR') {
    if (!context.isMist(targetName)) {
      diagnostics.push({ line: lineNumber, message: `${targetPort} is only available on Mist objects: ${targetName}` });
      return { routes, messages, diagnostics };
    }
  } else if (targetPort === 'in' && context.isMist(targetName)) {
    // Mono convenience input feeding both Mist channels.
  } else if (targetPort === 'in' && context.isFilter(targetName)) {
    // Mono FILTER input.
  } else if (targetPort === 'in' && context.voiceEngine(targetName) === 'resonator') {
    // Rings/Resonator has one mono external excitation input.
  } else if ((targetPort === 'in' || targetPort === 'in2') && context.voiceEngine(targetName) === 'matter') {
    // Elements/Matter exposes its two original mono external excitation inputs.
  } else if (!(targetName === 'Audio' && targetPort === 'out') && !context.isGain(targetName)) {
    diagnostics.push({ line: lineNumber, message: `unknown or non-input object: ${targetName}` });
    return { routes, messages, diagnostics };
  }

  const amount = amountExpression === null ? 100 : evaluateAmount(amountExpression, lineNumber, 'route amount');
  if (amount === undefined) return { routes, messages, diagnostics };
  const amountError = routeAmountError(amount);
  if (amountError) {
    diagnostics.push({ line: lineNumber, message: amountError });
    return { routes, messages, diagnostics };
  }

  const kind: SignalKind = context.isClockSource(sourceName)
    ? 'trigger'
    : /^t[1-3]$/.test(sourcePort)
      ? 'gate'
      : 'signal';

  const pendingKeys = new Set<string>();
  const addRoute = (source: string, target: string): void => {
    const key = `${source}->${target}`;
    if (existingRouteKeys.has(key) || pendingKeys.has(key)) {
      diagnostics.push({ line: lineNumber, message: `duplicate audio route: ${source} -> ${target}` });
      return;
    }
    pendingKeys.add(key);
    routes.push({ source, target, amount, kind });
  };

  const sourceIsStereoShorthand =
    (context.isMist(sourceName) || context.isDrumkit(sourceName) || context.voiceEngine(sourceName) === 'sample')
    && sourcePort === 'out';
  const targetIsAudioStereo = targetName === 'Audio' && targetPort === 'out';

  if (targetIsAudioStereo) {
    if (sourceIsStereoShorthand) {
      addRoute(`${sourceName}.out_L`, 'Audio.out_L');
      addRoute(`${sourceName}.out_R`, 'Audio.out_R');
      messages.push(`${sourceName}.out stereo -> Audio.out stereo @ ${formatNumber(amount)}%`);
    } else {
      const source = `${sourceName}.${sourcePort}`;
      addRoute(source, 'Audio.out_L');
      addRoute(source, 'Audio.out_R');
      messages.push(`${source} -> Audio.out stereo @ ${formatNumber(amount)}%`);
    }
  } else {
    if (sourceIsStereoShorthand) {
      diagnostics.push({
        line: lineNumber,
        message: `${sourceName}.out is stereo; select ${sourceName}.out_L or ${sourceName}.out_R for a mono destination`,
      });
      return { routes, messages, diagnostics };
    }

    const source = `${sourceName}.${sourcePort}`;
    const target = `${targetName}.${targetPort}`;
    addRoute(source, target);
    messages.push(`${source} -> ${target} @ ${formatNumber(amount)}%`);
  }

  return { routes, messages, diagnostics };
}

function parseRouteLine(line: string): ParsedRoute | null {
  const arrow = line.indexOf('->');
  if (arrow < 0 || line.indexOf('->', arrow + 2) >= 0) return null;

  const left = line.slice(0, arrow).trim();
  const right = line.slice(arrow + 2).trim();

  const target = right.match(
    /^([A-Za-z_]\w*)\.(out|out_L|out_R|inL|inR|in2|in|trig|clock|v_oct|harmo|timbre|morph)$/,
  );
  if (!target) return null;

  const source = left.match(/^([A-Za-z_]\w*)\.([A-Za-z_]\w*)(.*)$/);
  if (!source) return null;

  const suffix = source[3].trim();
  let amountExpression: string | null = null;
  if (suffix) {
    if (!suffix.startsWith('(') || !suffix.endsWith(')')) return null;
    amountExpression = suffix.slice(1, -1).trim();
    if (!amountExpression) return null;
  }

  return {
    sourceName: source[1],
    sourcePort: source[2],
    amountExpression,
    targetName: target[1],
    targetPort: target[2] as ParsedRoute['targetPort'],
  };
}

function routeAmountError(value: number): string | null {
  return !Number.isFinite(value) || value < -100 || value > 100
    ? 'route amount must be between -100 and 100'
    : null;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
