/**
 * The Jigsaw village-style structure starter (plan D5, D9): a small hamlet built from three
 * structure templates made by the library's box builder (a centre hut, a street piece and a
 * lamp), four template pools (`centre`, `streets`, `decorations`, `terminators`), a processor
 * list, the jigsaw structure, its structure set and the biome tag it generates in.
 *
 * Jigsaw wiring: every opening a street or lamp plugs into is a jigsaw whose `target` is
 * `<ns>:street`, and the piece that plugs in carries a receiving jigsaw named `<ns>:street`
 * (pool `minecraft:empty`). The hut's door asks the `streets` pool, a street's far end asks
 * `streets` again (falling back to `terminators`, a lamp, at the size limit) and its side asks
 * `decorations` (a lamp or nothing).
 */
import type { BundleContext, ContentBundle, Json } from '@msm/plugin-api';
import { element, KINDS, packElement, rl } from '../content/bundle';
import { BoxBuilder, emptyPiece, saltFor, singlePiece } from '../content/structures';

const EMPTY = 'minecraft:empty';

/** The ids of the hamlet content in `namespace`. */
export function hamletIds(namespace: string) {
  return {
    hut: rl(namespace, 'hamlet/centre_hut'),
    street: rl(namespace, 'hamlet/street'),
    lamp: rl(namespace, 'hamlet/lamp'),
    centrePool: rl(namespace, 'hamlet/centre'),
    streetsPool: rl(namespace, 'hamlet/streets'),
    decorationsPool: rl(namespace, 'hamlet/decorations'),
    terminatorsPool: rl(namespace, 'hamlet/terminators'),
    processors: rl(namespace, 'hamlet/mossy'),
    structure: rl(namespace, 'hamlet'),
    structureSet: rl(namespace, 'hamlets'),
    biomeTag: rl(namespace, 'has_structure/hamlet'),
    connector: rl(namespace, 'street'),
    hutDoor: rl(namespace, 'hut_door'),
    streetEnd: rl(namespace, 'street_end'),
    streetSide: rl(namespace, 'street_side'),
  };
}

/** The 5×5×5 centre hut: a plank hut on a cobblestone floor, its door facing north. */
function hut(ids: ReturnType<typeof hamletIds>): Json {
  return new BoxBuilder([5, 5, 5])
    .fill([0, 0, 0], [4, 0, 4], 'minecraft:cobblestone')
    .fill([0, 1, 0], [4, 3, 4], 'minecraft:oak_planks')
    .fill([1, 1, 1], [3, 3, 3], 'minecraft:air')
    .fill([2, 1, 0], [2, 2, 0], 'minecraft:air')
    .fill([0, 4, 0], [4, 4, 4], 'minecraft:oak_slab[type=bottom,waterlogged=false]')
    .set([2, 3, 2], 'minecraft:lantern[hanging=true,waterlogged=false]')
    .jigsaw([2, 0, 0], 'north_up', {
      pool: ids.streetsPool,
      name: ids.hutDoor,
      target: ids.connector,
      final_state: 'minecraft:cobblestone',
    })
    .build();
}

/** The 3×1×7 street: a receiving jigsaw at the near end, openings at the far end and side. */
function street(ids: ReturnType<typeof hamletIds>): Json {
  return new BoxBuilder([3, 1, 7])
    .fill([0, 0, 0], [2, 0, 6], 'minecraft:dirt_path')
    .jigsaw([1, 0, 0], 'north_up', {
      pool: EMPTY,
      name: ids.connector,
      target: EMPTY,
      final_state: 'minecraft:dirt_path',
    })
    .jigsaw([1, 0, 6], 'south_up', {
      pool: ids.streetsPool,
      name: ids.streetEnd,
      target: ids.connector,
      final_state: 'minecraft:dirt_path',
    })
    .jigsaw([0, 0, 3], 'west_up', {
      pool: ids.decorationsPool,
      name: ids.streetSide,
      target: ids.connector,
      final_state: 'minecraft:dirt_path',
    })
    .build();
}

/** The 1×4×1 lamp post: a receiving jigsaw at its foot, a glowstone top. */
function lamp(ids: ReturnType<typeof hamletIds>): Json {
  return new BoxBuilder([1, 4, 1])
    .jigsaw([0, 0, 0], 'north_up', {
      pool: EMPTY,
      name: ids.connector,
      target: EMPTY,
      final_state: 'minecraft:cobblestone',
    })
    .fill([0, 1, 0], [0, 2, 0], 'minecraft:stripped_spruce_log[axis=y]')
    .set([0, 3, 0], 'minecraft:glowstone')
    .build();
}

/**
 * The hamlet content without `pack.mcmeta`. `extraBiomes` are added to the biome tag in front
 * of `#minecraft:is_forest` (the Custom biome with a jigsaw structure starter adds its biome).
 */
export function jigsawStructureContent(
  { namespace }: BundleContext,
  extraBiomes: readonly string[] = [],
): ContentBundle {
  const ids = hamletIds(namespace);
  return {
    elements: [
      element(
        ids.hut,
        KINDS.structureTemplate,
        hut(ids),
        `The first piece of every hamlet: a 5×5×5 plank hut with a lantern inside. The jigsaw block in front of the door asks ${ids.streetsPool} for a piece whose jigsaw is named ${ids.connector}, and turns into cobblestone once the hamlet is placed. To change its shape, build it in game, save it with a structure block and import the .nbt file over this template.`,
      ),
      element(
        ids.street,
        KINDS.structureTemplate,
        street(ids),
        `A 3×1×7 dirt path. Its jigsaw at the near end is named ${ids.connector}, so it plugs into any opening that targets that name. The far end continues the street from ${ids.streetsPool} and the side asks ${ids.decorationsPool} for a lamp.`,
      ),
      element(
        ids.lamp,
        KINDS.structureTemplate,
        lamp(ids),
        `A lamp post with a glowstone top. Its foot is a jigsaw named ${ids.connector}, the name a street's near end carries, so it fits any opening that targets that name: beside a street as a decoration, or at the end of one as a terminator.`,
      ),
      element(
        ids.processors,
        KINDS.processorList,
        {
          processors: [
            {
              processor_type: 'minecraft:rule',
              rules: [
                {
                  input_predicate: {
                    predicate_type: 'minecraft:random_block_match',
                    block: 'minecraft:cobblestone',
                    probability: 0.3,
                  },
                  location_predicate: { predicate_type: 'minecraft:always_true' },
                  output_state: 'minecraft:mossy_cobblestone',
                },
              ],
            },
          ],
        },
        'Turns about a third of the cobblestone mossy each time a piece is placed, so no two huts look the same. The centre pool applies it to the hut.',
      ),
      element(
        ids.centrePool,
        KINDS.templatePool,
        { fallback: EMPTY, elements: [singlePiece(ids.hut, 'rigid', 1, ids.processors)] },
        'The start pool of the structure: always the hut, kept rigid so its floor stays flat, weathered by the mossy processor list.',
      ),
      element(
        ids.streetsPool,
        KINDS.templatePool,
        {
          fallback: ids.terminatorsPool,
          elements: [singlePiece(ids.street, 'terrain_matching')],
        },
        `Streets follow the terrain (terrain_matching). When the structure reaches its size limit, or a street does not fit, the game takes a piece from the fallback pool ${ids.terminatorsPool} instead.`,
      ),
      element(
        ids.decorationsPool,
        KINDS.templatePool,
        { fallback: EMPTY, elements: [singlePiece(ids.lamp, 'rigid'), emptyPiece(2)] },
        'Beside a street: a lamp one time in three, otherwise nothing (the empty pool element).',
      ),
      element(
        ids.terminatorsPool,
        KINDS.templatePool,
        { fallback: EMPTY, elements: [singlePiece(ids.lamp, 'rigid')] },
        'Ends a street with a lamp. A terminator pool should hold small pieces that open no further jigsaws.',
      ),
      element(
        ids.structure,
        KINDS.structure,
        {
          type: 'minecraft:jigsaw',
          biomes: `#${ids.biomeTag}`,
          step: 'surface_structures',
          spawn_overrides: {},
          terrain_adaptation: 'beard_thin',
          start_pool: ids.centrePool,
          size: 4,
          start_height: { absolute: 0 },
          project_start_to_heightmap: 'WORLD_SURFACE_WG',
          max_distance_from_center: 80,
          use_expansion_hack: false,
        },
        `A jigsaw structure: it starts with a piece from ${ids.centrePool} on the surface (WORLD_SURFACE_WG) and attaches pieces up to 4 jigsaw steps away. biomes names the biome tag it may start in, and beard_thin blends the terrain under it. Find one with /locate structure ${ids.structure}.`,
      ),
      element(
        ids.structureSet,
        KINDS.structureSet,
        {
          structures: [{ structure: ids.structure, weight: 1 }],
          placement: {
            type: 'minecraft:random_spread',
            spacing: 24,
            separation: 8,
            salt: saltFor(ids.structureSet),
          },
        },
        `Without a structure set a structure never generates. random_spread tries one hamlet in each 24×24 chunk cell, at least 8 chunks from its neighbours, and the salt keeps its positions apart from other structures. Structure sets load when a world opens, so new chunks of an existing world get hamlets after the pack is enabled and the world reopened.`,
      ),
      element(
        ids.biomeTag,
        KINDS.tagWorldgenBiome,
        { values: [...extraBiomes, '#minecraft:is_forest'] },
        `The biomes ${ids.structure} may start in. Vanilla names these tags has_structure/<structure>; listing #minecraft:is_forest covers every vanilla forest.`,
      ),
    ],
    assets: [],
  };
}

/** The Jigsaw village-style structure starter. */
export function jigsawStructureBundle(context: BundleContext): ContentBundle {
  const content = jigsawStructureContent(context);
  return {
    elements: [
      packElement(
        context.namespace,
        `${context.projectName}: a jigsaw hamlet in forests`,
        'The pack description shown in the data pack list.',
      ),
      ...content.elements,
    ],
    assets: content.assets,
  };
}
