/**
 * Worn pictures of the vanilla-style generator (ADR 0092 D7, D8): the humanoid armour layers
 * (64 by 32) and the horse (64 by 64) and wolf (64 by 32) body armour layers, drawn from the
 * same ramps as the armour items (`materialRamp`). Each layer covers exactly the regions its
 * placeholder pattern fills in `assets/png.ts`; inside them every face of the model's boxes is
 * shaded by its side (ADR 0092 D8), bevelled towards the top left, laid in plates with a dark
 * seam and a light lip, with rivets on the front plates and, on the helmet, a visor slit above
 * the face opening. Box skins of models are in `skins.ts`.
 *
 * @packageDocumentation
 */

import { DEFAULT_COLOUR, type PlaceholderPattern, placeholderPixels } from '../../assets/png';
import { pick, setPixel } from '../canvas';
import { type ArtImage, blankImage } from '../colour';
import { type ArtRecipeEntry, type DrawContext, recipeEntry } from '../info';
import { materialRamp } from '../materials';
import { hashSeed, rng } from '../noise';
import { type BoxFace, boxFaces, faceLean, SIDE_SHADE } from '../skins';

/** A model box on a worn texture: `u`, `v`, width, height and depth, and what it carries. */
interface WornBox {
  readonly u: number;
  readonly v: number;
  readonly w: number;
  readonly h: number;
  readonly d: number;
  /** Whether this is the head box, whose front has a visor slit above the face opening. */
  readonly head?: boolean;
}

/**
 * The humanoid boxes of the armour layers, in the player-skin layout the placeholders use:
 * head, right leg, body and right arm (the game mirrors the left ones).
 */
const HUMANOID_ARMOUR_BOXES: readonly WornBox[] = [
  { u: 0, v: 0, w: 8, h: 8, d: 8, head: true },
  { u: 0, v: 16, w: 4, h: 12, d: 4 },
  { u: 16, v: 16, w: 8, h: 12, d: 4 },
  { u: 40, v: 16, w: 4, h: 12, d: 4 },
];

/**
 * The horse armour boxes, the same texture offsets as the `horse_armor_layer` placeholder
 * (`HORSE_BOXES` in `assets/png.ts`): body, neck, head, muzzle, ears and legs.
 */
const HORSE_ARMOUR_BOXES: readonly WornBox[] = [
  { u: 0, v: 32, w: 10, h: 10, d: 22 },
  { u: 0, v: 35, w: 4, h: 12, d: 7 },
  { u: 0, v: 13, w: 6, h: 5, d: 7 },
  { u: 0, v: 25, w: 4, h: 5, d: 5 },
  { u: 19, v: 16, w: 2, h: 3, d: 1 },
  { u: 48, v: 21, w: 4, h: 11, d: 4 },
];

/**
 * The wolf armour boxes, the same texture offsets as the `wolf_armor_layer` placeholder
 * (`WOLF_BOXES` in `assets/png.ts`): body, mane, legs and head.
 */
const WOLF_ARMOUR_BOXES: readonly WornBox[] = [
  { u: 0, v: 0, w: 6, h: 6, d: 4 },
  { u: 21, v: 0, w: 8, h: 6, d: 7 },
  { u: 18, v: 14, w: 6, h: 9, d: 6 },
  { u: 0, v: 18, w: 2, h: 8, d: 2 },
];

/** Where each placeholder pattern is opaque (its region), worked out once per pattern. */
const REGIONS = new Map<PlaceholderPattern, Uint8Array>();

/** The pixels a worn placeholder fills (1) and leaves clear (0); the same for every colour. */
export function wornRegion(pattern: PlaceholderPattern): Uint8Array {
  let region = REGIONS.get(pattern);
  if (region === undefined) {
    const pixels = placeholderPixels(pattern, { colour: DEFAULT_COLOUR });
    region = new Uint8Array(pixels.length / 4);
    for (let i = 0; i < region.length; i += 1) region[i] = (pixels[i * 4 + 3] ?? 0) > 0 ? 1 : 0;
    REGIONS.set(pattern, region);
  }
  return region;
}

/** The front shade of a worn face on the six-shade material ramp (0 is the darkest). */
const WORN_FRONT = 3;

/**
 * Draws a worn layer: each face of `boxes` (later boxes over earlier ones), only where the
 * placeholder `pattern` fills, in the armour item's ramps.
 */
function drawWorn(
  id: string,
  pattern: PlaceholderPattern,
  width: number,
  height: number,
  boxes: readonly WornBox[],
  context: DrawContext,
): ArtImage {
  const image = blankImage(width, height);
  const region = wornRegion(pattern);
  const { material, shine } = materialRamp(context.colour, context.hueShift);
  const top = material.length - 1;
  const seed = hashSeed(id, context.seed);
  // Clustered one-shade variations in pairs across (a cheap field: a 64 by 64 layer has 16
  // times the pixels of a block face, so it skips the ranked field's sort).
  const grain = new Int8Array(width * height);
  const random = rng(seed);
  const dark = 0.05 * context.noise;
  const light = 1 - 0.04 * context.noise;
  for (let i = 0; i < grain.length; i += 1) {
    const r = random();
    const value = r < dark ? -1 : r > light ? 1 : 0;
    if (value !== 0) {
      grain[i] = value;
      if ((i + 1) % width !== 0) grain[i + 1] = value;
    }
  }
  for (const box of boxes) {
    for (const face of boxFaces(box)) {
      drawFace(face, box);
    }
  }
  return image;

  function drawFace(face: BoxFace, box: WornBox): void {
    const plated = face.side !== 'top' && face.side !== 'bottom';
    for (let fy = 0; fy < face.h; fy += 1) {
      for (let fx = 0; fx < face.w; fx += 1) {
        const x = face.x + fx;
        const y = face.y + fy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        if ((region[y * width + x] ?? 0) === 0) continue;
        let shade = WORN_FRONT + SIDE_SHADE[face.side] + faceLean(fx, fy, face.w, face.h) * 0.6;
        // The bevel: lighter along the top and left edges, darker along the others.
        const litEdge = fx === 0 || fy === 0;
        const darkEdge = fx === face.w - 1 || fy === face.h - 1;
        if (litEdge && !darkEdge) shade += 1;
        if (darkEdge && !litEdge) shade -= 1;
        const inner = !litEdge && !darkEdge;
        // Plates four pixels high: a dark seam and a light lip under it.
        if (plated && inner && face.h > 5) {
          if (fy % 4 === 3 && fy < face.h - 2) shade -= 1;
          else if (fy % 4 === 0) shade += 1;
        }
        if (inner) shade += grain[y * width + x] ?? 0;
        let rgb = pick(material, Math.max(1, Math.min(top, Math.round(shade))));
        // Rivets at the corners of the first plate of a front.
        if (
          face.side === 'front' &&
          face.w >= 4 &&
          face.h >= 4 &&
          fy === 1 &&
          (fx === 1 || fx === face.w - 2)
        ) {
          rgb = shine;
        }
        // The visor slit across the helmet's front, above the face opening.
        if (box.head === true && face.side === 'front' && fy === 2 && fx > 0 && fx < face.w - 1) {
          rgb = pick(material, 0);
        }
        setPixel(image, x, y, rgb);
      }
    }
  }
}

/** A drawing function for a worn layer. */
const worn =
  (
    id: string,
    pattern: PlaceholderPattern,
    width: number,
    height: number,
    boxes: readonly WornBox[],
  ) =>
  (context: DrawContext): ArtImage =>
    drawWorn(id, pattern, width, height, boxes, context);

/** The worn recipes, in table order. */
export const WORN_RECIPES: readonly ArtRecipeEntry[] = Object.freeze([
  recipeEntry(
    {
      id: 'armor_layer_1',
      label: 'Worn armour: helmet, chestplate and boots',
      kind: 'entity',
      fallback: 'armor_layer_1',
      width: 64,
      height: 32,
    },
    worn('armor_layer_1', 'armor_layer_1', 64, 32, HUMANOID_ARMOUR_BOXES),
  ),
  recipeEntry(
    {
      id: 'armor_layer_2',
      label: 'Worn armour: leggings',
      kind: 'entity',
      fallback: 'armor_layer_2',
      width: 64,
      height: 32,
    },
    worn('armor_layer_2', 'armor_layer_2', 64, 32, HUMANOID_ARMOUR_BOXES),
  ),
  recipeEntry(
    {
      id: 'horse_armor_layer',
      label: 'Worn horse armour',
      kind: 'entity',
      fallback: 'horse_armor_layer',
      width: 64,
      height: 64,
    },
    worn('horse_armor_layer', 'horse_armor_layer', 64, 64, HORSE_ARMOUR_BOXES),
  ),
  recipeEntry(
    {
      id: 'wolf_armor_layer',
      label: 'Worn wolf armour',
      kind: 'entity',
      fallback: 'wolf_armor_layer',
      width: 64,
      height: 32,
    },
    worn('wolf_armor_layer', 'wolf_armor_layer', 64, 32, WOLF_ARMOUR_BOXES),
  ),
]);
