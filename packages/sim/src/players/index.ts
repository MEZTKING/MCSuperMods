/**
 * Practice players (ADR 0132 D10, amending ADR 0117 limit M14): up to seven stand-in players
 * with a name, a team, health and a place, whom `@a`, `@r`, `@p` and `execute as` see, driven
 * from the panel "Your game" and by a type's round script. B721 stub; B728 fills this folder.
 */

/** The most practice players Try it stands in beside the user (D10). */
export const MAX_PRACTICE_PLAYERS = 7;

/** One practice player; B728 gives it its place, health and actions. */
export interface PracticePlayer {
  /** The name shown over the player and in chat, such as "Alex". */
  readonly name: string;
  /** The team's scoreboard name, if the player is on one. */
  readonly team?: string;
}
