/**
 * The `msm:villager_profession` kind (ADR 0098 D2): a job for vanilla villagers at a project job
 * site block, with five trading levels. Element ids belong to the `villager_profession` registry;
 * the runtime registers a point of interest type of the same id for every state of the job site.
 */
import type { ElementKind } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { lowerProfession } from '../lowering/profession';

/** Kind id of villager professions. */
export const PROFESSION_KIND = 'msm:villager_profession';

export const professionKind: ElementKind = {
  id: PROFESSION_KIND,
  schema: MSM_SCHEMA_REFS.villagerProfession,
  folder: 'villager_profession',
  registry: 'villager_profession',
  // The one required field; the user picks the job site block. Lowering creates the five trade
  // sets and their tags while `trade_sets` is absent.
  defaultData: {
    format: 1,
    job_site: '',
  },
  // `format` is written by lowering, so the form hides it.
  hiddenPaths: ['/format'],
  lower: lowerProfession,
};
