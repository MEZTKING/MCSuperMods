/**
 * `minecraft:loot_table`: a loot table (`data/<ns>/<loot_table>/<path>.json`).
 */
import type { ElementKind } from '@msm/plugin-api';
import { lowerJsonData } from '../lowering/json-data';

const SCHEMA = 'resource:loot_table';

export const lootTableKind: ElementKind = {
  id: 'minecraft:loot_table',
  schema: SCHEMA,
  folder: 'loot_table',
  defaultData: { pools: [] },
  // Live views 2 (ADR 0120 D2): the registry in the app picks the view by element kind.
  previewKind: 'live_view',
  lower: (element, target) => lowerJsonData(element, target, 'loot_table', SCHEMA),
};
