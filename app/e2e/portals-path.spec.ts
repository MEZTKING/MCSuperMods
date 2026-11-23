/**
 * The portals path (ADRs 0077 and 0078; brief B342), in blank projects:
 *
 * 1. Portal flow: the Creator flow "Portal" (group "Worlds") with its untouched defaults creates
 *    the portal `sky_portal`, its frame block and the dimension `sky_realm` with no problem at
 *    all. The Block Studio's Type picker switches the portal to a plain block and the frame
 *    block to a portal, each one undo step. Then one edit per Portal section field of the Frame,
 *    Travel and Looks groups (frame tag and the block exits are built of, igniter, destination,
 *    way back, scale, arrival, delay, cooldown, players only, wobble and overlay, on travel,
 *    particle type, colour, count, ambient sound, travel sound "None"), and "Edit in Creator"
 *    keeps the portal exactly as edited.
 * 2. Dimension flow and exports: the flow "Dimension" with its third answer (a portal) and
 *    otherwise untouched defaults creates `ruby_realm` and its portal with no problem at all.
 *    The other answers of the Portal section ("Nothing: a trigger lights it", the scale from
 *    the dimensions, "None" for the ambient sound, a travel sound, a colour cleared again, no
 *    particles) and a "Light a portal" action in an event of the frame block, kept on Creator
 *    reopen. A function that places the portal with `setblock`. The vanilla data pack keeps the
 *    dimension, the travel function and the placing function, makes the `#minecraft:portals`
 *    entry optional, leaves the frame block's loot table and recipe out with
 *    `export.mod-only-reference` and warns about the function with `export.mod-only-function`.
 *    The Fabric mod jar on the default target (26.3) and, after "Upgrade project target", on
 *    the snapshot (26.4) holds the portal's definition, blockstate, both models and the tag.
 *
 * The Creator's display names are asserted only in the toasts (the flow titles); otherwise ids
 * and test ids. Target ids come from `@msm/targets`.
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { builtInTargets, defaultTargetId, targetById } from '@msm/targets';
import { strFromU8, unzipSync } from 'fflate';
import { expect, type Locator, type Page, test } from 'playwright/test';
import {
  type LaunchedApp,
  launchApp,
  newProjectInFolder,
  openAddDialog,
  openCreator,
  openDockTab,
  openExport,
  outputDir,
  toast,
} from './fixtures';

/** The project folder name; a blank project's namespace is derived from it. */
const NAMESPACE = 'gates';
const id = (path: string) => `${NAMESPACE}:${path}`;

/** The flows of the Creator group "Worlds" this path uses, with their titles. */
const PORTAL = { flow: 'portal', title: 'Portal' } as const;
const DIMENSION = { flow: 'dimension', title: 'Dimension' } as const;

/** A vanilla block tag for the frame. */
const FRAME_TAG = '#minecraft:base_stone_overworld';

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

/** The Problems panel's rows (opens the panel); `severity` narrows them. */
async function problemRows(window: Page, severity?: 'error'): Promise<Locator> {
  await openDockTab(window, 'problems');
  const problems = window.getByTestId('problems-panel');
  await expect(problems).toBeVisible();
  return problems.locator(
    severity === undefined
      ? '[data-testid="problem-row"]'
      : `[data-testid="problem-row"][data-severity="${severity}"]`,
  );
}

/** No problem of any severity, and the status bar agrees. */
async function expectNoProblems(window: Page): Promise<void> {
  await expect(await problemRows(window)).toHaveCount(0);
  await expect(window.getByTestId('status-things-to-fix')).toHaveCount(0);
}

async function expectNoErrors(window: Page): Promise<void> {
  await expect(await problemRows(window, 'error')).toHaveCount(0);
  await expect(window.getByTestId('status-things-to-fix')).toHaveCount(0);
}

/** Opens the Creator from the toolbar and picks `flowId` from the group "Worlds". */
async function openFlow(window: Page, flowId: string): Promise<Locator> {
  await openCreator(window);
  const dialog = window.getByTestId('creator-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('creator-group-worlds').getByTestId(`creator-flow-${flowId}`).click();
  return dialog;
}

/** Applies the open Creator dialog and waits for its toast. */
async function applyCreator(
  window: Page,
  dialog: Locator,
  verb: 'Create' | 'Update',
  title: string,
): Promise<void> {
  await dialog.getByTestId('creator-create').click();
  await expect(dialog).toBeHidden();
  await expect(
    toast(window).filter({
      hasText: new RegExp(`^${verb} ${title}: \\d+ element\\(s\\) and file\\(s\\) changed`),
    }),
  ).toBeVisible();
}

/**
 * Saves the project, which must have unsaved changes: with none, the footer would already read
 * "Saved" while the Save still runs, and the test would read files as they are rewritten.
 */
async function save(window: Page): Promise<void> {
  const footer = window.locator('footer');
  await expect(footer.getByText('Not saved yet', { exact: true })).toBeVisible();
  await window.getByTestId('toolbar-save').click();
  await expect(footer.getByText('Saved', { exact: true })).toBeVisible();
}

type Data = Record<string, unknown> & {
  components?: Record<string, Record<string, unknown>>;
  travel?: Record<string, unknown>;
  particles?: Record<string, unknown>;
  sounds?: Record<string, unknown>;
  events?: Record<string, { actions: Record<string, unknown>[] }>;
};

/** The `data` of a saved block file in the project folder. */
function savedBlock(projectDir: string, path: string): Data {
  const file = join(projectDir, 'content', NAMESPACE, 'block', `${path}.json`);
  return (JSON.parse(readFileSync(file, 'utf8')) as { data: Data }).data;
}

/** Types `value` into an id field and commits it with Enter. */
async function commitId(field: Locator, value: string): Promise<void> {
  await field.fill(value);
  await field.press('Enter');
  await expect(field).toHaveValue(value);
}

/** Opens a new blank project in a fresh launch, with the project folder named `NAMESPACE`. */
async function blankProject(prefix: string) {
  base = mkdtempSync(join(tmpdir(), prefix));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  mkdirSync(outputDir, { recursive: true });
  const launched = await launchApp({ reuse: folders });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await newProjectInFolder(window);
  await expect(window.getByTestId(`element-row-${id('pack')}`)).toBeVisible();
  return { window, folders };
}

/** Opens the Block Studio of `block`. */
async function openBlock(window: Page, block: string): Promise<Locator> {
  await window.getByTestId(`element-row-${id(block)}`).click();
  const studio = window.getByTestId('block-studio');
  await expect(studio).toBeVisible();
  await expect(studio.getByTestId('block-type-picker')).toBeVisible();
  return studio;
}

/** Opens the Block Studio of `block` and waits for its (lazy) Portal section. */
async function openPortal(window: Page, block: string): Promise<Locator> {
  const studio = await openBlock(window, block);
  await expect(studio.getByTestId('block-portal')).toBeVisible();
  return studio;
}

/** Adds event `name` in the Block Studio's Events editor, with no action yet. */
async function addEvent(studio: Locator, name: string): Promise<Locator> {
  const events = studio.getByTestId('msm-events');
  await events.getByLabel('New event id').fill(name);
  await events.getByRole('button', { name: 'Add event' }).click();
  const event = events.getByTestId(`msm-event-${name}`);
  await expect(event).toBeVisible();
  return event;
}

/** Adds event `name` with a play_sound action in the Block Studio's Events editor. */
async function addSoundEvent(studio: Locator, name: string, sound: string): Promise<void> {
  const event = await addEvent(studio, name);
  await expect(event.getByLabel(`New action type for ${name}`)).toHaveValue('play_sound');
  await event.getByRole('button', { name: `Add action to ${name}` }).click();
  const action = event.getByTestId('msm-action-0');
  await expect(action).toBeVisible();
  await commitId(action.getByLabel(`${name} action 1 sound`, { exact: true }), sound);
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
        .map((line) => (line.textContent ?? '').replace(/ /g, ' '))
        .join('\n');
    });
}

/**
 * Replaces the Monaco function editor's whole source with `lines`, typed key by key; Escape
 * closes any completion list first, so Enter starts a new line instead of accepting a proposal.
 */
async function typeSource(window: Page, lines: readonly string[]): Promise<void> {
  const view = window.getByTestId('function-editor').locator('.monaco-editor .view-lines');
  await expect(view).toBeVisible();
  // Near the top left: the overview ruler covers the middle of a narrow editor.
  await view.click({ position: { x: 8, y: 8 } });
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

/**
 * "Edit in Creator" on `block`: another colour enables the Update; the block is listed under
 * "Kept your edits" and not ticked to be overwritten, and the Update leaves its data as it was.
 * The caller saves first: another Save of a saved project only rewrites the same files, and the
 * footer already reads "Saved", so the read below could catch a file half rewritten.
 */
async function reopenKeepsEdits(
  window: Page,
  projectDir: string,
  block: string,
  title: string,
  colour: string,
): Promise<void> {
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();
  const before = savedBlock(projectDir, block);
  await window.getByTestId(`element-row-${id(block)}`).click();
  await window.getByTestId('editor-edit-in-creator').click();
  const edit = window.getByTestId('creator-dialog');
  await expect(edit).toBeVisible();
  await edit.getByTestId('param-colour').fill(colour);
  await edit.getByTestId('creator-tab-elements').click();
  const kept = edit.getByRole('region', { name: 'Kept your edits' });
  await expect(kept).toBeVisible();
  await expect(kept.getByTestId(`creator-kept-${id(block)}`)).toBeVisible();
  await expect(edit.getByTestId(`creator-overwrite-${id(block)}`)).not.toBeChecked();
  await applyCreator(window, edit, 'Update', title);
  await save(window);
  expect(savedBlock(projectDir, block)).toEqual(before);
}

test('portals: Portal flow defaults, type switch undo, one edit per Portal field kept on Creator reopen', async () => {
  const started = Date.now();
  const { window, folders } = await blankProject('msm-portals-flow-');

  // The flow with its untouched defaults: the portal, its frame block and a new dimension.
  const dialog = await openFlow(window, PORTAL.flow);
  await expect(dialog.getByTestId('param-portal_name')).toHaveValue('Sky Portal');
  await expect(dialog.getByTestId('param-destination')).toHaveValue('new');
  await dialog.getByTestId('creator-tab-elements').click();
  await expect(dialog.getByTestId(`creator-element-${id('sky_portal')}`)).toBeVisible();
  await applyCreator(window, dialog, 'Create', PORTAL.title);
  for (const element of ['sky_portal', 'sky_portal_frame', 'sky_realm', 'sky_realm/travel']) {
    await expect(window.getByTestId(`element-row-${id(element)}`)).toBeVisible();
  }
  await expectNoProblems(window);
  await save(window);
  const created = savedBlock(folders.projectDir, 'sky_portal');
  expect(created).toMatchObject({
    type: 'portal',
    frame: id('sky_portal_frame'),
    destination: id('sky_realm'),
    travel: { scale: 1 },
  });
  const frameCreated = savedBlock(folders.projectDir, 'sky_portal_frame');

  // The Type picker: the portal to a plain block drops its fields; one Undo puts them back.
  let studio = await openPortal(window, 'sky_portal');
  const picker = studio.getByTestId('block-type-picker');
  await expect(picker).toHaveValue('portal');
  await picker.selectOption('block');
  await expect(picker).toHaveValue('block');
  await expect(studio.getByTestId('block-portal')).toHaveCount(0);
  await save(window);
  const plain = savedBlock(folders.projectDir, 'sky_portal');
  for (const field of ['frame', 'destination', 'travel']) expect(plain).not.toHaveProperty(field);
  await window.getByTestId('toolbar-undo').click();
  await expect(picker).toHaveValue('portal');
  await expect(studio.getByTestId('block-portal')).toBeVisible();
  await save(window);
  expect(savedBlock(folders.projectDir, 'sky_portal')).toEqual(created);

  // The frame block to a portal: the portal defaults and the components it takes; one Undo.
  studio = await openBlock(window, 'sky_portal_frame');
  await expect(studio.getByTestId('block-portal')).toHaveCount(0);
  await studio.getByTestId('block-type-picker').selectOption('portal');
  await expect(studio.getByTestId('block-portal')).toBeVisible();
  await save(window);
  const switched = savedBlock(folders.projectDir, 'sky_portal_frame');
  expect(switched).toMatchObject({
    type: 'portal',
    frame: 'minecraft:crying_obsidian',
    destination: 'minecraft:the_nether',
  });
  // An item that says more than the default (its creative tab) stays, and with it the loot.
  expect(switched.item).toEqual(frameCreated.item);
  expect(switched.components).toEqual(frameCreated.components);
  await window.getByTestId('toolbar-undo').click();
  await expect(studio.getByTestId('block-portal')).toHaveCount(0);
  await save(window);
  expect(savedBlock(folders.projectDir, 'sky_portal_frame')).toEqual(frameCreated);
  await expectNoProblems(window);

  // One edit per Portal section field. Frame: a tag, the block exits are built of, the igniter.
  studio = await openPortal(window, 'sky_portal');
  await addSoundEvent(studio, 'sky_arrived', 'minecraft:entity.enderman.teleport');
  await expect(studio.getByTestId('block-portal-frame-block')).toHaveCount(0);
  await commitId(studio.getByTestId('block-portal-frame'), FRAME_TAG);
  await commitId(studio.getByTestId('block-portal-frame-block'), id('sky_portal_frame'));
  await commitId(studio.getByTestId('block-portal-igniter'), 'minecraft:fire_charge');

  // Travel: destination and way back, scale, arrival, delay, cooldown, the two switches.
  await studio.getByTestId('block-portal-destination').selectOption('minecraft:the_end');
  await studio.getByTestId('block-portal-return-to').selectOption(id('sky_realm'));
  await expect(studio.getByTestId('block-portal-scale-mode')).toHaveValue('number');
  const scale = studio.getByTestId('block-portal-scale');
  await expect(scale).toHaveValue('1');
  const nether = studio.getByTestId('block-portal-scale-nether');
  await nether.click();
  await expect(scale).toHaveValue('8');
  await expect(nether).toBeDisabled();
  await scale.fill('4');
  await expect(nether).toBeEnabled();
  await studio.getByTestId('block-portal-arrival').selectOption('surface');
  await studio.getByTestId('block-portal-delay').fill('0');
  await studio.getByTestId('block-portal-cooldown').fill('40');
  await studio.getByTestId('block-portal-players-only').check();
  const overlay = studio.getByTestId('block-portal-overlay');
  await expect(overlay).toBeChecked();
  await overlay.uncheck();
  await studio.getByTestId('block-portal-on-travel').selectOption('sky_arrived');

  // Looks: dust in a colour, the count, an ambient sound, no travel sound.
  await commitId(studio.getByTestId('block-portal-particle'), 'minecraft:dust');
  await studio.getByTestId('block-portal-colour').fill('#30c0e0');
  await expect(studio.getByTestId('block-portal-colour-label')).toHaveText(
    'Coloured dust #30c0e0.',
  );
  await studio.getByTestId('block-portal-particle-count').fill('8');
  await commitId(
    studio.getByTestId('block-portal-ambient-sound'),
    'minecraft:block.beacon.ambient',
  );
  await studio.getByTestId('block-portal-travel-sound-none').check();
  await expect(studio.getByTestId('block-portal-travel-sound')).toHaveCount(0);
  await expectNoErrors(window);
  await save(window);
  const edited = savedBlock(folders.projectDir, 'sky_portal');
  expect(edited).toMatchObject({
    type: 'portal',
    frame: FRAME_TAG,
    frame_block: id('sky_portal_frame'),
    igniter: 'minecraft:fire_charge',
    destination: 'minecraft:the_end',
    return_to: id('sky_realm'),
    on_travel: 'sky_arrived',
  });
  expect(edited.travel).toEqual({
    scale: 4,
    arrival: 'surface',
    delay_ticks: 0,
    cooldown_ticks: 40,
    players_only: true,
    overlay: false,
  });
  expect(edited.particles).toEqual({ type: 'minecraft:dust', color: 0x30c0e0, count: 8 });
  expect(edited.sounds).toEqual({ ambient: 'minecraft:block.beacon.ambient', travel: false });

  // "Edit in Creator" keeps the portal as edited.
  await reopenKeepsEdits(window, folders.projectDir, 'sky_portal', PORTAL.title, '#30a0c0');
  await expectNoErrors(window);
  await window.screenshot({ path: join(outputDir, 'portals-path-flow.png') });
  console.log(`portals-path flow: ${((Date.now() - started) / 1000).toFixed(1)} s`);
});

test('portals: Dimension flow portal, trigger-lit portal and Light a portal, exports on both targets', async () => {
  test.setTimeout(150_000);
  const started = Date.now();
  const release = targetById(defaultTargetId)?.target;
  if (release === undefined) throw new Error('No default target.');
  const snapshot = builtInTargets.find((entry) => entry.target.channel === 'snapshot')?.target;
  if (snapshot === undefined) throw new Error('No built-in snapshot target.');
  const { window, folders } = await blankProject('msm-portals-dimension-');

  // The Dimension flow's portal answer with otherwise untouched defaults: no problem at all.
  const dialog = await openFlow(window, DIMENSION.flow);
  await expect(dialog.getByTestId('param-dimension_name')).toHaveValue('Ruby Realm');
  await dialog.getByTestId('param-travel').selectOption('portal');
  await dialog.getByTestId('creator-tab-elements').click();
  await expect(dialog.getByTestId(`creator-element-${id('ruby_realm_portal')}`)).toBeVisible();
  await applyCreator(window, dialog, 'Create', DIMENSION.title);
  for (const element of ['ruby_realm', 'ruby_realm/travel', 'ruby_realm_portal_frame']) {
    await expect(window.getByTestId(`element-row-${id(element)}`)).toBeVisible();
  }
  await expect(window.getByTestId(`element-row-${id('ruby_realm_key')}`)).toHaveCount(0);
  await expectNoProblems(window);
  await save(window);
  expect(savedBlock(folders.projectDir, 'ruby_realm_portal')).toMatchObject({
    type: 'portal',
    frame: id('ruby_realm_portal_frame'),
    destination: id('ruby_realm'),
    travel: { scale: 1 },
  });

  // "Light a portal" in an event of the frame block, picking the project's portal.
  let studio = await openBlock(window, 'ruby_realm_portal_frame');
  const event = await addEvent(studio, 'light_ruby');
  await event.getByLabel('New action type for light_ruby').selectOption('light_portal');
  await event.getByRole('button', { name: 'Add action to light_ruby' }).click();
  const action = event.getByTestId('msm-action-0');
  await expect(action.getByLabel('light_ruby action 1 type')).toHaveValue('light_portal');
  await expect(action.getByLabel('light_ruby action 1 portal')).toHaveValue(
    id('ruby_realm_portal'),
  );
  await expectNoErrors(window);
  await save(window);
  expect(savedBlock(folders.projectDir, 'ruby_realm_portal_frame').events).toEqual({
    light_ruby: { actions: [{ type: 'light_portal', portal: id('ruby_realm_portal') }] },
  });

  // The other answers of the Portal section on the dimension's portal.
  studio = await openPortal(window, 'ruby_realm_portal');
  await studio.getByTestId('block-portal-igniter-none').check();
  await expect(studio.getByTestId('block-portal-igniter')).toHaveCount(0);
  const mode = studio.getByTestId('block-portal-scale-mode');
  await mode.selectOption('dimensions');
  await expect(studio.getByTestId('block-portal-scale')).toHaveCount(0);
  await studio.getByTestId('block-portal-ambient-sound-none').check();
  await expect(studio.getByTestId('block-portal-ambient-sound')).toHaveCount(0);
  await commitId(
    studio.getByTestId('block-portal-travel-sound'),
    'minecraft:entity.enderman.teleport',
  );
  await studio.getByTestId('block-portal-particle-count').fill('0');
  const label = studio.getByTestId('block-portal-colour-label');
  await expect(label).toHaveText('No colour: the particle type above.');
  await studio.getByTestId('block-portal-colour').fill('#c03030');
  await expect(label).toHaveText('Coloured dust #c03030.');
  await studio.getByTestId('block-portal-colour-clear').click();
  await expect(label).toHaveText('No colour: the particle type above.');
  await expectNoErrors(window);
  await save(window);
  const edited = savedBlock(folders.projectDir, 'ruby_realm_portal');
  expect(edited.igniter).toBe(false);
  expect(edited).not.toHaveProperty('travel');
  expect(edited.sounds).toEqual({ ambient: false, travel: 'minecraft:entity.enderman.teleport' });
  expect(edited.particles).toEqual({ count: 0 });

  // "Edit in Creator" keeps the portal and the frame block as edited.
  await reopenKeepsEdits(
    window,
    folders.projectDir,
    'ruby_realm_portal',
    DIMENSION.title,
    '#a02040',
  );
  expect(savedBlock(folders.projectDir, 'ruby_realm_portal_frame').events).toHaveProperty(
    'light_ruby',
  );
  await expectNoErrors(window);

  // A function that places the portal.
  await openAddDialog(window);
  const create = window.getByTestId('new-element-dialog');
  await expect(create).toBeVisible();
  await create.getByTestId('template-function').check();
  await create.getByTestId('new-element-name').fill('place_portal');
  await create.getByTestId('new-element-dialog-submit').click();
  await expect(create).toBeHidden();
  await window.getByTestId(`element-row-${id('place_portal')}`).click();
  await expect(window.getByTestId('function-editor')).toBeVisible();
  const placing = [`setblock ~ ~1 ~ ${id('ruby_realm_portal')}`];
  await typeSource(window, placing);
  await expectNoErrors(window);
  // Saved right after typing: the editor's held-back edit is part of the save.
  await save(window);
  const functionFile = join(
    folders.projectDir,
    'content',
    NAMESPACE,
    'function',
    'place_portal.json',
  );
  expect((JSON.parse(readFileSync(functionFile, 'utf8')) as { data: Data }).data.lines).toEqual(
    placing,
  );
  console.log(`portals-path edits: ${((Date.now() - started) / 1000).toFixed(1)} s`);

  // The vanilla data pack: the dimension and both functions kept, the tag entry optional.
  await openExport(window, 'export-data-zip');
  const data = await newZip(folders.outDir, '.zip');
  const dataNames = Object.keys(data.files);
  expect(dataNames).toEqual(
    expect.arrayContaining([
      'pack.mcmeta',
      `data/${NAMESPACE}/dimension/ruby_realm.json`,
      `data/${NAMESPACE}/function/ruby_realm/travel.mcfunction`,
      `data/${NAMESPACE}/function/place_portal.mcfunction`,
    ]),
  );
  expect(dataNames.some((name) => name.startsWith('msm/'))).toBe(false);
  expect(dataNames).not.toContain(
    `data/${NAMESPACE}/loot_table/blocks/ruby_realm_portal_frame.json`,
  );
  expect(dataNames).not.toContain(
    `data/${NAMESPACE}/recipe/ruby_realm_portal_frame_from_obsidian.json`,
  );
  const portalsTag = 'data/minecraft/tags/block/portals.json';
  expect(zipJson<{ values: unknown[] }>(data.files, portalsTag).values).toEqual([
    { id: id('ruby_realm_portal'), required: false },
  ]);
  await openDockTab(window, 'problems');
  const exportProblems = window.getByTestId('export-problems');
  const modOnly = exportProblems.locator(
    '[data-testid="problem-row"][data-code="export.mod-only-reference"]',
  );
  await expect(
    modOnly.filter({ hasText: id('ruby_realm_portal_frame_from_obsidian') }),
  ).toContainText(`data/${NAMESPACE}/recipe/ruby_realm_portal_frame_from_obsidian.json`);
  await expect(
    modOnly.filter({ hasText: `data/${NAMESPACE}/loot_table/blocks/ruby_realm_portal_frame.json` }),
  ).toHaveCount(1);
  await expect(modOnly).toHaveCount(2);
  const modOnlyFunction = exportProblems.locator(
    '[data-testid="problem-row"][data-code="export.mod-only-function"]',
  );
  await expect(modOnlyFunction).toHaveCount(1);
  await expect(modOnlyFunction).toContainText(id('place_portal'));

  // The Fabric mod jar on each target: the portal's definition, blockstate, models and tag.
  let known: string[] = [];
  for (const target of [release, snapshot]) {
    if (target.id !== release.id) {
      const palette = await openPalette(window, 'upgrade project target');
      await palette.getByTestId('command-upgradeTarget').click();
      await expect(palette).toBeHidden();
      const upgrade = window.getByTestId('upgrade-target-dialog');
      await expect(upgrade).toBeVisible();
      await upgrade.getByTestId(`upgrade-target-${target.id}`).click();
      await upgrade.getByTestId('upgrade-target-dialog-submit').click();
      await expect(upgrade).toBeHidden();
      await expect(toast(window)).toContainText(`Project target changed to ${target.id}.`);
      await expectNoErrors(window);
    }
    await expect(window.getByTestId('project-target')).toContainText(
      `For Minecraft ${target.mcVersion}`,
    );
    // The jar keeps its name on every target: move the earlier one out of the way.
    for (const name of known) rmSync(join(folders.outDir, name));
    const palette = await openPalette(window, 'fabric mod jar');
    await palette.getByTestId('command-exportFabricJar').click();
    await expect(palette).toBeHidden();
    const jarDialog = window.getByTestId('fabric-jar-dialog');
    await expect(jarDialog).toBeVisible();
    // CI's `ci` job builds no runtime jar to nest.
    await jarDialog.getByTestId('exporter-option-separateRuntime').check();
    await jarDialog.getByTestId('fabric-jar-dialog-submit').click();
    await expect(jarDialog).toBeHidden();
    const jar = await newZip(folders.outDir, '.jar');
    known = [jar.name];
    expect(jar.name).toBe(`${NAMESPACE}.jar`);
    const names = Object.keys(jar.files);
    const definition = zipJson<Record<string, unknown>>(
      jar.files,
      `msm/${NAMESPACE}/block/ruby_realm_portal.json`,
    );
    expect(definition).toMatchObject({
      type: 'portal',
      frame: id('ruby_realm_portal_frame'),
      destination: id('ruby_realm'),
      igniter: false,
      sounds: edited.sounds,
      particles: edited.particles,
    });
    expect(definition).not.toHaveProperty('textures');
    expect(names).toEqual(
      expect.arrayContaining([
        `assets/${NAMESPACE}/blockstates/ruby_realm_portal.json`,
        `assets/${NAMESPACE}/models/block/ruby_realm_portal_ns.json`,
        `assets/${NAMESPACE}/models/block/ruby_realm_portal_ew.json`,
        `msm/${NAMESPACE}/block/ruby_realm_portal_frame.json`,
        `data/${NAMESPACE}/dimension/ruby_realm.json`,
        portalsTag,
      ]),
    );
    expect(names).not.toContain(`assets/${NAMESPACE}/items/ruby_realm_portal.json`);
    expect(zipJson<{ values: unknown[] }>(jar.files, portalsTag).values).toContainEqual(
      id('ruby_realm_portal'),
    );
    console.log(
      `portals-path jar on ${target.id}: ${((Date.now() - started) / 1000).toFixed(1)} s`,
    );
  }
  await window.screenshot({ path: join(outputDir, 'portals-path-exports.png') });
  await save(window);
});
