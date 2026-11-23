/**
 * The start structure of a `msm:world_setup` (ADR 0114 D2; B547 Y1 to Y3).
 *
 * - `first_join` (the default): the function `<ns>:msm_games/world_setup/start`, which the
 *   first player's first-join function runs once for the world (flag `start` in the storage
 *   `<ns>:msm_games`). It `forceload`s the start's area (48 by 48 columns from `at`, the largest
 *   template a structure block saves, limit M4), places the template with `place template`, lets
 *   the area go, sets the world spawn to `at + spawn`, sets the flag and teleports the player to
 *   the middle of the spawn block. This works with "Generate structures" off, in a world made
 *   before the pack and in vanilla packs (limit M3).
 * - `world_generation` (Advanced): a one-piece rigid jigsaw structure, its pool and a
 *   `dimension_origin` structure set (`<ns>:msm_games/start`) that the game places once, in
 *   chunk 0 0, while the world generates. The piece's bottom is at `start_height - 1`, so the
 *   structure starts at `at.y + 1` and its bottom is at `at.y`; the game turns it at random about
 *   x 0, z 0, and places nothing with "Generate structures" off. The start function still sets
 *   the world spawn and teleports the first player.
 */
import type { JsonObject, OutputFile, TargetFacts } from '@msm/plugin-api';
import { fillForm, functionFile, GamesLoweringError } from './shared-functions';
import {
  addPos,
  type Start,
  type WorldSetup,
  type WorldSetupNames,
  worldFacts,
  worldgenFile,
} from './world-setup-files';
import { OVERWORLD_BIOME_TAG, overworldBiome } from './world-type';

/** How many columns from `at` the start's area spans on x and z (limit M4). */
export const START_AREA = 48;

/** The storage flag set once the start is placed. */
export const START_FLAG = 'start';

/** The vanilla structure placement the `world_generation` route uses. */
export const DIMENSION_ORIGIN = 'minecraft:dimension_origin';

/** The world spawn of a start: `at + spawn`. */
export const startSpawn = (start: Start) => addPos(start.at, start.spawn);

/** The structure sets the overworld must list for the start (empty on the `first_join` route). */
export function startStructureSets(setup: WorldSetup, names: WorldSetupNames): string[] {
  return setup.start?.when === 'world_generation' ? [names.startStructure] : [];
}

/** The lines of the start function. */
function startLines(start: Start, names: WorldSetupNames, target: TargetFacts): string[] {
  const spawn = startSpawn(start);
  const [ax, ay, az] = start.at;
  const area = { x1: ax, z1: az, x2: ax + START_AREA - 1, z2: az + START_AREA - 1 };
  const lines: string[] = [];
  if (start.when === 'first_join') {
    lines.push(
      `# Places the start structure ${start.structure} once for the world, at the first player's first join.`,
      fillForm(target, 'forceload_add', area),
      fillForm(target, 'place_template', { template: start.structure, x: ax, y: ay, z: az }),
      fillForm(target, 'forceload_remove', area),
    );
  } else {
    lines.push(
      `# The game placed ${start.structure} while the world generated; this sets the spawn on it once.`,
    );
  }
  lines.push(
    fillForm(target, 'set_world_spawn', { x: spawn[0], y: spawn[1], z: spawn[2] }),
    fillForm(target, 'storage_set_value', {
      storage: names.storage,
      nbt_path: START_FLAG,
      nbt: '1b',
    }),
    fillForm(target, 'teleport', {
      entities: '@s',
      x: spawn[0] + 0.5,
      y: spawn[1],
      z: spawn[2] + 0.5,
    }),
  );
  return lines;
}

/** The `world_generation` route's jigsaw structure, pool and `dimension_origin` set. */
function worldGenerationFiles(
  setup: WorldSetup,
  start: Start,
  names: WorldSetupNames,
  target: TargetFacts,
): OutputFile[] {
  if (!worldFacts(target).structurePlacements.includes(DIMENSION_ORIGIN)) {
    throw new GamesLoweringError(
      `Target ${target.id} has no ${DIMENSION_ORIGIN} placement for a start placed while the world generates.`,
    );
  }
  const id = names.startStructure;
  const structure: JsonObject = {
    type: 'minecraft:jigsaw',
    biomes: overworldBiome(setup, names) ?? OVERWORLD_BIOME_TAG,
    step: 'surface_structures',
    spawn_overrides: {},
    terrain_adaptation: 'none',
    start_pool: id,
    size: 1,
    start_height: { absolute: start.at[1] + 1 },
    max_distance_from_center: 80,
    use_expansion_hack: false,
  };
  const pool: JsonObject = {
    fallback: 'minecraft:empty',
    elements: [
      {
        weight: 1,
        element: {
          element_type: 'minecraft:single_pool_element',
          location: start.structure,
          processors: 'minecraft:empty',
          projection: 'rigid',
        },
      },
    ],
  };
  const set: JsonObject = {
    structures: [{ structure: id, weight: 1 }],
    placement: { type: DIMENSION_ORIGIN },
  };
  return [
    worldgenFile(target, 'structure', id, structure),
    worldgenFile(target, 'template_pool', id, pool),
    worldgenFile(target, 'structure_set', id, set),
  ];
}

/**
 * The start's files: the start function, and on the `world_generation` route its jigsaw, pool
 * and structure set. Nothing without a start.
 */
export function lowerStart(
  setup: WorldSetup,
  names: WorldSetupNames,
  target: TargetFacts,
): OutputFile[] {
  const start = setup.start;
  if (start === undefined) return [];
  const files = [
    functionFile(target, names.namespace, names.fnPath('start'), startLines(start, names, target)),
  ];
  if (start.when === 'world_generation') {
    files.push(...worldGenerationFiles(setup, start, names, target));
  }
  return files;
}
