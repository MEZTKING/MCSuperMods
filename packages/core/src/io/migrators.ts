/**
 * The shipped migrators. Append-only: never edit or remove an entry once released.
 *
 * @packageDocumentation
 */

import type { Migrator } from './migrate';

/** Migrators for `msm.project.json`. Empty while the format is at version 1. */
export const projectMigrators: readonly Migrator[] = Object.freeze([]);

/** Migrators for element files. Empty while the format is at version 1. */
export const elementMigrators: readonly Migrator[] = Object.freeze([]);
