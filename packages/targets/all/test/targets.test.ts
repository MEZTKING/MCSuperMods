import { readFile } from 'node:fs/promises';
import { createSchemaIndex, parseVanillaMcdocSymbols } from '@msm/schemas';
import { describe, expect, it } from 'vitest';
import {
  builtInTargets,
  defaultTargetId,
  readVendoredJson,
  releaseTargets,
  type TargetBundle,
  targetById,
  targetFacts,
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

const DATA_FOLDER_KEYS = [
  'advancement',
  'banner_pattern',
  'cat_sound_variant',
  'cat_variant',
  'chat_type',
  'chicken_sound_variant',
  'chicken_variant',
  'cow_sound_variant',
  'cow_variant',
  'damage_type',
  'dialog',
  'dimension',
  'dimension_type',
  'enchantment',
  'enchantment_provider',
  'frog_variant',
  'function',
  'instrument',
  'item_modifier',
  'jukebox_song',
  'loot_table',
  'painting_variant',
  'pig_sound_variant',
  'pig_variant',
  'predicate',
  'recipe',
  'structure',
  'tags',
  'timeline',
  'trade_set',
  'trial_spawner',
  'trim_material',
  'trim_pattern',
  'villager_trade',
  'wolf_sound_variant',
  'wolf_variant',
  'world_clock',
  'worldgen',
  'zombie_nautilus_variant',
];

const VENDORED_KEYS: VendoredKey[] = [
  'vanillaMcdocSymbols',
  'mcmetaVersion',
  'mcmetaRegistries',
  'mcmetaCommands',
  'mcmetaBlocks',
];

const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

describe('builtInTargets', () => {
  it('is non-empty and has unique ids', () => {
    expect(builtInTargets.length).toBeGreaterThan(0);
    const ids = builtInTargets.map((bundle) => bundle.target.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is ordered newest first by Minecraft version', () => {
    const versions = builtInTargets.map((bundle) => bundle.target.mcVersion);
    const sorted = [...versions].sort((a, b) =>
      b.localeCompare(a, 'en', { numeric: true, sensitivity: 'base' }),
    );
    expect(versions).toEqual(sorted);
  });

  it('holds at least one release and one snapshot target', () => {
    const channels = new Set(builtInTargets.map((bundle) => bundle.target.channel));
    expect(channels).toEqual(new Set(['release', 'snapshot']));
  });

  it('lists the release targets in order', () => {
    expect(releaseTargets.length).toBeGreaterThan(0);
    expect(releaseTargets).toEqual(
      builtInTargets.filter((bundle) => bundle.target.channel === 'release'),
    );
  });

  it('defaults to the newest release target, never a snapshot', () => {
    const firstRelease = builtInTargets.find((bundle) => bundle.target.channel === 'release');
    expect(defaultTargetId).toBe(firstRelease?.target.id);
    expect(targetById(defaultTargetId)?.target.channel).toBe('release');
    // The newest target is a snapshot while 26.4 is unreleased, so the default is not it.
    if (builtInTargets[0]?.target.channel === 'snapshot') {
      expect(defaultTargetId).not.toBe(builtInTargets[0].target.id);
    }
  });

  it('returns target facts without hooks that survive structuredClone', () => {
    for (const { target } of builtInTargets) {
      const facts = targetFacts(target.id);
      expect(facts).toBeDefined();
      if (facts === undefined) continue;
      expect(facts).not.toHaveProperty('javaProject');
      expect(facts).not.toHaveProperty('migrateFrom');
      expect(facts.id).toBe(target.id);
      expect(facts.channel).toBe(target.channel);
      expect(facts.fabric).toEqual(target.fabric);
      expect(facts.geckolib).toEqual(target.geckolib);
      expect(structuredClone(facts)).toEqual(facts);
      expect(facts.fabric).not.toBe(target.fabric);
    }
    expect(targetFacts('mc-0.0')).toBeUndefined();
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

    it('has an id derived from its Minecraft version line', () => {
      // The version up to the first '-' (`<line>-snapshot-<n>` belongs to `mc-<line>`).
      expect(target.id).toMatch(/^mc-/);
      expect(target.id).toBe(`mc-${target.mcVersion.split('-')[0]}`);
      if (target.channel === 'release') expect(target.id).toBe(`mc-${target.mcVersion}`);
    });

    it('names every resource pack folder', () => {
      expect(Object.keys(target.folders.resource).sort()).toEqual(RESOURCE_FOLDER_KEYS);
      for (const name of Object.values(target.folders.resource)) {
        expect(name).toMatch(/^[a-z_]+(\.json)?$/);
      }
    });

    it('names every data pack folder as a single path segment', () => {
      expect(Object.keys(target.folders.data).sort()).toEqual(DATA_FOLDER_KEYS);
      for (const name of Object.values(target.folders.data)) {
        expect(name).toMatch(/^[a-z_]+$/);
      }
    });

    it('has vendored files that exist and parse', async () => {
      for (const key of VENDORED_KEYS) {
        const value = await readVendoredJson(bundle, key, nodeReadFile);
        expect(value, key).toBeTypeOf('object');
        expect(value, key).not.toBeNull();
      }
    });

    it('lists exactly the vendored keys', () => {
      expect(Object.keys(bundle.vendored).sort()).toEqual([...VENDORED_KEYS].sort());
    });

    it('has a vendored command tree and block states', async () => {
      const commands = (await readVendoredJson(bundle, 'mcmetaCommands', nodeReadFile)) as Record<
        string,
        unknown
      >;
      expect(commands.type).toBe('root');
      const children = commands.children as Record<string, unknown>;
      for (const name of ['execute', 'function', 'give', 'say']) {
        expect(children, name).toHaveProperty(name);
      }
      const blocks = (await readVendoredJson(bundle, 'mcmetaBlocks', nodeReadFile)) as Record<
        string,
        unknown
      >;
      expect(Array.isArray(blocks.stone)).toBe(true);
      expect(blocks.oak_stairs).toHaveLength(2);
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
