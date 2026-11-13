/**
 * `msm:block` templates. They use vanilla models, sounds and particles only, and event ids
 * derived from the element's own id.
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { BLOCK_KIND } from '../kinds';
import { displayName, ownEvent } from './shared';

const CATEGORY = 'Blocks';

export const blockTemplates: readonly ElementTemplate[] = [
  {
    id: 'msm_block_simple',
    kind: BLOCK_KIND,
    category: CATEGORY,
    title: 'Simple block',
    description: 'A stone-like building block that drops itself and is mined with a pickaxe.',
    data: (context) => ({
      format: 1,
      model: 'minecraft:block/stone',
      display_name: displayName(context.path),
      sound_type: 'stone',
      loot: 'self',
      item: { creative_tab: 'minecraft:building_blocks' },
      components: { 'msm:breakable': { hardness: 1.5, resistance: 6, tool: 'pickaxe' } },
    }),
  },
  {
    id: 'msm_block_glowing_ore',
    kind: BLOCK_KIND,
    category: CATEGORY,
    title: 'Glowing ore',
    description:
      'An ore that gives off light and drops itself only when mined with an iron pickaxe or better.',
    data: (context) => ({
      format: 1,
      model: 'minecraft:block/emerald_ore',
      display_name: displayName(context.path),
      sound_type: 'stone',
      loot: 'self',
      item: { creative_tab: 'minecraft:natural_blocks' },
      components: {
        'msm:breakable': { hardness: 3, resistance: 3, tool: 'pickaxe', min_tier: 'iron' },
        'msm:light_emitter': { level: 7 },
      },
    }),
  },
  {
    id: 'msm_block_interactive',
    kind: BLOCK_KIND,
    category: CATEGORY,
    title: 'Interactive block',
    description:
      'A block that chimes when used and sparkles when stepped on, with one event triggering another.',
    data: (context) => {
      const use = ownEvent(context, 'use');
      const sparkle = ownEvent(context, 'sparkle');
      return {
        format: 1,
        model: 'minecraft:block/amethyst_block',
        display_name: displayName(context.path),
        sound_type: 'amethyst',
        loot: 'self',
        item: { creative_tab: 'minecraft:functional_blocks' },
        components: {
          'msm:breakable': { hardness: 1.5, resistance: 1.5, tool: 'pickaxe' },
          'msm:light_emitter': { level: 4 },
          'msm:on_interact': { event: use },
          'msm:on_step': { event: sparkle, cooldown_ticks: 20 },
        },
        events: {
          [use]: {
            actions: [
              { type: 'play_sound', sound: 'minecraft:block.amethyst_block.chime', volume: 1 },
              { type: 'trigger_event', event: sparkle },
            ],
          },
          [sparkle]: {
            actions: [
              { type: 'spawn_particle', particle: 'minecraft:glow', count: 12, spread: 0.4 },
            ],
          },
        },
      };
    },
  },
  {
    id: 'msm_block_half',
    kind: BLOCK_KIND,
    category: CATEGORY,
    title: 'Half block',
    description:
      'A fixed bottom half block (shape preset "slab_bottom"): you stand on it half a block up. It is not a stackable vanilla slab.',
    data: (context) => ({
      format: 1,
      model: 'minecraft:block/smooth_stone_slab',
      display_name: displayName(context.path),
      sound_type: 'stone',
      loot: 'self',
      item: { creative_tab: 'minecraft:building_blocks' },
      components: {
        'msm:breakable': { hardness: 2, resistance: 6, tool: 'pickaxe' },
        'msm:shape': { preset: 'slab_bottom' },
      },
    }),
  },
  {
    id: 'msm_block_plant',
    kind: BLOCK_KIND,
    category: CATEGORY,
    title: 'Plant (cross)',
    description:
      'A plant drawn as two crossed planes (shape preset "cross"): it breaks instantly, lets light through and you walk through it.',
    data: (context) => ({
      format: 1,
      model: 'minecraft:block/poppy',
      display_name: displayName(context.path),
      sound_type: 'grass',
      loot: 'self',
      item: { creative_tab: 'minecraft:natural_blocks' },
      components: {
        'msm:breakable': { hardness: 0, resistance: 0 },
        'msm:shape': { preset: 'cross' },
      },
    }),
  },
  {
    id: 'msm_block_glass_like',
    kind: BLOCK_KIND,
    category: CATEGORY,
    title: 'Glass-like block',
    description:
      'A full block you can see through, as glass: light passes and faces between two of them are hidden. It drops nothing unless you add loot.',
    data: (context) => ({
      format: 1,
      model: 'minecraft:block/glass',
      display_name: displayName(context.path),
      sound_type: 'glass',
      item: { creative_tab: 'minecraft:building_blocks' },
      components: {
        'msm:breakable': { hardness: 0.3, resistance: 0.3 },
        'msm:shape': { preset: 'full', see_through: true },
      },
    }),
  },
];
