/**
 * Stand-in body (ADR 0121 D4, B623): The piglet (one model for every pig variant).
 * Boxes read from the spike B619's face lists and decoded views of MSM's own coded pictures
 * (`docs/reference/spikes/b619/`), never from a Mojang model. Bedrock geo, mob facing north (-z).
 */

import type { GeoJson } from './index';

const body: GeoJson = {
  format_version: '1.12.0',
  'minecraft:geometry': [
    {
      description: {
        identifier: 'geometry.msm.stand_in.pig_baby',
        texture_width: 32,
        texture_height: 32,
      },
      bones: [
        {
          name: 'head',
          pivot: [0.0, 7, -4],
          cubes: [{ origin: [-3.5, 4, -7], size: [7, 6, 6], uv: [0, 15] }],
        },
        {
          name: 'body',
          pivot: [0.0, 5, 0.5],
          cubes: [{ origin: [-3.5, 2, -4], size: [7, 6, 9], uv: [0, 0] }],
        },
        {
          name: 'leg_fr',
          pivot: [-2.5, 1, -3],
          cubes: [{ origin: [-3.5, 0.0, -4], size: [2, 2, 2], uv: [23, 0] }],
        },
        {
          name: 'leg_fl',
          pivot: [2.5, 1, -3],
          cubes: [{ origin: [1.5, 0.0, -4], size: [2, 2, 2], uv: [0, 0] }],
        },
        {
          name: 'leg_hr',
          pivot: [-2.5, 1, 4],
          cubes: [{ origin: [-3.5, 0.0, 3], size: [2, 2, 2], uv: [23, 4] }],
        },
        {
          name: 'leg_hl',
          pivot: [2.5, 1, 4],
          cubes: [{ origin: [1.5, 0.0, 3], size: [2, 2, 2], uv: [0, 4] }],
        },
      ],
    },
  ],
};

export default body;
