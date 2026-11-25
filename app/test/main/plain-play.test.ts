import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, normalize, relative, sep } from 'node:path';
import type { InstallFileSystem, RecipeTargetFacts } from '@msm/interop';
import { createNodeInstallFileSystem } from '@msm/interop/node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInstancesService, type InstancesService } from '../../src/main/platform/instances';
import type { LocationResolver } from '../../src/main/platform/locations';
import {
  createMapExportService,
  MANAGED_MAP_SOURCE,
  type MapExportService,
} from '../../src/main/platform/map-export';
import {
  createPlainWorlds,
  NEEDS_MOD_MESSAGE,
  NO_GAME_WORLD_MESSAGE,
  PLAIN_WORLDS_DIR,
  plainWorldFolder,
} from '../../src/main/platform/plain-play';
import { createSettingsStore, type SettingsStore } from '../../src/main/platform/settings';
import { InvokeChannels, ipcContract } from '../../src/shared/ipc-contract';
import type { InstanceOpenMapRequest, InstancePlainRequest } from '../../src/shared/platform';
import { type FakeMmcRoot, makeMmcRoot } from '../helpers/fake-launchers';

/**
 * Play without mods and Open this map (ADR 0133 D6, B766): the game world copied out of a
 * made-up test instance by the map export's plan into the Plain instance of a made-up Prism
 * folder full of the user's own instances, then Prism started on it with `--world`.
 */

/** Made-up versions; tests never name a real Minecraft version. */
const VERSION = '9.9-msm-test';
const FACTS: RecipeTargetFacts = {
  mcVersion: VERSION,
  channel: 'release',
  java: 25,
  fabric: { loader: '0.20.1', api: '0.1.0+9.9' },
} as unknown as RecipeTargetFacts;
const PLAIN = `MCSuperMods Plain (${VERSION})`;
const GAME_WORLD = 'msm-game-sky';
const DATA_PACK = { fileName: 'sky.zip', data: new TextEncoder().encode('the data pack') };
const RESOURCE_PACK = new TextEncoder().encode('the resource pack');
const project = { namespace: 'sky', modId: null, playsWithoutMods: true };
const FOREIGN = Array.from({ length: 10 }, (_, i) => `Mine ${i}`);

let temp: string;
let prism: FakeMmcRoot;
let settings: SettingsStore;
let maps: MapExportService;
let service: InstancesService;
let msmHome: string;
let testGameDir: string;
let openWorld: string | null;
let writes: string[];
let spawned: { program: string; args: readonly string[] }[];

function recordingFs(): InstallFileSystem {
  const inner = createNodeInstallFileSystem({ rename: true });
  return {
    ...inner,
    async writeFile(path, data) {
      writes.push(normalize(path));
      return inner.writeFile(path, data);
    },
  };
}

/** A world as Play my game leaves it in the test instance. */
async function makeGameWorld(gameDir: string, folder: string): Promise<string> {
  const world = join(gameDir, 'saves', folder);
  const files: Record<string, string> = {
    'level.dat': 'level data',
    'level.dat_old': 'old level data',
    'session.lock': 'lock',
    'region/r.0.0.mca': 'region bytes',
    'data/raids.dat': 'raids',
    'datapacks/msm-dev/pack.mcmeta': '{"pack":{}}',
    'datapacks/msm-dev/data/sky/function/start.mcfunction': 'say dev',
    'datapacks/their-pack.zip': 'a pack of their own',
    'datapacks/sky.zip': 'an old copy of the data pack',
    'players/data/someone.dat': 'player',
    'players/advancements/someone.json': '{}',
  };
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(world, ...path.split('/').slice(0, -1)), { recursive: true });
    await writeFile(join(world, ...path.split('/')), text);
  }
  return world;
}

/** Every file below `dir` with its bytes, by relative path; folders too. */
async function snapshot(dir: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const walk = async (folder: string): Promise<void> => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) {
        out.set(`${relative(dir, path)}/`, '');
        await walk(path);
      } else out.set(relative(dir, path), (await readFile(path)).toString('base64'));
    }
  };
  await walk(dir);
  return out;
}

/** The files of a world copy, `/`-separated. */
async function filesOf(dir: string): Promise<string[]> {
  return [...(await snapshot(dir)).keys()]
    .filter((path) => !path.endsWith('/'))
    .map((path) => path.split(sep).join('/'))
    .sort();
}

/** MSM's Plain instance: the one folder beside the user's that holds MSM's marker. */
async function plainInstance(): Promise<string> {
  const names = await readdir(prism.instancesDir);
  const ours = names.filter((name) => name.startsWith(PLAIN) && name !== PLAIN);
  expect(ours).toHaveLength(1);
  return join(prism.instancesDir, ours[0] as string);
}

function plainRequest(overrides: Partial<InstancePlainRequest> = {}): InstancePlainRequest {
  return {
    targetId: 'mc-test',
    project,
    dataPack: DATA_PACK,
    resourcePack: RESOURCE_PACK,
    ...overrides,
  };
}

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-plain-play-'));
  writes = [];
  spawned = [];
  openWorld = null;
  prism = await makeMmcRoot(join(temp, 'prism'), {
    instances: [
      ...FOREIGN.map((folder, i) => ({
        folder,
        mcVersion: VERSION,
        loader: i % 3 === 0 ? { uid: 'net.fabricmc.fabric-loader', version: '0.1' } : null,
        worlds: [`World ${i}`],
      })),
      // A folder named like MSM's Plain instance, without MSM's marker: never touched.
      { folder: PLAIN, mcVersion: VERSION, worlds: [GAME_WORLD] },
    ],
  });
  await writeFile(join(prism.root, 'accounts.json'), '{"accounts":["secret"]}');
  await writeFile(join(prism.root, 'prismlauncher'), '#!/bin/sh\n');
  // The test instance Play made (outside the Prism folder here, as map export only needs its game folder).
  testGameDir = join(temp, 'test-instance', 'minecraft');
  await makeGameWorld(testGameDir, GAME_WORLD);
  await makeGameWorld(testGameDir, 'Castle');
  msmHome = join(temp, 'msm-home');
  settings = createSettingsStore({
    msmHome,
    installEnv: { platform: 'linux', home: join(temp, 'home') },
  });
  await settings.set({
    launchers: { prismDataDirs: [prism.root], multimcRoots: [], curseForgeRoots: [] },
  });
  const locations: Pick<LocationResolver, 'resolve'> = {
    resolve: async () =>
      ({ locations: [] }) as unknown as Awaited<ReturnType<LocationResolver['resolve']>>,
  };
  maps = createMapExportService({
    locations,
    managedGame: async () => ({ gameDir: testGameDir, openWorld }),
    saveFilePath: async () => null,
  });
  let ids = 0;
  service = createInstancesService({
    fs: recordingFs(),
    env: { platform: 'linux', home: join(temp, 'home') },
    settings,
    msmHome,
    cacheDir: join(temp, 'downloads'),
    download: async () => {
      throw new Error('No downloads in these tests.');
    },
    targetFacts: () => FACTS,
    spawnLauncher: async (program, args) => {
      spawned.push({ program, args });
    },
    sleep: async () => {},
    plainWorlds: createPlainWorlds({
      maps,
      msmHome,
      newId: () => {
        ids += 1;
        return `copy-${ids}`;
      },
    }),
  });
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

describe('Play without mods', () => {
  it('copies the game world with the data pack and without the dev pack, the lock or player data, then starts the Plain instance on it', async () => {
    const result = await service.playPlain(plainRequest());
    expect(result).toMatchObject({ ok: true, launched: true, note: null });

    const instance = await plainInstance();
    const copy = join(instance, 'minecraft', 'saves', GAME_WORLD);
    expect(await filesOf(copy)).toEqual([
      'data/raids.dat',
      'datapacks/sky.zip',
      'datapacks/their-pack.zip',
      'level.dat',
      'region/r.0.0.mca',
      'resources.zip',
    ]);
    // The data pack is the project's, not the dev pack nor the old copy; level.dat is untouched.
    expect(await readFile(join(copy, 'datapacks', 'sky.zip'), 'utf8')).toBe('the data pack');
    expect(await readFile(join(copy, 'resources.zip'), 'utf8')).toBe('the resource pack');
    expect(await readFile(join(copy, 'level.dat'), 'utf8')).toBe('level data');
    // No loader and no mods: the Plain instance plays without mods.
    const pack = JSON.parse(await readFile(join(instance, 'mmc-pack.json'), 'utf8')) as {
      components: { uid: string }[];
    };
    expect(pack.components.map((component) => component.uid)).toEqual(['net.minecraft']);
    expect(await readdir(join(instance, 'minecraft'))).not.toContain('mods');
    // Prism starts on the copied world.
    expect(spawned).toHaveLength(1);
    const args = spawned[0]?.args ?? [];
    expect(args).toContain('--launch');
    expect(args.slice(-2)).toEqual(['--world', GAME_WORLD]);
    expect(args[args.indexOf('--launch') + 1]).toBe(instance.split(sep).pop());
    // The work folder of the copy is gone; the test instance's world is unchanged.
    expect(await readdir(join(msmHome, PLAIN_WORLDS_DIR))).toEqual([]);
    expect(await filesOf(join(testGameDir, 'saves', GAME_WORLD))).toContain(
      'datapacks/msm-dev/pack.mcmeta',
    );
  });

  it('makes the copy again each time from the game world, in the same instance', async () => {
    expect(await service.playPlain(plainRequest())).toMatchObject({ ok: true });
    const instance = await plainInstance();
    await writeFile(join(testGameDir, 'saves', GAME_WORLD, 'region', 'r.0.0.mca'), 'played more');
    await writeFile(join(instance, 'minecraft', 'saves', GAME_WORLD, 'stray.txt'), 'from the game');
    expect(await service.playPlain(plainRequest())).toMatchObject({ ok: true });
    expect(await plainInstance()).toBe(instance);
    const copy = join(instance, 'minecraft', 'saves', GAME_WORLD);
    expect(await readFile(join(copy, 'region', 'r.0.0.mca'), 'utf8')).toBe('played more');
    expect(await filesOf(copy)).not.toContain('stray.txt');
  });

  it('writes nothing outside the Plain instance, its staging or MSM’s own folders, and leaves the user’s instances byte for byte the same (D5)', async () => {
    const before = await snapshot(prism.root);
    expect(await service.playPlain(plainRequest())).toMatchObject({ ok: true });
    expect(await service.playPlain(plainRequest())).toMatchObject({ ok: true });
    const instance = await plainInstance();
    const after = await snapshot(prism.root);
    const instanceRel = relative(prism.root, instance);
    for (const [path, bytes] of before) {
      expect(after.get(path), path).toBe(bytes);
    }
    for (const path of after.keys()) {
      if (before.has(path)) continue;
      const ok =
        path.startsWith(instanceRel) ||
        path.startsWith(`${relative(prism.root, prism.instancesDir)}${sep}.msm-staging`);
      expect(ok, path).toBe(true);
    }
    for (const path of writes) {
      const inside =
        path.startsWith(`${instance}${sep}`) ||
        path.startsWith(join(prism.instancesDir, '.msm-staging')) ||
        path.startsWith(`${msmHome}${sep}`);
      expect(inside, path).toBe(true);
    }
    // The same-named folder that is not MSM's still holds only its own world.
    expect(await readdir(join(prism.gameDir(PLAIN), 'saves'))).toEqual([GAME_WORLD]);
    expect(await filesOf(join(prism.gameDir(PLAIN), 'saves', GAME_WORLD))).toEqual(['level.dat']);
  });

  it('refuses a game that needs its mod, in words, and writes nothing', async () => {
    const before = await snapshot(prism.root);
    const result = await service.playPlain(
      plainRequest({ project: { namespace: 'sky', modId: 'sky', playsWithoutMods: false } }),
    );
    expect(result).toEqual({ ok: false, code: 'needs-mod', message: NEEDS_MOD_MESSAGE });
    expect(await snapshot(prism.root)).toEqual(before);
    expect(writes).toEqual([]);
    expect(spawned).toEqual([]);
  });

  it('says to press Play my game once first when the game has no world yet', async () => {
    await rm(join(testGameDir, 'saves', GAME_WORLD), { recursive: true });
    const before = await snapshot(prism.root);
    expect(await service.playPlain(plainRequest())).toEqual({
      ok: false,
      code: 'not-found',
      message: NO_GAME_WORLD_MESSAGE,
    });
    expect(NO_GAME_WORLD_MESSAGE).toContain('Play my game');
    expect(await snapshot(prism.root)).toEqual(before);
    expect(spawned).toEqual([]);
  });

  it('refuses a world open in the game and cleans its work folder', async () => {
    openWorld = GAME_WORLD;
    const before = await snapshot(prism.root);
    const result = await service.playPlain(plainRequest());
    expect(result).toMatchObject({ ok: false, code: 'failed' });
    expect(result.ok ? '' : result.message).toMatch(/open in the game/);
    expect(await snapshot(prism.root)).toEqual(before);
    expect(await readdir(join(msmHome, PLAIN_WORLDS_DIR))).toEqual([]);
  });

  it('has no launcher without a Prism folder, and fails plainly without its worlds service', async () => {
    await settings.set({
      launchers: { prismDataDirs: [join(temp, 'nowhere')], multimcRoots: [], curseForgeRoots: [] },
    });
    expect(await service.playPlain(plainRequest())).toMatchObject({
      ok: false,
      code: 'no-launcher',
    });
    const bare = createInstancesService({
      fs: recordingFs(),
      env: { platform: 'linux', home: join(temp, 'home') },
      settings,
      msmHome,
      cacheDir: join(temp, 'downloads'),
      targetFacts: () => FACTS,
    });
    expect(await bare.playPlain(plainRequest())).toMatchObject({ ok: false, code: 'failed' });
  });
});

describe('Open this map', () => {
  function mapRequest(overrides: Partial<InstanceOpenMapRequest> = {}): InstanceOpenMapRequest {
    return {
      targetId: 'mc-test',
      project,
      mapName: 'Castle Run!',
      sourceId: MANAGED_MAP_SOURCE,
      worldDir: 'Castle',
      jars: [],
      dataPack: DATA_PACK,
      ...overrides,
    };
  }

  it('opens the exported world in the Plain instance, as the map carries it', async () => {
    const result = await service.openMap(mapRequest({ keepPlayerData: true }));
    expect(result).toMatchObject({ ok: true, launched: true });
    const instance = await plainInstance();
    const folder = plainWorldFolder('Castle Run!');
    const copy = join(instance, 'minecraft', 'saves', folder);
    const files = await filesOf(copy);
    expect(files).toContain('datapacks/sky.zip');
    expect(files).toContain('players/data/someone.dat');
    expect(files).toContain('level.dat_old');
    expect(files.some((path) => path.startsWith('datapacks/msm-dev'))).toBe(false);
    expect(files).not.toContain('session.lock');
    expect(files).not.toContain('resources.zip');
    expect(spawned[0]?.args.slice(-2)).toEqual(['--world', folder]);
  });

  it('answers not yet for a map that needs its mod, and refuses a world that is gone', async () => {
    expect(
      await service.openMap(
        mapRequest({ project: { namespace: 'sky', modId: 'sky', playsWithoutMods: false } }),
      ),
    ).toMatchObject({ ok: false, code: 'not-yet' });
    expect(await service.openMap(mapRequest({ worldDir: 'Gone' }))).toMatchObject({
      ok: false,
      code: 'not-found',
    });
    expect(writes).toEqual([]);
    expect(spawned).toEqual([]);
  });
});

describe('the Plain instance world folder of a map', () => {
  it('keeps a usable name and makes the rest usable', () => {
    expect(plainWorldFolder('Castle')).toBe('Castle');
    expect(plainWorldFolder('Castle Run!')).toBe('Castle Run_');
    expect(plainWorldFolder('  .Sky & Sea.  ')).toBe('Sky _ Sea');
    expect(plainWorldFolder('...')).toBe('map');
    expect(plainWorldFolder('x'.repeat(300))).toHaveLength(128);
  });
});

describe('the channels', () => {
  it('carry the packs and the player data choice', () => {
    const plain = ipcContract[InvokeChannels.instancesPlayPlain].request;
    expect(plain.safeParse(plainRequest()).success).toBe(true);
    expect(
      plain.safeParse({
        ...plainRequest(),
        dataPack: { fileName: '../x.zip', data: new Uint8Array() },
      }).success,
    ).toBe(false);
    const map = ipcContract[InvokeChannels.instancesOpenMap].request;
    expect(
      map.safeParse({
        targetId: 'mc-test',
        project,
        mapName: 'Castle',
        sourceId: MANAGED_MAP_SOURCE,
        worldDir: 'Castle',
        jars: [],
        keepPlayerData: true,
        dataPack: DATA_PACK,
        resourcePack: RESOURCE_PACK,
      }).success,
    ).toBe(true);
  });
});
