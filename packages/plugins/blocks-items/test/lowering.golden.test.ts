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
import { createRegistryIndex } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  BLOCK_TYPE_MODEL_SLOTS,
  BLOCK_TYPES,
  biomeAdditionKind,
  blockGeneratedModelIds,
  blockItemId,
  blockKind,
  blocksItemsKinds,
  effectKind,
  itemKind,
  lootAdditionKind,
  modKind,
  potionKind,
  TYPE_BLOCK_TAGS,
  TYPE_ITEM_TAGS,
} from '../src/index';
import {
  blockingProblems,
  element,
  indexesFor,
  PROJECT_IDS,
  sortedJson,
  type TargetIndexes,
} from './support';

const UPDATE = process.env.UPDATE_GOLDENS === '1';

interface Sample {
  kind: ElementKind;
  name: string;
  id: ResourceLocation;
  data: Json;
}

/** A block type sample (ADR 0067 D5, D7): golden `block/type-<name>.json`. */
const typeSample = (name: string, id: string, data: Json): Sample => ({
  kind: blockKind,
  name: `type-${name}`,
  id: id as ResourceLocation,
  data,
});

/** Samples of every building block type (B262): textures, `models`, `model`, tags and loot. */
const TYPE_SAMPLES: Sample[] = [
  typeSample('pillar', 'example:ruby_log', {
    format: 1,
    type: 'pillar',
    display_name: 'Ruby Log',
    loot: 'self',
    sound_type: 'wood',
    textures: { side: 'example:block/ruby_log', end: 'example:block/ruby_log_top' },
    components: {
      'msm:breakable': { hardness: 2, tool: 'axe' },
      'msm:flammable': { burn_odds: 5, ignite_odds: 5 },
      'msm:strippable': { into: 'example:stripped_ruby_log' },
    },
  }),
  typeSample('pillar-model', 'example:ruby_pillar', {
    format: 1,
    type: 'pillar',
    model: 'minecraft:block/basalt',
  }),
  typeSample('horizontal', 'example:ruby_furnace', {
    format: 1,
    type: 'horizontal',
    textures: {
      front: 'example:block/ruby_front',
      side: 'example:block/ruby_bricks',
      top: 'example:block/ruby_top',
    },
    components: { 'msm:redstone': { emit: 0, on_powered: 'example:glow' } },
    events: {
      'example:glow': {
        actions: [{ type: 'play_sound', sound: 'minecraft:block.note_block.bell' }],
      },
    },
  }),
  typeSample('directional', 'example:ruby_observer', {
    format: 1,
    type: 'directional',
    textures: { all: 'example:block/ruby_bricks', front: 'example:block/ruby_front' },
  }),
  typeSample('directional-model', 'example:ruby_lamp', {
    format: 1,
    type: 'directional',
    model: 'minecraft:block/observer',
    item: false,
  }),
  typeSample('slab', 'example:ruby_brick_slab', {
    format: 1,
    type: 'slab',
    display_name: 'Ruby Brick Slab',
    loot: 'self',
    textures: { all: 'example:block/ruby_bricks' },
    components: { 'msm:breakable': { hardness: 2, tool: 'pickaxe', min_tier: 'stone' } },
  }),
  typeSample('slab-item-id', 'example:ruby_brick_slab', {
    format: 1,
    type: 'slab',
    display_name: 'Ruby Brick Slab',
    loot: 'self',
    item: { id: 'example:ruby_half', creative_tab: 'minecraft:building_blocks' },
    textures: {
      top: 'example:block/ruby_top',
      bottom: 'example:block/ruby_top',
      side: 'example:block/ruby_bricks',
    },
  }),
  typeSample('stairs', 'example:ruby_brick_stairs', {
    format: 1,
    type: 'stairs',
    base_block: 'example:ruby_bricks',
    display_name: 'Ruby Brick Stairs',
    loot: 'self',
    textures: { all: 'example:block/ruby_bricks' },
  }),
  typeSample('stairs-models', 'example:ruby_brick_stairs', {
    format: 1,
    type: 'stairs',
    textures: { all: 'example:block/ruby_bricks' },
    models: { inner: 'example:block/ruby_ornate_inner', item: 'example:block/ruby_ornate_item' },
  }),
  typeSample('wall', 'example:ruby_brick_wall', {
    format: 1,
    type: 'wall',
    display_name: 'Ruby Brick Wall',
    loot: 'self',
    textures: { texture: 'example:block/ruby_bricks' },
  }),
  typeSample('fence', 'example:ruby_fence', {
    format: 1,
    type: 'fence',
    display_name: 'Ruby Fence',
    loot: 'self',
    sound_type: 'wood',
    textures: { texture: 'example:block/ruby_planks' },
  }),
  typeSample('fence-not-wooden', 'example:ruby_fence', {
    format: 1,
    type: 'fence',
    sound_type: 'wood',
    wooden: false,
    textures: { all: 'example:block/ruby_planks' },
  }),
  typeSample('fence-gate', 'example:ruby_fence_gate', {
    format: 1,
    type: 'fence_gate',
    wood_type: 'cherry',
    display_name: 'Ruby Fence Gate',
    loot: 'self',
    textures: { texture: 'example:block/ruby_planks' },
  }),
  typeSample('door', 'example:ruby_door', {
    format: 1,
    type: 'door',
    set_type: 'wood',
    display_name: 'Ruby Door',
    loot: 'self',
    sound_type: 'wood',
    textures: { top: 'example:block/ruby_door_top', bottom: 'example:block/ruby_door_bottom' },
  }),
  typeSample('door-iron-models', 'example:ruby_vault_door', {
    format: 1,
    type: 'door',
    set_type: 'iron',
    loot: 'self',
    models: {
      bottom_left: 'example:block/vault_bottom',
      top_left: 'example:block/vault_top',
      item: 'example:item/vault_door',
    },
  }),
  typeSample('trapdoor', 'example:ruby_trapdoor', {
    format: 1,
    type: 'trapdoor',
    set_type: 'copper',
    display_name: 'Ruby Trapdoor',
    loot: 'self',
    textures: { texture: 'example:block/ruby_trapdoor' },
  }),
  typeSample('button', 'example:ruby_button', {
    format: 1,
    type: 'button',
    set_type: 'stone',
    press_ticks: 20,
    display_name: 'Ruby Button',
    loot: 'self',
    textures: { all: 'example:block/ruby_bricks' },
  }),
  typeSample('button-wood', 'example:ruby_plank_button', {
    format: 1,
    type: 'button',
    set_type: 'bamboo',
    textures: { texture: 'example:block/ruby_planks' },
  }),
  typeSample('pressure-plate', 'example:ruby_pressure_plate', {
    format: 1,
    type: 'pressure_plate',
    set_type: 'wood',
    display_name: 'Ruby Pressure Plate',
    loot: 'self',
    textures: { texture: 'example:block/ruby_planks' },
  }),
  typeSample('pressure-plate-stone', 'example:ruby_stone_plate', {
    format: 1,
    type: 'pressure_plate',
    set_type: 'polished_blackstone',
    textures: { texture: 'example:block/ruby_bricks' },
  }),
  typeSample('pressure-plate-weighted', 'example:ruby_weighted_plate', {
    format: 1,
    type: 'pressure_plate',
    set_type: 'gold',
    weighted_max: 15,
    textures: { texture: 'example:block/ruby_block' },
  }),
  typeSample('pane', 'example:ruby_pane', {
    format: 1,
    type: 'pane',
    display_name: 'Ruby Pane',
    sound_type: 'glass',
    textures: { pane: 'example:block/ruby_glass', edge: 'example:block/ruby_glass_edge' },
  }),
  typeSample('block-item-id', 'example:ruby_lantern', {
    format: 1,
    type: 'block',
    model: 'example:block/ruby_ore',
    display_name: 'Ruby Lantern',
    loot: 'self',
    item: { id: 'example:lantern_item' },
  }),
];

/** A container or machine sample (ADR 0074 D8, ADR 0075 D8): golden `block/<name>.json`. */
const stateSample = (name: string, id: string, data: Json): Sample => ({
  kind: blockKind,
  name,
  id: id as ResourceLocation,
  data,
});

/** Containers and machines (B315): `open` and `lit` states, keep-contents loot, recipes. */
const CONTAINER_SAMPLES: Sample[] = [
  stateSample('container-crate-keep', 'example:ruby_crate', {
    format: 1,
    type: 'horizontal',
    display_name: 'Ruby Crate',
    loot: 'self',
    textures: {
      front: 'example:block/ruby_front',
      front_open: 'example:block/ruby_front_open',
      side: 'example:block/ruby_bricks',
      top: 'example:block/ruby_top',
    },
    components: {
      'msm:container': {
        rows: 3,
        keep_contents: true,
        open_sound: 'minecraft:block.chest.open',
        close_sound: 'minecraft:block.chest.close',
        on_open: 'example:opened',
      },
    },
    events: {
      'example:opened': {
        actions: [{ type: 'play_sound', sound: 'minecraft:block.note_block.bell' }],
      },
    },
  }),
  stateSample('container-holder-models', 'example:ruby_pedestal', {
    format: 1,
    loot: 'self',
    model: 'minecraft:block/barrel',
    models: { open: 'minecraft:block/barrel_open' },
    components: {
      'msm:container': { layout: 'none', size: 4, hoppers: false, comparator: false },
    },
  }),
  stateSample('container-directional-hopper', 'example:ruby_box', {
    format: 1,
    type: 'directional',
    textures: {
      all: 'example:block/ruby_bricks',
      front: 'example:block/ruby_front',
      front_open: 'example:block/ruby_front_open',
    },
    components: { 'msm:container': { layout: 'hopper' } },
  }),
  stateSample('container-pillar-no-open', 'example:ruby_bin', {
    format: 1,
    type: 'pillar',
    loot: 'self',
    textures: { side: 'example:block/ruby_log', end: 'example:block/ruby_log_top' },
    components: { 'msm:container': { layout: 'dispenser' } },
  }),
  stateSample('machine-fuel-recipes', 'example:ruby_grinder', {
    format: 1,
    type: 'horizontal',
    display_name: 'Ruby Grinder',
    loot: 'self',
    textures: {
      front: 'example:block/ruby_front',
      front_lit: 'example:block/ruby_front_lit',
      side: 'example:block/ruby_bricks',
      top: 'example:block/ruby_top',
    },
    components: {
      'msm:machine': {
        recipe_types: ['example:ruby_grinder', 'minecraft:smelting'],
        speed: 2,
        default_time: 100,
        on_finish: 'example:ground',
      },
    },
    events: {
      'example:ground': {
        actions: [{ type: 'play_sound', sound: 'minecraft:block.grindstone.use' }],
      },
    },
    recipes: [
      { ingredient: 'minecraft:gravel', result: 'minecraft:flint' },
      {
        ingredient: '#minecraft:logs',
        count: 2,
        result: { id: 'minecraft:charcoal', count: 3 },
        time: 300,
        experience: 0.5,
      },
      { ingredient: ['minecraft:cobblestone', 'minecraft:stone'], result: 'minecraft:gravel' },
      { ingredient: 'minecraft:flint', result: 'minecraft:flint' },
      { name: 'sand_from_gravel', ingredient: 'minecraft:gravel', result: 'minecraft:sand' },
    ],
  }),
  stateSample('machine-block-lit-model', 'example:ruby_press', {
    format: 1,
    model: 'minecraft:block/furnace',
    models: { lit: 'minecraft:block/furnace_on' },
    components: { 'msm:machine': { power: 'redstone' } },
  }),
  stateSample('machine-directional-lit', 'example:ruby_kiln', {
    format: 1,
    type: 'directional',
    textures: {
      front: 'example:block/ruby_front',
      front_lit: 'example:block/ruby_front_lit',
      side: 'example:block/ruby_bricks',
      top: 'example:block/ruby_top',
    },
    components: { 'msm:machine': { recipe_types: ['minecraft:blasting'], power: 'always' } },
  }),
];

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
    kind: blockKind,
    name: 'ruby_log_fuel_compost',
    id: 'example:ruby_log',
    data: {
      format: 1,
      model: 'minecraft:block/oak_log',
      sound_type: 'wood',
      item: {
        creative_tab: 'minecraft:building_blocks',
        fuel: { burn_seconds: 15 },
        compost: '65%',
        components: { 'msm:components': { 'minecraft:enchantment_glint_override': true } },
      },
    },
  },
  {
    kind: itemKind,
    name: 'ruby_coal_fuel_compost',
    id: 'example:ruby_coal',
    data: {
      format: 1,
      model: 'minecraft:item/coal',
      display_name: 'Ruby Coal',
      fuel: { burn_seconds: 120.5 },
      compost: '100%',
      components: { 'msm:components': { 'minecraft:glider': {} } },
    },
  },
  {
    kind: itemKind,
    name: 'fuel_only',
    id: 'example:kindling',
    data: { format: 1, model: 'minecraft:item/stick', fuel: { burn_seconds: 5 } },
  },
  {
    kind: blockKind,
    name: 'trigger_block',
    id: 'example:trigger_block',
    data: {
      format: 1,
      model: 'minecraft:block/moss_carpet',
      components: {
        'msm:shape': { preset: 'carpet' },
        'msm:on_break': { event: 'example:noise' },
        'msm:on_place': { event: 'example:noise' },
        'msm:on_random_tick': { event: 'example:noise', chance: 0.25 },
        'msm:on_entity_inside': { event: 'example:noise', cooldown_ticks: 40 },
      },
      events: {
        'example:noise': {
          actions: [{ type: 'play_sound', sound: 'minecraft:block.moss.step' }],
        },
      },
    },
  },
  {
    kind: itemKind,
    name: 'trigger_item',
    id: 'example:trigger_boots',
    data: {
      format: 1,
      model: 'minecraft:item/iron_boots',
      max_stack_size: 1,
      components: {
        'msm:armor': { slot: 'boots', material: 'iron' },
        'msm:on_hit': { event: 'example:spark' },
        'msm:on_use_on_block': { event: 'example:spark', cooldown_ticks: 10 },
        'msm:while_held': { event: 'example:spark', interval_ticks: 20, hand: 'either' },
        'msm:while_worn': { event: 'example:spark', interval_ticks: 100 },
      },
      events: {
        'example:spark': {
          actions: [{ type: 'spawn_particle', particle: 'minecraft:electric_spark', count: 4 }],
        },
      },
    },
  },
  {
    kind: biomeAdditionKind,
    name: 'ruby_ore_overworld',
    id: 'example:ruby_ore_overworld',
    data: {
      format: 1,
      biomes: ['#minecraft:is_overworld', 'minecraft:plains'],
      features: [{ feature: 'example:ruby_ore_placed', step: 'underground_ores' }],
      spawns: [
        {
          entity: 'minecraft:fox',
          category: 'creature',
          weight: 4,
          min_group: 1,
          max_group: 3,
        },
      ],
    },
  },
  {
    kind: lootAdditionKind,
    name: 'zombie_ruby',
    id: 'example:zombie_ruby',
    data: {
      format: 1,
      tables: ['minecraft:entities/zombie', 'minecraft:entities/husk'],
      pools: [
        {
          rolls: 1,
          bonus_rolls: 0,
          entries: [
            { type: 'minecraft:item', name: 'example:ruby', weight: 3 },
            { type: 'minecraft:item', name: 'minecraft:emerald' },
          ],
          condition: { type: 'minecraft:killed_by_player' },
        },
      ],
    },
  },
  {
    kind: effectKind,
    name: 'withering_no_name',
    id: 'example:curses/withering',
    data: { format: 1, category: 'neutral', color: 0 },
  },
  {
    kind: potionKind,
    name: 'frost_potion',
    id: 'example:frost_potion',
    data: {
      format: 1,
      display_name: 'Frost',
      effects: [
        { id: 'example:frost', duration_ticks: 1800 },
        {
          id: 'minecraft:slowness',
          duration_ticks: 900,
          amplifier: 1,
          ambient: true,
          show_particles: false,
          show_icon: true,
        },
      ],
      brewing: { base: 'minecraft:thick', reagent: '#minecraft:small_flowers' },
      long: { duration_ticks: 4800, reagent: 'minecraft:snowball' },
      strong: { amplifier: 2, duration_ticks: 900 },
    },
  },
  {
    kind: potionKind,
    name: 'brews_haste_no_splash',
    id: 'example:brews/haste',
    data: {
      format: 1,
      name: 'example.haste',
      effects: [{ id: 'minecraft:haste', duration_ticks: 3600 }],
      brewing: { reagent: 'minecraft:honeycomb' },
      long: { duration_ticks: 9600 },
      splash: false,
    },
  },
  {
    kind: potionKind,
    name: 'drinkable_only',
    id: 'example:frost_potion',
    data: {
      format: 1,
      display_name: 'Frost',
      effects: [{ id: 'example:frost', duration_ticks: 1800 }],
      splash: false,
      lingering: false,
    },
  },
  ...TYPE_SAMPLES,
  ...CONTAINER_SAMPLES,
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

/**
 * The test indexes with the ids a block type sample brings into the project: its block and
 * block item, the block and item named in its data (base blocks, strip targets), the models it
 * names or generates and the textures it uses. Other samples see the shared project ids only.
 */
function withOutputIds(indexes: TargetIndexes, sample: Sample, files: OutputFile[]): TargetIndexes {
  const machine = /^(container|machine)-/.test(sample.name);
  if (!sample.name.startsWith('type-') && !machine) return indexes;
  const data = sample.data as Record<string, unknown>;
  const ids = (value: unknown): string[] =>
    typeof value === 'object' && value !== null
      ? Object.values(value).filter((entry): entry is string => typeof entry === 'string')
      : [];
  const item = data.item as Record<string, unknown> | false | undefined;
  const itemIds = item === false ? [] : [String(item?.id ?? sample.id)];
  const components = (data.components ?? {}) as Record<string, Record<string, unknown>>;
  const modelFiles = files.filter((file) => file.path.includes('/models/'));
  const modelIds = modelFiles.map((file) =>
    file.path.replace(/^assets\/([^/]+)\/models\/(.+)\.json$/, '$1:$2'),
  );
  const project: Record<string, readonly string[]> = {
    ...PROJECT_IDS,
    block: [
      ...(PROJECT_IDS.block ?? []),
      sample.id,
      ...ids({ base: data.base_block, into: components['msm:strippable']?.into }),
    ],
    item: [...(PROJECT_IDS.item ?? []), ...itemIds],
    model: [...(PROJECT_IDS.model ?? []), ...modelIds, ...ids(data.models)],
    texture: ids(data.textures),
    // A machine's id is its own recipe type and serialiser (ADR 0075 D2).
    ...(machine ? { recipe_type: [sample.id], recipe_serializer: [sample.id] } : {}),
  };
  return { ...indexes, registries: createRegistryIndex({ vanilla: indexes.vanilla, project }) };
}

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
        const indexes = withOutputIds(await indexesFor(bundle), sample, files);
        const problems = (schema: string, value: Json) => blockingProblems(indexes, schema, value);
        expect(problems(sample.kind.schema, sample.data)).toEqual([]);
        // Loot addition pools are `any` in the format: check them against vanilla's pool.
        if (sample.kind === lootAdditionKind) {
          for (const pool of (sample.data as { pools: Json[] }).pools) {
            expect(problems('::java::data::loot::LootPool', pool)).toEqual([]);
          }
        }
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

describe('block types', () => {
  const target = builtInTargets[0]?.target;
  if (target === undefined) throw new Error('no built-in target');

  it('lowers `"type": "block"` exactly as a block without a type', async () => {
    for (const sample of SAMPLES.filter(
      (entry) =>
        entry.kind === blockKind &&
        !entry.name.startsWith('type-') &&
        (entry.data as Record<string, Json>).type === undefined,
    )) {
      const data = sample.data as Record<string, Json>;
      const typed = { ...data, type: 'block' };
      const plain = await blockKind.lower(element(blockKind.id, sample.id, data), target);
      const files = await blockKind.lower(element(blockKind.id, sample.id, typed), target);
      expect(files.slice(1), sample.name).toEqual(plain.slice(1));
    }
  });

  it('names a model slot table for every type, `item` last', () => {
    expect(Object.keys(BLOCK_TYPE_MODEL_SLOTS)).toEqual([...BLOCK_TYPES]);
    for (const type of BLOCK_TYPES) expect(BLOCK_TYPE_MODEL_SLOTS[type].at(-1)).toBe('item');
  });

  it('leaves a block with no model, models or textures without appearance files', async () => {
    const files = await blockKind.lower(
      element(blockKind.id, 'example:bare', { format: 1, type: 'stairs' }),
      target,
    );
    expect(files.map((file) => file.path)).toEqual([
      'msm/example/block/bare.json',
      `data/minecraft/${target.folders.data.tags}/block/stairs.json`,
      `data/minecraft/${target.folders.data.tags}/item/stairs.json`,
    ]);
  });

  it('strips every editor field from the definition', async () => {
    const [definition] = await blockKind.lower(
      element(blockKind.id, 'example:tomatoes', {
        format: 1,
        type: 'crop',
        loot: 'crop',
        crop_drops: { produce: 'example:tomato' },
        villager_plantable: false,
        textures: { stages: ['example:block/tomatoes_stage0'] },
        models: { default: 'example:block/tomatoes_stage0' },
        item: { id: 'example:tomato_seeds' },
      }),
      target,
    );
    expect(definition?.contents).toEqual({
      format: 1,
      type: 'crop',
      item: { id: 'example:tomato_seeds' },
    });
  });

  it('names exactly the models lowering writes (blockGeneratedModelIds)', async () => {
    const modelId = (path: string): string | undefined => {
      const match = /^assets\/([^/]+)\/models\/(.+)\.json$/.exec(path);
      return match === null ? undefined : `${match[1]}:${match[2]}`;
    };
    const blocks = SAMPLES.filter((entry) => entry.kind === blockKind);
    expect(blocks.some((entry) => entry.name.startsWith('type-'))).toBe(true);
    for (const sample of blocks) {
      const files = await blockKind.lower(element(blockKind.id, sample.id, sample.data), target);
      const written = files.map((file) => modelId(file.path)).filter((id) => id !== undefined);
      expect(blockGeneratedModelIds(sample.id, sample.data), sample.name).toEqual(written);
    }
    expect(blockGeneratedModelIds('demo:x', { format: 1, type: 'ladder' })).toEqual([]);
    expect(blockGeneratedModelIds('demo:x', null)).toEqual([]);
  });

  it('rejects an unknown type', () => {
    expect(() =>
      blockKind.lower(element(blockKind.id, 'example:x', { format: 1, type: 'ladder' }), target),
    ).toThrow(/unknown block type "ladder"/);
  });

  it('gives the block item id', () => {
    expect(blockItemId({ id: 'example:a', data: { format: 1 } })).toBe('example:a');
    expect(blockItemId({ id: 'example:a', data: { format: 1, item: { id: 'example:b' } } })).toBe(
      'example:b',
    );
    expect(blockItemId({ id: 'example:a', data: { format: 1, item: false } })).toBeUndefined();
  });

  describe('texture precedence: an empty slot takes `all` ("Every face") first', () => {
    /** The `textures` of each generated model, keyed by model path. */
    const modelTextures = async (
      id: string,
      data: Json,
    ): Promise<Record<string, Record<string, string>>> => {
      const files = await blockKind.lower(
        element(blockKind.id, id as ResourceLocation, data),
        target,
      );
      return Object.fromEntries(
        files
          .filter((file) => /\/models\/block\//.test(file.path))
          .map((file) => [
            file.path.replace(/^.*\/models\//, ''),
            (file.contents as { textures: Record<string, string> }).textures,
          ]),
      );
    };

    it.each(['stairs', 'slab'])(
      '%s: empty top and bottom take `all` before `side`',
      async (type) => {
        const models = await modelTextures(`example:p_${type}`, {
          format: 1,
          type,
          textures: { all: 'example:block/all', side: 'example:block/side' },
        });
        expect(Object.keys(models).length).toBeGreaterThan(0);
        for (const [path, textures] of Object.entries(models)) {
          expect(textures, path).toMatchObject({
            bottom: 'example:block/all',
            side: 'example:block/side',
            top: 'example:block/all',
          });
        }
      },
    );

    it.each(['stairs', 'slab'])(
      '%s: without `all`, empty top and bottom still take `side`',
      async (type) => {
        const models = await modelTextures(`example:q_${type}`, {
          format: 1,
          type,
          textures: { side: 'example:block/side', top: 'example:block/top' },
        });
        for (const [path, textures] of Object.entries(models)) {
          expect(textures, path).toMatchObject({
            bottom: 'example:block/side',
            side: 'example:block/side',
            top: 'example:block/top',
          });
        }
      },
    );

    it('every building type fills an empty slot from `all` before any other slot', async () => {
      const cases: [string, Record<string, string>, string][] = [
        ['pillar', { side: 'x:block/other' }, 'end'],
        ['horizontal', { side: 'x:block/other', top: 'x:block/other' }, 'front'],
        ['directional', { side: 'x:block/other', top: 'x:block/other' }, 'front'],
        ['door', { top: 'x:block/other' }, 'bottom'],
        ['pane', { pane: 'x:block/other' }, 'edge'],
        ['wall', {}, 'wall'],
        ['fence', {}, 'texture'],
        ['fence_gate', {}, 'texture'],
        ['trapdoor', {}, 'texture'],
        ['button', {}, 'texture'],
        ['pressure_plate', {}, 'texture'],
      ];
      for (const [type, others, variable] of cases) {
        // `all` is listed last, so a lookup that fell back to "the first texture given" would
        // pick another slot instead.
        const textures = { ...others, all: 'x:block/all' };
        const models = await modelTextures(`example:r_${type}`, { format: 1, type, textures });
        const filled = Object.values(models)
          .map((entry) => entry[variable])
          .filter((value) => value !== undefined);
        expect(filled.length, type).toBeGreaterThan(0);
        for (const value of filled) expect(value, type).toBe('x:block/all');
      }
    });
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'block type tags on %s',
  (_targetId, bundle) => {
    it('names only tags the target has', async () => {
      const { registries } = await indexesFor(bundle);
      for (const tag of TYPE_BLOCK_TAGS)
        expect(registries.has('tag/block', `minecraft:${tag}`), tag).toBe(true);
      for (const tag of TYPE_ITEM_TAGS)
        expect(registries.has('tag/item', `minecraft:${tag}`), tag).toBe(true);
    });
  },
);

describe('containers and machines (ADR 0074 D8, ADR 0075 D8)', () => {
  const target = builtInTargets[0]?.target;
  if (target === undefined) throw new Error('no built-in target');
  const lower = (id: string, data: Record<string, unknown>) =>
    blockKind.lower(
      element(blockKind.id, id as ResourceLocation, { format: 1, ...data } as Json),
      target,
    );
  const paths = (files: OutputFile[]) => files.map((file) => file.path);
  const lootOf = (files: OutputFile[]) =>
    files.find((file) => file.path.includes('/loot_table/'))?.contents as Record<string, unknown>;
  const blockstateOf = (files: OutputFile[]) =>
    files.find((file) => file.path.includes('/blockstates/'))?.contents as {
      variants: Record<string, { model: string }>;
    };
  const recipe = { ingredient: 'minecraft:gravel', result: 'minecraft:flint' };

  it('gives the shaped types the state slots `open` and `lit` before `item`', () => {
    for (const type of ['block', 'pillar', 'horizontal', 'directional'] as const) {
      expect(BLOCK_TYPE_MODEL_SLOTS[type].slice(-3), type).toEqual(['open', 'lit', 'item']);
    }
    expect(BLOCK_TYPE_MODEL_SLOTS.trapdoor).toEqual(['bottom', 'top', 'open', 'item']);
  });

  it('strips recipes, state models and state textures from the definition', async () => {
    const [definition] = await lower('example:mill', {
      type: 'horizontal',
      textures: { all: 'example:block/a', front_lit: 'example:block/b' },
      models: { lit: 'example:block/mill_on' },
      components: { 'msm:machine': {} },
      recipes: [recipe],
    });
    expect(definition?.contents).toEqual({
      format: 1,
      type: 'horizontal',
      components: { 'msm:machine': {} },
    });
  });

  it('writes recipes only for a machine on a type that takes one', async () => {
    const recipePaths = (files: OutputFile[]) =>
      paths(files).filter((path) => path.includes('/recipe/'));
    expect(
      recipePaths(await lower('example:a', { model: 'm:block/a', recipes: [recipe] })),
    ).toEqual([]);
    expect(
      recipePaths(
        await lower('example:b', {
          type: 'slab',
          textures: { all: 'm:block/a' },
          components: { 'msm:machine': {} },
          recipes: [recipe],
        }),
      ),
    ).toEqual([]);
    expect(
      recipePaths(
        await lower('example:mills/c', { components: { 'msm:machine': {} }, recipes: [recipe] }),
      ),
    ).toEqual([`data/example/${target.folders.data.recipe}/mills/c/flint.json`]);
  });

  it('refuses a recipe with no name and no result, and a name that is not a path', async () => {
    const machine = { components: { 'msm:machine': {} } };
    await expect(async () =>
      lower('example:d', { ...machine, recipes: [{ ingredient: 'minecraft:gravel' }] }),
    ).rejects.toThrow(/no name and no result/);
    await expect(async () =>
      lower('example:d', { ...machine, recipes: [{ ...recipe, name: 'Bad Name' }] }),
    ).rejects.toThrow(/Invalid element id/);
  });

  it('keeps the contents only on a 3-row chest that is not a machine', async () => {
    const copies = async (container: Record<string, unknown>, extra = {}) => {
      const loot = lootOf(
        await lower('example:crate', {
          model: 'm:block/a',
          loot: 'self',
          components: { 'msm:container': container, ...extra },
        }),
      );
      return JSON.stringify(loot).includes('copy_components');
    };
    expect(await copies({ keep_contents: true })).toBe(true);
    expect(await copies({ keep_contents: true, layout: 'chest', rows: 3 })).toBe(true);
    expect(await copies({ keep_contents: true, rows: 6 })).toBe(false);
    expect(await copies({ keep_contents: true, layout: 'hopper' })).toBe(false);
    expect(await copies({ keep_contents: false })).toBe(false);
    expect(await copies({ keep_contents: true }, { 'msm:machine': {} })).toBe(false);
  });

  it('gives a machine that is also a container `lit`, not `open`', async () => {
    const state = blockstateOf(
      await lower('example:both', {
        model: 'm:block/a',
        models: { open: 'm:block/open', lit: 'm:block/lit' },
        components: { 'msm:container': {}, 'msm:machine': {} },
      }),
    );
    expect(state.variants).toEqual({
      'lit=false': { model: 'm:block/a' },
      'lit=true': { model: 'm:block/lit' },
    });
  });

  it('writes no state without a component, and none on a type that takes neither', async () => {
    const plain = blockstateOf(
      await lower('example:plain', { model: 'm:block/a', models: { open: 'm:block/open' } }),
    );
    expect(plain.variants).toEqual({ '': { model: 'm:block/a' } });
    const files = await lower('example:slab', {
      type: 'slab',
      textures: { all: 'm:block/a' },
      components: { 'msm:container': {} },
    });
    expect(Object.keys(blockstateOf(files).variants).some((key) => key.includes('open'))).toBe(
      false,
    );
  });

  it('turns the open model up and down when a directional block has no open vertical model', async () => {
    const state = blockstateOf(
      await lower('example:dir', {
        type: 'directional',
        textures: { all: 'm:block/a' },
        models: { open: 'm:block/open' },
        components: { 'msm:container': {} },
      }),
    );
    expect(state.variants['facing=up,open=true']).toEqual({ model: 'm:block/open', x: 270 });
    expect(state.variants['facing=up,open=false']).toEqual({ model: 'example:block/dir_vertical' });
  });
});
