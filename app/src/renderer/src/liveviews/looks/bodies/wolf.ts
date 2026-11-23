/**
 * Stand-in body (ADR 0121 D4, B623): The wolf (adult; every wolf variant). Legs on the right are mirrored; the tail hangs at 36 degrees.
 * Boxes read from the spike B619's face lists and decoded views of MSM's own coded pictures
 * (`docs/reference/spikes/b619/`), never from a Mojang model. Bedrock geo, mob facing north (-z).
 */

import type { GeoJson } from './index';

const body: GeoJson = {
  format_version: '1.12.0',
  'minecraft:geometry': [
    {
      description: {
        identifier: 'geometry.msm.stand_in.wolf',
        texture_width: 64,
        texture_height: 32,
      },
      bones: [
        {
          name: 'head',
          pivot: [0.0, 10.5, -7],
          cubes: [{ origin: [-3, 7.5, -9], size: [6, 6, 4], uv: [0, 0] }],
        },
        {
          name: 'snout',
          pivot: [0.0, 9, -10],
          cubes: [{ origin: [-1.5, 7.5, -12], size: [3, 3, 4], uv: [0, 10] }],
        },
        {
          name: 'ear_l',
          pivot: [2, 14.5, -5.5],
          cubes: [{ origin: [1, 13.5, -6], size: [2, 2, 1], uv: [16, 14] }],
        },
        {
          name: 'ear_r',
          pivot: [-2, 14.5, -5.5],
          cubes: [{ origin: [-3, 13.5, -6], size: [2, 2, 1], uv: [16, 14] }],
        },
        {
          name: 'mane',
          pivot: [0.0, 10.5, -3],
          rotation: [90, 0, 0],
          cubes: [{ origin: [-4, 7.5, -6.5], size: [8, 6, 7], uv: [21, 0] }],
        },
        {
          name: 'body',
          pivot: [0.0, 10, 4.5],
          rotation: [90, 0, 0],
          cubes: [{ origin: [-3, 5.5, 1.5], size: [6, 9, 6], uv: [18, 14] }],
        },
        {
          name: 'leg_fr',
          pivot: [-1.5, 4, -4],
          cubes: [{ origin: [-2.5, 0.0, -5], size: [2, 8, 2], uv: [0, 18], mirror: true }],
        },
        {
          name: 'leg_fl',
          pivot: [1.5, 4, -4],
          cubes: [{ origin: [0.5, 0.0, -5], size: [2, 8, 2], uv: [0, 18] }],
        },
        {
          name: 'leg_hr',
          pivot: [-1.5, 4, 7],
          cubes: [{ origin: [-2.5, 0.0, 6], size: [2, 8, 2], uv: [0, 18], mirror: true }],
        },
        {
          name: 'leg_hl',
          pivot: [1.5, 4, 7],
          cubes: [{ origin: [0.5, 0.0, 6], size: [2, 8, 2], uv: [0, 18] }],
        },
        {
          name: 'tail',
          pivot: [0.0, 12, 8],
          rotation: [36, 0, 0],
          cubes: [{ origin: [-1, 4, 7], size: [2, 8, 2], uv: [9, 18] }],
        },
      ],
    },
  ],
};

export default body;
