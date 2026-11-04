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
  lower: (element, target) => lowerJsonData(element, target, 'predicate', SCHEMA),
};
