/**
 * The blocks and items Studios (B97), discovered by `studios/studio-registry.ts`: the Block
 * Studio and the Item Studio. `msm:mod` stays on the schema form.
 *
 * @packageDocumentation
 */

import type { StudioEntry } from '../types';
import { BlockStudio } from './BlockStudio';
import { BLOCK_KIND, ITEM_KIND } from './blocks-items-model';
import { ItemStudio } from './ItemStudio';

export const studios: StudioEntry[] = [
  { id: 'msm.blocks-items.block', kindId: BLOCK_KIND, component: BlockStudio },
  { id: 'msm.blocks-items.item', kindId: ITEM_KIND, component: ItemStudio },
];
