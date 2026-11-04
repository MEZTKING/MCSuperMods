import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodeInstallFileSystem } from '@msm/interop/node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertPreviewAssetPath,
  createMinecraftService,
  type MinecraftService,
} from '../src/main/platform/minecraft';
import { createSettingsStore, resolveMsmHome } from '../src/main/platform/settings';
import type { MinecraftProgress } from '../src/shared/ipc-channels';
import { buildSyntheticJar, KEPT_ENTRIES } from './helpers/synthetic-jar';

/** A made-up version id; tests never name a real Minecraft version. */
const VERSION = '9.9-msm-test';

let temp: string;
let msmHome: string;
let minecraftDir: string;
let service: MinecraftService;

async function installJar(id: string, jar: Uint8Array): Promise<void> {
  const dir = join(minecraftDir, 'versions', id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${id}.jar`), jar);
}

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-main-minecraft-'));
  msmHome = resolveMsmHome({ MSM_HOME: join(temp, 'msm-home') }, join(temp, 'home'));
  minecraftDir = join(temp, 'minecraft');
  const settings = createSettingsStore({
    msmHome,
    installEnv: { platform: 'linux', home: join(temp, 'home') },
  });
  await settings.set({ minecraftDir });
  service = createMinecraftService({
    msmHome,
    fs: createNodeInstallFileSystem(),
    minecraftDir: () => settings.minecraftDir(),
    now: () => '2026-01-01T00:00:00.000Z',
  });
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

describe('Minecraft service', () => {
  it('reports no installation and refuses to extract', async () => {
    expect(await service.status(VERSION)).toEqual({
      minecraftDir,
      installed: [],
      chosen: null,
      cache: null,
    });
    await expect(service.extract(VERSION)).rejects.toThrow(/not installed/);
    expect(await service.readAsset(VERSION, 'assets/minecraft/lang/en_us.json')).toBeNull();
    expect(await service.listAssets(VERSION, '')).toEqual([]);
  });

  it('extracts, caches and serves preview assets', async () => {
    await installJar(VERSION, buildSyntheticJar());
    await installJar('0.1', buildSyntheticJar());

    const before = await service.status(VERSION);
    expect(before.installed).toEqual([{ id: '0.1' }, { id: VERSION }]);
    expect(before.chosen).toEqual({ id: VERSION });
    expect(before.cache).toBeNull();

    const progress: MinecraftProgress[] = [];
    const info = await service.extract(VERSION, (p) => progress.push(p));
    expect(info).toMatchObject({
      version: VERSION,
      fileCount: Object.keys(KEPT_ENTRIES).length,
      extractedAt: '2026-01-01T00:00:00.000Z',
      schemaVersion: 2,
    });
    expect(info.jarSha1).toMatch(/^[0-9a-f]{40}$/);
    expect(progress[0]).toEqual({ mcVersion: VERSION, phase: 'reading', done: 0, total: 1 });
    expect(progress.at(-1)?.phase).toBe('done');
    const writing = progress.filter((p) => p.phase === 'writing');
    expect(writing.at(-1)).toMatchObject({ done: info.fileCount + 1, total: info.fileCount + 1 });

    // The cache lives under <msmHome>/cache/assets/<version>/.
    const cached = await readFile(
      join(msmHome, 'cache', 'assets', VERSION, 'assets', 'minecraft', 'lang', 'en_us.json'),
    );
    expect(new Uint8Array(cached)).toEqual(KEPT_ENTRIES['assets/minecraft/lang/en_us.json']);

    expect((await service.status(VERSION)).cache).toEqual(info);
    for (const [path, data] of Object.entries(KEPT_ENTRIES)) {
      expect(await service.readAsset(VERSION, path)).toEqual(data);
    }
    expect(await service.readAsset(VERSION, 'assets/minecraft/models/block/none.json')).toBeNull();

    expect(await service.listAssets(VERSION, 'assets/minecraft/textures/')).toEqual([
      'assets/minecraft/textures/block/msm_test.png',
    ]);
    expect(await service.listAssets(VERSION, 'assets/minecraft/models/block/msm')).toEqual([
      'assets/minecraft/models/block/msm_test_cube.json',
    ]);
    expect(await service.listAssets(VERSION, '')).toEqual(Object.keys(KEPT_ENTRIES).sort());
  });

  it('re-uses the cache for the same jar and re-extracts when the jar changes', async () => {
    await installJar(VERSION, buildSyntheticJar());
    const first = await service.extract(VERSION);

    const progress: MinecraftProgress[] = [];
    const again = await service.extract(VERSION, (p) => progress.push(p));
    expect(again).toEqual(first);
    expect(progress.some((p) => p.phase === 'extracting')).toBe(false);

    const { zipSync, strToU8 } = await import('fflate');
    await installJar(
      VERSION,
      zipSync({ 'assets/minecraft/lang/en_us.json': strToU8('{"a":"b"}') }),
    );
    const changed = await service.extract(VERSION);
    expect(changed.jarSha1).not.toBe(first.jarSha1);
    expect(changed.fileCount).toBe(1);
    // Files from the old jar do not linger.
    expect(
      await service.readAsset(VERSION, 'assets/minecraft/textures/block/msm_test.png'),
    ).toBeNull();
  });

  it('shares one extraction between concurrent calls', async () => {
    await installJar(VERSION, buildSyntheticJar());
    const [a, b] = await Promise.all([service.extract(VERSION), service.extract(VERSION)]);
    expect(a).toBe(b);
  });

  it('serves only preview asset paths', async () => {
    expect(() => assertPreviewAssetPath('assets/minecraft/models/block/a.json')).not.toThrow();
    for (const path of [
      '../cache.json',
      'cache.json',
      'assets/minecraft/lang/de_de.json',
      'assets/minecraft/textures/entity/a.png',
      '/etc/passwd',
      'assets\\minecraft\\lang\\en_us.json',
    ]) {
      await expect(service.readAsset(VERSION, path)).rejects.toThrow();
    }
    await expect(service.listAssets(VERSION, '../')).rejects.toThrow(/prefix/);
    await expect(service.status('../x')).rejects.toThrow();
  });

  it('installs resource packs into the resourcepacks folder', async () => {
    const data = new Uint8Array([0x50, 0x4b, 5, 6]);
    const { path } = await service.installResourcePack('Demo Pack.zip', data);
    expect(path).toBe(join(minecraftDir, 'resourcepacks', 'Demo Pack.zip'));
    expect(new Uint8Array(await readFile(path))).toEqual(data);
    await expect(service.installResourcePack('../evil.zip', data)).rejects.toThrow(/file name/);
    await expect(service.installResourcePack('pack.jar', data)).rejects.toThrow(/file name/);
  });

  it('refuses to install without a Minecraft folder', async () => {
    const none = createMinecraftService({
      msmHome,
      fs: createNodeInstallFileSystem(),
      minecraftDir: async () => null,
    });
    await expect(none.installResourcePack('a.zip', new Uint8Array())).rejects.toThrow(
      /No Minecraft folder/,
    );
    expect((await none.status(VERSION)).minecraftDir).toBeNull();
  });
});
