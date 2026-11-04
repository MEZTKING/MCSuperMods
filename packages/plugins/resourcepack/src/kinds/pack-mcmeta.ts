/**
 * `minecraft:pack_mcmeta`: the project's `pack.mcmeta`. One element lowers to two files, one in
 * the resource pack layer (resource pack format) and one in the data pack layer (data pack
 * format), sharing the description (ADR 0015). Lowering owns the pack formats, so the form
 * hides them.
 */
import type { ElementKind } from '@msm/plugin-api';
import { lowerPackMcmeta } from '../lowering/pack-mcmeta';

const SCHEMA = '::java::pack::Pack';

export const packMcmetaKind: ElementKind = {
  id: 'minecraft:pack_mcmeta',
  schema: SCHEMA,
  folder: 'pack',
  defaultData: { pack: { description: '' } },
  hiddenPaths: [
    '/pack/pack_format',
    '/pack/min_format',
    '/pack/max_format',
    '/pack/supported_formats',
  ],
  lower: (element, target) => lowerPackMcmeta(element, target, SCHEMA),
};
