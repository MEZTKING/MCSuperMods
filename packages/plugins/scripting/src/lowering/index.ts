/**
 * Pure lowering functions (`lower(element, target) -> OutputFile[]`) for
 * `@msm/plugin-scripting`.
 */

export {
  isRecord,
  ScriptingLoweringError,
  scriptPath,
  splitResourceLocation,
} from './paths';
export { lowerScript, SCRIPT_LANGUAGE, scriptText } from './script';
