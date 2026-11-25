/**
 * The round scripts of the game types (ADR 0132 D10, B728): a short timed list of practice
 * players' actions per type ("Alex takes a heart from Sam"), read against the game itself and
 * played on its real lowered files, headless for the Game tab's live view
 * ({@link playRoundHeadless}) and in Try it by **Watch a round** ({@link RoundPlayer}).
 *
 * @packageDocumentation
 */

import { BED_WARS_ROUND } from './bed-wars';
import { LIFESTEAL_ROUND } from './lifesteal';
import { MANHUNT_ROUND } from './manhunt';
import type { RoundScript } from './script';
import { SPLEEF_ROUND } from './spleef';

export * from './facts';
export * from './run';
export * from './script';
export { BED_WARS_ROUND, LIFESTEAL_ROUND, MANHUNT_ROUND, SPLEEF_ROUND };

/** The round script of each game type, by the type's starter id. */
export const ROUND_SCRIPTS: Readonly<Record<string, RoundScript>> = Object.freeze({
  'bed-wars': BED_WARS_ROUND,
  lifesteal: LIFESTEAL_ROUND,
  manhunt: MANHUNT_ROUND,
  spleef: SPLEEF_ROUND,
});

/** The round script for a game type (`msm:game`'s `type`), or `undefined` when none is written. */
export function roundScriptFor(type: string): RoundScript | undefined {
  return Object.values(ROUND_SCRIPTS).find((script) => script.type === type);
}
