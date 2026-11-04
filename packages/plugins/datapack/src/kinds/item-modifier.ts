/**
 * `minecraft:item_modifier`: an item modifier (`data/<ns>/<item_modifier>/<path>.json`).
 */
import type { ElementKind } from '@msm/plugin-api';
import { lowerJsonData } from '../lowering/json-data';

const SCHEMA = 'resource:item_modifier';

export const itemModifierKind: ElementKind = {
  id: 'minecraft:item_modifier',
  schema: SCHEMA,
  folder: 'item_modifier',
  defaultData: { type: 'minecraft:set_count', count: 1 },
  lower: (element, target) => lowerJsonData(element, target, 'item_modifier', SCHEMA),
};
