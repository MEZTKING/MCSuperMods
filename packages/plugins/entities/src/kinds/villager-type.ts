/**
 * The `msm:villager_type` kind (ADR 0107 D5, frozen by B527): the look of vanilla villagers and
 * zombie villagers born or spawned in a list of biomes. Element ids belong to the
 * `villager_type` registry; the runtime registers the type at start and maps its biomes.
 */
import type { ElementKind } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { lowerVillagerType } from '../lowering/villager-type';

/** Kind id of villager types. */
export const VILLAGER_TYPE_KIND = 'msm:villager_type';

export const villagerTypeKind: ElementKind = {
  id: VILLAGER_TYPE_KIND,
  schema: MSM_SCHEMA_REFS.villagerType,
  folder: 'villager_type',
  registry: 'villager_type',
  // The user picks the biomes (one at least); a default biome would take vanilla's own type
  // away from it without asking.
  defaultData: { format: 1, biomes: [] },
  // `format` is written by lowering, so the form hides it.
  hiddenPaths: ['/format'],
  lower: lowerVillagerType,
};
