import type { AudioLatencyMode } from '../audio/engine';

const CONFIG_STATE_KEY = 'sonus-umbrae.config';

export type SampleRateChoice = 0 | 44100 | 48000 | 88200 | 96000;

export type AudioConfigChoice = {
  sampleRate: SampleRateChoice;
  outputDeviceId: string;
  latencyMode: AudioLatencyMode;
};

export type AppConfig = {
  showVariables: boolean;
  showMetrics: boolean;
  showAssets: boolean;
  showDspStatus: boolean;
  liveControlHz: 60 | 30 | 20 | 15;
  sampleRate: SampleRateChoice;
  outputDeviceId: string;
  latencyMode: AudioLatencyMode;
  outputLevel: number;
  objectToggleKey: string;
  schemeToggleKey: string;
};

export function createDefaultAppConfig(): AppConfig {
  return {
    showVariables: false,
    showMetrics: false,
    showAssets: false,
    showDspStatus: true,
    liveControlHz: 60,
    sampleRate: 0,
    outputDeviceId: '',
    latencyMode: 'interactive',
    outputLevel: 100,
    objectToggleKey: '\\',
    schemeToggleKey: '1',
  };
}

export function normalizeShortcutKey(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const characters = Array.from(value.trim());
  if (characters.length !== 1 || characters[0] === '/') return fallback;
  const key = characters[0];
  return /^[A-Z]$/i.test(key) ? key.toLowerCase() : key;
}

export function shortcutMatches(event: KeyboardEvent, configuredKey: string): boolean {
  const eventKey = /^[A-Z]$/i.test(event.key) ? event.key.toLowerCase() : event.key;
  const targetKey = /^[A-Z]$/i.test(configuredKey) ? configuredKey.toLowerCase() : configuredKey;
  return eventKey === targetKey;
}

export function loadAppConfig(): AppConfig {
  const fallback = createDefaultAppConfig();
  try {
    const raw = localStorage.getItem(CONFIG_STATE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    const hz = parsed.liveControlHz;
    return {
      showVariables: parsed.showVariables ?? false,
      showMetrics: parsed.showMetrics ?? false,
      showAssets: parsed.showAssets ?? false,
      showDspStatus: parsed.showDspStatus ?? true,
      liveControlHz: hz === 30 || hz === 20 || hz === 15 ? hz : 60,
      sampleRate: parsed.sampleRate === 44100 || parsed.sampleRate === 48000 || parsed.sampleRate === 88200 || parsed.sampleRate === 96000 ? parsed.sampleRate : 0,
      outputDeviceId: typeof parsed.outputDeviceId === 'string' ? parsed.outputDeviceId : '',
      latencyMode: parsed.latencyMode === 'balanced' || parsed.latencyMode === 'playback' ? parsed.latencyMode : 'interactive',
      outputLevel: Number.isFinite(parsed.outputLevel)
        ? Math.max(0, Math.min(200, Number(parsed.outputLevel)))
        : 100,
      objectToggleKey: normalizeShortcutKey(parsed.objectToggleKey, '\\'),
      // v2 briefly shipped '|' as the Scheme default. Migrate that default
      // because modifier handling varies across keyboard layouts/browsers.
      schemeToggleKey: normalizeShortcutKey(parsed.schemeToggleKey === '|' ? undefined : parsed.schemeToggleKey, '1'),
    };
  } catch {
    return fallback;
  }
}

export function saveAppConfig(config: AppConfig): void {
  localStorage.setItem(CONFIG_STATE_KEY, JSON.stringify(config));
}

export function parseSampleRateChoice(value: unknown): SampleRateChoice {
  const numeric = Number(value);
  return numeric === 44100 || numeric === 48000 || numeric === 88200 || numeric === 96000 ? numeric : 0;
}
