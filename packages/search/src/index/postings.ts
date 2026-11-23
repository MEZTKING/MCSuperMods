/**
 * A segment: an immutable block of postings over some entries (ADR 0124 D3). Terms are keyed by
 * number; postings and titles sit in typed arrays (B650: typed arrays keep a 5,000-thing mod
 * within the memory budget). Each posting keeps the term's count in every field, and each entry
 * its field lengths, so BM25F is weighed at query time against the whole index's statistics: a
 * segment's numbers never depend on any other segment, and a patched layer scores exactly as a
 * rebuilt one.
 *
 * Removing an entry clears its live flag; the layer rebuilds its segments when too many are dead.
 */

import { FIELD_COUNT } from '../rank/weights';
import type { SearchEntry } from '../types';
import type { PreparedEntry } from './entry';

/** The largest count kept per field and posting, and per field and entry length. */
const MAX_TF = 255;
const MAX_LENGTH = 65535;
const MAX_NAME = 255;

export interface Segment {
  /** Entries in the segment, by local number. */
  readonly entries: readonly SearchEntry[];
  /** Term to term number, and term number to term. */
  readonly terms: ReadonlyMap<string, number>;
  readonly termList: readonly string[];
  /** Postings of term `t` are `starts[t]` to `starts[t + 1]` (exclusive). */
  readonly starts: Uint32Array;
  /** Local entry number of each posting. */
  readonly docs: Uint32Array;
  /** Field counts: posting `p`, field `f` at `p * FIELD_COUNT + f`. */
  readonly tfs: Uint8Array;
  /** Field lengths: entry `d`, field `f` at `d * FIELD_COUNT + f`. */
  readonly lengths: Uint16Array;
  /** Title words of entry `d` (term numbers, stop words left out): `titleStarts[d]` to `[d + 1]`. */
  readonly titleStarts: Uint32Array;
  readonly titleTerms: Uint32Array;
  /** How many of the title words are the name before a colon (0: no such name). */
  readonly nameLengths: Uint8Array;
  /** 1 while the entry is live, 0 once removed. */
  readonly live: Uint8Array;
  /** Where the segment's entries start in the index's global numbering (set by the index). */
  base: number;
}

/** Builds a segment from prepared entries. */
export function buildSegment(prepared: readonly PreparedEntry[]): Segment {
  const size = prepared.length;
  const terms = new Map<string, number>();
  const termList: string[] = [];
  const lengths = new Uint16Array(size * FIELD_COUNT);
  let occurrences = 0;
  for (const p of prepared) for (const words of p.fields) occurrences += words.length;
  // Pass 1: number the terms, remember each occurrence's term, count the entries of each term.
  const occurrence = new Uint32Array(occurrences);
  const counts: number[] = [];
  const lastDoc: number[] = [];
  let o = 0;
  for (let d = 0; d < size; d++) {
    const fields = (prepared[d] as PreparedEntry).fields;
    for (let f = 0; f < FIELD_COUNT; f++) {
      const words = fields[f] as readonly string[];
      lengths[d * FIELD_COUNT + f] = Math.min(MAX_LENGTH, words.length);
      for (const word of words) {
        let t = terms.get(word);
        if (t === undefined) {
          t = termList.length;
          terms.set(word, t);
          termList.push(word);
          counts.push(0);
          lastDoc.push(-1);
        }
        occurrence[o++] = t;
        if (lastDoc[t] !== d) {
          lastDoc[t] = d;
          counts[t] = (counts[t] as number) + 1;
        }
      }
    }
  }
  const starts = new Uint32Array(counts.length + 1);
  for (let t = 0; t < counts.length; t++) {
    starts[t + 1] = (starts[t] as number) + (counts[t] as number);
  }
  const total = starts[counts.length] as number;
  const docs = new Uint32Array(total);
  const tfs = new Uint8Array(total * FIELD_COUNT);
  // Pass 2: fill the postings, entries in increasing order within each term.
  const cursor = Uint32Array.from(starts.subarray(0, counts.length));
  lastDoc.fill(-1);
  o = 0;
  for (let d = 0; d < size; d++) {
    for (let f = 0; f < FIELD_COUNT; f++) {
      const words = (prepared[d] as PreparedEntry).fields[f] as readonly string[];
      for (let k = 0; k < words.length; k++) {
        const t = occurrence[o++] as number;
        if (lastDoc[t] !== d) {
          lastDoc[t] = d;
          docs[cursor[t] as number] = d;
          cursor[t] = (cursor[t] as number) + 1;
        }
        const slot = ((cursor[t] as number) - 1) * FIELD_COUNT + f;
        if ((tfs[slot] as number) < MAX_TF) tfs[slot] = (tfs[slot] as number) + 1;
      }
    }
  }
  // Titles as term numbers.
  const titleStarts = new Uint32Array(size + 1);
  for (let d = 0; d < size; d++) {
    titleStarts[d + 1] = (titleStarts[d] as number) + (prepared[d] as PreparedEntry).title.length;
  }
  const titleTerms = new Uint32Array(titleStarts[size] as number);
  const nameLengths = new Uint8Array(size);
  for (let d = 0; d < size; d++) {
    const p = prepared[d] as PreparedEntry;
    let at = titleStarts[d] as number;
    for (const word of p.title) titleTerms[at++] = terms.get(word) as number;
    nameLengths[d] = Math.min(MAX_NAME, p.name?.length ?? 0);
  }
  return {
    entries: prepared.map((p) => p.entry),
    terms,
    termList,
    starts,
    docs,
    tfs,
    lengths,
    titleStarts,
    titleTerms,
    nameLengths,
    live: new Uint8Array(size).fill(1),
    base: 0,
  };
}

/** The title words of an entry. */
export function titleOf(segment: Segment, doc: number): string[] {
  const out: string[] = [];
  const end = segment.titleStarts[doc + 1] as number;
  for (let i = segment.titleStarts[doc] as number; i < end; i++) {
    out.push(segment.termList[segment.titleTerms[i] as number] as string);
  }
  return out;
}

/** The bytes a segment's typed arrays take (for the memory report). */
export function segmentBytes(segment: Segment): number {
  return (
    segment.lengths.byteLength +
    segment.live.byteLength +
    segment.starts.byteLength +
    segment.docs.byteLength +
    segment.tfs.byteLength +
    segment.titleStarts.byteLength +
    segment.titleTerms.byteLength +
    segment.nameLengths.byteLength
  );
}
