/**
 * The blocks and items Studios (B97), discovered by `studios/studio-registry.ts`: the Block
 * Studio, the Item Studio, the Effect Studio (B205, ADR 0055) and the "World addition" and
 * "Extra drops" Studios (B239, ADR 0060). `msm:mod` stays on the schema form.
 *
 * @packageDocumentation
 */

import type { StudioEntry } from '../types';
import { ExtraDropsStudio, WorldAdditionStudio } from './AdditionStudios';
import { BIOME_ADDITION_KIND, LOOT_ADDITION_KIND } from './additions-model';
import { BlockStudio } from './BlockStudio';
import { BLOCK_KIND, EFFECT_KIND, ITEM_KIND } from './blocks-items-model';
import { EffectStudio } from './EffectStudio';
import { ItemStudio } from './ItemStudio';

export const studios: StudioEntry[] = [
  { id: 'msm.blocks-items.block', kindId: BLOCK_KIND, component: BlockStudio },
  { id: 'msm.blocks-items.item', kindId: ITEM_KIND, component: ItemStudio },
  { id: 'msm.blocks-items.effect', kindId: EFFECT_KIND, component: EffectStudio },
  {
    id: 'msm.blocks-items.biome-addition',
    kindId: BIOME_ADDITION_KIND,
    component: WorldAdditionStudio,
  },
  { id: 'msm.blocks-items.loot-addition', kindId: LOOT_ADDITION_KIND, component: ExtraDropsStudio },
];
