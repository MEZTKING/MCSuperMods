/**
 * The entities Studios (B118), discovered by `studios/studio-registry.ts`: the Entity Studio
 * for `msm:entity` and the Vehicle Studio for `msm:vehicle` (B419, ADR 0091 D1; loaded with
 * `React.lazy`, a chunk of its own). `msm:geo_model` and `msm:animation` stay on the schema form with the
 * preview beside it; the Raw JSON tab is the power path.
 *
 * @packageDocumentation
 */

import { lazy, Suspense } from 'react';
import { ENTITY_KIND } from '../blocks-items/blocks-items-model';
import type { StudioEntry, StudioProps } from '../types';
import { MOB_VERY_EASY_SECTIONS, RULES_SECTION_ID } from '../very-easy';
import { EntityStudio } from './EntityStudio';

/** The Vehicle Studio (B419, ADR 0091 D1), a chunk of its own. */
const VehicleStudio = lazy(() => import('./vehicle/VehicleStudio'));

/** The Vehicle Studio behind its loading fallback. */
function LazyVehicleStudio(props: StudioProps) {
  return (
    <Suspense
      fallback={
        <p className="text-muted text-sm" data-testid="vehicle-studio-loading">
          Loading the Vehicle Studio…
        </p>
      }
    >
      <VehicleStudio {...props} />
    </Suspense>
  );
}

/** The vehicle kind (`@msm/plugin-entities`). */
const VEHICLE_KIND = 'msm:vehicle';

/** The Vehicle Studio's sections in Very easy: the preview, the short form and Rules. */
export const VEHICLE_VERY_EASY_SECTIONS: readonly string[] = [
  RULES_SECTION_ID,
  'vehicle-preview',
  'vehicle-basics',
];

export const studios: StudioEntry[] = [
  {
    id: 'msm.entities.entity',
    kindId: ENTITY_KIND,
    component: EntityStudio,
    veryEasy: MOB_VERY_EASY_SECTIONS,
  },
  {
    id: 'msm.entities.vehicle',
    kindId: VEHICLE_KIND,
    component: LazyVehicleStudio,
    veryEasy: VEHICLE_VERY_EASY_SECTIONS,
  },
];
