/**
 * Serves the Gradle wrapper the Java project export copies into the ejected project (ADR 0033
 * D2), so the user can build it with `./gradlew build` and no Gradle installation.
 *
 * - Packaged: `<process.resourcesPath>/runtime/gradle-wrapper/{gradle-wrapper.jar,gradlew,
 *   gradlew.bat}`, copied there by electron-builder's `extraResources` (see
 *   `electron-builder.yml` and `scripts/stage-runtime.mjs`).
 * - Development: `engine-mod/gradle/wrapper/gradle-wrapper.jar`, `engine-mod/gradlew` and
 *   `engine-mod/gradlew.bat` of the source checkout.
 *
 * Any missing or unreadable file makes the whole wrapper `null`, never an error: the exporter
 * then writes the project without it and reports `export.gradle-wrapper-missing` (info).
 *
 * @packageDocumentation
 */

import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { GradleWrapperFiles } from '../../shared/platform';

/** The wrapper folder inside the packaged app's resources folder. */
export const PACKAGED_GRADLE_WRAPPER_DIR = ['runtime', 'gradle-wrapper'] as const;

/** The wrapper's file names in the packaged folder (and the staging folder). */
export const GRADLE_WRAPPER_FILES = {
  jar: 'gradle-wrapper.jar',
  gradlew: 'gradlew',
  gradlewBat: 'gradlew.bat',
} as const;

/** The largest wrapper file read, in bytes (the real jar is about 50 kB). */
export const MAX_GRADLE_WRAPPER_FILE_BYTES = 4 * 1024 * 1024;

/** Where the host looks for the wrapper. */
export interface GradleWrapperLocation {
  /** `app.isPackaged`. */
  isPackaged: boolean;
  /** `process.resourcesPath` (used when packaged). */
  resourcesPath: string;
  /** `engine-mod/` of the source checkout (used in development). */
  devEngineModDir: string;
}

/** The three wrapper paths for this run. */
export function gradleWrapperPaths(location: GradleWrapperLocation): {
  jar: string;
  gradlew: string;
  gradlewBat: string;
} {
  if (location.isPackaged) {
    const dir = join(location.resourcesPath, ...PACKAGED_GRADLE_WRAPPER_DIR);
    return {
      jar: join(dir, GRADLE_WRAPPER_FILES.jar),
      gradlew: join(dir, GRADLE_WRAPPER_FILES.gradlew),
      gradlewBat: join(dir, GRADLE_WRAPPER_FILES.gradlewBat),
    };
  }
  const dir = location.devEngineModDir;
  return {
    jar: join(dir, 'gradle', 'wrapper', GRADLE_WRAPPER_FILES.jar),
    gradlew: join(dir, GRADLE_WRAPPER_FILES.gradlew),
    gradlewBat: join(dir, GRADLE_WRAPPER_FILES.gradlewBat),
  };
}

async function readSmallFile(path: string): Promise<Buffer | null> {
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size === 0 || info.size > MAX_GRADLE_WRAPPER_FILE_BYTES) {
      return null;
    }
    return await readFile(path);
  } catch {
    return null;
  }
}

/**
 * Reads the wrapper, or `null` when any of its files is missing or unreadable.
 *
 * @param location - Packaged or development facts.
 */
export async function readGradleWrapper(
  location: GradleWrapperLocation,
): Promise<GradleWrapperFiles | null> {
  const paths = gradleWrapperPaths(location);
  const [jar, gradlew, gradlewBat] = await Promise.all([
    readSmallFile(paths.jar),
    readSmallFile(paths.gradlew),
    readSmallFile(paths.gradlewBat),
  ]);
  if (jar === null || gradlew === null || gradlewBat === null) return null;
  return {
    jar: new Uint8Array(jar.buffer, jar.byteOffset, jar.byteLength),
    gradlew: gradlew.toString('utf8'),
    gradlewBat: gradlewBat.toString('utf8'),
  };
}
