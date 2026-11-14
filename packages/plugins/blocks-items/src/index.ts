/**
 * `@msm/plugin-blocks-items`: built-in MSM plugin contributing custom blocks, custom items and
 * the mod metadata (ADR 0025 D8), custom mob effects (ADR 0055) and additions to vanilla
 * content (ADR 0060) and potions (ADR 0063): the `msm:block`, `msm:item`, `msm:effect`,
 * `msm:mod`, `msm:biome_addition`, `msm:loot_addition` and `msm:potion` kinds, their
 * lowering to runtime definitions under `msm/` plus vanilla pack files, the `blocks-items.*`
 * project validators and the "New element" templates.
 */
import { definePlugin } from '@msm/plugin-api';
import { blocksItemsKinds } from './kinds';
import { blocksItemsTemplates } from './templates';
import { blocksItemsValidators } from './validators';
import { containerValidators } from './validators-containers';
import { blockTypeValidators } from './validators-types';

export * from './kinds';
export * from './lowering';
export { blockItemId, blockItemIdOf } from './lowering/block-item';
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
  KEEP_CONTENTS_COMPONENTS,
  keepContentsLootTable,
  keepsContents,
} from './lowering/types/loot-presets';
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
  BLOCK_TYPE_PROBLEM_CODES,
  blockTypeValidators,
  SHAPED_BLOCK_TYPES,
  SHAPED_ONLY_COMPONENTS,
} from './validators-types';

export default definePlugin({
  id: 'msm.blocks-items',
  apiVersion: '^1.0.0',
  contributes: {
    elementKinds: [...blocksItemsKinds],
    elementTemplates: [...blocksItemsTemplates],
    validators: [...blocksItemsValidators, ...blockTypeValidators, ...containerValidators],
  },
});
