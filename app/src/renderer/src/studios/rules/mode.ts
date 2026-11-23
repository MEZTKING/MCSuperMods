/**
 * The view as the Rule book reads it (ADR 0130 D2, D3; before it the modes of ADR 0047 and ADR
 * 0083). The pickers offer every step, condition, value, place and who; ids (a rule's key, an id
 * after a name, a thing's id on hover) show only inside a More options. This adapter is the one
 * place the Studio reads the view.
 *
 * @packageDocumentation
 */

import { usePlain } from '../../components/ui/MoreOptions';

/** What the Rule book changes by view. */
export interface RulesMode {
  /** Inside a More options: rule keys, ids after names and on hover, "What this becomes". */
  readonly advanced: boolean;
}

/** The flags of a view: plain (the main area) or inside a More options. */
export function rulesModeOf(plain: boolean): RulesMode {
  return { advanced: !plain };
}

/** The current view's flags. */
export function useRulesMode(): RulesMode {
  return rulesModeOf(usePlain());
}
