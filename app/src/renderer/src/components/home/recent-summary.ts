/**
 * What a Your mods card shows besides the name (ADR 0128 D4): the mod's picture and thing count
 * read from main (`project.recentSummary`) once per mod and time it was opened, cached for the
 * session, and "last opened" in words. Pure but for the cache; no DOM.
 *
 * @packageDocumentation
 */

import type { RecentProjectSummary } from '../../../../shared/platform';
import { imageDataUrl } from '../texture-editor/png-canvas';

/** A card's summary: the picture as a `data:` URL (or `null`) and the thing count. */
export interface RecentCardSummary {
  readonly things: number;
  readonly picture: string | null;
}

const cache = new Map<string, Promise<RecentCardSummary>>();

/** Forgets every summary (tests, and a mod opened again reads afresh by its new time). */
export function clearRecentSummaries(): void {
  cache.clear();
}

/**
 * The summary of the mod in `root` last opened at `openedAt`, read once with `read` and kept
 * (a failed read is not kept).
 */
export function recentSummary(
  root: string,
  openedAt: string,
  read: (root: string) => Promise<RecentProjectSummary>,
): Promise<RecentCardSummary> {
  const key = `${root}\u0000${openedAt}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const made = read(root).then((summary) => ({
    things: summary.things,
    picture: summary.picture === null ? null : imageDataUrl(summary.picture),
  }));
  cache.set(key, made);
  made.catch(() => {
    if (cache.get(key) === made) cache.delete(key);
  });
  return made;
}

/** "1 thing", "4 things", "No things yet". */
export function thingsInWords(things: number): string {
  if (things === 0) return 'No things yet';
  return things === 1 ? '1 thing' : `${things} things`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const plural = (count: number, word: string): string =>
  `${count} ${word}${count === 1 ? '' : 's'} ago`;

/** When a mod was last opened, in words ("just now", "2 hours ago", "yesterday", "3 weeks ago"). */
export function openedAgo(openedAt: string, now: number): string {
  const then = Date.parse(openedAt);
  if (Number.isNaN(then)) return '';
  const gone = Math.max(0, now - then);
  if (gone < MINUTE) return 'just now';
  if (gone < HOUR) return plural(Math.floor(gone / MINUTE), 'minute');
  if (gone < DAY) return plural(Math.floor(gone / HOUR), 'hour');
  const days = Math.floor(gone / DAY);
  if (days === 1) return 'yesterday';
  if (days < 14) return plural(days, 'day');
  if (days < 60) return plural(Math.floor(days / 7), 'week');
  if (days < 730) return plural(Math.floor(days / 30), 'month');
  return plural(Math.floor(days / 365), 'year');
}

/** The one or two letters of a mod's monogram ("Ruby Mod" gives "RM", "elm" gives "E"). */
export function monogram(name: string): string {
  const words = name
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '')
    .slice(0, 2);
  const letters = words.map((word) => (word[0] ?? '').toUpperCase()).join('');
  return letters === '' ? '?' : letters;
}

/** The hue of a mod's monogram, from its name (the same name, the same colour). */
export function monogramHue(name: string): number {
  let hash = 0;
  for (const char of name) hash = (Math.imul(hash, 31) + (char.codePointAt(0) ?? 0)) >>> 0;
  return hash % 360;
}
