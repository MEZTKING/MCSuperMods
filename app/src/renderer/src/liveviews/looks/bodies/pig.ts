/**
 * Stand-in body (ADR 0121 D4, B623): The pig (`normal` model).
 * Boxes read from the spike B619's face lists and decoded views of MSM's own coded pictures
 * (`docs/reference/spikes/b619/`), never from a Mojang model. Bedrock geo, mob facing north (-z).
 */

import type { GeoJson } from './index';

const body: GeoJson = {
  format_version: '1.12.0',
  'minecraft:geometry': [
    {
      description: {
        identifier: 'geometry.msm.stand_in.pig',
        texture_width: 64,
        texture_height: 64,
      },
      bones: [
        {
          name: 'head',
          pivot: [0.0, 12, -10],
          cubes: [{ origin: [-4, 8, -14], size: [8, 8, 8], uv: [0, 0] }],
        },
        {
          name: 'snout',
          pivot: [0.0, 10.5, -14.5],
          cubes: [{ origin: [-2, 9, -15], size: [4, 3, 1], uv: [16, 16] }],
        },
        {
          name: 'body',
          pivot: [0.0, 10, 0.0],
          rotation: [90, 0, 0],
          cubes: [{ origin: [-5, 2, -4], size: [10, 16, 8], uv: [28, 8] }],
        },
        {
          name: 'leg_fr',
          pivot: [-3, 3, -5],
          cubes: [{ origin: [-5, 0.0, -7], size: [4, 6, 4], uv: [0, 16] }],
        },
        {
          name: 'leg_fl',
          pivot: [3, 3, -5],
          cubes: [{ origin: [1, 0.0, -7], size: [4, 6, 4], uv: [0, 16], mirror: true }],
        },
        {
          name: 'leg_hr',
          pivot: [-3, 3, 7],
          cubes: [{ origin: [-5, 0.0, 5], size: [4, 6, 4], uv: [0, 16] }],
        },
        {
          name: 'leg_hl',
          pivot: [3, 3, 7],
          cubes: [{ origin: [1, 0.0, 5], size: [4, 6, 4], uv: [0, 16], mirror: true }],
        },
      ],
    },
  ],
};

export default body;
