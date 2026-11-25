/**
 * Building and ordering changes: the stable id rule and a sort that does not depend on the
 * locale.
 *
 * @packageDocumentation
 */

import { compareCodePoints } from '../shared/download.ts';
import type { TargetChange } from './types.ts';

/** The stable id of a change: `${area}:${subject}`, plus `#${field}` when there is a field. */
export function changeId(area: string, subject: string, field?: string): string {
  return `${area}:${subject}${field === undefined ? '' : `#${field}`}`;
}

/** A change with its id filled in from its area, subject and field. */
export function makeChange(change: Omit<TargetChange, 'id'>): TargetChange {
  return { id: changeId(change.area, change.subject, change.field), ...change };
}

/** Sorts by id (code point order) and throws when two changes share an id. */
export function sortChanges(changes: readonly TargetChange[]): TargetChange[] {
  const sorted = [...changes].sort((a, b) => compareCodePoints(a.id, b.id));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]?.id === sorted[i - 1]?.id) {
      throw new Error(`two changes share the id ${sorted[i]?.id}`);
    }
  }
  return sorted;
}

/** Sorted copy of a list of strings, by code point. */
export function sortedStrings(values: Iterable<string>): string[] {
  return [...values].sort(compareCodePoints);
}

/** Rounds a score to two decimals. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
