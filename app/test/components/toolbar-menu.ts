/**
 * The toolbar's More menu in component tests (ADR 0131 D1): open it, walk into submenus, choose an
 * entry. happy-dom has no layout, so a pointer move off a submenu's trigger closes the submenu
 * (Radix's pointer grace area is empty); entries are therefore chosen with a click event and no
 * pointer move.
 */

import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Opens More, then each submenu in `submenus` (test ids such as `toolbar-export-menu`), and
 * returns the user that did it.
 */
export async function openToolbarMenu(...submenus: string[]) {
  const user = userEvent.setup();
  await user.click(screen.getByTestId('toolbar-more'));
  for (const id of submenus) await user.click(await screen.findByTestId(id));
  return user;
}

/** Opens More and the submenus before the last id, then chooses the entry with the last id. */
export async function chooseInToolbarMenu(...ids: [...string[], string]): Promise<void> {
  const entry = ids[ids.length - 1] as string;
  await openToolbarMenu(...ids.slice(0, -1));
  fireEvent.click(await screen.findByTestId(entry));
}

/** Whether a menu entry is disabled. */
export function entryDisabled(id: string): boolean {
  return screen.getByTestId(id).hasAttribute('data-disabled');
}
