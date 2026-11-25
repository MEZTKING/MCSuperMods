/**
 * The kept copy and the saved reports of a move (ADR 0136 D6): on each move the project as it
 * was (`msm.project.json` and `content/` only; a move never changes `assets/`) is copied into
 * `.msm/upgrades/<from>-to-<to>-<date>/` with the migration report that was applied (its
 * reverses carry the values a move up dropped, for moving back, D7) and the upgrade report
 * (for **What changed when I moved** and the After moving list). The three newest are kept.
 *
 * Everything goes through the project's own file system (`.msm/` is the project's hidden
 * folder; the loader, `saveProject` and the exporters never read it).
 *
 * @packageDocumentation
 */
import { type ElementKindRegistry, type ProjectFileSystem, type UpgradeReport } from '@msm/core';
import type { MigrationReport, Project } from '@msm/plugin-api';
/** The folder holding the kept copies. */
export declare const UPGRADES_DIR = '.msm/upgrades';
/** How many moves are kept (plan question 2's default). */
export declare const KEPT_UPGRADES = 3;
/** The move's own record in its folder. */
export declare const UPGRADE_META_FILE = 'upgrade.json';
/** The migration report that was applied. */
export declare const UPGRADE_MIGRATION_FILE = 'migration.json';
/** The upgrade report shown before the move. */
export declare const UPGRADE_REPORT_FILE = 'report.json';
/** Ids of the After moving items the user ticked by hand. */
export declare const UPGRADE_TICKED_FILE = 'ticked.json';
/** Where the copy of the project sits inside a move's folder. */
export declare const UPGRADE_COPY_DIR = 'project';
/** The record of one move, as `upgrade.json` holds it. */
export interface SavedUpgradeMeta {
  formatVersion: 1;
  /** The target moved from and its Minecraft version. */
  from: {
    targetId: string;
    mcVersion: string;
  };
  /** The target moved to and its Minecraft version. */
  to: {
    targetId: string;
    mcVersion: string;
  };
  /** When the move was made (ISO 8601). */
  movedAt: string;
  /** The project's files in the copy, relative to its `project/` folder. */
  files: string[];
}
/** One saved move, read back. */
export interface SavedUpgrade extends SavedUpgradeMeta {
  /** The move's folder, relative to the project root. */
  folder: string;
  /** The migration report that was applied (with its reverses). */
  migration: MigrationReport;
  /** The upgrade report, when the dry run had finished before the move. */
  report?: UpgradeReport;
  /** The After moving items ticked by hand. */
  ticked: string[];
}
/** What {@link saveUpgrade} writes. */
export interface SaveUpgradeInput {
  /** The project as it was before the move. */
  project: Project;
  /** The kind registry, for the element files' folders. */
  registry: ElementKindRegistry;
  from: {
    targetId: string;
    mcVersion: string;
  };
  to: {
    targetId: string;
    mcVersion: string;
  };
  migration: MigrationReport;
  report?: UpgradeReport;
  /** The move's time (ISO 8601). */
  movedAt: string;
  /** How many moves to keep; {@link KEPT_UPGRADES} by default. */
  keep?: number;
}
/**
 * The files `saveProject` writes for `project` (`msm.project.json` and one per element under
 * `content/`), as bytes, without touching any real folder.
 */
export declare function projectFileBytes(
  project: Project,
  registry: ElementKindRegistry,
): Promise<Map<string, Uint8Array>>;
/**
 * Saves a move: the copy of the project as it was, `upgrade.json`, `migration.json`, and
 * `report.json` when there is a report; then keeps only the newest `keep` moves.
 *
 * @param fs - The project's file system.
 * @param input - The project before the move and the reports.
 * @returns The saved move.
 */
export declare function saveUpgrade(
  fs: ProjectFileSystem,
  input: SaveUpgradeInput,
): Promise<SavedUpgrade>;
/**
 * Removes every move but the newest `keep`, and the unfinished saves (folders without a
 * record).
 */
export declare function pruneUpgrades(fs: ProjectFileSystem, keep: number): Promise<void>;
/**
 * Every saved move, newest first, with its reports and ticks. A move whose reports cannot be
 * read is listed with an empty migration report.
 *
 * @param fs - The project's file system.
 */
export declare function readSavedUpgrades(fs: ProjectFileSystem): Promise<SavedUpgrade[]>;
/**
 * Writes the ticked After moving items of one saved move.
 *
 * @param fs - The project's file system.
 * @param folder - The move's folder ({@link SavedUpgrade.folder}).
 * @param ticked - The ticked item ids.
 */
export declare function writeTicked(
  fs: ProjectFileSystem,
  folder: string,
  ticked: readonly string[],
): Promise<void>;
//# sourceMappingURL=saved-report.d.ts.map
