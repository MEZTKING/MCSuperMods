/**
 * The art path (ADR 0092; plan brief B500), in blank projects. Every picture is drawn on this
 * machine by MSM's own recipes: no key, no network, no Minecraft picture.
 *
 * 1. Gear set, Block Studio and New texture: the Creator's Gear set with its untouched defaults
 *    writes a sword picture that passes `checkArtRules` for the `sword` recipe and is not the
 *    old placeholder (`placeholderPng('sword')`, plain or in the set's colour). A Simple block's
 *    picture row in the Block Studio gets **Draw…**: Bricks, **New looks**, the third variation
 *    (seed 8), **Use this picture**; the texture on disk is exactly the recipe's bytes for that
 *    look, and one Undo puts the old picture back. **New texture…** with **Start from: Drawn
 *    picture** draws a gem, the painter opens on it and saves it: the new file's pixels are the
 *    drawn gem's.
 * 2. Particle Studio and Mob Studio: the Particle flow's particle gets **Draw frames…** (Orb,
 *    the second variation): all four frame files are the recipe's frames for that look, and
 *    together they pass `checkArtRules`. The Pet flow's mob gets **Draw a skin** with the Scales
 *    coat: its texture is `boxSkinArtPng` of the model's own boxes at the chosen seed, and one
 *    Undo puts the old skin back.
 * 3. Very easy: from Home, "Make a block" and the Stone set, **Draw it for me** on the stone's
 *    picture shows only Colour and the variations; the picked picture becomes the field's
 *    thumbnail, and after Create the stone's texture on disk is that picture, byte for byte,
 *    and passes `checkArtRules` for the `stone` recipe.
 *
 * The expected bytes come from `@msm/plugin-library` on the Node side, with the colour read
 * from the dialog's colour well and the seed from the variation's `data-seed`.
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  artFramePngs,
  artLookPng,
  artRecipeInfo,
  boxesOfGeoModel,
  boxSkinArtPng,
  COLOURS,
  checkArtRules,
  placeholderPng,
} from '@msm/plugin-library';
import { expect, type Locator, type Page, test } from 'playwright/test';
import { type LaunchedApp, launchApp, newProjectInFolder, outputDir, toast } from './fixtures';
import { readPng } from './png';

/** The project folder name; a blank project's namespace is derived from it. */
const NAMESPACE = 'artwork';
const WEBGL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] as const;
const id = (path: string) => `${NAMESPACE}:${path}`;

type Rgb = [number, number, number];

let base: string | undefined;
const launches: LaunchedApp[] = [];

test.afterEach(async () => {
  for (const launched of launches.splice(0)) await launched.close();
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

/** Opens a new blank project in a fresh launch, the project folder named `NAMESPACE`. */
async function blankProject(prefix: string, moreOptions: 'open' | 'closed' = 'open') {
  base = mkdtempSync(join(tmpdir(), prefix));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  mkdirSync(outputDir, { recursive: true });
  const launched = await launchApp({ reuse: folders, args: WEBGL_ARGS, moreOptions });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await newProjectInFolder(window);
  // The pack settings sit in the list's folded "More" while the More options start closed.
  await expect.poll(() => existsSync(join(folders.projectDir, 'msm.project.json'))).toBe(true);
  if (moreOptions === 'open') {
    await expect(window.getByTestId(`element-row-${id('pack')}`)).toBeVisible();
  }
  return { window, folders };
}

/** A file under the project's `assets/<namespace>/`. */
function assetFile(projectDir: string, ...path: string[]): string {
  return join(projectDir, 'assets', NAMESPACE, ...path);
}

/** The RGBA pixels of a PNG file's bytes, as `checkArtRules` reads them. */
function rgbaOf(bytes: Buffer | Uint8Array): { width: number; height: number; data: Uint8Array } {
  const png = readPng(Buffer.from(bytes));
  const data = new Uint8Array(png.width * png.height * 4);
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) data.set(png.pixel(x, y), (y * png.width + x) * 4);
  }
  return { width: png.width, height: png.height, data };
}

function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** The Draw dialog's colour (its colour well). */
async function dialogColour(dialog: Locator): Promise<Rgb> {
  return hexToRgb(await dialog.getByTestId('draw-colour').inputValue());
}

/** Chooses variation `index` of the Draw dialog and returns its seed. */
async function chooseVariation(dialog: Locator, index: number): Promise<number> {
  const variation = dialog.getByTestId(`draw-variation-${index}`);
  await variation.click();
  await expect(variation).toHaveAttribute('aria-selected', 'true');
  return Number(await variation.getAttribute('data-seed'));
}

/** Opens the Creator from the toolbar and picks `flowId` (the first card of that flow). */
async function openFlow(window: Page, flowId: string): Promise<Locator> {
  await window.getByTestId('toolbar-creator').click();
  const dialog = window.getByTestId('creator-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId(`creator-flow-${flowId}`).first().click();
  return dialog;
}

/** Creates the open Creator flow `title` with what its fields hold. */
async function create(window: Page, dialog: Locator, title: string): Promise<void> {
  const button = dialog.getByTestId('creator-create');
  await expect(button).toBeEnabled({ timeout: 30_000 });
  await button.click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(
    toast(window).filter({
      hasText: new RegExp(`^Create ${title}: \\d+ element\\(s\\) and file\\(s\\) changed`),
    }),
  ).toBeVisible();
}

async function save(window: Page): Promise<void> {
  await window.getByTestId('toolbar-save').click();
  await expect(window.locator('footer').getByText('Saved', { exact: true })).toBeVisible();
}

/** The `data` of a saved element file. */
function savedData(projectDir: string, folder: string, path: string): Record<string, unknown> {
  const file = join(projectDir, 'content', NAMESPACE, folder, `${path}.json`);
  return (JSON.parse(readFileSync(file, 'utf8')) as { data: Record<string, unknown> }).data;
}

test('art: drawn Gear set, Draw on a Block Studio row with Undo, New texture from a drawn picture', async () => {
  test.setTimeout(150_000);
  const { window, folders } = await blankProject('msm-art-');

  // The Gear set with its untouched defaults draws its sword with the sword recipe. --------------
  const gear = await openFlow(window, 'gear-set');
  await create(window, gear, 'Gear set');
  const swordFile = assetFile(folders.projectDir, 'textures', 'item', 'ruby_sword.png');
  await expect.poll(() => existsSync(swordFile)).toBe(true);
  const sword = readFileSync(swordFile);
  expect(checkArtRules(rgbaOf(sword), artRecipeInfo('sword'))).toEqual([]);
  expect(sword.equals(Buffer.from(placeholderPng('sword')))).toBe(false);
  expect(sword.equals(Buffer.from(placeholderPng('sword', { colour: COLOURS.ruby })))).toBe(false);

  // A Simple block, then Draw… on its picture row: Bricks, New looks, the third variation. -------
  const simple = await openFlow(window, 'simple-block');
  await simple.getByTestId('param-block_name').fill('Amber Tile');
  await create(window, simple, 'Simple block');
  const tileFile = assetFile(folders.projectDir, 'textures', 'block', 'amber_tile.png');
  await expect.poll(() => existsSync(tileFile)).toBe(true);
  const before = readFileSync(tileFile);

  await window.getByTestId(`element-row-${id('amber_tile')}`).click();
  const drawRow = window.getByTestId(`block-model-ai-${NAMESPACE}-block-amber-tile-draw`);
  await expect(drawRow).toHaveText('Draw it for me');
  await drawRow.click();
  const dialog = window.getByTestId('draw-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading')).toContainText('Draw it for me');
  await dialog.getByTestId('draw-option-bricks').click();
  await expect(dialog.getByTestId('draw-option-bricks')).toHaveAttribute('aria-selected', 'true');
  // New looks shows the next six seeds and chooses the first.
  await expect(dialog.getByTestId('draw-variation-0')).toHaveAttribute('data-seed', '0');
  await dialog.getByTestId('draw-new-looks').click();
  await expect(dialog.getByTestId('draw-variation-0')).toHaveAttribute('data-seed', '6');
  await expect(dialog.getByTestId('draw-variation-0')).toHaveAttribute('aria-selected', 'true');
  const seed = await chooseVariation(dialog, 2);
  expect(seed).toBe(8);
  const colour = await dialogColour(dialog);
  await dialog.getByTestId('draw-use').click();
  await expect(dialog).toBeHidden();

  const bricks = artLookPng({ recipe: 'bricks', colour, detail: 'normal', seed });
  await expect.poll(() => readFileSync(tileFile).equals(Buffer.from(bricks))).toBe(true);
  expect(checkArtRules(rgbaOf(bricks), artRecipeInfo('bricks'))).toEqual([]);
  // One Undo puts the old picture back.
  await window.getByTestId('toolbar-undo').click();
  await expect.poll(() => readFileSync(tileFile).equals(before)).toBe(true);

  // New texture… from a drawn picture: a gem, opened in the painter and saved. ------------------
  await window.getByTestId(`assets-new-texture-${NAMESPACE}`).click();
  const newTexture = window.getByTestId('new-texture-dialog');
  await expect(newTexture).toBeVisible();
  await newTexture.getByTestId('new-texture-name').fill('drawn_gem');
  await newTexture.getByTestId('new-texture-start-drawn').check();
  await newTexture.getByRole('button', { name: 'Draw…' }).click();
  const gemDialog = window.getByTestId('draw-dialog');
  await expect(gemDialog).toBeVisible();
  await gemDialog.getByTestId('draw-option-gem').click();
  const gemSeed = await chooseVariation(gemDialog, 1);
  const gemColour = await dialogColour(gemDialog);
  await gemDialog.getByTestId('draw-use').click();
  await expect(gemDialog).toBeHidden();
  const painter = window.getByTestId('texture-editor');
  await expect(painter.getByTestId('texture-canvas')).toBeVisible();
  await expect(painter.getByTestId('texture-save')).toBeEnabled();
  await painter.getByTestId('texture-save').click();
  await expect(painter).toBeHidden();
  const gemFile = assetFile(folders.projectDir, 'textures', 'item', 'drawn_gem.png');
  await expect.poll(() => existsSync(gemFile)).toBe(true);
  const gem = artLookPng({ recipe: 'gem', colour: gemColour, detail: 'normal', seed: gemSeed });
  // The painter encodes the canvas itself, so compare pixels rather than bytes.
  expect(rgbaOf(readFileSync(gemFile))).toEqual(rgbaOf(gem));
  await window.screenshot({ path: join(outputDir, 'art-path.png') });
});

test('art: Draw frames in the Particle Studio, Draw a skin in the Mob Studio with Undo', async () => {
  test.setTimeout(150_000);
  const { window, folders } = await blankProject('msm-art-mobs-');

  // The Particle flow's particle, then Draw frames…: Orb, the second variation. -----------------
  const particleFlow = await openFlow(window, 'particle');
  await create(window, particleFlow, 'Particle');
  await window.getByTestId(`element-row-${id('golden_spark')}`).click();
  const particleStudio = window.getByTestId('particle-studio');
  await expect(particleStudio).toBeVisible();
  const drawFrames = particleStudio.getByTestId('particle-draw-frames');
  await expect(drawFrames).toHaveText('Draw it for me');
  await drawFrames.click();
  const dialog = window.getByTestId('draw-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('draw-option-particle_orb').click();
  await expect(dialog.getByTestId('draw-variation-0')).toContainText('4 frames');
  const seed = await chooseVariation(dialog, 1);
  const colour = await dialogColour(dialog);
  await dialog.getByTestId('draw-use').click();
  await expect(dialog).toBeHidden();

  const frames = artFramePngs({ recipe: 'particle_orb', colour, detail: 'normal', seed });
  expect(frames).toHaveLength(4);
  const frameFile = (index: number) =>
    assetFile(folders.projectDir, 'textures', 'particle', `golden_spark_${index}.png`);
  await expect
    .poll(() => frames.every((bytes, index) => readFileSync(frameFile(index)).equals(bytes)))
    .toBe(true);
  const strip = frames.map((bytes) => rgbaOf(bytes).data);
  const stacked = new Uint8Array(strip.reduce((sum, data) => sum + data.length, 0));
  for (const [index, data] of strip.entries()) stacked.set(data, index * data.length);
  expect(
    checkArtRules({ width: 8, height: 8, frames: 4, data: stacked }, artRecipeInfo('particle_orb')),
  ).toEqual([]);

  // The Pet flow's mob, then Draw a skin with the Scales coat. ----------------------------------
  const petFlow = await openFlow(window, 'pet');
  await create(window, petFlow, 'Pet');
  await save(window);
  const mob = savedData(folders.projectDir, 'entity', 'ember_fox') as {
    components: Record<string, { model?: string; texture?: string }>;
  };
  const looks = mob.components['msm:animated_model'];
  const modelId = looks?.model ?? '';
  const textureId = looks?.texture ?? '';
  expect(modelId.startsWith(`${NAMESPACE}:`)).toBe(true);
  expect(textureId.startsWith(`${NAMESPACE}:`)).toBe(true);
  const geometry = savedData(folders.projectDir, 'geo_model', modelId.slice(NAMESPACE.length + 1));
  const boxes = boxesOfGeoModel(geometry as Parameters<typeof boxesOfGeoModel>[0]);
  expect(boxes).not.toBeNull();
  const skinFile = assetFile(
    folders.projectDir,
    'textures',
    `${textureId.slice(NAMESPACE.length + 1)}.png`,
  );
  const oldSkin = readFileSync(skinFile);
  const { width, height } = rgbaOf(oldSkin);

  await window.getByTestId(`element-row-${id('ember_fox')}`).click();
  const studio = window.getByTestId('entity-studio');
  await expect(studio).toBeVisible();
  const drawSkin = studio.getByTestId('entity-draw-skin');
  await expect(drawSkin).toBeEnabled();
  await expect(drawSkin).toHaveText('Draw its skin');
  await expect(studio.getByTestId('entity-draw-skin-note')).toHaveCount(0);
  await drawSkin.click();
  const skinDialog = window.getByTestId('draw-dialog');
  await expect(skinDialog).toBeVisible();
  await expect(skinDialog.getByRole('heading')).toContainText('Draw its skin');
  await skinDialog.getByTestId('draw-finish').selectOption('scales');
  const skinSeed = await chooseVariation(skinDialog, 3);
  const skinColour = await dialogColour(skinDialog);
  await expect(skinDialog.getByTestId('draw-use')).toHaveText('Use this skin');
  await skinDialog.getByTestId('draw-use').click();
  await expect(skinDialog).toBeHidden();

  const skin = boxSkinArtPng(boxes ?? [], width, height, {
    colour: skinColour,
    detail: 'normal',
    seed: skinSeed,
    coat: 'scales',
  });
  await expect.poll(() => readFileSync(skinFile).equals(Buffer.from(skin))).toBe(true);
  await window.getByTestId('toolbar-undo').click();
  await expect.poll(() => readFileSync(skinFile).equals(oldSkin)).toBe(true);
  await window.screenshot({ path: join(outputDir, 'art-path-mobs.png') });
});

test('art: "Draw it for me" on a Creator picture field, More options closed', async () => {
  test.setTimeout(120_000);
  const { window, folders } = await blankProject('msm-art-very-easy-', 'closed');
  await window.getByTestId('toolbar-home').click();
  const home = window.getByTestId('home');
  await expect(home).toBeVisible();

  await home.getByTestId('home-tile-block').click();
  const creator = window.getByTestId('creator-dialog');
  await expect(creator).toBeVisible();
  await creator.getByTestId('creator-flow-stone-set').first().click();
  const draw = creator.getByTestId('param-picture_stone-draw');
  await expect(draw).toHaveText('Draw it for me');
  await expect(creator.getByTestId('param-picture_stone-empty')).toBeVisible();
  await draw.click();

  // The dialog's default view: its title, Colour and the variations; the rest in More options.
  const dialog = window.getByTestId('draw-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading')).toContainText('Draw it for me');
  await expect(dialog.locator('[data-testid^="draw-option-"]')).toHaveCount(0);
  await expect(dialog.getByTestId('draw-finish')).toHaveCount(0);
  await expect(dialog.getByTestId('draw-accent')).toHaveCount(0);
  await expect(dialog.locator('[data-testid^="draw-detail-"]')).toHaveCount(0);
  await expect(dialog.locator('[data-testid^="draw-variation-"]')).toHaveCount(6);
  await dialog.getByTestId('draw-swatch-moss').click();
  await expect(dialog.getByTestId('draw-swatch-moss')).toHaveAttribute('aria-pressed', 'true');
  const seed = await chooseVariation(dialog, 1);
  const colour = await dialogColour(dialog);
  await dialog.getByTestId('draw-use').click();
  await expect(dialog).toBeHidden();

  // The field holds the drawn stone.
  const thumbnail = creator.getByTestId('param-picture_stone-thumbnail');
  await expect(thumbnail).toBeVisible();
  const src = (await thumbnail.getAttribute('src')) ?? '';
  expect(src.startsWith('data:image/png;base64,')).toBe(true);
  const picked = Buffer.from(src.slice('data:image/png;base64,'.length), 'base64');
  const stone = artLookPng({ recipe: 'stone', colour, detail: 'normal', seed });
  expect(picked.equals(Buffer.from(stone))).toBe(true);
  expect(checkArtRules(rgbaOf(picked), artRecipeInfo('stone'))).toEqual([]);

  await create(window, creator, 'Stone set');
  // The stone's texture on disk is the picked picture, byte for byte.
  const blockTextures = assetFile(folders.projectDir, 'textures', 'block');
  await expect
    .poll(
      () =>
        existsSync(blockTextures) &&
        readdirSync(blockTextures).some((name) =>
          readFileSync(join(blockTextures, name)).equals(picked),
        ),
    )
    .toBe(true);
  await window.screenshot({ path: join(outputDir, 'art-path-very-easy.png') });
});
