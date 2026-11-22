/**
 * The `msm:stat` kind (ADR 0111 D6, frozen by B527): a statistic counted per player, shown with
 * the format `default`, `distance` or `time`. A stub from B526: the kind is not in
 * `scriptingKinds` yet and its schema reference is a literal (the mcdoc and `MSM_SCHEMA_REFS` come
 * from B527); B535 fills it in and adds it to the list.
 */
import type { ElementKind } from '@msm/plugin-api';
import { lowerStat } from '../lowering/stat';

/** Kind id of statistics. */
export const STAT_KIND = 'msm:stat';

export const statKind: ElementKind = {
  id: STAT_KIND,
  schema: 'msm:stat',
  folder: 'stat',
  defaultData: { format: 1 },
  hiddenPaths: ['/format'],
  lower: lowerStat,
};
