/**
 * Preset mob models (ADR 0073 D1): original geometries, animation sets and skins for the mob
 * Creator flows and examples. Each preset is Bedrock geometry 1.12.0 with box UV over a 64x64
 * or 64x32 texture and an animation set in format 1.8.0 with `idle`, `walk` and the state
 * animations that fit it. Every value is a plain number and every keyframe linear, so both the
 * GeckoLib and the vanilla renderer play the sets fully (ADR 0072 D3) and the
 * `entities.vanilla-renderer-subset` warning stays silent.
 *
 * Rules the presets keep (B285): whole-number cube sizes and UV offsets (the app preview floors
 * box UV sizes, the game does not), no cube rotations, unique bone names, and no bone named
 * `root` (vanilla's `ModelPart.createPartLookup` reserves that name for the model root, so an
 * animation could not reach such a bone). The shapes are drawn from scratch for MSM; none is
 * copied from a vanilla model.
 *
 * Bones face north (-z); `right_*` bones are on -x, as on the biped.
 *
 * @packageDocumentation
 */
import type { JsonObject } from '@msm/plugin-api';
import { boxSkinPng, type PlaceholderOptions, type SkinBox } from '../assets/png';
import {
  ANIMATION_FORMAT_VERSION,
  bipedAnimations,
  bipedGeometry,
  cubeCreatureAnimations,
  cubeCreatureGeometry,
  GEOMETRY_FORMAT_VERSION,
} from './entities';

/** The preset names, in the order a picker lists them. */
export const MOB_PRESET_NAMES = [
  'quadruped',
  'bird',
  'fish',
  'flyer',
  'biped',
  'cube_creature',
] as const;

/** A preset model's name. */
export type MobPresetName = (typeof MOB_PRESET_NAMES)[number];

/**
 * The state animations an `msm:animated_model` component can name besides `idle` and `walk`
 * (ADR 0071 D6, ADR 0070 D4).
 */
export type MobStateAnimation = 'sit' | 'fly' | 'swim' | 'attack' | 'shoot';

/** One preset model. */
export interface MobPreset {
  /** The preset's name. */
  name: MobPresetName;
  /** English label for pickers. */
  label: string;
  /** One sentence for pickers. */
  description: string;
  /** Texture size in pixels; the skin and any picture must have it. */
  texture: { width: number; height: number };
  /** Every bone name, in file order. */
  bones: readonly string[];
  /** The bone shown only while the mob is saddled (`msm:rideable` `saddle_bone`), if any. */
  saddleBone?: string;
  /**
   * The state animations of the set besides `idle` and `walk`; each is the animation's name in
   * the set and the `msm:animated_model` field of the same name.
   */
  states: readonly MobStateAnimation[];
  /** The geometry, with identifier `geometry.<name>`. */
  geometry(name: string): JsonObject;
  /** The animation set. */
  animations(): JsonObject;
}

// Shared helpers --------------------------------------------------------------------------

type Vec = [number, number, number];

function geometry(
  name: string,
  texture: { width: number; height: number },
  bounds: { width: number; height: number },
  bones: JsonObject[],
): JsonObject {
  return {
    format_version: GEOMETRY_FORMAT_VERSION,
    'minecraft:geometry': [
      {
        description: {
          identifier: `geometry.${name}`,
          texture_width: texture.width,
          texture_height: texture.height,
          visible_bounds_width: bounds.width,
          visible_bounds_height: bounds.height,
          visible_bounds_offset: [0, bounds.height / 2, 0],
        },
        bones,
      },
    ],
  };
}

/** A box-UV cube; `inflate` only when given. */
const cube = (origin: Vec, size: Vec, uv: [number, number], inflate?: number): JsonObject => ({
  origin,
  size,
  uv,
  ...(inflate === undefined ? {} : { inflate }),
});

/** A bone; `parent` and `rotation` only when given. */
function bone(
  name: string,
  pivot: Vec,
  cubes: JsonObject[],
  extra: { parent?: string; rotation?: Vec } = {},
): JsonObject {
  return {
    name,
    ...(extra.parent === undefined ? {} : { parent: extra.parent }),
    pivot,
    ...(extra.rotation === undefined ? {} : { rotation: extra.rotation }),
    cubes,
  };
}

/** Linear keyframes from `[time, value]` pairs, keyed as the existing sets are (`"0.5"`). */
function keys(...frames: [number, Vec][]): JsonObject {
  const out: JsonObject = {};
  for (const [time, value] of frames) {
    const rounded = Math.round(time * 1000) / 1000;
    out[rounded.toFixed(Math.max(1, decimals(rounded)))] = value;
  }
  return out;
}

const decimals = (value: number): number => {
  const text = String(value);
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
};

/** A loop that goes from `a` to `b` at half `length` and back to `a`. */
const pingPong = (length: number, a: Vec, b: Vec): JsonObject =>
  keys([0, a], [length / 2, b], [length, a]);

/** A loop through `0`, `+peak`, `0`, `-peak`, `0` in four even steps. */
const sway = (length: number, peak: Vec): JsonObject => {
  const minus: Vec = [-peak[0], -peak[1], -peak[2]];
  return keys(
    [0, [0, 0, 0]],
    [length / 4, peak],
    [length / 2, [0, 0, 0]],
    [(3 * length) / 4, minus],
    [length, [0, 0, 0]],
  );
};

/** A pose held for the whole of a looping animation (two equal keyframes). */
const hold = (length: number, value: Vec): JsonObject => keys([0, value], [length, value]);

/** A one-shot from rest to `peak` at `at` and back to rest at `length`. */
const strike = (length: number, at: number, peak: Vec): JsonObject =>
  keys([0, [0, 0, 0]], [at, peak], [length, [0, 0, 0]]);

const set = (animations: JsonObject): JsonObject => ({
  format_version: ANIMATION_FORMAT_VERSION,
  animations,
});

const bonesOf = (model: JsonObject): string[] => {
  const geo = (model['minecraft:geometry'] as JsonObject[])[0] as JsonObject;
  return (geo.bones as JsonObject[]).map((entry) => entry.name as string);
};

// Quadruped -------------------------------------------------------------------------------

/**
 * A four-legged animal, pig- or wolf-like: `body`, `head` (with a snout), `tail`, four legs
 * and a `saddle` over the back. 64x64.
 */
export function quadrupedGeometry(name: string): JsonObject {
  return geometry(name, { width: 64, height: 64 }, { width: 1.5, height: 1.5 }, [
    bone('body', [0, 13, 1], [cube([-4, 9, -6], [8, 7, 14], [0, 0])]),
    bone(
      'head',
      [0, 14, -6],
      [cube([-3, 11, -12], [6, 6, 6], [0, 21]), cube([-2, 11, -14], [4, 3, 2], [24, 21])],
      { parent: 'body' },
    ),
    bone('tail', [0, 15, 8], [cube([-1, 9, 8], [2, 6, 2], [44, 0])], {
      parent: 'body',
      rotation: [30, 0, 0],
    }),
    bone('leg_front_right', [-2.5, 9, -3.5], [cube([-4, 0, -5], [3, 9, 3], [0, 33])]),
    bone('leg_front_left', [2.5, 9, -3.5], [cube([1, 0, -5], [3, 9, 3], [12, 33])]),
    bone('leg_back_right', [-2.5, 9, 5.5], [cube([-4, 0, 4], [3, 9, 3], [24, 33])]),
    bone('leg_back_left', [2.5, 9, 5.5], [cube([1, 0, 4], [3, 9, 3], [36, 33])]),
    bone('saddle', [0, 13, 1], [cube([-4, 15, -3], [8, 2, 7], [0, 45], 0.5)], {
      parent: 'body',
    }),
  ]);
}

/** `idle`, `walk`, `sit`, `swim`, `attack` and `shoot` for {@link quadrupedGeometry}. */
export function quadrupedAnimations(): JsonObject {
  return set({
    idle: {
      loop: true,
      animation_length: 2,
      bones: {
        head: { rotation: pingPong(2, [0, 0, 0], [4, 0, 0]) },
        tail: { rotation: sway(2, [0, 0, 8]) },
      },
    },
    walk: {
      loop: true,
      animation_length: 0.8,
      bones: {
        leg_front_right: { rotation: pingPong(0.8, [30, 0, 0], [-30, 0, 0]) },
        leg_back_left: { rotation: pingPong(0.8, [30, 0, 0], [-30, 0, 0]) },
        leg_front_left: { rotation: pingPong(0.8, [-30, 0, 0], [30, 0, 0]) },
        leg_back_right: { rotation: pingPong(0.8, [-30, 0, 0], [30, 0, 0]) },
        head: { rotation: pingPong(0.8, [0, -3, 0], [0, 3, 0]) },
        tail: { rotation: sway(0.8, [0, 0, 10]) },
      },
    },
    sit: {
      loop: true,
      animation_length: 1,
      bones: {
        body: { position: hold(1, [0, -3, 0]), rotation: hold(1, [-15, 0, 0]) },
        head: { rotation: hold(1, [12, 0, 0]) },
        leg_back_right: { position: hold(1, [0, -4, 2]), rotation: hold(1, [-80, 0, 0]) },
        leg_back_left: { position: hold(1, [0, -4, 2]), rotation: hold(1, [-80, 0, 0]) },
        tail: { rotation: hold(1, [20, 0, 0]) },
      },
    },
    swim: {
      loop: true,
      animation_length: 0.6,
      bones: {
        body: { rotation: hold(0.6, [-5, 0, 0]) },
        leg_front_right: { rotation: pingPong(0.6, [40, 0, 0], [-40, 0, 0]) },
        leg_back_left: { rotation: pingPong(0.6, [40, 0, 0], [-40, 0, 0]) },
        leg_front_left: { rotation: pingPong(0.6, [-40, 0, 0], [40, 0, 0]) },
        leg_back_right: { rotation: pingPong(0.6, [-40, 0, 0], [40, 0, 0]) },
        tail: { rotation: sway(0.6, [0, 15, 0]) },
      },
    },
    attack: {
      loop: false,
      animation_length: 0.5,
      bones: {
        head: {
          rotation: strike(0.5, 0.15, [25, 0, 0]),
          position: strike(0.5, 0.15, [0, 0, -2]),
        },
        body: { rotation: strike(0.5, 0.15, [5, 0, 0]) },
      },
    },
    shoot: {
      loop: false,
      animation_length: 0.6,
      bones: {
        head: {
          rotation: keys([0, [0, 0, 0]], [0.2, [-20, 0, 0]], [0.35, [10, 0, 0]], [0.6, [0, 0, 0]]),
        },
        body: { position: strike(0.6, 0.2, [0, 0, 1]) },
      },
    },
  });
}

// Bird ------------------------------------------------------------------------------------

/**
 * A two-legged bird: `body`, `head` (with a beak), two wings folded at the sides, a `tail`
 * and two legs. 64x32.
 */
export function birdGeometry(name: string): JsonObject {
  return geometry(name, { width: 64, height: 32 }, { width: 1, height: 1 }, [
    bone('body', [0, 7, 0], [cube([-3, 4, -4], [6, 6, 8], [0, 0])]),
    bone(
      'head',
      [0, 9, -4],
      [cube([-2, 9, -7], [4, 5, 4], [28, 0]), cube([-1, 10, -9], [2, 2, 2], [44, 0])],
      { parent: 'body' },
    ),
    bone('wing_right', [-3, 9, -2], [cube([-4, 5, -3], [1, 4, 6], [42, 9])], { parent: 'body' }),
    bone('wing_left', [3, 9, -2], [cube([3, 5, -3], [1, 4, 6], [28, 9])], { parent: 'body' }),
    bone('tail', [0, 9, 4], [cube([-2, 8, 4], [4, 1, 3], [0, 14])], { parent: 'body' }),
    bone('leg_right', [-1.5, 4, 0], [cube([-2, 0, -1], [1, 4, 1], [14, 14])]),
    bone('leg_left', [1.5, 4, 0], [cube([1, 0, -1], [1, 4, 1], [18, 14])]),
  ]);
}

/** `idle`, `walk`, `fly`, `sit` and `attack` for {@link birdGeometry}. */
export function birdAnimations(): JsonObject {
  return set({
    idle: {
      loop: true,
      animation_length: 2,
      bones: {
        head: { rotation: keys([0, [0, 0, 0]], [0.5, [8, 0, 0]], [1, [0, 0, 0]], [2, [0, 0, 0]]) },
        tail: { rotation: sway(2, [5, 0, 0]) },
      },
    },
    walk: {
      loop: true,
      animation_length: 0.5,
      bones: {
        leg_right: { rotation: pingPong(0.5, [35, 0, 0], [-35, 0, 0]) },
        leg_left: { rotation: pingPong(0.5, [-35, 0, 0], [35, 0, 0]) },
        head: { position: pingPong(0.5, [0, 0, 0], [0, 0, -1]) },
      },
    },
    fly: {
      loop: true,
      animation_length: 0.3,
      bones: {
        body: { rotation: hold(0.3, [10, 0, 0]) },
        wing_left: { rotation: pingPong(0.3, [0, 0, 0], [0, 0, -75]) },
        wing_right: { rotation: pingPong(0.3, [0, 0, 0], [0, 0, 75]) },
        leg_right: { rotation: hold(0.3, [40, 0, 0]) },
        leg_left: { rotation: hold(0.3, [40, 0, 0]) },
      },
    },
    sit: {
      loop: true,
      animation_length: 1,
      bones: {
        body: { position: hold(1, [0, -3, 0]) },
        tail: { rotation: hold(1, [-10, 0, 0]) },
      },
    },
    attack: {
      loop: false,
      animation_length: 0.4,
      bones: {
        head: { rotation: strike(0.4, 0.15, [35, 0, 0]) },
        wing_left: { rotation: strike(0.4, 0.15, [0, 0, -20]) },
        wing_right: { rotation: strike(0.4, 0.15, [0, 0, 20]) },
      },
    },
  });
}

// Fish ------------------------------------------------------------------------------------

/** A fish: `body`, a `tail` fin, a top fin and two side fins. 64x32. */
export function fishGeometry(name: string): JsonObject {
  return geometry(name, { width: 64, height: 32 }, { width: 1, height: 1 }, [
    bone('body', [0, 4, 0], [cube([-1.5, 1, -5], [3, 6, 10], [0, 0])]),
    bone('tail', [0, 4, 5], [cube([-0.5, 1.5, 5], [1, 5, 5], [26, 0])], { parent: 'body' }),
    bone('fin_top', [0, 7, 0], [cube([-0.5, 7, -2], [1, 2, 5], [38, 0])], { parent: 'body' }),
    bone('fin_right', [-1.5, 3, -2], [cube([-3.5, 2.5, -3], [2, 1, 3], [10, 16])], {
      parent: 'body',
    }),
    bone('fin_left', [1.5, 3, -2], [cube([1.5, 2.5, -3], [2, 1, 3], [0, 16])], {
      parent: 'body',
    }),
  ]);
}

/** `idle`, `walk` (flopping on land) and `swim` for {@link fishGeometry}. */
export function fishAnimations(): JsonObject {
  return set({
    idle: {
      loop: true,
      animation_length: 2,
      bones: {
        tail: { rotation: sway(2, [0, 10, 0]) },
        fin_left: { rotation: pingPong(2, [0, 0, 0], [0, 0, -10]) },
        fin_right: { rotation: pingPong(2, [0, 0, 0], [0, 0, 10]) },
      },
    },
    walk: {
      loop: true,
      animation_length: 0.6,
      bones: {
        body: { rotation: pingPong(0.6, [0, 0, 75], [0, 0, 90]) },
        tail: { rotation: sway(0.6, [0, 35, 0]) },
      },
    },
    swim: {
      loop: true,
      animation_length: 0.5,
      bones: {
        body: { rotation: sway(0.5, [0, 6, 0]) },
        tail: { rotation: sway(0.5, [0, -30, 0]) },
        fin_left: { rotation: pingPong(0.5, [0, 0, 0], [0, 0, -20]) },
        fin_right: { rotation: pingPong(0.5, [0, 0, 0], [0, 0, 20]) },
      },
    },
  });
}

// Flyer -----------------------------------------------------------------------------------

/**
 * A small round flyer, bee- or sprite-like: a cube `body` with four wings on top and a
 * `saddle` between them. 64x64.
 */
export function flyerGeometry(name: string): JsonObject {
  return geometry(name, { width: 64, height: 64 }, { width: 1.5, height: 1.5 }, [
    bone('body', [0, 8, 0], [cube([-4, 4, -4], [8, 8, 8], [0, 0])]),
    bone('wing_front_right', [-3, 12, -1.5], [cube([-9, 12, -3], [6, 1, 3], [0, 16])], {
      parent: 'body',
    }),
    bone('wing_front_left', [3, 12, -1.5], [cube([3, 12, -3], [6, 1, 3], [18, 16])], {
      parent: 'body',
    }),
    bone('wing_back_right', [-3, 12, 1.5], [cube([-9, 12, 0], [6, 1, 3], [0, 20])], {
      parent: 'body',
    }),
    bone('wing_back_left', [3, 12, 1.5], [cube([3, 12, 0], [6, 1, 3], [18, 20])], {
      parent: 'body',
    }),
    bone('saddle', [0, 8, 0], [cube([-3, 12, -3], [6, 1, 6], [0, 24], 0.25)], {
      parent: 'body',
    }),
  ]);
}

const FLYER_WINGS = [
  ['wing_front_left', -1],
  ['wing_back_left', -1],
  ['wing_front_right', 1],
  ['wing_back_right', 1],
] as const;

/** Every wing flapping between `low` and `high` degrees about z, mirrored on the right. */
function flyerFlap(length: number, low: number, high: number): JsonObject {
  const out: JsonObject = {};
  for (const [wing, side] of FLYER_WINGS) {
    out[wing] = { rotation: pingPong(length, [0, 0, side * low], [0, 0, side * high]) };
  }
  return out;
}

/** `idle`, `walk`, `fly`, `attack` and `shoot` for {@link flyerGeometry}. */
export function flyerAnimations(): JsonObject {
  return set({
    idle: {
      loop: true,
      animation_length: 1,
      bones: {
        body: { position: pingPong(1, [0, 0, 0], [0, 1, 0]) },
        ...flyerFlap(1, 10, 30),
      },
    },
    walk: {
      loop: true,
      animation_length: 0.6,
      bones: {
        body: { position: pingPong(0.6, [0, 0, 0], [0, 1, 0]) },
        ...flyerFlap(0.6, 0, 15),
      },
    },
    fly: {
      loop: true,
      animation_length: 0.2,
      bones: {
        body: { rotation: hold(0.2, [10, 0, 0]) },
        ...flyerFlap(0.2, 40, -20),
      },
    },
    attack: {
      loop: false,
      animation_length: 0.5,
      bones: {
        body: {
          position: strike(0.5, 0.15, [0, 0, -4]),
          rotation: strike(0.5, 0.15, [20, 0, 0]),
        },
      },
    },
    shoot: {
      loop: false,
      animation_length: 0.5,
      bones: {
        body: {
          position: strike(0.5, 0.1, [0, 0, 2]),
          scale: keys([0, [1, 1, 1]], [0.1, [1.15, 0.9, 1.15]], [0.5, [1, 1, 1]]),
        },
      },
    },
  });
}

// Biped and cube creature -----------------------------------------------------------------

/**
 * The biped set of {@link bipedAnimations} (with `attack`) plus `sit` (seated, legs forward)
 * and `shoot` (both arms raised forward).
 */
export function bipedPresetAnimations(): JsonObject {
  const base = bipedAnimations(true);
  const animations = { ...(base.animations as JsonObject) };
  animations.sit = {
    loop: true,
    animation_length: 1,
    bones: {
      body: { position: hold(1, [0, -10, 0]) },
      right_leg: { position: hold(1, [0, -10, 0]), rotation: hold(1, [-90, 0, 0]) },
      left_leg: { position: hold(1, [0, -10, 0]), rotation: hold(1, [-90, 0, 0]) },
      right_arm: { rotation: hold(1, [-30, 0, 0]) },
      left_arm: { rotation: hold(1, [-30, 0, 0]) },
    },
  };
  animations.shoot = {
    loop: false,
    animation_length: 0.6,
    bones: {
      right_arm: {
        rotation: keys([0, [0, 0, 0]], [0.2, [-90, 0, 0]], [0.4, [-90, 0, 0]], [0.6, [0, 0, 0]]),
      },
      left_arm: {
        rotation: keys([0, [0, 0, 0]], [0.2, [-90, 0, 0]], [0.4, [-90, 0, 0]], [0.6, [0, 0, 0]]),
      },
      body: { rotation: strike(0.6, 0.2, [0, -5, 0]) },
    },
  };
  return set(animations);
}

/**
 * The cube creature set of {@link cubeCreatureAnimations} plus `sit` (squashed down) and
 * `attack` (a head butt).
 */
export function cubeCreaturePresetAnimations(): JsonObject {
  const base = cubeCreatureAnimations();
  const animations = { ...(base.animations as JsonObject) };
  animations.sit = {
    loop: true,
    animation_length: 1,
    bones: {
      body: { position: hold(1, [0, -1, 0]), scale: hold(1, [1.05, 0.85, 1.05]) },
    },
  };
  animations.attack = {
    loop: false,
    animation_length: 0.5,
    bones: {
      head: {
        position: strike(0.5, 0.15, [0, 0, -3]),
        rotation: strike(0.5, 0.15, [15, 0, 0]),
      },
    },
  };
  return set(animations);
}

// The registry ----------------------------------------------------------------------------

function preset(
  entry: Omit<MobPreset, 'bones'> & { bones?: readonly string[] },
): Readonly<MobPreset> {
  return Object.freeze({ ...entry, bones: Object.freeze(bonesOf(entry.geometry(entry.name))) });
}

/** Every preset model by name (ADR 0073 D1). */
export const MOB_PRESETS: Readonly<Record<MobPresetName, Readonly<MobPreset>>> = Object.freeze({
  quadruped: preset({
    name: 'quadruped',
    label: 'Four-legged animal',
    description: 'A pig- or wolf-like animal with a head, four legs, a tail and a saddle.',
    texture: { width: 64, height: 64 },
    saddleBone: 'saddle',
    states: ['sit', 'swim', 'attack', 'shoot'],
    geometry: quadrupedGeometry,
    animations: quadrupedAnimations,
  }),
  bird: preset({
    name: 'bird',
    label: 'Bird',
    description: 'A two-legged bird with a beak, two wings and a tail.',
    texture: { width: 64, height: 32 },
    states: ['sit', 'fly', 'attack'],
    geometry: birdGeometry,
    animations: birdAnimations,
  }),
  fish: preset({
    name: 'fish',
    label: 'Fish',
    description: 'A fish with a tail fin, a top fin and two side fins.',
    texture: { width: 64, height: 32 },
    states: ['swim'],
    geometry: fishGeometry,
    animations: fishAnimations,
  }),
  flyer: preset({
    name: 'flyer',
    label: 'Round flyer',
    description: 'A small round body with four wings, bee- or sprite-like, and a saddle.',
    texture: { width: 64, height: 64 },
    saddleBone: 'saddle',
    states: ['fly', 'attack', 'shoot'],
    geometry: flyerGeometry,
    animations: flyerAnimations,
  }),
  biped: preset({
    name: 'biped',
    label: 'Two-legged figure',
    description: 'A figure on the player skin layout: head, body, two arms and two legs.',
    texture: { width: 64, height: 64 },
    states: ['sit', 'attack', 'shoot'],
    geometry: (name: string) => bipedGeometry(name),
    animations: bipedPresetAnimations,
  }),
  cube_creature: preset({
    name: 'cube_creature',
    label: 'Cube creature',
    description: 'A box-shaped body with a head.',
    texture: { width: 64, height: 64 },
    states: ['sit', 'attack'],
    geometry: cubeCreatureGeometry,
    animations: cubeCreaturePresetAnimations,
  }),
});

/**
 * The preset's face: the bone whose first cube gets eyes on the skin, on its front face or, for
 * the narrow fish, on both sides near the front.
 */
const FACE: Readonly<Record<MobPresetName, { bone: string; role: 'face' | 'side_face' }>> = {
  quadruped: { bone: 'head', role: 'face' },
  bird: { bone: 'head', role: 'face' },
  fish: { bone: 'body', role: 'side_face' },
  flyer: { bone: 'body', role: 'face' },
  biped: { bone: 'head', role: 'face' },
  cube_creature: { bone: 'head', role: 'face' },
};

/**
 * The `msm:animated_model` animation fields of a preset (ADR 0071 D6): `idle`, `walk` and each
 * of its state animations, each naming the animation of the same name in its set.
 */
export function presetAnimationFields(name: MobPresetName): Record<string, string> {
  const fields: Record<string, string> = { idle: 'idle', walk: 'walk' };
  for (const state of MOB_PRESETS[name].states) fields[state] = state;
  return fields;
}

/** The box-UV cubes of a preset's geometry, as its skin unfolds them. */
export function presetSkinBoxes(name: MobPresetName): SkinBox[] {
  const model = MOB_PRESETS[name].geometry(name);
  const geo = (model['minecraft:geometry'] as JsonObject[])[0] as JsonObject;
  const boxes: SkinBox[] = [];
  for (const entry of geo.bones as JsonObject[]) {
    const boneName = entry.name as string;
    (entry.cubes as JsonObject[]).forEach((raw, index) => {
      const [u, v] = raw.uv as number[];
      const [w, h, d] = raw.size as number[];
      const role: SkinBox['role'] =
        boneName === MOB_PRESETS[name].saddleBone
          ? 'saddle'
          : boneName === FACE[name].bone && index === 0
            ? FACE[name].role
            : 'plain';
      boxes.push({ u: u ?? 0, v: v ?? 0, w: w ?? 0, h: h ?? 0, d: d ?? 0, role });
    });
  }
  return boxes;
}

/**
 * A byte-stable skin PNG for a preset in one colour (ADR 0073 D1), at the preset's texture
 * size: every cube's faces in the colour with a darker rim, eyes on the face, the saddle in
 * leather brown, transparent elsewhere.
 *
 * @param name - The preset.
 * @param options - The main colour.
 */
export function presetSkinPng(name: MobPresetName, options: PlaceholderOptions = {}): Uint8Array {
  const { width, height } = MOB_PRESETS[name].texture;
  return boxSkinPng(presetSkinBoxes(name), width, height, options);
}
