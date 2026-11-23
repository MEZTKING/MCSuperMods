/**
 * Stand-in bodies for the vanilla mobs (ADR 0121 D4; B620 interface, B623 bodies). Each body is
 * Bedrock geo JSON for the geo renderer (`preview/geo/geometry.ts`), one lazy module per body,
 * written from the spike B619's measurements of MSM's own coded pictures (3S3), never from a
 * Mojang model. Bodies are labelled About right and do not animate beyond turning.
 *
 * Which body a variant's `model` names is a table keyed by the data's own strings (`normal`,
 * `cold`, `warm`; no target fact: both targets have the same bodies, 3S3). Babies are their own
 * models. The zombie nautilus is the flat sheet (no-go in 3S3; reserve B646).
 *
 * Every part is its own bone named for it (`head`, `leg_fr`, ...), so a view can name the parts
 * and a test can check that each shows its own texels.
 */

import type { Json, JsonObject } from '@msm/plugin-api';

/** The eighteen bodies B619 said yes to (the zombie nautilus is the flat sheet). */
export type BodyId =
  | 'wolf'
  | 'wolf_baby'
  | 'cat'
  | 'cat_baby'
  | 'pig'
  | 'pig_cold'
  | 'pig_baby'
  | 'cow'
  | 'cow_cold'
  | 'cow_warm'
  | 'cow_baby'
  | 'chicken'
  | 'chicken_cold'
  | 'chicken_baby'
  | 'frog'
  | 'villager'
  | 'villager_baby'
  | 'sulfur_cube';

/** A geo model: the JSON the geo renderer reads. */
export type GeoJson = Json;

type Module = { default: GeoJson };

/** The lazy module of each body (written at model scale; see {@link BODY_SCALE}). */
const MODULES: Readonly<Record<BodyId, () => Promise<Module>>> = {
  wolf: () => import('./wolf'),
  wolf_baby: () => import('./wolf-baby'),
  cat: () => import('./cat'),
  cat_baby: () => import('./cat-baby'),
  pig: () => import('./pig'),
  pig_cold: () => import('./pig-cold'),
  pig_baby: () => import('./pig-baby'),
  cow: () => import('./cow'),
  cow_cold: () => import('./cow-cold'),
  cow_warm: () => import('./cow-warm'),
  cow_baby: () => import('./cow-baby'),
  chicken: () => import('./chicken'),
  chicken_cold: () => import('./chicken-cold'),
  chicken_baby: () => import('./chicken-baby'),
  frog: () => import('./frog'),
  villager: () => import('./villager'),
  villager_baby: () => import('./villager-baby'),
  sulfur_cube: () => import('./sulfur-cube'),
};

/** Every body, in the order of {@link BodyId}. */
export const BODY_IDS: readonly BodyId[] = Object.freeze(Object.keys(MODULES) as BodyId[]);

/**
 * The scale the game draws a body at, measured in 3S3 (one texel is one model pixel times this):
 * the cat 0.8, the villager 0.9375. The sulfur cube scales with its Size ({@link sulfurCubeScale}).
 */
export const BODY_SCALE: Readonly<Partial<Record<BodyId, number>>> = Object.freeze({
  cat: 0.8,
  villager: 0.9375,
});

/** Loads a body at the scale the game draws it. */
export async function loadBody(id: BodyId): Promise<GeoJson> {
  const geo = (await MODULES[id]()).default;
  const scale = BODY_SCALE[id];
  return scale === undefined ? geo : scaleBody(geo, scale);
}

/** One mob's bodies: per model name for adults, one for babies. */
interface Family {
  readonly models: Readonly<Record<string, BodyId>>;
  readonly baby: BodyId;
}

const family = (normal: BodyId, baby: BodyId, more: Record<string, BodyId> = {}): Family => ({
  models: { normal, ...more },
  baby,
});

const WOLF = family('wolf', 'wolf_baby');
const CAT = family('cat', 'cat_baby');
const PIG = family('pig', 'pig_baby', { cold: 'pig_cold' });
const COW = family('cow', 'cow_baby', { cold: 'cow_cold', warm: 'cow_warm' });
const CHICKEN = family('chicken', 'chicken_baby', { cold: 'chicken_cold' });
const FROG = family('frog', 'frog');
const VILLAGER = family('villager', 'villager_baby');
const SULFUR_CUBE = family('sulfur_cube', 'sulfur_cube');

/**
 * The family of each kind with a body. The model names are the variants' own `model` strings
 * (`pig_variant`: normal, cold; `cow_variant`: normal, cold, warm; `chicken_variant`: normal,
 * cold; wolf, cat and frog have none), the same on both targets (3S3).
 */
const FAMILIES: Readonly<Record<string, Family | 'flat_sheet'>> = Object.freeze({
  'minecraft:wolf_variant': WOLF,
  'minecraft:wolf_sound_variant': WOLF,
  'minecraft:cat_variant': CAT,
  'minecraft:cat_sound_variant': CAT,
  'minecraft:pig_variant': PIG,
  'minecraft:pig_sound_variant': PIG,
  'minecraft:cow_variant': COW,
  'minecraft:cow_sound_variant': COW,
  'minecraft:chicken_variant': CHICKEN,
  'minecraft:chicken_sound_variant': CHICKEN,
  'minecraft:frog_variant': FROG,
  'minecraft:sulfur_cube_archetype': SULFUR_CUBE,
  'msm:villager_type': VILLAGER,
  'msm:villager_profession': VILLAGER,
  'minecraft:zombie_nautilus_variant': 'flat_sheet',
});

/**
 * The body id for a kind, the model the variant names and the baby flag, or `'flat_sheet'` where
 * no body can be written (the zombie nautilus, 3L5, and any kind without a body). An unknown model
 * name falls back to the family's `normal` body.
 */
export function bodyIdFor(
  kind: string,
  model: string | undefined,
  baby: boolean,
): BodyId | 'flat_sheet' {
  const found = FAMILIES[kind];
  if (found === undefined || found === 'flat_sheet') return 'flat_sheet';
  if (baby) return found.baby;
  const name = (model ?? 'normal').replace(/^minecraft:/, '');
  return found.models[name] ?? (found.models.normal as BodyId);
}

/**
 * The body for a variant kind (`minecraft:wolf_variant`, ...), the model the variant names
 * (`normal`, `cold`, `warm`) and the baby flag: a loader of its geo JSON at the game's scale, or
 * `'flat_sheet'` where no body can be written (the zombie nautilus, 3L5).
 */
export function bodyFor(
  kind: string,
  model: string | undefined,
  baby: boolean,
): (() => Promise<GeoJson>) | 'flat_sheet' {
  const id = bodyIdFor(kind, model, baby);
  return id === 'flat_sheet' ? 'flat_sheet' : () => loadBody(id);
}

/**
 * The sulfur cube's scale for its `Size` (3S3: 0.5 at Size 0, 1.5 at Size 2; Size 1 is taken as
 * 1, between them; verify at implementation).
 */
export function sulfurCubeScale(size: number): number {
  const clamped = Math.max(0, Math.min(2, Math.round(Number.isFinite(size) ? size : 1)));
  return 0.5 * (clamped + 1);
}

/**
 * The sulfur cube's two pictures and the bone each one dresses: the `outer` bone samples
 * `textures/entity/sulfur_cube/sulfur_cube_outer.png`, the `inner` bone
 * `sulfur_cube_inner.png` (`_small` pictures below Size 1). Their texel rectangles do not overlap,
 * so a view can paste both into one 128 by 128 picture.
 */
export const SULFUR_CUBE_LAYERS: readonly {
  bone: 'outer' | 'inner';
  picture: string;
  rect: readonly [number, number, number, number];
}[] = Object.freeze([
  { bone: 'outer', picture: 'sulfur_cube_outer', rect: [0, 0, 72, 36] },
  { bone: 'inner', picture: 'sulfur_cube_inner', rect: [0, 36, 64, 68] },
]);

// Scaling ------------------------------------------------------------------------------------

type Vec3 = [number, number, number];
type FaceName = 'east' | 'west' | 'up' | 'down' | 'south' | 'north';

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const num = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const vec = (value: unknown): Vec3 =>
  Array.isArray(value) ? [num(value[0]), num(value[1]), num(value[2])] : [0, 0, 0];

/**
 * The per-face entries equal to a cube's box UV, as the geo renderer lays box UV out (floored
 * sizes; `mirror` flips each rectangle and swaps east and west).
 */
function boxUvFaces(size: Vec3, u: number, v: number, mirror: boolean): JsonObject {
  const [x, y, z] = size.map((s) => Math.floor(s + 1e-7)) as Vec3;
  const rects: Record<FaceName, [number, number, number, number]> = {
    east: [0, z, z, y],
    west: [z + x, z, z, y],
    up: [z + x, z, -x, -z],
    down: [z + 2 * x, 0, -x, z],
    south: [2 * z + x, z, x, y],
    north: [z, z, x, y],
  };
  if (mirror) {
    for (const rect of Object.values(rects)) {
      rect[0] += rect[2];
      rect[2] *= -1;
    }
    [rects.east, rects.west] = [rects.west, rects.east];
  }
  const out: JsonObject = {};
  for (const [face, [fu, fv, fw, fh]] of Object.entries(rects)) {
    const u1 = fu + u;
    const v1 = fv + v;
    const u2 = u1 + fw;
    const v2 = v1 + fh;
    // Per-face up and down swap their corners in the renderer; store them pre-swapped.
    out[face] =
      face === 'up' || face === 'down'
        ? { uv: [u2, v2], uv_size: [u1 - u2, v1 - v2] }
        : { uv: [u1, v1], uv_size: [u2 - u1, v2 - v1] };
  }
  return out;
}

/**
 * A copy of `geo` scaled by `factor` about the feet (origin, size, inflate and pivots), its box UV
 * rewritten as per-face UV so the texels stay where they were (one texel becomes `factor` model
 * pixels). Used for the cat, the villager and the sulfur cube's sizes.
 */
export function scaleBody(geo: GeoJson, factor: number): GeoJson {
  if (!isObject(geo)) return geo;
  const list = geo['minecraft:geometry'];
  if (!Array.isArray(list)) return geo;
  const s = (p: Vec3): Vec3 => [p[0] * factor, p[1] * factor, p[2] * factor];
  return {
    ...geo,
    'minecraft:geometry': list.map((geometry) => {
      if (!isObject(geometry) || !Array.isArray(geometry.bones)) return geometry;
      return {
        ...geometry,
        bones: geometry.bones.map((bone) => {
          if (!isObject(bone)) return bone;
          const cubes = Array.isArray(bone.cubes) ? bone.cubes : [];
          return {
            ...bone,
            pivot: s(vec(bone.pivot)),
            cubes: cubes.map((cube) => {
              if (!isObject(cube)) return cube;
              const size = vec(cube.size);
              const uv = Array.isArray(cube.uv)
                ? boxUvFaces(size, num(cube.uv[0]), num(cube.uv[1]), cube.mirror === true)
                : cube.uv;
              const out: JsonObject = {
                ...cube,
                origin: s(vec(cube.origin)),
                size: s(size),
                uv: uv ?? null,
              };
              if (typeof cube.inflate === 'number') out.inflate = cube.inflate * factor;
              if (Array.isArray(cube.pivot)) out.pivot = s(vec(cube.pivot));
              delete out.mirror;
              return out;
            }),
          };
        }),
      };
    }),
  };
}
