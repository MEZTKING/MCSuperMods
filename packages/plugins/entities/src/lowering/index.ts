/**
 * Pure lowering functions (`lower(element, target) -> OutputFile[]`) for
 * `@msm/plugin-entities`.
 */

export {
  DEFINITION_FORMAT,
  DISPLAY_NAME_LANGUAGE,
  entityDefinition,
  hasSpawnEgg,
  lowerEntity,
  SPAWN_EGG_PARENT_MODEL,
} from './entity';
export {
  definitionPath,
  descriptionKey,
  EntitiesLoweringError,
  spawnEggPath,
  splitResourceLocation,
} from './paths';
