/**
 * The blocks and items Studios (B97), discovered by `studios/studio-registry.ts`: the Block
 * Studio, the Item Studio and the Effect Studio (B205, ADR 0055). `msm:mod` stays on the
 * schema form.
 *
 * @packageDocumentation
 */

import type { StudioEntry } from '../types';
import { BlockStudio } from './BlockStudio';
import { BLOCK_KIND, EFFECT_KIND, ITEM_KIND } from './blocks-items-model';
import { EffectStudio } from './EffectStudio';
import { ItemStudio } from './ItemStudio';

export const studios: StudioEntry[] = [
  { id: 'msm.blocks-items.block', kindId: BLOCK_KIND, component: BlockStudio },
  { id: 'msm.blocks-items.item', kindId: ITEM_KIND, component: ItemStudio },
  { id: 'msm.blocks-items.effect', kindId: EFFECT_KIND, component: EffectStudio },
];
