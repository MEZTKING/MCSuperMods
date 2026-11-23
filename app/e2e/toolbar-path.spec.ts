/**
 * The one toolbar row (ADR 0131 D1 to D4, B701):
 *
 * 1. At 900, 1280 and 1920 px wide, with no mod and with a mod open (Play's "Prism Launcher not
 *    found" chip showing), the toolbar is one row: at most 48 CSS px high, every direct child at
 *    the same top, nothing past its right edge and no sideways page scroll.
 * 2. Every entry of **More** opens by keyboard alone: Tab into the row, End to More, Enter, the
 *    arrows to the entry, Enter (a dialog, the AI helper, the mod opening) or Right (a submenu).
 * 3. The shortcuts do what they did: Ctrl+O, Ctrl+Shift+N, Ctrl+N, Ctrl+S, Ctrl+Z,
 *    Ctrl+Shift+Z, F5, F6, Ctrl+K, Ctrl+Shift+P and Ctrl+Shift+A.
 *
 * With `TOOLBAR_SHOTS=<folder>` the first test saves the row's pictures there (device scale 2).
 */

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ElectronApplication, expect, type Page, test } from 'playwright/test';
import {
  type LaunchedApp,
  launchApp,
  newProjectInFolder,
  openToolbarMenu,
  outputDir,
  toast,
} from './fixtures';
import { focusedTestId } from './search-helpers';

const SHOTS = process.env.TOOLBAR_SHOTS;

/** The few DOM shapes the page-side checks use (the e2e project has no DOM types). */
interface Box {
  top: number;
  right: number;
  height: number;
}
interface Node {
  getBoundingClientRect(): Box;
  children: ArrayLike<Node>;
  scrollWidth: number;
  clientWidth: number;
  closest(selector: string): Node | null;
  contains(other: unknown): boolean;
}
interface PageGlobal {
  innerWidth: number;
  requestAnimationFrame(callback: () => void): number;
  document: {
    querySelector(selector: string): Node | null;
    activeElement: Node | null;
    documentElement: { scrollWidth: number; clientWidth: number };
  };
}
const WIDTHS = [900, 1280, 1920] as const;

let launched: LaunchedApp | undefined;
let base: string | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

/** Sizes the window's page to `width` by 860 CSS px and waits until the page sees it. */
async function resize(app: ElectronApplication, window: Page, width: number): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win === undefined) return;
      if (win.isMaximized()) win.unmaximize();
      win.setContentSize(size.width, size.height);
    },
    { width, height: 860 },
  );
  await expect
    .poll(() => window.evaluate(() => (globalThis as unknown as PageGlobal).innerWidth))
    .toBe(width);
}

interface RowLayout {
  height: number;
  tops: number[];
  overflow: number;
  pageOverflow: number;
}

/** The row's height, its direct children's tops and how far anything runs past it. */
async function rowLayout(window: Page): Promise<RowLayout> {
  return window.evaluate(() => {
    const doc = (globalThis as unknown as PageGlobal).document;
    const row = doc.querySelector('[role="toolbar"][aria-label="Mod"]') as Node;
    const box = row.getBoundingClientRect();
    const children = Array.from(row.children);
    const right = Math.max(...children.map((child) => child.getBoundingClientRect().right));
    return {
      height: box.height,
      tops: children.map((child) => child.getBoundingClientRect().top),
      overflow: Math.max(0, right - box.right, row.scrollWidth - row.clientWidth),
      pageOverflow: doc.documentElement.scrollWidth - doc.documentElement.clientWidth,
    };
  });
}

async function expectOneRow(window: Page, what: string): Promise<void> {
  const layout = await rowLayout(window);
  expect(layout.height, `${what}: height`).toBeLessThanOrEqual(48);
  const first = layout.tops[0] ?? 0;
  for (const top of layout.tops) expect(Math.abs(top - first), `${what}: tops`).toBeLessThan(0.5);
  expect(layout.overflow, `${what}: past the row`).toBeLessThanOrEqual(0.5);
  expect(layout.pageOverflow, `${what}: page scrolls sideways`).toBeLessThanOrEqual(0);
}

async function shot(window: Page, name: string): Promise<void> {
  if (SHOTS === undefined) return;
  mkdirSync(SHOTS, { recursive: true });
  await window.screenshot({ path: join(SHOTS, `${name}.png`) });
}

/** Moves the pointer away and waits until no tooltip shows, so pictures show the row only. */
async function settle(window: Page): Promise<void> {
  await window.mouse.move(0, 400);
  await window
    .getByRole('tooltip')
    .first()
    .waitFor({ state: 'detached', timeout: 5_000 })
    .catch(() => undefined);
}

test('the toolbar is one row at 900, 1280 and 1920 px wide', async () => {
  launched = await launchApp({ args: ['--force-device-scale-factor=2'] });
  const { app, window } = launched;
  await window.waitForLoadState('domcontentloaded');
  const row = window.getByRole('toolbar', { name: 'Mod' });
  await expect(row).toBeVisible();

  for (const width of WIDTHS) {
    await resize(app, window, width);
    await settle(window);
    await expectOneRow(window, `no mod, ${width}`);
    await shot(window, `toolbar-no-mod-${width}`);
  }

  await newProjectInFolder(window);
  await expect(window.locator('[data-testid^="element-row-"][data-testid$=":pack"]')).toBeVisible();
  // No Prism Launcher here: Play's chip says so in the row (ADR 0131 D3).
  await expect(window.getByTestId('play-chip')).toHaveAttribute('data-state', 'no-prism');
  await expect(window.getByTestId('play-reload')).toHaveCount(0);

  for (const width of WIDTHS) {
    await resize(app, window, width);
    await settle(window);
    await expectOneRow(window, `a mod, ${width}`);
    // Try it and Share my mod keep their words from 1200 px; the search its words from 1000 px.
    const tryItWords = window.getByTestId('toolbar-try-it').getByText('Try it');
    const searchWords = window.getByTestId('toolbar-search').getByText('Search or make anything');
    if (width >= 1200) await expect(tryItWords).toBeVisible();
    else await expect(tryItWords).toBeHidden();
    if (width >= 1000) await expect(searchWords).toBeVisible();
    else await expect(searchWords).toBeHidden();
    await shot(window, `toolbar-mod-${width}`);

    await openToolbarMenu(window);
    await expect(window.getByTestId('toolbar-settings')).toBeVisible();
    await shot(window, `toolbar-more-${width}`);
    await openToolbarMenu(window, 'toolbar-export-menu');
    await expect(window.getByTestId('export-resource-zip')).toBeVisible();
    await shot(window, `toolbar-export-${width}`);
    await window.keyboard.press('Escape');
    await expect(window.getByTestId('toolbar-settings')).toHaveCount(0);
  }
  await window.screenshot({ path: join(outputDir, 'toolbar-path.png') });
});

/** Tabs into the toolbar (its one tab stop), then End to More. */
async function focusMore(window: Page): Promise<void> {
  const inRow = () =>
    window.evaluate(() => {
      const doc = (globalThis as unknown as PageGlobal).document;
      return doc.activeElement?.closest('[role="toolbar"][aria-label="Mod"]') != null;
    });
  for (let i = 0; i < 80 && !(await inRow()); i += 1) await window.keyboard.press('Tab');
  expect(await inRow()).toBe(true);
  // The row moves focus for End a moment later (Radix's roving focus), so End only when needed
  // and wait for it: a late move would take the focus out of a menu opened meanwhile.
  if ((await focusedTestId(window)) !== 'toolbar-more') {
    await window.keyboard.press('End');
    await expect.poll(() => focusedTestId(window)).toBe('toolbar-more');
  }
}

/** Opens More by keyboard and moves to `id` with the arrow keys. */
async function arrowTo(window: Page, id: string): Promise<void> {
  await focusMore(window);
  await window.keyboard.press('Enter');
  await expect(window.getByTestId('toolbar-settings')).toBeVisible();
  // Radix moves the focus for an arrow key a moment later: wait for each move.
  await expect.poll(() => focusedTestId(window)).toBe('toolbar-new-project');
  for (let i = 0; i < 20; i += 1) {
    const here = await focusedTestId(window);
    if (here === id) break;
    await window.keyboard.press('ArrowDown');
    await expect.poll(() => focusedTestId(window)).not.toBe(here);
  }
  expect(await focusedTestId(window)).toBe(id);
}

/** Runs the menu bar entry with `accelerator`, as its key does (and fails when there is none). */
async function runAccelerator(app: ElectronApplication, accelerator: string): Promise<void> {
  await app.evaluate(({ BrowserWindow, Menu }, wanted) => {
    type Item = Electron.MenuItem;
    const find = (items: readonly Item[]): Item | undefined => {
      for (const item of items) {
        if (item.accelerator === wanted) return item;
        const inner = item.submenu == null ? undefined : find(item.submenu.items);
        if (inner !== undefined) return inner;
      }
      return undefined;
    };
    const item = find(Menu.getApplicationMenu()?.items ?? []);
    if (item === undefined) throw new Error(`No menu entry has ${wanted}.`);
    item.click(undefined, BrowserWindow.getAllWindows()[0], undefined);
  }, accelerator);
}

/** Closes the dialog that an entry opened, with Escape, and waits for it to go. */
async function closeDialog(window: Page, testId: string): Promise<void> {
  const dialog = window.getByTestId(testId);
  await expect(dialog).toBeVisible();
  // A toast is a layer of its own: one shown after the dialog opened takes the Escape (a known
  // gap of the app's toasts, outside the toolbar), so the key is pressed once none shows.
  await expect(toast(window)).toHaveCount(0, { timeout: 15_000 });
  // Radix listens for Escape only once the dialog is the top layer, a render after it shows: wait
  // for the dialog to hold the focus and two frames, as a person's key press always does.
  await expect
    .poll(() =>
      dialog.evaluate((element) =>
        element.contains((globalThis as unknown as PageGlobal).document.activeElement),
      ),
    )
    .toBe(true);
  await window.evaluate(
    () =>
      new Promise((settle) => {
        const page = globalThis as unknown as PageGlobal;
        page.requestAnimationFrame(() => page.requestAnimationFrame(() => settle(null)));
      }),
  );
  await window.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}

test('every More entry opens by keyboard alone', async () => {
  launched = await launchApp();
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await newProjectInFolder(window);
  const pack = window.locator('[data-testid^="element-row-"][data-testid$=":pack"]');
  await expect(pack).toBeVisible();
  // The new mod's message comes a moment after the mod; wait for it so it lands before a dialog.
  await expect(toast(window)).toBeVisible();

  const dialogs: readonly (readonly [string, string])[] = [
    ['toolbar-new-project', 'new-mod-dialog'],
    ['toolbar-new-from-starter', 'new-project-dialog'],
    ['toolbar-examples', 'examples-dialog'],
    ['toolbar-creator', 'creator-dialog'],
    ['toolbar-add-element', 'new-element-dialog'],
    ['export-test-in-minecraft', 'test-in-minecraft-dialog'],
    ['toolbar-settings', 'settings-dialog'],
  ];
  for (const [entry, dialog] of dialogs) {
    await arrowTo(window, entry);
    await window.keyboard.press('Enter');
    await closeDialog(window, dialog);
  }

  // Bring in pictures or sounds… opens its dialog (a Radix dialog without a test id of its own).
  await arrowTo(window, 'toolbar-import-assets');
  await window.keyboard.press('Enter');
  const importDialog = window.getByRole('dialog');
  await expect(importDialog).toBeVisible();
  await window.keyboard.press('Escape');
  await expect(importDialog).toHaveCount(0);

  // New mod with the AI helper…, with a mod open, opens the helper.
  await arrowTo(window, 'toolbar-new-with-ai');
  await window.keyboard.press('Enter');
  await expect(window.getByTestId('ai-panel')).toBeVisible();

  // The submenus open with Right and close with Left.
  for (const [submenu, first] of [
    ['toolbar-open-menu', 'recent-project-0'],
    ['toolbar-export-menu', 'export-resource-zip'],
    ['toolbar-install-menu', 'install-target'],
  ] as const) {
    await arrowTo(window, submenu);
    await window.keyboard.press('ArrowRight');
    const shown = window.getByTestId(first);
    await expect(shown).toBeVisible();
    // Focus moves into the submenu (onto its first entry that can be used; none of the Install
    // entries can without a Minecraft folder, so the submenu itself).
    await expect
      .poll(() =>
        shown.evaluate((element) => {
          const active = (globalThis as unknown as PageGlobal).document.activeElement;
          const menu = element.closest('[role="menu"]');
          return menu !== null && active !== null && menu.contains(active);
        }),
      )
      .toBe(true);
    await window.keyboard.press('ArrowLeft');
    await expect(window.getByTestId(first)).toBeHidden();
    expect(await focusedTestId(window)).toBe(submenu);
    await window.keyboard.press('Escape');
  }

  // Open a mod… opens the folder the e2e run picks: this mod again.
  await arrowTo(window, 'toolbar-open-project');
  await window.keyboard.press('Enter');
  await expect(window.getByTestId('toolbar-settings')).toHaveCount(0);
  await expect(pack).toBeVisible();
});

test('the shortcuts do what they did', async () => {
  // A mod to open with Ctrl+O in the second launch.
  base = mkdtempSync(join(tmpdir(), 'msm-toolbar-'));
  const folders = {
    projectDir: join(base, 'msm_toolbar'),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  launched = await launchApp({ reuse: folders });
  await newProjectInFolder(launched.window);
  await expect(
    launched.window.locator('[data-testid^="element-row-"][data-testid$=":pack"]'),
  ).toBeVisible();
  await launched.close();
  launched = await launchApp({ reuse: folders });
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  const pack = window.locator('[data-testid^="element-row-"][data-testid$=":pack"]');
  await expect(pack).toHaveCount(0);

  // Ctrl+O opens a mod (the e2e run's folder) and Ctrl+Shift+N the New mod dialog. Both are the
  // menu bar's accelerators, which keys sent by the test do not reach, so the entry with the
  // accelerator is run as the key would run it.
  await runAccelerator(launched.app, 'CmdOrCtrl+O');
  await expect(pack).toBeVisible({ timeout: 30_000 });
  // The open's message comes a moment after the mod; wait for it so it lands before the dialog.
  await expect(toast(window)).toBeVisible();
  await runAccelerator(launched.app, 'CmdOrCtrl+Shift+N');
  await closeDialog(window, 'new-mod-dialog');

  // Ctrl+N: the Add dialog; a function, so Save, Undo and Redo have something to do.
  await window.keyboard.press('ControlOrMeta+N');
  const add = window.getByTestId('new-element-dialog');
  await expect(add).toBeVisible();
  await add.getByTestId('template-function').check();
  await add.getByTestId('new-element-name').fill('hello');
  await add.getByTestId('new-element-dialog-submit').click();
  await expect(add).toBeHidden();
  const fn = window.locator('[data-testid^="element-row-"][data-testid$=":hello"]');
  await expect(fn).toBeVisible();
  await expect(window.getByTestId('toolbar-save')).toBeEnabled();

  // Ctrl+S saves. Keys go to the toolbar's Save, so no editor field takes them for itself.
  await window.getByTestId('toolbar-save').focus();
  await window.keyboard.press('ControlOrMeta+S');
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();

  // Ctrl+Z and Ctrl+Shift+Z undo and redo the new function.
  await window.keyboard.press('ControlOrMeta+Z');
  await expect(fn).toHaveCount(0);
  await window.keyboard.press('ControlOrMeta+Shift+Z');
  await expect(fn).toBeVisible();

  // Ctrl+K: the search; Ctrl+Shift+P: the command palette.
  await window.keyboard.press('ControlOrMeta+K');
  await closeDialog(window, 'search-dialog');
  await window.keyboard.press('ControlOrMeta+Shift+P');
  await closeDialog(window, 'command-palette');

  // Ctrl+Shift+A: the AI helper.
  await window.keyboard.press('ControlOrMeta+Shift+A');
  await expect(window.getByTestId('ai-panel')).toBeVisible();

  // F5: Play; with no Prism Launcher here it opens the Prism setup.
  await window.keyboard.press('F5');
  await closeDialog(window, 'play-prism-panel');

  // F6: Try it.
  await window.keyboard.press('F6');
  await expect(window.getByTestId('toolbar-try-it')).toHaveAttribute('aria-pressed', 'true');
  await expect(window.getByTestId('tryit-view')).toBeVisible();

  await window.keyboard.press('ControlOrMeta+S');
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();
});
