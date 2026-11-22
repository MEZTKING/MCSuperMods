/**
 * The `msm:game_rule` kind (ADR 0111 D5, frozen by B527): a world setting of vanilla's two kinds,
 * `boolean` or `integer`, registered at start, set with `/gamerule <ns>:<path>` and saved with
 * the world. Folder `game_rule`, registry `game_rule` (vanilla's registry of game rules), so a
 * project rule is a known id wherever a schema or a command names one.
 */
import type { ElementKind } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { lowerGameRule } from '../lowering/game-rule';

/** Kind id of game rules. */
export const GAME_RULE_KIND = 'msm:game_rule';

/** The registry game rules belong to. */
export const GAME_RULE_REGISTRY = 'game_rule';

/**
 * Game rules (ADR 0111 D5). The default is an on or off rule, off in a new world, listed under
 * Miscellaneous.
 */
export const gameRuleKind: ElementKind = {
  id: GAME_RULE_KIND,
  schema: MSM_SCHEMA_REFS.gameRule,
  folder: 'game_rule',
  registry: GAME_RULE_REGISTRY,
  defaultData: {
    format: 1,
    kind: 'boolean',
    default: false,
    category: 'misc',
    display_name: 'My game rule',
  },
  // `format` is written by lowering, so the form hides it.
  hiddenPaths: ['/format'],
  lower: lowerGameRule,
};
