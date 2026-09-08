export type AppScreen = 'live' | 'config' | 'help' | 'about' | 'scheme';

interface AppShellElements {
  editor: HTMLTextAreaElement;
  commandbar: HTMLElement;
  command: HTMLInputElement;
  liveScreen: HTMLElement;
  configScreen: HTMLElement;
  helpScreen: HTMLElement;
  aboutScreen: HTMLElement;
  schemeScreen: HTMLElement;
  quickMenuOverlay: HTMLElement;
}

interface AppShellHooks {
  clearDiagnostic: () => void;
  renderScheme: () => void;
  resetConfigNavigation: () => void;
  refreshAudioConfig: () => void;
  positionBlockCaret: () => void;
}

export class AppShell {
  screen: AppScreen = 'live';
  commandMode = false;

  private savedEditorSelection: {
    start: number;
    end: number;
    direction: 'forward' | 'backward' | 'none';
  } | null = null;

  constructor(
    private readonly elements: AppShellElements,
    private readonly hooks: AppShellHooks,
  ) {}

  showScreen(next: AppScreen): void {
    if (next !== 'live') this.hooks.clearDiagnostic();
    this.screen = next;

    const screens: Array<[AppScreen, HTMLElement]> = [
      ['live', this.elements.liveScreen],
      ['config', this.elements.configScreen],
      ['help', this.elements.helpScreen],
      ['about', this.elements.aboutScreen],
      ['scheme', this.elements.schemeScreen],
    ];
    for (const [name, element] of screens) {
      const hidden = next !== name;
      element.classList.toggle('hidden', hidden);
      element.setAttribute('aria-hidden', String(hidden));
    }

    if (next === 'scheme') this.hooks.renderScheme();
    if (next === 'config') {
      this.hooks.resetConfigNavigation();
      this.hooks.refreshAudioConfig();
    }
    if (next === 'live') this.elements.editor.focus();
    requestAnimationFrame(this.hooks.positionBlockCaret);
  }

  enterCommandMode(): void {
    if (this.screen !== 'live') return;
    this.saveEditorSelection();
    this.commandMode = true;
    this.elements.commandbar.classList.remove('hidden');
    this.elements.command.value = '';
    this.elements.command.focus();
    this.hooks.positionBlockCaret();
  }

  leaveCommandMode(): void {
    this.commandMode = false;
    this.elements.commandbar.classList.add('hidden');
    this.elements.command.value = '';
    this.restoreEditorSelection();
    requestAnimationFrame(this.hooks.positionBlockCaret);
  }

  resetSavedEditorSelection(): void {
    this.savedEditorSelection = null;
  }

  openQuickMenu(): void {
    if (this.screen !== 'live' || this.commandMode) return;
    this.elements.quickMenuOverlay.classList.remove('hidden');
  }

  closeQuickMenu(): void {
    this.elements.quickMenuOverlay.classList.add('hidden');
    this.elements.editor.focus();
    requestAnimationFrame(this.hooks.positionBlockCaret);
  }

  isQuickMenuOpen(): boolean {
    return !this.elements.quickMenuOverlay.classList.contains('hidden');
  }

  private saveEditorSelection(): void {
    this.savedEditorSelection = {
      start: this.elements.editor.selectionStart,
      end: this.elements.editor.selectionEnd,
      direction: this.elements.editor.selectionDirection ?? 'none',
    };
  }

  private restoreEditorSelection(): void {
    const editor = this.elements.editor;
    editor.focus();

    if (this.savedEditorSelection) {
      const max = editor.value.length;
      editor.setSelectionRange(
        Math.min(this.savedEditorSelection.start, max),
        Math.min(this.savedEditorSelection.end, max),
        this.savedEditorSelection.direction,
      );
    } else {
      const end = editor.value.length;
      editor.setSelectionRange(end, end);
    }

    this.savedEditorSelection = null;
  }
}
