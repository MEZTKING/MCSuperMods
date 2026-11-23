/**
 * The showcase's drawn still (ADR 0118 D7, D9; B568): what a card shows before its clip has
 * played once, and always without WebGL. Up to three of the example's own pictures (its block
 * pictures first, then its items', then the rest; never a model's skin sheet), each scaled by a whole number without
 * smoothing, side by side on a tint taken from the first picture.
 *
 * - {@link stillPictures} and {@link composeStill} are pure: the same pictures give the same
 *   bytes (B565: only the drawn still is byte-stable; taken stills are not).
 * - {@link drawnStill} builds the example's bundle (no lowering), decodes its pictures with the
 *   2D canvas, composes and encodes the still; cached as a promise by example and target.
 *
 * @packageDocumentation
 */

import type { ContentBundle, ContentBundleAsset, ExampleProject, Target } from '@msm/plugin-api';
import type { RgbaImage } from '../components/texture-editor/pixels';
import {
  decodePicture,
  encodePicture,
  imageDataUrl,
} from '../components/texture-editor/png-canvas';
import { SHOWCASE_NAMESPACE } from './clip';

/**
 * The size of a still where the card's size is not known (tests, search's preview): the clips'
 * old picture, 320 by 180 (ADR 0118 D6). Cards draw theirs at {@link stillSizeFor}.
 */
export const STILL_WIDTH = 320;
export const STILL_HEIGHT = 180;
/** The most device pixels per CSS pixel a still or clip is drawn at (ADR 0128 D3). */
export const MAX_PIXEL_RATIO = 2;

/** A still's size in pixels. */
export interface StillSize {
  readonly width: number;
  readonly height: number;
}

/** The default still size, {@link STILL_WIDTH} by {@link STILL_HEIGHT}. */
export const DEFAULT_STILL_SIZE: StillSize = Object.freeze({
  width: STILL_WIDTH,
  height: STILL_HEIGHT,
});

/**
 * The size a still is drawn at for a picture shown at `width` by `height` CSS pixels on a screen
 * of `devicePixelRatio` (ADR 0128 D3): one still pixel per device pixel, the ratio capped at
 * {@link MAX_PIXEL_RATIO} (and at least 1), so the picture is never scaled by the browser. A
 * picture of no size yet (not laid out) gets {@link DEFAULT_STILL_SIZE}.
 */
export function stillSizeFor(width: number, height: number, devicePixelRatio: number): StillSize {
  if (!(width > 0) || !(height > 0)) return DEFAULT_STILL_SIZE;
  const ratio = Math.min(MAX_PIXEL_RATIO, Math.max(1, devicePixelRatio || 1));
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}
/** At most this many pictures in a drawn still. */
export const STILL_PICTURES = 3;
/** The space round and between the pictures in a still of {@link STILL_WIDTH}. */
const GAP = 16;
/** The tint when the example has no pictures. */
const PLAIN_TINT: readonly [number, number, number] = [58, 66, 74];

const ORDER = ['textures/block/', 'textures/item/'];

/**
 * The kinds whose `texture` (or `skin`) is a model's skin sheet: a flat unfolded body that reads
 * as noise on a card (the user's look at 1.5.8: a vehicle's still was busy).
 */
const SKIN_KINDS: ReadonlySet<string> = new Set([
  'msm:entity',
  'msm:vehicle',
  'msm:geo_model',
  'msm:boat',
]);
/** The keys under which a skin kind names its sheet. */
const SKIN_KEYS: ReadonlySet<string> = new Set(['texture', 'textures', 'skin']);
/** The keys of a skin kind's own item pictures (a spawn egg, a vehicle's item): not skins. */
const ITEM_KEYS: ReadonlySet<string> = new Set(['spawn_egg', 'item']);

/** Every string under a skin key of `value`, at any depth, but under an item key. */
function skinIds(value: unknown, under: boolean, into: Set<string>): void {
  if (typeof value === 'string') {
    if (under) into.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const one of value) skinIds(one, under, into);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, one] of Object.entries(value)) {
    if (!ITEM_KEYS.has(key)) skinIds(one, under || SKIN_KEYS.has(key), into);
  }
}

/**
 * The asset paths of the bundle's skin sheets: every texture a mob, vehicle, boat or geo model
 * names as its `texture` or `skin` (`ns:entity/kart` is `textures/entity/kart.png`).
 */
export function skinSheetPaths(bundle: ContentBundle): Set<string> {
  const ids = new Set<string>();
  for (const element of bundle.elements) {
    if (SKIN_KINDS.has(element.kind)) skinIds(element.data, false, ids);
  }
  const paths = new Set<string>();
  for (const id of ids) {
    const path = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
    paths.add(`textures/${path.replace(/^textures\//, '').replace(/\.png$/, '')}.png`);
  }
  return paths;
}

/** Whether `path` is a skin sheet by its folder: `textures/entity/` or an `entity/` below it. */
function inEntityFolder(path: string): boolean {
  return path.startsWith('textures/entity/') || path.slice('textures/'.length).includes('/entity/');
}

/**
 * The pictures a drawn still shows: the bundle's PNGs under `textures/` but a model's skin
 * sheets (under `textures/entity/`, or named by a mob, vehicle, boat or geo model,
 * {@link skinSheetPaths}), block pictures first, then items', then the rest, each group in
 * bundle order; at most {@link STILL_PICTURES}. A mob or vehicle with nothing else shows none,
 * and its card shows its own drawn look (`card-picture.ts`).
 */
export function stillPictures(bundle: ContentBundle): ContentBundleAsset[] {
  const skins = skinSheetPaths(bundle);
  const pngs = bundle.assets.filter(
    (asset) =>
      asset.path.startsWith('textures/') &&
      asset.path.endsWith('.png') &&
      !inEntityFolder(asset.path) &&
      !skins.has(asset.path),
  );
  const rank = (asset: ContentBundleAsset): number => {
    const at = ORDER.findIndex((prefix) => asset.path.startsWith(prefix));
    return at === -1 ? ORDER.length : at;
  };
  return pngs
    .map((asset, index) => ({ asset, index }))
    .sort((a, b) => rank(a.asset) - rank(b.asset) || a.index - b.index)
    .slice(0, STILL_PICTURES)
    .map((entry) => entry.asset);
}

/** The first frame of an animated strip (a picture taller than wide, by whole squares). */
export function firstFrame(image: RgbaImage): RgbaImage {
  const { width, height } = image;
  if (height <= width || height % width !== 0) return image;
  return { width, height: width, data: image.data.slice(0, width * width * 4) };
}

/** The mean colour of a picture's opaque pixels, or `null` when it has none. */
export function meanColour(image: RgbaImage): [number, number, number] | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let at = 0; at < image.data.length; at += 4) {
    if ((image.data[at + 3] ?? 0) < 128) continue;
    r += image.data[at] ?? 0;
    g += image.data[at + 1] ?? 0;
    b += image.data[at + 2] ?? 0;
    n += 1;
  }
  return n === 0 ? null : [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/** The ground tint of a still: the first picture's mean colour, darkened so pictures stand out. */
export function stillTint(first: RgbaImage | undefined): [number, number, number] {
  const mean = first === undefined ? null : meanColour(first);
  if (mean === null) return [...PLAIN_TINT];
  return [
    Math.round(mean[0] * 0.45 + 18),
    Math.round(mean[1] * 0.45 + 18),
    Math.round(mean[2] * 0.45 + 18),
  ];
}

/**
 * Composes a still: the pictures (first frames) side by side, each scaled by the largest whole
 * number that fits its share of the width (at least 1), centred, on {@link stillTint}. Pure.
 */
export function composeStill(
  pictures: readonly RgbaImage[],
  width = STILL_WIDTH,
  height = STILL_HEIGHT,
): RgbaImage {
  const shown = pictures.slice(0, STILL_PICTURES).map(firstFrame);
  const data = new Uint8ClampedArray(width * height * 4);
  const [tr, tg, tb] = stillTint(shown[0]);
  for (let at = 0; at < data.length; at += 4) {
    data[at] = tr;
    data[at + 1] = tg;
    data[at + 2] = tb;
    data[at + 3] = 255;
  }
  if (shown.length === 0) return { width, height, data };
  // The space grows with the still, so a still twice the size looks the same, only sharper.
  const gap = Math.max(4, Math.round((GAP * width) / STILL_WIDTH));
  const cellWidth = Math.floor((width - gap * (shown.length + 1)) / shown.length);
  const cellHeight = height - gap * 2;
  const scales = shown.map((image) =>
    Math.max(1, Math.floor(Math.min(cellWidth / image.width, cellHeight / image.height))),
  );
  const drawnWidths = shown.map((image, index) => image.width * (scales[index] ?? 1));
  const total = drawnWidths.reduce((sum, one) => sum + one, 0) + gap * (shown.length - 1);
  let left = Math.floor((width - total) / 2);
  shown.forEach((image, index) => {
    const scale = scales[index] ?? 1;
    const top = Math.floor((height - image.height * scale) / 2);
    blit(image, scale, left, top, { width, height, data });
    left += (drawnWidths[index] ?? 0) + gap;
  });
  return { width, height, data };
}

/** Draws `image` scaled by `scale` (nearest neighbour) at (left, top), blending by alpha. */
function blit(image: RgbaImage, scale: number, left: number, top: number, out: RgbaImage): void {
  for (let y = 0; y < image.height * scale; y += 1) {
    const oy = top + y;
    if (oy < 0 || oy >= out.height) continue;
    const sy = Math.floor(y / scale);
    for (let x = 0; x < image.width * scale; x += 1) {
      const ox = left + x;
      if (ox < 0 || ox >= out.width) continue;
      const from = (sy * image.width + Math.floor(x / scale)) * 4;
      const alpha = image.data[from + 3] ?? 0;
      if (alpha === 0) continue;
      const to = (oy * out.width + ox) * 4;
      for (let c = 0; c < 3; c += 1) {
        const src = image.data[from + c] ?? 0;
        const dst = out.data[to + c] ?? 0;
        out.data[to + c] = Math.round((src * alpha + dst * (255 - alpha)) / 255);
      }
      out.data[to + 3] = 255;
    }
  }
}

/** How a drawn still decodes and encodes pictures (the 2D canvas; a stand-in in tests). */
export interface StillCodec {
  decode(bytes: Uint8Array): Promise<RgbaImage>;
  encode(image: RgbaImage): Uint8Array;
}

/** The 2D canvas codec of the texture editor (`png-canvas.ts`). */
export const CANVAS_CODEC: StillCodec = {
  decode: (bytes) => decodePicture(bytes),
  encode: encodePicture,
};

/** A drawn still and how many of the example's own pictures it shows. */
interface Drawn {
  readonly url: string;
  readonly pictures: number;
}

const cache = new Map<string, Promise<Drawn>>();
/** The URL promise of each drawn still, so a caller gets the same promise each time. */
const urls = new WeakMap<Promise<Drawn>, Promise<string>>();

/** Forgets every drawn still (tests). */
export function clearDrawnStills(): void {
  cache.clear();
}

/** The drawn still and its picture count, built once per session and size. */
function drawn(
  example: ExampleProject,
  target: Target,
  codec: StillCodec,
  size: StillSize,
): Promise<Drawn> {
  const key = `${example.id}\u0000${target.id}\u0000${size.width}x${size.height}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const made = (async () => {
    const bundle = await example.build({
      namespace: SHOWCASE_NAMESPACE,
      projectName: SHOWCASE_NAMESPACE,
      target,
      values: {},
    });
    const decoded: RgbaImage[] = [];
    for (const asset of stillPictures(bundle)) {
      try {
        decoded.push(await codec.decode(asset.bytes));
      } catch {
        // A picture that cannot be read is left out.
      }
    }
    return {
      url: imageDataUrl(codec.encode(composeStill(decoded, size.width, size.height))),
      pictures: decoded.length,
    };
  })();
  cache.set(key, made);
  made.catch(() => {
    if (cache.get(key) === made) cache.delete(key);
  });
  return made;
}

/**
 * The drawn still of `example` on `target`, as a PNG `data:` URL `size` pixels big (each picture
 * scaled by a whole number): built once per session and size (a failed build is not kept). A
 * picture that cannot be decoded is left out.
 */
export function drawnStill(
  example: ExampleProject,
  target: Target,
  codec: StillCodec = CANVAS_CODEC,
  size: StillSize = DEFAULT_STILL_SIZE,
): Promise<string> {
  const made = drawn(example, target, codec, size);
  const hit = urls.get(made);
  if (hit !== undefined) return hit;
  const url = made.then((one) => one.url);
  urls.set(made, url);
  return url;
}

/**
 * {@link drawnStill}, or `null` when the example has no pictures of its own (data, rules,
 * commands, most worlds and games), so the caller can show something better than a plain tint
 * (Home's gallery shows the card's drawn picture, ADR 0129 D2).
 */
export async function drawnStillIfPictures(
  example: ExampleProject,
  target: Target,
  codec: StillCodec = CANVAS_CODEC,
  size: StillSize = DEFAULT_STILL_SIZE,
): Promise<string | null> {
  const made = await drawn(example, target, codec, size);
  return made.pictures === 0 ? null : made.url;
}
