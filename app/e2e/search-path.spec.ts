/**
 * The search path (ADR 0124; brief B671). No network request is made in any test
 * (asserted at the end of each, renderer and main).
 *
 * 1. Very easy, a brand-new install with no mod, SwiftShader WebGL: Home's bar **What do you want
 *    to make?** opens the search; "a blue swrod" is read as "a blue sword" (the corrected line and
 *    the chip "blue"); the Weapon flow is the Best match with its answers as a sentence; the
 *    preview draws the sword (its picture read back as blue, and the 3D canvas drawn); **Make
 *    this** asks for the mod's name ("Blue Sword Mod"), makes the mod and opens the Creator on
 *    the Weapon flow with Sword, the blue and the name; Create puts it on My things, and Undo
 *    takes it off. "custom ore that drops xp" with **Add to my mod** adds the ore and its rule
 *    book at once, and one Undo removes both. "how do I add a recipe" and **Show me how** open the
 *    guide at Recipes. "turn off showcase clips" opens Settings at that line.
 * 2. Advanced, `fixtures/sample-rules` open: Ctrl+K, `>` and a command run (What's new); `@` and
 *    a thing of the mod opened in its Studio; Ctrl+Shift+P is still the palette and runs a command.
 * 3. On the 26.4 target, with a third-party plugin whose flow says it works on 26.3 only: the flow
 *    is listed last in its section, greyed, with "Not on this Minecraft version." and no button.
 *    (No built-in flow is unavailable on 26.4 today: every flow's `supports` is `hasFabric`, and
 *    both targets build a Fabric jar; so the rule is shown through the plugin API's `supports`,
 *    the same field the built-in flows use.)
 */

import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from 'playwright/test';
import { appDir, installPlugin, toolbarMenu } from './fixtures';
import {
  bluePixelShare,
  launchSearch,
  type SearchLaunch,
  veryEasyHome,
  WEBGL_ARGS,
} from './search-helpers';

const NOT_ON_TARGET = 'Not on this Minecraft version.';

let launched: SearchLaunch | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

/** Opens the search from Home's bar and types `text`; returns the dialog. */
async function searchFromHome(window: Page, text: string): Promise<Locator> {
  await window.getByTestId('home-search-field').click();
  const dialog = window.getByTestId('search-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('data-door', 'start');
  const field = dialog.getByTestId('search-field');
  await expect(field).toBeFocused();
  await field.fill(text);
  return dialog;
}

/** Back to Home through the toolbar. */
async function goHome(window: Page): Promise<Locator> {
  await window.getByTestId('toolbar-home').click();
  const home = window.getByTestId('home');
  await expect(home).toBeVisible();
  return home;
}

test('search in Very easy: a blue sword, an ore that drops xp, a how-to and a setting', async () => {
  test.setTimeout(180_000);
  launched = await launchSearch('very-easy', {
    args: WEBGL_ARGS,
    env: { MSM_E2E_NEW_INSTALL: '1' },
  });
  const { window, msmHome } = launched;
  const home = await veryEasyHome(window);

  // The bar on Home, with no mod. ---------------------------------------------------------------
  const bar = home.getByTestId('home-search-field');
  await expect(bar).toHaveAccessibleName('What do you want to make?');
  let dialog = await searchFromHome(window, 'a blue swrod');

  // The chips: the corrected words and the colour understood. ---------------------------------
  await expect(dialog.getByTestId('search-corrected')).toHaveText(
    'Showing results for a blue sword',
  );
  const chip = dialog.getByTestId('search-chip').filter({ hasText: 'blue' });
  await expect(chip).toHaveAttribute('data-kind', 'colour');
  const best = dialog.getByTestId('search-group-best');
  await expect(best.getByRole('presentation')).toHaveText(/^Best match/);
  const weapon = best.getByTestId('search-row-flow:weapon');
  await expect(weapon).toHaveAttribute('aria-selected', 'true');
  await expect(weapon).toContainText('Called Blue Sword, blue, Sword.');
  // Very easy says no ids.
  await expect(dialog.getByTestId('search-row-id')).toHaveCount(0);

  // The preview is drawn: the sword's picture is blue, and the 3D view draws it. ---------------
  const preview = dialog.getByTestId('search-preview');
  const result = preview.getByTestId('search-result-preview');
  await expect(result).toHaveAttribute('data-preview-type', 'flow');
  await expect(result).toHaveAttribute('data-state', 'drawn', { timeout: 30_000 });
  await expect(preview).toContainText('Makes Blue Sword.');
  const picture = preview.locator('[data-testid^="creator-item-"] img').first();
  await expect(picture).toBeVisible();
  await expect.poll(() => bluePixelShare(picture)).toBeGreaterThan(0.2);
  const canvas = preview.getByTestId('creator-item-canvas').locator('canvas');
  await expect(canvas).toHaveCount(1);

  // Make this: the mod's name, the mod, then the Creator on the Weapon flow. -------------------
  await expect(preview.getByTestId('search-action-make')).toHaveText('Make this');
  await preview.getByTestId('search-action-make').click();
  await expect(dialog).toBeHidden();
  const newMod = window.getByTestId('new-mod-dialog');
  await expect(newMod).toBeVisible();
  await expect(newMod.getByTestId('new-mod-name')).toHaveValue('Blue Sword Mod');
  await newMod.getByTestId('new-mod-dialog-submit').click();
  await expect(newMod).toBeHidden();
  const projectDir = join(msmHome, 'Documents', 'MCSuperMods', 'Blue Sword Mod');
  await expect.poll(() => existsSync(join(projectDir, 'msm.project.json'))).toBe(true);
  const creator = window.getByTestId('creator-dialog');
  await expect(creator).toBeVisible();
  await expect(creator.getByRole('heading', { name: 'Create: Weapon' })).toBeVisible();
  await expect(creator.getByTestId('param-weapon_type')).toHaveValue('sword');
  await expect(creator.getByTestId('param-weapon_name')).toHaveValue('Blue Sword');
  await expect(creator).toContainText('#3c44aa');
  const create = creator.getByTestId('creator-create');
  await expect(create).toBeEnabled({ timeout: 30_000 });
  await create.click();
  await expect(creator).toBeHidden({ timeout: 30_000 });

  // The thing on My things; Undo takes it off. --------------------------------------------------
  await goHome(window);
  const things = home.getByTestId('my-things');
  await expect(things).toContainText('Blue Sword');
  await window.getByTestId('toolbar-undo').click();
  await expect(home.getByTestId('my-things-empty')).toBeVisible();

  // "custom ore that drops xp": Add to my mod adds the ore and its rule book in one step. -------
  dialog = await searchFromHome(window, 'custom ore that drops xp');
  const ore = dialog.getByTestId('search-row-flow:custom_ore').first();
  await expect(ore).toHaveAttribute('aria-selected', 'true');
  await expect(ore.getByTestId('search-row-behaviour')).toHaveText(
    'When a player breaks it, it gives experience.',
  );
  await expect(dialog.getByTestId('search-action-add')).toHaveText('Add to my mod');
  await dialog.getByTestId('search-action-add').click();
  await expect(dialog).toBeHidden();
  const items = things.locator('li');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('Custom ore');
  await expect(items.nth(0)).toContainText('Ruby');
  await expect(items.nth(1)).toContainText('Ruby ore rules');
  await expect(things.getByTestId('my-thing-blue_sword_mod:ruby_ore_rules')).toBeVisible();
  await expect(window.getByTestId('things-to-fix').getByTestId('things-to-fix-none')).toBeVisible();
  // One step: one Undo takes back the ore and its rule book.
  await window.getByTestId('toolbar-undo').click();
  await expect(home.getByTestId('my-things-empty')).toBeVisible();

  // "how do I add a recipe": Show me how opens the guide at Recipes. -----------------------------
  dialog = await searchFromHome(window, 'how do I add a recipe');
  const recipes = dialog.getByTestId('search-row-guide:templates-and-examples#recipes').first();
  await recipes.hover();
  await expect(recipes).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.getByTestId('search-preview-guide')).toContainText('To add a recipe');
  await dialog.getByTestId('search-action-show-me-how').click();
  await expect(dialog).toBeHidden();
  const guide = window.getByTestId('guide-dialog');
  await expect(guide).toBeVisible();
  await expect(
    guide.getByTestId('guide-body').getByRole('heading', { name: 'Recipes', exact: true }),
  ).toBeInViewport();
  await guide.getByTestId('guide-close').click();
  await expect(guide).toBeHidden();

  // A setting opened at its line. ---------------------------------------------------------------
  dialog = await searchFromHome(window, 'turn off showcase clips');
  const setting = dialog.getByTestId('search-row-setting:showcase-clips').first();
  await expect(setting).toHaveAttribute('aria-selected', 'true');
  await dialog.getByTestId('search-action-open').click();
  await expect(dialog).toBeHidden();
  const settings = window.getByTestId('settings-dialog');
  await expect(settings).toBeVisible();
  await expect(settings.locator('[data-setting="showcase-clips"]')).toHaveAttribute(
    'data-marked',
    'true',
  );
  await expect(settings.getByTestId('settings-showcase-clips')).toBeFocused();
  await settings.getByTestId('settings-close').click();

  expect(await launched.network()).toEqual([]);
});

test('search: Ctrl+K with > and @ for everyone, and the palette still runs commands', async () => {
  test.setTimeout(120_000);
  launched = await launchSearch('advanced', {
    prepare: ({ projectDir }) =>
      cpSync(join(appDir, '..', 'fixtures', 'sample-rules'), projectDir, { recursive: true }),
  });
  const { window } = launched;
  await expect(window.getByTestId('welcome-dialog')).toHaveCount(0);
  await toolbarMenu(window, 'toolbar-open-project');
  await expect(window.getByTestId('element-row-msm_sample_rules:lucky_block')).toBeVisible();

  // Ctrl+K, `>`: a command, run. ----------------------------------------------------------------
  await window.keyboard.press('Control+K');
  let dialog = window.getByTestId('search-dialog');
  await expect(dialog).toBeVisible();
  const field = dialog.getByTestId('search-field');
  await expect(field).toBeFocused();
  await field.fill("> what's new");
  const command = dialog.getByTestId('search-row-command:whatsNew').first();
  await expect(command).toHaveAttribute('aria-selected', 'true');
  // Only commands are offered after `>`.
  await expect(
    dialog.locator('[role="option"][data-source]:not([data-source="command"])'),
  ).toHaveCount(0);
  await window.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  const whatsNew = window.getByTestId('whats-new-dialog');
  await expect(whatsNew).toBeVisible();
  await whatsNew.getByTestId('whats-new-close').click();
  await expect(whatsNew).toBeHidden();

  // Ctrl+K, `@`: a thing of the mod, opened. ----------------------------------------------------
  await window.keyboard.press('Control+K');
  dialog = window.getByTestId('search-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('search-field').fill('@ lucky block');
  const thing = dialog
    .getByTestId('search-row-project:element:msm_sample_rules:lucky_block')
    .first();
  await expect(thing).toHaveAttribute('aria-selected', 'true');
  // The row names the thing; no id (ADR 0130: the search asks in plain words).
  await expect(thing.getByTestId('search-row-id')).toHaveCount(0);
  // `@` keeps the mod's things and its Things to fix.
  await expect(
    dialog.locator(
      '[role="option"][data-source]:not([data-source="project"]):not([data-source="problem"])',
    ),
  ).toHaveCount(0);
  await window.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(window.getByTestId('block-studio')).toBeVisible();

  // The palette's own key still opens the palette, which runs a command. -----------------------
  await window.keyboard.press('Control+Shift+P');
  const palette = window.getByTestId('command-palette');
  await expect(palette).toBeVisible();
  await expect(window.getByTestId('search-dialog')).toHaveCount(0);
  await palette.getByTestId('command-palette-input').fill("what's new");
  await expect(palette.getByTestId('command-whatsNew')).toBeVisible();
  await window.keyboard.press('Enter');
  await expect(window.getByTestId('whats-new-dialog')).toBeVisible();
  await window.getByTestId('whats-new-close').click();

  expect(await launched.network()).toEqual([]);
});

/**
 * A third-party plugin with five Creator flows: "Quokka" says it works on 26.3 only; "Quokka lamp",
 * "lantern", "torch" and "candle" work everywhere. "quokka" matches the first by its whole title,
 * the others by one word; with at most three Best matches, one of them stays in the section.
 */
const QUOKKA_PLUGIN = `const flow = (id, title, supports) => ({
  id,
  title,
  description: 'A block that glows like a quokka smiles.',
  category: 'content',
  layers: ['resourcepack'],
  requiresKinds: [],
  creator: { group: 'blocks', blurb: 'A block that glows like a quokka smiles.' },
  ...(supports ? { supports } : {}),
  build() { return { elements: [], assets: [] }; },
});
defineMsmPlugin({
  id: 'e2e.quokka',
  apiVersion: '^1.0.0',
  contributes: {
    projectStarters: [
      flow('e2e_quokka', 'Quokka', (target) => target.id === 'mc-26.3'),
      flow('e2e_quokka_lamp', 'Quokka lamp'),
      flow('e2e_quokka_lantern', 'Quokka lantern'),
      flow('e2e_quokka_torch', 'Quokka torch'),
      flow('e2e_quokka_candle', 'Quokka candle'),
    ],
  },
});
`;

test('search on the 26.4 target: a flow it cannot make is last, greyed, with its reason', async () => {
  test.setTimeout(120_000);
  launched = await launchSearch('target', {
    prepare: ({ projectDir, msmHome }) => {
      cpSync(join(appDir, '..', 'fixtures', 'sample-rules'), projectDir, { recursive: true });
      const manifestPath = join(projectDir, 'msm.project.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { targets: string[] };
      manifest.targets = ['mc-26.4'];
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      installPlugin(msmHome, 'quokka', null, {
        'msm-plugin.json': `${JSON.stringify(
          {
            manifestVersion: 1,
            id: 'e2e.quokka',
            name: 'Quokka',
            version: '0.0.1',
            apiVersion: '^1.0.0',
            main: 'main.js',
            capabilities: ['projectStarters'],
          },
          null,
          2,
        )}\n`,
        'main.js': QUOKKA_PLUGIN,
      });
    },
  });
  const { window } = launched;
  await toolbarMenu(window, 'toolbar-open-project');
  await expect(window.getByTestId('element-row-msm_sample_rules:lucky_block')).toBeVisible();

  await window.keyboard.press('Control+K');
  const dialog = window.getByTestId('search-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('search-field').fill('quokka');
  const make = dialog.getByTestId('search-group-make');
  const quokka = make.getByTestId('search-row-flow:e2e_quokka');
  await expect(quokka).toBeVisible();
  // Greyed, with its reason.
  await expect(quokka).toHaveAttribute('aria-disabled', 'true');
  await expect(quokka.getByTestId('search-row-reason')).toHaveText(NOT_ON_TARGET);
  // Never a Best match, though its whole title matches; the flows this target can make are.
  const best = dialog.getByTestId('search-group-best');
  await expect(best.getByTestId('search-row-flow:e2e_quokka')).toHaveCount(0);
  await expect(best.locator('[data-testid^="search-row-flow:e2e_quokka_"]')).not.toHaveCount(0);
  await expect(best.locator('[aria-disabled="true"]')).toHaveCount(0);
  // Last of its section, after the flows this target can make.
  const rows = make.getByRole('option');
  await expect(rows.last()).toHaveAttribute('data-testid', 'search-row-flow:e2e_quokka');
  await expect(rows.first()).toHaveAttribute('data-testid', /^search-row-flow:e2e_quokka_/);
  await expect(rows.first()).not.toHaveAttribute('aria-disabled', 'true');
  // Chosen, it says why and offers no button.
  await quokka.hover();
  await expect(quokka).toHaveAttribute('aria-selected', 'true');
  const preview = dialog.getByTestId('search-preview');
  await expect(preview).toContainText(NOT_ON_TARGET);
  await expect(preview.getByTestId('search-actions')).toHaveCount(0);
  await window.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  expect(await launched.network()).toEqual([]);
});
