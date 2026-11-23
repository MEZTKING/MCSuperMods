/**
 * One-click Play and Reload end to end (ADR 0084), against a stub launcher. The test makes a
 * fake Prism Launcher data folder (`PRISMLAUNCHER_DATA_DIR`) whose `prismlauncher` program is a
 * small Node script (`assets/stub-launcher.mjs`) that plays the runtime's part in the dev files:
 * it reads `play.json`, writes `status.json`, consumes `request.json` and, after a quit, writes
 * `handled` once and stops. A stand-in `msm_runtime` jar (`MSM_E2E_RUNTIME_DIR`) and a cached
 * Fabric API jar keep the run offline.
 *
 * Steps: a new project with an item; Play makes the managed instance, installs the jar and the
 * dev files and starts the "game", and the chip reads "In the test world"; a new function is a
 * data change that Reload sends in place (the stub handles a `reload` request and sees the
 * function in the world's dev data pack); a new block needs a restart (its loot and pictures
 * still reload in place, the chip reads "Restart needed" and the dialog gives the reason); Restart asks the game to quit, waits, installs and
 * starts it again, and the chip is back to "In the test world" with the block in the jar.
 */

import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
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
import { strToU8, unzipSync, zipSync } from 'fflate';
import { expect, type Page, test } from 'playwright/test';
import {
  appDir,
  type LaunchedApp,
  launchApp,
  newProjectInFolder,
  outputDir,
  toast,
} from './fixtures';

/** The project folder name; a new project's namespace is derived from it. */
const NAMESPACE = 'msm_play';
const ITEM_ID = `${NAMESPACE}:play_berry`;
const FUNCTION_ID = `${NAMESPACE}:hello`;
const BLOCK_ID = `${NAMESPACE}:play_lamp`;
const WORLD = `msm-test-${NAMESPACE}`;

/** The default target's facts, read rather than written here. */
function targetFacts(): { mcVersion: string; api: string } {
  const target = targetById(defaultTargetId)?.target;
  if (target?.fabric === undefined) throw new Error('The default target has no Fabric facts.');
  return { mcVersion: target.mcVersion, api: target.fabric.api };
}

/** What the stub logged, one object per line. */
interface StubEvent {
  event: string;
  pid: number;
  seq?: number;
  world?: string;
  action?: string;
  assets?: boolean;
  files?: string[];
  mods?: string[];
}

function stubLog(prismRoot: string): StubEvent[] {
  const path = join(prismRoot, 'stub-log.jsonl');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as StubEvent);
}

function eventsOf(prismRoot: string, event: string): StubEvent[] {
  return stubLog(prismRoot).filter((entry) => entry.event === event);
}

/**
 * A fake Prism data folder with the stub as its program. Returns the folder; the stub writes
 * its log there and stops when a `stop` file appears.
 */
function makePrismRoot(base: string): string {
  const root = join(base, 'prism');
  mkdirSync(join(root, 'instances'), { recursive: true });
  copyFileSync(join(appDir, 'e2e', 'assets', 'stub-launcher.mjs'), join(root, 'stub-launcher.mjs'));
  const program = join(root, 'prismlauncher');
  writeFileSync(
    program,
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(join(root, 'stub-launcher.mjs'))} "$@"\n`,
  );
  chmodSync(program, 0o755);
  return root;
}

/** A stand-in runtime jar for the default target, named as Gradle names it. */
function makeRuntimeDir(base: string): string {
  const dir = join(base, 'runtime');
  mkdirSync(dir, { recursive: true });
  const key = targetFacts().mcVersion.split('-')[0] as string;
  const version = `0.0.0-e2e+mc${key}`;
  const jar = zipSync({
    'fabric.mod.json': strToU8(JSON.stringify({ id: 'msm_runtime', schemaVersion: 1, version })),
  });
  writeFileSync(join(dir, `msm_runtime-${version}.jar`), jar);
  return dir;
}

/** Puts a stand-in Fabric API jar into the app's download cache, so Play never downloads. */
async function seedFabricApi(launched: LaunchedApp): Promise<void> {
  const userData = await launched.app.evaluate(({ app }) => app.getPath('userData'));
  const { api } = targetFacts();
  const dir = join(userData, 'downloads', 'fabric-api', api);
  mkdirSync(dir, { recursive: true });
  const jar = zipSync({
    'fabric.mod.json': strToU8(
      JSON.stringify({ id: 'fabric-api', schemaVersion: 1, version: api }),
    ),
  });
  writeFileSync(join(dir, `fabric-api-${api}.jar`), jar);
  writeFileSync(
    join(dir, `fabric-api-${api}.jar.sha512`),
    `${createHash('sha512').update(jar).digest('hex')}\n`,
  );
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

/** The game folder of the managed instance. */
function gameDirOf(prismRoot: string): string {
  return join(prismRoot, 'instances', `MCSuperMods Test (${targetFacts().mcVersion})`, 'minecraft');
}

/** The entry names in the installed content jar. */
function installedJarEntries(prismRoot: string): string[] {
  const mods = join(gameDirOf(prismRoot), 'mods');
  const jar = readdirSync(mods).find((name) => name.startsWith(NAMESPACE));
  if (jar === undefined) return [];
  return Object.keys(unzipSync(readFileSync(join(mods, jar))));
}

let base: string | undefined;
let prismRoot: string | undefined;
let launched: LaunchedApp | undefined;
const savedEnv: Record<string, string | undefined> = {};

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
  if (prismRoot !== undefined) {
    // Stop every stub still running (it also stops by itself after five minutes).
    writeFileSync(join(prismRoot, 'stop'), '');
    for (const pid of new Set(stubLog(prismRoot).map((entry) => entry.pid))) {
      try {
        process.kill(pid);
      } catch {
        // Already gone.
      }
    }
  }
  prismRoot = undefined;
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

test('play: Play, Reload a data change, Restart needed for a new block, Restart', async () => {
  test.setTimeout(180_000);
  base = mkdtempSync(join(tmpdir(), 'msm-play-'));
  const folders = {
    projectDir: join(base, NAMESPACE),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  mkdirSync(outputDir, { recursive: true });
  const root = makePrismRoot(base);
  prismRoot = root;
  const env = {
    PRISMLAUNCHER_DATA_DIR: root,
    MSM_E2E_RUNTIME_DIR: makeRuntimeDir(base),
  };
  for (const [key, value] of Object.entries(env)) {
    savedEnv[key] = process.env[key];
    process.env[key] = value;
  }

  launched = await launchApp({ reuse: folders });
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await seedFabricApi(launched);

  // A new project with one item. ---------------------------------------------------------------
  await newProjectInFolder(window);
  await expect(window.getByTestId(`element-row-${NAMESPACE}:pack`)).toBeVisible();
  await addFromTemplate(window, 'food', 'msm_item_food', 'play_berry');
  await expect(window.getByTestId(`element-row-${ITEM_ID}`)).toBeVisible();

  const chip = window.getByTestId('play-chip');
  const reload = window.getByTestId('play-reload');
  await expect(chip).toHaveAttribute('data-state', 'not-running');
  await expect(chip).toHaveText('Game not running');
  await expect(reload).toBeDisabled();

  // Play: the managed instance, the jar, the dev files, and the stub opens the test world. ---
  await window.getByTestId('play-button').click();
  await expect(toast(window)).toContainText('Made the test instance', { timeout: 30_000 });
  await expect(chip).toHaveAttribute('data-state', 'test-world', { timeout: 30_000 });
  await expect(chip).toHaveText('In the test world');
  await expect(reload).toBeEnabled();
  const gameDir = gameDirOf(root);
  const plays = eventsOf(root, 'play');
  expect(plays).toHaveLength(1);
  expect(plays[0]?.world).toBe(WORLD);
  expect(existsSync(join(gameDir, 'msm-dev', 'play.json'))).toBe(false);
  expect(JSON.parse(readFileSync(join(gameDir, 'msm-dev', 'dev.json'), 'utf8'))).toMatchObject({
    namespaces: [NAMESPACE],
    world: WORLD,
  });
  expect(readFileSync(join(gameDir, 'options.txt'), 'utf8')).toContain('file/msm-dev');
  const mods = readdirSync(join(gameDir, 'mods')).sort();
  expect(mods).toContain(`fabric-api-${targetFacts().api}.jar`);
  expect(mods.some((name) => name.startsWith(NAMESPACE))).toBe(true);
  expect(installedJarEntries(root)).toContain(`msm/${NAMESPACE}/item/play_berry.json`);

  // Reload with a data change: a new function goes to the world's dev data pack. -------------
  await addFromTemplate(window, 'function', 'function', 'hello');
  await expect(window.getByTestId(`element-row-${FUNCTION_ID}`)).toBeVisible();
  await reload.click();
  await expect(toast(window)).toContainText('Reloading 1 change in Minecraft.');
  await expect.poll(() => eventsOf(root, 'reload').length, { timeout: 15_000 }).toBe(1);
  const reloaded = eventsOf(root, 'reload')[0];
  expect(reloaded?.files).toContain(
    `saves/${WORLD}/datapacks/msm-dev/data/${NAMESPACE}/function/hello.mcfunction`,
  );
  // The stub reports the reload handled; the chip stays in the test world.
  await expect
    .poll(() => {
      const status = JSON.parse(readFileSync(join(gameDir, 'msm-dev', 'status.json'), 'utf8'));
      return status.handled?.seq;
    })
    .toBe(reloaded?.seq);
  await expect(chip).toHaveAttribute('data-state', 'test-world');
  await expect(chip).toHaveText('In the test world');

  // Reload with a new block: Restart needed, with the reason. ---------------------------------
  await addFromTemplate(window, 'simple block', 'msm_block_simple', 'play_lamp');
  await expect(window.getByTestId(`element-row-${BLOCK_ID}`)).toBeVisible();
  await reload.click();
  const dialog = window.getByTestId('play-restart-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('play-restart-reasons')).toContainText(
    'You added a new block: Play Lamp. New blocks are only read when Minecraft starts.',
  );
  await expect(chip).toHaveAttribute('data-state', 'restart-needed');
  await expect(chip).toHaveText('Restart needed');
  // The block's pictures, loot and tags reload in place; only its definition waits.
  await expect.poll(() => eventsOf(root, 'reload').length, { timeout: 15_000 }).toBe(2);
  const withBlock = eventsOf(root, 'reload')[1];
  expect(withBlock?.assets).toBe(true);
  expect(withBlock?.files).toContain(
    `saves/${WORLD}/datapacks/msm-dev/data/${NAMESPACE}/loot_table/blocks/play_lamp.json`,
  );
  expect(withBlock?.files?.some((file) => file.startsWith('msm-dev/overlay/'))).toBe(false);

  // Restart round trip: quit, wait, install, start again. --------------------------------------
  await dialog.getByTestId('play-restart-dialog-submit').click();
  await expect(dialog).toBeHidden();
  await expect(window.getByTestId('play-progress')).toContainText('Waiting for Minecraft to close');
  await expect.poll(() => eventsOf(root, 'quit').length, { timeout: 15_000 }).toBe(1);
  await expect(toast(window)).toContainText('Minecraft is starting again with your changes.', {
    timeout: 60_000,
  });
  await expect.poll(() => eventsOf(root, 'play').length, { timeout: 30_000 }).toBe(2);
  await expect(chip).toHaveAttribute('data-state', 'test-world', { timeout: 30_000 });
  await expect(chip).toHaveText('In the test world');
  const starts = eventsOf(root, 'start');
  expect(starts).toHaveLength(2);
  expect(starts[0]?.pid).not.toBe(starts[1]?.pid);
  const [quit] = eventsOf(root, 'quit');
  const replay = eventsOf(root, 'play')[1];
  expect(replay?.seq).toBeGreaterThan(quit?.seq ?? Number.POSITIVE_INFINITY);
  expect(installedJarEntries(root)).toContain(`msm/${NAMESPACE}/block/play_lamp.json`);
  // Nothing is left to reload: the new jar holds everything.
  await reload.click();
  await expect(toast(window)).toContainText(
    'Nothing to reload: Minecraft already has your latest changes.',
  );
  await window.screenshot({ path: join(outputDir, 'play-path.png') });
});
