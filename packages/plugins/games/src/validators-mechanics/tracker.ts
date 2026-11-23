/**
 * The checks of the `tracker` mechanic of `msm:game` (ADR 0132 D2; B725). Codes:
 *
 * - `games.tracker.unknown-role` (error): a holder or target that is not one of the game's roles;
 *   the tracker does nothing.
 * - `games.tracker.same-role` (error): a role that tracks itself; the tracker does nothing.
 * - `games.tracker.many-targets` (info): a target role of more than one player; in each
 *   dimension the compass follows one of them.
 */
import type { JsonObject, Problem } from '@msm/plugin-api';
import { readGame } from '../lowering/game/names';
import { str } from '../lowering/shared-functions';
import type { MechanicCheck } from './index';

/** Every code the tracker check reports. */
export const TRACKER_PROBLEM_CODES = Object.freeze([
  'games.tracker.unknown-role',
  'games.tracker.same-role',
  'games.tracker.many-targets',
] as const);

type TrackerCode = (typeof TRACKER_PROBLEM_CODES)[number];

/** Checks one `tracker` mechanic. */
export const checkTracker: MechanicCheck = (mechanic: JsonObject, { game, path }): Problem[] => {
  const problems: Problem[] = [];
  const report = (
    severity: Problem['severity'],
    code: TrackerCode,
    at: string,
    message: string,
  ): void => {
    problems.push({ severity, code, elementId: game.id, path: `${path}${at}`, message });
  };
  const roles = readGame(game).roles;
  const holder = str(mechanic.holder, '');
  const target = str(mechanic.target, '');
  for (const [field, id, part] of [
    ['holder', holder, 'hold the compass'],
    ['target', target, 'be tracked'],
  ] as const) {
    if (!roles.some((role) => role.id === id)) {
      report(
        'error',
        'games.tracker.unknown-role',
        `/${field}`,
        `The game has no role "${id}" to ${part}. Pick one of its roles.`,
      );
    }
  }
  if (holder !== '' && holder === target) {
    report(
      'error',
      'games.tracker.same-role',
      '/target',
      'A role cannot track itself. Pick another role to point the compass at.',
    );
  }
  const targetRole = roles.find((role) => role.id === target);
  if (targetRole !== undefined && targetRole.count !== 1 && holder !== target) {
    report(
      'info',
      'games.tracker.many-targets',
      '/target',
      `"${targetRole.name}" can be more than one player; in each world the compass points at one of them.`,
    );
  }
  return problems;
};
