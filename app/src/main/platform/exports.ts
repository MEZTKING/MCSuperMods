/**
 * Export folder writes for the combined export (ADR 0015) and the plugin exporters (ADR
 * 0021): the user picks a folder, and the renderer then writes the pack zips, or the structure
 * files (`<namespace>/<path>.nbt` or `.schem`), into it. Only folders picked in this process
 * lifetime are writable, only pack-zip names and structure paths are accepted, subfolders
 * must stay inside the picked folder after resolving links, and each file is written to a
 * temporary name and renamed over the target, so a reader never sees a partial file.
 *
 * `writeTree` writes the Java project export (ADR 0033 D4) into the same kind of picked
 * folder: a tree of checked relative paths under one root folder (`<mod_id>`), which must not
 * exist or must be empty; `gradlew` at the root is made executable.
 *
 * @packageDocumentation
 */

import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, relative, sep } from 'node:path';
import {
  EXPORT_TREE_MAX_FILES,
  isExportFileName,
  isExportTreePath,
} from '../../shared/ipc-contract';
import type { PlatformAdapter } from '../../shared/platform';

/** Whether the resolved `child` is `parent` or inside it. */
function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel) && !rel.startsWith(sep));
}

/** The main-process exports service. */
export type ExportsService = Omit<
  PlatformAdapter['exports'],
  'runtimeJar' | 'geckolibJar' | 'gradleWrapper'
>;

/** Root-level files of an export tree that are made executable (the Gradle wrapper script). */
export const EXECUTABLE_TREE_FILES: readonly string[] = ['gradlew'];

/** Writes `data` to `path` through a temporary file in the same folder, then renames it. */
async function writeAtomic(path: string, data: Uint8Array, mode?: number): Promise<void> {
  const dir = dirname(path);
  const base = path.slice(dir.length + 1);
  const temp = join(dir, `.${base}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    await writeFile(temp, data, { flag: 'wx', ...(mode === undefined ? {} : { mode }) });
    // `mode` is masked by the umask on creation; set it exactly.
    if (mode !== undefined) await chmod(temp, mode);
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

/**
 * Checks an export tree: valid paths, no duplicates, no path that is both a file and a
 * folder, one shared root segment. Returns the root segment.
 *
 * @throws Error If the tree breaks a rule.
 */
export function checkExportTree(files: readonly { path: string }[]): string {
  if (files.length === 0) throw new Error('The export tree is empty.');
  if (files.length > EXPORT_TREE_MAX_FILES) {
    throw new Error(`The export tree has more than ${EXPORT_TREE_MAX_FILES} files.`);
  }
  const paths = new Set<string>();
  let root: string | undefined;
  for (const file of files) {
    if (!isExportTreePath(file.path)) {
      throw new Error(`${JSON.stringify(file.path)} is not a valid export tree path.`);
    }
    if (paths.has(file.path)) throw new Error(`${file.path} is listed twice.`);
    paths.add(file.path);
    const first = file.path.slice(0, file.path.indexOf('/'));
    if (root === undefined) root = first;
    else if (root !== first) {
      throw new Error(`Every path must start with ${root}/; ${file.path} does not.`);
    }
  }
  for (const path of paths) {
    for (let at = path.indexOf('/'); at >= 0; at = path.indexOf('/', at + 1)) {
      if (paths.has(path.slice(0, at))) {
        throw new Error(`${path.slice(0, at)} is both a file and a folder.`);
      }
    }
  }
  return root as string;
}

/** What the service needs from its host. */
export interface ExportsServiceDeps {
  /** Shows a native folder picker; returns an absolute folder, or `null` when cancelled. */
  pickFolder(opts: { title: string }): Promise<string | null>;
  /** Called with each written path (for example to allow revealing it). */
  onWritten?(path: string): void;
}

/** Creates the exports service. */
export function createExportsService(deps: ExportsServiceDeps): ExportsService {
  const picked = new Set<string>();

  return {
    async pickFolder(title) {
      const folder = await deps.pickFolder({ title });
      if (folder === null) return null;
      if (!isAbsolute(folder)) throw new Error('The export folder must be absolute.');
      const normalised = normalize(folder);
      picked.add(normalised);
      return normalised;
    },

    async writeFiles(folder, files) {
      const target = isAbsolute(folder) ? normalize(folder) : null;
      if (target === null || !picked.has(target)) {
        throw new Error('Choose the export folder first.');
      }
      const names = new Set<string>();
      for (const file of files) {
        if (!isExportFileName(file.name)) {
          throw new Error(`${JSON.stringify(file.name)} is not a valid export file name.`);
        }
        if (names.has(file.name)) throw new Error(`${file.name} is listed twice.`);
        names.add(file.name);
      }
      const info = await stat(target).catch(() => null);
      if (info === null || !info.isDirectory()) {
        throw new Error(`${target} is not a folder.`);
      }
      const root = await realpath(target);
      const paths: string[] = [];
      for (const file of files) {
        const path = join(target, ...file.name.split('/'));
        const dir = dirname(path);
        if (dir !== target) {
          await mkdir(dir, { recursive: true });
          if (!isInside(root, await realpath(dir))) {
            throw new Error(`${file.name} would be written outside the export folder.`);
          }
        }
        const base = path.slice(dir.length + 1);
        const temp = join(dir, `.${base}.${randomBytes(6).toString('hex')}.tmp`);
        try {
          await writeFile(temp, file.data, { flag: 'wx' });
          await rename(temp, path);
        } catch (error) {
          await rm(temp, { force: true });
          throw error;
        }
        deps.onWritten?.(path);
        paths.push(path);
      }
      return { paths };
    },

    async writeTree(folder, files) {
      const target = isAbsolute(folder) ? normalize(folder) : null;
      if (target === null || !picked.has(target)) {
        throw new Error('Choose the export folder first.');
      }
      const rootName = checkExportTree(files);
      const info = await stat(target).catch(() => null);
      if (info === null || !info.isDirectory()) {
        throw new Error(`${target} is not a folder.`);
      }
      const root = join(target, rootName);
      const existing = await stat(root).catch(() => null);
      if (existing !== null) {
        if (!existing.isDirectory() || (await readdir(root)).length > 0) {
          return { ok: false, reason: 'folder-not-empty', root };
        }
      } else {
        await mkdir(root);
      }
      const realRoot = await realpath(root);
      if (!isInside(await realpath(target), realRoot)) {
        throw new Error(`${rootName} would be written outside the export folder.`);
      }
      const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
      const checkedDirs = new Set<string>([root]);
      for (const file of sorted) {
        const path = join(target, ...file.path.split('/'));
        const dir = dirname(path);
        if (!checkedDirs.has(dir)) {
          await mkdir(dir, { recursive: true });
          if (!isInside(realRoot, await realpath(dir))) {
            throw new Error(`${file.path} would be written outside the export folder.`);
          }
          checkedDirs.add(dir);
        }
        const executable =
          dir === root && EXECUTABLE_TREE_FILES.includes(file.path.slice(rootName.length + 1));
        await writeAtomic(path, file.data, executable ? 0o755 : undefined);
      }
      deps.onWritten?.(root);
      return { ok: true, root, count: sorted.length };
    },
  };
}
