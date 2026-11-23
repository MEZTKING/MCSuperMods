/**
 * Folding of duplicates (ADR 0124 D6): entries with the same action are one result. A Home tile
 * that opens one flow, the flow itself and a Showcase card that makes it carry the same action
 * descriptor, so they fold, whatever their ids. The group keeps its best score and shows the
 * member whose source comes first in {@link SOURCE_ORDER} (the flow before its tile and card);
 * the others are named in its `why` list. A tile with a chooser has its own action and stays a
 * result of its own. Pure.
 */

import type { SearchHit } from '../types';
import { SOURCE_ORDER } from './weights';

const RANK = new Map(SOURCE_ORDER.map((source, i) => [source, i]));

function sourceRank(hit: SearchHit): number {
  return RANK.get(hit.entry.source) ?? SOURCE_ORDER.length;
}

/**
 * Folds hits that are already in ranking order. Only the first `window` hits are compared (the
 * ones that can be shown); the rest follow unfolded, in order. `keyOf` gives a hit's action key.
 */
export function foldHits(
  hits: readonly SearchHit[],
  keyOf: (hit: SearchHit) => string,
  window: number = hits.length,
): SearchHit[] {
  const groups = new Map<string, SearchHit[]>();
  const order: string[] = [];
  const head = hits.slice(0, Math.max(0, window));
  for (const hit of head) {
    const key = keyOf(hit);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [hit]);
      order.push(key);
    } else group.push(hit);
  }
  const out: SearchHit[] = [];
  for (const key of order) {
    const group = groups.get(key) as SearchHit[];
    const top = group[0] as SearchHit;
    if (group.length === 1) {
      out.push(top);
      continue;
    }
    let shown = top;
    for (const hit of group) if (sourceRank(hit) < sourceRank(shown)) shown = hit;
    const others = group.filter((hit) => hit !== shown).map((hit) => `folded ${hit.entry.id}`);
    const answers = shown.answers ?? group.find((hit) => hit.answers !== undefined)?.answers;
    const behaviour =
      shown.behaviour ?? group.find((hit) => hit.behaviour !== undefined)?.behaviour;
    out.push({
      entry: shown.entry,
      score: top.score,
      ...(answers !== undefined ? { answers } : {}),
      ...(behaviour !== undefined ? { behaviour } : {}),
      why: [...shown.why, ...others],
    });
  }
  return [...out, ...hits.slice(head.length)];
}
