/**
 * `minecraft:atlas`: a texture atlas definition (`assets/<ns>/<target.folders.resource.atlases>/
 * <path>.json`), the sources stitched into an atlas such as `minecraft:blocks` (ADR 0064 D2).
 */
import type { ElementKind } from '@msm/plugin-api';
import { lowerJsonAsset } from '../lowering/json-asset';

const SCHEMA = '::java::assets::atlas::Atlas';

export const atlasKind: ElementKind = {
  id: 'minecraft:atlas',
  schema: SCHEMA,
  folder: 'atlas',
  defaultData: { sources: [] },
  lower: (element, target) => lowerJsonAsset(element, target, 'atlases', SCHEMA),
};
