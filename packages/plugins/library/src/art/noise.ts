/**
 * Seeded randomness and clustered noise for the vanilla-style generator (ADR 0092, Proposed).
 * Vanilla block textures are not uniform random: their shades sit in small blobs of two to
 * four pixels. {@link clusteredField} makes such blobs by blurring white noise on a wrapping
 * grid (so block textures tile) and ranking the result, and {@link quantise} turns the ranks
 * into shade indices in chosen proportions.
 *
 * @packageDocumentation
 */

/** A 32-bit FNV-1a hash of the parts, for seeding. */
export function hashSeed(...parts: readonly (string | number)[]): number {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    const text = `${String(part)}|`;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash >>> 0;
}

/** A seeded generator of numbers in [0, 1) (mulberry32). */
export function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Options for {@link clusteredField}. */
export interface FieldOptions {
  /** Box-blur passes across x (more means wider blobs); defaults to 1. */
  readonly blurX?: number;
  /** Box-blur passes down y; defaults to `blurX`. */
  readonly blurY?: number;
  /** Whether the edges wrap round so the texture tiles; defaults to true. */
  readonly wrap?: boolean;
}

/**
 * A `width` by `height` field of ranks in [0, 1] (every value distinct, evenly spread) made of
 * blurred white noise, so neighbouring pixels have close ranks and the shades cluster.
 */
export function clusteredField(
  width: number,
  height: number,
  seed: number,
  options: FieldOptions = {},
): Float64Array {
  const random = rng(seed);
  let field = new Float64Array(width * height);
  for (let i = 0; i < field.length; i += 1) field[i] = random();
  const wrap = options.wrap ?? true;
  const at = (src: Float64Array, x: number, y: number): number => {
    let xx = x;
    let yy = y;
    if (wrap) {
      xx = (x + width) % width;
      yy = (y + height) % height;
    } else {
      xx = Math.max(0, Math.min(width - 1, x));
      yy = Math.max(0, Math.min(height - 1, y));
    }
    return src[yy * width + xx] ?? 0;
  };
  const blur = (passes: number, dx: number, dy: number): void => {
    for (let pass = 0; pass < passes; pass += 1) {
      const next = new Float64Array(field.length);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          next[y * width + x] =
            (at(field, x - dx, y - dy) + 2 * at(field, x, y) + at(field, x + dx, y + dy)) / 4;
        }
      }
      field = next;
    }
  };
  blur(options.blurX ?? 1, 1, 0);
  blur(options.blurY ?? options.blurX ?? 1, 0, 1);
  // Rank so the proportions of quantise() are exact whatever the blur did to the spread.
  const order = [...field.keys()].sort((a, b) => (field[a] ?? 0) - (field[b] ?? 0) || a - b);
  const ranks = new Float64Array(field.length);
  order.forEach((index, rank) => {
    ranks[index] = field.length > 1 ? rank / (field.length - 1) : 0;
  });
  return ranks;
}

/**
 * Shade indices from ranks: the lowest `proportions[0]` share of the field gets 0, the next
 * `proportions[1]` gets 1 and so on (the proportions are normalised to sum to 1).
 */
export function quantise(field: Float64Array, proportions: readonly number[]): Uint8Array {
  const total = proportions.reduce((sum, value) => sum + value, 0) || 1;
  const limits: number[] = [];
  let running = 0;
  for (const value of proportions) {
    running += value / total;
    limits.push(running);
  }
  const out = new Uint8Array(field.length);
  for (let i = 0; i < field.length; i += 1) {
    const value = field[i] ?? 0;
    let index = limits.findIndex((limit) => value <= limit + 1e-9);
    if (index < 0) index = limits.length - 1;
    out[i] = index;
  }
  return out;
}
