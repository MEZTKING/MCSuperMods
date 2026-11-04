import { strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  assetCacheDir,
  extractPreviewAssets,
  readAssetCacheInfo,
  writeAssetCache,
} from '../src/index';
import { MemoryInstallFileSystem } from './helpers/memory-install-fs';
import { buildSyntheticJar, KEPT_ENTRIES } from './helpers/synthetic-jar';

const INFO = { version: '9.1', jarSha1: 'abc123', extractedAt: '2000-01-01T00:00:00.000Z' };

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
    expect(info).toEqual({ ...INFO, fileCount: 7, schemaVersion: 2 });
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
    fs.seed('/c/cache.json', JSON.stringify({ ...INFO, fileCount: 1, schemaVersion: 3 }));
    expect(await readAssetCacheInfo(fs, '/c')).toBeNull();
    // A Phase 1 cache (schema 1) has no `.png.mcmeta` sidecars, so it is extracted again.
    fs.seed('/c/cache.json', JSON.stringify({ ...INFO, fileCount: 1, schemaVersion: 1 }));
    expect(await readAssetCacheInfo(fs, '/c')).toBeNull();
    fs.seed('/c/cache.json', JSON.stringify({ ...INFO, fileCount: 1, schemaVersion: 2 }));
    expect(await readAssetCacheInfo(fs, '/c')).toEqual({ ...INFO, fileCount: 1, schemaVersion: 2 });
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
