import { mkdir, mkdtemp, readFile, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodeInstallFileSystem } from '@msm/interop/node';
import { NbtCompound, NbtFile, NbtString } from 'deepslate/nbt';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocationResolver } from '../src/main/platform/locations';
import { createMinecraftService, type MinecraftService } from '../src/main/platform/minecraft';
import { createSettingsStore } from '../src/main/platform/settings';
import { InvokeChannels, ipcContract } from '../src/shared/ipc-contract';

let temp: string;
let minecraftDir: string;
let service: MinecraftService;

/** A synthetic gzip `level.dat` (never a Mojang file) with `Data.LevelName`. */
function levelDat(levelName: string): Uint8Array {
  const root = new NbtCompound().set(
    'Data',
    new NbtCompound().set('LevelName', new NbtString(levelName)),
  );
  return new NbtFile('', root, 'gzip', false, undefined).write();
}

async function makeWorld(
  dir: string,
  mtime: Date | null,
  contents: Uint8Array = new Uint8Array([0]),
): Promise<void> {
  const world = join(minecraftDir, 'saves', dir);
  await mkdir(world, { recursive: true });
  if (mtime !== null) {
    await writeFile(join(world, 'level.dat'), contents);
    await utimes(join(world, 'level.dat'), mtime, mtime);
  }
}

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-main-worlds-'));
  minecraftDir = join(temp, 'minecraft');
  await mkdir(minecraftDir, { recursive: true });
  service = await serviceFor(join(temp, 'msm-home'), minecraftDir);
});

async function serviceFor(msmHome: string, dir: string | null): Promise<MinecraftService> {
  const fs = createNodeInstallFileSystem();
  const installEnv = { platform: 'linux', home: join(temp, 'home') };
  const settings = createSettingsStore({ msmHome, installEnv });
  if (dir !== null) await settings.set({ minecraftDir: dir });
  return createMinecraftService({
    msmHome,
    fs,
    locations: createLocationResolver({ fs, env: installEnv, settings }),
  });
}

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

describe('world listing', () => {
  it('lists folders with level.dat, most recent first', async () => {
    await makeWorld('Older', new Date('2026-01-01T00:00:00Z'));
    await makeWorld('Newer', new Date('2026-02-01T00:00:00Z'));
    await makeWorld('No level', null);
    await writeFile(join(minecraftDir, 'saves', 'stray.txt'), 'x');
    const worlds = await service.listWorlds();
    expect(worlds).toEqual([
      { dir: 'Newer', name: 'Newer', lastModified: '2026-02-01T00:00:00.000Z' },
      { dir: 'Older', name: 'Older', lastModified: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(ipcContract[InvokeChannels.minecraftListWorlds].response.parse(worlds)).toEqual(worlds);
  });

  it('names worlds from level.dat and falls back to the folder name', async () => {
    await makeWorld('New World (1)', new Date('2026-03-01T00:00:00Z'), levelDat('Castle Build'));
    await makeWorld('Broken', new Date('2026-02-01T00:00:00Z'), new Uint8Array([0x1f, 0x8b, 1]));
    await makeWorld('Blank', new Date('2026-01-01T00:00:00Z'), levelDat('  '));
    const worlds = await service.listWorlds();
    expect(worlds).toEqual([
      { dir: 'New World (1)', name: 'Castle Build', lastModified: '2026-03-01T00:00:00.000Z' },
      { dir: 'Broken', name: 'Broken', lastModified: '2026-02-01T00:00:00.000Z' },
      { dir: 'Blank', name: 'Blank', lastModified: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(ipcContract[InvokeChannels.minecraftListWorlds].response.parse(worlds)).toEqual(worlds);
  });

  it('returns nothing without saves and refuses without a Minecraft folder', async () => {
    expect(await service.listWorlds()).toEqual([]);
    const none = await serviceFor(join(temp, 'other-home'), null);
    await expect(none.listWorlds()).rejects.toThrow(/No Minecraft folder/);
  });
});

describe('data pack install', () => {
  const data = new Uint8Array([80, 75, 5, 6]);

  it('writes into the world datapacks folder', async () => {
    await makeWorld('My World', new Date());
    const { path } = await service.installDataPack('My World', 'demo-data.zip', data);
    expect(path).toBe(join(minecraftDir, 'saves', 'My World', 'datapacks', 'demo-data.zip'));
    expect(new Uint8Array(await readFile(path))).toEqual(data);
    // Installing again replaces the file.
    await service.installDataPack('My World', 'demo-data.zip', new Uint8Array([1]));
    expect(new Uint8Array(await readFile(path))).toEqual(new Uint8Array([1]));
  });

  it('validates the world folder and file name', async () => {
    await makeWorld('W', new Date());
    for (const worldDir of ['..', '.', '', 'W/../W', 'a\\b', 'C:W']) {
      await expect(service.installDataPack(worldDir, 'p.zip', data)).rejects.toThrow(
        /world folder name/,
      );
    }
    await expect(service.installDataPack('Missing', 'p.zip', data)).rejects.toThrow(
      /does not exist/,
    );
    for (const name of ['../p.zip', 'p.jar', 'a/p.zip']) {
      await expect(service.installDataPack('W', name, data)).rejects.toThrow(/file name/);
    }
  });

  it.skipIf(process.platform === 'win32')('refuses a world symlinked outside saves', async () => {
    await mkdir(join(minecraftDir, 'saves'), { recursive: true });
    const outside = join(temp, 'outside');
    await mkdir(outside);
    await symlink(outside, join(minecraftDir, 'saves', 'Linked'));
    await expect(service.installDataPack('Linked', 'p.zip', data)).rejects.toThrow(
      /outside the saves folder/,
    );
  });
});
