/**
 * The worldgen Studios (plan D7, B80), discovered by `studios/studio-registry.ts`: the Biome
 * Studio and the Placed Feature Studio. Configured features stay on the schema form.
 *
 * @packageDocumentation
 */

import type { StudioEntry } from '../types';
import { BiomeStudio } from './BiomeStudio';
import { PlacedFeatureStudio } from './PlacedFeatureStudio';
import { BIOME_KIND, PLACED_FEATURE_KIND } from './worldgen-model';

export const studios: StudioEntry[] = [
  { id: 'msm.worldgen.biome', kindId: BIOME_KIND, component: BiomeStudio },
  {
    id: 'msm.worldgen.placed-feature',
    kindId: PLACED_FEATURE_KIND,
    component: PlacedFeatureStudio,
  },
];
