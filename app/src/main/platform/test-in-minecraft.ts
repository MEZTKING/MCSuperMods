/**
 * Test in Minecraft in the main process (ADR 0026 D5): checks the selected game location,
 * creates the managed Prism instance on request, installs the content jar and Fabric API into
 * its `mods/` folder and starts Prism Launcher or MultiMC on it. File formats, the install
 * record and launcher facts live in `@msm/interop` `fabric/`; this module adds settings, path
 * containment, the download cache folder and the process spawn.
 *
 * Writes stay inside the location's game folder (the real game folder inside the real
 * instance folder inside the real instances folder, as for pack installs) and the download
 * cache; files in `mods/` that MSM did not install are never touched.
 *
 * @packageDocumentation
 */

import { spawn } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { dirname, isAbsolute, normalize } from 'node:path';
import type { ModpackMod } from '@msm/core';
import { isModrinthCdnUrl } from '@msm/core';
import {
  cachedFabricApi,
  contentJarModsFileName,
  createManagedInstance,
  type Downloader,
  defaultPrismDataDirs,
  ensureFabricApi,
  type FabricTestFacts,
  fabricReadiness,
  fetchDownloader,
  findLauncherProgram,
  type GameLocation,
  type InstallFileSystem,
  installContentJar,
  installExtraMod,
  isManagedInstance,
  isPathInside,
  type LauncherProgramEnv,
  launchArguments,
  locationPathKey,
  managedInstanceName,
  readMmcConfig,
  removeUnlistedInstalls,
  type Sha512,
  webCryptoSha512,
} from '@msm/interop';
import { targetById } from '@msm/targets';
import type {
  FileFilter,
  LaunchableLauncher,
  ModpackTestResult,
  TestInMinecraftResult,
  TestInMinecraftStatus,
} from '../../shared/platform';
import { type LocationResolver, toLocationView } from './locations';
import type { SettingsStore } from './settings';

/** The main-process Test in Minecraft service; mirrors `PlatformAdapter['testInMinecraft']`. */
export interface TestInMinecraftService {
  status(targetId: string): Promise<TestInMinecraftStatus>;
  createInstance(targetId: string): Promise<TestInMinecraftStatus>;
  run(targetId: string, modId: string, data: Uint8Array): Promise<TestInMinecraftResult>;
  runModpack(
    targetId: string,
    jars: readonly { modId: string; data: Uint8Array }[],
    mods: readonly ModpackMod[],
  ): Promise<ModpackTestResult>;
  pickLauncherProgram(launcher: LaunchableLauncher): Promise<string | null>;
}

/** What the service needs from its host. */
export interface TestInMinecraftDeps {
  fs: InstallFileSystem;
  env: LauncherProgramEnv;
  locations: LocationResolver;
  settings: Pick<SettingsStore, 'get' | 'set' | 'launcherPrograms' | 'setLauncherProgram'>;
  /** The download cache folder (absolute), in the app's user-data folder. */
  cacheDir: string;
  /** Defaults to `fetch` over HTTPS. */
  download?: Downloader;
  /** Defaults to Web Crypto. */
  sha512?: Sha512;
  /** The Fabric facts of a target. Defaults to the built-in targets' `Target.fabric`. */
  facts?(targetId: string): FabricTestFacts;
  /** Starts the launcher program detached; rejects when it cannot be started. */
  spawnLauncher?(program: string, args: readonly string[]): Promise<void>;
  /** Shows an open dialog for one program; returns its absolute path, or `null`. */
  pickProgram(opts: { title: string; filters?: FileFilter[] | undefined }): Promise<string | null>;
  /** Resolves symlinks in an existing absolute path. Defaults to `fs.realpath`. */
  realpath?(absPath: string): Promise<string>;
}

/** The launchers' display names, for messages. */
const LAUNCHER_NAMES: Record<LaunchableLauncher, string> = {
  prism: 'Prism Launcher',
  multimc: 'MultiMC',
};

/** The Fabric facts of a built-in target. */
export function builtInFabricFacts(targetId: string): FabricTestFacts {
  const target = targetById(targetId)?.target;
  if (target === undefined) throw new Error(`Unknown target ${JSON.stringify(targetId)}.`);
  if (target.fabric === undefined) {
    throw new Error(`Minecraft ${target.mcVersion} has no Fabric versions in MSM yet.`);
  }
  return { mcVersion: target.mcVersion, loader: target.fabric.loader, api: target.fabric.api };
}

/** Starts `program` detached with its output ignored, so it outlives the app. */
export function spawnDetached(program: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(program, [...args], {
      cwd: dirname(program),
      detached: true,
      stdio: 'ignore',
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Creates the service. */
export function createTestInMinecraftService(deps: TestInMinecraftDeps): TestInMinecraftService {
  const { fs } = deps;
  const factsFor = deps.facts ?? builtInFabricFacts;
  const sha512 = deps.sha512 ?? webCryptoSha512;
  const download = deps.download ?? fetchDownloader;
  const spawnLauncher = deps.spawnLauncher ?? spawnDetached;
  const resolveReal = deps.realpath ?? ((path: string) => realpath(path));

  const realOrNull = async (path: string): Promise<string | null> => {
    try {
      return await resolveReal(normalize(path));
    } catch {
      return null;
    }
  };

  /** The first existing Prism data folder: detected ones, then those added in Settings. */
  const prismRoot = async (): Promise<string | null> => {
    const settings = await deps.settings.get();
    const manual = settings.launchers?.prismDataDirs ?? [];
    for (const root of [...defaultPrismDataDirs(deps.env), ...manual]) {
      if (await fs.exists(root)) return root;
    }
    return null;
  };

  const launcherProgram = async (location: GameLocation): Promise<string | null> => {
    const launcher = location.ref.launcher;
    if (launcher !== 'prism' && launcher !== 'multimc') return null;
    const programs = await deps.settings.launcherPrograms();
    return findLauncherProgram(fs, launcher, location.ref.root, deps.env, programs[launcher]);
  };

  const computeStatus = async (
    targetId: string,
  ): Promise<{ status: TestInMinecraftStatus; selected: GameLocation | null }> => {
    const facts = factsFor(targetId);
    const { selected } = await deps.locations.selected();
    const readiness = fabricReadiness(selected, facts);
    const status: TestInMinecraftStatus = {
      mcVersion: facts.mcVersion,
      loader: facts.loader,
      api: facts.api,
      location: selected === null ? null : toLocationView(selected, facts.mcVersion),
      mode: readiness.mode,
      reason:
        readiness.mode === 'blocked'
          ? readiness.reason
          : readiness.mode === 'install-only'
            ? readiness.note
            : null,
      launcherProgram:
        readiness.mode === 'launch' && selected !== null ? await launcherProgram(selected) : null,
      managedInstanceName: managedInstanceName(facts.mcVersion),
      managedInstanceSelected: selected !== null && (await isManagedInstance(fs, selected)),
      canCreateInstance: (await prismRoot()) !== null,
    };
    return { status, selected };
  };

  /**
   * The real game folder after the containment checks of pack installs, then the mods folder
   * (created when missing) checked to resolve inside it.
   */
  const checkedModsDir = async (location: GameLocation, modsDir: string): Promise<string> => {
    const realGame = await realOrNull(location.gameDir);
    if (realGame === null) throw new Error('The game folder of this location does not exist.');
    if (location.instanceDir !== null) {
      const instanceDir = normalize(location.instanceDir);
      const [realInstance, realInstances] = await Promise.all([
        realOrNull(instanceDir),
        realOrNull(dirname(instanceDir)),
      ]);
      if (
        realInstance === null ||
        realInstances === null ||
        !isPathInside(realInstances, realInstance) ||
        !(
          locationPathKey(realInstance) === locationPathKey(realGame) ||
          isPathInside(realInstance, realGame)
        )
      ) {
        throw new Error(
          `The game folder of ${JSON.stringify(location.displayName)} is outside its instance folder.`,
        );
      }
    }
    const mods = normalize(modsDir);
    await fs.mkdirp(mods);
    const realMods = await realOrNull(mods);
    if (realMods === null || !isPathInside(realGame, realMods)) {
      throw new Error('The mods folder is outside the game folder.');
    }
    return mods;
  };

  /** Starts the launcher when the location allows it; otherwise says how to start the game. */
  const launch = async (
    readiness: ReturnType<typeof fabricReadiness>,
    status: TestInMinecraftStatus,
    selected: GameLocation,
  ): Promise<{ launched: boolean; note: string | null }> => {
    if (readiness.mode === 'install-only') return { launched: false, note: readiness.note };
    const launcher = selected.ref.launcher === 'multimc' ? 'multimc' : 'prism';
    const program = status.launcherProgram;
    if (program === null) {
      return {
        launched: false,
        note: `${LAUNCHER_NAMES[launcher]} was not found, so it was not started. Start "${selected.displayName}" from it, or choose its program in the Test in Minecraft dialog.`,
      };
    }
    try {
      await spawnLauncher(program, launchArguments(selected.ref, deps.env));
      return { launched: true, note: null };
    } catch (error) {
      return {
        launched: false,
        note: `${LAUNCHER_NAMES[launcher]} could not be started (${messageOf(error)}). Start "${selected.displayName}" from it.`,
      };
    }
  };

  /**
   * A modpack's extra mod from the download cache (`<cache>/modrinth/<sha512 prefix>/<file>`),
   * downloaded once from Modrinth's CDN and checked against the pinned SHA-512 (ADR 0046 D5).
   */
  const cachedModrinthFile = async (mod: ModpackMod): Promise<Uint8Array> => {
    if (!isModrinthCdnUrl(mod.url)) {
      throw new Error(`${mod.title} does not come from Modrinth's download server.`);
    }
    const folder = `${deps.cacheDir}/modrinth/${mod.sha512.slice(0, 16)}`;
    const path = `${folder}/${mod.fileName}`;
    if (await fs.exists(path)) {
      const cached = await fs.readFile(path);
      if ((await sha512(cached)) === mod.sha512) return cached;
    }
    let bytes: Uint8Array;
    try {
      bytes = await download(mod.url);
    } catch (error) {
      throw new Error(`${mod.title} could not be downloaded: ${messageOf(error)}`);
    }
    if ((await sha512(bytes)) !== mod.sha512) {
      throw new Error(`The download of ${mod.title} does not match its pinned checksum.`);
    }
    await fs.mkdirp(folder);
    await fs.writeFile(path, bytes);
    return bytes;
  };

  return {
    async status(targetId) {
      return (await computeStatus(targetId)).status;
    },

    async createInstance(targetId) {
      const facts = factsFor(targetId);
      const root = await prismRoot();
      if (root === null) {
        throw new Error(
          'No Prism Launcher data folder was found. Install Prism Launcher and start it once, or add its folder in Settings.',
        );
      }
      const [instancesDir] = (await readMmcConfig(fs, root)).instanceDirs;
      if (instancesDir === undefined) throw new Error('Prism Launcher has no instances folder.');
      await fs.mkdirp(instancesDir);
      const created = await createManagedInstance(fs, instancesDir, facts);
      await deps.settings.set({
        installTarget: { launcher: 'prism', root: normalize(root), instance: created.folder },
      });
      return (await computeStatus(targetId)).status;
    },

    async run(targetId, modId, data) {
      const facts = factsFor(targetId);
      const { status, selected } = await computeStatus(targetId);
      const readiness = fabricReadiness(selected, facts);
      if (readiness.mode === 'blocked' || selected === null) {
        throw new Error(status.reason ?? 'No game location is selected.');
      }
      const modsDir = await checkedModsDir(selected, readiness.modsDir);
      const installDeps = { fs, sha512 };
      const api = await ensureFabricApi(installDeps, modsDir, facts.api, () =>
        cachedFabricApi({ fs, cacheDir: deps.cacheDir, download, sha512 }, facts.api),
      );
      const jar = await installContentJar(installDeps, modsDir, modId, data);
      // Only this project runs: jars MSM installed for other projects or modpacks go.
      const keep = new Set([contentJarModsFileName(modId)]);
      const removed = await removeUnlistedInstalls(installDeps, modsDir, keep);
      const result: TestInMinecraftResult = {
        jarPath: normalize(jar.path),
        replaced: jar.replaced,
        removed,
        fabricApi: api.state,
        fabricApiFile: api.file,
        launched: false,
        note: null,
      };
      return { ...result, ...(await launch(readiness, status, selected)) };
    },

    async runModpack(targetId, jars, mods) {
      const facts = factsFor(targetId);
      const { status, selected } = await computeStatus(targetId);
      const readiness = fabricReadiness(selected, facts);
      if (readiness.mode === 'blocked' || selected === null) {
        throw new Error(status.reason ?? 'No game location is selected.');
      }
      const modsDir = await checkedModsDir(selected, readiness.modsDir);
      const installDeps = { fs, sha512 };
      // Every extra mod is fetched (or read from the cache) before anything is written.
      const extras: { mod: ModpackMod; bytes: Uint8Array }[] = [];
      for (const mod of mods) extras.push({ mod, bytes: await cachedModrinthFile(mod) });
      const api = await ensureFabricApi(installDeps, modsDir, facts.api, () =>
        cachedFabricApi({ fs, cacheDir: deps.cacheDir, download, sha512 }, facts.api),
      );
      const installed: string[] = [];
      for (const jar of jars) {
        await installContentJar(installDeps, modsDir, jar.modId, jar.data);
        installed.push(contentJarModsFileName(jar.modId));
      }
      for (const { mod, bytes } of extras) {
        await installExtraMod(installDeps, modsDir, mod.fileName, mod.projectId, bytes);
        installed.push(mod.fileName);
      }
      const removed = await removeUnlistedInstalls(installDeps, modsDir, new Set(installed));
      const result: ModpackTestResult = {
        modsDir: normalize(modsDir),
        installed: [...installed].sort(),
        removed,
        fabricApi: api.state,
        fabricApiFile: api.file,
        launched: false,
        note: null,
      };
      return { ...result, ...(await launch(readiness, status, selected)) };
    },

    async pickLauncherProgram(launcher) {
      const path = await deps.pickProgram({
        title: `Choose the ${LAUNCHER_NAMES[launcher]} program`,
        filters:
          deps.env.platform === 'win32' ? [{ name: 'Programs', extensions: ['exe'] }] : undefined,
      });
      if (path === null) return null;
      if (!isAbsolute(path)) throw new Error('The launcher program must be an absolute path.');
      await deps.settings.setLauncherProgram(launcher, path);
      return normalize(path);
    },
  };
}
