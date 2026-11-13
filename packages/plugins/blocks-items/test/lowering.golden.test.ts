/**
 * Golden tests of lowering: every sample is lowered for every built-in target, each output is
 * validated against the schema it declares, and the outputs are compared with
 * `fixtures/<target id>/expected/<kind folder>/<sample>.json`. Set `UPDATE_GOLDENS=1` to
 * rewrite the expected files instead of comparing.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ElementKind, Json, OutputFile, ResourceLocation } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { blockKind, blocksItemsKinds, effectKind, itemKind, modKind } from '../src/index';
import { blockingProblems, element, indexesFor, sortedJson } from './support';

const UPDATE = process.env.UPDATE_GOLDENS === '1';

interface Sample {
  kind: ElementKind;
  name: string;
  id: ResourceLocation;
  data: Json;
}

/** Every kind's default data, plus samples covering every editor field and component. */
const SAMPLES: Sample[] = [
  ...blocksItemsKinds.map((kind) => ({
    kind,
    name: 'default',
    id: (kind === modKind ? 'demo:mod' : 'demo:sample') as ResourceLocation,
    data: kind.defaultData as Json,
  })),
  {
    kind: blockKind,
    name: 'ruby_ore',
    id: 'example:ruby_ore',
    data: {
      format: 1,
      model: 'example:block/ruby_ore',
      display_name: 'Ruby Ore',
      loot: 'self',
      sound_type: 'stone',
      item: { creative_tab: 'minecraft:natural_blocks', max_stack_size: 64, rarity: 'common' },
      components: {
        'msm:breakable': { hardness: 3, resistance: 3, tool: 'pickaxe', min_tier: 'iron' },
        'msm:light_emitter': { level: 4 },
        'msm:on_interact': { event: 'example:shimmer' },
      },
      events: {
        'example:shimmer': {
          actions: [
            { type: 'play_sound', sound: 'minecraft:block.amethyst_block.chime', volume: 1 },
            { type: 'spawn_particle', particle: 'minecraft:glow', count: 12, spread: 0.4 },
            { type: 'run_function', function: 'example:ruby/shimmer' },
          ],
        },
      },
    },
  },
  {
    kind: blockKind,
    name: 'chime_block',
    id: 'example:chime_block',
    data: {
      format: 1,
      model: 'minecraft:block/note_block',
      display_name: 'Chime Block',
      loot: 'self',
      sound_type: 'wood',
      components: {
        'msm:breakable': { hardness: 0.8, tool: 'axe', min_tier: 'copper', requires_tool: false },
        'msm:redstone': {
          emit: 0,
          on_powered: 'example:wake',
          on_unpowered: 'example:sleep',
        },
        'msm:on_step': { event: 'example:wake', cooldown_ticks: 20 },
      },
      events: {
        'example:wake': {
          actions: [
            { type: 'play_sound', sound: 'minecraft:block.note_block.bell', pitch: 1.5 },
            { type: 'set_block_state', state: 'minecraft:glowstone', offset: [0, 1, 0] },
          ],
        },
        'example:sleep': {
          actions: [
            { type: 'set_block_state', state: 'minecraft:air', offset: [0, 1, 0] },
            { type: 'trigger_event', event: 'example:wake' },
          ],
        },
      },
    },
  },
  {
    kind: blockKind,
    name: 'glow_stone_no_item',
    id: 'example:ores/glow_stone',
    data: {
      format: 1,
      model: 'minecraft:block/glowstone',
      display_name: 'Glow Stone',
      loot: 'self',
      item: false,
      components: {
        'msm:breakable': { hardness: 2, tool: 'shovel', min_tier: 'netherite' },
        'msm:light_emitter': { level: 15 },
      },
    },
  },
  {
    kind: blockKind,
    name: 'ruby_slab',
    id: 'example:ruby_slab',
    data: {
      format: 1,
      model: 'minecraft:block/smooth_stone_slab',
      display_name: 'Ruby Slab',
      loot: 'self',
      components: {
        'msm:breakable': { hardness: 2, tool: 'pickaxe' },
        'msm:shape': { preset: 'slab_bottom' },
        'msm:on_step': { event: 'example:hum' },
      },
      events: {
        'example:hum': {
          actions: [{ type: 'play_sound', sound: 'minecraft:block.amethyst_block.chime' }],
        },
      },
    },
  },
  {
    kind: blockKind,
    name: 'ruby_sprout',
    id: 'example:ruby_sprout',
    data: {
      format: 1,
      model: 'minecraft:block/poppy',
      display_name: 'Ruby Sprout',
      loot: 'self',
      sound_type: 'grass',
      components: { 'msm:breakable': { hardness: 0 }, 'msm:shape': { preset: 'cross' } },
    },
  },
  {
    kind: blockKind,
    name: 'ruby_glass',
    id: 'example:ruby_glass',
    data: {
      format: 1,
      model: 'minecraft:block/glass',
      sound_type: 'glass',
      components: { 'msm:shape': { preset: 'full', see_through: true } },
    },
  },
  {
    kind: blockKind,
    name: 'ruby_post_custom',
    id: 'example:ruby_post',
    data: {
      format: 1,
      model: 'minecraft:block/stone',
      components: {
        'msm:shape': {
          preset: 'custom',
          boxes: [
            [0, 0, 0, 16, 2, 16],
            [6, 2, 6, 10, 16, 10],
          ],
          collision: true,
        },
      },
    },
  },
  {
    kind: blockKind,
    name: 'loot_id_no_model',
    id: 'example:ruby_ore',
    data: { format: 1, loot: 'example:blocks/ruby_ore_rare', sound_type: 'deepslate' },
  },
  {
    kind: itemKind,
    name: 'ruby',
    id: 'example:ruby',
    data: {
      format: 1,
      model: 'example:item/ruby',
      display_name: 'Ruby',
      max_stack_size: 64,
      rarity: 'uncommon',
      creative_tab: 'minecraft:ingredients',
    },
  },
  {
    kind: itemKind,
    name: 'wand',
    id: 'example:wand',
    data: {
      format: 1,
      model: 'minecraft:item/blaze_rod',
      display_name: 'Wand',
      max_stack_size: 1,
      rarity: 'epic',
      components: {
        'msm:tool': { type: 'sword', tier: 'gold' },
        'msm:durability': { max: 32 },
        'msm:food': { nutrition: 1, saturation: 0.1, can_always_eat: true },
        'msm:on_use': { event: 'example:zap', cooldown_ticks: 10 },
      },
      events: {
        'example:zap': {
          actions: [
            { type: 'give_item', item: 'example:ruby', count: 2 },
            { type: 'spawn_particle', particle: 'minecraft:electric_spark', count: 5, speed: 0.1 },
          ],
        },
      },
    },
  },
  {
    kind: itemKind,
    name: 'ruby_helmet',
    id: 'example:ruby_helmet',
    data: {
      format: 1,
      model: 'minecraft:item/iron_helmet',
      display_name: 'Ruby Helmet',
      max_stack_size: 1,
      components: {
        'msm:armor': {
          slot: 'helmet',
          material: {
            durability: 30,
            defense: { helmet: 3, chestplate: 7, leggings: 6, boots: 3 },
            enchantment_value: 12,
            toughness: 1.5,
            knockback_resistance: 0.05,
            equip_sound: 'minecraft:item.armor.equip_diamond',
            repair_items: '#minecraft:repairs_diamond_armor',
            equipment_asset: 'example:ruby',
          },
        },
        'msm:durability': { max: 420 },
      },
    },
  },
  {
    kind: itemKind,
    name: 'ruby_pickaxe',
    id: 'example:ruby_pickaxe',
    data: {
      format: 1,
      model: 'minecraft:item/diamond_pickaxe',
      display_name: 'Ruby Pickaxe',
      max_stack_size: 1,
      components: {
        'msm:tool': {
          type: 'pickaxe',
          tier: {
            durability: 1200,
            speed: 8.5,
            attack_damage_bonus: 3,
            enchantment_value: 12,
            incorrect_blocks_for_drops: '#minecraft:incorrect_for_diamond_tool',
            repair_items: '#minecraft:diamond_tool_materials',
          },
          attack_damage: 1.5,
          attack_speed: -2.6,
        },
      },
    },
  },
  {
    kind: itemKind,
    name: 'ruby_mace',
    id: 'example:ruby_mace',
    data: {
      format: 1,
      model: 'minecraft:item/mace',
      display_name: 'Ruby Mace',
      max_stack_size: 1,
      components: { 'msm:tool': { type: 'mace', tier: 'diamond' } },
    },
  },
  {
    kind: itemKind,
    name: 'ruby_crossbow',
    id: 'example:ruby_crossbow',
    data: {
      format: 1,
      model: 'minecraft:item/crossbow',
      display_name: 'Ruby Crossbow',
      max_stack_size: 1,
      components: {
        'msm:ranged_weapon': { type: 'crossbow', draw_speed: 1.5, inaccuracy: 0.5 },
        'msm:durability': { max: 465 },
      },
    },
  },
  {
    kind: itemKind,
    name: 'ruby_charm',
    id: 'example:ruby_charm',
    data: {
      format: 1,
      model: 'minecraft:item/heart_of_the_sea',
      display_name: 'Ruby Charm',
      max_stack_size: 1,
      components: {
        'msm:on_use': { event: 'example:charm_used', cooldown_ticks: 600 },
        'msm:components': { 'minecraft:glider': {}, 'minecraft:enchantment_glint_override': true },
      },
      events: {
        'example:charm_used': {
          actions: [
            { type: 'apply_effect', effect: 'minecraft:speed', seconds: 30, amplifier: 1 },
            { type: 'apply_effect', effect: 'minecraft:regeneration', seconds: 5, target: 'self' },
          ],
        },
      },
    },
  },
  {
    kind: itemKind,
    name: 'ruby_horse_armor',
    id: 'example:ruby_horse_armor',
    data: {
      format: 1,
      model: 'minecraft:item/diamond_horse_armor',
      display_name: 'Ruby Horse Armour',
      max_stack_size: 1,
      components: { 'msm:armor': { slot: 'horse', material: 'diamond' } },
    },
  },
  {
    kind: itemKind,
    name: 'ruby_dart',
    id: 'example:ruby_dart',
    data: {
      format: 1,
      model: 'minecraft:item/arrow',
      display_name: 'Ruby Dart',
      max_stack_size: 16,
      components: {
        'msm:throwable': {
          speed: 2.5,
          inaccuracy: 0.5,
          gravity: 0.05,
          damage: 3,
          charge_ticks: 10,
          after_throw: 'drop',
          cooldown_ticks: 10,
          sound: 'minecraft:item.trident.throw',
          dispensable: false,
          on_hit_entity: { event: 'example:dart_hit' },
          on_hit_block: { event: 'example:dart_stuck' },
        },
        'msm:tool': { type: 'sword', tier: 'iron' },
        'msm:durability': { max: 120 },
      },
      events: {
        'example:dart_hit': {
          actions: [
            { type: 'apply_effect', effect: 'example:frost', seconds: 8, target: 'other' },
            { type: 'damage', amount: 2, target: 'other' },
          ],
        },
        'example:dart_stuck': {
          actions: [{ type: 'play_sound', sound: 'minecraft:item.trident.hit_ground' }],
        },
      },
    },
  },
  {
    kind: effectKind,
    name: 'frost',
    id: 'example:frost',
    data: {
      format: 1,
      display_name: 'Frost',
      category: 'harmful',
      color: 0x9fd8ff,
      particle: 'minecraft:snowflake',
      sound: 'minecraft:block.powder_snow.step',
      attribute_modifiers: [
        { attribute: 'minecraft:movement_speed', amount: -0.15, operation: 'add_multiplied_total' },
        { attribute: 'minecraft:attack_speed', amount: -0.1, operation: 'add_multiplied_base' },
        { attribute: 'minecraft:armor', amount: -1, operation: 'add_value' },
      ],
      components: {
        'msm:on_start': { event: 'example:chill' },
        'msm:on_tick': { event: 'example:bite', interval_ticks: 40, faster_per_level: true },
        'msm:on_end': { event: 'example:thaw' },
      },
      events: {
        'example:chill': {
          actions: [{ type: 'spawn_particle', particle: 'minecraft:snowflake', count: 10 }],
        },
        'example:bite': { actions: [{ type: 'damage', amount: 1 }] },
        'example:thaw': {
          actions: [
            { type: 'heal', amount: 2, target: 'other' },
            { type: 'play_sound', sound: 'minecraft:block.glass.break', pitch: 1.5 },
          ],
        },
      },
    },
  },
  {
    kind: effectKind,
    name: 'withering_no_name',
    id: 'example:curses/withering',
    data: { format: 1, category: 'neutral', color: 0 },
  },
  {
    kind: modKind,
    name: 'full',
    id: 'example:mod',
    data: {
      mod_id: 'example-mod',
      version: '1.2.0',
      name: 'Example Mod',
      description: 'Rubies and a wand.',
      authors: ['Alex', 'Sam'],
      licence: 'MIT',
    },
  },
];

const fixturesRoot = new URL('./fixtures/', import.meta.url);

const fixtureUrl = (targetId: string, sample: Sample): URL =>
  new URL(`${targetId}/expected/${sample.kind.folder}/${sample.name}.json`, fixturesRoot);

const recorded = (file: OutputFile): Record<string, unknown> => ({
  contents: file.contents,
  layer: file.layer,
  merge: file.merge,
  path: file.path,
  schema: file.schema,
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'golden lowering for %s',
  (targetId, bundle) => {
    it('covers every kind', () => {
      expect(new Set(SAMPLES.map((sample) => sample.kind.id))).toEqual(
        new Set(blocksItemsKinds.map((kind) => kind.id)),
      );
    });

    it.each(SAMPLES.map((sample) => [`${sample.kind.id} ${sample.name}`, sample] as const))(
      '%s',
      async (_label, sample) => {
        const files = await sample.kind.lower(
          element(sample.kind.id, sample.id, sample.data),
          bundle.target,
        );
        const indexes = await indexesFor(bundle);
        const problems = (schema: string, value: Json) => blockingProblems(indexes, schema, value);
        expect(problems(sample.kind.schema, sample.data)).toEqual([]);
        for (const file of files) {
          if (file.schema === undefined) continue;
          expect(problems(file.schema, file.contents as Json), file.path).toEqual([]);
        }
        expect(
          await sample.kind.lower(element(sample.kind.id, sample.id, sample.data), bundle.target),
        ).toEqual(files);

        const actual = sortedJson(files.map(recorded));
        const url = fixtureUrl(targetId, sample);
        if (UPDATE) {
          await mkdir(dirname(fileURLToPath(url)), { recursive: true });
          await writeFile(url, actual);
        }
        expect(actual).toBe(await readFile(url, 'utf8'));
      },
    );
  },
);
