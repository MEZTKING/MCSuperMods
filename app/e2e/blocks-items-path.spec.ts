/**
 * The blocks and items path (Phase 4, ADRs 0025 and 0026), driven through the template picker,
 * the Block Studio, the export menu and the command palette: a blank project gets an
 * `msm:block` from the "Simple block" template and an `msm:item` from the "Food item"
 * template; the Block Studio sets hardness, tool, minimum tier, light level and display name,
 * adds an event with a play_sound action and picks it for "On interact", and turns the block
 * item off and on again. Removing the event leaves a dangling reference, a
 * `blocks-items.unknown-event` error that blocks the Fabric mod jar; undo clears it. The jar
 * is exported with "Separate runtime (for modpacks)" and checked file by file, the resource
 * pack holds no `msm/` files, and a second launch reopens the project with no problems and
 * the edits kept.
 *
 * "Test in Minecraft" is not covered here. Preview and WebGL are unavailable headless.
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { expect, type Locator, type Page, test } from 'playwright/test';
import { type LaunchedApp, launchApp, outputDir } from './fixtures';

/** The project folder name; a blank project's namespace (and mod id) is derived from it. */
const NAMESPACE = 'glow_e2e';

const BLOCK_PATH = 'sun_stone';
const ITEM_PATH = 'honey_bun';
const BLOCK_ID = `${NAMESPACE}:${BLOCK_PATH}`;
const ITEM_ID = `${NAMESPACE}:${ITEM_PATH}`;
const EVENT_ID = `${NAMESPACE}:chime`;
const SOUND_ID = 'minecraft:block.amethyst_block.chime';
const DISPLAY_NAME = 'Glowing Sun Stone';

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

/** Whether `path` reads as a complete zip (export writes are not atomic). */
function isCompleteZip(path: string): boolean {
  try {
    readZip(path);
    return true;
  } catch {
    return false;
  }
}

function zipJson(files: Record<string, Uint8Array>, name: string): unknown {
  const bytes = files[name];
  if (bytes === undefined) throw new Error(`${name} is missing from the zip.`);
  return JSON.parse(strFromU8(bytes));
}

/** Names in `dir` ending in `extension`, sorted. */
function filesIn(dir: string, extension: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(extension))
    .sort();
}

/** The status toast's text. */
function toast(window: Page): Locator {
  return window.getByTestId('status-toast-text');
}

/** The Problems panel's rows (opens the panel); `severity` narrows them. */
async function problemRows(window: Page, severity?: 'error'): Promise<Locator> {
  await window.getByTestId('dock-tab-problems').click();
  const problems = window.getByTestId('problems-panel');
  await expect(problems).toBeVisible();
  return problems.locator(
    severity === undefined
      ? '[data-testid="problem-row"]'
      : `[data-testid="problem-row"][data-severity="${severity}"]`,
  );
}

/** Asserts that the Problems panel lists nothing at all and the status bar agrees. */
async function expectNoProblems(window: Page): Promise<void> {
  await expect(await problemRows(window)).toHaveCount(0);
  await expect(window.locator('footer').getByText(/^0 error\(s\)/)).toBeVisible();
}

/** Opens the export chevron menu and returns the item `testId` (not clicked). */
async function exportItem(window: Page, testId: string): Promise<Locator> {
  await window.getByTestId('toolbar-export-menu').click();
  const item = window.getByTestId(testId);
  await expect(item).toBeVisible();
  return item;
}

/** Opens the command palette and types `query`; returns the palette. */
async function openPalette(window: Page, query: string): Promise<Locator> {
  await window.keyboard.press('ControlOrMeta+Shift+P');
  const palette = window.getByTestId('command-palette');
  await expect(palette).toBeVisible();
  await palette.getByTestId('command-palette-input').fill(query);
  return palette;
}

/** Adds an element from template `templateId` through the New element dialog. */
async function addFromTemplate(
  window: Page,
  filter: string,
  templateId: string,
  name: string,
): Promise<void> {
  await window.getByTestId('toolbar-add-element').click();
  const dialog = window.getByTestId('new-element-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('new-element-filter').fill(filter);
  const template = dialog.getByTestId(`template-${templateId}`);
  await expect(template).toBeVisible();
  await template.check();
  await expect(dialog.getByTestId('new-element-namespace')).toHaveValue(NAMESPACE);
  await dialog.getByTestId('new-element-name').fill(name);
  await dialog.getByTestId('new-element-dialog-submit').click();
  await expect(dialog).toBeHidden();
}

test('blocks and items: templates, Block Studio, unknown event, Fabric jar, resource pack, reopen', async () => {
  base = mkdtempSync(join(tmpdir(), 'msm-blocks-'));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  mkdirSync(outputDir, { recursive: true });

  // First launch: a blank project with a block and an item from templates. ------------------
  const first = await launchApp({ reuse: folders });
  launches.push(first);
  const { window } = first;
  await window.waitForLoadState('domcontentloaded');

  await window.getByTestId('toolbar-new-project').click();
  await expect(window.getByTestId(`element-row-${NAMESPACE}:pack`)).toBeVisible();

  await addFromTemplate(window, 'simple block', 'msm_block_simple', BLOCK_PATH);
  await expect(window.getByTestId(`element-row-${BLOCK_ID}`)).toBeVisible();
  await addFromTemplate(window, 'food', 'msm_item_food', ITEM_PATH);
  await expect(window.getByTestId(`element-row-${ITEM_ID}`)).toBeVisible();
  await expect(window.getByTestId('item-studio')).toBeVisible();
  await expect(window.getByTestId('item-display-name')).toHaveValue('Honey Bun');
  await expectNoProblems(window);

  // Block Studio: mining, light, display name. ----------------------------------------------
  await window.getByTestId(`element-row-${BLOCK_ID}`).click();
  const block = window.getByTestId('block-studio');
  await expect(block).toBeVisible();
  await block.getByTestId('block-display-name').fill(DISPLAY_NAME);
  const hardness = block.getByTestId('block-hardness');
  await expect(hardness).toHaveValue('1.5');
  await hardness.fill('4');
  await expect(hardness).toHaveValue('4');
  const tool = block.getByTestId('block-tool');
  await expect(tool).toHaveValue('pickaxe');
  await tool.selectOption('');
  await expect(tool).toHaveValue('');
  await tool.selectOption('pickaxe');
  await expect(tool).toHaveValue('pickaxe');
  const minTier = block.getByTestId('block-min-tier');
  await expect(minTier).toHaveValue('');
  await minTier.selectOption('iron');
  await expect(minTier).toHaveValue('iron');
  const light = block.getByTestId('block-light');
  await light.fill('9');
  await expect(light).toHaveValue('9');

  // Block item off and on again.
  const hasItem = block.getByTestId('block-has-item');
  const stack = block.getByTestId('block-item-stack');
  await expect(hasItem).toBeChecked();
  await expect(stack).toBeVisible();
  await hasItem.uncheck();
  await expect(hasItem).not.toBeChecked();
  await expect(stack).toHaveCount(0);
  await hasItem.check();
  await expect(hasItem).toBeChecked();
  await expect(stack).toBeVisible();

  // An event with a play_sound action, picked for "On interact". -----------------------------
  const events = block.getByTestId('msm-events');
  await events.getByLabel('New event id').fill(EVENT_ID);
  await events.getByRole('button', { name: 'Add event' }).click();
  const event = events.getByTestId(`msm-event-${EVENT_ID}`);
  await expect(event).toBeVisible();
  await expect(event.getByLabel(`New action type for ${EVENT_ID}`)).toHaveValue('play_sound');
  await event.getByRole('button', { name: `Add action to ${EVENT_ID}` }).click();
  const action = event.getByTestId('msm-action-0');
  await expect(action).toBeVisible();
  await expect(action.getByLabel(`${EVENT_ID} action 1 type`)).toHaveValue('play_sound');
  const sound = action.getByLabel(`${EVENT_ID} action 1 sound`, { exact: true });
  await sound.fill(SOUND_ID);
  await sound.press('Enter');
  await expect(sound).toHaveValue(SOUND_ID);
  const onInteract = block.getByTestId('block-on-interact');
  await expect(onInteract).toHaveValue('');
  await onInteract.selectOption(EVENT_ID);
  await expect(onInteract).toHaveValue(EVENT_ID);
  await expectNoProblems(window);

  // Removing the event leaves a dangling reference: an error that blocks the jar. -----------
  await event.getByRole('button', { name: `Remove event ${EVENT_ID}` }).click();
  await expect(event).toHaveCount(0);
  const errors = await problemRows(window, 'error');
  await expect(errors).toHaveCount(1);
  await expect(errors.first()).toHaveAttribute('data-code', 'blocks-items.unknown-event');
  await expect(errors.first()).toContainText(EVENT_ID);
  const blocked = await exportItem(window, 'export-fabric-jar');
  await expect(blocked).toHaveAttribute('data-disabled', /.*/);
  await expect(window.getByTestId('export-fabric-jar-reason')).toContainText(/Fix \d+ error/);
  await window.keyboard.press('Escape');
  // The palette offers no Fabric jar export while it is blocked.
  let palette = await openPalette(window, 'fabric mod jar');
  await expect(palette.getByTestId('command-exportFabricJar')).toHaveCount(0);
  await window.keyboard.press('Escape');
  await expect(palette).toBeHidden();

  // Undo brings the event back and clears the error.
  await window.getByTestId('toolbar-undo').click();
  await expect(event).toBeVisible();
  await expect(errors).toHaveCount(0);
  await expect(onInteract).toHaveValue(EVENT_ID);
  await expectNoProblems(window);

  // Export the Fabric mod jar through the palette, with a separate runtime. -----------------
  palette = await openPalette(window, 'fabric mod jar');
  await palette.getByTestId('command-exportFabricJar').click();
  await expect(palette).toBeHidden();
  const jarDialog = window.getByTestId('fabric-jar-dialog');
  await expect(jarDialog).toBeVisible();
  const separate = jarDialog.getByTestId('exporter-option-separateRuntime');
  await expect(separate).not.toBeChecked();
  await separate.check();
  await jarDialog.getByTestId('fabric-jar-dialog-submit').click();
  await expect(jarDialog).toBeHidden();
  await expect
    .poll(() => filesIn(folders.outDir, '.jar'), { timeout: 20_000 })
    .toEqual([`${NAMESPACE}.jar`]);
  const jarPath = join(folders.outDir, `${NAMESPACE}.jar`);
  await expect.poll(() => isCompleteZip(jarPath), { timeout: 20_000 }).toBe(true);
  await expect(toast(window)).toContainText('Exported the Fabric mod jar to');
  {
    const jar = readZip(jarPath);
    const names = Object.keys(jar);
    expect(names.some((name) => name.startsWith('META-INF/jars/'))).toBe(false);

    const definition = zipJson(jar, `msm/${NAMESPACE}/block/${BLOCK_PATH}.json`) as {
      format?: number;
      model?: unknown;
      display_name?: unknown;
      item?: unknown;
      components?: Record<string, Record<string, unknown>>;
      events?: Record<string, { actions?: Record<string, unknown>[] }>;
    };
    expect(definition.format).toBe(1);
    // Editor-only fields are stripped; the block item is the default one again.
    expect(definition.model).toBeUndefined();
    expect(definition.display_name).toBeUndefined();
    expect(definition.item).toBeUndefined();
    const breakable = definition.components?.['msm:breakable'];
    expect(breakable?.hardness).toBe(4);
    expect(breakable?.requires_tool).toBe(true);
    expect(breakable?.tool).toBeUndefined();
    expect(breakable?.min_tier).toBeUndefined();
    expect(definition.components?.['msm:light_emitter']).toEqual({ level: 9 });
    expect(definition.components?.['msm:on_interact']).toEqual({ event: EVENT_ID });
    expect(definition.events?.[EVENT_ID]?.actions).toEqual([
      { type: 'play_sound', sound: SOUND_ID },
    ]);

    const item = zipJson(jar, `msm/${NAMESPACE}/item/${ITEM_PATH}.json`) as {
      format?: number;
      components?: Record<string, unknown>;
    };
    expect(item.format).toBe(1);
    expect(Object.keys(item.components ?? {})).toContain('msm:food');
    expect(names).toContain(`assets/${NAMESPACE}/items/${ITEM_PATH}.json`);
    expect(names).toContain(`assets/${NAMESPACE}/items/${BLOCK_PATH}.json`);
    expect(names).toContain(`assets/${NAMESPACE}/blockstates/${BLOCK_PATH}.json`);

    const lang = zipJson(jar, `assets/${NAMESPACE}/lang/en_us.json`) as Record<string, string>;
    expect(lang[`block.${NAMESPACE}.${BLOCK_PATH}`]).toBe(DISPLAY_NAME);
    expect(lang[`item.${NAMESPACE}.${ITEM_PATH}`]).toBe('Honey Bun');

    const mineable = zipJson(jar, 'data/minecraft/tags/block/mineable/pickaxe.json') as {
      values?: unknown[];
    };
    expect(mineable.values).toContain(BLOCK_ID);
    const needsIron = zipJson(jar, 'data/minecraft/tags/block/needs_iron_tool.json') as {
      values?: unknown[];
    };
    expect(needsIron.values).toContain(BLOCK_ID);
    expect(names).toContain(`data/${NAMESPACE}/loot_table/blocks/${BLOCK_PATH}.json`);

    const modJson = zipJson(jar, 'fabric.mod.json') as {
      id?: string;
      depends?: Record<string, string>;
      jars?: unknown;
    };
    expect(modJson.id).toBe(NAMESPACE);
    expect(Object.keys(modJson.depends ?? {})).toContain('msm_runtime');
    expect(modJson.jars).toBeUndefined();
  }

  // The vanilla resource pack holds no msm/ files. -------------------------------------------
  const resourceItem = await exportItem(window, 'export-resource-zip');
  await expect(resourceItem).not.toHaveAttribute('data-disabled', /.*/);
  await resourceItem.click();
  await expect.poll(() => filesIn(folders.outDir, '.zip'), { timeout: 20_000 }).toHaveLength(1);
  await expect(toast(window)).toContainText('Export Fabric mod jar');
  {
    const [zipName] = filesIn(folders.outDir, '.zip');
    if (zipName === undefined) throw new Error('No resource pack zip.');
    const zipPath = join(folders.outDir, zipName);
    await expect.poll(() => isCompleteZip(zipPath), { timeout: 20_000 }).toBe(true);
    const pack = readZip(zipPath);
    const names = Object.keys(pack);
    expect(names).toContain('pack.mcmeta');
    expect(names).toContain(`assets/${NAMESPACE}/blockstates/${BLOCK_PATH}.json`);
    expect(names.some((name) => name.startsWith('msm/'))).toBe(false);
    expect(names).not.toContain('fabric.mod.json');
  }

  await window.screenshot({ path: join(outputDir, 'blocks-items-path.png') });

  // Save, so closing does not prompt to discard.
  await window.getByTestId('toolbar-save').click();
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();
  await first.close();
  launches.splice(0);

  // Second launch: reopen, no problems, the edits are kept. ---------------------------------
  const second = await launchApp({ reuse: folders });
  launches.push(second);
  const w2 = second.window;
  await w2.waitForLoadState('domcontentloaded');
  await w2.getByTestId('toolbar-open-project').click();
  await expect(w2.getByTestId(`element-row-${ITEM_ID}`)).toBeVisible();
  await w2.getByTestId(`element-row-${BLOCK_ID}`).click();
  const reopened = w2.getByTestId('block-studio');
  await expect(reopened).toBeVisible();
  await expect(reopened.getByTestId('block-display-name')).toHaveValue(DISPLAY_NAME);
  await expect(reopened.getByTestId('block-hardness')).toHaveValue('4');
  await expect(reopened.getByTestId('block-tool')).toHaveValue('pickaxe');
  await expect(reopened.getByTestId('block-min-tier')).toHaveValue('iron');
  await expect(reopened.getByTestId('block-light')).toHaveValue('9');
  await expect(reopened.getByTestId('block-has-item')).toBeChecked();
  await expect(reopened.getByTestId('block-on-interact')).toHaveValue(EVENT_ID);
  await expect(reopened.getByTestId(`msm-event-${EVENT_ID}`)).toBeVisible();
  await expectNoProblems(w2);
  await w2.screenshot({ path: join(outputDir, 'blocks-items-path-reopened.png') });
});
