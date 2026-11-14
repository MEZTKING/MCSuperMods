/**
 * Phase 4 examples (ADR 0025): one per-kind example each for `msm:block`, `msm:item`,
 * `msm:effect` (ADR 0055: the Frost bomb, a throwable that gives a custom slowing effect) and
 * `msm:mod`, plus behaviour examples (a tool with its recipe, and an event chain that runs a
 * function). Additions to vanilla content (ADR 0060): the per-kind examples of
 * `msm:biome_addition` (Ore that generates) and `msm:loot_addition` (Zombie drops a ruby), and
 * the behaviour examples Fuel log (a block item that burns), Life-steal sword (`msm:on_hit`)
 * and Night-vision helmet (`msm:while_worn`, ADR 0061), and the block family examples of
 * `block-types.ts` (ADR 0069 D4). New blocks and items need the Fabric
 * mod jar export; the vanilla pack exports carry only their models, textures, language keys,
 * loot tables and tags.
 */
import type { ExampleProject } from '@msm/plugin-api';
import { COLOURS, element, KINDS, modIdFromNamespace, rl, texture } from '../content/bundle';
import { colourInt, effectIconAsset } from '../content/effects';
import { blockTypeExamples } from './block-types';
import { defineExample } from './define';

/** The gallery category of the additions to vanilla content. */
const ADDITIONS = 'Additions';

/** The gallery category of the potion examples (ADR 0063 D10). */
const POTIONS = 'Potions';

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
    id: 'example_msm_potion',
    title: 'Potion of the custom effect',
    description:
      'A custom Featherweight effect and its potion, brewed from an awkward potion and a feather, with a longer version and splash and lingering bottles.',
    kind: KINDS.potion,
    category: POTIONS,
    tags: ['potion', 'brewing', 'status effect', 'tipped arrow', 'mod'],
    build: ({ namespace }) => {
      const potion = rl(namespace, 'featherweight');
      const effect = rl(namespace, 'featherweight_effect');
      return {
        elements: [
          element(
            effect,
            KINDS.effect,
            {
              format: 1,
              display_name: 'Featherweight',
              category: 'beneficial',
              color: colourInt(COLOURS.frost),
              attribute_modifiers: [
                {
                  attribute: 'minecraft:gravity',
                  amount: -0.4,
                  operation: 'add_multiplied_base',
                },
                {
                  attribute: 'minecraft:jump_strength',
                  amount: 0.2,
                  operation: 'add_multiplied_base',
                },
              ],
            },
            `The effect the potion gives: 40 per cent less gravity and 20 per cent higher jumps per level. Its icon is textures/mob_effect/featherweight_effect.png. Element ids are shared across kinds, so the effect is ${effect} and the potion ${potion}.`,
          ),
          element(
            potion,
            KINDS.potion,
            {
              format: 1,
              display_name: 'Featherweight',
              effects: [{ id: effect, duration_ticks: 3600 }],
              brewing: { reagent: 'minecraft:feather' },
              long: { duration_ticks: 9600 },
            },
            `A potion is a list of effects with their durations in ticks: here Featherweight for 3 minutes. brewing adds it to the brewing stand: an awkward potion (the default base) and a feather make it. long adds ${namespace}:long_featherweight, 8 minutes, brewed with redstone; strong would add a stronger level brewed with glowstone dust. Splash and lingering bottles (gunpowder, then dragon's breath) and tipped arrows come with it, and display_name names all four "Potion of Featherweight" and so on. Its colour comes from the effect. Potions need the Fabric mod jar export.`,
          ),
        ],
        assets: [effectIconAsset(namespace, 'featherweight_effect', COLOURS.frost)],
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
  defineExample({
    id: 'example_msm_biome_addition',
    title: 'Ore that generates',
    description:
      'Jade ore that generates underground in every overworld biome: the ore block, its ore feature, the placed feature and the world addition that adds it to vanilla biomes.',
    kind: KINDS.biomeAddition,
    category: ADDITIONS,
    tags: ['ore', 'world generation', 'biome_addition', 'mod'],
    build: ({ namespace }) => {
      const ore = rl(namespace, 'jade_ore');
      const oreModel = rl(namespace, 'block/jade_ore');
      const feature = rl(namespace, 'ore_jade');
      const placed = rl(namespace, 'ore_jade_placed');
      const generation = rl(namespace, 'jade_ore_generation');
      const replace = (block: string) => ({
        target: { predicate_type: 'minecraft:block_match', block },
        state: ore,
      });
      return {
        elements: [
          element(
            generation,
            KINDS.biomeAddition,
            {
              format: 1,
              biomes: ['#minecraft:is_overworld'],
              features: [{ feature: placed, step: 'underground_ores' }],
            },
            `A world addition: it adds the placed feature ${placed} to every biome in the tag #minecraft:is_overworld, without replacing any vanilla biome file. step says when the feature runs; underground_ores is where vanilla ores generate. Only chunks generated after the mod is installed get the ore, so try it in a new world. World additions need the Fabric mod jar export.`,
          ),
          element(
            ore,
            KINDS.block,
            {
              format: 1,
              model: oreModel,
              display_name: 'Jade Ore',
              sound_type: 'stone',
              loot: 'self',
              item: { creative_tab: 'minecraft:natural_blocks' },
              components: {
                'msm:breakable': { hardness: 3, resistance: 3, tool: 'pickaxe', min_tier: 'stone' },
              },
            },
            'The ore block the feature places. It needs a stone pickaxe or better and drops itself.',
          ),
          element(
            oreModel,
            KINDS.model,
            { parent: 'minecraft:block/cube_all', textures: { all: oreModel } },
            'A full cube drawn from textures/block/jade_ore.png.',
          ),
          element(
            feature,
            KINDS.feature,
            {
              type: 'minecraft:ore',
              size: 8,
              discard_chance_on_air_exposure: 0,
              targets: [replace('minecraft:stone'), replace('minecraft:deepslate')],
            },
            'One vein of up to eight jade ore blocks that replaces stone and deepslate.',
          ),
          element(
            placed,
            KINDS.placedFeature,
            {
              feature,
              placement: [
                { type: 'minecraft:count', count: 8 },
                { type: 'minecraft:in_square' },
                {
                  type: 'minecraft:height_range',
                  height: {
                    type: 'minecraft:uniform',
                    min_inclusive: { absolute: -32 },
                    max_inclusive: { absolute: 48 },
                  },
                },
                { type: 'minecraft:biome' },
              ],
            },
            'Eight veins per chunk at random spots from y -32 to y 48. The biome filter keeps them to the biomes that list the feature, here through the world addition.',
          ),
        ],
        assets: [texture(namespace, 'block/jade_ore', 'ore', COLOURS.jade)],
      };
    },
  }),
  defineExample({
    id: 'example_msm_loot_addition',
    title: 'Zombie drops a ruby',
    description:
      'Zombies killed by a player sometimes drop a ruby, on top of their usual drops: a ruby item and the extra drop that adds it to the vanilla zombie loot table.',
    kind: KINDS.lootAddition,
    category: ADDITIONS,
    tags: ['loot', 'extra drop', 'zombie', 'loot_addition', 'mod'],
    build: ({ namespace }) => {
      const ruby = rl(namespace, 'ruby_gem');
      const rubyModel = rl(namespace, 'item/ruby_gem');
      return {
        elements: [
          element(
            rl(namespace, 'zombie_drops_ruby'),
            KINDS.lootAddition,
            {
              format: 1,
              tables: ['minecraft:entities/zombie'],
              pools: [
                {
                  rolls: 1,
                  entries: [{ type: 'minecraft:item', name: ruby }],
                  condition: {
                    type: 'minecraft:all_of',
                    terms: [
                      { type: 'minecraft:killed_by_player' },
                      { type: 'minecraft:random_chance', chance: 0.2 },
                    ],
                  },
                },
              ],
            },
            `An extra drop: it adds a pool to the vanilla zombie loot table, which keeps its own pools. The pool rolls once and drops one ${ruby}. Its condition uses minecraft:all_of, so both terms must hold: a player made the kill, and a one in five chance. A world data pack that replaces the zombie table wins over the extra drop. Extra drops need the Fabric mod jar export.`,
          ),
          element(
            ruby,
            KINDS.item,
            {
              format: 1,
              model: rubyModel,
              display_name: 'Ruby',
              max_stack_size: 64,
              creative_tab: 'minecraft:ingredients',
            },
            'The item the zombie drops: a plain gem with its own model.',
          ),
          element(
            rubyModel,
            KINDS.model,
            { parent: 'minecraft:item/generated', textures: { layer0: rubyModel } },
            'A flat item model drawn from textures/item/ruby_gem.png.',
          ),
        ],
        assets: [texture(namespace, 'item/ruby_gem', 'gem', COLOURS.ruby)],
      };
    },
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
  defineExample({
    id: 'example_msm_fuel_log',
    title: 'Fuel log',
    description:
      'A dense log block whose item burns in a furnace three times as long as an oak log.',
    kind: KINDS.block,
    category: 'Blocks',
    tags: ['fuel', 'furnace', 'block item', 'mod'],
    build: ({ namespace }) => ({
      elements: [
        element(
          rl(namespace, 'dense_log'),
          KINDS.block,
          {
            format: 1,
            model: 'minecraft:block/stripped_dark_oak_log',
            display_name: 'Dense Log',
            sound_type: 'wood',
            loot: 'self',
            item: { creative_tab: 'minecraft:building_blocks', fuel: { burn_seconds: 45 } },
            components: { 'msm:breakable': { hardness: 2, resistance: 2, tool: 'axe' } },
          },
          'A block whose item is a furnace fuel. fuel on the block item gives the burn time in seconds: 45, three times an oak log, so one log smelts 22 items. It is lowered to the vanilla minecraft:cooking_fuel component, so no code is needed, but new blocks still need the Fabric mod jar export. It reuses the vanilla stripped dark oak log model.',
        ),
      ],
      assets: [],
    }),
  }),
  defineExample({
    id: 'example_msm_life_steal_sword',
    title: 'Life-steal sword',
    description: 'An iron sword that heals you by one heart each time it hits a mob.',
    kind: KINDS.item,
    category: 'Items',
    tags: ['on_hit', 'heal', 'trigger', 'mod'],
    build: ({ namespace }) => {
      const sword = rl(namespace, 'life_steal_sword');
      const hit = rl(namespace, 'life_steal_sword_hit');
      return {
        elements: [
          element(
            sword,
            KINDS.item,
            {
              format: 1,
              model: 'minecraft:item/iron_sword',
              display_name: 'Life-steal Sword',
              max_stack_size: 1,
              rarity: 'rare',
              creative_tab: 'minecraft:combat',
              components: {
                'msm:tool': { type: 'sword', tier: 'iron' },
                'msm:on_hit': { event: hit },
              },
              events: {
                [hit]: {
                  actions: [
                    { type: 'heal', amount: 2 },
                    { type: 'spawn_particle', particle: 'minecraft:heart', count: 2, spread: 0.4 },
                  ],
                },
              },
            },
            `An item trigger. msm:on_hit fires ${hit} each time the sword hits a living entity, whoever holds it: a player or a mob. heal acts on self, the attacker, and gives back one heart (2 half hearts); hearts show above it. msm:tool makes it an iron sword. It reuses the vanilla iron sword model.`,
          ),
        ],
        assets: [],
      };
    },
  }),
  defineExample({
    id: 'example_msm_night_vision_helmet',
    title: 'Night-vision helmet',
    description: 'An iron helmet that gives night vision while you wear it.',
    kind: KINDS.item,
    category: 'Items',
    tags: ['while_worn', 'armour', 'apply_effect', 'trigger', 'mod'],
    build: ({ namespace }) => {
      const helmet = rl(namespace, 'night_vision_helmet');
      const worn = rl(namespace, 'night_vision_helmet_worn');
      return {
        elements: [
          element(
            helmet,
            KINDS.item,
            {
              format: 1,
              model: 'minecraft:item/iron_helmet',
              display_name: 'Night-vision Helmet',
              max_stack_size: 1,
              creative_tab: 'minecraft:combat',
              components: {
                'msm:armor': { slot: 'helmet', material: 'iron' },
                'msm:while_worn': { event: worn, interval_ticks: 100 },
              },
              events: {
                [worn]: {
                  actions: [
                    {
                      type: 'apply_effect',
                      effect: 'minecraft:night_vision',
                      seconds: 20,
                      target: 'self',
                    },
                  ],
                },
              },
            },
            `An item trigger. msm:while_worn fires ${worn} every 100 ticks (five seconds) while the helmet is in the head slot, and only there: it needs msm:armor. The event gives the wearer 20 seconds of night vision, so the effect never runs low enough to flicker and ends shortly after the helmet comes off. msm:armor makes it an iron helmet. It reuses the vanilla iron helmet model.`,
          ),
        ],
        assets: [],
      };
    },
  }),
  defineExample({
    id: 'example_msm_brewed_with_own_item',
    title: 'Brewed with your own item',
    description:
      'A Moon Shard item of your own as a brewing ingredient: an awkward potion and a moon shard brew a Potion of Levitation, which vanilla does not have, with a stronger version.',
    kind: KINDS.potion,
    category: POTIONS,
    tags: ['potion', 'brewing', 'item', 'levitation', 'mod'],
    build: ({ namespace }) => {
      const shard = rl(namespace, 'moon_shard');
      const shardModel = rl(namespace, 'item/moon_shard');
      const potion = rl(namespace, 'levitation');
      return {
        elements: [
          element(
            shard,
            KINDS.item,
            {
              format: 1,
              model: shardModel,
              display_name: 'Moon Shard',
              creative_tab: 'minecraft:ingredients',
            },
            'A plain item of the project, used as the brewing ingredient. Add a recipe or a loot table to get it in survival; in creative it is in the Ingredients tab.',
          ),
          element(
            shardModel,
            KINDS.model,
            { parent: 'minecraft:item/generated', textures: { layer0: shardModel } },
            'A flat item model drawn from textures/item/moon_shard.png.',
          ),
          element(
            potion,
            KINDS.potion,
            {
              format: 1,
              display_name: 'Levitation',
              effects: [{ id: 'minecraft:levitation', duration_ticks: 200 }],
              brewing: { reagent: shard },
              strong: { amplifier: 1, duration_ticks: 100 },
              lingering: false,
            },
            `A potion of a vanilla effect that has no vanilla potion: Levitation for 10 seconds. brewing.reagent names the project item ${shard}, so an awkward potion and a moon shard brew it; strong adds ${namespace}:strong_levitation (Levitation II for 5 seconds, brewed with glowstone dust). lingering false leaves out the lingering bottle, and with it the tipped arrows; the splash bottle stays. Potions and items need the Fabric mod jar export.`,
          ),
        ],
        assets: [texture(namespace, 'item/moon_shard', 'gem', COLOURS.violet)],
      };
    },
  }),
  // Block family examples (ADR 0069 D4): a wood set, a stone set, a crop, a tree, a facing block
  // and an iron-like door.
  ...blockTypeExamples,
];
