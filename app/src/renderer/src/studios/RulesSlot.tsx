/**
 * Where a Studio places its Rules section (ADR 0083 D3, ADR 0130 D2): first, where it stands in
 * for the events editor (which keeps its place, under its More options). The Studio roots are
 * flex columns, so the slot moves with `order` and otherwise lays out as if it were not there.
 *
 * @packageDocumentation
 */

import type { ReactNode } from 'react';

/** Wraps a Studio's Rules section; first in the Studio. */
export function RulesSlot({ children }: { children: ReactNode }) {
  return (
    <div data-testid="rules-slot" data-first="true" style={{ order: -1 }}>
      {children}
    </div>
  );
}
