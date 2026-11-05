/**
 * `minecraft:lang`: a language file (`assets/<ns>/<lang>/<path>.json`, e.g. `en_us`).
 * Outputs declare `merge: 'object'`, so other elements' keys for the same file merge into it
 * (ADR 0027).
 */
import type { ElementKind } from '@msm/plugin-api';
import { lowerJsonAsset } from '../lowering/json-asset';

const SCHEMA = '::java::assets::lang::Lang';

export const langKind: ElementKind = {
  id: 'minecraft:lang',
  schema: SCHEMA,
  folder: 'lang',
  defaultData: {},
  lower: (element, target) =>
    lowerJsonAsset(element, target, 'lang', SCHEMA).map((file) => ({ ...file, merge: 'object' })),
};
