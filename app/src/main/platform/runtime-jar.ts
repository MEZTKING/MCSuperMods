/**
 * Finds and reads the `msm_runtime` jar the Fabric content jar nests (ADR 0026 D4).
 *
 * - Packaged: `<process.resourcesPath>/runtime/msm_runtime.jar`, copied there by
 *   electron-builder's `extraResources` (see `electron-builder.yml` and
 *   `scripts/stage-runtime.mjs`).
 * - Development: the newest `msm_runtime-<version>.jar` in `engine-mod/build/libs/` (by
 *   modification time, then name), skipping the `-sources` and `-dev` jars Gradle also writes.
 *
 * A missing jar is `null`, never an error: the exporter then reports `export.runtime-missing`
 * and the user can still choose "Separate runtime (for modpacks)".
 *
 * @packageDocumentation
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

/** The runtime jar's path inside the packaged app's resources folder. */
export const PACKAGED_RUNTIME_JAR = ['runtime', 'msm_runtime.jar'] as const;

/** The largest runtime jar read, in bytes (the real jar is well under 1 MB). */
export const MAX_RUNTIME_JAR_BYTES = 64 * 1024 * 1024;

/** A Gradle runtime jar name: `msm_runtime-<version>.jar`, not `-sources` or `-dev`. */
const RUNTIME_JAR_NAME = /^msm_runtime-.+\.jar$/;
const EXCLUDED_SUFFIX = /-(?:sources|dev)\.jar$/;

/** Where the host looks for the runtime jar. */
export interface RuntimeJarLocation {
  /** `app.isPackaged`. */
  isPackaged: boolean;
  /** `process.resourcesPath` (used when packaged). */
  resourcesPath: string;
  /** `engine-mod/build/libs/` of the source checkout (used in development). */
  devLibsDir: string;
}

/** Whether `name` is a runtime jar Gradle built (not its sources or dev jar). */
export function isRuntimeJarName(name: string): boolean {
  return RUNTIME_JAR_NAME.test(name) && !EXCLUDED_SUFFIX.test(name);
}

/**
 * The newest runtime jar in `dir`, or `null` when there is none (or `dir` is missing).
 *
 * @param dir - `engine-mod/build/libs/`.
 */
export async function newestRuntimeJar(dir: string): Promise<string | null> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return null;
  }
  let best: { path: string; name: string; mtime: number } | null = null;
  for (const name of names) {
    if (!isRuntimeJarName(name)) continue;
    const path = join(dir, name);
    const info = await stat(path).catch(() => null);
    if (info === null || !info.isFile()) continue;
    const mtime = info.mtimeMs;
    if (best === null || mtime > best.mtime || (mtime === best.mtime && name > best.name)) {
      best = { path, name, mtime };
    }
  }
  return best === null ? null : best.path;
}

/**
 * The runtime jar's path for this run, or `null` when there is none.
 *
 * @param location - Packaged or development facts.
 */
export async function resolveRuntimeJarPath(location: RuntimeJarLocation): Promise<string | null> {
  if (!location.isPackaged) return newestRuntimeJar(location.devLibsDir);
  const path = join(location.resourcesPath, ...PACKAGED_RUNTIME_JAR);
  const info = await stat(path).catch(() => null);
  return info?.isFile() === true ? path : null;
}

/**
 * Reads the runtime jar's bytes, or `null` when there is no jar or it cannot be read.
 *
 * @param location - Packaged or development facts.
 */
export async function readRuntimeJar(location: RuntimeJarLocation): Promise<Uint8Array | null> {
  const path = await resolveRuntimeJarPath(location);
  if (path === null) return null;
  try {
    const info = await stat(path);
    if (info.size > MAX_RUNTIME_JAR_BYTES) return null;
    const buffer = await readFile(path);
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  } catch {
    return null;
  }
}
