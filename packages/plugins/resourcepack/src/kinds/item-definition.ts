/**
 * `minecraft:item_definition`: an item model definition (`assets/<ns>/<items>/<path>.json`).
 */
import type { ElementKind } from '@msm/plugin-api';
import { lowerJsonAsset } from '../lowering/json-asset';

const SCHEMA = '::java::assets::item_definition::ItemDefinition';

export const itemDefinitionKind: ElementKind = {
  id: 'minecraft:item_definition',
  schema: SCHEMA,
  folder: 'item_definition',
  defaultData: { model: { type: 'model', model: '' } },
  previewKind: 'item_definition',
  lower: (element, target) => lowerJsonAsset(element, target, 'item_definition', SCHEMA),
};
