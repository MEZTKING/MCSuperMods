/**
 * Stand-in body (ADR 0121 D4, B623): The kitten. Few of its faces were in the spike's lists; legs, ears, nose and tail placed by hand from the decoded views.
 * Boxes read from the spike B619's face lists and decoded views of MSM's own coded pictures
 * (`docs/reference/spikes/b619/`), never from a Mojang model. Bedrock geo, mob facing north (-z).
 */

import type { GeoJson } from './index';

const body: GeoJson = {
  format_version: '1.12.0',
  'minecraft:geometry': [
    {
      description: {
        identifier: 'geometry.msm.stand_in.cat_baby',
        texture_width: 32,
        texture_height: 32,
      },
      bones: [
        {
          name: 'head',
          pivot: [0.0, 5, -4],
          cubes: [{ origin: [-2.5, 3, -6], size: [5, 4, 4], uv: [0, 0] }],
        },
        {
          name: 'body',
          pivot: [0.0, 3.5, 0.5],
          cubes: [{ origin: [-2, 2, -3], size: [4, 3, 7], uv: [0, 8] }],
        },
        {
          name: 'ear_r',
          pivot: [-1.5, 7.5, -3],
          cubes: [{ origin: [-2, 7, -4], size: [1, 1, 2], uv: [18, 0] }],
        },
        {
          name: 'ear_l',
          pivot: [1.5, 7.5, -3],
          cubes: [{ origin: [1, 7, -4], size: [1, 1, 2], uv: [24, 0] }],
        },
        {
          name: 'nose',
          pivot: [0.0, 4, -6.5],
          cubes: [{ origin: [-1.5, 3, -7], size: [3, 2, 1], uv: [18, 3] }],
        },
        {
          name: 'tail',
          pivot: [0.0, 4.3, 3.75],
          rotation: [-33.5, 0, 0],
          cubes: [{ origin: [-0.5, 3.8, 3.75], size: [1, 1, 5], uv: [0, 18] }],
        },
        {
          name: 'leg_fr',
          pivot: [-1, 1, -1.5],
          cubes: [{ origin: [-1.5, 0.0, -2.5], size: [1, 2, 2], uv: [12, 18] }],
        },
        {
          name: 'leg_fl',
          pivot: [1, 1, -1.5],
          cubes: [{ origin: [0.5, 0.0, -2.5], size: [1, 2, 2], uv: [18, 18] }],
        },
        {
          name: 'leg_hr',
          pivot: [-1, 1, 2.5],
          cubes: [{ origin: [-1.5, 0.0, 1.5], size: [1, 2, 2], uv: [12, 22] }],
        },
        {
          name: 'leg_hl',
          pivot: [1, 1, 2.5],
          cubes: [{ origin: [0.5, 0.0, 1.5], size: [1, 2, 2], uv: [18, 22] }],
        },
      ],
    },
  ],
};

export default body;
