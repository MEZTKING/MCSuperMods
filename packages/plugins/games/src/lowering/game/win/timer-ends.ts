/**
 * The win condition `timer_ends` (ADR 0132 D2; B724): the round ends when a timer runs out, or,
 * with no timer named, when the round's `length` is up. The named timer is started when a round
 * starts and stopped when it ends; its `ended` hook (`#<ns>:msm_games/timer/<path>/ended`) gains
 * `win/<i>/timer`, which ends the round if one is being played. Who wins: nobody, everyone still
 * in, the players with the highest score of an objective (`top_score`), or a role's players.
 */
import type { JsonObject } from '@msm/plugin-api';
import { hookTagFile, objectiveName, splitId } from '../../shared-functions';
import type { GameBuild } from '../build';
import { refOrUndefined, timerFunction } from '../names';
import { NO_WIN, tagWinners, type WinLowering } from './shared';

/** The lowest score an objective holds: where the search for the highest score starts. */
const LOWEST_SCORE = -2_147_483_648;

/** The lines that tag who wins when the time is up, or `undefined` when it cannot be lowered. */
function winnerLines(build: GameBuild, win: JsonObject): string[] | undefined {
  const { game, names } = build;
  switch (win.winner) {
    case 'nobody':
      return [];
    case 'still_in':
      return [tagWinners(build, `@a[tag=${names.tag('in')}]`)];
    case 'top_score': {
      const ref = refOrUndefined(win.objective);
      if (ref === undefined) return undefined;
      const scored = objectiveName(ref);
      const best = names.holder('best');
      const player = `@a[tag=${names.tag('player')}]`;
      return [
        build.setHolder('best', LOWEST_SCORE),
        build.form('as_run', {
          entities: player,
          command: build.form('score_operation', {
            holders: best,
            objective: names.objective,
            score_operation: '>',
            holder_2: '@s',
            objective_2: scored,
          }),
        }),
        build.form('as_if_score_compare_run', {
          entities: player,
          holder: '@s',
          objective: scored,
          comparison: '=',
          holder_2: best,
          objective_2: names.objective,
          command: build.form('tag_add', { entities: '@s', tag: names.tag('winner') }),
        }),
      ];
    }
    case 'role': {
      const role = win.role;
      if (typeof role !== 'string' || !game.roles.some((entry) => entry.id === role)) {
        return undefined;
      }
      return [tagWinners(build, `@a[tag=${names.tag('player')},tag=${names.roleTag(role)}]`)];
    }
    default:
      return undefined;
  }
}

export function lowerTimerEndsWin(build: GameBuild, win: JsonObject, index: number): WinLowering {
  const lines = winnerLines(build, win);
  if (lines === undefined) return NO_WIN;
  const won = build.file(`win/${index}/won`, [...lines, build.run('end')]);
  const timer = refOrUndefined(win.timer);
  if (win.timer !== undefined && timer === undefined) return NO_WIN;
  if (timer === undefined) {
    return { check: [], files: [won], begin: [], end: [], timeUp: `win/${index}/won` };
  }
  const { namespace, path } = splitId(timer);
  const entry = build.names.fn(`win/${index}/timer`);
  return {
    check: [],
    files: [
      won,
      build.file(`win/${index}/timer`, [build.ifState('playing', build.run(`win/${index}/won`))]),
      hookTagFile(build.target, namespace, `timer/${path}/ended`, [entry]),
    ],
    begin: [build.runId(timerFunction(timer, 'start'))],
    end: [build.runId(timerFunction(timer, 'stop'))],
  };
}
