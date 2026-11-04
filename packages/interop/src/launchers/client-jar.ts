/**
 * Finding a client jar for a Minecraft version across launcher stores (ADR 0019): the
 * selected location's own store first, then every other known store in discovery order.
 */

import { type InstallFileSystem, joinInstallPath } from '../minecraft-install/fs';
import {
  type InstalledVersion,
  listInstalledVersions,
  pickVersionJar,
} from '../minecraft-install/locate';
import { listMmcClientJars } from './mmc';
import { locationPathKey } from './paths';
import type { GameLocation, LauncherKind } from './types';

/** A client jar found in a launcher's store. */
export interface ClientJarMatch {
  /** Absolute path of the jar. */
  jarPath: string;
  /** The installed version id that served the request (exact, or by the prefix rule). */
  versionId: string;
  /** The launcher whose store holds the jar. */
  launcher: LauncherKind;
  /** The launcher root whose store holds the jar. */
  root: string;
}

/**
 * Lists the client jars in one launcher's store: official `versions/<v>/<v>.jar`;
 * Prism/MultiMC `libraries/com/mojang/minecraft/<v>/minecraft-<v>-client.jar`; CurseForge
 * `Install/versions/<v>/<v>.jar` (from older Curse client data; verify at implementation).
 */
export async function listLauncherClientJars(
  fs: InstallFileSystem,
  launcher: LauncherKind,
  root: string,
): Promise<InstalledVersion[]> {
  switch (launcher) {
    case 'official':
      return listInstalledVersions(fs, root);
    case 'prism':
    case 'multimc':
      return listMmcClientJars(fs, root);
    case 'curseforge':
      return listInstalledVersions(fs, joinInstallPath(root, 'Install'));
  }
}

/** The store key: Prism and MultiMC share a layout, so one root is searched once. */
function storeKey(launcher: LauncherKind, root: string): string {
  const family = launcher === 'multimc' ? 'prism' : launcher;
  return `${family}|${locationPathKey(root)}`;
}

/**
 * Finds the client jar for `mcVersion`. Stores are searched in order: the selected
 * location's own store, then the store of every location in `locations` (discovery order),
 * each store once. Within a store the exact version wins, then `pickVersionJar`'s prefix
 * rule. Returns `null` when no store holds the version.
 */
export async function findClientJar(
  fs: InstallFileSystem,
  locations: readonly GameLocation[],
  selected: GameLocation | null,
  mcVersion: string,
): Promise<ClientJarMatch | null> {
  const ordered = selected === null ? [...locations] : [selected, ...locations];
  const searched = new Set<string>();
  for (const location of ordered) {
    const { launcher, root } = location.ref;
    const key = storeKey(launcher, root);
    if (searched.has(key)) continue;
    searched.add(key);
    let versions: InstalledVersion[];
    try {
      versions = await listLauncherClientJars(fs, launcher, root);
    } catch {
      continue;
    }
    const picked = pickVersionJar(versions, mcVersion);
    if (picked !== undefined) {
      return { jarPath: picked.jarPath, versionId: picked.id, launcher, root };
    }
  }
  return null;
}
