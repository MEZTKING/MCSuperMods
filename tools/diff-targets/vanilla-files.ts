/**
 * The vanilla files that changed between two targets (ADR 0136 D11, brief B823): the two
 * targets' file indexes (`vendor/mcmeta/files.json`, written by `tools/sync-mcmeta` from mcmeta's
 * file trees: paths and blob hashes, never contents) compared into lists of paths added,
 * removed, moved and changed. Pure and offline.
 *
 * The result is the plugin API's `VanillaFileChanges` (1.30.0), written beside the change set
 * (`generated.json` gives `generated.vanilla-files.json`); the target's change set carries it as
 * `vanillaFiles`.
 *
 * @packageDocumentation
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compareCodePoints, parseJsonStrict, stringifySorted } from '../shared/download.ts';

/** The vanilla files that changed: a structurally equal copy of the plugin API's type. */
export interface VanillaFileChanges {
  from: string;
  to: string;
  refs: { from: string; to: string };
  leftOut: string[];
  added: string[];
  removed: string[];
  moved: Record<string, string>;
  changed: string[];
}

/** One target's file index, as `tools/sync-mcmeta` writes it. */
export interface FileIndex {
  version: string;
  leftOut: string[];
  /** Path to a short blob hash. */
  files: Record<string, string>;
}

/** The index's file in a target folder. */
export const FILE_INDEX = join('vendor', 'mcmeta', 'files.json');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads a target folder's file index.
 *
 * @returns The index, or `undefined` when the folder has none (vendored before B823) or the
 *   index was read for another version than `version.json` names (a folder copied from another
 *   target and not re-synced).
 * @throws Error When the file exists and is not an index.
 */
export async function readFileIndex(
  folder: string,
  version: string,
): Promise<FileIndex | undefined> {
  const path = join(folder, FILE_INDEX);
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
  const value = parseJsonStrict(text, path);
  if (
    !isRecord(value) ||
    typeof value.version !== 'string' ||
    !isRecord(value.files) ||
    !Array.isArray(value.leftOut) ||
    !value.leftOut.every((item) => typeof item === 'string') ||
    !Object.values(value.files).every((hash) => typeof hash === 'string')
  ) {
    throw new Error(`${path}: not a file index`);
  }
  if (value.version !== version) return undefined;
  return {
    version: value.version,
    leftOut: value.leftOut as string[],
    files: value.files as Record<string, string>,
  };
}

/**
 * Compares two file indexes. A removed path whose hash is exactly one added path's hash, and no
 * other removed path's, is `moved` to it and listed in neither `removed` nor `added`.
 *
 * @param from - The older target's id.
 * @param to - The newer target's id.
 */
export function diffVanillaFiles(
  from: string,
  to: string,
  before: FileIndex,
  after: FileIndex,
): VanillaFileChanges {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const [path, hash] of Object.entries(after.files)) {
    const old = before.files[path];
    if (old === undefined) added.push(path);
    else if (old !== hash) changed.push(path);
  }
  for (const path of Object.keys(before.files)) {
    if (after.files[path] === undefined) removed.push(path);
  }
  const byHash = (paths: readonly string[], index: FileIndex): Map<string, string[]> => {
    const map = new Map<string, string[]>();
    for (const path of paths) {
      const hash = index.files[path] as string;
      map.set(hash, [...(map.get(hash) ?? []), path]);
    }
    return map;
  };
  const removedByHash = byHash(removed, before);
  const addedByHash = byHash(added, after);
  const moved: Record<string, string> = {};
  for (const [hash, olds] of removedByHash) {
    const news = addedByHash.get(hash);
    if (olds.length === 1 && news?.length === 1) moved[olds[0] as string] = news[0] as string;
  }
  const movedTo = new Set(Object.values(moved));
  const sorted = (paths: string[]): string[] => paths.sort(compareCodePoints);
  return {
    from,
    to,
    refs: { from: before.version, to: after.version },
    leftOut: sorted([...new Set([...before.leftOut, ...after.leftOut])]),
    added: sorted(added.filter((path) => !movedTo.has(path))),
    removed: sorted(removed.filter((path) => moved[path] === undefined)),
    moved,
    changed: sorted(changed),
  };
}

/** The list file beside a change set file: `generated.json` gives `generated.vanilla-files.json`. */
export function vanillaFilesPath(out: string): string {
  return out.endsWith('.json')
    ? `${out.slice(0, -5)}.vanilla-files.json`
    : `${out}.vanilla-files.json`;
}

/** The list as written: sorted keys, 2-space indent. */
export function vanillaFilesText(changes: VanillaFileChanges): string {
  return stringifySorted(changes);
}

/** How many paths the list names, by kind. */
export function vanillaFilesCounts(changes: VanillaFileChanges): Record<string, number> {
  return {
    added: changes.added.length,
    removed: changes.removed.length,
    moved: Object.keys(changes.moved).length,
    changed: changes.changed.length,
  };
}
