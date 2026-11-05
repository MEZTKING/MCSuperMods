import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodePlatform } from '../src/main/platform/node-platform';
import {
  isRuntimeJarName,
  newestRuntimeJar,
  readRuntimeJar,
  resolveRuntimeJarPath,
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

describe('runtime jar names', () => {
  it('accepts Gradle runtime jars and skips sources and dev jars', () => {
    expect(isRuntimeJarName('msm_runtime-0.4.0.jar')).toBe(true);
    expect(isRuntimeJarName('msm_runtime-0.0.1-spike.jar')).toBe(true);
    expect(isRuntimeJarName('msm_runtime-0.4.0-sources.jar')).toBe(false);
    expect(isRuntimeJarName('msm_runtime-0.4.0-dev.jar')).toBe(false);
    expect(isRuntimeJarName('msm_runtime.jar')).toBe(false);
    expect(isRuntimeJarName('other-0.4.0.jar')).toBe(false);
    expect(isRuntimeJarName('msm_runtime-0.4.0.zip')).toBe(false);
  });
});

describe('development runtime jar', () => {
  it('picks the newest runtime jar, ignoring newer sources and dev jars', async () => {
    await jar('msm_runtime-0.3.0.jar', 1000);
    const newest = await jar('msm_runtime-0.4.0.jar', 2000);
    await jar('msm_runtime-0.4.0-sources.jar', 3000);
    await jar('msm_runtime-0.4.0-dev.jar', 3000);
    expect(await newestRuntimeJar(libs)).toBe(newest);
    expect(
      await resolveRuntimeJarPath({ isPackaged: false, resourcesPath: resources, devLibsDir: libs }),
    ).toBe(newest);
  });

  it('breaks a modification time tie by name', async () => {
    await jar('msm_runtime-0.4.0.jar', 1000);
    const later = await jar('msm_runtime-0.5.0.jar', 1000);
    expect(await newestRuntimeJar(libs)).toBe(later);
  });

  it('is null when the folder is missing or holds no runtime jar', async () => {
    expect(await newestRuntimeJar(join(temp, 'missing'))).toBeNull();
    await jar('msm_runtime-0.4.0-sources.jar', 1000);
    expect(await newestRuntimeJar(libs)).toBeNull();
    expect(
      await readRuntimeJar({ isPackaged: false, resourcesPath: resources, devLibsDir: libs }),
    ).toBeNull();
  });

  it('reads the bytes of the chosen jar', async () => {
    await jar('msm_runtime-0.4.0.jar', 1000, 'runtime bytes');
    const bytes = await readRuntimeJar({
      isPackaged: false,
      resourcesPath: resources,
      devLibsDir: libs,
    });
    expect(bytes === null ? null : new TextDecoder().decode(bytes)).toBe('runtime bytes');
  });
});

describe('packaged runtime jar', () => {
  it('reads resources/runtime/msm_runtime.jar and never the development folder', async () => {
    await jar('msm_runtime-0.4.0.jar', 1000, 'dev');
    const location = { isPackaged: true, resourcesPath: resources, devLibsDir: libs };
    expect(await readRuntimeJar(location)).toBeNull();
    await writeFile(join(resources, 'runtime', 'msm_runtime.jar'), 'packaged');
    expect(await resolveRuntimeJarPath(location)).toBe(
      join(resources, 'runtime', 'msm_runtime.jar'),
    );
    const bytes = await readRuntimeJar(location);
    expect(bytes === null ? null : new TextDecoder().decode(bytes)).toBe('packaged');
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

  it('serves the development jar, and null without a location', async () => {
    await jar('msm_runtime-0.4.0.jar', 1000, 'dev jar');
    const bytes = await platform({
      isPackaged: false,
      resourcesPath: resources,
      devLibsDir: libs,
    }).exports.runtimeJar();
    expect(bytes === null ? null : new TextDecoder().decode(bytes)).toBe('dev jar');
    expect(await platform().exports.runtimeJar()).toBeNull();
  });
});
