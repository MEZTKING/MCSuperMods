/**
 * `minecraft:advancement`: an advancement (`data/<ns>/<advancement>/<path>.json`).
 */
import type { ElementKind } from '@msm/plugin-api';
import { lowerJsonData } from '../lowering/json-data';

const SCHEMA = 'resource:advancement';

export const advancementKind: ElementKind = {
  id: 'minecraft:advancement',
  schema: SCHEMA,
  folder: 'advancement',
  defaultData: { criteria: { requirement: { trigger: 'minecraft:tick' } } },
  // Live views 2 (ADR 0120 D2): the registry in the app picks the view by element kind.
  previewKind: 'live_view',
  lower: (element, target) => lowerJsonData(element, target, 'advancement', SCHEMA),
};
