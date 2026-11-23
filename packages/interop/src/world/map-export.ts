/**
 * The world copy plan of "Export as a map…" (ADR 0116 D2): which files of a world folder go
 * into a map, which are left out, which MSM adds, and where every entry sits in the map file
 * (a world `.zip`, or a `.mrpack` with the world under `overrides/saves/`, B547 Y14).
 *
 * Pure: the host walks the world folder (skipping symbolic links), asks
 * {@link mapEntryLeftOut} about each entry and streams the kept ones, with
 * {@link mapExtraFiles}, under {@link mapEntryPrefix}. `level.dat` is copied as it is and
 * never written: the world setup's functions set game mode, rules, difficulty and spawn in the
 * game.
 *
 * Left out always: the game's `session.lock` (it may be held open; the game makes a new one)
 * and the dev data pack `datapacks/msm-dev/` that Play and Reload write (ADR 0084 D6; the
 * runtime's other overlays live in the game folder's `msm-dev/`, never in a world). Left out
 * unless "Keep my player data": the players' files (26.x `players/` with `data`,
 * `advancements` and `stats`, B547 Y14; the older top-level `playerdata/`, `advancements/` and
 * `stats/`) and `level.dat_old`. Replaced: an existing `resources.zip` when the map carries the
 * project's resource pack, and an existing `datapacks/<file>` of the same name as the
 * project's data pack.
 *
 * @packageDocumentation
 */

import { DEV_PACK_FOLDER } from '../fabric/dev-session';

/** What a map is written as. */
export type MapPackage = 'world-zip' | 'mrpack';

/** The resource pack file a world folder carries (verify at implementation: B547 Y14). */
export const MAP_RESOURCE_PACK_FILE = 'resources.zip';

/** The world folder's data pack folder. */
export const MAP_DATAPACKS_FOLDER = 'datapacks';

/** Where a `.mrpack` keeps worlds (B547 Y14, the `overrides/` folder of ADR 0046 D4). */
export const MRPACK_SAVES_PREFIX = 'overrides/saves';

/** World entries always left out: the game's lock file. */
export const MAP_ALWAYS_LEFT_OUT: readonly string[] = ['session.lock'];

/** The dev data pack Play writes into its worlds, relative to the world folder. */
export const MAP_DEV_PACK_PATH = `${MAP_DATAPACKS_FOLDER}/${DEV_PACK_FOLDER}`;

/**
 * Top-level world entries holding the players' data, left out unless "Keep my player data":
 * the 26.x `players/` folder (`players/data`, `players/advancements`, `players/stats`), the
 * pre-26 folders of the same data, and `level.dat_old`.
 */
export const MAP_PLAYER_DATA: readonly string[] = [
  'players',
  'playerdata',
  'advancements',
  'stats',
  'level.dat_old',
];

/** Why an entry is not copied. */
export type MapLeftOutReason = 'lock' | 'dev-pack' | 'player-data' | 'replaced';

/** What the plan depends on. */
export interface MapPlanOptions {
  /** "Keep my player data". */
  keepPlayerData: boolean;
  /** The file name the project's data pack gets in `datapacks/`, when the map carries one. */
  dataPackFile?: string | undefined;
  /** Whether the map carries the project's resource pack as `resources.zip`. */
  resourcePack: boolean;
}

/**
 * Whether the world entry at `relative` (`/`-separated, below the world folder, no leading or
 * trailing `/`) is left out of the map, and why; `null` when it is copied. A folder that is
 * left out is left out with everything in it.
 */
export function mapEntryLeftOut(
  relative: string,
  directory: boolean,
  options: MapPlanOptions,
): MapLeftOutReason | null {
  const parts = relative.split('/');
  const top = parts[0] ?? '';
  if (parts.length === 1 && !directory && MAP_ALWAYS_LEFT_OUT.includes(top)) return 'lock';
  if (relative === MAP_DEV_PACK_PATH || relative.startsWith(`${MAP_DEV_PACK_PATH}/`)) {
    return 'dev-pack';
  }
  if (!options.keepPlayerData && MAP_PLAYER_DATA.includes(top)) {
    // `level.dat_old` is a file; the others are folders (a stray file of that name goes too).
    return 'player-data';
  }
  if (!directory && parts.length === 1 && options.resourcePack && top === MAP_RESOURCE_PACK_FILE) {
    return 'replaced';
  }
  if (
    !directory &&
    parts.length === 2 &&
    top === MAP_DATAPACKS_FOLDER &&
    options.dataPackFile !== undefined &&
    parts[1]?.toLowerCase() === options.dataPackFile.toLowerCase()
  ) {
    return 'replaced';
  }
  return null;
}

/**
 * The zip entry prefix of the world folder inside the map: `<folder>` for a world zip,
 * `overrides/saves/<folder>` for a `.mrpack`. No trailing `/`.
 *
 * @throws Error When `folder` is not a map folder name ({@link isMapFolderName}).
 */
export function mapEntryPrefix(pkg: MapPackage, folder: string): string {
  if (!isMapFolderName(folder)) {
    throw new Error(`${JSON.stringify(folder)} is not a valid map folder name.`);
  }
  return pkg === 'mrpack' ? `${MRPACK_SAVES_PREFIX}/${folder}` : folder;
}

/**
 * Whether `name` may be the map's world folder: 1 to 64 characters of letters, digits, space,
 * `.`, `_`, `-`, `(`, `)`, `'`, `!`, `,` and `&`, not starting or ending with a space or `.`
 * (a name Windows and the game's world list both accept).
 */
export function isMapFolderName(name: string): boolean {
  return (
    name.length >= 1 &&
    name.length <= 64 &&
    /^[A-Za-z0-9 ._()'!,&-]+$/.test(name) &&
    !/^[ .]|[ .]$/.test(name)
  );
}

/**
 * A map folder name from free text (the project or world name): characters outside
 * {@link isMapFolderName}'s set become `_`, runs of spaces one space, leading and trailing
 * spaces and dots dropped, at most 64 characters; `map` when nothing is left.
 */
export function mapFolderName(name: string): string {
  const cleaned = name
    .replace(/[^A-Za-z0-9 ._()'!,&-]+/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 64)
    .replace(/^[ .]+|[ .]+$/g, '');
  return cleaned === '' ? 'map' : cleaned;
}

/** The map's file name: `<folder>.zip` or `<folder>.mrpack`. */
export function mapFileName(pkg: MapPackage, folder: string): string {
  return `${mapFolderName(folder)}.${pkg === 'mrpack' ? 'mrpack' : 'zip'}`;
}

/** A jar file name a `.mrpack` map may carry under `overrides/mods/` (as ADR 0046 D4's writer). */
export function isMapJarFileName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._+-]*\.jar$/.test(name) && name.length <= 255;
}

/** A data pack file name a map may carry in `datapacks/`. */
export function isMapPackFileName(name: string): boolean {
  return /^[A-Za-z0-9._ -]+\.zip$/.test(name) && name.length <= 255 && name !== '.zip';
}

/** One file MSM adds to the world folder of a map. */
export interface MapExtraFile {
  /** Relative to the world folder, `/`-separated. */
  path: string;
  data: Uint8Array;
}

/**
 * The files MSM adds to the world: the project's data pack as `datapacks/<file>` and its
 * resource pack as `resources.zip`.
 *
 * @throws Error When the data pack's file name is not a pack zip name.
 */
export function mapExtraFiles(packs: {
  dataPack?: { fileName: string; data: Uint8Array } | undefined;
  resourcePack?: Uint8Array | undefined;
}): MapExtraFile[] {
  const out: MapExtraFile[] = [];
  if (packs.dataPack !== undefined) {
    if (!isMapPackFileName(packs.dataPack.fileName)) {
      throw new Error(`${JSON.stringify(packs.dataPack.fileName)} is not a data pack zip name.`);
    }
    out.push({
      path: `${MAP_DATAPACKS_FOLDER}/${packs.dataPack.fileName}`,
      data: packs.dataPack.data,
    });
  }
  if (packs.resourcePack !== undefined) {
    out.push({ path: MAP_RESOURCE_PACK_FILE, data: packs.resourcePack });
  }
  return out;
}

/** One entry of a world folder as the host lists it (symbolic links already skipped). */
export interface MapWorldEntry {
  /** Relative to the world folder, `/`-separated. */
  path: string;
  directory: boolean;
}

/** The outcome of {@link planMapEntries}. */
export interface MapEntryPlan {
  /** The zip entry names in writing order (folders end with `/`). */
  entries: string[];
  /** Top-most left-out world paths with their reasons, sorted by path. */
  leftOut: { path: string; reason: MapLeftOutReason }[];
}

/**
 * The map's zip entry names for a listed world (the same rules the host applies while
 * streaming): the prefix folders, the world's kept entries in listing order, then
 * {@link mapExtraFiles}. For a `.mrpack` the index and `overrides/mods/` jars are the host's.
 * A left-out folder hides its contents, which are not listed separately.
 */
export function planMapEntries(
  world: readonly MapWorldEntry[],
  pkg: MapPackage,
  folder: string,
  options: MapPlanOptions,
  extras: readonly MapExtraFile[] = [],
): MapEntryPlan {
  const prefix = mapEntryPrefix(pkg, folder);
  const entries: string[] = [];
  const parts = prefix.split('/');
  for (let n = 1; n <= parts.length; n += 1) entries.push(`${parts.slice(0, n).join('/')}/`);
  const leftOut: MapEntryPlan['leftOut'] = [];
  const hidden: string[] = [];
  const written = new Set(entries);
  for (const entry of world) {
    if (hidden.some((dir) => entry.path.startsWith(`${dir}/`))) continue;
    const reason = mapEntryLeftOut(entry.path, entry.directory, options);
    if (reason !== null) {
      leftOut.push({ path: entry.path, reason });
      if (entry.directory) hidden.push(entry.path);
      continue;
    }
    const name = `${prefix}/${entry.path}${entry.directory ? '/' : ''}`;
    entries.push(name);
    written.add(name);
  }
  for (const extra of extras) {
    const segments = extra.path.split('/');
    for (let n = 1; n < segments.length; n += 1) {
      const dir = `${prefix}/${segments.slice(0, n).join('/')}/`;
      if (!written.has(dir)) {
        entries.push(dir);
        written.add(dir);
      }
    }
    entries.push(`${prefix}/${extra.path}`);
  }
  leftOut.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { entries, leftOut };
}
