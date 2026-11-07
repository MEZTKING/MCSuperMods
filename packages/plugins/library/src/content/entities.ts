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
  textureHeight = 64,
): JsonObject {
  return {
    format_version: GEOMETRY_FORMAT_VERSION,
    'minecraft:geometry': [
      {
        description: {
          identifier: `geometry.${name}`,
          texture_width: 64,
          texture_height: textureHeight,
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

/** Options of {@link bipedGeometry}, for a player skin on the figure. */
export interface BipedOptions {
  /**
   * `modern`: the 64 by 64 layout (the default). `legacy`: an old 64 by 32 skin, the left arm
   * and leg mirrored from the right ones, as the game drew it before 1.8.
   */
  layout?: 'modern' | 'legacy';
  /** Adds the skin's second layer (hat, jacket, sleeves, trousers); modern layout only. */
  overlay?: boolean;
  /** Arms 3 pixels wide, for slim (Alex-style) skins. */
  slim?: boolean;
}

/** A cube over `uv`, slightly larger by `inflate` when given, mirrored when `mirror`. */
function cube(
  origin: number[],
  size: number[],
  uv: number[],
  extra: { inflate?: number; mirror?: boolean } = {},
): JsonObject {
  return {
    origin,
    size,
    uv,
    ...(extra.inflate === undefined ? {} : { inflate: extra.inflate }),
    ...(extra.mirror === true ? { mirror: true } : {}),
  };
}

/**
 * A two-legged figure on the player skin layout: body, head, two arms, two legs. With the
 * default options it is the model of earlier versions, byte for byte.
 */
export function bipedGeometry(name: string, options: BipedOptions = {}): JsonObject {
  const legacy = options.layout === 'legacy';
  const overlay = options.overlay === true && !legacy;
  const arm = options.slim === true ? 3 : 4;
  const layer = (base: JsonObject, extra: JsonObject | null): JsonObject[] =>
    overlay && extra !== null ? [base, extra] : [base];
  return geometry(
    name,
    { width: 2, height: 3 },
    [
      {
        name: 'body',
        pivot: [0, 24, 0],
        cubes: layer(
          cube([-4, 12, -2], [8, 12, 4], [16, 16]),
          cube([-4, 12, -2], [8, 12, 4], [16, 32], { inflate: 0.25 }),
        ),
      },
      {
        name: 'head',
        parent: 'body',
        pivot: [0, 24, 0],
        cubes: layer(
          cube([-4, 24, -4], [8, 8, 8], [0, 0]),
          cube([-4, 24, -4], [8, 8, 8], [32, 0], { inflate: 0.5 }),
        ),
      },
      {
        name: 'right_arm',
        parent: 'body',
        pivot: [-5, 22, 0],
        cubes: layer(
          cube([-4 - arm, 12, -2], [arm, 12, 4], [40, 16]),
          cube([-4 - arm, 12, -2], [arm, 12, 4], [40, 32], { inflate: 0.25 }),
        ),
      },
      {
        name: 'left_arm',
        parent: 'body',
        pivot: [5, 22, 0],
        cubes: layer(
          legacy
            ? cube([4, 12, -2], [arm, 12, 4], [40, 16], { mirror: true })
            : cube([4, 12, -2], [arm, 12, 4], [32, 48]),
          cube([4, 12, -2], [arm, 12, 4], [48, 48], { inflate: 0.25 }),
        ),
      },
      {
        name: 'right_leg',
        pivot: [-1.9, 12, 0],
        cubes: layer(
          cube([-3.9, 0, -2], [4, 12, 4], [0, 16]),
          cube([-3.9, 0, -2], [4, 12, 4], [0, 32], { inflate: 0.25 }),
        ),
      },
      {
        name: 'left_leg',
        pivot: [1.9, 12, 0],
        cubes: layer(
          legacy
            ? cube([-0.1, 0, -2], [4, 12, 4], [0, 16], { mirror: true })
            : cube([-0.1, 0, -2], [4, 12, 4], [16, 48]),
          cube([-0.1, 0, -2], [4, 12, 4], [0, 48], { inflate: 0.25 }),
        ),
      },
    ],
    legacy ? 32 : 64,
  );
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
