/**
 * The checks of the `generators` mechanic of `msm:game` (ADR 0132 D2; B726). Codes:
 *
 * - `games.generators.unknown-team` (error): a team the project does not have; the generator
 *   never drops.
 * - `games.generators.same-place` (warning): two generators of the same item at one place; they
 *   share one stack and one cap.
 */
import type { JsonObject, Problem } from '@msm/plugin-api';
import { readGenerators } from '../lowering/game/mechanics/generators';
import { isRecord } from '../lowering/shared-functions';
import type { MechanicCheck } from './index';

/** Every code the generators check reports. */
export const GENERATORS_PROBLEM_CODES = Object.freeze([
  'games.generators.unknown-team',
  'games.generators.same-place',
] as const);

/** Checks one `generators` mechanic. */
export const checkGenerators: MechanicCheck = (
  mechanic: JsonObject,
  { game, path, input },
): Problem[] => {
  const problems: Problem[] = [];
  const teams = new Set<string>(
    input.elements.filter((one) => one.kind === 'msm:team').map((one) => one.id),
  );
  const list = Array.isArray(mechanic.generators) ? mechanic.generators : [];
  list.forEach((generator, i) => {
    if (!isRecord(generator) || typeof generator.team !== 'string') return;
    if (!teams.has(generator.team)) {
      problems.push({
        severity: 'error',
        code: 'games.generators.unknown-team',
        elementId: game.id,
        path: `${path}/generators/${i}/team`,
        message: `The team ${JSON.stringify(generator.team)} is not one of your project's teams, so this generator never drops anything. Pick one, or make it first.`,
      });
    }
  });
  const seen = new Set<string>();
  readGenerators(mechanic).forEach((generator, i) => {
    const key = `${generator.at.join(' ')} ${generator.item}`;
    if (seen.has(key)) {
      problems.push({
        severity: 'warning',
        code: 'games.generators.same-place',
        elementId: game.id,
        path: `${path}/generators/${i}/at`,
        message: 'Another generator drops the same item here; the two share one pile and one cap.',
      });
    }
    seen.add(key);
  });
  return problems;
};
