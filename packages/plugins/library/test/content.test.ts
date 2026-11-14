/**
 * Shape of the library content: starter and example ids, categories, kinds, determinism,
 * namespaces and placeholder assets. Validation against the schema, loading and export with
 * the real resource pack and data pack plugins live in `packages/exporters/test/library.test.ts`.
 */
import type { ContentBundle, ExampleProject, Json, ProjectStarter } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { COLOURS } from '../src/content/bundle';
import { SKIN_ANIMALS, SKIN_SHADES, shade } from '../src/content/mob-skins';
import {
  behaviourExamples,
  categoryTag,
  entityBehaviourExamples,
  kindExamples,
  libraryExamples,
  libraryStarters,
  mobSkinPng,
  PLACEHOLDER_PATTERNS,
  paintingPng,
  placeholderPng,
  placeholderSkinPng,
  STARTERS_CATEGORY,
  scriptBehaviourExamples,
  starterExamples,
} from '../src/index';
import { TINTABLE_GREY } from '../src/starters/wood-set';

const STARTER_IDS = [
  'blank',
  'resource_pack',
  'data_pack',
  'combined',
  'custom_ore',
  'custom-sword',
  'gear-set',
  'simple-block',
  'wood-set',
  'stone-set',
  'crop',
  'tree',
  'food',
  'weapon',
  'consumable',
  'totem',
  'status-effect',
  'potion',
  'throwable',
  'enchantment',
  'painting',
  'music-disc-item',
  'dimension',
  'villager-trade',
  'extra-drop',
  'mob-skin',
  'goat-horn',
  'recipe_pack',
  'music_disc',
  'function_starter',
  'custom_biome',
  'jigsaw_structure',
  'worldgen_pack',
  'custom_mob',
  'scripted_ore',
  'scripted-item',
];

/**
 * The 93 kinds of the built-in resource pack, data pack, structures, worldgen, blocks and
 * items, entities, models and animations and scripting plugins, in per-kind example order.
 */
const KIND_IDS = [
  'minecraft:model',
  'minecraft:block_definition',
  'minecraft:item_definition',
  'minecraft:lang',
  'minecraft:sounds',
  'minecraft:pack_mcmeta',
  'minecraft:equipment',
  'minecraft:atlas',
  'minecraft:font',
  'minecraft:recipe',
  'minecraft:loot_table',
  'minecraft:advancement',
  'minecraft:predicate',
  'minecraft:item_modifier',
  'minecraft:function',
  'minecraft:tag/block',
  'minecraft:tag/item',
  'minecraft:tag/entity_type',
  'minecraft:tag/fluid',
  'minecraft:tag/game_event',
  'minecraft:tag/function',
  'minecraft:tag/damage_type',
  'minecraft:tag/enchantment',
  'minecraft:tag/painting_variant',
  'minecraft:tag/worldgen/biome',
  'minecraft:tag/worldgen/structure',
  'minecraft:tag/worldgen/world_preset',
  'minecraft:tag/villager_trade',
  'minecraft:tag/banner_pattern',
  'minecraft:tag/dialog',
  'minecraft:tag/instrument',
  'minecraft:tag/point_of_interest_type',
  'minecraft:tag/potion',
  'minecraft:tag/timeline',
  'minecraft:tag/worldgen/feature',
  'minecraft:tag/worldgen/flat_level_generator_preset',
  'minecraft:enchantment',
  'minecraft:damage_type',
  'minecraft:dimension_type',
  'minecraft:chat_type',
  'minecraft:jukebox_song',
  'minecraft:banner_pattern',
  'minecraft:painting_variant',
  'minecraft:trim_material',
  'minecraft:trim_pattern',
  'minecraft:dialog',
  'minecraft:villager_trade',
  'minecraft:trade_set',
  'minecraft:wolf_variant',
  'minecraft:cat_variant',
  'minecraft:pig_variant',
  'minecraft:cow_variant',
  'minecraft:chicken_variant',
  'minecraft:frog_variant',
  'minecraft:zombie_nautilus_variant',
  'minecraft:cat_sound_variant',
  'minecraft:pig_sound_variant',
  'minecraft:cow_sound_variant',
  'minecraft:chicken_sound_variant',
  'minecraft:instrument',
  'minecraft:trial_spawner',
  'minecraft:enchantment_provider',
  'minecraft:timeline',
  'minecraft:world_clock',
  'minecraft:structure_template',
  'minecraft:worldgen/template_pool',
  'minecraft:worldgen/structure',
  'minecraft:worldgen/structure_set',
  'minecraft:worldgen/processor_list',
  'minecraft:worldgen/biome',
  'minecraft:worldgen/feature',
  'minecraft:worldgen/placed_feature',
  'minecraft:dimension',
  'minecraft:worldgen/world_preset',
  'minecraft:worldgen/noise_settings',
  'minecraft:worldgen/density_function',
  'minecraft:worldgen/noise',
  'minecraft:worldgen/carver',
  'minecraft:worldgen/flat_level_generator_preset',
  'minecraft:worldgen/multi_noise_biome_source_parameter_list',
  'minecraft:worldgen/block_state_provider',
  'minecraft:worldgen/material_condition',
  'minecraft:worldgen/material_rule',
  'msm:block',
  'msm:item',
  'msm:effect',
  'msm:potion',
  'msm:mod',
  'msm:biome_addition',
  'msm:loot_addition',
  'msm:entity',
  'msm:geo_model',
  'msm:animation',
  'msm:script',
];

const entries: readonly (ProjectStarter | ExampleProject)[] = [
  ...libraryStarters,
  ...libraryExamples,
];

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;

const build = (
  entry: ProjectStarter | ExampleProject,
  namespace = 'demo',
  values: Record<string, Json> = {},
): ContentBundle => {
  const bundle = entry.build({ namespace, projectName: 'Demo Project', target, values });
  if (bundle instanceof Promise) throw new Error(`${entry.id} builds asynchronously.`);
  return bundle;
};

/**
 * Every placeholder the library may produce: each pattern, the entity skin, the mob variant
 * skins and the painting placeholder of every size up to 4 by 4 in each library colour.
 */
const PLACEHOLDERS = new Set([
  ...PLACEHOLDER_PATTERNS.flatMap((pattern) =>
    Object.values(COLOURS).map((colour) =>
      Buffer.from(placeholderPng(pattern, { colour })).toString('hex'),
    ),
  ),
  // Leaves tinted by the biome colour are drawn grey (ADR 0068 D6).
  Buffer.from(placeholderPng('leaves', { colour: TINTABLE_GREY })).toString('hex'),
  // A ripe crop stage carries the produce in a second colour (ADR 0069 D2).
  ...Object.values(COLOURS).flatMap((colour) =>
    Object.values(COLOURS).map((accent) =>
      Buffer.from(placeholderPng('crop_stage3', { colour, accent })).toString('hex'),
    ),
  ),
  ...Object.values(COLOURS).map((colour) =>
    Buffer.from(placeholderSkinPng({ colour })).toString('hex'),
  ),
  // Mob variant skins (ADR 0064 D6): every vanilla size, in each colour and its shades.
  ...[
    ...Object.values(SKIN_ANIMALS).flatMap((facts) => [facts.adult, facts.baby]),
    {
      width: 128,
      height: 128,
    },
  ].flatMap((size) =>
    size === undefined
      ? []
      : Object.values(COLOURS).flatMap((colour) =>
          SKIN_SHADES.map((amount) =>
            Buffer.from(
              mobSkinPng(size.width, size.height, { colour: shade(colour, amount) }),
            ).toString('hex'),
          ),
        ),
  ),
  ...[1, 2, 3, 4].flatMap((width) =>
    [1, 2, 3, 4].flatMap((height) =>
      Object.values(COLOURS).map((colour) =>
        Buffer.from(paintingPng(width, height, colour)).toString('hex'),
      ),
    ),
  ),
]);

describe('project starters', () => {
  it('lists the thirty-six starters in order', () => {
    expect(libraryStarters.map((starter) => starter.id)).toEqual(STARTER_IDS);
  });

  it('groups them as blank, pack and content starters', () => {
    expect(libraryStarters.map((starter) => starter.category)).toEqual([
      'blank',
      'pack',
      'pack',
      'pack',
      ...Array<string>(32).fill('content'),
    ]);
  });

  it('leaves the blank starter empty so the host adds only pack.mcmeta', () => {
    const blank = libraryStarters[0] as ProjectStarter;
    expect(build(blank)).toEqual({ elements: [], assets: [] });
    expect(blank.requiresKinds).toEqual([]);
  });

  it('gives every non-blank starter its own pack.mcmeta element', () => {
    for (const starter of libraryStarters.slice(1)) {
      const packs = build(starter).elements.filter(
        (entry) => entry.kind === 'minecraft:pack_mcmeta',
      );
      expect(
        packs.map((entry) => entry.id),
        starter.id,
      ).toEqual(['demo:pack']);
    }
  });

  it('builds the Custom ore starter from real blocks and items, with no vanilla overrides', () => {
    const ore = libraryStarters.find((starter) => starter.id === 'custom_ore') as ProjectStarter;
    expect(ore.description).toMatch(/Fabric mod jar/);
    expect(ore.layers).toEqual(['resourcepack', 'datapack', 'msm']);
    const bundle = build(ore);
    const ids = bundle.elements.map((entry) => `${entry.kind} ${entry.id}`);
    expect(ids).toEqual([
      'minecraft:pack_mcmeta demo:pack',
      'msm:mod demo:mod',
      'msm:block demo:ruby_ore',
      'minecraft:loot_table demo:blocks/ruby_ore',
      'msm:item demo:ruby',
      'msm:block demo:ruby_block',
      'minecraft:model demo:block/ruby_ore',
      'minecraft:model demo:block/ruby_block',
      'minecraft:model demo:item/ruby',
      'minecraft:recipe demo:ruby_block_from_rubies',
      'minecraft:recipe demo:ruby_from_block',
      'minecraft:recipe demo:ruby_from_smelting',
      'minecraft:tag/item demo:gems',
      'minecraft:advancement demo:root',
      'minecraft:advancement demo:get_ruby',
      'minecraft:worldgen/feature demo:ore_ruby',
      'minecraft:worldgen/placed_feature demo:ore_ruby_placed',
      'msm:biome_addition demo:ruby_ore_generation',
    ]);
    const rubyOre = bundle.elements.find((entry) => entry.id === 'demo:ruby_ore');
    expect(rubyOre?.data).toMatchObject({
      loot: 'demo:blocks/ruby_ore',
      components: {
        'msm:breakable': { tool: 'pickaxe', min_tier: 'iron' },
        'msm:light_emitter': { level: 3 },
      },
    });
    const loot = bundle.elements.find((entry) => entry.id === 'demo:blocks/ruby_ore');
    expect(JSON.stringify(loot?.data)).toContain('"name":"demo:ruby"');
    expect(bundle.elements.find((entry) => entry.kind === 'msm:mod')?.data).toMatchObject({
      mod_id: 'demo',
    });
    expect(bundle.assets.map((asset) => asset.path)).toEqual([
      'textures/block/ruby_ore.png',
      'textures/block/ruby_block.png',
      'textures/item/ruby.png',
    ]);
  });

  it('makes the Custom ore generate in overworld biomes, and leaves it out with generate off (ADR 0060 D6)', () => {
    const ore = libraryStarters.find((starter) => starter.id === 'custom_ore') as ProjectStarter;
    const on = build(ore);
    const off = build(ore, 'demo', { generate: false });
    const worldgen = new Set(['demo:ore_ruby', 'demo:ore_ruby_placed', 'demo:ruby_ore_generation']);
    // Off: exactly the bundle of earlier versions, which is the generating one without the three.
    expect(off).toEqual({
      elements: on.elements.filter((entry) => !worldgen.has(entry.id)),
      assets: on.assets,
    });
    expect(off.elements.some((entry) => worldgen.has(entry.id))).toBe(false);
    const data = (id: string) => on.elements.find((entry) => entry.id === id)?.data;
    expect(data('demo:ore_ruby')).toMatchObject({
      type: 'minecraft:ore',
      size: 6,
      targets: [
        {
          target: { predicate_type: 'minecraft:block_match', block: 'minecraft:stone' },
          state: 'demo:ruby_ore',
        },
        {
          target: { predicate_type: 'minecraft:block_match', block: 'minecraft:deepslate' },
          state: 'demo:ruby_ore',
        },
      ],
    });
    expect(data('demo:ore_ruby_placed')).toMatchObject({
      feature: 'demo:ore_ruby',
      placement: [{ type: 'minecraft:count', count: 6 }, {}, {}, { type: 'minecraft:biome' }],
    });
    expect(data('demo:ruby_ore_generation')).toEqual({
      format: 1,
      biomes: ['#minecraft:is_overworld'],
      features: [{ feature: 'demo:ore_ruby_placed', step: 'underground_ores' }],
    });
    // The wizard's answers reach the feature and the placement; heights are put in order.
    const custom = build(ore, 'demo', { vein_size: 3, veins_per_chunk: 2, min_y: 40, max_y: -10 });
    const customData = (id: string) => custom.elements.find((entry) => entry.id === id)?.data;
    expect(customData('demo:ore_ruby')).toMatchObject({ size: 3 });
    expect(JSON.stringify(customData('demo:ore_ruby_placed'))).toContain(
      '"min_inclusive":{"absolute":-10},"max_inclusive":{"absolute":40}',
    );
    expect(ore.requiresKinds).toEqual(
      expect.arrayContaining([
        'minecraft:worldgen/feature',
        'minecraft:worldgen/placed_feature',
        'msm:biome_addition',
      ]),
    );
  });

  it('builds the Extra drop flow as one loot addition with a single pool condition (ADR 0060 D6)', () => {
    const flow = libraryStarters.find((starter) => starter.id === 'extra-drop') as ProjectStarter;
    expect(flow.creator?.group).toBe('worlds');
    expect(flow.description).toMatch(/Fabric mod jar/);
    const bundle = build(flow);
    expect(bundle.elements.map((entry) => `${entry.kind} ${entry.id}`)).toEqual([
      'minecraft:pack_mcmeta demo:pack',
      'msm:mod demo:mod',
      'msm:loot_addition demo:zombie_drops_emerald',
    ]);
    expect(bundle.elements[2]?.data).toEqual({
      format: 1,
      tables: ['minecraft:entities/zombie'],
      pools: [
        {
          rolls: 1,
          entries: [{ type: 'minecraft:item', name: 'minecraft:emerald' }],
          condition: {
            type: 'minecraft:all_of',
            terms: [
              { type: 'minecraft:killed_by_player' },
              { type: 'minecraft:random_chance', chance: 0.1 },
            ],
          },
        },
      ],
    });
    // A chest, every time, two to four: no condition, a set_count modifier, no player check.
    const chest = build(flow, 'demo', {
      table: 'chests/simple_dungeon',
      item: 'diamond',
      count_min: 4,
      count_max: 2,
      chance: 100,
    });
    expect(chest.elements[2]?.id).toBe('demo:simple_dungeon_drops_diamond');
    expect(chest.elements[2]?.data).toEqual({
      format: 1,
      tables: ['minecraft:chests/simple_dungeon'],
      pools: [
        {
          rolls: 1,
          entries: [
            {
              type: 'minecraft:item',
              name: 'minecraft:diamond',
              modifier: [
                {
                  type: 'minecraft:set_count',
                  count: { type: 'minecraft:uniform', min: 2, max: 4 },
                },
              ],
            },
          ],
        },
      ],
    });
    // One check only: the condition is that check, not all_of.
    const block = build(flow, 'demo', { table: 'blocks/gravel', count_min: 3, count_max: 3 });
    expect(block.elements[2]?.data).toMatchObject({
      pools: [
        {
          entries: [{ modifier: [{ type: 'minecraft:set_count', count: 3 }] }],
          condition: { type: 'minecraft:random_chance', chance: 0.1 },
        },
      ],
    });
  });

  it('builds the Custom mob starter: an animated Ruby Golem with its model, loot and egg', () => {
    const mob = libraryStarters.find((starter) => starter.id === 'custom_mob') as ProjectStarter;
    expect(mob.category).toBe('content');
    expect(mob.description).toMatch(/Fabric mod jar/);
    expect(mob.layers).toEqual(['resourcepack', 'datapack', 'msm']);
    const bundle = build(mob);
    expect(bundle.elements.map((entry) => `${entry.kind} ${entry.id}`)).toEqual([
      'minecraft:pack_mcmeta demo:pack',
      'msm:mod demo:mod',
      'msm:entity demo:ruby_golem',
      'msm:geo_model demo:entity/ruby_golem',
      'msm:animation demo:entity/ruby_golem_animations',
      'minecraft:loot_table demo:entities/ruby_golem',
      'minecraft:function demo:golem/death',
    ]);
    const golem = bundle.elements.find((entry) => entry.id === 'demo:ruby_golem');
    expect(golem?.data).toMatchObject({
      category: 'creature',
      size: { width: 0.9, height: 1.6 },
      loot_table: 'demo:entities/ruby_golem',
      spawn: { biomes: ['#minecraft:is_forest'], weight: 6, min_group: 1, max_group: 2 },
      spawn_egg: { texture: 'demo:item/ruby_golem_spawn_egg' },
      components: {
        'msm:health': { max: 30 },
        'msm:movement': { speed: 0.28 },
        'msm:attack': { damage: 4, on_attack: 'demo:ruby_golem_attack' },
        'msm:animated_model': {
          model: 'demo:entity/ruby_golem',
          animations: 'demo:entity/ruby_golem_animations',
          texture: 'demo:entity/ruby_golem',
        },
        'msm:on_death': { event: 'demo:ruby_golem_death' },
      },
    });
    expect(JSON.parse(JSON.stringify(golem?.data ?? {})).components['msm:ai_goals'].goals).toEqual([
      { type: 'melee_attack', retaliate: true },
      { type: 'wander' },
      { type: 'look_at_player' },
      { type: 'look_around' },
    ]);
    const animations = bundle.elements.find((entry) => entry.kind === 'msm:animation');
    expect(Object.keys(JSON.parse(JSON.stringify(animations?.data ?? {})).animations)).toEqual([
      'idle',
      'walk',
      'attack',
    ]);
    const loot = bundle.elements.find((entry) => entry.kind === 'minecraft:loot_table');
    expect(JSON.stringify(loot?.data)).toContain('"name":"minecraft:emerald"');
    expect(bundle.assets.map((asset) => asset.path)).toEqual([
      'textures/entity/ruby_golem.png',
      'textures/item/ruby_golem_spawn_egg.png',
    ]);
  });

  it('builds the Custom sword starter: an msm:item sword with a handheld model, recipe and name', () => {
    const sword = libraryStarters.find(
      (starter) => starter.id === 'custom-sword',
    ) as ProjectStarter;
    expect(sword.title).toBe('Custom sword');
    expect(sword.category).toBe('content');
    expect(sword.description).toMatch(/Fabric mod jar/);
    expect(sword.layers).toEqual(['resourcepack', 'datapack', 'msm']);
    expect(sword.requiresKinds).toEqual([
      'minecraft:lang',
      'minecraft:model',
      'minecraft:pack_mcmeta',
      'minecraft:recipe',
      'msm:item',
      'msm:mod',
    ]);
    const bundle = build(sword);
    expect(bundle.elements.map((entry) => `${entry.kind} ${entry.id}`)).toEqual([
      'minecraft:pack_mcmeta demo:pack',
      'msm:mod demo:mod',
      'msm:item demo:ruby_sword',
      'minecraft:model demo:item/ruby_sword',
      'minecraft:lang demo:en_us',
      'minecraft:recipe demo:ruby_sword_from_emerald',
    ]);
    expect(bundle.elements.find((entry) => entry.id === 'demo:ruby_sword')?.data).toMatchObject({
      model: 'demo:item/ruby_sword',
      max_stack_size: 1,
      components: {
        'msm:tool': { type: 'sword', tier: 'diamond' },
        'msm:durability': { max: 1561 },
      },
    });
    expect(bundle.elements.find((entry) => entry.id === 'demo:item/ruby_sword')?.data).toEqual({
      parent: 'minecraft:item/handheld',
      textures: { layer0: 'demo:item/ruby_sword' },
    });
    expect(bundle.elements.find((entry) => entry.id === 'demo:en_us')?.data).toEqual({
      'item.demo.ruby_sword': 'Ruby Sword',
    });
    expect(
      bundle.elements.find((entry) => entry.id === 'demo:ruby_sword_from_emerald')?.data,
    ).toMatchObject({
      type: 'minecraft:crafting_shaped',
      pattern: ['I', 'I', 'S'],
      key: { I: 'minecraft:emerald', S: 'minecraft:stick' },
      result: { id: 'demo:ruby_sword', count: 1 },
    });
    expect(bundle.assets.map((asset) => asset.path)).toEqual(['textures/item/ruby_sword.png']);
  });

  it('builds the Scripted ore starter: the Custom ore content plus three scripts', () => {
    const scripted = libraryStarters.find(
      (starter) => starter.id === 'scripted_ore',
    ) as ProjectStarter;
    const ore = libraryStarters.find((starter) => starter.id === 'custom_ore') as ProjectStarter;
    expect(scripted.category).toBe('content');
    expect(scripted.description).toMatch(/Fabric mod jar/);
    expect(scripted.description).toMatch(/Java project export/);
    expect(scripted.layers).toEqual(['resourcepack', 'datapack', 'msm']);
    const bundle = build(scripted);
    const base = build(ore);
    expect(bundle.elements.map((entry) => `${entry.kind} ${entry.id}`)).toEqual([
      ...base.elements.map((entry) => `${entry.kind} ${entry.id}`),
      'msm:script demo:ore_glow',
      'msm:script demo:ruby_block_guard',
      'msm:script demo:welcome',
    ]);
    expect(bundle.assets).toEqual(base.assets);
    // Only the pack, the mod and the block of ruby differ from the Custom ore starter.
    const changed = bundle.elements
      .filter((entry, index) => {
        const before = base.elements[index];
        return before !== undefined && JSON.stringify(before) !== JSON.stringify(entry);
      })
      .map((entry) => entry.id);
    expect(changed).toEqual(['demo:pack', 'demo:mod', 'demo:ruby_block']);
    const block = bundle.elements.find((entry) => entry.id === 'demo:ruby_block');
    expect(block?.data).toMatchObject({
      components: { 'msm:on_step': { event: 'demo:ruby_block_step', cooldown_ticks: 20 } },
      events: {
        'demo:ruby_block_step': { actions: [{ type: 'run_script', handler: 'demo:guard' }] },
      },
    });
    const text = (id: string): string =>
      (
        (bundle.elements.find((entry) => entry.id === id)?.data as { lines: string[] }) ?? {
          lines: [],
        }
      ).lines.join('\n');
    expect(text('demo:ore_glow')).toContain('msm.events.on("block.interact"');
    expect(text('demo:ore_glow')).toContain('e.player.isSneaking');
    expect(text('demo:ore_glow')).toContain('e.cancel();');
    expect(text('demo:ore_glow')).toContain('e.player.give("demo:ruby", 1);');
    expect(text('demo:ruby_block_guard')).toContain('msm.actions.define("demo:guard"');
    expect(text('demo:welcome')).toContain('msm.events.on("player.join"');
    for (const entry of bundle.elements.filter((element) => element.kind === 'msm:script')) {
      expect(entry.notes, entry.id).toMatch(/Fabric mod jar/);
      expect(entry.notes, entry.id).toMatch(/Java project export/);
    }
  });

  it('plays the vanilla cat record in the music disc starter, with no bundled sound', () => {
    const disc = libraryStarters.find((starter) => starter.id === 'music_disc');
    const bundle = build(disc as ProjectStarter);
    expect(bundle.assets.every((asset) => asset.path.startsWith('textures/'))).toBe(true);
    const sounds = bundle.elements.find((entry) => entry.kind === 'minecraft:sounds');
    expect(sounds?.id).toBe('demo:sounds');
    expect(JSON.stringify(sounds?.data)).toContain('"minecraft:records/cat"');
    const song = bundle.elements.find((entry) => entry.kind === 'minecraft:jukebox_song');
    expect(song?.data).toMatchObject({ sound_event: { sound_id: 'demo:music_disc.my_song' } });
    const definition = bundle.elements.find((entry) => entry.kind === 'minecraft:item_definition');
    expect(definition?.id).toBe('minecraft:music_disc_13');
    expect(definition?.data).toMatchObject({
      model: {
        type: 'minecraft:select',
        property: 'minecraft:component',
        component: 'minecraft:jukebox_playable',
        cases: [{ when: 'demo:my_song' }],
      },
    });
  });
});

describe('examples', () => {
  it('has 94 per-kind examples, one per built-in kind, 21 behaviour examples and 4 starter projects', () => {
    expect(kindExamples).toHaveLength(94);
    expect(kindExamples.map((example) => example.kind)).toEqual(KIND_IDS);
    expect(starterExamples.map((example) => example.id)).toEqual(
      ['custom_ore', 'recipe_pack', 'music_disc', 'function_starter'].map((id) => `starter_${id}`),
    );
    expect(starterExamples.every((example) => example.category === STARTERS_CATEGORY)).toBe(true);
    expect(behaviourExamples.map((example) => example.id)).toEqual([
      'example_msm_tool',
      'example_msm_event_chain',
      'example_msm_fuel_log',
      'example_msm_life_steal_sword',
      'example_msm_night_vision_helmet',
      'example_msm_brewed_with_own_item',
      'example_msm_wood_set',
      'example_msm_stone_set',
      'example_msm_crop',
      'example_msm_tree',
      'example_msm_machine_block',
      'example_msm_iron_door',
    ]);
    expect(entityBehaviourExamples.map((example) => example.id)).toEqual([
      'example_msm_hostile_mob',
      'example_msm_natural_spawn',
    ]);
    expect(scriptBehaviourExamples.map((example) => example.id)).toEqual([
      'example_msm_script_schedule',
      'example_msm_script_action',
      'example_msm_scripted_effect',
      'example_msm_kill_counter',
      'example_msm_full_set_bonus',
      'example_msm_teleport_staff',
      'example_msm_boss_fight_bar',
    ]);
    expect(libraryExamples).toHaveLength(119);
  });

  it('reuses the starter builders for the starter projects', () => {
    for (const example of starterExamples) {
      const starter = libraryStarters.find((entry) => `starter_${entry.id}` === example.id);
      const fromStarter = build(starter as ProjectStarter);
      const fromExample = build(example);
      expect(fromExample.elements.map((entry) => entry.id)).toEqual(
        fromStarter.elements.map((entry) => entry.id),
      );
      expect(fromExample.elements.map((entry) => entry.data)).toEqual(
        fromStarter.elements.map((entry) => entry.data),
      );
    }
  });

  it('explains the main element of each per-kind example in three to six sentences', () => {
    for (const example of kindExamples) {
      const main = build(example).elements.find((entry) => entry.kind === example.kind);
      const notes = main?.notes ?? '';
      const sentences = notes.split(/[.!?](?:\s|$)/).filter((part) => part.trim() !== '');
      expect(sentences.length, `${example.id}: ${notes}`).toBeGreaterThanOrEqual(3);
      expect(sentences.length, `${example.id}: ${notes}`).toBeLessThanOrEqual(7);
    }
  });

  it('tags every element with example and the category', () => {
    for (const example of libraryExamples) {
      for (const entry of build(example).elements) {
        expect(entry.tags, `${example.id} ${entry.id}`).toEqual(
          expect.arrayContaining(['example', categoryTag(example.category)]),
        );
      }
    }
  });
});

describe('every starter and example', () => {
  it('has a unique id', () => {
    const ids = entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('declares exactly the kinds its bundle uses', () => {
    for (const entry of entries) {
      const used = new Set(build(entry).elements.map((element) => element.kind));
      // A choice that builds other content adds its kinds (`probeValues`).
      if (entry.id === 'music-disc-item') {
        for (const element of build(entry, 'demo', { disc_type: 'vanilla' }).elements) {
          used.add(element.kind);
        }
      }
      if (entry.id === 'consumable') {
        for (const element of build(entry, 'demo', { kind: 'charm' }).elements) {
          used.add(element.kind);
        }
      }
      if (entry.id === 'status-effect') {
        for (const values of [{ behaviour: 'function' }, { source: 'potion' }]) {
          for (const element of build(entry, 'demo', values).elements) used.add(element.kind);
        }
      }
      if (entry.id === 'potion') {
        for (const element of build(entry, 'demo', { effect: 'minecraft:speed' }).elements) {
          used.add(element.kind);
        }
      }
      if (entry.id === 'crop') {
        for (const element of build(entry, 'demo', { wild: true }).elements) used.add(element.kind);
      }
      if (entry.id === 'mob-skin') {
        for (const animal of ['cat', 'pig', 'cow', 'chicken', 'frog']) {
          for (const element of build(entry, 'demo', { animal }).elements) used.add(element.kind);
        }
      }
      expect(entry.requiresKinds, entry.id).toEqual([...used].sort());
      for (const kind of used) expect(KIND_IDS, entry.id).toContain(kind);
    }
  });

  it('never names a project sound by a bare string id in a sound event holder field', () => {
    // The game decodes these fields with `SoundEvent.CODEC`, a registry holder codec: a string must
    // be a registered sound event, which a key of the project's sounds.json is not. A project
    // sound needs the direct form { "sound_id": "<ns>:<key>" } (vanilla-mcdoc `SoundEventRef`).
    const HOLDER_FIELDS = new Set(['sound_event', 'equip_sound', 'shearing_sound', 'sound']);
    const offenders: string[] = [];
    const walk = (value: unknown, path: string): void => {
      if (Array.isArray(value)) {
        for (const [index, item] of value.entries()) walk(item, `${path}[${index}]`);
      } else if (typeof value === 'object' && value !== null) {
        for (const [key, child] of Object.entries(value)) {
          if (HOLDER_FIELDS.has(key) && typeof child === 'string' && child.startsWith('demo:')) {
            offenders.push(`${path}.${key} = ${child}`);
          }
          walk(child, `${path}.${key}`);
        }
      }
    };
    const variants: Record<string, readonly Record<string, Json>[]> = {
      'music-disc-item': [{ disc_type: 'vanilla' }],
      consumable: [{ kind: 'charm' }],
    };
    for (const entry of entries) {
      for (const values of [{}, ...(variants[entry.id] ?? [])]) {
        for (const element of build(entry, 'demo', values).elements) {
          if (element.kind === 'minecraft:sounds') continue;
          walk(element.data, `${entry.id} ${element.id}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('builds the same bundle every time', () => {
    for (const entry of entries) expect(build(entry), entry.id).toEqual(build(entry));
  });

  it('puts content only in the given namespace or overrides in minecraft', () => {
    for (const entry of entries) {
      const bundle = build(entry, 'other_ns');
      const text = JSON.stringify(bundle.elements);
      expect(text, entry.id).not.toContain('demo');
      for (const element of bundle.elements) {
        expect(['other_ns', 'minecraft'], `${entry.id} ${element.id}`).toContain(
          element.id.slice(0, element.id.indexOf(':')),
        );
      }
      for (const asset of bundle.assets) expect(asset.namespace, entry.id).toBe('other_ns');
    }
  });

  it('has no duplicate element ids or asset paths', () => {
    for (const entry of entries) {
      const bundle = build(entry);
      const ids = bundle.elements.map((element) => element.id);
      expect(new Set(ids).size, entry.id).toBe(ids.length);
      const paths = bundle.assets.map((asset) => `${asset.namespace}/${asset.path}`);
      expect(new Set(paths).size, entry.id).toBe(paths.length);
    }
  });

  it('uses only generated placeholder textures with lower-case names inside a folder', () => {
    for (const entry of entries) {
      for (const asset of build(entry).assets) {
        expect(asset.path, entry.id).toMatch(/^textures\/[a-z0-9_/]+\/[a-z0-9_.-]+\.png$/);
        expect(PLACEHOLDERS.has(Buffer.from(asset.bytes).toString('hex')), asset.path).toBe(true);
      }
    }
  });

  it('gives every texture a model or painting that uses it', () => {
    for (const entry of entries) {
      const bundle = build(entry);
      const text = JSON.stringify(bundle.elements);
      for (const asset of bundle.assets) {
        const id = `${asset.namespace}:${asset.path.replace(/^textures\//, '').replace(/\.png$/, '')}`;
        const paintingId = id.replace(':painting/', ':');
        // Equipment layers name `<ns>:<name>` for textures/entity/equipment/<layer>/<name>.png.
        const equipmentId = id.replace(/:entity\/equipment\/[a-z_]+\//, ':');
        // An effect icon is textures/mob_effect/<path>.png of the effect `<ns>:<path>`.
        const effectId = id.replace(':mob_effect/', ':');
        // A font's bitmap provider names its file with the extension.
        const fileId = `${id}.png`;
        expect(
          [id, paintingId, equipmentId, effectId, fileId].some((candidate) =>
            text.includes(`"${candidate}"`),
          ),
          id,
        ).toBe(true);
      }
    }
  });
});

const WORLDGEN_KIND_IDS = KIND_IDS.slice(
  KIND_IDS.indexOf('minecraft:structure_template'),
  KIND_IDS.indexOf('minecraft:worldgen/material_rule') + 1,
);
const WORLDGEN_KINDS = new Set(WORLDGEN_KIND_IDS);

/** Every string in `value` with its object key, depth first. */
function strings(value: unknown, key = ''): { key: string; text: string }[] {
  if (typeof value === 'string') return [{ key, text: value }];
  if (Array.isArray(value)) return value.flatMap((item) => strings(item, key));
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([name, item]) => strings(item, name));
  }
  return [];
}

type Obj = Record<string, unknown>;
const asObj = (value: unknown): Obj =>
  typeof value === 'object' && value !== null ? (value as Obj) : {};
const asArr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** The jigsaw names the pieces of `poolId` and its fallbacks offer, within one bundle. */
function poolNames(bundle: ContentBundle, poolId: string, seen = new Set<string>()): Set<string> {
  const names = new Set<string>();
  if (seen.has(poolId)) return names;
  seen.add(poolId);
  const pool = bundle.elements.find(
    (entry) => entry.id === poolId && entry.kind === 'minecraft:worldgen/template_pool',
  );
  if (pool === undefined) return names;
  for (const item of asArr(asObj(pool.data).elements)) {
    const location = asObj(asObj(item).element).location;
    const template = bundle.elements.find(
      (entry) => entry.id === location && entry.kind === 'minecraft:structure_template',
    );
    for (const jigsaw of asArr(asObj(template?.data).jigsaws)) {
      names.add(String(asObj(jigsaw).name));
    }
  }
  const fallback = asObj(pool.data).fallback;
  if (typeof fallback === 'string') {
    for (const name of poolNames(bundle, fallback, seen)) names.add(name);
  }
  return names;
}

describe('structure and worldgen content', () => {
  const worldgenEntries = entries.filter((entry) =>
    entry.requiresKinds.some((kind) => WORLDGEN_KINDS.has(kind)),
  );

  it('covers the eight worldgen starters, the 19 structure and worldgen examples, the generating ores and the trees and wild crops', () => {
    expect(worldgenEntries.map((entry) => entry.id)).toEqual([
      'custom_ore',
      'wood-set',
      'crop',
      'tree',
      'dimension',
      'custom_biome',
      'jigsaw_structure',
      'worldgen_pack',
      'scripted_ore',
      ...WORLDGEN_KIND_IDS.map((kind) => {
        const example = kindExamples.find((entry) => entry.kind === kind);
        return example?.id;
      }),
      'example_msm_biome_addition',
      'example_msm_wood_set',
      'example_msm_crop',
      'example_msm_tree',
      'starter_custom_ore',
    ]);
  });

  it('is self-contained: every project id it names is an element of the same bundle', () => {
    for (const entry of worldgenEntries) {
      const bundle = build(entry, 'other_ns');
      const ids = new Set<string>(bundle.elements.map((element) => element.id));
      // A block type's `textures` name texture files of the bundle (ADR 0067 D7).
      for (const asset of bundle.assets) {
        ids.add(
          `${asset.namespace}:${asset.path.replace(/^textures\//, '').replace(/\.png$/, '')}`,
        );
      }
      // A block item with its own id (ADR 0068 D2), such as a crop's seeds, is an item too.
      for (const element of bundle.elements) {
        const item = element.kind === 'msm:block' ? asObj(asObj(element.data).item) : {};
        if (typeof item.id === 'string') ids.add(item.id);
      }
      for (const element of bundle.elements) {
        if (element.kind === 'minecraft:lang' || element.kind === 'minecraft:pack_mcmeta') continue;
        for (const { key, text } of strings(element.data)) {
          if (
            element.kind === 'minecraft:structure_template' &&
            (key === 'name' || key === 'target')
          )
            continue;
          // An item's or block's trigger names one of its own events, not an element, and a
          // run_script action a handler a script defines.
          if (
            (element.kind === 'msm:item' || element.kind === 'msm:block') &&
            (key === 'event' || key === 'handler')
          )
            continue;
          if (!/^#?other_ns:/.test(text)) continue;
          expect(ids.has(text.replace(/^#/, '')), `${entry.id} ${element.id} ${key} ${text}`).toBe(
            true,
          );
        }
      }
    }
  });

  it('matches every jigsaw target with a jigsaw name in the target pool or its fallbacks', () => {
    let checked = 0;
    for (const entry of worldgenEntries) {
      const bundle = build(entry);
      for (const template of bundle.elements) {
        if (template.kind !== 'minecraft:structure_template') continue;
        for (const jigsaw of asArr(asObj(template.data).jigsaws)) {
          const { pool, target } = asObj(jigsaw) as { pool: string; target: string };
          if (pool === 'minecraft:empty') {
            expect(target, `${entry.id} ${template.id}`).toBe('minecraft:empty');
            continue;
          }
          checked += 1;
          expect(
            [...poolNames(bundle, pool)],
            `${entry.id} ${template.id} ${pool} -> ${target}`,
          ).toContain(target);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('keeps configured and placed features apart: element ids are unique across kinds', () => {
    for (const entry of worldgenEntries) {
      const ids = build(entry).elements.map((element) => element.id);
      expect(new Set(ids).size, entry.id).toBe(ids.length);
    }
  });

  it('wires the worldgen pack: preset in #minecraft:normal, hamlet biome tag with the biome', () => {
    const pack = libraryStarters.find((starter) => starter.id === 'worldgen_pack');
    const bundle = build(pack as ProjectStarter);
    const byId = (id: string, kind: string) =>
      bundle.elements.find((entry) => entry.id === id && entry.kind === kind)?.data;
    expect(byId('minecraft:normal', 'minecraft:tag/worldgen/world_preset')).toEqual({
      values: ['demo:amber_world'],
    });
    expect(byId('demo:has_structure/hamlet', 'minecraft:tag/worldgen/biome')).toEqual({
      values: ['demo:amber_woods', '#minecraft:is_forest'],
    });
    expect(byId('demo:hamlet', 'minecraft:worldgen/structure')).toMatchObject({
      type: 'minecraft:jigsaw',
      biomes: '#demo:has_structure/hamlet',
      start_pool: 'demo:hamlet/centre',
      step: 'surface_structures',
      project_start_to_heightmap: 'WORLD_SURFACE_WG',
      terrain_adaptation: 'beard_thin',
    });
    expect(byId('demo:hamlets', 'minecraft:worldgen/structure_set')).toMatchObject({
      structures: [{ structure: 'demo:hamlet', weight: 1 }],
      placement: { type: 'minecraft:random_spread' },
    });
    const ids = bundle.elements.map((entry) => entry.id);
    const biomeStarter = libraryStarters.find((starter) => starter.id === 'custom_biome');
    const structureStarter = libraryStarters.find((starter) => starter.id === 'jigsaw_structure');
    const parts = [biomeStarter, structureStarter].flatMap((starter) =>
      build(starter as ProjectStarter).elements.map((entry) => entry.id),
    );
    expect([...ids].sort()).toEqual([...new Set(parts)].sort());
  });
});
