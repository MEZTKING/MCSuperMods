/**
 * The entities Studios (B118), discovered by `studios/studio-registry.ts`: the Entity Studio
 * for `msm:entity` and the Vehicle Studio for `msm:vehicle` (B419, ADR 0091 D1; loaded with
 * `React.lazy`, a chunk of its own) and the Profession Studio for `msm:villager_profession` (B480,
 * ADR 0098 D2; lazy too) and the Villager look Studio for `msm:villager_type` (B538, ADR 0107 D5;
 * lazy too). `msm:geo_model` and `msm:animation` stay on the schema form with the
 * preview beside it; the Raw JSON tab is the power path.
 *
 * @packageDocumentation
 */

import { PROFESSION_KIND } from '@msm/plugin-entities';
import { lazy, Suspense } from 'react';
import { ENTITY_KIND } from '../blocks-items/blocks-items-model';
import {
  MOB_COMMON_SECTIONS,
  PROFESSION_COMMON_SECTIONS,
  RULES_SECTION_ID,
  VILLAGER_TYPE_COMMON_SECTIONS,
} from '../plain';
import type { StudioEntry, StudioProps } from '../types';
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

/** The Profession Studio (ADR 0098 D2, ADR 0101 D1), a chunk of its own. */
const ProfessionStudio = lazy(() => import('./ProfessionStudio'));

/** The Profession Studio behind its loading fallback. */
function LazyProfessionStudio(props: StudioProps) {
  return (
    <Suspense
      fallback={
        <p className="text-muted text-sm" data-testid="profession-studio-loading">
          Loading the Profession Studio…
        </p>
      }
    >
      <ProfessionStudio {...props} />
    </Suspense>
  );
}

/** The Villager look Studio (ADR 0107 D5, ADR 0112 D1), a chunk of its own. */
const VillagerTypeStudio = lazy(() => import('./VillagerTypeStudio'));

/** The Villager look Studio behind its loading fallback. */
function LazyVillagerTypeStudio(props: StudioProps) {
  return (
    <Suspense
      fallback={
        <p className="text-muted text-sm" data-testid="villager-type-studio-loading">
          Loading the Villager look Studio…
        </p>
      }
    >
      <VillagerTypeStudio {...props} />
    </Suspense>
  );
}

/** The vehicle kind (`@msm/plugin-entities`). */
const VEHICLE_KIND = 'msm:vehicle';

/** The Vehicle Studio's main area: the preview, the short form and Rules. */
export const VEHICLE_COMMON_SECTIONS: readonly string[] = [
  RULES_SECTION_ID,
  'vehicle-preview',
  'vehicle-basics',
];

export const studios: StudioEntry[] = [
  {
    id: 'msm.entities.entity',
    kindId: ENTITY_KIND,
    component: EntityStudio,
    common: MOB_COMMON_SECTIONS,
  },
  {
    id: 'msm.entities.vehicle',
    kindId: VEHICLE_KIND,
    component: LazyVehicleStudio,
    common: VEHICLE_COMMON_SECTIONS,
  },
  // The Profession Studio (ADR 0098 D2, ADR 0101 D1; its list of common sections, ADR 0112 D1).
  {
    id: 'msm.entities.profession',
    kindId: PROFESSION_KIND,
    component: LazyProfessionStudio,
    common: PROFESSION_COMMON_SECTIONS,
  },
  // The Villager look Studio (ADR 0107 D5, ADR 0112 D1; B538).
  {
    id: 'msm.entities.villager-type',
    kindId: 'msm:villager_type',
    component: LazyVillagerTypeStudio,
    common: VILLAGER_TYPE_COMMON_SECTIONS,
  },
];
