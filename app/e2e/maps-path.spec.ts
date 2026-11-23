/**
 * The maps path of the game modes batch (ADR 0116; plan briefs B548 stub, B560 fills it), against
 * the stub launcher of `play-path.spec.ts` (`assets/stub-launcher.mjs` in a fake Prism data
 * folder, a stand-in `msm_runtime` jar and a cached Fabric API jar: offline).
 *
 * A copy of the library's Skyblock starter (`examples/starters/skyblock`: a void world setup, data
 * only) is opened. Then:
 *
 * 1. Play > "Play my game": the stub gets a game request (`kind: "game"`, the world setup's World
 *    Type as the preset, survival, normal) for `msm-game-<ns>`, makes the world, and the chip reads
 *    "In my game" with the seed beside it.
 * 2. The test fills that world as the game would: a region file, player data, a `session.lock`,
 *    an old `level.dat`, the dev data pack, a data pack of the world's own and a structure block
 *    save (`generated/<ns>/structure/castle/tower.nbt`).
 * 3. File > Export > "Export as a map…": the managed instance's worlds are listed with the game's world
 *    first; exporting the world while the game is in it is refused. The game closes, and the map
 *    is saved as `<map>.zip`: the world under `<map>/` with the project's data pack in
 *    `datapacks/` beside the world's own, its resource pack as `resources.zip`, and no player
 *    data, dev pack, lock or old `level.dat`. With "Keep my player
 *    data" the players' files are in.
 * 4. File > "Bring in a building…" > "From my test worlds" lists the save; "Bring builds" makes it a
 *    structure element of the project.
 */

import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  cpSync,
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
import { appDir, type LaunchedApp, launchApp, outputDir, toast, toolbarMenu } from './fixtures';

/** The Skyblock starter's namespace and world setup. */
const NAMESPACE = 'msm_starter';
const SETUP_ID = `${NAMESPACE}:sky_survival`;
const GAME_WORLD = `msm-game-${NAMESPACE}`;
const MAP_NAME = 'Sky Map';
const SAVE_ID = `${NAMESPACE}:castle/tower`;

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
  kind?: string;
  preset?: string;
  gameMode?: string;
  difficulty?: string;
  seed?: string;
}

function stubLog(prismRoot: string): StubEvent[] {
  const path = join(prismRoot, 'stub-log.jsonl');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as StubEvent);
}

/** A fake Prism data folder with the stub as its program (see `play-path.spec.ts`). */
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

/** The game folder of the managed instance. */
function gameDirOf(prismRoot: string): string {
  return join(prismRoot, 'instances', `MCSuperMods Test (${targetFacts().mcVersion})`, 'minecraft');
}

/** Writes `files` (relative path to text or bytes) under `dir`. */
function writeTree(dir: string, files: Record<string, string | Uint8Array>): void {
  for (const [path, data] of Object.entries(files)) {
    const file = join(dir, path);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, data);
  }
}

/** Clicks File > `labels[0]` > `labels[1]`… in the application menu. */
async function fileMenu(launched: LaunchedApp, ...labels: string[]): Promise<void> {
  await launched.app.evaluate(({ Menu, BrowserWindow }, names) => {
    let items = Menu.getApplicationMenu()?.items.find((item) => item.label === 'File')?.submenu;
    let entry: Electron.MenuItem | undefined;
    for (const name of names) {
      entry = items?.items.find((item) => item.label === name);
      if (entry === undefined) throw new Error(`File has no entry ${names.join(' > ')}.`);
      items = entry.submenu;
    }
    entry?.click(undefined, BrowserWindow.getAllWindows()[0], undefined);
  }, labels);
}

function readZip(path: string): Record<string, Uint8Array> {
  return unzipSync(new Uint8Array(readFileSync(path)));
}

/** Opens File > Export > "Export as a map…", names the map and picks the game's world, then exports it. */
async function exportMap(
  launched: LaunchedApp,
  keepPlayerData: boolean,
): Promise<{ picker: ReturnType<Page['getByTestId']> }> {
  const { window } = launched;
  await fileMenu(launched, 'Export', 'Export as a map…');
  const dialog = window.getByTestId('export-map-dialog');
  await expect(dialog).toBeVisible();
  const source = dialog.getByTestId('export-map-source');
  await expect(source).toHaveValue('msm-play');
  await expect(source.locator('option[value="msm-play"]')).toContainText(
    '(Play and Play my game) · 1 world(s)',
  );
  await dialog.getByTestId('export-map-name').fill(MAP_NAME);
  const keep = dialog.getByTestId('export-map-keep-player-data');
  if (keepPlayerData) await keep.check();
  else await expect(keep).not.toBeChecked();
  await dialog.getByTestId('export-map-dialog-submit').click();
  const picker = window.getByTestId('world-picker');
  await expect(picker).toBeVisible();
  const row = picker.getByTestId(`world-row-${GAME_WORLD}`);
  await expect(row.locator('input[type="radio"]')).toBeChecked();
  await picker.getByTestId('world-picker-submit').click();
  return { picker };
}

/** The entries of the one map zip in `dir` once it is complete. */
async function mapEntries(dir: string): Promise<string[]> {
  const file = join(dir, `${MAP_NAME}.zip`);
  let names: string[] = [];
  await expect
    .poll(
      () => {
        try {
          names = Object.keys(readZip(file)).sort();
          return names.length > 0;
        } catch {
          return false;
        }
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  return names;
}

let base: string | undefined;
let prismRoot: string | undefined;
let launched: LaunchedApp | undefined;
const savedEnv: Record<string, string | undefined> = {};

/** Stops every stub still running (each also stops by itself after five minutes). */
function stopStubs(root: string): void {
  writeFileSync(join(root, 'stop'), '');
  for (const pid of new Set(stubLog(root).map((entry) => entry.pid))) {
    try {
      process.kill(pid);
    } catch {
      // Already gone.
    }
  }
}

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
  if (prismRoot !== undefined) stopStubs(prismRoot);
  prismRoot = undefined;
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

test('maps: Play my game, export the world as a map, bring a build in from it', async () => {
  test.setTimeout(240_000);
  base = mkdtempSync(join(tmpdir(), 'msm-maps-'));
  const folders = {
    projectDir: join(base, 'skyblock'),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  cpSync(join(appDir, '..', 'examples', 'starters', 'skyblock'), folders.projectDir, {
    recursive: true,
  });
  mkdirSync(outputDir, { recursive: true });
  const root = makePrismRoot(base);
  prismRoot = root;
  const env = { PRISMLAUNCHER_DATA_DIR: root, MSM_E2E_RUNTIME_DIR: makeRuntimeDir(base) };
  for (const [key, value] of Object.entries(env)) {
    savedEnv[key] = process.env[key];
    process.env[key] = value;
  }

  launched = await launchApp({ reuse: folders });
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  await seedFabricApi(launched);
  await toolbarMenu(window, 'toolbar-open-project');
  await expect(window.getByTestId(`element-row-${SETUP_ID}`)).toBeVisible({ timeout: 30_000 });

  // 1. Play my game. ---------------------------------------------------------------------------
  const chip = window.getByTestId('play-chip');
  const controls = window.getByTestId('play-controls');
  await expect(controls).toHaveAttribute('data-state', /not-running|no-prism/);
  await window.getByTestId('play-menu').click();
  const playGame = window.getByTestId('play-menu-play-game');
  await expect(playGame).toBeEnabled();
  await playGame.click();
  await expect(chip).toHaveAttribute('data-state', 'game-world', { timeout: 60_000 });
  await expect(chip).toHaveText('In my game');
  const plays = stubLog(root).filter((entry) => entry.event === 'play');
  expect(plays).toHaveLength(1);
  expect(plays[0]).toMatchObject({
    world: GAME_WORLD,
    kind: 'game',
    preset: SETUP_ID,
    gameMode: 'survival',
    difficulty: 'normal',
  });
  // The seed is a line of the Play menu (ADR 0131 D3).
  await window.getByTestId('play-menu').click();
  await expect(window.getByTestId('play-seed')).toHaveText(`Seed ${plays[0]?.seed}`);
  await window.keyboard.press('Escape');
  const worldDir = join(gameDirOf(root), 'saves', GAME_WORLD);
  expect(existsSync(join(worldDir, 'level.dat'))).toBe(true);

  // 2. The world as the game leaves it, with a structure block save. ---------------------------
  writeTree(worldDir, {
    'region/r.0.0.mca': new Uint8Array([1, 2, 3, 4]),
    'level.dat_old': new Uint8Array([0]),
    'session.lock': '☃',
    'players/data/00000000-0000-0000-0000-000000000001.dat': new Uint8Array([5]),
    'players/advancements/00000000-0000-0000-0000-000000000001.json': '{}\n',
    'players/stats/00000000-0000-0000-0000-000000000001.json': '{}\n',
    'datapacks/msm-dev/pack.mcmeta': '{}\n',
    'datapacks/own_pack.zip': zipSync({ 'pack.mcmeta': strToU8('{}\n') }),
    'generated/msm_starter/structure/castle/tower.nbt': readFileSync(
      join(appDir, 'e2e', 'assets', 'sample-piece.nbt'),
    ),
  });

  // 3. Export as a map: refused while the game is in the world, then saved. -------------------
  const first = await exportMap(launched, false);
  await expect(first.picker).toContainText('That world is open in the game.', { timeout: 30_000 });
  expect(readdirSync(folders.outDir)).toEqual([]);
  await first.picker.getByRole('button', { name: 'Cancel' }).click();
  await window.getByTestId('export-map-dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(window.getByTestId('export-map-dialog')).toBeHidden();
  // The game closes: its status stops coming, and the chip leaves "In my game" (it reads
  // "Starting…" until three minutes after the launch, `STARTING_WINDOW_MS`).
  stopStubs(root);
  await expect(controls).toHaveAttribute('data-state', /^(not-running|starting)$/, {
    timeout: 60_000,
  });
  await window.getByTestId('play-menu').click();
  await expect(window.getByTestId('play-menu-new-world')).toBeVisible();
  await expect(window.getByTestId('play-seed')).toHaveCount(0);
  await window.keyboard.press('Escape');

  const second = await exportMap(launched, false);
  await expect(second.picker).toBeHidden({ timeout: 30_000 });
  await expect(toast(window)).toContainText(
    `Saved the map as ${join(folders.outDir, MAP_NAME)}.zip`,
  );
  await expect(toast(window)).toContainText('Player data was left out.');
  const entries = await mapEntries(folders.outDir);
  const files = entries.filter((name) => !name.endsWith('/'));
  const packs = files.filter((name) => /^Sky Map\/datapacks\/[^/]+\.zip$/.test(name));
  expect(packs).toContain(`${MAP_NAME}/datapacks/own_pack.zip`);
  expect(packs).toHaveLength(2);
  const projectPack = packs.find((name) => name !== `${MAP_NAME}/datapacks/own_pack.zip`) ?? '';
  expect(files.sort()).toEqual(
    [
      `${MAP_NAME}/level.dat`,
      `${MAP_NAME}/region/r.0.0.mca`,
      `${MAP_NAME}/generated/msm_starter/structure/castle/tower.nbt`,
      `${MAP_NAME}/datapacks/own_pack.zip`,
      `${MAP_NAME}/resources.zip`,
      projectPack,
    ].sort(),
  );
  // The project's data pack (the World Type and the island) and its resource pack.
  const map = readZip(join(folders.outDir, `${MAP_NAME}.zip`));
  expect(Object.keys(unzipSync(map[`${MAP_NAME}/resources.zip`] ?? new Uint8Array()))).toContain(
    'pack.mcmeta',
  );
  const pack = unzipSync(map[projectPack] ?? new Uint8Array());
  expect(Object.keys(pack)).toEqual(
    expect.arrayContaining([
      'pack.mcmeta',
      `data/${NAMESPACE}/worldgen/world_preset/sky_survival.json`,
      `data/${NAMESPACE}/structure/sky_survival/island.nbt`,
    ]),
  );

  // "Keep my player data": the players' files are in, the lock and the dev pack still not.
  rmSync(join(folders.outDir, `${MAP_NAME}.zip`));
  const third = await exportMap(launched, true);
  await expect(third.picker).toBeHidden({ timeout: 30_000 });
  const kept = (await mapEntries(folders.outDir)).filter((name) => !name.endsWith('/'));
  expect(kept).toEqual(
    expect.arrayContaining([
      `${MAP_NAME}/players/data/00000000-0000-0000-0000-000000000001.dat`,
      `${MAP_NAME}/players/advancements/00000000-0000-0000-0000-000000000001.json`,
      `${MAP_NAME}/players/stats/00000000-0000-0000-0000-000000000001.json`,
    ]),
  );
  expect(kept.some((name) => name.endsWith('session.lock') || name.includes('msm-dev'))).toBe(
    false,
  );

  // 4. A build from the test world. ------------------------------------------------------------
  await fileMenu(launched, 'Bring in a building…');
  const importDialog = window.getByTestId('import-files-dialog');
  await expect(importDialog).toBeVisible();
  await importDialog.getByTestId('import-files-tab-test-worlds').click();
  // The project also has `minecraft` files (the wandering trader's tag), listed first.
  await importDialog.getByTestId('import-files-namespace').selectOption(NAMESPACE);
  const save = importDialog.getByTestId(`import-test-world-save-${GAME_WORLD}/${SAVE_ID}`);
  await expect(save).toBeVisible({ timeout: 30_000 });
  await save.check();
  await importDialog.getByTestId('import-files-dialog-submit').click();
  await expect(importDialog).toBeHidden({ timeout: 30_000 });
  await expect(toast(window)).toContainText(`Brought 1 build(s) into ${NAMESPACE}.`);
  await expect(window.getByTestId(`element-row-${NAMESPACE}:castle_tower`)).toBeVisible();
  await window.screenshot({ path: join(outputDir, 'maps-path.png') });
});
