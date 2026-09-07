type EditorVisualLayerOptions = {
  editor: HTMLTextAreaElement;
  blockCaret: HTMLElement;
  phosphorLayer: HTMLElement;
  isCaretVisible: () => boolean;
  inlineSpacerBeforePhysicalLine: (line: number) => number;
};

export class EditorVisualLayer {
  private lastCaretTrailPosition: { left: number; top: number } | null = null;

  constructor(private readonly options: EditorVisualLayerOptions) {}

  lineRect(lineNumber: number): DOMRect | null {
    const { editor } = this.options;
    const lines = editor.value.split('\n');
    if (lineNumber < 1 || lineNumber > lines.length) return null;
    let offset = 0;
    for (let index = 0; index < lineNumber - 1; index += 1) offset += lines[index].length + 1;

    const editorRect = editor.getBoundingClientRect();
    const style = getComputedStyle(editor);
    const mirror = this.createMirror(editorRect, style);
    mirror.append(document.createTextNode(editor.value.slice(0, offset)));
    const marker = document.createElement('span');
    marker.style.display = 'inline-block';
    marker.style.height = style.lineHeight;
    marker.textContent = lines[lineNumber - 1] || '\u200b';
    mirror.append(marker);
    document.body.append(mirror);
    const markerRect = marker.getBoundingClientRect();
    mirror.remove();
    return new DOMRect(
      markerRect.left - editor.scrollLeft,
      markerRect.top - editor.scrollTop,
      markerRect.width,
      markerRect.height || Number.parseFloat(style.lineHeight) || 24,
    );
  }

  offsetRect(offset: number): DOMRect | null {
    const { editor, inlineSpacerBeforePhysicalLine } = this.options;
    const safeOffset = Math.max(0, Math.min(editor.value.length, offset));
    const editorRect = editor.getBoundingClientRect();
    const style = getComputedStyle(editor);
    const mirror = this.createMirror(editorRect, style);
    mirror.style.height = 'auto';
    mirror.style.textTransform = style.textTransform;
    mirror.style.tabSize = style.tabSize;
    mirror.append(document.createTextNode(editor.value.slice(0, safeOffset)));
    const marker = document.createElement('span');
    marker.style.display = 'inline-block';
    marker.style.width = '0';
    marker.style.height = '1em';
    marker.style.verticalAlign = 'top';
    marker.textContent = '\u200b';
    mirror.append(marker);
    document.body.append(mirror);
    const markerRect = marker.getBoundingClientRect();
    mirror.remove();

    const left = markerRect.left - editor.scrollLeft;
    const physicalLine = editor.value.slice(0, safeOffset).split('\n').length;
    const top = markerRect.top - editor.scrollTop + inlineSpacerBeforePhysicalLine(physicalLine);
    return new DOMRect(left, top, 0, markerRect.height || Number.parseFloat(style.lineHeight) || 24);
  }

  caretRect(): DOMRect | null {
    return this.offsetRect(this.options.editor.selectionStart);
  }

  leaveCaretTrail(): void {
    const { editor, blockCaret, phosphorLayer, isCaretVisible } = this.options;
    if (!isCaretVisible() || document.activeElement !== editor) return;
    if (blockCaret.classList.contains('hidden')) return;
    const left = blockCaret.style.left;
    const top = blockCaret.style.top;
    if (!left || !top) return;
    const trail = document.createElement('span');
    trail.className = 'block-caret-trail';
    trail.style.fontSize = blockCaret.style.fontSize;
    trail.style.left = left;
    trail.style.top = top;
    phosphorLayer.append(trail);
    window.setTimeout(() => trail.remove(), 360);
  }

  positionCaret(): void {
    const { editor, blockCaret, phosphorLayer, isCaretVisible } = this.options;
    if (!isCaretVisible() || document.activeElement !== editor) {
      blockCaret.classList.add('hidden');
      this.lastCaretTrailPosition = null;
      return;
    }

    const rect = this.caretRect();
    if (!rect) {
      blockCaret.classList.add('hidden');
      this.lastCaretTrailPosition = null;
      return;
    }

    const host = phosphorLayer.getBoundingClientRect();
    const editorStyle = getComputedStyle(editor);
    const fontSize = Number.parseFloat(editorStyle.fontSize) || 20;
    const left = rect.left - host.left;
    const caretHeight = fontSize * 0.92;
    const top = rect.top - host.top + Math.max(0, (rect.height - caretHeight) * 0.5);

    if (this.lastCaretTrailPosition && (Math.abs(this.lastCaretTrailPosition.left - left) > 0.5 || Math.abs(this.lastCaretTrailPosition.top - top) > 0.5)) {
      const trail = document.createElement('span');
      trail.className = 'block-caret-trail';
      trail.style.fontSize = `${fontSize}px`;
      trail.style.left = `${this.lastCaretTrailPosition.left}px`;
      trail.style.top = `${this.lastCaretTrailPosition.top}px`;
      phosphorLayer.append(trail);
      window.setTimeout(() => trail.remove(), 360);
    }

    this.lastCaretTrailPosition = { left, top };
    blockCaret.style.fontSize = `${fontSize}px`;
    blockCaret.style.left = `${left}px`;
    blockCaret.style.top = `${top}px`;
    blockCaret.classList.remove('hidden');
  }

  flashAtCaret(text: string): void {
    if (!text || text === '\n') return;
    const rect = this.caretRect();
    if (!rect) return;
    const { editor, phosphorLayer } = this.options;
    const host = phosphorLayer.getBoundingClientRect();
    const editorStyle = getComputedStyle(editor);
    const fontSize = Number.parseFloat(editorStyle.fontSize) || 20;
    const pulse = document.createElement('span');
    pulse.className = 'phosphor-pulse';
    pulse.style.fontSize = `${fontSize}px`;
    pulse.style.left = `${rect.left - host.left}px`;
    pulse.style.top = `${rect.top - host.top + Math.max(0, (rect.height - fontSize * 0.82) * 0.5)}px`;
    phosphorLayer.appendChild(pulse);
    window.setTimeout(() => pulse.remove(), 320);
  }

  private createMirror(editorRect: DOMRect, style: CSSStyleDeclaration): HTMLDivElement {
    const mirror = document.createElement('div');
    mirror.setAttribute('aria-hidden', 'true');
    mirror.style.position = 'fixed';
    mirror.style.visibility = 'hidden';
    mirror.style.pointerEvents = 'none';
    mirror.style.left = `${editorRect.left}px`;
    mirror.style.top = `${editorRect.top}px`;
    mirror.style.width = `${this.options.editor.clientWidth}px`;
    mirror.style.margin = '0';
    mirror.style.padding = style.padding;
    mirror.style.border = style.border;
    mirror.style.boxSizing = style.boxSizing;
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.overflowWrap = style.overflowWrap;
    mirror.style.wordBreak = style.wordBreak;
    mirror.style.fontFamily = style.fontFamily;
    mirror.style.fontSize = style.fontSize;
    mirror.style.fontWeight = style.fontWeight;
    mirror.style.fontStyle = style.fontStyle;
    mirror.style.fontVariant = style.fontVariant;
    mirror.style.lineHeight = style.lineHeight;
    mirror.style.letterSpacing = style.letterSpacing;
    return mirror;
  }
}
