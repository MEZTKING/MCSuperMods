/**
 * Export folder writes for the combined export (ADR 0015): the user picks a folder, and the
 * renderer then writes the resource and data pack zips into it. Only folders picked in this
 * process lifetime are writable, only single pack-zip names are accepted, and each file is
 * written to a temporary name and renamed over the target, so a reader never sees a partial
 * zip.
 *
 * @packageDocumentation
 */

import { randomBytes } from 'node:crypto';
import { rename, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, normalize } from 'node:path';
import type { PlatformAdapter } from '../../shared/platform';
import { assertPackFileName } from './minecraft';

/** The main-process exports service. */
export type ExportsService = PlatformAdapter['exports'];

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
        assertPackFileName(file.name);
        if (names.has(file.name)) throw new Error(`${file.name} is listed twice.`);
        names.add(file.name);
      }
      const info = await stat(target).catch(() => null);
      if (info === null || !info.isDirectory()) {
        throw new Error(`${target} is not a folder.`);
      }
      const paths: string[] = [];
      for (const file of files) {
        const path = join(target, file.name);
        const temp = join(target, `.${file.name}.${randomBytes(6).toString('hex')}.tmp`);
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
