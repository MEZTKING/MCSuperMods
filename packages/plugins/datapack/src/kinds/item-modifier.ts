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
  // Live views 2 (ADR 0120 D2): the registry in the app picks the view by element kind.
  previewKind: 'live_view',
  lower: (element, target) => lowerJsonData(element, target, 'item_modifier', SCHEMA),
};
