/**
 * Golden over the committed kitchen-sink mod project (`fixtures/sample-mod`, ADR 0026 D6):
 * an `msm:mod`, seven `msm:block` and twelve `msm:item` elements covering the block and item
 * components and the actions (gear since ADR 0044: a bow, a drink, a charm with `apply_effect`,
 * horse armour; since ADRs 0055 and 0056 a drink giving a custom effect, a dart and a
 * boomerang; since ADRs 0057 and 0058 the `ruby_spring` step block and two project sound
 * events in a `minecraft:sounds` element; since ADR 0059 the shaped blocks `ruby_slab`,
 * `ruby_sprout` and `ruby_glass`; since ADRs 0060 and 0061 ruby ore generation through an
 * `msm:biome_addition` with its feature and placed feature, a zombie drop through an
 * `msm:loot_addition`, the fuel and compost item `ruby_tinder` and one item or block per item
 * and block trigger), two `msm:effect` elements with their icons, since ADR 0063 an `msm:potion`
 * of one of them brewed from the project's ruby with long and strong versions, a `minecraft:equipment`
 * element with its three armour layer textures (ADR 0042), three functions and a loot table,
 * namespace `msm_sample_mod`.
 *
 * - The fixture equals the project built from {@link SAMPLE_ELEMENTS} and
 *   {@link SAMPLE_ASSETS} now; `UPDATE_GOLDENS=1` rewrites it (the README is hand-written).
 * - Every element validates with zero problems, the plugins' project validators report
 *   nothing, and every function passes the offline mcfunction checker.
 * - The content jar exports with zero problems and a stub runtime jar; its SHA-256 is pinned
 *   per target in two time zones (`test/fixtures/<target id>/sample-mod-jar.sha256`).
 * - The jar holds the expected `msm/` definitions, and each validates against the MSM
 *   definition schema with zero problems.
 * - With `MSM_RUNTIME_JAR` (a built `msm_runtime` jar) and `MSM_SAMPLE_MOD_OUT` (a folder),
 *   the jar is also exported with the real runtime nested and written to that folder as
 *   `msm_sample_mod.jar`, next to `fabric-facts.json` for `tools/run-fabric-server` (CI's
 *   `engine-mod` job). Without them that test is skipped.
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createElement,
  createEmptyProject,
  createMemoryFileSystem,
  type DirEntry,
  ElementKindRegistry,
  loadProject,
  type MemoryFileSystem,
  type ProjectFileSystem,
  registerPlugin,
  saveProject,
  utf8,
} from '@msm/core';
import type { Element, Json, Plugin, Problem, Project, Target } from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
import { encodePng, placeholderPng, type Rgb } from '@msm/plugin-library';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import worldgenPlugin from '@msm/plugin-worldgen';
import {
  createRegistryIndex,
  createSchemaIndex,
  MSM_SCHEMA_REFS,
  parseVanillaMcdocSymbols,
  type RegistryIndex,
  type SchemaIndex,
  validateJson,
} from '@msm/schemas';
import { createMcfunctionService, type McfunctionService } from '@msm/schemas/mcfunction';
import { builtInTargets, readVendoredJson, type TargetBundle } from '@msm/targets';
import { unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createFabricContentJarExporter,
  createZipSink,
  type FabricContentJarOptions,
  runExport,
} from '../src/index';
import { defaultTarget, selectedTarget } from './selected-target';

const update = process.env.UPDATE_GOLDENS === '1';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, 'fixtures');
const sampleRoot = join(here, '..', '..', '..', 'fixtures', 'sample-mod');
const NAMESPACE = 'msm_sample_mod';
const PROJECT_NAME = 'MSM Sample Mod';
const NOW = '2026-11-05T00:00:00.000Z';
/** Files of the fixture that the test does not generate. */
const HAND_WRITTEN = new Set(['README.md']);

/** Two zones on opposite sides of the date line, so a local-time leak changes the bytes. */
const TIME_ZONES = ['Pacific/Kiritimati', 'America/Los_Angeles'] as const;

/** The plugins the sample needs, in the app's registration order. */
const PLUGINS: readonly Plugin[] = [
  resourcePackPlugin,
  dataPackPlugin,
  worldgenPlugin,
  blocksItemsPlugin,
];
const VALIDATORS = PLUGINS.flatMap((plugin) => plugin.contributes.validators ?? []);

const registry = new ElementKindRegistry();
for (const plugin of PLUGINS) registerPlugin(registry, plugin);

const meta = {
  msmVersion: '0.4.0',
  plugins: ['msm.blocks-items', 'msm.datapack', 'msm.worldgen'],
};
const stubRuntimeJar = utf8.encode('PK stub msm_runtime jar for the sample-mod golden');

// The project -----------------------------------------------------------------------------

interface SampleElement {
  id: string;
  kind: string;
  data: Json;
}

const ns = (path: string): string => `${NAMESPACE}:${path}`;

/**
 * The kitchen sink. Between them the blocks and items use every component (`msm:breakable`,
 * `msm:light_emitter`, `msm:on_interact`, `msm:on_step`, `msm:redstone`, `msm:food`,
 * `msm:tool` with a vanilla tier and with a custom material and an attack speed override,
 * `msm:armor` with a custom material (helmet and horse armour), `msm:durability`, `msm:on_use`,
 * `msm:consumable`, `msm:ranged_weapon`, `msm:throwable`, `msm:shape`), the effect components
 * (`msm:on_start`, `msm:on_tick`, `msm:on_end`) and every action (`play_sound`,
 * `spawn_particle`, `run_function`, `set_block_state`, `give_item`, `trigger_event`,
 * `apply_effect`, `damage`, `heal`). Item and block models are vanilla ones; the only textures
 * are the three armour layers of the ruby equipment asset and the two effect icons
 * ({@link SAMPLE_ASSETS}). The equipment element is
 * `ruby_armor`, not `ruby`: element ids are unique per namespace and `ruby` is the item.
 */
/** The colours of the two effects (particles and the HUD bar), also their placeholder icons'. */
const RUBY_RUSH_COLOUR = 0xe0115f;
const RUBY_STING_COLOUR = 0x8b0000;

const SAMPLE_ELEMENTS: readonly SampleElement[] = [
  {
    id: ns('mod'),
    kind: 'msm:mod',
    data: {
      mod_id: NAMESPACE,
      version: '1.0.0',
      name: PROJECT_NAME,
      description: 'Kitchen-sink sample: every block and item component and every action.',
      authors: ['MCSuperMods'],
      licence: 'MIT',
    },
  },
  {
    id: ns('ruby_ore'),
    kind: 'msm:block',
    data: {
      format: 1,
      model: 'minecraft:block/redstone_ore',
      display_name: 'Ruby Ore',
      loot: ns('blocks/ruby_ore_rich'),
      sound_type: 'stone',
      item: { creative_tab: 'minecraft:natural_blocks', max_stack_size: 64, rarity: 'common' },
      components: {
        'msm:breakable': { hardness: 3, resistance: 3, tool: 'pickaxe', min_tier: 'iron' },
        'msm:light_emitter': { level: 7 },
        'msm:on_interact': { event: ns('shimmer') },
      },
      events: {
        [ns('shimmer')]: {
          actions: [
            { type: 'play_sound', sound: 'minecraft:block.amethyst_block.chime', volume: 1 },
            { type: 'spawn_particle', particle: 'minecraft:glow', count: 12, spread: 0.4 },
            { type: 'run_function', function: ns('ruby/shimmer') },
          ],
        },
      },
    },
  },
  {
    id: ns('chime_block'),
    kind: 'msm:block',
    data: {
      format: 1,
      model: 'minecraft:block/note_block',
      display_name: 'Chime Block',
      loot: 'self',
      sound_type: 'wood',
      item: { creative_tab: 'minecraft:redstone_blocks', max_stack_size: 16, rarity: 'uncommon' },
      components: {
        'msm:breakable': { hardness: 0.8, tool: 'axe', min_tier: 'copper', requires_tool: false },
        'msm:redstone': { emit: 0, on_powered: ns('wake'), on_unpowered: ns('sleep') },
        'msm:on_step': { event: ns('wake'), cooldown_ticks: 20 },
      },
      events: {
        [ns('wake')]: {
          actions: [
            { type: 'play_sound', sound: 'minecraft:block.note_block.bell', pitch: 1.5 },
            { type: 'set_block_state', state: 'minecraft:glowstone', offset: [0, 1, 0] },
          ],
        },
        [ns('sleep')]: {
          actions: [
            { type: 'set_block_state', state: 'minecraft:air', offset: [0, 1, 0] },
            { type: 'trigger_event', event: ns('chime') },
          ],
        },
        [ns('chime')]: {
          actions: [{ type: 'play_sound', sound: ns('chime.ring'), pitch: 0.8 }],
        },
      },
    },
  },
  {
    id: ns('ruby_spring'),
    kind: 'msm:block',
    data: {
      format: 1,
      model: 'minecraft:block/slime_block',
      display_name: 'Ruby Spring',
      loot: 'self',
      sound_type: 'stone',
      item: { creative_tab: 'minecraft:redstone_blocks', max_stack_size: 64, rarity: 'common' },
      components: {
        'msm:breakable': { hardness: 1.5, tool: 'pickaxe', min_tier: 'wood' },
        // Whoever steps on it, player or mob, is `self` (ADR 0058 D1).
        'msm:on_step': { event: ns('spring'), cooldown_ticks: 10 },
      },
      events: {
        [ns('spring')]: {
          actions: [
            { type: 'apply_effect', effect: 'minecraft:jump_boost', seconds: 5, target: 'self' },
            { type: 'launch', strength: 1, direction: 'up', target: 'self' },
            { type: 'run_function', function: ns('ruby/spring') },
          ],
        },
      },
    },
  },
  {
    id: ns('glow_stone'),
    kind: 'msm:block',
    data: {
      format: 1,
      model: 'minecraft:block/glowstone',
      display_name: 'Glow Stone',
      loot: 'self',
      sound_type: 'glass',
      item: false,
      components: {
        'msm:breakable': { hardness: 2, tool: 'shovel', min_tier: 'netherite' },
        'msm:light_emitter': { level: 15 },
      },
    },
  },
  // Block shapes (ADR 0059): a fixed half block, a walk-through plant and a glass-like cube.
  {
    id: ns('ruby_slab'),
    kind: 'msm:block',
    data: {
      format: 1,
      model: 'minecraft:block/smooth_stone_slab',
      display_name: 'Ruby Slab',
      loot: 'self',
      sound_type: 'stone',
      item: { creative_tab: 'minecraft:building_blocks' },
      components: {
        'msm:breakable': { hardness: 2, resistance: 6, tool: 'pickaxe' },
        'msm:shape': { preset: 'slab_bottom' },
      },
    },
  },
  {
    id: ns('ruby_sprout'),
    kind: 'msm:block',
    data: {
      format: 1,
      model: 'minecraft:block/poppy',
      display_name: 'Ruby Sprout',
      loot: 'self',
      sound_type: 'grass',
      item: { creative_tab: 'minecraft:natural_blocks' },
      components: {
        'msm:breakable': { hardness: 0, resistance: 0 },
        'msm:shape': { preset: 'cross' },
      },
    },
  },
  {
    id: ns('ruby_glass'),
    kind: 'msm:block',
    data: {
      format: 1,
      model: 'minecraft:block/red_stained_glass',
      display_name: 'Ruby Glass',
      loot: 'self',
      sound_type: 'glass',
      item: { creative_tab: 'minecraft:building_blocks' },
      components: {
        'msm:breakable': { hardness: 0.3, resistance: 0.3 },
        'msm:shape': { preset: 'full', see_through: true },
      },
    },
  },
  {
    id: ns('ruby'),
    kind: 'msm:item',
    data: {
      format: 1,
      model: 'minecraft:item/emerald',
      display_name: 'Ruby',
      max_stack_size: 64,
      rarity: 'uncommon',
      creative_tab: 'minecraft:ingredients',
    },
  },
  {
    id: ns('ruby_wand'),
    kind: 'msm:item',
    data: {
      format: 1,
      model: 'minecraft:item/blaze_rod',
      display_name: 'Ruby Wand',
      rarity: 'epic',
      creative_tab: 'minecraft:tools_and_utilities',
      components: {
        'msm:tool': { type: 'sword', tier: 'gold' },
        'msm:durability': { max: 32 },
        'msm:on_use': { event: ns('zap'), cooldown_ticks: 10 },
      },
      events: {
        [ns('zap')]: {
          actions: [
            { type: 'give_item', item: ns('ruby'), count: 2 },
            { type: 'spawn_particle', particle: 'minecraft:electric_spark', count: 5, speed: 0.1 },
            { type: 'trigger_event', event: ns('zap_sound') },
          ],
        },
        [ns('zap_sound')]: {
          actions: [{ type: 'play_sound', sound: 'minecraft:entity.lightning_bolt.impact' }],
        },
      },
    },
  },
  {
    id: ns('ruby_pickaxe'),
    kind: 'msm:item',
    data: {
      format: 1,
      model: 'minecraft:item/diamond_pickaxe',
      display_name: 'Ruby Pickaxe',
      rarity: 'rare',
      creative_tab: 'minecraft:tools_and_utilities',
      components: {
        'msm:tool': {
          type: 'pickaxe',
          // Mines like diamond (its incorrect-for-drops tag), faster, not enchantable.
          tier: {
            durability: 1200,
            speed: 9,
            attack_damage_bonus: 3,
            enchantment_value: 0,
            incorrect_blocks_for_drops: '#minecraft:incorrect_for_diamond_tool',
            repair_items: '#minecraft:diamond_tool_materials',
          },
          attack_speed: -2.6,
        },
      },
    },
  },
  {
    id: ns('ruby_helmet'),
    kind: 'msm:item',
    data: {
      format: 1,
      model: 'minecraft:item/diamond_helmet',
      display_name: 'Ruby Helmet',
      rarity: 'rare',
      creative_tab: 'minecraft:combat',
      components: {
        'msm:armor': {
          slot: 'helmet',
          material: {
            durability: 25,
            defense: { helmet: 3, chestplate: 7, leggings: 5, boots: 2 },
            enchantment_value: 12,
            toughness: 1,
            knockback_resistance: 0.05,
            equip_sound: ns('ruby.clink'),
            repair_items: '#minecraft:repairs_diamond_armor',
            equipment_asset: ns('ruby_armor'),
          },
        },
      },
    },
  },
  {
    id: ns('ruby_armor'),
    kind: 'minecraft:equipment',
    data: {
      layers: {
        horse_body: [{ texture: ns('ruby') }],
        humanoid: [{ texture: ns('ruby') }],
        humanoid_leggings: [{ texture: ns('ruby') }],
      },
    },
  },
  {
    id: ns('ruby_horse_armor'),
    kind: 'msm:item',
    data: {
      format: 1,
      model: 'minecraft:item/diamond_horse_armor',
      display_name: 'Ruby Horse Armour',
      rarity: 'rare',
      creative_tab: 'minecraft:combat',
      components: {
        'msm:armor': {
          slot: 'horse',
          // Horse armour takes the chestplate defence (ADR 0044 D5).
          material: {
            durability: 25,
            defense: { helmet: 3, chestplate: 9, leggings: 5, boots: 2 },
            enchantment_value: 12,
            toughness: 1,
            knockback_resistance: 0,
            repair_items: '#minecraft:repairs_diamond_armor',
            equipment_asset: ns('ruby_armor'),
          },
        },
      },
    },
  },
  {
    id: ns('ruby_bow'),
    kind: 'msm:item',
    data: {
      format: 1,
      model: 'minecraft:item/bow',
      display_name: 'Ruby Bow',
      rarity: 'rare',
      creative_tab: 'minecraft:combat',
      components: {
        'msm:ranged_weapon': { type: 'bow', draw_speed: 2, velocity: 1.5, damage_multiplier: 1.5 },
      },
    },
  },
  {
    id: ns('ruby_tonic'),
    kind: 'msm:item',
    data: {
      format: 1,
      model: 'minecraft:item/honey_bottle',
      display_name: 'Ruby Tonic',
      max_stack_size: 16,
      creative_tab: 'minecraft:food_and_drinks',
      components: {
        'msm:consumable': {
          seconds: 1,
          animation: 'drink',
          effects: [
            { effect: 'minecraft:speed', seconds: 30, amplifier: 1 },
            { effect: 'minecraft:regeneration', seconds: 5 },
          ],
          converts_to: 'minecraft:glass_bottle',
          cooldown_seconds: 3,
          sound: ns('ruby.clink'),
        },
      },
    },
  },
  {
    id: ns('ruby_charm'),
    kind: 'msm:item',
    data: {
      format: 1,
      model: 'minecraft:item/heart_of_the_sea',
      display_name: 'Ruby Charm',
      max_stack_size: 1,
      rarity: 'uncommon',
      creative_tab: 'minecraft:tools_and_utilities',
      components: {
        'msm:on_use': { event: ns('charm'), cooldown_ticks: 100 },
      },
      events: {
        [ns('charm')]: {
          actions: [
            { type: 'apply_effect', effect: 'minecraft:speed', seconds: 10, amplifier: 1 },
            { type: 'apply_effect', effect: 'minecraft:glowing', seconds: 2, target: 'other' },
          ],
        },
      },
    },
  },
  {
    id: ns('ruby_apple'),
    kind: 'msm:item',
    data: {
      format: 1,
      model: 'minecraft:item/apple',
      display_name: 'Ruby Apple',
      max_stack_size: 16,
      creative_tab: 'minecraft:food_and_drinks',
      components: {
        'msm:food': { nutrition: 4, saturation: 0.6, can_always_eat: true },
        'msm:on_use': { event: ns('crunch') },
      },
      events: {
        [ns('crunch')]: {
          actions: [
            { type: 'spawn_particle', particle: 'minecraft:happy_villager', count: 8 },
            { type: 'run_function', function: ns('ruby/shimmer') },
          ],
        },
      },
    },
  },
  // Effects and throwables (ADRs 0055 and 0056).
  {
    id: ns('ruby_rush'),
    kind: 'msm:effect',
    data: {
      format: 1,
      display_name: 'Ruby Rush',
      category: 'beneficial',
      color: RUBY_RUSH_COLOUR,
      sound: 'minecraft:block.amethyst_block.chime',
      attribute_modifiers: [
        { attribute: 'minecraft:movement_speed', amount: 0.2, operation: 'add_multiplied_total' },
      ],
      components: {
        'msm:on_start': { event: ns('rush_start') },
        'msm:on_tick': { event: ns('rush_tick'), interval_ticks: 10 },
        'msm:on_end': { event: ns('rush_end') },
      },
      events: {
        [ns('rush_start')]: {
          actions: [{ type: 'run_function', function: ns('ruby/rush') }],
        },
        [ns('rush_tick')]: { actions: [{ type: 'heal', amount: 1 }] },
        [ns('rush_end')]: {
          actions: [{ type: 'apply_effect', effect: 'minecraft:glowing', seconds: 3 }],
        },
      },
    },
  },
  {
    id: ns('ruby_sting'),
    kind: 'msm:effect',
    data: {
      format: 1,
      display_name: 'Ruby Sting',
      category: 'harmful',
      color: RUBY_STING_COLOUR,
      particle: 'minecraft:crit',
      components: {
        'msm:on_tick': { event: ns('sting_tick'), interval_ticks: 20 },
      },
      events: {
        [ns('sting_tick')]: { actions: [{ type: 'damage', amount: 1 }] },
      },
    },
  },
  // A potion of the Ruby Rush effect (ADR 0063): brewed from an awkward potion and a ruby,
  // with longer (redstone) and stronger (glowstone dust) versions, splash and lingering
  // bottles and tipped arrows.
  {
    id: ns('ruby_draught'),
    kind: 'msm:potion',
    data: {
      format: 1,
      display_name: 'Ruby Rush',
      effects: [{ id: ns('ruby_rush'), duration_ticks: 3600 }],
      brewing: { reagent: ns('ruby') },
      long: { duration_ticks: 9600 },
      strong: { amplifier: 1, duration_ticks: 1800 },
    },
  },
  {
    id: ns('ruby_elixir'),
    kind: 'msm:item',
    data: {
      format: 1,
      model: 'minecraft:item/experience_bottle',
      display_name: 'Ruby Elixir',
      max_stack_size: 16,
      creative_tab: 'minecraft:food_and_drinks',
      components: {
        'msm:consumable': {
          seconds: 1,
          animation: 'drink',
          converts_to: 'minecraft:glass_bottle',
          effects: [{ effect: ns('ruby_rush'), seconds: 20, amplifier: 1 }],
        },
      },
    },
  },
  {
    id: ns('ruby_dart'),
    kind: 'msm:item',
    data: {
      format: 1,
      model: 'minecraft:item/arrow',
      display_name: 'Ruby Dart',
      max_stack_size: 16,
      creative_tab: 'minecraft:combat',
      components: {
        'msm:throwable': {
          speed: 2,
          damage: 3,
          after_throw: 'drop',
          on_hit_entity: { event: ns('dart_hit') },
        },
      },
      events: {
        [ns('dart_hit')]: {
          actions: [
            { type: 'apply_effect', effect: ns('ruby_sting'), seconds: 10, target: 'other' },
          ],
        },
      },
    },
  },
  {
    id: ns('ruby_boomerang'),
    kind: 'msm:item',
    data: {
      format: 1,
      model: 'minecraft:item/breeze_rod',
      display_name: 'Ruby Boomerang',
      max_stack_size: 1,
      rarity: 'uncommon',
      creative_tab: 'minecraft:combat',
      components: {
        'msm:durability': { max: 64 },
        'msm:throwable': {
          speed: 1.5,
          charge_ticks: 10,
          after_throw: 'return',
          sound: 'minecraft:item.trident.throw',
          dispensable: false,
        },
      },
    },
  },
  // Additions to vanilla content (ADR 0060): the ruby ore generates in overworld biomes, a
  // zombie always drops a ruby besides its vanilla drops, and an item burns and composts.
  {
    id: ns('ore_ruby'),
    kind: 'minecraft:worldgen/feature',
    data: {
      type: 'minecraft:ore',
      size: 6,
      discard_chance_on_air_exposure: 0,
      targets: [
        {
          target: { predicate_type: 'minecraft:block_match', block: 'minecraft:stone' },
          state: ns('ruby_ore'),
        },
        {
          target: { predicate_type: 'minecraft:block_match', block: 'minecraft:deepslate' },
          state: ns('ruby_ore'),
        },
      ],
    },
  },
  {
    id: ns('ore_ruby_placed'),
    kind: 'minecraft:worldgen/placed_feature',
    data: {
      feature: ns('ore_ruby'),
      placement: [
        { type: 'minecraft:count', count: 6 },
        { type: 'minecraft:in_square' },
        {
          type: 'minecraft:height_range',
          height: {
            type: 'minecraft:uniform',
            min_inclusive: { absolute: -64 },
            max_inclusive: { absolute: 32 },
          },
        },
        { type: 'minecraft:biome' },
      ],
    },
  },
  {
    id: ns('ruby_ore_generation'),
    kind: 'msm:biome_addition',
    data: {
      format: 1,
      biomes: ['#minecraft:is_overworld'],
      features: [{ feature: ns('ore_ruby_placed'), step: 'underground_ores' }],
    },
  },
  {
    id: ns('zombie_drops_ruby'),
    kind: 'msm:loot_addition',
    data: {
      format: 1,
      tables: ['minecraft:entities/zombie'],
      // One roll of one entry with no condition: every zombie drops one ruby.
      pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name: ns('ruby') }] }],
    },
  },
  {
    id: ns('ruby_tinder'),
    kind: 'msm:item',
    data: {
      format: 1,
      model: 'minecraft:item/blaze_powder',
      display_name: 'Ruby Tinder',
      creative_tab: 'minecraft:ingredients',
      // 20 seconds is 400 ticks, two smelts; "100%" raises a composter on every insert.
      fuel: { burn_seconds: 20 },
      compost: '100%',
    },
  },
  // Triggers (ADR 0061): one item or block per item and block trigger.
  {
    id: ns('ruby_sword'),
    kind: 'msm:item',
    data: {
      format: 1,
      model: 'minecraft:item/iron_sword',
      display_name: 'Ruby Sword',
      rarity: 'uncommon',
      creative_tab: 'minecraft:combat',
      components: {
        'msm:tool': { type: 'sword', tier: 'iron' },
        // Whoever holds it, player or mob, slows the entity hit (other).
        'msm:on_hit': { event: ns('sword_hit') },
      },
      events: {
        [ns('sword_hit')]: {
          actions: [
            { type: 'apply_effect', effect: 'minecraft:slowness', seconds: 5, target: 'other' },
          ],
        },
      },
    },
  },
  {
    id: ns('ruby_trowel'),
    kind: 'msm:item',
    data: {
      format: 1,
      model: 'minecraft:item/iron_shovel',
      display_name: 'Ruby Trowel',
      max_stack_size: 1,
      creative_tab: 'minecraft:tools_and_utilities',
      components: {
        'msm:on_use_on_block': { event: ns('trowel'), cooldown_ticks: 20 },
      },
      events: {
        // The base is the clicked block: a gold block goes on top of it.
        [ns('trowel')]: {
          actions: [{ type: 'set_block_state', state: 'minecraft:gold_block', offset: [0, 1, 0] }],
        },
      },
    },
  },
  {
    id: ns('ruby_purse'),
    kind: 'msm:item',
    data: {
      format: 1,
      model: 'minecraft:item/bundle',
      display_name: 'Ruby Purse',
      max_stack_size: 1,
      creative_tab: 'minecraft:tools_and_utilities',
      components: {
        'msm:while_held': { event: ns('purse'), interval_ticks: 10, hand: 'either' },
      },
      events: {
        [ns('purse')]: {
          actions: [{ type: 'give_item', item: ns('ruby'), count: 1 }],
        },
      },
    },
  },
  {
    id: ns('ruby_crown'),
    kind: 'msm:item',
    data: {
      format: 1,
      model: 'minecraft:item/golden_helmet',
      display_name: 'Ruby Crown',
      rarity: 'rare',
      creative_tab: 'minecraft:combat',
      components: {
        'msm:armor': { slot: 'helmet', material: 'gold' },
        'msm:while_worn': { event: ns('crown'), interval_ticks: 10 },
      },
      events: {
        [ns('crown')]: {
          actions: [
            { type: 'apply_effect', effect: 'minecraft:night_vision', seconds: 15, target: 'self' },
          ],
        },
      },
    },
  },
  {
    id: ns('ruby_cache'),
    kind: 'msm:block',
    data: {
      format: 1,
      model: 'minecraft:block/barrel',
      display_name: 'Ruby Cache',
      loot: 'self',
      sound_type: 'wood',
      item: { creative_tab: 'minecraft:functional_blocks' },
      components: {
        'msm:breakable': { hardness: 1, tool: 'axe' },
        // The player breaking it, in any game mode, gets three rubies.
        'msm:on_break': { event: ns('cache') },
      },
      events: {
        [ns('cache')]: {
          actions: [{ type: 'give_item', item: ns('ruby'), count: 3 }],
        },
      },
    },
  },
  {
    id: ns('ruby_beacon'),
    kind: 'msm:block',
    data: {
      format: 1,
      model: 'minecraft:block/lodestone',
      display_name: 'Ruby Beacon',
      loot: 'self',
      sound_type: 'stone',
      item: { creative_tab: 'minecraft:functional_blocks' },
      components: {
        'msm:breakable': { hardness: 1.5, tool: 'pickaxe' },
        'msm:on_place': { event: ns('beacon') },
      },
      events: {
        [ns('beacon')]: {
          actions: [{ type: 'set_block_state', state: 'minecraft:lapis_block', offset: [0, 1, 0] }],
        },
      },
    },
  },
  {
    id: ns('ruby_bloom'),
    kind: 'msm:block',
    data: {
      format: 1,
      model: 'minecraft:block/red_mushroom_block',
      display_name: 'Ruby Bloom',
      loot: 'self',
      sound_type: 'grass',
      item: { creative_tab: 'minecraft:natural_blocks' },
      components: {
        'msm:breakable': { hardness: 0.5 },
        'msm:on_random_tick': { event: ns('bloom'), chance: 1 },
      },
      events: {
        [ns('bloom')]: {
          actions: [{ type: 'set_block_state', state: 'minecraft:red_wool', offset: [0, 1, 0] }],
        },
      },
    },
  },
  {
    id: ns('ruby_mist'),
    kind: 'msm:block',
    data: {
      format: 1,
      model: 'minecraft:block/cobweb',
      display_name: 'Ruby Mist',
      loot: 'self',
      sound_type: 'wool',
      item: { creative_tab: 'minecraft:natural_blocks' },
      components: {
        'msm:breakable': { hardness: 0.2 },
        // Walk-through, so entities can be inside it.
        'msm:shape': { preset: 'cross' },
        'msm:on_entity_inside': { event: ns('mist'), cooldown_ticks: 20 },
      },
      events: {
        [ns('mist')]: {
          actions: [
            { type: 'apply_effect', effect: 'minecraft:weakness', seconds: 5, target: 'self' },
          ],
        },
      },
    },
  },
  {
    id: ns('ruby/shimmer'),
    kind: 'minecraft:function',
    data: {
      lines: [
        '# Run by the ruby ore and the ruby apple (run_function action).',
        'particle minecraft:end_rod ~ ~1 ~ 0.3 0.3 0.3 0.02 10',
        'say The ruby shimmers.',
      ],
    },
  },
  {
    id: ns('ruby/rush'),
    kind: 'minecraft:function',
    data: {
      lines: [
        '# Run when Ruby Rush starts (msm:on_start, run_function action).',
        'say The ruby rush begins.',
      ],
    },
  },
  {
    id: ns('ruby/spring'),
    kind: 'minecraft:function',
    data: {
      lines: [
        '# Run by the ruby spring (run_function action) as whoever stepped on it (ADR 0058 D1).',
        'tag @s add msm_sample_sprung',
      ],
    },
  },
  {
    // Project sound events (ADR 0057): the runtime registers both keys, so msm: elements name
    // them as plain ids. Both play vanilla sound files from the player's own game.
    id: ns('sounds'),
    kind: 'minecraft:sounds',
    data: {
      'chime.ring': { sounds: ['minecraft:block/amethyst/resonate1'] },
      'ruby.clink': { sounds: ['minecraft:random/glass1'] },
    },
  },
  {
    id: ns('blocks/ruby_ore_rich'),
    kind: 'minecraft:loot_table',
    data: {
      type: 'minecraft:block',
      pools: [
        {
          rolls: 1,
          bonus_rolls: 0,
          entries: [
            {
              type: 'minecraft:item',
              name: ns('ruby'),
              modifier: {
                type: 'minecraft:set_count',
                count: { type: 'minecraft:uniform', min: 1, max: 3 },
              },
            },
          ],
          condition: { type: 'minecraft:survives_explosion' },
        },
      ],
      random_sequence: ns('blocks/ruby_ore_rich'),
    },
  },
];

interface SampleAsset {
  /** Path under the namespace's assets, such as `textures/entity/equipment/humanoid/x.png`. */
  path: string;
  bytes: Uint8Array;
}

/** The ruby colour of the armour layers. */
const RUBY: Rgb = [196, 28, 52];

/**
 * A placeholder armour layer (64x32 for humanoid layers, 64x64 for horse armour): the whole
 * sheet in `colour`, a darker lower half and a lighter one-pixel grid every eight pixels, so
 * every UV box is filled. Original work; it stands in until the library's armour layer patterns
 * exist.
 */
function armorLayerPlaceholder(colour: Rgb, height = 32): Uint8Array {
  const width = 64;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const shade = x % 8 === 0 || y % 8 === 0 ? 1.2 : y >= height / 2 ? 0.8 : 1;
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        rgba[offset + channel] = Math.min(255, Math.round((colour[channel] as number) * shade));
      }
      rgba[offset + 3] = 255;
    }
  }
  return encodePng(rgba, width, height);
}

/** An `0xRRGGBB` colour as RGB. */
const rgbOf = (colour: number): Rgb => [(colour >> 16) & 0xff, (colour >> 8) & 0xff, colour & 0xff];

/**
 * The three armour layers of `ruby_armor` (`horse_body`, `humanoid`, `humanoid_leggings`) and
 * the two effect icons (the library's 18x18 `effect_icon` placeholder, ADR 0055 D6).
 */
const SAMPLE_ASSETS: readonly SampleAsset[] = [
  {
    path: 'textures/mob_effect/ruby_rush.png',
    bytes: placeholderPng('effect_icon', { colour: rgbOf(RUBY_RUSH_COLOUR) }),
  },
  {
    path: 'textures/mob_effect/ruby_sting.png',
    bytes: placeholderPng('effect_icon', { colour: rgbOf(RUBY_STING_COLOUR) }),
  },
  {
    path: 'textures/entity/equipment/horse_body/ruby.png',
    bytes: armorLayerPlaceholder(RUBY, 64),
  },
  {
    path: 'textures/entity/equipment/humanoid/ruby.png',
    bytes: armorLayerPlaceholder(RUBY),
  },
  {
    path: 'textures/entity/equipment/humanoid_leggings/ruby.png',
    bytes: armorLayerPlaceholder(RUBY),
  },
];

/** The potion registry entries of `ruby_draught` (ADR 0063 D3: the base and its two versions). */
const POTIONS = ['ruby_draught', 'long_ruby_draught', 'strong_ruby_draught'] as const;

/** Blocks registered by the runtime, and items (block items plus stand-alone items). */
const EXPECTED_BLOCKS = SAMPLE_ELEMENTS.filter((entry) => entry.kind === 'msm:block');
const EXPECTED_ITEM_COUNT =
  EXPECTED_BLOCKS.filter((entry) => (entry.data as { item?: Json }).item !== false).length +
  SAMPLE_ELEMENTS.filter((entry) => entry.kind === 'msm:item').length;

/** Builds the sample into a project the way the app's `newProject` does, then saves it. */
async function buildSample(): Promise<MemoryFileSystem> {
  const project = createEmptyProject(PROJECT_NAME, {
    targets: [defaultTarget().target.id],
    plugins: PLUGINS.filter((plugin) => (plugin.contributes.elementKinds ?? []).length > 0).map(
      (plugin) => plugin.id,
    ),
  });
  const namespace = {
    name: NAMESPACE,
    elements: [] as Element[],
    assets: [] as { path: string; mediaType: string }[],
  };
  for (const entry of SAMPLE_ELEMENTS) {
    namespace.elements.push(
      createElement({
        id: entry.id as Element['id'],
        kind: entry.kind,
        data: structuredClone(entry.data),
        now: () => NOW,
      }),
    );
  }
  const fs = createMemoryFileSystem();
  for (const asset of SAMPLE_ASSETS) {
    const file = `assets/${NAMESPACE}/${asset.path}`;
    await fs.mkdirp(file.slice(0, file.lastIndexOf('/')));
    await fs.writeFile(file, asset.bytes);
    namespace.assets.push({ path: asset.path, mediaType: 'image/png' });
  }
  project.namespaces.push(namespace);
  await saveProject(fs, project, registry);
  return fs;
}

const resolvePath = (path: string): string => join(sampleRoot, ...path.split('/'));
const readOnly = async (): Promise<never> => {
  throw new Error('The sample project is read-only in tests.');
};

/** A read-only file system over the fixture directory. */
const sampleFs: ProjectFileSystem = {
  readFile: async (path) => new Uint8Array(await readFile(resolvePath(path))),
  async readDir(path) {
    const entries = await readdir(resolvePath(path), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() || entry.isDirectory())
      .map(
        (entry): DirEntry => ({
          name: entry.name,
          kind: entry.isDirectory() ? 'directory' : 'file',
        }),
      );
  },
  async exists(path) {
    try {
      await stat(resolvePath(path));
      return true;
    } catch {
      return false;
    }
  },
  writeFile: readOnly,
  mkdirp: readOnly,
  remove: readOnly,
};

async function listFiles(root: string, prefix = ''): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(join(root, prefix), { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await listFiles(root, path)));
    else if (entry.isFile()) out.push(path);
  }
  return out.sort();
}

async function loadSample(): Promise<Project> {
  const { project, problems } = await loadProject(sampleFs, registry);
  expect(problems).toEqual([]);
  return project;
}

const elementsOf = (project: Project): Element[] =>
  project.namespaces.flatMap((namespace) => namespace.elements);

// Registries and checkers -------------------------------------------------------------------

/**
 * The project's own ids per registry. A block's item shares the block's id, so block ids
 * (with a block item) are item ids too; the namespace's PNG assets are textures. The event
 * keys of the `sounds.json` element are `sound_event` ids, as the app's registry view of an
 * `msm:` kind has them (ADR 0057 D3; the sample names them only in `msm:` elements).
 */
function projectIds(project: Project): Record<string, string[]> {
  const ids: Record<string, string[]> = {};
  const add = (name: string, id: string): void => {
    ids[name] = [...(ids[name] ?? []), id];
  };
  for (const element of elementsOf(project)) {
    if (element.kind === 'minecraft:sounds') {
      for (const key of Object.keys(element.data as object))
        add('sound_event', `${NAMESPACE}:${key}`);
    }
    const name = registry.get(element.kind)?.registry;
    if (name === undefined) {
      if (element.kind.startsWith('minecraft:'))
        add(element.kind.slice('minecraft:'.length), element.id);
      continue;
    }
    add(name, element.id);
    if (element.kind === 'msm:block' && (element.data as { item?: Json }).item !== false) {
      add('item', element.id);
    }
    // A potion with `long` or `strong` also registers `long_<path>` and `strong_<path>`
    // (ADR 0063 D3), as the app's registry view declares them.
    if (element.kind === 'msm:potion') {
      const data = element.data as { long?: Json; strong?: Json };
      const [namespace, path] = element.id.split(':') as [string, string];
      if (data.long !== undefined) add('potion', `${namespace}:long_${path}`);
      if (data.strong !== undefined) add('potion', `${namespace}:strong_${path}`);
    }
  }
  for (const namespace of project.namespaces) {
    for (const asset of namespace.assets) {
      const match = /^textures\/(.+)\.png$/.exec(asset.path);
      if (match !== null) add('texture', `${namespace.name}:${match[1]}`);
    }
  }
  for (const [name, list] of Object.entries(ids)) ids[name] = [...new Set(list)].sort();
  return ids;
}

const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

interface TargetContext {
  schemaIndex: SchemaIndex;
  registries: RegistryIndex;
  mcfunction: McfunctionService;
  functionIds: Record<string, string[]>;
}

async function contextFor(bundle: TargetBundle, project: Project): Promise<TargetContext> {
  const read = (key: Parameters<typeof readVendoredJson>[1]) =>
    readVendoredJson(bundle, key, nodeReadFile);
  const [symbols, vanilla, commands, blocks] = await Promise.all([
    read('vanillaMcdocSymbols'),
    read('mcmetaRegistries'),
    read('mcmetaCommands'),
    read('mcmetaBlocks'),
  ]);
  const ids = projectIds(project);
  return {
    schemaIndex: createSchemaIndex(parseVanillaMcdocSymbols(symbols), {
      mcVersion: bundle.target.mcVersion,
    }),
    registries: createRegistryIndex({
      vanilla: vanilla as Record<string, string[]>,
      project: ids,
    }),
    mcfunction: await createMcfunctionService(
      { commands, blocks, registries: vanilla as Record<string, string[]> },
      { mcVersion: bundle.target.mcVersion },
    ),
    functionIds: {
      function: ids.function ?? [],
      loot_table: ids.loot_table ?? [],
      'tag/function': ['minecraft:load', 'minecraft:tick'],
    },
  };
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** Runs `body` with `process.env.TZ` set to `zone`, restoring the previous value after. */
async function inTimeZone<T>(zone: string, body: () => Promise<T>): Promise<T> {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return await body();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

/** The `version` of the `fabric.mod.json` inside a mod jar. */
function jarModVersion(jar: Uint8Array): string {
  const files = unzipSync(jar, { filter: (file) => file.name === 'fabric.mod.json' });
  const modJson = files['fabric.mod.json'];
  if (modJson === undefined) throw new Error('The runtime jar has no fabric.mod.json');
  const version = (JSON.parse(utf8.decode(modJson)) as { version?: unknown }).version;
  if (typeof version !== 'string') throw new Error('The runtime fabric.mod.json has no version');
  return version;
}

// Tests -------------------------------------------------------------------------------------

describe('sample mod project', () => {
  it('equals SAMPLE_ELEMENTS and SAMPLE_ASSETS saved as a project', async () => {
    const generated = (await buildSample()).snapshot();
    if (update) {
      for (const path of await listFiles(sampleRoot)) {
        if (!HAND_WRITTEN.has(path)) await rm(join(sampleRoot, ...path.split('/')));
      }
      await rm(join(sampleRoot, 'content'), { recursive: true, force: true });
      await rm(join(sampleRoot, 'assets'), { recursive: true, force: true });
      for (const [path, bytes] of Object.entries(generated)) {
        const file = join(sampleRoot, ...path.split('/'));
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, bytes);
      }
    }
    const onDisk = (await listFiles(sampleRoot)).filter((path) => !HAND_WRITTEN.has(path));
    expect(onDisk).toEqual(Object.keys(generated).sort());
    for (const [path, bytes] of Object.entries(generated)) {
      const file = new Uint8Array(await readFile(join(sampleRoot, ...path.split('/'))));
      expect(Buffer.from(file).equals(Buffer.from(bytes)), path).toBe(true);
    }
  });

  it('loads with zero problems and covers every component and action', async () => {
    const project = await loadSample();
    expect(project.name).toBe(PROJECT_NAME);
    const text = JSON.stringify(elementsOf(project).map((element) => element.data));
    for (const component of [
      'msm:breakable',
      'msm:light_emitter',
      'msm:on_interact',
      'msm:on_step',
      'msm:redstone',
      'msm:food',
      'msm:tool',
      'msm:armor',
      'msm:durability',
      'msm:on_use',
      'msm:consumable',
      'msm:ranged_weapon',
      'msm:throwable',
      'msm:on_start',
      'msm:on_tick',
      'msm:on_end',
      'msm:shape',
      'msm:on_hit',
      'msm:on_use_on_block',
      'msm:while_held',
      'msm:while_worn',
      'msm:on_break',
      'msm:on_place',
      'msm:on_random_tick',
      'msm:on_entity_inside',
    ]) {
      expect(text.includes(`"${component}"`), component).toBe(true);
    }
    for (const action of [
      'play_sound',
      'spawn_particle',
      'run_function',
      'set_block_state',
      'give_item',
      'trigger_event',
      'apply_effect',
      'damage',
      'heal',
      'launch',
    ]) {
      expect(text.includes(`"type":"${action}"`), action).toBe(true);
    }
    const kinds = new Set(elementsOf(project).map((element) => element.kind));
    expect([...kinds].sort()).toEqual([
      'minecraft:equipment',
      'minecraft:function',
      'minecraft:loot_table',
      'minecraft:sounds',
      'minecraft:worldgen/feature',
      'minecraft:worldgen/placed_feature',
      'msm:biome_addition',
      'msm:block',
      'msm:effect',
      'msm:item',
      'msm:loot_addition',
      'msm:mod',
      'msm:potion',
    ]);
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'sample mod export (%s)',
  (_id, bundle) => {
    const { target } = bundle;
    let context: TargetContext;

    beforeAll(async () => {
      context = await contextFor(bundle, await loadSample());
    }, 120_000);

    async function exportJar(
      factory: FabricContentJarOptions = { loadRuntimeJar: async () => stubRuntimeJar },
      exportTarget: Target = target,
    ): Promise<Uint8Array> {
      const sink = createZipSink();
      const report = await runExport({
        project: await loadSample(),
        registry,
        target: exportTarget,
        schemaIndex: context.schemaIndex,
        registries: context.registries,
        exporter: createFabricContentJarExporter(factory),
        sink,
        readAsset: (namespace, path) => sampleFs.readFile(`assets/${namespace}/${path}`),
        meta,
        async validateText(file) {
          if (file.language !== 'mcfunction') return [];
          const source = utf8.decode(file.contents as Uint8Array).replace(/\n$/, '');
          const found = await context.mcfunction.check(source, {
            uri: `file:///msm/${file.path}`,
            projectIds: context.functionIds,
          });
          return found.map(
            (problem): Problem => ({
              severity: problem.severity,
              code: problem.code,
              message: `line ${problem.line + 1}: ${problem.message}`,
              file: file.path,
            }),
          );
        },
      });
      expect(report.problems.filter((problem) => problem.severity !== 'info')).toEqual([]);
      expect(report.ok).toBe(true);
      return sink.finish();
    }

    it('validates every element with zero problems', async () => {
      const problems: string[] = [];
      for (const element of elementsOf(await loadSample())) {
        const kind = registry.get(element.kind);
        if (kind === undefined) throw new Error(`unknown kind ${element.kind}`);
        const hidden = kind.hiddenPaths ?? [];
        const node = context.schemaIndex.resolveSchemaRef(kind.schema);
        for (const problem of validateJson(element.data, node, {
          registries: context.registries,
        })) {
          if (hidden.some((path) => problem.path === path || problem.path.startsWith(`${path}/`))) {
            continue;
          }
          problems.push(`${element.id} ${problem.path} ${problem.code}: ${problem.message}`);
        }
      }
      expect(problems).toEqual([]);
    });

    it('passes every project validator with no problems at all', async () => {
      const elements = elementsOf(await loadSample());
      const found = (
        await Promise.all(
          VALIDATORS.map((validator) =>
            validator.validate({ elements, target, registry: context.registries }),
          ),
        )
      ).flat();
      expect(found).toEqual([]);
    });

    it('holds the expected files, and every msm definition validates', async () => {
      const files = unzipSync(await exportJar());
      const paths = Object.keys(files).sort();
      const definitions = paths.filter((path) => path.startsWith('msm/'));
      expect(definitions).toEqual(
        [
          ...EXPECTED_BLOCKS.map(
            (entry) => `msm/${NAMESPACE}/block/${entry.id.split(':')[1]}.json`,
          ),
          ...SAMPLE_ELEMENTS.filter((entry) => entry.kind === 'msm:item').map(
            (entry) => `msm/${NAMESPACE}/item/${entry.id.split(':')[1]}.json`,
          ),
          ...SAMPLE_ELEMENTS.filter((entry) => entry.kind === 'msm:effect').map(
            (entry) => `msm/${NAMESPACE}/effect/${entry.id.split(':')[1]}.json`,
          ),
          ...POTIONS.map((path) => `msm/${NAMESPACE}/potion/${path}.json`),
          `msm/${NAMESPACE}/biome_addition/ruby_ore_generation.json`,
          `msm/${NAMESPACE}/loot_addition/zombie_drops_ruby.json`,
        ].sort(),
      );
      for (const path of [
        'fabric.mod.json',
        'msm.export.json',
        `data/${NAMESPACE}/${target.folders.data.function}/ruby/shimmer.mcfunction`,
        `data/${NAMESPACE}/${target.folders.data.loot_table}/blocks/ruby_ore_rich.json`,
        `data/${NAMESPACE}/${target.folders.data.loot_table}/blocks/chime_block.json`,
        `assets/${NAMESPACE}/${target.folders.resource.lang}/en_us.json`,
        `assets/${NAMESPACE}/equipment/ruby_armor.json`,
        `assets/${NAMESPACE}/${target.folders.resource.textures}/entity/equipment/humanoid/ruby.png`,
        `assets/${NAMESPACE}/${target.folders.resource.textures}/entity/equipment/humanoid_leggings/ruby.png`,
        `assets/${NAMESPACE}/${target.folders.resource.textures}/entity/equipment/horse_body/ruby.png`,
        `assets/${NAMESPACE}/${target.folders.resource.textures}/mob_effect/ruby_rush.png`,
        `assets/${NAMESPACE}/${target.folders.resource.textures}/mob_effect/ruby_sting.png`,
        `data/${NAMESPACE}/${target.folders.data.function}/ruby/rush.mcfunction`,
        `data/${NAMESPACE}/${target.folders.data.function}/ruby/spring.mcfunction`,
        `assets/${NAMESPACE}/sounds.json`,
        `data/${NAMESPACE}/worldgen/feature/ore_ruby.json`,
        `data/${NAMESPACE}/worldgen/placed_feature/ore_ruby_placed.json`,
      ]) {
        expect(paths, path).toContain(path);
      }
      expect(paths.filter((path) => path.startsWith('META-INF/jars/'))).toEqual([
        `META-INF/jars/msm_runtime-${meta.msmVersion}.jar`,
      ]);
      expect(paths).not.toContain('pack.mcmeta');

      const problems: string[] = [];
      for (const path of definitions) {
        const ref = path.includes('/block/')
          ? MSM_SCHEMA_REFS.blockDefinition
          : path.includes('/effect/')
            ? MSM_SCHEMA_REFS.effectDefinition
            : path.includes('/potion/')
              ? MSM_SCHEMA_REFS.potionDefinition
              : path.includes('/biome_addition/')
                ? MSM_SCHEMA_REFS.biomeAdditionDefinition
                : path.includes('/loot_addition/')
                  ? MSM_SCHEMA_REFS.lootAdditionDefinition
                  : MSM_SCHEMA_REFS.itemDefinition;
        const value = JSON.parse(utf8.decode(files[path] as Uint8Array)) as Json;
        for (const problem of validateJson(value, context.schemaIndex.resolveSchemaRef(ref), {
          registries: context.registries,
        })) {
          problems.push(`${path} ${problem.path} ${problem.code}: ${problem.message}`);
        }
      }
      expect(problems).toEqual([]);

      const modJson = JSON.parse(utf8.decode(files['fabric.mod.json'] as Uint8Array)) as {
        id: string;
        depends: Record<string, string>;
        jars: { file: string }[];
      };
      expect(modJson.id).toBe(NAMESPACE);
      expect(modJson.depends.msm_runtime).toBe(`>=${meta.msmVersion}`);
      expect(modJson.jars).toEqual([{ file: `META-INF/jars/msm_runtime-${meta.msmVersion}.jar` }]);

      const lang = JSON.parse(
        utf8.decode(
          files[`assets/${NAMESPACE}/${target.folders.resource.lang}/en_us.json`] as Uint8Array,
        ),
      ) as Record<string, string>;
      expect(lang[`effect.${NAMESPACE}.ruby_rush`]).toBe('Ruby Rush');
      expect(lang[`effect.${NAMESPACE}.ruby_sting`]).toBe('Ruby Sting');
      for (const bottle of ['potion', 'splash_potion', 'lingering_potion', 'tipped_arrow']) {
        expect(lang[`item.minecraft.${bottle}.effect.${NAMESPACE}.ruby_draught`], bottle).toMatch(
          /Ruby Rush$/,
        );
      }
      // The brewing chain is data: base, long and strong per bottle, gunpowder and dragon's
      // breath per registry entry (ADR 0063 D3).
      const brewing = paths.filter((path) =>
        path.startsWith(`data/${NAMESPACE}/${target.folders.data.recipe}/brewing/`),
      );
      expect(brewing).toHaveLength(15);
      const base = JSON.parse(
        utf8.decode(
          files[
            `data/${NAMESPACE}/${target.folders.data.recipe}/brewing/potion_ruby_draught.json`
          ] as Uint8Array,
        ),
      ) as { reagent: { item: string } };
      expect(base.reagent.item).toBe(`${NAMESPACE}:ruby`);
    });

    describe('content jar', () => {
      const hashFile = join(fixturesRoot, target.id, 'sample-mod-jar.sha256');
      const savedZone = process.env.TZ;
      afterAll(() => {
        expect(process.env.TZ).toBe(savedZone);
      });

      it('has the recorded SHA-256 in two time zones', async () => {
        const offsets: number[] = [];
        const hashes: string[] = [];
        for (const zone of TIME_ZONES) {
          await inTimeZone(zone, async () => {
            offsets.push(new Date(2000, 0, 1).getTimezoneOffset());
            hashes.push(sha256(await exportJar()));
          });
        }
        expect(new Set(offsets).size).toBe(TIME_ZONES.length);
        expect(new Set(hashes).size).toBe(1);
        const actual = hashes[0] as string;
        if (update) {
          await mkdir(dirname(hashFile), { recursive: true });
          await writeFile(hashFile, `${actual}\n`);
        }
        const expected = (await readFile(hashFile, 'utf8')).trim();
        expect(actual).toBe(expected);
      });
    });

    const runtimeJarPath = process.env.MSM_RUNTIME_JAR;
    const outDir = process.env.MSM_SAMPLE_MOD_OUT;
    const isSelectedTarget = bundle === selectedTarget();
    it.runIf(runtimeJarPath !== undefined && outDir !== undefined && isSelectedTarget)(
      'writes the jar with the real runtime for the headless server check',
      async () => {
        const runtimeJar = new Uint8Array(await readFile(runtimeJarPath as string));
        const runtimeVersion = jarModVersion(runtimeJar);
        const jar = await exportJar({ loadRuntimeJar: async () => runtimeJar, runtimeVersion });
        const fabric = target.fabric;
        if (fabric === undefined) throw new Error(`${target.id} has no Fabric facts`);
        await mkdir(outDir as string, { recursive: true });
        await writeFile(join(outDir as string, `${NAMESPACE}.jar`), jar);
        const facts = {
          expectBlocks: EXPECTED_BLOCKS.length,
          expectEntities: 0,
          expectItems: EXPECTED_ITEM_COUNT,
          fabricApi: fabric.api,
          java: target.java,
          loader: fabric.loader,
          minecraft: target.mcVersion,
          runtimeVersion,
        };
        await writeFile(
          join(outDir as string, 'fabric-facts.json'),
          `${JSON.stringify(facts, null, 2)}\n`,
        );
        expect(unzipSync(jar)[`META-INF/jars/msm_runtime-${runtimeVersion}.jar`]).toEqual(
          runtimeJar,
        );
      },
    );
  },
);
