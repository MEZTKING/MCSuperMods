/**
 * The MultiMC instance format, shared by Prism Launcher, MultiMC and PolyMC: a data folder
 * with a `.cfg` file, an instances folder of `<id>/instance.cfg` + `mmc-pack.json`, and a
 * `libraries/` store holding the client jars.
 */

import { type InstallFileSystem, joinInstallPath } from '../minecraft-install/fs';
import type { InstalledVersion } from '../minecraft-install/locate';
import { parseIni } from './ini';
import { isAbsoluteInstallPath, isPathInside, isSafeSegment, locationPathKey } from './paths';
import type { GameLocation, GameLocationProblem, LoaderKind } from './types';

/** Config files, in the order Prism looks for them. */
export const MMC_CONFIG_FILES = ['prismlauncher.cfg', 'polymc.cfg', 'multimc.cfg'] as const;

/** Mod loader component uids (Prism `Component.cpp` `KNOWN_MODLOADERS`). */
export const MMC_LOADER_UIDS: Readonly<Record<string, LoaderKind>> = {
  'net.fabricmc.fabric-loader': 'fabric',
  'org.quiltmc.quilt-loader': 'quilt',
  'net.minecraftforge': 'forge',
  'net.neoforged': 'neoforge',
  'com.mumfrey.liteloader': 'liteloader',
};

/** The instance folders a MultiMC-format data folder uses. */
export interface MmcConfig {
  /** The config file that was read, or `null` when none exists. */
  configFile: string | null;
  /** `InstanceDir` (default `instances`) then `AdditionalInstanceDirs`, absolute, deduplicated. */
  instanceDirs: string[];
}

/**
 * Reads the first existing config file of {@link MMC_CONFIG_FILES} under `root`. A relative
 * `InstanceDir` resolves against `root`, because Prism sets the data folder as its working
 * directory. `AdditionalInstanceDirs` is read as a Qt string list (verify at implementation).
 */
export async function readMmcConfig(fs: InstallFileSystem, root: string): Promise<MmcConfig> {
  let configFile: string | null = null;
  let primary = 'instances';
  let additional: string[] = [];
  for (const name of MMC_CONFIG_FILES) {
    const path = joinInstallPath(root, name);
    if (!(await fs.exists(path))) continue;
    configFile = path;
    try {
      const ini = parseIni(new TextDecoder().decode(await fs.readFile(path)));
      const instanceDir = ini.get('InstanceDir');
      if (instanceDir !== undefined && instanceDir.trim() !== '') primary = instanceDir.trim();
      additional = ini.list('AdditionalInstanceDirs');
    } catch {
      // An unreadable config behaves like the defaults.
    }
    break;
  }
  const instanceDirs: string[] = [];
  const seen = new Set<string>();
  for (const dir of [primary, ...additional]) {
    const abs = isAbsoluteInstallPath(dir) ? dir : joinInstallPath(root, dir);
    const key = locationPathKey(abs);
    if (seen.has(key)) continue;
    seen.add(key);
    instanceDirs.push(abs);
  }
  return { configFile, instanceDirs };
}

interface MmcComponent {
  uid: string;
  version?: unknown;
  cachedVersion?: unknown;
  disabled?: unknown;
}

/**
 * Lists the instances of a MultiMC-format data folder (Prism `InstanceList.cpp`): direct
 * children of each instances folder that hold `instance.cfg`. Hidden folders (such as the
 * `.tmp` staging folder) and names that are not one safe path segment are skipped; so is a
 * folder whose real path is outside its instances folder (when the file system reports real
 * paths), and a folder name already listed from an earlier instances folder, since a
 * {@link GameLocationRef} names an instance by folder only. Ids are provisional; see
 * `discoverGameLocations`.
 */
export async function listMmcInstances(
  fs: InstallFileSystem,
  root: string,
  launcher: 'prism' | 'multimc',
): Promise<GameLocation[]> {
  const { instanceDirs } = await readMmcConfig(fs, root);
  const result: GameLocation[] = [];
  const seenNames = new Set<string>();
  for (const instancesDir of instanceDirs) {
    if (!(await fs.exists(instancesDir))) continue;
    let entries: Awaited<ReturnType<InstallFileSystem['readDir']>>;
    try {
      entries = await fs.readDir(instancesDir);
    } catch {
      continue;
    }
    const realInstancesDir = await realpathOrNull(fs, instancesDir);
    const names = entries
      .filter((entry) => entry.kind === 'directory')
      .map((entry) => entry.name)
      .filter((name) => isSafeSegment(name) && !name.startsWith('.'))
      .sort();
    for (const name of names) {
      const instanceDir = joinInstallPath(instancesDir, name);
      if (!(await fs.exists(joinInstallPath(instanceDir, 'instance.cfg')))) continue;
      if (fs.realpath !== undefined) {
        const real = await realpathOrNull(fs, instanceDir);
        if (real === null || realInstancesDir === null || !isPathInside(realInstancesDir, real)) {
          continue;
        }
      }
      const caseKey = /^[A-Za-z]:|^[\\/]{2}/.test(root) ? name.toLowerCase() : name;
      if (seenNames.has(caseKey)) continue;
      seenNames.add(caseKey);
      result.push(await readMmcInstance(fs, root, launcher, instanceDir, name));
    }
  }
  return result;
}

async function readMmcInstance(
  fs: InstallFileSystem,
  root: string,
  launcher: 'prism' | 'multimc',
  instanceDir: string,
  name: string,
): Promise<GameLocation> {
  const problems: GameLocationProblem[] = [];
  let displayName = name;
  try {
    const ini = parseIni(
      new TextDecoder().decode(await fs.readFile(joinInstallPath(instanceDir, 'instance.cfg'))),
    );
    const cfgName = ini.get('name')?.trim();
    if (cfgName !== undefined && cfgName !== '') displayName = cfgName;
    const type = ini.get('InstanceType')?.trim() ?? '';
    if (type !== '' && type !== 'OneSix') {
      problems.push({
        code: 'location.unsupported-instance-type',
        message: `This instance has the type "${type}", which MSM cannot read; only OneSix instances are supported.`,
      });
    }
  } catch {
    problems.push({
      code: 'location.unreadable-metadata',
      message: 'The instance.cfg file of this instance could not be read.',
    });
  }

  let mcVersion: string | null = null;
  let loader: GameLocation['loader'] = null;
  const components = await readMmcComponents(fs, instanceDir);
  if (components === null) {
    problems.push({
      code: 'location.unreadable-metadata',
      message: 'The mmc-pack.json file of this instance is missing or not valid.',
    });
  } else {
    const minecraft = components.find((component) => component.uid === 'net.minecraft');
    if (minecraft === undefined) {
      problems.push({
        code: 'location.no-minecraft-component',
        message: 'This instance has no Minecraft component, so its game version is unknown.',
      });
    } else {
      mcVersion = componentVersion(minecraft);
    }
    for (const component of components) {
      const kind = MMC_LOADER_UIDS[component.uid];
      if (kind === undefined || component.disabled === true) continue;
      loader = { kind, version: componentVersion(component) };
      break;
    }
  }

  // Prism `MinecraftInstance::gameRoot()`: `minecraft/`, unless only `.minecraft/` exists.
  const dotted = joinInstallPath(instanceDir, '.minecraft');
  const plain = joinInstallPath(instanceDir, 'minecraft');
  const plainExists = await fs.exists(plain);
  const dottedExists = !plainExists && (await fs.exists(dotted));
  const gameDir = dottedExists ? dotted : plain;
  if (!plainExists && !dottedExists) {
    problems.push({
      code: 'location.game-dir-missing',
      message: 'The game folder of this instance does not exist yet. Start the instance once.',
    });
  }

  return {
    ref: { launcher, root, instance: name },
    id: `${launcher}:${name}`,
    displayName,
    mcVersion,
    loader,
    gameDir,
    modsDir: loader === null ? null : joinInstallPath(gameDir, 'mods'),
    instanceDir,
    problems,
  };
}

async function readMmcComponents(
  fs: InstallFileSystem,
  instanceDir: string,
): Promise<MmcComponent[] | null> {
  try {
    const parsed: unknown = JSON.parse(
      new TextDecoder().decode(await fs.readFile(joinInstallPath(instanceDir, 'mmc-pack.json'))),
    );
    if (typeof parsed !== 'object' || parsed === null) return null;
    const components = (parsed as { components?: unknown }).components;
    if (!Array.isArray(components)) return null;
    return components.filter(
      (component): component is MmcComponent =>
        typeof component === 'object' &&
        component !== null &&
        typeof (component as { uid?: unknown }).uid === 'string',
    );
  } catch {
    return null;
  }
}

function componentVersion(component: MmcComponent): string | null {
  if (typeof component.version === 'string' && component.version !== '') return component.version;
  if (typeof component.cachedVersion === 'string' && component.cachedVersion !== '') {
    return component.cachedVersion;
  }
  return null;
}

/**
 * Lists the client jars in a MultiMC-format library store:
 * `<root>/libraries/com/mojang/minecraft/<v>/minecraft-<v>-client.jar` (Prism
 * `com.mojang:minecraft:<v>:client`), sorted by version. `jsonPath` points at the Prism meta
 * cache `meta/net.minecraft/<v>.json` (verify at implementation), which may be absent.
 */
export async function listMmcClientJars(
  fs: InstallFileSystem,
  root: string,
): Promise<InstalledVersion[]> {
  const store = joinInstallPath(root, 'libraries', 'com', 'mojang', 'minecraft');
  if (!(await fs.exists(store))) return [];
  let entries: Awaited<ReturnType<InstallFileSystem['readDir']>>;
  try {
    entries = await fs.readDir(store);
  } catch {
    return [];
  }
  const result: InstalledVersion[] = [];
  for (const entry of entries) {
    if (entry.kind !== 'directory' || !isSafeSegment(entry.name)) continue;
    const jarPath = joinInstallPath(store, entry.name, `minecraft-${entry.name}-client.jar`);
    if (!(await fs.exists(jarPath))) continue;
    result.push({
      id: entry.name,
      jarPath,
      jsonPath: joinInstallPath(root, 'meta', 'net.minecraft', `${entry.name}.json`),
    });
  }
  return result.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

async function realpathOrNull(fs: InstallFileSystem, path: string): Promise<string | null> {
  if (fs.realpath === undefined) return path;
  try {
    return await fs.realpath(path);
  } catch {
    return null;
  }
}
