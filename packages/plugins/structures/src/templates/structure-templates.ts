/**
 * Structure template templates: a plain platform, a hut piece and a path piece with jigsaw
 * blocks. Jigsaws point at the template pool with the same id as the new element, so a pool,
 * structure and structure set made from this plugin's templates under one name connect.
 */
import type { ElementTemplate, Json } from '@msm/plugin-api';
import { PieceBuilder } from './pieces';

const KIND = 'minecraft:structure_template';
const CATEGORY = 'Structures';

const json = (value: unknown): Json => value as Json;

/** The structure template templates, in picker order. */
export const structureTemplateTemplates: readonly ElementTemplate[] = [
  {
    id: 'structure_template_platform',
    kind: KIND,
    title: 'Structure template: 5×5 platform',
    description: 'A flat 5×5 stone brick platform, one block high.',
    category: CATEGORY,
    data: () =>
      json(
        new PieceBuilder([5, 1, 5]).fill([0, 0, 0], [4, 0, 4], 'minecraft:stone_bricks').build(),
      ),
  },
  {
    id: 'structure_template_jigsaw_hut',
    kind: KIND,
    title: 'Structure template: jigsaw hut piece',
    description:
      'A 5×5×5 plank hut with a doorway and a jigsaw block in front of it that attaches pieces from the pool with the same id.',
    category: CATEGORY,
    data: ({ id }) =>
      json(
        new PieceBuilder([5, 5, 5])
          .fill([0, 0, 0], [4, 0, 4], 'minecraft:cobblestone')
          .fill([0, 1, 0], [4, 3, 4], 'minecraft:oak_planks')
          .fill([1, 1, 1], [3, 3, 3], 'minecraft:air')
          .fill([2, 1, 0], [2, 2, 0], 'minecraft:air')
          .fill([0, 4, 0], [4, 4, 4], 'minecraft:oak_slab[type=bottom,waterlogged=false]')
          .set([2, 3, 2], 'minecraft:lantern[hanging=true,waterlogged=false]')
          .jigsaw([2, 0, 0], 'north_up', {
            pool: id,
            name: `${id}_entrance`,
            target: `${id}_path`,
            final_state: 'minecraft:cobblestone',
          })
          .build(),
      ),
  },
  {
    id: 'structure_template_path',
    kind: KIND,
    title: 'Structure template: path piece',
    description:
      'A 3×1×5 dirt path with a jigsaw block at each end, both connecting to further paths from the pool with the same id.',
    category: CATEGORY,
    data: ({ id }) =>
      json(
        new PieceBuilder([3, 1, 5])
          .fill([0, 0, 0], [2, 0, 4], 'minecraft:dirt_path')
          .jigsaw([1, 0, 0], 'north_up', {
            pool: id,
            name: `${id}_path`,
            target: `${id}_path`,
            final_state: 'minecraft:dirt_path',
          })
          .jigsaw([1, 0, 4], 'south_up', {
            pool: id,
            name: `${id}_path`,
            target: `${id}_path`,
            final_state: 'minecraft:dirt_path',
          })
          .build(),
      ),
  },
];
