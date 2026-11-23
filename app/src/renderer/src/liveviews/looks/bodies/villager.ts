/**
 * Stand-in body (ADR 0121 D4, B623): The villager (base, type, profession and level layers share it), at model scale: `bodyFor` draws it at 0.9375 as the game does. Arms crossed at 43 degrees; hat and robe inflated by half a pixel.
 * Boxes read from the spike B619's face lists and decoded views of MSM's own coded pictures
 * (`docs/reference/spikes/b619/`), never from a Mojang model. Bedrock geo, mob facing north (-z).
 */

import type { GeoJson } from './index';

const body: GeoJson = {
  format_version: '1.12.0',
  'minecraft:geometry': [
    {
      description: {
        identifier: 'geometry.msm.stand_in.villager',
        texture_width: 64,
        texture_height: 64,
      },
      bones: [
        {
          name: 'head',
          pivot: [0.0, 29, 0.0],
          cubes: [{ origin: [-4, 24, -4], size: [8, 10, 8], uv: [0, 0] }],
        },
        {
          name: 'hat',
          pivot: [0.0, 29, 0.0],
          cubes: [{ origin: [-4, 24, -4], size: [8, 10, 8], uv: [32, 0], inflate: 0.5 }],
        },
        {
          name: 'nose',
          pivot: [0.0, 25, -5],
          cubes: [{ origin: [-1, 23, -6], size: [2, 4, 2], uv: [24, 0] }],
        },
        {
          name: 'rim',
          pivot: [0.0, 29.5, 0.0],
          rotation: [-90, 0, 0],
          cubes: [{ origin: [-8, 21.5, -0.5], size: [16, 16, 1], uv: [30, 47] }],
        },
        {
          name: 'body',
          pivot: [0.0, 18, 0.0],
          cubes: [{ origin: [-4, 12, -3], size: [8, 12, 6], uv: [16, 20] }],
        },
        {
          name: 'robe',
          pivot: [0.0, 14, 0.0],
          cubes: [{ origin: [-4, 4, -3], size: [8, 20, 6], uv: [0, 38], inflate: 0.5 }],
        },
        {
          name: 'leg_r',
          pivot: [-2, 6, 0.0],
          cubes: [{ origin: [-4, 0.0, -2], size: [4, 12, 4], uv: [0, 22] }],
        },
        {
          name: 'leg_l',
          pivot: [2, 6, 0.0],
          cubes: [{ origin: [0.0, 0.0, -2], size: [4, 12, 4], uv: [0, 22], mirror: true }],
        },
        {
          name: 'arm_r',
          pivot: [0.0, 21, -1],
          rotation: [-43, 0, 0],
          cubes: [{ origin: [-8, 15, -3], size: [4, 8, 4], uv: [44, 22] }],
        },
        {
          name: 'arm_l',
          pivot: [0.0, 21, -1],
          rotation: [-43, 0, 0],
          cubes: [{ origin: [4, 15, -3], size: [4, 8, 4], uv: [44, 22], mirror: true }],
        },
        {
          name: 'arm_mid',
          pivot: [0.0, 21, -1],
          rotation: [-43, 0, 0],
          cubes: [{ origin: [-4, 15, -3], size: [8, 4, 4], uv: [40, 38] }],
        },
      ],
    },
  ],
};

export default body;
