/**
 * The `msm:game_rule` kind (ADR 0111 D5, frozen by B527): a game rule of vanilla's two kinds,
 * `boolean` or `integer`. A stub from B526: the kind is not in `scriptingKinds` yet and its schema
 * reference is a literal (the mcdoc and `MSM_SCHEMA_REFS` come from B527); B535 fills it in and
 * adds it to the list.
 */
import type { ElementKind } from '@msm/plugin-api';
import { lowerGameRule } from '../lowering/game-rule';

/** Kind id of game rules. */
export const GAME_RULE_KIND = 'msm:game_rule';

export const gameRuleKind: ElementKind = {
  id: GAME_RULE_KIND,
  schema: 'msm:game_rule',
  folder: 'game_rule',
  defaultData: { format: 1 },
  hiddenPaths: ['/format'],
  lower: lowerGameRule,
};
