/**
 * `minecraft:block_definition`: a block state definition
 * (`assets/<ns>/<blockstates>/<path>.json`).
 */
import type { ElementKind } from '@msm/plugin-api';
import { lowerJsonAsset } from '../lowering/json-asset';

const SCHEMA = '::java::assets::block_state_definition::BlockStateDefinition';

export const blockDefinitionKind: ElementKind = {
  id: 'minecraft:block_definition',
  schema: SCHEMA,
  folder: 'blockstate',
  defaultData: { variants: { '': { model: '' } } },
  previewKind: 'block_definition',
  lower: (element, target) => lowerJsonAsset(element, target, 'block_definition', SCHEMA),
};
