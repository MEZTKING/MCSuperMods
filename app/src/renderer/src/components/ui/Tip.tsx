import { Tooltip } from 'radix-ui';
import type { ReactElement, ReactNode } from 'react';

/**
 * Wraps one focusable element in a Radix tooltip (shown on hover and keyboard focus).
 * Needs a `Tooltip.Provider` above it; the app shell provides one.
 */
export function Tip({ label, children }: { label: ReactNode; children: ReactElement }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="bottom"
          sideOffset={4}
          className="z-50 max-w-xs rounded border border-border bg-panel px-2 py-1 text-xs text-text shadow"
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
