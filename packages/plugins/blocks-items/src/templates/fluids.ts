/**
 * Fluid templates (ADR 0099 D1), category "Fluids": a water-like and a lava-like `msm:fluid`
 * drawn with vanilla's own pictures (named, never bundled; checked against the vendored texture
 * registry of both targets: `block/water_still`, `water_flow`, `water_overlay`, `lava_still`,
 * `lava_flow`, `item/water_bucket`, `item/lava_bucket`) under a plain RGB tint.
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
];
