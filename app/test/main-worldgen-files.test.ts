import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodeInstallFileSystem } from '@msm/interop/node';
import type { WorldgenFileMap } from '@msm/terrain';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocationResolver } from '../src/main/platform/locations';
import { createMinecraftService, type MinecraftService } from '../src/main/platform/minecraft';
import { createSettingsStore, resolveMsmHome } from '../src/main/platform/settings';
import { InvokeChannels, ipcContract } from '../src/shared/ipc-contract';
import type { ResolvedBiomeListsView } from '../src/shared/platform';

/** A made-up version id and folder list: no real target's, and no Mojang file. */
const VERSION = '9.9-msm-test';
const FOLDERS = ['made_up/stone_rules', 'made_up/hills', 'tags/made_up/hills'];

const json = (value: unknown) => strToU8(JSON.stringify(value));

/** A synthetic jar with preview assets, files in the made-up folders and files outside them. */
function worldgenJar(marker = 'msm-test-marker'): Uint8Array {
  return zipSync({
    'assets/minecraft/lang/en_us.json': json({ 'block.minecraft.a': 'A' }),
    'data/minecraft/made_up/hills/rolling.json': json({ marker, height: 3 }),
    'data/minecraft/made_up/hills/far/steep.json': json({ marker, height: 9 }),
    'data/minecraft/made_up/stone_rules/plain.json': json({ type: 'minecraft:block' }),
    'data/minecraft/tags/made_up/hills/all.json': json({ values: ['minecraft:rolling'] }),
    'data/minecraft/made_up/hills/readme.txt': strToU8('not json'),
    'data/minecraft/recipe/stick.json': json({ type: 'minecraft:crafting_shaped' }),
  });
}

let temp: string;
let msmHome: string;
let minecraftDir: string;
let folders: readonly string[] | null;
let lists: ResolvedBiomeListsView | null;
let service: MinecraftService;

function jarPath(id = VERSION): string {
  return join(minecraftDir, 'versions', id, `${id}.jar`);
}

async function installJar(jar: Uint8Array, id = VERSION): Promise<void> {
  await mkdir(join(minecraftDir, 'versions', id), { recursive: true });
  await writeFile(jarPath(id), jar);
}

function cacheDir(): string {
  return join(msmHome, 'cache', 'assets', VERSION);
}

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-main-worldgen-'));
  msmHome = resolveMsmHome({ MSM_HOME: join(temp, 'msm-home') }, join(temp, 'home'));
  minecraftDir = join(temp, 'minecraft');
  await mkdir(minecraftDir, { recursive: true });
  const installEnv = { platform: 'linux', home: join(temp, 'home') };
  const settings = createSettingsStore({ msmHome, installEnv });
  await settings.set({ minecraftDir });
  const fs = createNodeInstallFileSystem();
  folders = FOLDERS;
  lists = null;
  service = createMinecraftService({
    msmHome,
    fs,
    locations: createLocationResolver({ fs, env: installEnv, settings }),
    now: () => '2026-01-01T00:00:00.000Z',
    dataFoldersFor: (mcVersion) => (mcVersion === VERSION ? folders : null),
    resolvedBiomeLists: async () => lists,
  });
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

describe('vanilla worldgen files (ADR 0119 D4)', () => {
  it('extracts the target folders from a fake jar and serves them in one answer', async () => {
    expect(await service.readWorldgenFiles(VERSION)).toBeNull();
    await installJar(worldgenJar());
    const info = await service.extract(VERSION);
    expect(info.dataFolders).toEqual([...FOLDERS].sort());
    expect(info.fileCount).toBe(5);
    expect(info.jarPath).toBe(jarPath());

    const answer = await service.readWorldgenFiles(VERSION);
    expect(answer).toEqual({
      version: VERSION,
      files: {
        'made_up/hills': {
          'minecraft:far/steep': { marker: 'msm-test-marker', height: 9 },
          'minecraft:rolling': { marker: 'msm-test-marker', height: 3 },
        },
        'made_up/stone_rules': { 'minecraft:plain': { type: 'minecraft:block' } },
        'tags/made_up/hills': { 'minecraft:all': { values: ['minecraft:rolling'] } },
      },
      fileCount: 4,
      resolvedBiomeLists: null,
    });
    expect(ipcContract[InvokeChannels.minecraftWorldgenFiles].response.parse(answer)).toEqual(
      answer,
    );
    // The answer has the engine's shape.
    const engineFiles: WorldgenFileMap | undefined = answer?.files;
    expect(engineFiles?.['made_up/hills']).toBeDefined();
    // The files stay in the local cache, under <msmHome>/cache/.
    const cached = await readFile(
      join(cacheDir(), 'data', 'minecraft', 'made_up', 'hills', 'rolling.json'),
      'utf8',
    );
    expect(JSON.parse(cached)).toEqual({ marker: 'msm-test-marker', height: 3 });
    // Files outside the folders, or not JSON, are not kept.
    expect(await service.listAssets(VERSION, 'data/minecraft/recipe/')).toEqual([]);
    expect(await service.listAssets(VERSION, 'data/minecraft/made_up/hills/')).not.toContain(
      'data/minecraft/made_up/hills/readme.txt',
    );
  });

  it('passes the resolved biome lists on, and is null without the target fact', async () => {
    await installJar(worldgenJar());
    await service.extract(VERSION);
    lists = { 'minecraft:made_up': { biomes: [], points: [] } };
    expect((await service.readWorldgenFiles(VERSION))?.resolvedBiomeLists).toEqual(lists);
    expect(await service.readWorldgenFiles('9.8-other')).toBeNull();
    folders = null;
    expect(await service.readWorldgenFiles(VERSION)).toBeNull();
  });

  it('marks an older cache outdated while its jar is still there, else shows the banner', async () => {
    await installJar(worldgenJar());
    // A cache written before schema 4: no jar path recorded.
    await mkdir(cacheDir(), { recursive: true });
    await writeFile(
      join(cacheDir(), 'cache.json'),
      JSON.stringify({
        version: VERSION,
        jarSha1: 'old',
        fileCount: 1,
        extractedAt: '2025-01-01T00:00:00.000Z',
        schemaVersion: 3,
      }),
    );
    let status = await service.status(VERSION);
    expect(status.cache).toBeNull();
    expect(status.cacheOutdated).toBe(true);
    expect(ipcContract[InvokeChannels.minecraftStatus].response.parse(status)).toEqual(status);
    // The renderer extracts again by itself; then the cache is current.
    await service.extract(VERSION);
    status = await service.status(VERSION);
    expect(status.cache?.schemaVersion).toBe(6);
    expect(status.cacheOutdated).toBe(false);

    // The jar is gone: the old cache gives the banner, as before.
    await rm(join(minecraftDir, 'versions'), { recursive: true });
    await writeFile(
      join(cacheDir(), 'cache.json'),
      JSON.stringify({ version: VERSION, jarSha1: 'old', fileCount: 1, schemaVersion: 3 }),
    );
    status = await service.status(VERSION);
    expect(status.cache).toBeNull();
    expect(status.cacheOutdated).toBe(false);
  });

  it('treats a cache made for another folder list as outdated', async () => {
    await installJar(worldgenJar());
    await service.extract(VERSION);
    folders = [...FOLDERS, 'made_up/caves'];
    let status = await service.status(VERSION);
    expect(status.cache).toBeNull();
    expect(status.cacheOutdated).toBe(true);
    expect(await service.readWorldgenFiles(VERSION)).toBeNull();
    const info = await service.extract(VERSION);
    expect(info.dataFolders).toContain('made_up/caves');
    status = await service.status(VERSION);
    expect(status.cache).toEqual(info);
    expect(status.cacheOutdated).toBe(false);
  });

  it('does not count a recorded jar that is gone', async () => {
    await installJar(worldgenJar());
    await service.extract(VERSION);
    // The jar moved to another version folder: the version's own jar is gone.
    await rm(join(minecraftDir, 'versions'), { recursive: true });
    folders = [...FOLDERS, 'made_up/caves'];
    expect((await service.status(VERSION)).cacheOutdated).toBe(false);
  });
});
