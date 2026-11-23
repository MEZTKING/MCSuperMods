import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createNodeInstallFileSystem } from '@msm/interop/node';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocationResolver } from '../../src/main/platform/locations';
import {
  createMapExportService,
  MANAGED_MAP_SOURCE,
  type ManagedGame,
  type MapExportService,
} from '../../src/main/platform/map-export';
import { createSettingsStore } from '../../src/main/platform/settings';

let temp: string;
let minecraftDir: string;
let managedGameDir: string;
let outDir: string;
let openWorld: string | null;
let savePath: string | null;
let asked: { title: string; defaultName: string }[];
let written: string[];

const TARGET = 'mc-26.3';
const GAME_WORLD = 'msm-game-ruby';

/** A 26.x world folder as Play my game leaves it (B547 Y14 layout); no game file in it. */
async function fixtureWorld(saves: string, dir: string): Promise<string> {
  const world = join(saves, dir);
  const files: Record<string, string> = {
    'level.dat': 'not nbt',
    'level.dat_old': 'old',
    'session.lock': 'lock',
    'icon.png': 'png',
    'resources.zip': 'old resources',
    'data/minecraft/scoreboard.dat': 'scores',
    'data/ruby/command_storage.dat': 'flags',
    'dimensions/minecraft/overworld/region/r.0.0.mca': 'chunks',
    'dimensions/ruby/sky/region/r.0.0.mca': 'sky chunks',
    'generated/ruby/structure/hut.nbt': 'hut',
    'generated/ruby/structure/houses/tower.nbt': 'tower',
    'players/data/0000.dat': 'me',
    'players/advancements/0000.json': '{}',
    'players/stats/0000.json': '{}',
    'datapacks/msm-dev/pack.mcmeta': '{}',
    'datapacks/ruby-data.zip': 'stale pack',
    'datapacks/other.zip': 'other pack',
  };
  for (const [path, text] of Object.entries(files)) {
    const file = join(world, ...path.split('/'));
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
  }
  return world;
}

/** The zip's entry names and the text of each file. */
async function unzipped(path: string): Promise<Record<string, string>> {
  const entries = unzipSync(new Uint8Array(await readFile(path)));
  return Object.fromEntries(Object.entries(entries).map(([name, data]) => [name, strFromU8(data)]));
}

async function service(): Promise<MapExportService> {
  const fs = createNodeInstallFileSystem();
  const installEnv = { platform: 'linux', home: join(temp, 'home') };
  const settings = createSettingsStore({ msmHome: join(temp, 'msm-home'), installEnv });
  await settings.set({ minecraftDir });
  return createMapExportService({
    locations: createLocationResolver({ fs, env: installEnv, settings }),
    managedGame: async (): Promise<ManagedGame | null> => ({
      gameDir: managedGameDir,
      openWorld,
    }),
    saveFilePath: async (opts) => {
      asked.push({ title: opts.title, defaultName: opts.defaultName });
      return savePath === null ? null : join(savePath, opts.defaultName);
    },
    onWritten: (path) => written.push(path),
  });
}

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-map-export-'));
  minecraftDir = join(temp, 'minecraft');
  managedGameDir = join(temp, 'prism', 'instances', 'MCSuperMods Test (26.3)', 'minecraft');
  outDir = join(temp, 'out');
  await mkdir(join(minecraftDir, 'saves'), { recursive: true });
  await mkdir(join(managedGameDir, 'saves'), { recursive: true });
  await mkdir(outDir);
  openWorld = null;
  savePath = outDir;
  asked = [];
  written = [];
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

describe('Export as a map (ADR 0116 D2)', () => {
  it('lists the managed instance first, then the launcher worlds', async () => {
    await fixtureWorld(join(managedGameDir, 'saves'), GAME_WORLD);
    await fixtureWorld(join(minecraftDir, 'saves'), 'My World');
    await mkdir(join(minecraftDir, 'saves', 'Not a world'));
    const sources = await (await service()).listWorlds(TARGET);
    expect(
      sources.map((source) => [source.id, source.managed, source.worlds.map((w) => w.dir)]),
    ).toEqual([
      [MANAGED_MAP_SOURCE, true, [GAME_WORLD]],
      ['official:default', false, ['My World']],
    ]);
  });

  it('writes a fixture world as a world zip: packs in, dev pack and player data out', async () => {
    await fixtureWorld(join(managedGameDir, 'saves'), GAME_WORLD);
    const result = await (await service()).exportMap({
      targetId: TARGET,
      sourceId: MANAGED_MAP_SOURCE,
      worldDir: GAME_WORLD,
      keepPlayerData: false,
      mapName: 'Ruby Sky',
      dataPack: { fileName: 'ruby-data.zip', data: new TextEncoder().encode('new pack') },
      resourcePack: new TextEncoder().encode('new resources'),
    });
    const path = join(outDir, 'Ruby Sky.zip');
    expect(asked).toEqual([{ title: 'Export as a map', defaultName: 'Ruby Sky.zip' }]);
    expect(result).toEqual({
      path,
      kind: 'world-zip',
      entries: 27,
      leftOut: [
        { path: 'datapacks/msm-dev', reason: 'dev-pack' },
        { path: 'datapacks/ruby-data.zip', reason: 'replaced' },
        { path: 'level.dat_old', reason: 'player-data' },
        { path: 'players', reason: 'player-data' },
        { path: 'resources.zip', reason: 'replaced' },
        { path: 'session.lock', reason: 'lock' },
      ],
    });
    expect(written).toEqual([path]);
    const files = await unzipped(path);
    expect(Object.keys(files).sort()).toEqual(
      [
        'Ruby Sky/',
        'Ruby Sky/data/',
        'Ruby Sky/data/minecraft/',
        'Ruby Sky/data/minecraft/scoreboard.dat',
        'Ruby Sky/data/ruby/',
        'Ruby Sky/data/ruby/command_storage.dat',
        'Ruby Sky/datapacks/',
        'Ruby Sky/datapacks/other.zip',
        'Ruby Sky/datapacks/ruby-data.zip',
        'Ruby Sky/dimensions/',
        'Ruby Sky/dimensions/minecraft/',
        'Ruby Sky/dimensions/minecraft/overworld/',
        'Ruby Sky/dimensions/minecraft/overworld/region/',
        'Ruby Sky/dimensions/minecraft/overworld/region/r.0.0.mca',
        'Ruby Sky/dimensions/ruby/',
        'Ruby Sky/dimensions/ruby/sky/',
        'Ruby Sky/dimensions/ruby/sky/region/',
        'Ruby Sky/dimensions/ruby/sky/region/r.0.0.mca',
        'Ruby Sky/generated/',
        'Ruby Sky/generated/ruby/',
        'Ruby Sky/generated/ruby/structure/',
        'Ruby Sky/generated/ruby/structure/houses/',
        'Ruby Sky/generated/ruby/structure/houses/tower.nbt',
        'Ruby Sky/generated/ruby/structure/hut.nbt',
        'Ruby Sky/icon.png',
        'Ruby Sky/level.dat',
        'Ruby Sky/resources.zip',
      ].sort(),
    );
    expect(files['Ruby Sky/datapacks/ruby-data.zip']).toBe('new pack');
    expect(files['Ruby Sky/resources.zip']).toBe('new resources');
    // level.dat is copied as it is, never written.
    expect(files['Ruby Sky/level.dat']).toBe('not nbt');
    // Nothing temporary is left beside the map, and the world is untouched.
    expect(await readdir(outDir)).toEqual(['Ruby Sky.zip']);
    expect(await readFile(join(managedGameDir, 'saves', GAME_WORLD, 'session.lock'), 'utf8')).toBe(
      'lock',
    );
  });

  it('writes a .mrpack with the jar and the world under overrides/saves/, player data kept', async () => {
    await fixtureWorld(join(minecraftDir, 'saves'), 'My World');
    const index = JSON.stringify({ formatVersion: 1, game: 'minecraft', name: 'Ruby Sky' });
    const result = await (await service()).exportMap({
      targetId: TARGET,
      sourceId: 'official:default',
      worldDir: 'My World',
      keepPlayerData: true,
      mapName: 'Ruby Sky',
      mrpack: { index, jars: [{ fileName: 'ruby.jar', data: new TextEncoder().encode('jar') }] },
    });
    expect(result?.kind).toBe('mrpack');
    expect(asked[0]?.defaultName).toBe('Ruby Sky.mrpack');
    const files = await unzipped(join(outDir, 'Ruby Sky.mrpack'));
    expect(files['modrinth.index.json']).toBe(`${index}\n`);
    expect(files['overrides/mods/ruby.jar']).toBe('jar');
    const names = Object.keys(files);
    expect(names).toContain('overrides/saves/Ruby Sky/players/data/0000.dat');
    expect(names).toContain('overrides/saves/Ruby Sky/level.dat_old');
    // The world's own packs stay: the jar carries the project's data and assets.
    expect(files['overrides/saves/Ruby Sky/datapacks/ruby-data.zip']).toBe('stale pack');
    expect(names.some((name) => name.includes('msm-dev'))).toBe(false);
    expect(names.some((name) => name.endsWith('session.lock'))).toBe(false);
    expect(result?.leftOut).toEqual([
      { path: 'datapacks/msm-dev', reason: 'dev-pack' },
      { path: 'session.lock', reason: 'lock' },
    ]);
  });

  it('refuses a world open in the game, a map inside the world, and a bad index', async () => {
    const world = await fixtureWorld(join(managedGameDir, 'saves'), GAME_WORLD);
    const base = {
      targetId: TARGET,
      sourceId: MANAGED_MAP_SOURCE,
      worldDir: GAME_WORLD,
      keepPlayerData: false,
      mapName: 'Ruby Sky',
    };
    openWorld = GAME_WORLD;
    await expect((await service()).exportMap(base)).rejects.toThrow(/open in the game/);
    openWorld = null;
    savePath = join(world, 'data');
    await expect((await service()).exportMap(base)).rejects.toThrow(/outside the world folder/);
    savePath = outDir;
    await expect(
      (await service()).exportMap({
        ...base,
        mrpack: {
          index: '{"formatVersion":2}',
          jars: [{ fileName: 'a.jar', data: new Uint8Array() }],
        },
      }),
    ).rejects.toThrow(/not a Modrinth modpack index/);
    await expect((await service()).exportMap({ ...base, worldDir: 'gone' })).rejects.toThrow(
      /no longer there/,
    );
    savePath = null;
    expect(await (await service()).exportMap(base)).toBeNull();
    expect(await readdir(outDir)).toEqual([]);
  });

  it('does not follow symbolic links inside the world', async () => {
    const world = await fixtureWorld(join(minecraftDir, 'saves'), 'My World');
    await writeFile(join(temp, 'secret.txt'), 'secret');
    await symlink(join(temp, 'secret.txt'), join(world, 'link.txt'));
    await (await service()).exportMap({
      targetId: TARGET,
      sourceId: 'official:default',
      worldDir: 'My World',
      keepPlayerData: false,
      mapName: 'Linked',
    });
    const files = await unzipped(join(outDir, 'Linked.zip'));
    expect(Object.keys(files).some((name) => name.endsWith('link.txt'))).toBe(false);
  });
});

describe('Builds from my test worlds (ADR 0116 D3)', () => {
  it('lists and reads the structure-block saves of the managed instance only', async () => {
    await fixtureWorld(join(managedGameDir, 'saves'), 'msm-test-ruby');
    await fixtureWorld(join(minecraftDir, 'saves'), 'My World');
    const maps = await service();
    const saves = await maps.listStructureSaves(TARGET);
    expect(saves.map((save) => [save.world, save.id, save.size])).toEqual([
      ['msm-test-ruby', 'ruby:houses/tower', 5],
      ['msm-test-ruby', 'ruby:hut', 3],
    ]);
    expect(
      new TextDecoder().decode(await maps.readStructureSave(TARGET, 'msm-test-ruby', 'ruby:hut')),
    ).toBe('hut');
    await expect(maps.readStructureSave(TARGET, 'msm-test-ruby', 'ruby:none')).rejects.toThrow(
      /no longer in/,
    );
    await expect(maps.readStructureSave(TARGET, 'My World', 'ruby:hut')).rejects.toThrow(
      /no longer there/,
    );
  });
});
