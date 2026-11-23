/**
 * The main-process {@link PlatformAdapter}: holds the current project root and serves a file
 * system scoped to it, plus settings, Minecraft installation access, thumbnails, dialogs, the
 * shell, the mcfunction checker and export folder writes. Electron-specific services (native dialogs, app information, revealing files,
 * image resizing) are injected so this module stays testable under plain Node.
 *
 * @packageDocumentation
 */

import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, normalize } from 'node:path';
import type { ProjectFileSystem } from '@msm/core';
import type { Downloader, InstallEnv, InstallFileSystem, LauncherProgramEnv } from '@msm/interop';
import { createNodeInstallFileSystem } from '@msm/interop/node';
import { builtInTargets, targetById } from '@msm/targets';
import {
  type FileFilter,
  type LaunchNotice,
  LIVE_VIEW_DATA_FOLDERS,
  LOOKS_DATA_FOLDERS,
  type PlatformAdapter,
  type RecentProject,
  type RecentProjectView,
  type RootResult,
} from '../../shared/platform';
import { createExportsService } from './exports';
import { createGeckolibJarService } from './geckolib-jar';
import { type GradleWrapperLocation, readGradleWrapper } from './gradle-wrapper';
import { createLocationResolver } from './locations';
import { createMapExportService } from './map-export';
import { createMcfunctionBroker } from './mcfunction';
import { createMinecraftService, type MinecraftService } from './minecraft';
import { createModpackService, type ModpackService } from './modpacks';
import { createPlayService, type PlayService } from './play';
import { type RuntimeJarLocation, readRuntimeJar, runtimeVersionKey } from './runtime-jar';
import { createScopedFileSystem, isWithin, type ScopedFileSystem } from './scoped-fs';
import { createScriptingService, type ScriptingService } from './scripting';
import { createSettingsStore, type SettingsStore } from './settings';
import { createTargetsService } from './targets';
import { createTestInMinecraftService } from './test-in-minecraft';
import { createThumbnailService } from './thumbnails';
import { createTryItWorldsService, type TryItWorldsService } from './try-it-worlds';
import { createWorldBackupService } from './world-backups';
import { readResolvedBiomeLists } from './worldgen-biome-lists';

/**
 * Writes `data` to `path` through a temporary file in the same folder, then renames it into
 * place, so a reader never sees a partly written file (the e2e specs read exported zips as
 * soon as the save resolves). The temporary file is removed when the write fails. `mode` sets
 * the new file's permissions (for example `0o600` for the AI helper's key file).
 */
export async function writeFileAtomic(
  path: string,
  data: Uint8Array,
  options: { mode?: number } = {},
): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  const temp = join(dir, `.${basename(path)}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    await writeFile(temp, data, {
      flag: 'wx',
      ...(options.mode === undefined ? {} : { mode: options.mode }),
    });
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

/**
 * Wraps an {@link InstallFileSystem} so every `writeFile` goes through {@link writeFileAtomic}:
 * pack installs into a game folder, the content jar and Fabric API in `mods/`, managed instance
 * files and the download cache are never seen half written (the e2e specs read installed zips
 * as soon as they appear).
 */
export function withAtomicWrites(fs: InstallFileSystem): InstallFileSystem {
  return {
    ...fs,
    writeFile: (absPath, data) => writeFileAtomic(normalize(absPath), data),
  };
}

/** The project file name; mirrors `PROJECT_FILE` in `@msm/core`. */
export const PROJECT_FILE = 'msm.project.json';

/** The largest file `pickFiles` reads, in bytes. */
export const MAX_PICKED_FILE_BYTES = 32 * 1024 * 1024;

/** Native dialogs supplied by Electron (or by the e2e hooks). */
export interface NativeDialogs {
  /** Shows a folder picker, opening in `defaultPath` when given. */
  pickDirectory(opts: {
    title: string;
    mustBeEmpty?: boolean;
    defaultPath?: string;
  }): Promise<string | null>;
  /**
   * Shows a folder picker for export output; returns the absolute folder, or `null`. When
   * absent, `pickDirectory` is used.
   */
  pickExportFolder?(opts: { title: string }): Promise<string | null>;
  confirmDiscard(message: string): Promise<boolean>;
  /** Shows an open-files dialog; returns the chosen absolute paths, or `[]` when cancelled. */
  openFiles(opts: { title: string; filters?: FileFilter[] | undefined }): Promise<string[]>;
  /** Shows a save dialog; returns the chosen absolute path, or `null` when cancelled. */
  saveFilePath(opts: {
    title: string;
    defaultName: string;
    filters?: FileFilter[] | undefined;
  }): Promise<string | null>;
}

/** Host services the platform needs. */
export interface NodePlatformDeps {
  info: PlatformAdapter['app']['info'];
  dialogs: NativeDialogs;
  /** Reveals an absolute path in the OS file manager. */
  showItemInFolder(path: string): void;
  /** Scales PNG bytes so the longer edge is `size` pixels. */
  resizePng(png: Uint8Array, size: number): Uint8Array | Promise<Uint8Array>;
  /** The MSM home directory (settings and the asset cache). */
  msmHome: string;
  /** Host facts used to detect the default Minecraft and launcher folders. */
  installEnv: InstallEnv;
  /**
   * The user's documents folder; Very easy's new projects go in `<documentsDir>/MCSuperMods`
   * (ADR 0083 D6). Default `<home>/Documents`.
   */
  documentsDir?: string;
  /**
   * Opens a folder in the OS file manager (Electron's `shell.openPath`); resolves an error
   * text or `''`. Used by World backups' Open folder; without it the folder is only created.
   */
  openPath?(path: string): Promise<string>;
  /** File access for the Minecraft service. Defaults to the Node adapter. */
  installFs?: InstallFileSystem;
  /** ISO 8601 timestamp source for the asset cache and the recent-projects list. */
  now?(): string;
  /**
   * When true, `app.launchNotice()` always answers `null` (smoke and end-to-end runs);
   * the running version is still recorded.
   */
  suppressWhatsNew?: boolean;
  /** Called after the recent-projects list changed (the menu rebuilds from it). */
  onRecentChanged?(recent: readonly RecentProject[]): void;
  /** Adds a project root to the OS recent documents (the Windows jump list); optional. */
  addRecentDocument?(root: string): void;
  /** Clears the OS recent documents; optional. */
  clearRecentDocuments?(): void;
  /**
   * Where the `msm_runtime` jars are (ADR 0026 D4; one per target since ADR 0038 D4). When
   * absent, `exports.runtimeJar(targetId)` returns `null`.
   */
  runtimeJar?: RuntimeJarLocation;
  /**
   * Where the Gradle wrapper is (ADR 0033 D2). When absent, `exports.gradleWrapper()`
   * returns `null`.
   */
  gradleWrapper?: GradleWrapperLocation;
  /** The scripting service (ADR 0031); defaults to one that loads TypeScript lazily. */
  scripting?: ScriptingService;
  /**
   * Test in Minecraft (ADR 0026 D5): the download cache folder (default
   * `<msmHome>/cache/downloads`), extra host facts for finding launcher programs, and test
   * doubles for the downloader and the process spawn. The GeckoLib jar (ADR 0029 D4) uses the
   * same cache folder and downloader.
   */
  testInMinecraft?: {
    cacheDir?: string;
    env?: Partial<LauncherProgramEnv>;
    download?: Downloader;
    spawnLauncher?(program: string, args: readonly string[]): Promise<void>;
  };
}

/**
 * The main-process platform: the adapter plus main-only extras. `updates` is served by the
 * updater (`../updater.ts`) and `ai` by the AI service (`../ai/ai-service.ts`), not by the Node
 * platform.
 */
export interface MainPlatform
  extends Omit<PlatformAdapter, 'updates' | 'ai' | 'modpacks' | 'play'> {
  minecraft: MinecraftService;
  settings: SettingsStore;
  modpacks: ModpackService;
  /** One-click Play and Reload (ADR 0084); the IPC layer serves `play:*` from it. */
  play: PlayService;
  /** Try it's worlds (ADR 0087), read-only; the IPC layer serves `tryit:*` from it. */
  tryItWorlds: TryItWorldsService;
  /** World backups (ADR 0102 D3); the IPC layer serves `worldBackups:*` from it. */
  worldBackups: NonNullable<PlatformAdapter['worldBackups']>;
  /** Export as a map and builds from the game (ADR 0116 D2, D3); served as `maps:*`. */
  maps: NonNullable<PlatformAdapter['maps']>;
}

/**
 * What shows by itself on this launch: the Welcome on a brand-new install (no settings file
 * yet), "What's new" once after the version changed, nothing when suppressed (test runs). A
 * settings file without `lastSeenVersion` comes from an earlier version and counts as a
 * change.
 */
export function launchNoticeFor(facts: {
  previous: string | null;
  existed: boolean;
  current: string;
  suppressed: boolean;
}): LaunchNotice {
  if (facts.suppressed) return null;
  if (!facts.existed) return 'welcome';
  return facts.previous !== facts.current ? 'whats-new' : null;
}

async function statOrNull(path: string): Promise<Awaited<ReturnType<typeof stat>> | null> {
  try {
    return await stat(path);
  } catch {
    return null;
  }
}

async function isFile(path: string): Promise<boolean> {
  return (await statOrNull(path))?.isFile() === true;
}

/** The `name` in `<root>/msm.project.json`, or `null` when it cannot be read. */
async function readProjectName(root: string): Promise<string | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(root, PROJECT_FILE), 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const name = (parsed as Record<string, unknown>).name;
    return typeof name === 'string' && name.trim() !== '' ? name : null;
  } catch {
    return null;
  }
}

async function realpathOrSelf(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return normalize(path);
  }
}

/**
 * Creates the main-process platform.
 *
 * @param deps - Native services supplied by Electron and the MSM home directory.
 */
export function createNodePlatform(deps: NodePlatformDeps): MainPlatform {
  let currentRoot: string | null = null;
  let scoped: ScopedFileSystem | null = null;
  let lastSavePath: string | null = null;
  let lastExportFolder: string | null = null;

  const settings = createSettingsStore({ msmHome: deps.msmHome, installEnv: deps.installEnv });
  const installFs = deps.installFs ?? withAtomicWrites(createNodeInstallFileSystem());
  const locations = createLocationResolver({ fs: installFs, env: deps.installEnv, settings });
  // ADR 0102: data pack installs into a world back the world up first.
  const backups = createWorldBackupService({
    msmHome: deps.msmHome,
    settings,
    ...(deps.openPath === undefined ? {} : { openPath: deps.openPath }),
  });
  // The managed instance's game folder from the last Play status, so "Open the test
  // instance's folder" may reveal it and the biome lists (B592) can be read from it.
  let playGameDir: string | null = null;
  const minecraft = createMinecraftService({
    msmHome: deps.msmHome,
    fs: installFs,
    locations,
    backups,
    // ADR 0119 D4, D16: the jar's worldgen data folders come from the version's target.
    dataFoldersFor: (mcVersion) =>
      builtInTargets.find((bundle) => bundle.target.mcVersion === mcVersion)?.target.worldgen
        .terrainPreview?.dataFolders ?? null,
    // ADR 0120 D11 and ADR 0121 D3: the live views' and the looks views' folders, for every
    // built-in target's version.
    liveViewDataFoldersFor: (mcVersion) =>
      builtInTargets.some((bundle) => bundle.target.mcVersion === mcVersion)
        ? [...LIVE_VIEW_DATA_FOLDERS, ...LOOKS_DATA_FOLDERS]
        : null,
    resolvedBiomeLists: (mcVersion) =>
      readResolvedBiomeLists({ mcVersion, managedGameDir: playGameDir }),
    ...(deps.now === undefined ? {} : { now: deps.now }),
  });

  const targets = createTargetsService();
  const testOptions = deps.testInMinecraft ?? {};
  const downloadsDir = testOptions.cacheDir ?? join(deps.msmHome, 'cache', 'downloads');
  const geckolib = createGeckolibJarService({
    fs: installFs,
    cacheDir: downloadsDir,
    ...(testOptions.download === undefined ? {} : { download: testOptions.download }),
  });
  const testInMinecraft = createTestInMinecraftService({
    fs: installFs,
    env: { ...deps.installEnv, ...testOptions.env },
    locations,
    settings,
    cacheDir: downloadsDir,
    ...(testOptions.download === undefined ? {} : { download: testOptions.download }),
    ...(testOptions.spawnLauncher === undefined
      ? {}
      : { spawnLauncher: testOptions.spawnLauncher }),
    pickProgram: async (opts) => (await deps.dialogs.openFiles(opts))[0] ?? null,
  });
  const scripting = deps.scripting ?? createScriptingService();
  // ADR 0084: Play uses only the managed instance and the same download cache.
  const play = createPlayService({
    fs: installFs,
    env: { ...deps.installEnv, ...testOptions.env },
    settings,
    cacheDir: downloadsDir,
    appVersion: async () => (await deps.info()).version,
    transpile: (source, name) => scripting.transpile(source, name),
    ...(testOptions.download === undefined ? {} : { download: testOptions.download }),
    ...(testOptions.spawnLauncher === undefined
      ? {}
      : { spawnLauncher: testOptions.spawnLauncher }),
  });
  play.onStatus((status) => {
    if (status.gameDir !== null) playGameDir = status.gameDir;
  });
  // ADR 0087: Try it reads areas of saves in the known game folders and the Play instance.
  const tryItWorlds = createTryItWorldsService({
    locations,
    managedGameDir: () => playGameDir,
  });
  // ADR 0116 D2, D3: maps from the managed instance's or a launcher's worlds; builds from the
  // managed instance's structure-block saves.
  const mapExport = createMapExportService({
    locations,
    managedGame: async (targetId) => {
      try {
        const status = await play.status(targetId);
        return status.gameDir === null
          ? null
          : { gameDir: status.gameDir, openWorld: status.world };
      } catch {
        return null;
      }
    },
    saveFilePath: (opts) => deps.dialogs.saveFilePath(opts),
    onWritten: (path) => {
      lastSavePath = path;
    },
  });
  const modpacks = createModpackService({
    settings,
    pickDirectory: (opts) => deps.dialogs.pickDirectory(opts),
    writeFileAtomic: (path, data) => writeFileAtomic(path, data),
    caseInsensitive: deps.installEnv.platform === 'win32' || deps.installEnv.platform === 'darwin',
    ...(testOptions.download === undefined ? {} : { download: testOptions.download }),
  });
  const now = deps.now ?? (() => new Date().toISOString());

  const recentChanged = (recent: readonly RecentProject[]): void => {
    try {
      deps.onRecentChanged?.(recent);
    } catch {
      // A menu rebuild failure must not fail the project operation.
    }
  };

  /** Puts `root` first in the recent list. Failures never fail the open or create. */
  const recordRecent = async (root: string): Promise<void> => {
    try {
      const name = (await readProjectName(root)) ?? (basename(root) || root);
      recentChanged(await settings.recordRecentProject({ root, name, openedAt: now() }));
    } catch {
      // An unwritable settings file only loses the recent entry.
    }
    try {
      deps.addRecentDocument?.(root);
    } catch {
      // The jump list is a convenience.
    }
  };

  const openRoot = async (path: string): Promise<RootResult> => {
    if (!isAbsolute(path)) return { ok: false, reason: 'The project path must be absolute.' };
    const info = await statOrNull(path);
    if (info === null || !info.isDirectory()) {
      return { ok: false, reason: `${path} is not a directory.` };
    }
    if (!(await isFile(join(path, PROJECT_FILE)))) {
      return { ok: false, reason: `${path} does not contain ${PROJECT_FILE}.` };
    }
    const result = open(path);
    await recordRecent(path);
    return result;
  };

  const open = (path: string): RootResult => {
    currentRoot = path;
    scoped = createScopedFileSystem(path);
    return { ok: true };
  };

  const active = (): ScopedFileSystem => {
    if (scoped === null) throw new Error('No project is open.');
    return scoped;
  };

  const fs: ProjectFileSystem = {
    readFile: async (path) => active().readFile(path),
    writeFile: async (path, data) => active().writeFile(path, data),
    readDir: async (path) => active().readDir(path),
    exists: async (path) => active().exists(path),
    mkdirp: async (path) => active().mkdirp(path),
    remove: async (path) => active().remove(path),
  };

  /** Folders whose contents `showItemInFolder` may reveal. */
  const revealRoots = async (): Promise<string[]> => {
    const roots: string[] = [];
    if (currentRoot !== null) roots.push(currentRoot);
    const minecraftDir = await settings.minecraftDir();
    if (minecraftDir !== null) roots.push(minecraftDir);
    // The selected install target's game folder (a launcher instance), where installs land.
    try {
      const { selected } = await locations.selected();
      if (selected !== null) roots.push(normalize(selected.gameDir));
    } catch {
      // Discovery failed; reveal only the other roots.
    }
    if (lastSavePath !== null) roots.push(dirname(lastSavePath));
    if (lastExportFolder !== null) roots.push(lastExportFolder);
    if (playGameDir !== null) roots.push(normalize(playGameDir));
    return Promise.all(roots.map(realpathOrSelf));
  };

  // Project folder pickers open where the last project folder was chosen (B145).
  const pickDirectory: MainPlatform['dialogs']['pickDirectory'] = async ({ purpose, ...opts }) => {
    if (purpose !== 'project') return deps.dialogs.pickDirectory(opts);
    let defaultPath: string | null = null;
    try {
      defaultPath = await settings.lastProjectParent();
    } catch {
      // Unreadable settings: the dialog opens in its default folder.
    }
    const picked = await deps.dialogs.pickDirectory(
      defaultPath === null ? opts : { ...opts, defaultPath },
    );
    if (picked !== null && isAbsolute(picked)) {
      try {
        await settings.setLastProjectParent(dirname(normalize(picked)));
      } catch {
        // An unwritable settings file only loses the remembered folder.
      }
    }
    return picked;
  };

  return {
    app: {
      info: deps.info,
      async launchNotice() {
        try {
          const { version } = await deps.info();
          const seen = await settings.recordSeenVersion(version);
          return launchNoticeFor({
            ...seen,
            current: version,
            suppressed: deps.suppressWhatsNew === true,
          });
        } catch {
          return null;
        }
      },
    },
    dialogs: {
      pickDirectory,
      confirmDiscard: (message) => deps.dialogs.confirmDiscard(message),
      async pickFiles(opts) {
        const paths = await deps.dialogs.openFiles(opts);
        const files = [];
        for (const path of paths) {
          const info = await stat(path);
          if (!info.isFile()) throw new Error(`${path} is not a file.`);
          if (info.size > MAX_PICKED_FILE_BYTES) {
            throw new Error(`${basename(path)} is larger than 32 MB.`);
          }
          const buffer = await readFile(path);
          files.push({
            path,
            name: basename(path),
            data: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
          });
        }
        return files;
      },
      async saveFile({ data, ...opts }) {
        const path = await deps.dialogs.saveFilePath(opts);
        if (path === null) return null;
        if (!isAbsolute(path)) throw new Error('The save path must be absolute.');
        await writeFileAtomic(path, data);
        lastSavePath = path;
        return path;
      },
    },
    shell: {
      async showItemInFolder(path) {
        if (!isAbsolute(path)) throw new Error('The path must be absolute.');
        const real = await realpathOrSelf(path);
        const roots = await revealRoots();
        if (!roots.some((root) => isWithin(root, real))) {
          throw new Error(
            `${path} is outside the project, Minecraft, install target and save folders.`,
          );
        }
        deps.showItemInFolder(real);
      },
    },
    targets,
    settings,
    minecraft,
    worldBackups: {
      list: () => minecraft.listWorldBackups(),
      restore: (request) => minecraft.restoreWorldBackup(request),
      openFolder: () => backups.openFolder(),
    },
    maps: {
      listWorlds: (targetId) => mapExport.listWorlds(targetId),
      exportMap: (request) => mapExport.exportMap(request),
      listStructureSaves: (targetId) => mapExport.listStructureSaves(targetId),
      readStructureSave: (targetId, world, id) => mapExport.readStructureSave(targetId, world, id),
    },
    mcfunction: createMcfunctionBroker({ readVendored: targets.readVendored }),
    exports: {
      ...createExportsService({
        pickFolder: (opts) =>
          deps.dialogs.pickExportFolder === undefined
            ? deps.dialogs.pickDirectory(opts)
            : deps.dialogs.pickExportFolder(opts),
        onWritten: (path) => {
          lastExportFolder = dirname(path);
        },
      }),
      runtimeJar: async (targetId) => {
        // ADR 0038 D4: one runtime per target, found by the target's runtime version key.
        const mcVersion = targetById(targetId)?.target.mcVersion;
        if (deps.runtimeJar === undefined || mcVersion === undefined) return null;
        return readRuntimeJar(deps.runtimeJar, runtimeVersionKey(mcVersion));
      },
      geckolibJar: (targetId) => geckolib.jar(targetId),
      gradleWrapper: async () =>
        deps.gradleWrapper === undefined ? null : readGradleWrapper(deps.gradleWrapper),
    },
    scripting,
    testInMinecraft,
    play,
    tryItWorlds,
    modpacks,
    thumbnails: createThumbnailService({ projectFs: active, resizePng: deps.resizePng }),
    project: {
      openRoot,
      async createRoot(path) {
        if (!isAbsolute(path)) return { ok: false, reason: 'The project path must be absolute.' };
        const info = await statOrNull(path);
        if (info !== null) {
          if (!info.isDirectory()) return { ok: false, reason: `${path} is not a directory.` };
          if ((await readdir(path)).length > 0) {
            return { ok: false, reason: `${path} is not empty.` };
          }
        } else {
          await mkdir(path, { recursive: true });
        }
        const result = open(path);
        await recordRecent(path);
        return result;
      },
      async closeRoot() {
        currentRoot = null;
        scoped = null;
      },
      async currentRoot() {
        return currentRoot;
      },
      async defaultParent() {
        try {
          const last = await settings.lastProjectParent();
          if (last !== null) return last;
        } catch {
          // Unreadable settings: the documents folder.
        }
        return join(deps.documentsDir ?? join(deps.installEnv.home, 'Documents'), 'MCSuperMods');
      },
      async recent() {
        const list = await settings.recentProjects();
        return Promise.all(
          list.map(async (entry): Promise<RecentProjectView> => {
            const exists = await isFile(join(entry.root, PROJECT_FILE));
            const name = exists ? ((await readProjectName(entry.root)) ?? entry.name) : entry.name;
            return { ...entry, name, exists };
          }),
        );
      },
      async openRecent(root) {
        // Only roots already in the list: the renderer never opens an arbitrary path here.
        const entry = await settings.findRecentProject(root);
        if (entry === null) {
          return { ok: false, reason: `${root} is not in the recent projects list.` };
        }
        return openRoot(entry.root);
      },
      async removeRecent(root) {
        recentChanged(await settings.removeRecentProject(root));
      },
      async clearRecent() {
        await settings.clearRecentProjects();
        recentChanged([]);
        try {
          deps.clearRecentDocuments?.();
        } catch {
          // The jump list is a convenience.
        }
      },
    },
    fs,
  };
}
