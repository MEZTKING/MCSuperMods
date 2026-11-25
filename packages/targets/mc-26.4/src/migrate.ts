/**
 * `migrateFrom` of this target (ADR 0037 D3, ADR 0136 D3): the shared engine
 * (`@msm/target-migrate`) over this target's change set. Moving a project from `mc-26.3`
 * reports every id that the 26.4 registries no longer have (whole strings in element data as
 * errors, ids inside function lines, scripts and other text as warnings, never rewritten),
 * applies confirmed renames whose replacement is proved the same shape (none today), and drops
 * `default_block` from noise settings, which this target's noise settings do not have (ADR 0036
 * D8: no noise settings data is valid on both targets, so the data is reshaped for the new target
 * as `defaultDataFor` shapes new elements). Pure: the project is never changed; the host applies
 * the report.
 */
import type { MigrationReport, Project, Target } from '@msm/plugin-api';
import {
  createMigration,
  curatedSteps,
  MigrationProblemCodes as EngineProblemCodes,
  idSteps,
  type RemovedIdTables,
} from '@msm/target-migrate';
import { changeSet, curated } from './changes/index';
import {
  KNOWN_RENAMES,
  MOVED_REGISTRIES,
  REMOVED_IDS,
  STILL_REGISTERED_ELSEWHERE,
} from './removed-ids';

/** The problem codes this hook reports. */
export const MigrationProblemCodes = EngineProblemCodes;

/** The data a migration hook is built from; the defaults are this target's change set. */
export interface MigrationTables extends RemovedIdTables {
  /** The target id this hook migrates from. */
  fromTargetId: string;
  /** This target's id; a project already on it needs nothing. */
  toTargetId: string;
  /** This target's Minecraft version, for messages. */
  toVersion: string;
  /**
   * This target's `worldgen.noiseSettingsDefaultBlock` fact (absent means the field exists).
   * When it is `false`, `default_block` is dropped from noise settings elements and from noise
   * settings written inline in dimensions and world presets (the curated steps of the two
   * `default_block` changes).
   */
  noiseSettingsDefaultBlock?: boolean;
}

/** The curated changes whose steps drop `default_block`, run only when the fact says so. */
const DEFAULT_BLOCK_CHANGES = new Set(
  curated.changes
    .filter((entry) => entry.id.endsWith('#/default_block') && entry.steps !== undefined)
    .map((entry) => entry.id),
);

/** Builds a `migrateFrom` hook over `tables` and this target's curated steps. */
export function createMigrateFrom(
  tables: MigrationTables,
): (previous: Target, project: Project) => MigrationReport {
  const fieldSteps = curatedSteps(curated).filter(
    (step) =>
      tables.noiseSettingsDefaultBlock === false || !DEFAULT_BLOCK_CHANGES.has(step.changeId),
  );
  return createMigration({
    from: tables.fromTargetId,
    to: tables.toTargetId,
    version: tables.toVersion,
    steps: [...fieldSteps, ...idSteps(tables)],
    changes: changeSet.changes,
  });
}

/**
 * The tables of this target: from `mc-26.3`, with the removed-id view of the change set.
 *
 * @param noiseSettingsDefaultBlock - This target's `worldgen.noiseSettingsDefaultBlock` fact.
 */
export function migrationTables(
  toTargetId: string,
  toVersion: string,
  noiseSettingsDefaultBlock?: boolean,
): MigrationTables {
  return {
    ...(noiseSettingsDefaultBlock === undefined ? {} : { noiseSettingsDefaultBlock }),
    fromTargetId: changeSet.from,
    toTargetId,
    toVersion,
    removed: REMOVED_IDS,
    moved: MOVED_REGISTRIES,
    stillRegistered: STILL_REGISTERED_ELSEWHERE,
    renames: KNOWN_RENAMES,
  };
}
