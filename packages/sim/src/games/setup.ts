/**
 * The games grounds' plans and the mock first join (ADR 0117 D4, B558).
 *
 * {@link voidGamesGround} makes the void ground of a project: the world setup's start structure
 * in empty sky, the area's corner set so the lowered functions' world positions land in the
 * area, and a {@link JoinPlan}. {@link structureGamesGround} makes the structure ground of one
 * template, its corner where a games area rebuilds it (or the world setup starts on it).
 *
 * The join (run by `GamesArea` at the first tick after the ground loads, once, and again after
 * "Clear the area") does what B551's first-join advancement does in the game: the player stands
 * at the world spawn on the start (the `start` function's `tp`), takes the setup's game mode, and
 * the setup's own `first_join` function runs as the player through the function engine (the kit
 * by `give`, effects, the welcome and the dialog). The start structure itself is already in the
 * ground; the game places it once with `place template` at the first join.
 *
 * Pure: the plans are data; the join works on a host.
 */

import type { Json } from '@msm/plugin-api';
import { type GamesGround, structureGround } from '../grounds/structure.js';
import { DEFAULT_START_AT, voidGround } from '../grounds/void.js';
import type { BlockPos, Vec3 } from '../types.js';
import {
  AREA_KIND,
  elementsOf,
  type GamesProject,
  idWords,
  listOf,
  ONE_BLOCK_KIND,
  OVERWORLD,
  objectOf,
  posOf,
  textOf,
  worldSetupFunction,
  worldSetupOf,
} from './data.js';

/** Block ids a games ground keeps ready to draw besides its own: chests and the generator's. */
export const GAMES_EXTRA_BLOCKS: readonly string[] = Object.freeze([
  'minecraft:chest',
  'minecraft:cobblestone',
]);

/** What the join does (ADR 0117 D4: the player on the start, holding the kit). */
export interface JoinPlan {
  /** The world setup's id. */
  readonly worldSetup: string;
  /** The player's feet at the world spawn, in area positions, or `null` without a start. */
  readonly spawn: Vec3 | null;
  /** The setup's game mode (`survival`, `creative`, `adventure`, `spectator`). */
  readonly gameMode: string;
  /** The setup's first-join function (`<ns>:msm_games/world_setup/first_join`). */
  readonly firstJoin: string;
  /** The kit's items, given from the data when the function is not in the files. */
  readonly items: readonly { readonly item: string; readonly count: number }[];
}

/** What a games ground needs once it is in. */
export interface GamesPlan {
  readonly kind: 'void' | 'structure';
  /** The world position of the area's block 0, 0, 0. */
  readonly corner: BlockPos;
  /** The mock first join, or `null` (no world setup, or a structure ground). */
  readonly join: JoinPlan | null;
  /** Lines for "What happened" once the ground is in. */
  readonly lines: readonly string[];
}

/** A games ground and its plan. */
export interface GamesGroundMade {
  readonly ground: GamesGround;
  readonly plan: GamesPlan;
}

/** The blocks every one block of the project can turn into (to prepare their pictures). */
export function oneBlockBlocks(games: GamesProject): string[] {
  const out = new Set<string>();
  for (const element of elementsOf(games, ONE_BLOCK_KIND)) {
    for (const phase of listOf(objectOf(element.data).phases)) {
      for (const entry of listOf(objectOf(phase).blocks)) {
        const block = textOf(objectOf(entry).block);
        if (block !== '') out.add(block);
      }
    }
  }
  return [...out].sort();
}

/** The first one block in the Overworld, as a place to centre on. */
function firstOneBlock(games: GamesProject): readonly [number, number, number] | undefined {
  for (const element of elementsOf(games, ONE_BLOCK_KIND)) {
    const data = objectOf(element.data);
    const dimension = textOf(data.dimension);
    if (dimension !== '' && dimension !== OVERWORLD) continue;
    return posOf(data.at);
  }
  return undefined;
}

/** The void ground of a project; see the module comment. */
export function voidGamesGround(games: GamesProject): GamesGroundMade {
  const setup = worldSetupOf(games);
  const data = objectOf(setup?.data);
  const start = objectOf(data.start);
  const structure = textOf(start.structure);
  const at = posOf(start.at, DEFAULT_START_AT);
  const template = structure === '' ? undefined : games.templates.get(structure);
  const keep = [...oneBlockBlocks(games), ...GAMES_EXTRA_BLOCKS];
  const focus = firstOneBlock(games);
  const ground = voidGround({
    ...(template === undefined ? {} : { template }),
    at,
    ...(focus === undefined ? {} : { focus }),
    keep,
  });
  const lines: string[] = [];
  if (setup === undefined) {
    lines.push(
      'Your project has no world setup, so the sky is empty: make one ("How my world starts") to start on an island.',
    );
  } else if (structure === '') {
    lines.push('Your world setup starts on no structure, so the sky is empty.');
  } else if (template === undefined) {
    lines.push(
      `The start structure ${structure} is not one of your project's structures, so the sky is empty here; the game places it if it has it.`,
    );
  } else {
    lines.push(
      `${idWords(structure)} floats in empty sky, as the game places it at the first join.`,
    );
  }
  if (ground.cut) {
    lines.push('The start structure is bigger than the test area: the part outside is cut off.');
  }
  const world = objectOf(data.world);
  const type = textOf(world.type);
  if (setup !== undefined && type !== '' && type !== 'void') {
    lines.push(
      'Your world setup makes land around the start; here the start is shown in empty sky (try "My world generation" for the land).',
    );
  }
  if (textOf(start.when) === 'world_generation') {
    lines.push(
      'In the game this start is placed while the world generates and may be turned a quarter or half way; here it is shown as it is built.',
    );
  }
  const join = setup === undefined ? null : joinPlan(setup.id, data, at, ground);
  return { ground, plan: { kind: 'void', corner: ground.corner, join, lines } };
}

function joinPlan(
  id: string,
  data: Readonly<Record<string, Json>>,
  at: readonly [number, number, number],
  ground: GamesGround,
): JoinPlan {
  const start = objectOf(data.start);
  const hasStart = textOf(start.structure) !== '' || start.spawn !== undefined;
  const spawn = posOf(start.spawn);
  const items = listOf(objectOf(data.new_player).items).flatMap((entry) => {
    const object = objectOf(entry);
    const item = textOf(object.item);
    const count = typeof object.count === 'number' ? Math.max(1, Math.trunc(object.count)) : 1;
    return item === '' ? [] : [{ item, count }];
  });
  return {
    worldSetup: id,
    spawn: hasStart
      ? {
          x: at[0] + spawn[0] - ground.corner.x + 0.5,
          y: at[1] + spawn[1] - ground.corner.y,
          z: at[2] + spawn[2] - ground.corner.z + 0.5,
        }
      : null,
    gameMode: textOf(data.game_mode) === '' ? 'survival' : textOf(data.game_mode),
    firstJoin: worldSetupFunction(id, 'first_join'),
    items,
  };
}

/** The project's structure templates a structure ground can be made of, by id. */
export function groundTemplates(games: GamesProject): string[] {
  return [...games.templates.keys()].sort();
}

/**
 * Where the game places a template's corner: the first games area rebuilding from it, else the
 * world setup's start on it; `undefined` when neither uses it.
 */
export function templateWorldCorner(
  games: GamesProject,
  templateId: string,
): readonly [number, number, number] | undefined {
  for (const area of elementsOf(games, AREA_KIND)) {
    for (const entry of listOf(objectOf(objectOf(area.data).reset).structures)) {
      const object = objectOf(entry);
      if (textOf(object.structure) === templateId) return posOf(object.at);
    }
  }
  const start = objectOf(objectOf(worldSetupOf(games)?.data).start);
  if (textOf(start.structure) === templateId) return posOf(start.at, DEFAULT_START_AT);
  return undefined;
}

/** The structure ground of one template, or `undefined` when the project has no such template. */
export function structureGamesGround(
  games: GamesProject,
  templateId: string,
): GamesGroundMade | undefined {
  const template = games.templates.get(templateId);
  if (template === undefined) return undefined;
  const corner = templateWorldCorner(games, templateId);
  const ground = structureGround(
    template,
    corner === undefined ? undefined : { x: corner[0], y: corner[1], z: corner[2] },
    [...oneBlockBlocks(games), ...GAMES_EXTRA_BLOCKS],
  );
  const lines = [
    corner === undefined
      ? `${idWords(templateId)} is the ground, its corner at the world's 0, 0, 0 (no area rebuilds from it).`
      : `${idWords(templateId)} is the ground, where the game places it (its corner at ${corner.join(', ')}).`,
  ];
  if (ground.cut) {
    lines.push('The structure is bigger than the test area: the part outside is cut off.');
  }
  return { ground, plan: { kind: 'structure', corner: ground.corner, join: null, lines } };
}
