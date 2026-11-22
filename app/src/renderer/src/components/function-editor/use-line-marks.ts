/**
 * The gutter's marks, following the editor's text (B613): worked out 150 ms after the last
 * keystroke (the plan's budget for the gutter), the line reader loaded on first use.
 *
 * @packageDocumentation
 */

import { useEffect, useRef, useState } from 'react';
import type { LineMark } from './line-marks';
import { splitLines } from './source-text';

/** Pause after the last keystroke before the marks are worked out again. */
export const LINE_MARKS_DEBOUNCE_MS = 150;

type MarkLines = (lines: readonly string[]) => LineMark[];

let reader: Promise<MarkLines> | null = null;

/** Loads the line reader once (`line-support.ts`, with `@msm/sim`'s command reader). */
export function loadLineReader(): Promise<MarkLines> {
  reader ??= import('./line-support').then((module) => module.markLines);
  return reader;
}

/** The marks of `text`, or `null` until they are first worked out. */
export function useLineMarks(text: string, enabled = true): readonly LineMark[] | null {
  const [marks, setMarks] = useState<readonly LineMark[] | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const work = (): void => {
      void loadLineReader().then((mark) => {
        if (!live) return;
        setMarks(mark(splitLines(text)));
        first.current = false;
      });
    };
    // The first marks come at once; later ones after the pause.
    if (first.current) {
      work();
      return () => {
        live = false;
      };
    }
    const timer = setTimeout(work, LINE_MARKS_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [text, enabled]);
  return enabled ? marks : null;
}
