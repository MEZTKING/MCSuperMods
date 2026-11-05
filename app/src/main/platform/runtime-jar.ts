/**
 * Finds and reads the `msm_runtime` jar the Fabric content jar nests, one per target
 * (ADR 0026 D4, ADR 0038 D4).
 *
 * - Packaged: `<process.resourcesPath>/runtime/msm_runtime-mc-<mc>.jar`, copied there by
 *   electron-builder's `extraResources` (see `electron-builder.yml` and
 *   `scripts/stage-runtime.mjs`).
 * - Development: the newest `msm_runtime-<version>+mc<mc>.jar` in `engine-mod/build/libs/` (by
 *   modification time, then name), skipping the `-sources` and `-dev` jars Gradle also writes.
 *
 * `<mc>` is the target's runtime version key ({@link runtimeVersionKey}): its `mcVersion` up to
 * the first `-` (`26.4-snapshot-7` → `26.4`). A missing jar is `null`, never an error: the
 * exporter then reports `export.runtime-missing` and the user can still choose "Separate
 * runtime and GeckoLib (for modpacks)".
 *
 * Pure Node (no `@msm/targets`), so `scripts/stage-runtime.mjs` can import it.
 *
 * @packageDocumentation
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

/** The packaged runtime folder inside the app's resources folder. */
export const PACKAGED_RUNTIME_DIR = 'runtime';

/** The largest runtime jar read, in bytes (the real jar is well under 1 MB). */
export const MAX_RUNTIME_JAR_BYTES = 64 * 1024 * 1024;

/** A Gradle runtime jar name: `msm_runtime-<version>+mc<mc>.jar`, not `-sources` or `-dev`. */
const RUNTIME_JAR_NAME = /^msm_runtime-.+\+mc([0-9][0-9A-Za-z.]*)\.jar$/;
const EXCLUDED_SUFFIX = /-(?:sources|dev)\.jar$/;
/** A runtime version key: digits and dots, for example `26.3`. */
const VERSION_KEY = /^[0-9][0-9A-Za-z.]*$/;

/** Where the host looks for the runtime jars. */
export interface RuntimeJarLocation {
  /** `app.isPackaged`. */
  isPackaged: boolean;
  /** `process.resourcesPath` (used when packaged). */
  resourcesPath: string;
  /** `engine-mod/build/libs/` of the source checkout (used in development). */
  devLibsDir: string;
}

/**
 * The runtime version key of a target: its `mcVersion` up to the first `-` (`26.4-snapshot-7`
 * → `26.4`, `26.3` → `26.3`). It also equals the target id without `mc-`.
 *
 * @param mcVersion - The target's `mcVersion`.
 */
export function runtimeVersionKey(mcVersion: string): string {
  const dash = mcVersion.indexOf('-');
  return dash < 0 ? mcVersion : mcVersion.slice(0, dash);
}

/** The staged and packaged file name of the runtime for a version key: `msm_runtime-mc-<mc>.jar`. */
export function stagedRuntimeJarName(versionKey: string): string {
  return `msm_runtime-mc-${versionKey}.jar`;
}

/**
 * The version key of a Gradle runtime jar name (`msm_runtime-0.6.1+mc26.3.jar` → `26.3`), or
 * `null` for anything else (sources and dev jars, jars without `+mc<mc>`).
 */
export function runtimeJarVersionKey(name: string): string | null {
  if (EXCLUDED_SUFFIX.test(name)) return null;
  return RUNTIME_JAR_NAME.exec(name)?.[1] ?? null;
}

/** Whether `name` is a runtime jar Gradle built for a version (not its sources or dev jar). */
export function isRuntimeJarName(name: string): boolean {
  return runtimeJarVersionKey(name) !== null;
}

/**
 * The newest runtime jar of every version key in `dir` (an empty map when there is none or
 * `dir` is missing).
 *
 * @param dir - `engine-mod/build/libs/`.
 */
export async function newestRuntimeJars(dir: string): Promise<Map<string, string>> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return new Map();
  }
  const best = new Map<string, { path: string; name: string; mtime: number }>();
  for (const name of names) {
    const key = runtimeJarVersionKey(name);
    if (key === null) continue;
    const path = join(dir, name);
    const info = await stat(path).catch(() => null);
    if (info === null || !info.isFile()) continue;
    const mtime = info.mtimeMs;
    const current = best.get(key);
    if (
      current === undefined ||
      mtime > current.mtime ||
      (mtime === current.mtime && name > current.name)
    ) {
      best.set(key, { path, name, mtime });
    }
  }
  return new Map([...best].map(([key, entry]) => [key, entry.path]));
}

/**
 * The newest runtime jar for `versionKey` in `dir`, or `null` when there is none.
 *
 * @param dir - `engine-mod/build/libs/`.
 * @param versionKey - The target's runtime version key, for example `26.3`.
 */
export async function newestRuntimeJar(dir: string, versionKey: string): Promise<string | null> {
  return (await newestRuntimeJars(dir)).get(versionKey) ?? null;
}

/**
 * The runtime jar's path for this run and target, or `null` when there is none.
 *
 * @param location - Packaged or development facts.
 * @param versionKey - The target's runtime version key ({@link runtimeVersionKey}).
 */
export async function resolveRuntimeJarPath(
  location: RuntimeJarLocation,
  versionKey: string,
): Promise<string | null> {
  if (!VERSION_KEY.test(versionKey)) return null;
  if (!location.isPackaged) return newestRuntimeJar(location.devLibsDir, versionKey);
  const path = join(location.resourcesPath, PACKAGED_RUNTIME_DIR, stagedRuntimeJarName(versionKey));
  const info = await stat(path).catch(() => null);
  return info?.isFile() === true ? path : null;
}

/**
 * Reads the runtime jar's bytes for a target, or `null` when there is no jar or it cannot be
 * read.
 *
 * @param location - Packaged or development facts.
 * @param versionKey - The target's runtime version key ({@link runtimeVersionKey}).
 */
export async function readRuntimeJar(
  location: RuntimeJarLocation,
  versionKey: string,
): Promise<Uint8Array | null> {
  const path = await resolveRuntimeJarPath(location, versionKey);
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
