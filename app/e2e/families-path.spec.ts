/**
 * The block families path (ADRs 0067 to 0069; brief B277), in a blank project:
 *
 * 1. Wood set: toolbar "Create…", the flow "Wood set" with a chosen wood colour; the Blocks tab
 *    opens with the row of blocks (`creator-set-preview`, SwiftShader WebGL) and the planks
 *    picture follows the colour. "Create" adds the set in one undo step with no errors and the
 *    planks texture in the project is the one the preview showed. The stairs' Block Studio
 *    shows the type and its textures; one texture (the top) changes to the log end. The
 *    sapling's "New tree" is off (the set's tree is already there) and its "Open" opens the
 *    Tree Studio. "Edit in Creator" on the planks with another colour lists the stairs under
 *    "Kept your edits", and the Update keeps the stairs' top. The Fabric mod jar holds the
 *    stairs' blockstate and generated models, `msm/<ns>/block/*` with their types and the
 *    tags; the vanilla data pack is still written, with `export.mod-only-reference` warnings
 *    under "Last export". Undo (three steps: Update, the texture edit, Create) removes the set.
 * 2. Crop and New tree: the Crop flow with its defaults (the seeds name left empty) makes the
 *    crop block (planted from its seeds, `item.id`) and the produce; the Block Studio's Crop
 *    section shows the seeds and the produce; the jar holds the seeds' item model and the name
 *    "Tomato Seeds" the flow promises for an empty seeds name. A sapling from the template
 *    "msm_block_sapling" gets "New tree" (B272): the tree `<base>_tree` is added from the
 *    "Tree for a sapling" template, opens in the Tree Studio and the sapling points at it.
 *
 * The Creator's display names are asserted nowhere (they are being changed elsewhere) except
 * the default seeds name, which the Crop flow's "Seeds name" field promises; otherwise ids and
 * test ids only.
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { expect, type Locator, type Page, test } from 'playwright/test';
import { type LaunchedApp, launchApp, openDockTab, outputDir, toast } from './fixtures';

/** The project folder name; a blank project's namespace is derived from it. */
const NAMESPACE = 'grove';
const WEBGL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] as const;
const id = (path: string) => `${NAMESPACE}:${path}`;

/** The Wood set's members with its default name, Maple. */
const WOOD_MEMBERS = [
  'maple_log',
  'maple_wood',
  'stripped_maple_log',
  'stripped_maple_wood',
  'maple_planks',
  'maple_stairs',
  'maple_slab',
  'maple_fence',
  'maple_fence_gate',
  'maple_door',
  'maple_trapdoor',
  'maple_button',
  'maple_pressure_plate',
  'maple_leaves',
  'maple_sapling',
];

let base: string | undefined;
const launches: LaunchedApp[] = [];

test.afterEach(async () => {
  for (const launched of launches.splice(0)) await launched.close();
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

function readZip(path: string): Record<string, Uint8Array> {
  return unzipSync(new Uint8Array(readFileSync(path)));
}

function isCompleteZip(path: string): boolean {
  try {
    readZip(path);
    return true;
  } catch {
    return false;
  }
}

/** Waits for one new complete file with `extension` in `dir` beyond `known`, and reads it. */
async function newZip(
  dir: string,
  extension: string,
  known: readonly string[] = [],
): Promise<{ name: string; files: Record<string, Uint8Array> }> {
  let name = '';
  await expect
    .poll(
      () => {
        name =
          readdirSync(dir)
            .filter((entry) => entry.endsWith(extension))
            .find((entry) => !known.includes(entry)) ?? '';
        return name !== '' && isCompleteZip(join(dir, name));
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return { name, files: readZip(join(dir, name)) };
}

/** A JSON file of an exported zip. */
function zipJson<T>(files: Record<string, Uint8Array>, path: string): T {
  const bytes = files[path];
  if (bytes === undefined) throw new Error(`${path} is missing from the export.`);
  return JSON.parse(strFromU8(bytes)) as T;
}

async function openPalette(window: Page, query: string): Promise<Locator> {
  await window.keyboard.press('ControlOrMeta+Shift+P');
  const palette = window.getByTestId('command-palette');
  await expect(palette).toBeVisible();
  await palette.getByTestId('command-palette-input').fill(query);
  return palette;
}

async function expectNoErrors(window: Page): Promise<void> {
  await openDockTab(window, 'problems');
  const problems = window.getByTestId('problems-panel');
  await expect(problems).toBeVisible();
  await expect(problems.locator('[data-testid="problem-row"][data-severity="error"]')).toHaveCount(
    0,
  );
  await expect(window.locator('footer').getByText(/^0 error\(s\)/)).toBeVisible();
}

/**
 * Exports the Fabric mod jar through the palette and reads it. The runtime and GeckoLib stay
 * separate: CI's `ci` job builds no runtime jar to nest.
 */
async function exportJar(window: Page, outDir: string, known: readonly string[] = []) {
  const palette = await openPalette(window, 'fabric mod jar');
  await palette.getByTestId('command-exportFabricJar').click();
  await expect(palette).toBeHidden();
  const dialog = window.getByTestId('fabric-jar-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('exporter-option-separateRuntime').check();
  await dialog.getByTestId('fabric-jar-dialog-submit').click();
  await expect(dialog).toBeHidden();
  return newZip(outDir, '.jar', known);
}

/** Opens the Creator from the toolbar and picks `flowId` from the group "Blocks". */
async function openFlow(window: Page, flowId: string): Promise<Locator> {
  await window.getByTestId('toolbar-creator').click();
  const dialog = window.getByTestId('creator-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('creator-group-blocks').getByTestId(`creator-flow-${flowId}`).click();
  return dialog;
}

async function save(window: Page): Promise<void> {
  await window.getByTestId('toolbar-save').click();
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();
}

/** The `data` of a saved element file in the project folder. */
function savedData(projectDir: string, folder: string, path: string): Record<string, unknown> {
  const file = join(projectDir, 'content', NAMESPACE, folder, `${path}.json`);
  return (JSON.parse(readFileSync(file, 'utf8')) as { data: Record<string, unknown> }).data;
}

/** The bytes of a `data:image/png;base64,` URL. */
function dataUrlBytes(url: string | null): Buffer {
  const prefix = 'data:image/png;base64,';
  if (url === null || !url.startsWith(prefix)) throw new Error(`Not a PNG data URL: ${url}`);
  return Buffer.from(url.slice(prefix.length), 'base64');
}

/** The picture of a block on the Creator's Blocks tab. */
async function blockPicture(dialog: Locator, blockId: string): Promise<Buffer> {
  const image = dialog.getByTestId(`creator-block-${blockId}`).locator('img');
  await expect(image).toBeVisible();
  return dataUrlBytes(await image.getAttribute('src'));
}

/** Types `value` into an id field and commits it with Enter. */
async function commitId(field: Locator, value: string): Promise<void> {
  await field.fill(value);
  await field.press('Enter');
}

/** Opens a new blank project in a fresh launch, with the project folder named `NAMESPACE`. */
async function blankProject(prefix: string, args?: readonly string[]) {
  base = mkdtempSync(join(tmpdir(), prefix));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  mkdirSync(outputDir, { recursive: true });
  const launched = await launchApp({ reuse: folders, ...(args === undefined ? {} : { args }) });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await window.getByTestId('toolbar-new-project').click();
  await expect(window.getByTestId(`element-row-${id('pack')}`)).toBeVisible();
  return { window, folders };
}

test('families: Wood set create, Block Studio edit, kept on Edit in Creator, exports, undo', async () => {
  const started = Date.now();
  const { window, folders } = await blankProject('msm-families-', WEBGL_ARGS);
  await save(window);
  const blank = readdirSync(join(folders.projectDir, 'content'), { recursive: true })
    .map(String)
    .sort();

  // The Wood set opens on the Blocks tab with the row of blocks; the colour reaches the planks.
  const dialog = await openFlow(window, 'wood-set');
  await expect(dialog.getByTestId('param-wood_name')).toHaveValue('Maple');
  await expect(dialog.getByTestId('creator-tab-blocks')).toHaveAttribute('aria-selected', 'true');
  for (const member of WOOD_MEMBERS) {
    await expect(dialog.getByTestId(`creator-block-${id(member)}`)).toBeVisible();
  }
  const set = dialog.getByTestId('creator-set-preview');
  await expect(set).toBeVisible();
  await expect(set.getByTestId('creator-set-canvas').locator('canvas')).toBeVisible({
    timeout: 15_000,
  });
  const defaultPlanks = await blockPicture(dialog, id('maple_planks'));
  await dialog.getByTestId('param-colour').fill('#8a3a2a');
  await expect
    .poll(async () => (await blockPicture(dialog, id('maple_planks'))).equals(defaultPlanks))
    .toBe(false);
  const chosenPlanks = await blockPicture(dialog, id('maple_planks'));
  await dialog.getByTestId('creator-tab-elements').click();
  await expect(dialog.getByTestId(`creator-element-${id('maple_tree')}`)).toBeVisible();
  await dialog.getByTestId('creator-create').click();
  await expect(dialog).toBeHidden();
  await expect(
    toast(window).filter({ hasText: /^Create Wood set: \d+ element\(s\) and file\(s\) changed/ }),
  ).toBeVisible();
  for (const member of WOOD_MEMBERS) {
    await expect(window.getByTestId(`element-row-${id(member)}`)).toBeVisible();
  }
  await expect(window.getByTestId(`element-row-${id('maple_tree')}`)).toBeVisible();
  await expectNoErrors(window);
  await save(window);
  const planksTexture = join(
    folders.projectDir,
    'assets',
    NAMESPACE,
    'textures',
    'block',
    'maple_planks.png',
  );
  expect(readFileSync(planksTexture).equals(chosenPlanks)).toBe(true);

  // The stairs' Block Studio: type and textures; the top becomes the log end.
  await window.getByTestId(`element-row-${id('maple_stairs')}`).click();
  const studio = window.getByTestId('block-studio');
  await expect(studio).toBeVisible();
  await expect(studio.getByTestId('block-type-picker')).toHaveValue('stairs');
  await expect(studio.getByTestId('block-base-block')).toHaveValue(id('maple_planks'));
  await expect(studio.getByTestId('block-texture-all')).toHaveValue(id('block/maple_planks'));
  await expect(studio.getByTestId('block-texture-all-thumbnail')).toBeVisible();
  await commitId(studio.getByTestId('block-texture-top'), id('block/maple_log_top'));
  await expect(studio.getByTestId('block-texture-top-thumbnail')).toBeVisible();
  await expectNoErrors(window);
  await save(window);
  expect(savedData(folders.projectDir, 'block', 'maple_stairs').textures).toEqual({
    all: id('block/maple_planks'),
    top: id('block/maple_log_top'),
  });

  // The sapling: its tree is the set's own, so "New tree" is off; "Open" opens the Tree Studio.
  await window.getByTestId(`element-row-${id('maple_sapling')}`).click();
  await expect(studio.getByTestId('block-type-picker')).toHaveValue('sapling');
  await expect(studio.getByTestId('sapling-tree')).toHaveValue(id('maple_tree'));
  await expect(studio.getByTestId('sapling-new-tree')).toBeDisabled();
  await studio.getByTestId('sapling-tree-open').click();
  await expect(window.getByTestId('tree-feature-studio')).toBeVisible();

  // Edit in Creator on the planks with another colour: the stairs keep their top.
  await window.getByTestId(`element-row-${id('maple_planks')}`).click();
  await window.getByTestId('editor-edit-in-creator').click();
  const edit = window.getByTestId('creator-dialog');
  await expect(edit).toBeVisible();
  await expect(edit.getByTestId('param-colour')).toHaveValue('#8a3a2a');
  await edit.getByTestId('param-colour').fill('#3a6a8a');
  await edit.getByTestId('creator-tab-elements').click();
  const kept = edit.getByRole('region', { name: 'Kept your edits' });
  await expect(kept).toBeVisible();
  await expect(kept.getByTestId(`creator-kept-${id('maple_stairs')}`)).toBeVisible();
  await expect(edit.getByTestId(`creator-overwrite-${id('maple_stairs')}`)).not.toBeChecked();
  await edit.getByTestId('creator-create').click();
  await expect(edit).toBeHidden();
  await expect(
    toast(window).filter({ hasText: /^Update Wood set: \d+ element\(s\) and file\(s\) changed/ }),
  ).toBeVisible();
  await save(window);
  expect(savedData(folders.projectDir, 'block', 'maple_stairs').textures).toEqual({
    all: id('block/maple_planks'),
    top: id('block/maple_log_top'),
  });
  expect(readFileSync(planksTexture).equals(chosenPlanks)).toBe(false);
  await expectNoErrors(window);

  // The Fabric mod jar: blockstates, generated models, typed definitions and tags.
  const jar = await exportJar(window, folders.outDir);
  expect(jar.name).toBe(`${NAMESPACE}.jar`);
  const names = Object.keys(jar.files);
  expect(names).toEqual(
    expect.arrayContaining([
      'fabric.mod.json',
      `assets/${NAMESPACE}/blockstates/maple_stairs.json`,
      `assets/${NAMESPACE}/blockstates/maple_door.json`,
      `assets/${NAMESPACE}/models/block/maple_stairs.json`,
      `assets/${NAMESPACE}/models/block/maple_stairs_inner.json`,
      `assets/${NAMESPACE}/models/block/maple_stairs_outer.json`,
      `assets/${NAMESPACE}/textures/block/maple_planks.png`,
      `data/${NAMESPACE}/worldgen/feature/maple_tree.json`,
      'data/minecraft/tags/block/logs.json',
      'data/minecraft/tags/item/planks.json',
      `data/${NAMESPACE}/tags/item/maple_logs.json`,
    ]),
  );
  for (const member of WOOD_MEMBERS) {
    expect(names).toContain(`msm/${NAMESPACE}/block/${member}.json`);
  }
  expect(
    zipJson<{ type: string }>(jar.files, `msm/${NAMESPACE}/block/maple_stairs.json`).type,
  ).toBe('stairs');
  // The stairs' models are made from their textures: the top is the log end, the rest planks.
  for (const model of ['maple_stairs', 'maple_stairs_inner', 'maple_stairs_outer']) {
    const { textures } = zipJson<{ textures: Record<string, string> }>(
      jar.files,
      `assets/${NAMESPACE}/models/block/${model}.json`,
    );
    expect(textures).toMatchObject({
      side: id('block/maple_planks'),
      top: id('block/maple_log_top'),
      bottom: id('block/maple_planks'),
    });
  }
  expect(zipJson<{ type: string }>(jar.files, `msm/${NAMESPACE}/block/maple_door.json`).type).toBe(
    'door',
  );
  expect(
    zipJson<{ type: string }>(jar.files, `msm/${NAMESPACE}/block/maple_sapling.json`).type,
  ).toBe('sapling');
  const logs = zipJson<{ values: unknown[] }>(jar.files, 'data/minecraft/tags/block/logs.json');
  expect(JSON.stringify(logs.values)).toContain(id('maple_log'));
  await window.screenshot({ path: join(outputDir, 'families-path.png') });

  // The vanilla data pack: written, with the mod-only reference warnings (ADR 0066).
  await window.getByTestId('toolbar-export-menu').click();
  await window.getByTestId('export-data-zip').click();
  const data = await newZip(folders.outDir, '.zip');
  expect(Object.keys(data.files)).toContain('pack.mcmeta');
  expect(Object.keys(data.files).some((name) => name.startsWith('msm/'))).toBe(false);
  await openDockTab(window, 'problems');
  await expect(
    window
      .getByTestId('export-problems')
      .locator('[data-testid="problem-row"][data-code="export.mod-only-reference"]')
      .first(),
  ).toBeVisible();

  // Undo: the Update, the texture edit, then the Create; the blank project is back.
  for (let step = 0; step < 3; step++) await window.getByTestId('toolbar-undo').click();
  for (const member of WOOD_MEMBERS) {
    await expect(window.getByTestId(`element-row-${id(member)}`)).toHaveCount(0);
  }
  await expect(window.getByTestId(`element-row-${id('maple_tree')}`)).toHaveCount(0);
  await expect(window.getByTestId(`element-row-${id('pack')}`)).toBeVisible();
  await save(window);
  await expect
    .poll(() =>
      readdirSync(join(folders.projectDir, 'content'), { recursive: true }).map(String).sort(),
    )
    .toEqual(blank);
  console.log(`families-path wood set: ${((Date.now() - started) / 1000).toFixed(1)} s`);
});

test('families: Crop flow makes the seeds and the produce; a sapling gets a New tree', async () => {
  const { window, folders } = await blankProject('msm-families-crop-');

  // The Crop flow with its defaults: a tomato planted from tomato seeds.
  const dialog = await openFlow(window, 'crop');
  await expect(dialog.getByTestId('param-crop_name')).toHaveValue('Tomato');
  // "Seeds name" is optional: left empty, the seeds are named after the crop and "Seeds".
  await expect(dialog.getByTestId('param-seeds_name')).toHaveValue('');
  await expect(dialog.getByTestId(`creator-item-${id('tomato')}`)).toBeVisible();
  await dialog.getByTestId('creator-tab-blocks').click();
  await expect(dialog.getByTestId(`creator-block-${id('tomato_crop')}`)).toBeVisible();
  await dialog.getByTestId('creator-create').click();
  await expect(dialog).toBeHidden();
  await expect(
    toast(window).filter({ hasText: /^Create Crop: \d+ element\(s\) and file\(s\) changed/ }),
  ).toBeVisible();
  await expect(window.getByTestId(`element-row-${id('tomato')}`)).toBeVisible();
  await expect(window.getByTestId(`element-row-${id('tomato_crop')}`)).toBeVisible();
  await expectNoErrors(window);
  await save(window);
  const crop = savedData(folders.projectDir, 'block', 'tomato_crop') as {
    type: string;
    item: { id: string };
    crop_drops: { produce: string };
  };
  expect(crop.type).toBe('crop');
  expect(crop.item.id).toBe(id('tomato_seeds'));
  expect(crop.crop_drops.produce).toBe(id('tomato'));

  // The Crop section: the seeds and the produce.
  await window.getByTestId(`element-row-${id('tomato_crop')}`).click();
  const studio = window.getByTestId('block-studio');
  await expect(studio.getByTestId('block-type-picker')).toHaveValue('crop');
  await expect(studio.getByTestId('block-crop')).toBeVisible();
  await expect(studio.getByTestId('plant-item-id')).toHaveValue(id('tomato_seeds'));
  await expect(studio.getByTestId('crop-produce')).toHaveValue(id('tomato'));
  await expect(studio.getByTestId('crop-stage-textures')).toBeVisible();

  // The jar: the crop, the produce, and the seeds' item model and name.
  const jar = await exportJar(window, folders.outDir);
  const names = Object.keys(jar.files);
  expect(names).toEqual(
    expect.arrayContaining([
      `msm/${NAMESPACE}/block/tomato_crop.json`,
      `msm/${NAMESPACE}/item/tomato.json`,
      `assets/${NAMESPACE}/items/tomato_seeds.json`,
      `assets/${NAMESPACE}/blockstates/tomato_crop.json`,
    ]),
  );
  const lang = zipJson<Record<string, string>>(jar.files, `assets/${NAMESPACE}/lang/en_us.json`);
  expect(lang[`item.${NAMESPACE}.tomato_seeds`]).toBe('Tomato Seeds');
  expect(lang[`item.${NAMESPACE}.tomato`]).toBeTruthy();

  // A sapling from the template, then "New tree" from the "Tree for a sapling" template.
  await window.getByTestId('toolbar-add-element').click();
  const add = window.getByTestId('new-element-dialog');
  await expect(add).toBeVisible();
  await add.getByTestId('new-element-filter').fill('sapling');
  const template = add.getByTestId('template-msm_block_sapling');
  await expect(template).toBeVisible();
  await template.check();
  await add.getByTestId('new-element-name').fill('cedar_sapling');
  await add.getByTestId('new-element-dialog-submit').click();
  await expect(add).toBeHidden();
  await expect(window.getByTestId(`element-row-${id('cedar_sapling')}`)).toBeVisible();
  await expect(studio.getByTestId('block-type-picker')).toHaveValue('sapling');
  await expect(studio.getByTestId('sapling-new-tree-note')).toContainText(id('cedar_tree'));
  await expect(studio.getByTestId('sapling-new-tree')).toBeEnabled();
  await studio.getByTestId('sapling-new-tree').click();
  await expect(window.getByTestId(`element-row-${id('cedar_tree')}`)).toBeVisible();
  await expect(window.getByTestId('tree-feature-studio')).toBeVisible();
  await save(window);
  expect(savedData(folders.projectDir, 'block', 'cedar_sapling').tree).toBe(id('cedar_tree'));
  await window.getByTestId(`element-row-${id('cedar_sapling')}`).click();
  await expect(studio.getByTestId('sapling-tree')).toHaveValue(id('cedar_tree'));
  await expect(studio.getByTestId('sapling-new-tree')).toBeDisabled();
  await window.screenshot({ path: join(outputDir, 'families-path-crop.png') });
});
