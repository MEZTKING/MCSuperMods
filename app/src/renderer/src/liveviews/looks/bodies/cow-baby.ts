/**
 * Stand-in body (ADR 0121 D4, B623): The calf (one model for every cow variant).
 * Boxes read from the spike B619's face lists and decoded views of MSM's own coded pictures
 * (`docs/reference/spikes/b619/`), never from a Mojang model. Bedrock geo, mob facing north (-z).
 */

import type { GeoJson } from './index';

const body: GeoJson = {
  format_version: '1.12.0',
  'minecraft:geometry': [
    {
      description: {
        identifier: 'geometry.msm.stand_in.cow_baby',
        texture_width: 64,
        texture_height: 64,
      },
      bones: [
        {
          name: 'body',
          pivot: [0.0, 9, 0.0],
          cubes: [{ origin: [-4, 6, -6], size: [8, 6, 12], uv: [0, 0] }],
        },
        {
          name: 'head',
          pivot: [0.0, 12, -7.5],
          cubes: [{ origin: [-3, 9, -10], size: [6, 6, 5], uv: [0, 18] }],
        },
        {
          name: 'muzzle',
          pivot: [0.0, 10.5, -10.5],
          cubes: [{ origin: [-2, 9, -11], size: [4, 3, 1], uv: [12, 29] }],
        },
        {
          name: 'horn_r',
          pivot: [-3.5, 15, -8.5],
          cubes: [{ origin: [-4, 14, -9], size: [1, 2, 1], uv: [4, 29] }],
        },
        {
          name: 'horn_l',
          pivot: [3.5, 15, -8.5],
          cubes: [{ origin: [3, 14, -9], size: [1, 2, 1], uv: [8, 29] }],
        },
        {
          name: 'leg_fr',
          pivot: [-2.5, 3, -3.5],
          cubes: [{ origin: [-4, 0.0, -5], size: [3, 6, 3], uv: [22, 18] }],
        },
        {
          name: 'leg_fl',
          pivot: [2.5, 3, -3.5],
          cubes: [{ origin: [1, 0.0, -5], size: [3, 6, 3], uv: [34, 18] }],
        },
        {
          name: 'leg_hr',
          pivot: [-2.5, 3, 3.5],
          cubes: [{ origin: [-4, 0.0, 2], size: [3, 6, 3], uv: [22, 27] }],
        },
        {
          name: 'leg_hl',
          pivot: [2.5, 3, 3.5],
          cubes: [{ origin: [1, 0.0, 2], size: [3, 6, 3], uv: [34, 27] }],
        },
      ],
    },
  ],
};

export default body;
