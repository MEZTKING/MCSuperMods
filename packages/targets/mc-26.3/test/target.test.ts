import { readFile } from 'node:fs/promises';
import { createSchemaIndex, parseVanillaMcdocSymbols } from '@msm/schemas';
import { describe, expect, it } from 'vitest';
import { target } from '../src/index';

async function readJson(relative: string): Promise<Record<string, unknown>> {
  const text = await readFile(new URL(relative, import.meta.url), 'utf8');
  return JSON.parse(text) as Record<string, unknown>;
}

describe('target mc-26.3', () => {
  it('is a release target', () => expect(target.channel).toBe('release'));

  it('sets the Fabric toolchain versions', () => {
    expect(target.fabric).toEqual({
      loader: '0.20.1',
      api: '0.165.2+26.3',
      loom: '1.19.3',
      minecraftDependency: '~26.3',
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
    expect(target.fabric?.api.endsWith(`+${target.mcVersion}`)).toBe(true);
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

  it('sets the GeckoLib facts', () => {
    const geckolib = target.geckolib;
    expect(geckolib).toBeDefined();
    if (geckolib === undefined) return;
    expect(geckolib.version).toBe('5.5.7');
    expect(geckolib.modId).toBe('geckolib');
    expect(geckolib.dependency).toBe(`>=${geckolib.version}`);
    expect(geckolib.fileName).toBe(`geckolib-fabric-${target.mcVersion}-${geckolib.version}.jar`);
    expect(geckolib.url.startsWith('https://cdn.modrinth.com/')).toBe(true);
    expect(geckolib.url.endsWith(`/${geckolib.fileName}`)).toBe(true);
    expect(geckolib.sha512).toMatch(/^[0-9a-f]{128}$/);
    expect(geckolib.modrinthVersionId).toBe('kSxHvs99');
    expect(geckolib.url).toContain(`/versions/${geckolib.modrinthVersionId}/`);
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

  it('lists the projectile items and the saddle tag (ADR 0070 D7, ADR 0071 D4)', () => {
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
    ]);
    expect(target.entities?.saddleTag).toBe('minecraft:can_equip_saddle');
  });

  it('lists the container sounds and machine recipe types (ADR 0074 D7, ADR 0075 D7)', async () => {
    const registries = (await readJson('../vendor/mcmeta/registries.json')) as Record<
      string,
      string[]
    >;
    expect(target.blocks?.containerSounds).toEqual({
      open: 'minecraft:block.barrel.open',
      close: 'minecraft:block.barrel.close',
    });
    expect(target.blocks?.machineRecipeTypes).toEqual([
      'minecraft:smelting',
      'minecraft:blasting',
      'minecraft:smoking',
      'minecraft:campfire_cooking',
    ]);
    const sounds = target.blocks?.containerSounds;
    for (const id of [sounds?.open, sounds?.close]) {
      expect(registries.sound_event, id).toContain(id?.slice('minecraft:'.length));
    }
    for (const id of target.blocks?.machineRecipeTypes ?? []) {
      expect(registries.recipe_type, id).toContain(id.slice('minecraft:'.length));
    }
  });

  it('lists the portal sounds and particle (ADR 0077 D7)', async () => {
    const registries = (await readJson('../vendor/mcmeta/registries.json')) as Record<
      string,
      string[]
    >;
    const portal = target.blocks?.portal;
    expect(portal).toEqual({
      ambientSound: 'minecraft:block.portal.ambient',
      travelSound: 'minecraft:block.portal.travel',
      triggerSound: 'minecraft:block.portal.trigger',
      particle: 'minecraft:portal',
    });
    for (const id of [portal?.ambientSound, portal?.travelSound, portal?.triggerSound]) {
      expect(registries.sound_event, id).toContain(id?.slice('minecraft:'.length));
    }
    expect(registries.particle_type).toContain(portal?.particle.slice('minecraft:'.length));
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

  it('lists the particle types that take options, as the vendored mcdoc and mcmeta do (ADR 0080 D9)', async () => {
    const symbols = parseVanillaMcdocSymbols(
      await readJson('../vendor/vanilla-mcdoc/symbols.json'),
    );
    const index = createSchemaIndex(symbols, { mcVersion: target.mcVersion });
    const registries = (await readJson('../vendor/mcmeta/registries.json')) as Record<
      string,
      string[]
    >;
    const facts = target.particles;
    expect(facts?.withOptions).toEqual([
      'minecraft:block',
      'minecraft:block_crumble',
      'minecraft:block_marker',
      'minecraft:dragon_breath',
      'minecraft:dust',
      'minecraft:dust_color_transition',
      'minecraft:dust_pillar',
      'minecraft:effect',
      'minecraft:entity_effect',
      'minecraft:falling_dust',
      'minecraft:flash',
      'minecraft:geyser',
      'minecraft:geyser_base',
      'minecraft:geyser_plume',
      'minecraft:geyser_poof',
      'minecraft:instant_effect',
      'minecraft:item',
      'minecraft:sculk_charge',
      'minecraft:shriek',
      'minecraft:tinted_leaves',
      'minecraft:trail',
      'minecraft:vibration',
    ]);
    // The dispatcher keys available in this version (`since`/`until` honoured), without the
    // `%none`/`%unknown` fallbacks, are exactly the types that take options.
    const keys = index
      .dispatcherKeys('minecraft:particle')
      .filter((key) => !key.startsWith('%'))
      .map((key) => `minecraft:${key}`);
    expect([...(facts?.withOptions ?? [])].sort()).toEqual(keys);
    for (const id of facts?.withOptions ?? []) {
      expect(registries.particle_type, id).toContain(id.slice('minecraft:'.length));
    }
    expect(facts?.descriptionFolder).toBe('particles');
    expect(facts?.textureFolder).toBe('particle');
  });

  it('sets the test world game rules and the world data folders (ADR 0084 D10)', async () => {
    const registries = (await readJson('../vendor/mcmeta/registries.json')) as Record<
      string,
      string[]
    >;
    const commands = (await readJson('../vendor/mcmeta/commands.json')) as {
      children: Record<string, { children?: Record<string, unknown> }>;
    };
    const facts = target.dev;
    expect(facts?.gameRules).toEqual({
      advanceTime: 'advance_time',
      advanceWeather: 'advance_weather',
      spawnMobs: 'spawn_mobs',
      keepInventory: 'keep_inventory',
    });
    for (const id of Object.values(facts?.gameRules ?? {})) {
      expect(registries.game_rule, id).toContain(id);
      expect(Object.keys(commands.children.gamerule?.children ?? {}), id).toContain(id);
    }
    // `RegistryDataLoader.WORLD_REGISTRIES` and `DIMENSION_REGISTRIES` in the merged jar (javap,
    // 2026-11-14): 52 world registries plus `dimension`.
    expect(facts?.worldDataFolders).toEqual([
      'banner_pattern',
      'block_transformer',
      'cat_sound_variant',
      'cat_variant',
      'chat_type',
      'chicken_sound_variant',
      'chicken_variant',
      'cow_sound_variant',
      'cow_variant',
      'damage_type',
      'decorated_pot_pattern',
      'dialog',
      'dimension',
      'dimension_type',
      'enchantment',
      'enchantment_provider',
      'frog_variant',
      'instrument',
      'jukebox_song',
      'painting_variant',
      'pig_sound_variant',
      'pig_variant',
      'sulfur_cube_archetype',
      'test_environment',
      'test_instance',
      'timeline',
      'trade_set',
      'trial_spawner',
      'trim_material',
      'trim_pattern',
      'villager_trade',
      'wolf_sound_variant',
      'wolf_variant',
      'world_clock',
      'worldgen/biome',
      'worldgen/block_state_provider',
      'worldgen/carver',
      'worldgen/density_function',
      'worldgen/feature',
      'worldgen/flat_level_generator_preset',
      'worldgen/material_condition',
      'worldgen/material_rule',
      'worldgen/multi_noise_biome_source_parameter_list',
      'worldgen/noise',
      'worldgen/noise_settings',
      'worldgen/placed_feature',
      'worldgen/processor_list',
      'worldgen/structure',
      'worldgen/structure_set',
      'worldgen/template_pool',
      'worldgen/world_preset',
      'zombie_nautilus_variant',
    ]);
    for (const folder of facts?.worldDataFolders ?? []) {
      expect(Object.keys(registries), folder).toContain(folder);
    }
  });

  it('lists the control facts of the B406 client dump (ADR 0088 D9)', async () => {
    const dump = (await readJson(
      '../../../../docs/reference/vanilla-keys/vanilla-keys-26.3.json',
    )) as {
      minecraft: string;
      keyNames: string[];
      unboundName: string;
      vanillaKeys: Record<string, string>;
      keyboardNamesByCode0to400: Record<string, string>;
      mouseNamesByCode0to10: Record<string, string>;
    };
    expect(dump.minecraft).toBe('26.3');
    const facts = target.controls;
    expect(facts).toBeDefined();
    if (facts === undefined) return;
    expect(facts.keyNames).toEqual(dump.keyNames);
    expect(facts.unboundKey).toBe(dump.unboundName);
    expect(facts.vanillaKeys).toEqual(dump.vanillaKeys);
    expect(Object.keys(facts.vanillaKeys)).toHaveLength(62);
    // 26.3 `key.socialInteractions` is 26.4 `key.otherPlayers` (B406).
    expect(facts.vanillaKeys['key.socialInteractions']).toBe('key.keyboard.p');
    expect(facts.vanillaKeys['key.otherPlayers']).toBeUndefined();
    // Code tables: the dump, with names the game cannot parse back shown as unbound.
    const valid = new Set(facts.keyNames);
    expect(facts.keyboardNamesByCode).toHaveLength(401);
    facts.keyboardNamesByCode.forEach((name, code) => {
      const dumped = dump.keyboardNamesByCode0to400[String(code)];
      expect(name, String(code)).toBe(
        dumped !== undefined && valid.has(dumped) ? dumped : facts.unboundKey,
      );
    });
    expect(facts.keyboardNamesByCode[4]).toBe('key.keyboard.a');
    expect(facts.keyboardNamesByCode[21]).toBe('key.keyboard.r');
    expect(facts.keyboardNamesByCode[226]).toBe('key.keyboard.left.alt');
    expect(facts.mouseNamesByCode).toHaveLength(11);
    facts.mouseNamesByCode.forEach((name, code) => {
      const dumped = dump.mouseNamesByCode0to10[String(code)];
      expect(name, String(code)).toBe(
        dumped !== undefined && valid.has(dumped) ? dumped : facts.unboundKey,
      );
    });
    expect(facts.mouseNamesByCode[1]).toBe('key.mouse.left');
    // The debug combinations: every `key.debug.*` control not on the modifier's own key (F3).
    const modifier = facts.vanillaKeys['key.debug.modifier'];
    expect(modifier).toBe('key.keyboard.f3');
    expect(facts.vanillaCombinations).toEqual(
      Object.keys(facts.vanillaKeys)
        .filter(
          (control) => control.startsWith('key.debug.') && facts.vanillaKeys[control] !== modifier,
        )
        .sort(),
    );
  });

  it('sets runtime keys no vanilla control uses as a plain key (ADR 0088 D5)', () => {
    const facts = target.controls;
    expect(facts?.runtimeKeys).toEqual({
      fire: 'key.keyboard.r',
      second: 'key.keyboard.v',
      horn: 'key.keyboard.h',
      descend: 'key.keyboard.left.alt',
    });
    if (facts === undefined) return;
    // Debug combinations (F3 plus a key) are not plain bindings and do not clash (decision B410).
    const combinations = new Set(facts.vanillaCombinations);
    const plain = Object.entries(facts.vanillaKeys).filter(
      ([control, key]) => !combinations.has(control) && key !== facts.unboundKey,
    );
    const defaults = Object.values(facts.runtimeKeys);
    expect(new Set(defaults).size).toBe(defaults.length);
    for (const key of defaults) {
      expect(facts.keyNames, key).toContain(key);
      expect(
        plain.filter(([, bound]) => bound === key).map(([control]) => control),
        key,
      ).toEqual([]);
    }
    // The second weapon is not G: G is `key.quickActions` (B406).
    expect(facts.vanillaKeys['key.quickActions']).toBe('key.keyboard.g');
  });

  it('sets the vehicle facts of ADR 0090 D3 and D4', () => {
    expect(target.vehicles).toEqual({
      modes: ['ground', 'water', 'amphibious', 'air', 'hover'],
      maxSpeed: 3,
    });
  });
});
