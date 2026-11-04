/**
 * Pure lowering functions (`lower(element, target) -> OutputFile[]`) for
 * `@msm/plugin-structures`.
 */
export { lowerWorldgenJson } from './json-data';
export { dataPath, StructuresLoweringError, splitResourceLocation } from './paths';
export { lowerStructureTemplate } from './structure-template';
