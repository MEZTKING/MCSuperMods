/**
 * `@msm/plugin-blocks-items`: built-in MSM plugin contributing custom blocks, custom items and
 * the mod metadata (ADR 0025 D8), custom mob effects (ADR 0055) and additions to vanilla
 * content (ADR 0060), potions (ADR 0063), portal blocks (ADR 0077), particle types (ADR 0080), fluids (ADR 0099),
 * waterlogging and weathering (ADR 0094 D7 to D9) and item inventories and bundles (ADR 0095):
 * the `msm:block`, `msm:item`, `msm:effect`, `msm:mod`, `msm:biome_addition`,
 * `msm:loot_addition`, `msm:potion`, `msm:particle`, `msm:creative_tab` (ADR 0096) and `msm:fluid` kinds,
 * their lowering to runtime definitions under `msm/` plus vanilla pack files, the `blocks-items.*`
 * project validators and the "New element" templates.
 */
import { definePlugin } from '@msm/plugin-api';
import { pottedPlantExpander } from './expand-potted-plant';
import { blocksItemsKinds } from './kinds';
import { blocksItemsTemplates } from './templates';
import { blocksItemsValidators } from './validators';
import { containerValidators } from './validators-containers';
import { creativeTabValidators } from './validators-creative-tabs';
import { fluidValidators } from './validators-fluids';
import { furnitureValidators } from './validators-furniture';
import { inventoryValidators } from './validators-inventory';
import { particleValidators } from './validators-particles';
import { plants2Validators } from './validators-plants-2';
import { portalValidators } from './validators-portals';
import { blockTypeValidators } from './validators-types';
import { weatheringValidators } from './validators-weathering';

export {
  expandPottedPlants,
  POTTED_PLANT_EXPANDER_ID,
  pottedPlantExpander,
} from './expand-potted-plant';
export * from './kinds';
export * from './kinds/creative-tab';
export * from './kinds/fluid';
export * from './lowering';
export { blockItemId, blockItemIdOf } from './lowering/block-item';
export {
  BUNDLE_HAS_SELECTED_ITEM,
  BUNDLE_OPEN_BACK_PARENT,
  BUNDLE_OPEN_FRONT_PARENT,
  BUNDLE_SELECTED_ITEM_MODEL,
  BUNDLE_TEXTURES_FIELD,
  bundleItemFiles,
  bundleModelIds,
} from './lowering/bundle';
export {
  BUNDLE_COMPONENT,
  bagLayoutOf,
  DEFAULT_BAG_ROWS,
  ITEM_INVENTORY_COMPONENT,
  ITEM_INVENTORY_LAYOUTS,
  isBundle,
  itemInventoryOf,
  lowerItemInventoryInPlace,
} from './lowering/item-inventory';
export {
  BLOCK_TYPE_LOWERINGS,
  BLOCK_TYPE_MODEL_SLOTS,
  BLOCK_TYPES,
  type BlockModels,
  type BlockTypeName,
  blockGeneratedModelIds,
  blockStateFlag,
  blockTypeModels,
  blockTypeOf,
  blockTypeSelfLoot,
  blockTypeTagFiles,
  CONTAINER_BLOCK_TYPES,
  CONTAINER_COMPONENT,
  containerOf,
  type GeneratedModel,
  ITEM_MODEL_SLOT,
  lowerBlockAppearance,
  MACHINE_COMPONENT,
  type ModelSpec,
  machineOf,
  type SlotModels,
  STATE_MODEL_SLOTS,
  STONE_SET_TYPES,
  type StateModelSlot,
  TYPE_BLOCK_TAGS,
  TYPE_ITEM_TAGS,
  type TypeContext,
  type TypeLowering,
  type TypeTags,
  WOOD_SOUND_TYPES,
  WOODEN_SET_TYPES,
} from './lowering/types';
export {
  ATTACHED_COMPANION_SUFFIX,
  blockGeneratedBlockIds,
  type CompanionLowering,
  WALL_COMPANION_SUFFIX,
} from './lowering/types/companions';
export {
  KEEP_CONTENTS_COMPONENTS,
  keepContentsLootTable,
  keepsContents,
} from './lowering/types/loot-presets';
export {
  DEFAULT_PORTAL_TEXTURE,
  PORTAL_BLOCK_TAGS,
  PORTAL_MODEL_PARENTS,
  portalTextureOf,
} from './lowering/types/portal';
export {
  SIGN_GUI_FOLDERS,
  signGuiPicture,
  signGuiTextureId,
  signGuiTexturePath,
} from './lowering/types/sign';
export {
  hasWaterloggable,
  isWaterloggable,
  lowerWaterloggingInPlace,
  WATERLOGGABLE_BLOCK_TYPES,
  WATERLOGGABLE_COMPONENT,
  WATERLOGGED_PROPERTY,
  withWaterloggedVariants,
} from './lowering/waterlog';
export {
  fullBlockId,
  lowerWeatheringInPlace,
  nextWeatheringStage,
  WAXABLE_COMPONENT,
  WEATHERING_BLOCK_TYPES,
  WEATHERING_COMPONENT,
  WEATHERING_STAGES,
  type WeatheringFields,
  type WeatheringStage,
  waxableInto,
  weatheringOf,
} from './lowering/weathering';
export { blocksItemsTemplates, modIdFromNamespace } from './templates';
export {
  BLOCKS_ITEMS_PROBLEM_CODES,
  blocksItemsValidators,
  canContainEntities,
  DELAYED_PASSTHROUGH_COMPONENTS,
  EQUIPMENT_KIND,
  EXCLUSIVE_ITEM_COMPONENTS,
  isCubeModel,
  MOD_ID_PATTERN,
  MSM_VANILLA_COMPONENTS,
  POTION_NEEDS_JAR_CODE,
  potionNeedsJarProblem,
  RESERVED_MOD_IDS,
  SPEAR_VANILLA_COMPONENTS,
  THROWABLE_CONFLICTS,
  TRANSPARENT_TEXTURE_CODE,
  transparentTextureProblem,
} from './validators';
export {
  CONTAINER_PROBLEM_CODES,
  containerValidators,
  MAX_MACHINE_TICKS,
} from './validators-containers';
export {
  CREATIVE_TAB_PROBLEM_CODES,
  creativeTabValidators,
  projectItemIds,
} from './validators-creative-tabs';
export { FLUID_PROBLEM_CODES, fluidValidators } from './validators-fluids';
export { FURNITURE_PROBLEM_CODES, furnitureValidators } from './validators-furniture';
export {
  INVENTORY_CONFLICT_COMPONENTS,
  INVENTORY_PROBLEM_CODES,
  inventoryValidators,
} from './validators-inventory';
export {
  AMBIENT_PARTICLES_COMPONENT,
  PARTICLE_DESCRIPTION_KIND,
  PARTICLE_PROBLEM_CODES,
  particleValidators,
  SPAWN_PARTICLE_ACTION,
} from './validators-particles';
export { PLANT2_PROBLEM_CODES, plants2Validators } from './validators-plants-2';
export {
  DEFAULT_PORTAL_IGNITER,
  DEFAULT_PORTAL_RETURN_TO,
  DUST_PARTICLE,
  isPortalElement,
  LIGHT_PORTAL_ACTION,
  PORTAL_COMPONENTS,
  PORTAL_PROBLEM_CODES,
  PORTAL_TYPE,
  portalValidators,
} from './validators-portals';
export {
  BLOCK_TYPE_PROBLEM_CODES,
  blockTypeValidators,
  SHAPED_BLOCK_TYPES,
  SHAPED_ONLY_COMPONENTS,
  VANILLA_PARITY_TYPES,
} from './validators-types';
export { WEATHERING_PROBLEM_CODES, weatheringValidators } from './validators-weathering';

export default definePlugin({
  id: 'msm.blocks-items',
  apiVersion: '^1.0.0',
  contributes: {
    elementKinds: [...blocksItemsKinds],
    elementTemplates: [...blocksItemsTemplates],
    projectExpanders: [pottedPlantExpander],
    validators: [
      ...blocksItemsValidators,
      ...blockTypeValidators,
      ...containerValidators,
      ...portalValidators,
      ...particleValidators,
      ...plants2Validators,
      ...furnitureValidators,
      ...weatheringValidators,
      ...inventoryValidators,
      ...creativeTabValidators,
      ...fluidValidators,
    ],
  },
});
