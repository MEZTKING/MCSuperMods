/**
 * Stand-in body (ADR 0121 D4, B623): The wolf pup (babies are their own models). The tail points down and back.
 * Boxes read from the spike B619's face lists and decoded views of MSM's own coded pictures
 * (`docs/reference/spikes/b619/`), never from a Mojang model. Bedrock geo, mob facing north (-z).
 */

import type { GeoJson } from './index';

const body: GeoJson = {
  format_version: '1.12.0',
  'minecraft:geometry': [
    {
      description: {
        identifier: 'geometry.msm.stand_in.wolf_baby',
        texture_width: 32,
        texture_height: 32,
      },
      bones: [
        {
          name: 'body',
          pivot: [0.0, 5, 0.0],
          cubes: [{ origin: [-3, 3, -4], size: [6, 4, 8], uv: [0, 0] }],
        },
        {
          name: 'head',
          pivot: [0.0, 6.5, -4.5],
          cubes: [{ origin: [-3, 4, -7], size: [6, 5, 5], uv: [0, 12] }],
        },
        {
          name: 'snout',
          pivot: [0.0, 5, -8],
          cubes: [{ origin: [-1.5, 4, -9], size: [3, 2, 2], uv: [17, 12] }],
        },
        {
          name: 'ear_l',
          pivot: [2, 10, -4.5],
          cubes: [{ origin: [1, 9, -5], size: [2, 2, 1], uv: [20, 5] }],
        },
        {
          name: 'ear_r',
          pivot: [-2, 10, -4.5],
          cubes: [{ origin: [-3, 9, -5], size: [2, 2, 1], uv: [0, 5] }],
        },
        {
          name: 'leg_fr',
          pivot: [-1.5, 1.5, -3],
          cubes: [{ origin: [-2.5, 0.0, -4], size: [2, 3, 2], uv: [0, 0] }],
        },
        {
          name: 'leg_fl',
          pivot: [1.5, 1.5, -3],
          cubes: [{ origin: [0.5, 0.0, -4], size: [2, 3, 2], uv: [20, 0] }],
        },
        {
          name: 'leg_hr',
          pivot: [-1.5, 1.5, 3],
          cubes: [{ origin: [-2.5, 0.0, 2], size: [2, 3, 2], uv: [0, 22] }],
        },
        {
          name: 'leg_hl',
          pivot: [1.5, 1.5, 3],
          cubes: [{ origin: [0.5, 0.0, 2], size: [2, 3, 2], uv: [8, 22] }],
        },
        {
          name: 'tail',
          pivot: [0.0, 5, 3],
          rotation: [-142, 0, 0],
          cubes: [{ origin: [-1, 4, 1.5], size: [2, 6, 2], uv: [22, 16] }],
        },
      ],
    },
  ],
};

export default body;
