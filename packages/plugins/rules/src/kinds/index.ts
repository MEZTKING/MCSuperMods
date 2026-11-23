/**
 * Element kinds contributed by `@msm/plugin-rules` (ADR 0082 D2): `msm:rules`, a rule book
 * (kind folder `rules`, schema `msm:rules`, no registry). The runtime never reads rule books:
 * they reach the game through the expander's patches and the generated script.
 */
import type { ElementKind } from '@msm/plugin-api';
import { lowerRuleBook, RULES_SCRIPT_FIELD, RULES_SIGNAL_FIELD } from '../lowering';

/** Kind id of rule books. */
export const RULES_KIND = 'msm:rules';
/** Schema reference of rule book data (`::msm::rules::RuleBook`). */
export const RULES_SCHEMA = 'msm:rules';

export const rulesKind: ElementKind = {
  id: RULES_KIND,
  schema: RULES_SCHEMA,
  folder: 'rules',
  defaultData: { counters: [], format: 1, rules: [] },
  hiddenPaths: [`/${RULES_SCRIPT_FIELD}`, `/${RULES_SIGNAL_FIELD}`],
  lower: lowerRuleBook,
};

/** Every kind this plugin contributes, in order. */
export const rulesKinds: readonly ElementKind[] = Object.freeze([rulesKind]);
