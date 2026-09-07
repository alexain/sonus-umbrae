import type { AudioEngine } from '../audio/engine';
import { naturalScopeRange } from './monitor-panels';

export class ScopeRenderer {
  constructor(private readonly audioEngine: AudioEngine) {}

  drawAll(): void {
    const canvases = [...document.querySelectorAll<HTMLCanvasElement>('canvas.scope-canvas')];
    if (canvases.length === 0) return;

    const styles = getComputedStyle(document.documentElement);
    const phosphor = styles.getPropertyValue('--phosphor-hot').trim() || '#ffe783';

    for (const canvas of canvases) {
      this.drawCanvas(canvas, phosphor);
    }
  }

  private drawCanvas(canvas: HTMLCanvasElement, phosphor: string): void {
    const signal = canvas.dataset.signal;
    const compositeSignals = canvas.dataset.signals?.split(',').filter(Boolean) ?? [];
    if (!signal && compositeSignals.length === 0) return;

    const ratio = window.devicePixelRatio;
    const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = phosphor;
    ctx.fillStyle = phosphor;
    ctx.lineWidth = Math.max(1, ratio);
    ctx.shadowColor = phosphor;
    ctx.shadowBlur = 3 * ratio;

    const kind = canvas.dataset.kind ?? 'signal';
    if (kind === 'multi-signal') {
      this.drawMultiSignal(ctx, canvas, compositeSignals, width, height, phosphor);
      return;
    }
    if (kind === 'trigger') {
      if (signal) this.drawTriggerPhase(ctx, width, height, signal, phosphor);
      return;
    }

    const data = new Float32Array(512);
    if (!signal || !this.audioEngine.readOscilloscope(signal, data)) return;
    if (kind === 'gate') {
      ctx.beginPath();
      for (let i = 0; i < data.length; i += 1) {
        const x = (i / (data.length - 1)) * width;
        const y = data[i] > 0.3 ? height * 0.25 : height * 0.72;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      return;
    }

    ctx.beginPath();
    for (let i = 0; i < data.length; i += 1) {
      const x = (i / (data.length - 1)) * width;
      const displayValue = this.scopeDisplayValue(signal, data[i], canvas);
      const y = height * 0.5 - displayValue * height * 0.42;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  private drawMultiSignal(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    signals: readonly string[],
    width: number,
    height: number,
    phosphor: string,
  ): void {
    const styles = getComputedStyle(document.documentElement);
    const traceColors = [
      styles.getPropertyValue('--scope-trace-1').trim() || phosphor,
      styles.getPropertyValue('--scope-trace-2').trim() || phosphor,
      styles.getPropertyValue('--scope-trace-3').trim() || phosphor,
      styles.getPropertyValue('--scope-trace-4').trim() || phosphor,
    ];

    signals.forEach((traceSignal, traceIndex) => {
      const data = new Float32Array(512);
      if (!this.audioEngine.readOscilloscope(traceSignal, data)) return;
      const traceColor = traceColors[traceIndex % traceColors.length];
      ctx.strokeStyle = traceColor;
      ctx.shadowColor = traceColor;
      ctx.beginPath();
      for (let i = 0; i < data.length; i += 1) {
        const x = (i / (data.length - 1)) * width;
        const displayValue = this.scopeDisplayValue(traceSignal, data[i], canvas);
        const y = height * 0.5 - displayValue * height * 0.42;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
  }

  private drawTriggerPhase(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    signal: string,
    phosphor: string,
  ): void {
    const ratio = window.devicePixelRatio;
    const events = this.audioEngine.getTriggerViewEvents(signal);
    const left = Math.max(14 * ratio, width * 0.06);
    const right = width - left;
    const span = Math.max(1, right - left);
    const y = height * 0.56;

    ctx.save();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--phosphor-dim').trim() || phosphor;
    ctx.globalAlpha = 0.32;
    ctx.lineWidth = Math.max(1, ratio);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();

    for (const event of events) {
      const x = left + span * event.progress;
      const radius = Math.max(3.0 * ratio, height * 0.05);

      // Each trigger is an independent particle. Its speed is frozen at the
      // moment it is emitted, so later clock changes do not affect particles
      // already travelling across the monitor.
      for (let trail = 5; trail >= 1; trail -= 1) {
        const trailX = Math.max(left, x - trail * 4.5 * ratio);
        ctx.globalAlpha = 0.035 * (6 - trail);
        ctx.fillStyle = phosphor;
        ctx.beginPath();
        ctx.arc(trailX, y, radius * (0.32 + (6 - trail) * 0.055), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.fillStyle = phosphor;
      ctx.shadowColor = phosphor;
      ctx.shadowBlur = 8 * ratio;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private scopeDisplayValue(signal: string, value: number, canvas: HTMLCanvasElement): number {
    const configured = Number(canvas.dataset.scopeRange);
    const range = Number.isFinite(configured) && configured > 0
      ? configured
      : naturalScopeRange([signal]);
    return value / range;
  }
}
