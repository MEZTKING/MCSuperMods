import { Tooltip } from 'radix-ui';
import { type ReactElement, type ReactNode, useRef, useState } from 'react';

/** Whether the last input anywhere in the window was the keyboard (true until a pointer is used). */
let keyboardInput = true;
if (typeof document !== 'undefined') {
  document.addEventListener(
    'keydown',
    () => {
      keyboardInput = true;
    },
    true,
  );
  document.addEventListener(
    'pointerdown',
    () => {
      keyboardInput = false;
    },
    true,
  );
}

/**
 * Wraps one focusable element in a Radix tooltip (shown on hover and keyboard focus).
 * Needs a `Tooltip.Provider` above it; the app shell provides one.
 *
 * A tooltip opens only while the pointer is over its trigger or when the last input was the
 * keyboard. A menu or dialog opened from the trigger hands focus back to it when it closes,
 * and Radix would show the tooltip on that focus, where it covers the UI below (the dock tabs);
 * after a mouse interaction that focus is not keyboard focus, so the tooltip stays shut. A press
 * on the trigger also closes it until the pointer leaves.
 */
export function Tip({ label, children }: { label: ReactNode; children: ReactElement }) {
  const [open, setOpen] = useState(false);
  const pressed = useRef(false);
  const hovered = useRef(false);
  return (
    <Tooltip.Root
      open={open}
      onOpenChange={(next) => {
        if (next && (pressed.current || !(hovered.current || keyboardInput))) return;
        setOpen(next);
      }}
    >
      <Tooltip.Trigger
        asChild
        onPointerDown={() => {
          pressed.current = true;
          setOpen(false);
        }}
        onPointerEnter={() => {
          hovered.current = true;
        }}
        onPointerLeave={() => {
          hovered.current = false;
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
