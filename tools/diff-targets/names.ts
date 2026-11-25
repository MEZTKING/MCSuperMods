/**
 * Name likeness for rename and field-move candidates (B810 V7): stemmed token overlap, a bonus
 * for the same folder and for one name containing the other.
 *
 * @packageDocumentation
 */

import { jaccard } from './registries.ts';

/** A crude stem: `freezing` and `freeze` both become `freez`. */
export function stem(word: string): string {
  return word.replace(/(ing|ed|es|s)$/, '').replace(/e$/, '');
}

/** The stemmed tokens of an id or field name. */
export function tokens(id: string): Set<string> {
  return new Set(
    id
      .split(/[_/.-]+/)
      .filter(Boolean)
      .map(stem),
  );
}

/** How alike two names are, from 0 to 1. */
export function nameScore(a: string, b: string): number {
  let score = jaccard(tokens(a), tokens(b));
  const partsA = a.split('/');
  const partsB = b.split('/');
  // The same folder (textures, models).
  if (partsA.length > 1 && partsA.slice(0, -1).join('/') === partsB.slice(0, -1).join('/')) {
    score += 0.1;
  }
  // One name contains the other (cache_once and cache).
  const lastA = partsA.at(-1) as string;
  const lastB = partsB.at(-1) as string;
  if (lastA.includes(lastB) || lastB.includes(lastA)) score += 0.25;
  return Math.min(1, score);
}
