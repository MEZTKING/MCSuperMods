/**
 * `msm:geo_model` templates: Bedrock geometry 1.12.0 over a 64x64 texture, in model units
 * (16 to a block, y up, `origin` the lowest corner of a cube). Every box UV fits the texture.
 */
import type { ElementTemplate, JsonObject, TemplateContext } from '@msm/plugin-api';
import { GEO_MODEL_KIND, GEOMETRY_FORMAT_VERSION } from '../kinds';
import { ENTITY_PREFIX, geometryIdentifier } from './shared';

const CATEGORY = 'Entity models';

function geometry(
  context: TemplateContext,
  bounds: { width: number; height: number },
  bones: JsonObject[],
): JsonObject {
  return {
    format_version: GEOMETRY_FORMAT_VERSION,
    'minecraft:geometry': [
      {
        description: {
          identifier: geometryIdentifier(context),
          texture_width: 64,
          texture_height: 64,
          visible_bounds_width: bounds.width,
          visible_bounds_height: bounds.height,
          visible_bounds_offset: [0, bounds.height / 2, 0],
        },
        bones,
      },
    ],
  };
}

export const modelTemplates: readonly ElementTemplate[] = [
  {
    id: 'msm_geo_model_cube_creature',
    kind: GEO_MODEL_KIND,
    category: CATEGORY,
    title: 'Cube creature model',
    description: 'A box-shaped creature with a body and a head bone over a 64x64 texture.',
    prefix: ENTITY_PREFIX,
    data: (context) =>
      geometry(context, { width: 2, height: 2 }, [
        {
          name: 'body',
          pivot: [0, 10, 0],
          // Box UV 56 x 26 at [0, 0].
          cubes: [{ origin: [-6, 4, -8], size: [12, 10, 16], uv: [0, 0] }],
        },
        {
          name: 'head',
          parent: 'body',
          pivot: [0, 12, -8],
          // Box UV 32 x 16 at [0, 26].
          cubes: [{ origin: [-4, 8, -16], size: [8, 8, 8], uv: [0, 26] }],
        },
      ]),
  },
  {
    id: 'msm_geo_model_biped',
    kind: GEO_MODEL_KIND,
    category: CATEGORY,
    title: 'Biped model',
    description:
      'A two-legged figure (body, head, two arms, two legs) on the player skin layout of a 64x64 texture.',
    prefix: ENTITY_PREFIX,
    data: (context) =>
      geometry(context, { width: 2, height: 3 }, [
        {
          name: 'body',
          pivot: [0, 24, 0],
          cubes: [{ origin: [-4, 12, -2], size: [8, 12, 4], uv: [16, 16] }],
        },
        {
          name: 'head',
          parent: 'body',
          pivot: [0, 24, 0],
          cubes: [{ origin: [-4, 24, -4], size: [8, 8, 8], uv: [0, 0] }],
        },
        {
          name: 'right_arm',
          parent: 'body',
          pivot: [-5, 22, 0],
          cubes: [{ origin: [-8, 12, -2], size: [4, 12, 4], uv: [40, 16] }],
        },
        {
          name: 'left_arm',
          parent: 'body',
          pivot: [5, 22, 0],
          cubes: [{ origin: [4, 12, -2], size: [4, 12, 4], uv: [32, 48] }],
        },
        {
          name: 'right_leg',
          pivot: [-1.9, 12, 0],
          cubes: [{ origin: [-3.9, 0, -2], size: [4, 12, 4], uv: [0, 16] }],
        },
        {
          name: 'left_leg',
          pivot: [1.9, 12, 0],
          cubes: [{ origin: [-0.1, 0, -2], size: [4, 12, 4], uv: [16, 48] }],
        },
      ]),
  },
];
