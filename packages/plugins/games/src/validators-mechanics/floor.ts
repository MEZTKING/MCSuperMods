/**
 * The checks of the `floor` mechanic of `msm:game` (ADR 0132 D2; B726). Codes:
 *
 * - `games.floor.unknown-area` (error): an area the project does not have.
 * - `games.floor.other-dimension` (warning): the area is in another dimension than the game's;
 *   the floor is rebuilt in the game's.
 * - `games.floor.tall` (warning): the area is more than {@link TALL_FLOOR} blocks tall, and all
 *   of it is filled with the floor's block.
 * - `games.floor.not-rebuilt` (info): the area's corners have not reached the game (the plugin
 *   gives them to the floor before lowering), so the floor is not rebuilt between rounds.
 * - `games.floor.no-fall-out` (info): nothing puts out a player who falls through the floor.
 */
import type { Element, JsonObject, Problem } from '@msm/plugin-api';
import { areaBox } from '../lowering/area';
import { readFloor } from '../lowering/game/mechanics/floor';
import { readGame } from '../lowering/game/names';
import { dataOf, str } from '../lowering/shared-functions';
import type { MechanicCheck } from './index';

/** Every code the floor check reports. */
export const FLOOR_PROBLEM_CODES = Object.freeze([
  'games.floor.unknown-area',
  'games.floor.other-dimension',
  'games.floor.tall',
  'games.floor.not-rebuilt',
  'games.floor.no-fall-out',
] as const);

type FloorCode = (typeof FLOOR_PROBLEM_CODES)[number];

/** A floor taller than this is probably a whole arena, not a floor. */
export const TALL_FLOOR = 8;

/** Checks one `floor` mechanic. */
export const checkFloor: MechanicCheck = (
  mechanic: JsonObject,
  { game, path, input },
): Problem[] => {
  const problems: Problem[] = [];
  const report = (severity: Problem['severity'], code: FloorCode, at: string, message: string) => {
    problems.push({ severity, code, elementId: game.id, path: `${path}${at}`, message });
  };
  const model = readGame(game);
  const area: Element | undefined = input.elements.find(
    (one) => one.kind === 'msm:area' && one.id === mechanic.area,
  );
  if (area === undefined) {
    report(
      'error',
      'games.floor.unknown-area',
      '/area',
      `The area ${JSON.stringify(mechanic.area)} is not one of your project's areas. Pick the area the floor fills, or make it first.`,
    );
  } else {
    const dimension = str(dataOf(area.data).dimension, 'minecraft:overworld');
    if (dimension !== model.dimension) {
      report(
        'warning',
        'games.floor.other-dimension',
        '/area',
        `The area ${area.id} is in ${dimension}, but the game is played in ${model.dimension}; the floor is rebuilt in the game's.`,
      );
    }
    const { min, max } = areaBox(area.data);
    const height = (max[1] as number) - (min[1] as number) + 1;
    if (height > TALL_FLOOR) {
      report(
        'warning',
        'games.floor.tall',
        '/area',
        `The area ${area.id} is ${height} blocks tall, and all of it is filled with the floor's block. Make an area for the floor alone.`,
      );
    }
    if (readFloor(mechanic).box === undefined) {
      report(
        'info',
        'games.floor.not-rebuilt',
        '/area',
        'The floor is not rebuilt between rounds yet: the area is not passed to the game when it is exported.',
      );
    }
  }
  if (!model.mechanics.some((one) => one.type === 'fall_out')) {
    report(
      'info',
      'games.floor.no-fall-out',
      '',
      'Nothing puts out a player who falls through the floor: add "Falling out" below it.',
    );
  }
  return problems;
};
