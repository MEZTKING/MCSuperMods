/**
 * Stand-in body (ADR 0121 D4, B623): The frog (every frog variant): the feet are flat webs on the ground, single faces drawn from both sides.
 * Boxes read from the spike B619's face lists and decoded views of MSM's own coded pictures
 * (`docs/reference/spikes/b619/`), never from a Mojang model. Bedrock geo, mob facing north (-z).
 */

import type { GeoJson } from './index';

const body: GeoJson = {
  format_version: '1.12.0',
  'minecraft:geometry': [
    {
      description: {
        identifier: 'geometry.msm.stand_in.frog',
        texture_width: 48,
        texture_height: 48,
      },
      bones: [
        {
          name: 'eye_r',
          pivot: [-2, 7, -1.5],
          cubes: [{ origin: [-3.5, 6, -3], size: [3, 2, 3], uv: [0, 0] }],
        },
        {
          name: 'eye_l',
          pivot: [2, 7, -1.5],
          cubes: [{ origin: [0.5, 6, -3], size: [3, 2, 3], uv: [0, 5] }],
        },
        {
          name: 'head',
          pivot: [0.0, 4.5, 0.5],
          cubes: [{ origin: [-3.5, 3, -4], size: [7, 3, 9], uv: [0, 13] }],
        },
        {
          name: 'body',
          pivot: [0.0, 2, -0.5],
          cubes: [{ origin: [-3.5, 1, -4], size: [7, 2, 7], uv: [5, 4] }],
        },
        {
          name: 'arm_l',
          pivot: [4.5, 1.5, -2],
          cubes: [{ origin: [3.5, 0.0, -3.5], size: [2, 3, 3], uv: [0, 32] }],
        },
        {
          name: 'arm_r',
          pivot: [-4.5, 1.5, -2],
          cubes: [{ origin: [-5.5, 0.0, -3.5], size: [2, 3, 3], uv: [0, 38] }],
        },
        {
          name: 'leg_hr',
          pivot: [-4, 1.5, 4],
          cubes: [{ origin: [-5.5, 0.0, 2], size: [3, 3, 4], uv: [0, 25] }],
        },
        {
          name: 'leg_hl',
          pivot: [4, 1.5, 4],
          cubes: [{ origin: [2.5, 0.0, 2], size: [3, 3, 4], uv: [14, 25] }],
        },
        {
          name: 'foot_hl',
          pivot: [5.5, 0.0, 4],
          cubes: [
            {
              origin: [1.5, 0.0, 0.0],
              size: [8, 0.0, 8],
              uv: { up: { uv: [18, 32], uv_size: [8, 8] } },
            },
          ],
        },
        {
          name: 'foot_hr',
          pivot: [-5.5, 0.0, 4],
          cubes: [
            {
              origin: [-9.5, 0.0, 0.0],
              size: [8, 0.0, 8],
              uv: { up: { uv: [34, 32], uv_size: [8, 8] } },
            },
          ],
        },
        {
          name: 'foot_fr',
          pivot: [-4, 0.0, -3.5],
          cubes: [
            {
              origin: [-8, 0.0, -7.5],
              size: [8, 0.0, 8],
              uv: { up: { uv: [18, 40], uv_size: [8, 8] } },
            },
          ],
        },
        {
          name: 'foot_fl',
          pivot: [4, 0.0, -3.5],
          cubes: [
            {
              origin: [0.0, 0.0, -7.5],
              size: [8, 0.0, 8],
              uv: { up: { uv: [34, 40], uv_size: [8, 8] } },
            },
          ],
        },
      ],
    },
  ],
};

export default body;
