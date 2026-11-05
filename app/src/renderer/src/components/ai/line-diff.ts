/**
 * A line diff for the changeset review (no dependency): the longest common subsequence over
 * lines, as `same`, `removed` and `added` lines in order. Very large inputs fall back to
 * "everything removed, then everything added".
 *
 * @packageDocumentation
 */

/** One line of a diff. */
export interface DiffLine {
  type: 'same' | 'removed' | 'added';
  text: string;
}

/** Above this many cells (lines before times lines after) the LCS table is not built. */
export const MAX_DIFF_CELLS = 4_000_000;

/** The line diff of `before` and `after` (either may be empty). */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before === '' ? [] : before.split('\n');
  const b = after === '' ? [] : after.split('\n');
  // Common head and tail first: they are most of a typical edit.
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail += 1;
  }
  const out: DiffLine[] = a.slice(0, head).map((text) => ({ type: 'same', text }));
  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);
  const n = midA.length;
  const m = midB.length;
  if (n * m > MAX_DIFF_CELLS) {
    for (const text of midA) out.push({ type: 'removed', text });
    for (const text of midB) out.push({ type: 'added', text });
  } else {
    // lengths[i][j]: LCS length of midA[i..] and midB[j..].
    const lengths = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i -= 1) {
      const row = lengths[i] as Uint32Array;
      const below = lengths[i + 1] as Uint32Array;
      for (let j = m - 1; j >= 0; j -= 1) {
        row[j] =
          midA[i] === midB[j]
            ? (below[j + 1] as number) + 1
            : Math.max(below[j] as number, row[j + 1] as number);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        out.push({ type: 'same', text: midA[i] as string });
        i += 1;
        j += 1;
      } else if (
        ((lengths[i + 1] as Uint32Array)[j] as number) >=
        ((lengths[i] as Uint32Array)[j + 1] as number)
      ) {
        out.push({ type: 'removed', text: midA[i] as string });
        i += 1;
      } else {
        out.push({ type: 'added', text: midB[j] as string });
        j += 1;
      }
    }
    for (; i < n; i += 1) out.push({ type: 'removed', text: midA[i] as string });
    for (; j < m; j += 1) out.push({ type: 'added', text: midB[j] as string });
  }
  for (const text of a.slice(a.length - tail)) out.push({ type: 'same', text });
  return out;
}
