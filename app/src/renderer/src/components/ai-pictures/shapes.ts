/**
 * What an AI picture is for and how it becomes the texture (ADR 0093 D6 as amended on
 * 2026-11-22): the Retro Diffusion style the request names, the size the service is asked and
 * cleaned up to, and the layout that turns the cleaned picture into the texture the game reads.
 *
 * - Block, item and tool textures are squares of 16 or 32, as before.
 * - A mob skin, a villager look and an armour layer have no single picture: the service draws
 *   a tileable coat (`mc_texture`, a 16 by 16 tile), and {@link layOnBoxes} lays it on every
 *   face of the model's box-UV cubes, each side shaded as the drawn skins are (the top a shade
 *   lighter, the sides and the bottom a shade darker, ADR 0092 D8), with eyes on a `face` box.
 * - A painting is the painting's own size, 16 pixels a block.
 * - A banner or shield pattern is one motif, cut out and made a pale mask the game dyes, placed
 *   on the flag's front (1, 1) and, mirrored, its back (22, 1), or on the shield plate.
 * - A pot pattern is one motif pressed into fired clay, 16 by 16 and opaque.
 * - A particle is a cut-out sprite of the frame's size, without an outline.
 *
 * Pure: no DOM, so it runs in Node tests.
 *
 * @packageDocumentation
 */

import {
  boxFaces,
  faceLean,
  HUMANOID_SKIN_BOXES,
  SIDE_SHADE,
  type SkinBox,
} from '@msm/plugin-library';
import type { AiPictureStyle } from '../../../../shared/ai-pictures';
import type { RgbaImage } from '../texture-editor/pixels';
import { fromHsl, toHsl } from './cleanup';

/** How the cleaned picture becomes the texture. */
export type AiLayout =
  | {
      readonly kind: 'boxes';
      /** The model's box-UV cubes on the texture. */
      readonly boxes: readonly SkinBox[];
    }
  | { readonly kind: 'banner' }
  | { readonly kind: 'shield' }
  | { readonly kind: 'pot' };

/** What one AI picture is made for. */
export interface AiPictureShape {
  readonly style: AiPictureStyle;
  /** What the service is asked for and the clean-up makes (the tile of a coat, a motif). */
  readonly width: number;
  readonly height: number;
  /** The texture's own size (the same unless a layout places the picture). */
  readonly outWidth: number;
  readonly outHeight: number;
  readonly layout?: AiLayout;
  /** The size in words for the dialog: "64 × 64, laid on the model". */
  readonly words: string;
}

/** The tile edge of a coat laid on boxes. */
export const COAT_TILE = 16;

/** The humanoid armour boxes (helmet, chestplate, arms and boots) of a 64 by 32 layer. */
export const ARMOUR_BOXES: readonly SkinBox[] = Object.freeze([
  { u: 0, v: 0, w: 8, h: 8, d: 8 },
  { u: 16, v: 16, w: 8, h: 12, d: 4 },
  { u: 40, v: 16, w: 4, h: 12, d: 4 },
  { u: 0, v: 16, w: 4, h: 12, d: 4 },
]);

/** The leggings boxes of a 64 by 32 layer: the waist and both legs. */
export const LEGGINGS_BOXES: readonly SkinBox[] = Object.freeze([
  { u: 16, v: 16, w: 8, h: 12, d: 4 },
  { u: 0, v: 16, w: 4, h: 12, d: 4 },
]);

/**
 * A villager look's clothes (64 by 64, the villager model's box UVs): the body, the robe over
 * it, the folded arms and the legs. The head stays clear, so the job's and the villager's own
 * face show through, as a look is drawn under the job's clothes.
 */
export const VILLAGER_CLOTHES_BOXES: readonly SkinBox[] = Object.freeze([
  { u: 16, v: 20, w: 8, h: 12, d: 6 },
  { u: 0, v: 38, w: 8, h: 20, d: 6 },
  { u: 44, v: 22, w: 4, h: 8, d: 4 },
  { u: 40, v: 38, w: 8, h: 4, d: 4 },
  { u: 0, v: 22, w: 4, h: 12, d: 4 },
]);

/** The banner flag's front and the shield plate's front on their 64 by 64 textures. */
export const BANNER_FACE = Object.freeze({ x: 1, y: 1, w: 20, h: 40, backX: 22 });
export const SHIELD_FACE = Object.freeze({ x: 1, y: 1, w: 12, h: 22 });

/** A square texture of `size` in `style` (block, item or tool). */
export function squareShape(style: AiPictureStyle, size: number): AiPictureShape {
  return {
    style,
    width: size,
    height: size,
    outWidth: size,
    outHeight: size,
    words: `${size} × ${size}`,
  };
}

/** A coat laid on `boxes` of a `width` by `height` texture. */
export function boxesShape(
  boxes: readonly SkinBox[],
  width: number,
  height: number,
  what = 'laid on the model',
): AiPictureShape {
  return {
    style: 'skin',
    width: COAT_TILE,
    height: COAT_TILE,
    outWidth: width,
    outHeight: height,
    layout: { kind: 'boxes', boxes },
    words: `${width} × ${height}, ${what}`,
  };
}

/** A painting of `blocksWide` by `blocksTall` blocks, 16 pixels a block (64 at most a side). */
export function paintingShape(blocksWide: number, blocksTall: number): AiPictureShape {
  const width = Math.max(1, Math.min(4, Math.round(blocksWide))) * 16;
  const height = Math.max(1, Math.min(4, Math.round(blocksTall))) * 16;
  return {
    style: 'painting',
    width,
    height,
    outWidth: width,
    outHeight: height,
    words: `${width} × ${height}, ${width / 16} by ${height / 16} blocks`,
  };
}

/** A particle frame of `size`. */
export function particleShape(size: number): AiPictureShape {
  return {
    style: 'particle',
    width: size,
    height: size,
    outWidth: size,
    outHeight: size,
    words: `${size} × ${size}`,
  };
}

/**
 * The shape of a project texture at `path` (`ns:textures/…` or a bare path) of `width` by
 * `height`, by its folder: paintings, banner and shield patterns, pot patterns, armour layers,
 * villager looks, 64 by 64 mob skins (the humanoid boxes), particles, and else a block or item
 * square of 16 or 32.
 */
export function shapeForTexture(path: string, width: number, height: number): AiPictureShape {
  const bare = path.slice(path.indexOf(':') + 1);
  const folder = /(?:^|\/)textures\/(.+)\/[^/]+$/.exec(bare)?.[1] ?? '';
  if (folder === 'painting') {
    // A painting drawn finer than 16 pixels a block is made at 16 and scaled up by the host.
    const scale = Math.max(1, Math.max(width, height) / 64);
    return paintingShape(width / 16 / scale, height / 16 / scale);
  }
  if (folder === 'entity/banner') {
    return {
      style: 'pattern',
      width: BANNER_FACE.w,
      height: BANNER_FACE.h,
      outWidth: 64,
      outHeight: 64,
      layout: { kind: 'banner' },
      words: '64 × 64, a pale mask on the flag the loom dyes',
    };
  }
  if (folder === 'entity/shield') {
    return {
      style: 'pattern',
      width: SHIELD_FACE.w,
      height: SHIELD_FACE.h,
      outWidth: 64,
      outHeight: 64,
      layout: { kind: 'shield' },
      words: '64 × 64, a pale mask on the shield the loom dyes',
    };
  }
  if (folder === 'entity/decorated_pot') {
    return {
      style: 'pattern',
      width: 12,
      height: 12,
      outWidth: 16,
      outHeight: 16,
      layout: { kind: 'pot' },
      words: '16 × 16, pressed into fired clay',
    };
  }
  if (folder.startsWith('entity/equipment/humanoid_leggings')) {
    return boxesShape(LEGGINGS_BOXES, 64, 32, 'laid on the leggings');
  }
  if (folder.startsWith('entity/equipment/')) {
    return boxesShape(ARMOUR_BOXES, 64, 32, 'laid on the armour');
  }
  if (/^entity\/(zombie_)?villager\/(type|profession)$/.test(folder)) {
    return boxesShape(VILLAGER_CLOTHES_BOXES, 64, 64, 'laid on the clothes');
  }
  if (folder.startsWith('entity') && width === 64 && (height === 64 || height === 32)) {
    return boxesShape(HUMANOID_SKIN_BOXES, 64, height, 'laid on a humanoid');
  }
  if (folder === 'particle') {
    return particleShape(Math.min(64, Math.max(8, width)));
  }
  const style: AiPictureStyle = folder === 'block' ? 'block' : 'item';
  return squareShape(style, width >= 32 ? 32 : 16);
}

// Layouts ------------------------------------------------------------------------------------

/** The texture of `shape` from its cleaned-up picture. */
export function applyLayout(cleaned: RgbaImage, shape: AiPictureShape): RgbaImage {
  const layout = shape.layout;
  if (layout === undefined) return cleaned;
  switch (layout.kind) {
    case 'boxes':
      return layOnBoxes(cleaned, layout.boxes, shape.outWidth, shape.outHeight);
    case 'banner':
      return paleMask(cleaned, shape.outWidth, shape.outHeight, [
        { x: BANNER_FACE.x, y: BANNER_FACE.y, mirror: false },
        { x: BANNER_FACE.backX, y: BANNER_FACE.y, mirror: true },
      ]);
    case 'shield':
      return paleMask(cleaned, shape.outWidth, shape.outHeight, [
        { x: SHIELD_FACE.x, y: SHIELD_FACE.y, mirror: false },
      ]);
    case 'pot':
      return pressIntoClay(cleaned, shape.outWidth, shape.outHeight);
  }
}

/** How much lighter (or darker) one side shade is, in lightness. */
const SIDE_STEP = 0.07;

/** Moves an RGB colour's lightness by `delta`, keeping hue and saturation. */
function lighten(r: number, g: number, b: number, delta: number): [number, number, number] {
  const [h, s, l] = toHsl(r, g, b);
  return fromHsl(h, s, Math.max(0.03, Math.min(0.97, l + delta)));
}

/**
 * Lays the coat `tile` on every face of `boxes` of a `width` by `height` texture: the tile
 * repeats over each face from its corner, each side shaded by {@link SIDE_SHADE} and lit a
 * little towards its top left, and two dark eyes on the front of a `face` box. Pixels outside
 * the faces stay transparent; later boxes are drawn over earlier ones.
 */
export function layOnBoxes(
  tile: RgbaImage,
  boxes: readonly SkinBox[],
  width: number,
  height: number,
): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  const tw = Math.max(1, tile.width);
  const th = Math.max(1, tile.height);
  let darkest: [number, number, number] = [32, 28, 36];
  let darkestLight = 2;
  for (let at = 0; at < tile.data.length; at += 4) {
    if ((tile.data[at + 3] ?? 0) === 0) continue;
    const colour: [number, number, number] = [
      tile.data[at] ?? 0,
      tile.data[at + 1] ?? 0,
      tile.data[at + 2] ?? 0,
    ];
    const light = toHsl(...colour)[2];
    if (light < darkestLight) {
      darkestLight = light;
      darkest = colour;
    }
  }
  for (const box of boxes) {
    for (const face of boxFaces(box)) {
      for (let fy = 0; fy < face.h; fy += 1) {
        for (let fx = 0; fx < face.w; fx += 1) {
          const x = face.x + fx;
          const y = face.y + fy;
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          const from = ((fy % th) * tw + (fx % tw)) * 4;
          const delta =
            SIDE_SHADE[face.side] * SIDE_STEP + faceLean(fx, fy, face.w, face.h) * (SIDE_STEP / 2);
          const [r, g, b] = lighten(
            tile.data[from] ?? 0,
            tile.data[from + 1] ?? 0,
            tile.data[from + 2] ?? 0,
            delta,
          );
          data.set([r, g, b, 255], (y * width + x) * 4);
        }
      }
      if (box.role === 'face' && face.side === 'front' && face.w >= 4 && face.h >= 4) {
        const ey = face.y + Math.floor(face.h / 2);
        const eyes = [
          face.x + Math.floor(face.w / 4),
          face.x + face.w - 1 - Math.floor(face.w / 4),
        ];
        const [r, g, b] = lighten(...darkest, -0.12);
        for (const ex of eyes) {
          if (ex >= 0 && ex < width && ey >= 0 && ey < height)
            data.set([r, g, b, 255], (ey * width + ex) * 4);
        }
      }
    }
  }
  return { width, height, data };
}

/** The pale greys of a banner mask, darkest first (the game multiplies them by the dye). */
const MASK_GREYS: readonly number[] = Object.freeze([176, 196, 214, 228, 240]);

/**
 * A pale mask of `motif` on a transparent `width` by `height` texture, placed at each of
 * `places` (mirrored left to right where asked): every visible pixel becomes a pale grey by its
 * lightness rank, so the motif keeps its light and the loom's dye gives the colour.
 */
export function paleMask(
  motif: RgbaImage,
  width: number,
  height: number,
  places: readonly { x: number; y: number; mirror: boolean }[],
): RgbaImage {
  const visible: { at: number; l: number }[] = [];
  for (let at = 0; at < motif.data.length; at += 4) {
    if ((motif.data[at + 3] ?? 0) === 0) continue;
    visible.push({
      at,
      l: toHsl(motif.data[at] ?? 0, motif.data[at + 1] ?? 0, motif.data[at + 2] ?? 0)[2],
    });
  }
  const grey = new Map<number, number>();
  const sorted = [...visible].sort((a, b) => a.l - b.l);
  sorted.forEach((pixel, index) => {
    const level = Math.min(
      MASK_GREYS.length - 1,
      Math.floor((index * MASK_GREYS.length) / Math.max(1, sorted.length)),
    );
    grey.set(pixel.at, MASK_GREYS[level] as number);
  });
  const data = new Uint8ClampedArray(width * height * 4);
  for (const place of places) {
    for (let y = 0; y < motif.height; y += 1) {
      for (let x = 0; x < motif.width; x += 1) {
        const from = (y * motif.width + x) * 4;
        const value = grey.get(from);
        if (value === undefined) continue;
        const tx = place.x + (place.mirror ? motif.width - 1 - x : x);
        const ty = place.y + y;
        if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
        data.set([value, value, value - 4, 255], (ty * width + tx) * 4);
      }
    }
  }
  return { width, height, data };
}

/** Fired clay, the ground of a pot face (the drawn pot faces' colour). */
export const POT_CLAY: readonly [number, number, number] = Object.freeze([
  158, 92, 64,
]) as readonly [number, number, number];

/**
 * A pot face of `width` by `height`: fired clay lit from the top left, with `motif` (cut out,
 * smaller than the face) pressed into its middle in the clay's darker shades, the motif's light
 * kept by rank.
 */
export function pressIntoClay(motif: RgbaImage, width: number, height: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = lighten(...POT_CLAY, faceLean(x, y, width, height) * 0.04);
      data.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
  const visible: { at: number; l: number }[] = [];
  for (let at = 0; at < motif.data.length; at += 4) {
    if ((motif.data[at + 3] ?? 0) === 0) continue;
    visible.push({
      at,
      l: toHsl(motif.data[at] ?? 0, motif.data[at + 1] ?? 0, motif.data[at + 2] ?? 0)[2],
    });
  }
  const sorted = [...visible].sort((a, b) => a.l - b.l);
  const depth = new Map<number, number>();
  sorted.forEach((pixel, index) => {
    depth.set(pixel.at, -0.2 + (0.12 * index) / Math.max(1, sorted.length - 1));
  });
  const ox = Math.floor((width - motif.width) / 2);
  const oy = Math.floor((height - motif.height) / 2);
  for (let y = 0; y < motif.height; y += 1) {
    for (let x = 0; x < motif.width; x += 1) {
      const delta = depth.get((y * motif.width + x) * 4);
      if (delta === undefined) continue;
      const tx = ox + x;
      const ty = oy + y;
      if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
      const [r, g, b] = lighten(...POT_CLAY, delta);
      data.set([r, g, b, 255], (ty * width + tx) * 4);
    }
  }
  return { width, height, data };
}
