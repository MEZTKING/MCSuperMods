/**
 * `@msm/plugin-entities`: built-in MSM plugin contributing custom mobs (ADR 0028 D6) and
 * vehicles (ADR 0090): the `msm:entity` and `msm:vehicle` kinds, their lowering to runtime
 * definitions under `msm/` plus language keys and item files, the `entities.*` and `vehicles.*`
 * project validators and the "New element" templates.
 */
import { definePlugin } from '@msm/plugin-api';
import { entitiesKinds } from './kinds';
import { entitiesTemplates } from './templates';
import { vehicleTemplates } from './templates/vehicles';
import { entitiesValidators } from './validators';
import { entitiesMobValidators } from './validators-mobs';
import { entitiesVehicleValidators } from './validators-vehicles';

export * from './kinds';
export * from './lowering';
export {
  lowerVehicle,
  VEHICLE_ELEMENT_ONLY_FIELDS,
  VEHICLE_ITEM_PARENT_MODEL,
  vehicleDefinition,
  vehicleDefinitionPath,
  vehicleItemPicture,
} from './lowering/vehicle';
export { displayName, entitiesTemplates } from './templates';
export {
  VEHICLE_GEOMETRY_FORMAT_VERSION,
  VEHICLE_SHAPES,
  VEHICLE_TEMPLATE_SHAPES,
  type VehicleShape,
  vehicleGeometry,
  vehicleTemplateId,
  vehicleTemplates,
} from './templates/vehicles';
export { ENTITIES_PROBLEM_CODES, entitiesValidators } from './validators';
export { ENTITIES_MOB_PROBLEM_CODES, entitiesMobValidators } from './validators-mobs';
export {
  DEFAULT_AIR_MAX_SPEED,
  entitiesVehicleValidators,
  VEHICLE_PROBLEM_CODES,
} from './validators-vehicles';

export default definePlugin({
  id: 'msm.entities',
  apiVersion: '^1.0.0',
  contributes: {
    elementKinds: [...entitiesKinds],
    elementTemplates: [...entitiesTemplates, ...vehicleTemplates],
    validators: [...entitiesValidators, ...entitiesMobValidators, ...entitiesVehicleValidators],
  },
});
