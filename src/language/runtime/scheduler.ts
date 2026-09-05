import { AudioEngine } from '../../audio/engine';

type RuntimeWallJob = {
  key: string;
  intervalMs: number;
  nextAtMs: number;
  callback: () => void;
  intervalFactory?: () => number;
};

export type RuntimePatternMode = 'forward' | 'reverse' | 'pendulum' | 'walk' | 'random';
export type RuntimePatternEvent = { index: number; retrig?: number; chance: number; cycle: { position: number; length: number } | null };
export type RuntimePatternSpec = { steps: number; mode: RuntimePatternMode; events: RuntimePatternEvent[] };

export function parseRuntimePatternSource(sourceName: string): { spec: RuntimePatternSpec; sourceName: string } | null {
  const match = sourceName.match(/^__pattern__(.+?)__(.+)$/);
  if (!match) return null;
  try {
    const spec = JSON.parse(decodeURIComponent(match[1])) as RuntimePatternSpec;
    if (!Number.isInteger(spec.steps) || spec.steps < 1 || !Array.isArray(spec.events)) return null;
    return { spec, sourceName: match[2] };
  } catch {
    return null;
  }
}

type RuntimeBeatJob = {
  key: string;
  sourceName: string;
  everyBeats: number;
  counter: number;
  callback: () => void;
  loose: boolean;
  euclideanPattern: boolean[] | null;
  euclideanStep: number;
  pattern: RuntimePatternSpec | null;
  patternStep: number;
  patternDirection: 1 | -1;
  patternCycle: number;
  patternDisplayStep: number;
};

export class RuntimeScheduler {
  private wallJobs: RuntimeWallJob[] = [];
  private beatJobs: RuntimeBeatJob[] = [];
  private deferred: Array<{ dueAtMs: number; callback: () => void }> = [];
  private epochMs = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private clockUnsubscribes: Array<() => void> = [];
  private preservedBeatPhase = new Map<string, { sourceName: string; everyBeats: number; counter: number; euclideanStep: number; patternSteps: number; patternMode: RuntimePatternMode | null; patternStep: number; patternDirection: 1 | -1; patternCycle: number; patternDisplayStep: number }>();
  private preservedWallPhase = new Map<string, { intervalMs: number; remainingMs: number }>();

  constructor(private readonly audio: AudioEngine) {}

  clear(options: { preservePhase?: boolean } = {}): void {
    if (options.preservePhase) {
      const elapsed = this.epochMs > 0 ? performance.now() - this.epochMs : 0;
      this.preservedBeatPhase = new Map(
        this.beatJobs.map((job) => [
          job.key,
          { sourceName: job.sourceName, everyBeats: job.everyBeats, counter: job.counter, euclideanStep: job.euclideanStep, patternSteps: job.pattern?.steps ?? 0, patternMode: job.pattern?.mode ?? null, patternStep: job.patternStep, patternDirection: job.patternDirection, patternCycle: job.patternCycle, patternDisplayStep: job.patternDisplayStep },
        ]),
      );
      this.preservedWallPhase = new Map(
        this.wallJobs.map((job) => [
          job.key,
          {
            intervalMs: job.intervalMs,
            remainingMs: Math.max(1, job.nextAtMs - elapsed),
          },
        ]),
      );
    } else {
      this.preservedBeatPhase.clear();
      this.preservedWallPhase.clear();
    }

    this.stop();
    this.wallJobs = [];
    this.beatJobs = [];
    this.deferred = [];
  }

  addWallJob(
    key: string,
    intervalMs: number,
    callback: () => void,
    intervalFactory?: () => number,
  ): void {
    const preserved = this.preservedWallPhase.get(key);
    const canRestore = preserved && Math.abs(preserved.intervalMs - intervalMs) < 0.001;
    this.wallJobs.push({
      key,
      intervalMs,
      nextAtMs: canRestore ? Math.min(intervalMs, preserved.remainingMs) : intervalMs,
      callback,
      intervalFactory,
    });
  }

  addBeatJob(
    key: string,
    everyBeats: number,
    callback: () => void,
    loose = false,
    sourceName = 'Clock',
  ): void {
    let actualSourceName = sourceName;
    let euclideanPattern: boolean[] | null = null;
    let pattern: RuntimePatternSpec | null = null;
    const parsedPattern = parseRuntimePatternSource(sourceName);
    if (parsedPattern) {
      pattern = parsedPattern.spec;
      actualSourceName = parsedPattern.sourceName;
      everyBeats = 1;
    }
    const euclidean = pattern ? null : sourceName.match(/^__euclidean_(\d+)_(\d+)_(\d+)__(.+)$/);
    if (euclidean) {
      const hits = Number(euclidean[1]);
      const steps = Number(euclidean[2]);
      const rotate = Number(euclidean[3]);
      actualSourceName = euclidean[4];
      euclideanPattern = RuntimeScheduler.euclideanPattern(hits, steps, rotate);
      everyBeats = 1;
    }

    const preserved = this.preservedBeatPhase.get(key);
    const canRestore = preserved
      && preserved.sourceName === actualSourceName
      && preserved.everyBeats === everyBeats;
    const restorePattern = Boolean(pattern && canRestore && preserved?.patternSteps === pattern.steps);
    const initialPatternStep = pattern?.mode === 'reverse' ? pattern.steps - 1 : 0;
    this.beatJobs.push({
      key,
      sourceName: actualSourceName,
      everyBeats,
      counter: canRestore ? Math.max(0, Math.min(everyBeats - 1, preserved.counter)) : 0,
      callback,
      loose,
      euclideanPattern,
      euclideanStep: canRestore && euclideanPattern
        ? preserved.euclideanStep % euclideanPattern.length
        : 0,
      pattern,
      patternStep: restorePattern ? Math.min(pattern!.steps - 1, preserved!.patternStep) : initialPatternStep,
      patternDirection: restorePattern && preserved?.patternMode === pattern?.mode ? preserved!.patternDirection : 1,
      patternCycle: restorePattern ? Math.max(1, preserved!.patternCycle) : 1,
      patternDisplayStep: restorePattern ? Math.min(pattern!.steps - 1, preserved!.patternDisplayStep) : initialPatternStep,
    });
  }

  private static euclideanPattern(hits: number, steps: number, rotate: number): boolean[] {
    // Bucket/Bresenham distribution: hits are spread as evenly as possible
    // across the requested number of clock steps.
    const pattern = Array.from({ length: steps }, (_, step) =>
      ((step * hits) % steps) < hits
    );
    if (rotate === 0) return pattern;
    return pattern.map((_, step) => pattern[(step - rotate + steps) % steps]);
  }

  start(): void {
    this.stop();
    this.epochMs = performance.now();

    if (this.wallJobs.length > 0 || this.deferred.length > 0) {
      this.timer = setInterval(() => this.tickWallClock(), 10);
    }

    const clockSources = new Set(this.beatJobs.map((job) => job.sourceName));
    for (const sourceName of clockSources) {
      this.clockUnsubscribes.push(
        this.audio.subscribeClockTrigger(sourceName, () => this.tickBeat(sourceName)),
      );
    }
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    for (const unsubscribe of this.clockUnsubscribes) unsubscribe();
    this.clockUnsubscribes = [];
    this.deferred = [];
  }

  resetBeatPhase(): void {
    for (const job of this.beatJobs) {
      job.counter = 0;
      job.euclideanStep = 0;
      job.patternStep = job.pattern?.mode === 'reverse' ? Math.max(0, job.pattern.steps - 1) : 0;
      job.patternDirection = 1;
      job.patternCycle = 1;
      job.patternDisplayStep = job.patternStep;
    }
    this.preservedBeatPhase.clear();
    // Deferred callbacks are produced only by loose beat jobs. A fresh master
    // clock epoch must not fire callbacks that belonged to the previous epoch.
    this.deferred = [];
  }

  getPatternState(key: string): { step: number; cycle: number; steps: number; mode: RuntimePatternMode } | null {
    const job = this.beatJobs.find((candidate) => candidate.key === key && candidate.pattern !== null);
    if (!job?.pattern) return null;
    return { step: job.patternDisplayStep, cycle: job.patternCycle, steps: job.pattern.steps, mode: job.pattern.mode };
  }

  private advancePattern(job: RuntimeBeatJob): void {
    const pattern = job.pattern;
    if (!pattern) return;
    if (pattern.mode === 'random') {
      job.patternStep = Math.floor(Math.random() * pattern.steps);
      return;
    }
    if (pattern.mode === 'walk') {
      const delta = Math.random() < 0.5 ? -1 : 1;
      job.patternStep = (job.patternStep + delta + pattern.steps) % pattern.steps;
      return;
    }
    if (pattern.mode === 'reverse') {
      if (job.patternStep <= 0) { job.patternStep = pattern.steps - 1; job.patternCycle += 1; }
      else job.patternStep -= 1;
      return;
    }
    if (pattern.mode === 'pendulum') {
      if (pattern.steps <= 1) { job.patternCycle += 1; return; }
      if (job.patternDirection > 0) {
        if (job.patternStep >= pattern.steps - 1) { job.patternDirection = -1; job.patternStep = pattern.steps - 2; }
        else job.patternStep += 1;
      } else if (job.patternStep <= 0) {
        job.patternDirection = 1;
        job.patternStep = 1;
        job.patternCycle += 1;
      } else job.patternStep -= 1;
      return;
    }
    if (job.patternStep >= pattern.steps - 1) { job.patternStep = 0; job.patternCycle += 1; }
    else job.patternStep += 1;
  }

  private tickWallClock(): void {
    const elapsed = performance.now() - this.epochMs;

    for (const job of this.wallJobs) {
      if (elapsed < job.nextAtMs) continue;
      job.callback();

      const nextInterval = Math.max(1, job.intervalFactory?.() ?? job.intervalMs);
      job.nextAtMs += nextInterval;

      if (job.nextAtMs <= elapsed) {
        const missed = Math.floor((elapsed - job.nextAtMs) / nextInterval) + 1;
        job.nextAtMs += missed * nextInterval;
      }
    }

    if (this.deferred.length > 0) {
      const now = performance.now();
      const ready = this.deferred.filter((entry) => entry.dueAtMs <= now);
      this.deferred = this.deferred.filter((entry) => entry.dueAtMs > now);
      for (const entry of ready) entry.callback();
    }
  }

  private tickBeat(sourceName: string): void {
    for (const job of this.beatJobs) {
      if (job.sourceName !== sourceName) continue;
      if (job.pattern) {
        if (job.pattern.mode === 'random') job.patternStep = Math.floor(Math.random() * job.pattern.steps);
        const currentStep = job.patternStep;
        job.patternDisplayStep = currentStep;
        const event = job.pattern.events.find((candidate) => candidate.index === currentStep + 1);
        const cycleAllowed = !event?.cycle || (((job.patternCycle - 1) % event.cycle.length) + 1 === event.cycle.position);
        const chanceAllowed = Boolean(event) && (event!.chance >= 100 || Math.random() * 100 < event!.chance);
        this.advancePattern(job);
        if (!event || !cycleAllowed || !chanceAllowed) continue;
      } else if (job.euclideanPattern) {
        const hit = job.euclideanPattern[job.euclideanStep] ?? false;
        job.euclideanStep = (job.euclideanStep + 1) % job.euclideanPattern.length;
        if (!hit) continue;
      } else {
        // counter is the current phase, not the number of ticks already
        // consumed. Phase 0 is therefore due on the first clock trigger of
        // a fresh transport epoch.
        const due = job.counter === 0;
        job.counter = (job.counter + 1) % job.everyBeats;
        if (!due) continue;
      }

      const retrig = job.pattern
        ? Math.max(1, Math.min(16, Math.round(job.pattern.events.find((candidate) => candidate.index === job.patternDisplayStep + 1)?.retrig ?? 1)))
        : 1;
      const sourceBeatMs = this.audio.getClockTiming(sourceName).beatDurationMs;
      const looseDelayMs = job.loose && Number.isFinite(sourceBeatMs)
        ? sourceBeatMs * 0.08 * Math.random()
        : 0;

      if (retrig === 1 && looseDelayMs === 0) {
        job.callback();
        continue;
      }

      const spacingMs = retrig > 1 && Number.isFinite(sourceBeatMs)
        ? sourceBeatMs / retrig
        : 0;
      const now = performance.now();
      for (let retrigIndex = 0; retrigIndex < retrig; retrigIndex += 1) {
        const delayMs = looseDelayMs + spacingMs * retrigIndex;
        if (delayMs <= 0) job.callback();
        else this.deferred.push({ dueAtMs: now + delayMs, callback: job.callback });
      }

      if (this.deferred.length > 0 && this.timer === null) {
        this.timer = setInterval(() => this.tickWallClock(), 10);
      }
    }

  }
}
