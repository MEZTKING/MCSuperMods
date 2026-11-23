/**
 * The text half of the engine (ADR 0124 D4; B653): normalising, tokens, British and American
 * folding, the light stemmer, stop words, the intent reader, numbers and units, typo candidates
 * and phrases. Language only: no word of any game lives here; the protected words, the
 * dictionary and the vocabulary are handed in.
 *
 * The order the index and the query use (B658): {@link tokenise}; {@link readIntent} and
 * {@link readNumbers} on the words as typed; phrases ({@link createPhraseMatcher}) and
 * {@link joinsAndSplits} on the folded words, stop words still in place; then each word that is
 * left {@link fold}ed, dropped or kept by {@link wordRole}, corrected by the typo index when the
 * index does not know it, and {@link stem}med.
 */

export * from './intent';
export * from './normalise';
export * from './numbers';
export * from './phrases';
export * from './spelling';
export * from './stem';
export * from './stop-words';
export * from './tokens';
export * from './typos';

import { fold } from './spelling';

/** A word's index term: folded, then stemmed by the stemmer handed in (if any). */
export function termOf(word: string, stemmer?: (word: string) => string): string {
  const folded = fold(word);
  return stemmer === undefined ? folded : stemmer(folded);
}
