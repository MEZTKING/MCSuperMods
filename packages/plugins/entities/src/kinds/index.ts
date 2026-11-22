/**
 * Element kinds contributed by `@msm/plugin-entities` (ADR 0028 D6): `msm:entity` (kind folder
 * `entity`), `msm:vehicle` (kind folder `vehicle`, ADR 0090; `./vehicle`),
 * `msm:villager_profession` (kind folder `villager_profession`, ADR 0098 D2; `./profession`) and
 * `msm:villager_type` (kind folder `villager_type`, ADR 0107 D5; `./villager-type`). Element ids
 * are the registry ids: entities and vehicles belong to the `entity_type` registry, professions
 * to `villager_profession`, villager types to `villager_type`; the spawn egg `<id>_spawn_egg`, a
 * vehicle's item (the vehicle's own id) and a bucketable mob's bucket `<id>_bucket` are derived,
 * not elements.
 *
 * The entity's lowering runs the components of ADR 0098 through their own modules after
 * `lowerEntity`: `msm:trader` (`lowering/trader.ts`), `msm:storage` (`lowering/storage.ts`) and
 * `msm:shoulder_riding` (`lowering/shoulder.ts`, with ADR 0109 D2's `sides`); `msm:bucketable`
 * (ADR 0109 D1) passes through, and `lowerEntity` adds its bucket item's files
 * (`lowering/bucket.ts`).
 */
import type { Element, ElementKind, OutputFile, TargetFacts } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { lowerEntity } from '../lowering/entity';
import { isRecord } from '../lowering/paths';
import { lowerShoulderComponent } from '../lowering/shoulder';
import { lowerStorageComponent } from '../lowering/storage';
import { lowerTraderComponent } from '../lowering/trader';
import { professionKind } from './profession';
import { vehicleKind } from './vehicle';
import { villagerTypeKind } from './villager-type';

export { PROFESSION_KIND, professionKind } from './profession';
export { VEHICLE_KIND, vehicleKind } from './vehicle';
export { VILLAGER_TYPE_KIND, villagerTypeKind } from './villager-type';

/** Kind id of custom entities. */
export const ENTITY_KIND = 'msm:entity';
/** Kind id of geo models (contributed by `@msm/plugin-models-anim`; referenced by id only). */
export const GEO_MODEL_KIND = 'msm:geo_model';
/** Kind id of animation sets (contributed by `@msm/plugin-models-anim`; referenced by id only). */
export const ANIMATION_KIND = 'msm:animation';

/**
 * Lowers an `msm:entity` element: {@link lowerEntity}, then the runtime forms of the ADR 0098
 * components in the definition (the first file): the trader's default trade sound from the
 * target, the storage's default rows and `needs_chest`, the shoulder component as `{}`.
 */
export function lowerEntityWithComponents(element: Element, target: TargetFacts): OutputFile[] {
  const files = lowerEntity(element, target);
  const definition = files[0]?.contents;
  if (definition instanceof Uint8Array || !isRecord(definition)) return files;
  const components = definition.components;
  if (isRecord(components)) {
    lowerTraderComponent(components, target);
    lowerStorageComponent(components);
    lowerShoulderComponent(components);
  }
  return files;
}

export const entityKind: ElementKind = {
  id: ENTITY_KIND,
  schema: MSM_SCHEMA_REFS.entity,
  folder: 'entity',
  registry: 'entity_type',
  previewKind: 'entity',
  defaultData: {
    format: 1,
    category: 'creature',
    size: { width: 0.6, height: 1.8 },
    spawn_egg: {},
    components: {
      'msm:health': { max: 20 },
      'msm:movement': { speed: 0.25 },
      'msm:ai_goals': {
        goals: [{ type: 'wander' }, { type: 'look_at_player' }, { type: 'look_around' }],
      },
      'msm:animated_model': { model: '', animations: '', texture: '' },
    },
  },
  // `format` is written by lowering, so the form hides it.
  hiddenPaths: ['/format'],
  lower: lowerEntityWithComponents,
};

/** Every kind this plugin contributes, in order. */
export const entitiesKinds: readonly ElementKind[] = Object.freeze([
  entityKind,
  vehicleKind,
  professionKind,
  villagerTypeKind,
]);
