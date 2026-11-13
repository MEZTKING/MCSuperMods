/**
 * `msm:item` templates. They use vanilla models, sounds and particles only, and event ids
 * derived from the element's own id.
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { ITEM_KIND } from '../kinds';
import { displayName, ownEvent } from './shared';

const CATEGORY = 'Items';

export const itemTemplates: readonly ElementTemplate[] = [
  {
    id: 'msm_item_food',
    kind: ITEM_KIND,
    category: CATEGORY,
    title: 'Food item',
    description: 'Something to eat that restores hunger, shown with the bread model.',
    data: (context) => ({
      format: 1,
      model: 'minecraft:item/bread',
      display_name: displayName(context.path),
      max_stack_size: 64,
      creative_tab: 'minecraft:food_and_drinks',
      components: { 'msm:food': { nutrition: 5, saturation: 0.6 } },
    }),
  },
  {
    id: 'msm_item_tool',
    kind: ITEM_KIND,
    category: CATEGORY,
    title: 'Tool item',
    description: 'An iron-tier pickaxe with durability, shown with the iron pickaxe model.',
    data: (context) => ({
      format: 1,
      model: 'minecraft:item/iron_pickaxe',
      display_name: displayName(context.path),
      max_stack_size: 1,
      creative_tab: 'minecraft:tools_and_utilities',
      components: {
        'msm:tool': { type: 'pickaxe', tier: 'iron' },
        'msm:durability': { max: 250 },
      },
    }),
  },
  {
    id: 'msm_item_tool_custom_material',
    kind: ITEM_KIND,
    category: CATEGORY,
    title: 'Tool with a custom material',
    description:
      'A pickaxe of its own material: faster than iron, mines what iron mines and is repaired with iron ingots.',
    data: (context) => ({
      format: 1,
      model: 'minecraft:item/iron_pickaxe',
      display_name: displayName(context.path),
      max_stack_size: 1,
      creative_tab: 'minecraft:tools_and_utilities',
      components: {
        'msm:tool': {
          type: 'pickaxe',
          tier: {
            durability: 500,
            speed: 7,
            attack_damage_bonus: 2.5,
            enchantment_value: 14,
            incorrect_blocks_for_drops: '#minecraft:incorrect_for_iron_tool',
            repair_items: '#minecraft:iron_tool_materials',
          },
        },
      },
    }),
  },
  {
    id: 'msm_item_armor_helmet',
    kind: ITEM_KIND,
    category: CATEGORY,
    title: 'Armour piece (helmet)',
    description:
      'An iron helmet: armour points, durability and the worn look come from the iron material.',
    data: (context) => ({
      format: 1,
      model: 'minecraft:item/iron_helmet',
      display_name: displayName(context.path),
      max_stack_size: 1,
      creative_tab: 'minecraft:combat',
      components: { 'msm:armor': { slot: 'helmet', material: 'iron' } },
    }),
  },
  {
    id: 'msm_item_spear',
    kind: ITEM_KIND,
    category: CATEGORY,
    title: 'Spear',
    description:
      "An iron spear with vanilla's spear attacks; it joins the spears tag, so spear enchantments apply.",
    data: (context) => ({
      format: 1,
      model: 'minecraft:item/iron_spear',
      display_name: displayName(context.path),
      max_stack_size: 1,
      creative_tab: 'minecraft:combat',
      components: { 'msm:tool': { type: 'spear', tier: 'iron' } },
    }),
  },
  {
    id: 'msm_item_bow',
    kind: ITEM_KIND,
    category: CATEGORY,
    title: 'Bow',
    description:
      'A bow that draws faster and shoots harder-hitting vanilla arrows, shown with the bow model.',
    data: (context) => ({
      format: 1,
      model: 'minecraft:item/bow',
      display_name: displayName(context.path),
      max_stack_size: 1,
      creative_tab: 'minecraft:combat',
      components: {
        'msm:ranged_weapon': {
          type: 'bow',
          draw_speed: 1.25,
          velocity: 1.1,
          damage_multiplier: 1.2,
        },
        'msm:durability': { max: 450 },
      },
    }),
  },
  {
    id: 'msm_item_shield',
    kind: ITEM_KIND,
    category: CATEGORY,
    title: 'Shield',
    description:
      'Blocks attacks while raised, like a shield. The vanilla shield model draws nothing as a plain item model, so it shows the turtle scute until you add your own.',
    data: (context) => ({
      format: 1,
      model: 'minecraft:item/turtle_scute',
      display_name: displayName(context.path),
      max_stack_size: 1,
      creative_tab: 'minecraft:combat',
      components: {
        'msm:shield': { block_delay_seconds: 0.25, damage_reduction: 1 },
        'msm:durability': { max: 336 },
      },
    }),
  },
  {
    id: 'msm_item_drink',
    kind: ITEM_KIND,
    category: CATEGORY,
    title: 'Drink',
    description:
      'A potion-like drink that gives speed and regeneration and leaves a glass bottle, shown with the honey bottle model.',
    data: (context) => ({
      format: 1,
      model: 'minecraft:item/honey_bottle',
      display_name: displayName(context.path),
      max_stack_size: 16,
      creative_tab: 'minecraft:food_and_drinks',
      components: {
        'msm:consumable': {
          seconds: 1.6,
          animation: 'drink',
          sound: 'minecraft:item.honey_bottle.drink',
          converts_to: 'minecraft:glass_bottle',
          effects: [
            { effect: 'minecraft:speed', seconds: 60 },
            { effect: 'minecraft:regeneration', seconds: 10 },
          ],
        },
      },
    }),
  },
  {
    id: 'msm_item_totem',
    kind: ITEM_KIND,
    category: CATEGORY,
    title: 'Totem',
    description:
      'Saves its holder from death like a totem of undying and gives regeneration, absorption and fire resistance.',
    data: (context) => ({
      format: 1,
      model: 'minecraft:item/totem_of_undying',
      display_name: displayName(context.path),
      max_stack_size: 1,
      rarity: 'uncommon',
      creative_tab: 'minecraft:combat',
      components: {
        'msm:death_protection': {
          clear_effects: true,
          effects: [
            { effect: 'minecraft:regeneration', seconds: 45, amplifier: 1 },
            { effect: 'minecraft:absorption', seconds: 5, amplifier: 1 },
            { effect: 'minecraft:fire_resistance', seconds: 40 },
          ],
        },
      },
    }),
  },
  {
    id: 'msm_item_wand',
    kind: ITEM_KIND,
    category: CATEGORY,
    title: 'Magic wand',
    description: 'An item that plays a sound and spawns particles when used, once a second.',
    data: (context) => {
      const use = ownEvent(context, 'use');
      return {
        format: 1,
        model: 'minecraft:item/blaze_rod',
        display_name: displayName(context.path),
        max_stack_size: 1,
        rarity: 'uncommon',
        creative_tab: 'minecraft:tools_and_utilities',
        components: { 'msm:on_use': { event: use, cooldown_ticks: 20 } },
        events: {
          [use]: {
            actions: [
              { type: 'play_sound', sound: 'minecraft:block.amethyst_block.resonate' },
              { type: 'spawn_particle', particle: 'minecraft:end_rod', count: 8, spread: 0.3 },
            ],
          },
        },
      };
    },
  },
  {
    id: 'msm_item_throwable',
    kind: ITEM_KIND,
    category: CATEGORY,
    title: 'Throwable item',
    description:
      'Thrown like a snowball: it flies as its own picture, deals a heart of damage and slows the mob it hits.',
    data: (context) => {
      const hit = ownEvent(context, 'hit');
      return {
        format: 1,
        model: 'minecraft:item/snowball',
        display_name: displayName(context.path),
        max_stack_size: 16,
        creative_tab: 'minecraft:combat',
        components: {
          'msm:throwable': {
            speed: 1.5,
            damage: 2,
            after_throw: 'consume',
            sound: 'minecraft:entity.snowball.throw',
            on_hit_entity: { event: hit },
          },
        },
        events: {
          [hit]: {
            actions: [
              { type: 'apply_effect', effect: 'minecraft:slowness', seconds: 3, target: 'other' },
              { type: 'spawn_particle', particle: 'minecraft:snowflake', count: 6, spread: 0.3 },
            ],
          },
        },
      };
    },
  },
];
