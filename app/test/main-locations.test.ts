import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodeInstallFileSystem } from '@msm/interop/node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocationResolver, type LocationResolver } from '../src/main/platform/locations';
import {
  createMinecraftService,
  GAME_DIR_MISSING_MESSAGE,
  type MinecraftService,
} from '../src/main/platform/minecraft';
import { createSettingsStore, type SettingsStore } from '../src/main/platform/settings';
import type { MinecraftProgress } from '../src/shared/ipc-channels';
import { InvokeChannels, ipcContract } from '../src/shared/ipc-contract';
import type { GameLocationRef } from '../src/shared/platform';
import {
  type FakeCurseForgeRoot,
  type FakeMmcRoot,
  linkDir,
  makeCurseForgeRoot,
  makeMmcRoot,
  makeOfficialDir,
  makeWorld,
} from './helpers/fake-launchers';
import { buildSyntheticJar } from './helpers/synthetic-jar';

/** Made-up version ids; tests never name a real Minecraft version. */
const VERSION = '9.9-msm-test';
const OTHER = '9.8-msm-test';
const FABRIC = 'net.fabricmc.fabric-loader';
const symlinks = process.platform !== 'win32';

let temp: string;
let msmHome: string;
let officialDir: string;
let prism: FakeMmcRoot;
let curse: FakeCurseForgeRoot;
let settings: SettingsStore;
let resolver: LocationResolver;
let service: MinecraftService;

const prismRef = (instance: string): GameLocationRef => ({
  launcher: 'prism',
  root: prism.root,
  instance,
});
const curseRef = (instance: string): GameLocationRef => ({
  launcher: 'curseforge',
  root: curse.root,
  instance,
});

const statusSchema = ipcContract[InvokeChannels.minecraftStatus].response;
const listSchema = ipcContract[InvokeChannels.minecraftListLocations].response;

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-main-locations-'));
  msmHome = join(temp, 'msm-home');
  officialDir = await makeOfficialDir(join(temp, 'official'), { worlds: ['Official World'] });
  prism = await makeMmcRoot(join(temp, 'prism'), {
    instances: [
      {
        folder: 'fabric-inst',
        name: 'Fabric Instance',
        mcVersion: VERSION,
        loader: { uid: FABRIC, version: '0.1' },
        worlds: ['Prism World'],
      },
      { folder: 'dotted', mcVersion: VERSION, gameFolder: '.minecraft' },
      { folder: 'older', mcVersion: OTHER },
      { folder: 'fresh', mcVersion: VERSION, gameFolder: null },
    ],
  });
  curse = await makeCurseForgeRoot(join(temp, 'curseforge'), {
    instances: [{ folder: 'CF Pack', name: 'My CF Pack', gameVersion: VERSION, worlds: ['CF'] }],
  });
  const installEnv = { platform: 'linux', home: join(temp, 'home') };
  settings = createSettingsStore({ msmHome, installEnv });
  await settings.set({
    minecraftDir: officialDir,
    launchers: { prismDataDirs: [prism.root], multimcRoots: [], curseForgeRoots: [curse.root] },
  });
  const fs = createNodeInstallFileSystem();
  resolver = createLocationResolver({ fs, env: installEnv, settings });
  service = createMinecraftService({
    msmHome,
    fs,
    locations: resolver,
    now: () => '2026-01-01T00:00:00.000Z',
  });
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

describe('location resolver', () => {
  it('lists every location as views with ids, warnings and the official default', async () => {
    const list = await service.listLocations(VERSION);
    expect(listSchema.parse(list)).toEqual(list);
    expect(list.selected).toBe('official:default');
    expect(list.locations.map((location) => location.id)).toEqual([
      'official:default',
      'prism:dotted',
      'prism:fabric-inst',
      'prism:fresh',
      'prism:older',
      'curseforge:CF_Pack',
    ]);
    const fabric = list.locations.find((location) => location.id === 'prism:fabric-inst');
    expect(fabric).toEqual({
      ref: prismRef('fabric-inst'),
      id: 'prism:fabric-inst',
      displayName: 'Fabric Instance',
      mcVersion: VERSION,
      loader: { kind: 'fabric', version: '0.1' },
      gameDir: prism.gameDir('fabric-inst'),
      modsDir: join(prism.gameDir('fabric-inst'), 'mods'),
      problems: [],
      warnings: [],
    });
    // No `instanceDir` leaks into the view.
    expect(Object.keys(fabric ?? {})).not.toContain('instanceDir');
    const older = list.locations.find((location) => location.id === 'prism:older');
    expect(older?.warnings).toEqual([
      {
        code: 'location.version-mismatch',
        message: `This instance runs Minecraft ${OTHER}; the project targets ${VERSION}.`,
      },
    ]);
    const cf = list.locations.find((location) => location.id === 'curseforge:CF_Pack');
    expect(cf).toMatchObject({ displayName: 'My CF Pack', gameDir: curse.gameDir('CF Pack') });
  });

  it('selects the stored target and falls back to the official folder when it is gone', async () => {
    await settings.set({ installTarget: prismRef('older') });
    let status = await service.status(VERSION);
    expect(statusSchema.parse(status)).toEqual(status);
    expect(status.target?.id).toBe('prism:older');
    expect(status.targetMissing).toBe(false);
    expect(status.minecraftDir).toBe(prism.gameDir('older'));
    expect(status.warnings).toEqual([
      {
        code: 'location.version-mismatch',
        message: `This instance runs Minecraft ${OTHER}; the project targets ${VERSION}.`,
      },
    ]);
    expect((await service.listLocations(VERSION)).selected).toBe('prism:older');

    await rm(prism.instanceDir('older'), { recursive: true });
    status = await service.status(VERSION);
    expect(statusSchema.parse(status)).toEqual(status);
    expect(status.target?.id).toBe('official:default');
    expect(status.targetMissing).toBe(true);
    expect(status.warnings).toEqual([]);
    expect((await resolver.selected()).targetMissing).toBe(true);
  });

  it('selects nothing without an official folder or a stored target', async () => {
    await settings.set({ minecraftDir: join(temp, 'no-such-folder') });
    const list = await service.listLocations(VERSION);
    expect(list.selected).toBeNull();
    expect(list.locations[0]?.id).toBe('prism:dotted');
    await expect(service.installResourcePack('a.zip', new Uint8Array())).rejects.toThrow(
      'No Minecraft folder or launcher instance was found. Choose one in Settings.',
    );
  });
});

describe('client jar from launcher stores', () => {
  it('reports and extracts from the Prism library store', async () => {
    await makeMmcRoot(prism.root, { instances: [], jars: { [VERSION]: buildSyntheticJar() } });
    await settings.set({ installTarget: prismRef('fabric-inst') });
    const status = await service.status(VERSION);
    expect(status.installed).toEqual([{ id: VERSION }]);
    expect(status.chosen).toEqual({ id: VERSION });
    expect(status.jar).toEqual({ versionId: VERSION, launcher: 'prism' });
    const info = await service.extract(VERSION);
    expect(info.version).toBe(VERSION);
    expect((await service.status(VERSION)).cache).toEqual(info);
  });

  it('reports and extracts from the CurseForge Install/versions store', async () => {
    await makeCurseForgeRoot(curse.root, {
      instances: [],
      jars: { [VERSION]: buildSyntheticJar() },
    });
    await settings.set({ installTarget: curseRef('CF Pack') });
    const status = await service.status(VERSION);
    expect(status.jar).toEqual({ versionId: VERSION, launcher: 'curseforge' });
    expect(status.chosen).toEqual({ id: VERSION });
    expect((await service.extract(VERSION)).version).toBe(VERSION);
  });

  it('falls back to another store when the selected one lacks the version', async () => {
    await makeOfficialDir(officialDir, { jars: { [VERSION]: buildSyntheticJar() } });
    await settings.set({ installTarget: prismRef('fabric-inst') });
    const status = await service.status(VERSION);
    expect(status.installed).toEqual([]);
    expect(status.chosen).toBeNull();
    expect(status.jar).toEqual({ versionId: VERSION, launcher: 'official' });
    expect((await service.extract(VERSION)).version).toBe(VERSION);
  });

  it('re-uses the cache when another store serves the same jar after a target switch', async () => {
    const jar = buildSyntheticJar();
    await makeMmcRoot(prism.root, { instances: [], jars: { [VERSION]: jar } });
    await makeCurseForgeRoot(curse.root, { instances: [], jars: { [VERSION]: jar } });
    await settings.set({ installTarget: prismRef('fabric-inst') });
    const first = await service.extract(VERSION);

    await settings.set({ installTarget: curseRef('CF Pack') });
    expect((await service.status(VERSION)).jar?.launcher).toBe('curseforge');
    const progress: MinecraftProgress[] = [];
    const again = await service.extract(VERSION, (p) => progress.push(p));
    expect(again).toEqual(first);
    expect(progress.some((p) => p.phase === 'extracting')).toBe(false);
  });

  it('says so when no store holds the version', async () => {
    await expect(service.extract(VERSION)).rejects.toThrow(/not installed in any launcher/);
  });
});

describe('installs into the selected location', () => {
  const data = new Uint8Array([0x50, 0x4b, 5, 6]);

  it('installs resource packs into Prism, .minecraft and CurseForge game folders', async () => {
    await settings.set({ installTarget: prismRef('fabric-inst') });
    let { path } = await service.installResourcePack('Pack.zip', data);
    expect(path).toBe(
      join(prism.instanceDir('fabric-inst'), 'minecraft', 'resourcepacks', 'Pack.zip'),
    );
    expect(new Uint8Array(await readFile(path))).toEqual(data);

    await settings.set({ installTarget: prismRef('dotted') });
    ({ path } = await service.installResourcePack('Pack.zip', data));
    expect(path).toBe(join(prism.instanceDir('dotted'), '.minecraft', 'resourcepacks', 'Pack.zip'));

    await settings.set({ installTarget: curseRef('CF Pack') });
    ({ path } = await service.installResourcePack('Pack.zip', data));
    expect(path).toBe(join(curse.instancesDir, 'CF Pack', 'resourcepacks', 'Pack.zip'));

    await settings.set({ installTarget: null });
    ({ path } = await service.installResourcePack('Pack.zip', data));
    expect(path).toBe(join(officialDir, 'resourcepacks', 'Pack.zip'));
  });

  it('lists worlds and installs data packs in the instance', async () => {
    await settings.set({ installTarget: prismRef('fabric-inst') });
    expect((await service.listWorlds()).map((world) => world.dir)).toEqual(['Prism World']);
    const { path } = await service.installDataPack('Prism World', 'data.zip', data);
    expect(path).toBe(
      join(prism.gameDir('fabric-inst'), 'saves', 'Prism World', 'datapacks', 'data.zip'),
    );
    await expect(service.installDataPack('Official World', 'data.zip', data)).rejects.toThrow(
      /does not exist/,
    );

    await settings.set({ installTarget: curseRef('CF Pack') });
    expect((await service.listWorlds()).map((world) => world.dir)).toEqual(['CF']);
    const cf = await service.installDataPack('CF', 'data.zip', data);
    expect(cf.path).toBe(join(curse.gameDir('CF Pack'), 'saves', 'CF', 'datapacks', 'data.zip'));
  });

  it('refuses installs into an instance whose game folder does not exist yet', async () => {
    await settings.set({ installTarget: prismRef('fresh') });
    const status = await service.status(VERSION);
    expect(status.target?.problems.map((problem) => problem.code)).toEqual([
      'location.game-dir-missing',
    ]);
    await expect(service.installResourcePack('Pack.zip', data)).rejects.toThrow(
      GAME_DIR_MISSING_MESSAGE,
    );
    expect(GAME_DIR_MISSING_MESSAGE).toBe('Start the instance once so its game folder exists.');
    await expect(service.installDataPack('W', 'data.zip', data)).rejects.toThrow(
      GAME_DIR_MISSING_MESSAGE,
    );
    expect(await service.listWorlds()).toEqual([]);
  });
});

describe.skipIf(!symlinks)('containment', () => {
  const data = new Uint8Array([1]);

  it('skips an instance folder symlinked outside the instances folder', async () => {
    const outside = await makeMmcRoot(join(temp, 'elsewhere'), {
      instances: [{ folder: 'escaped', mcVersion: VERSION }],
    });
    await linkDir(outside.instanceDir('escaped'), join(prism.instancesDir, 'escaped'));
    const ids = (await service.listLocations(VERSION)).locations.map((location) => location.id);
    expect(ids).not.toContain('prism:escaped');
    await settings.set({ installTarget: prismRef('escaped') });
    const status = await service.status(VERSION);
    expect(status.targetMissing).toBe(true);
    expect(status.target?.id).toBe('official:default');
  });

  it('refuses a game folder symlinked outside its instance', async () => {
    const outside = join(temp, 'outside-game');
    await mkdir(outside);
    await makeWorld(outside, 'Linked World');
    await rm(prism.gameDir('fabric-inst'), { recursive: true });
    await linkDir(outside, prism.gameDir('fabric-inst'));
    await settings.set({ installTarget: prismRef('fabric-inst') });
    await expect(service.installResourcePack('Pack.zip', data)).rejects.toThrow(
      /outside its instance folder/,
    );
    await expect(service.listWorlds()).rejects.toThrow(/outside its instance folder/);
    await expect(service.installDataPack('Linked World', 'p.zip', data)).rejects.toThrow(
      /outside its instance folder/,
    );
  });

  it('refuses resourcepacks, saves and datapacks folders symlinked outside the game folder', async () => {
    const outside = join(temp, 'outside');
    await mkdir(join(outside, 'packs'), { recursive: true });
    await settings.set({ installTarget: curseRef('CF Pack') });
    await linkDir(join(outside, 'packs'), join(curse.gameDir('CF Pack'), 'resourcepacks'));
    await expect(service.installResourcePack('Pack.zip', data)).rejects.toThrow(
      /resourcepacks folder is outside the game folder/,
    );

    await mkdir(join(outside, 'datapacks'));
    await linkDir(
      join(outside, 'datapacks'),
      join(curse.gameDir('CF Pack'), 'saves', 'CF', 'datapacks'),
    );
    await expect(service.installDataPack('CF', 'p.zip', data)).rejects.toThrow(
      /datapacks folder is outside the game folder/,
    );

    await settings.set({ installTarget: prismRef('fabric-inst') });
    await makeWorld(join(outside, 'game'), 'Outer');
    await rm(join(prism.gameDir('fabric-inst'), 'saves'), { recursive: true });
    await linkDir(join(outside, 'game', 'saves'), join(prism.gameDir('fabric-inst'), 'saves'));
    await expect(service.listWorlds()).rejects.toThrow(/saves folder is outside the game folder/);
    await expect(service.installDataPack('Outer', 'p.zip', data)).rejects.toThrow(
      /saves folder is outside the game folder/,
    );
  });
});
