/**
 * "Split a strip into frames" of the Particle Studio (ADR 0081 D1): cuts one picture (a
 * horizontal or vertical strip, or a grid of square frames) into frame pictures named
 * `<ns>:<path>_<n>` (the files `textures/particle/<path>_<n>.png`). The cutting works on decoded RGBA
 * pixels (`components/texture-editor/pixels.ts`); decoding and encoding PNG bytes go through
 * `png-canvas.ts` in {@link splitPicture}.
 *
 * @packageDocumentation
 */

import type { RgbaImage } from '../../components/texture-editor/pixels';
import { decodePicture, encodePicture } from '../../components/texture-editor/png-canvas';

/** How the frames sit in the picture. */
export type FrameLayout = 'horizontal' | 'vertical' | 'grid';

/** The layouts in the order the Studio offers them. */
export const FRAME_LAYOUTS: readonly FrameLayout[] = Object.freeze([
  'horizontal',
  'vertical',
  'grid',
]);

/** The words the Studio shows for each layout. */
export const FRAME_LAYOUT_LABELS: Readonly<Record<FrameLayout, string>> = Object.freeze({
  horizontal: 'Horizontal strip (frames side by side)',
  vertical: 'Vertical strip (frames one above the other)',
  grid: 'Grid (rows of frames, read left to right)',
});

/** The most frames a particle takes (`textures @ 1..64`). */
export const MAX_FRAMES = 64;

/** How to split: the layout, the frame count (strips: square frames when absent), grid columns. */
export interface SplitOptions {
  layout: FrameLayout;
  /** How many frames to take; strips default to square frames, grids to every cell. */
  frames?: number | undefined;
  /** Grid only: frames per row; defaults to the largest square frames that fill the picture. */
  columns?: number | undefined;
}

/** A split that cannot be made, with the reason in words. */
export class SplitError extends Error {
  override name = 'SplitError';
}

function crop(image: RgbaImage, left: number, top: number, width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const from = ((top + y) * image.width + left) * 4;
    data.set(image.data.subarray(from, from + width * 4), y * width * 4);
  }
  return { width, height, data };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function whole(value: number | undefined): number | undefined {
  return value === undefined || !Number.isFinite(value) ? undefined : Math.floor(value);
}

/**
 * Cuts `image` into frames, in reading order.
 *
 * @throws {@link SplitError} When the picture does not divide into whole frames or gives more
 *   than {@link MAX_FRAMES}.
 */
export function splitFrames(image: RgbaImage, options: SplitOptions): RgbaImage[] {
  const { width, height } = image;
  let frameWidth: number;
  let frameHeight: number;
  let columns: number;
  let count: number;
  const wanted = whole(options.frames);
  if (wanted !== undefined && wanted < 1) throw new SplitError('Ask for at least one frame.');
  if (options.layout === 'horizontal' || options.layout === 'vertical') {
    const along = options.layout === 'horizontal' ? width : height;
    const across = options.layout === 'horizontal' ? height : width;
    count = wanted ?? Math.floor(along / across);
    const square = wanted !== undefined || along % across === 0;
    if (count < 1 || along % count !== 0 || !square) {
      throw new SplitError(
        wanted === undefined
          ? `The picture is ${width} by ${height}: a ${options.layout} strip of square frames must be a whole number of frames long.`
          : `The picture is ${width} by ${height}: ${along} pixels do not split into ${count} equal frames.`,
      );
    }
    const edge = along / count;
    frameWidth = options.layout === 'horizontal' ? edge : width;
    frameHeight = options.layout === 'horizontal' ? height : edge;
    columns = options.layout === 'horizontal' ? count : 1;
  } else {
    columns = whole(options.columns) ?? width / gcd(width, height);
    if (columns < 1 || width % columns !== 0) {
      throw new SplitError(
        `The picture is ${width} pixels wide: it does not split into ${columns} equal columns.`,
      );
    }
    frameWidth = width / columns;
    frameHeight = frameWidth;
    if (height % frameHeight !== 0) {
      throw new SplitError(
        `The picture is ${height} pixels high: rows of square ${frameWidth}-pixel frames do not fit it exactly.`,
      );
    }
    const cells = columns * (height / frameHeight);
    count = wanted ?? cells;
    if (count > cells) {
      throw new SplitError(`The grid has ${cells} frames, fewer than the ${count} asked for.`);
    }
  }
  if (count > MAX_FRAMES) {
    throw new SplitError(`That makes ${count} frames; a particle takes at most ${MAX_FRAMES}.`);
  }
  const out: RgbaImage[] = [];
  for (let index = 0; index < count; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    out.push(crop(image, column * frameWidth, row * frameHeight, frameWidth, frameHeight));
  }
  return out;
}

/** Decodes `bytes`, splits them and encodes each frame as PNG bytes. */
export async function splitPicture(
  bytes: Uint8Array,
  options: SplitOptions,
): Promise<Uint8Array[]> {
  const image = await decodePicture(bytes);
  return splitFrames(image, options).map((frameImage) => encodePicture(frameImage));
}
