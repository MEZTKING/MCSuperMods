/**
 * The `msm:creative_tab` kind (ADR 0096 D2): a tab of the creative inventory, folder
 * `creative_tab`, registry `creative_mode_tab`, so a project tab is a known id wherever an item,
 * a block item or a spawn egg names it in `creative_tab`.
 */
import type { ElementKind } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { lowerCreativeTab } from '../lowering/creative-tab';

export {
  CREATIVE_TAB_BY_HAND,
  creativeTabDefinition,
  creativeTabPath,
  creativeTabTitleKey,
  lowerCreativeTab,
} from '../lowering/creative-tab';

/** Kind id of creative tabs (ADR 0096 D2). */
export const CREATIVE_TAB_KIND = 'msm:creative_tab';

/** The registry creative tabs belong to. */
export const CREATIVE_TAB_REGISTRY = 'creative_mode_tab';

/**
 * Creative tabs (ADR 0096 D2). The default shows a diamond, lists items in the order they are
 * registered and is called "My mod". `order` `by_hand` with `items` (ADR 0111 D7) shows the
 * listed items first, in that order.
 */
export const creativeTabKind: ElementKind = {
  id: CREATIVE_TAB_KIND,
  schema: MSM_SCHEMA_REFS.creativeTab,
  folder: 'creative_tab',
  registry: CREATIVE_TAB_REGISTRY,
  defaultData: { format: 1, icon: 'minecraft:diamond', display_name: 'My mod' },
  // `format` is written by lowering, so the form hides it.
  hiddenPaths: ['/format'],
  lower: lowerCreativeTab,
};
