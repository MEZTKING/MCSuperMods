/**
 * Picture to texture (ADR 0048): turns any picture, such as a screenshot, into a Minecraft
 * texture. Crop, scale (sharp or smooth), cut away the background, reduce the colours and
 * harden the alpha; and bring a legacy 64 by 32 player skin to the 64 by 64 layout. Pure; the
 * dialog decodes and encodes with a canvas.
 *
 * @packageDocumentation
 */

import { pixelAt, type Rgba, type RgbaImage } from './pixels';

/** A rectangle in pixels. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How a picture is scaled: `sharp` samples the nearest pixel, `smooth` averages. */
export type ScaleMode = 'sharp' | 'smooth';

/** The pixels of `rect` (clamped to the image). */
export function cropImage(image: RgbaImage, rect: Rect): RgbaImage {
  const x0 = Math.max(0, Math.min(image.width - 1, Math.round(rect.x)));
  const y0 = Math.max(0, Math.min(image.height - 1, Math.round(rect.y)));
  const width = Math.max(1, Math.min(image.width - x0, Math.round(rect.width)));
  const height = Math.max(1, Math.min(image.height - y0, Math.round(rect.height)));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const from = ((y0 + y) * image.width + x0) * 4;
    data.set(image.data.subarray(from, from + width * 4), y * width * 4);
  }
  return { width, height, data };
}

/** The largest rectangle of `aspect` (width / height) centred in a `width` by `height` image. */
export function fitRect(width: number, height: number, aspect: number): Rect {
  let w = width;
  let h = Math.round(w / aspect);
  if (h > height) {
    h = height;
    w = Math.round(h * aspect);
  }
  w = Math.max(1, Math.min(width, w));
  h = Math.max(1, Math.min(height, h));
  return { x: Math.floor((width - w) / 2), y: Math.floor((height - h) / 2), width: w, height: h };
}

/**
 * `image` scaled to `width` by `height`. `sharp` takes the pixel under each target pixel's
 * centre; `smooth` averages the source area, weighting colours by their alpha so transparent
 * pixels do not darken the edges.
 */
export function resizeImage(
  image: RgbaImage,
  width: number,
  height: number,
  mode: ScaleMode,
): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  const sx = image.width / width;
  const sy = image.height / height;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      if (mode === 'sharp' || (sx <= 1 && sy <= 1)) {
        const px = Math.min(image.width - 1, Math.floor((x + 0.5) * sx));
        const py = Math.min(image.height - 1, Math.floor((y + 0.5) * sy));
        data.set(pixelAt(image, px, py) ?? [0, 0, 0, 0], at);
        continue;
      }
      const x0 = Math.floor(x * sx);
      const y0 = Math.floor(y * sy);
      const x1 = Math.max(x0 + 1, Math.min(image.width, Math.ceil((x + 1) * sx)));
      const y1 = Math.max(y0 + 1, Math.min(image.height, Math.ceil((y + 1) * sy)));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      for (let py = y0; py < y1; py += 1) {
        for (let px = x0; px < x1; px += 1) {
          const from = (py * image.width + px) * 4;
          const alpha = image.data[from + 3] ?? 0;
          r += (image.data[from] ?? 0) * alpha;
          g += (image.data[from + 1] ?? 0) * alpha;
          b += (image.data[from + 2] ?? 0) * alpha;
          a += alpha;
          count += 1;
        }
      }
      if (a > 0) data.set([r / a, g / a, b / a, a / count], at);
    }
  }
  return { width, height, data };
}

/** Squared distance between two colours' red, green and blue. */
function distance2(a: Rgba, b: Rgba): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

/**
 * The background colour of a screenshot: the most common of the four corners (opaque
 * corners only), or `null` when every corner is already transparent.
 */
export function backgroundOf(image: RgbaImage): Rgba | null {
  const corners = [
    pixelAt(image, 0, 0),
    pixelAt(image, image.width - 1, 0),
    pixelAt(image, 0, image.height - 1),
    pixelAt(image, image.width - 1, image.height - 1),
  ].filter((colour): colour is Rgba => colour !== null && colour[3] > 0);
  let best: Rgba | null = null;
  let bestCount = 0;
  for (const corner of corners) {
    const count = corners.filter((other) => distance2(corner, other) <= 300).length;
    if (count > bestCount) {
      best = corner;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Makes the background transparent: every pixel connected to the image's border whose colour
 * is within `tolerance` (0 to 255) of {@link backgroundOf}. Pixels of that colour inside the
 * subject stay. Returns the pixels cleared.
 */
export function removeBackground(image: RgbaImage, tolerance: number): number {
  const background = backgroundOf(image);
  if (background === null) return 0;
  const limit = tolerance * tolerance * 3;
  const { width, height } = image;
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  for (let x = 0; x < width; x += 1) stack.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y += 1) stack.push(y * width, y * width + width - 1);
  let cleared = 0;
  while (stack.length > 0) {
    const index = stack.pop() as number;
    if (seen[index] === 1) continue;
    seen[index] = 1;
    const x = index % width;
    const y = (index - x) / width;
    const colour = pixelAt(image, x, y);
    if (colour === null || colour[3] === 0 || distance2(colour, background) > limit) continue;
    image.data[index * 4 + 3] = 0;
    cleared += 1;
    if (x > 0) stack.push(index - 1);
    if (x < width - 1) stack.push(index + 1);
    if (y > 0) stack.push(index - width);
    if (y < height - 1) stack.push(index + width);
  }
  return cleared;
}

/** Sets every alpha below 128 to 0 and every other to 255, as Minecraft's cutout textures. */
export function hardenAlpha(image: RgbaImage): void {
  for (let at = 3; at < image.data.length; at += 4) {
    image.data[at] = (image.data[at] ?? 0) < 128 ? 0 : 255;
  }
}

/**
 * Reduces the opaque colours to at most `count` (median cut), each pixel taking the nearest
 * colour of the palette. Transparent pixels keep their alpha.
 */
export function reduceColours(image: RgbaImage, count: number): void {
  const colours: Rgba[] = [];
  for (let at = 0; at < image.data.length; at += 4) {
    if ((image.data[at + 3] ?? 0) === 0) continue;
    colours.push([image.data[at] ?? 0, image.data[at + 1] ?? 0, image.data[at + 2] ?? 0, 255]);
  }
  if (colours.length === 0) return;
  let boxes: Rgba[][] = [colours];
  while (boxes.length < count) {
    // Split the box with the widest channel range at its median.
    let widest = -1;
    let widestRange = 0;
    let widestChannel = 0;
    boxes.forEach((box, index) => {
      if (box.length < 2) return;
      for (let channel = 0; channel < 3; channel += 1) {
        let low = 255;
        let high = 0;
        for (const colour of box) {
          low = Math.min(low, colour[channel] ?? 0);
          high = Math.max(high, colour[channel] ?? 0);
        }
        if (high - low > widestRange) {
          widest = index;
          widestRange = high - low;
          widestChannel = channel;
        }
      }
    });
    if (widest < 0) break;
    const box = [...(boxes[widest] as Rgba[])].sort(
      (a, b) => (a[widestChannel] ?? 0) - (b[widestChannel] ?? 0),
    );
    const middle = Math.floor(box.length / 2);
    boxes = [
      ...boxes.slice(0, widest),
      box.slice(0, middle),
      box.slice(middle),
      ...boxes.slice(widest + 1),
    ];
  }
  const palette: Rgba[] = boxes.map((box) => {
    const sum = [0, 0, 0];
    for (const colour of box)
      for (let c = 0; c < 3; c += 1) sum[c] = (sum[c] ?? 0) + (colour[c] ?? 0);
    return [
      Math.round((sum[0] ?? 0) / box.length),
      Math.round((sum[1] ?? 0) / box.length),
      Math.round((sum[2] ?? 0) / box.length),
      255,
    ];
  });
  for (let at = 0; at < image.data.length; at += 4) {
    if ((image.data[at + 3] ?? 0) === 0) continue;
    const colour: Rgba = [
      image.data[at] ?? 0,
      image.data[at + 1] ?? 0,
      image.data[at + 2] ?? 0,
      255,
    ];
    let best = palette[0] as Rgba;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const entry of palette) {
      const d = distance2(colour, entry);
      if (d < bestDistance) {
        best = entry;
        bestDistance = d;
      }
    }
    image.data.set([best[0], best[1], best[2]], at);
  }
}

/** Whether `image` is a legacy (before 1.8) player skin, 64 by 32. */
export function isLegacySkin(image: RgbaImage): boolean {
  return image.width === 64 && image.height === 32;
}

/**
 * The faces of the right leg and right arm copied, mirrored, into the left leg and left arm
 * of the 64 by 64 layout, as the game converts a legacy skin: `[sourceX, sourceY, dx, dy,
 * width, height]`.
 */
const LEGACY_LIMB_COPIES: readonly (readonly [number, number, number, number, number, number])[] = [
  [4, 16, 16, 32, 4, 4],
  [8, 16, 16, 32, 4, 4],
  [0, 20, 24, 32, 4, 12],
  [4, 20, 16, 32, 4, 12],
  [8, 20, 8, 32, 4, 12],
  [12, 20, 16, 32, 4, 12],
  [44, 16, -8, 32, 4, 4],
  [48, 16, -8, 32, 4, 4],
  [40, 20, 0, 32, 4, 12],
  [44, 20, -8, 32, 4, 12],
  [48, 20, -16, 32, 4, 12],
  [52, 20, -8, 32, 4, 12],
];

/**
 * A legacy 64 by 32 skin in the 64 by 64 layout: the top half as it is, the left leg and left
 * arm mirrored from the right ones, the overlay areas of the bottom half left transparent.
 */
export function upgradeLegacySkin(image: RgbaImage): RgbaImage {
  const out: RgbaImage = { width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4) };
  out.data.set(image.data.subarray(0, 64 * 32 * 4));
  for (const [sx, sy, dx, dy, width, height] of LEGACY_LIMB_COPIES) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const colour = pixelAt(image, sx + x, sy + y);
        if (colour === null) continue;
        out.data.set(colour, ((sy + dy + y) * 64 + sx + dx + (width - 1 - x)) * 4);
      }
    }
  }
  return out;
}

/** Options of {@link convertPicture}. */
export interface ConvertOptions {
  crop: Rect;
  width: number;
  height: number;
  scale: ScaleMode;
  /** Cut away the background colour of the corners (0 turns it off). */
  backgroundTolerance: number;
  /** Reduce to at most this many colours (0 keeps them all). */
  colours: number;
}

/** The whole pipeline: crop, cut the background, scale, harden the alpha, reduce colours. */
export function convertPicture(image: RgbaImage, options: ConvertOptions): RgbaImage {
  const cropped = cropImage(image, options.crop);
  if (options.backgroundTolerance > 0) removeBackground(cropped, options.backgroundTolerance);
  const scaled =
    cropped.width === options.width && cropped.height === options.height
      ? cropped
      : resizeImage(cropped, options.width, options.height, options.scale);
  hardenAlpha(scaled);
  if (options.colours > 0) reduceColours(scaled, options.colours);
  return scaled;
}
