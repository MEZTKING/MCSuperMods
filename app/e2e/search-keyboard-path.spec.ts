/**
 * The search with the keyboard only (ADR 0124 D11; brief B671). No mouse is used
 * after the launch, and no network request is made (asserted, renderer and main).
 *
 * 1. Very easy, a brand-new install with no mod: Tab reaches Home's bar **What do you want to
 *    make?** and Enter opens the search with the focus in the field. The accessibility roles: a
 *    combobox that owns a listbox of groups and options through `aria-controls`, the selection
 *    named by `aria-activedescendant` (the rows never take focus), and a polite status whose words
 *    say the count and the best match. Down and Up move the selection, Escape closes the search and
 *    puts the focus back on the bar. Then the first path of `search-path`: "a blue swrod", Enter
 *    runs **Make this**, Enter takes the mod's name, Enter in the Creator creates the sword, My
 *    things lists it, and Ctrl+Z takes it back.
 * 2. Reduced motion (`emulateMedia`), with WebGL: the panel says so (`data-motion`), a Showcase
 *    card chosen with the arrows shows its still and no clip, and Home's cards play no clip.
 */

import { expect, type Locator, type Page, test } from 'playwright/test';
import {
  focusedTestId,
  launchSearch,
  type SearchLaunch,
  tabTo,
  WEBGL_ARGS,
} from './search-helpers';

let launched: SearchLaunch | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

/** Closes the Welcome of a new install with the keyboard and returns Home. */
async function veryEasyHomeByKeys(window: Page): Promise<Locator> {
  const welcome = window.getByTestId('welcome-dialog');
  await expect(welcome).toBeVisible();
  await tabTo(window, welcome.getByRole('button', { name: 'Got it' }));
  await window.keyboard.press('Enter');
  await expect(welcome).toBeHidden();
  const home = window.getByTestId('home');
  await expect(home).toBeVisible();
  return home;
}

/** The id of the option `aria-activedescendant` names, and that option. */
async function activeOption(field: Locator, dialog: Locator): Promise<Locator> {
  const id = await field.getAttribute('aria-activedescendant');
  expect(id).toBeTruthy();
  return dialog.locator(`[id="${id}"]`);
}

test('search by keyboard: roles, the live words, focus back, Make this, Create and Undo', async () => {
  test.setTimeout(150_000);
  launched = await launchSearch('keys', { env: { MSM_E2E_NEW_INSTALL: '1' } });
  const { window } = launched;
  const home = await veryEasyHomeByKeys(window);

  // Tab to the bar; Enter opens the search with the focus in the field. -----------------------
  const bar = home.getByTestId('home-search-field');
  await tabTo(window, bar);
  await window.keyboard.press('Enter');
  const dialog = window.getByTestId('search-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('role', 'dialog');
  const field = dialog.getByRole('combobox', { name: 'Search' });
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute('aria-autocomplete', 'list');
  await window.keyboard.type('a blue swrod');

  // The roles: a combobox owning a listbox of groups and options. ------------------------------
  const listbox = dialog.getByRole('listbox', { name: 'Results' });
  await expect(listbox).toBeVisible();
  await expect(field).toHaveAttribute('aria-expanded', 'true');
  const listId = await listbox.getAttribute('id');
  await expect(field).toHaveAttribute('aria-controls', listId ?? '');
  await expect(listbox.getByRole('group', { name: 'Best matches' })).toBeVisible();
  await expect(listbox.getByRole('group', { name: 'Things you can make' })).toBeVisible();
  const first = await activeOption(field, dialog);
  await expect(first).toHaveRole('option');
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await expect(first).toHaveAttribute('data-testid', 'search-row-flow:weapon');
  await expect(first).toHaveAccessibleName(/Weapon/);
  await expect(listbox.getByRole('option', { selected: true })).toHaveCount(1);
  // The live region's words: how many, and the best match.
  const live = dialog.getByTestId('search-live');
  await expect(live).toHaveRole('status');
  await expect(live).toHaveAttribute('aria-live', 'polite');
  await expect(live).toHaveText(/^\d+ results\. Best match: Weapon\.$/);

  // Down moves the selection, the field keeps the focus; Up comes back. -----------------------
  await window.keyboard.press('ArrowDown');
  const second = await activeOption(field, dialog);
  await expect(second).toHaveAttribute('aria-selected', 'true');
  await expect(first).toHaveAttribute('aria-selected', 'false');
  await expect(field).toBeFocused();
  await window.keyboard.press('ArrowUp');
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await expect(field).toBeFocused();

  // Escape closes it and the focus goes back to the bar. --------------------------------------
  await window.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(bar).toBeFocused();

  // The first path: Enter runs Make this, Enter names the mod, Enter creates. ------------------
  await window.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(field).toBeFocused();
  await window.keyboard.type('a blue swrod');
  await expect(dialog.getByTestId('search-corrected')).toHaveText(
    'Showing results for a blue sword',
  );
  await expect(await activeOption(field, dialog)).toHaveAttribute(
    'data-testid',
    'search-row-flow:weapon',
  );
  await expect(dialog.getByTestId('search-action-make')).toBeVisible();
  await window.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  const newMod = window.getByTestId('new-mod-dialog');
  await expect(newMod).toBeVisible();
  const name = newMod.getByTestId('new-mod-name');
  await expect(name).toHaveValue('Blue Sword Mod');
  await expect(name).toBeFocused();
  await window.keyboard.press('Enter');
  await expect(newMod).toBeHidden();
  const creator = window.getByTestId('creator-dialog');
  await expect(creator).toBeVisible();
  await expect(creator.getByRole('heading', { name: 'Create: Weapon' })).toBeVisible();
  await expect(creator.getByTestId('param-weapon_type')).toHaveValue('sword');
  await expect(creator.getByTestId('creator-create')).toBeEnabled({ timeout: 30_000 });
  const weaponName = creator.getByTestId('param-weapon_name');
  await tabTo(window, weaponName);
  await expect(weaponName).toHaveValue('Blue Sword');
  await window.keyboard.press('Enter');
  await expect(creator).toBeHidden({ timeout: 30_000 });

  // My things lists it; Ctrl+Z takes it back. -------------------------------------------------
  await tabTo(window, window.getByTestId('toolbar-home'));
  await window.keyboard.press('Enter');
  await expect(home).toBeVisible();
  const things = home.getByTestId('my-things');
  await expect(things).toContainText('Blue Sword');
  await window.keyboard.press('Control+Z');
  await expect(home.getByTestId('my-things-empty')).toBeVisible();

  expect(await launched.network()).toEqual([]);
});

test('search by keyboard with reduced motion: no clip in the preview or on Home', async () => {
  test.setTimeout(120_000);
  launched = await launchSearch('keys-motion', {
    args: WEBGL_ARGS,
    env: { MSM_E2E_NEW_INSTALL: '1' },
  });
  const { window } = launched;
  await window.emulateMedia({ reducedMotion: 'reduce' });
  const home = await veryEasyHomeByKeys(window);
  const showcase = home.getByTestId('home-showcase');
  await expect(showcase).toBeVisible();
  await expect(showcase.locator('canvas')).toHaveCount(0);

  await window.keyboard.press('Control+K');
  const dialog = window.getByTestId('search-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('search-panel')).toHaveAttribute('data-motion', 'reduce');
  const field = dialog.getByRole('combobox', { name: 'Search' });
  await expect(field).toBeFocused();
  await window.keyboard.type('turn off showcase clips');
  await expect(dialog.getByTestId('search-live')).not.toHaveText('');

  // Down until a Showcase card is chosen. -------------------------------------------------------
  let card = '';
  for (let i = 0; i < 20; i += 1) {
    const active = await activeOption(field, dialog);
    card = (await active.getAttribute('data-testid')) ?? '';
    if (card.startsWith('search-row-card:')) break;
    await window.keyboard.press('ArrowDown');
  }
  expect(card).toMatch(/^search-row-card:/);
  const preview = dialog.getByTestId('search-result-preview');
  await expect(preview).toHaveAttribute('data-preview-type', 'showcase');
  await expect(preview.getByTestId('search-preview-showcase')).toBeVisible();
  await expect(preview.getByTestId('search-preview-still')).toBeVisible({ timeout: 30_000 });
  await expect(preview.getByTestId('search-preview-clip')).toHaveCount(0);
  await expect(dialog.locator('canvas')).toHaveCount(0);
  await expect(field).toBeFocused();

  // Escape: back on Home, still no clip. --------------------------------------------------------
  await window.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(await focusedTestId(window)).not.toBe('search-field');
  await expect(showcase.locator('canvas')).toHaveCount(0);

  expect(await launched.network()).toEqual([]);
});
