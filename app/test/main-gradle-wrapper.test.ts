import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GRADLE_WRAPPER_FILES,
  gradleWrapperPaths,
  PACKAGED_GRADLE_WRAPPER_DIR,
  readGradleWrapper,
} from '../src/main/platform/gradle-wrapper';
import { createNodePlatform } from '../src/main/platform/node-platform';

let temp: string;
let engineMod: string;
let resources: string;

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-gradle-wrapper-'));
  engineMod = join(temp, 'engine-mod');
  resources = join(temp, 'resources');
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

const jarBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2]);

async function devWrapper(): Promise<void> {
  await mkdir(join(engineMod, 'gradle', 'wrapper'), { recursive: true });
  await writeFile(join(engineMod, 'gradle', 'wrapper', 'gradle-wrapper.jar'), jarBytes);
  await writeFile(join(engineMod, 'gradlew'), '#!/bin/sh\necho dev\n');
  await writeFile(join(engineMod, 'gradlew.bat'), '@echo off\r\necho dev\r\n');
}

async function packagedWrapper(): Promise<void> {
  const dir = join(resources, 'runtime', 'gradle-wrapper');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'gradle-wrapper.jar'), jarBytes);
  await writeFile(join(dir, 'gradlew'), '#!/bin/sh\necho packaged\n');
  await writeFile(join(dir, 'gradlew.bat'), '@echo off\r\necho packaged\r\n');
}

describe('Gradle wrapper service', () => {
  it('reads engine-mod/ in development', async () => {
    await devWrapper();
    const location = { isPackaged: false, resourcesPath: resources, devEngineModDir: engineMod };
    expect(gradleWrapperPaths(location).jar).toBe(
      join(engineMod, 'gradle', 'wrapper', 'gradle-wrapper.jar'),
    );
    const wrapper = await readGradleWrapper(location);
    expect(wrapper).toEqual({
      jar: jarBytes,
      gradlew: '#!/bin/sh\necho dev\n',
      gradlewBat: '@echo off\r\necho dev\r\n',
    });
  });

  it('reads resources/runtime/gradle-wrapper/ when packaged', async () => {
    await devWrapper();
    await packagedWrapper();
    const wrapper = await readGradleWrapper({
      isPackaged: true,
      resourcesPath: resources,
      devEngineModDir: engineMod,
    });
    expect(wrapper?.gradlew).toBe('#!/bin/sh\necho packaged\n');
    expect(wrapper?.jar).toEqual(jarBytes);
  });

  it('is null when any file is missing', async () => {
    const location = { isPackaged: false, resourcesPath: resources, devEngineModDir: engineMod };
    expect(await readGradleWrapper(location)).toBeNull();
    await devWrapper();
    await rm(join(engineMod, 'gradlew.bat'));
    expect(await readGradleWrapper(location)).toBeNull();
    expect(
      await readGradleWrapper({
        isPackaged: true,
        resourcesPath: resources,
        devEngineModDir: engineMod,
      }),
    ).toBeNull();
  });

  it('reads the real engine-mod wrapper of this checkout', async () => {
    const wrapper = await readGradleWrapper({
      isPackaged: false,
      resourcesPath: resources,
      devEngineModDir: join(import.meta.dirname, '..', '..', 'engine-mod'),
    });
    expect(wrapper?.jar.length).toBeGreaterThan(1000);
    expect(wrapper?.gradlew.startsWith('#!')).toBe(true);
  });

  it('is served by the platform only when configured', async () => {
    await devWrapper();
    const base = {
      info: async () => ({ version: '0', electron: '0', platform: 'test' }),
      dialogs: {
        pickDirectory: async () => null,
        confirmDiscard: async () => true,
        openFiles: async () => [],
        saveFilePath: async () => null,
      },
      showItemInFolder: () => {},
      resizePng: (png: Uint8Array) => png,
      msmHome: join(temp, 'home'),
      installEnv: { platform: 'linux' as const, home: join(temp, 'home') },
    };
    expect(await createNodePlatform(base).exports.gradleWrapper()).toBeNull();
    const platform = createNodePlatform({
      ...base,
      gradleWrapper: { isPackaged: false, resourcesPath: resources, devEngineModDir: engineMod },
    });
    expect((await platform.exports.gradleWrapper())?.gradlew).toBe('#!/bin/sh\necho dev\n');
  });

  it('is packaged where the service looks and staged under those names', async () => {
    const appDir = join(import.meta.dirname, '..');
    const builder = await readFile(join(appDir, 'electron-builder.yml'), 'utf8');
    expect(builder).toContain('- from: build/runtime/gradle-wrapper');
    expect(builder).toContain(`to: ${PACKAGED_GRADLE_WRAPPER_DIR.join('/')}`);
    const stage = await readFile(join(appDir, 'scripts', 'stage-runtime.mjs'), 'utf8');
    for (const name of Object.values(GRADLE_WRAPPER_FILES)) expect(stage).toContain(`'${name}'`);
  });
});
