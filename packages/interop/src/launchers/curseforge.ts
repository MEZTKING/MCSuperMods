/**
 * CurseForge app instances: `<root>/Instances/<name>/minecraftinstance.json`, with the game
 * files directly in the instance folder, and a vanilla store under `<root>/Install/`.
 */

import { type InstallFileSystem, joinInstallPath } from '../minecraft-install/fs';
import { isPathInside, isSafeSegment } from './paths';
import type { GameLocation, GameLocationProblem, LoaderKind } from './types';

/** `baseModLoader.name` prefixes (verify at implementation), longest first. */
const LOADER_PREFIXES: readonly [string, LoaderKind][] = [
  ['neoforge-', 'neoforge'],
  ['fabric-', 'fabric'],
  ['quilt-', 'quilt'],
  ['forge-', 'forge'],
];

/**
 * Reads a loader from a CurseForge `baseModLoader.name` such as `neoforge-21.1.209` or
 * `fabric-<loader>-<mc>`: the kind from the prefix and the version as the next `-`-separated
 * part (verify at implementation). Unknown prefixes give `unknown` with no version.
 */
export function parseCurseForgeLoaderName(name: string): {
  kind: LoaderKind;
  version: string | null;
} {
  const lower = name.toLowerCase();
  for (const [prefix, kind] of LOADER_PREFIXES) {
    if (!lower.startsWith(prefix)) continue;
    const version = name.slice(prefix.length).split('-')[0] ?? '';
    return { kind, version: version === '' ? null : version };
  }
  return { kind: 'unknown', version: null };
}

/**
 * Lists the CurseForge instances under `<root>/Instances`: child folders that hold
 * `minecraftinstance.json`. The game directory is the instance folder itself; `installPath`
 * in the JSON is ignored because it may be stale after the folder is moved. Hidden folders,
 * unsafe names and folders whose real path leaves `Instances/` are skipped. Returns an empty
 * list when `Instances/` does not exist.
 */
export async function listCurseForgeInstances(
  fs: InstallFileSystem,
  root: string,
): Promise<GameLocation[]> {
  const instancesDir = joinInstallPath(root, 'Instances');
  if (!(await fs.exists(instancesDir))) return [];
  let entries: Awaited<ReturnType<InstallFileSystem['readDir']>>;
  try {
    entries = await fs.readDir(instancesDir);
  } catch {
    return [];
  }
  let realInstancesDir: string | null = instancesDir;
  if (fs.realpath !== undefined) {
    try {
      realInstancesDir = await fs.realpath(instancesDir);
    } catch {
      realInstancesDir = null;
    }
  }
  const names = entries
    .filter((entry) => entry.kind === 'directory')
    .map((entry) => entry.name)
    .filter((name) => isSafeSegment(name) && !name.startsWith('.'))
    .sort();
  const result: GameLocation[] = [];
  for (const name of names) {
    const instanceDir = joinInstallPath(instancesDir, name);
    const metadata = joinInstallPath(instanceDir, 'minecraftinstance.json');
    if (!(await fs.exists(metadata))) continue;
    if (fs.realpath !== undefined) {
      let real: string | null = null;
      try {
        real = await fs.realpath(instanceDir);
      } catch {
        real = null;
      }
      if (real === null || realInstancesDir === null || !isPathInside(realInstancesDir, real)) {
        continue;
      }
    }
    result.push(await readCurseForgeInstance(fs, root, instanceDir, name, metadata));
  }
  return result;
}

async function readCurseForgeInstance(
  fs: InstallFileSystem,
  root: string,
  instanceDir: string,
  name: string,
  metadata: string,
): Promise<GameLocation> {
  const problems: GameLocationProblem[] = [];
  let displayName = name;
  let mcVersion: string | null = null;
  let loader: GameLocation['loader'] = null;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(await fs.readFile(metadata)));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    const json = parsed as Record<string, unknown>;
    if (typeof json.name === 'string' && json.name.trim() !== '') displayName = json.name.trim();
    if (typeof json.gameVersion === 'string' && json.gameVersion !== '') {
      mcVersion = json.gameVersion;
    }
    // A vanilla instance has `"baseModLoader": null` (verify at implementation).
    const base = json.baseModLoader;
    if (typeof base === 'object' && base !== null) {
      const loaderName = (base as { name?: unknown }).name;
      loader =
        typeof loaderName === 'string' && loaderName !== ''
          ? parseCurseForgeLoaderName(loaderName)
          : { kind: 'unknown', version: null };
    }
  } catch {
    problems.push({
      code: 'location.unreadable-metadata',
      message: 'The minecraftinstance.json file of this instance could not be read.',
    });
  }
  return {
    ref: { launcher: 'curseforge', root, instance: name },
    id: `curseforge:${name}`,
    displayName,
    mcVersion,
    loader,
    gameDir: instanceDir,
    modsDir: loader === null ? null : joinInstallPath(instanceDir, 'mods'),
    instanceDir,
    problems,
  };
}
