/**
 * Pixel editing for the texture editor (ADR 0047 D5): RGBA images, pencil and eraser,
 * flood fill, the palette of a texture and an undo history. Pure; the dialog decodes and
 * encodes PNGs with a canvas.
 *
 * @packageDocumentation
 */

/** An RGBA image: `data` holds `width * height * 4` bytes, row-major. */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** One colour as `[r, g, b, a]`, each 0 to 255. */
export type Rgba = readonly [number, number, number, number];

/** A copy of `image`. */
export function cloneImage(image: RgbaImage): RgbaImage {
  return { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
}

/** The colour at (x, y), or `null` outside the image. */
export function pixelAt(image: RgbaImage, x: number, y: number): Rgba | null {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return null;
  const at = (y * image.width + x) * 4;
  const d = image.data;
  return [d[at] ?? 0, d[at + 1] ?? 0, d[at + 2] ?? 0, d[at + 3] ?? 0];
}

/** Sets (x, y) to `colour`; returns whether anything changed. */
export function setPixel(image: RgbaImage, x: number, y: number, colour: Rgba): boolean {
  const current = pixelAt(image, x, y);
  if (current === null || current.every((value, index) => value === colour[index])) return false;
  image.data.set(colour, (y * image.width + x) * 4);
  return true;
}

/** Fills the 4-connected area of (x, y)'s colour with `colour`; returns the pixels changed. */
export function floodFill(image: RgbaImage, x: number, y: number, colour: Rgba): number {
  const target = pixelAt(image, x, y);
  if (target === null || target.every((value, index) => value === colour[index])) return 0;
  const same = (px: number, py: number): boolean => {
    const value = pixelAt(image, px, py);
    return value?.every((channel, index) => channel === target[index]) === true;
  };
  const stack: [number, number][] = [[x, y]];
  let changed = 0;
  while (stack.length > 0) {
    const [px, py] = stack.pop() as [number, number];
    if (!same(px, py)) continue;
    image.data.set(colour, (py * image.width + px) * 4);
    changed += 1;
    stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
  return changed;
}

/** `#rrggbb` of a colour (alpha dropped). */
export function toHex(colour: Rgba): string {
  return `#${colour
    .slice(0, 3)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** An opaque colour from `#rrggbb`, or `null`. */
export function fromHex(hex: string): Rgba | null {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (match === null) return null;
  return [
    Number.parseInt(match[1] as string, 16),
    Number.parseInt(match[2] as string, 16),
    Number.parseInt(match[3] as string, 16),
    255,
  ];
}

/** The opaque colours of `image`, most used first, at most `limit`. */
export function paletteOf(image: RgbaImage, limit = 24): Rgba[] {
  const counts = new Map<string, { colour: Rgba; count: number }>();
  for (let at = 0; at < image.data.length; at += 4) {
    if ((image.data[at + 3] ?? 0) === 0) continue;
    const colour: Rgba = [
      image.data[at] ?? 0,
      image.data[at + 1] ?? 0,
      image.data[at + 2] ?? 0,
      image.data[at + 3] ?? 0,
    ];
    const key = colour.join(',');
    const entry = counts.get(key);
    if (entry === undefined) counts.set(key, { colour, count: 1 });
    else entry.count += 1;
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.colour.join(',').localeCompare(b.colour.join(',')))
    .slice(0, limit)
    .map((entry) => entry.colour);
}

/** An undo history of whole images (textures are small). */
export class PixelHistory {
  #past: RgbaImage[] = [];
  #future: RgbaImage[] = [];
  readonly #limit: number;

  constructor(limit = 100) {
    this.#limit = limit;
  }

  /** Records the image before a change. */
  push(before: RgbaImage): void {
    this.#past.push(cloneImage(before));
    if (this.#past.length > this.#limit) this.#past.shift();
    this.#future = [];
  }

  get canUndo(): boolean {
    return this.#past.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  /** The image to show after undoing from `current`, or `null`. */
  undo(current: RgbaImage): RgbaImage | null {
    const previous = this.#past.pop();
    if (previous === undefined) return null;
    this.#future.push(cloneImage(current));
    return previous;
  }

  /** The image to show after redoing from `current`, or `null`. */
  redo(current: RgbaImage): RgbaImage | null {
    const next = this.#future.pop();
    if (next === undefined) return null;
    this.#past.push(cloneImage(current));
    return next;
  }
}
