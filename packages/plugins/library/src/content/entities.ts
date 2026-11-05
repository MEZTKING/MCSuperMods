/**
 * Geo models and animation sets the entity starter and examples share. The shapes copy the
 * "Cube creature model", "Biped model" and "Idle and walk animations" templates of the models
 * and animation plugin (the library does not import that plugin, ADR 0020): Bedrock geometry
 * 1.12.0 over a 64x64 texture and animation format 1.8.0, with plain numbers only (no Molang).
 *
 * @packageDocumentation
 */
import type { JsonObject } from '@msm/plugin-api';

/** The geometry format version the library's models use. */
export const GEOMETRY_FORMAT_VERSION = '1.12.0';
/** The animation format version the library's animation sets use. */
export const ANIMATION_FORMAT_VERSION = '1.8.0';

function geometry(
  name: string,
  bounds: { width: number; height: number },
  bones: JsonObject[],
): JsonObject {
  return {
    format_version: GEOMETRY_FORMAT_VERSION,
    'minecraft:geometry': [
      {
        description: {
          identifier: `geometry.${name}`,
          texture_width: 64,
          texture_height: 64,
          visible_bounds_width: bounds.width,
          visible_bounds_height: bounds.height,
          visible_bounds_offset: [0, bounds.height / 2, 0],
        },
        bones,
      },
    ],
  };
}

/** A box-shaped creature: a `body` bone and a `head` bone, box UV over 64x64. */
export function cubeCreatureGeometry(name: string): JsonObject {
  return geometry(name, { width: 2, height: 2 }, [
    {
      name: 'body',
      pivot: [0, 10, 0],
      cubes: [{ origin: [-6, 4, -8], size: [12, 10, 16], uv: [0, 0] }],
    },
    {
      name: 'head',
      parent: 'body',
      pivot: [0, 12, -8],
      cubes: [{ origin: [-4, 8, -16], size: [8, 8, 8], uv: [0, 26] }],
    },
  ]);
}

/** A two-legged figure on the player skin layout: body, head, two arms, two legs. */
export function bipedGeometry(name: string): JsonObject {
  return geometry(name, { width: 2, height: 3 }, [
    {
      name: 'body',
      pivot: [0, 24, 0],
      cubes: [{ origin: [-4, 12, -2], size: [8, 12, 4], uv: [16, 16] }],
    },
    {
      name: 'head',
      parent: 'body',
      pivot: [0, 24, 0],
      cubes: [{ origin: [-4, 24, -4], size: [8, 8, 8], uv: [0, 0] }],
    },
    {
      name: 'right_arm',
      parent: 'body',
      pivot: [-5, 22, 0],
      cubes: [{ origin: [-8, 12, -2], size: [4, 12, 4], uv: [40, 16] }],
    },
    {
      name: 'left_arm',
      parent: 'body',
      pivot: [5, 22, 0],
      cubes: [{ origin: [4, 12, -2], size: [4, 12, 4], uv: [32, 48] }],
    },
    {
      name: 'right_leg',
      pivot: [-1.9, 12, 0],
      cubes: [{ origin: [-3.9, 0, -2], size: [4, 12, 4], uv: [0, 16] }],
    },
    {
      name: 'left_leg',
      pivot: [1.9, 12, 0],
      cubes: [{ origin: [-0.1, 0, -2], size: [4, 12, 4], uv: [16, 48] }],
    },
  ]);
}

/** A one-second swing between `+angle` and `-angle` about x, starting at `+angle`. */
const swing = (angle: number): JsonObject => ({
  rotation: {
    '0.0': [angle, 0, 0],
    '0.5': [-angle, 0, 0],
    '1.0': [angle, 0, 0],
  },
});

/**
 * `idle` and `walk` for the biped model, plus a one-shot `attack` (a right-arm swing) when
 * `attack` is true.
 */
export function bipedAnimations(attack: boolean): JsonObject {
  const animations: JsonObject = {
    idle: {
      loop: true,
      animation_length: 2,
      bones: {
        body: { position: { '0.0': [0, 0, 0], '1.0': [0, 0.5, 0], '2.0': [0, 0, 0] } },
        right_arm: { rotation: { '0.0': [0, 0, 0], '1.0': [0, 0, 3], '2.0': [0, 0, 0] } },
        left_arm: { rotation: { '0.0': [0, 0, 0], '1.0': [0, 0, -3], '2.0': [0, 0, 0] } },
      },
    },
    walk: {
      loop: true,
      animation_length: 1,
      bones: {
        right_leg: swing(30),
        left_leg: swing(-30),
        right_arm: swing(-25),
        left_arm: swing(25),
      },
    },
  };
  if (attack) {
    animations.attack = {
      loop: false,
      animation_length: 0.5,
      bones: {
        right_arm: { rotation: { '0.0': [0, 0, 0], '0.2': [-100, 0, 0], '0.5': [0, 0, 0] } },
        left_arm: { rotation: { '0.0': [0, 0, 0], '0.2': [-100, 0, 0], '0.5': [0, 0, 0] } },
      },
    };
  }
  return { format_version: ANIMATION_FORMAT_VERSION, animations };
}

/** `idle` (a slow breathing bob) and `walk` (a waddle) for the cube creature model. */
export function cubeCreatureAnimations(): JsonObject {
  return {
    format_version: ANIMATION_FORMAT_VERSION,
    animations: {
      idle: {
        loop: true,
        animation_length: 3,
        bones: {
          body: { scale: { '0.0': [1, 1, 1], '1.5': [1.02, 1.04, 1.02], '3.0': [1, 1, 1] } },
          head: { rotation: { '0.0': [0, 0, 0], '1.5': [5, 0, 0], '3.0': [0, 0, 0] } },
        },
      },
      walk: {
        loop: true,
        animation_length: 0.8,
        bones: {
          body: { rotation: { '0.0': [0, 0, -4], '0.4': [0, 0, 4], '0.8': [0, 0, -4] } },
          head: { rotation: { '0.0': [0, -6, 0], '0.4': [0, 6, 0], '0.8': [0, -6, 0] } },
        },
      },
    },
  };
}
