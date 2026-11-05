/**
 * Export folder writes for the combined export (ADR 0015) and the plugin exporters (ADR
 * 0021): the user picks a folder, and the renderer then writes the pack zips, or the structure
 * files (`<namespace>/<path>.nbt` or `.schem`), into it. Only folders picked in this process
 * lifetime are writable, only pack-zip names and structure paths are accepted, subfolders
 * must stay inside the picked folder after resolving links, and each file is written to a
 * temporary name and renamed over the target, so a reader never sees a partial file.
 *
 * @packageDocumentation
 */

import { randomBytes } from 'node:crypto';
import { mkdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, relative, sep } from 'node:path';
import { isExportFileName } from '../../shared/ipc-contract';
import type { PlatformAdapter } from '../../shared/platform';

/** Whether the resolved `child` is `parent` or inside it. */
function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel) && !rel.startsWith(sep));
}

/** The main-process exports service. */
export type ExportsService = Omit<PlatformAdapter['exports'], 'runtimeJar' | 'geckolibJar'>;

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
  };
}
