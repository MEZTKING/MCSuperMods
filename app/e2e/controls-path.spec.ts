/**
 * The controls path (ADR 0091 D7; brief B427). A brand-new install (`MSM_E2E_NEW_INSTALL`) opens
 * Home in Very easy; "Start a new mod" makes the mod by name, then the path works in Advanced.
 *
 * 1. A key bind from the "Dash key" template; the Key bind Studio's "Press a key" takes the next
 *    key pressed (J, free in Minecraft) as its default key.
 * 2. A HUD element from the "Mana bar" template; the HUD Studio's preview draws it, alone, as
 *    the element being edited, an 81 by 5 bar above the hotbar.
 * 3. The Key bind Studio's Rules section adds "A player presses the key" with "Show a number on
 *    screen": the mana bar picked from the HUD menu and the value 25.
 * 4. Zero problems: the footer counts no errors and, back in Very easy, Things to fix has
 *    nothing to fix and no tips.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from 'playwright/test';
import {
  expectStatusAgrees,
  type LaunchedApp,
  launchApp,
  openAddDialog,
  outputDir,
} from './fixtures';

const MOD_NAME = 'Magic Keys';

let base: string | undefined;
let launched: LaunchedApp | undefined;
const savedEnv: Record<string, string | undefined> = {};

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

/** Things to fix shows nothing to fix and no tips (warnings and info included). */
async function expectNothingToFix(window: Page): Promise<void> {
  const fix = window.getByTestId('things-to-fix');
  await expect(fix.getByTestId('things-to-fix-none')).toBeVisible({ timeout: 30_000 });
  await expect(fix.getByTestId('things-to-fix-tips')).toHaveCount(0);
}

/**
 * Opens a chip's or menu button's popover and chooses the entry named `name` (or with test id
 * `testId`). The popover can reach past the bottom of the window, so the choice is clicked
 * through its DOM event.
 */
async function pickFromMenu(
  window: Page,
  opener: Locator,
  choice: { name: string } | { testId: string },
): Promise<void> {
  await opener.click();
  const entry =
    'name' in choice
      ? window.getByRole('button', { name: choice.name, exact: true })
      : window.getByTestId(choice.testId);
  await expect(entry).toBeAttached();
  await entry.dispatchEvent('click');
}

/** The `data` of a saved element file. */
function savedData(projectDir: string, ns: string, folder: string, path: string) {
  const file = join(projectDir, 'content', ns, folder, `${path}.json`);
  return (JSON.parse(readFileSync(file, 'utf8')) as { data: Record<string, unknown> }).data;
}

/** Adds an element from template `templateId` through the New element dialog. */
async function addFromTemplate(
  window: Page,
  ns: string,
  filter: string,
  templateId: string,
  name: string,
): Promise<void> {
  await openAddDialog(window);
  const add = window.getByTestId('new-element-dialog');
  await expect(add).toBeVisible();
  await add.getByTestId('new-element-filter').fill(filter);
  await add.getByTestId(`template-${templateId}`).check();
  await expect(add.getByTestId('new-element-namespace')).toHaveValue(ns);
  await add.getByTestId('new-element-name').fill(name);
  await add.getByTestId('new-element-dialog-submit').click();
  await expect(add).toBeHidden();
}

test('controls: a key bind pressed in its Studio, a mana bar, a Rules key card, zero problems', async () => {
  test.setTimeout(180_000);
  base = mkdtempSync(join(tmpdir(), 'msm-controls-'));
  const folders = {
    projectDir: join(base, 'picked'),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  mkdirSync(outputDir, { recursive: true });
  savedEnv.MSM_E2E_NEW_INSTALL = process.env.MSM_E2E_NEW_INSTALL;
  process.env.MSM_E2E_NEW_INSTALL = '1';

  launched = await launchApp({ reuse: folders });
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');

  const welcome = window.getByTestId('welcome-dialog');
  await expect(welcome).toBeVisible();
  await welcome.getByRole('button', { name: 'Got it' }).click();
  await expect(welcome).toBeHidden();
  const home = window.getByTestId('home');
  await expect(home).toBeVisible();

  // A new mod by name. ------------------------------------------------------------------------
  await home.getByTestId('home-new').click();
  const newMod = window.getByTestId('new-mod-dialog');
  await newMod.getByTestId('new-mod-name').fill(MOD_NAME);
  await newMod.getByTestId('new-mod-dialog-submit').click();
  await expect(newMod).toBeHidden();
  const projectDir = join(folders.msmHome, 'Documents', 'MCSuperMods', MOD_NAME);
  await expect.poll(() => existsSync(join(projectDir, 'msm.project.json'))).toBe(true);
  const manifest = JSON.parse(readFileSync(join(projectDir, 'msm.project.json'), 'utf8')) as {
    namespaces: string[];
  };
  const ns = manifest.namespaces[0] ?? '';
  expect(ns).not.toBe('');
  const id = (path: string) => `${ns}:${path}`;

  // A key bind from its template; its key set by pressing it. ---------------------------------
  await addFromTemplate(window, ns, 'dash', 'msm_key_bind_dash', 'dash');
  const keyStudio = window.getByTestId('key-bind-studio');
  await expect(keyStudio).toBeVisible();
  const keyWords = keyStudio.getByTestId('key-bind-key-words');
  await expect(keyWords).toContainText('Z');
  await keyStudio.getByTestId('key-bind-press').click();
  const capture = keyStudio.getByTestId('key-bind-capture');
  await expect(capture).toBeFocused();
  await window.keyboard.press('KeyJ');
  await expect(capture).toHaveCount(0);
  await expect(keyStudio.getByTestId('key-bind-capture-message')).toHaveCount(0);
  await expect(keyWords).toContainText('J');
  await expect(keyWords).not.toContainText('Z');

  // A HUD element from the mana bar template, and its preview. -------------------------------
  await addFromTemplate(window, ns, 'mana', 'msm_hud_mana_bar', 'mana');
  const hudStudio = window.getByTestId('hud-studio');
  await expect(hudStudio).toBeVisible();
  const preview = hudStudio.getByTestId('hud-preview');
  await expect(preview.getByTestId('hud-preview-screen')).toBeVisible();
  const items = preview.locator('[data-testid^="hud-preview-item-"]');
  await expect(items).toHaveCount(1);
  const mana = preview.getByTestId(`hud-preview-item-${id('mana')}`);
  await expect(mana).toHaveAttribute('data-current', 'true');
  await expect(mana).toHaveAttribute('data-w', '81');
  await expect(mana).toHaveAttribute('data-h', '5');
  await expect(hudStudio.getByTestId('hud-look-bar')).toBeVisible();
  await expect(hudStudio.getByTestId('hud-anchor-above_hotbar')).toBeVisible();

  // Rules: "A player presses the key" sets the HUD value. -------------------------------------
  await window.getByTestId(`element-row-${id('dash')}`).click();
  await expect(keyStudio).toBeVisible();
  const section = keyStudio.getByTestId('rules-section');
  await expect(section).toBeVisible();
  await expect(section.getByTestId('rules-section-empty')).toHaveText('No rules for this key yet.');
  await section.getByTestId('rules-section-add').click();
  const card = section.getByTestId('rule-card');
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId('rules-chip-trigger')).toHaveAccessibleName(
    'When: A player presses the key',
  );
  await expect(card.getByTestId('rules-chip-subject')).toHaveText('Dash');
  await pickFromMenu(window, card.getByTestId('rules-add-step-do'), {
    name: 'Show a number on screen',
  });
  const hudChip = card.getByTestId('rules-chip-hud');
  await pickFromMenu(window, hudChip, { testId: `rules-hud-${id('mana')}` });
  await window.keyboard.press('Escape');
  await expect(hudChip).toHaveText('Mana');
  await card.getByTestId('rules-chip-value').click();
  const number = window.getByTestId('rules-number');
  await number.fill('25');
  await number.press('Tab');
  await window.keyboard.press('Escape');
  await expect(card.getByTestId('rule-sentence')).toContainText(
    'When a player presses Dash, set Mana to 25',
  );
  await expect(card.getByRole('alert')).toHaveCount(0);
  await expectStatusAgrees(window);

  // Save: the files hold the key, the HUD and the rule. ---------------------------------------
  await window.getByTestId('toolbar-save').click();
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();
  expect(savedData(projectDir, ns, 'key_bind', 'dash').default_key).toBe('key.keyboard.j');
  expect(savedData(projectDir, ns, 'hud', 'mana')).toMatchObject({ type: 'bar', max: 100 });
  const rules = savedData(projectDir, ns, 'rules', 'rules') as {
    rules: { when: { trigger: string; subject: string }; do: Record<string, unknown>[] }[];
  };
  expect(rules.rules).toHaveLength(1);
  expect(rules.rules[0]?.when).toMatchObject({ trigger: 'key_pressed', subject: id('dash') });
  expect(rules.rules[0]?.do).toMatchObject([{ step: 'set_hud', hud: id('mana'), value: 25 }]);
  await window.screenshot({ path: join(outputDir, 'controls-path.png') });

  // Back to Very easy: nothing to fix. ---------------------------------------------------------
  await window.getByTestId('toolbar-home').click();
  await window.getByTestId('toolbar-home').click();
  await expect(home).toBeVisible();
  await expectNothingToFix(window);
});
