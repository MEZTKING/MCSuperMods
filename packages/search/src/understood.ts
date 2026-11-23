/**
 * The chips of what the answer reader understood (ADR 0124 D8; B659), beside the corrections and
 * the words not placed that the query adds itself (`query.ts`): the colours, numbers and things
 * an answer took, the name typed as such, the behaviour read from the clause; struck through, a
 * clause no behaviour phrase matched (limit SL3: "I could only use the first part" for a second
 * behaviour), and a number no question could take because it was out of range (D7 as amended:
 * dropped, never clamped). Colour words are never struck through. Chips are in the order of the
 * words, each text and kind once.
 */

import type { Understood } from './types';

export type Chip = Understood['chips'][number];

/** The kinds of chip the reader adds. */
export type ReaderChipKind = 'colour' | 'number' | 'thing' | 'name' | 'behaviour' | 'clause';

/** A chip with the place of its first word, for ordering. */
export interface ChipNote {
  readonly at: number;
  readonly text: string;
  readonly kind: ReaderChipKind;
  readonly struck?: boolean;
}

const KIND_ORDER: Readonly<Record<ReaderChipKind, number>> = {
  name: 0,
  colour: 1,
  thing: 2,
  number: 3,
  behaviour: 4,
  clause: 5,
};

/** The chips of the notes: in word order, each text and kind once. */
export function chipsOf(notes: readonly ChipNote[]): Chip[] {
  const sorted = [...notes].sort(
    (a, b) =>
      a.at - b.at ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      (a.text < b.text ? -1 : a.text > b.text ? 1 : 0),
  );
  const seen = new Set<string>();
  const out: Chip[] = [];
  for (const note of sorted) {
    const key = `${note.kind}\u0000${note.text}`;
    if (note.text === '' || seen.has(key)) continue;
    seen.add(key);
    out.push(
      note.struck === true
        ? { text: note.text, kind: note.kind, struck: true }
        : { text: note.text, kind: note.kind },
    );
  }
  return out;
}
