import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { createNodeInstallFileSystem } from '@msm/interop/node';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocationResolver } from '../src/main/platform/locations';
import {
  BACKUP_FAILED_MESSAGE,
  createMinecraftService,
  type MinecraftService,
} from '../src/main/platform/minecraft';
import { createSettingsStore, type SettingsStore } from '../src/main/platform/settings';
import {
  backupStamp,
  createWorldBackupService,
  locationSlug,
} from '../src/main/platform/world-backups';
import { InvokeChannels, ipcContract } from '../src/shared/ipc-contract';

let temp: string;
let minecraftDir: string;
let msmHome: string;
let settings: SettingsStore;
let clock: Date;
let reads: ((path: string) => Promise<void>) | null;

const WORLD = 'My World';
const pack = new Uint8Array([80, 75, 5, 6]);

/** Every file under `dir` as `relative path -> bytes`, plus folders as `path/ -> empty`. */
async function tree(dir: string, base = dir): Promise<Record<string, Uint8Array>> {
  const out: Record<string, Uint8Array> = {};
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const rel = relative(base, path).split('\\').join('/');
    if (entry.isDirectory()) {
      out[`${rel}/`] = new Uint8Array(0);
      Object.assign(out, await tree(path, base));
    } else if (entry.isFile()) {
      out[rel] = new Uint8Array(await readFile(path));
    }
  }
  return out;
}

async function makeWorld(dir = WORLD): Promise<string> {
  const world = join(minecraftDir, 'saves', dir);
  await mkdir(join(world, 'region'), { recursive: true });
  await mkdir(join(world, 'DIM-1', 'region'), { recursive: true });
  await mkdir(join(world, 'empty'), { recursive: true });
  await writeFile(join(world, 'level.dat'), new Uint8Array([0x1f, 0x8b, 8, 0, 1, 2, 3]));
  await writeFile(join(world, 'region', 'r.0.0.mca'), new Uint8Array(9000).fill(7));
  await writeFile(join(world, 'DIM-1', 'region', 'r.-1.0.mca'), new Uint8Array([1, 2, 3]));
  await writeFile(join(world, 'notes.json'), '{"a": 1}\n'.repeat(200));
  await writeFile(join(world, 'session.lock'), '☃');
  return world;
}

function service(): MinecraftService {
  const fs = createNodeInstallFileSystem();
  const installEnv = { platform: 'linux', home: join(temp, 'home') };
  return createMinecraftService({
    msmHome,
    fs,
    locations: createLocationResolver({ fs, env: installEnv, settings }),
    backups: createWorldBackupService({
      msmHome,
      settings,
      now: () => clock,
      readFile: async (path) => {
        await reads?.(path);
        return new Uint8Array(await readFile(path));
      },
    }),
  });
}

/** The backups folder of `WORLD` in the official location. */
function worldBackupDir(): string {
  return join(
    msmHome,
    'backups',
    locationSlug({ launcher: 'official', root: minecraftDir }),
    WORLD,
  );
}

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-world-backups-'));
  minecraftDir = join(temp, 'minecraft');
  msmHome = join(temp, 'msm-home');
  await mkdir(join(minecraftDir, 'saves'), { recursive: true });
  settings = createSettingsStore({
    msmHome,
    installEnv: { platform: 'linux', home: join(temp, 'home') },
  });
  await settings.set({ minecraftDir });
  clock = new Date(2026, 10, 21, 10, 5, 9);
  reads = null;
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

describe('backups before a data pack install', () => {
  it('zips the whole world folder before installing and names the backup', async () => {
    const world = await makeWorld();
    const result = await service().installDataPack(WORLD, 'demo-data.zip', pack);
    const stamp = backupStamp(clock);
    expect(stamp).toBe('2026-11-21_10-05-09');
    expect(result.backup).toEqual({
      path: join(worldBackupDir(), `${stamp}.zip`),
      fileName: `${stamp}.zip`,
      location: locationSlug({ launcher: 'official', root: minecraftDir }),
      worldDir: WORLD,
    });
    expect(ipcContract[InvokeChannels.minecraftInstallDataPack].response.parse(result)).toEqual(
      result,
    );
    // The pack went in after the backup, so the backup does not hold it.
    expect(await readFile(join(world, 'datapacks', 'demo-data.zip'))).toEqual(Buffer.from(pack));
    const zipped = unzipSync(new Uint8Array(await readFile(result.backup?.path ?? '')));
    const expected = await tree(world);
    delete expected['session.lock'];
    delete expected['datapacks/'];
    delete expected['datapacks/demo-data.zip'];
    const prefixed = Object.fromEntries(
      Object.entries(expected).map(([name, data]) => [`${WORLD}/${name}`, data]),
    );
    expect(zipped).toEqual({ [`${WORLD}/`]: new Uint8Array(0), ...prefixed });
  });

  it('writes the zip through a temporary file and renames it into place', async () => {
    await makeWorld();
    const final = join(worldBackupDir(), `${backupStamp(clock)}.zip`);
    let checked = 0;
    reads = async () => {
      checked += 1;
      await expect(stat(final)).rejects.toThrow();
      const names = await readdir(worldBackupDir());
      expect(names.some((name) => name.endsWith('.tmp'))).toBe(true);
    };
    await service().installDataPack(WORLD, 'p.zip', pack);
    expect(checked).toBeGreaterThan(0);
    expect(await readdir(worldBackupDir())).toEqual([`${backupStamp(clock)}.zip`]);
  });

  it('keeps the newest backups per world and deletes the oldest after a new one', async () => {
    await makeWorld();
    await settings.set({ backups: { beforeInstall: true, keep: 2 } });
    const minecraft = service();
    const names: string[] = [];
    for (const minute of [1, 2, 3]) {
      clock = new Date(2026, 10, 21, 10, minute, 0);
      names.push((await minecraft.installDataPack(WORLD, 'p.zip', pack)).backup?.fileName ?? '');
    }
    expect((await readdir(worldBackupDir())).sort()).toEqual(names.slice(1).sort());
    // Two installs in the same second get two backups.
    const again = await minecraft.installDataPack(WORLD, 'p.zip', pack);
    expect(again.backup?.fileName).toBe('2026-11-21_10-03-00-2.zip');
    expect((await readdir(worldBackupDir())).sort()).toEqual([
      '2026-11-21_10-03-00-2.zip',
      '2026-11-21_10-03-00.zip',
    ]);
  });

  it('stops the install with the reason when the backup fails, keeping older backups', async () => {
    const world = await makeWorld();
    const minecraft = service();
    const first = await minecraft.installDataPack(WORLD, 'old.zip', pack);
    await rm(join(world, 'datapacks'), { recursive: true });
    clock = new Date(2026, 10, 21, 11, 0, 0);
    reads = async (path) => {
      if (path.endsWith('r.0.0.mca')) throw new Error('The file is in use.');
    };
    await expect(minecraft.installDataPack(WORLD, 'new.zip', pack)).rejects.toThrow(
      `${BACKUP_FAILED_MESSAGE}: The file is in use.`,
    );
    await expect(stat(join(world, 'datapacks'))).rejects.toThrow();
    expect(await readdir(worldBackupDir())).toEqual([first.backup?.fileName]);
  });

  it('skips the backup when the setting is off', async () => {
    const world = await makeWorld();
    await settings.set({ backups: { beforeInstall: false, keep: 5 } });
    const result = await service().installDataPack(WORLD, 'p.zip', pack);
    expect(result.backup).toBeNull();
    await expect(stat(join(msmHome, 'backups'))).rejects.toThrow();
    expect(await readdir(join(world, 'datapacks'))).toEqual(['p.zip']);
  });

  it('refuses a world outside the game folder before backing anything up', async () => {
    const outside = join(temp, 'elsewhere', 'World');
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, 'level.dat'), 'x');
    await symlink(outside, join(minecraftDir, 'saves', 'Linked'), 'dir');
    await expect(service().installDataPack('Linked', 'p.zip', pack)).rejects.toThrow(
      /outside the saves folder/,
    );
    await expect(stat(join(msmHome, 'backups'))).rejects.toThrow();
  });

  it('does not follow symbolic links inside the world', async () => {
    const world = await makeWorld();
    await writeFile(join(temp, 'secret.txt'), 'private');
    await symlink(join(temp, 'secret.txt'), join(world, 'link.txt'));
    const { backup } = await service().installDataPack(WORLD, 'p.zip', pack);
    const zipped = unzipSync(new Uint8Array(await readFile(backup?.path ?? '')));
    expect(Object.keys(zipped)).not.toContain(`${WORLD}/link.txt`);
  });
});

describe('listing and restoring backups', () => {
  it('lists backups per world, newest first, named by the game location', async () => {
    await makeWorld();
    const minecraft = service();
    await minecraft.installDataPack(WORLD, 'p.zip', pack);
    clock = new Date(2026, 10, 21, 12, 0, 0);
    await minecraft.installDataPack(WORLD, 'p.zip', pack);
    const list = await minecraft.listWorldBackups();
    expect(list.folder).toBe(join(msmHome, 'backups'));
    expect(list.groups).toHaveLength(1);
    expect(list.groups[0]).toMatchObject({
      locationName: 'Official launcher',
      available: true,
      worldDir: WORLD,
    });
    expect(list.groups[0]?.backups.map((entry) => entry.fileName)).toEqual([
      '2026-11-21_12-00-00.zip',
      '2026-11-21_10-05-09.zip',
    ]);
    expect(ipcContract[InvokeChannels.worldBackupsList].response.parse(list)).toEqual(list);
  });

  it('restores beside the world, never over it', async () => {
    const world = await makeWorld();
    const minecraft = service();
    const { backup } = await minecraft.installDataPack(WORLD, 'p.zip', pack);
    if (backup === null) throw new Error('No backup.');
    const before = await tree(world);
    // The live world changes after the backup.
    await writeFile(join(world, 'notes.json'), 'changed');
    clock = new Date(2026, 10, 21, 13, 14, 15);
    const request = { location: backup.location, worldDir: WORLD, fileName: backup.fileName };
    const restored = await minecraft.restoreWorldBackup(request);
    expect(restored.dir).toBe(`${WORLD}-restored-2026-11-21_13-14-15`);
    expect(restored.path).toBe(join(await realSaves(), restored.dir));
    const back = await tree(restored.path);
    const expected = { ...before };
    delete expected['session.lock'];
    delete expected['datapacks/'];
    delete expected['datapacks/p.zip'];
    expect(back).toEqual(expected);
    // The live world is as it was before the restore.
    expect(await readFile(join(world, 'notes.json'), 'utf8')).toBe('changed');
    expect(await readFile(join(world, 'session.lock'), 'utf8')).toBe('☃');
    // A second restore in the same second gets its own folder.
    const second = await minecraft.restoreWorldBackup(request);
    expect(second.dir).toBe(`${WORLD}-restored-2026-11-21_13-14-15-2`);
    const saves = await readdir(join(minecraftDir, 'saves'));
    expect(saves.filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('refuses requests that leave the backups folder and unsafe zip entries', async () => {
    await makeWorld();
    const minecraft = service();
    const { backup } = await minecraft.installDataPack(WORLD, 'p.zip', pack);
    if (backup === null) throw new Error('No backup.');
    await expect(
      minecraft.restoreWorldBackup({ location: '..', worldDir: WORLD, fileName: backup.fileName }),
    ).rejects.toThrow(/not a world backup/);
    await expect(
      minecraft.restoreWorldBackup({ ...backup, fileName: '../../x.zip' }),
    ).rejects.toThrow(/not a world backup/);
    // A planted zip with a path that climbs out of the restore folder.
    const evil = join(worldBackupDir(), '2026-01-01_00-00-00.zip');
    await writeFile(
      evil,
      zipSync({
        [`${WORLD}/level.dat`]: strToU8('x'),
        [`${WORLD}/../../escape.txt`]: strToU8('x'),
      }),
    );
    await expect(
      minecraft.restoreWorldBackup({
        location: backup.location,
        worldDir: WORLD,
        fileName: '2026-01-01_00-00-00.zip',
      }),
    ).rejects.toThrow(/unsafe entry/);
    const saves = await readdir(join(minecraftDir, 'saves'));
    expect(saves).toEqual([WORLD]);
    await expect(stat(join(minecraftDir, 'escape.txt'))).rejects.toThrow();
  });
});

async function realSaves(): Promise<string> {
  const { realpath } = await import('node:fs/promises');
  return realpath(join(minecraftDir, 'saves'));
}
