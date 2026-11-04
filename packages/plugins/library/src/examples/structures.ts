/**
 * One commented example per structure kind (ADR 0021, ADR 0022): structure template, template
 * pool, jigsaw structure, structure set and processor list. Each bundle is self-contained: a
 * pool brings its template, a structure its pool and template, a set its structure.
 */
import type { ExampleProject, Json } from '@msm/plugin-api';
import { element, KINDS, rl } from '../content/bundle';
import { BoxBuilder, emptyPiece, saltFor, singlePiece } from '../content/structures';
import { defineExample } from './define';

const CATEGORY = 'Structures';

/** A hollow stone brick tower, `height` blocks high, 3×3 with a doorway facing north. */
function tower(height: number): Json {
  return new BoxBuilder([3, height, 3])
    .fill([0, 0, 0], [2, height - 1, 2], 'minecraft:stone_bricks')
    .fill([1, 1, 1], [1, height - 2, 1], 'minecraft:air')
    .fill([1, 1, 0], [1, 2, 0], 'minecraft:air')
    .build();
}

/** A jigsaw structure in `biomes` starting from `pool`. */
function jigsawStructure(biomes: string, pool: string): Json {
  return {
    type: 'minecraft:jigsaw',
    biomes,
    step: 'surface_structures',
    spawn_overrides: {},
    terrain_adaptation: 'beard_thin',
    start_pool: pool,
    size: 1,
    start_height: { absolute: 0 },
    project_start_to_heightmap: 'WORLD_SURFACE_WG',
    max_distance_from_center: 80,
    use_expansion_hack: false,
  };
}

export const structureExamples: readonly ExampleProject[] = [
  defineExample({
    id: 'example_structure_template',
    title: 'Structure template',
    description: 'A small stone well, stored as JSON and exported as a structure .nbt file.',
    kind: KINDS.structureTemplate,
    category: CATEGORY,
    tags: ['structure', 'nbt', '/place'],
    build: ({ namespace }) => {
      const id = rl(namespace, 'stone_well');
      return {
        elements: [
          element(
            id,
            KINDS.structureTemplate,
            new BoxBuilder([3, 2, 3])
              .fill([0, 0, 0], [2, 0, 2], 'minecraft:cobblestone')
              .fill([0, 1, 0], [2, 1, 2], 'minecraft:cobblestone')
              .set([1, 1, 1], 'minecraft:water[level=0]')
              .build(),
            `size is the box in blocks, palette lists the block states used and blocks holds one [x, y, z, palette index] entry per block. Positions left out are structure void, so the terrain there is kept. The export writes it as stone_well.nbt in the data pack's structure folder, the same file a structure block saves. Try /place template ${id} ~ ~ ~ in game.`,
          ),
        ],
        assets: [],
      };
    },
  }),
  defineExample({
    id: 'example_template_pool',
    title: 'Template pool',
    description: 'A pool that picks a flower bed or nothing, as jigsaw blocks do.',
    kind: KINDS.templatePool,
    category: CATEGORY,
    tags: ['structure', 'jigsaw', 'pool'],
    build: ({ namespace }) => {
      const id = rl(namespace, 'garden_pieces');
      const bed = rl(namespace, 'garden/flower_bed');
      return {
        elements: [
          element(
            id,
            KINDS.templatePool,
            { fallback: 'minecraft:empty', elements: [singlePiece(bed, 'rigid', 2), emptyPiece()] },
            `A jigsaw block names a template pool, and the game picks one of its elements by weight: here the flower bed two times in three and nothing (empty_pool_element) otherwise. rigid keeps a piece's shape; terrain_matching bends it to the ground, which suits paths. fallback is the pool used when a piece does not fit or the structure is at its size limit. Point a jigsaw block's pool at ${id} to use it.`,
          ),
          element(
            bed,
            KINDS.structureTemplate,
            new BoxBuilder([3, 2, 3])
              .fill([0, 0, 0], [2, 0, 2], 'minecraft:grass_block[snowy=false]')
              .set([1, 1, 1], 'minecraft:poppy')
              .build(),
            'A 3×3 patch of grass with a poppy in the middle.',
          ),
        ],
        assets: [],
      };
    },
  }),
  defineExample({
    id: 'example_structure',
    title: 'Jigsaw structure',
    description: 'A lone tower in mountains and hills, built from one template.',
    kind: KINDS.structure,
    category: CATEGORY,
    tags: ['structure', 'jigsaw', '/locate'],
    build: ({ namespace }) => {
      const id = rl(namespace, 'lone_tower');
      const pool = rl(namespace, 'lone_tower/start');
      const template = rl(namespace, 'lone_tower/tower');
      return {
        elements: [
          element(
            id,
            KINDS.structure,
            jigsawStructure('#minecraft:is_mountain', pool),
            `A jigsaw structure starts with a piece from start_pool and attaches more pieces up to size jigsaw steps away (1 here: just the tower). biomes is a biome or biome tag where it may start, and step is the generation step it is placed in. It generates only once a structure set lists it; add one to see it in new chunks. With a set in place, /locate structure ${id} finds it.`,
          ),
          element(
            pool,
            KINDS.templatePool,
            { fallback: 'minecraft:empty', elements: [singlePiece(template, 'rigid')] },
            'The start pool: always the tower.',
          ),
          element(
            template,
            KINDS.structureTemplate,
            tower(7),
            'A hollow 3×7×3 stone brick tower with a doorway.',
          ),
        ],
        assets: [],
      };
    },
  }),
  defineExample({
    id: 'example_structure_set',
    title: 'Structure set',
    description: 'Places a small ruin across taiga biomes, spread out with random_spread.',
    kind: KINDS.structureSet,
    category: CATEGORY,
    tags: ['structure', 'placement', 'spacing'],
    build: ({ namespace }) => {
      const id = rl(namespace, 'ruins');
      const structure = rl(namespace, 'ruin');
      const pool = rl(namespace, 'ruin/start');
      const template = rl(namespace, 'ruin/stump');
      return {
        elements: [
          element(
            id,
            KINDS.structureSet,
            {
              structures: [{ structure, weight: 1 }],
              placement: {
                type: 'minecraft:random_spread',
                spacing: 40,
                separation: 12,
                salt: saltFor(id),
              },
            },
            `A structure set decides where its structures may start. random_spread divides the world into cells of spacing chunks and tries one start per cell, at least separation chunks apart (separation must be less than spacing). salt is any number; different salts keep sets from lining up. Sets load when a world opens, so reopen the world after enabling the pack, then try /locate structure ${structure}.`,
          ),
          element(
            structure,
            KINDS.structure,
            jigsawStructure('#minecraft:is_taiga', pool),
            'A one-piece jigsaw structure in taiga biomes.',
          ),
          element(
            pool,
            KINDS.templatePool,
            { fallback: 'minecraft:empty', elements: [singlePiece(template, 'rigid')] },
            'The start pool: always the ruined stump.',
          ),
          element(
            template,
            KINDS.structureTemplate,
            tower(3),
            'A 3×3×3 stump of a stone brick tower.',
          ),
        ],
        assets: [],
      };
    },
  }),
  defineExample({
    id: 'example_processor_list',
    title: 'Processor list',
    description: 'Cracks and moss stone bricks and leaves a few blocks out, for an old look.',
    kind: KINDS.processorList,
    category: CATEGORY,
    tags: ['structure', 'processor', 'weathering'],
    build: ({ namespace }) => {
      const id = rl(namespace, 'old_bricks');
      const swap = (output: string, probability: number): Json => ({
        input_predicate: {
          predicate_type: 'minecraft:random_block_match',
          block: 'minecraft:stone_bricks',
          probability,
        },
        location_predicate: { predicate_type: 'minecraft:always_true' },
        output_state: output,
      });
      return {
        elements: [
          element(
            id,
            KINDS.processorList,
            {
              processors: [
                {
                  processor_type: 'minecraft:rule',
                  rules: [
                    swap('minecraft:cracked_stone_bricks', 0.2),
                    swap('minecraft:mossy_stone_bricks', 0.2),
                  ],
                },
                { processor_type: 'minecraft:block_rot', integrity: 0.95 },
              ],
            },
            `Processors change blocks as a structure piece is placed, so one template gives many variations. The rule processor swaps stone bricks for cracked or mossy ones a fifth of the time each, and block_rot keeps only 95 percent of the blocks. Point a pool element's processors at ${id} to use it.`,
          ),
        ],
        assets: [],
      };
    },
  }),
];
