import { AudioEngine } from '../../audio/engine';

type RuntimeWallJob = {
  key: string;
  intervalMs: number;
  nextAtMs: number;
  callback: () => void;
  intervalFactory?: () => number;
};

type RuntimeBeatJob = {
  key: string;
  sourceName: string;
  everyBeats: number;
  counter: number;
  callback: () => void;
  loose: boolean;
  euclideanPattern: boolean[] | null;
  euclideanStep: number;
};

export class RuntimeScheduler {
  private wallJobs: RuntimeWallJob[] = [];
  private beatJobs: RuntimeBeatJob[] = [];
  private deferred: Array<{ dueAtMs: number; callback: () => void }> = [];
  private epochMs = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private clockUnsubscribes: Array<() => void> = [];
  private preservedBeatPhase = new Map<string, { sourceName: string; everyBeats: number; counter: number; euclideanStep: number }>();
  private preservedWallPhase = new Map<string, { intervalMs: number; remainingMs: number }>();

  constructor(private readonly audio: AudioEngine) {}

  clear(options: { preservePhase?: boolean } = {}): void {
    if (options.preservePhase) {
      const elapsed = this.epochMs > 0 ? performance.now() - this.epochMs : 0;
      this.preservedBeatPhase = new Map(
        this.beatJobs.map((job) => [
          job.key,
          { sourceName: job.sourceName, everyBeats: job.everyBeats, counter: job.counter, euclideanStep: job.euclideanStep },
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
    const euclidean = sourceName.match(/^__euclidean_(\d+)_(\d+)_(\d+)__(.+)$/);
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
    }
    this.preservedBeatPhase.clear();
    // Deferred callbacks are produced only by loose beat jobs. A fresh master
    // clock epoch must not fire callbacks that belonged to the previous epoch.
    this.deferred = [];
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
      if (job.euclideanPattern) {
        const hit = job.euclideanPattern[job.euclideanStep] ?? false;
        job.euclideanStep = (job.euclideanStep + 1) % job.euclideanPattern.length;
        if (!hit) continue;
      } else {
        job.counter += 1;
        if (job.counter < job.everyBeats) continue;
        job.counter = 0;
      }

      if (!job.loose) {
        job.callback();
        continue;
      }

      const bpm = this.audio.getClockStatus().bpm;
      const beatMs = bpm > 0 ? 60000 / bpm : 0;
      this.deferred.push({
        dueAtMs: performance.now() + beatMs * 0.08 * Math.random(),
        callback: job.callback,
      });

      if (this.timer === null) {
        this.timer = setInterval(() => this.tickWallClock(), 10);
      }
    }

  }
}
