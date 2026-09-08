import { expandEditorSnippet } from './snippets';

export type EditorKeyboardBindings = {
  editor: HTMLTextAreaElement;
  leaveBlockCaretTrail: () => void;
  positionBlockCaret: () => void;
  skipFoldMarkerWithArrow: (direction: 'up' | 'down') => boolean;
  protectFoldMarkerBoundary: (key: 'Backspace' | 'Delete') => boolean;
  liveControlGapRanges: (source: string) => Array<{ start: number; end: number }>;
  openQuickMenu: () => void;
  enterCommandMode: () => void;
  stopLiveCode: () => void;
  normalizeLanguageCommandCase: () => void;
  recompileLiveCode: () => void;
  collapsibleObjectHeader: (line: string) => { indentation: string } | null;
  foldMarkerId: (line: string) => string | null;
  refreshInlineViewEditingPreview: () => void;
  renderSyntaxLayer: () => void;
  renderLineGutter: () => void;
  scheduleStoppedPreview: () => void;
  notify: (message: string) => void;
  afterEditorMutation: () => void;
  commentStart: (line: string) => number;
};

function objectHeaderOffsets(source: string, commentStart: (line: string) => number): number[] {
  const offsets: number[] = [];
  const lines = source.split('\n');
  let offset = 0;
  for (const line of lines) {
    const commentAt = commentStart(line);
    const code = commentAt < 0 ? line : line.slice(0, commentAt);
    if (/^\s*_?(VOICE|DRUMKIT|FX|FILTER|MOD|SEQ|REGISTER|LOGIC|CLOCK)\b/i.test(code)) {
      offsets.push(offset + (line.match(/^\s*/)?.[0].length ?? 0));
    }
    offset += line.length + 1;
  }
  return offsets;
}

function navigateObject(
  editor: HTMLTextAreaElement,
  direction: -1 | 1,
  commentStart: (line: string) => number,
  notify: (message: string) => void,
  positionBlockCaret: () => void,
): void {
  const headers = objectHeaderOffsets(editor.value, commentStart);
  if (headers.length === 0) {
    notify('no objects');
    return;
  }

  const caret = editor.selectionStart;
  let target: number | undefined;
  if (direction > 0) target = headers.find((offset) => offset > caret);
  else target = headers.filter((offset) => offset < caret).at(-1);

  if (target === undefined) {
    notify(direction > 0 ? 'last object' : 'first object');
    return;
  }

  editor.focus();
  editor.setSelectionRange(target, target);
  requestAnimationFrame(positionBlockCaret);
}

function toggleLineComments(editor: HTMLTextAreaElement, afterEditorMutation: () => void): void {
  const value = editor.value;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const direction = editor.selectionDirection ?? 'none';
  const firstLineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const effectiveEnd = end > start && value[end - 1] === '\n' ? end - 1 : end;
  const nextNewline = value.indexOf('\n', effectiveEnd);
  const lastLineEnd = nextNewline < 0 ? value.length : nextNewline;
  const block = value.slice(firstLineStart, lastLineEnd);
  const lines = block.split('\n');
  const nonBlank = lines.filter((line) => line.length > 0);
  const uncomment = nonBlank.length > 0 && nonBlank.every((line) => line.startsWith('//'));
  const transformed = lines.map((line) => {
    if (!line) return line;
    if (uncomment) return line.startsWith('// ') ? line.slice(3) : line.startsWith('//') ? line.slice(2) : line;
    return `// ${line}`;
  });
  const replacement = transformed.join('\n');
  const firstDelta = transformed[0].length - lines[0].length;
  const totalDelta = replacement.length - block.length;

  editor.setRangeText(replacement, firstLineStart, lastLineEnd, 'preserve');
  if (start === end) {
    const caret = Math.max(firstLineStart, start + firstDelta);
    editor.setSelectionRange(caret, caret, direction);
  } else {
    const nextStart = Math.max(firstLineStart, start + firstDelta);
    const nextEnd = Math.max(nextStart, end + totalDelta);
    editor.setSelectionRange(nextStart, nextEnd, direction);
  }
  afterEditorMutation();
}

export function installEditorKeyboardBindings(bindings: EditorKeyboardBindings): void {
  const {
    editor,
    leaveBlockCaretTrail,
    positionBlockCaret,
    skipFoldMarkerWithArrow,
    protectFoldMarkerBoundary,
    liveControlGapRanges,
    openQuickMenu,
    enterCommandMode,
    stopLiveCode,
    normalizeLanguageCommandCase,
    recompileLiveCode,
    collapsibleObjectHeader,
    foldMarkerId,
    refreshInlineViewEditingPreview,
    renderSyntaxLayer,
    renderLineGutter,
    scheduleStoppedPreview,
    notify,
    afterEditorMutation,
    commentStart,
  } = bindings;

  editor.addEventListener('keydown', (event) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
      leaveBlockCaretTrail();
    }

    if (event.key === 'ArrowDown' && skipFoldMarkerWithArrow('down')) {
      event.preventDefault();
      requestAnimationFrame(positionBlockCaret);
      return;
    }
    if (event.key === 'ArrowUp' && skipFoldMarkerWithArrow('up')) {
      event.preventDefault();
      requestAnimationFrame(positionBlockCaret);
      return;
    }
    if ((event.key === 'Backspace' || event.key === 'Delete') && protectFoldMarkerBoundary(event.key)) {
      event.preventDefault();
      return;
    }

    if (event.key === 'ArrowRight' && editor.selectionStart === editor.selectionEnd) {
      const caret = editor.selectionStart;
      const gap = liveControlGapRanges(editor.value).find((candidate) => candidate.start === caret);
      if (gap) {
        event.preventDefault();
        editor.setSelectionRange(gap.end, gap.end);
        requestAnimationFrame(positionBlockCaret);
        return;
      }
    }
    if (event.key === 'ArrowLeft' && editor.selectionStart === editor.selectionEnd) {
      const caret = editor.selectionStart;
      const gap = liveControlGapRanges(editor.value).find((candidate) => candidate.end === caret);
      if (gap) {
        event.preventDefault();
        editor.setSelectionRange(gap.start, gap.start);
        requestAnimationFrame(positionBlockCaret);
        return;
      }
    }
    if (event.key === 'Backspace' && editor.selectionStart === editor.selectionEnd) {
      const caret = editor.selectionStart;
      const gap = liveControlGapRanges(editor.value).find((candidate) => candidate.end === caret);
      if (gap) editor.setSelectionRange(gap.start, gap.start);
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      openQuickMenu();
      return;
    }

    if (event.key === '>' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      enterCommandMode();
      return;
    }

    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && (event.metaKey || event.ctrlKey) && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      navigateObject(editor, event.key === 'ArrowUp' ? -1 : 1, commentStart, notify, positionBlockCaret);
      return;
    }

    if (event.key === '/' && (event.metaKey || event.ctrlKey) && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      toggleLineComments(editor, afterEditorMutation);
      return;
    }

    if (event.key === 'Backspace' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.stopPropagation();
      stopLiveCode();
      requestAnimationFrame(positionBlockCaret);
      return;
    }

    if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.stopPropagation();

      const value = editor.value;
      const caret = editor.selectionStart;
      const lineStart = value.lastIndexOf('\n', Math.max(0, caret - 1)) + 1;
      const nextNewline = value.indexOf('\n', caret);
      const hasFollowingLine = nextNewline !== -1;
      const deleteEnd = hasFollowingLine ? nextNewline + 1 : value.length;
      const deleteStart = hasFollowingLine || lineStart === 0 ? lineStart : lineStart - 1;
      const nextCaret = hasFollowingLine ? lineStart : Math.max(0, deleteStart);

      editor.setRangeText('', deleteStart, deleteEnd, 'start');
      editor.setSelectionRange(nextCaret, nextCaret);
      renderSyntaxLayer();
      renderLineGutter();
      scheduleStoppedPreview();
      requestAnimationFrame(positionBlockCaret);
      return;
    }

    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      normalizeLanguageCommandCase();
      recompileLiveCode();
      requestAnimationFrame(positionBlockCaret);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      normalizeLanguageCommandCase();

      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const before = editor.value.slice(0, start);
      const currentLineStart = before.lastIndexOf('\n') + 1;
      const currentLineEndAt = editor.value.indexOf('\n', start);
      const currentLineEnd = currentLineEndAt < 0 ? editor.value.length : currentLineEndAt;
      const currentLine = editor.value.slice(currentLineStart, currentLineEnd);
      const trimmed = currentLine.trim();
      const currentIndent = currentLine.match(/^\s*/)?.[0] ?? '';

      if (start === end && collapsibleObjectHeader(currentLine)) {
        const markerStart = currentLineEndAt < 0 ? -1 : currentLineEndAt + 1;
        if (markerStart >= 0) {
          const markerLineEndAt = editor.value.indexOf('\n', markerStart);
          const markerLineEnd = markerLineEndAt < 0 ? editor.value.length : markerLineEndAt;
          const markerLine = editor.value.slice(markerStart, markerLineEnd);
          if (foldMarkerId(markerLine)) {
            editor.setRangeText('\n', markerLineEnd, markerLineEnd, 'end');
            refreshInlineViewEditingPreview();
            renderSyntaxLayer();
            renderLineGutter();
            scheduleStoppedPreview();
            requestAnimationFrame(positionBlockCaret);
            return;
          }
        }
      }

      let indentation = currentIndent;
      if (!trimmed) indentation = currentIndent.length >= 4 ? currentIndent.slice(0, -4) : '';
      else if (/^_?(VOICE|DRUMKIT|FX|FILTER|MOD|SEQ|LOGIC|CLOCK)\b.*:\s*$/i.test(trimmed)) indentation = `${currentIndent}    `;

      editor.setRangeText(`\n${indentation}`, start, end, 'end');
      renderSyntaxLayer();
      renderLineGutter();
      scheduleStoppedPreview();
      requestAnimationFrame(positionBlockCaret);
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;

      if (!event.shiftKey && start === end) {
        const value = editor.value;
        const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
        const lineEndAt = value.indexOf('\n', start);
        const lineEnd = lineEndAt < 0 ? value.length : lineEndAt;
        const line = value.slice(lineStart, lineEnd);
        const indentation = line.match(/^\s*/)?.[0] ?? '';
        const snippetSource = line.trim();
        const expansion = expandEditorSnippet(snippetSource);
        if (expansion) {
          const replacement = expansion.text.split('\n').map((item) => `${indentation}${item}`).join('\n');
          editor.setRangeText(replacement, lineStart, lineEnd, 'end');
          refreshInlineViewEditingPreview();
          renderSyntaxLayer();
          renderLineGutter();
          scheduleStoppedPreview();
          notify(`expanded ${expansion.label}`);
          requestAnimationFrame(positionBlockCaret);
          return;
        }
        if (snippetSource.startsWith('@')) {
          notify(`unknown snippet: ${snippetSource}`);
          requestAnimationFrame(positionBlockCaret);
          return;
        }
      }

      const direction = editor.selectionDirection ?? 'none';
      const value = editor.value;
      const firstLineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
      const lastLineEndAt = value.indexOf('\n', end);
      const lastLineEnd = lastLineEndAt < 0 ? value.length : lastLineEndAt;
      const spansMultipleLines = value.slice(start, end).includes('\n');

      if (!event.shiftKey && start === end) {
        editor.setRangeText('    ', start, end, 'end');
      } else {
        const block = value.slice(firstLineStart, lastLineEnd);
        const lines = block.split('\n');
        const transformed = event.shiftKey
          ? lines.map((line) => line.startsWith('    ') ? line.slice(4) : line.replace(/^ {1,3}/, ''))
          : lines.map((line) => `    ${line}`);
        const replacement = transformed.join('\n');

        let nextStart = start;
        let nextEnd = end;
        if (event.shiftKey) {
          const removedFirst = lines[0].length - transformed[0].length;
          const removedTotal = block.length - replacement.length;
          nextStart = Math.max(firstLineStart, start - removedFirst);
          nextEnd = Math.max(nextStart, end - removedTotal);
        } else {
          nextStart = start + 4;
          nextEnd = end + 4 * lines.length;
        }

        editor.setRangeText(replacement, firstLineStart, lastLineEnd, 'preserve');
        if (start === end && !spansMultipleLines) editor.setSelectionRange(nextStart, nextStart, direction);
        else editor.setSelectionRange(nextStart, nextEnd, direction);
      }

      refreshInlineViewEditingPreview();
      renderSyntaxLayer();
      renderLineGutter();
      scheduleStoppedPreview();
      requestAnimationFrame(positionBlockCaret);
    }
  });
}
