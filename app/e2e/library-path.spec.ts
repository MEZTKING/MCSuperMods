/**
 * The templates and samples library path (ADR 0020), driven only through dialogs, menus and
 * the command palette: a new project from the Custom ore starter (a real `msm:block` ruby ore,
 * Phase 4) with no errors, resource and data pack exports checked file by file, the Fabric mod
 * jar with a separate runtime (the e2e build may have no runtime jar), the Examples gallery (search, copy into the
 * project, the notes callout, a second copy that reports duplicates, undo and redo), a
 * template found through the New element filter, a second export, and a second launch that
 * opens a gallery example as a new project in a fresh folder.
 *
 * Preview and WebGL are unavailable headless, so nothing here asserts a render.
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { expect, type Locator, type Page, test } from 'playwright/test';
import { type LaunchedApp, launchApp, outputDir } from './fixtures';

/** The first project's folder name; a new project's namespace is derived from it. */
const NAMESPACE = 'ruby_e2e';
/** The second launch's fresh folder for "Open as new project". */
const SECOND_NAMESPACE = 'fn_e2e';

const ORE_BLOCK_ID = `${NAMESPACE}:ruby_ore`;
const ORE_MODEL_ID = `${NAMESPACE}:block/ruby_ore`;
const RUBY_ITEM_ID = `${NAMESPACE}:ruby`;
const RUBY_BLOCK_ID = `${NAMESPACE}:ruby_block`;
const MOD_ID = `${NAMESPACE}:mod`;
const LOOT_TABLE_ID = `${NAMESPACE}:blocks/ruby_ore`;
const ORE_RECIPE_ID = `${NAMESPACE}:ruby_block_from_rubies`;
const ROOT_ADVANCEMENT_ID = `${NAMESPACE}:root`;
/** The element the "Shaped recipe with a named result" example adds. */
const EXAMPLE_RECIPE_ID = `${NAMESPACE}:lucky_lantern`;
const BLASTING_ID = `${NAMESPACE}:raw_copper_blasting`;

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

function zipJson(files: Record<string, Uint8Array>, name: string): unknown {
  const bytes = files[name];
  if (bytes === undefined) throw new Error(`${name} is missing from the zip.`);
  return JSON.parse(strFromU8(bytes));
}

/** `.zip` names in `dir`, sorted. */
function zipsIn(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.zip'))
    .sort();
}

/** `.jar` names in `dir`, sorted. */
function jarsIn(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.jar'))
    .sort();
}

/** Removes every zip in `dir`. */
function clearZips(dir: string): void {
  for (const name of zipsIn(dir)) rmSync(join(dir, name));
}

/** Whether a zip holds a data pack (any `data/` entry). */
function isDataPack(files: Record<string, Uint8Array>): boolean {
  return Object.keys(files).some((name) => name.startsWith('data/'));
}

/** Opens the export chevron menu and clicks the item `testId`. */
async function exportVia(window: Page, testId: string): Promise<void> {
  await window.getByTestId('toolbar-export-menu').click();
  const item = window.getByTestId(testId);
  await expect(item).toBeVisible();
  await expect(item).not.toHaveAttribute('data-disabled', /.*/);
  await item.click();
}

/**
 * Exports the resource pack zip and then the data pack zip into `outDir` (emptied first) and
 * returns both, read back.
 */
async function exportBoth(
  window: Page,
  outDir: string,
): Promise<{ resource: Record<string, Uint8Array>; data: Record<string, Uint8Array> }> {
  clearZips(outDir);
  await exportVia(window, 'export-resource-zip');
  await expect.poll(() => zipsIn(outDir), { timeout: 20_000 }).toHaveLength(1);
  await exportVia(window, 'export-data-zip');
  await expect.poll(() => zipsIn(outDir), { timeout: 20_000 }).toHaveLength(2);
  const zips = zipsIn(outDir).map((name) => readZip(join(outDir, name)));
  const resource = zips.find((files) => !isDataPack(files));
  const data = zips.find(isDataPack);
  if (resource === undefined || data === undefined) {
    throw new Error('Expected one resource pack zip and one data pack zip.');
  }
  return { resource, data };
}

/** The Problems panel's error rows (opens the panel). */
async function errorRows(window: Page): Promise<Locator> {
  await window.getByTestId('dock-tab-problems').click();
  const problems = window.getByTestId('problems-panel');
  await expect(problems).toBeVisible();
  return problems.locator('[data-testid="problem-row"][data-severity="error"]');
}

/** Asserts that no error problem is listed and the status bar agrees. */
async function expectNoErrors(window: Page): Promise<void> {
  await expect(await errorRows(window)).toHaveCount(0);
  await expect(window.locator('footer').getByText(/^0 error\(s\)/)).toBeVisible();
}

/** The status toast's text. */
function toast(window: Page): Locator {
  return window.getByTestId('status-toast-text');
}

/** Opens the Examples gallery through the command palette. */
async function openExamplesFromPalette(window: Page): Promise<Locator> {
  await window.keyboard.press('ControlOrMeta+Shift+P');
  const palette = window.getByTestId('command-palette');
  await expect(palette).toBeVisible();
  await palette.getByTestId('command-palette-input').fill('examples');
  await palette.getByTestId('command-examples').click();
  const gallery = window.getByTestId('examples-dialog');
  await expect(gallery).toBeVisible();
  return gallery;
}

test('library: Custom ore starter, exports, examples gallery, template filter, open example', async () => {
  base = mkdtempSync(join(tmpdir(), 'msm-library-'));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  mkdirSync(outputDir, { recursive: true });

  // First launch: a project from the Custom ore starter. ------------------------------------
  const first = await launchApp({ reuse: folders });
  launches.push(first);
  const { window } = first;
  await window.waitForLoadState('domcontentloaded');

  await window.getByTestId('toolbar-new-menu').click();
  await window.getByTestId('toolbar-new-from-starter').click();
  const newProject = window.getByTestId('new-project-dialog');
  await expect(newProject).toBeVisible();
  const picker = newProject.getByTestId('starter-picker');
  for (const id of [
    'blank',
    'resource_pack',
    'data_pack',
    'combined',
    'custom_ore',
    'recipe_pack',
    'music_disc',
    'function_starter',
  ]) {
    await expect(picker.getByTestId(`starter-${id}`)).toBeVisible();
  }
  await picker.getByTestId('starter-custom_ore').check();
  await newProject.getByTestId('new-project-dialog-submit').click();
  await expect(newProject).toBeHidden();
  await expect(toast(window)).toContainText(`New project from "Custom ore": ${folders.projectDir}`);
  for (const id of [
    `${NAMESPACE}:pack`,
    ORE_BLOCK_ID,
    RUBY_ITEM_ID,
    RUBY_BLOCK_ID,
    MOD_ID,
    ORE_MODEL_ID,
    LOOT_TABLE_ID,
    ORE_RECIPE_ID,
    ROOT_ADVANCEMENT_ID,
  ]) {
    await expect(window.getByTestId(`element-row-${id}`)).toBeVisible();
  }
  // No vanilla block is reskinned any more.
  await expect(window.getByTestId('element-row-minecraft:emerald_ore')).toHaveCount(0);
  await expect(
    window.getByTestId(`asset-row-${NAMESPACE}:textures/block/ruby_ore.png`),
  ).toBeVisible();

  // The starter's elements carry notes.
  await window.getByTestId(`element-row-${ORE_BLOCK_ID}`).click();
  await expect(window.getByTestId('element-notes')).toBeVisible();
  await expect(window.getByTestId('element-notes-text')).toContainText('pickaxe');

  await expectNoErrors(window);
  await expect(window.getByTestId('toolbar-export-zip')).toBeEnabled();

  // Export both packs and check the files. --------------------------------------------------
  const firstExport = await exportBoth(window, folders.outDir);
  {
    const names = Object.keys(firstExport.resource);
    expect(names).toContain('pack.mcmeta');
    expect(names).toContain(`assets/${NAMESPACE}/textures/block/ruby_ore.png`);
    expect(names).toContain(`assets/${NAMESPACE}/textures/item/ruby.png`);
    expect(names).toContain(`assets/${NAMESPACE}/models/block/ruby_ore.json`);
    expect(names.some((name) => name.startsWith('assets/minecraft/'))).toBe(false);
    expect(names.some((name) => name.startsWith('msm/'))).toBe(false);
    const blockstate = zipJson(
      firstExport.resource,
      `assets/${NAMESPACE}/blockstates/ruby_ore.json`,
    ) as { variants?: Record<string, { model?: string }> };
    expect(blockstate.variants?.['']?.model).toBe(ORE_MODEL_ID);
    const lang = zipJson(firstExport.resource, `assets/${NAMESPACE}/lang/en_us.json`) as Record<
      string,
      string
    >;
    expect(lang[`block.${NAMESPACE}.ruby_ore`]).toBe('Ruby Ore');
    expect(lang[`item.${NAMESPACE}.ruby`]).toBe('Ruby');
    // PNG signature on the generated placeholder.
    const png = firstExport.resource[`assets/${NAMESPACE}/textures/block/ruby_ore.png`];
    expect(Array.from(png?.subarray(0, 4) ?? [])).toEqual([0x89, 0x50, 0x4e, 0x47]);
  }
  {
    const names = Object.keys(firstExport.data);
    expect(names).toContain('pack.mcmeta');
    expect(names.some((name) => name.startsWith('assets/'))).toBe(false);
    expect(names.some((name) => name.startsWith('msm/'))).toBe(false);
    expect(names).not.toContain('fabric.mod.json');
    const loot = zipJson(firstExport.data, `data/${NAMESPACE}/loot_table/blocks/ruby_ore.json`) as {
      type?: string;
      pools?: { entries?: { name?: string }[] }[];
    };
    expect(loot.type).toBe('minecraft:block');
    expect(loot.pools?.[0]?.entries?.[0]?.name).toBe(RUBY_ITEM_ID);
    // "loot": "self" on the block of ruby generates its drops-itself table.
    expect(names).toContain(`data/${NAMESPACE}/loot_table/blocks/ruby_block.json`);
    const recipe = zipJson(
      firstExport.data,
      `data/${NAMESPACE}/recipe/ruby_block_from_rubies.json`,
    ) as {
      type?: string;
      result?: { id?: string };
    };
    expect(recipe.type).toBe('minecraft:crafting_shaped');
    expect(recipe.result?.id).toBe(RUBY_BLOCK_ID);
    expect(names).toContain(`data/${NAMESPACE}/advancement/root.json`);
  }

  // Export the Fabric mod jar with a separate runtime. --------------------------------------
  await exportVia(window, 'export-fabric-jar');
  const jarDialog = window.getByTestId('fabric-jar-dialog');
  await expect(jarDialog).toBeVisible();
  const separate = jarDialog.getByTestId('exporter-option-separateRuntime');
  await expect(separate).not.toBeChecked();
  await separate.check();
  await jarDialog.getByTestId('fabric-jar-dialog-submit').click();
  await expect(jarDialog).toBeHidden();
  await expect
    .poll(() => jarsIn(folders.outDir), { timeout: 20_000 })
    .toEqual([`${NAMESPACE}.jar`]);
  await expect(toast(window)).toContainText('Exported the Fabric mod jar to');
  {
    const jar = readZip(join(folders.outDir, `${NAMESPACE}.jar`));
    const names = Object.keys(jar);
    expect(names).toContain(`msm/${NAMESPACE}/block/ruby_ore.json`);
    expect(names).toContain(`msm/${NAMESPACE}/item/ruby.json`);
    expect(names).toContain(`assets/${NAMESPACE}/blockstates/ruby_ore.json`);
    expect(names).toContain(`data/${NAMESPACE}/recipe/ruby_block_from_rubies.json`);
    // A separate runtime is not nested.
    expect(names.some((name) => name.startsWith('META-INF/jars/'))).toBe(false);
    const modJson = zipJson(jar, 'fabric.mod.json') as {
      id?: string;
      depends?: Record<string, string>;
    };
    expect(modJson.id).toBe(NAMESPACE);
    expect(Object.keys(modJson.depends ?? {})).toContain('msm_runtime');
    // The definition keeps the mining and light components; the loot id becomes loot_table.
    const definition = zipJson(jar, `msm/${NAMESPACE}/block/ruby_ore.json`) as {
      loot_table?: string;
      components?: Record<string, unknown>;
    };
    expect(definition.loot_table).toBe(LOOT_TABLE_ID);
    expect(Object.keys(definition.components ?? {})).toContain('msm:light_emitter');
  }

  // Examples gallery: search, copy, notes, copy again, undo and redo. ----------------------
  let gallery = await openExamplesFromPalette(window);
  const count = gallery.getByTestId('examples-count');
  const allCount = await count.textContent();
  await gallery.getByTestId('examples-search').fill('recipe');
  await expect(count).not.toHaveText(allCount ?? '');
  await expect(count).toContainText(' of ');
  const exampleRadio = gallery.getByTestId('example-example_recipe');
  await expect(exampleRadio).toBeVisible();
  await exampleRadio.check();
  const detail = gallery.getByTestId('example-detail');
  await expect(detail).toContainText('Shaped recipe with a named result');
  await expect(detail).toContainText(EXAMPLE_RECIPE_ID);
  await expect(gallery.getByTestId('examples-namespace')).toHaveValue(NAMESPACE);

  await gallery.getByTestId('examples-copy').click();
  const copyResult = gallery.getByTestId('examples-copy-result');
  await expect(copyResult).toContainText(`Added 1 element and 0 assets to ${NAMESPACE}.`);
  await expect(gallery.getByTestId('examples-copy-duplicates')).toHaveCount(0);
  await expect(toast(window)).toContainText(
    `Copied "Shaped recipe with a named result" into ${NAMESPACE}: 1 element(s), 0 asset(s).`,
  );

  // Copy again: nothing new, the duplicate is listed.
  await gallery.getByTestId('examples-copy').click();
  const duplicates = gallery.getByTestId('examples-copy-duplicates');
  await expect(duplicates).toBeVisible();
  await expect(duplicates).toContainText(EXAMPLE_RECIPE_ID);
  await expect(copyResult).toContainText('Nothing was added');
  await expect(toast(window)).toContainText('1 already in the project and skipped.');
  await gallery.getByTestId('examples-close').click();
  await expect(gallery).toBeHidden();

  // The copied element is selected and shows its notes.
  const exampleRow = window.getByTestId(`element-row-${EXAMPLE_RECIPE_ID}`);
  await expect(exampleRow).toBeVisible();
  await exampleRow.click();
  await expect(window.getByTestId('element-notes')).toBeVisible();
  await expect(window.getByTestId('element-notes-text')).toContainText(
    'pattern is the crafting grid',
  );

  // The second copy added nothing, so one undo removes the first copy; redo brings it back.
  await window.getByTestId('toolbar-undo').click();
  await expect(exampleRow).toHaveCount(0);
  await window.getByTestId('toolbar-redo').click();
  await expect(exampleRow).toBeVisible();

  // The gallery is also on the toolbar's New menu; the search is fresh each time.
  await window.getByTestId('toolbar-new-menu').click();
  await window.getByTestId('toolbar-examples').click();
  gallery = window.getByTestId('examples-dialog');
  await expect(gallery).toBeVisible();
  await expect(gallery.getByTestId('examples-search')).toHaveValue('');
  await gallery.getByTestId('examples-kind-filter').selectOption('minecraft:recipe');
  await expect(gallery.getByTestId('example-example_recipe')).toBeVisible();
  await expect(gallery.getByTestId('example-starter_custom_ore')).toHaveCount(0);
  await gallery.getByTestId('examples-close').click();
  await expect(gallery).toBeHidden();

  // New element: the filter narrows the grouped templates. ---------------------------------
  await window.getByTestId('toolbar-add-element').click();
  const dialog = window.getByTestId('new-element-dialog');
  await expect(dialog).toBeVisible();
  const groups = dialog.locator('[data-testid^="template-group-"]');
  expect(await groups.count()).toBeGreaterThan(1);
  await dialog.getByTestId('new-element-filter').fill('blasting');
  await expect(groups).toHaveCount(1);
  const recipes = dialog.getByTestId('template-group-recipes');
  await expect(recipes).toBeVisible();
  const blasting = recipes.getByTestId('template-recipe_blasting');
  await expect(blasting).toBeVisible();
  await blasting.check();
  await expect(dialog.getByTestId('new-element-namespace')).toHaveValue(NAMESPACE);
  await dialog.getByTestId('new-element-name').fill('raw_copper_blasting');
  await dialog.getByTestId('new-element-dialog-submit').click();
  await expect(dialog).toBeHidden();
  await expect(window.getByTestId(`element-row-${BLASTING_ID}`)).toBeVisible();

  // Export again, still with no errors. -----------------------------------------------------
  await expectNoErrors(window);
  const secondExport = await exportBoth(window, folders.outDir);
  {
    const lantern = zipJson(secondExport.data, `data/${NAMESPACE}/recipe/lucky_lantern.json`) as {
      result?: { id?: string; components?: Record<string, unknown> };
    };
    expect(lantern.result?.id).toBe('minecraft:lantern');
    expect(lantern.result?.components?.['minecraft:item_name']).toBe('Lucky Lantern');
    const blast = zipJson(
      secondExport.data,
      `data/${NAMESPACE}/recipe/raw_copper_blasting.json`,
    ) as { type?: string };
    expect(blast.type).toBe('minecraft:blasting');
    expect(Object.keys(secondExport.data)).toContain(
      `data/${NAMESPACE}/recipe/ruby_block_from_rubies.json`,
    );
    expect(Object.keys(secondExport.resource)).toContain(
      `assets/${NAMESPACE}/blockstates/ruby_ore.json`,
    );
  }

  await window.screenshot({ path: join(outputDir, 'library-path.png') });

  // Save, so closing does not prompt to discard.
  await window.getByTestId('toolbar-save').click();
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();
  await first.close();
  launches.splice(0);

  // Second launch: an example opened as a new project in a fresh folder. -------------------
  const secondDir = join(base, SECOND_NAMESPACE);
  const second = await launchApp({
    reuse: { projectDir: secondDir, outDir: folders.outDir, msmHome: folders.msmHome },
  });
  launches.push(second);
  const w2 = second.window;
  await w2.waitForLoadState('domcontentloaded');

  await w2.getByTestId('toolbar-new-menu').click();
  await w2.getByTestId('toolbar-examples').click();
  gallery = w2.getByTestId('examples-dialog');
  await expect(gallery).toBeVisible();
  // No project is open: copying is unavailable and says why.
  await expect(gallery.getByTestId('examples-copy')).toBeDisabled();
  await expect(gallery.getByTestId('examples-copy-reason')).toContainText('Open or create');
  await gallery.getByTestId('examples-search').fill('function');
  const starterExample = gallery.getByTestId('example-starter_function_starter');
  await expect(starterExample).toBeVisible();
  await starterExample.check();
  await gallery.getByTestId('examples-open-new').click();
  await expect(gallery).toBeHidden();
  await expect(toast(w2)).toContainText(`: ${secondDir}`);
  for (const id of [
    `${SECOND_NAMESPACE}:load`,
    `${SECOND_NAMESPACE}:tick`,
    `${SECOND_NAMESPACE}:greet`,
    `${SECOND_NAMESPACE}:all`,
    'minecraft:load',
    'minecraft:tick',
  ]) {
    await expect(w2.getByTestId(`element-row-${id}`)).toBeVisible();
  }
  await w2.getByTestId(`element-row-${SECOND_NAMESPACE}:tick`).click();
  await expect(w2.getByTestId('function-editor')).toBeVisible();
  await expectNoErrors(w2);

  // The data pack exports (export re-checks every function).
  clearZips(folders.outDir);
  await exportVia(w2, 'export-data-zip');
  await expect.poll(() => zipsIn(folders.outDir), { timeout: 20_000 }).toHaveLength(1);
  const [fnZip] = zipsIn(folders.outDir);
  if (fnZip === undefined) throw new Error('No data pack zip.');
  const fnFiles = readZip(join(folders.outDir, fnZip));
  expect(Object.keys(fnFiles)).toContain(`data/${SECOND_NAMESPACE}/function/tick.mcfunction`);
  const loadTag = zipJson(fnFiles, 'data/minecraft/tags/function/load.json') as {
    values?: unknown[];
  };
  expect(loadTag.values).toEqual([`${SECOND_NAMESPACE}:load`]);
  await w2.screenshot({ path: join(outputDir, 'library-path-example.png') });
});
