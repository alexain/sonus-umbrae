import type { AudioEngine } from '../audio/engine';
import type { SonusRuntime } from '../language/runtime';
import type { AppScreen } from '../ui/app-shell';

export interface CommandContext {
  audioEngine: AudioEngine;
  runtime: SonusRuntime;
  leaveCommandMode: () => void;
  showScreen: (screen: AppScreen) => void;
  clearSource: () => void;
  saveSource: (fileName?: string) => Promise<void>;
  loadSource: () => Promise<void>;
  stopLiveCode: () => void;
  isCodeRunning: () => boolean;
  evaluateLiveSource: () => boolean;
  recompileLiveCode: () => boolean;
  setCodeRunning: (running: boolean) => void;
  sourceText: () => string;
  setAudioAutoStartPending: (pending: boolean) => void;
  syncViews: () => void;
  notify: (message: string) => void;
}

export async function runAppCommand(raw: string, context: CommandContext): Promise<void> {
  const [name = '', ...args] = raw.trim().toLowerCase().split(/\s+/);
  const leave = context.leaveCommandMode;

  switch (name) {
    case '':
      leave();
      return;
    case 'config':
    case 'help':
    case 'about':
    case 'scheme':
      leave();
      context.showScreen(name);
      return;
    case 'new':
    case 'clear':
      context.clearSource();
      leave();
      context.notify('source cleared');
      return;
    case 'save':
      leave();
      await context.saveSource(args[0]);
      return;
    case 'load':
      leave();
      await context.loadSource();
      return;
    case 'run': {
      leave();
      const action = args[0]?.toLowerCase();
      if (action === 'stop') {
        context.stopLiveCode();
        return;
      }
      if (action !== undefined) {
        context.notify('usage: :run | :run stop');
        return;
      }
      const applied = context.isCodeRunning()
        ? context.recompileLiveCode()
        : context.evaluateLiveSource();
      if (applied) {
        context.setCodeRunning(true);
        context.notify('live code running');
      }
      return;
    }
    case 'start':
      leave();
      try {
        await context.audioEngine.start();
        context.setAudioAutoStartPending(false);
        if (!context.sourceText().trim()) context.runtime.evaluate('');
        context.syncViews();
        context.notify('audio engine running');
      } catch (error) {
        context.notify(error instanceof Error ? error.message : 'audio start failed');
      }
      return;
    case 'stop':
      leave();
      try {
        await context.audioEngine.stop();
        context.notify('audio engine stopped');
      } catch {
        context.notify('audio stop failed');
      }
      return;
    case 'test': {
      leave();
      if (args[0] === 'stop') {
        context.audioEngine.stopTestTone();
        context.notify('test tone stopped');
        return;
      }

      const frequency = args[0] === undefined ? 440 : Number(args[0]);
      try {
        await context.audioEngine.testTone(frequency);
        context.notify(`test tone ${Math.round(frequency)} hz`);
      } catch (error) {
        context.notify(error instanceof RangeError ? error.message : 'test tone failed');
      }
      return;
    }
    case 'clock': {
      const action = args[0]?.toLowerCase();
      if (action === 'start') {
        context.audioEngine.setClockTransport(true);
        context.notify('clock started');
      } else if (action === 'stop') {
        context.audioEngine.setClockTransport(false);
        context.notify('clock stopped');
      } else {
        context.notify('usage: :clock start | :clock stop');
      }
      leave();
      return;
    }
    case 'life': {
      const action = args[0]?.toLowerCase();
      if (action !== 'reset' || args.length > 2) {
        context.notify('usage: :life reset [name]');
        leave();
        return;
      }
      const target = args[1];
      const reset = context.runtime.resetLife(target);
      context.syncViews();
      leave();
      if (reset.length === 0) context.notify(target ? `unknown SEQ life: ${target}` : 'no active SEQ life');
      else context.notify(target ? `life ${target} reset` : `reset ${reset.length} life sequence${reset.length === 1 ? '' : 's'}`);
      return;
    }
    case 'panic':
      leave();
      context.audioEngine.panic();
      context.notify('panic');
      return;
    default:
      leave();
      context.notify(`unknown command: ${name}`);
  }
}
