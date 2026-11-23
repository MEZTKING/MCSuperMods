import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodeInstallFileSystem } from '@msm/interop/node';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocationResolver } from '../src/main/platform/locations';
import { createMinecraftService, type MinecraftService } from '../src/main/platform/minecraft';
import { createSettingsStore, resolveMsmHome } from '../src/main/platform/settings';
import { InvokeChannels, ipcContract } from '../src/shared/ipc-contract';
import { LIVE_VIEW_DATA_FOLDERS } from '../src/shared/platform';

/**
 * The live views' data folders in the jar cache (ADR 0120 D11, B603): extracted beside the world
 * generation folders, recorded in the cache, read in bulk by folder. A made-up version id and
 * made-up folder lists: no real target's, and no Mojang file.
 */
const VERSION = '9.9-msm-test';
const WORLDGEN = ['made_up/hills', 'tags/made_up_block'];
const LIVE = ['made_up_loot', 'made_up_advancement', 'tags/made_up_item'];

const json = (value: unknown) => strToU8(JSON.stringify(value));

function dataJar(marker = 'msm-live-marker'): Uint8Array {
  return zipSync({
    'assets/minecraft/lang/en_us.json': json({ 'block.minecraft.a': 'A' }),
    'data/minecraft/made_up/hills/rolling.json': json({ marker, height: 3 }),
    'data/minecraft/tags/made_up_block/rock.json': json({ values: ['minecraft:a'] }),
    'data/minecraft/made_up_loot/blocks/a.json': json({ marker, pools: [] }),
    'data/minecraft/made_up_loot/chests/far/b.json': json({ marker, pools: [{ rolls: 1 }] }),
    'data/minecraft/made_up_advancement/story/root.json': json({ marker, criteria: {} }),
    'data/minecraft/tags/made_up_item/logs.json': json({ values: ['#minecraft:oak_logs'] }),
    'data/minecraft/made_up_loot/notes.txt': strToU8('not json'),
    'data/minecraft/recipe/stick.json': json({ type: 'minecraft:crafting_shaped' }),
  });
}

let temp: string;
let msmHome: string;
let minecraftDir: string;
let worldgen: readonly string[] | null;
let live: readonly string[] | null;
let service: MinecraftService;

function cacheDir(): string {
  return join(msmHome, 'cache', 'assets', VERSION);
}

async function installJar(jar: Uint8Array): Promise<void> {
  await mkdir(join(minecraftDir, 'versions', VERSION), { recursive: true });
  await writeFile(join(minecraftDir, 'versions', VERSION, `${VERSION}.jar`), jar);
}

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-main-data-'));
  msmHome = resolveMsmHome({ MSM_HOME: join(temp, 'msm-home') }, join(temp, 'home'));
  minecraftDir = join(temp, 'minecraft');
  await mkdir(minecraftDir, { recursive: true });
  const installEnv = { platform: 'linux', home: join(temp, 'home') };
  const settings = createSettingsStore({ msmHome, installEnv });
  await settings.set({ minecraftDir });
  const fs = createNodeInstallFileSystem();
  worldgen = WORLDGEN;
  live = LIVE;
  service = createMinecraftService({
    msmHome,
    fs,
    locations: createLocationResolver({ fs, env: installEnv, settings }),
    now: () => '2026-01-01T00:00:00.000Z',
    dataFoldersFor: (mcVersion) => (mcVersion === VERSION ? worldgen : null),
    liveViewDataFoldersFor: (mcVersion) => (mcVersion === VERSION ? live : null),
  });
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

describe('vanilla data files for the live views (ADR 0120 D11)', () => {
  it('answers "not set up" for every folder without a jar or a cache', async () => {
    for (const folder of [...LIVE, ...WORLDGEN]) {
      expect(await service.readDataFiles(VERSION, [folder])).toBeNull();
    }
    expect(await service.readDataFiles(VERSION, LIVE)).toBeNull();
    await expect(service.extract(VERSION)).rejects.toThrow(/not installed/);
    expect(await service.readDataFiles(VERSION, LIVE)).toBeNull();
    expect((await service.status(VERSION)).cache).toBeNull();
  });

  it('extracts both lists, records them and reads folders in bulk', async () => {
    await installJar(dataJar());
    const info = await service.extract(VERSION);
    expect(info.schemaVersion).toBe(7);
    expect(info.dataFolders).toEqual([...WORLDGEN, ...LIVE].sort());
    expect(info.fileCount).toBe(7);

    const answer = await service.readDataFiles(VERSION, ['made_up_loot', 'tags/made_up_item']);
    expect(answer).toEqual({
      version: VERSION,
      folders: {
        made_up_loot: {
          'minecraft:blocks/a': { marker: 'msm-live-marker', pools: [] },
          'minecraft:chests/far/b': { marker: 'msm-live-marker', pools: [{ rolls: 1 }] },
        },
        'tags/made_up_item': { 'minecraft:logs': { values: ['#minecraft:oak_logs'] } },
      },
      fileCount: 3,
    });
    expect(ipcContract[InvokeChannels.minecraftDataFiles].response.parse(answer)).toEqual(answer);
    // The world generation folders are kept by the cache too, so a view may read block tags.
    expect((await service.readDataFiles(VERSION, ['tags/made_up_block']))?.fileCount).toBe(1);
    // The world generation answer still carries its own folders only.
    expect(Object.keys((await service.readWorldgenFiles(VERSION))?.files ?? {})).toEqual(
      [...WORLDGEN].sort(),
    );
    // The files stay in the local cache, under <msmHome>/cache/.
    const cached = await readFile(
      join(cacheDir(), 'data', 'minecraft', 'made_up_advancement', 'story', 'root.json'),
      'utf8',
    );
    expect(JSON.parse(cached)).toEqual({ marker: 'msm-live-marker', criteria: {} });
    expect(await service.listAssets(VERSION, 'data/minecraft/recipe/')).toEqual([]);
  });

  it('refuses a folder the cache does not keep', async () => {
    await installJar(dataJar());
    await service.extract(VERSION);
    await expect(service.readDataFiles(VERSION, ['recipe'])).rejects.toThrow(/cache keeps/);
    await expect(service.readDataFiles(VERSION, ['made_up_loot', '../x'])).rejects.toThrow();
    await expect(service.readDataFiles('9.8-other', ['made_up_loot'])).rejects.toThrow();
    expect(
      ipcContract[InvokeChannels.minecraftDataFiles].request.safeParse({
        mcVersion: VERSION,
        folders: ['../x'],
      }).success,
    ).toBe(false);
  });

  it('extracts a schema 4 cache again by itself while its jar is there', async () => {
    await installJar(dataJar());
    const jarPath = join(minecraftDir, 'versions', VERSION, `${VERSION}.jar`);
    await mkdir(cacheDir(), { recursive: true });
    await writeFile(
      join(cacheDir(), 'cache.json'),
      JSON.stringify({
        version: VERSION,
        jarSha1: 'old',
        jarPath,
        dataFolders: [...WORLDGEN],
        fileCount: 3,
        extractedAt: '2026-01-01T00:00:00.000Z',
        schemaVersion: 4,
      }),
    );
    let status = await service.status(VERSION);
    expect(status.cache).toBeNull();
    expect(status.cacheOutdated).toBe(true);
    expect(await service.readDataFiles(VERSION, LIVE)).toBeNull();
    await service.extract(VERSION);
    status = await service.status(VERSION);
    expect(status.cache?.schemaVersion).toBe(7);
    expect(status.cacheOutdated).toBe(false);
    expect((await service.readDataFiles(VERSION, LIVE))?.fileCount).toBe(4);
  });

  it('treats a cache made without the live views folders as outdated', async () => {
    await installJar(dataJar());
    live = null;
    await service.extract(VERSION);
    live = LIVE;
    const status = await service.status(VERSION);
    expect(status.cache).toBeNull();
    expect(status.cacheOutdated).toBe(true);
    expect(await service.readDataFiles(VERSION, LIVE)).toBeNull();
    expect((await service.extract(VERSION)).dataFolders).toEqual([...WORLDGEN, ...LIVE].sort());
  });
});

describe('LIVE_VIEW_DATA_FOLDERS', () => {
  it('names the spike B600 jar folders, sorted, as plain folder keys', () => {
    expect(LIVE_VIEW_DATA_FOLDERS).toHaveLength(25);
    expect([...LIVE_VIEW_DATA_FOLDERS]).toEqual([...LIVE_VIEW_DATA_FOLDERS].sort());
    for (const folder of LIVE_VIEW_DATA_FOLDERS) {
      expect(folder).toMatch(/^[a-z0-9_]+(?:\/[a-z0-9_]+)*$/);
      expect(
        ipcContract[InvokeChannels.minecraftDataFiles].request.safeParse({
          mcVersion: '26.3',
          folders: [folder],
        }).success,
      ).toBe(true);
    }
    // Neither jar has these (B600): they are not asked for.
    expect(LIVE_VIEW_DATA_FOLDERS).not.toContain('item_modifier');
    expect(LIVE_VIEW_DATA_FOLDERS).not.toContain('tags/function');
  });
});
