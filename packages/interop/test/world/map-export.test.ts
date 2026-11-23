import { describe, expect, it } from 'vitest';
import {
  isMapFolderName,
  type MapWorldEntry,
  mapEntryLeftOut,
  mapEntryPrefix,
  mapExtraFiles,
  mapFileName,
  mapFolderName,
  planMapEntries,
} from '../../src/index';
import { MemoryInstallFileSystem } from '../helpers/memory-install-fs';

const WORLD = '/saves/msm-game-ruby';

/** A 26.x world folder as Play my game leaves it (B547 Y14 layout), made here, no game file. */
function fixtureWorld(): MemoryInstallFileSystem {
  const fs = new MemoryInstallFileSystem();
  for (const path of [
    'level.dat',
    'level.dat_old',
    'session.lock',
    'icon.png',
    'resources.zip',
    'data/minecraft/scoreboard.dat',
    'data/ruby/command_storage.dat',
    'dimensions/minecraft/overworld/region/r.0.0.mca',
    'dimensions/ruby/sky/region/r.0.0.mca',
    'generated/ruby/structure/hut.nbt',
    'players/data/0000-1111.dat',
    'players/advancements/0000-1111.json',
    'players/stats/0000-1111.json',
    'playerdata/old.dat',
    'datapacks/msm-dev/pack.mcmeta',
    'datapacks/msm-dev/data/ruby/function/a.mcfunction',
    'datapacks/other.zip',
    'datapacks/ruby-data.zip',
  ]) {
    fs.seed(`${WORLD}/${path}`, path);
  }
  return fs;
}

/** The world's entries as the host walks them: sorted, folders before their contents. */
async function walk(fs: MemoryInstallFileSystem, dir = WORLD, rel = ''): Promise<MapWorldEntry[]> {
  const out: MapWorldEntry[] = [];
  const entries = (await fs.readDir(dir)).sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const entry of entries) {
    const path = rel === '' ? entry.name : `${rel}/${entry.name}`;
    out.push({ path, directory: entry.kind === 'directory' });
    if (entry.kind === 'directory') out.push(...(await walk(fs, `${dir}/${entry.name}`, path)));
  }
  return out;
}

const packs = {
  dataPack: { fileName: 'ruby-data.zip', data: new Uint8Array([1]) },
  resourcePack: new Uint8Array([2]),
};

describe('map export plan (ADR 0116 D2)', () => {
  it('turns a fixture world into the zip file list of a world zip', async () => {
    const world = await walk(fixtureWorld());
    const extras = mapExtraFiles(packs);
    const plan = planMapEntries(
      world,
      'world-zip',
      'Ruby Sky',
      { keepPlayerData: false, dataPackFile: 'ruby-data.zip', resourcePack: true },
      extras,
    );
    expect(plan.entries).toEqual([
      'Ruby Sky/',
      'Ruby Sky/data/',
      'Ruby Sky/data/minecraft/',
      'Ruby Sky/data/minecraft/scoreboard.dat',
      'Ruby Sky/data/ruby/',
      'Ruby Sky/data/ruby/command_storage.dat',
      'Ruby Sky/datapacks/',
      'Ruby Sky/datapacks/other.zip',
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
      'Ruby Sky/generated/ruby/structure/hut.nbt',
      'Ruby Sky/icon.png',
      'Ruby Sky/level.dat',
      'Ruby Sky/datapacks/ruby-data.zip',
      'Ruby Sky/resources.zip',
    ]);
    expect(plan.leftOut).toEqual([
      { path: 'datapacks/msm-dev', reason: 'dev-pack' },
      { path: 'datapacks/ruby-data.zip', reason: 'replaced' },
      { path: 'level.dat_old', reason: 'player-data' },
      { path: 'playerdata', reason: 'player-data' },
      { path: 'players', reason: 'player-data' },
      { path: 'resources.zip', reason: 'replaced' },
      { path: 'session.lock', reason: 'lock' },
    ]);
  });

  it('keeps the player data when asked, and puts a .mrpack world under overrides/saves/', async () => {
    const world = await walk(fixtureWorld());
    const plan = planMapEntries(world, 'mrpack', 'Ruby Sky', {
      keepPlayerData: true,
      resourcePack: false,
    });
    expect(plan.entries.slice(0, 3)).toEqual([
      'overrides/',
      'overrides/saves/',
      'overrides/saves/Ruby Sky/',
    ]);
    expect(plan.entries).toContain('overrides/saves/Ruby Sky/players/data/0000-1111.dat');
    expect(plan.entries).toContain('overrides/saves/Ruby Sky/playerdata/old.dat');
    expect(plan.entries).toContain('overrides/saves/Ruby Sky/level.dat_old');
    // Without the project's packs, the world's own resources.zip and packs stay.
    expect(plan.entries).toContain('overrides/saves/Ruby Sky/resources.zip');
    expect(plan.entries).toContain('overrides/saves/Ruby Sky/datapacks/ruby-data.zip');
    expect(plan.leftOut).toEqual([
      { path: 'datapacks/msm-dev', reason: 'dev-pack' },
      { path: 'session.lock', reason: 'lock' },
    ]);
  });

  it('decides single entries', () => {
    const options = { keepPlayerData: false, resourcePack: false };
    expect(mapEntryLeftOut('level.dat', false, options)).toBeNull();
    expect(mapEntryLeftOut('players', true, options)).toBe('player-data');
    expect(mapEntryLeftOut('advancements', true, options)).toBe('player-data');
    expect(mapEntryLeftOut('stats', true, options)).toBe('player-data');
    expect(mapEntryLeftOut('data/stats', true, options)).toBeNull();
    expect(mapEntryLeftOut('datapacks/msm-dev/pack.mcmeta', false, options)).toBe('dev-pack');
    expect(mapEntryLeftOut('datapacks/msm-devil.zip', false, options)).toBeNull();
    expect(mapEntryLeftOut('region/session.lock', false, options)).toBeNull();
    expect(
      mapEntryLeftOut('datapacks/Ruby-Data.zip', false, {
        ...options,
        dataPackFile: 'ruby-data.zip',
      }),
    ).toBe('replaced');
  });

  it('names the map folder and file safely', () => {
    expect(mapFolderName('Ruby: Sky / Block')).toBe('Ruby_ Sky _ Block');
    expect(mapFolderName('  ..  ')).toBe('map');
    expect(mapFolderName('x'.repeat(80))).toHaveLength(64);
    expect(isMapFolderName('Ruby Sky')).toBe(true);
    expect(isMapFolderName('../up')).toBe(false);
    expect(isMapFolderName('a/b')).toBe(false);
    expect(isMapFolderName('trailing.')).toBe(false);
    expect(mapFileName('world-zip', 'Ruby Sky')).toBe('Ruby Sky.zip');
    expect(mapFileName('mrpack', 'Ruby Sky')).toBe('Ruby Sky.mrpack');
    expect(mapEntryPrefix('mrpack', 'Ruby Sky')).toBe('overrides/saves/Ruby Sky');
    expect(() => mapEntryPrefix('world-zip', '..')).toThrow(/not a valid map folder name/);
    expect(() =>
      mapExtraFiles({ dataPack: { fileName: '../x.zip', data: new Uint8Array() } }),
    ).toThrow(/not a data pack zip name/);
  });
});
