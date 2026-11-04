/**
 * Minecraft game-version comparison used for mcdoc `#[since]` / `#[until]` gating.
 *
 * Versions are split on `.` and `-`. Numeric segments compare numerically and sort before
 * non-numeric segments, which compare as strings. A missing segment counts as `0` when the
 * other side is numeric, so `"1.0"` equals `"1.0.0"` and `"1.0"` is older than `"1.0.1"`.
 */

const NUMERIC = /^[0-9]+$/;

function compareSegment(a: string | undefined, b: string | undefined): -1 | 0 | 1 {
  const left = a ?? '0';
  const right = b ?? '0';
  const leftNumeric = NUMERIC.test(left);
  const rightNumeric = NUMERIC.test(right);
  if (leftNumeric && rightNumeric) {
    const diff = Number(left) - Number(right);
    return diff < 0 ? -1 : diff > 0 ? 1 : 0;
  }
  if (leftNumeric !== rightNumeric) {
    // A missing segment is older than any non-numeric suffix.
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    return leftNumeric ? -1 : 1;
  }
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Numeric tuple compare: `"1.21.9" < "25.1" < "25.3" < "25.3.1"`.
 * Non-numeric segments compare as strings after numeric ones.
 */
export function compareGameVersions(a: string, b: string): -1 | 0 | 1 {
  const left = a.trim().split(/[.-]/);
  const right = b.trim().split(/[.-]/);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const result = compareSegment(left[i], right[i]);
    if (result !== 0) return result;
  }
  return 0;
}

/** Whether `version` lies in `[since, until)`; an absent bound is unbounded. */
export function isVersionInRange(version: string, since?: string, until?: string): boolean {
  if (since !== undefined && compareGameVersions(version, since) < 0) return false;
  if (until !== undefined && compareGameVersions(version, until) >= 0) return false;
  return true;
}
