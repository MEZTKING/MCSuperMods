/**
 * The project Wishlist (ADR 0053): requests MSM could not build as asked, noted by the AI
 * helper (`note_missing_feature`) or added by the user, kept in `msm.wishlist.json` next to
 * the project file so they survive closing the app. Pure: parse, add, update and serialise.
 *
 * @packageDocumentation
 */

/** The Wishlist file, at the project root. */
export const WISHLIST_FILE = 'msm.wishlist.json';

/** One wish. */
export interface WishlistEntry {
  /** Unique within the list. */
  id: string;
  /** ISO time it was added. */
  created: string;
  /** Who added it. */
  source: 'ai' | 'user';
  /** A short name, for example "Set a player's velocity". */
  title: string;
  /** What the user asked for. */
  request: string;
  /** What MSM lacks. */
  missing: string;
  /** What was built instead, if anything. */
  builtInstead?: string;
  /** `done` once the feature exists (the user ticks it). */
  status: 'open' | 'done';
}

/** The most wishes kept; older done ones go first when full. */
export const WISHLIST_MAX = 500;

const text = (value: unknown, max: number): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, max) : undefined;

/** The wishes of a Wishlist file's text; anything unreadable is left out. */
export function parseWishlist(source: string): WishlistEntry[] {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch {
    return [];
  }
  const list = (raw as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(list)) return [];
  const out: WishlistEntry[] = [];
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue;
    const entry = item as Record<string, unknown>;
    const id = text(entry.id, 64);
    const title = text(entry.title, 120);
    const missing = text(entry.missing, 1000);
    if (id === undefined || title === undefined || missing === undefined) continue;
    const builtInstead = text(entry.builtInstead, 1000);
    out.push({
      id,
      created: text(entry.created, 40) ?? '',
      source: entry.source === 'user' ? 'user' : 'ai',
      title,
      request: text(entry.request, 1000) ?? '',
      missing,
      ...(builtInstead === undefined ? {} : { builtInstead }),
      status: entry.status === 'done' ? 'done' : 'open',
    });
  }
  return out;
}

/** The file text of `entries`: format 1, sorted keys, two-space indent, a final newline. */
export function serialiseWishlist(entries: readonly WishlistEntry[]): string {
  const sorted = entries.map((entry) =>
    Object.fromEntries(Object.entries(entry).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
  );
  return `${JSON.stringify({ entries: sorted, format: 1 }, null, 2)}\n`;
}

/**
 * `entries` with a new wish appended: a wish with the same title that is still open is
 * updated instead, so the same gap is listed once.
 */
export function addWish(
  entries: readonly WishlistEntry[],
  wish: Omit<WishlistEntry, 'id' | 'created' | 'status'>,
  now: Date = new Date(),
): WishlistEntry[] {
  const same = entries.find(
    (entry) => entry.status === 'open' && entry.title.toLowerCase() === wish.title.toLowerCase(),
  );
  if (same !== undefined) {
    return entries.map((entry) => (entry === same ? { ...entry, ...wish, id: entry.id } : entry));
  }
  let next = [
    ...entries,
    {
      ...wish,
      id: `w${now.getTime().toString(36)}${entries.length.toString(36)}`,
      created: now.toISOString(),
      status: 'open' as const,
    },
  ];
  while (next.length > WISHLIST_MAX) {
    const done = next.findIndex((entry) => entry.status === 'done');
    next = next.filter((_, index) => index !== Math.max(done, 0));
  }
  return next;
}

/** The open wishes as text to paste into a request (for example to the MSM developers). */
export function wishlistText(entries: readonly WishlistEntry[], projectName: string): string {
  const open = entries.filter((entry) => entry.status === 'open');
  if (open.length === 0) return `MCSuperMods Wishlist for ${projectName}: nothing open.`;
  const lines = [`MCSuperMods Wishlist for ${projectName} (${open.length} open):`, ''];
  open.forEach((entry, index) => {
    lines.push(`${index + 1}. ${entry.title}`);
    if (entry.request !== '') lines.push(`   Asked for: ${entry.request}`);
    lines.push(`   Missing: ${entry.missing}`);
    if (entry.builtInstead !== undefined) lines.push(`   Built instead: ${entry.builtInstead}`);
    lines.push('');
  });
  return lines.join('\n').trimEnd();
}
