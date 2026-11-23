/**
 * The eject path (Phase 6, ADR 0033), driven through the command palette and the "Export Java
 * project" dialog: `fixtures/sample-mod`, copied to a temporary folder, is opened and given
 * one script from the "Block interaction script" template (scripts are not ejected, so the
 * dialog and the README say so). "Export Java project…" writes a standalone Fabric Gradle
 * project into `<picked folder>/msm_sample_mod/` (the export folder picker returns
 * `MSM_E2E_OUT_DIR`); the test checks the Gradle files (versions read from `@msm/targets`),
 * the executable `gradlew`, the generated Java naming `ruby_ore`, `fabric.mod.json` without
 * `msm_runtime` and the README. A second export into the same folder is blocked with the
 * folder-not-empty message.
 *
 * A second test (ADRs 0055 D10, 0056 D7) adds a status effect and a throwable item from their
 * templates to the sample mod and checks that the tree holds `ModEffects.java` naming the
 * effect and one `ThrownItemEntity.java`.
 *
 * A third test (eject 2c, B544) adds a trader who remembers you and a water-like fluid from their
 * templates (the trader's model, animations and pictures are the sample villagers' pedlar's,
 * copied under its id first) and checks that the tree holds the trader and fluid classes and
 * that the export lists no `export.not-in-eject` warning: traders are ejected since eject 2c.
 *
 * Gradle never runs here: CI builds the ejected sample projects (`engine-mod` job).
 */

import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultTargetId, targetById } from '@msm/targets';
import { expect, type Locator, type Page, test } from 'playwright/test';
import {
  appDir,
  type LaunchedApp,
  launchApp,
  openAddDialog,
  openDockTab,
  openToolbarMenu,
  outputDir,
  toolbarMenu,
} from './fixtures';

const MOD_ID = 'msm_sample_mod';
const SCRIPT_ID = `${MOD_ID}:glow`;

let base: string | undefined;
const launches: LaunchedApp[] = [];

test.afterEach(async () => {
  for (const launched of launches.splice(0)) await launched.close();
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

/** The current target's Fabric toolchain, read from the target rather than written here. */
function fabricFacts(): { loader: string; loom: string; api: string; gradle: string } {
  // New projects use the default (newest release) target.
  const bundle = targetById(defaultTargetId);
  if (bundle === undefined) throw new Error('No default target.');
  const fabric = bundle.target.fabric;
  if (fabric === undefined) throw new Error('The built-in target has no Fabric facts.');
  return fabric;
}

/** `key=value` lines of a properties file. */
function properties(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const match = /^([A-Za-z0-9_.-]+)=(.*)$/.exec(line);
    if (match?.[1] !== undefined) out[match[1]] = match[2] ?? '';
  }
  return out;
}

/** The status toast's text. */
function toast(window: Page): Locator {
  return window.getByTestId('status-toast-text');
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
  await openAddDialog(window);
  const dialog = window.getByTestId('new-element-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('new-element-filter').fill(filter);
  await dialog.getByTestId(`template-${templateId}`).check();
  await expect(dialog.getByTestId('new-element-namespace')).toHaveValue(MOD_ID);
  await dialog.getByTestId('new-element-name').fill(name);
  await dialog.getByTestId('new-element-dialog-submit').click();
  await expect(dialog).toBeHidden();
}

/** Opens "Export Java project" from the palette and returns the dialog. */
async function openJavaProjectDialog(window: Page): Promise<Locator> {
  const palette = await openPalette(window, 'java project');
  const command = palette.getByTestId('command-exportJavaProject');
  await expect(command).toHaveText(/Export Java project…/);
  await command.click();
  await expect(palette).toBeHidden();
  const dialog = window.getByTestId('java-project-dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

test('eject: sample mod to a Fabric Java project, tree checked, second export blocked', async () => {
  base = mkdtempSync(join(tmpdir(), 'msm-eject-'));
  const folders = {
    projectDir: join(base, MOD_ID),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  cpSync(join(appDir, '..', 'fixtures', 'sample-mod'), folders.projectDir, { recursive: true });
  mkdirSync(outputDir, { recursive: true });

  const launched = await launchApp({ reuse: folders });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await toolbarMenu(window, 'toolbar-open-project');
  await expect(window.getByTestId(`element-row-${MOD_ID}:ruby_ore`)).toBeVisible();

  // One script, which the Java project leaves out. ------------------------------------------
  await openAddDialog(window);
  const newElement = window.getByTestId('new-element-dialog');
  await expect(newElement).toBeVisible();
  await newElement.getByTestId('new-element-filter').fill('block interaction');
  await newElement.getByTestId('template-msm_script_block_interaction').check();
  await expect(newElement.getByTestId('new-element-namespace')).toHaveValue(MOD_ID);
  await newElement.getByTestId('new-element-name').fill('glow');
  await newElement.getByTestId('new-element-dialog-submit').click();
  await expect(newElement).toBeHidden();
  await expect(window.getByTestId(`element-row-${SCRIPT_ID}`)).toBeVisible();

  // The Export menu offers the eject too.
  await openToolbarMenu(window, 'toolbar-export-menu');
  const menuItem = window.getByTestId('export-java-project');
  await expect(menuItem).toHaveText(/Fabric Java project \(eject\)…/);
  await expect(menuItem).not.toHaveAttribute('data-disabled', /.*/);
  await window.keyboard.press('Escape');
  await expect(menuItem).toBeHidden();

  // The dialog, then the folder from the e2e picker. ----------------------------------------
  let dialog = await openJavaProjectDialog(window);
  await expect(dialog.getByRole('heading', { name: 'Export Java project' })).toBeVisible();
  await expect(dialog.getByTestId('java-project-note')).toContainText(
    'It does not depend on msm_runtime.',
  );
  await expect(dialog.getByTestId('java-project-scripts-note')).toHaveText(
    `This script is not included in the Java project: ${SCRIPT_ID}.`,
  );
  const submit = dialog.getByTestId('java-project-dialog-submit');
  await expect(submit).toHaveText('Choose folder…');
  await submit.click();
  await expect(dialog).toBeHidden();

  const root = join(folders.outDir, MOD_ID);
  await expect(toast(window)).toContainText(`Java project written to ${root}`, {
    timeout: 30_000,
  });
  await expect(window.getByTestId('status-toast-action')).toHaveText('Reveal');

  // The tree. -------------------------------------------------------------------------------
  const read = (path: string): string => readFileSync(join(root, path), 'utf8');
  for (const path of [
    'build.gradle.kts',
    'settings.gradle.kts',
    'gradle.properties',
    'gradle/wrapper/gradle-wrapper.properties',
    'gradle/wrapper/gradle-wrapper.jar',
    'gradlew',
    'gradlew.bat',
    'README.md',
    'LICENSE-NOTES.md',
    'msm.export.json',
    `src/main/java/${MOD_ID}/MsmSampleMod.java`,
    `src/main/java/${MOD_ID}/ModBlocks.java`,
    `src/main/java/${MOD_ID}/ModItems.java`,
    `src/main/resources/assets/${MOD_ID}/lang/en_us.json`,
  ]) {
    expect(existsSync(join(root, path)), path).toBe(true);
  }
  // Scripts are left out entirely.
  expect(existsSync(join(root, 'src/main/resources/msm'))).toBe(false);

  expect(read('build.gradle.kts')).toContain('id("net.fabricmc.fabric-loom")');
  expect(read('settings.gradle.kts')).toContain(`rootProject.name = "${MOD_ID}"`);
  const fabric = fabricFacts();
  const gradleProperties = properties(read('gradle.properties'));
  expect(gradleProperties.loom_version).toBe(fabric.loom);
  expect(gradleProperties.loader_version).toBe(fabric.loader);
  expect(gradleProperties.fabric_api_version).toBe(fabric.api);
  expect(gradleProperties.archives_base_name).toBe(MOD_ID);
  expect(read('gradle/wrapper/gradle-wrapper.properties')).toContain(
    `gradle-${fabric.gradle}-bin.zip`,
  );
  if (process.platform !== 'win32') {
    expect(statSync(join(root, 'gradlew')).mode & 0o111).not.toBe(0);
  }

  const modBlocks = read(`src/main/java/${MOD_ID}/ModBlocks.java`);
  expect(modBlocks).toContain('package msm_sample_mod;');
  expect(modBlocks).toContain('"ruby_ore"');

  const modJson = JSON.parse(read('src/main/resources/fabric.mod.json')) as {
    id?: string;
    depends?: Record<string, string>;
    entrypoints?: { main?: string[] };
  };
  expect(modJson.id).toBe(MOD_ID);
  expect(Object.keys(modJson.depends ?? {})).not.toContain('msm_runtime');
  expect(Object.keys(modJson.depends ?? {})).toContain('fabric-api');
  expect(modJson.entrypoints?.main).toEqual([`${MOD_ID}.MsmSampleMod`]);

  const readme = read('README.md');
  expect(readme).toContain('./gradlew build');
  expect(readme).toContain('JDK 25');
  expect(readme).toContain('## Scripts');
  expect(readme).toContain('Scripts are not ejected');
  expect(readme).toContain(`- \`${SCRIPT_ID}\``);

  await window.screenshot({ path: join(outputDir, 'eject-path.png') });

  // A second export into the same folder is blocked. ----------------------------------------
  dialog = await openJavaProjectDialog(window);
  await dialog.getByTestId('java-project-dialog-submit').click();
  await expect(dialog).toBeHidden();
  await expect(toast(window)).toContainText(`The folder ${root} already exists and is not empty.`, {
    timeout: 30_000,
  });
  // The first project is untouched.
  expect(read('README.md')).toBe(readme);
});

test('eject: a status effect and a throwable give ModEffects and ThrownItemEntity', async () => {
  base = mkdtempSync(join(tmpdir(), 'msm-eject-effects-'));
  const folders = {
    projectDir: join(base, MOD_ID),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  cpSync(join(appDir, '..', 'fixtures', 'sample-mod'), folders.projectDir, { recursive: true });
  const launched = await launchApp({ reuse: folders });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await toolbarMenu(window, 'toolbar-open-project');
  await expect(window.getByTestId(`element-row-${MOD_ID}:ruby_ore`)).toBeVisible();

  await addFromTemplate(window, 'status effect', 'msm_effect_status', 'frost_step');
  await expect(window.getByTestId(`element-row-${MOD_ID}:frost_step`)).toBeVisible();
  await addFromTemplate(window, 'throwable', 'msm_item_throwable', 'snow_dart');
  await expect(window.getByTestId(`element-row-${MOD_ID}:snow_dart`)).toBeVisible();

  const dialog = await openJavaProjectDialog(window);
  await dialog.getByTestId('java-project-dialog-submit').click();
  await expect(dialog).toBeHidden();
  const root = join(folders.outDir, MOD_ID);
  await expect(toast(window)).toContainText(`Java project written to ${root}`, {
    timeout: 30_000,
  });

  const javaFiles = (readdirSync(join(root, 'src/main/java'), { recursive: true }) as string[])
    .map((path) => path.replaceAll('\\', '/'))
    .filter((path) => path.endsWith('.java'));
  const named = (name: string): string => {
    const found = javaFiles.filter((path) => path.split('/').pop() === name);
    expect(found, name).toHaveLength(1);
    return readFileSync(join(root, 'src/main/java', found[0] as string), 'utf8');
  };
  expect(named('ModEffects.java')).toContain('frost_step');
  expect(named('ThrownItemEntity.java')).toContain('class ThrownItemEntity');
});

/** The sample villagers' pedlar, whose model, animations and pictures the trader borrows. */
const VILLAGERS = join(appDir, '..', 'fixtures', 'sample-villagers-and-fluids');

/** Copies the pedlar's model, animations, picture and spawn egg picture under `path`'s ids. */
function seedMobFiles(projectDir: string, path: string): void {
  const from = (rel: string) => join(VILLAGERS, rel);
  const content = join(projectDir, 'content', MOD_ID);
  const definition = (rel: string, fromId: string, toId: string) => {
    const text = readFileSync(from(`content/msm_sample_villagers/${rel}`), 'utf8');
    expect(text).toContain(`"${fromId}"`);
    const target = join(content, rel.replace('pedlar', path));
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, text.replace(`"${fromId}"`, `"${toId}"`));
  };
  definition(
    'geo_model/entity/pedlar.json',
    'msm_sample_villagers:entity/pedlar',
    `${MOD_ID}:entity/${path}`,
  );
  definition(
    'animation/entity/pedlar_animations.json',
    'msm_sample_villagers:entity/pedlar_animations',
    `${MOD_ID}:entity/${path}_animations`,
  );
  const textures = join(projectDir, 'assets', MOD_ID, 'textures');
  mkdirSync(join(textures, 'entity'), { recursive: true });
  mkdirSync(join(textures, 'item'), { recursive: true });
  copyFileSync(
    from('assets/msm_sample_villagers/textures/entity/pedlar.png'),
    join(textures, 'entity', `${path}.png`),
  );
  copyFileSync(
    from('assets/msm_sample_villagers/textures/item/pedlar_spawn_egg.png'),
    join(textures, 'item', `${path}_spawn_egg.png`),
  );
}

test('eject: a trader and a fluid are ejected with no not-in-eject warning (eject 2c)', async () => {
  base = mkdtempSync(join(tmpdir(), 'msm-eject-traders-'));
  const folders = {
    projectDir: join(base, MOD_ID),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  cpSync(join(appDir, '..', 'fixtures', 'sample-mod'), folders.projectDir, { recursive: true });
  seedMobFiles(folders.projectDir, 'fair_trader');
  mkdirSync(outputDir, { recursive: true });
  const launched = await launchApp({ reuse: folders });
  launches.push(launched);
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await toolbarMenu(window, 'toolbar-open-project');
  await expect(window.getByTestId(`element-row-${MOD_ID}:ruby_ore`)).toBeVisible();

  await addFromTemplate(window, 'remembers', 'msm_entity_fair_trader', 'fair_trader');
  await expect(window.getByTestId(`element-row-${MOD_ID}:fair_trader`)).toBeVisible();
  await addFromTemplate(window, 'water-like', 'msm_fluid_water_like', 'swamp_water');
  await expect(window.getByTestId(`element-row-${MOD_ID}:swamp_water`)).toBeVisible();

  const dialog = await openJavaProjectDialog(window);
  await dialog.getByTestId('java-project-dialog-submit').click();
  await expect(dialog).toBeHidden();
  const root = join(folders.outDir, MOD_ID);
  await expect(toast(window)).toContainText(`Java project written to ${root}`, {
    timeout: 30_000,
  });

  const javaFiles = (readdirSync(join(root, 'src/main/java'), { recursive: true }) as string[])
    .map((path) => path.replaceAll('\\', '/'))
    .filter((path) => path.endsWith('.java'));
  const named = (name: string): string => {
    const found = javaFiles.filter((path) => path.split('/').pop() === name);
    expect(found, name).toHaveLength(1);
    return readFileSync(join(root, 'src/main/java', found[0] as string), 'utf8');
  };
  // The trader's levels, reputation, demand and work site, and the fluid.
  expect(named('MobTrader.java')).toContain('class MobTrader');
  expect(named('TraderReputation.java')).toContain('class TraderReputation');
  expect(named('ModFluids.java')).toContain('swamp_water');
  expect(javaFiles.join('\n')).toMatch(/FairTrader\w*\.java/);

  // The export names nothing as left out of the eject: no warning in the toast, and no
  // `export.not-in-eject` (nor any other export problem) under Problems.
  await expect(toast(window)).not.toContainText('warning');
  await openDockTab(window, 'problems');
  await expect(window.getByTestId('problems-panel')).toBeVisible();
  await expect(window.locator('[data-code="export.not-in-eject"]')).toHaveCount(0);
  await expect(window.getByTestId('export-problems')).toHaveCount(0);
  await window.screenshot({ path: join(outputDir, 'eject-path-trader-fluid.png') });
});
