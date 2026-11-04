/**
 * Pure lowering helpers (`lower(element, target) -> OutputFile[]`) for `@msm/plugin-datapack`.
 */

export { lowerFunction, MCFUNCTION_LANGUAGE } from './function';
export { lowerJsonData } from './json-data';
export { DataPackLoweringError, dataPath, splitResourceLocation } from './paths';
