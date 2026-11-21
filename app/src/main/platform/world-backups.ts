/**
 * World backups before installing into a world (ADR 0102 D1–D3). Before a data pack goes into
 * `<gameDir>/saves/<world>/datapacks/`, the Minecraft service asks this service to zip the
 * whole world folder into `<msmHome>/backups/<location>/<world-dir>/<YYYY-MM-DD_HH-mm-ss>.zip`.
 * The zip is streamed into a temporary file beside it and renamed into place once complete, so
 * a half-written backup never carries a backup's name; the oldest backups beyond
 * `backups.keep` are deleted only after a new one succeeded. Restore unpacks a backup beside
 * the world as `<world-dir>-restored-<stamp>`, never over the live world.
 *
 * Writes stay inside the real `<msmHome>/backups/` folder (backups) or the real `saves/`
 * folder the caller checked (restores). Symbolic links inside a world are not followed or
 * copied, and Minecraft's `session.lock` is left out (as the game's own Make Backup does).
 *
 * @packageDocumentation
 */

import { createHash, randomBytes } from 'node:crypto';
import {
  type FileHandle,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, normalize } from 'node:path';
import { type GameLocation, isPathInside, isSafeSegment, locationPathKey } from '@msm/interop';
import { Unzip, UnzipInflate, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import type {
  GameLocationRef,
  WorldBackupEntry,
  WorldBackupGroup,
  WorldBackupList,
  WorldBackupRef,
  WorldBackupRestoreRequest,
  WorldBackupSettings,
} from '../../shared/platform';

/** The backups folder name below the MSM home directory. */
export const BACKUPS_DIR = 'backups';

/** Backup zip names: `YYYY-MM-DD_HH-mm-ss.zip`, with `-2`, `-3` for the same second. */
export const BACKUP_FILE_NAME = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:-\d{1,4})?\.zip$/;

/** World files that are never backed up: the game's lock file (it may be held open). */
const SKIPPED_FILES = new Set(['session.lock']);

/** Extensions whose contents are already compressed; stored as they are. */
const STORED_EXTENSIONS = /\.(?:mca|mcc|dat|dat_old|nbt|png|zip|jar|gz)$/i;

/** The most entries and bytes a zip without ZIP64 can hold (fflate writes none). */
const ZIP_MAX_ENTRIES = 0xffff;
const ZIP_MAX_BYTES = 0xffffffff;

/** Chunk size for reading a backup during a restore. */
const READ_CHUNK = 1024 * 1024;

/** Two digits. */
const pad = (value: number): string => String(value).padStart(2, '0');

/** A local time as `YYYY-MM-DD_HH-mm-ss` (backup file names and restored folders). */
export function backupStamp(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(
    date.getHours(),
  )}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

/**
 * The folder name of a game location under `backups/`: `<launcher>-<instance|default>-<hash>`,
 * where the instance part keeps only letters, digits, `.`, `_` and `-` (at most 48) and the
 * hash is the first 8 hex digits of the SHA-1 of the launcher root's comparison key, so two
 * launcher folders with the same instance name do not share a folder.
 */
export function locationSlug(ref: GameLocationRef): string {
  const instance = (ref.instance ?? 'default').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 48);
  const hash = createHash('sha1').update(locationPathKey(ref.root)).digest('hex').slice(0, 8);
  return `${ref.launcher}-${instance === '' || /^\.+$/.test(instance) ? 'instance' : instance}-${hash}`;
}

/** What {@link createWorldBackupService} needs. */
export interface WorldBackupServiceDeps {
  /** The MSM home directory; backups go in `<msmHome>/backups/`. */
  msmHome: string;
  /** The stored backup settings. */
  settings: { backupSettings(): Promise<WorldBackupSettings> };
  /** The current time (backup and restore stamps). Defaults to `new Date()`. */
  now?(): Date;
  /** Opens a folder in the OS file manager; resolves an error text or `''`. */
  openPath?(path: string): Promise<string>;
  /** Reads one world file. Defaults to `fs.readFile` (tests inject failures). */
  readFile?(path: string): Promise<Uint8Array>;
}

/** The world backup service. */
export interface WorldBackupService {
  /** `<msmHome>/backups`. */
  readonly folder: string;
  /**
   * Backs up the world folder `realWorld` (already checked to lie inside its `saves/`) when
   * `backups.beforeInstall` is on, then deletes the oldest beyond `backups.keep`. Resolves the
   * new backup, or `null` when backups are off. Rejects when the backup cannot be made.
   */
  beforeInstall(
    location: GameLocation,
    worldDir: string,
    realWorld: string,
  ): Promise<WorldBackupRef | null>;
  /** Every backup, grouped by location and world; names come from `locations`. */
  list(locations: readonly GameLocation[]): Promise<WorldBackupList>;
  /** The real path of an existing backup zip, after checking every part of the request. */
  resolveBackup(request: WorldBackupRestoreRequest): Promise<string>;
  /**
   * Unpacks the backup at `zipPath` into a new folder `<worldDir>-restored-<stamp>` of
   * `realSaves` (through a temporary folder renamed into place). Never touches existing folders.
   */
  restoreInto(
    zipPath: string,
    realSaves: string,
    worldDir: string,
  ): Promise<{ dir: string; path: string }>;
  /** Opens the backups folder, creating it when missing. */
  openFolder(): Promise<void>;
}

const tempName = (name: string): string => `.${name}.${randomBytes(6).toString('hex')}.tmp`;

/** The comparison key of a backup file name: without `.zip`, so `x` sorts before `x-2`. */
const backupKey = (fileName: string): string => fileName.slice(0, -'.zip'.length);

const byBackupKey = (a: string, b: string): number => {
  const [ka, kb] = [backupKey(a), backupKey(b)];
  return ka < kb ? -1 : ka > kb ? 1 : 0;
};

async function realOrNull(path: string): Promise<string | null> {
  try {
    return await realpath(path);
  } catch {
    return null;
  }
}

/** Whether `child` is `parent` itself or inside it (both resolved). */
function isSameOrInside(parent: string, child: string): boolean {
  return locationPathKey(parent) === locationPathKey(child) || isPathInside(parent, child);
}

/** Directory entries that are plain files or folders (symbolic links are skipped). */
async function plainEntries(dir: string): Promise<{ name: string; directory: boolean }[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => !entry.isSymbolicLink() && (entry.isFile() || entry.isDirectory()))
    .map((entry) => ({ name: entry.name, directory: entry.isDirectory() }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * Streams the folder `root` into the zip `out` with every entry under `top/`, through a
 * temporary file in the same folder that is renamed into place when complete and removed on
 * failure. Folders are kept as entries, so empty ones come back on a restore.
 */
async function zipFolder(
  root: string,
  top: string,
  out: string,
  read: (path: string) => Promise<Uint8Array>,
  skipDir: (path: string) => boolean,
): Promise<void> {
  const temp = join(dirname(out), tempName(basename(out)));
  const handle: FileHandle = await open(temp, 'wx');
  let closed = false;
  try {
    const pending: Uint8Array[] = [];
    let failure: Error | null = null;
    let finished = false;
    let written = 0;
    let entries = 0;
    const zip = new Zip((error, chunk, final) => {
      if (error !== null) {
        failure = error;
        return;
      }
      pending.push(chunk);
      if (final) finished = true;
    });
    const flush = async (): Promise<void> => {
      for (let chunk = pending.shift(); chunk !== undefined; chunk = pending.shift()) {
        written += chunk.length;
        if (written > ZIP_MAX_BYTES) {
          throw new Error('The world is too large to back up (over 4 GB).');
        }
        await handle.write(chunk);
      }
      if (failure !== null) throw failure;
    };
    const add = (name: string, data: Uint8Array, mtime: Date, compress: boolean): void => {
      entries += 1;
      if (entries > ZIP_MAX_ENTRIES) {
        throw new Error(`The world has too many files to back up (over ${ZIP_MAX_ENTRIES}).`);
      }
      const entry = compress ? new ZipDeflate(name, { level: 6 }) : new ZipPassThrough(name);
      entry.mtime = mtime;
      zip.add(entry);
      entry.push(data, true);
    };

    const walk = async (dir: string, relative: string): Promise<void> => {
      for (const entry of await plainEntries(dir)) {
        const path = join(dir, entry.name);
        const name = `${relative}/${entry.name}`;
        if (entry.directory) {
          if (skipDir(path)) continue;
          add(`${name}/`, new Uint8Array(0), (await lstat(path)).mtime, false);
          await flush();
          await walk(path, name);
          continue;
        }
        if (relative === top && SKIPPED_FILES.has(entry.name)) continue;
        const info = await lstat(path);
        const data = await read(path);
        add(name, data, info.mtime, !STORED_EXTENSIONS.test(entry.name));
        await flush();
      }
    };

    add(`${top}/`, new Uint8Array(0), (await lstat(root)).mtime, false);
    await walk(root, top);
    zip.end();
    await flush();
    if (!finished) throw new Error('The backup zip could not be finished.');
    await handle.sync();
    await handle.close();
    closed = true;
    await rename(temp, out);
  } catch (error) {
    if (!closed) await handle.close().catch(() => {});
    await rm(temp, { force: true });
    throw error;
  }
}

/**
 * The parts of a zip entry name below its top folder, or `null` when the name is unsafe
 * (absolute, `..`, backslashes, drive letters, empty segments) or has a different top folder.
 */
function entryParts(name: string, top: string | null): { top: string; parts: string[] } | null {
  const trimmed = name.endsWith('/') ? name.slice(0, -1) : name;
  const segments = trimmed.split('/');
  if (segments.length === 0 || !segments.every(isSafeSegment)) return null;
  const [first, ...parts] = segments;
  if (first === undefined || (top !== null && first !== top)) return null;
  return { top: first, parts };
}

/** Unpacks the zip at `zipPath` into the empty folder `target`, dropping the top folder. */
async function unzipInto(zipPath: string, target: string): Promise<void> {
  const queue: (() => Promise<void>)[] = [];
  let failure: Error | null = null;
  let top: string | null = null;
  let sawLevelDat = false;
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (file) => {
    if (failure !== null) return;
    const parsed = entryParts(file.name, top);
    if (parsed === null) {
      failure = new Error(`The backup holds an unsafe entry ${JSON.stringify(file.name)}.`);
      return;
    }
    top = parsed.top;
    const dest = join(target, ...parsed.parts);
    if (file.name.endsWith('/')) {
      if (parsed.parts.length > 0) queue.push(() => mkdir(dest, { recursive: true }).then());
      return;
    }
    if (parsed.parts.length === 0) {
      failure = new Error(`The backup holds a stray file ${JSON.stringify(file.name)}.`);
      return;
    }
    if (parsed.parts.length === 1 && parsed.parts[0] === 'level.dat') sawLevelDat = true;
    const chunks: Uint8Array[] = [];
    file.ondata = (error, chunk, final) => {
      if (error !== null) {
        failure = error;
        return;
      }
      chunks.push(chunk);
      if (!final) return;
      queue.push(async () => {
        await mkdir(dirname(dest), { recursive: true });
        const size = chunks.reduce((total, part) => total + part.length, 0);
        const data = new Uint8Array(size);
        let offset = 0;
        for (const part of chunks) {
          data.set(part, offset);
          offset += part.length;
        }
        await writeFile(dest, data, { flag: 'wx' });
      });
    };
    file.start();
  };

  const handle = await open(zipPath, 'r');
  try {
    const buffer = new Uint8Array(READ_CHUNK);
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, READ_CHUNK, null);
      unzip.push(buffer.slice(0, bytesRead), bytesRead === 0);
      for (let task = queue.shift(); task !== undefined; task = queue.shift()) await task();
      if (failure !== null) throw failure;
      if (bytesRead === 0) break;
    }
  } finally {
    await handle.close();
  }
  if (top === null) throw new Error('The backup is empty.');
  if (!sawLevelDat) throw new Error('The backup holds no level.dat, so it is not a world.');
}

/** Creates the world backup service. */
export function createWorldBackupService(deps: WorldBackupServiceDeps): WorldBackupService {
  const folder = normalize(join(deps.msmHome, BACKUPS_DIR));
  const now = deps.now ?? (() => new Date());
  const read = deps.readFile ?? ((path: string) => readFile(path));

  /** Creates `<backups>/<parts…>` and checks it resolves inside the real backups folder. */
  const containedDir = async (...parts: string[]): Promise<{ root: string; dir: string }> => {
    await mkdir(folder, { recursive: true });
    const dir = join(folder, ...parts);
    await mkdir(dir, { recursive: true });
    const [root, real] = await Promise.all([realpath(folder), realOrNull(dir)]);
    if (real === null || !isPathInside(root, real)) {
      throw new Error('The backup folder is outside the MSM backups folder.');
    }
    return { root, dir: real };
  };

  /** Backup zips in one world's folder, oldest first. */
  const zipsIn = async (dir: string): Promise<string[]> => {
    try {
      return (await plainEntries(dir))
        .filter((entry) => !entry.directory && BACKUP_FILE_NAME.test(entry.name))
        .map((entry) => entry.name)
        .sort(byBackupKey);
    } catch {
      return [];
    }
  };

  return {
    folder,

    async beforeInstall(location, worldDir, realWorld) {
      const settings = await deps.settings.backupSettings();
      if (!settings.beforeInstall) return null;
      if (!isSafeSegment(worldDir)) {
        throw new Error(`${JSON.stringify(worldDir)} is not a valid world folder name.`);
      }
      const slug = locationSlug(location.ref);
      const { root, dir } = await containedDir(slug, worldDir);
      const stamp = backupStamp(now());
      let fileName = `${stamp}.zip`;
      for (let n = 2; (await realOrNull(join(dir, fileName))) !== null; n += 1) {
        fileName = `${stamp}-${n}.zip`;
      }
      const out = join(dir, fileName);
      // A backups folder inside the world (an unusual MSM home) is not zipped into itself.
      await zipFolder(realWorld, worldDir, out, read, (path) => isSameOrInside(root, path));
      // Only now that the new backup exists are the oldest beyond `keep` deleted.
      const zips = await zipsIn(dir);
      for (const old of zips.slice(0, Math.max(0, zips.length - settings.keep))) {
        await rm(join(dir, old), { force: true });
      }
      return { path: out, fileName, location: slug, worldDir };
    },

    async list(locations) {
      const names = new Map(locations.map((entry) => [locationSlug(entry.ref), entry]));
      const groups: WorldBackupGroup[] = [];
      let locationDirs: { name: string; directory: boolean }[] = [];
      try {
        locationDirs = await plainEntries(folder);
      } catch {
        return { folder, groups };
      }
      for (const locationDir of locationDirs) {
        if (!locationDir.directory || !isSafeSegment(locationDir.name)) continue;
        const known = names.get(locationDir.name);
        for (const worldDir of await plainEntries(join(folder, locationDir.name))) {
          if (!worldDir.directory || !isSafeSegment(worldDir.name)) continue;
          const dir = join(folder, locationDir.name, worldDir.name);
          const backups: WorldBackupEntry[] = [];
          for (const fileName of (await zipsIn(dir)).reverse()) {
            const path = join(dir, fileName);
            try {
              const info = await lstat(path);
              backups.push({
                fileName,
                path,
                size: info.size,
                createdAt: info.mtime.toISOString(),
              });
            } catch {
              // Deleted while listing.
            }
          }
          if (backups.length === 0) continue;
          groups.push({
            location: locationDir.name,
            locationName: known?.displayName ?? locationDir.name,
            available: known !== undefined,
            worldDir: worldDir.name,
            backups,
          });
        }
      }
      groups.sort((a, b) =>
        a.locationName !== b.locationName
          ? a.locationName < b.locationName
            ? -1
            : 1
          : a.worldDir < b.worldDir
            ? -1
            : a.worldDir > b.worldDir
              ? 1
              : 0,
      );
      return { folder, groups };
    },

    async resolveBackup(request) {
      if (
        !isSafeSegment(request.location) ||
        !isSafeSegment(request.worldDir) ||
        !BACKUP_FILE_NAME.test(request.fileName)
      ) {
        throw new Error('That is not a world backup.');
      }
      const path = join(folder, request.location, request.worldDir, request.fileName);
      const [root, real] = await Promise.all([realOrNull(folder), realOrNull(path)]);
      if (root === null || real === null) throw new Error('That backup no longer exists.');
      if (!isPathInside(root, real)) {
        throw new Error('The backup is outside the MSM backups folder.');
      }
      if (!(await lstat(real)).isFile()) throw new Error('That backup no longer exists.');
      return real;
    },

    async restoreInto(zipPath, realSaves, worldDir) {
      const stamp = backupStamp(now());
      const base = `${worldDir.slice(0, 255 - '-restored-'.length - stamp.length - 3)}-restored-${stamp}`;
      let dir = base;
      for (let n = 2; (await realOrNull(join(realSaves, dir))) !== null; n += 1) {
        dir = `${base}-${n}`;
      }
      const temp = join(realSaves, tempName('msm-restore'));
      await mkdir(temp);
      try {
        const realTemp = await realpath(temp);
        if (!isPathInside(realSaves, realTemp)) {
          throw new Error('The restore folder is outside the saves folder.');
        }
        await unzipInto(zipPath, realTemp);
        const path = join(realSaves, dir);
        if ((await realOrNull(path)) !== null) {
          throw new Error(`${JSON.stringify(dir)} already exists in the saves folder.`);
        }
        await rename(realTemp, path);
        return { dir, path };
      } catch (error) {
        await rm(temp, { recursive: true, force: true });
        throw error;
      }
    },

    async openFolder() {
      await mkdir(folder, { recursive: true });
      if (deps.openPath === undefined) return;
      const failure = await deps.openPath(folder);
      if (failure !== '') throw new Error(`The backups folder could not be opened: ${failure}`);
    },
  };
}
