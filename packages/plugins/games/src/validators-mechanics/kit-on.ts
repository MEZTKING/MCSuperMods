/**
 * The checks of the `kit_on` mechanic of `msm:game` (ADR 0132 D2; B726). Codes:
 *
 * - `games.kit-on.unknown-kit` (error): a kit the project does not have.
 * - `games.kit-on.nothing` (warning): no kit at the start or at a respawn; the mechanic gives
 *   nothing.
 * - `games.kit-on.roles-have-kits` (info): every role has its own kit, so nobody gets these.
 */
import type { JsonObject, Problem } from '@msm/plugin-api';
import { readGame } from '../lowering/game/names';
import type { MechanicCheck } from './index';

/** Every code the kit-on check reports. */
export const KIT_ON_PROBLEM_CODES = Object.freeze([
  'games.kit-on.unknown-kit',
  'games.kit-on.nothing',
  'games.kit-on.roles-have-kits',
] as const);

/** Checks one `kit_on` mechanic. */
export const checkKitOn: MechanicCheck = (
  mechanic: JsonObject,
  { game, path, input },
): Problem[] => {
  const problems: Problem[] = [];
  const kits = new Set<string>(
    input.elements.filter((one) => one.kind === 'msm:kit').map((one) => one.id),
  );
  for (const field of ['start', 'respawn'] as const) {
    const kit = mechanic[field];
    if (typeof kit === 'string' && !kits.has(kit)) {
      problems.push({
        severity: 'error',
        code: 'games.kit-on.unknown-kit',
        elementId: game.id,
        path: `${path}/${field}`,
        message: `The kit ${JSON.stringify(kit)} is not one of your project's kits. Pick one, or make it first.`,
      });
    }
  }
  if (typeof mechanic.start !== 'string' && typeof mechanic.respawn !== 'string') {
    problems.push({
      severity: 'warning',
      code: 'games.kit-on.nothing',
      elementId: game.id,
      path,
      message: 'Pick a kit for the start of a round, for a respawn, or both; this gives nothing.',
    });
  }
  const roles = readGame(game).roles;
  if (roles.length > 0 && roles.every((role) => role.kit !== undefined)) {
    problems.push({
      severity: 'info',
      code: 'games.kit-on.roles-have-kits',
      elementId: game.id,
      path,
      message: 'Every role has its own kit, which players get instead of these.',
    });
  }
  return problems;
};
