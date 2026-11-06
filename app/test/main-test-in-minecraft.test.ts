import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Downloader } from '@msm/interop';
import { createNodeInstallFileSystem } from '@msm/interop/node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocationResolver } from '../src/main/platform/locations';
import { createSettingsStore, type SettingsStore } from '../src/main/platform/settings';
import {
  builtInFabricFacts,
  createTestInMinecraftService,
  type TestInMinecraftService,
} from '../src/main/platform/test-in-minecraft';
import { InvokeChannels, ipcContract } from '../src/shared/ipc-contract';
import { type FakeMmcRoot, makeMmcRoot, makeOfficialDir } from './helpers/fake-launchers';

/** Made-up versions; tests never name a real Minecraft version. */
const VERSION = '9.9-msm-test';
const FACTS = { mcVersion: VERSION, loader: '0.20.1', api: '0.1.0+9.9' };
const FABRIC = 'net.fabricmc.fabric-loader';
const API_JAR = new TextEncoder().encode('fake fabric api');
const statusSchema = ipcContract[InvokeChannels.testInMinecraftStatus].response;
const runSchema = ipcContract[InvokeChannels.testInMinecraftRun].response;

let temp: string;
let prism: FakeMmcRoot;
let settings: SettingsStore;
let downloads: string[];
let spawned: { program: string; args: readonly string[] }[];
let picked: string | null;
let service: TestInMinecraftService;

const download: Downloader = async (url) => {
  downloads.push(url);
  if (url.endsWith('.sha512')) {
    return new TextEncoder().encode(createHash('sha512').update(API_JAR).digest('hex'));
  }
  return API_JAR;
};

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-main-test-mc-'));
  downloads = [];
  spawned = [];
  picked = null;
  const officialDir = await makeOfficialDir(join(temp, 'official'));
  prism = await makeMmcRoot(join(temp, 'prism'), {
    instances: [
      {
        folder: 'fabric-inst',
        name: 'Fabric Instance',
        mcVersion: VERSION,
        loader: { uid: FABRIC, version: '0.20.1' },
      },
      { folder: 'vanilla', mcVersion: VERSION },
    ],
  });
  const env = { platform: 'linux', home: join(temp, 'home') };
  settings = createSettingsStore({ msmHome: join(temp, 'msm-home'), installEnv: env });
  await settings.set({
    minecraftDir: officialDir,
    launchers: { prismDataDirs: [prism.root], multimcRoots: [], curseForgeRoots: [] },
  });
  const fs = createNodeInstallFileSystem();
  service = createTestInMinecraftService({
    fs,
    env,
    locations: createLocationResolver({ fs, env, settings }),
    settings,
    cacheDir: join(temp, 'user-data', 'downloads'),
    download,
    facts: () => FACTS,
    spawnLauncher: async (program, args) => {
      spawned.push({ program, args });
    },
    pickProgram: async () => picked,
  });
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

const select = (instance: string) =>
  settings.set({ installTarget: { launcher: 'prism', root: prism.root, instance } });

describe('Test in Minecraft service', () => {
  it('reads the built-in target facts', () => {
    const facts = builtInFabricFacts('mc-26.3');
    expect(facts.mcVersion).toBe('26.3');
    expect(facts.loader).toMatch(/^\d+\.\d+/);
    expect(() => builtInFabricFacts('mc-0.0')).toThrow(/Unknown target/);
  });

  it('makes the official folder install-only and offers the managed instance', async () => {
    const status = await service.status('t');
    expect(statusSchema.parse(status)).toEqual(status);
    expect(status).toMatchObject({
      mode: 'install-only',
      managedInstanceName: `MCSuperMods Test (${VERSION})`,
      managedInstanceSelected: false,
      canCreateInstance: true,
    });
  });

  it('blocks a vanilla instance with the reason', async () => {
    await select('vanilla');
    const status = await service.status('t');
    expect(status.mode).toBe('blocked');
    expect(status.reason).toMatch(/does not run Fabric Loader/);
    await expect(service.run('t', 'ruby', new Uint8Array([1]))).rejects.toThrow(
      /does not run Fabric Loader/,
    );
  });

  it('installs into a Fabric instance and records only its own files', async () => {
    await select('fabric-inst');
    const mods = join(prism.instanceDir('fabric-inst'), 'minecraft', 'mods');
    await mkdir(mods, { recursive: true });
    await writeFile(join(mods, 'someone-elses.jar'), 'keep me');

    const status = await service.status('t');
    expect(status).toMatchObject({ mode: 'launch', launcherProgram: null });
    const result = await service.run('t', 'ruby', new Uint8Array([1, 2]));
    expect(runSchema.parse(result)).toEqual(result);
    expect(result).toMatchObject({
      jarPath: join(mods, 'ruby.jar'),
      fabricApi: 'installed',
      fabricApiFile: 'fabric-api-0.1.0+9.9.jar',
      launched: false,
    });
    expect(result.note).toMatch(/Prism Launcher was not found/);
    expect((await readdir(mods)).sort()).toEqual([
      '.msm-installed.json',
      'fabric-api-0.1.0+9.9.jar',
      'ruby.jar',
      'someone-elses.jar',
    ]);
    expect(await readFile(join(mods, 'someone-elses.jar'), 'utf8')).toBe('keep me');
    expect(downloads).toHaveLength(2);

    // A second run replaces its own jar and reuses Fabric API without downloading.
    const again = await service.run('t', 'ruby', new Uint8Array([3]));
    expect(again).toMatchObject({ replaced: true, fabricApi: 'present' });
    expect(downloads).toHaveLength(2);
  });

  it('launches with the chosen launcher program', async () => {
    await select('fabric-inst');
    const program = join(temp, 'bin', 'prismlauncher');
    await mkdir(join(temp, 'bin'));
    await writeFile(program, '');
    picked = program;
    expect(await service.pickLauncherProgram('prism')).toBe(program);
    expect((await settings.launcherPrograms()).prism).toBe(program);
    const result = await service.run('t', 'ruby', new Uint8Array([1]));
    expect(result.launched).toBe(true);
    expect(spawned).toEqual([{ program, args: ['--dir', prism.root, '--launch', 'fabric-inst'] }]);
  });

  it('creates the managed instance, selects it and launches it', async () => {
    const status = await service.createInstance('t');
    expect(status).toMatchObject({ mode: 'launch', managedInstanceSelected: true });
    expect(status.location?.displayName).toBe(`MCSuperMods Test (${VERSION})`);
    expect((await settings.installTarget())?.instance).toBe(`MCSuperMods Test (${VERSION})`);
    const pack = JSON.parse(
      await readFile(
        join(prism.instancesDir, `MCSuperMods Test (${VERSION})`, 'mmc-pack.json'),
        'utf8',
      ),
    );
    expect(pack.components.map((component: { uid: string }) => component.uid)).toEqual([
      'net.minecraft',
      FABRIC,
    ]);
    const result = await service.run('t', 'ruby', new Uint8Array([1]));
    expect(result.jarPath).toContain(join(`MCSuperMods Test (${VERSION})`, 'minecraft', 'mods'));
  });

  it('tests a modpack: every jar, the extra mods (cached, checked) and earlier jars removed', async () => {
    await select('fabric-inst');
    const mods = join(prism.instanceDir('fabric-inst'), 'minecraft', 'mods');
    await mkdir(mods, { recursive: true });
    await writeFile(join(mods, 'user-mod.jar'), 'mine');
    await service.run('t', 'old_project', new Uint8Array([9]));
    const extra = {
      projectId: 'AANobbMI',
      versionId: 'VERSION1',
      title: 'Sodium',
      fileName: 'sodium.jar',
      url: 'https://cdn.modrinth.com/data/AANobbMI/versions/VERSION1/sodium.jar',
      sha1: 'a'.repeat(40),
      sha512: createHash('sha512').update(API_JAR).digest('hex'),
      size: API_JAR.byteLength,
    };
    const jars = [
      { modId: 'ruby', data: new Uint8Array([1]) },
      { modId: 'golem', data: new Uint8Array([2]) },
    ];
    const result = await service.runModpack('t', jars, [extra]);
    expect(ipcContract[InvokeChannels.testInMinecraftRunModpack].response.parse(result)).toEqual(
      result,
    );
    expect(result).toMatchObject({
      installed: ['golem.jar', 'ruby.jar', 'sodium.jar'],
      removed: ['old_project.jar'],
      fabricApi: 'present',
    });
    expect((await readdir(mods)).sort()).toEqual([
      '.msm-installed.json',
      'fabric-api-0.1.0+9.9.jar',
      'golem.jar',
      'ruby.jar',
      'sodium.jar',
      'user-mod.jar',
    ]);
    const before = downloads.filter((url) => url === extra.url).length;
    await service.runModpack('t', jars, [extra]);
    expect(downloads.filter((url) => url === extra.url).length).toBe(before);
    await expect(
      service.runModpack('t', jars, [{ ...extra, fileName: 'x.jar', sha512: 'c'.repeat(128) }]),
    ).rejects.toThrow(/does not match its pinned checksum/);
    await expect(
      service.runModpack('t', jars, [{ ...extra, url: 'https://example.com/x.jar' }]),
    ).rejects.toThrow(/Modrinth/);
  });

  it('settings never leak launcher programs into the renderer view', async () => {
    await settings.setLauncherProgram('multimc', join(temp, 'MultiMC'));
    const view = await settings.get();
    expect(view).not.toHaveProperty('launcherPrograms');
    expect(ipcContract[InvokeChannels.settingsGet].response.safeParse(view).success).toBe(true);
    await expect(settings.setLauncherProgram('prism', 'relative/prism')).rejects.toThrow(
      /absolute/,
    );
  });
});
