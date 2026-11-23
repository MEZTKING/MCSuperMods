/**
 * Stand-in body (ADR 0121 D4, B623): The chick: legs and feet are single faces, drawn from both sides.
 * Boxes read from the spike B619's face lists and decoded views of MSM's own coded pictures
 * (`docs/reference/spikes/b619/`), never from a Mojang model. Bedrock geo, mob facing north (-z).
 */

import type { GeoJson } from './index';

const body: GeoJson = {
  format_version: '1.12.0',
  'minecraft:geometry': [
    {
      description: {
        identifier: 'geometry.msm.stand_in.chicken_baby',
        texture_width: 16,
        texture_height: 16,
      },
      bones: [
        {
          name: 'body',
          pivot: [0.0, 4, 0.0],
          cubes: [{ origin: [-2, 2, -2], size: [4, 4, 4], uv: [0, 0] }],
        },
        {
          name: 'beak',
          pivot: [0.0, 3.5, -2.5],
          cubes: [{ origin: [-1, 3, -3], size: [2, 1, 1], uv: [10, 8] }],
        },
        {
          name: 'leg_r',
          pivot: [-0.9, 1, 0.0],
          cubes: [
            {
              origin: [-1.4, 0.0, 0.0],
              size: [1, 2, 0.0],
              uv: { north: { uv: [1, 2], uv_size: [1, 2] } },
            },
          ],
        },
        {
          name: 'leg_l',
          pivot: [0.9, 1, 0.0],
          cubes: [
            {
              origin: [0.4, 0.0, 0.0],
              size: [1, 2, 0.0],
              uv: { north: { uv: [3, 2], uv_size: [1, 2] } },
            },
          ],
        },
        {
          name: 'foot_r',
          pivot: [-1, 0.0, 0.0],
          cubes: [
            {
              origin: [-2, 0.0, -0.5],
              size: [2, 0.0, 1],
              uv: { up: { uv: [1, 0], uv_size: [2, 1] } },
            },
          ],
        },
        {
          name: 'foot_l',
          pivot: [1, 0.0, 0.0],
          cubes: [
            {
              origin: [0.0, 0.0, -0.5],
              size: [2, 0.0, 1],
              uv: { up: { uv: [1, 1], uv_size: [2, 1] } },
            },
          ],
        },
      ],
    },
  ],
};

export default body;
