/**
 * Practice players (ADR 0132 D10, amending ADR 0117 limit M14; B728): up to seven stand-in
 * players with a name, a team, health and a place, whom `@a`, `@r`, `@p`, `@e`, a name and
 * `execute as` see, driven from the panel "Your game" and by a type's round script.
 */

export { type CommandActor, isPlayerActor, type PracticeActor, practiceActor } from './actor.js';
export {
  entityConditionMatches,
  itemConditionMatches,
  PRACTICE_HIT_DAMAGE,
  PRACTICE_WALK_SPEED,
  type PracticeAction,
  type PracticeHost,
  type PracticeOutcome,
  type PracticePlace,
  PracticePlayers,
  type PracticeView,
  VOID_Y,
} from './practice.js';
export {
  MAX_PRACTICE_PLAYERS,
  PRACTICE_NAME,
  PRACTICE_NAMES,
  PracticeRoster,
  type PracticeState,
} from './roster.js';

/** One practice player as the panel names it (B721's stub interface, kept for its readers). */
export interface PracticePlayer {
  /** The name shown over the player and in chat, such as "Alex". */
  readonly name: string;
  /** The team's scoreboard name, if the player is on one. */
  readonly team?: string;
}
