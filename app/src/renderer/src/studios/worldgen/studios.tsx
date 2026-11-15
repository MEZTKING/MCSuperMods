/**
 * The worldgen Studios (plan D7, B80), discovered by `studios/studio-registry.ts`: the Biome
 * Studio, the Placed Feature Studio, the Tree Feature Studio (ADR 0068 D5) for configured
 * features of type `minecraft:tree` and the Dimension Type Studio (ADR 0100 D1), loaded with
 * `React.lazy` inside a `Suspense` fallback so its code is a chunk of its own. Other configured
 * features stay on the schema form.
 *
 * @packageDocumentation
 */

import { lazy, Suspense } from 'react';
import type { StudioEntry, StudioProps } from '../types';
import { BiomeStudio } from './BiomeStudio';
import { DIMENSION_TYPE_KIND } from './dimension-type-model';
import { PlacedFeatureStudio } from './PlacedFeatureStudio';
import { TreeFeatureStudio } from './TreeFeatureStudio';
import { FEATURE_KIND, isTreeFeature } from './tree-model';
import { BIOME_KIND, PLACED_FEATURE_KIND } from './worldgen-model';

/** The Dimension Type Studio (ADR 0100 D1), a chunk of its own. */
const DimensionTypeStudio = lazy(() => import('./DimensionTypeStudio'));

/** The Dimension Type Studio behind its loading fallback. */
function LazyDimensionTypeStudio(props: StudioProps) {
  return (
    <Suspense
      fallback={
        <p className="text-muted text-xs" data-testid="dimension-type-studio-loading">
          Loading the Dimension Type Studio…
        </p>
      }
    >
      <DimensionTypeStudio {...props} />
    </Suspense>
  );
}

export const studios: StudioEntry[] = [
  { id: 'msm.worldgen.biome', kindId: BIOME_KIND, component: BiomeStudio },
  {
    id: 'msm.worldgen.placed-feature',
    kindId: PLACED_FEATURE_KIND,
    component: PlacedFeatureStudio,
  },
  {
    id: 'msm.worldgen.tree-feature',
    kindId: FEATURE_KIND,
    matches: (element) => isTreeFeature(element.data),
    component: TreeFeatureStudio,
  },
  {
    id: 'msm.worldgen.dimension-type',
    kindId: DIMENSION_TYPE_KIND,
    component: LazyDimensionTypeStudio,
  },
];
