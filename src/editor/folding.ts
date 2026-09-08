export type FoldMarkerRange = {
  start: number;
  end: number;
  headerEnd: number;
  nextLineStart: number | null;
};

type CollapsedEditorBlock = { body: string };

type FoldingOptions = {
  editor: HTMLTextAreaElement;
  lineGutterContent: HTMLElement;
  inlineViewRowHeight: number;
  commentStart: (line: string) => number;
  statementLabels: (source: string) => string[];
  inlineViewCountAtLine: (physicalLine: number) => number;
  diagnosticLines: () => ReadonlySet<number>;
  liveDisableHeader: (line: string) => { disabled: boolean } | null;
  toggleObjectDisabledAtPhysicalLine: (physicalLine: number) => void;
  afterMutation: () => void;
};

export class EditorFolding {
  private readonly collapsedBlocks = new Map<string, CollapsedEditorBlock>();
  private nextCollapsedBlockId = 1;

  constructor(private readonly options: FoldingOptions) {}

  markerId(line: string): string | null {
    const match = line.match(/^\s*\/\/~F(\d+)\s*$/);
    return match?.[1] ?? null;
  }

  markerRanges(value = this.options.editor.value): FoldMarkerRange[] {
    const lines = value.split('\n');
    const ranges: FoldMarkerRange[] = [];
    let offset = 0;
    let previousLineStart = 0;
    let previousLineLength = 0;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (this.markerId(line)) {
        const end = offset + line.length;
        ranges.push({
          start: offset,
          end,
          headerEnd: index > 0 ? previousLineStart + previousLineLength : offset,
          nextLineStart: index < lines.length - 1 ? end + 1 : null,
        });
      }
      previousLineStart = offset;
      previousLineLength = line.length;
      offset += line.length + 1;
    }
    return ranges;
  }

  keepCaretOutOfMarker(): boolean {
    const { editor } = this.options;
    if (document.activeElement !== editor || editor.selectionStart !== editor.selectionEnd) return false;
    const caret = editor.selectionStart;
    const marker = this.markerRanges().find((range) => caret >= range.start && caret <= range.end);
    if (!marker) return false;
    editor.setSelectionRange(marker.headerEnd, marker.headerEnd);
    return true;
  }

  skipMarkerWithArrow(direction: 'up' | 'down'): boolean {
    const { editor } = this.options;
    if (editor.selectionStart !== editor.selectionEnd) return false;
    const caret = editor.selectionStart;
    for (const marker of this.markerRanges()) {
      if (direction === 'down' && caret <= marker.headerEnd && caret >= editor.value.lastIndexOf('\n', Math.max(0, marker.headerEnd - 1)) + 1) {
        if (marker.nextLineStart === null) return true;
        editor.setSelectionRange(marker.nextLineStart, marker.nextLineStart);
        return true;
      }
      if (direction === 'up' && marker.nextLineStart !== null) {
        const nextLineEndAt = editor.value.indexOf('\n', marker.nextLineStart);
        const nextLineEnd = nextLineEndAt < 0 ? editor.value.length : nextLineEndAt;
        if (caret >= marker.nextLineStart && caret <= nextLineEnd) {
          editor.setSelectionRange(marker.headerEnd, marker.headerEnd);
          return true;
        }
      }
    }
    return false;
  }

  protectMarkerBoundary(key: 'Backspace' | 'Delete'): boolean {
    const { editor } = this.options;
    if (editor.selectionStart !== editor.selectionEnd) return false;
    const caret = editor.selectionStart;
    for (const marker of this.markerRanges()) {
      if (key === 'Delete' && caret === marker.headerEnd) return true;
      if (key === 'Backspace' && marker.nextLineStart !== null && caret === marker.nextLineStart) return true;
    }
    return false;
  }

  expandMarkers(value: string): string {
    let expanded = value;
    for (let pass = 0; pass < 64; pass += 1) {
      let changed = false;
      const lines = expanded.split('\n');
      const rebuilt: string[] = [];
      for (const line of lines) {
        const id = this.markerId(line);
        const block = id ? this.collapsedBlocks.get(id) : undefined;
        if (!block) {
          rebuilt.push(line);
          continue;
        }
        changed = true;
        const body = block.body.endsWith('\n') ? block.body.slice(0, -1) : block.body;
        rebuilt.push(...body.split('\n'));
      }
      expanded = rebuilt.join('\n');
      if (!changed) break;
    }
    return expanded;
  }

  clear(): void {
    this.collapsedBlocks.clear();
    this.nextCollapsedBlockId = 1;
  }

  collapsibleHeader(line: string): { indentation: string } | null {
    const commentAt = this.options.commentStart(line);
    const code = commentAt < 0 ? line : line.slice(0, commentAt);
    const match = code.match(/^(\s*)_?(VOICE|DRUMKIT|FX|FILTER|MOD|SEQ|REGISTER|LOGIC)\s+[A-Za-z_][A-Za-z0-9_]*\b[^:]*:\s*$/i);
    if (!match) return null;
    return { indentation: match[1] };
  }

  foldedMarkerAfterLine(lines: string[], index: number): string | null {
    if (index + 1 >= lines.length) return null;
    return this.markerId(lines[index + 1]);
  }

  toggleAtPhysicalLine(physicalLine: number): void {
    const { editor, commentStart, afterMutation } = this.options;
    const lines = editor.value.split('\n');
    const index = physicalLine - 1;
    if (index < 0 || index >= lines.length) return;
    const header = this.collapsibleHeader(lines[index]);
    if (!header) return;

    const lineStarts: number[] = [];
    let offset = 0;
    for (const line of lines) {
      lineStarts.push(offset);
      offset += line.length + 1;
    }

    const existingId = this.foldedMarkerAfterLine(lines, index);
    if (existingId) {
      const block = this.collapsedBlocks.get(existingId);
      if (!block) return;
      const markerStart = lineStarts[index + 1];
      const markerEnd = markerStart + lines[index + 1].length + (index + 1 < lines.length - 1 ? 1 : 0);
      const restoredBody = block.body.endsWith('\n\n')
        ? block.body
        : block.body.endsWith('\n')
          ? `${block.body}\n`
          : `${block.body}\n\n`;
      editor.setRangeText(restoredBody, markerStart, markerEnd, 'preserve');
      this.collapsedBlocks.delete(existingId);
      afterMutation();
      return;
    }

    const headerIndent = header.indentation.length;
    let endLine = index + 1;
    while (endLine < lines.length) {
      const line = lines[endLine];
      if (!line.trim()) {
        endLine += 1;
        continue;
      }
      const commentAt = commentStart(line);
      const code = commentAt < 0 ? line : line.slice(0, commentAt);
      const indentation = code.length - code.trimStart().length;
      if (indentation <= headerIndent) break;
      endLine += 1;
    }

    if (endLine === index + 1) return;
    const bodyStart = lineStarts[index + 1];
    const bodyEnd = endLine < lines.length ? lineStarts[endLine] : editor.value.length;
    const body = editor.value.slice(bodyStart, bodyEnd);
    if (!body.trim()) return;

    const selectionStart = editor.selectionStart;
    const selectionEnd = editor.selectionEnd;
    const selectionInsideBody = selectionStart < bodyEnd && selectionEnd >= bodyStart;
    const headerCaret = lineStarts[index] + lines[index].length;

    const id = String(this.nextCollapsedBlockId++);
    this.collapsedBlocks.set(id, { body });
    const marker = `${header.indentation}    //~F${id}${body.endsWith('\n') ? '\n' : ''}`;
    editor.setRangeText(marker, bodyStart, bodyEnd, 'preserve');
    if (selectionInsideBody) editor.setSelectionRange(headerCaret, headerCaret);
    afterMutation();
  }

  renderGutter(): void {
    const {
      editor,
      lineGutterContent,
      statementLabels,
      inlineViewCountAtLine,
      diagnosticLines,
      liveDisableHeader,
      toggleObjectDisabledAtPhysicalLine,
      inlineViewRowHeight,
    } = this.options;
    const lines = editor.value.split('\n');
    const style = getComputedStyle(editor);
    const mirror = document.createElement('div');
    mirror.setAttribute('aria-hidden', 'true');
    mirror.style.position = 'fixed';
    mirror.style.visibility = 'hidden';
    mirror.style.pointerEvents = 'none';
    mirror.style.width = `${editor.clientWidth}px`;
    mirror.style.margin = '0';
    mirror.style.padding = '0';
    mirror.style.border = '0';
    mirror.style.boxSizing = 'border-box';
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

    const measured: HTMLElement[] = [];
    for (const text of lines) {
      const row = document.createElement('div');
      row.style.minHeight = style.lineHeight;
      row.textContent = text || '\u200b';
      mirror.append(row);
      measured.push(row);
    }
    document.body.append(mirror);

    const labels = statementLabels(editor.value);
    const diagnostics = diagnosticLines();
    lineGutterContent.replaceChildren();
    lines.forEach((_, index) => {
      const physicalLine = index + 1;
      const row = document.createElement('div');
      row.className = diagnostics.has(physicalLine) ? 'line-number error' : 'line-number';
      row.style.height = `${measured[index].getBoundingClientRect().height}px`;
      const marker = document.createElement('span');
      marker.className = 'line-number-marker';
      marker.textContent = diagnostics.has(physicalLine) ? '!' : '';
      const label = document.createElement('span');
      label.className = 'line-number-label';
      label.textContent = labels[index] ?? '';

      const collapsible = this.collapsibleHeader(lines[index]);
      if (collapsible) {
        const collapsed = Boolean(this.foldedMarkerAfterLine(lines, index));
        row.classList.add('collapsible');
        row.title = collapsed ? 'Expand object' : 'Collapse object';
        const arrow = document.createElement('span');
        arrow.className = 'object-fold-arrow';
        arrow.textContent = collapsed ? '▴' : '▾';
        label.append(arrow);
        row.addEventListener('pointerdown', (event) => {
          const target = event.target as Element;
          if (target.closest('.object-toggle-led')) return;
          event.preventDefault();
        });
        row.addEventListener('click', (event) => {
          const target = event.target as Element;
          if (target.closest('.object-toggle-led')) return;
          event.preventDefault();
          event.stopPropagation();
          this.toggleAtPhysicalLine(physicalLine);
          editor.focus();
        });
      }

      const objectState = liveDisableHeader(lines[index]);
      if (objectState) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = `object-toggle-led${objectState.disabled ? ' disabled' : ''}`;
        toggle.setAttribute('aria-label', `${objectState.disabled ? 'Enable' : 'Disable'} object on line ${physicalLine}`);
        toggle.title = objectState.disabled ? 'Enable object' : 'Disable object';
        toggle.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
        toggle.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleObjectDisabledAtPhysicalLine(physicalLine);
          editor.focus();
        });
        row.append(toggle);
      }

      row.append(marker, label);
      lineGutterContent.append(row);

      const viewCount = inlineViewCountAtLine(physicalLine);
      for (let viewIndex = 0; viewIndex < viewCount; viewIndex += 1) {
        const spacer = document.createElement('div');
        spacer.className = 'line-number-inline-spacer';
        spacer.style.height = `${inlineViewRowHeight}px`;
        lineGutterContent.append(spacer);
      }
    });
    mirror.remove();
    this.syncGutter();
  }

  syncGutter(): void {
    this.options.lineGutterContent.style.transform = `translateY(${-this.options.editor.scrollTop}px)`;
  }
}
