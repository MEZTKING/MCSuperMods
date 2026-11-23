/**
 * The particles path (ADRs 0080 and 0081; brief B357), in blank projects:
 *
 * 1. Particle flow and Studio: the Creator flow "Particle" (group "Magic") with its untouched
 *    defaults creates the particle `golden_spark`, its four frame pictures and the block
 *    `golden_spark_block` with no problem at all. The Particle Studio gets edits in each group
 *    (Pictures: frame order and animation; Life and size: a lifetime between two numbers, size
 *    and size at the end; Movement: the "Falls" shortcut, drag, spin, stops on blocks; Colour
 *    and light: tint, tint at the end, opacity, fade, glows, show from far away). The preview
 *    canvas mounts and switches to a stream on a light background. A second launch reopens
 *    the project with every edit kept, in the saved file and in the Studio.
 * 2. Split, ambient particles, Spawn particle and exports: "Split a strip into frames" cuts a
 *    32 by 8 strip into four frame pictures in one step and one Undo removes them all. The
 *    Block Studio's "Ambient particles" section adds the component to a plain block and one
 *    Undo removes it. A "Spawn particle" action with "Coloured dust", a motion and "Show from
 *    far away". A function running `particle` with the project particle. The vanilla data
 *    pack keeps the function with `export.mod-only-function` and leaves the block loot table
 *    out with `export.mod-only-reference`; the Fabric mod jar on the default target (26.3)
 *    and, after "Upgrade project target", on the snapshot (26.4) holds the particle
 *    definition, its description, its four pictures and the block with the dust action.
 *
 * The Creator's display names are asserted only in the toasts (the flow title); otherwise ids
 * and test ids. Target ids come from `@msm/targets`.
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { builtInTargets, defaultTargetId, targetById } from '@msm/targets';
import { strFromU8, unzipSync } from 'fflate';
import { expect, type Locator, type Page, test } from 'playwright/test';
import {
  expectStatusAgrees,
  type LaunchedApp,
  launchApp,
  newProjectInFolder,
  openAddDialog,
  openCreator,
  openDockTab,
  openExport,
  outputDir,
  toast,
  toolbarMenu,
} from './fixtures';
import { readPng, rgbaPng } from './png';

/** The project folder name; a blank project's namespace is derived from it. */
const NAMESPACE = 'sparks';
const id = (path: string) => `${NAMESPACE}:${path}`;

/** The Creator flow of the group "Magic" this path uses, with its title. */
const PARTICLE = { flow: 'particle', title: 'Particle' } as const;

/** The flow's default particle, its frames and its block (ids derive from "Golden Spark"). */
const SPARK = 'golden_spark';
const SPARK_FRAMES = [0, 1, 2, 3].map((frame) => id(`${SPARK}_${frame}`));
const SPARK_BLOCK = 'golden_spark_block';

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
  await expectStatusAgrees(window);
}

async function expectNoErrors(window: Page): Promise<void> {
  await expect(await problemRows(window, 'error')).toHaveCount(0);
  await expectStatusAgrees(window);
}

/** Opens the Creator from the toolbar and picks `flowId` from the group "Magic". */
async function openFlow(window: Page, flowId: string): Promise<Locator> {
  await openCreator(window);
  const dialog = window.getByTestId('creator-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('creator-group-magic').getByTestId(`creator-flow-${flowId}`).click();
  return dialog;
}

/** Applies the open Creator dialog and waits for its toast. */
async function applyCreator(window: Page, dialog: Locator, title: string): Promise<void> {
  await dialog.getByTestId('creator-create').click();
  await expect(dialog).toBeHidden();
  await expect(
    toast(window).filter({
      hasText: new RegExp(`^Create ${title}: \\d+ element\\(s\\) and file\\(s\\) changed`),
    }),
  ).toBeVisible();
}

/**
 * Saves edits that have been made since the last save. Waits for the footer's "Unsaved
 * changes" first, so the last edit is committed before Save is clicked (a save with nothing
 * to save would show "Saved" at once and prove nothing), then for "Saved".
 */
async function save(window: Page): Promise<void> {
  const footer = window.locator('footer');
  await expect(footer.getByText('Not saved yet', { exact: true })).toBeVisible();
  await window.getByTestId('toolbar-save').click();
  await expect(footer.getByText('Saved', { exact: true })).toBeVisible();
}

/** Undoes the last change from the toolbar. */
async function undo(window: Page): Promise<void> {
  await window.mouse.move(0, 0);
  await window.getByTestId('toolbar-undo').click();
}

type Data = Record<string, unknown> & {
  components?: Record<string, unknown>;
  events?: Record<string, { actions: Record<string, unknown>[] }>;
};

/** The `data` of a saved element file (`content/<ns>/<folder>/<path>.json`). */
function savedData(projectDir: string, folder: string, path: string): Data {
  const file = join(projectDir, 'content', NAMESPACE, folder, `${path}.json`);
  return (JSON.parse(readFileSync(file, 'utf8')) as { data: Data }).data;
}

/** A frame picture's file in the project folder. */
function framePicture(projectDir: string, name: string): string {
  return join(projectDir, 'assets', NAMESPACE, 'textures', 'particle', `${name}.png`);
}

/** Types `value` into an id field and commits it with Enter. */
async function commitId(field: Locator, value: string): Promise<void> {
  await field.fill(value);
  await field.press('Enter');
  await expect(field).toHaveValue(value);
}

/** Fills a number field and checks the text it shows. */
async function fillNumber(field: Locator, value: string): Promise<void> {
  await field.fill(value);
  await expect(field).toHaveValue(value);
}

/** Picks `hex` in the colour input of a `ColourField` (its test id is on the wrapper). */
async function pickColour(field: Locator, hex: string): Promise<void> {
  await field.locator('input[type="color"]').fill(hex);
  await expect(field.locator('code')).toHaveText(hex);
}

/** The folders of a fresh launch, with the project folder named `NAMESPACE`. */
function newFolders(prefix: string) {
  base = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(outputDir, { recursive: true });
  return {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
}

/** Opens a new blank project in a fresh launch. */
async function blankProject(prefix: string) {
  const folders = newFolders(prefix);
  const launched = await launchApp({ reuse: folders });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await newProjectInFolder(window);
  await expect(window.getByTestId(`element-row-${id('pack')}`)).toBeVisible();
  return { window, folders, launched };
}

/** The Particle flow with its untouched defaults: no problem at all. */
async function createDefaultParticle(window: Page): Promise<void> {
  const dialog = await openFlow(window, PARTICLE.flow);
  await expect(dialog.getByTestId('param-particle_name')).toHaveValue('Golden Spark');
  await dialog.getByTestId('creator-tab-elements').click();
  await expect(dialog.getByTestId(`creator-element-${id(SPARK)}`)).toBeVisible();
  await applyCreator(window, dialog, PARTICLE.title);
  for (const element of [SPARK, SPARK_BLOCK]) {
    await expect(window.getByTestId(`element-row-${id(element)}`)).toBeVisible();
  }
  await expectNoProblems(window);
}

/** Opens the (lazy) Particle Studio of `particle`. */
async function openParticle(window: Page, particle: string): Promise<Locator> {
  await window.getByTestId(`element-row-${id(particle)}`).click();
  const studio = window.getByTestId('particle-studio');
  await expect(studio).toBeVisible();
  await expect(studio.getByTestId('particle-frames')).toBeVisible();
  return studio;
}

/** Opens the Block Studio of `block`. */
async function openBlock(window: Page, block: string): Promise<Locator> {
  await window.getByTestId(`element-row-${id(block)}`).click();
  const studio = window.getByTestId('block-studio');
  await expect(studio).toBeVisible();
  await expect(studio.getByTestId('block-type-picker')).toBeVisible();
  return studio;
}

/** Adds an element from template `templateId` through the New element dialog. */
async function addFromTemplate(
  window: Page,
  filter: string,
  templateId: string,
  name: string,
): Promise<void> {
  await openAddDialog(window);
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
  await expect(window.getByTestId(`element-row-${id(name)}`)).toBeVisible();
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
 * Replaces the Monaco function editor's whole source with `line`, typed key by key; Escape
 * closes any completion list afterwards.
 */
async function typeSource(window: Page, line: string): Promise<void> {
  const view = window.getByTestId('function-editor').locator('.monaco-editor .view-lines');
  await expect(view).toBeVisible();
  // Near the top left: the overview ruler covers the middle of a narrow editor.
  await view.click({ position: { x: 8, y: 8 } });
  await window.keyboard.press('ControlOrMeta+A');
  await window.keyboard.press('Delete');
  await expect.poll(() => monacoText(window)).toBe('');
  await window.keyboard.type(line);
  await window.keyboard.press('Escape');
  await expect.poll(() => monacoText(window)).toBe(line);
}

/** The particle as edited in the first test: every Studio group changed. */
const EDITED_PARTICLE = {
  format: 1,
  textures: [SPARK_FRAMES[1], SPARK_FRAMES[0], SPARK_FRAMES[2], SPARK_FRAMES[3]],
  animation: 'random',
  lifetime: { min: 10, max: 30 },
  size: 0.3,
  size_end: 0.05,
  gravity: 0.1,
  friction: 0.95,
  spin: 5,
  collision: false,
  color: 0x40a0ff,
  color_end: 0xff6020,
  alpha: 0.75,
  fade: 'in_out',
  always_show: true,
};

test('particles: Particle flow defaults, one edit per Particle Studio group, preview, kept after reopening', async () => {
  test.setTimeout(150_000);
  const started = Date.now();
  const { window, folders, launched } = await blankProject('msm-particles-studio-');

  await createDefaultParticle(window);
  for (const frame of [0, 1, 2, 3]) {
    expect(existsSync(framePicture(folders.projectDir, `${SPARK}_${frame}`))).toBe(true);
  }

  // The Studio shows the flow's particle: four project frames, all with pictures.
  const studio = await openParticle(window, SPARK);
  for (const [index, sprite] of SPARK_FRAMES.entries()) {
    await expect(studio.getByTestId(`particle-frame-${index}-sprite`)).toHaveValue(sprite);
    await expect(studio.getByTestId(`particle-frame-${index}-missing`)).toHaveCount(0);
  }
  await expect(studio.getByTestId('particle-frame-4')).toHaveCount(0);
  await expect(studio.getByTestId('particle-animation')).toHaveValue('loop');
  await expect(studio.getByTestId('particle-emissive')).toBeChecked();

  // Pictures: the first frame moves down; the frames are picked at random.
  await studio.getByTestId('particle-frame-0-down').click();
  await expect(studio.getByTestId('particle-frame-0-sprite')).toHaveValue(SPARK_FRAMES[1] ?? '');
  await expect(studio.getByTestId('particle-frame-1-sprite')).toHaveValue(SPARK_FRAMES[0] ?? '');
  await studio.getByTestId('particle-animation').selectOption('random');
  await expect(studio.getByTestId('particle-frame-ticks')).toHaveCount(0);

  // Life and size: a lifetime between two numbers, a size and a size at the end.
  await expect(studio.getByTestId('particle-lifetime')).toHaveValue('20');
  await studio.getByTestId('particle-lifetime-between').check();
  await expect(studio.getByTestId('particle-lifetime')).toHaveCount(0);
  await expect(studio.getByTestId('particle-lifetime-min')).toHaveValue('20');
  await fillNumber(studio.getByTestId('particle-lifetime-min'), '10');
  await fillNumber(studio.getByTestId('particle-lifetime-max'), '30');
  await fillNumber(studio.getByTestId('particle-size'), '0.3');
  await fillNumber(studio.getByTestId('particle-size-end'), '0.05');

  // Movement: "Falls", drag, spin, and it no longer stops on blocks.
  await expect(studio.getByTestId('particle-gravity')).toHaveValue('-0.1');
  await studio.getByTestId('particle-gravity-falls').click();
  await expect(studio.getByTestId('particle-gravity')).toHaveValue('0.1');
  await expect(studio.getByTestId('particle-gravity-falls')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await fillNumber(studio.getByTestId('particle-drag'), '0.95');
  await fillNumber(studio.getByTestId('particle-spin'), '5');
  await expect(studio.getByTestId('particle-collision')).toBeChecked();
  await studio.getByTestId('particle-collision').uncheck();

  // Colour and light: tints, opacity, fade, no glow, shown from far away.
  await pickColour(studio.getByTestId('particle-tint'), '#40a0ff');
  await pickColour(studio.getByTestId('particle-tint-end'), '#ff6020');
  await fillNumber(studio.getByTestId('particle-opacity'), '0.75');
  await expect(studio.getByTestId('particle-fade')).toHaveValue('out');
  await studio.getByTestId('particle-fade').selectOption('in_out');
  await studio.getByTestId('particle-emissive').uncheck();
  // See-through follows the opacity and the fade by itself.
  await expect(studio.getByTestId('particle-translucent')).toBeChecked();
  await studio.getByTestId('particle-always-show').check();

  // The preview canvas mounts and switches mode and background.
  const canvas = studio.getByTestId('particle-preview-canvas');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-mode', 'burst');
  await studio.getByTestId('particle-preview-stream').click();
  await expect(canvas).toHaveAttribute('data-mode', 'stream');
  await expect(studio.getByTestId('particle-preview-stream')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await studio.getByTestId('particle-preview-background').click();
  await expect(canvas).toHaveAttribute('data-background', 'light');
  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThan(0);
  await expect(studio.getByTestId('particle-preview-placeholder')).toHaveCount(0);

  await expectNoErrors(window);
  await save(window);
  expect(savedData(folders.projectDir, 'particle', SPARK)).toEqual(EDITED_PARTICLE);
  await window.screenshot({ path: join(outputDir, 'particles-path-studio.png') });
  console.log(`particles-path studio: ${((Date.now() - started) / 1000).toFixed(1)} s`);

  // Second launch: reopen the project; every edit is kept.
  await launched.close();
  launches.splice(launches.indexOf(launched), 1);
  const second = await launchApp({ reuse: folders });
  launches.push(second);
  const w2 = second.window;
  await w2.waitForLoadState('domcontentloaded');
  await toolbarMenu(w2, 'toolbar-open-project');
  await expect(w2.getByTestId(`element-row-${id(SPARK_BLOCK)}`)).toBeVisible();
  const reopened = await openParticle(w2, SPARK);
  await expect(reopened.getByTestId('particle-frame-0-sprite')).toHaveValue(SPARK_FRAMES[1] ?? '');
  await expect(reopened.getByTestId('particle-frame-1-sprite')).toHaveValue(SPARK_FRAMES[0] ?? '');
  await expect(reopened.getByTestId('particle-animation')).toHaveValue('random');
  await expect(reopened.getByTestId('particle-lifetime-between')).toBeChecked();
  await expect(reopened.getByTestId('particle-lifetime-min')).toHaveValue('10');
  await expect(reopened.getByTestId('particle-lifetime-max')).toHaveValue('30');
  await expect(reopened.getByTestId('particle-size')).toHaveValue('0.3');
  await expect(reopened.getByTestId('particle-size-end')).toHaveValue('0.05');
  await expect(reopened.getByTestId('particle-gravity')).toHaveValue('0.1');
  await expect(reopened.getByTestId('particle-drag')).toHaveValue('0.95');
  await expect(reopened.getByTestId('particle-spin')).toHaveValue('5');
  await expect(reopened.getByTestId('particle-collision')).not.toBeChecked();
  await expect(reopened.getByTestId('particle-tint').locator('code')).toHaveText('#40a0ff');
  await expect(reopened.getByTestId('particle-tint-end').locator('code')).toHaveText('#ff6020');
  await expect(reopened.getByTestId('particle-opacity')).toHaveValue('0.75');
  await expect(reopened.getByTestId('particle-fade')).toHaveValue('in_out');
  await expect(reopened.getByTestId('particle-emissive')).not.toBeChecked();
  await expect(reopened.getByTestId('particle-always-show')).toBeChecked();
  await expect(reopened.getByTestId('particle-preview-canvas')).toBeVisible();
  await expectNoErrors(w2);
  expect(savedData(folders.projectDir, 'particle', SPARK)).toEqual(EDITED_PARTICLE);
  console.log(`particles-path reopened: ${((Date.now() - started) / 1000).toFixed(1)} s`);
});

test('particles: split into frames and Undo, ambient particles and Undo, coloured dust, exports on both targets', async () => {
  test.setTimeout(180_000);
  const started = Date.now();
  const release = targetById(defaultTargetId)?.target;
  if (release === undefined) throw new Error('No default target.');
  const snapshot = builtInTargets.find((entry) => entry.target.channel === 'snapshot')?.target;
  if (snapshot === undefined) throw new Error('No built-in snapshot target.');
  const { window, folders } = await blankProject('msm-particles-exports-');

  await createDefaultParticle(window);
  await save(window);
  const sparkCreated = savedData(folders.projectDir, 'particle', SPARK);
  expect(sparkCreated).toMatchObject({ format: 1, textures: SPARK_FRAMES, lifetime: 20 });

  // "Split a strip into frames": a 32 by 8 strip of four colours gives four frames in one step.
  await addFromTemplate(window, 'smoke puff', 'msm_particle_smoke_puff', 'ember');
  await save(window);
  const emberCreated = savedData(folders.projectDir, 'particle', 'ember');
  let studio = await openParticle(window, 'ember');
  await expect(studio.getByTestId('particle-frame-7')).toBeVisible();
  await expect(studio.getByTestId('particle-split-layout')).toHaveValue('horizontal');
  const colours = [
    [255, 64, 32, 255],
    [255, 160, 32, 255],
    [255, 224, 64, 255],
    [255, 255, 192, 255],
  ] as const;
  const strip = rgbaPng(32, 8, (x) => colours[Math.floor(x / 8)] ?? colours[0]);
  await studio.getByTestId('particle-split-file').setInputFiles({
    name: 'ember_strip.png',
    mimeType: 'image/png',
    buffer: strip,
  });
  await expect(studio.getByTestId('particle-split-status')).toHaveText(
    'Split into 4 frames, ember 0 to ember 3. Undo puts the old frames back.',
  );
  for (const frame of [0, 1, 2, 3]) {
    await expect(studio.getByTestId(`particle-frame-${frame}-sprite`)).toHaveValue(
      id(`ember_${frame}`),
    );
    await expect(studio.getByTestId(`particle-frame-${frame}-missing`)).toHaveCount(0);
  }
  await expect(studio.getByTestId('particle-frame-4')).toHaveCount(0);
  for (const [frame, colour] of colours.entries()) {
    const file = framePicture(folders.projectDir, `ember_${frame}`);
    await expect.poll(() => existsSync(file)).toBe(true);
    const picture = readPng(readFileSync(file));
    expect([picture.width, picture.height]).toEqual([8, 8]);
    expect(picture.pixel(4, 4)).toEqual([...colour]);
  }
  await expectNoErrors(window);

  // One Undo removes the four pictures and puts the vanilla frames back.
  await undo(window);
  await expect(studio.getByTestId('particle-frame-7')).toBeVisible();
  await expect(studio.getByTestId('particle-frame-0-sprite')).toHaveValue('minecraft:generic_7');
  for (const frame of [0, 1, 2, 3]) {
    await expect
      .poll(() => existsSync(framePicture(folders.projectDir, `ember_${frame}`)))
      .toBe(false);
  }
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();
  expect(savedData(folders.projectDir, 'particle', 'ember')).toEqual(emberCreated);
  await expectNoProblems(window);

  // "Ambient particles" on a plain block: the component, then one Undo removes it.
  await addFromTemplate(window, 'simple block', 'msm_block_simple', 'lamp_stone');
  await save(window);
  const plain = savedData(folders.projectDir, 'block', 'lamp_stone');
  expect(plain.components).not.toHaveProperty('msm:ambient_particles');
  studio = await openBlock(window, 'lamp_stone');
  const ambient = studio.getByTestId('block-ambient');
  await expect(ambient).toBeVisible();
  const toggle = ambient.getByTestId('block-ambient-toggle');
  await expect(toggle).not.toBeChecked();
  await expect(ambient.getByTestId('block-ambient-chance')).toHaveCount(0);
  await toggle.check();
  await expect(ambient.getByTestId('block-ambient-particle-kind')).toHaveValue('particle');
  const particleId = ambient.getByTestId('block-ambient-particle-id');
  await commitId(particleId, id(SPARK));
  await fillNumber(ambient.getByTestId('block-ambient-chance'), '0.25');
  await save(window);
  expect(savedData(folders.projectDir, 'block', 'lamp_stone').components).toMatchObject({
    'msm:ambient_particles': { particle: id(SPARK), chance: 0.25 },
  });
  await expect(toggle).toBeChecked();
  // The toggle is one edit: one Undo takes the whole component away.
  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(ambient.getByTestId('block-ambient-chance')).toHaveValue('');
  await undo(window);
  await expect(toggle).not.toBeChecked();
  await expect(ambient.getByTestId('block-ambient-chance')).toHaveCount(0);
  await save(window);
  expect(savedData(folders.projectDir, 'block', 'lamp_stone')).toEqual(plain);
  await expectNoErrors(window);

  // A "Spawn particle" action with "Coloured dust", a motion and "Show from far away".
  studio = await openBlock(window, SPARK_BLOCK);
  const events = studio.getByTestId('msm-events');
  await events.getByLabel('New event id').fill('sparkle');
  await events.getByRole('button', { name: 'Add event' }).click();
  const event = events.getByTestId('msm-event-sparkle');
  await expect(event).toBeVisible();
  await event.getByLabel('New action type for sparkle').selectOption('spawn_particle');
  await event.getByRole('button', { name: 'Add action to sparkle' }).click();
  const action = event.getByTestId('msm-action-0');
  await expect(action.getByLabel('sparkle action 1 type')).toHaveValue('spawn_particle');
  await expect(action.getByTestId('spawn-particle-kind')).toHaveValue('particle');
  await action.getByTestId('spawn-particle-kind').selectOption('dust');
  await expect(action.getByTestId('spawn-particle-id')).toHaveCount(0);
  await pickColour(action.getByTestId('spawn-particle-dust-colour'), '#30c0e0');
  await fillNumber(action.getByTestId('spawn-particle-dust-size'), '1.5');
  await fillNumber(action.getByLabel('sparkle action 1 count', { exact: true }), '12');
  await fillNumber(action.getByTestId('spawn-particle-motion-y'), '0.2');
  await action.getByTestId('spawn-particle-force').check();
  await studio.getByTestId('block-on-interact').selectOption('sparkle');
  await expectNoErrors(window);
  await save(window);
  const dust = {
    type: 'spawn_particle',
    particle: { type: 'minecraft:dust', color: 0x30c0e0, scale: 1.5 },
    count: 12,
    motion: [0, 0.2, 0],
    force: true,
  };
  const block = savedData(folders.projectDir, 'block', SPARK_BLOCK);
  expect(block.events).toEqual({ sparkle: { actions: [dust] } });
  expect(block.components).toMatchObject({
    'msm:ambient_particles': { particle: id(SPARK), chance: 0.4 },
  });

  // A function that shows the project particle.
  await openAddDialog(window);
  const create = window.getByTestId('new-element-dialog');
  await expect(create).toBeVisible();
  await create.getByTestId('template-function').check();
  await create.getByTestId('new-element-name').fill('show_spark');
  await create.getByTestId('new-element-dialog-submit').click();
  await expect(create).toBeHidden();
  await window.getByTestId(`element-row-${id('show_spark')}`).click();
  await expect(window.getByTestId('function-editor')).toBeVisible();
  await typeSource(window, `particle ${id(SPARK)} ~ ~1 ~ 0.3 0.3 0.3 0 10`);
  await expectNoErrors(window);
  await save(window);
  console.log(`particles-path edits: ${((Date.now() - started) / 1000).toFixed(1)} s`);

  // The vanilla data pack: the function kept with a warning, the block loot tables left out.
  await openExport(window, 'export-data-zip');
  const data = await newZip(folders.outDir, '.zip');
  const dataNames = Object.keys(data.files);
  expect(dataNames).toEqual(
    expect.arrayContaining(['pack.mcmeta', `data/${NAMESPACE}/function/show_spark.mcfunction`]),
  );
  expect(dataNames.some((name) => name.startsWith('msm/') || name.startsWith('assets/'))).toBe(
    false,
  );
  expect(dataNames).not.toContain(`data/${NAMESPACE}/loot_table/blocks/${SPARK_BLOCK}.json`);
  await openDockTab(window, 'problems');
  const exportProblems = window.getByTestId('export-problems');
  const modOnlyFunction = exportProblems.locator(
    '[data-testid="problem-row"][data-code="export.mod-only-function"]',
  );
  await expect(modOnlyFunction).toHaveCount(1);
  await expect(modOnlyFunction).toContainText(id('show_spark'));
  const modOnly = exportProblems.locator(
    '[data-testid="problem-row"][data-code="export.mod-only-reference"]',
  );
  await expect(
    modOnly.filter({ hasText: `data/${NAMESPACE}/loot_table/blocks/${SPARK_BLOCK}.json` }),
  ).toHaveCount(1);
  await expect(
    modOnly.filter({ hasText: `data/${NAMESPACE}/loot_table/blocks/lamp_stone.json` }),
  ).toHaveCount(1);
  await expect(modOnly).toHaveCount(2);

  // The Fabric mod jar on each target: the particle, its description and pictures, the block.
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
    expect(names).toEqual(
      expect.arrayContaining([
        `msm/${NAMESPACE}/particle/${SPARK}.json`,
        `assets/${NAMESPACE}/particles/${SPARK}.json`,
        ...[0, 1, 2, 3].map(
          (frame) => `assets/${NAMESPACE}/textures/particle/${SPARK}_${frame}.png`,
        ),
        `msm/${NAMESPACE}/particle/ember.json`,
        `msm/${NAMESPACE}/block/${SPARK_BLOCK}.json`,
      ]),
    );
    expect(names).not.toContain(`assets/${NAMESPACE}/textures/particle/ember_0.png`);
    expect(zipJson(jar.files, `msm/${NAMESPACE}/particle/${SPARK}.json`)).toEqual(sparkCreated);
    expect(
      zipJson<{ textures: string[] }>(jar.files, `assets/${NAMESPACE}/particles/${SPARK}.json`)
        .textures,
    ).toEqual(SPARK_FRAMES);
    const definition = zipJson<Data>(jar.files, `msm/${NAMESPACE}/block/${SPARK_BLOCK}.json`);
    expect(definition.events).toEqual({ sparkle: { actions: [dust] } });
    expect(definition.components).toMatchObject({
      'msm:ambient_particles': { particle: id(SPARK), chance: 0.4 },
    });
    console.log(
      `particles-path jar on ${target.id}: ${((Date.now() - started) / 1000).toFixed(1)} s`,
    );
  }
  await window.screenshot({ path: join(outputDir, 'particles-path-exports.png') });
});
