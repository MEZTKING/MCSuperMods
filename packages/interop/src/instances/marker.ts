/**
 * The marker `.msm-managed.json` in every instance MSM made (ADR 0133 D2, D5), and the list of
 * them.
 *
 * Version 1 (the test instance since ADR 0084): `formatVersion`, `generator`, `minecraft`,
 * `loader`. It is read as "the test instance, Fabric". Version 2 adds `purpose` (the instance's
 * role: `test`, `plain`, `pack`, `map`), `owner` (the modpack's or map's name), `loaderKind`,
 * and MSM's own records: `files` (resource packs it wrote, by path in the game folder, with
 * their SHA-512) and `worlds` (the `saves/` folders it copied). Version 2 keeps `minecraft` and
 * `loader` (a string, or `null` without a loader), so `createManagedInstance` still reads it.
 *
 * A test instance with a version 1 marker keeps version 1 (no migration) until MSM must record
 * a file in it.
 */

import { MANAGED_INSTANCE_MARKER } from '../fabric/instance';
import { stableJson } from '../fabric/types';
import { readMmcConfig } from '../launchers/mmc';
import { isPathInside, isSafeSegment } from '../launchers/paths';
import { type InstallFileSystem, joinInstallPath } from '../minecraft-install/fs';
import type { InstanceRole, RecipeLoaderKind } from './recipe';

/** The marker version this code writes for new instances. */
export const INSTANCE_MARKER_FORMAT = 2;

/** A file MSM wrote into an instance's game folder (outside `mods/`, which has its own record). */
export interface MarkerFile {
  /** Lower-case hex SHA-512 of the bytes written. */
  sha512: string;
}

/** A parsed marker, either version. */
export interface InstanceMarker {
  formatVersion: 1 | 2;
  role: InstanceRole;
  owner: string | null;
  loaderKind: RecipeLoaderKind;
  /** The loader's version, or `null` without a loader. */
  loader: string | null;
  minecraft: string;
  /** Files MSM wrote, by `/`-separated path in the game folder. */
  files: Record<string, MarkerFile>;
  /** `saves/` folders MSM copied. */
  worlds: string[];
}

const ROLES: readonly InstanceRole[] = ['test', 'plain', 'pack', 'map'];
const LOADER_KINDS: readonly RecipeLoaderKind[] = ['none', 'fabric', 'quilt', 'neoforge', 'forge'];
const SHA512 = /^[0-9a-f]{128}$/;

/** Parses a marker's text; `null` when it is not a marker this code can read. */
export function parseInstanceMarker(text: string): InstanceMarker | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const raw = parsed as Record<string, unknown>;
  if (raw.generator !== 'MCSuperMods' || typeof raw.minecraft !== 'string') return null;
  if (raw.formatVersion === 1) {
    if (typeof raw.loader !== 'string') return null;
    return {
      formatVersion: 1,
      role: 'test',
      owner: null,
      loaderKind: 'fabric',
      loader: raw.loader,
      minecraft: raw.minecraft,
      files: {},
      worlds: [],
    };
  }
  if (raw.formatVersion !== 2) return null;
  const role = ROLES.find((value) => value === raw.purpose);
  const loaderKind = LOADER_KINDS.find((value) => value === raw.loaderKind);
  if (role === undefined || loaderKind === undefined) return null;
  if (raw.owner !== null && typeof raw.owner !== 'string') return null;
  if (raw.loader !== null && typeof raw.loader !== 'string') return null;
  const files: Record<string, MarkerFile> = {};
  if (typeof raw.files === 'object' && raw.files !== null && !Array.isArray(raw.files)) {
    for (const [path, entry] of Object.entries(raw.files)) {
      const sha512 = (entry as { sha512?: unknown } | null)?.sha512;
      if (isRecordedPath(path) && typeof sha512 === 'string' && SHA512.test(sha512)) {
        files[path] = { sha512 };
      }
    }
  }
  const worlds = Array.isArray(raw.worlds)
    ? [...new Set(raw.worlds.filter((w): w is string => typeof w === 'string' && isSafeSegment(w)))]
    : [];
  return {
    formatVersion: 2,
    role,
    owner: raw.owner as string | null,
    loaderKind,
    loader: raw.loader as string | null,
    minecraft: raw.minecraft,
    files,
    worlds: worlds.sort(),
  };
}

/** Whether `path` is a recorded file path: two or more safe `/`-separated segments. */
function isRecordedPath(path: string): boolean {
  const segments = path.split('/');
  return segments.length >= 2 && segments.every((segment) => isSafeSegment(segment));
}

/** The marker's text: version 1 keeps its four keys, version 2 has them all; sorted keys. */
export function instanceMarkerText(marker: InstanceMarker): string {
  if (marker.formatVersion === 1) {
    return stableJson({
      formatVersion: 1,
      generator: 'MCSuperMods',
      loader: marker.loader ?? '',
      minecraft: marker.minecraft,
    });
  }
  return stableJson({
    files: marker.files,
    formatVersion: 2,
    generator: 'MCSuperMods',
    loader: marker.loader,
    loaderKind: marker.loaderKind,
    minecraft: marker.minecraft,
    owner: marker.owner,
    purpose: marker.role,
    worlds: [...marker.worlds].sort(),
  });
}

/**
 * Reads an instance folder's marker: `'absent'` without one, `'unreadable'` when the file is
 * there but cannot be read as a marker (the folder is then treated as taken, never as ours).
 */
export async function readInstanceMarker(
  fs: InstallFileSystem,
  instanceDir: string,
): Promise<InstanceMarker | 'absent' | 'unreadable'> {
  const path = joinInstallPath(instanceDir, MANAGED_INSTANCE_MARKER);
  if (!(await fs.exists(path))) return 'absent';
  try {
    return parseInstanceMarker(new TextDecoder().decode(await fs.readFile(path))) ?? 'unreadable';
  } catch {
    return 'unreadable';
  }
}

/** One instance MSM made, as {@link listManaged} finds it. */
export interface ManagedInstanceEntry {
  /** The launcher data folder it was found in. */
  root: string;
  /** The instances folder holding it. */
  instancesDir: string;
  /** The folder name (the launcher's instance id). */
  folder: string;
  /** The absolute instance folder. */
  instanceDir: string;
  role: InstanceRole;
  owner: string | null;
  mcVersion: string;
  loaderKind: RecipeLoaderKind;
  loaderVersion: string | null;
  /** The marker's version. */
  markerVersion: 1 | 2;
}

async function realOrNull(fs: InstallFileSystem, path: string): Promise<string | null> {
  if (fs.realpath === undefined) return path;
  try {
    return await fs.realpath(path);
  } catch {
    return null;
  }
}

/**
 * The instances MSM made in the launcher data folders `roots` (Prism, MultiMC, PolyMC), every
 * instances folder of each: folders holding a readable marker, sorted by root then folder.
 * Read-only. Hidden folders (staging) and unsafe names are skipped, and so is a folder whose
 * real path leaves its instances folder. Missing roots are skipped silently.
 */
export async function listManaged(
  fs: InstallFileSystem,
  roots: readonly string[],
): Promise<ManagedInstanceEntry[]> {
  const out: ManagedInstanceEntry[] = [];
  for (const root of roots) {
    if (!(await fs.exists(root))) continue;
    const { instanceDirs } = await readMmcConfig(fs, root);
    for (const instancesDir of instanceDirs) {
      if (!(await fs.exists(instancesDir))) continue;
      let entries: Awaited<ReturnType<InstallFileSystem['readDir']>>;
      try {
        entries = await fs.readDir(instancesDir);
      } catch {
        continue;
      }
      const realInstances = await realOrNull(fs, instancesDir);
      const found: ManagedInstanceEntry[] = [];
      for (const entry of entries) {
        if (entry.kind !== 'directory' || entry.name.startsWith('.')) continue;
        if (!isSafeSegment(entry.name)) continue;
        const instanceDir = joinInstallPath(instancesDir, entry.name);
        const marker = await readInstanceMarker(fs, instanceDir);
        if (marker === 'absent' || marker === 'unreadable') continue;
        const real = await realOrNull(fs, instanceDir);
        if (real === null || realInstances === null || !isPathInside(realInstances, real)) continue;
        found.push({
          root,
          instancesDir,
          folder: entry.name,
          instanceDir,
          role: marker.role,
          owner: marker.owner,
          mcVersion: marker.minecraft,
          loaderKind: marker.loaderKind,
          loaderVersion: marker.loader,
          markerVersion: marker.formatVersion,
        });
      }
      found.sort((a, b) => (a.folder < b.folder ? -1 : a.folder > b.folder ? 1 : 0));
      out.push(...found);
    }
  }
  return out;
}
