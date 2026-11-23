/**
 * The line of what a search understood (ADR 0124 D8): "Showing results for …" when words were
 * corrected, then "I understood:" and a chip for each colour, thing, number, name and behaviour
 * the reader took, and the words it could not place, struck through and read as "Not
 * understood". Every chip but the correction is removable: removing one takes its words out of
 * the field, so the search asks again without them.
 *
 * @packageDocumentation
 */

import type { SearchMode, Understood } from '@msm/search';
import { chipText, correctedLine, NOT_UNDERSTOOD, searchWords } from './wording';

/** The chip kinds of the correction, shown as the "Showing results for" line instead. */
const CORRECTION_KINDS: ReadonlySet<string> = new Set(['corrected', 'misspelling']);

/** Words that only join a clause or a name to the rest, dropped when left at either end. */
const JOINERS: ReadonlySet<string> = new Set([
  'that',
  'which',
  'who',
  'when',
  'called',
  'named',
  'and',
  'with',
  'of',
]);

/** A word as chips and the field compare it: lower case, no marks, letters, digits and `#`. */
function plainWord(word: string): string {
  return word
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}#]+/gu, '');
}

/** Whether a typed word is the chip's word (as typed, or one the start of the other: plurals, stems). */
function sameWord(typed: string, chip: string): boolean {
  if (typed === '' || chip === '') return false;
  if (typed === chip) return true;
  const shorter = typed.length < chip.length ? typed : chip;
  const longer = typed.length < chip.length ? chip : typed;
  return shorter.length >= 4 && longer.startsWith(shorter);
}

/**
 * The field's text without a chip's words: the first run of typed words that reads as the chip
 * (word by word, as typed or with an ending), else each of its words alone; a joining word left
 * dangling at either end ("that", "called") goes too. The text is unchanged when none is found.
 */
export function textWithout(text: string, chip: string): string {
  const typed = text.split(/\s+/).filter((word) => word !== '');
  const wanted = chip
    .split(/\s+/)
    .map(plainWord)
    .filter((word) => word !== '');
  if (wanted.length === 0) return text;
  const plain = typed.map(plainWord);
  let removed = new Set<number>();
  for (let start = 0; start + wanted.length <= plain.length && removed.size === 0; start++) {
    if (wanted.every((word, k) => sameWord(plain[start + k] as string, word))) {
      removed = new Set(wanted.map((_, k) => start + k));
    }
  }
  if (removed.size === 0) {
    for (const word of wanted) {
      const at = plain.findIndex((typedWord, i) => !removed.has(i) && sameWord(typedWord, word));
      if (at >= 0) removed.add(at);
    }
  }
  if (removed.size === 0) return text;
  const kept = typed.filter((_, i) => !removed.has(i));
  while (kept.length > 0 && JOINERS.has(plainWord(kept[kept.length - 1] as string))) kept.pop();
  while (kept.length > 0 && JOINERS.has(plainWord(kept[0] as string))) kept.shift();
  return kept.join(' ');
}

export interface UnderstoodChipsProps {
  readonly understood: Understood;
  readonly mode: SearchMode;
  /** Takes the chip's words out of the field (the panel asks again). */
  readonly onRemove: (chip: Understood['chips'][number]) => void;
}

/** The "Showing results for" line and the chips; nothing when there is nothing to say. */
export function UnderstoodChips({ understood, mode, onRemove }: UnderstoodChipsProps) {
  const words = searchWords(mode);
  const corrected = correctedLine(understood, mode);
  const chips = understood.chips.filter((chip) => !CORRECTION_KINDS.has(chip.kind));
  const plain = chips.filter((chip) => chip.struck !== true);
  const struck = chips.filter((chip) => chip.struck === true);
  if (corrected === null && chips.length === 0) return null;
  const chipView = (chip: Understood['chips'][number], index: number) => {
    const shown = chipText(chip, mode);
    return (
      <li
        key={`${chip.kind}-${chip.text}-${index}`}
        data-testid="search-chip"
        data-kind={chip.kind}
        className="inline-flex items-center gap-1 rounded-full border border-border bg-bg px-2 py-0.5 text-xs"
      >
        {shown.struck ? <s>{shown.text}</s> : <span>{shown.text}</span>}
        <button
          type="button"
          aria-label={shown.removeLabel}
          title={shown.removeLabel}
          data-testid="search-chip-remove"
          className="rounded px-1 text-muted hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          onClick={() => onRemove(chip)}
        >
          <span aria-hidden="true">×</span>
        </button>
      </li>
    );
  };
  return (
    <div data-testid="search-understood" className="flex flex-col gap-1 text-sm">
      {corrected !== null && (
        <p data-testid="search-corrected" className="text-muted">
          {corrected}
        </p>
      )}
      {plain.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-muted">{words.understoodLead}</span>
          <ul className="flex flex-wrap gap-1" aria-label={words.understoodLead}>
            {plain.map(chipView)}
          </ul>
        </div>
      )}
      {struck.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-muted">{NOT_UNDERSTOOD}</span>
          <ul className="flex flex-wrap gap-1" aria-label={NOT_UNDERSTOOD}>
            {struck.map(chipView)}
          </ul>
        </div>
      )}
    </div>
  );
}
