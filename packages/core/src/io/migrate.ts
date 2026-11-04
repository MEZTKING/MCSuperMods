/**
 * Append-only `formatVersion` migrations for project and element documents.
 *
 * @packageDocumentation
 */

import type { JsonObject } from '@msm/plugin-api';

/**
 * Upgrades a document from one format version to the next.
 *
 * Migrators are append-only: once shipped, a migrator is never edited.
 */
export interface Migrator {
  /** The version this migrator reads. */
  from: number;
  /** The version this migrator writes; always `from + 1`, so chains have no gaps. */
  to: number;
  /** Returns the upgraded document. Must not rely on the input being mutable. */
  migrate(document: JsonObject): JsonObject;
}

/**
 * Thrown when a document's `formatVersion` is missing, newer than this build supports, or
 * has no migration path to the current version.
 */
export class UnsupportedFormatVersionError extends Error {
  /**
   * @param message - What was unsupported.
   */
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedFormatVersionError';
  }
}

/**
 * Migrates a document to `currentVersion` by chaining migrators.
 *
 * The result's `formatVersion` is always `currentVersion`. A document already at the current
 * version is returned unchanged.
 *
 * @param document - A parsed project or element document.
 * @param migrators - The available migrators.
 * @param currentVersion - The version to migrate to.
 * @returns The migrated document.
 * @throws {@link UnsupportedFormatVersionError} If `formatVersion` is not a positive integer,
 *   is newer than `currentVersion`, or no `from -> from + 1` migrator continues the chain.
 */
export function migrateDocument(
  document: JsonObject,
  migrators: readonly Migrator[],
  currentVersion: number,
): JsonObject {
  const version = document.formatVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new UnsupportedFormatVersionError(
      `Missing or invalid formatVersion ${JSON.stringify(version ?? null)}.`,
    );
  }
  if (version > currentVersion) {
    throw new UnsupportedFormatVersionError(
      `formatVersion ${version} is newer than the supported version ${currentVersion}; update MCSuperMods to open this file.`,
    );
  }
  let current = document;
  let at = version;
  while (at < currentVersion) {
    const migrator = migrators.find((candidate) => candidate.from === at);
    if (migrator === undefined || migrator.to !== at + 1) {
      throw new UnsupportedFormatVersionError(
        `No migrator from formatVersion ${at} towards ${currentVersion}.`,
      );
    }
    current = { ...migrator.migrate(current), formatVersion: migrator.to };
    at = migrator.to;
  }
  return current;
}
