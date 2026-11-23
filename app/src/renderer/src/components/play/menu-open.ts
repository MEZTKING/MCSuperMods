/**
 * The open state of a toolbar menu (the toolbar's menus and Play's), with Escape that always
 * closes it while focus is in it, and focus that stays in a dialog an entry opened.
 *
 * Radix gives Escape only to the highest dismissable layer. A status toast is one too, so a toast
 * that appears while a menu is open (an install's or a target change's message, finishing a moment
 * after the click) takes the Escape: the toast closed and the menu stayed open, and the next press
 * on the menu's button closed it instead of opening it (the `launchers-path` flake, B701). The
 * menu's content therefore closes on an Escape that reaches it, whoever else handled it first.
 *
 * A tooltip is a layer as well. When an entry chosen by keyboard opens a dialog, Radix hands focus
 * back to the menu's button just after the dialog took it, the button's tooltip opens above the
 * dialog, and the next Escape closed the tooltip instead of the dialog. After a chosen entry the
 * focus therefore goes back to the button only when nothing else took it.
 *
 * @packageDocumentation
 */

import { type KeyboardEvent, type RefObject, useRef, useState } from 'react';

/** Props for a Radix `DropdownMenu.Root` and its `Content`, and the menu's button. */
export interface MenuOpen {
  /** For `DropdownMenu.Root`. */
  root: { open: boolean; onOpenChange(open: boolean): void };
  /** For `DropdownMenu.Content`: Escape in the menu (or one of its submenus) closes it. */
  content: { onKeyDown(event: KeyboardEvent): void; onCloseAutoFocus(event: Event): void };
  /** For the menu's button, so focus can go back to it. */
  trigger: RefObject<HTMLButtonElement | null>;
  /** Call when an entry is chosen (before the menu closes). */
  chose(): void;
}

/** A menu's open state; `onOpen` is called each time it opens. */
export function useMenuOpen(onOpen?: () => void): MenuOpen {
  const [open, setOpen] = useState(false);
  const chosen = useRef(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  return {
    root: {
      open,
      onOpenChange: (next) => {
        setOpen(next);
        if (next) onOpen?.();
      },
    },
    content: {
      onKeyDown: (event) => {
        if (event.key === 'Escape') setOpen(false);
      },
      onCloseAutoFocus: (event) => {
        if (!chosen.current) return;
        chosen.current = false;
        // Radix would focus the button now; a dialog the entry opened has focus already.
        event.preventDefault();
        const active = document.activeElement;
        if (active === null || active === document.body) trigger.current?.focus();
      },
    },
    trigger,
    chose: () => {
      chosen.current = true;
    },
  };
}
