/**
 * {@link OutputSink} implementations: in memory, zip and host file system.
 *
 * @packageDocumentation
 */

import { assertProjectRelativePath, type OutputSink } from '@msm/plugin-api';
import { createZipBytes } from './zip';

/**
 * A sink that keeps every written file in memory. Used by tests and previews.
 *
 * @returns The sink; `files()` returns a copy of the written files keyed by path.
 */
export function createMemorySink(): OutputSink & { files(): Map<string, Uint8Array> } {
  const written = new Map<string, Uint8Array>();
  return {
    async writeFile(path, contents) {
      assertProjectRelativePath(path);
      written.set(path, contents);
    },
    files: () => new Map(written),
  };
}

/**
 * A sink that collects files and packs them into one deterministic zip.
 *
 * @returns The sink; `finish()` returns the archive bytes (see `createZipBytes`).
 */
export function createZipSink(): OutputSink & { finish(): Uint8Array } {
  const written = new Map<string, Uint8Array>();
  return {
    async writeFile(path, contents) {
      assertProjectRelativePath(path);
      written.set(path, contents);
    },
    finish: () => createZipBytes([...written].map(([path, data]) => ({ path, data }))),
  };
}

/**
 * A sink that forwards each file to a host-supplied writer, for example one that writes into
 * an export folder. Paths are checked before `write` is called.
 *
 * @param write - Writes one file; the path is relative to the export root.
 * @returns The sink.
 */
export function createFileSystemSink(
  write: (path: string, data: Uint8Array) => Promise<void>,
): OutputSink {
  return {
    async writeFile(path, contents) {
      assertProjectRelativePath(path);
      await write(path, contents);
    },
  };
}
