/**
 * The worldgen Studios (plan D7, B80), discovered by `studios/studio-registry.ts`: the Biome
 * Studio, the Placed Feature Studio and the Tree Feature Studio (ADR 0068 D5) for configured
 * features of type `minecraft:tree`. Other configured features stay on the schema form.
 *
 * @packageDocumentation
 */

import type { StudioEntry } from '../types';
import { BiomeStudio } from './BiomeStudio';
import { PlacedFeatureStudio } from './PlacedFeatureStudio';
import { TreeFeatureStudio } from './TreeFeatureStudio';
import { FEATURE_KIND, isTreeFeature } from './tree-model';
import { BIOME_KIND, PLACED_FEATURE_KIND } from './worldgen-model';

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
];
