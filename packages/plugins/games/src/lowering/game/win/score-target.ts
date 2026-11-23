/**
 * The win condition `score_target` (ADR 0132 D2; B724): the first player (or team) whose score
 * of a project objective reaches the target wins. A team's score is the sum of its players' in
 * this round. The objective is set to 0 for every player of the round when it starts.
 */
import type { JsonObject } from '@msm/plugin-api';
import { objectiveName } from '../../shared-functions';
import type { GameBuild } from '../build';
import { refOrUndefined } from '../names';
import { endIfWinners, NO_WIN, tagWinners, teamWonFunction, type WinLowering } from './shared';

export function lowerScoreTargetWin(
  build: GameBuild,
  win: JsonObject,
  _index: number,
): WinLowering {
  const { game, names } = build;
  const ref = refOrUndefined(win.objective);
  const target = win.target;
  if (ref === undefined || typeof target !== 'number' || !Number.isInteger(target)) return NO_WIN;
  const scored = objectiveName(ref);
  const player = names.tag('player');
  const byTeams = win.by === 'teams' && game.teams.length > 0;
  const check: string[] = [];
  if (byTeams) {
    const sum = names.holder('sum');
    game.teams.forEach((team, j) => {
      check.push(
        build.setHolder('sum', 0),
        build.form('as_run', {
          entities: `@a[tag=${player},team=${names.team(team)}]`,
          command: build.form('score_operation', {
            holders: sum,
            objective: names.objective,
            score_operation: '+=',
            holder_2: '@s',
            objective_2: scored,
          }),
        }),
        build.form('if_score_run', {
          holder: sum,
          objective: names.objective,
          range: `${target}..`,
          command: build.run(teamWonFunction(j)),
        }),
      );
    });
  } else {
    check.push(tagWinners(build, `@a[tag=${player},scores={${scored}=${target}..}]`));
  }
  check.push(endIfWinners(build));
  return {
    check,
    files: [],
    begin: [build.form('score_set', { holders: `@a[tag=${player}]`, objective: scored, score: 0 })],
    end: [],
    teamWins: byTeams,
  };
}
