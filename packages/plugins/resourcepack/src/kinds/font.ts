/**
 * `minecraft:font`: a font definition (`assets/<ns>/<target.folders.resource.font>/<path>.json`),
 * the glyph providers of a font such as `minecraft:default` (ADR 0064 D2).
 */
import type { ElementKind } from '@msm/plugin-api';
import { lowerJsonAsset } from '../lowering/json-asset';

const SCHEMA = '::java::assets::font::Font';

export const fontKind: ElementKind = {
  id: 'minecraft:font',
  schema: SCHEMA,
  folder: 'font',
  // Live views 3 (ADR 0121): the registry in the app picks the view by element kind.
  previewKind: 'live_view',
  defaultData: { providers: [] },
  lower: (element, target) => lowerJsonAsset(element, target, 'font', SCHEMA),
};
