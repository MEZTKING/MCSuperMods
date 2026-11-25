/**
 * Registries: matched by member overlap, then members added and removed per matched pair.
 *
 * Registries are matched by the overlap of their members (Jaccard), one to one, best first,
 * the same name winning ties (B810 V7): 26.3 reused the name `worldgen/feature` for configured
 * features while the old `worldgen/feature` became `worldgen/feature_type`, so matching by
 * name alone reports dozens of removals where there are two renames. A registry matched to
 * one of another name is "moved": its ids mean what they meant.
 *
 * @packageDocumentation
 */

import { compareCodePoints } from '../shared/download.ts';
import { makeChange, round2, sortedStrings } from './change.ts';
import type { TargetAddition, TargetChange } from './types.ts';

/** `registries.json`: registry name (no namespace) to its member ids (no namespace). */
export type Registries = Record<string, string[]>;

/** A matched pair of registries. */
export interface RegistryPair {
  /** The older target's registry name. */
  from: string;
  /** The newer target's registry name. */
  to: string;
  /** Member overlap (Jaccard), two decimals. */
  overlap: number;
}

/** Below this overlap, registries of different names are never matched. */
export const MOVE_THRESHOLD = 0.5;
/** The bonus a same-name pair gets, so it wins a tie. */
const SAME_NAME_BONUS = 0.05;

/** Jaccard overlap of two sets; 0 for two empty sets (no evidence either way). */
export function jaccard(x: ReadonlySet<string>, y: ReadonlySet<string>): number {
  let inter = 0;
  for (const v of x) if (y.has(v)) inter++;
  const union = x.size + y.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Matches the registries of two targets one to one by member overlap. Every pair with some
 * overlap (or the same name) is ranked by overlap, a same-name pair ranked a little higher;
 * pairs are taken best first while neither side is taken. Pairs of different names need at
 * least {@link MOVE_THRESHOLD}. Sorted by the older name.
 */
export function pairRegistries(before: Registries, after: Registries): RegistryPair[] {
  const setsA = new Map(Object.entries(before).map(([k, v]) => [k, new Set(v)]));
  const setsB = new Map(Object.entries(after).map(([k, v]) => [k, new Set(v)]));
  // Member -> newer registries holding it, so only overlapping pairs are scored.
  const holders = new Map<string, Set<string>>();
  for (const [name, members] of setsB) {
    for (const m of members) {
      let set = holders.get(m);
      if (set === undefined) {
        set = new Set();
        holders.set(m, set);
      }
      set.add(name);
    }
  }
  const scored: { a: string; b: string; overlap: number; rank: number }[] = [];
  for (const [a, membersA] of setsA) {
    const partners = new Set<string>();
    for (const m of membersA) for (const b of holders.get(m) ?? []) partners.add(b);
    if (setsB.has(a)) partners.add(a);
    for (const b of partners) {
      const overlap = jaccard(membersA, setsB.get(b) as Set<string>);
      const same = a === b;
      if (!same && overlap < MOVE_THRESHOLD) continue;
      scored.push({ a, b, overlap, rank: overlap + (same ? SAME_NAME_BONUS : 0) });
    }
  }
  scored.sort(
    (x, y) => y.rank - x.rank || compareCodePoints(x.a, y.a) || compareCodePoints(x.b, y.b),
  );
  const takenA = new Set<string>();
  const takenB = new Set<string>();
  const pairs: RegistryPair[] = [];
  for (const { a, b, overlap } of scored) {
    if (takenA.has(a) || takenB.has(b)) continue;
    takenA.add(a);
    takenB.add(b);
    pairs.push({ from: a, to: b, overlap: round2(overlap) });
  }
  return pairs.sort((x, y) => compareCodePoints(x.from, y.from));
}

/** The registry part of a diff. */
export interface RegistryDiff {
  pairs: RegistryPair[];
  changes: TargetChange[];
  additions: TargetAddition[];
  /** Per matched pair (keyed by the older name): the members removed and added, sorted. */
  members: Map<string, { pair: RegistryPair; removed: string[]; added: string[] }>;
}

/** Diffs two targets' `registries.json`. */
export function diffRegistries(before: Registries, after: Registries): RegistryDiff {
  const pairs = pairRegistries(before, after);
  const changes: TargetChange[] = [];
  const additions: TargetAddition[] = [];
  const members: RegistryDiff['members'] = new Map();
  const holders = new Map<string, string[]>();
  for (const name of sortedStrings(Object.keys(after))) {
    for (const m of after[name] ?? []) {
      const list = holders.get(m);
      if (list === undefined) holders.set(m, [name]);
      else list.push(name);
    }
  }
  const removedChange = (registry: string, id: string): TargetChange => {
    const stillIn = holders.get(id);
    return makeChange({
      area: 'ids',
      what: 'member-removed',
      registry,
      subject: `${registry}/${id}`,
      from: id,
      ...(stillIn === undefined ? {} : { stillIn: [...stillIn] }),
      handling: 'manual',
      source: 'registries',
    });
  };
  const addedChange = (registry: string, id: string): TargetAddition => ({
    id: `ids:${registry}/${id}`,
    area: 'ids',
    what: 'member-added',
    registry,
    subject: `${registry}/${id}`,
    source: 'registries',
  });

  const pairedA = new Set(pairs.map((p) => p.from));
  const pairedB = new Set(pairs.map((p) => p.to));
  for (const pair of pairs) {
    const a = new Set(before[pair.from]);
    const b = new Set(after[pair.to]);
    const removed = sortedStrings([...a].filter((m) => !b.has(m)));
    const added = sortedStrings([...b].filter((m) => !a.has(m)));
    members.set(pair.from, { pair, removed, added });
    if (pair.from !== pair.to) {
      changes.push(
        makeChange({
          area: 'ids',
          what: 'registry-moved',
          subject: pair.from,
          from: pair.from,
          to: pair.to,
          handling: 'none',
          source: 'registries',
        }),
      );
    }
    for (const id of removed) changes.push(removedChange(pair.from, id));
    for (const id of added) additions.push(addedChange(pair.to, id));
  }
  for (const name of sortedStrings(Object.keys(before))) {
    // A registry gone with no successor: each of its members is removed (the plugin API has no
    // registry-level removal).
    if (pairedA.has(name)) continue;
    for (const id of sortedStrings(before[name] ?? [])) changes.push(removedChange(name, id));
  }
  for (const name of sortedStrings(Object.keys(after))) {
    if (pairedB.has(name)) continue;
    additions.push({
      id: `ids:${name}`,
      area: 'ids',
      what: 'registry-added',
      subject: name,
      source: 'registries',
    });
    for (const id of sortedStrings(after[name] ?? [])) additions.push(addedChange(name, id));
  }
  return { pairs, changes, additions, members };
}
