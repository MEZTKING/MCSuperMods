/**
 * The checks of the `border` mechanic of `msm:game` (ADR 0132 D2; B726). Codes:
 *
 * - `games.border.grows` (warning): the border "shrinks" to a size larger than it starts.
 * - `games.border.after-round` (warning): the shrinking starts after the round's length, so it
 *   never happens.
 */
import type { JsonObject, Problem } from '@msm/plugin-api';
import { readBorder } from '../lowering/game/mechanics/border';
import { readGame } from '../lowering/game/names';
import type { MechanicCheck } from './index';

/** Every code the border check reports. */
export const BORDER_PROBLEM_CODES = Object.freeze([
  'games.border.grows',
  'games.border.after-round',
] as const);

/** Checks one `border` mechanic. */
export const checkBorder: MechanicCheck = (mechanic: JsonObject, { game, path }): Problem[] => {
  const problems: Problem[] = [];
  const { size, shrink } = readBorder(mechanic);
  if (shrink === undefined) return problems;
  if (shrink.to > size) {
    problems.push({
      severity: 'warning',
      code: 'games.border.grows',
      elementId: game.id,
      path: `${path}/shrink/to`,
      message: `The border starts ${size} blocks across and would grow to ${shrink.to}. Pick a smaller size to shrink to.`,
    });
  }
  const length = readGame(game).length;
  if (length !== undefined && shrink.after >= length) {
    problems.push({
      severity: 'warning',
      code: 'games.border.after-round',
      elementId: game.id,
      path: `${path}/shrink/after_seconds`,
      message: `The round lasts ${length} seconds, so a border that starts shrinking after ${shrink.after} never does.`,
    });
  }
  return problems;
};
