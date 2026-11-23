import { strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  ASSET_OBJECT_MAX_BYTES,
  assetObjectPath,
  assetStoreDir,
  findAssetStore,
  isAllowedAssetKey,
  type LauncherKind,
  parseAssetIndex,
  readAssetIndex,
  readAssetIndexId,
  readAssetObject,
  versionJsonPath,
} from '../src/index';
import { MemoryInstallFileSystem } from './helpers/memory-install-fs';

/** Made-up bytes and SHA-1-shaped names; no Mojang file is used. */
const SOUND = strToU8('OggS made-up sound');
const SOUNDS_JSON = strToU8(JSON.stringify({ 'msm.test': { sounds: ['msm/test'] } }));
const FONT_ZIP = strToU8('PK made-up font');
const HASH_SOUND = 'aa11111111111111111111111111111111111111';
const HASH_SOUNDS_JSON = 'bb22222222222222222222222222222222222222';
const HASH_FONT = 'cc33333333333333333333333333333333333333';
const HASH_TEXTURE = 'dd44444444444444444444444444444444444444';
const HASH_MISSING = 'ee55555555555555555555555555555555555555';
const HASH_BIG = 'ff66666666666666666666666666666666666666';
const HASH_LINKED = '1077777777777777777777777777777777777777';
const VERSION = '9.1';
const INDEX_ID = '42';

function index(): string {
  return JSON.stringify({
    objects: {
      'minecraft/sounds/mob/msm/bark1.ogg': { hash: HASH_SOUND, size: SOUND.byteLength },
      'minecraft/sounds.json': { hash: HASH_SOUNDS_JSON, size: SOUNDS_JSON.byteLength },
      'minecraft/font/unifont.zip': { hash: HASH_FONT, size: FONT_ZIP.byteLength },
      'minecraft/textures/block/stone.png': { hash: HASH_TEXTURE, size: 1 },
      'minecraft/sounds/gone.ogg': { hash: HASH_MISSING, size: 4 },
      'minecraft/sounds/music/long.ogg': { hash: HASH_BIG, size: ASSET_OBJECT_MAX_BYTES + 1 },
      'minecraft/sounds/linked.ogg': { hash: HASH_LINKED, size: 6 },
      'minecraft/sounds/bad.ogg': { hash: '../../../etc/passwd', size: 4 },
    },
  });
}

/** Where each launcher keeps its version JSON and its asset store (B619 3S1). */
const LAYOUTS: Record<LauncherKind, { root: string; json: string; store: string }> = {
  official: {
    root: '/home/alex/.minecraft',
    json: `/home/alex/.minecraft/versions/${VERSION}/${VERSION}.json`,
    store: '/home/alex/.minecraft/assets',
  },
  prism: {
    root: '/home/alex/.local/share/PrismLauncher',
    json: `/home/alex/.local/share/PrismLauncher/meta/net.minecraft/${VERSION}.json`,
    store: '/home/alex/.local/share/PrismLauncher/assets',
  },
  multimc: {
    root: '/opt/MultiMC',
    json: `/opt/MultiMC/meta/net.minecraft/${VERSION}.json`,
    store: '/opt/MultiMC/assets',
  },
  curseforge: {
    root: '/home/alex/curseforge/minecraft',
    json: `/home/alex/curseforge/minecraft/Install/versions/${VERSION}/${VERSION}.json`,
    store: '/home/alex/curseforge/minecraft/Install/assets',
  },
};

/** A fake install of one launcher kind with the store, the index and some objects. */
function fakeInstall(launcher: LauncherKind): MemoryInstallFileSystem {
  const { json, store } = LAYOUTS[launcher];
  const fs = new MemoryInstallFileSystem();
  fs.seed(json, JSON.stringify({ id: VERSION, assetIndex: { id: INDEX_ID, size: 1 } }));
  fs.seed(`${store}/indexes/${INDEX_ID}.json`, index());
  fs.seed(assetObjectPath(store, HASH_SOUND), SOUND);
  fs.seed(assetObjectPath(store, HASH_SOUNDS_JSON), SOUNDS_JSON);
  fs.seed(assetObjectPath(store, HASH_FONT), FONT_ZIP);
  fs.seed(assetObjectPath(store, HASH_TEXTURE), strToU8('x'));
  fs.seed(assetObjectPath(store, HASH_BIG), strToU8('big'));
  // A link out of the store: its target lies outside `objects/`.
  fs.seed('/elsewhere/secret', strToU8('secret'));
  fs.link(assetObjectPath(store, HASH_LINKED), '/elsewhere/secret');
  return fs;
}

describe('asset store paths (B619 3S1)', () => {
  it('names the store and version JSON of each launcher kind', () => {
    for (const [launcher, layout] of Object.entries(LAYOUTS) as [
      LauncherKind,
      (typeof LAYOUTS)[LauncherKind],
    ][]) {
      expect(assetStoreDir(launcher, layout.root)).toBe(layout.store);
      expect(versionJsonPath(launcher, layout.root, VERSION)).toBe(layout.json);
    }
  });

  it('refuses a version id that is not one segment', () => {
    expect(() => versionJsonPath('official', '/m', '../x')).toThrow();
    expect(() => versionJsonPath('official', '/m', 'a/b')).toThrow();
  });

  it('places objects by the first two hex digits of their hash', () => {
    expect(assetObjectPath('/s', HASH_SOUND)).toBe(`/s/objects/aa/${HASH_SOUND}`);
    expect(() => assetObjectPath('/s', '../../x')).toThrow();
  });
});

describe('allowed keys', () => {
  it('allows only sounds.json, sounds, unifont archives and their include files', () => {
    for (const key of [
      'minecraft/sounds.json',
      'minecraft/sounds/mob/wolf/bark1.ogg',
      'minecraft/sounds/ambient/cave/cave1.ogg',
      'minecraft/font/unifont.zip',
      'minecraft/font/unifont_jp.zip',
      'minecraft/font/include/unifont.json',
    ]) {
      expect(isAllowedAssetKey(key), key).toBe(true);
    }
    for (const key of [
      'minecraft/lang/de_de.json',
      'minecraft/textures/block/stone.png',
      'minecraft/sounds/../lang/de_de.json',
      'minecraft/sounds/mob/wolf/bark1.wav',
      'minecraft/sounds//x.ogg',
      'minecraft/font/default.json',
      'other/sounds.json',
      '/minecraft/sounds.json',
      '',
    ]) {
      expect(isAllowedAssetKey(key), key).toBe(false);
    }
  });
});

describe('reading objects with a fake install of each launcher kind', () => {
  for (const launcher of Object.keys(LAYOUTS) as LauncherKind[]) {
    it(`reads sounds.json, a sound and a unifont archive (${launcher})`, async () => {
      const fs = fakeInstall(launcher);
      const { root, store } = LAYOUTS[launcher];
      expect(await readAssetIndexId(fs, launcher, root, VERSION)).toBe(INDEX_ID);
      const found = await findAssetStore(fs, launcher, root, VERSION);
      expect(found).toEqual({
        ok: true,
        store: { dir: store, indexId: INDEX_ID, indexPath: `${store}/indexes/${INDEX_ID}.json` },
      });
      if (!found.ok) throw new Error('no store');
      const parsed = await readAssetIndex(fs, found.store);
      if (parsed === null) throw new Error('no index');
      // The malformed hash is left out of the index.
      expect(parsed.objects.has('minecraft/sounds/bad.ogg')).toBe(false);
      const read = (key: string) => readAssetObject(fs, found.store, parsed, key);
      expect(await read('minecraft/sounds.json')).toEqual({ ok: true, bytes: SOUNDS_JSON });
      expect(await read('minecraft/sounds/mob/msm/bark1.ogg')).toEqual({ ok: true, bytes: SOUND });
      expect(await read('minecraft/font/unifont.zip')).toEqual({ ok: true, bytes: FONT_ZIP });
      // Nothing was written: the bytes are only handed back.
      expect(fs.log).toEqual([]);
    });
  }

  it('answers why an object cannot be read', async () => {
    const fs = fakeInstall('official');
    const { root } = LAYOUTS.official;
    const found = await findAssetStore(fs, 'official', root, VERSION);
    if (!found.ok) throw new Error('no store');
    const parsed = await readAssetIndex(fs, found.store);
    if (parsed === null) throw new Error('no index');
    const read = (key: string) => readAssetObject(fs, found.store, parsed, key);
    // Listed, but not a key MSM reads.
    expect(await read('minecraft/textures/block/stone.png')).toEqual({
      ok: false,
      reason: 'not_allowed',
    });
    expect(await read('minecraft/sounds/nope.ogg')).toEqual({ ok: false, reason: 'not_listed' });
    expect(await read('minecraft/sounds/bad.ogg')).toEqual({ ok: false, reason: 'not_listed' });
    expect(await read('minecraft/sounds/gone.ogg')).toEqual({ ok: false, reason: 'missing' });
    expect(await read('minecraft/sounds/music/long.ogg')).toEqual({
      ok: false,
      reason: 'too_large',
    });
    // A smaller cap than the object.
    expect(
      await readAssetObject(fs, found.store, parsed, 'minecraft/sounds/mob/msm/bark1.ogg', {
        maxBytes: 4,
      }),
    ).toEqual({ ok: false, reason: 'too_large' });
  });

  it('refuses an object whose real path is outside the asset store', async () => {
    const fs = fakeInstall('prism');
    const { root } = LAYOUTS.prism;
    const found = await findAssetStore(fs, 'prism', root, VERSION);
    if (!found.ok) throw new Error('no store');
    const parsed = await readAssetIndex(fs, found.store);
    if (parsed === null) throw new Error('no index');
    expect(await readAssetObject(fs, found.store, parsed, 'minecraft/sounds/linked.ogg')).toEqual({
      ok: false,
      reason: 'not_allowed',
    });
  });

  it('refuses an index linked out of the store', async () => {
    const fs = fakeInstall('official');
    const { root, store } = LAYOUTS.official;
    fs.seed('/elsewhere/index.json', index());
    fs.files.delete(`${store}/indexes/${INDEX_ID}.json`);
    fs.link(`${store}/indexes/${INDEX_ID}.json`, '/elsewhere/index.json');
    const found = await findAssetStore(fs, 'official', root, VERSION);
    if (!found.ok) throw new Error('no store');
    expect(await readAssetIndex(fs, found.store)).toBeNull();
  });

  it('is not set up without a store, and has no index without the version JSON or index', async () => {
    const empty = new MemoryInstallFileSystem();
    expect(await findAssetStore(empty, 'official', '/nowhere', VERSION)).toEqual({
      ok: false,
      reason: 'not_set_up',
    });
    const fs = fakeInstall('curseforge');
    const { root, json, store } = LAYOUTS.curseforge;
    fs.files.delete(`${store}/indexes/${INDEX_ID}.json`);
    expect(await findAssetStore(fs, 'curseforge', root, VERSION)).toEqual({
      ok: false,
      reason: 'no_index',
    });
    fs.files.delete(json);
    expect(await findAssetStore(fs, 'curseforge', root, VERSION)).toEqual({
      ok: false,
      reason: 'no_index',
    });
  });

  it('follows inheritsFrom to the version that names the index (official)', async () => {
    const fs = fakeInstall('official');
    const { root } = LAYOUTS.official;
    fs.seed(
      `${root}/versions/fabric-${VERSION}/fabric-${VERSION}.json`,
      JSON.stringify({ id: `fabric-${VERSION}`, inheritsFrom: VERSION }),
    );
    expect(await readAssetIndexId(fs, 'official', root, `fabric-${VERSION}`)).toBe(INDEX_ID);
    // A loop ends without an answer.
    fs.seed(`${root}/versions/a/a.json`, JSON.stringify({ inheritsFrom: 'b' }));
    fs.seed(`${root}/versions/b/b.json`, JSON.stringify({ inheritsFrom: 'a' }));
    expect(await readAssetIndexId(fs, 'official', root, 'a')).toBeNull();
  });
});

describe('parseAssetIndex', () => {
  it('refuses bytes that are not an index', () => {
    expect(() => parseAssetIndex(strToU8('['), 'x')).toThrow();
    expect(() => parseAssetIndex(strToU8('[]'), 'x')).toThrow();
    expect(() => parseAssetIndex(strToU8('{}'), 'x')).toThrow();
    expect(parseAssetIndex(strToU8('{"objects":{}}'), 'x').objects.size).toBe(0);
  });
});
