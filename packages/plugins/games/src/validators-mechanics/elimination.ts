/**
 * The checks of the `elimination` mechanic of `msm:game` (ADR 0132 D2; B726). Codes:
 *
 * - `games.elimination.no-lobby` (warning): players who are out go back to the lobby, but the
 *   game has none; they watch as spectators.
 * - `games.elimination.endless` (info): an endless game with lives: a player who is out watches
 *   until someone stops the game, as there is no next round.
 */
import type { JsonObject, Problem } from '@msm/plugin-api';
import { readGame } from '../lowering/game/names';
import type { MechanicCheck } from './index';

/** Every code the elimination check reports. */
export const ELIMINATION_PROBLEM_CODES = Object.freeze([
  'games.elimination.no-lobby',
  'games.elimination.endless',
] as const);

/** Checks one `elimination` mechanic. */
export const checkElimination: MechanicCheck = (
  mechanic: JsonObject,
  { game, path },
): Problem[] => {
  const problems: Problem[] = [];
  const model = readGame(game);
  if (mechanic.out === 'lobby' && model.lobby === undefined) {
    problems.push({
      severity: 'warning',
      code: 'games.elimination.no-lobby',
      elementId: game.id,
      path: `${path}/out`,
      message:
        'Players who are out should go back to the lobby, but the game has no lobby: they watch as spectators.',
    });
  }
  if (model.endless) {
    problems.push({
      severity: 'info',
      code: 'games.elimination.endless',
      elementId: game.id,
      path: `${path}/lives`,
      message:
        'This game never ends by itself, so a player who runs out of lives watches until the game is stopped.',
    });
  }
  return problems;
};
