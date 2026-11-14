/**
 * The Phase 2 data pack golden path, driven only through Studios and menus (the Raw JSON tab
 * is never opened): new project, a function typed into the function editor, a deliberate
 * command error that shows in Problems and disables data export, a `give` completion, the
 * `minecraft:load` tag (which adds the `minecraft` namespace), a shaped recipe filled through
 * the crafting grid, a rename through the command palette that rewrites the tag, data and
 * combined exports, an install into a fake world, and a second launch that reopens the saved
 * project.
 *
 * Preview and WebGL are unavailable headless, so nothing here asserts a render.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultTargetId, targetById } from '@msm/targets';
import { strFromU8, unzipSync } from 'fflate';
import { expect, type Locator, type Page, test } from 'playwright/test';
import { type LaunchedApp, launchApp, openDockTab, outputDir } from './fixtures';

/** The project folder name; a new project's namespace is derived from it. */
const NAMESPACE = 'msm_e2e';
/** The function is created as `load` (so the load tag resolves) and renamed to `greet`. */
const FUNCTION_ID = `${NAMESPACE}:load`;
const RENAMED_ID = `${NAMESPACE}:greet`;
const LOAD_TAG_ID = 'minecraft:load';
const RECIPE_ID = `${NAMESPACE}:ruby_block`;
const WORLD = 'E2E World';

/** The function source once fixed. */
const GOOD_LINES = ['say hi', 'give @s minecraft:emerald 3'];
/** The second line is not a command. */
const BAD_LINES = ['say hi', 'sya hi'];

/** The crafting grid the test fills in (row-major, `null` = empty). */
const GRID: (string | null)[][] = [
  ['minecraft:emerald', 'minecraft:emerald', null],
  ['minecraft:emerald', 'minecraft:emerald', null],
  [null, null, 'minecraft:gold_ingot'],
];
const RESULT_ITEM = 'minecraft:emerald_block';

/** The current target's data pack format, read from the target rather than written here. */
function dataFormat(): { major: number; minor: number } {
  // New projects use the default (newest release) target.
  const bundle = targetById(defaultTargetId);
  if (bundle === undefined) throw new Error('No default target.');
  return bundle.target.packFormats.data;
}

let base: string | undefined;
const launches: LaunchedApp[] = [];

test.afterEach(async () => {
  for (const launched of launches.splice(0)) await launched.close();
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

/** Zip entries of `path`, keyed by entry name. */
function readZip(path: string): Record<string, Uint8Array> {
  return unzipSync(new Uint8Array(readFileSync(path)));
}

function zipText(files: Record<string, Uint8Array>, name: string): string {
  const bytes = files[name];
  if (bytes === undefined) throw new Error(`${name} is missing from the zip.`);
  return strFromU8(bytes);
}

/** `.zip` names in `dir`, sorted. */
function zipsIn(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.zip'))
    .sort();
}

/** Opens the export chevron menu and returns the item `testId`. */
async function exportMenuItem(window: Page, testId: string): Promise<Locator> {
  await window.getByTestId('toolbar-export-menu').click();
  const item = window.getByTestId(testId);
  await expect(item).toBeVisible();
  return item;
}

/** The Monaco function editor's text, read from its rendered lines in document order. */
async function monacoText(window: Page): Promise<string> {
  return window
    .getByTestId('function-editor')
    .locator('.monaco-editor .view-lines')
    .evaluate((host) => {
      // The e2e build has no DOM types: just the fields read here.
      type Line = { style: { top: string }; textContent: string | null };
      const lines = [...host.querySelectorAll('.view-line')] as unknown as Line[];
      return lines
        .sort((a, b) => Number.parseFloat(a.style.top) - Number.parseFloat(b.style.top))
        .map((line) => (line.textContent ?? '').replace(/\u00a0/g, ' '))
        .join('\n');
    });
}

/**
 * Replaces the Monaco function editor's whole source with `lines`, typed key by key without
 * pauses (fast typing used to scramble the text; see `controlled-model`). Escape closes any
 * completion list first, so Enter starts a new line instead of accepting a proposal.
 */
async function typeSource(window: Page, lines: readonly string[]): Promise<void> {
  const view = window.getByTestId('function-editor').locator('.monaco-editor .view-lines');
  await expect(view).toBeVisible();
  await view.click();
  await window.keyboard.press('ControlOrMeta+A');
  await window.keyboard.press('Delete');
  await expect.poll(() => monacoText(window)).toBe('');
  for (const [index, line] of lines.entries()) {
    if (index > 0) {
      await window.keyboard.press('Escape');
      await window.keyboard.press('Enter');
    }
    await window.keyboard.type(line);
  }
  await window.keyboard.press('Escape');
  await expect.poll(() => monacoText(window)).toBe(lines.join('\n'));
}

/** Decodes a shaped recipe's `pattern` and `key` back into a grid of item ids. */
function gridOf(recipe: {
  pattern?: string[];
  key?: Record<string, unknown>;
}): (string | null)[][] {
  const pattern = recipe.pattern ?? [];
  const key = recipe.key ?? {};
  const width = Math.max(0, ...pattern.map((row) => row.length));
  return pattern.map((row) =>
    Array.from({ length: width }, (_, column) => {
      const symbol = row[column] ?? ' ';
      if (symbol === ' ') return null;
      const value = key[symbol];
      if (typeof value === 'string') return value;
      return JSON.stringify(value);
    }),
  );
}

test('data pack: function, problem, load tag, recipe grid, rename, export, install, reopen', async () => {
  base = mkdtempSync(join(tmpdir(), 'msm-datapack-'));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  // A fake Minecraft folder with one world, chosen through the settings file.
  const minecraftDir = join(base, 'minecraft');
  const worldDir = join(minecraftDir, 'saves', WORLD);
  mkdirSync(worldDir, { recursive: true });
  writeFileSync(join(worldDir, 'level.dat'), new Uint8Array([0]));
  mkdirSync(folders.msmHome, { recursive: true });
  writeFileSync(
    join(folders.msmHome, 'settings.json'),
    `${JSON.stringify({ minecraftDir }, null, 2)}\n`,
  );
  mkdirSync(outputDir, { recursive: true });

  // First launch. ----------------------------------------------------------------------------
  const first = await launchApp({ reuse: folders });
  launches.push(first);
  const { window } = first;
  await window.waitForLoadState('domcontentloaded');

  await window.getByTestId('toolbar-new-project').click();
  await expect(window.getByTestId(`element-row-${NAMESPACE}:pack`)).toBeVisible();

  // A function from the template, then its source typed in.
  await window.getByTestId('toolbar-add-element').click();
  let dialog = window.getByTestId('new-element-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('template-function').check();
  await expect(dialog.getByTestId('new-element-namespace')).toHaveValue(NAMESPACE);
  await dialog.getByTestId('new-element-name').fill('load');
  await dialog.getByTestId('new-element-dialog-submit').click();
  await expect(dialog).toBeHidden();
  await expect(window.getByTestId(`element-row-${FUNCTION_ID}`)).toBeVisible();
  await window.getByTestId(`element-row-${FUNCTION_ID}`).click();
  await expect(window.getByTestId('function-editor')).toBeVisible();

  // A bad command: an error at line 2 in Problems, and data export disabled with a reason.
  await typeSource(window, BAD_LINES);
  await openDockTab(window, 'problems');
  const problems = window.getByTestId('problems-panel');
  const errors = problems.locator('[data-testid="problem-row"][data-severity="error"]');
  // Spyglass reports the unknown command and its trailing data: every error is on line 2.
  await expect(errors.first()).toBeVisible();
  const errorCount = await errors.count();
  await expect(
    errors.filter({ hasText: FUNCTION_ID }).filter({ hasText: /line 2(:\d+)?\b/ }),
  ).toHaveCount(errorCount);
  await expect(window.getByTestId('toolbar-export-zip')).toBeDisabled();
  const dataItem = await exportMenuItem(window, 'export-data-zip');
  await expect(dataItem).toHaveAttribute('data-disabled', /.*/);
  await expect(window.getByTestId('export-data-zip-reason')).toContainText(/Fix \d+ error/);
  await window.keyboard.press('Escape');
  await expect(dataItem).toBeHidden();

  // Fix it: no errors left.
  await typeSource(window, GOOD_LINES);
  await expect(errors).toHaveCount(0);
  await expect(window.locator('footer').getByText(/^0 error\(s\)/)).toBeVisible();

  // Completion: a new line starting `gi` offers `give` from Spyglass through main (the
  // suggest controller has been registered since B140; before that no list ever showed).
  await window.keyboard.press('ControlOrMeta+End');
  await window.keyboard.press('Enter');
  await window.keyboard.type('gi');
  const suggest = window.getByTestId('function-editor').locator('.monaco-editor .suggest-widget');
  await expect(suggest).toBeVisible({ timeout: 30_000 });
  await expect(suggest.locator('.monaco-list-row', { hasText: 'give' }).first()).toBeVisible({
    timeout: 30_000,
  });
  await window.keyboard.press('Escape');
  await expect(suggest).toBeHidden();
  await typeSource(window, GOOD_LINES);
  await expect(errors).toHaveCount(0);

  // The load tag: the template adds the `minecraft` namespace.
  await window.getByTestId('toolbar-add-element').click();
  dialog = window.getByTestId('new-element-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('template-function_load').check();
  const namespaceSelect = dialog.getByTestId('new-element-namespace');
  await expect(namespaceSelect).toHaveValue('minecraft');
  await expect(namespaceSelect.locator('option:checked')).toHaveText('minecraft (new)');
  await expect(dialog.getByTestId('new-element-new-namespace')).toBeVisible();
  await expect(dialog.getByTestId('new-element-name')).toHaveValue('load');
  await dialog.getByTestId('new-element-dialog-submit').click();
  await expect(dialog).toBeHidden();
  const tagRow = window.getByTestId(`element-row-${LOAD_TAG_ID}`);
  await expect(tagRow).toBeVisible();
  await tagRow.click();
  const tagStudio = window.getByTestId('tag-studio');
  await expect(tagStudio).toBeVisible();
  await expect(tagStudio.getByTestId('tag-entry-0').locator('input[type="text"]')).toHaveValue(
    FUNCTION_ID,
  );

  // A shaped recipe, filled through the crafting grid and the result field.
  await window.getByTestId('toolbar-add-element').click();
  dialog = window.getByTestId('new-element-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('template-recipe_shaped').check();
  // The picker returns to the project's namespace, not `minecraft` (now sorted first).
  await expect(dialog.getByTestId('new-element-namespace')).toHaveValue(NAMESPACE);
  await dialog.getByTestId('new-element-name').fill('ruby_block');
  await dialog.getByTestId('new-element-dialog-submit').click();
  await expect(dialog).toBeHidden();
  await window.getByTestId(`element-row-${RECIPE_ID}`).click();
  const studio = window.getByTestId('recipe-studio');
  await expect(studio).toBeVisible();
  for (const [r, row] of GRID.entries()) {
    for (const [c, item] of row.entries()) {
      const cell = studio.getByTestId(`recipe-cell-${r}-${c}`);
      if ((await cell.inputValue()) === (item ?? '')) continue;
      await cell.fill(item ?? '');
      await cell.press('Enter');
    }
  }
  for (const [r, row] of GRID.entries()) {
    for (const [c, item] of row.entries()) {
      await expect(studio.getByTestId(`recipe-cell-${r}-${c}`)).toHaveValue(item ?? '');
    }
  }
  const result = studio.getByTestId('recipe-result');
  await result.fill(RESULT_ITEM);
  await result.press('Enter');
  await expect(result).toHaveValue(RESULT_ITEM);
  await expect(errors).toHaveCount(0);

  // Rename the function through the command palette; the load tag follows.
  await window.getByTestId(`element-row-${FUNCTION_ID}`).click();
  await expect(window.getByTestId('function-editor')).toBeVisible();
  await window.keyboard.press('ControlOrMeta+Shift+P');
  const palette = window.getByTestId('command-palette');
  await expect(palette).toBeVisible();
  await palette.getByTestId('command-palette-input').fill('rename');
  await palette.getByTestId('command-renameElement').click();
  const rename = window.getByTestId('rename-dialog');
  await expect(rename).toBeVisible();
  await expect(rename).toContainText(`1 reference to ${FUNCTION_ID} will be rewritten`);
  await rename.getByTestId('rename-input').fill(RENAMED_ID);
  await rename.getByTestId('rename-dialog-submit').click();
  await expect(rename).toBeHidden();
  await expect(window.getByTestId(`element-row-${RENAMED_ID}`)).toBeVisible();
  await expect(window.getByTestId(`element-row-${FUNCTION_ID}`)).toHaveCount(0);
  await window.getByTestId(`element-row-${LOAD_TAG_ID}`).click();
  await expect(
    window.getByTestId('tag-studio').getByTestId('tag-entry-0').locator('input[type="text"]'),
  ).toHaveValue(RENAMED_ID);
  await expect(errors).toHaveCount(0);

  // Export the data pack zip into MSM_E2E_OUT_DIR. -----------------------------------------
  const format = dataFormat();
  const checkDataPack = (files: Record<string, Uint8Array>): void => {
    const names = Object.keys(files);
    expect(names).toContain('pack.mcmeta');
    expect(names.some((name) => name.startsWith('assets/'))).toBe(false);
    const mcmeta = JSON.parse(zipText(files, 'pack.mcmeta')) as {
      pack?: { pack_format?: number; min_format?: number[]; max_format?: number[] };
    };
    expect(mcmeta.pack?.pack_format).toBe(format.major);
    expect(mcmeta.pack?.min_format).toEqual([format.major, format.minor]);
    expect(mcmeta.pack?.max_format).toEqual([format.major, format.minor]);

    const fn = zipText(files, `data/${NAMESPACE}/function/greet.mcfunction`);
    expect(fn.split(/\r?\n/).filter((line) => line !== '')).toEqual(GOOD_LINES);
    expect(names).not.toContain(`data/${NAMESPACE}/function/load.mcfunction`);

    const tag = JSON.parse(zipText(files, 'data/minecraft/tags/function/load.json')) as {
      values?: unknown[];
    };
    expect(tag.values).toEqual([RENAMED_ID]);

    const recipe = JSON.parse(zipText(files, `data/${NAMESPACE}/recipe/ruby_block.json`)) as {
      type?: string;
      pattern?: string[];
      key?: Record<string, unknown>;
      result?: { id?: string };
    };
    expect(recipe.type).toBe('minecraft:crafting_shaped');
    expect(gridOf(recipe)).toEqual(GRID);
    expect(recipe.result?.id).toBe(RESULT_ITEM);
  };

  await (await exportMenuItem(window, 'export-data-zip')).click();
  await expect.poll(() => zipsIn(folders.outDir), { timeout: 20_000 }).toHaveLength(1);
  const [dataZip] = zipsIn(folders.outDir);
  if (dataZip === undefined) throw new Error('No data pack zip.');
  checkDataPack(readZip(join(folders.outDir, dataZip)));
  rmSync(join(folders.outDir, dataZip));

  // Both packs into a folder: two zips, one per pack.
  await (await exportMenuItem(window, 'export-combined')).click();
  await expect.poll(() => zipsIn(folders.outDir), { timeout: 20_000 }).toHaveLength(2);
  const combined = zipsIn(folders.outDir).map((name) => ({
    name,
    files: readZip(join(folders.outDir, name)),
  }));
  const dataPacks = combined.filter(({ files }) =>
    Object.keys(files).some((n) => n.startsWith('data/')),
  );
  const resourcePacks = combined.filter(({ files }) =>
    Object.keys(files).every((n) => !n.startsWith('data/')),
  );
  expect(dataPacks).toHaveLength(1);
  expect(resourcePacks).toHaveLength(1);
  for (const { files } of dataPacks) checkDataPack(files);
  for (const { files } of resourcePacks) expect(Object.keys(files)).toContain('pack.mcmeta');

  // Install the data pack into the fake world. ---------------------------------------------
  await window.getByTestId('toolbar-install-menu').click();
  const install = window.getByTestId('install-data');
  await expect(install).toBeVisible();
  await expect(window.getByTestId('install-data-reason')).toHaveCount(0);
  await install.click();
  const picker = window.getByTestId('world-picker');
  await expect(picker).toBeVisible();
  await picker.getByTestId(`world-row-${WORLD}`).click();
  await picker.getByTestId('world-picker-submit').click();
  await expect(picker).toBeHidden();
  const datapacks = join(worldDir, 'datapacks');
  await expect
    .poll(() => (existsSync(datapacks) ? zipsIn(datapacks) : []), { timeout: 20_000 })
    .toHaveLength(1);
  const [installed] = zipsIn(datapacks);
  if (installed === undefined) throw new Error('No installed zip.');
  checkDataPack(readZip(join(datapacks, installed)));

  await window.screenshot({ path: join(outputDir, 'datapack-path.png') });

  // Save, so closing does not prompt to discard.
  await window.getByTestId('toolbar-save').click();
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();
  await first.close();
  launches.splice(0);

  // Second launch: reopen and find every element. ------------------------------------------
  const second = await launchApp({ reuse: folders });
  launches.push(second);
  await second.window.waitForLoadState('domcontentloaded');
  await second.window.getByTestId('toolbar-open-project').click();
  for (const id of [RENAMED_ID, LOAD_TAG_ID, RECIPE_ID]) {
    await expect(second.window.getByTestId(`element-row-${id}`)).toBeVisible();
  }
  await second.window.getByTestId(`element-row-${RECIPE_ID}`).click();
  await expect(second.window.getByTestId('recipe-cell-2-2')).toHaveValue('minecraft:gold_ingot');
  await second.window.screenshot({ path: join(outputDir, 'datapack-path-reopened.png') });
});
