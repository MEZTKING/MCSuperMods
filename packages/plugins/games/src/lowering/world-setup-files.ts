/**
 * Shared pieces of the `msm:world_setup` lowering (ADR 0113 D2, D9; ADR 0114): the element's
 * data as the lowering reads it, the generated names under `<ns>:msm_games/...` and the JSON
 * output file helpers. Functions, the shared `load` tag, command forms (`fillForm`) and errors
 * come from B552's `shared-functions.ts`. Folder names come from `target.folders` and world
 * facts from `target.worlds`; nothing here is version specific.
 */
import type {
  Element,
  Json,
  JsonObject,
  OutputFile,
  TargetFacts,
  WorldFacts,
} from '@msm/plugin-api';
import {
  GAMES_FUNCTION_ROOT,
  GamesLoweringError,
  gamesFunctionId,
  splitId,
} from './shared-functions';

// ---------------------------------------------------------------------------------------------
// The element's data
// ---------------------------------------------------------------------------------------------

/** A block position `[x, y, z]`. */
export type BlockPos = readonly [number, number, number];

/** `world.type` (ADR 0114 D1). */
export type WorldTypeName = 'vanilla' | 'void' | 'flat' | 'sky_islands' | 'preset';

/** One flat layer, bottom first. */
export interface FlatLayer {
  block: string;
  height: number;
}

/** `world` (ADR 0114 D1). */
export interface GameWorld {
  type: WorldTypeName;
  preset?: string;
  layers?: readonly FlatLayer[];
  biome?: string;
  nether: 'vanilla' | 'void';
  end: 'vanilla' | 'void';
}

/** `start` (ADR 0114 D2), with its defaults filled in. */
export interface Start {
  structure: string;
  at: BlockPos;
  spawn: BlockPos;
  when: 'first_join' | 'world_generation';
}

/** One kit item. */
export interface KitItem {
  item: string;
  count: number;
  slot?: string;
}

/** One kit effect. */
export interface KitEffect {
  effect: string;
  seconds: number;
  amplifier?: number;
  hide_particles?: boolean;
}

/** `new_player` (ADR 0113 D2). */
export interface NewPlayer {
  items?: readonly KitItem[];
  loot_table?: string;
  message?: string;
  dialog?: string;
  effects?: readonly KitEffect[];
}

/** `msm:world_setup` data with the defaults of `games.mcdoc` filled in. */
export interface WorldSetup {
  world: GameWorld;
  start?: Start;
  spawnRadius: number;
  gameMode: string;
  difficulty: string;
  gameRules: Readonly<Record<string, boolean | number>>;
  newPlayer?: NewPlayer;
  goals?: string;
}

/** Where a start structure's corner goes when `start.at` is left out. */
export const DEFAULT_START_AT: BlockPos = [0, 64, 0];

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPos = (value: Json | undefined): value is [number, number, number] =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every((axis) => typeof axis === 'number' && Number.isInteger(axis));

/**
 * Reads a world setup's data, filling in the defaults the schema names (`start.at`
 * `[0, 64, 0]`, `start.when` `first_join`, `spawn_radius` 0). The schema has already checked the
 * shape; this throws only on data that cannot be lowered at all.
 *
 * @throws {@link GamesLoweringError} If `world` or a required field is missing.
 */
export function readWorldSetup(element: Element): WorldSetup {
  const data = element.data;
  if (!isObject(data) || !isObject(data.world)) {
    throw new GamesLoweringError(`World setup ${element.id}: "world" is missing.`);
  }
  const world = data.world as unknown as GameWorld;
  const setup: WorldSetup = {
    world,
    spawnRadius: typeof data.spawn_radius === 'number' ? data.spawn_radius : 0,
    gameMode: typeof data.game_mode === 'string' ? data.game_mode : 'survival',
    difficulty: typeof data.difficulty === 'string' ? data.difficulty : 'normal',
    gameRules: isObject(data.game_rules)
      ? (Object.fromEntries(
          Object.entries(data.game_rules).filter(
            ([, value]) => typeof value === 'boolean' || typeof value === 'number',
          ),
        ) as Record<string, boolean | number>)
      : {},
  };
  if (isObject(data.start)) {
    const start = data.start;
    if (typeof start.structure !== 'string' || !isPos(start.spawn)) {
      throw new GamesLoweringError(
        `World setup ${element.id}: the start needs a structure and a spawn.`,
      );
    }
    setup.start = {
      structure: start.structure,
      at: isPos(start.at) ? start.at : DEFAULT_START_AT,
      spawn: start.spawn,
      when: start.when === 'world_generation' ? 'world_generation' : 'first_join',
    };
  }
  if (isObject(data.new_player)) setup.newPlayer = data.new_player as unknown as NewPlayer;
  if (typeof data.goals === 'string') setup.goals = data.goals;
  return setup;
}

// ---------------------------------------------------------------------------------------------
// Names (ADR 0113 D9)
// ---------------------------------------------------------------------------------------------

/** The generated names of one world setup's files, all under `<ns>:msm_games/`. */
export interface WorldSetupNames {
  namespace: string;
  /** The element id's path, which the world preset and its lang key use. */
  path: string;
  /** The world preset, the element's own id. */
  preset: string;
  /** The project sky biome, `<ns>:msm_games/sky`. */
  skyBiome: string;
  /** The world storage holding the "once" flags, `<ns>:msm_games`. */
  storage: string;
  /** Function ids, `<ns>:msm_games/world_setup/<name>`. */
  fn(name: string): string;
  /** Function paths below `<ns>:msm_games/`, `world_setup/<name>`. */
  fnPath(name: string): string;
  /** The first-join advancement, `<ns>:msm_games/first_join`. */
  firstJoin: string;
  /** The `world_generation` route's jigsaw, pool and set, `<ns>:msm_games/start`. */
  startStructure: string;
}

/** The generated names of the world setup `id`. */
export function worldSetupNames(id: string): WorldSetupNames {
  const { namespace, path } = splitId(id);
  const games = `${namespace}:${GAMES_FUNCTION_ROOT}`;
  return {
    namespace,
    path,
    preset: id,
    skyBiome: `${games}/sky`,
    storage: games,
    fn: (name) => gamesFunctionId(namespace, `world_setup/${name}`),
    fnPath: (name) => `world_setup/${name}`,
    firstJoin: `${games}/first_join`,
    startStructure: `${games}/start`,
  };
}

// ---------------------------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------------------------

/** A data pack JSON file of `id` in `data/<ns>/<folder>/` (a folder name from `target.folders`). */
export function dataFile(
  folder: string,
  id: string,
  contents: Json,
  schema: string,
  merge?: 'tag',
): OutputFile {
  const { namespace, path } = splitId(id);
  return {
    path: `data/${namespace}/${folder}/${path}.json`,
    contents,
    layer: 'datapack',
    schema,
    ...(merge === undefined ? {} : { merge }),
  };
}

/** A worldgen JSON file `data/<ns>/<worldgen>/<registry>/<path>.json`. */
export function worldgenFile(
  target: TargetFacts,
  registry: string,
  id: string,
  contents: Json,
): OutputFile {
  return dataFile(
    `${target.folders.data.worldgen}/${registry}`,
    id,
    contents,
    `resource:worldgen/${registry}`,
  );
}

/**
 * A vanilla tag file `data/minecraft/<tags>/<registry>/<tag>.json` holding `values`, declared
 * `merge: 'tag'` (with the tag kind's own schema) so other elements may add to it.
 */
export function vanillaTagFile(
  target: TargetFacts,
  registry: string,
  tag: string,
  values: readonly Json[],
): OutputFile {
  return dataFile(
    `${target.folders.data.tags}/${registry}`,
    `minecraft:${tag}`,
    { values: [...values] },
    `tag:${registry}`,
    'tag',
  );
}

/** Keys of `assets/<ns>/<lang>/en_us.json`, declared `merge: 'object'`. */
export function langFile(
  target: TargetFacts,
  namespace: string,
  entries: Readonly<Record<string, string>>,
): OutputFile {
  return {
    path: `assets/${namespace}/${target.folders.resource.lang}/en_us.json`,
    contents: { ...entries },
    layer: 'resourcepack',
    schema: '::java::assets::lang::Lang',
    merge: 'object',
  };
}

// ---------------------------------------------------------------------------------------------
// Facts and command text
// ---------------------------------------------------------------------------------------------

/**
 * The target's world facts.
 *
 * @throws {@link GamesLoweringError} If the target has none (plugin API before 1.22.0).
 */
export function worldFacts(target: TargetFacts): WorldFacts {
  if (target.worlds === undefined) {
    throw new GamesLoweringError(`Target ${target.id} has no world facts for the game kits.`);
  }
  return target.worlds;
}

/** A position as command text. */
export const posText = (pos: readonly number[]): string => pos.join(' ');

/** `a + b`, axis by axis. */
export function addPos(a: BlockPos, b: BlockPos): BlockPos {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/** The id without a `minecraft:` prefix, as vanilla commands accept a game rule name. */
export const bareVanilla = (id: string): string =>
  id.startsWith('minecraft:') ? id.slice('minecraft:'.length) : id;

/** Whether a game rule name is a vanilla one (no namespace, or `minecraft:`). */
export const isVanillaRuleName = (name: string): boolean =>
  !name.includes(':') || name.startsWith('minecraft:');
