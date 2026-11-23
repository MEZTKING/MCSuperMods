/**
 * BM25F over the layers (ADR 0124 D6), weighed at query time. A query term reaches a set of
 * index words (its stem class, its vocabulary group, a typo correction); their field-weighted,
 * length-normalised counts are summed per entry and saturated once, with the inverse document
 * frequency of the set over the whole index (static, vanilla and project together). Statistics
 * (entries, mean field lengths) are the whole index's, so an entry scores the same whichever
 * layer or segment holds it, and a patched layer scores exactly as a rebuilt one.
 */

import type { Layer } from '../index/layer';
import type { Segment } from '../index/postings';
import { FIELD_B, FIELD_COUNT, FIELD_WEIGHT, FIELDS, K1 } from './weights';

/** The index as one collection: every segment numbered into one global range. */
export interface Collection {
  readonly segments: readonly Segment[];
  /** Global numbers in use (dead entries included). */
  readonly slots: number;
  /** Live entries. */
  readonly docs: number;
  /** Per field: `1 - b`, `b / mean length` and the field weight. */
  readonly a: Float64Array;
  readonly c: Float64Array;
  readonly w: Float64Array;
}

/** Numbers the segments of the layers (in the order given) and sums their statistics. */
export function createCollection(layers: readonly Layer[]): Collection {
  const segments: Segment[] = [];
  let slots = 0;
  let docs = 0;
  const sums = new Float64Array(FIELD_COUNT);
  for (const layer of layers) {
    docs += layer.live;
    for (let f = 0; f < FIELD_COUNT; f++)
      sums[f] = (sums[f] as number) + (layer.lengthSums[f] as number);
    for (const segment of layer.segments) {
      segment.base = slots;
      slots += segment.entries.length;
      segments.push(segment);
    }
  }
  const a = new Float64Array(FIELD_COUNT);
  const c = new Float64Array(FIELD_COUNT);
  const w = new Float64Array(FIELD_COUNT);
  FIELDS.forEach((field, f) => {
    const mean = Math.max(1, docs === 0 ? 1 : (sums[f] as number) / docs);
    a[f] = 1 - FIELD_B[field];
    c[f] = FIELD_B[field] / mean;
    w[f] = FIELD_WEIGHT[field];
  });
  return { segments, slots, docs, a, c, w };
}

/** BM25's inverse document frequency (never below zero). */
export function idf(df: number, docs: number): number {
  return Math.log(1 + (docs - df + 0.5) / (df + 0.5));
}

/** BM25's saturation of a weighted count. */
export function saturate(tt: number): number {
  return (tt * (K1 + 1)) / (K1 + tt);
}

/**
 * Adds the weighted, normalised counts of the index words `surfaces` into `tt` by global number,
 * listing in `touched` each number it reaches for the first time (`tt` is zero there before).
 */
export function accumulate(
  collection: Collection,
  surfaces: readonly string[],
  tt: Float64Array,
  touched: number[],
): void {
  const { a, c, w } = collection;
  for (const segment of collection.segments) {
    const { terms, starts, docs, tfs, lengths, live, base } = segment;
    for (const surface of surfaces) {
      const t = terms.get(surface);
      if (t === undefined) continue;
      const end = starts[t + 1] as number;
      for (let p = starts[t] as number; p < end; p++) {
        const d = docs[p] as number;
        if (live[d] === 0) continue;
        let v = 0;
        const row = p * FIELD_COUNT;
        const lrow = d * FIELD_COUNT;
        for (let f = 0; f < FIELD_COUNT; f++) {
          const tf = tfs[row + f] as number;
          if (tf === 0) continue;
          v +=
            ((w[f] as number) * tf) /
            ((a[f] as number) + (c[f] as number) * (lengths[lrow + f] as number));
        }
        const g = base + d;
        if (tt[g] === 0) touched.push(g);
        tt[g] = (tt[g] as number) + v;
      }
    }
  }
}

/** The entry at a global number, and its segment and local number. */
export function locate(
  collection: Collection,
  global: number,
): { segment: Segment; doc: number } | undefined {
  const segments = collection.segments;
  let lo = 0;
  let hi = segments.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const segment = segments[mid] as Segment;
    if (global < segment.base) hi = mid - 1;
    else if (global >= segment.base + segment.entries.length) lo = mid + 1;
    else return { segment, doc: global - segment.base };
  }
  return undefined;
}
