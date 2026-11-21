/**
 * The blocks and items Studios (B97), discovered by `studios/studio-registry.ts`: the Block
 * Studio, the Item Studio, the Effect Studio (B205, ADR 0055), the Potion Studio (B253, ADR 0063) and the "World addition" and
 * "Extra drops" Studios (B239, ADR 0060), the Particle Studio (B353, ADR 0081 D1), the Creative
 * Tab Studio and the Fluid Studio (B480, ADR 0099 D1), the last three loaded with
 * `React.lazy` inside a `Suspense` fallback so its code is a chunk of its own. `msm:mod` stays
 * on the schema form.
 *
 * @packageDocumentation
 */

import { CREATIVE_TAB_KIND, FLUID_KIND } from '@msm/plugin-blocks-items';
import { lazy, Suspense } from 'react';
import type { StudioEntry, StudioProps } from '../types';
import {
  BLOCK_VERY_EASY_SECTIONS,
  EFFECT_VERY_EASY_SECTIONS,
  ITEM_VERY_EASY_SECTIONS,
  POTION_VERY_EASY_SECTIONS,
} from '../very-easy';
import { ExtraDropsStudio, WorldAdditionStudio } from './AdditionStudios';
import { BIOME_ADDITION_KIND, LOOT_ADDITION_KIND } from './additions-model';
import { BlockStudio } from './BlockStudio';
import { BLOCK_KIND, EFFECT_KIND, ITEM_KIND, PARTICLE_KIND } from './blocks-items-model';
import { EffectStudio } from './EffectStudio';
import { ItemStudio } from './ItemStudio';
import { PotionStudio } from './PotionStudio';
import { POTION_KIND } from './potion-model';

/** The Particle Studio (ADR 0081 D1), a chunk of its own. */
const ParticleStudio = lazy(() => import('./ParticleStudio'));

/** The Particle Studio behind its loading fallback. */
function LazyParticleStudio(props: StudioProps) {
  return (
    <Suspense
      fallback={
        <p className="text-muted text-xs" data-testid="particle-studio-loading">
          Loading the Particle Studio…
        </p>
      }
    >
      <ParticleStudio {...props} />
    </Suspense>
  );
}

/** The Creative Tab Studio (ADR 0096 D2, ADR 0101 D1), a chunk of its own. */
const CreativeTabStudio = lazy(() => import('./CreativeTabStudio'));

/** The Creative Tab Studio behind its loading fallback. */
function LazyCreativeTabStudio(props: StudioProps) {
  return (
    <Suspense
      fallback={
        <p className="text-muted text-xs" data-testid="creative-tab-studio-loading">
          Loading the Creative Tab Studio…
        </p>
      }
    >
      <CreativeTabStudio {...props} />
    </Suspense>
  );
}

/** The Fluid Studio (ADR 0099 D1, ADR 0101 D1), a chunk of its own. */
const FluidStudio = lazy(() => import('./FluidStudio'));

/** The Fluid Studio behind its loading fallback. */
function LazyFluidStudio(props: StudioProps) {
  return (
    <Suspense
      fallback={
        <p className="text-muted text-xs" data-testid="fluid-studio-loading">
          Loading the Fluid Studio…
        </p>
      }
    >
      <FluidStudio {...props} />
    </Suspense>
  );
}

export const studios: StudioEntry[] = [
  {
    id: 'msm.blocks-items.block',
    kindId: BLOCK_KIND,
    component: BlockStudio,
    veryEasy: BLOCK_VERY_EASY_SECTIONS,
  },
  {
    id: 'msm.blocks-items.item',
    kindId: ITEM_KIND,
    component: ItemStudio,
    veryEasy: ITEM_VERY_EASY_SECTIONS,
  },
  {
    id: 'msm.blocks-items.effect',
    kindId: EFFECT_KIND,
    component: EffectStudio,
    veryEasy: EFFECT_VERY_EASY_SECTIONS,
  },
  {
    id: 'msm.blocks-items.potion',
    kindId: POTION_KIND,
    component: PotionStudio,
    veryEasy: POTION_VERY_EASY_SECTIONS,
  },
  {
    id: 'msm.blocks-items.biome-addition',
    kindId: BIOME_ADDITION_KIND,
    component: WorldAdditionStudio,
  },
  { id: 'msm.blocks-items.loot-addition', kindId: LOOT_ADDITION_KIND, component: ExtraDropsStudio },
  { id: 'msm.blocks-items.particle', kindId: PARTICLE_KIND, component: LazyParticleStudio },
  // The Creative Tab Studio (ADR 0096 D2, ADR 0101 D1).
  {
    id: 'msm.blocks-items.creative-tab',
    kindId: CREATIVE_TAB_KIND,
    component: LazyCreativeTabStudio,
  },
  // The Fluid Studio (ADR 0099 D1, ADR 0101 D1).
  { id: 'msm.blocks-items.fluid', kindId: FLUID_KIND, component: LazyFluidStudio },
];
