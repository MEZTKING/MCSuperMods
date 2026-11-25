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

import {
  createMemoryFileSystem,
  type ElementKindRegistry,
  openItems,
  type ProjectFileSystem,
  parseJson,
  saveProject,
  stableStringify,
  type UpgradeReport,
  type UpgradeTodoItem,
  utf8,
} from '@msm/core';
import type { Json, MigrationReport, Problem, Project } from '@msm/plugin-api';

/** The folder holding the kept copies. */
export const UPGRADES_DIR = '.msm/upgrades';
/** How many moves are kept (plan question 2's default). */
export const KEPT_UPGRADES = 3;
/** The move's own record in its folder. */
export const UPGRADE_META_FILE = 'upgrade.json';
/** The migration report that was applied. */
export const UPGRADE_MIGRATION_FILE = 'migration.json';
/** The upgrade report shown before the move. */
export const UPGRADE_REPORT_FILE = 'report.json';
/** Ids of the After moving items the user ticked by hand. */
export const UPGRADE_TICKED_FILE = 'ticked.json';
/** Where the copy of the project sits inside a move's folder. */
export const UPGRADE_COPY_DIR = 'project';

/** The record of one move, as `upgrade.json` holds it. */
export interface SavedUpgradeMeta {
  formatVersion: 1;
  /** The target moved from and its Minecraft version. */
  from: { targetId: string; mcVersion: string };
  /** The target moved to and its Minecraft version. */
  to: { targetId: string; mcVersion: string };
  /** When the move was made (ISO 8601). */
  movedAt: string;
  /** Counts the project's moves (1 for the first), so two moves in one second keep their order. */
  sequence: number;
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
  from: { targetId: string; mcVersion: string };
  to: { targetId: string; mcVersion: string };
  migration: MigrationReport;
  report?: UpgradeReport;
  /** The move's time (ISO 8601). */
  movedAt: string;
  /** How many moves to keep; {@link KEPT_UPGRADES} by default. */
  keep?: number;
}

/** A folder-safe stamp of an ISO time: `2026-11-25T14-03-07Z`. */
function stamp(iso: string): string {
  return iso.replace(/\.\d+Z$/, 'Z').replaceAll(':', '-');
}

/** A folder name from a target id (ids are `[a-z0-9.-]`; anything else becomes `_`). */
function safe(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]/g, '_');
}

/**
 * The files `saveProject` writes for `project` (`msm.project.json` and one per element under
 * `content/`), as bytes, without touching any real folder.
 */
export async function projectFileBytes(
  project: Project,
  registry: ElementKindRegistry,
): Promise<Map<string, Uint8Array>> {
  const memory = createMemoryFileSystem();
  const saved = await saveProject(memory, project, registry);
  const out = new Map<string, Uint8Array>();
  for (const path of saved.written) out.set(path, await memory.readFile(path));
  return out;
}

const json = (value: unknown): Uint8Array => utf8.encode(`${stableStringify(value as Json)}\n`);

/**
 * Saves a move: the copy of the project as it was, `upgrade.json`, `migration.json`, and
 * `report.json` when there is a report; then keeps only the newest `keep` moves.
 *
 * @param fs - The project's file system.
 * @param input - The project before the move and the reports.
 * @returns The saved move.
 */
export async function saveUpgrade(
  fs: ProjectFileSystem,
  input: SaveUpgradeInput,
): Promise<SavedUpgrade> {
  const base = `${safe(input.from.targetId)}-to-${safe(input.to.targetId)}-${stamp(input.movedAt)}`;
  let name = base;
  for (let count = 2; await fs.exists(`${UPGRADES_DIR}/${name}`); count++) {
    name = `${base}-${count}`;
  }
  const folder = `${UPGRADES_DIR}/${name}`;
  const sequence =
    (await listMeta(fs)).reduce((most, entry) => Math.max(most, entry.meta.sequence), 0) + 1;
  const files = await projectFileBytes(input.project, input.registry);
  for (const [path, bytes] of files) {
    await fs.writeFile(`${folder}/${UPGRADE_COPY_DIR}/${path}`, bytes);
  }
  const meta: SavedUpgradeMeta = {
    formatVersion: 1,
    from: input.from,
    to: input.to,
    movedAt: input.movedAt,
    sequence,
    files: [...files.keys()],
  };
  await fs.writeFile(`${folder}/${UPGRADE_MIGRATION_FILE}`, json(input.migration));
  if (input.report !== undefined) {
    await fs.writeFile(`${folder}/${UPGRADE_REPORT_FILE}`, json(input.report));
  }
  // The record last: a folder without it is an unfinished save and is not listed.
  await fs.writeFile(`${folder}/${UPGRADE_META_FILE}`, json(meta));
  await pruneUpgrades(fs, input.keep ?? KEPT_UPGRADES);
  return {
    ...meta,
    folder,
    migration: structuredClone(input.migration),
    ...(input.report === undefined ? {} : { report: structuredClone(input.report) }),
    ticked: [],
  };
}

async function readJson(fs: ProjectFileSystem, path: string): Promise<unknown> {
  return parseJson(utf8.decode(await fs.readFile(path)));
}

function isMeta(value: unknown): value is SavedUpgradeMeta {
  if (typeof value !== 'object' || value === null) return false;
  const meta = value as Partial<SavedUpgradeMeta>;
  return (
    meta.formatVersion === 1 &&
    typeof meta.from?.targetId === 'string' &&
    typeof meta.to?.targetId === 'string' &&
    typeof meta.movedAt === 'string' &&
    typeof meta.sequence === 'number' &&
    Array.isArray(meta.files)
  );
}

/** The moves' folders with their records, newest first; folders without a record are left out. */
async function listMeta(
  fs: ProjectFileSystem,
): Promise<{ folder: string; meta: SavedUpgradeMeta }[]> {
  if (!(await fs.exists(UPGRADES_DIR))) return [];
  const out: { folder: string; meta: SavedUpgradeMeta }[] = [];
  for (const entry of await fs.readDir(UPGRADES_DIR)) {
    if (entry.kind !== 'directory') continue;
    const folder = `${UPGRADES_DIR}/${entry.name}`;
    try {
      const meta = await readJson(fs, `${folder}/${UPGRADE_META_FILE}`);
      if (isMeta(meta)) out.push({ folder, meta });
    } catch {
      // An unfinished or damaged save: not listed.
    }
  }
  return out.sort(
    (a, b) =>
      compare(b.meta.movedAt, a.meta.movedAt) ||
      b.meta.sequence - a.meta.sequence ||
      compare(b.folder, a.folder),
  );
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Removes every move but the newest `keep`, and the unfinished saves (folders without a
 * record).
 */
export async function pruneUpgrades(fs: ProjectFileSystem, keep: number): Promise<void> {
  if (!(await fs.exists(UPGRADES_DIR))) return;
  const listed = await listMeta(fs);
  const kept = new Set(listed.slice(0, keep).map((entry) => entry.folder));
  for (const entry of await fs.readDir(UPGRADES_DIR)) {
    const folder = `${UPGRADES_DIR}/${entry.name}`;
    if (!kept.has(folder)) await fs.remove(folder);
  }
}

/**
 * Every saved move, newest first, with its reports and ticks. A move whose reports cannot be
 * read is listed with an empty migration report.
 *
 * @param fs - The project's file system.
 */
export async function readSavedUpgrades(fs: ProjectFileSystem): Promise<SavedUpgrade[]> {
  const out: SavedUpgrade[] = [];
  for (const { folder, meta } of await listMeta(fs)) {
    let migration: MigrationReport = { changes: [], problems: [] };
    try {
      migration = (await readJson(fs, `${folder}/${UPGRADE_MIGRATION_FILE}`)) as MigrationReport;
    } catch {
      // Listed without its migration report.
    }
    let report: UpgradeReport | undefined;
    if (await fs.exists(`${folder}/${UPGRADE_REPORT_FILE}`)) {
      try {
        report = (await readJson(fs, `${folder}/${UPGRADE_REPORT_FILE}`)) as UpgradeReport;
      } catch {
        report = undefined;
      }
    }
    let ticked: string[] = [];
    if (await fs.exists(`${folder}/${UPGRADE_TICKED_FILE}`)) {
      try {
        const value = await readJson(fs, `${folder}/${UPGRADE_TICKED_FILE}`);
        if (Array.isArray(value)) ticked = value.filter((id) => typeof id === 'string');
      } catch {
        ticked = [];
      }
    }
    out.push({ ...meta, folder, migration, ...(report === undefined ? {} : { report }), ticked });
  }
  return out;
}

/**
 * Writes the ticked After moving items of one saved move.
 *
 * @param fs - The project's file system.
 * @param folder - The move's folder ({@link SavedUpgrade.folder}).
 * @param ticked - The ticked item ids.
 */
export async function writeTicked(
  fs: ProjectFileSystem,
  folder: string,
  ticked: readonly string[],
): Promise<void> {
  await fs.writeFile(`${folder}/${UPGRADE_TICKED_FILE}`, json([...new Set(ticked)].sort()));
}

/**
 * The After moving list of a saved move (ADR 0136 D6, B810 V12): its part 3 items still open
 * in the project as it is now (`openItems` of `@msm/core`, with the move's ticks).
 *
 * @param saved - The saved move; without a report it has no list.
 * @param problems - The project's live problems.
 * @param project - The project now.
 */
export function openUpgradeItemsOf(
  saved: SavedUpgrade,
  problems: readonly Problem[],
  project: Project,
): UpgradeTodoItem[] {
  if (saved.report === undefined) return [];
  return openItems(saved.report, problems, project, new Set(saved.ticked));
}
