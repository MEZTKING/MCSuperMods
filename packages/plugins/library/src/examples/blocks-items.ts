/**
 * Phase 4 examples (ADR 0025): one per-kind example each for `msm:block`, `msm:item`,
 * `msm:effect` (ADR 0055: the Frost bomb, a throwable that gives a custom slowing effect) and
 * `msm:mod`, plus behaviour examples (a tool with its recipe, and an event chain that runs a
 * function). New blocks and items need the Fabric mod jar export; the vanilla pack exports
 * carry only their models, textures, language keys, loot tables and tags.
 */
import type { ExampleProject } from '@msm/plugin-api';
import { COLOURS, element, KINDS, modIdFromNamespace, rl, texture } from '../content/bundle';
import { colourInt, effectIconAsset } from '../content/effects';
import { defineExample } from './define';

/** The per-kind examples of the blocks and items plugin, in kind order. */
export const blocksItemsExamples: readonly ExampleProject[] = [
  defineExample({
    id: 'example_msm_block',
    title: 'Switch lamp',
    description:
      'A custom block that lights up when used or powered by redstone, by swapping itself for a lit twin.',
    kind: KINDS.block,
    category: 'Blocks',
    tags: ['on_interact', 'redstone', 'set_block_state', 'light', 'mod'],
    build: ({ namespace }) => {
      const lamp = rl(namespace, 'lamp');
      const lit = rl(namespace, 'lamp_lit');
      const lampModel = rl(namespace, 'block/lamp');
      const litModel = rl(namespace, 'block/lamp_lit');
      const litLoot = rl(namespace, 'blocks/lamp_lit');
      const turnOn = rl(namespace, 'lamp_turn_on');
      const turnOff = rl(namespace, 'lamp_turn_off');
      return {
        elements: [
          element(
            lamp,
            KINDS.block,
            {
              format: 1,
              model: lampModel,
              display_name: 'Switch Lamp',
              sound_type: 'glass',
              loot: 'self',
              item: { creative_tab: 'minecraft:redstone_blocks' },
              components: {
                'msm:breakable': { hardness: 0.3, resistance: 0.3 },
                'msm:on_interact': { event: turnOn },
                'msm:redstone': { on_powered: turnOn },
              },
              events: {
                [turnOn]: {
                  actions: [
                    { type: 'play_sound', sound: 'minecraft:block.lever.click', pitch: 1.2 },
                    { type: 'set_block_state', state: lit },
                  ],
                },
              },
            },
            `A custom block with behaviour. Using it (msm:on_interact) or powering it with redstone (on_powered of msm:redstone) fires the event ${turnOn}. The event's actions run in order: a click, then set_block_state replaces the lamp with the lit lamp. An action cannot change a block's own properties, so a second block stands for the lit state. Export the Fabric mod jar to try it in game.`,
          ),
          element(
            lit,
            KINDS.block,
            {
              format: 1,
              model: litModel,
              display_name: 'Lit Switch Lamp',
              sound_type: 'glass',
              loot: litLoot,
              item: false,
              components: {
                'msm:breakable': { hardness: 0.3, resistance: 0.3 },
                'msm:light_emitter': { level: 15 },
                'msm:on_interact': { event: turnOff },
                'msm:redstone': { on_unpowered: turnOff },
              },
              events: {
                [turnOff]: {
                  actions: [
                    { type: 'play_sound', sound: 'minecraft:block.lever.click', pitch: 0.8 },
                    { type: 'set_block_state', state: lamp },
                  ],
                },
              },
            },
            'The lit twin: full light, no block item ("item": false) and a loot table that drops the unlit lamp. Using it, or taking its redstone power away, swaps it back. A lamp lit by hand stays lit until used again.',
          ),
          element(
            litLoot,
            KINDS.lootTable,
            {
              type: 'minecraft:block',
              pools: [
                {
                  rolls: 1,
                  condition: { type: 'minecraft:survives_explosion' },
                  entries: [{ type: 'minecraft:item', name: lamp }],
                },
              ],
            },
            'The lit lamp has no item of its own, so breaking it drops the unlit lamp.',
          ),
          element(
            lampModel,
            KINDS.model,
            { parent: 'minecraft:block/cube_all', textures: { all: lampModel } },
            'The unlit lamp: a full cube drawn from textures/block/lamp.png.',
          ),
          element(
            litModel,
            KINDS.model,
            { parent: 'minecraft:block/cube_all', textures: { all: litModel } },
            'The lit lamp: a full cube drawn from textures/block/lamp_lit.png.',
          ),
        ],
        assets: [
          texture(namespace, 'block/lamp', 'plain', COLOURS.slate),
          texture(namespace, 'block/lamp_lit', 'plain', COLOURS.amber),
        ],
      };
    },
  }),
  defineExample({
    id: 'example_msm_item',
    title: 'Sparkle berries',
    description: 'A custom food item that sparkles and chimes when you start eating it.',
    kind: KINDS.item,
    category: 'Items',
    tags: ['food', 'on_use', 'spawn_particle', 'mod'],
    build: ({ namespace }) => {
      const berries = rl(namespace, 'sparkle_berries');
      const sparkle = rl(namespace, 'sparkle_berries_sparkle');
      return {
        elements: [
          element(
            berries,
            KINDS.item,
            {
              format: 1,
              model: 'minecraft:item/glow_berries',
              display_name: 'Sparkle Berries',
              max_stack_size: 64,
              rarity: 'uncommon',
              creative_tab: 'minecraft:food_and_drinks',
              components: {
                'msm:food': { nutrition: 2, saturation: 0.3, can_always_eat: true },
                'msm:on_use': { event: sparkle, cooldown_ticks: 10 },
              },
              events: {
                [sparkle]: {
                  actions: [
                    { type: 'spawn_particle', particle: 'minecraft:glow', count: 10, spread: 0.5 },
                    {
                      type: 'play_sound',
                      sound: 'minecraft:block.amethyst_block.chime',
                      pitch: 1.5,
                    },
                  ],
                },
              },
            },
            `A custom item. msm:food makes it edible: nutrition is hunger restored, saturation how long that lasts, and can_always_eat allows eating on a full stomach. msm:on_use fires ${sparkle} when the player uses the item, and eating then starts as usual. cooldown_ticks greys the item out for half a second after each use. It reuses the vanilla glow berries model, so it needs no texture.`,
          ),
        ],
        assets: [],
      };
    },
  }),
  defineExample({
    id: 'example_msm_effect',
    title: 'Frost bomb',
    description:
      'A custom Frostbite effect that slows and chills its holder, and a throwable Frost Bomb that gives it to the mob it hits.',
    kind: KINDS.effect,
    category: 'Effects',
    tags: ['status effect', 'throwable', 'on_tick', 'apply_effect', 'mod'],
    build: ({ namespace }) => {
      const frostbite = rl(namespace, 'frostbite');
      const chill = rl(namespace, 'frostbite_chill');
      const bomb = rl(namespace, 'frost_bomb');
      const hit = rl(namespace, 'frost_bomb_hit');
      const shatter = rl(namespace, 'frost_bomb_shatter');
      const bombModel = rl(namespace, 'item/frost_bomb');
      const burst = {
        type: 'spawn_particle',
        particle: 'minecraft:snowflake',
        count: 12,
        spread: 0.5,
      };
      const glass = { type: 'play_sound', sound: 'minecraft:block.glass.break', pitch: 1.4 };
      return {
        elements: [
          element(
            frostbite,
            KINDS.effect,
            {
              format: 1,
              display_name: 'Frostbite',
              category: 'harmful',
              color: colourInt(COLOURS.sapphire),
              attribute_modifiers: [
                {
                  attribute: 'minecraft:movement_speed',
                  amount: -0.15,
                  operation: 'add_multiplied_total',
                },
              ],
              components: {
                'msm:on_tick': { event: chill, interval_ticks: 40, faster_per_level: true },
              },
              events: {
                [chill]: {
                  actions: [
                    { type: 'damage', amount: 1 },
                    {
                      type: 'spawn_particle',
                      particle: 'minecraft:snowflake',
                      count: 4,
                      spread: 0.3,
                    },
                  ],
                },
              },
            },
            `A custom status effect. category harmful shows its name in red and lets milk clear it; color tints its swirling particles. attribute_modifiers makes the holder 15 per cent slower per level, and the change goes when the effect ends. msm:on_tick fires ${chill} every 40 ticks (faster at higher levels), which hurts the holder by half a heart of magic damage and shows snowflakes. Its icon is textures/mob_effect/frostbite.png. Custom effects need the Fabric mod jar export.`,
          ),
          element(
            bomb,
            KINDS.item,
            {
              format: 1,
              model: bombModel,
              display_name: 'Frost Bomb',
              max_stack_size: 16,
              creative_tab: 'minecraft:combat',
              components: {
                'msm:throwable': {
                  speed: 1.2,
                  gravity: 0.05,
                  damage: 1,
                  after_throw: 'consume',
                  sound: 'minecraft:entity.snowball.throw',
                  on_hit_entity: { event: hit },
                  on_hit_block: { event: shatter },
                },
              },
              events: {
                [hit]: {
                  actions: [
                    {
                      type: 'apply_effect',
                      effect: frostbite,
                      seconds: 8,
                      amplifier: 1,
                      target: 'other',
                    },
                    glass,
                    burst,
                  ],
                },
                [shatter]: { actions: [glass, burst] },
              },
            },
            `A throwable item. msm:throwable throws it on use, a little slower and heavier than a snowball, and each throw uses one (after_throw consume). Hitting a mob deals half a heart and fires ${hit}, whose apply_effect gives the mob hit (target other) Frostbite II for 8 seconds; hitting a block fires ${shatter}. In flight it is drawn as its item picture.`,
          ),
          element(
            bombModel,
            KINDS.model,
            { parent: 'minecraft:item/generated', textures: { layer0: bombModel } },
            'A flat item model drawn from textures/item/frost_bomb.png.',
          ),
        ],
        assets: [
          effectIconAsset(namespace, 'frostbite', COLOURS.sapphire),
          texture(namespace, 'item/frost_bomb', 'ball', COLOURS.sapphire),
        ],
      };
    },
  }),
  defineExample({
    id: 'example_msm_mod',
    title: 'Mod metadata',
    description: 'The name, version, authors and licence of the Fabric mod jar.',
    kind: KINDS.mod,
    category: 'Mod',
    tags: ['fabric.mod.json', 'mod'],
    build: ({ namespace, projectName }) => ({
      elements: [
        element(
          rl(namespace, 'mod'),
          KINDS.mod,
          {
            mod_id: modIdFromNamespace(namespace),
            version: '0.1.0',
            name: projectName,
            description: 'Blocks and items made with MCSuperMods.',
            authors: ['Your name'],
            licence: 'MIT',
          },
          'One per project: it becomes fabric.mod.json in the Fabric mod jar. mod_id names the mod to Fabric and must be unique among installed mods: a lower-case letter, then letters, digits, _ or -. version is shown in the mod list; raise it with each release. Without this element the jar gets a mod id derived from the project name.',
        ),
      ],
      assets: [],
    }),
  }),
];

/** Behaviour examples of blocks and items beyond the one per kind, in gallery order. */
export const behaviourExamples: readonly ExampleProject[] = [
  defineExample({
    id: 'example_msm_tool',
    title: 'Sturdy pickaxe',
    description: 'A custom iron-tier pickaxe with extra durability and a crafting recipe.',
    kind: KINDS.item,
    category: 'Items',
    tags: ['tool', 'durability', 'recipe', 'mod'],
    build: ({ namespace }) => {
      const pickaxe = rl(namespace, 'sturdy_pickaxe');
      return {
        elements: [
          element(
            pickaxe,
            KINDS.item,
            {
              format: 1,
              model: 'minecraft:item/iron_pickaxe',
              display_name: 'Sturdy Pickaxe',
              max_stack_size: 1,
              rarity: 'uncommon',
              creative_tab: 'minecraft:tools_and_utilities',
              components: {
                'msm:tool': { type: 'pickaxe', tier: 'iron' },
                'msm:durability': { max: 750 },
              },
            },
            'msm:tool makes the item a pickaxe of the iron tier: it mines what an iron pickaxe mines, as fast. msm:durability overrides the tier durability (250 for iron) with 750 uses. Tools never stack, so max_stack_size is 1. It reuses the vanilla iron pickaxe model.',
          ),
          element(
            rl(namespace, 'craft_sturdy_pickaxe'),
            KINDS.recipe,
            {
              type: 'minecraft:crafting_shaped',
              category: 'equipment',
              pattern: ['III', ' S ', ' S '],
              key: { I: 'minecraft:iron_block', S: 'minecraft:stick' },
              result: { id: pickaxe, count: 1 },
            },
            'Three iron blocks on two sticks craft the pickaxe. A recipe can name a project item as its result like any vanilla item.',
          ),
        ],
        assets: [],
      };
    },
  }),
  defineExample({
    id: 'example_msm_event_chain',
    title: 'Beacon stone',
    description:
      'A block whose use event triggers a second event that spawns particles and runs a function.',
    kind: KINDS.block,
    category: 'Blocks',
    tags: ['trigger_event', 'run_function', 'events', 'mod'],
    build: ({ namespace }) => {
      const stone = rl(namespace, 'beacon_stone');
      const activate = rl(namespace, 'beacon_stone_activate');
      const flare = rl(namespace, 'beacon_stone_flare');
      const fn = rl(namespace, 'beacon_stone/flare');
      return {
        elements: [
          element(
            stone,
            KINDS.block,
            {
              format: 1,
              model: 'minecraft:block/lodestone',
              display_name: 'Beacon Stone',
              sound_type: 'stone',
              loot: 'self',
              item: { creative_tab: 'minecraft:functional_blocks' },
              components: {
                'msm:breakable': { hardness: 2, resistance: 6, tool: 'pickaxe' },
                'msm:light_emitter': { level: 5 },
                'msm:on_interact': { event: activate },
              },
              events: {
                [activate]: {
                  actions: [
                    { type: 'play_sound', sound: 'minecraft:block.beacon.activate' },
                    { type: 'trigger_event', event: flare },
                  ],
                },
                [flare]: {
                  actions: [
                    {
                      type: 'spawn_particle',
                      particle: 'minecraft:end_rod',
                      count: 20,
                      spread: 0.5,
                      speed: 0.05,
                    },
                    { type: 'run_function', function: fn },
                  ],
                },
              },
            },
            `An event chain. Using the block fires ${activate}, which plays a sound and then triggers ${flare} with trigger_event. That event spawns particles and runs the function ${fn} as the player. Chains may nest up to 16 events deep, and an event that triggers itself is reported as a cycle. It reuses the vanilla lodestone model.`,
          ),
          element(
            fn,
            KINDS.function,
            {
              lines: [
                'effect give @s minecraft:night_vision 30 0 true',
                'effect give @s minecraft:speed 30 0 true',
              ],
            },
            'The function the flare event runs. It runs as the player who used the block, at the block, so @s is that player.',
          ),
        ],
        assets: [],
      };
    },
  }),
];
