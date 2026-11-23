/**
 * Layers (ADR 0124 D3): static, vanilla and project, each a list of segments. A layer is built
 * (`set`), replaced (`set` again) and patched by deltas (`patch`: entries added or replaced and
 * ids removed). A patch clears the live flag of the old entries and adds one small segment; when
 * a layer has too many segments or too many dead entries it is rebuilt as one. The words a layer
 * holds are counted per entry, exactly, for the dictionary and the typo index. A layer knows
 * nothing of the others: the index's statistics are summed at query time.
 */

import { FIELD_COUNT } from '../rank/weights';
import type { SearchEntry } from '../types';
import { distinctWords, isPlainWord, type PreparedEntry, prepareEntry } from './entry';
import { buildSegment, type Segment, segmentBytes } from './postings';

/** A layer is rebuilt as one segment beyond this many segments ... */
export const MAX_SEGMENTS = 8;
/** ... or when more than this share of its entries are dead. */
export const MAX_DEAD_SHARE = 0.25;

/** Where an entry lives. */
export interface Slot {
  readonly segment: Segment;
  readonly doc: number;
}

/** Entries per segment at most (a packed slot is `segment * DOCS + doc`). */
const DOCS = 2 ** 21;

export interface Layer {
  readonly name: string;
  readonly segments: Segment[];
  /** Live entries by id: the segment's index in {@link segments} times 2^21, plus the entry. */
  readonly byId: Map<string, number>;
  /** Plain words of the live entries, with the number of entries holding each. */
  readonly words: Map<string, number>;
  /** Sum of the live entries' lengths per field. */
  readonly lengthSums: Float64Array;
  /** Live entries. */
  live: number;
  /** Dead entries still in segments. */
  dead: number;
  /** Bumped on every change. */
  version: number;
}

export function createLayer(name: string): Layer {
  return {
    name,
    segments: [],
    byId: new Map(),
    words: new Map(),
    lengthSums: new Float64Array(FIELD_COUNT),
    live: 0,
    dead: 0,
    version: 0,
  };
}

function validEntry(entry: unknown): entry is SearchEntry {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    typeof (entry as SearchEntry).id === 'string' &&
    (entry as SearchEntry).id !== ''
  );
}

/** The entries in order of first appearance, the last of each id winning. */
function distinctById(entries: readonly SearchEntry[]): SearchEntry[] {
  const byId = new Map<string, SearchEntry>();
  if (!Array.isArray(entries)) return [];
  for (const entry of entries) {
    if (validEntry(entry)) byId.set(entry.id, entry);
  }
  return [...byId.values()];
}

function uncountWords(layer: Layer, prepared: PreparedEntry): void {
  for (const word of distinctWords(prepared)) {
    const n = (layer.words.get(word) ?? 0) - 1;
    if (n > 0) layer.words.set(word, n);
    else layer.words.delete(word);
  }
}

/** Where the live entry with this id is, if the layer holds it. */
export function slotOf(layer: Layer, id: string): Slot | undefined {
  const packed = layer.byId.get(id);
  if (packed === undefined) return undefined;
  const segment = layer.segments[Math.floor(packed / DOCS)];
  return segment === undefined ? undefined : { segment, doc: packed % DOCS };
}

function addSegment(layer: Layer, prepared: readonly PreparedEntry[]): void {
  for (let from = 0; from < prepared.length; from += DOCS) {
    const part = prepared.slice(from, from + DOCS);
    const segment = buildSegment(part);
    const at = layer.segments.length * DOCS;
    layer.segments.push(segment);
    part.forEach((p, doc) => {
      layer.byId.set(p.entry.id, at + doc);
      for (let f = 0; f < FIELD_COUNT; f++) {
        layer.lengthSums[f] =
          (layer.lengthSums[f] as number) + (segment.lengths[doc * FIELD_COUNT + f] as number);
      }
    });
    // Every entry of a new segment is live: a term's postings are the entries that hold it.
    segment.termList.forEach((word, t) => {
      if (!isPlainWord(word)) return;
      const n = (segment.starts[t + 1] as number) - (segment.starts[t] as number);
      layer.words.set(word, (layer.words.get(word) ?? 0) + n);
    });
    layer.live += part.length;
  }
}

function removeOne(layer: Layer, id: string): void {
  const slot = slotOf(layer, id);
  if (slot === undefined) return;
  const { segment, doc } = slot;
  segment.live[doc] = 0;
  layer.byId.delete(id);
  uncountWords(layer, prepareEntry(segment.entries[doc] as SearchEntry));
  for (let f = 0; f < FIELD_COUNT; f++) {
    layer.lengthSums[f] =
      (layer.lengthSums[f] as number) - (segment.lengths[doc * FIELD_COUNT + f] as number);
  }
  layer.live--;
  layer.dead++;
}

function clear(layer: Layer): void {
  layer.segments.length = 0;
  layer.byId.clear();
  layer.words.clear();
  layer.lengthSums.fill(0);
  layer.live = 0;
  layer.dead = 0;
}

/** Replaces a layer's entries. */
export function setLayerEntries(layer: Layer, entries: readonly SearchEntry[]): void {
  clear(layer);
  addSegment(layer, distinctById(entries).map(prepareEntry));
  layer.version++;
}

/** Patches a layer: `upserts` added or replacing entries of the same id, `removes` taken out. */
export function patchLayerEntries(
  layer: Layer,
  upserts: readonly SearchEntry[],
  removes: readonly string[],
): void {
  const added = distinctById(upserts);
  if (Array.isArray(removes)) {
    for (const id of removes) if (typeof id === 'string') removeOne(layer, id);
  }
  for (const entry of added) removeOne(layer, entry.id);
  addSegment(layer, added.map(prepareEntry));
  const total = layer.live + layer.dead;
  if (layer.segments.length > MAX_SEGMENTS || (total > 0 && layer.dead / total > MAX_DEAD_SHARE)) {
    compact(layer);
  }
  layer.version++;
}

/** Rebuilds a layer as one segment of its live entries, in their present order. */
export function compact(layer: Layer): void {
  const entries: SearchEntry[] = [];
  for (const segment of layer.segments) {
    segment.entries.forEach((entry, doc) => {
      if (segment.live[doc] === 1) entries.push(entry);
    });
  }
  clear(layer);
  addSegment(layer, entries.map(prepareEntry));
}

/** The bytes a layer's typed arrays take (for the memory report). */
export function layerBytes(layer: Layer): number {
  return layer.segments.reduce((sum, segment) => sum + segmentBytes(segment), 0);
}
