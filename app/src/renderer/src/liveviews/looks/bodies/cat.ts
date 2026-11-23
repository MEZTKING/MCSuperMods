/**
 * Stand-in body (ADR 0121 D4, B623): The cat (adult; every cat variant), at model scale: `bodyFor` draws it at 0.8 as the game does.
 * Boxes read from the spike B619's face lists and decoded views of MSM's own coded pictures
 * (`docs/reference/spikes/b619/`), never from a Mojang model. Bedrock geo, mob facing north (-z).
 */

import type { GeoJson } from './index';

const body: GeoJson = {
  format_version: '1.12.0',
  'minecraft:geometry': [
    {
      description: {
        identifier: 'geometry.msm.stand_in.cat',
        texture_width: 64,
        texture_height: 32,
      },
      bones: [
        {
          name: 'head',
          pivot: [0.0, 9, -9.5],
          cubes: [{ origin: [-2.5, 7, -12], size: [5, 4, 5], uv: [0, 0] }],
        },
        {
          name: 'body',
          pivot: [0.0, 7, 1],
          rotation: [90, 0, 0],
          cubes: [{ origin: [-2, -1, -2], size: [4, 16, 6], uv: [20, 0] }],
        },
        {
          name: 'ear_r',
          pivot: [-1.5, 11.5, -8],
          cubes: [{ origin: [-2, 11, -9], size: [1, 1, 2], uv: [0, 10] }],
        },
        {
          name: 'ear_l',
          pivot: [1.5, 11.5, -8],
          cubes: [{ origin: [1, 11, -9], size: [1, 1, 2], uv: [6, 10] }],
        },
        {
          name: 'nose',
          pivot: [0.0, 8, -12.5],
          cubes: [{ origin: [-1.5, 7, -13], size: [3, 2, 1], uv: [1, 25] }],
        },
        {
          name: 'tail1',
          pivot: [0.0, 9.49, 8.28],
          rotation: [51.2, 0, 0],
          cubes: [{ origin: [-0.5, 1.49, 7.78], size: [1, 8, 1], uv: [0, 15] }],
        },
        {
          name: 'tail2',
          pivot: [0.0, 4.55, 13.77],
          rotation: [100.5, 0, 0],
          cubes: [{ origin: [-0.5, -3.45, 13.27], size: [1, 8, 1], uv: [4, 15] }],
        },
        {
          name: 'leg_fr',
          pivot: [-1, 5, -4],
          cubes: [{ origin: [-2, 0.0, -5], size: [2, 10, 2], uv: [40, 0] }],
        },
        {
          name: 'leg_fl',
          pivot: [1, 5, -4],
          cubes: [{ origin: [0.0, 0.0, -5], size: [2, 10, 2], uv: [40, 0] }],
        },
        {
          name: 'leg_hr',
          pivot: [-1, 3, 7],
          cubes: [{ origin: [-2, 0.0, 6], size: [2, 6, 2], uv: [8, 13] }],
        },
        {
          name: 'leg_hl',
          pivot: [1, 3, 7],
          cubes: [{ origin: [0.0, 0.0, 6], size: [2, 6, 2], uv: [8, 13] }],
        },
      ],
    },
  ],
};

export default body;
