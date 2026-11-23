/**
 * Stand-in body (ADR 0121 D4, B623): The baby villager (base and type layers share it): arms crossed at 62 degrees, a flat brim.
 * Boxes read from the spike B619's face lists and decoded views of MSM's own coded pictures
 * (`docs/reference/spikes/b619/`), never from a Mojang model. Bedrock geo, mob facing north (-z).
 */

import type { GeoJson } from './index';

const body: GeoJson = {
  format_version: '1.12.0',
  'minecraft:geometry': [
    {
      description: {
        identifier: 'geometry.msm.stand_in.villager_baby',
        texture_width: 64,
        texture_height: 64,
      },
      bones: [
        {
          name: 'head',
          pivot: [0.0, 12, 0.0],
          cubes: [{ origin: [-4, 8, -3.5], size: [8, 8, 7], uv: [0, 30], inflate: 0.3 }],
        },
        {
          name: 'brim',
          pivot: [0.0, 12.5, 0.0],
          cubes: [{ origin: [-7, 12, -6], size: [14, 1, 12], uv: [0, 45] }],
        },
        {
          name: 'nose',
          pivot: [0.0, 9, -4],
          cubes: [{ origin: [-1, 8, -4.5], size: [2, 2, 1], uv: [23, 0] }],
        },
        {
          name: 'body',
          pivot: [0.0, 5, 0.0],
          cubes: [{ origin: [-2, 2, -1.5], size: [4, 6, 3], uv: [16, 21], inflate: 0.2 }],
        },
        {
          name: 'leg_r',
          pivot: [-1, 2, 0.0],
          cubes: [{ origin: [-2, 0.0, -1], size: [2, 4, 2], uv: [8, 22] }],
        },
        {
          name: 'leg_l',
          pivot: [1, 2, 0.0],
          cubes: [{ origin: [0.0, 0.0, -1], size: [2, 4, 2], uv: [0, 22] }],
        },
        {
          name: 'arm_r',
          pivot: [0.0, 6, 1.5],
          rotation: [-62, 0, 0],
          cubes: [{ origin: [-4, 2, -0.5], size: [2, 4, 2], uv: [36, 15] }],
        },
        {
          name: 'arm_l',
          pivot: [0.0, 6, 1.5],
          rotation: [-62, 0, 0],
          cubes: [{ origin: [2, 2, -0.5], size: [2, 4, 2], uv: [16, 15] }],
        },
        {
          name: 'arm_mid',
          pivot: [0.0, 6, 1.5],
          rotation: [-62, 0, 0],
          cubes: [{ origin: [-2, 2, -0.5], size: [4, 2, 2], uv: [24, 17] }],
        },
      ],
    },
  ],
};

export default body;
