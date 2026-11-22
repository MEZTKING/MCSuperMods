/**
 * The `msm:stat` kind (ADR 0111 D6, frozen by B527): a custom statistic counted per player,
 * shown with the formatter `default`, `distance` or `time`, registered at start in vanilla's
 * `custom_stat` registry. Folder `stat`, registry `custom_stat`, so a project statistic is a
 * known id wherever a schema or a command names one, and its scoreboard criterion
 * `minecraft.custom:<ns>.<path>` (`statCriterion`) is offered in completions.
 */
import type { ElementKind } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { lowerStat } from '../lowering/stat';

/** Kind id of statistics. */
export const STAT_KIND = 'msm:stat';

/** The registry statistics belong to. */
export const STAT_REGISTRY = 'custom_stat';

/** Statistics (ADR 0111 D6). The default is a plain count. */
export const statKind: ElementKind = {
  id: STAT_KIND,
  schema: MSM_SCHEMA_REFS.stat,
  folder: 'stat',
  registry: STAT_REGISTRY,
  defaultData: { format: 1, formatter: 'default', display_name: 'My statistic' },
  // `format` is written by lowering, so the form hides it.
  hiddenPaths: ['/format'],
  lower: lowerStat,
};
