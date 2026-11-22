/**
 * The fidelity levels of a live view (ADR 0120 D2): one per part of a view, so a view never
 * claims more than it knows. "Checked" needs a fixture case that the real game observed
 * (`fixtures/live-views/expectations.json`); a part shown as checked without one is refused at review.
 */

import { type Unsupported, unsupportedWords } from '@msm/sim';

/** How close a part of a view is to the game. */
export type Fidelity = 'checked' | 'about_right' | 'only_in_game';

/** The levels, best first. */
export const FIDELITIES: readonly Fidelity[] = ['checked', 'about_right', 'only_in_game'];

/** The words shown for each level. */
export const FIDELITY_LABELS: Readonly<Record<Fidelity, string>> = {
  checked: 'As in the game, checked',
  about_right: 'About right',
  only_in_game: 'Only in the game',
};

/** What each level means, for a tooltip. */
export const FIDELITY_HINTS: Readonly<Record<Fidelity, string>> = {
  checked: 'MSM compared this with the real game on MSM’s own test files.',
  about_right: 'Worked out by MSM from your files; the game may differ in small ways.',
  only_in_game: 'MSM cannot show this. Play is the real check.',
};

/** The weakest of some levels: what a whole view may claim. `checked` for none. */
export function weakest(levels: readonly Fidelity[]): Fidelity {
  let worst = 0;
  for (const level of levels) worst = Math.max(worst, FIDELITIES.indexOf(level));
  return FIDELITIES[worst] ?? 'checked';
}

/** What an evaluator could not work out (`@msm/sim`'s `Unsupported`), as the frame lists it. */
export type UnsupportedPart = Unsupported;

/**
 * One plain line for a part an evaluator reported (ADR 0120 D3: named, never dropped silently):
 * `@msm/sim`'s words for it (`unsupportedWords`, B604), after where it is in the data.
 */
export function unsupportedLine(part: UnsupportedPart): string {
  const words = unsupportedWords(part);
  return part.path === '' ? words : `At ${part.path}: ${words}`;
}

/**
 * The reported parts, each once (same kind, type, path and reason), in the order first reported;
 * at most `limit` of them, so a table with many unknown parts does not fill the panel.
 */
export function distinctParts<T extends UnsupportedPart>(
  parts: readonly T[],
  limit = 50,
): { readonly shown: readonly T[]; readonly more: number } {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const part of parts) {
    const key = `${part.kind}|${part.type}|${part.path}|${part.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return { shown: out.slice(0, limit), more: Math.max(0, out.length - limit) };
}
