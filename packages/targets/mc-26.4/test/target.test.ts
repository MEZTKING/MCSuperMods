import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { target } from '../src/index';

/** `26.4-snapshot-7` → `26.4`. */
const runtimeVersion = target.mcVersion.split('-')[0] as string;

async function readJson(relative: string): Promise<Record<string, unknown>> {
  const text = await readFile(new URL(relative, import.meta.url), 'utf8');
  return JSON.parse(text) as Record<string, unknown>;
}

describe('target mc-26.4', () => {
  it('sets the Fabric toolchain versions', () => {
    expect(target.fabric).toEqual({
      loader: '0.20.1',
      api: '0.165.4+26.4',
      loom: '1.19.3',
      minecraftDependency: '>=26.4- <26.5-',
      gradle: '9.8.2',
      apiModrinth: expect.any(Object),
    });
    // The Modrinth copy of Fabric API (ADR 0046 D7) is the same version as the Maven one.
    const file = target.fabric?.apiModrinth;
    expect(file?.fileName).toBe(`fabric-api-${target.fabric?.api}.jar`);
    expect(file?.url).toBe(
      `https://cdn.modrinth.com/data/P7dR8mSH/versions/${file?.versionId}/${encodeURIComponent(file?.fileName ?? '')}`,
    );
    expect(file?.sha1).toMatch(/^[0-9a-f]{40}$/);
    expect(file?.sha512).toMatch(/^[0-9a-f]{128}$/);
    // Fabric API builds name the version line, not the snapshot.
    expect(target.fabric?.api.endsWith(`+${runtimeVersion}`)).toBe(true);
  });

  it('is a snapshot target pinned to 26.4-snapshot-7', () => {
    expect(target.channel).toBe('snapshot');
    expect(target.mcVersion).toBe('26.4-snapshot-7');
    expect(target.mcmetaRef).toBe(target.mcVersion);
    expect(target.packFormats).toEqual({
      resource: { major: 102, minor: 0 },
      data: { major: 126, minor: 0 },
    });
    expect(target.dataVersion).toBe(5127);
    expect(target.java).toBe(25);
  });

  it('sets the Gradle version of the engine-mod wrapper', async () => {
    const properties = await readFile(
      new URL('../../../../engine-mod/gradle/wrapper/gradle-wrapper.properties', import.meta.url),
      'utf8',
    );
    const match = /^distributionUrl=.*\/gradle-([^/]+?)-(?:bin|all)\.zip\s*$/m.exec(properties);
    expect(match?.[1]).toBeDefined();
    expect(target.fabric?.gradle).toBe(match?.[1]);
  });

  it('has no GeckoLib facts (no GeckoLib build for any 26.4 snapshot)', () => {
    expect(target.geckolib).toBeUndefined();
    expect('geckolib' in target).toBe(false);
  });

  it('lists the projectile items and the saddle tag (26.4 adds the ice ball; ADR 0070 D7)', () => {
    expect(target.entities?.projectileItems).toEqual([
      'minecraft:arrow',
      'minecraft:tipped_arrow',
      'minecraft:spectral_arrow',
      'minecraft:snowball',
      'minecraft:egg',
      'minecraft:blue_egg',
      'minecraft:brown_egg',
      'minecraft:experience_bottle',
      'minecraft:fire_charge',
      'minecraft:firework_rocket',
      'minecraft:splash_potion',
      'minecraft:lingering_potion',
      'minecraft:trident',
      'minecraft:wind_charge',
      'minecraft:ice_ball',
    ]);
    expect(target.entities?.saddleTag).toBe('minecraft:can_equip_saddle');
  });

  it('derives its id from the Minecraft version line', () => {
    // The runtime version key: mcVersion up to the first '-' (the plan's fixed names).
    expect(target.id).toBe(`mc-${runtimeVersion}`);
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
      villager_trade: 'villager_trade',
      trade_set: 'trade_set',
      wolf_variant: 'wolf_variant',
      cat_variant: 'cat_variant',
      pig_variant: 'pig_variant',
      cow_variant: 'cow_variant',
      chicken_variant: 'chicken_variant',
      frog_variant: 'frog_variant',
      zombie_nautilus_variant: 'zombie_nautilus_variant',
      wolf_sound_variant: 'wolf_sound_variant',
      cat_sound_variant: 'cat_sound_variant',
      pig_sound_variant: 'pig_sound_variant',
      cow_sound_variant: 'cow_sound_variant',
      chicken_sound_variant: 'chicken_sound_variant',
      instrument: 'instrument',
      enchantment_provider: 'enchantment_provider',
      trial_spawner: 'trial_spawner',
      timeline: 'timeline',
      world_clock: 'world_clock',
    });
    for (const name of Object.values(target.folders.data)) {
      expect(name).not.toBe('');
      expect(name).not.toContain('/');
      expect(name).not.toContain('\\');
      expect(name).not.toMatch(/^\.\.?$/);
      expect(name).toMatch(/^[a-z0-9_.-]+$/);
    }
  });

  it('lists the nine vanilla armour materials, each a vanilla equipment asset', async () => {
    const registries = (await readJson('../vendor/mcmeta/registries.json')) as Record<
      string,
      string[]
    >;
    expect(target.items?.armorMaterials).toEqual([
      'leather',
      'copper',
      'chainmail',
      'iron',
      'gold',
      'diamond',
      'turtle_scute',
      'netherite',
      'armadillo_scute',
    ]);
    for (const name of target.items?.armorMaterials ?? []) {
      expect(registries.equipment).toContain(name);
    }
  });

  it('maps the five compost chances to the vanilla providers (ADR 0060 D4)', () => {
    expect(target.items?.compostProviders).toEqual({
      '30%': 'minecraft:compostable/low',
      '50%': 'minecraft:compostable/low_medium',
      '65%': 'minecraft:compostable/medium',
      '85%': 'minecraft:compostable/medium_high',
      '100%': 'minecraft:compostable/always_add_one',
    });
  });

  it('has the villager_trade and trade_set data folders, each a registry (ADR 0060 D5)', async () => {
    expect(target.folders.data.villager_trade).toBe('villager_trade');
    expect(target.folders.data.trade_set).toBe('trade_set');
    const registries = (await readJson('../vendor/mcmeta/registries.json')) as Record<
      string,
      string[]
    >;
    expect(registries.villager_trade?.length).toBeGreaterThan(0);
    expect(registries.trade_set?.length).toBeGreaterThan(0);
  });

  it('maps the seventeen data kinds sweep keys to registry folders (ADR 0064 D5)', async () => {
    const keys = [
      'wolf_variant',
      'cat_variant',
      'pig_variant',
      'cow_variant',
      'chicken_variant',
      'frog_variant',
      'zombie_nautilus_variant',
      'wolf_sound_variant',
      'cat_sound_variant',
      'pig_sound_variant',
      'cow_sound_variant',
      'chicken_sound_variant',
      'instrument',
      'enchantment_provider',
      'trial_spawner',
      'timeline',
      'world_clock',
    ] as const;
    const registries = (await readJson('../vendor/mcmeta/registries.json')) as Record<
      string,
      string[]
    >;
    for (const key of keys) {
      expect(target.folders.data[key]).toBe(key);
      expect(registries[key]?.length, key).toBeGreaterThan(0);
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
  it('lists the data components that name data pack registry entries, as the mcdoc does', async () => {
    const symbols = (await readJson('../vendor/vanilla-mcdoc/symbols.json')) as {
      mcdoc: Record<string, unknown>;
      'mcdoc/dispatcher': Record<string, Record<string, unknown>>;
    };
    // The game's data pack (dynamic) registries a data component can name (ADR 0050).
    const dataPack = new Set([
      'banner_pattern',
      'cat_sound_variant',
      'cat_variant',
      'chicken_sound_variant',
      'chicken_variant',
      'cow_sound_variant',
      'cow_variant',
      'damage_type',
      'enchantment',
      'frog_variant',
      'instrument',
      'jukebox_song',
      'painting_variant',
      'pig_sound_variant',
      'pig_variant',
      'trim_material',
      'trim_pattern',
      'wolf_sound_variant',
      'wolf_variant',
      'zombie_nautilus_variant',
    ]);
    type Node = Record<string, unknown>;
    const attribute = (node: Node, name: string): Node | undefined =>
      (node.attributes as Node[] | undefined)?.find((entry) => entry.name === name)?.value as
        | Node
        | undefined;
    const literal = (value: Node | undefined): unknown =>
      value?.kind === 'literal' ? (value.value as Node).value : undefined;
    const registriesOf = (node: unknown, seen: Set<string>, out: Set<string>): void => {
      if (Array.isArray(node)) {
        for (const entry of node) registriesOf(entry, seen, out);
        return;
      }
      if (typeof node !== 'object' || node === null) return;
      const value = node as Node;
      if (attribute(value, 'until') !== undefined) return;
      const id = attribute(value, 'id');
      const named =
        id?.kind === 'tree' ? literal((id.values as Record<string, Node>).registry) : literal(id);
      if (typeof named === 'string') out.add(named);
      if (value.kind === 'reference') {
        const path = value.path as string;
        if (seen.has(path)) return;
        seen.add(path);
        registriesOf(symbols.mcdoc[path], seen, out);
        return;
      }
      for (const [key, child] of Object.entries(value)) {
        if (key !== 'attributes') registriesOf(child, seen, out);
      }
    };
    const components = symbols['mcdoc/dispatcher']['minecraft:data_component'] ?? {};
    const derived = Object.entries(components)
      .filter(([, schema]) => {
        const out = new Set<string>();
        registriesOf(schema, new Set(), out);
        return [...out].some((registry) => dataPack.has(registry));
      })
      .map(([id]) => id)
      .sort();
    expect(target.items?.dataPackComponents).toEqual(derived);
  });
  it('has the vanilla tool numbers for every tier and tool type', () => {
    const tools = target.items?.vanillaTools ?? {};
    const tiers = ['wooden', 'stone', 'copper', 'iron', 'golden', 'diamond', 'netherite'];
    expect(Object.keys(tools)).toEqual(tiers);
    for (const tier of tiers) {
      expect(Object.keys(tools[tier] ?? {})).toEqual([
        'sword',
        'pickaxe',
        'axe',
        'shovel',
        'hoe',
        'spear',
      ]);
    }
    expect(tools.iron?.sword).toEqual({
      attackDamage: 6,
      attackSpeed: 1.6,
      durability: 250,
      enchantability: 14,
    });
    expect(tools.diamond?.pickaxe?.miningSpeed).toBe(8);
  });
});
