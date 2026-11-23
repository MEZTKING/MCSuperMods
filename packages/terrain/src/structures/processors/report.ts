/**
 * What one processor tells the view about itself while it runs: its fidelity (the worst of its
 * parts: a linear position test makes a `rule` about right, an unknown part makes it only in the
 * game) and its notes, one sentence each.
 */

import type { ProcessorFidelity } from '../api';

const RANK: Readonly<Record<ProcessorFidelity, number>> = {
  exact: 0,
  about_right: 1,
  only_in_game: 2,
};

/** The fidelity and notes of one processor. */
export class Report {
  fidelity: ProcessorFidelity = 'exact';
  readonly notes: string[] = [];

  /** Lowers the fidelity to `level` (never raises it) and keeps the note once. */
  mark(level: ProcessorFidelity, note?: string): void {
    if (RANK[level] > RANK[this.fidelity]) this.fidelity = level;
    if (note && !this.notes.includes(note)) this.notes.push(note);
  }

  /** The notes as one text, or undefined. */
  note(): string | undefined {
    return this.notes.length > 0 ? this.notes.join(' ') : undefined;
  }
}

/** A type id with the default namespace. */
export function typeId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return '';
  return value.includes(':') ? value : `minecraft:${value}`;
}
