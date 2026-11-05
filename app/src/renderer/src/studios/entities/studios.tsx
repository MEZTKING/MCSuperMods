/**
 * The entities Studios (B118), discovered by `studios/studio-registry.ts`: the Entity Studio
 * for `msm:entity`. `msm:geo_model` and `msm:animation` stay on the schema form with the
 * preview beside it; the Raw JSON tab is the power path.
 *
 * @packageDocumentation
 */

import { ENTITY_KIND } from '../blocks-items/blocks-items-model';
import type { StudioEntry } from '../types';
import { EntityStudio } from './EntityStudio';

export const studios: StudioEntry[] = [
  { id: 'msm.entities.entity', kindId: ENTITY_KIND, component: EntityStudio },
];
