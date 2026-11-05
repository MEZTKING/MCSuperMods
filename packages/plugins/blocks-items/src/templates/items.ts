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
];
