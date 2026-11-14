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
 * Whether a tooltip may open now: the pointer is really over the trigger (asked of the browser,
 * not remembered, so a missed `pointerleave` cannot leave it stuck), or the trigger has keyboard
 * focus after keyboard input. Without a live element (tests without layout) the remembered hover
 * and the last input decide.
 */
function mayOpen(element: HTMLElement | null, hovered: boolean): boolean {
  if (element !== null && typeof element.matches === 'function') {
    const hover = safeMatches(element, ':hover');
    const focusVisible = safeMatches(element, ':focus-visible');
    if (hover !== undefined && focusVisible !== undefined) {
      return hover || (keyboardInput && (focusVisible || element === document.activeElement));
    }
  }
  return hovered || keyboardInput;
}

function safeMatches(element: HTMLElement, selector: string): boolean | undefined {
  try {
    return element.matches(selector);
  } catch {
    return undefined;
  }
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
  const trigger = useRef<HTMLButtonElement | null>(null);
  return (
    <Tooltip.Root
      open={open}
      onOpenChange={(next) => {
        if (next && (pressed.current || !mayOpen(trigger.current, hovered.current))) return;
        setOpen(next);
      }}
    >
      <Tooltip.Trigger
        ref={trigger}
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
