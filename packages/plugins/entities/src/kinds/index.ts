/**
 * Element kinds contributed by `@msm/plugin-entities` (ADR 0028 D6): `msm:entity` (kind folder
 * `entity`). Element ids are the registry ids: `msm:entity` elements belong to the
 * `entity_type` registry; the spawn egg `<id>_spawn_egg` is derived, not an element.
 */
import type { ElementKind } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { lowerEntity } from '../lowering/entity';

/** Kind id of custom entities. */
export const ENTITY_KIND = 'msm:entity';
/** Kind id of geo models (contributed by `@msm/plugin-models-anim`; referenced by id only). */
export const GEO_MODEL_KIND = 'msm:geo_model';
/** Kind id of animation sets (contributed by `@msm/plugin-models-anim`; referenced by id only). */
export const ANIMATION_KIND = 'msm:animation';

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
  lower: lowerEntity,
};

/** Every kind this plugin contributes, in order. */
export const entitiesKinds: readonly ElementKind[] = Object.freeze([entityKind]);
