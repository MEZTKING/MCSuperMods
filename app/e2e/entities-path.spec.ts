/**
 * The entities path (Phase 5, ADRs 0028 and 0029), driven through the command palette, the
 * template picker, the Entity Studio, the preview and the Fabric jar export: a blank project
 * imports `assets/two_bones.bbmodel` (the B116 fixture without its Molang and catmullrom
 * keyframe, so the preview reports no notices; an 8x8 PNG is embedded at run time) with
 * "Import Blockbench model…", which adds a geo model, an animation set and a texture. An
 * `msm:entity` from the "Monster" template is pointed at them in the Entity Studio (display
 * name, health, model, animation set, texture, walk animation, spawn egg texture), a `flee`
 * goal is added and removed and the spawn egg is turned off and on again. Removing the geo
 * model leaves an `entities.unknown-model` error that blocks the Fabric mod jar; undo clears
 * it. The preview shows the entity canvas and the play button toggles. The jar is exported
 * with "Separate runtime and GeckoLib (for modpacks)" (no network: GeckoLib is not nested, so
 * it is never downloaded) and checked file by file, and a second launch reopens the project
 * with no problems and the edits kept.
 *
 * WebGL comes from SwiftShader (`--use-angle=swiftshader`, `--enable-unsafe-swiftshader`), so
 * the preview canvas mounts under xvfb; no drawn pixels are asserted.
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { expect, type Locator, type Page, test } from 'playwright/test';
import { appDir, type LaunchedApp, launchApp, openDockTab, outputDir } from './fixtures';
import { checkerPng } from './png';

/** The project folder name; a blank project's namespace (and mod id) is derived from it. */
const NAMESPACE = 'mob_e2e';

const ENTITY_PATH = 'gloom';
const ENTITY_ID = `${NAMESPACE}:${ENTITY_PATH}`;
const MODEL_ID = `${NAMESPACE}:entity/two_bones`;
const ANIMATIONS_ID = `${NAMESPACE}:entity/two_bones_animations`;
const TEXTURE_ID = `${NAMESPACE}:entity/two_bones`;
const WALK = 'animation.two_bones.walk';
const DISPLAY_NAME = 'Gloom Stalker';

/** Software WebGL for the preview canvas under xvfb. */
const WEBGL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] as const;

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

/** Writes the fixture `.bbmodel` into `dir` with an embedded PNG texture; returns its path. */
function writeBbmodel(dir: string): string {
  const model = JSON.parse(
    readFileSync(join(appDir, 'e2e', 'assets', 'two_bones.bbmodel'), 'utf8'),
  ) as { textures: { source?: string }[] };
  const png = checkerPng(8, [70, 40, 110, 255], [20, 10, 40, 255]);
  const texture = model.textures[0];
  if (texture === undefined) throw new Error('The fixture has no texture.');
  texture.source = `data:image/png;base64,${png.toString('base64')}`;
  const path = join(dir, 'two_bones.bbmodel');
  writeFileSync(path, JSON.stringify(model));
  return path;
}

/** The status toast's text. */
function toast(window: Page): Locator {
  return window.getByTestId('status-toast-text');
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

test('entities: Blockbench import, Monster template, Entity Studio, unknown model, preview, Fabric jar, reopen', async () => {
  base = mkdtempSync(join(tmpdir(), 'msm-entities-'));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  const inputDir = join(base, 'input');
  mkdirSync(inputDir, { recursive: true });
  const bbmodel = writeBbmodel(inputDir);
  mkdirSync(outputDir, { recursive: true });

  // First launch: a blank project and a Blockbench import. -----------------------------------
  const first = await launchApp({ pickFiles: [bbmodel], reuse: folders, args: WEBGL_ARGS });
  launches.push(first);
  const { window } = first;
  await window.waitForLoadState('domcontentloaded');

  await window.getByTestId('toolbar-new-project').click();
  await expect(window.getByTestId(`element-row-${NAMESPACE}:pack`)).toBeVisible();

  let palette = await openPalette(window, 'import blockbench');
  await palette.getByTestId('command-importBlockbench').click();
  await expect(palette).toBeHidden();
  const importDialog = window.getByTestId('import-files-dialog');
  await expect(importDialog).toBeVisible();
  await expect(importDialog.getByText('Import Blockbench model', { exact: true })).toBeVisible();
  await expect(importDialog.getByTestId('import-files-namespace')).toHaveValue(NAMESPACE);
  await expect(importDialog.getByTestId('import-files-importers')).toContainText(
    'Blockbench model (.bbmodel, .geo.json, .animation.json)',
  );
  await expect(importDialog.getByTestId('import-files-note')).toContainText('.bbmodel');
  await importDialog.getByTestId('import-files-dialog-submit').click();
  await expect(importDialog).toBeHidden();

  const models = window.getByRole('region', { name: `${NAMESPACE} Models and animations` });
  await expect(models.getByTestId(`element-row-${MODEL_ID}`)).toBeVisible();
  await expect(models.getByTestId(`element-row-${MODEL_ID}`)).toContainText('model');
  await expect(models.getByTestId(`element-row-${ANIMATIONS_ID}`)).toBeVisible();
  await expect(models.getByTestId(`element-row-${ANIMATIONS_ID}`)).toContainText('animation');
  await expect(
    window.getByTestId(`asset-row-${NAMESPACE}:textures/entity/two_bones.png`),
  ).toBeVisible();
  await expectNoProblems(window);

  // An entity from the "Monster" template. -------------------------------------------------
  await window.getByTestId('toolbar-add-element').click();
  const newDialog = window.getByTestId('new-element-dialog');
  await expect(newDialog).toBeVisible();
  await newDialog.getByTestId('new-element-filter').fill('monster');
  const template = newDialog.getByTestId('template-msm_entity_monster');
  await expect(template).toBeVisible();
  await template.check();
  await expect(newDialog.getByTestId('new-element-namespace')).toHaveValue(NAMESPACE);
  await newDialog.getByTestId('new-element-name').fill(ENTITY_PATH);
  await newDialog.getByTestId('new-element-dialog-submit').click();
  await expect(newDialog).toBeHidden();
  const entities = window.getByRole('region', { name: `${NAMESPACE} Entities` });
  await expect(entities.getByTestId(`element-row-${ENTITY_ID}`)).toBeVisible();

  // Entity Studio: identity, stats, appearance. --------------------------------------------
  const studio = window.getByTestId('entity-studio');
  await expect(studio).toBeVisible();
  const displayName = studio.getByTestId('entity-display-name');
  await expect(displayName).toHaveValue('Gloom');
  await displayName.fill(DISPLAY_NAME);
  await displayName.press('Tab');
  await expect(displayName).toHaveValue(DISPLAY_NAME);
  await expect(studio.getByTestId('entity-category')).toHaveValue('monster');
  const health = studio.getByTestId('entity-health');
  await health.fill('30');
  await expect(health).toHaveValue('30');
  await health.fill('24');
  await expect(health).toHaveValue('24');

  // The template names a model and an animation set that do not exist yet.
  const errors = await problemRows(window, 'error');
  await expect(errors.and(window.locator('[data-code="entities.unknown-model"]'))).toHaveCount(1);
  const model = studio.getByTestId('entity-model');
  await expect(model).toHaveValue(`${NAMESPACE}:entity/${ENTITY_PATH}`);
  await model.selectOption(MODEL_ID);
  await expect(model).toHaveValue(MODEL_ID);
  const animations = studio.getByTestId('entity-animations');
  await animations.selectOption(ANIMATIONS_ID);
  await expect(animations).toHaveValue(ANIMATIONS_ID);
  const texture = studio.getByTestId('entity-texture');
  await texture.selectOption(TEXTURE_ID);
  await expect(texture).toHaveValue(TEXTURE_ID);
  // The imported set has one animation; the template's idle and attack names do not exist.
  await studio.getByTestId('entity-idle').selectOption('');
  await expect(studio.getByTestId('entity-idle')).toHaveValue('');
  await studio.getByTestId('entity-walk').selectOption(WALK);
  await expect(studio.getByTestId('entity-walk')).toHaveValue(WALK);
  await studio.getByTestId('entity-attack-animation').selectOption('');
  await expect(studio.getByTestId('entity-attack-animation')).toHaveValue('');

  // Behaviour: a flee goal added, then removed. ---------------------------------------------
  const behaviour = studio.getByTestId('entity-behaviour');
  await expect(behaviour.getByTestId('entity-goal-3')).toContainText('4. Look around');
  await expect(behaviour.getByTestId('entity-goal-4')).toHaveCount(0);
  await behaviour.getByTestId('entity-new-goal-type').selectOption('flee');
  await behaviour.getByTestId('entity-add-goal').click();
  const flee = behaviour.getByTestId('entity-goal-4');
  await expect(flee).toContainText('5. Flee');
  await expect(flee.getByText('Runs from')).toBeVisible();
  await flee.getByRole('button', { name: 'Remove Goal 5', exact: true }).click();
  await expect(behaviour.getByTestId('entity-goal-4')).toHaveCount(0);

  // Spawn egg: off, then on again with the imported texture. --------------------------------
  const hasEgg = studio.getByTestId('entity-has-egg');
  await expect(hasEgg).toBeChecked();
  await hasEgg.uncheck();
  await expect(hasEgg).not.toBeChecked();
  await expect(studio.getByTestId('entity-egg-texture')).toHaveCount(0);
  await hasEgg.check();
  await expect(hasEgg).toBeChecked();
  const eggTexture = studio.getByTestId('entity-egg-texture');
  await eggTexture.selectOption(TEXTURE_ID);
  await expect(eggTexture).toHaveValue(TEXTURE_ID);
  await expectNoProblems(window);

  // Removing the geo model leaves a dangling reference that blocks the jar. -----------------
  await window.getByRole('button', { name: `Remove ${MODEL_ID}`, exact: true }).click();
  await expect(window.getByTestId(`element-row-${MODEL_ID}`)).toHaveCount(0);
  await expect(errors).toHaveCount(1);
  await expect(errors.first()).toHaveAttribute('data-code', 'entities.unknown-model');
  await expect(errors.first()).toContainText(MODEL_ID);
  const blocked = await exportItem(window, 'export-fabric-jar');
  await expect(blocked).toHaveAttribute('data-disabled', /.*/);
  await expect(window.getByTestId('export-fabric-jar-reason')).toContainText('Fix 1 error');
  await window.keyboard.press('Escape');
  palette = await openPalette(window, 'fabric mod jar');
  await expect(palette.getByTestId('command-exportFabricJar')).toHaveCount(0);
  await window.keyboard.press('Escape');
  await expect(palette).toBeHidden();

  // Undo brings the model back and clears the error.
  await window.getByTestId('toolbar-undo').click();
  await expect(window.getByTestId(`element-row-${MODEL_ID}`)).toBeVisible();
  await expect(errors).toHaveCount(0);
  await expectNoProblems(window);

  // Preview: the entity canvas and the play button. ----------------------------------------
  await window.getByTestId(`element-row-${ENTITY_ID}`).click();
  await expect(studio).toBeVisible();
  await expect(studio.getByTestId('entity-model')).toHaveValue(MODEL_ID);
  // The live preview is beside the form (ADR 0047 D4).
  const preview = window.getByTestId('editor-preview');
  await expect(preview).toBeVisible();
  await expect(preview.getByTestId('preview-geo-canvas')).toBeVisible();
  await expect(preview.getByTestId('preview-geo-transport')).toBeVisible();
  const picker = preview.getByTestId('preview-geo-animation');
  await expect(picker.locator('option').first()).toHaveText('No animation (rest pose)');
  await picker.selectOption(WALK);
  await expect(picker).toHaveValue(WALK);
  const play = preview.getByTestId('preview-geo-play');
  await expect(play).toBeEnabled();
  const pressed = (await play.getAttribute('aria-pressed')) === 'true';
  await play.click();
  await expect(play).toHaveAttribute('aria-pressed', String(!pressed));
  await expect(play).toHaveAccessibleName(pressed ? 'Play animation' : 'Pause animation');
  await play.click();
  await expect(play).toHaveAttribute('aria-pressed', String(pressed));
  await expect(play).toHaveAccessibleName(pressed ? 'Pause animation' : 'Play animation');
  await expect(preview.getByTestId('preview-geo-time')).toContainText(WALK);
  await preview.screenshot({ path: join(outputDir, 'entities-path-preview.png') });

  // Export the Fabric mod jar through the palette, with a separate runtime and GeckoLib. ----
  palette = await openPalette(window, 'fabric mod jar');
  await palette.getByTestId('command-exportFabricJar').click();
  await expect(palette).toBeHidden();
  const jarDialog = window.getByTestId('fabric-jar-dialog');
  await expect(jarDialog).toBeVisible();
  await expect(jarDialog.getByTestId('fabric-jar-geckolib-note')).toContainText('GeckoLib');
  await expect(jarDialog.getByText('Separate runtime and GeckoLib (for modpacks)')).toBeVisible();
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

    const definition = zipJson(jar, `msm/${NAMESPACE}/entity/${ENTITY_PATH}.json`) as {
      format?: number;
      display_name?: unknown;
      category?: unknown;
      spawn_egg?: unknown;
      components?: Record<string, Record<string, unknown>>;
    };
    expect(definition.format).toBe(1);
    expect(definition.display_name).toBeUndefined();
    expect(definition.category).toBe('monster');
    // The egg's texture is editor-only; the template's egg came back with an empty object.
    expect(definition.spawn_egg).toEqual({});
    expect(definition.components?.['msm:health']).toEqual({ max: 24 });
    const animated = definition.components?.['msm:animated_model'];
    expect(animated?.model).toBe(MODEL_ID);
    expect(animated?.animations).toBe(ANIMATIONS_ID);
    expect(animated?.texture).toBe(TEXTURE_ID);
    expect(animated?.walk).toBe(WALK);
    expect(animated?.idle).toBeUndefined();
    expect(animated?.attack).toBeUndefined();
    const goals = definition.components?.['msm:ai_goals']?.goals as { type?: string }[];
    expect(goals.map((goal) => goal.type)).toEqual([
      'melee_attack',
      'wander',
      'look_at_player',
      'look_around',
    ]);

    const geo = zipJson(jar, `assets/${NAMESPACE}/geckolib/models/entity/two_bones.geo.json`) as {
      format_version?: unknown;
      'minecraft:geometry'?: unknown[];
    };
    expect(geo['minecraft:geometry']).toHaveLength(1);
    const animation = zipJson(
      jar,
      `assets/${NAMESPACE}/geckolib/animations/entity/two_bones_animations.animation.json`,
    ) as { animations?: Record<string, unknown> };
    expect(Object.keys(animation.animations ?? {})).toEqual([WALK]);
    expect(names).toContain(`assets/${NAMESPACE}/textures/entity/two_bones.png`);
    expect(names.some((name) => name.endsWith('.bbmodel'))).toBe(false);

    const eggDefinition = zipJson(
      jar,
      `assets/${NAMESPACE}/items/${ENTITY_PATH}_spawn_egg.json`,
    ) as { model?: { model?: string } };
    expect(eggDefinition.model?.model).toBe(`${NAMESPACE}:item/${ENTITY_PATH}_spawn_egg`);
    const eggModel = zipJson(
      jar,
      `assets/${NAMESPACE}/models/item/${ENTITY_PATH}_spawn_egg.json`,
    ) as { textures?: Record<string, string> };
    expect(eggModel.textures?.layer0).toBe(TEXTURE_ID);

    const lang = zipJson(jar, `assets/${NAMESPACE}/lang/en_us.json`) as Record<string, string>;
    expect(lang[`entity.${NAMESPACE}.${ENTITY_PATH}`]).toBe(DISPLAY_NAME);
    expect(lang[`item.${NAMESPACE}.${ENTITY_PATH}_spawn_egg`]).toBe(`${DISPLAY_NAME} Spawn Egg`);

    const modJson = zipJson(jar, 'fabric.mod.json') as {
      id?: string;
      depends?: Record<string, string>;
      jars?: unknown;
    };
    expect(modJson.id).toBe(NAMESPACE);
    expect(Object.keys(modJson.depends ?? {})).toEqual(
      expect.arrayContaining(['msm_runtime', 'geckolib']),
    );
    expect(modJson.jars).toBeUndefined();
  }

  await window.screenshot({ path: join(outputDir, 'entities-path.png') });

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
  await expect(w2.getByTestId(`element-row-${MODEL_ID}`)).toBeVisible();
  await expect(w2.getByTestId(`element-row-${ANIMATIONS_ID}`)).toBeVisible();
  await w2.getByTestId(`element-row-${ENTITY_ID}`).click();
  const reopened = w2.getByTestId('entity-studio');
  await expect(reopened).toBeVisible();
  await expect(reopened.getByTestId('entity-display-name')).toHaveValue(DISPLAY_NAME);
  await expect(reopened.getByTestId('entity-health')).toHaveValue('24');
  await expect(reopened.getByTestId('entity-model')).toHaveValue(MODEL_ID);
  await expect(reopened.getByTestId('entity-animations')).toHaveValue(ANIMATIONS_ID);
  await expect(reopened.getByTestId('entity-texture')).toHaveValue(TEXTURE_ID);
  await expect(reopened.getByTestId('entity-walk')).toHaveValue(WALK);
  await expect(reopened.getByTestId('entity-has-egg')).toBeChecked();
  await expect(reopened.getByTestId('entity-egg-texture')).toHaveValue(TEXTURE_ID);
  await expect(reopened.getByTestId('entity-goal-4')).toHaveCount(0);
  await expectNoProblems(w2);
  await w2.screenshot({ path: join(outputDir, 'entities-path-reopened.png') });
});
