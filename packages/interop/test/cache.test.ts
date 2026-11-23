import { strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  assetCacheDir,
  extractPreviewAssets,
  readAssetCacheInfo,
  readCachedDataFiles,
  readOutdatedAssetCacheInfo,
  sameDataFolders,
  writeAssetCache,
} from '../src/index';
import { MemoryInstallFileSystem } from './helpers/memory-install-fs';
import { buildSyntheticJar, KEPT_ENTRIES } from './helpers/synthetic-jar';

const INFO = {
  version: '9.1',
  jarSha1: 'abc123',
  jarPath: '/games/versions/9.1/9.1.jar',
  dataFolders: [] as string[],
  extractedAt: '2000-01-01T00:00:00.000Z',
};

describe('assetCacheDir', () => {
  it('places the cache under cache/assets/<version>', () => {
    expect(assetCacheDir('/home/alex/.msm', '9.1')).toBe('/home/alex/.msm/cache/assets/9.1');
  });

  it('rejects version ids that are not a single path segment', () => {
    expect(() => assetCacheDir('/m', '../x')).toThrow();
    expect(() => assetCacheDir('/m', 'a/b')).toThrow();
    expect(() => assetCacheDir('/m', '')).toThrow();
  });
});

describe('asset cache', () => {
  it('round-trips files and info', async () => {
    const fs = new MemoryInstallFileSystem();
    const dir = assetCacheDir('/msm', '9.1');
    const files = extractPreviewAssets(buildSyntheticJar());
    const info = await writeAssetCache(fs, dir, files, INFO);
    const byteCount = files.reduce((sum, file) => sum + file.data.byteLength, 0);
    expect(byteCount).toBeGreaterThan(0);
    expect(info).toEqual({ ...INFO, byteCount, fileCount: 8, schemaVersion: 6 });
    expect(await readAssetCacheInfo(fs, dir)).toEqual(info);
    for (const [path, data] of Object.entries(KEPT_ENTRIES)) {
      expect(await fs.readFile(`${dir}/${path}`)).toEqual(data);
    }
    expect(fs.log.at(-1)).toBe(`write ${dir}/cache.json`);
    expect(fs.log[0]).toBe(`remove ${dir}/cache.json`);
  });

  it('is invalid when cache.json is missing', async () => {
    const fs = new MemoryInstallFileSystem();
    const dir = assetCacheDir('/msm', '9.1');
    await writeAssetCache(fs, dir, extractPreviewAssets(buildSyntheticJar()), INFO);
    await fs.remove(`${dir}/cache.json`);
    expect(await readAssetCacheInfo(fs, dir)).toBeNull();
    expect(await readAssetCacheInfo(fs, '/nowhere')).toBeNull();
  });

  it('is invalid when cache.json is malformed', async () => {
    const fs = new MemoryInstallFileSystem();
    fs.seed('/c/cache.json', 'not json');
    expect(await readAssetCacheInfo(fs, '/c')).toBeNull();
    fs.seed('/c/cache.json', JSON.stringify({ ...INFO, fileCount: 1, schemaVersion: 7 }));
    expect(await readAssetCacheInfo(fs, '/c')).toBeNull();
    // A Phase 1 cache (schema 1) has no `.png.mcmeta` sidecars, so it is extracted again.
    fs.seed('/c/cache.json', JSON.stringify({ ...INFO, fileCount: 1, schemaVersion: 1 }));
    expect(await readAssetCacheInfo(fs, '/c')).toBeNull();
    // Schema 2 has no vanilla placed features (read by "Make my own copy"), so it too is extracted again.
    fs.seed('/c/cache.json', JSON.stringify({ ...INFO, fileCount: 1, schemaVersion: 2 }));
    expect(await readAssetCacheInfo(fs, '/c')).toBeNull();
    // Schema 3 has no worldgen data folders (ADR 0119 D4), so it too is extracted again.
    fs.seed('/c/cache.json', JSON.stringify({ ...INFO, fileCount: 1, schemaVersion: 3 }));
    expect(await readAssetCacheInfo(fs, '/c')).toBeNull();
    // Schema 4 has no live view data folders (ADR 0120 D11), so it too is extracted again.
    fs.seed('/c/cache.json', JSON.stringify({ ...INFO, fileCount: 1, schemaVersion: 4 }));
    expect(await readAssetCacheInfo(fs, '/c')).toBeNull();
    // Schema 5 has no looks and sounds views' textures (ADR 0121 D3), so it too is extracted again.
    fs.seed('/c/cache.json', JSON.stringify({ ...INFO, fileCount: 1, schemaVersion: 5 }));
    expect(await readAssetCacheInfo(fs, '/c')).toBeNull();
    const current = { ...INFO, byteCount: 10, fileCount: 1, schemaVersion: 6 };
    fs.seed('/c/cache.json', JSON.stringify(current));
    expect(await readAssetCacheInfo(fs, '/c')).toEqual(current);
    // Schema 6 needs the jar path, the folder list and the byte count.
    const { jarPath: _jarPath, ...withoutJarPath } = current;
    fs.seed('/c/cache.json', JSON.stringify(withoutJarPath));
    expect(await readAssetCacheInfo(fs, '/c')).toBeNull();
    const { byteCount: _byteCount, ...withoutByteCount } = current;
    fs.seed('/c/cache.json', JSON.stringify(withoutByteCount));
    expect(await readAssetCacheInfo(fs, '/c')).toBeNull();
    fs.seed('/c/cache.json', '[]');
    expect(await readAssetCacheInfo(fs, '/c')).toBeNull();
  });

  it('rejects unsafe file paths before writing anything', async () => {
    const fs = new MemoryInstallFileSystem();
    await expect(
      writeAssetCache(fs, '/c', [{ path: '../escape.json', data: strToU8('{}') }], INFO),
    ).rejects.toThrow();
    await expect(
      writeAssetCache(fs, '/c', [{ path: 'cache.json', data: strToU8('{}') }], INFO),
    ).rejects.toThrow();
    expect(fs.log).toEqual([]);
  });
});

describe('outdated asset caches (ADR 0119 D4)', () => {
  it('reads the jar path a schema 4 cache recorded (B603)', async () => {
    const fs = new MemoryInstallFileSystem();
    fs.seed('/c/cache.json', JSON.stringify({ ...INFO, fileCount: 1, schemaVersion: 4 }));
    expect(await readOutdatedAssetCacheInfo(fs, '/c')).toEqual({
      version: '9.1',
      jarSha1: 'abc123',
      jarPath: INFO.jarPath,
      schemaVersion: 4,
    });
  });

  it('reads what a cache of an older schema recorded', async () => {
    const fs = new MemoryInstallFileSystem();
    const schema3 = {
      version: '9.1',
      jarSha1: 'abc123',
      extractedAt: INFO.extractedAt,
      fileCount: 1,
      schemaVersion: 3,
    };
    fs.seed('/c/cache.json', JSON.stringify(schema3));
    expect(await readOutdatedAssetCacheInfo(fs, '/c')).toEqual({
      version: '9.1',
      jarSha1: 'abc123',
      jarPath: null,
      schemaVersion: 3,
    });
  });

  it('is null for a current, newer, malformed or missing cache.json', async () => {
    const fs = new MemoryInstallFileSystem();
    expect(await readOutdatedAssetCacheInfo(fs, '/c')).toBeNull();
    await writeAssetCache(fs, '/c', [], INFO);
    expect(await readOutdatedAssetCacheInfo(fs, '/c')).toBeNull();
    fs.seed('/c/cache.json', JSON.stringify({ ...INFO, fileCount: 0, schemaVersion: 7 }));
    expect(await readOutdatedAssetCacheInfo(fs, '/c')).toBeNull();
    fs.seed('/c/cache.json', JSON.stringify({ version: 1, jarSha1: 'x', schemaVersion: 2 }));
    expect(await readOutdatedAssetCacheInfo(fs, '/c')).toBeNull();
    fs.seed('/c/cache.json', '{');
    expect(await readOutdatedAssetCacheInfo(fs, '/c')).toBeNull();
  });

  it('compares folder lists without order or duplicates', () => {
    expect(sameDataFolders(['b', 'a'], ['a', 'b', 'a'])).toBe(true);
    expect(sameDataFolders(['a'], ['a', 'c'])).toBe(false);
    expect(sameDataFolders([], [])).toBe(true);
  });
});

describe('readCachedDataFiles', () => {
  /** A made-up folder list: no real target's. */
  const FOLDERS = ['made_up/stones', 'made_up/stones/special', 'tags/made_up/stones'];
  const json = (value: unknown) => strToU8(JSON.stringify(value));

  it('reads each folder as id to JSON, subfolders included', async () => {
    const fs = new MemoryInstallFileSystem();
    const dir = assetCacheDir('/msm', '9.1');
    await writeAssetCache(
      fs,
      dir,
      [
        { path: 'data/minecraft/made_up/stones/plain.json', data: json({ hard: 1 }) },
        { path: 'data/minecraft/made_up/stones/deep/dark.json', data: json({ hard: 2 }) },
        { path: 'data/minecraft/made_up/stones/special/shiny.json', data: json({ hard: 3 }) },
        { path: 'data/minecraft/made_up/stones/notes.txt', data: strToU8('skip me') },
        { path: 'data/minecraft/made_up/stones/broken.json', data: strToU8('{') },
        { path: 'data/minecraft/made_up/other/no.json', data: json({}) },
      ],
      { ...INFO, dataFolders: FOLDERS },
    );
    const read = await readCachedDataFiles(fs, dir, FOLDERS);
    expect(read.folders).toEqual({
      'made_up/stones': {
        'minecraft:deep/dark': { hard: 2 },
        'minecraft:plain': { hard: 1 },
      },
      'made_up/stones/special': { 'minecraft:shiny': { hard: 3 } },
      'tags/made_up/stones': {},
    });
    expect(read.fileCount).toBe(3);
    expect(read.unreadable).toEqual(['data/minecraft/made_up/stones/broken.json']);
    // A read of one folder keeps the ids of a read of all when the other folders are named.
    const one = await readCachedDataFiles(fs, dir, ['made_up/stones'], { owners: FOLDERS });
    expect(one.folders).toEqual({ 'made_up/stones': read.folders['made_up/stones'] });
    const alone = await readCachedDataFiles(fs, dir, ['made_up/stones']);
    expect(Object.keys(alone.folders['made_up/stones'] ?? {})).toContain('minecraft:special/shiny');
    await expect(
      readCachedDataFiles(fs, dir, ['made_up/stones'], { owners: ['../x'] }),
    ).rejects.toThrow();
  });

  it('reads a folder of many files in path order whatever the read timing', async () => {
    const fs = new MemoryInstallFileSystem();
    const dir = assetCacheDir('/msm', '9.1');
    const names = Array.from({ length: 300 }, (_, index) => `n${String(index).padStart(3, '0')}`);
    await writeAssetCache(
      fs,
      dir,
      names.map((name) => ({
        path: `data/minecraft/made_up/many/${name}.json`,
        data: json({ name }),
      })),
      { ...INFO, dataFolders: ['made_up/many'] },
    );
    const read = await readCachedDataFiles(fs, dir, ['made_up/many']);
    expect(read.fileCount).toBe(300);
    expect(Object.keys(read.folders['made_up/many'] ?? {})).toEqual(
      names.map((name) => `minecraft:${name}`),
    );
  });

  it('refuses folder names that could leave the cache', async () => {
    const fs = new MemoryInstallFileSystem();
    await expect(readCachedDataFiles(fs, '/c', ['../escape'])).rejects.toThrow();
    await expect(readCachedDataFiles(fs, '/c', ['Upper'])).rejects.toThrow();
    await expect(readCachedDataFiles(fs, '/c', ['a//b'])).rejects.toThrow();
  });
});
