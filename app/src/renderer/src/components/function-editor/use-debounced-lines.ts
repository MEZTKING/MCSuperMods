/**
 * The draft state shared by the line-based source editors (functions and scripts): the
 * element's `lines` shown as text, edits debounced and reported as one `/lines` change per
 * pause under one coalescing key, the editor's own echoes ignored, and external changes
 * (undo, Raw JSON, a rename) shown as they arrive.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeOptions } from '../../forms';
import { joinLines, splitLines } from './source-text';

/** What {@link useDebouncedLines} returns. */
export interface DebouncedLines {
  /** The text the editor shows. */
  draft: string;
  /** Records an edit and reports it after the pause. */
  edit(text: string): void;
}

/**
 * Debounced `/lines` editing.
 *
 * @param lines - The element's lines.
 * @param onChange - Applies one edit to the element.
 * @param coalesce - The coalescing key of the reported edits (one undo step while typing).
 * @param delayMs - Pause after the last keystroke before the edit is reported.
 */
export function useDebouncedLines(
  lines: readonly string[],
  onChange: (pointer: string, value: Json | undefined, options?: ChangeOptions) => void,
  coalesce: string,
  delayMs: number,
): DebouncedLines {
  const source = joinLines(lines);
  const [draft, setDraft] = useState(source);
  const [shownSource, setShownSource] = useState(source);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  /** Sources this editor reported; their echo through `lines` must not reset the draft. */
  const reported = useRef(new Set<string>());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const flush = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    const text = pending.current;
    pending.current = null;
    if (text === null) return;
    reported.current.add(text);
    onChangeRef.current('/lines', splitLines(text), { coalesce });
  }, [coalesce]);

  // Report a pending edit when the editor goes away (element switch, Studio closed).
  useEffect(() => flush, [flush]);

  if (source !== shownSource) {
    setShownSource(source);
    if (reported.current.has(source)) {
      reported.current.delete(source);
    } else if (pending.current === null) {
      // Changed elsewhere (undo, Raw JSON, a rename): show it.
      reported.current.clear();
      setDraft(source);
    }
  }

  const edit = (text: string) => {
    setDraft(text);
    pending.current = text;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delayMs);
  };

  return { draft, edit };
}
