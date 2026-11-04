/**
 * Text references: known ids written as tokens inside function lines (ADR 0016).
 *
 * @packageDocumentation
 */

import type { Element } from '@msm/plugin-api';
import { normaliseReferenceId, type Reference } from './reference-index';

/**
 * A maximal run of characters that can occur in a written resource location: namespace and
 * path characters plus the `:` separator. Anything else (spaces, `#`, `@`, brackets, quotes,
 * `=`, `,`, upper-case letters) bounds a token.
 */
const TOKEN = /[a-z0-9_.\-/:]+/g;

/**
 * Finds every known id written in `lines` as an exact `namespace:path` token. A token is a
 * maximal run of id characters, so a known id inside a longer id (`a:b` in `a:b/c` or
 * `xa:b`) is not a match. Tokens without a namespace are never matched (a bare word is too
 * ambiguous in command text); `knownIds` entries without one mean `minecraft:`. Every match
 * is reported, including those inside comments and string literals.
 *
 * @param element - The element the lines belong to (`from` of each reference).
 * @param lines - The function source lines; line `n` has path `/lines/<n>`.
 * @param knownIds - The ids to look for, for example every project element id.
 * @returns References with the empty registry and the token's range within its line.
 */
export function collectTextReferences(
  element: Element,
  lines: readonly string[],
  knownIds: ReadonlySet<string>,
): Reference[] {
  const known = new Set<string>();
  for (const id of knownIds) known.add(normaliseReferenceId(id));
  const references: Reference[] = [];
  lines.forEach((line, n) => {
    for (const match of line.matchAll(TOKEN)) {
      const token = match[0];
      if (!token.includes(':') || !known.has(token)) continue;
      const start = match.index;
      references.push({
        from: element.id,
        path: `/lines/${n}`,
        registry: '',
        to: token,
        range: { start, end: start + token.length },
      });
    }
  });
  return references;
}
