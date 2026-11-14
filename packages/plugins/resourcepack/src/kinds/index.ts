/**
 * Element kinds contributed by `@msm/plugin-resourcepack`, one module per kind.
 */
import type { ElementKind } from '@msm/plugin-api';
import { atlasKind } from './atlas';
import { blockDefinitionKind } from './block-definition';
import { equipmentKind } from './equipment';
import { fontKind } from './font';
import { itemDefinitionKind } from './item-definition';
import { langKind } from './lang';
import { modelKind } from './model';
import { packMcmetaKind } from './pack-mcmeta';
import { soundsKind } from './sounds';

export { atlasKind } from './atlas';
export { blockDefinitionKind } from './block-definition';
export { EQUIPMENT_FOLDER, equipmentKind } from './equipment';
export { fontKind } from './font';
export { itemDefinitionKind } from './item-definition';
export { langKind } from './lang';
export { modelKind } from './model';
export { packMcmetaKind } from './pack-mcmeta';
export { SOUNDS_ELEMENT_PATH, soundsKind } from './sounds';

/** Every kind this plugin contributes, in a stable order. */
export const resourcePackKinds: readonly ElementKind[] = Object.freeze([
  modelKind,
  blockDefinitionKind,
  itemDefinitionKind,
  langKind,
  soundsKind,
  packMcmetaKind,
  equipmentKind,
  atlasKind,
  fontKind,
]);
