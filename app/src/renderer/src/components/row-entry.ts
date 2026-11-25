/**
 * Tab into the toolbar row lands on one of its controls (B714).
 *
 * The row is a Radix toolbar: one tab stop, the row itself, which hands the focus to its current
 * control when a Tab lands on it. Radix tells a Tab from a click on the row by a flag it sets on
 * every mouse press in the row and clears only when the row or a control in it gets the focus.
 * A press that moves the focus nowhere in the row (a menu's button, whose press keeps the focus
 * off it, a separator, a disabled control's edge) left the flag set, so the next Tab into the row
 * counted as a click: the row itself kept the focus and a second Tab was needed to reach a
 * control (`toolbar-path` worked around it). Here the row's own focus goes on to the current
 * control unless a pointer press in this very moment put it there (a click on the row's gap
 * keeps Radix's behaviour: the row is focused).
 *
 * @packageDocumentation
 */

import { type FocusEvent, useRef } from 'react';

/** Handlers for a Radix `Toolbar.Root` (they run before Radix's own). */
export interface RowEntry {
  onPointerDown(): void;
  onFocus(event: FocusEvent<HTMLElement>): void;
}

/** The control a keyboard entry into `row` goes to: the current tab stop, else the first. */
export function entryControl(row: HTMLElement): HTMLElement | null {
  const controls = [...row.querySelectorAll<HTMLElement>('[data-radix-collection-item]')].filter(
    (control) =>
      !control.hasAttribute('disabled') && control.getAttribute('aria-disabled') !== 'true',
  );
  return controls.find((control) => control.tabIndex === 0) ?? controls[0] ?? null;
}

/** The row's entry handlers. */
export function useRowEntry(): RowEntry {
  const pressing = useRef(false);
  return {
    onPointerDown: () => {
      // The focus a press gives is given in the same task as the press.
      pressing.current = true;
      setTimeout(() => {
        pressing.current = false;
      }, 0);
    },
    onFocus: (event) => {
      if (event.target !== event.currentTarget || pressing.current) return;
      entryControl(event.currentTarget)?.focus();
    },
  };
}
