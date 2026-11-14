import { Tooltip } from 'radix-ui';
import { type ReactElement, type ReactNode, useRef, useState } from 'react';

/**
 * Wraps one focusable element in a Radix tooltip (shown on hover and keyboard focus).
 * Needs a `Tooltip.Provider` above it; the app shell provides one.
 *
 * A tooltip never opens again after the pointer was pressed on its trigger until the pointer
 * leaves: a menu or dialog opened from the trigger hands focus back to it when it closes, and
 * Radix would show the tooltip on that focus, where it covers the UI below (the dock tabs).
 * Keyboard use (a key press on the trigger) lifts the hold again.
 */
export function Tip({ label, children }: { label: ReactNode; children: ReactElement }) {
  const [open, setOpen] = useState(false);
  const pressed = useRef(false);
  return (
    <Tooltip.Root
      open={open}
      onOpenChange={(next) => {
        if (next && pressed.current) return;
        setOpen(next);
      }}
    >
      <Tooltip.Trigger
        asChild
        onPointerDown={() => {
          pressed.current = true;
          setOpen(false);
        }}
        onPointerLeave={() => {
          pressed.current = false;
        }}
        onKeyDown={() => {
          pressed.current = false;
        }}
      >
        {children}
      </Tooltip.Trigger>
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
