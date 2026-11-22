/**
 * `minecraft:predicate`: a predicate (`data/<ns>/<predicate>/<path>.json`).
 */
import type { ElementKind } from '@msm/plugin-api';
import { lowerJsonData } from '../lowering/json-data';

const SCHEMA = 'resource:predicate';

export const predicateKind: ElementKind = {
  id: 'minecraft:predicate',
  schema: SCHEMA,
  folder: 'predicate',
  defaultData: { type: 'minecraft:random_chance', chance: 0.5 },
  // Live views 2 (ADR 0120 D2): the registry in the app picks the view by element kind.
  previewKind: 'live_view',
  lower: (element, target) => lowerJsonData(element, target, 'predicate', SCHEMA),
};
