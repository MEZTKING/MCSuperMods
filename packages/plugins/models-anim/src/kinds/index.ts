/**
 * Element kinds contributed by `@msm/plugin-models-anim` (ADR 0029 D2): `msm:geo_model` (kind
 * folder `geo_model`) and `msm:animation` (`animation`). The element data is the JSON GeckoLib
 * reads, so the Raw JSON tab edits the real file. Element ids are GeckoLib resource ids, by
 * convention `<ns>:entity/<name>` for a model and `<ns>:entity/<name>_animations` for its
 * animation set (element ids are unique across kinds).
 */
import type { ElementKind, JsonObject } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { lowerAnimation } from '../lowering/animation';
import { lowerGeoModel } from '../lowering/geo-model';

/** Kind id of GeckoLib geo models. */
export const GEO_MODEL_KIND = 'msm:geo_model';
/** Kind id of GeckoLib animation sets. */
export const ANIMATION_KIND = 'msm:animation';

/** The geometry format version new models are written with. */
export const GEOMETRY_FORMAT_VERSION = '1.12.0';
/** The animation format version new animation sets are written with. */
export const ANIMATION_FORMAT_VERSION = '1.8.0';

/** One bone `body` with one 16x16x16 cube over a 64x64 texture. */
const DEFAULT_GEO_MODEL: JsonObject = {
  format_version: GEOMETRY_FORMAT_VERSION,
  'minecraft:geometry': [
    {
      description: {
        identifier: 'geometry.unknown',
        texture_width: 64,
        texture_height: 64,
        visible_bounds_width: 2,
        visible_bounds_height: 2,
        visible_bounds_offset: [0, 0.5, 0],
      },
      bones: [
        {
          name: 'body',
          pivot: [0, 0, 0],
          cubes: [{ origin: [-8, 0, -8], size: [16, 16, 16], uv: [0, 0] }],
        },
      ],
    },
  ],
};

/** An `idle` loop of 2 seconds with a gentle `body` position bob. */
const DEFAULT_ANIMATION: JsonObject = {
  format_version: ANIMATION_FORMAT_VERSION,
  animations: {
    idle: {
      loop: true,
      animation_length: 2,
      bones: {
        body: {
          position: { '0.0': [0, 0, 0], '1.0': [0, 0.5, 0], '2.0': [0, 0, 0] },
        },
      },
    },
  },
};

export const geoModelKind: ElementKind = {
  id: GEO_MODEL_KIND,
  schema: MSM_SCHEMA_REFS.geoModel,
  folder: 'geo_model',
  registry: 'geo_model',
  defaultData: DEFAULT_GEO_MODEL,
  previewKind: 'geo_model',
  lower: lowerGeoModel,
};

export const animationKind: ElementKind = {
  id: ANIMATION_KIND,
  schema: MSM_SCHEMA_REFS.animation,
  folder: 'animation',
  registry: 'animation',
  defaultData: DEFAULT_ANIMATION,
  previewKind: 'animation',
  lower: lowerAnimation,
};

/** Every kind this plugin contributes, in order. */
export const modelsAnimKinds: readonly ElementKind[] = Object.freeze([geoModelKind, animationKind]);
