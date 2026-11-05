import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { builtInTargets, defaultTargetId } from '@msm/targets';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodePlatform } from '../src/main/platform/node-platform';
import {
  isRuntimeJarName,
  newestRuntimeJar,
  newestRuntimeJars,
  readRuntimeJar,
  resolveRuntimeJarPath,
  runtimeJarVersionKey,
  runtimeVersionKey,
  stagedRuntimeJarName,
} from '../src/main/platform/runtime-jar';

let temp: string;
let libs: string;
let resources: string;

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-runtime-jar-'));
  libs = join(temp, 'engine-mod', 'build', 'libs');
  resources = join(temp, 'resources');
  await mkdir(libs, { recursive: true });
  await mkdir(join(resources, 'runtime'), { recursive: true });
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

/** Writes `name` into the libs folder with a modification time `seconds` after the epoch. */
async function jar(name: string, seconds: number, contents = name): Promise<string> {
  const path = join(libs, name);
  await writeFile(path, contents);
  await utimes(path, seconds, seconds);
  return path;
}

describe('runtime version key', () => {
  it('is the mcVersion up to the first dash, which is the target id without mc-', () => {
    expect(runtimeVersionKey('26.3')).toBe('26.3');
    expect(runtimeVersionKey('26.4-snapshot-7')).toBe('26.4');
    for (const { target } of builtInTargets) {
      expect(`mc-${runtimeVersionKey(target.mcVersion)}`).toBe(target.id);
    }
  });

  it('names the staged jar msm_runtime-mc-<mc>.jar', () => {
    expect(stagedRuntimeJarName('26.4')).toBe('msm_runtime-mc-26.4.jar');
  });
});

describe('runtime jar names', () => {
  it('accepts Gradle runtime jars with +mc<mc> and skips sources and dev jars', () => {
    expect(runtimeJarVersionKey('msm_runtime-0.6.1+mc26.3.jar')).toBe('26.3');
    expect(runtimeJarVersionKey('msm_runtime-1.0.0-rc.1+mc26.4.jar')).toBe('26.4');
    expect(isRuntimeJarName('msm_runtime-0.6.1+mc26.4.jar')).toBe(true);
    expect(isRuntimeJarName('msm_runtime-0.6.1+mc26.3-sources.jar')).toBe(false);
    expect(isRuntimeJarName('msm_runtime-0.6.1+mc26.3-dev.jar')).toBe(false);
    expect(isRuntimeJarName('msm_runtime-0.4.0.jar')).toBe(false);
    expect(isRuntimeJarName('msm_runtime.jar')).toBe(false);
    expect(isRuntimeJarName('other-0.4.0+mc26.3.jar')).toBe(false);
    expect(isRuntimeJarName('msm_runtime-0.4.0+mc26.3.zip')).toBe(false);
  });
});

describe('development runtime jar', () => {
  it('picks the newest jar of the target version, ignoring other versions and sources', async () => {
    await jar('msm_runtime-0.6.0+mc26.3.jar', 1000);
    const newest = await jar('msm_runtime-0.6.1+mc26.3.jar', 2000);
    const snapshot = await jar('msm_runtime-0.6.1+mc26.4.jar', 4000);
    await jar('msm_runtime-0.6.1+mc26.3-sources.jar', 3000);
    await jar('msm_runtime-0.6.1+mc26.3-dev.jar', 3000);
    expect(await newestRuntimeJar(libs, '26.3')).toBe(newest);
    expect(await newestRuntimeJar(libs, '26.4')).toBe(snapshot);
    expect(await newestRuntimeJars(libs)).toEqual(
      new Map([
        ['26.3', newest],
        ['26.4', snapshot],
      ]),
    );
    const location = { isPackaged: false, resourcesPath: resources, devLibsDir: libs };
    expect(await resolveRuntimeJarPath(location, '26.3')).toBe(newest);
    expect(await resolveRuntimeJarPath(location, '26.4')).toBe(snapshot);
  });

  it('breaks a modification time tie by name', async () => {
    await jar('msm_runtime-0.4.0+mc26.3.jar', 1000);
    const later = await jar('msm_runtime-0.5.0+mc26.3.jar', 1000);
    expect(await newestRuntimeJar(libs, '26.3')).toBe(later);
  });

  it('is null when the folder is missing or holds no jar for the version', async () => {
    expect(await newestRuntimeJar(join(temp, 'missing'), '26.3')).toBeNull();
    await jar('msm_runtime-0.4.0+mc26.3-sources.jar', 1000);
    await jar('msm_runtime-0.4.0+mc26.4.jar', 1000);
    expect(await newestRuntimeJar(libs, '26.3')).toBeNull();
    const location = { isPackaged: false, resourcesPath: resources, devLibsDir: libs };
    expect(await readRuntimeJar(location, '26.3')).toBeNull();
    expect(await readRuntimeJar(location, '../26.4')).toBeNull();
  });

  it('reads the bytes of the chosen jar', async () => {
    await jar('msm_runtime-0.4.0+mc26.3.jar', 1000, 'release bytes');
    await jar('msm_runtime-0.4.0+mc26.4.jar', 1000, 'snapshot bytes');
    const location = { isPackaged: false, resourcesPath: resources, devLibsDir: libs };
    const decode = (bytes: Uint8Array | null) =>
      bytes === null ? null : new TextDecoder().decode(bytes);
    expect(decode(await readRuntimeJar(location, '26.3'))).toBe('release bytes');
    expect(decode(await readRuntimeJar(location, '26.4'))).toBe('snapshot bytes');
  });
});

describe('packaged runtime jar', () => {
  it('reads resources/runtime/msm_runtime-mc-<mc>.jar and never the development folder', async () => {
    await jar('msm_runtime-0.4.0+mc26.3.jar', 1000, 'dev');
    const location = { isPackaged: true, resourcesPath: resources, devLibsDir: libs };
    expect(await readRuntimeJar(location, '26.3')).toBeNull();
    await writeFile(join(resources, 'runtime', 'msm_runtime-mc-26.3.jar'), 'packaged');
    expect(await resolveRuntimeJarPath(location, '26.3')).toBe(
      join(resources, 'runtime', 'msm_runtime-mc-26.3.jar'),
    );
    const bytes = await readRuntimeJar(location, '26.3');
    expect(bytes === null ? null : new TextDecoder().decode(bytes)).toBe('packaged');
    expect(await readRuntimeJar(location, '26.4')).toBeNull();
  });
});

describe('platform exports.runtimeJar', () => {
  const platform = (runtimeJar?: Parameters<typeof createNodePlatform>[0]['runtimeJar']) =>
    createNodePlatform({
      info: async () => ({ version: '0', electron: '0', platform: 'test' }),
      dialogs: {
        pickDirectory: async () => null,
        confirmDiscard: async () => true,
        openFiles: async () => [],
        saveFilePath: async () => null,
      },
      showItemInFolder: () => {},
      resizePng: (png) => png,
      msmHome: join(temp, 'msm-home'),
      installEnv: { platform: 'linux', home: join(temp, 'home') },
      ...(runtimeJar === undefined ? {} : { runtimeJar }),
    });

  it('serves the jar of the target, null for an unknown target or without a location', async () => {
    const decode = (bytes: Uint8Array | null) =>
      bytes === null ? null : new TextDecoder().decode(bytes);
    for (const { target } of builtInTargets) {
      await jar(`msm_runtime-0.4.0+mc${runtimeVersionKey(target.mcVersion)}.jar`, 1000, target.id);
    }
    const located = platform({ isPackaged: false, resourcesPath: resources, devLibsDir: libs });
    for (const { target } of builtInTargets) {
      expect(decode(await located.exports.runtimeJar(target.id))).toBe(target.id);
    }
    expect(await located.exports.runtimeJar('mc-0.0')).toBeNull();
    expect(await platform().exports.runtimeJar(defaultTargetId)).toBeNull();
  });
});
