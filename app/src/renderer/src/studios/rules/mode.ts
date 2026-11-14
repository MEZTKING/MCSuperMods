/**
 * The view mode as the Rule book reads it (ADR 0047, ADR 0083 D1, D3). `'very-easy'` is B376 and
 * B378's third mode; until the preferences store has it, the mode reads as Easy or Advanced and
 * Very easy is off. This adapter is the one place the Studio reads the mode, so the third mode
 * needs no change here.
 *
 * @packageDocumentation
 */

import { usePreferences } from '../../store/preferences';

/** What the Rule book changes by mode. */
export interface RulesMode {
  /** Very easy hides advanced-only steps and places (run a command, offsets) and every id. */
  readonly veryEasy: boolean;
  /** Advanced shows rule keys, ids on hover and "What this becomes". */
  readonly advanced: boolean;
}

/** The flags of a stored mode name; an unknown name reads as Easy. */
export function rulesModeOf(mode: string | undefined): RulesMode {
  return { veryEasy: mode === 'very-easy', advanced: mode === 'advanced' };
}

/** The current mode's flags, from the preferences store. */
export function useRulesMode(): RulesMode {
  const mode = usePreferences((state) => state.mode as string);
  return rulesModeOf(mode);
}
