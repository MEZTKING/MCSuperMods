/**
 * Pure lowering functions (`lower(element, target) -> OutputFile[]`) for
 * `@msm/plugin-scripting`.
 */

export {
  COMMAND_DEFINITION_FORMAT,
  COMMAND_LANG_SCHEMA,
  COMMAND_LANGUAGE,
  commandDefinition,
  commandFeedbackKey,
  commandPath,
  lowerCommand,
} from './command';
export {
  GAME_RULE_DEFINITION_FORMAT,
  gameRuleDefinition,
  gameRuleDescriptionKey,
  gameRuleNameKey,
  gameRulePath,
  lowerGameRule,
} from './game-rule';
export {
  isRecord,
  ScriptingLoweringError,
  scriptPath,
  splitResourceLocation,
} from './paths';
export { lowerScript, SCRIPT_LANGUAGE, scriptText } from './script';
export {
  DEFAULT_STAT_CRITERION_PREFIX,
  lowerStat,
  STAT_DEFINITION_FORMAT,
  statCriterion,
  statDefinition,
  statNameKey,
  statPath,
} from './stat';
