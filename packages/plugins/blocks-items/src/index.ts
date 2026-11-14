/**
 * `@msm/plugin-blocks-items`: built-in MSM plugin contributing custom blocks, custom items and
 * the mod metadata (ADR 0025 D8), custom mob effects (ADR 0055) and additions to vanilla
 * content (ADR 0060): the `msm:block`, `msm:item`, `msm:effect`, `msm:mod`,
 * `msm:biome_addition` and `msm:loot_addition` kinds, their
 * lowering to runtime definitions under `msm/` plus vanilla pack files, the `blocks-items.*`
 * project validators and the "New element" templates.
 */
import { definePlugin } from '@msm/plugin-api';
import { blocksItemsKinds } from './kinds';
import { blocksItemsTemplates } from './templates';
import { blocksItemsValidators } from './validators';

export * from './kinds';
export * from './lowering';
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
  RESERVED_MOD_IDS,
  SPEAR_VANILLA_COMPONENTS,
  THROWABLE_CONFLICTS,
  TRANSPARENT_TEXTURE_CODE,
  transparentTextureProblem,
} from './validators';

export default definePlugin({
  id: 'msm.blocks-items',
  apiVersion: '^1.0.0',
  contributes: {
    elementKinds: [...blocksItemsKinds],
    elementTemplates: [...blocksItemsTemplates],
    validators: [...blocksItemsValidators],
  },
});
