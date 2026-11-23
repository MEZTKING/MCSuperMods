/**
 * The win conditions of a round (ADR 0132 D2; B724), one file each: `last_standing`,
 * `role_dies`, `advancement`, `score_target` and `timer_ends`. A condition is the game's
 * `round.win[i]`; its lowering gives the lines of `win/<i>` (checked every tick while a round is
 * played, in the game's order, each only while the round is still being played, so the first
 * condition met ends it), its `win/<i>/won` (tags the winners `winner` and runs the round's
 * `end`), and what it needs at the round's start and end. A condition the game cannot lower (a
 * role or objective it does not have, an id that is not one) gives nothing; the game's validator
 * reports it.
 */
import type { JsonObject } from '@msm/plugin-api';
import type { GameBuild } from '../build';
import { lowerAdvancementWin } from './advancement';
import { lowerLastStandingWin } from './last-standing';
import { lowerRoleDiesWin } from './role-dies';
import { lowerScoreTargetWin } from './score-target';
import { NO_WIN, type WinLowering } from './shared';
import { lowerTimerEndsWin } from './timer-ends';

export { NO_WIN, teamWonFiles, type WinLowering } from './shared';

/** Lowers one win condition of a game. */
export type WinConditionLowering = (
  build: GameBuild,
  win: JsonObject,
  index: number,
) => WinLowering;

const WIN_LOWERINGS: Readonly<Record<string, WinConditionLowering>> = Object.freeze({
  last_standing: lowerLastStandingWin,
  role_dies: lowerRoleDiesWin,
  advancement: lowerAdvancementWin,
  score_target: lowerScoreTargetWin,
  timer_ends: lowerTimerEndsWin,
});

/** Lowers the game's `round.win[index]`. */
export function lowerWin(build: GameBuild, win: JsonObject, index: number): WinLowering {
  const type = win.type;
  return typeof type === 'string' && Object.hasOwn(WIN_LOWERINGS, type)
    ? (WIN_LOWERINGS[type] as WinConditionLowering)(build, win, index)
    : NO_WIN;
}
