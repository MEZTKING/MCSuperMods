import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { target } from '../src/index';

async function readJson(relative: string): Promise<Record<string, unknown>> {
  const text = await readFile(new URL(relative, import.meta.url), 'utf8');
  return JSON.parse(text) as Record<string, unknown>;
}

describe('target mc-26.3', () => {
  it('sets the Fabric toolchain versions', () => {
    expect(target.fabric).toEqual({
      loader: '0.20.1',
      api: '0.165.2+26.3',
      loom: '1.19.3',
      minecraftDependency: '~26.3',
    });
    expect(target.fabric?.api.endsWith(`+${target.mcVersion}`)).toBe(true);
  });

  it('derives its id from the Minecraft version', () => {
    expect(target.id).toBe(`mc-${target.mcVersion}`);
  });

  it('pins vanilla-mcdoc to a full commit sha', () => {
    expect(target.mcdocRef).toMatch(/^[0-9a-f]{40}$/);
  });

  it('matches the vendored vanilla-mcdoc ref', async () => {
    const source = await readJson('../vendor/vanilla-mcdoc/SOURCE.json');
    expect(source.ref).toBe(target.mcdocRef);
    const symbols = await readJson('../vendor/vanilla-mcdoc/symbols.json');
    expect(symbols.ref).toBe(target.mcdocRef);
  });

  it('matches the vendored mcmeta refs', async () => {
    const source = await readJson('../vendor/mcmeta/SOURCE.json');
    const refs = source.refs as { summary: string; registries: string };
    expect(refs.summary).toBe(`${target.mcmetaRef}-summary`);
    expect(refs.registries).toBe(`${target.mcmetaRef}-registries`);
  });

  it('names every resource pack folder', () => {
    expect(target.folders.resource).toEqual({
      model: 'models',
      block_definition: 'blockstates',
      item_definition: 'items',
      lang: 'lang',
      sounds_file: 'sounds.json',
      textures: 'textures',
      atlases: 'atlases',
      font: 'font',
    });
    for (const name of Object.values(target.folders.resource)) {
      expect(name).toMatch(/^[a-z_]+(\.json)?$/);
    }
  });

  it('names every data pack folder as a single path segment', () => {
    expect(target.folders.data).toEqual({
      recipe: 'recipe',
      loot_table: 'loot_table',
      advancement: 'advancement',
      predicate: 'predicate',
      item_modifier: 'item_modifier',
      function: 'function',
      tags: 'tags',
      enchantment: 'enchantment',
      damage_type: 'damage_type',
      dimension_type: 'dimension_type',
      chat_type: 'chat_type',
      jukebox_song: 'jukebox_song',
      banner_pattern: 'banner_pattern',
      painting_variant: 'painting_variant',
      trim_material: 'trim_material',
      trim_pattern: 'trim_pattern',
      dialog: 'dialog',
      structure: 'structure',
      dimension: 'dimension',
      worldgen: 'worldgen',
    });
    for (const name of Object.values(target.folders.data)) {
      expect(name).not.toBe('');
      expect(name).not.toContain('/');
      expect(name).not.toContain('\\');
      expect(name).not.toMatch(/^\.\.?$/);
      expect(name).toMatch(/^[a-z0-9_.-]+$/);
    }
  });

  it('matches the vendored mcmeta data version', async () => {
    const version = await readJson('../vendor/mcmeta/version.json');
    expect(target.dataVersion).toBe(version.data_version);
    expect(Number.isInteger(target.dataVersion)).toBe(true);
  });

  it('lists the feature decoration steps in the vendored mcdoc order', async () => {
    const symbols = (await readJson('../vendor/vanilla-mcdoc/symbols.json')) as {
      mcdoc: Record<string, { kind: string; values?: { value: unknown }[] }>;
    };
    const step = symbols.mcdoc['::java::data::worldgen::DecorationStep'];
    expect(step?.kind).toBe('enum');
    expect(target.worldgen.featureSteps).toEqual(step?.values?.map((entry) => entry.value));
    expect(target.worldgen.featureSteps).toHaveLength(11);
  });

  it('names biome attributes the vendored mcdoc and mcmeta know, with the expected value types', async () => {
    const symbols = (await readJson('../vendor/vanilla-mcdoc/symbols.json')) as {
      'mcdoc/dispatcher': Record<string, Record<string, unknown>>;
    };
    const registries = (await readJson('../vendor/mcmeta/registries.json')) as Record<
      string,
      string[]
    >;
    const attributes = symbols['mcdoc/dispatcher']['minecraft:environment_attribute'] ?? {};
    const facts = target.worldgen.biomeAttributes;
    expect(facts).toBeDefined();
    if (facts === undefined) return;
    const bare = (id: string): string => id.replace(/^minecraft:/, '');
    for (const id of [...facts.colours, facts.skyColour, facts.naturalMobSpawns]) {
      expect(id).toMatch(/^minecraft:/);
      expect(Object.hasOwn(attributes, bare(id)), id).toBe(true);
      expect(registries.environment_attribute, id).toContain(bare(id));
    }
    expect(facts.colours).toContain(facts.skyColour);
    for (const id of facts.colours) {
      expect(JSON.stringify(attributes[bare(id)]), id).toContain('RGBColorAttribute');
    }
    expect(JSON.stringify(attributes[bare(facts.naturalMobSpawns)])).toContain('NaturalMobSpawns');
  });
});
