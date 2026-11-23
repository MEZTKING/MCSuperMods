/**
 * What the win conditions share (B724): the shape of a condition's lowering and the lines and
 * files that tag winners.
 */
import type { OutputFile } from '@msm/plugin-api';
import type { GameBuild } from '../build';

/** What one win condition adds to the round. */
export interface WinLowering {
  /** The lines of `win/<i>`, run every tick while a round is played; none for an event. */
  readonly check: readonly string[];
  /** Its other files: `win/<i>/won`, a timer's hook entry. */
  readonly files: readonly OutputFile[];
  /** Lines run when a round starts, after players are dealt (reset a score, start a timer). */
  readonly begin: readonly string[];
  /** Lines run when a round ends or is stopped (stop a timer). */
  readonly end: readonly string[];
  /** The game function that runs when the round's `length` is up, for `timer_ends` without a timer. */
  readonly timeUp?: string;
  /** Whether it needs `teams/won/<j>` (a team wins). */
  readonly teamWins?: boolean;
}

/** Nothing: a condition the game cannot lower. */
export const NO_WIN: WinLowering = Object.freeze({ check: [], files: [], begin: [], end: [] });

/** The line that tags every player of `selector` a winner. */
export const tagWinners = (build: GameBuild, selector: string): string =>
  build.form('as_run', {
    entities: selector,
    command: build.form('tag_add', { entities: '@s', tag: build.names.tag('winner') }),
  });

/** The line that ends the round when someone is a winner. */
export const endIfWinners = (build: GameBuild): string =>
  build.form('if_entity_run', {
    entities: `@a[tag=${build.names.tag('winner')}]`,
    command: build.run('end'),
  });

/** The game function `teams/won/<j>` of the game's `j`-th team, which tags its players winners. */
export const teamWonFunction = (j: number): string => `teams/won/${j}`;

/** The files `teams/won/<j>`: each tags every player of the round on the game's `j`-th team. */
export function teamWonFiles(build: GameBuild): OutputFile[] {
  const { game, names } = build;
  return game.teams.map((team, j) =>
    build.file(teamWonFunction(j), [
      tagWinners(build, `@a[tag=${names.tag('player')},team=${names.team(team)}]`),
    ]),
  );
}
