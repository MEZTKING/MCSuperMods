/**
 * `minecraft:lang`: a language file (`assets/<ns>/<lang>/<path>.json`, e.g. `en_us`).
 */
import type { ElementKind } from '@msm/plugin-api';
import { lowerJsonAsset } from '../lowering/json-asset';

const SCHEMA = '::java::assets::lang::Lang';

export const langKind: ElementKind = {
  id: 'minecraft:lang',
  schema: SCHEMA,
  folder: 'lang',
  defaultData: {},
  lower: (element, target) => lowerJsonAsset(element, target, 'lang', SCHEMA),
};
