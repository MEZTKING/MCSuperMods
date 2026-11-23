/**
 * The checks of the `team_base` mechanic of `msm:game` (ADR 0132 D2; B726). Codes:
 *
 * - `games.team-base.unknown-team` (error): a team the project does not have.
 * - `games.team-base.duplicate-team` (error): two bases of one team; only the first counts.
 * - `games.team-base.no-teams` (warning): players are never put into the bases' teams (the
 *   lobby splits nobody and no role names one), so nobody has a base.
 * - `games.team-base.spawn-on-bed` (warning): the spawn is the bed's own block.
 */
import type { JsonObject, Problem } from '@msm/plugin-api';
import { readTeamBases } from '../lowering/game/mechanics/team-base';
import { readGame } from '../lowering/game/names';
import { isRecord } from '../lowering/shared-functions';
import type { MechanicCheck } from './index';

/** Every code the team base check reports. */
export const TEAM_BASE_PROBLEM_CODES = Object.freeze([
  'games.team-base.unknown-team',
  'games.team-base.duplicate-team',
  'games.team-base.no-teams',
  'games.team-base.spawn-on-bed',
] as const);

type TeamBaseCode = (typeof TEAM_BASE_PROBLEM_CODES)[number];

/** Checks one `team_base` mechanic. */
export const checkTeamBase: MechanicCheck = (
  mechanic: JsonObject,
  { game, path, input },
): Problem[] => {
  const problems: Problem[] = [];
  const report = (
    severity: Problem['severity'],
    code: TeamBaseCode,
    at: string,
    message: string,
  ) => {
    problems.push({ severity, code, elementId: game.id, path: `${path}${at}`, message });
  };
  const teams = new Set<string>(
    input.elements.filter((one) => one.kind === 'msm:team').map((one) => one.id),
  );
  const seen = new Set<string>();
  const list = Array.isArray(mechanic.bases) ? mechanic.bases : [];
  list.forEach((base, j) => {
    if (!isRecord(base) || typeof base.team !== 'string') return;
    if (!teams.has(base.team)) {
      report(
        'error',
        'games.team-base.unknown-team',
        `/bases/${j}/team`,
        `The team ${JSON.stringify(base.team)} is not one of your project's teams. Pick one, or make it first.`,
      );
    } else if (seen.has(base.team)) {
      report(
        'error',
        'games.team-base.duplicate-team',
        `/bases/${j}/team`,
        `${base.team} has two bases; only the first counts. Give each team one base.`,
      );
    }
    seen.add(base.team);
  });
  readTeamBases(mechanic).forEach((base, j) => {
    if (base.bed.every((n, i) => n === base.spawn[i])) {
      report(
        'warning',
        'games.team-base.spawn-on-bed',
        `/bases/${j}/spawn`,
        'Players would come back inside the bed. Put the spawn beside it.',
      );
    }
  });
  const model = readGame(game);
  const split = model.splitTeams.length > 0;
  const byRole = model.roles.some((role) => role.team !== undefined && seen.has(role.team));
  if (!split && !byRole && seen.size > 0) {
    report(
      'warning',
      'games.team-base.no-teams',
      '/bases',
      'Players are never put into these teams (the lobby splits nobody and no role names one), so nobody has a base.',
    );
  }
  return problems;
};
