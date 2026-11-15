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
  isRecord,
  ScriptingLoweringError,
  scriptPath,
  splitResourceLocation,
} from './paths';
export { lowerScript, SCRIPT_LANGUAGE, scriptText } from './script';
