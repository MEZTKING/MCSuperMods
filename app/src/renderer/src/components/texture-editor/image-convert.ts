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

/** Quarter turns clockwise. */
export type Rotation = 0 | 90 | 180 | 270;

/** `image` turned clockwise by `rotation` and mirrored. */
export function transformImage(
  image: RgbaImage,
  rotation: Rotation,
  flipX: boolean,
  flipY: boolean,
): RgbaImage {
  if (rotation === 0 && !flipX && !flipY) return image;
  const turned = rotation === 90 || rotation === 270;
  const width = turned ? image.height : image.width;
  const height = turned ? image.width : image.height;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // Undo the flips (applied after the turn), then the turn, to find the source pixel.
      const fx = flipX ? width - 1 - x : x;
      const fy = flipY ? height - 1 - y : y;
      let sx = fx;
      let sy = fy;
      if (rotation === 90) {
        sx = fy;
        sy = image.height - 1 - fx;
      } else if (rotation === 180) {
        sx = image.width - 1 - fx;
        sy = image.height - 1 - fy;
      } else if (rotation === 270) {
        sx = image.width - 1 - fy;
        sy = fx;
      }
      const from = (sy * image.width + sx) * 4;
      data.set(image.data.subarray(from, from + 4), (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

/**
 * `image` scaled to fit inside `width` by `height` keeping its proportions, centred on a
 * transparent picture of that size.
 */
export function fitInside(
  image: RgbaImage,
  width: number,
  height: number,
  mode: ScaleMode,
): RgbaImage {
  const scale = Math.min(width / image.width, height / image.height);
  const w = Math.max(1, Math.min(width, Math.round(image.width * scale)));
  const h = Math.max(1, Math.min(height, Math.round(image.height * scale)));
  const scaled = w === image.width && h === image.height ? image : resizeImage(image, w, h, mode);
  const data = new Uint8ClampedArray(width * height * 4);
  const ox = Math.floor((width - w) / 2);
  const oy = Math.floor((height - h) / 2);
  for (let y = 0; y < h; y += 1) {
    data.set(scaled.data.subarray(y * w * 4, (y + 1) * w * 4), ((oy + y) * width + ox) * 4);
  }
  return { width, height, data };
}

/** Colour adjustments, each 0 for no change. */
export interface ColourAdjust {
  /** -100 (black) to 100 (white). */
  brightness: number;
  /** -100 (flat grey) to 100 (twice the contrast). */
  contrast: number;
  /** -100 (grey) to 100 (twice as colourful). */
  saturation: number;
  /** Hue turn in degrees, -180 to 180. */
  hue: number;
}

/** Applies brightness, contrast, saturation and a hue turn to every visible pixel. */
export function adjustColours(image: RgbaImage, adjust: ColourAdjust): void {
  const { brightness, contrast, saturation, hue } = adjust;
  if (brightness === 0 && contrast === 0 && saturation === 0 && hue === 0) return;
  const c = 1 + contrast / 100;
  const sat = 1 + saturation / 100;
  const b = (brightness / 100) * 255;
  // Hue rotation matrix in RGB space (luminance-preserving).
  const angle = (hue * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const m = [
    0.213 + cos * 0.787 - sin * 0.213,
    0.715 - cos * 0.715 - sin * 0.715,
    0.072 - cos * 0.072 + sin * 0.928,
    0.213 - cos * 0.213 + sin * 0.143,
    0.715 + cos * 0.285 + sin * 0.14,
    0.072 - cos * 0.072 - sin * 0.283,
    0.213 - cos * 0.213 - sin * 0.787,
    0.715 - cos * 0.715 + sin * 0.715,
    0.072 + cos * 0.928 + sin * 0.072,
  ] as const;
  const d = image.data;
  for (let at = 0; at < d.length; at += 4) {
    if ((d[at + 3] ?? 0) === 0) continue;
    let r = d[at] ?? 0;
    let g = d[at + 1] ?? 0;
    let bl = d[at + 2] ?? 0;
    if (hue !== 0) {
      const nr = r * m[0] + g * m[1] + bl * m[2];
      const ng = r * m[3] + g * m[4] + bl * m[5];
      const nb = r * m[6] + g * m[7] + bl * m[8];
      r = nr;
      g = ng;
      bl = nb;
    }
    if (saturation !== 0) {
      const grey = 0.299 * r + 0.587 * g + 0.114 * bl;
      r = grey + (r - grey) * sat;
      g = grey + (g - grey) * sat;
      bl = grey + (bl - grey) * sat;
    }
    if (contrast !== 0) {
      r = (r - 128) * c + 128;
      g = (g - 128) * c + 128;
      bl = (bl - 128) * c + 128;
    }
    d[at] = r + b;
    d[at + 1] = g + b;
    d[at + 2] = bl + b;
  }
}

/**
 * Draws a one-pixel outline in `colour` on the transparent pixels next to (left, right, up,
 * down) a visible one, so the shape stands out like vanilla item textures.
 */
export function addOutline(image: RgbaImage, colour: Rgba): void {
  const { width, height } = image;
  const solid = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && (image.data[(y * width + x) * 4 + 3] ?? 0) > 0;
  const edge: number[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) {
        edge.push((y * width + x) * 4);
      }
    }
  }
  for (const at of edge) image.data.set(colour, at);
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
  /** Quarter turns and mirroring, applied to the crop. */
  rotation?: Rotation;
  flipX?: boolean;
  flipY?: boolean;
  /** `fill` (the default) stretches the crop over the texture; `fit` keeps its proportions. */
  fit?: 'fill' | 'fit';
  /** Colour adjustments after scaling. */
  adjust?: ColourAdjust;
  /** A one-pixel outline colour, or none. */
  outline?: Rgba | null;
}

/**
 * The whole pipeline: crop, cut the background, turn and mirror, scale (fill or fit), harden
 * the alpha, adjust the colours, reduce them, outline.
 */
export function convertPicture(image: RgbaImage, options: ConvertOptions): RgbaImage {
  const cropped = cropImage(image, options.crop);
  if (options.backgroundTolerance > 0) removeBackground(cropped, options.backgroundTolerance);
  const turned = transformImage(
    cropped,
    options.rotation ?? 0,
    options.flipX ?? false,
    options.flipY ?? false,
  );
  const scaled =
    options.fit === 'fit'
      ? fitInside(turned, options.width, options.height, options.scale)
      : turned.width === options.width && turned.height === options.height
        ? turned
        : resizeImage(turned, options.width, options.height, options.scale);
  hardenAlpha(scaled);
  if (options.adjust !== undefined) adjustColours(scaled, options.adjust);
  if (options.colours > 0) reduceColours(scaled, options.colours);
  if (options.outline !== undefined && options.outline !== null)
    addOutline(scaled, options.outline);
  return scaled;
}
