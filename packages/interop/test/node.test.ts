import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assetCacheDir,
  discoverGameLocations,
  extractPreviewAssets,
  joinInstallPath,
  listInstalledVersions,
  pickVersionJar,
  readAssetCacheInfo,
  writeAssetCache,
} from '../src/index';
import { createNodeInstallFileSystem, nodeEnv, sha1Hex } from '../src/node';
import { buildSyntheticJar, KEPT_ENTRIES } from './helpers/synthetic-jar';

describe('@msm/interop/node', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'msm-interop-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('runs discovery, extraction and caching end to end on disk', async () => {
    const fs = createNodeInstallFileSystem();
    const mc = joinInstallPath(root, '.minecraft');
    const versionDir = joinInstallPath(mc, 'versions', '9.1');
    await fs.mkdirp(versionDir);
    const jar = buildSyntheticJar();
    await fs.writeFile(joinInstallPath(versionDir, '9.1.jar'), jar);

    const picked = pickVersionJar(await listInstalledVersions(fs, mc), '9.1');
    expect(picked?.id).toBe('9.1');
    const bytes = await fs.readFile(picked?.jarPath ?? '');
    expect(bytes).toEqual(jar);

    const dir = assetCacheDir(joinInstallPath(root, '.msm'), '9.1');
    const info = await writeAssetCache(fs, dir, extractPreviewAssets(bytes), {
      version: '9.1',
      jarSha1: sha1Hex(bytes),
      extractedAt: '2000-01-01T00:00:00.000Z',
    });
    expect(await readAssetCacheInfo(fs, dir)).toEqual(info);
    expect(info.jarSha1).toMatch(/^[0-9a-f]{40}$/);
    for (const [path, data] of Object.entries(KEPT_ENTRIES)) {
      expect(await fs.readFile(joinInstallPath(dir, path))).toEqual(data);
    }

    await fs.remove(dir);
    expect(await fs.exists(dir)).toBe(false);
    await fs.remove(dir); // removing nothing succeeds
  });

  it('lists directories and files', async () => {
    const fs = createNodeInstallFileSystem();
    await fs.mkdirp(joinInstallPath(root, 'a'));
    await fs.writeFile(joinInstallPath(root, 'b.txt'), new Uint8Array([1]));
    const entries = await fs.readDir(root);
    expect(entries.sort((x, y) => x.name.localeCompare(y.name))).toEqual([
      { name: 'a', kind: 'directory' },
      { name: 'b.txt', kind: 'file' },
    ]);
  });

  it('hashes with SHA-1', () => {
    expect(sha1Hex(new TextEncoder().encode('abc'))).toBe(
      'a9993e364706816aba3e25717850c26c9cd0d89d',
    );
  });

  it('reports the host environment', () => {
    const env = nodeEnv();
    expect(env.platform).toBe(process.platform);
    expect(env.home.length).toBeGreaterThan(0);
  });

  it('reads XDG_DATA_HOME and PRISMLAUNCHER_DATA_DIR', () => {
    const saved = { xdg: process.env.XDG_DATA_HOME, prism: process.env.PRISMLAUNCHER_DATA_DIR };
    try {
      process.env.XDG_DATA_HOME = '/xdg/data';
      process.env.PRISMLAUNCHER_DATA_DIR = '/prism/data';
      expect(nodeEnv()).toMatchObject({ xdgDataHome: '/xdg/data', prismDataDirEnv: '/prism/data' });
      delete process.env.XDG_DATA_HOME;
      delete process.env.PRISMLAUNCHER_DATA_DIR;
      expect(nodeEnv().xdgDataHome).toBeUndefined();
      expect(nodeEnv().prismDataDirEnv).toBeUndefined();
    } finally {
      if (saved.xdg === undefined) delete process.env.XDG_DATA_HOME;
      else process.env.XDG_DATA_HOME = saved.xdg;
      if (saved.prism === undefined) delete process.env.PRISMLAUNCHER_DATA_DIR;
      else process.env.PRISMLAUNCHER_DATA_DIR = saved.prism;
    }
  });

  it('resolves real paths and rejects missing ones', async () => {
    const fs = createNodeInstallFileSystem();
    const target = joinInstallPath(root, 'target');
    await fs.mkdirp(target);
    const link = join(root, 'link');
    await symlink(target, link, 'dir');
    const real = await fs.realpath?.(link);
    expect(real).toBe(await fs.realpath?.(target));
    await expect(fs.realpath?.(joinInstallPath(root, 'missing'))).rejects.toThrow();
  });

  it.skipIf(process.platform === 'win32')(
    'skips a symlinked Prism instance escaping the instances folder on disk',
    async () => {
      const fs = createNodeInstallFileSystem();
      const prism = joinInstallPath(root, 'prism');
      const seed = async (dir: string) => {
        await fs.mkdirp(joinInstallPath(dir, 'minecraft'));
        await fs.writeFile(joinInstallPath(dir, 'instance.cfg'), new TextEncoder().encode(''));
      };
      await seed(joinInstallPath(prism, 'instances', 'inside'));
      await seed(joinInstallPath(root, 'outside', 'escaped'));
      await symlink(join(root, 'outside', 'escaped'), join(prism, 'instances', 'away'), 'dir');
      const locations = await discoverGameLocations(
        fs,
        { platform: 'linux', home: joinInstallPath(root, 'home') },
        { minecraftDir: null, prismDataDirs: [prism], multimcRoots: [], curseForgeRoots: [] },
      );
      expect(locations.map((location) => location.ref.instance)).toEqual(['inside']);
    },
  );
});
