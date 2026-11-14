/**
 * Where a Studio places its Rules section (ADR 0083 D3): in place outside Very easy, and first
 * in Very easy, where it stands in for the events editor. The Studio roots are flex columns, so
 * the slot moves with `order` and otherwise lays out as if it were not there.
 *
 * @packageDocumentation
 */

import type { ReactNode } from 'react';
import { useVeryEasyLayout } from './very-easy';

/** Wraps a Studio's Rules section; first in Very easy. */
export function RulesSlot({ children }: { children: ReactNode }) {
  const first = useVeryEasyLayout();
  return (
    <div
      data-testid="rules-slot"
      data-first={first ? 'true' : undefined}
      style={first ? { order: -1 } : { display: 'contents' }}
    >
      {children}
    </div>
  );
}
