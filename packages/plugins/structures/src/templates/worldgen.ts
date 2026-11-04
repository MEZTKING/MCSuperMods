/**
 * Templates for template pools, jigsaw structures, structure sets and processor lists. Each
 * refers to the element with its own id in the neighbouring registry (the pool uses the
 * structure template of the same id, the structure starts from the pool of the same id, the
 * set places the structure of the same id), so one name chains them together.
 */
import type { ElementTemplate } from '@msm/plugin-api';

const CATEGORY = 'Structures';

/** A stable salt in 0..2^31-1 derived from the element id (FNV-1a). */
export function saltFor(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 0x7fffffff;
}

/** The pool, structure, set and processor list templates, in picker order. */
export const worldgenTemplates: readonly ElementTemplate[] = [
  {
    id: 'template_pool',
    kind: 'minecraft:worldgen/template_pool',
    title: 'Template pool',
    description: 'A pool with one piece: the structure template with the same id, kept rigid.',
    category: CATEGORY,
    data: ({ id }) => ({
      fallback: 'minecraft:empty',
      elements: [
        {
          weight: 1,
          element: {
            element_type: 'minecraft:single_pool_element',
            location: id,
            processors: 'minecraft:empty',
            projection: 'rigid',
          },
        },
      ],
    }),
  },
  {
    id: 'template_pool_terminators',
    kind: 'minecraft:worldgen/template_pool',
    title: 'Template pool: terminators',
    description:
      'A pool that ends jigsaw chains: the structure template with the same id, following the terrain, or nothing at all.',
    category: CATEGORY,
    data: ({ id }) => ({
      fallback: 'minecraft:empty',
      elements: [
        {
          weight: 1,
          element: {
            element_type: 'minecraft:single_pool_element',
            location: id,
            processors: 'minecraft:empty',
            projection: 'terrain_matching',
          },
        },
        { weight: 1, element: { element_type: 'minecraft:empty_pool_element' } },
      ],
    }),
  },
  {
    id: 'structure_jigsaw',
    kind: 'minecraft:worldgen/structure',
    title: 'Jigsaw structure',
    description:
      'A jigsaw structure in forests that starts from the pool with the same id and blends into the terrain.',
    category: CATEGORY,
    data: ({ id }) => ({
      type: 'minecraft:jigsaw',
      biomes: '#minecraft:is_forest',
      step: 'surface_structures',
      spawn_overrides: {},
      terrain_adaptation: 'beard_thin',
      start_pool: id,
      size: 4,
      start_height: { absolute: 0 },
      project_start_to_heightmap: 'WORLD_SURFACE_WG',
      max_distance_from_center: 80,
      use_expansion_hack: false,
    }),
  },
  {
    id: 'structure_set_random_spread',
    kind: 'minecraft:worldgen/structure_set',
    title: 'Structure set (random spread)',
    description:
      'Places the structure with the same id about once in every 34×34 chunk cell, at least 8 chunks apart.',
    category: CATEGORY,
    data: ({ id }) => ({
      structures: [{ structure: id, weight: 1 }],
      placement: { type: 'minecraft:random_spread', spacing: 34, separation: 8, salt: saltFor(id) },
    }),
  },
  {
    id: 'processor_list_mossify_rot',
    kind: 'minecraft:worldgen/processor_list',
    title: 'Processor list: mossify and rot',
    description:
      'Turns a fifth of the cobblestone mossy and leaves out a tenth of all blocks, for a weathered look.',
    category: CATEGORY,
    data: () => ({
      processors: [
        {
          processor_type: 'minecraft:rule',
          rules: [
            {
              input_predicate: {
                predicate_type: 'minecraft:random_block_match',
                block: 'minecraft:cobblestone',
                probability: 0.2,
              },
              location_predicate: { predicate_type: 'minecraft:always_true' },
              output_state: 'minecraft:mossy_cobblestone',
            },
          ],
        },
        { processor_type: 'minecraft:block_rot', integrity: 0.9 },
      ],
    }),
  },
  {
    id: 'processor_list_block_ignore',
    kind: 'minecraft:worldgen/processor_list',
    title: 'Processor list: block ignore',
    description: 'Leaves air out of placed pieces, so the terrain they overlap is kept.',
    category: CATEGORY,
    data: () => ({
      processors: [{ processor_type: 'minecraft:block_ignore', blocks: ['minecraft:air'] }],
    }),
  },
];
