/**
 * A {@link ProjectFileSystem} over `node:fs/promises`, rooted at one directory, with symlink
 * containment: no operation may reach a file outside the root's real path.
 *
 * @packageDocumentation
 */

import {
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, sep } from 'node:path';
import type { DirEntry, ProjectFileSystem } from '@msm/core';
import { assertProjectRelativePath } from '@msm/plugin-api';

/** Basic facts about an existing file or directory. */
export interface ScopedStat {
  kind: 'file' | 'directory';
  size: number;
  mtimeMs: number;
}

/** A project file system that also knows its root and can stat entries (main only). */
export interface ScopedFileSystem extends ProjectFileSystem {
  /** The root as given to {@link createScopedFileSystem}. */
  readonly root: string;
  /** Stats a contained path, or returns `null` when nothing exists there. */
  stat(path: string): Promise<ScopedStat | null>;
}

/** The error raised when a path resolves outside the project root. */
export class PathEscapeError extends Error {
  constructor(path: string) {
    super(`Project path ${JSON.stringify(path)} resolves outside the project folder.`);
    this.name = 'PathEscapeError';
  }
}

function hasCode(error: unknown, ...codes: string[]): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    codes.includes(error.code)
  );
}

function isMissing(error: unknown): boolean {
  return hasCode(error, 'ENOENT', 'ENOTDIR');
}

/**
 * Whether `path` is `root` or lies below it. Both must be absolute, normalised host paths
 * (such as the results of `realpath`).
 */
export function isWithin(root: string, path: string): boolean {
  if (path === root) return true;
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  return path.startsWith(prefix);
}

/**
 * The real path of the deepest existing ancestor of `path` (or of `path` itself), plus the
 * segments below it that do not exist yet. A dangling symlink on the way is reported as
 * `dangling: true` (with its own, unresolved path), because following it on write would
 * create a file wherever it points.
 */
export async function realpathOfDeepestExisting(
  path: string,
): Promise<{ real: string; rest: string[]; dangling: boolean }> {
  const rest: string[] = [];
  let current = path;
  for (;;) {
    try {
      return { real: await realpath(current), rest, dangling: false };
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    try {
      // realpath failed but the entry exists: a symlink whose target is missing.
      if ((await lstat(current)).isSymbolicLink()) return { real: current, rest, dangling: true };
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    const parent = dirname(current);
    if (parent === current) return { real: current, rest, dangling: false };
    rest.unshift(basename(current));
    current = parent;
  }
}

/** The real path of `root`, resolving through any part that does not exist yet. */
async function realRootOf(root: string): Promise<string> {
  const { real, rest } = await realpathOfDeepestExisting(root);
  return rest.length === 0 ? real : join(real, ...rest);
}

/**
 * Creates a file system scoped to `root`.
 *
 * The root's real path is resolved once. Before every operation the deepest existing
 * ancestor of the target is resolved with `realpath` and must equal the real root or lie
 * below it; dangling symlinks on the way are refused. `readDir` hides symlinked entries that
 * escape, and `remove` on a symlink removes only the link.
 *
 * @param root - The absolute project directory.
 */
export function createScopedFileSystem(root: string): ScopedFileSystem {
  let realRoot: Promise<string> | undefined;
  const getRealRoot = (): Promise<string> => {
    realRoot ??= realRootOf(root);
    return realRoot;
  };

  /** The absolute path below the real root, after checking containment. */
  const contained = async (path: string): Promise<string> => {
    assertProjectRelativePath(path);
    const base = await getRealRoot();
    const target = join(base, ...path.split('/'));
    const { real, dangling } = await realpathOfDeepestExisting(target);
    if (dangling || !isWithin(base, real)) throw new PathEscapeError(path);
    return target;
  };

  return {
    root,
    async readFile(path) {
      const buffer = await readFile(await contained(path));
      return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    },
    async writeFile(path, data) {
      const target = await contained(path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, data);
    },
    async readDir(path) {
      const dir = await contained(path);
      const base = await getRealRoot();
      const entries = await readdir(dir, { withFileTypes: true });
      const result: DirEntry[] = [];
      for (const entry of entries) {
        if (entry.isFile()) result.push({ name: entry.name, kind: 'file' });
        else if (entry.isDirectory()) result.push({ name: entry.name, kind: 'directory' });
        else if (entry.isSymbolicLink()) {
          const kind = await containedLinkKind(base, join(dir, entry.name));
          if (kind !== null) result.push({ name: entry.name, kind });
        }
      }
      return result.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    },
    async exists(path) {
      try {
        await stat(await contained(path));
        return true;
      } catch (error) {
        if (isMissing(error)) return false;
        throw error;
      }
    },
    async mkdirp(path) {
      await mkdir(await contained(path), { recursive: true });
    },
    async remove(path) {
      assertProjectRelativePath(path);
      const segments = path.split('/');
      const name = segments.pop() as string;
      // The parent must be contained; the entry itself may be a link that points anywhere.
      const parent =
        segments.length === 0 ? await getRealRoot() : await contained(segments.join('/'));
      const target = join(parent, name);
      let info: Awaited<ReturnType<typeof lstat>>;
      try {
        info = await lstat(target);
      } catch (error) {
        if (isMissing(error)) return;
        throw error;
      }
      if (info.isSymbolicLink()) {
        await unlink(target);
        return;
      }
      await rm(await contained(path), { recursive: true, force: true });
    },
    async stat(path) {
      try {
        const info = await stat(await contained(path));
        if (!info.isFile() && !info.isDirectory()) return null;
        return {
          kind: info.isFile() ? 'file' : 'directory',
          size: info.size,
          mtimeMs: info.mtimeMs,
        };
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
  };
}

/** The kind a symlink resolves to when its real path stays below `base`, otherwise `null`. */
async function containedLinkKind(base: string, link: string): Promise<DirEntry['kind'] | null> {
  try {
    const real = await realpath(link);
    if (!isWithin(base, real)) return null;
    const info = await stat(real);
    if (info.isFile()) return 'file';
    if (info.isDirectory()) return 'directory';
    return null;
  } catch {
    return null; // Dangling or unreadable link.
  }
}
