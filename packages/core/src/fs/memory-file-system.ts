/**
 * An in-memory {@link ProjectFileSystem} for tests and for hosts without a disk.
 *
 * @packageDocumentation
 */

import { utf8 } from '../serialise/stable-json';
import { assertProjectRelativePath, parentPath } from './paths';
import type { DirEntry, ProjectFileSystem } from './project-file-system';

/** A memory file system plus inspection helpers. */
export type MemoryFileSystem = ProjectFileSystem & {
  /** Copies of every file's bytes, keyed by path in sorted order. */
  snapshot(): Record<string, Uint8Array>;
  /** Every file path, sorted. Directories are not listed. */
  list(): string[];
};

/**
 * Creates an in-memory file system.
 *
 * @param initial - Files to start with; strings are stored as UTF-8.
 * @returns The file system.
 */
export function createMemoryFileSystem(
  initial: Record<string, string | Uint8Array> = {},
): MemoryFileSystem {
  const files = new Map<string, Uint8Array>();
  const directories = new Set<string>();

  const ensureDirectory = (path: string): void => {
    let current = path;
    while (current !== '') {
      if (files.has(current)) {
        throw new Error(`Cannot create directory ${JSON.stringify(current)}: a file exists there.`);
      }
      directories.add(current);
      current = parentPath(current);
    }
  };

  const putFile = (path: string, data: Uint8Array): void => {
    assertProjectRelativePath(path);
    if (directories.has(path)) {
      throw new Error(`Cannot write file ${JSON.stringify(path)}: a directory exists there.`);
    }
    ensureDirectory(parentPath(path));
    files.set(path, new Uint8Array(data));
  };

  for (const [path, contents] of Object.entries(initial)) {
    putFile(path, typeof contents === 'string' ? utf8.encode(contents) : contents);
  }

  const sortedPaths = (): string[] => [...files.keys()].sort();

  return {
    async readFile(path) {
      assertProjectRelativePath(path);
      const data = files.get(path);
      if (data === undefined) throw new Error(`File not found: ${JSON.stringify(path)}.`);
      return new Uint8Array(data);
    },
    async writeFile(path, data) {
      putFile(path, data);
    },
    async readDir(path) {
      assertProjectRelativePath(path);
      if (!directories.has(path)) {
        throw new Error(`Directory not found: ${JSON.stringify(path)}.`);
      }
      const prefix = `${path}/`;
      const entries = new Map<string, DirEntry['kind']>();
      for (const file of files.keys()) {
        if (file.startsWith(prefix) && !file.slice(prefix.length).includes('/')) {
          entries.set(file.slice(prefix.length), 'file');
        }
      }
      for (const directory of directories) {
        if (directory.startsWith(prefix) && !directory.slice(prefix.length).includes('/')) {
          entries.set(directory.slice(prefix.length), 'directory');
        }
      }
      return [...entries.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([name, kind]) => ({ name, kind }));
    },
    async exists(path) {
      assertProjectRelativePath(path);
      return files.has(path) || directories.has(path);
    },
    async mkdirp(path) {
      assertProjectRelativePath(path);
      ensureDirectory(path);
    },
    async remove(path) {
      assertProjectRelativePath(path);
      files.delete(path);
      directories.delete(path);
      const prefix = `${path}/`;
      for (const file of [...files.keys()]) {
        if (file.startsWith(prefix)) files.delete(file);
      }
      for (const directory of [...directories]) {
        if (directory.startsWith(prefix)) directories.delete(directory);
      }
    },
    snapshot() {
      const result: Record<string, Uint8Array> = {};
      for (const path of sortedPaths()) {
        result[path] = new Uint8Array(files.get(path) as Uint8Array);
      }
      return result;
    },
    list: sortedPaths,
  };
}
