/**
 * Builds synthetic launcher folders on disk for tests (ADR 0019): an official `.minecraft`
 * folder, a Prism Launcher (or MultiMC) data folder with instances and a client-jar library
 * store, and a CurseForge modding folder with instances and an `Install/versions` store.
 *
 * Only `node:` imports, so the Playwright e2e specs can import it by relative path as well.
 * Every file is made up here; pass jar bytes from `synthetic-jar.ts`.
 */

import { mkdir, symlink, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** One Prism Launcher / MultiMC instance. */
export interface FakeMmcInstance {
  /** The instance folder name (its id). */
  folder: string;
  /** `name` in `instance.cfg`; defaults to the folder name. */
  name?: string;
  /** The `net.minecraft` component version; `null` leaves the component out. */
  mcVersion: string | null;
  /** A loader component, such as `{ uid: 'net.fabricmc.fabric-loader', version: '0.1' }`. */
  loader?: { uid: string; version: string } | null;
  /**
   * The game folder inside the instance: `minecraft` (default), `.minecraft`, or `null` for
   * none yet (never started).
   */
  gameFolder?: 'minecraft' | '.minecraft' | null;
  /** World folders to create in `saves/`, each with a `level.dat`. */
  worlds?: string[];
}

/** One CurseForge app instance. */
export interface FakeCurseForgeInstance {
  /** The instance folder name under `Instances/`. */
  folder: string;
  /** `name` in `minecraftinstance.json`; defaults to the folder name. */
  name?: string;
  /** `gameVersion` in `minecraftinstance.json`. */
  gameVersion: string;
  /** `baseModLoader`; `null` (default) for a vanilla instance. */
  baseModLoader?: { name: string } | null;
  /** World folders to create in `saves/`, each with a `level.dat`. */
  worlds?: string[];
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Creates `<gameDir>/saves/<name>/level.dat`, optionally with a modification time. */
export async function makeWorld(gameDir: string, name: string, mtime?: Date): Promise<string> {
  const world = join(gameDir, 'saves', name);
  await mkdir(world, { recursive: true });
  const levelDat = join(world, 'level.dat');
  await writeFile(levelDat, new Uint8Array([0]));
  if (mtime !== undefined) await utimes(levelDat, mtime, mtime);
  return world;
}

/** An official `.minecraft` folder with `versions/<v>/<v>.jar` for each jar and some worlds. */
export async function makeOfficialDir(
  root: string,
  options: { jars?: Record<string, Uint8Array>; worlds?: string[] } = {},
): Promise<string> {
  await mkdir(root, { recursive: true });
  for (const [version, jar] of Object.entries(options.jars ?? {})) {
    const dir = join(root, 'versions', version);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${version}.jar`), jar);
  }
  for (const world of options.worlds ?? []) await makeWorld(root, world);
  return root;
}

/** Paths of a fake Prism Launcher / MultiMC data folder. */
export interface FakeMmcRoot {
  root: string;
  instancesDir: string;
  /** The instance folder of `folder`. */
  instanceDir(folder: string): string;
  /** The game folder of `folder` (`minecraft/` unless the instance uses `.minecraft/`). */
  gameDir(folder: string): string;
}

/**
 * A Prism Launcher (or MultiMC) data folder: `prismlauncher.cfg` (or `multimc.cfg`) with
 * `InstanceDir`, instances with `instance.cfg` and `mmc-pack.json`, and client jars at
 * `libraries/com/mojang/minecraft/<v>/minecraft-<v>-client.jar`.
 */
export async function makeMmcRoot(
  root: string,
  options: {
    instances: FakeMmcInstance[];
    jars?: Record<string, Uint8Array>;
    /** `InstanceDir` in the config file; defaults to `instances`. */
    instanceDir?: string;
    /** Which config file to write; defaults to `prismlauncher.cfg`. */
    configFile?: 'prismlauncher.cfg' | 'polymc.cfg' | 'multimc.cfg';
  },
): Promise<FakeMmcRoot> {
  const instanceDirName = options.instanceDir ?? 'instances';
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, options.configFile ?? 'prismlauncher.cfg'),
    `[General]\nInstanceDir=${instanceDirName}\n`,
  );
  const instancesDir = join(root, instanceDirName);
  await mkdir(instancesDir, { recursive: true });
  const gameFolders = new Map<string, string>();
  for (const instance of options.instances) {
    const dir = join(instancesDir, instance.folder);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'instance.cfg'),
      `[General]\nInstanceType=OneSix\nname=${instance.name ?? instance.folder}\n`,
    );
    const components: unknown[] = [];
    if (instance.mcVersion !== null) {
      components.push({ uid: 'net.minecraft', version: instance.mcVersion, important: true });
    }
    if (instance.loader !== undefined && instance.loader !== null) {
      components.push({ uid: instance.loader.uid, version: instance.loader.version });
    }
    await writeFile(join(dir, 'mmc-pack.json'), json({ components, formatVersion: 1 }));
    const gameFolder = instance.gameFolder === undefined ? 'minecraft' : instance.gameFolder;
    gameFolders.set(instance.folder, gameFolder ?? 'minecraft');
    if (gameFolder !== null) {
      await mkdir(join(dir, gameFolder), { recursive: true });
      for (const world of instance.worlds ?? []) await makeWorld(join(dir, gameFolder), world);
    }
  }
  for (const [version, jar] of Object.entries(options.jars ?? {})) {
    const dir = join(root, 'libraries', 'com', 'mojang', 'minecraft', version);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `minecraft-${version}-client.jar`), jar);
  }
  return {
    root,
    instancesDir,
    instanceDir: (folder) => join(instancesDir, folder),
    gameDir: (folder) => join(instancesDir, folder, gameFolders.get(folder) ?? 'minecraft'),
  };
}

/** Paths of a fake CurseForge modding folder. */
export interface FakeCurseForgeRoot {
  root: string;
  instancesDir: string;
  /** The instance folder of `folder`, which is also its game folder. */
  gameDir(folder: string): string;
}

/**
 * A CurseForge modding folder: `Instances/<folder>/minecraftinstance.json` per instance and
 * client jars at `Install/versions/<v>/<v>.jar`.
 */
export async function makeCurseForgeRoot(
  root: string,
  options: { instances: FakeCurseForgeInstance[]; jars?: Record<string, Uint8Array> },
): Promise<FakeCurseForgeRoot> {
  const instancesDir = join(root, 'Instances');
  await mkdir(instancesDir, { recursive: true });
  await mkdir(join(root, 'Install'), { recursive: true });
  for (const instance of options.instances) {
    const dir = join(instancesDir, instance.folder);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'minecraftinstance.json'),
      json({
        name: instance.name ?? instance.folder,
        gameVersion: instance.gameVersion,
        baseModLoader: instance.baseModLoader ?? null,
        // Deliberately stale, as after the user moved the folder: MSM must ignore it.
        installPath: join(root, 'moved-away', instance.folder),
      }),
    );
    for (const world of instance.worlds ?? []) await makeWorld(dir, world);
  }
  for (const [version, jar] of Object.entries(options.jars ?? {})) {
    const dir = join(root, 'Install', 'versions', version);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${version}.jar`), jar);
  }
  return { root, instancesDir, gameDir: (folder) => join(instancesDir, folder) };
}

/** Creates a directory symbolic link (a junction on Windows) at `path` pointing to `target`. */
export async function linkDir(target: string, path: string): Promise<void> {
  await symlink(target, path, process.platform === 'win32' ? 'junction' : 'dir');
}
