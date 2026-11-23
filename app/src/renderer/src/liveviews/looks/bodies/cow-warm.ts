/**
 * Stand-in body (ADR 0121 D4, B623): The cow (`warm` model): horns in two steps.
 * Boxes read from the spike B619's face lists and decoded views of MSM's own coded pictures
 * (`docs/reference/spikes/b619/`), never from a Mojang model. Bedrock geo, mob facing north (-z).
 */

import type { GeoJson } from './index';

const body: GeoJson = {
  format_version: '1.12.0',
  'minecraft:geometry': [
    {
      description: {
        identifier: 'geometry.msm.stand_in.cow_warm',
        texture_width: 64,
        texture_height: 64,
      },
      bones: [
        {
          name: 'head',
          pivot: [0.0, 20, -11],
          cubes: [{ origin: [-4, 16, -14], size: [8, 8, 6], uv: [0, 0] }],
        },
        {
          name: 'body',
          pivot: [0.0, 17, 1],
          rotation: [90, 0, 0],
          cubes: [{ origin: [-6, 8, -4], size: [12, 18, 10], uv: [18, 4] }],
        },
        {
          name: 'horn_r',
          pivot: [-6, 22, -12],
          cubes: [{ origin: [-8, 21, -13], size: [4, 2, 2], uv: [27, 0] }],
        },
        {
          name: 'horn_l',
          pivot: [6, 22, -12],
          cubes: [{ origin: [4, 21, -13], size: [4, 2, 2], uv: [27, 0], mirror: true }],
        },
        {
          name: 'horn_tip_r',
          pivot: [-7, 24, -12],
          cubes: [{ origin: [-8, 23, -13], size: [2, 2, 2], uv: [39, 0] }],
        },
        {
          name: 'horn_tip_l',
          pivot: [7, 24, -12],
          cubes: [{ origin: [6, 23, -13], size: [2, 2, 2], uv: [39, 0], mirror: true }],
        },
        {
          name: 'muzzle',
          pivot: [0.0, 17.5, -14.5],
          cubes: [{ origin: [-3, 16, -15], size: [6, 3, 1], uv: [1, 33] }],
        },
        {
          name: 'udder',
          pivot: [0.0, 11.5, 7],
          rotation: [90, 0, 0],
          cubes: [{ origin: [-2, 8.5, 6.5], size: [4, 6, 1], uv: [52, 0] }],
        },
        {
          name: 'leg_fr',
          pivot: [-4.2, 6, -5],
          cubes: [{ origin: [-6.2, 0.0, -7], size: [4, 12, 4], uv: [0, 16] }],
        },
        {
          name: 'leg_fl',
          pivot: [4.2, 6, -5],
          cubes: [{ origin: [2.2, 0.0, -7], size: [4, 12, 4], uv: [0, 16], mirror: true }],
        },
        {
          name: 'leg_hr',
          pivot: [-4.2, 6, 7.4],
          cubes: [{ origin: [-6.2, 0.0, 5.4], size: [4, 12, 4], uv: [0, 16] }],
        },
        {
          name: 'leg_hl',
          pivot: [4.2, 6, 7.4],
          cubes: [{ origin: [2.2, 0.0, 5.4], size: [4, 12, 4], uv: [0, 16], mirror: true }],
        },
      ],
    },
  ],
};

export default body;
