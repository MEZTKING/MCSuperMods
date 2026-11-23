/**
 * The checks of the `head_start` mechanic of `msm:game` (ADR 0132 D2; B725). Codes:
 *
 * - `games.head-start.unknown-role` (error): a held role that is not one of the game's roles; no
 *   one is held.
 * - `games.head-start.longer-than-round` (warning): a head start as long as the round or longer,
 *   so the held players never move.
 */
import type { JsonObject, Problem } from '@msm/plugin-api';
import { readGame } from '../lowering/game/names';
import { str } from '../lowering/shared-functions';
import type { MechanicCheck } from './index';

/** Every code the head start check reports. */
export const HEAD_START_PROBLEM_CODES = Object.freeze([
  'games.head-start.unknown-role',
  'games.head-start.longer-than-round',
] as const);

/** Checks one `head_start` mechanic. */
export const checkHeadStart: MechanicCheck = (mechanic: JsonObject, { game, path }): Problem[] => {
  const problems: Problem[] = [];
  const model = readGame(game);
  const held = str(mechanic.held, '');
  if (!model.roles.some((role) => role.id === held)) {
    problems.push({
      severity: 'error',
      code: 'games.head-start.unknown-role',
      elementId: game.id,
      path: `${path}/held`,
      message: `The game has no role "${held}" to hold. Pick one of its roles.`,
    });
  }
  if (
    typeof mechanic.seconds === 'number' &&
    model.length !== undefined &&
    mechanic.seconds >= model.length
  ) {
    problems.push({
      severity: 'warning',
      code: 'games.head-start.longer-than-round',
      elementId: game.id,
      path: `${path}/seconds`,
      message: `The head start (${mechanic.seconds} s) is as long as the round (${model.length} s) or longer, so the held players never move.`,
    });
  }
  return problems;
};
