/**
 * The round scripts of the game types (ADR 0132 D10): a short timed list of practice players'
 * actions per type ("Alex takes a heart from Sam"), played headless for the Game tab's live
 * view and in Try it by Watch a round. B721 stub; B728 adds one script file per type here.
 *
 * @packageDocumentation
 */

/** One step of a round script; B728 gives it its actions. */
export interface RoundScriptStep {
  /** When the step happens, in ticks from the start of the round. */
  readonly at: number;
}

/** A round script: the steps of one type's practice round, in order. */
export type RoundScript = readonly RoundScriptStep[];

/** The round script of each game type, by the type's starter id; none until B728. */
export const ROUND_SCRIPTS: Readonly<Record<string, RoundScript>> = Object.freeze({});
