/**
 * Pure lowering functions (`lower(element, target) -> OutputFile[]`) of `@msm/plugin-controls`:
 * key binds (`./key-bind.ts`) and HUD elements (`./hud.ts`).
 */
export * from './hud';
export * from './key-bind';
export {
  type ControlsDefinitionFolder,
  ControlsLoweringError,
  DISPLAY_NAME_LANGUAGE,
  definitionPath,
  LANG_SCHEMA,
  splitResourceLocation,
} from './paths';
