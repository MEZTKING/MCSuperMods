/**
 * `msm:shape` (ADR 0059 D1, D2): the editor's shape presets and how lowering turns them into
 * pixel boxes. The runtime reads only `boxes`, `collision` and `see_through`.
 */
import type { Json, JsonObject } from '@msm/plugin-api';
import { isRecord } from './paths';

/** The block component that holds the shape. */
export const SHAPE_COMPONENT = 'msm:shape';

/** One pixel box `[x1, y1, z1, x2, y2, z2]`, from 0 to 16. */
export type ShapeBox = readonly [number, number, number, number, number, number];

/** The editor presets (element field `preset`, stripped in lowering). */
export const SHAPE_PRESETS = Object.freeze([
  'full',
  'slab_bottom',
  'slab_top',
  'carpet',
  'pillar',
  'cross',
  'custom',
] as const);

export type ShapePreset = (typeof SHAPE_PRESETS)[number];

/** The full cube, in pixels. */
export const FULL_CUBE: ShapeBox = Object.freeze([0, 0, 0, 16, 16, 16]) as ShapeBox;

/**
 * The boxes each preset other than `custom` lowers to. `cross` is the 12 by 12 by 16 outline
 * of a plant (ADR 0059 D2); `pillar` is an 8 by 8 post, the full height.
 */
export const SHAPE_PRESET_BOXES: Readonly<
  Record<Exclude<ShapePreset, 'custom'>, readonly ShapeBox[]>
> = Object.freeze({
  full: [FULL_CUBE],
  slab_bottom: [[0, 0, 0, 16, 8, 16]],
  slab_top: [[0, 8, 0, 16, 16, 16]],
  carpet: [[0, 0, 0, 16, 1, 16]],
  pillar: [[4, 0, 4, 12, 16, 12]],
  cross: [[2, 0, 2, 14, 16, 14]],
});

/** Presets whose block is walk-through unless the element sets `collision` itself. */
const WALK_THROUGH_PRESETS: ReadonlySet<string> = new Set(['cross']);

const isPreset = (value: Json | undefined): value is Exclude<ShapePreset, 'custom'> =>
  typeof value === 'string' && value !== 'custom' && Object.hasOwn(SHAPE_PRESET_BOXES, value);

/**
 * Lowers an element's `msm:shape` in place: a preset other than `custom` writes its boxes
 * (replacing any `boxes`) and, for `cross`, `collision: false` unless `collision` is set;
 * `custom` and an absent preset keep `boxes` as written. `preset` is always removed.
 *
 * @param shape - The `msm:shape` object of a definition being built (mutated).
 */
export function lowerShapeInPlace(shape: JsonObject): void {
  const preset = shape.preset;
  delete shape.preset;
  if (!isPreset(preset)) return;
  shape.boxes = SHAPE_PRESET_BOXES[preset].map((box) => [...box]);
  if (WALK_THROUGH_PRESETS.has(preset) && shape.collision === undefined) {
    shape.collision = false;
  }
}

/** The `msm:shape` object of block element data, if any. */
export function shapeOf(data: Json | undefined): JsonObject | undefined {
  if (!isRecord(data)) return undefined;
  const components = data.components;
  if (!isRecord(components)) return undefined;
  const shape = components[SHAPE_COMPONENT];
  return isRecord(shape) ? shape : undefined;
}

const isFullCube = (box: Json): boolean =>
  Array.isArray(box) && box.length === 6 && box.every((value, i) => value === FULL_CUBE[i]);

/**
 * Whether a block is see-through once lowered (ADR 0059 D1): `see_through` when set; else true
 * when its boxes (after the preset) are present and are not the single full cube; false
 * without `msm:shape`. The app uses it for the `blocks-items.transparent-texture-on-solid-block`
 * warning (ADR 0059 D4).
 *
 * @param data - `msm:block` element data.
 */
export function isSeeThroughBlock(data: Json | undefined): boolean {
  const shape = shapeOf(data);
  if (shape === undefined) return false;
  if (typeof shape.see_through === 'boolean') return shape.see_through;
  const lowered = structuredClone(shape);
  lowerShapeInPlace(lowered);
  const boxes = lowered.boxes;
  if (!Array.isArray(boxes) || boxes.length === 0) return false;
  return !(boxes.length === 1 && isFullCube(boxes[0] as Json));
}
