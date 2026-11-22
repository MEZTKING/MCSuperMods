/**
 * Fluid templates (ADR 0099 D1, ADR 0108), category "Fluids": a water-like and a lava-like `msm:fluid`
 * drawn with vanilla's own pictures (named, never bundled; checked against the vendored texture
 * registry of both targets: `block/water_still`, `water_flow`, `water_overlay`, `lava_still`,
 * `lava_flow`, `item/water_bucket`, `item/lava_bucket`) under a plain RGB tint; then a water-like
 * fluid with a cauldron in levels and a bottle, and a lava-like fluid that mixes with water
 * (ADR 0108 D1 to D3; B531).
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { FLUID_KIND } from '../kinds/fluid';
import { displayName } from './shared';

const CATEGORY = 'Fluids';

export const fluidTemplates: readonly ElementTemplate[] = [
  {
    id: 'msm_fluid_water_like',
    kind: FLUID_KIND,
    category: CATEGORY,
    title: 'Water-like fluid',
    description:
      'A green liquid that flows, makes new sources and lets you swim in it like water, with a bucket to carry it. It uses vanilla water pictures under a green tint until you give it your own.',
    defaultName: 'swamp_water',
    data: (context) => {
      const name = displayName(context.path);
      return {
        format: 1,
        behaves_like: 'water',
        flow: { tick_delay: 5, slope_distance: 4, drop_off: 1, infinite: true },
        tint: 0x4c8c3c,
        display_name: name,
        bucket_display_name: `${name} Bucket`,
        textures: {
          still: 'minecraft:block/water_still',
          flowing: 'minecraft:block/water_flow',
          overlay: 'minecraft:block/water_overlay',
          bucket: 'minecraft:item/water_bucket',
        },
      };
    },
  },
  {
    id: 'msm_fluid_lava_like',
    kind: FLUID_KIND,
    category: CATEGORY,
    title: 'Lava-like fluid',
    description:
      'A glowing molten liquid that flows slowly, never makes new sources, lights up the dark and sets things on fire like lava. It uses vanilla lava pictures under a golden tint until you give it your own.',
    defaultName: 'molten_gold',
    data: (context) => {
      const name = displayName(context.path);
      return {
        format: 1,
        behaves_like: 'lava',
        flow: { tick_delay: 30, slope_distance: 2, drop_off: 2, infinite: false },
        light: 15,
        tint: 0xffd24a,
        display_name: name,
        bucket_display_name: `${name} Bucket`,
        textures: {
          still: 'minecraft:block/lava_still',
          flowing: 'minecraft:block/lava_flow',
          bucket: 'minecraft:item/lava_bucket',
        },
      };
    },
  },
  {
    id: 'msm_fluid_cauldron_bottle',
    kind: FLUID_KIND,
    category: CATEGORY,
    title: 'Fluid with a cauldron and bottle',
    description:
      'A pink water-like liquid you can pour into a cauldron, which fills in three levels as water does, and scoop into bottles with a glass bottle. Drinking a bottle feeds you a little and heals you for a few seconds.',
    defaultName: 'berry_juice',
    data: (context) => {
      const name = displayName(context.path);
      return {
        format: 1,
        behaves_like: 'water',
        tint: 0xc43a6e,
        display_name: name,
        bucket_display_name: `${name} Bucket`,
        cauldron_display_name: `${name} Cauldron`,
        bottle_display_name: `Bottle of ${name}`,
        cauldron: { levels: true },
        bottle: {
          food: { nutrition: 2, saturation: 0.4, can_always_eat: true },
          effects: [{ effect: 'minecraft:regeneration', seconds: 5 }],
        },
        textures: {
          still: 'minecraft:block/water_still',
          flowing: 'minecraft:block/water_flow',
          overlay: 'minecraft:block/water_overlay',
          bucket: 'minecraft:item/water_bucket',
        },
      };
    },
  },
  {
    id: 'msm_fluid_mixing',
    kind: FLUID_KIND,
    category: CATEGORY,
    title: 'Fluid that mixes with water',
    description:
      'A glowing molten liquid that hardens where water touches it, as lava does: a still pool turns into raw copper and a flowing stream into cobbled deepslate. It keeps a full-only cauldron, as lava does.',
    defaultName: 'molten_copper',
    data: (context) => {
      const name = displayName(context.path);
      return {
        format: 1,
        behaves_like: 'lava',
        flow: { tick_delay: 30, slope_distance: 2, drop_off: 2, infinite: false },
        light: 15,
        tint: 0xe07a3c,
        display_name: name,
        bucket_display_name: `${name} Bucket`,
        mixing: [
          {
            with: 'water',
            source: 'minecraft:raw_copper_block',
            flowing: 'minecraft:cobbled_deepslate',
          },
        ],
        cauldron: {},
        textures: {
          still: 'minecraft:block/lava_still',
          flowing: 'minecraft:block/lava_flow',
          bucket: 'minecraft:item/lava_bucket',
        },
      };
    },
  },
];
