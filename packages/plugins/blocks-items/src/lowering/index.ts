/**
 * Pure lowering helpers (`lower(element, target) -> OutputFile[]`) for
 * `@msm/plugin-blocks-items`.
 */

export { blockDefinition, DEFINITION_FORMAT, dropsItselfLootTable, lowerBlock } from './block';
export { effectDefinition, lowerEffect } from './effect';
export { itemDefinition, lowerItem } from './item';
export {
  FABRIC_MOD_JSON,
  fabricModJson,
  lowerMod,
  RUNTIME_MOD_ID,
} from './mod';
export {
  BlocksItemsLoweringError,
  type DefinitionFolder,
  definitionPath,
  descriptionKey,
  splitResourceLocation,
} from './paths';
export { DISPLAY_NAME_LANGUAGE } from './shared';
export {
  BLOCK_TOOLS,
  incorrectForTierTag,
  isCustomToolMaterial,
  NEEDS_TIER_TAGS,
  needsTierTag,
  TOOL_TIERS,
  type ToolTier,
  toolTierName,
  vanillaTierName,
} from './tools';
export { WEAPON_ITEM_TAGS, weaponItemTags } from './weapons';
