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
  'block_transformer',
  'cat_sound_variant',
  'cat_variant',
  'chat_type',
  'chicken_sound_variant',
  'chicken_variant',
  'context_float_provider',
  'context_int_provider',
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
  'sulfur_cube_archetype',
  'tags',
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

/**
 * Vanilla block tags block types and plants join or read (ADR 0067 D6, ADR 0068 D3, D4, D6),
 * unprefixed as in `registries.json`.
 */
const FAMILY_BLOCK_TAGS = [
  'bee_growables',
  'buttons',
  'crops',
  'doors',
  'fence_gates',
  'fences',
  'leaves',
  'logs',
  'logs_that_burn',
  'maintains_farmland',
  'mineable/axe',
  'mineable/hoe',
  'mineable/pickaxe',
  'mineable/shovel',
  'planks',
  'pressure_plates',
  'saplings',
  'slabs',
  'stairs',
  'stone_buttons',
  'stone_pressure_plates',
  'supports_crops',
  'supports_vegetation',
  'trapdoors',
  'walls',
  'wooden_buttons',
  'wooden_doors',
  'wooden_fences',
  'wooden_pressure_plates',
  'wooden_trapdoors',
];

/** The item tag counterparts vanilla has, plus `villager_plantable_seeds` (ADR 0068 D3). */
const FAMILY_ITEM_TAGS = [
  'buttons',
  'doors',
  'fence_gates',
  'fences',
  'leaves',
  'logs',
  'logs_that_burn',
  'planks',
  'saplings',
  'slabs',
  'stairs',
  'stone_buttons',
  'trapdoors',
  'villager_plantable_seeds',
  'walls',
  'wooden_buttons',
  'wooden_doors',
  'wooden_fences',
  'wooden_pressure_plates',
  'wooden_trapdoors',
];

/** Block tags with no item counterpart: lowering writes only the block tag for these. */
const BLOCK_ONLY_FAMILY_TAGS = ['pressure_plates', 'stone_pressure_plates'];

/** A node of the vendored Brigadier command tree. */
interface CommandNode {
  type?: string;
  parser?: string;
  properties?: Record<string, unknown>;
  children?: Record<string, CommandNode>;
}

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
      expect(facts).not.toHaveProperty('loadJavaProject');
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

    it('has every vanilla block and item tag block families use (ADR 0067 D6, ADR 0068)', async () => {
      const registries = (await readVendoredJson(
        bundle,
        'mcmetaRegistries',
        nodeReadFile,
      )) as Record<string, string[]>;
      const blockTags = registries['tag/block'] ?? [];
      const itemTags = registries['tag/item'] ?? [];
      for (const tag of FAMILY_BLOCK_TAGS) expect(blockTags, `block ${tag}`).toContain(tag);
      for (const tag of FAMILY_ITEM_TAGS) expect(itemTags, `item ${tag}`).toContain(tag);
      for (const tag of BLOCK_ONLY_FAMILY_TAGS) expect(itemTags, `item ${tag}`).not.toContain(tag);
    });

    it('lists the block family set and wood type names, identical on every target (ADR 0067 D9)', () => {
      expect(target.blocks?.setTypes).toEqual([
        'wood',
        'cherry',
        'bamboo',
        'crimson',
        'warped',
        'iron',
        'copper',
        'gold',
        'stone',
        'polished_blackstone',
      ]);
      expect(target.blocks?.woodTypes).toEqual([
        'oak',
        'spruce',
        'birch',
        'acacia',
        'cherry',
        'jungle',
        'dark_oak',
        'pale_oak',
        'poplar',
        'crimson',
        'warped',
        'mangrove',
        'bamboo',
      ]);
    });

    it('lists container and machine block facts the vendored registries know (ADR 0074 D7, ADR 0075 D7)', async () => {
      const registries = (await readVendoredJson(
        bundle,
        'mcmetaRegistries',
        nodeReadFile,
      )) as Record<string, string[]>;
      const soundEvents = registries.sound_event ?? [];
      const recipeTypes = registries.recipe_type ?? [];
      const sounds = target.blocks?.containerSounds;
      expect(sounds).toEqual({
        open: 'minecraft:block.barrel.open',
        close: 'minecraft:block.barrel.close',
      });
      for (const id of [sounds?.open ?? '', sounds?.close ?? '']) {
        expect(id, id).toMatch(/^minecraft:[a-z0-9_.]+$/);
        expect(soundEvents, id).toContain(id.slice('minecraft:'.length));
      }
      const types = target.blocks?.machineRecipeTypes ?? [];
      expect(types).toEqual([
        'minecraft:smelting',
        'minecraft:blasting',
        'minecraft:smoking',
        'minecraft:campfire_cooking',
      ]);
      for (const id of types) expect(recipeTypes, id).toContain(id.slice('minecraft:'.length));
    });

    it('lists portal block facts the vendored registries know (ADR 0077 D7)', async () => {
      const registries = (await readVendoredJson(
        bundle,
        'mcmetaRegistries',
        nodeReadFile,
      )) as Record<string, string[]>;
      const soundEvents = registries.sound_event ?? [];
      const particleTypes = registries.particle_type ?? [];
      const portal = target.blocks?.portal;
      expect(portal).toEqual({
        ambientSound: 'minecraft:block.portal.ambient',
        travelSound: 'minecraft:block.portal.travel',
        triggerSound: 'minecraft:block.portal.trigger',
        particle: 'minecraft:portal',
      });
      for (const id of [
        portal?.ambientSound ?? '',
        portal?.travelSound ?? '',
        portal?.triggerSound ?? '',
      ]) {
        expect(id, id).toMatch(/^minecraft:[a-z0-9_.]+$/);
        expect(soundEvents, id).toContain(id.slice('minecraft:'.length));
      }
      const particle = portal?.particle ?? '';
      expect(particle).toMatch(/^minecraft:[a-z0-9_]+$/);
      expect(particleTypes, particle).toContain(particle.slice('minecraft:'.length));
    });

    it('lists particle facts the vendored mcdoc and registries know (ADR 0080 D9)', async () => {
      const registries = (await readVendoredJson(
        bundle,
        'mcmetaRegistries',
        nodeReadFile,
      )) as Record<string, string[]>;
      const particleTypes = registries.particle_type ?? [];
      const symbols = parseVanillaMcdocSymbols(
        await readVendoredJson(bundle, 'vanillaMcdocSymbols', nodeReadFile),
      );
      const index = createSchemaIndex(symbols, { mcVersion: target.mcVersion });
      const facts = target.particles;
      expect(facts).toBeDefined();
      const withOptions = facts?.withOptions ?? [];
      expect(withOptions.length).toBeGreaterThan(0);
      expect(new Set(withOptions).size).toBe(withOptions.length);
      for (const id of withOptions) {
        expect(id, id).toMatch(/^minecraft:[a-z0-9_]+$/);
        expect(particleTypes, id).toContain(id.slice('minecraft:'.length));
      }
      const keys = index
        .dispatcherKeys('minecraft:particle')
        .filter((key) => !key.startsWith('%'))
        .map((key) => `minecraft:${key}`);
      expect([...withOptions].sort()).toEqual(keys);
      // Single path segments, as the resource folders are.
      expect(facts?.descriptionFolder).toMatch(/^[a-z0-9_]+$/);
      expect(facts?.textureFolder).toMatch(/^[a-z0-9_]+$/);
    });

    it('lists entity facts the vendored registries know (ADR 0070 D7, ADR 0071 D4)', async () => {
      const registries = (await readVendoredJson(
        bundle,
        'mcmetaRegistries',
        nodeReadFile,
      )) as Record<string, string[]>;
      const items = registries.item ?? [];
      const entityTypeTags = registries['tag/entity_type'] ?? [];
      const facts = target.entities;
      expect(facts).toBeDefined();
      expect(facts?.projectileItems.length).toBeGreaterThan(0);
      expect(new Set(facts?.projectileItems).size).toBe(facts?.projectileItems.length);
      for (const id of facts?.projectileItems ?? []) {
        expect(id, id).toMatch(/^minecraft:[a-z0-9_]+$/);
        expect(items, id).toContain(id.slice('minecraft:'.length));
      }
      expect(facts?.saddleTag).toBe('minecraft:can_equip_saddle');
      expect(entityTypeTags).toContain('can_equip_saddle');
    });

    it('lists dev facts the vendored registries and command tree know (ADR 0084 D10)', async () => {
      const registries = (await readVendoredJson(
        bundle,
        'mcmetaRegistries',
        nodeReadFile,
      )) as Record<string, string[]>;
      const commands = (await readVendoredJson(bundle, 'mcmetaCommands', nodeReadFile)) as {
        children: Record<string, { children?: Record<string, unknown> }>;
      };
      const facts = target.dev;
      expect(facts).toBeDefined();
      const rules = Object.values(facts?.gameRules ?? {});
      expect(rules).toHaveLength(4);
      for (const id of rules) {
        // Registry ids without a namespace, as the `/gamerule` literals are.
        expect(id, id).toMatch(/^[a-z0-9_]+$/);
        expect(registries.game_rule, id).toContain(id);
        expect(Object.keys(commands.children.gamerule?.children ?? {}), id).toContain(id);
      }
      const folders = facts?.worldDataFolders ?? [];
      expect(folders.length).toBeGreaterThan(0);
      expect([...folders].sort()).toEqual(folders);
      expect(new Set(folders).size).toBe(folders.length);
      // A subset of the target's data folders: every entry is a vendored registry folder, and a
      // folder with a data folder key is named as the target names it.
      const dataFolders = new Set(Object.values(target.folders.data));
      for (const folder of folders) {
        expect(folder, folder).toMatch(/^[a-z0-9_]+(\/[a-z0-9_]+)?$/);
        expect(Object.keys(registries), folder).toContain(folder);
        const [first, second] = folder.split('/');
        if (second !== undefined) expect(first).toBe(target.folders.data.worldgen);
      }
      for (const key of [
        'dimension',
        'dimension_type',
        'enchantment',
        'damage_type',
        'painting_variant',
        'jukebox_song',
        'chat_type',
        'trim_material',
        'trim_pattern',
        'timeline',
        'world_clock',
      ] as const) {
        expect(dataFolders).toContain(target.folders.data[key]);
        expect(folders, key).toContain(target.folders.data[key]);
      }
      expect(folders).toContain(`${target.folders.data.worldgen}/biome`);
      // Folders `/reload` reads stay out.
      for (const key of [
        'recipe',
        'loot_table',
        'advancement',
        'predicate',
        'item_modifier',
        'function',
        'tags',
      ] as const) {
        expect(folders, key).not.toContain(target.folders.data[key]);
      }
    });

    it('has runtime key defaults that are no vanilla plain binding (ADR 0088 D5, D9)', () => {
      const facts = target.controls;
      expect(facts).toBeDefined();
      if (facts === undefined) return;
      // `key.debug.*` controls on another key than the debug modifier are F3 combinations: they
      // are listed in `vanillaCombinations` and are not plain bindings, so they do not clash
      // (decision B410; B406 did not measure whether they also take the key alone).
      const combinations = new Set(facts.vanillaCombinations);
      for (const control of combinations) {
        expect(control, control).toMatch(/^key\.debug\./);
        expect(facts.vanillaKeys[control], control).not.toBe(
          facts.vanillaKeys['key.debug.modifier'],
        );
      }
      for (const [name, key] of Object.entries(facts.runtimeKeys)) {
        expect(facts.keyNames, name).toContain(key);
        expect(key, name).not.toBe(facts.unboundKey);
        for (const [control, bound] of Object.entries(facts.vanillaKeys)) {
          if (combinations.has(control)) continue;
          expect(bound, `${name} clashes with ${control}`).not.toBe(key);
        }
      }
      for (const name of [...facts.keyboardNamesByCode, ...facts.mouseNamesByCode]) {
        expect(facts.keyNames, name).toContain(name);
      }
      for (const key of Object.values(facts.vanillaKeys))
        expect(facts.keyNames, key).toContain(key);
    });

    it('lists vehicle facts (ADR 0090 D13)', () => {
      expect(target.vehicles?.modes).toEqual(['ground', 'water', 'amphibious', 'air', 'hover']);
      expect(target.vehicles?.maxSpeed).toBe(3);
      // Copied by `targetFacts` with the other data fields.
      expect(targetFacts(target.id)?.controls).toEqual(target.controls);
      expect(targetFacts(target.id)?.vehicles).toEqual(target.vehicles);
    });

    it('lists bed, dye, stem and torch block facts the vendored data knows (ADR 0094 D2, D12)', async () => {
      const registries = (await readVendoredJson(
        bundle,
        'mcmetaRegistries',
        nodeReadFile,
      )) as Record<string, string[]>;
      const facts = target.blocks;
      // Bed rules: the two MSM rule names, each an environment attribute of this version.
      expect(Object.keys(facts?.bedRules ?? {})).toEqual(['bed', 'straw_bed']);
      for (const id of Object.values(facts?.bedRules ?? {})) {
        expect(id).toMatch(/^minecraft:gameplay\/[a-z_]+$/);
        expect(registries.environment_attribute, id).toContain(id.slice('minecraft:'.length));
      }
      // Dye colours: the vendored mcdoc enum's values, in its order.
      const symbols = parseVanillaMcdocSymbols(
        await readVendoredJson(bundle, 'vanillaMcdocSymbols', nodeReadFile),
      );
      const index = createSchemaIndex(symbols, { mcVersion: target.mcVersion });
      const dye = index.resolve('::java::util::color::DyeColor') as {
        kind: string;
        values?: { value: unknown }[];
      };
      expect(dye.kind).toBe('enum');
      expect(facts?.dyeColours).toEqual((dye.values ?? []).map((entry) => entry.value));
      expect(facts?.dyeColours).toHaveLength(16);
      // Stem tags: the melon stem's two block tags (B440); the pumpkin stem's exist as well.
      expect(facts?.stemTags).toEqual({
        soil: 'minecraft:supports_melon_stem',
        fruitSoil: 'minecraft:supports_melon_stem_fruit',
      });
      const blockTags = registries['tag/block'] ?? [];
      for (const tag of [
        facts?.stemTags?.soil ?? '',
        facts?.stemTags?.fruitSoil ?? '',
        'minecraft:supports_pumpkin_stem',
        'minecraft:supports_pumpkin_stem_fruit',
      ]) {
        expect(blockTags, tag).toContain(tag.slice('minecraft:'.length));
      }
      // The torch particle: a registered particle type that takes no options.
      const particle = facts?.defaultTorchParticle ?? '';
      expect(particle).toBe('minecraft:flame');
      expect(registries.particle_type, particle).toContain(particle.slice('minecraft:'.length));
      expect(target.particles?.withOptions ?? []).not.toContain(particle);
    });

    it('lists the block model templates the block type lowerings name (ADR 0094 D10)', () => {
      const templates = target.blocks?.modelTemplates ?? [];
      expect(new Set(templates).size).toBe(templates.length);
      for (const id of templates) expect(id).toMatch(/^minecraft:block\/[a-z0-9_]+$/);
      // The fourteen sign templates of B440's S1 answer.
      const signs = [
        ...[0, 1, 2, 3].map((r) => `template_sign_rot_${r}`),
        'template_wall_sign',
        ...[0, 1, 2, 3].map((r) => `template_hanging_sign_rot_${r}`),
        ...[0, 1, 2, 3].map((r) => `template_attached_hanging_sign_rot_${r}`),
        'template_wall_hanging_sign',
      ];
      expect(signs).toHaveLength(14);
      for (const name of signs) expect(templates).toContain(`minecraft:block/${name}`);
      for (const name of [
        'template_bed_head',
        'template_bed_foot',
        'template_torch',
        'template_torch_wall',
        'template_lantern',
        'template_hanging_lantern',
        'template_chain',
        'template_candle',
        'template_four_candles',
        'stem_growth7',
        'stem_fruit',
      ]) {
        expect(templates).toContain(`minecraft:block/${name}`);
      }
      // The jar listing check is `model-templates.test.ts`.
    });

    it('lists trader, job site and trade set facts the vendored registries know (ADR 0098 D5)', async () => {
      const registries = (await readVendoredJson(
        bundle,
        'mcmetaRegistries',
        nodeReadFile,
      )) as Record<string, string[]>;
      const facts = target.entities;
      const sounds = registries.sound_event ?? [];
      // Trade sounds: vanilla villager sound events of this version.
      expect(Object.keys(facts?.tradeSounds ?? {}).sort()).toEqual(['no', 'trading', 'yes']);
      expect(facts?.tradeSounds?.yes).toBe('minecraft:entity.villager.yes');
      for (const id of Object.values(facts?.tradeSounds ?? {})) {
        expect(sounds, id).toContain(id.slice('minecraft:'.length));
      }
      // Job sites: one entry per point of interest type, each block registered, no block twice.
      const sites = facts?.vanillaJobSites ?? {};
      expect(Object.keys(sites)).toEqual(
        (registries.point_of_interest_type ?? []).map((id) => `minecraft:${id}`).sort(),
      );
      const blocks = registries.block ?? [];
      const seen = new Set<string>();
      for (const [poi, list] of Object.entries(sites)) {
        expect(list.length, poi).toBeGreaterThan(0);
        for (const id of list) {
          expect(id, poi).toMatch(/^minecraft:[a-z0-9_]+$/);
          expect(blocks, id).toContain(id.slice('minecraft:'.length));
          expect(seen.has(id), id).toBe(false);
          seen.add(id);
        }
      }
      // The acquirable job sites are the professions' point of interest types.
      const professions = (registries.villager_profession ?? []).filter(
        (id) => id !== 'none' && id !== 'nitwit',
      );
      for (const id of professions) expect(Object.keys(sites)).toContain(`minecraft:${id}`);
      expect(registries['tag/point_of_interest_type']).toContain('acquirable_job_site');
      // Trade sets: exactly the vendored registry, counts consistent with the flag.
      const sets = facts?.vanillaTradeSets ?? {};
      expect(Object.keys(sets)).toEqual(
        (registries.trade_set ?? []).map((id) => `minecraft:${id}`).sort(),
      );
      for (const [id, set] of Object.entries(sets)) {
        expect(set.trades, id).toBeGreaterThan(0);
        expect(set.villagerOnlyTrades, id).toBeLessThanOrEqual(set.trades);
        expect(set.villagerOnly, id).toBe(set.villagerOnlyTrades > 0);
      }
      // Every profession but the jobless ones has five level sets.
      for (const id of professions) {
        for (let level = 1; level <= 5; level++) {
          expect(sets, `${id}/level_${level}`).toHaveProperty([`minecraft:${id}/level_${level}`]);
        }
      }
    });

    it('lists fluid facts the vendored registries know (ADR 0099 D4)', async () => {
      const registries = (await readVendoredJson(
        bundle,
        'mcmetaRegistries',
        nodeReadFile,
      )) as Record<string, string[]>;
      const facts = target.blocks;
      const fluids = registries.fluid ?? [];
      // Two fluids exactly when the flowing ids are registered.
      expect(facts?.fluidModel).toBe(fluids.includes('flowing_water') ? 'two_fluids' : 'one_fluid');
      expect(fluids.includes('flowing_lava')).toBe(facts?.fluidModel === 'two_fluids');
      const tags = registries['tag/fluid'] ?? [];
      expect(facts?.fluidTags?.water[0]).toBe('minecraft:water');
      expect(facts?.fluidTags?.lava).toEqual(['minecraft:lava']);
      for (const id of [...(facts?.fluidTags?.water ?? []), ...(facts?.fluidTags?.lava ?? [])]) {
        expect(tags, id).toContain(id.slice('minecraft:'.length));
      }
      // The swimming pose's tag joins the water-like fluid's tags wherever the version has it.
      expect(facts?.fluidTags?.water.includes('minecraft:swimmable')).toBe(
        tags.includes('swimmable'),
      );
    });

    it('lists command facts the vendored command tree and registries know (ADR 0096 D6)', async () => {
      const commands = (await readVendoredJson(bundle, 'mcmetaCommands', nodeReadFile)) as {
        children: Record<string, CommandNode>;
      };
      const registries = (await readVendoredJson(
        bundle,
        'mcmetaRegistries',
        nodeReadFile,
      )) as Record<string, string[]>;
      const facts = target.commands;
      expect(facts?.vanillaNames).toEqual(Object.keys(commands.children).sort());
      for (const name of ['give', 'tp', 'teleport', 'xp', 'function', 'trigger']) {
        expect(facts?.vanillaNames).toContain(name);
      }
      expect(Object.keys(facts?.argumentTypes ?? {})).toEqual([
        'integer',
        'number',
        'word',
        'text',
        'boolean',
        'player',
        'players',
        'entity',
        'position',
        'block_position',
        'item',
        'block',
        // ADR 0111 D2 (plugin API 1.20.0), in B525's order.
        'dimension',
        'time',
        'team_colour',
        'hex_colour',
        'rotation',
        'angle',
        'uuid',
        'objective',
        'score_holder',
        'score_holders',
        'item_predicate',
        'block_predicate',
        'effect',
        'enchantment',
        'biome',
        'biome_or_tag',
        'structure',
        'structure_or_tag',
        'entity_type',
        'particle',
        'game_mode',
        'text_component',
        'int_range',
        'identifier',
        'team',
        'slot',
        'nbt',
        'message',
        'dialog',
        'loot_table',
        'advancement',
        'recipe',
      ]);
      // Every parser and its properties occur together on an argument node of the tree, and
      // every parser is a registered command argument type. Two pairs have no node in the
      // vanilla tree, as no vanilla command takes them, yet B525 registered them and saw the
      // client parse them: `angle` on both targets, and on 26.4 `effect` (vanilla's `/effect`
      // takes `resource_or_tag` there). Their registry, when they have one, is still a vendored
      // registry the game sends to players.
      const notInTree = new Set(['angle', ...(target.id === 'mc-26.4' ? ['effect'] : [])]);
      const seen = new Set<string>();
      const walk = (node: CommandNode): void => {
        if (node.type === 'argument' && node.parser !== undefined) {
          const fixed = Object.entries(node.properties ?? {})
            .filter(([key]) => key !== 'min' && key !== 'max')
            .sort(([a], [b]) => a.localeCompare(b));
          seen.add(`${node.parser} ${JSON.stringify(Object.fromEntries(fixed))}`);
        }
        for (const child of Object.values(node.children ?? {})) walk(child);
      };
      walk(commands as CommandNode);
      const argumentTypes = registries.command_argument_type ?? [];
      for (const [name, argument] of Object.entries(facts?.argumentTypes ?? {})) {
        const properties = Object.fromEntries(
          Object.entries(argument.properties ?? {}).sort(([a], [b]) => a.localeCompare(b)),
        );
        const pair = `${argument.parser} ${JSON.stringify(properties)}`;
        if (notInTree.has(name)) expect(seen, name).not.toContain(pair);
        else expect(seen, name).toContain(pair);
        const registryId = argument.parser.startsWith('minecraft:')
          ? argument.parser.slice('minecraft:'.length)
          : argument.parser;
        expect(argumentTypes, name).toContain(registryId);
        const registry = argument.properties?.registry;
        if (registry !== undefined) {
          expect(registries[registry.slice('minecraft:'.length)], name).toBeDefined();
        }
      }
      // The key types (ADR 0111 D2 as amended): registries the game never sends to players.
      expect(
        Object.entries(facts?.argumentTypes ?? {})
          .filter(([, argument]) => argument.keyOnly === true)
          .map(([name]) => name),
      ).toEqual(['structure', 'structure_or_tag', 'advancement', 'recipe']);
      for (const name of ['structure', 'structure_or_tag', 'advancement', 'recipe']) {
        expect(facts?.argumentTypes[name]?.parser, name).toMatch(
          /^minecraft:resource(_or_tag)?_key$/,
        );
      }
      // Copied by `targetFacts` with the other data fields.
      expect(targetFacts(target.id)?.commands).toEqual(target.commands);
      expect(targetFacts(target.id)?.blocks?.modelTemplates).toEqual(target.blocks?.modelTemplates);
    });

    it('lists villager type, cauldron, game rule and statistic facts the vendored registries know (ADR 0107 D6, ADR 0108 D6, ADR 0111 D8)', async () => {
      const registries = (await readVendoredJson(
        bundle,
        'mcmetaRegistries',
        nodeReadFile,
      )) as Record<string, string[]>;
      expect(target.entities?.villagerTypes).toEqual([...(registries.villager_type ?? [])].sort());
      expect(target.entities?.villagerTypes).toHaveLength(7);
      expect(target.blocks?.cauldrons).toEqual(
        (registries.block ?? [])
          .filter((id) => id.includes('cauldron'))
          .map((id) => `minecraft:${id}`)
          .sort(),
      );
      expect(target.blocks?.cauldrons).toEqual([
        'minecraft:cauldron',
        'minecraft:lava_cauldron',
        'minecraft:powder_snow_cauldron',
        'minecraft:water_cauldron',
      ]);
      expect(target.gameRules?.kinds).toEqual(['boolean', 'integer']);
      expect(target.gameRules?.categories).toEqual([
        'player',
        'mobs',
        'spawning',
        'drops',
        'updates',
        'chat',
        'misc',
      ]);
      expect(target.gameRules?.vanillaNames).toEqual([...(registries.game_rule ?? [])].sort());
      expect(target.gameRules?.vanillaNames).toContain('keep_inventory');
      expect(target.stats?.formats).toEqual(['default', 'distance', 'time']);
      expect(target.stats?.criterionPrefix).toBe('minecraft.custom:');
      expect(target.stats?.vanillaCustomStats).toEqual([...(registries.custom_stat ?? [])].sort());
      expect(target.stats?.vanillaCustomStats).toContain('jump');
      // Copied by `targetFacts` with the other data fields.
      expect(targetFacts(target.id)?.gameRules).toEqual(target.gameRules);
      expect(targetFacts(target.id)?.stats).toEqual(target.stats);
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
