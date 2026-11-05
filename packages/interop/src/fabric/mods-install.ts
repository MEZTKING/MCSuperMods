/**
 * Installs into a `mods/` folder (ADR 0026 D5). The app records every file it writes there in
 * `mods/.msm-installed.json` with its SHA-512, and only ever replaces or removes a file that
 * is recorded and still has the recorded bytes. Files it did not install are never touched.
 *
 * The caller checks that `modsDir` resolves inside the location's game folder first.
 */

import { type InstallFileSystem, joinInstallPath } from '../minecraft-install/fs';
import { fabricApiFileName } from './download';
import { FABRIC_MOD_ID, FabricTestError, type Sha512, stableJson } from './types';

/** The record of files the app installed, in `mods/`. */
export const INSTALLED_RECORD_FILE = '.msm-installed.json';

/** What an installed file is. */
export type InstalledRole = 'content' | 'fabric-api';

/** One file the app installed. */
export interface InstalledFile {
  role: InstalledRole;
  /** Lower-case hex SHA-512 of the bytes written. */
  sha512: string;
  /** The mod id (content jars) or the Fabric API version. */
  id: string;
}

/** The contents of {@link INSTALLED_RECORD_FILE}. */
export interface InstalledRecord {
  formatVersion: 1;
  /** Installed files by file name in `mods/`. */
  files: Record<string, InstalledFile>;
}

/** What the install functions need. */
export interface ModsInstallDeps {
  fs: InstallFileSystem;
  sha512: Sha512;
}

/** Reads the record; a missing or unreadable record is empty (nothing counts as ours). */
export async function readInstalledRecord(
  fs: InstallFileSystem,
  modsDir: string,
): Promise<InstalledRecord> {
  const empty: InstalledRecord = { formatVersion: 1, files: {} };
  const path = joinInstallPath(modsDir, INSTALLED_RECORD_FILE);
  if (!(await fs.exists(path))) return empty;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(await fs.readFile(path)));
    if (typeof parsed !== 'object' || parsed === null) return empty;
    const files = (parsed as { files?: unknown }).files;
    if (typeof files !== 'object' || files === null || Array.isArray(files)) return empty;
    const out: Record<string, InstalledFile> = {};
    for (const [name, entry] of Object.entries(files)) {
      const record = entry as Partial<InstalledFile> | null;
      if (
        !isModFileName(name) ||
        record === null ||
        typeof record !== 'object' ||
        (record.role !== 'content' && record.role !== 'fabric-api') ||
        typeof record.sha512 !== 'string' ||
        typeof record.id !== 'string'
      ) {
        continue;
      }
      out[name] = { role: record.role, sha512: record.sha512, id: record.id };
    }
    return { formatVersion: 1, files: out };
  } catch {
    return empty;
  }
}

async function writeInstalledRecord(
  fs: InstallFileSystem,
  modsDir: string,
  record: InstalledRecord,
): Promise<void> {
  await fs.writeFile(
    joinInstallPath(modsDir, INSTALLED_RECORD_FILE),
    new TextEncoder().encode(stableJson(record)),
  );
}

/** A plain `.jar` file name: one segment, no separators. */
function isModFileName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._+ ()-]{0,250}\.jar$/.test(name);
}

/**
 * Whether the file at `name` is the app's own copy: recorded, and its bytes still match the
 * recorded SHA-512. A missing file counts as not present (returns `'missing'`).
 */
async function ownership(
  deps: ModsInstallDeps,
  modsDir: string,
  record: InstalledRecord,
  name: string,
): Promise<'missing' | 'ours' | 'foreign'> {
  const path = joinInstallPath(modsDir, name);
  if (!(await deps.fs.exists(path))) return 'missing';
  const entry = record.files[name];
  if (entry === undefined) return 'foreign';
  try {
    return (await deps.sha512(await deps.fs.readFile(path))) === entry.sha512 ? 'ours' : 'foreign';
  } catch {
    return 'foreign';
  }
}

/** The content jar's file name in `mods/`: `<mod_id>.jar`. */
export function contentJarModsFileName(modId: string): string {
  if (!FABRIC_MOD_ID.test(modId)) {
    throw new FabricTestError(
      'fabric.bad-mod-id',
      `${JSON.stringify(modId)} is not a valid Fabric mod id.`,
    );
  }
  return `${modId}.jar`;
}

/** The outcome of {@link installContentJar}. */
export interface ContentJarInstall {
  /** The absolute path written. */
  path: string;
  /** `true` when an earlier copy the app installed was replaced. */
  replaced: boolean;
}

/**
 * Writes the content jar into `modsDir` as `<modId>.jar` (creating `modsDir`), replacing only
 * an earlier copy the app installed. A file of that name the app did not install (or that has
 * changed since) stops the install with `fabric.foreign-file`.
 */
export async function installContentJar(
  deps: ModsInstallDeps,
  modsDir: string,
  modId: string,
  bytes: Uint8Array,
): Promise<ContentJarInstall> {
  const name = contentJarModsFileName(modId);
  await deps.fs.mkdirp(modsDir);
  const record = await readInstalledRecord(deps.fs, modsDir);
  const state = await ownership(deps, modsDir, record, name);
  if (state === 'foreign') {
    throw new FabricTestError(
      'fabric.foreign-file',
      `The mods folder already holds ${name}, which MCSuperMods did not install. Remove or rename it, then try again.`,
    );
  }
  const path = joinInstallPath(modsDir, name);
  if (state === 'ours') await deps.fs.remove(path);
  await deps.fs.writeFile(path, bytes);
  record.files[name] = { role: 'content', sha512: await deps.sha512(bytes), id: modId };
  await writeInstalledRecord(deps.fs, modsDir, record);
  return { path, replaced: state === 'ours' };
}

/**
 * Whether a file name looks like a Fabric API jar the user installed: `fabric-api.jar` or
 * `fabric-api-<version>.jar` (the Fabric Maven, Modrinth and CurseForge names; a heuristic,
 * the jar is not opened).
 */
export function isFabricApiFileName(name: string): boolean {
  return /^fabric-api(?:[-_+].*)?\.jar$/i.test(name);
}

/** What {@link ensureFabricApi} found or did. */
export type FabricApiInstall =
  /** A Fabric API jar the app did not install is present; it was left alone. */
  | { state: 'user-copy'; file: string }
  /** The app's copy of the wanted version was already there. */
  | { state: 'present'; file: string }
  /** The app wrote the wanted version (replacing its own older copy when `replaced`). */
  | { state: 'installed'; file: string; replaced: boolean };

/**
 * Makes sure `modsDir` holds Fabric API. A Fabric API jar the app did not install counts as
 * present and is never touched (the app then removes its own copy, so the two never clash).
 * Otherwise the app's recorded copy of `version` is kept, an older recorded copy is replaced,
 * and when none exists `fetchJar` is called and its bytes are written as
 * `fabric-api-<version>.jar`.
 *
 * @param fetchJar - Returns the verified jar (see `cachedFabricApi`); only called when needed.
 */
export async function ensureFabricApi(
  deps: ModsInstallDeps,
  modsDir: string,
  version: string,
  fetchJar: () => Promise<{ bytes: Uint8Array; sha512: string }>,
): Promise<FabricApiInstall> {
  await deps.fs.mkdirp(modsDir);
  const record = await readInstalledRecord(deps.fs, modsDir);
  const entries = await deps.fs.readDir(modsDir);
  const ours: string[] = [];
  let userCopy: string | null = null;
  for (const entry of entries) {
    if (entry.kind !== 'file' || !isModFileName(entry.name)) continue;
    const recorded = record.files[entry.name];
    const state = await ownership(deps, modsDir, record, entry.name);
    if (state === 'ours' && recorded?.role === 'fabric-api') ours.push(entry.name);
    else if (state === 'foreign' && isFabricApiFileName(entry.name)) userCopy ??= entry.name;
  }
  // Drop records of files that are gone or were changed by the user.
  for (const name of Object.keys(record.files)) {
    if ((await ownership(deps, modsDir, record, name)) !== 'ours') delete record.files[name];
  }

  if (userCopy !== null) {
    for (const name of ours) {
      await deps.fs.remove(joinInstallPath(modsDir, name));
      delete record.files[name];
    }
    await writeInstalledRecord(deps.fs, modsDir, record);
    return { state: 'user-copy', file: userCopy };
  }

  const wanted = fabricApiFileName(version);
  const current = ours.find((name) => record.files[name]?.id === version && name === wanted);
  const stale = ours.filter((name) => name !== current);
  for (const name of stale) {
    await deps.fs.remove(joinInstallPath(modsDir, name));
    delete record.files[name];
  }
  if (current !== undefined) {
    await writeInstalledRecord(deps.fs, modsDir, record);
    return { state: 'present', file: current };
  }
  if (await deps.fs.exists(joinInstallPath(modsDir, wanted))) {
    // Unrecorded file of exactly our name: a user copy the name check above missed.
    await writeInstalledRecord(deps.fs, modsDir, record);
    return { state: 'user-copy', file: wanted };
  }
  const jar = await fetchJar();
  await deps.fs.writeFile(joinInstallPath(modsDir, wanted), jar.bytes);
  record.files[wanted] = { role: 'fabric-api', sha512: jar.sha512, id: version };
  await writeInstalledRecord(deps.fs, modsDir, record);
  return { state: 'installed', file: wanted, replaced: stale.length > 0 };
}
