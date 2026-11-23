/**
 * The open state of a toolbar menu (the toolbar's menus and Play's), with Escape that always
 * closes it while focus is in it.
 *
 * Radix gives Escape only to the highest dismissable layer. A status toast is one too, so a toast
 * that appears while a menu is open (an install's or a target change's message, finishing a moment
 * after the click) takes the Escape: the toast closed and the menu stayed open, and the next press
 * on the menu's button closed it instead of opening it (the `launchers-path` flake, B701). The
 * menu's content therefore closes on an Escape that reaches it, whoever else handled it first.
 *
 * @packageDocumentation
 */

import { type KeyboardEvent, useState } from 'react';

/** Props for a Radix `DropdownMenu.Root` and its `Content`. */
export interface MenuOpen {
  /** For `DropdownMenu.Root`. */
  root: { open: boolean; onOpenChange(open: boolean): void };
  /** For `DropdownMenu.Content`: Escape in the menu (or one of its submenus) closes it. */
  content: { onKeyDown(event: KeyboardEvent): void };
}

/** A menu's open state; `onOpen` is called each time it opens. */
export function useMenuOpen(onOpen?: () => void): MenuOpen {
  const [open, setOpen] = useState(false);
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
    },
  };
}
