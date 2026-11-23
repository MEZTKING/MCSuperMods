/**
 * Stand-in body (ADR 0121 D4, B623): The sulfur cube at Size 1: the `outer` bone samples `sulfur_cube_outer.png`, the `inner` bone `sulfur_cube_inner.png` (their rectangles do not overlap, so one 128 by 128 picture can hold both; see `SULFUR_CUBE_LAYERS`). `sulfurCubeScale(size)` scales it.
 * Boxes read from the spike B619's face lists and decoded views of MSM's own coded pictures
 * (`docs/reference/spikes/b619/`), never from a Mojang model. Bedrock geo, mob facing north (-z).
 */

import type { GeoJson } from './index';

const body: GeoJson = {
  format_version: '1.12.0',
  'minecraft:geometry': [
    {
      description: {
        identifier: 'geometry.msm.stand_in.sulfur_cube',
        texture_width: 128,
        texture_height: 128,
      },
      bones: [
        {
          name: 'outer',
          pivot: [0.0, 9.333, 0.0],
          cubes: [{ origin: [-9, 0.333, -9], size: [18, 18, 18], uv: [0, 0] }],
        },
        {
          name: 'inner',
          pivot: [0.0, 9.333, 0.0],
          cubes: [{ origin: [-8, 1.333, -8], size: [16, 16, 16], uv: [0, 36] }],
        },
      ],
    },
  ],
};

export default body;
