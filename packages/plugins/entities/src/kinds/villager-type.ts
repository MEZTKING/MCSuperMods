/**
 * The `msm:villager_type` kind (ADR 0107 D5, frozen by B527): the look of vanilla villagers in a
 * list of biomes. Element ids belong to the `villager_type` registry. A stub from B526: the kind
 * is not in `entitiesKinds` yet and its schema reference is a literal (the mcdoc and
 * `MSM_SCHEMA_REFS` come from B527); B530 fills it in and adds it to the list.
 */
import type { ElementKind } from '@msm/plugin-api';
import { lowerVillagerType } from '../lowering/villager-type';

/** Kind id of villager types. */
export const VILLAGER_TYPE_KIND = 'msm:villager_type';

export const villagerTypeKind: ElementKind = {
  id: VILLAGER_TYPE_KIND,
  schema: 'msm:villager_type',
  folder: 'villager_type',
  registry: 'villager_type',
  defaultData: { format: 1 },
  hiddenPaths: ['/format'],
  lower: lowerVillagerType,
};
