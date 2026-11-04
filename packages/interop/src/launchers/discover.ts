/**
 * Discovery of every game location on the machine: the official launcher, Prism Launcher
 * data folders (detected and added by hand), MultiMC/PolyMC folders (added by hand) and
 * CurseForge modding folders (detected and added by hand).
 */

import { type InstallFileSystem, joinInstallPath } from '../minecraft-install/fs';
import { defaultMinecraftDir, type InstallEnv } from '../minecraft-install/locate';
import { listCurseForgeInstances } from './curseforge';
import { listMmcInstances } from './mmc';
import { officialLocation } from './official';
import { isAbsoluteInstallPath, locationPathKey } from './paths';
import type { GameLocation, GameLocationRef, LauncherOverrides } from './types';

function nonEmpty(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

function dedupe(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    const key = locationPathKey(path);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(path);
  }
  return result;
}

/**
 * Candidate Prism Launcher data folders, in order: `PRISMLAUNCHER_DATA_DIR`, the platform
 * default (`%APPDATA%\PrismLauncher`; `~/Library/Application Support/PrismLauncher`;
 * `$XDG_DATA_HOME/PrismLauncher` or `~/.local/share/PrismLauncher`), then Flatpak on Linux
 * and Scoop on Windows. Only absolute candidates are returned; none is checked for existence.
 */
export function defaultPrismDataDirs(env: InstallEnv): string[] {
  const candidates: string[] = [];
  if (nonEmpty(env.prismDataDirEnv)) candidates.push(env.prismDataDirEnv);
  switch (env.platform) {
    case 'win32': {
      const appData = nonEmpty(env.appData)
        ? env.appData
        : joinInstallPath(env.home, 'AppData', 'Roaming');
      candidates.push(joinInstallPath(appData, 'PrismLauncher'));
      // Scoop keeps persistent data under `%HOMEPATH%\scoop\persist` (verify at implementation).
      candidates.push(joinInstallPath(env.home, 'scoop', 'persist', 'prismlauncher'));
      break;
    }
    case 'darwin':
      candidates.push(joinInstallPath(env.home, 'Library', 'Application Support', 'PrismLauncher'));
      break;
    default: {
      // Qt follows `$XDG_DATA_HOME` for the data location (verify at implementation).
      const dataHome =
        nonEmpty(env.xdgDataHome) && isAbsoluteInstallPath(env.xdgDataHome)
          ? env.xdgDataHome
          : joinInstallPath(env.home, '.local', 'share');
      candidates.push(joinInstallPath(dataHome, 'PrismLauncher'));
      candidates.push(
        joinInstallPath(
          env.home,
          '.var',
          'app',
          'org.prismlauncher.PrismLauncher',
          'data',
          'PrismLauncher',
        ),
      );
    }
  }
  return dedupe(candidates.filter(isAbsoluteInstallPath));
}

/**
 * Default CurseForge modding folders: `<home>\curseforge\minecraft` on Windows and
 * `<home>/Documents/curseforge/minecraft` on macOS. The app has no Linux build, so none there.
 */
export function defaultCurseForgeRoots(env: InstallEnv): string[] {
  switch (env.platform) {
    case 'win32':
      return [joinInstallPath(env.home, 'curseforge', 'minecraft')];
    case 'darwin':
      return [joinInstallPath(env.home, 'Documents', 'curseforge', 'minecraft')];
    default:
      return [];
  }
}

/** Replaces characters outside `[A-Za-z0-9_.:-]` with `_`. */
function domSafe(id: string): string {
  return id.replace(/[^A-Za-z0-9_.:-]/g, '_');
}

/**
 * Gives each location a DOM-safe, unique id: `<launcher>:<instance|default>` with other
 * characters replaced by `_`, suffixed `-2`, `-3`, … on collision, in list order.
 */
export function assignLocationIds(locations: GameLocation[]): GameLocation[] {
  const used = new Set<string>();
  return locations.map((location) => {
    const base = domSafe(`${location.ref.launcher}:${location.ref.instance ?? 'default'}`);
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return { ...location, id };
  });
}

/**
 * Finds every game location. Order: the official launcher, Prism (detected, then manual),
 * MultiMC (manual), CurseForge (detected, then manual). A root listed twice (compared by
 * {@link locationPathKey}) is read once, under the first launcher that names it. Roots that
 * do not exist and manual roots that are not absolute are skipped silently.
 */
export async function discoverGameLocations(
  fs: InstallFileSystem,
  env: InstallEnv,
  overrides: LauncherOverrides,
): Promise<GameLocation[]> {
  const locations: GameLocation[] = [];
  const seenRoots = new Set<string>();
  const claim = async (root: string): Promise<boolean> => {
    if (!isAbsoluteInstallPath(root)) return false;
    const key = locationPathKey(root);
    if (seenRoots.has(key)) return false;
    if (!(await fs.exists(root))) return false;
    seenRoots.add(key);
    return true;
  };

  const officialRoot = overrides.minecraftDir ?? defaultMinecraftDir(env);
  if (await claim(officialRoot)) locations.push(officialLocation(officialRoot));

  for (const root of [...defaultPrismDataDirs(env), ...overrides.prismDataDirs]) {
    if (await claim(root)) locations.push(...(await listMmcInstances(fs, root, 'prism')));
  }
  for (const root of overrides.multimcRoots) {
    if (await claim(root)) locations.push(...(await listMmcInstances(fs, root, 'multimc')));
  }
  for (const root of [...defaultCurseForgeRoots(env), ...overrides.curseForgeRoots]) {
    if (await claim(root)) locations.push(...(await listCurseForgeInstances(fs, root)));
  }
  return assignLocationIds(locations);
}

/** Whether two refs name the same location: same launcher, same root key, same instance. */
export function sameGameLocationRef(a: GameLocationRef, b: GameLocationRef): boolean {
  if (a.launcher !== b.launcher) return false;
  if (locationPathKey(a.root) !== locationPathKey(b.root)) return false;
  if (a.launcher === 'official') return true;
  const windows = /^[A-Za-z]:|^[\\/]{2}/.test(a.root);
  const ia = a.instance ?? '';
  const ib = b.instance ?? '';
  return windows ? ia.toLowerCase() === ib.toLowerCase() : ia === ib;
}

/** The discovered location a stored ref names, if it still exists. */
export function findGameLocation(
  locations: readonly GameLocation[],
  ref: GameLocationRef,
): GameLocation | undefined {
  return locations.find((location) => sameGameLocationRef(location.ref, ref));
}
