/**
 * A {@link ProjectFileSystem} over `node:fs/promises`, rooted at one directory.
 *
 * @packageDocumentation
 */

import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { DirEntry, ProjectFileSystem } from '@msm/core';

/**
 * Checks that a path is a POSIX path relative to the project root.
 *
 * Mirrors `assertProjectRelativePath` in `@msm/core`. It is re-implemented here so that the
 * main process never imports `@msm/core` at runtime (ADR 0007); keep the two in step.
 *
 * @throws Error If the path is empty, absolute, contains a backslash, or has an empty, `.` or
 *   `..` segment.
 */
export function assertProjectRelativePath(path: string): void {
  if (path === '') throw new Error('Project path must not be empty.');
  if (path.startsWith('/')) {
    throw new Error(`Project path ${JSON.stringify(path)} must be relative, not absolute.`);
  }
  if (path.includes('\\')) {
    throw new Error(`Project path ${JSON.stringify(path)} must use "/" separators.`);
  }
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.' || segment === '..') {
      throw new Error(
        `Project path ${JSON.stringify(path)} must not contain empty, "." or ".." segments.`,
      );
    }
  }
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  );
}

/**
 * Creates a file system scoped to `root`.
 *
 * @param root - The absolute project directory.
 */
export function createScopedFileSystem(root: string): ProjectFileSystem {
  const resolve = (path: string): string => {
    assertProjectRelativePath(path);
    return join(root, ...path.split('/'));
  };

  return {
    async readFile(path) {
      const buffer = await readFile(resolve(path));
      return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    },
    async writeFile(path, data) {
      const target = resolve(path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, data);
    },
    async readDir(path) {
      const entries = await readdir(resolve(path), { withFileTypes: true });
      const result: DirEntry[] = [];
      for (const entry of entries) {
        if (entry.isFile()) result.push({ name: entry.name, kind: 'file' });
        else if (entry.isDirectory()) result.push({ name: entry.name, kind: 'directory' });
      }
      return result.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    },
    async exists(path) {
      try {
        await stat(resolve(path));
        return true;
      } catch (error) {
        if (isMissing(error)) return false;
        throw error;
      }
    },
    async mkdirp(path) {
      await mkdir(resolve(path), { recursive: true });
    },
    async remove(path) {
      await rm(resolve(path), { recursive: true, force: true });
    },
  };
}
