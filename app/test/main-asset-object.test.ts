import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodeInstallFileSystem } from '@msm/interop/node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocationResolver } from '../src/main/platform/locations';
import { createMinecraftService, type MinecraftService } from '../src/main/platform/minecraft';
import { createSettingsStore, resolveMsmHome } from '../src/main/platform/settings';
import { InvokeChannels, ipcContract } from '../src/shared/ipc-contract';
import { buildSyntheticJar } from './helpers/synthetic-jar';

/** A made-up version id and index id; tests never name a real Minecraft version. */
const VERSION = '9.9-msm-test';
const INDEX_ID = '99';
/** Made-up bytes; no Mojang file is used. */
const SOUND = new TextEncoder().encode('OggS made-up hum');
const SOUNDS_JSON = new TextEncoder().encode(
  JSON.stringify({ 'entity.made_up.hum': { sounds: ['mob/made_up/hum1'] } }),
);
const HASH_SOUND = 'ab'.repeat(20);
const HASH_SOUNDS_JSON = 'cd'.repeat(20);
const HASH_LINKED = 'ef'.repeat(20);
const HASH_LANG = '12'.repeat(20);

let temp: string;
let msmHome: string;
let minecraftDir: string;
let service: MinecraftService;

async function seedObject(hash: string, bytes: Uint8Array): Promise<string> {
  const dir = join(minecraftDir, 'assets', 'objects', hash.slice(0, 2));
  await mkdir(dir, { recursive: true });
  const path = join(dir, hash);
  await writeFile(path, bytes);
  return path;
}

/** An official launcher folder with the jar, the version JSON, the index and some objects. */
async function seedInstall(): Promise<void> {
  const versionDir = join(minecraftDir, 'versions', VERSION);
  await mkdir(versionDir, { recursive: true });
  await writeFile(join(versionDir, `${VERSION}.jar`), buildSyntheticJar());
  await writeFile(
    join(versionDir, `${VERSION}.json`),
    JSON.stringify({ id: VERSION, assetIndex: { id: INDEX_ID } }),
  );
  await mkdir(join(minecraftDir, 'assets', 'indexes'), { recursive: true });
  await writeFile(
    join(minecraftDir, 'assets', 'indexes', `${INDEX_ID}.json`),
    JSON.stringify({
      objects: {
        'minecraft/sounds.json': { hash: HASH_SOUNDS_JSON, size: SOUNDS_JSON.byteLength },
        'minecraft/sounds/mob/made_up/hum1.ogg': { hash: HASH_SOUND, size: SOUND.byteLength },
        'minecraft/sounds/linked.ogg': { hash: HASH_LINKED, size: 6 },
        'minecraft/lang/made_up.json': { hash: HASH_LANG, size: 2 },
      },
    }),
  );
  await seedObject(HASH_SOUNDS_JSON, SOUNDS_JSON);
  await seedObject(HASH_SOUND, SOUND);
  await seedObject(HASH_LANG, new TextEncoder().encode('{}'));
  // An object linked to a file outside the asset store.
  await writeFile(join(temp, 'secret'), 'secret');
  await mkdir(join(minecraftDir, 'assets', 'objects', HASH_LINKED.slice(0, 2)), {
    recursive: true,
  });
  await symlink(
    join(temp, 'secret'),
    join(minecraftDir, 'assets', 'objects', HASH_LINKED.slice(0, 2), HASH_LINKED),
  );
}

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-main-asset-object-'));
  msmHome = resolveMsmHome({ MSM_HOME: join(temp, 'msm-home') }, join(temp, 'home'));
  minecraftDir = join(temp, 'minecraft');
  await mkdir(minecraftDir, { recursive: true });
  const installEnv = { platform: 'linux', home: join(temp, 'home') };
  const settings = createSettingsStore({ msmHome, installEnv });
  await settings.set({ minecraftDir });
  const fs = createNodeInstallFileSystem();
  service = createMinecraftService({
    msmHome,
    fs,
    locations: createLocationResolver({ fs, env: installEnv, settings }),
  });
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

describe('the asset store read (ADR 0121 D3, B621)', () => {
  const answerOf = (answer: unknown) =>
    ipcContract[InvokeChannels.minecraftAssetObject].response.parse(answer);

  it('is not set up without the version installed', async () => {
    expect(await service.readAssetObject(VERSION, 'minecraft/sounds.json')).toEqual({
      ok: false,
      reason: 'not_set_up',
    });
  });

  it('reads sounds.json and a sound by index key, and copies nothing', async () => {
    await seedInstall();
    const json = answerOf(await service.readAssetObject(VERSION, 'minecraft/sounds.json'));
    expect(json).toEqual({ ok: true, bytes: SOUNDS_JSON });
    const sound = answerOf(
      await service.readAssetObject(VERSION, 'minecraft/sounds/mob/made_up/hum1.ogg'),
    );
    expect(sound).toEqual({ ok: true, bytes: SOUND });
    // Nothing went into MSM's own folder: no cache, no copy.
    let written: string[] = [];
    try {
      written = await readdir(msmHome, { recursive: true });
    } catch {
      written = [];
    }
    expect(written.filter((path) => path.includes('objects') || path.endsWith('.ogg'))).toEqual([]);
  });

  it('refuses a key outside the list and a file outside the asset store', async () => {
    await seedInstall();
    expect(await service.readAssetObject(VERSION, 'minecraft/lang/made_up.json')).toEqual({
      ok: false,
      reason: 'not_allowed',
    });
    expect(await service.readAssetObject(VERSION, 'minecraft/sounds/linked.ogg')).toEqual({
      ok: false,
      reason: 'not_allowed',
    });
    expect(await service.readAssetObject(VERSION, 'minecraft/sounds/nope.ogg')).toEqual({
      ok: false,
      reason: 'not_listed',
    });
  });

  it('has no index without the index file', async () => {
    await seedInstall();
    await rm(join(minecraftDir, 'assets', 'indexes', `${INDEX_ID}.json`));
    expect(await service.readAssetObject(VERSION, 'minecraft/sounds.json')).toEqual({
      ok: false,
      reason: 'no_index',
    });
  });
});
