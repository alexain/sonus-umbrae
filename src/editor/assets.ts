export type AudioAsset = {
  id: string;
  alias: string;
  fileName: string;
  file: File;
  channels: number;
  sampleRate: number;
  frames: number;
  duration: number;
  decodedBytes: number;
  pcmChannels: readonly Float32Array[];
};

type MonitorCardFactory = (id: string, title: string, defaultCollapsed: boolean) => HTMLElement;

type AssetLibraryOptions = {
  maxDecodedBytes: number;
  onChange?: () => void;
  onMessage?: (message: string) => void;
  onSampleReady?: (asset: AudioAsset) => void;
  onSampleRemoved?: (alias: string) => void;
};

type AudioMetadata = {
  channels: number;
  sampleRate: number;
  frames: number;
  duration: number;
  decodedBytes: number;
};

type DecodedAudio = AudioMetadata & { pcmChannels: Float32Array[] };

const WAV_HEADER_SCAN_BYTES = 1024 * 1024;

export class AssetLibrary {
  private readonly assets = new Map<string, AudioAsset>();
  private readonly maxDecodedBytes: number;
  private readonly onChange: () => void;
  private readonly onMessage: (message: string) => void;
  private readonly onSampleReady: (asset: AudioAsset) => void;
  private readonly onSampleRemoved: (alias: string) => void;
  private previewAudio: HTMLAudioElement | null = null;
  private previewAlias: string | null = null;
  private previewObjectUrl: string | null = null;

  constructor(options: AssetLibraryOptions) {
    this.maxDecodedBytes = Math.max(1, Math.floor(options.maxDecodedBytes));
    this.onChange = options.onChange ?? (() => undefined);
    this.onMessage = options.onMessage ?? (() => undefined);
    this.onSampleReady = options.onSampleReady ?? (() => undefined);
    this.onSampleRemoved = options.onSampleRemoved ?? (() => undefined);
  }

  getAll(): readonly AudioAsset[] {
    return [...this.assets.values()];
  }

  getByAlias(alias: string): AudioAsset | undefined {
    return this.assets.get(alias);
  }

  getDecodedBytes(): number {
    let total = 0;
    for (const asset of this.assets.values()) total += asset.decodedBytes;
    return total;
  }

  remove(alias: string): boolean {
    if (this.previewAlias === alias) this.stopPreview(false);
    const removed = this.assets.delete(alias);
    if (removed) {
      this.onSampleRemoved(alias);
      this.onChange();
      this.onMessage(`sample ${alias} removed`);
    }
    return removed;
  }

  async importFiles(files: Iterable<File>): Promise<void> {
    let imported = 0;
    for (const file of files) {
      if (!isSupportedAudioFile(file)) {
        this.onMessage(`${file.name}: supported formats are WAV, MP3 and OGG`);
        continue;
      }

      try {
        if (isWavFile(file)) {
          const header = await readWavMetadata(file);
          if (this.getDecodedBytes() + header.decodedBytes > this.maxDecodedBytes) {
            this.onMessage(`${file.name}: sample memory limit exceeded`);
            continue;
          }
        }

        const decoded = await decodeBrowserAudio(file);
        const projected = this.getDecodedBytes() + decoded.decodedBytes;
        if (projected > this.maxDecodedBytes) {
          this.onMessage(`${file.name}: sample memory limit exceeded`);
          continue;
        }

        const alias = uniqueAlias(file.name, new Set(this.assets.keys()));
        const asset: AudioAsset = {
          id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
          alias,
          fileName: file.name,
          file,
          ...decoded,
        };
        this.assets.set(alias, asset);
        this.onSampleReady(asset);
        imported += 1;
      } catch (error) {
        this.onMessage(error instanceof Error ? `${file.name}: ${error.message}` : `${file.name}: invalid or unsupported audio file`);
      }
    }

    if (imported > 0) {
      this.onChange();
      this.onMessage(`${imported} sample${imported === 1 ? '' : 's'} imported`);
    }
  }

  buildPanel(createMonitorCard: MonitorCardFactory): HTMLElement {
    const card = createMonitorCard('Assets', 'ASSETS / SAMPLES', false);
    card.classList.add('assets-monitor-card');
    const body = card.querySelector<HTMLElement>('.monitor-body');
    if (!body) return card;

    const summary = document.createElement('div');
    summary.className = 'assets-summary';
    const memory = document.createElement('span');
    memory.textContent = `MEMORY ${formatBytes(this.getDecodedBytes())} / ${formatBytes(this.maxDecodedBytes)}`;
    const count = document.createElement('span');
    count.textContent = `${this.assets.size} FILE${this.assets.size === 1 ? '' : 'S'}`;
    summary.append(memory, count);

    const zone = document.createElement('div');
    zone.className = 'assets-drop-zone';
    zone.tabIndex = 0;
    zone.setAttribute('role', 'button');
    zone.setAttribute('aria-label', 'Import audio files');

    const input = document.createElement('input');
    input.className = 'assets-file-input';
    input.type = 'file';
    input.accept = '.wav,.mp3,.ogg,audio/wav,audio/x-wav,audio/mpeg,audio/mp3,audio/ogg,application/ogg';
    input.multiple = true;

    const list = document.createElement('div');
    list.className = 'assets-list';
    if (this.assets.size === 0) {
      const empty = document.createElement('div');
      empty.className = 'assets-empty';
      empty.textContent = 'DROP AUDIO FILES HERE';
      list.append(empty);
    } else {
      for (const asset of this.assets.values()) list.append(this.buildAssetRow(asset));
    }

    const overlay = document.createElement('div');
    overlay.className = 'assets-drop-overlay';
    const plus = document.createElement('div');
    plus.className = 'assets-drop-plus';
    plus.textContent = '+';
    const label = document.createElement('div');
    label.className = 'assets-drop-label';
    label.textContent = 'DROP AUDIO FILES TO IMPORT';
    overlay.append(plus, label);

    let dragDepth = 0;
    zone.addEventListener('click', (event) => {
      if ((event.target as Element).closest('.asset-delete, .asset-preview')) return;
      input.click();
    });
    zone.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      input.click();
    });
    input.addEventListener('change', () => {
      const files = input.files ? Array.from(input.files) : [];
      input.value = '';
      void this.importFiles(files);
    });
    zone.addEventListener('dragenter', (event) => {
      if (!hasFiles(event.dataTransfer)) return;
      event.preventDefault();
      dragDepth += 1;
      zone.classList.add('drag-active');
    });
    zone.addEventListener('dragover', (event) => {
      if (!hasFiles(event.dataTransfer)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      zone.classList.add('drag-active');
    });
    zone.addEventListener('dragleave', (event) => {
      if (!hasFiles(event.dataTransfer)) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) zone.classList.remove('drag-active');
    });
    zone.addEventListener('drop', (event) => {
      if (!hasFiles(event.dataTransfer)) return;
      event.preventDefault();
      dragDepth = 0;
      zone.classList.remove('drag-active');
      const files = event.dataTransfer ? Array.from(event.dataTransfer.files) : [];
      void this.importFiles(files);
    });

    zone.append(input, list, overlay);
    body.append(summary, zone);
    return card;
  }

  private buildAssetRow(asset: AudioAsset): HTMLElement {
    const row = document.createElement('div');
    row.className = 'asset-row';

    const preview = document.createElement('button');
    preview.className = 'asset-preview';
    preview.type = 'button';
    preview.title = this.previewAlias === asset.alias ? `Stop ${asset.alias} preview` : `Preview ${asset.alias}`;
    preview.setAttribute('aria-label', preview.title);
    preview.classList.toggle('playing', this.previewAlias === asset.alias);
    preview.innerHTML = this.previewAlias === asset.alias
      ? '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 5.5h3v9H6zM11 5.5h3v9h-3z"/></svg>'
      : '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.5 4.5l8 5.5-8 5.5z"/></svg>';
    preview.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.togglePreview(asset);
    });

    const copy = document.createElement('div');
    copy.className = 'asset-copy';
    const alias = document.createElement('div');
    alias.className = 'asset-alias';
    alias.textContent = asset.alias;
    alias.title = asset.alias;
    const meta = document.createElement('div');
    meta.className = 'asset-meta';
    meta.textContent = `${asset.fileName} · ${formatDuration(asset.duration)} · ${asset.channels} CH · ${formatSampleRate(asset.sampleRate)} · ${formatBytes(asset.decodedBytes)}`;
    meta.title = meta.textContent;
    copy.append(alias, meta);

    const remove = document.createElement('button');
    remove.className = 'asset-delete';
    remove.type = 'button';
    remove.title = `Remove ${asset.alias} from memory`;
    remove.setAttribute('aria-label', `Remove ${asset.alias} from memory`);
    remove.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 5.5h13M7 5.5V3.7h6v1.8M5.5 5.5l.8 11h7.4l.8-11M8.2 8v5.8M11.8 8v5.8"/></svg>';
    remove.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.remove(asset.alias);
    });

    row.append(preview, copy, remove);
    return row;
  }

  private async togglePreview(asset: AudioAsset): Promise<void> {
    if (this.previewAlias === asset.alias) {
      this.stopPreview();
      return;
    }

    this.stopPreview(false);
    const url = URL.createObjectURL(asset.file);
    const audio = new Audio(url);
    audio.preload = 'auto';
    this.previewAudio = audio;
    this.previewAlias = asset.alias;
    this.previewObjectUrl = url;
    audio.addEventListener('ended', () => this.stopPreview(), { once: true });
    audio.addEventListener('error', () => {
      this.stopPreview(false);
      this.onMessage(`${asset.fileName}: preview failed`);
      this.onChange();
    }, { once: true });
    this.onChange();

    try {
      await audio.play();
    } catch (error) {
      this.stopPreview(false);
      this.onMessage(error instanceof Error ? `${asset.fileName}: ${error.message}` : `${asset.fileName}: preview failed`);
      this.onChange();
    }
  }

  private stopPreview(refresh = true): void {
    const audio = this.previewAudio;
    const url = this.previewObjectUrl;
    this.previewAudio = null;
    this.previewAlias = null;
    this.previewObjectUrl = null;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    if (url) URL.revokeObjectURL(url);
    if (refresh) this.onChange();
  }
}

function hasFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  return [...dataTransfer.types].includes('Files');
}

function isWavFile(file: File): boolean {
  return /\.wav$/i.test(file.name) || file.type === 'audio/wav' || file.type === 'audio/x-wav' || file.type === 'audio/wave';
}

function isSupportedAudioFile(file: File): boolean {
  return /\.(wav|mp3|ogg)$/i.test(file.name)
    || isWavFile(file)
    || file.type === 'audio/mpeg'
    || file.type === 'audio/mp3'
    || file.type === 'audio/ogg'
    || file.type === 'application/ogg';
}

function uniqueAlias(fileName: string, existing: ReadonlySet<string>): string {
  const withoutExtension = fileName.replace(/\.[^.]*$/, '');
  let base = withoutExtension
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  if (!base) base = 'sample';
  if (!/^[A-Za-z]/.test(base)) base = `sample_${base}`;

  let alias = base;
  let suffix = 2;
  while (existing.has(alias)) {
    alias = `${base}_${suffix}`;
    suffix += 1;
  }
  return alias;
}

async function readWavMetadata(file: File): Promise<AudioMetadata> {
  const scanBytes = Math.min(file.size, WAV_HEADER_SCAN_BYTES);
  const buffer = await file.slice(0, scanBytes).arrayBuffer();
  const view = new DataView(buffer);
  if (view.byteLength < 12 || ascii(view, 0, 4) !== 'RIFF' || ascii(view, 8, 4) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file');
  }

  let channels = 0;
  let sampleRate = 0;
  let blockAlign = 0;
  let dataBytes = -1;
  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const chunkId = ascii(view, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const dataOffset = offset + 8;
    if (chunkId === 'fmt ' && chunkSize >= 16 && dataOffset + 16 <= view.byteLength) {
      channels = view.getUint16(dataOffset + 2, true);
      sampleRate = view.getUint32(dataOffset + 4, true);
      blockAlign = view.getUint16(dataOffset + 12, true);
    } else if (chunkId === 'data') {
      dataBytes = chunkSize;
      break;
    }
    const next = dataOffset + chunkSize + (chunkSize & 1);
    if (next <= offset) break;
    offset = next;
  }

  if (channels < 1 || sampleRate < 1 || blockAlign < 1) throw new Error('missing or invalid WAV fmt chunk');
  if (dataBytes < 0) throw new Error('WAV data chunk not found in header');
  const frames = Math.floor(dataBytes / blockAlign);
  const duration = frames / sampleRate;
  const decodedBytes = frames * channels * Float32Array.BYTES_PER_ELEMENT;
  if (!Number.isFinite(duration) || duration < 0 || !Number.isSafeInteger(decodedBytes)) throw new Error('invalid WAV size');
  return { channels, sampleRate, frames, duration, decodedBytes };
}

async function decodeBrowserAudio(file: File): Promise<DecodedAudio> {
  const AudioContextClass = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) throw new Error('browser audio decoder is not available');

  const context = new AudioContextClass();
  try {
    const encoded = await file.arrayBuffer();
    const audio = await context.decodeAudioData(encoded.slice(0));
    const channels = audio.numberOfChannels;
    const sampleRate = audio.sampleRate;
    const frames = audio.length;
    const duration = audio.duration;
    const decodedBytes = frames * channels * Float32Array.BYTES_PER_ELEMENT;
    if (channels < 1 || sampleRate < 1 || frames < 0 || !Number.isFinite(duration) || !Number.isSafeInteger(decodedBytes)) {
      throw new Error('invalid decoded audio metadata');
    }
    const pcmChannels = Array.from({ length: channels }, (_, channel) => new Float32Array(audio.getChannelData(channel)));
    return { channels, sampleRate, frames, duration, decodedBytes, pcmChannels };
  } finally {
    await context.close().catch(() => undefined);
  }
}

function ascii(view: DataView, offset: number, length: number): string {
  let text = '';
  for (let index = 0; index < length; index += 1) text += String.fromCharCode(view.getUint8(offset + index));
  return text;
}

function formatDuration(seconds: number): string {
  if (seconds < 10) return `${seconds.toFixed(2)} S`;
  if (seconds < 60) return `${seconds.toFixed(1)} S`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${String(remaining).padStart(2, '0')}`;
}

function formatSampleRate(sampleRate: number): string {
  return sampleRate >= 1000 ? `${Number((sampleRate / 1000).toFixed(1))} KHZ` : `${sampleRate} HZ`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Number(kb.toFixed(kb < 10 ? 1 : 0))} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${Number(mb.toFixed(mb < 10 ? 1 : 0))} MB`;
  const gb = mb / 1024;
  return `${Number(gb.toFixed(2))} GB`;
}
