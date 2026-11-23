/**
 * The checks of the `fall_out` mechanic of `msm:game` (ADR 0132 D2; B726). Codes:
 *
 * - `games.fall-out.above-floor` (warning): the height is above the top of the game's floor, so
 *   a player standing on the floor has already fallen out.
 * - `games.fall-out.back-endless` (info): `back` in an endless game: a player who joined later is
 *   put back where they joined.
 */
import type { JsonObject, Problem } from '@msm/plugin-api';
import { readFallOut } from '../lowering/game/mechanics/fall-out';
import { readGame } from '../lowering/game/names';
import { blockPos, dataOf, isRecord } from '../lowering/shared-functions';
import type { MechanicCheck } from './index';

/** Every code the fall-out check reports. */
export const FALL_OUT_PROBLEM_CODES = Object.freeze([
  'games.fall-out.above-floor',
  'games.fall-out.back-endless',
] as const);

/** Checks one `fall_out` mechanic. */
export const checkFallOut: MechanicCheck = (
  mechanic: JsonObject,
  { game, path, input },
): Problem[] => {
  const problems: Problem[] = [];
  const { belowY, action } = readFallOut(mechanic);
  const model = readGame(game);
  const floor = model.mechanics.find((one) => one.type === 'floor');
  const area =
    floor === undefined
      ? undefined
      : input.elements.find((one) => one.kind === 'msm:area' && one.id === floor.area);
  if (area !== undefined && isRecord(area.data)) {
    const top = Math.max(blockPos(dataOf(area.data).from)[1], blockPos(dataOf(area.data).to)[1]);
    if (belowY > top + 1) {
      problems.push({
        severity: 'warning',
        code: 'games.fall-out.above-floor',
        elementId: game.id,
        path: `${path}/below_y`,
        message: `Players stand on the floor at height ${top + 1}, below ${belowY}, so they would fall out at once. Pick a height under the floor.`,
      });
    }
  }
  if (action === 'back' && model.endless) {
    problems.push({
      severity: 'info',
      code: 'games.fall-out.back-endless',
      elementId: game.id,
      path: `${path}/action`,
      message: 'A player who falls is put back where they joined the game.',
    });
  }
  return problems;
};
