/**
 * The games path of the game modes batch (ADR 0117; plan briefs B548 stub, B560 fills it). A
 * brand-new install (`MSM_E2E_NEW_INSTALL`) opens Home in Very easy; "Start a new mod" makes the
 * mod by name. Try it runs under SwiftShader WebGL.
 *
 * 1. Very easy: the tile "Make a game" offers the eight game picks; "Skyblock" with its defaults
 *    makes the world setup Sky Survival, its island, chest loot, trades, recipes and goals, and
 *    Things to fix has nothing to fix.
 * 2. Try it (F6), "Change ground…" to "Empty sky": the panel says the start island floats in the
 *    middle; the ground is `void`, the island's blocks are in the area, the player stands on its
 *    grass at the setup's spawn, and "Your game" shows Survival (the setup's game mode).
 * 3. "Make a game" > "Arena game" with its defaults: two teams, the points objective, the round
 *    timer, the arena area, its building and the start and round end functions as project files;
 *    Things to fix still has nothing to fix. Try it on "One of my buildings" with the arena shows
 *    the area ("you are in it") with Rebuild now and the team picker.
 * 4. The data pack export holds the games' lowered files: the world type and its preset, the
 *    island's start, the teams, the objective, the timer and the area's reset.
 *
 * Test ids come from B557 (the Creator cards `creator-flow-<id>`, the tile `home-tile-game`) and
 * B558 (`tryit-ground-void`, `tryit-ground-structure`, `tryit-void`, `tryit-structure-building`,
 * `tryit-games*`).
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { expect, type Locator, type Page, test } from 'playwright/test';
import { type LaunchedApp, launchApp, outputDir } from './fixtures';

const MOD_NAME = 'Sky Games';
const WEBGL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] as const;

/** The game picks of "Make a game", in Home's order (`MAKE_GAME_PICKS`). */
const GAME_PICKS = [
  ['skyblock', 'Skyblock'],
  ['one-block', 'One block'],
  ['sky-islands', 'Sky islands'],
  ['lucky-block', 'Lucky block'],
  ['adventure-map', 'Adventure map'],
  ['arena-game', 'Arena game'],
  ['race', 'Race'],
  ['goals', 'Goals'],
] as const;

let base: string | undefined;
let launched: LaunchedApp | undefined;
const savedEnv: Record<string, string | undefined> = {};

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (base !== undefined) rmSync(base, { recursive: true, force: true });
  base = undefined;
});

/** Things to fix shows nothing to fix and no tips (warnings and info included). */
async function expectNothingToFix(window: Page): Promise<void> {
  await window.getByTestId('toolbar-home').click();
  const fix = window.getByTestId('things-to-fix');
  await expect(fix.getByTestId('things-to-fix-none')).toBeVisible({ timeout: 30_000 });
  await expect(fix.getByTestId('things-to-fix-tips')).toHaveCount(0);
}

/** Runs the game flow `flowId` from Home's "Make a game" tile with its defaults. */
async function makeGame(window: Page, flowId: string, label: string): Promise<void> {
  await window.getByTestId('toolbar-home').click();
  await window.getByTestId('home').getByTestId('home-tile-game').click();
  const creator = window.getByTestId('creator-dialog');
  await expect(creator).toBeVisible();
  for (const [id, words] of GAME_PICKS) {
    await expect(creator.getByTestId(`creator-flow-${id}`)).toContainText(words);
  }
  const card = creator.getByTestId(`creator-flow-${flowId}`);
  await expect(card).toContainText(label);
  await card.click();
  const create = creator.getByTestId('creator-create');
  await expect(create).toBeEnabled({ timeout: 30_000 });
  await create.click();
  await expect(creator).toBeHidden({ timeout: 60_000 });
}

/** The `data` of a saved element file. */
function savedData<T = Record<string, unknown>>(
  projectDir: string,
  ns: string,
  folder: string,
  path: string,
): T {
  const file = join(projectDir, 'content', ns, folder, `${path}.json`);
  return (JSON.parse(readFileSync(file, 'utf8')) as { data: T }).data;
}

/** Element paths saved under `content/<ns>/<folder>/`, without `.json`, sorted. */
function savedPaths(projectDir: string, ns: string, folder: string): string[] {
  const dir = join(projectDir, 'content', ns, folder);
  if (!existsSync(dir)) return [];
  return (readdirSync(dir, { recursive: true }) as string[])
    .map((entry) => entry.split('\\').join('/'))
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => entry.slice(0, -'.json'.length))
    .sort();
}

/** Opens Try it (F6) and closes the first-run card. */
async function openTryIt(window: Page): Promise<{ view: Locator; state: Locator }> {
  if (!(await window.getByTestId('tryit-view').isVisible())) await window.keyboard.press('F6');
  const view = window.getByTestId('tryit-view');
  await expect(view).toBeVisible();
  const state = window.getByTestId('tryit-state');
  await expect(state).toHaveAttribute('data-blocks', /\d+/);
  const card = window.getByTestId('tryit-card');
  if (await card.isVisible()) await window.getByTestId('tryit-card-close').click();
  return { view, state };
}

/** "Change ground…", picks `kind` (and confirms replacing the area when asked). */
async function changeGround(
  window: Page,
  kind: 'void' | 'structure',
  choose?: (grounds: Locator) => Promise<void>,
): Promise<void> {
  await window.getByTestId('tryit-ground-change').click();
  const grounds = window.getByTestId('tryit-grounds');
  await expect(grounds).toBeVisible();
  await grounds.getByTestId(`tryit-ground-${kind}`).click();
  if (choose !== undefined) await choose(grounds);
  await grounds.getByTestId('tryit-ground-apply').click();
  const confirm = grounds.getByTestId('tryit-ground-confirm-yes');
  await expect
    .poll(async () => (await confirm.isVisible()) || !(await grounds.isVisible()), {
      timeout: 30_000,
    })
    .toBe(true);
  if (await confirm.isVisible()) await confirm.click();
  await expect(grounds).toBeHidden({ timeout: 30_000 });
}

/** Saves the project with the keyboard (Very easy's toolbar has no Save button). */
async function save(window: Page): Promise<void> {
  const footer = window.locator('footer');
  await window.locator('body').press('ControlOrMeta+S');
  await expect(footer.getByText('Saved', { exact: true })).toBeVisible();
}

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

/** Exports the vanilla data pack through the command palette and reads it. */
async function exportDataPack(window: Page, outDir: string): Promise<Record<string, Uint8Array>> {
  for (const entry of readdirSync(outDir)) rmSync(join(outDir, entry), { force: true });
  await window.keyboard.press('ControlOrMeta+Shift+P');
  const palette = window.getByTestId('command-palette');
  await expect(palette).toBeVisible();
  await palette.getByTestId('command-palette-input').fill('data pack zip');
  await palette.getByTestId('command-exportDataPack').click();
  await expect(palette).toBeHidden();
  let name = '';
  await expect
    .poll(
      () => {
        name = readdirSync(outDir).find((entry) => entry.endsWith('.zip')) ?? '';
        return name !== '' && isCompleteZip(join(outDir, name));
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  return readZip(join(outDir, name));
}

function zipText(files: Record<string, Uint8Array>, path: string): string {
  const bytes = files[path];
  if (bytes === undefined) throw new Error(`${path} is missing from the export.`);
  return strFromU8(bytes);
}

test('games: Skyblock from Make a game, Try it on Empty sky, an arena game and its files', async () => {
  test.setTimeout(300_000);
  base = mkdtempSync(join(tmpdir(), 'msm-games-'));
  const folders = {
    projectDir: join(base, 'picked'),
    outDir: join(base, 'out'),
    msmHome: join(base, 'msm-home'),
  };
  mkdirSync(outputDir, { recursive: true });
  savedEnv.MSM_E2E_NEW_INSTALL = process.env.MSM_E2E_NEW_INSTALL;
  process.env.MSM_E2E_NEW_INSTALL = '1';

  launched = await launchApp({ reuse: folders, args: WEBGL_ARGS });
  const { window } = launched;
  await window.waitForLoadState('domcontentloaded');
  const welcome = window.getByTestId('welcome-dialog');
  await expect(welcome).toBeVisible();
  await welcome.getByRole('button', { name: 'Got it' }).click();
  await expect(welcome).toBeHidden();
  const home = window.getByTestId('home');
  await expect(home).toBeVisible();

  await home.getByTestId('home-new').click();
  const newMod = window.getByTestId('new-mod-dialog');
  await newMod.getByTestId('new-mod-name').fill(MOD_NAME);
  await newMod.getByTestId('new-mod-dialog-submit').click();
  await expect(newMod).toBeHidden();
  const projectDir = join(folders.msmHome, 'Documents', 'MCSuperMods', MOD_NAME);
  await expect.poll(() => existsSync(join(projectDir, 'msm.project.json'))).toBe(true);
  const manifest = JSON.parse(readFileSync(join(projectDir, 'msm.project.json'), 'utf8')) as {
    namespaces: string[];
  };
  const ns = manifest.namespaces[0] ?? '';
  expect(ns).not.toBe('');

  // 1. Skyblock from "Make a game". -------------------------------------------------------------
  await makeGame(window, 'skyblock', 'Skyblock');
  await expectNothingToFix(window);
  await save(window);
  const setup = savedData<{
    world: { type: string };
    game_mode: string;
    start: { structure: string; at: number[]; spawn: number[] };
  }>(projectDir, ns, 'world_setup', 'sky_survival');
  expect(setup.world.type).toBe('void');
  expect(setup.game_mode).toBe('survival');
  expect(setup.start.structure).toBe(`${ns}:sky_survival/island`);
  const island = savedData<{ size: number[]; palette: string[] }>(
    projectDir,
    ns,
    'structure',
    'sky_survival/island',
  );
  expect(island.palette.some((block) => block.startsWith('minecraft:chest'))).toBe(true);
  expect(savedPaths(projectDir, ns, 'loot_table')).toContain('sky_survival/start_chest');

  // 2. Try it on Empty sky: the island in the middle, the player on it. -------------------------
  const { view, state } = await openTryIt(window);
  await changeGround(window, 'void', async (grounds) => {
    await expect(grounds.getByTestId('tryit-void')).toContainText(
      'Your start island floats in the middle',
    );
  });
  await expect(state).toHaveAttribute('data-ground', 'void');
  await expect(window.getByTestId('tryit-ground-current')).toHaveText('Empty sky');
  const games = window.getByTestId('tryit-games');
  await expect(games).toBeVisible({ timeout: 30_000 });
  // The mock first join: the setup's game mode, the player at the spawn on the island's grass.
  await expect(games.getByTestId('tryit-games-mode')).toHaveValue('survival', { timeout: 30_000 });
  const [sizeX, sizeY, sizeZ] = island.size as [number, number, number];
  const [spawnX, spawnY, spawnZ] = setup.start.spawn as [number, number, number];
  // The island stands centred in the 48-wide area, 8 blocks up (`voidGround`).
  const cornerX = Math.floor((48 - sizeX) / 2);
  const cornerZ = Math.floor((48 - sizeZ) / 2);
  const cornerY = Math.max(0, Math.min(8, 32 - sizeY - 2));
  const at = (n: number): string => n.toFixed(2);
  await expect(state).toHaveAttribute(
    'data-position',
    `${at(cornerX + spawnX + 0.5)} ${at(cornerY + spawnY)} ${at(cornerZ + spawnZ + 0.5)}`,
    { timeout: 30_000 },
  );
  await expect(state).toHaveAttribute(
    'data-last-log',
    new RegExp(`function ${ns}:msm_games/world_setup/first_join`),
  );
  expect(Number(await state.getAttribute('data-blocks'))).toBeGreaterThan(20);
  await view.screenshot({ path: join(outputDir, 'games-path-skyblock.png') });
  await window.keyboard.press('F6');
  await expect(view).toBeHidden();

  // 3. An arena game: its files, then Try it on its building. ------------------------------------
  await makeGame(window, 'arena-game', 'Arena game');
  await expectNothingToFix(window);
  await save(window);
  expect(savedPaths(projectDir, ns, 'team').length).toBeGreaterThanOrEqual(2);
  const teams = savedPaths(projectDir, ns, 'team');
  expect(savedPaths(projectDir, ns, 'objective')).toHaveLength(1);
  expect(savedPaths(projectDir, ns, 'timer')).toHaveLength(1);
  const areas = savedPaths(projectDir, ns, 'area');
  expect(areas).toHaveLength(1);
  const functions = savedPaths(projectDir, ns, 'function');
  const arena = areas[0] ?? '';
  const folder = arena.split('/')[0] ?? '';
  expect(functions).toEqual(expect.arrayContaining([`${folder}/start`, `${folder}/round_end`]));
  const area = savedData<{ reset?: { structures?: { structure: string }[] } }>(
    projectDir,
    ns,
    'area',
    arena,
  );
  const building = area.reset?.structures?.[0]?.structure ?? '';
  expect(building).toMatch(new RegExp(`^${ns}:`));
  expect(savedPaths(projectDir, ns, 'structure')).toContain(building.slice(ns.length + 1));
  const timer = savedPaths(projectDir, ns, 'timer')[0] ?? '';
  const objective = savedPaths(projectDir, ns, 'objective')[0] ?? '';

  await openTryIt(window);
  await changeGround(window, 'structure', async (grounds) => {
    const pick = grounds.locator(`[data-testid="tryit-structure-building"][data-id="${building}"]`);
    await pick.check();
    await expect(pick).toBeChecked();
  });
  await expect(state).toHaveAttribute('data-ground', 'structure');
  const areaRow = games.getByTestId('tryit-games-area');
  await expect(areaRow).toHaveCount(1);
  await expect(areaRow.getByTestId('tryit-games-rebuild')).toBeVisible();
  const teamPicker = games.getByTestId('tryit-games-team');
  await expect(teamPicker.locator('option')).toHaveCount(teams.length + 1);
  await teamPicker.selectOption({ index: 1 });
  await expect(games.getByTestId('tryit-games-name')).toContainText('Player');
  await areaRow.getByTestId('tryit-games-rebuild').click();
  await view.screenshot({ path: join(outputDir, 'games-path-arena.png') });
  await window.keyboard.press('F6');
  await expect(view).toBeHidden();

  // 4. The data pack holds the lowered games. ------------------------------------------------------
  const files = await exportDataPack(window, folders.outDir);
  const names = Object.keys(files);
  expect(names.some((name) => name.startsWith('assets/'))).toBe(false);
  // Skyblock: the World Type (its preset listed beside vanilla's), the island, the first join.
  expect(names).toContain(`data/${ns}/worldgen/world_preset/sky_survival.json`);
  expect(zipText(files, 'data/minecraft/tags/worldgen/world_preset/normal.json')).toContain(
    `${ns}:sky_survival`,
  );
  expect(names).toContain(`data/${ns}/structure/sky_survival/island.nbt`);
  expect(names).toContain(`data/${ns}/advancement/msm_games/first_join.json`);
  expect(zipText(files, `data/${ns}/function/msm_games/world_setup/start.mcfunction`)).toContain(
    `${ns}:sky_survival/island`,
  );
  // The arena: teams, the objective, the timer, the area and its building.
  const dotted = (path: string): string => `${ns}.${path.split('/').join('.')}`;
  for (const team of teams) {
    expect(zipText(files, `data/${ns}/function/msm_games/team/${team}/load.mcfunction`)).toContain(
      `team add ${dotted(team)}`,
    );
  }
  expect(
    zipText(files, `data/${ns}/function/msm_games/objective/${objective}/load.mcfunction`),
  ).toContain(`scoreboard objectives add ${dotted(objective)}`);
  expect(names).toContain(`data/${ns}/function/msm_games/timer/${timer}/start.mcfunction`);
  expect(names).toContain(`data/${ns}/predicate/msm_games/area/${arena}.json`);
  expect(zipText(files, `data/${ns}/function/msm_games/area/${arena}/reset.mcfunction`)).toContain(
    building,
  );
  expect(names).toContain(`data/${ns}/structure/${building.slice(ns.length + 1)}.nbt`);
  expect(zipText(files, `data/${ns}/function/${folder}/start.mcfunction`)).toContain(
    `${ns}:msm_games/area/${arena}/reset`,
  );
});
