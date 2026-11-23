/**
 * Teams and scores in Try it (ADR 0117 D4, B558). Teams are made by their lowered `team`
 * lines, which the function engine runs (`team add`, `team modify`, `team join`); the side panel
 * shows the engine's teams with the elements' names, and the player is on the team the engine
 * says (a function's `team join`, or the panel's pick run as `team join`); their name is drawn in
 * its colour. Try it is single player (limit M14). The sidebar mock-up reads the
 * scoreboard the function engine keeps: the objective shown in the `sidebar` slot (or the
 * `sidebar.team.<colour>` slot of the player's team, as the game prefers it), its holders whose
 * names do not start with `#` (the game hides those), highest first, at most 15.
 *
 * Pure.
 */

import {
  elementsOf,
  type GamesProject,
  idWords,
  OBJECTIVE_KIND,
  objectOf,
  scoreboardName,
  TEAM_KIND,
  textOf,
} from './data.js';

/** How a team looks. */
export interface TeamLook {
  readonly id: string;
  /** Its name in the game (`<ns>.<path>`). */
  readonly gameName: string;
  /** Its display name. */
  readonly name: string;
  /** A chat colour name (`red`, `dark_aqua`, ...) or `reset`. */
  readonly colour: string;
  readonly prefix: string;
  readonly suffix: string;
}

/** Every team's look, in the project's order. */
export function teamLooks(games: GamesProject): TeamLook[] {
  return elementsOf(games, TEAM_KIND).map((element) => {
    const data = objectOf(element.data);
    const name = textOf(data.name).trim();
    return {
      id: element.id,
      gameName: scoreboardName(element.id),
      name: name === '' ? idWords(element.id) : name,
      colour: textOf(data.colour) === '' ? 'reset' : textOf(data.colour),
      prefix: textOf(data.prefix),
      suffix: textOf(data.suffix),
    };
  });
}

/** The most rows the sidebar shows. */
export const SIDEBAR_ROWS = 15;

/** The scoreboard the mock-up reads (the engine's `CommandState`). */
export interface ScoreboardReader {
  readonly objectives: ReadonlyMap<
    string,
    {
      readonly name: string;
      readonly criterion: string;
      readonly displayName: string;
      readonly scores: ReadonlyMap<string, number>;
    }
  >;
  readonly display: ReadonlyMap<string, string>;
}

/** One row of the sidebar. */
export interface SidebarRow {
  readonly holder: string;
  readonly score: number;
}

/** The sidebar mock-up. */
export interface SidebarView {
  /** The objective's name in the game. */
  readonly objective: string;
  /** The project's objective element, when one makes it. */
  readonly element: string | null;
  readonly title: string;
  /** Its criterion; any but `dummy` counts by itself only in the game. */
  readonly criterion: string;
  readonly rows: readonly SidebarRow[];
}

/**
 * The sidebar as the game draws it for a player on `teamColour` (or none): the team colour's
 * slot first, then `sidebar`; `null` when neither shows an objective.
 */
export function sidebarOf(
  games: GamesProject,
  board: ScoreboardReader,
  teamColour: string | null,
): SidebarView | null {
  const slot =
    teamColour !== null && teamColour !== 'reset' && board.display.has(`sidebar.team.${teamColour}`)
      ? `sidebar.team.${teamColour}`
      : 'sidebar';
  const name = board.display.get(slot);
  if (name === undefined) return null;
  const objective = board.objectives.get(name);
  if (objective === undefined) return null;
  const element = elementsOf(games, OBJECTIVE_KIND).find((one) => scoreboardName(one.id) === name);
  const elementName = textOf(objectOf(element?.data).name).trim();
  const rows = [...objective.scores]
    .filter(([holder]) => !holder.startsWith('#'))
    .map(([holder, score]) => ({ holder, score }))
    .sort((a, b) => b.score - a.score || a.holder.localeCompare(b.holder))
    .slice(0, SIDEBAR_ROWS);
  return {
    objective: name,
    element: element?.id ?? null,
    title: elementName !== '' ? elementName : objective.displayName,
    criterion: objective.criterion,
    rows,
  };
}
