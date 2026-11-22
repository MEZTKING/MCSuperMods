/**
 * `@msm/plugin-entities`: built-in MSM plugin contributing custom mobs (ADR 0028 D6), vehicles
 * (ADR 0090), villager professions (ADR 0098 D2) and villager types (ADR 0107 D5): the
 * `msm:entity`, `msm:vehicle`, `msm:villager_profession` and `msm:villager_type` kinds, their lowering to runtime definitions under `msm/` plus
 * language keys, item files, trade sets and tags, the `entities.*` and `vehicles.*` project
 * validators and the "New element" templates.
 */
import { definePlugin } from '@msm/plugin-api';
import { entitiesKinds } from './kinds';
import { entitiesTemplates } from './templates';
import { mob2Templates } from './templates/mobs-2';
import { vehicleTemplates } from './templates/vehicles';
import { villagerTemplates } from './templates/villagers';
import { entitiesValidators } from './validators';
import { entitiesMobValidators } from './validators-mobs';
import { entitiesMob2Validators } from './validators-mobs-2';
import { entitiesVehicleValidators } from './validators-vehicles';
import { entitiesVillagerValidators } from './validators-villagers';

export * from './kinds';
export * from './lowering';
export {
  BUCKET_ELEMENT_ONLY_FIELDS,
  BUCKET_PARENT_MODEL,
  BUCKETABLE_COMPONENT,
  bucketItemFiles,
  bucketItemId,
  bucketItemPath,
  bucketLanguageKeys,
  bucketNameKey,
  bucketTexture,
  DEFAULT_EMPTY_BUCKET_TEXTURE,
  DEFAULT_WATER_BUCKET_TEXTURE,
} from './lowering/bucket';
export {
  ACQUIRABLE_JOB_SITE_TAG,
  DEFAULT_TRADES_PER_LEVEL,
  defaultTradeSets,
  lowerProfession,
  PROFESSION_ELEMENT_ONLY_FIELDS,
  PROFESSION_LEVELS,
  type ProfessionTexture,
  professionDefinition,
  professionDefinitionPath,
  professionNameKey,
  professionTexturePaths,
} from './lowering/profession';
export {
  SHOULDER_COMPONENT,
  SHOULDER_MAX_WIDTH,
  SHOULDER_SIDES,
  shoulderDefinition,
} from './lowering/shoulder';
export { DEFAULT_STORAGE_ROWS, STORAGE_COMPONENT, storageDefinition } from './lowering/storage';
export { TRADER_COMPONENT, traderDefinition } from './lowering/trader';
export {
  lowerVehicle,
  VEHICLE_ELEMENT_ONLY_FIELDS,
  VEHICLE_ITEM_PARENT_MODEL,
  vehicleDefinition,
  vehicleDefinitionPath,
  vehicleItemPicture,
} from './lowering/vehicle';
export {
  lowerVillagerType,
  TEXTURE_META_SCHEMA,
  VILLAGER_TYPE_ELEMENT_ONLY_FIELDS,
  VILLAGER_TYPE_ENTITIES,
  type VillagerTypeTexture,
  villagerTypeDefinition,
  villagerTypeDefinitionPath,
  villagerTypeTextureId,
  villagerTypeTexturePaths,
} from './lowering/villager-type';
export { displayName, entitiesTemplates } from './templates';
export { bucketTextureId, MOB2_TEMPLATE_CATEGORY, mob2Templates } from './templates/mobs-2';
export {
  VEHICLE_GEOMETRY_FORMAT_VERSION,
  VEHICLE_SHAPES,
  VEHICLE_TEMPLATE_SHAPES,
  type VehicleShape,
  vehicleGeometry,
  vehicleTemplateId,
  vehicleTemplates,
} from './templates/vehicles';
export {
  jobSiteId,
  professionTextureId,
  VILLAGER_TEMPLATE_CATEGORY,
  villagerTemplates,
} from './templates/villagers';
export { ENTITIES_PROBLEM_CODES, entitiesValidators } from './validators';
export { ENTITIES_MOB_PROBLEM_CODES, entitiesMobValidators } from './validators-mobs';
export {
  blockReferenceTest,
  ENTITIES_MOB2_PROBLEM_CODES,
  entitiesMob2Validators,
} from './validators-mobs-2';
export {
  DEFAULT_AIR_MAX_SPEED,
  entitiesVehicleValidators,
  VEHICLE_PROBLEM_CODES,
} from './validators-vehicles';
export {
  ENTITIES_VILLAGER_PROBLEM_CODES,
  entitiesVillagerValidators,
} from './validators-villagers';

export default definePlugin({
  id: 'msm.entities',
  apiVersion: '^1.0.0',
  contributes: {
    elementKinds: [...entitiesKinds],
    elementTemplates: [
      ...entitiesTemplates,
      ...vehicleTemplates,
      ...villagerTemplates,
      ...mob2Templates,
    ],
    validators: [
      ...entitiesValidators,
      ...entitiesMobValidators,
      ...entitiesMob2Validators,
      ...entitiesVehicleValidators,
      ...entitiesVillagerValidators,
    ],
  },
});
