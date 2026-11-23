/**
 * Normalising (ADR 0124 D4, first step): lower case, accents stripped, compatibility forms
 * unfolded. Pure; never throws on any string.
 */

/** Letters that Unicode does not decompose into a base letter and a mark. */
const LETTERS: Readonly<Record<string, string>> = {
  æ: 'ae',
  œ: 'oe',
  ß: 'ss',
  ø: 'o',
  đ: 'd',
  ð: 'd',
  ł: 'l',
  þ: 'th',
  ı: 'i',
};

const MARKS = /\p{M}+/gu;
const UNDECOMPOSED = /[æœßøđðłþı]/g;

/** Lower case with accents and other marks stripped: `Crème Brûlée` is `creme brulee`. */
export function normalise(text: string): string {
  if (typeof text !== 'string' || text === '') return '';
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(MARKS, '')
    .replace(UNDECOMPOSED, (letter) => LETTERS[letter] ?? letter);
}
