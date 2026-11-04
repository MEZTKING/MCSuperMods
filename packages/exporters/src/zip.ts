/**
 * Deterministic zip archives (ADR 0013).
 *
 * @packageDocumentation
 */

import { type Zippable, zipSync } from 'fflate';

/**
 * The fixed modification time of every entry: 2000-01-01 00:00.
 *
 * Built with the local-time constructor on purpose: fflate converts `mtime` to a DOS date and
 * time with the local-time getters, so this value stores the same DOS fields in every time
 * zone.
 */
function fixedMtime(): Date {
  return new Date(2000, 0, 1);
}

/** Code-unit string comparison, independent of locale. */
export function comparePaths(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Builds a zip archive whose bytes depend only on the given paths and contents.
 *
 * Entries are sorted by path, compressed with DEFLATE level 6, stamped 2000-01-01 00:00 with
 * `os` 0 (MS-DOS) and no attributes. No directory entries are written.
 *
 * fflate takes entries as an object, so a path that is a canonical array index (only digits,
 * no `/` or `.`) would be ordered before the others by the JavaScript engine. Such a path
 * still produces deterministic output; it is merely out of sorted order.
 *
 * @param files - The files to store; paths are POSIX and relative.
 * @returns The archive bytes.
 * @throws Error If two files share a path.
 */
export function createZipBytes(files: readonly { path: string; data: Uint8Array }[]): Uint8Array {
  const sorted = [...files].sort((a, b) => comparePaths(a.path, b.path));
  const entries: Zippable = {};
  let previous: string | undefined;
  for (const file of sorted) {
    if (file.path === previous) throw new Error(`Duplicate zip entry: ${file.path}`);
    previous = file.path;
    entries[file.path] = [file.data, { level: 6, mtime: fixedMtime(), os: 0, attrs: 0 }];
  }
  return zipSync(entries);
}
