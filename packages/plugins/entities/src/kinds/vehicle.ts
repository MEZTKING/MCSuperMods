/**
 * The `msm:vehicle` kind (ADR 0090 D1, D2): a vehicle that is not a mob (the runtime's
 * `MsmVehicle extends VehicleEntity`), with an item of the same id that places it. Element ids
 * belong to the `entity_type` registry; the item id equals the element id.
 */
import type { ElementKind } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { lowerVehicle } from '../lowering/vehicle';

/** Kind id of vehicles. */
export const VEHICLE_KIND = 'msm:vehicle';

export const vehicleKind: ElementKind = {
  id: VEHICLE_KIND,
  schema: MSM_SCHEMA_REFS.vehicle,
  folder: 'vehicle',
  registry: 'entity_type',
  previewKind: 'vehicle',
  // The two required records; every other field takes the defaults of ADR 0090 D2 and D3.
  defaultData: {
    format: 1,
    model: { geometry: '', texture: '' },
    movement: { mode: 'ground' },
  },
  // `format` is written by lowering, so the form hides it.
  hiddenPaths: ['/format'],
  lower: lowerVehicle,
};
