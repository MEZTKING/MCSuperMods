import { readFile } from 'node:fs/promises';
import { createSchemaIndex, parseVanillaMcdocSymbols } from '@msm/schemas';
import { describe, expect, it } from 'vitest';
import {
  builtInTargets,
  defaultTargetId,
  readVendoredJson,
  type TargetBundle,
  targetById,
  type VendoredKey,
} from '../src/index';

const RESOURCE_FOLDER_KEYS = [
  'atlases',
  'block_definition',
  'font',
  'item_definition',
  'lang',
  'model',
  'sounds_file',
  'textures',
];

const VENDORED_KEYS: VendoredKey[] = ['vanillaMcdocSymbols', 'mcmetaVersion', 'mcmetaRegistries'];

const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

describe('builtInTargets', () => {
  it('is non-empty and has unique ids', () => {
    expect(builtInTargets.length).toBeGreaterThan(0);
    const ids = builtInTargets.map((bundle) => bundle.target.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('defaults to the first (newest) target', () => {
    expect(defaultTargetId).toBe(builtInTargets[0]?.target.id);
  });

  it('round-trips through targetById', () => {
    for (const bundle of builtInTargets) {
      expect(targetById(bundle.target.id)).toBe(bundle);
    }
    expect(targetById('mc-0.0')).toBeUndefined();
    expect(targetById('')).toBeUndefined();
  });

  it('readVendoredJson rejects bytes that are not JSON', async () => {
    const bundle = builtInTargets[0] as TargetBundle;
    const bad = async (): Promise<Uint8Array> => new TextEncoder().encode('{not json');
    await expect(readVendoredJson(bundle, 'mcmetaVersion', bad)).rejects.toThrow();
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'target %s',
  (_id, bundle) => {
    const { target } = bundle;

    it('has an id derived from its Minecraft version', () => {
      expect(target.id).toMatch(/^mc-/);
      expect(target.id).toBe(`mc-${target.mcVersion}`);
    });

    it('names every resource pack folder', () => {
      expect(Object.keys(target.folders.resource).sort()).toEqual(RESOURCE_FOLDER_KEYS);
      for (const name of Object.values(target.folders.resource)) {
        expect(name).toMatch(/^[a-z_]+(\.json)?$/);
      }
    });

    it('has vendored files that exist and parse', async () => {
      for (const key of VENDORED_KEYS) {
        const value = await readVendoredJson(bundle, key, nodeReadFile);
        expect(value, key).toBeTypeOf('object');
        expect(value, key).not.toBeNull();
      }
    });

    it('has a vendored mcmeta version matching the target', async () => {
      const version = (await readVendoredJson(bundle, 'mcmetaVersion', nodeReadFile)) as Record<
        string,
        unknown
      >;
      expect(version.id).toBe(target.mcVersion);
      expect(target.packFormats.resource).toEqual({
        major: version.resource_pack_version,
        minor: version.resource_pack_version_minor,
      });
      expect(target.packFormats.data).toEqual({
        major: version.data_pack_version,
        minor: version.data_pack_version_minor,
      });
    });

    it('loads its vanilla-mcdoc export through @msm/schemas', async () => {
      const raw = await readVendoredJson(bundle, 'vanillaMcdocSymbols', nodeReadFile);
      const symbols = parseVanillaMcdocSymbols(raw);
      expect(symbols.ref).toBe(target.mcdocRef);
      const index = createSchemaIndex(symbols, { mcVersion: target.mcVersion });
      expect(index.mcVersion).toBe(target.mcVersion);
      expect(index.typePaths().length).toBeGreaterThan(0);
      expect(index.resolve('::java::assets::model::Model').kind).toBe('struct');
      expect(index.resolveSchemaRef('::java::pack::Pack').kind).toBe('struct');
      for (const category of ['model', 'block_definition', 'item_definition', 'lang', 'sounds']) {
        expect(index.dispatch('minecraft:resource', category), category).toBeDefined();
      }
    });
  },
);
