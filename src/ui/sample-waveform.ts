import type { AudioEngine } from '../audio/engine';
import type { AssetLibrary } from '../editor/assets';

export function updateSampleWaveformViews(
  assetLibrary: Pick<AssetLibrary, 'getByAlias'>,
  audioEngine: Pick<AudioEngine, 'getSampleVoiceProgress'>,
): void {
  const styles = getComputedStyle(document.documentElement);
  const phosphor = styles.getPropertyValue('--phosphor-hot').trim() || '#ffe783';
  const sliceGuide = styles.getPropertyValue('--sample-slice-guide').trim() || '#63e6e2';
  const regionMask = styles.getPropertyValue('--bg').trim() || '#050605';

  for (const canvas of document.querySelectorAll<HTMLCanvasElement>('canvas.sample-waveform-canvas')) {
    const alias = canvas.dataset.sampleAlias ?? '';
    const owner = canvas.dataset.sampleOwner ?? '';
    const asset = alias ? assetLibrary.getByAlias(alias) : undefined;
    const width = Math.max(1, Math.floor(canvas.clientWidth * window.devicePixelRatio));
    const height = Math.max(1, Math.floor(canvas.clientHeight * window.devicePixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = phosphor;
    ctx.fillStyle = phosphor;
    ctx.lineWidth = Math.max(1, window.devicePixelRatio);
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const channel = asset?.pcmChannels[0];
    if (channel?.length) {
      const bins = Math.max(1, Math.min(width, Math.floor(width / Math.max(1, window.devicePixelRatio))));
      const step = channel.length / bins;
      ctx.beginPath();
      for (let x = 0; x < bins; x += 1) {
        const from = Math.floor(x * step);
        const to = Math.max(from + 1, Math.min(channel.length, Math.floor((x + 1) * step)));
        let lo = 1;
        let hi = -1;
        for (let i = from; i < to; i += 1) {
          const value = channel[i];
          if (value < lo) lo = value;
          if (value > hi) hi = value;
        }
        const px = x / Math.max(1, bins - 1) * width;
        ctx.moveTo(px, height * (0.5 - hi * 0.45));
        ctx.lineTo(px, height * (0.5 - lo * 0.45));
      }
      ctx.stroke();
    }

    const start = Math.max(0, Math.min(100, Number(canvas.dataset.sampleStart ?? 0))) / 100;
    const end = Math.max(0, Math.min(100, Number(canvas.dataset.sampleEnd ?? 100))) / 100;
    const previousFill = ctx.fillStyle;
    ctx.fillStyle = regionMask;
    ctx.globalAlpha = 0.82;
    ctx.fillRect(0, 0, start * width, height);
    ctx.fillRect(end * width, 0, (1 - end) * width, height);
    ctx.globalAlpha = 1;
    ctx.fillStyle = previousFill;

    const configuredSlices = Math.max(0, Math.floor(Number(canvas.dataset.sampleSlices ?? 0)));
    if (configuredSlices > 0 && end > start) {
      const previousStroke = ctx.strokeStyle;
      ctx.strokeStyle = sliceGuide;
      ctx.globalAlpha = 0.72;
      ctx.lineWidth = Math.max(1, window.devicePixelRatio);
      for (let slice = 0; slice <= configuredSlices; slice += 1) {
        const x = (start + (end - start) * (slice / configuredSlices)) * width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      ctx.strokeStyle = previousStroke;
      ctx.globalAlpha = 1;
    }

    const progress = owner ? audioEngine.getSampleVoiceProgress(owner) : null;
    if (progress?.activeSlice && configuredSlices > 0) {
      const sliceStart = start + (end - start) * ((progress.activeSlice - 1) / configuredSlices);
      const sliceEnd = start + (end - start) * (progress.activeSlice / configuredSlices);
      ctx.globalAlpha = 0.12;
      ctx.fillRect(sliceStart * width, 0, (sliceEnd - sliceStart) * width, height);
      ctx.globalAlpha = 1;
    }

    const position = progress?.position ?? start;
    ctx.lineWidth = Math.max(1, 2 * window.devicePixelRatio);
    ctx.beginPath();
    ctx.moveTo(position * width, 0);
    ctx.lineTo(position * width, height);
    ctx.stroke();
    if (progress?.active && configuredSlices === 0) {
      ctx.globalAlpha = 0.14;
      ctx.fillRect(start * width, 0, Math.max(0, (position - start) * width), height);
      ctx.globalAlpha = 1;
    }
  }
}
