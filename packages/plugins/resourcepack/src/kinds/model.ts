/**
 * `minecraft:model`: a block or item model (`assets/<ns>/<models>/<path>.json`).
 */
import type { ElementKind } from '@msm/plugin-api';
import { lowerJsonAsset } from '../lowering/json-asset';

const SCHEMA = '::java::assets::model::Model';

export const modelKind: ElementKind = {
  id: 'minecraft:model',
  schema: SCHEMA,
  folder: 'model',
  // The app substitutes the texture reference with one in the user's namespace.
  defaultData: { parent: 'minecraft:block/cube_all', textures: { all: '<set by the app>' } },
  previewKind: 'model',
  lower: (element, target) => lowerJsonAsset(element, target, 'model', SCHEMA),
};
