/**
 * The win condition `last_standing` (ADR 0132 D2; B724, the spike's K14): the last player, or
 * the last team, still in wins. A round started with two or more players (or teams) is won when
 * at most one is left; a practice round, started with one, is never won this way and ends with
 * nobody winning once that player is out (K14). By teams, the teams counted are the game's own
 * (`teams/count`), and every player of the round on the last team wins, out or not; a game with
 * no teams counts players.
 */
import type { JsonObject } from '@msm/plugin-api';
import type { GameBuild } from '../build';
import { tagWinners, teamWonFunction, type WinLowering } from './shared';

export function lowerLastStandingWin(
  build: GameBuild,
  win: JsonObject,
  index: number,
): WinLowering {
  const { game, names } = build;
  const objective = names.objective;
  const inSelector = `@a[tag=${names.tag('in')}]`;
  const byTeams = win.by === 'teams' && game.teams.length > 0;
  const both = (
    first: string,
    firstRange: string,
    second: string,
    secondRange: string,
    command: string,
  ): string =>
    build.form('if_score_if_score_run', {
      holder: names.holder(first),
      objective,
      range: firstRange,
      holder_2: names.holder(second),
      objective_2: objective,
      range_2: secondRange,
      command,
    });
  const started = byTeams ? 'teams_started' : 'started';
  const left = byTeams ? 'teams' : 'alive';
  const check = [
    ...(byTeams ? [build.run('teams/count')] : build.count('alive', inSelector)),
    both(started, '2..', left, '..1', build.run(`win/${index}/won`)),
    both(started, '..1', left, '..0', build.run('end')),
  ];
  const won = byTeams
    ? game.teams.map((team, j) =>
        build.form('if_entity_run', {
          entities: `@a[tag=${names.tag('in')},team=${names.team(team)}]`,
          command: build.run(teamWonFunction(j)),
        }),
      )
    : [tagWinners(build, inSelector)];
  won.push(build.run('end'));
  return {
    check,
    files: [build.file(`win/${index}/won`, won)],
    begin: [],
    end: [],
    teamWins: byTeams,
  };
}
