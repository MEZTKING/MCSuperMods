/**
 * The light stemmer (ADR 0124 D4, B650 SQ4): plurals, -ing and -ed, nothing else (-er is never
 * stripped, so `runner` stays whole). A protected word (handed in: every game id word and
 * vocabulary headword) is never touched, nor is a word of {@link STEM_EXCEPTIONS}. With a
 * dictionary handed in, the stemmer is dictionary-aware in B650's order:
 *
 * 1. a plural becomes its singular when the singular is a dictionary word (`-es` first after a
 *    hissing sound, `touches`; then `-s`, `cookies`; then `-es`, `potatoes`), before `-ies` to
 *    `-y` and `-ves` to `-f` or `-fe`;
 * 2. for -ing and -ed, the word with an `-e` first (`noted` is `note`), then the bare stem only
 *    if it has four letters or more (`coming` is not `com`), then the undoubled stem;
 * 3. an -ing or -ed word with no dictionary form stays whole.
 *
 * Works on one normalised, folded word; pure and deterministic.
 */

/**
 * Words the stemmer leaves whole whatever the rules say: B650's exception list (less one word
 * ending in -is, which the rules never strip), plus `ranged` (B653: `ranged` is not `range`, the
 * one merge B650 left).
 */
export const STEM_EXCEPTIONS: ReadonlySet<string> = new Set([
  'always',
  'atlas',
  'bus',
  'canvas',
  'does',
  'gas',
  'has',
  'its',
  'lens',
  'lives',
  'news',
  'perhaps',
  'ranged',
  'series',
  'species',
  'this',
  'was',
  'yes',
]);

/** What the stemmer is handed: the protected words and the dictionary, both of folded words. */
export interface StemOptions {
  readonly protect?: ReadonlySet<string>;
  readonly dictionary?: ReadonlySet<string>;
}

/** Endings of a word that is not a plural for all its final `s`. */
const NOT_PLURAL = /(?:ss|us|is|ous)$/;
/** Plurals in -es after a hissing sound: `boxes`, `touches`, `wishes`, `buzzes`. */
const SIBILANT_ES = /(?:x|ch|sh|zz)es$/;
/** A doubled consonant at the end of a stem that undoubles (`stopp` is `stop`, `cancell` is `cancel`). */
const DOUBLED = /([b-df-hj-np-tv-z])\1$/;

/** The stem of one word. */
export function stem(word: string, options: StemOptions = {}): string {
  const { protect, dictionary } = options;
  if (word.length <= 3 || /\d/.test(word) || protect?.has(word) || STEM_EXCEPTIONS.has(word)) {
    return word;
  }
  const known = (candidate: string): boolean =>
    dictionary !== undefined && candidate.length >= 3 && dictionary.has(candidate);

  if (word.endsWith('s') && !NOT_PLURAL.test(word)) {
    const sibilant = SIBILANT_ES.test(word);
    if (sibilant && known(word.slice(0, -2))) return word.slice(0, -2);
    if (known(word.slice(0, -1))) return word.slice(0, -1);
    if (word.endsWith('es') && known(word.slice(0, -2))) return word.slice(0, -2);
    if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
    if (word.endsWith('ves') && dictionary !== undefined) {
      const f = `${word.slice(0, -3)}f`;
      if (known(f)) return f;
      if (known(`${f}e`)) return `${f}e`;
    }
    if (word.endsWith('sses')) return word.slice(0, -2);
    if (sibilant) return word.slice(0, -2);
    return word.slice(0, -1);
  }

  for (const suffix of ['ing', 'ed']) {
    if (!word.endsWith(suffix)) continue;
    const base = word.slice(0, -suffix.length);
    if (base.length < 3) return word;
    if (suffix === 'ed' && base.endsWith('i')) return `${base.slice(0, -1)}y`;
    const undoubled = DOUBLED.test(base) ? base.slice(0, -1) : base;
    if (dictionary === undefined) return undoubled;
    const order = [`${base}e`];
    if (base.length >= 4) order.push(base);
    if (undoubled !== base && undoubled.length >= 3) order.push(undoubled);
    return order.find(known) ?? word;
  }
  return word;
}

/** A stemmer with its options bound and its answers remembered (one map per index build). */
export function createStemmer(options: StemOptions = {}): (word: string) => string {
  const seen = new Map<string, string>();
  return (word) => {
    let out = seen.get(word);
    if (out === undefined) {
      out = stem(word, options);
      seen.set(word, out);
    }
    return out;
  };
}
