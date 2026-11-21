/**
 * Box skins of models (ADR 0092 D7, D8): a model's box-UV cubes unfolded onto its texture and
 * drawn in a coat, each face shaded by its side (the top one shade lighter than the front, the
 * bottom and the sides one darker), eyes on `face` and `side_face` boxes and the saddle in
 * leather. Also the even coat for vanilla mob variant textures, whose layout is not MSM's to
 * know (plan limit A3), the humanoid boxes of the Custom mob starter's own model and
 * {@link boxesOfGeoModel}, which reads the boxes of any `msm:geo_model` geometry. Everything is
 * MSM's own drawing; output is a pure function of the boxes, the size and the look.
 *
 * @packageDocumentation
 */

import type { JsonObject } from '@msm/plugin-api';
import { DEFAULT_COLOUR, encodePng, type Rgb, SADDLE_COLOUR, type SkinBox } from '../assets/png';
import { bipedGeometry } from '../content/entities';
import { pick } from './canvas';
import { oklchToRgb } from './colour';
import { type ArtLook, DETAIL_NOISE } from './info';
import { ART_HUE_SHIFT, type Ramp } from './materials';
import { clusteredField, hashSeed, rng } from './noise';
import { generateRamp } from './ramp';
import { rampsAgree } from './recipes/blocks-common';

/** The coats a box skin can be drawn in (ADR 0092 D7). */
export const ART_COATS = Object.freeze(['fur', 'scales', 'smooth', 'stone', 'slime'] as const);

/** A box skin's coat. */
export type ArtCoat = (typeof ART_COATS)[number];

/** Each coat in words, for the Mob Studio's choices. */
export const ART_COAT_LABELS: Readonly<Record<ArtCoat, string>> = Object.freeze({
  fur: 'Fur',
  scales: 'Scales',
  smooth: 'Smooth',
  stone: 'Stone',
  slime: 'Slime',
});

/**
 * A box skin's look: a look without a recipe, with a coat. The second colour (`accent`), when
 * given, colours the bottom faces (a belly) and a few spots on the top faces.
 */
export type BoxSkinLook = Omit<ArtLook, 'recipe'> & { readonly coat: ArtCoat };

/** A side of a box. */
export type BoxSide = 'top' | 'bottom' | 'east' | 'front' | 'west' | 'back';

/** One face of a box on its texture: where it lies and which side of the box it is. */
export interface BoxFace {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly side: BoxSide;
}

/**
 * The six faces of a box-UV cube on its texture, in the order the game unfolds them: the top
 * and bottom above, then east, front (north), west and back in a row below. East is left of
 * the front face and west right of it.
 */
export function boxFaces(box: Pick<SkinBox, 'u' | 'v' | 'w' | 'h' | 'd'>): BoxFace[] {
  const { u, v, w, h, d } = box;
  return [
    { x: u + d, y: v, w, h: d, side: 'top' },
    { x: u + d + w, y: v, w, h: d, side: 'bottom' },
    { x: u, y: v + d, w: d, h, side: 'east' },
    { x: u + d, y: v + d, w, h, side: 'front' },
    { x: u + d + w, y: v + d, w: d, h, side: 'west' },
    { x: u + 2 * d + w, y: v + d, w, h, side: 'back' },
  ];
}

/**
 * How many shades lighter (or, below zero, darker) each side is than the front (ADR 0092 D8):
 * the top one lighter, the bottom and the sides one darker; the back, turned away from the
 * light, as dark as the sides.
 */
export const SIDE_SHADE: Readonly<Record<BoxSide, number>> = Object.freeze({
  top: 1,
  bottom: -1,
  east: -1,
  front: 0,
  west: -1,
  back: -1,
});

/** How much a pixel faces the light within a face: 1 at its top-left corner, -1 at the other. */
export function faceLean(fx: number, fy: number, w: number, h: number): number {
  return ((w - 1) / 2 - fx) / Math.max(1, w - 1) + ((h - 1) / 2 - fy) / Math.max(1, h - 1);
}

/** The pupils and the glint of eyes: no pure black or white. */
const EYE_DARK: Rgb = oklchToRgb([0.2, 0.02, 280]);
const EYE_SHINE: Rgb = oklchToRgb([0.93, 0.01, 260]);

/** The front shade of a five-shade coat ramp. */
const FRONT = 2;

/**
 * Per-pixel shade offsets of a coat over a `w` by `h` area (row-major), from the seeded
 * generator: short vertical strokes for fur, staggered scales, a few soft blobs for smooth,
 * clustered grain with a crack for stone, and a lighter inner square for slime. `noise` is the
 * detail's factor.
 */
function coatOffsets(coat: ArtCoat, w: number, h: number, seed: number, noise: number): Int8Array {
  const out = new Int8Array(w * h);
  if (w <= 0 || h <= 0) return out;
  const random = rng(seed);
  const field = clusteredField(w, h, seed ^ 0x2c1b3c6d, { wrap: true });
  const set = (x: number, y: number, value: number): void => {
    if (x >= 0 && y >= 0 && x < w && y < h) out[y * w + x] = value;
  };
  switch (coat) {
    case 'fur': {
      // Short strokes two pixels long, light and dark, falling downwards.
      const darkShare = 0.11 * noise;
      const lightShare = 0.09 * noise;
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const r = random();
          if (r < darkShare) {
            set(x, y, -1);
            set(x, y + 1, -1);
          } else if (r > 1 - lightShare && (out[y * w + x] ?? 0) === 0) {
            set(x, y, 1);
            set(x, y + 1, 1);
          }
        }
      }
      break;
    }
    case 'scales': {
      // Scales four wide and two high, each row offset by half a scale: a light upper middle,
      // a dark lower rim.
      const shift = Math.floor(random() * 4);
      for (let y = 0; y < h; y += 1) {
        const row = Math.floor(y / 2);
        const offset = (row % 2) * 2 + shift;
        for (let x = 0; x < w; x += 1) {
          const cx = (x + offset) % 4;
          if (y % 2 === 0 && cx === 1) out[y * w + x] = 1;
          else if (y % 2 === 1 && (cx === 0 || cx === 3)) out[y * w + x] = -1;
        }
      }
      const extra = Math.round(w * h * 0.03 * noise);
      for (let k = 0; k < extra; k += 1) {
        const x = Math.floor(random() * w);
        const y = Math.floor(random() * h);
        out[y * w + x] = (out[y * w + x] ?? 0) <= 0 ? 0 : 1;
      }
      break;
    }
    case 'smooth': {
      const dark = 0.05 * noise;
      const light = 1 - 0.05 * noise;
      for (let i = 0; i < w * h; i += 1) {
        const rank = field[i] ?? 0.5;
        if (rank < dark) out[i] = -1;
        else if (rank > light) out[i] = 1;
      }
      break;
    }
    case 'stone': {
      const dark = 0.14 * noise;
      const light = 1 - 0.12 * noise;
      for (let i = 0; i < w * h; i += 1) {
        const rank = field[i] ?? 0.5;
        if (rank < dark) out[i] = -1;
        else if (rank > light) out[i] = 1;
      }
      // A crack: a short wandering line, two shades down.
      if (w >= 3 && h >= 3) {
        let x = 1 + Math.floor(random() * (w - 2));
        let y = Math.floor(random() * Math.max(1, h - 2));
        const length = Math.min(w + h, 3 + Math.floor(random() * 4));
        for (let k = 0; k < length; k += 1) {
          set(x, y, -2);
          y += 1;
          x += Math.floor(random() * 3) - 1;
          if (y >= h || x < 0 || x >= w) break;
        }
      }
      break;
    }
    case 'slime': {
      // A lighter inner square, as if the light came through; a glint at its top left.
      const insetX = Math.max(1, Math.floor(w / 4));
      const insetY = Math.max(1, Math.floor(h / 4));
      if (w > 2 * insetX && h > 2 * insetY) {
        for (let y = insetY; y < h - insetY; y += 1) {
          for (let x = insetX; x < w - insetX; x += 1) out[y * w + x] = 1;
        }
        if (w - 2 * insetX >= 3 && h - 2 * insetY >= 3) set(insetX, insetY, 2);
      }
      const specks = Math.round(w * h * 0.03 * noise);
      for (let k = 0; k < specks; k += 1) {
        const x = Math.floor(random() * w);
        const y = Math.floor(random() * h);
        if ((out[y * w + x] ?? 0) === 0) out[y * w + x] = -1;
      }
      break;
    }
  }
  return out;
}

/** The ramps of a box skin: the coat, the belly and spots, and the leather. */
interface SkinRamps {
  readonly coat: Ramp;
  readonly accent: Ramp | undefined;
  readonly leather: Ramp;
}

function skinRamps(look: BoxSkinLook, hueShift: number): SkinRamps {
  const coat = generateRamp(look.colour ?? DEFAULT_COLOUR, { count: 5, anchor: 2, hueShift });
  let accent: Ramp | undefined;
  if (look.accent !== undefined) {
    const full = generateRamp(look.accent, { count: 5, anchor: 2, hueShift });
    // Three shades, darkest to lightest around the second colour; a second colour that
    // would disagree with the coat on which shade is warmer is drawn from the coat's ramp.
    accent = rampsAgree(full, coat) ? [1, 2, 3].map((i) => full[i] as Rgb) : coat.slice(1, 4);
  }
  const fullLeather = generateRamp(SADDLE_COLOUR, { count: 5, anchor: 2, hueShift });
  const leather = rampsAgree(fullLeather, coat) ? fullLeather.slice(0, 4) : coat.slice(0, 4);
  return { coat, accent, leather };
}

/** Writes one pixel of an RGBA buffer, opaque. */
function put(rgba: Uint8Array, width: number, x: number, y: number, rgb: Rgb): void {
  const i = (y * width + x) * 4;
  rgba[i] = rgb[0];
  rgba[i + 1] = rgb[1];
  rgba[i + 2] = rgb[2];
  rgba[i + 3] = 255;
}

/**
 * The RGBA pixels of a model's box skin in a look (ADR 0092 D7, D8): every face of every box
 * in the coat, shaded by its side and lit towards its top left, the saddle in leather, eyes on
 * the front of `face` boxes (on both sides near the front for `side_face`), the second colour
 * on the bottom faces and in a few spots on the top ones, and nothing (transparent) outside the
 * faces. Boxes later in the list are drawn over earlier ones.
 *
 * @param boxes - The model's cubes on the texture.
 * @param width - Texture width in pixels.
 * @param height - Texture height in pixels.
 * @param look - The colours, coat, detail and seed.
 */
export function boxSkinArtPixels(
  boxes: readonly SkinBox[],
  width: number,
  height: number,
  look: BoxSkinLook,
): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  const ramps = skinRamps(look, ART_HUE_SHIFT);
  const noise = DETAIL_NOISE[look.detail ?? 'normal'] ?? 1;
  const seed = Math.trunc(look.seed ?? 0) >>> 0;
  boxes.forEach((box, index) => {
    const saddle = box.role === 'saddle';
    const faces = boxFaces(box);
    faces.forEach((face, faceIndex) => {
      if (face.w <= 0 || face.h <= 0) return;
      const coat: ArtCoat = saddle ? 'smooth' : look.coat;
      const offsets = coatOffsets(
        coat,
        face.w,
        face.h,
        hashSeed('box_skin', look.coat, seed, index, faceIndex),
        noise,
      );
      const belly = !saddle && face.side === 'bottom' && ramps.accent !== undefined;
      const ramp = saddle ? ramps.leather : belly ? (ramps.accent as Ramp) : ramps.coat;
      const base = saddle ? 2 : belly ? 1 : FRONT;
      const spots = new Set<number>();
      if (
        !saddle &&
        face.side === 'top' &&
        ramps.accent !== undefined &&
        face.w >= 6 &&
        face.h >= 6
      ) {
        const random = rng(hashSeed('box_spots', seed, index));
        const count = 1 + Math.floor((face.w * face.h) / 24);
        for (let k = 0; k < count; k += 1) {
          const sx = Math.floor(random() * (face.w - 1));
          const sy = Math.floor(random() * Math.max(1, face.h - 1));
          for (const [dx, dy] of [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
          ] as const) {
            if (sy + dy < face.h) spots.add((sy + dy) * face.w + sx + dx);
          }
        }
      }
      for (let fy = 0; fy < face.h; fy += 1) {
        for (let fx = 0; fx < face.w; fx += 1) {
          const x = face.x + fx;
          const y = face.y + fy;
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          const lean = faceLean(fx, fy, face.w, face.h) * 0.6;
          const offset = offsets[fy * face.w + fx] ?? 0;
          if (spots.has(fy * face.w + fx)) {
            const accent = ramps.accent as Ramp;
            put(rgba, width, x, y, pick(accent, 1 + Math.sign(Math.round(lean + offset * 0.5))));
            continue;
          }
          const side = belly ? 0 : SIDE_SHADE[face.side];
          put(rgba, width, x, y, pick(ramp, Math.round(base + side + offset + lean)));
        }
      }
    });
    drawEyes(rgba, width, height, box);
  });
  return rgba;
}

/** Eyes on a `face` box's front, or on both sides near the front of a `side_face` box. */
function drawEyes(rgba: Uint8Array, width: number, height: number, box: SkinBox): void {
  const { u, v, w, h, d } = box;
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height;
  if (box.role === 'face' && w >= 4 && h >= 3) {
    const row = v + d + Math.max(1, Math.floor(h / 3));
    const inset = Math.max(1, Math.floor(w / 4));
    const left = u + d + inset;
    const right = u + d + w - 1 - inset;
    for (const [x, shine] of [
      [left, left + 1],
      [right, right - 1],
    ] as const) {
      if (inside(x, row)) put(rgba, width, x, row, EYE_DARK);
      if (w >= 8 && inside(shine, row) && shine !== left && shine !== right) {
        put(rgba, width, shine, row, EYE_SHINE);
      }
    }
  }
  if (box.role === 'side_face' && d >= 3 && h >= 3) {
    const row = v + d + Math.max(1, Math.floor(h / 3));
    for (const x of [u + d - 2, u + d + w + 1]) {
      if (inside(x, row)) put(rgba, width, x, row, EYE_DARK);
    }
  }
}

/**
 * A byte-stable PNG of {@link boxSkinArtPixels}.
 *
 * @param boxes - The model's cubes on the texture.
 * @param width - Texture width in pixels.
 * @param height - Texture height in pixels.
 * @param look - The colours, coat, detail and seed.
 */
export function boxSkinArtPng(
  boxes: readonly SkinBox[],
  width: number,
  height: number,
  look: BoxSkinLook,
): Uint8Array {
  return encodePng(boxSkinArtPixels(boxes, width, height, look), width, height);
}

/** The side of the square cells an even coat is laid out in (slime squares, crack spacing). */
const EVEN_CELL = 8;

/**
 * The RGBA pixels of an even coat over a whole texture (plan limit A3), for vanilla mob variant
 * textures whose layout belongs to vanilla's models: the coat's shading in the colour on every
 * pixel, opaque, with no faces, eyes or markings, laid out in 8 by 8 cells so it looks the same
 * wherever a model's faces fall. The second colour is not used.
 *
 * @param width - Texture width in pixels.
 * @param height - Texture height in pixels.
 * @param look - The colour, coat, detail and seed.
 */
export function evenCoatArtPixels(width: number, height: number, look: BoxSkinLook): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  const ramp = generateRamp(look.colour ?? DEFAULT_COLOUR, {
    count: 5,
    anchor: 2,
    hueShift: ART_HUE_SHIFT,
  });
  const noise = DETAIL_NOISE[look.detail ?? 'normal'] ?? 1;
  const seed = Math.trunc(look.seed ?? 0) >>> 0;
  for (let cy = 0; cy < height; cy += EVEN_CELL) {
    for (let cx = 0; cx < width; cx += EVEN_CELL) {
      const w = Math.min(EVEN_CELL, width - cx);
      const h = Math.min(EVEN_CELL, height - cy);
      const offsets = coatOffsets(
        look.coat,
        w,
        h,
        hashSeed('even_coat', look.coat, seed, cx, cy),
        noise,
      );
      for (let fy = 0; fy < h; fy += 1) {
        for (let fx = 0; fx < w; fx += 1) {
          put(rgba, width, cx + fx, cy + fy, pick(ramp, FRONT + (offsets[fy * w + fx] ?? 0)));
        }
      }
    }
  }
  return rgba;
}

/**
 * A byte-stable PNG of {@link evenCoatArtPixels}, of any size (a wolf variant's 64 by 32, a
 * cat's 64 by 32, a horse's 64 by 64).
 *
 * @param width - Texture width in pixels.
 * @param height - Texture height in pixels.
 * @param look - The colour, coat, detail and seed.
 */
export function evenCoatArtPng(width: number, height: number, look: BoxSkinLook): Uint8Array {
  return encodePng(evenCoatArtPixels(width, height, look), width, height);
}

/** The bone whose first cube gets the eyes, as the mob presets name it. */
const FACE_BONE = 'head';

/**
 * The box-UV cubes of an `msm:geo_model` geometry (Bedrock geometry, `minecraft:geometry`, or
 * the older `geometry.<name>` form), as its skin unfolds them: the first cube of the `head`
 * bone is a `face` (eyes on its front), cubes of a bone whose name has `saddle` in it are the
 * saddle, the rest `plain`. Sizes are rounded down to whole pixels, as box UV lays them out.
 * Gives `null` when any cube maps its faces one by one (per-face UV), or when the data is not a
 * geometry at all, since then there are no boxes to shade (plan limit A4); a geometry without
 * cubes gives an empty list.
 *
 * @param geometry - The data of an `msm:geo_model` element.
 */
export function boxesOfGeoModel(geometry: JsonObject): SkinBox[] | null {
  const entry = geometryEntry(geometry);
  if (entry === undefined) return null;
  const bones = entry.bones;
  if (bones === undefined) return [];
  if (!Array.isArray(bones)) return null;
  const boxes: SkinBox[] = [];
  for (const bone of bones) {
    if (bone === null || typeof bone !== 'object' || Array.isArray(bone)) return null;
    const name = typeof bone.name === 'string' ? bone.name : '';
    const cubes = bone.cubes;
    if (cubes === undefined) continue;
    if (!Array.isArray(cubes)) return null;
    let first = true;
    for (const cube of cubes) {
      if (cube === null || typeof cube !== 'object' || Array.isArray(cube)) return null;
      const uv = cube.uv ?? [0, 0];
      const size = cube.size ?? [0, 0, 0];
      if (!isNumbers(uv, 2) || !isNumbers(size, 3)) return null;
      const [u = 0, v = 0] = uv;
      const [w = 0, h = 0, d = 0] = size;
      const role: SkinBox['role'] = /saddle/i.test(name)
        ? 'saddle'
        : name === FACE_BONE && first
          ? 'face'
          : 'plain';
      first = false;
      boxes.push({
        u: Math.floor(u),
        v: Math.floor(v),
        w: Math.floor(Math.abs(w)),
        h: Math.floor(Math.abs(h)),
        d: Math.floor(Math.abs(d)),
        role,
      });
    }
  }
  return boxes;
}

/** Whether a value is an array of `count` finite numbers. */
function isNumbers(value: unknown, count: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === count &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n))
  );
}

/** The geometry object with the bones: the first `minecraft:geometry` entry or the old form. */
function geometryEntry(geometry: JsonObject): { bones?: unknown } | undefined {
  const list = geometry['minecraft:geometry'];
  if (Array.isArray(list)) {
    const first = list[0];
    return first !== null && typeof first === 'object' && !Array.isArray(first)
      ? (first as { bones?: unknown })
      : undefined;
  }
  const old = Object.keys(geometry)
    .filter((key) => key.startsWith('geometry.'))
    .sort()[0];
  if (old === undefined) return undefined;
  const value = geometry[old];
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as { bones?: unknown })
    : undefined;
}

/**
 * The humanoid boxes of the Custom mob starter's own model (`bipedGeometry` in
 * `content/entities.ts`, the 64 by 64 player-skin layout without the second layer): body, head
 * (the face), two arms and two legs. Read from MSM's model, not from a vanilla file.
 */
export const HUMANOID_SKIN_BOXES: readonly Readonly<SkinBox>[] = Object.freeze(
  (boxesOfGeoModel(bipedGeometry('humanoid')) ?? []).map((box) => Object.freeze(box)),
);
