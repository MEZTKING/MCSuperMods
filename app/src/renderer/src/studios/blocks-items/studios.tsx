/**
 * The blocks and items Studios (B97), discovered by `studios/studio-registry.ts`: the Block
 * Studio, the Item Studio, the Effect Studio (B205, ADR 0055), the Potion Studio (B253, ADR 0063) and the "World addition" and
 * "Extra drops" Studios (B239, ADR 0060), the Particle Studio (B353, ADR 0081 D1), the Creative
 * Tab Studio and the Fluid Studio (B480, ADR 0099 D1), the "Vanilla block rules" Studio (B516,
 * ADR 0105 D4), the Particle, Creative Tab and Fluid Studios loaded with
 * `React.lazy` inside a `Suspense` fallback so its code is a chunk of its own. `msm:mod` stays
 * on the schema form.
 *
 * @packageDocumentation
 */

import { CREATIVE_TAB_KIND, FLUID_KIND } from '@msm/plugin-blocks-items';
import { lazy, Suspense } from 'react';
import {
  BLOCK_COMMON_SECTIONS,
  EFFECT_COMMON_SECTIONS,
  FLUID_COMMON_SECTIONS,
  ITEM_COMMON_SECTIONS,
  POTION_COMMON_SECTIONS,
} from '../plain';
import type { StudioEntry, StudioProps } from '../types';
import {
  ExtraDropsStudio,
  VanillaBlockRulesStudio,
  WORLD_ADDITION_MAP_SECTION,
  WorldAdditionStudio,
} from './AdditionStudios';
import {
  BIOME_ADDITION_KIND,
  LOOT_ADDITION_KIND,
  VANILLA_BLOCK_RULES_KIND,
} from './additions-model';
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

/**
 * The common sections of the Studios split by B705 (ADR 0130 D3): what a first-timer sets to
 * get a working thing, its live view among them. Declared here, not in `studios/plain.ts`.
 */
export const PARTICLE_COMMON_SECTIONS: readonly string[] = [
  'particle-pictures',
  'particle-life',
  'particle-movement',
  'particle-colour',
  'particle-preview-section',
];

/** The Creative tab Studio's sections in the main area. */
export const CREATIVE_TAB_COMMON_SECTIONS: readonly string[] = [
  'creative-tab-preview',
  'creative-tab-general',
  'creative-tab-hand-order',
  'creative-tab-members',
];

/** The World addition Studio's sections in the main area. */
export const WORLD_ADDITION_COMMON_SECTIONS: readonly string[] = [
  WORLD_ADDITION_MAP_SECTION,
  'world-addition-biomes',
  'world-addition-features',
  'world-addition-spawns',
];

/** The Extra drops Studio's sections in the main area. */
export const EXTRA_DROPS_COMMON_SECTIONS: readonly string[] = [
  'extra-drops-tables',
  'extra-drops-pools',
  'extra-drops-live',
];

/**
 * The Vanilla block rules Studio's sections in the main area: the axe, shovel and hoe, burning
 * and Try it here; honeycomb and ageing are all More options.
 */
export const VANILLA_BLOCK_RULES_COMMON_SECTIONS: readonly string[] = [
  'vanilla-rules-strip',
  'vanilla-rules-flatten',
  'vanilla-rules-till',
  'vanilla-rules-burn',
  'vanilla-rules-try-it-here',
];

export const studios: StudioEntry[] = [
  {
    id: 'msm.blocks-items.block',
    kindId: BLOCK_KIND,
    component: BlockStudio,
    common: BLOCK_COMMON_SECTIONS,
  },
  {
    id: 'msm.blocks-items.item',
    kindId: ITEM_KIND,
    component: ItemStudio,
    common: ITEM_COMMON_SECTIONS,
  },
  {
    id: 'msm.blocks-items.effect',
    kindId: EFFECT_KIND,
    component: EffectStudio,
    common: EFFECT_COMMON_SECTIONS,
  },
  {
    id: 'msm.blocks-items.potion',
    kindId: POTION_KIND,
    component: PotionStudio,
    common: POTION_COMMON_SECTIONS,
  },
  {
    id: 'msm.blocks-items.biome-addition',
    kindId: BIOME_ADDITION_KIND,
    component: WorldAdditionStudio,
    common: WORLD_ADDITION_COMMON_SECTIONS,
  },
  {
    id: 'msm.blocks-items.loot-addition',
    kindId: LOOT_ADDITION_KIND,
    component: ExtraDropsStudio,
    common: EXTRA_DROPS_COMMON_SECTIONS,
  },
  // The "Vanilla block rules" Studio (ADR 0105 D4, ADR 0112 D1).
  {
    id: 'msm.blocks-items.vanilla-block-rules',
    kindId: VANILLA_BLOCK_RULES_KIND,
    component: VanillaBlockRulesStudio,
    common: VANILLA_BLOCK_RULES_COMMON_SECTIONS,
  },
  {
    id: 'msm.blocks-items.particle',
    kindId: PARTICLE_KIND,
    component: LazyParticleStudio,
    common: PARTICLE_COMMON_SECTIONS,
  },
  // The Creative Tab Studio (ADR 0096 D2, ADR 0101 D1).
  {
    id: 'msm.blocks-items.creative-tab',
    kindId: CREATIVE_TAB_KIND,
    component: LazyCreativeTabStudio,
    common: CREATIVE_TAB_COMMON_SECTIONS,
  },
  // The Fluid Studio (ADR 0099 D1, ADR 0101 D1).
  {
    id: 'msm.blocks-items.fluid',
    kindId: FLUID_KIND,
    component: LazyFluidStudio,
    // Its list of common sections (ADR 0112 D1, B538).
    common: FLUID_COMMON_SECTIONS,
  },
];
