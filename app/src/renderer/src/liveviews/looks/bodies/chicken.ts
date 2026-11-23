/**
 * Stand-in body (ADR 0121 D4, B623): The chicken (`normal` model), wings in their rest pose (the game flaps them even standing).
 * Boxes read from the spike B619's face lists and decoded views of MSM's own coded pictures
 * (`docs/reference/spikes/b619/`), never from a Mojang model. Bedrock geo, mob facing north (-z).
 */

import type { GeoJson } from './index';

const body: GeoJson = {
  format_version: '1.12.0',
  'minecraft:geometry': [
    {
      description: {
        identifier: 'geometry.msm.stand_in.chicken',
        texture_width: 64,
        texture_height: 32,
      },
      bones: [
        {
          name: 'head',
          pivot: [0.0, 12, -4.5],
          cubes: [{ origin: [-2, 9, -6], size: [4, 6, 3], uv: [0, 0] }],
        },
        {
          name: 'beak',
          pivot: [0.0, 12, -7],
          cubes: [{ origin: [-2, 11, -8], size: [4, 2, 2], uv: [14, 0] }],
        },
        {
          name: 'wattle',
          pivot: [0.0, 10, -6],
          cubes: [{ origin: [-1, 9, -7], size: [2, 2, 2], uv: [14, 4] }],
        },
        {
          name: 'body',
          pivot: [0.0, 8, 0.0],
          rotation: [90, 0, 0],
          cubes: [{ origin: [-3, 4, -3], size: [6, 8, 6], uv: [0, 9] }],
        },
        {
          name: 'wing_r',
          pivot: [-3.5, 9, 0.0],
          cubes: [{ origin: [-4, 7, -3], size: [1, 4, 6], uv: [24, 13] }],
        },
        {
          name: 'wing_l',
          pivot: [3.5, 9, 0.0],
          cubes: [{ origin: [3, 7, -3], size: [1, 4, 6], uv: [24, 13], mirror: true }],
        },
        {
          name: 'leg_r',
          pivot: [-1.5, 2.5, -0.5],
          cubes: [{ origin: [-3, 0.0, -2], size: [3, 5, 3], uv: [26, 0] }],
        },
        {
          name: 'leg_l',
          pivot: [1.5, 2.5, -0.5],
          cubes: [{ origin: [0.0, 0.0, -2], size: [3, 5, 3], uv: [26, 0] }],
        },
      ],
    },
  ],
};

export default body;
