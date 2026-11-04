/**
 * The main-process {@link PlatformAdapter}: holds the current project root and serves a file
 * system scoped to it, plus settings, Minecraft installation access, thumbnails, dialogs, the
 * shell, the mcfunction checker and export folder writes. Electron-specific services (native dialogs, app information, revealing files,
 * image resizing) are injected so this module stays testable under plain Node.
 *
 * @packageDocumentation
 */

import { mkdir, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, normalize } from 'node:path';
import type { ProjectFileSystem } from '@msm/core';
import type { InstallEnv, InstallFileSystem } from '@msm/interop';
import { createNodeInstallFileSystem } from '@msm/interop/node';
import type { FileFilter, PlatformAdapter, RootResult } from '../../shared/platform';
import { createExportsService } from './exports';
import { createMcfunctionBroker } from './mcfunction';
import { createMinecraftService, type MinecraftService } from './minecraft';
import { createScopedFileSystem, isWithin, type ScopedFileSystem } from './scoped-fs';
import { createSettingsStore, type SettingsStore } from './settings';
import { createTargetsService } from './targets';
import { createThumbnailService } from './thumbnails';

/** The project file name; mirrors `PROJECT_FILE` in `@msm/core`. */
export const PROJECT_FILE = 'msm.project.json';

/** The largest file `pickFiles` reads, in bytes. */
export const MAX_PICKED_FILE_BYTES = 32 * 1024 * 1024;

/** Native dialogs supplied by Electron (or by the e2e hooks). */
export interface NativeDialogs {
  pickDirectory(opts: { title: string; mustBeEmpty?: boolean }): Promise<string | null>;
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
  /** Host facts used to detect the default Minecraft directory. */
  installEnv: InstallEnv;
  /** File access for the Minecraft service. Defaults to the Node adapter. */
  installFs?: InstallFileSystem;
  /** ISO 8601 timestamp source for the asset cache. */
  now?(): string;
}

/**
 * The main-process platform: the adapter plus main-only extras. `updates` is served by the
 * updater (`../updater.ts`), not by the Node platform.
 */
export interface MainPlatform extends Omit<PlatformAdapter, 'updates'> {
  minecraft: MinecraftService;
  settings: SettingsStore;
}

async function statOrNull(path: string): Promise<Awaited<ReturnType<typeof stat>> | null> {
  try {
    return await stat(path);
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
  const minecraft = createMinecraftService({
    msmHome: deps.msmHome,
    fs: deps.installFs ?? createNodeInstallFileSystem(),
    minecraftDir: () => settings.minecraftDir(),
    ...(deps.now === undefined ? {} : { now: deps.now }),
  });

  const targets = createTargetsService();

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
    if (lastSavePath !== null) roots.push(dirname(lastSavePath));
    if (lastExportFolder !== null) roots.push(lastExportFolder);
    return Promise.all(roots.map(realpathOrSelf));
  };

  return {
    app: { info: deps.info },
    dialogs: {
      pickDirectory: (opts) => deps.dialogs.pickDirectory(opts),
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
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, data);
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
          throw new Error(`${path} is outside the project, Minecraft and save folders.`);
        }
        deps.showItemInFolder(real);
      },
    },
    targets,
    settings,
    minecraft,
    mcfunction: createMcfunctionBroker({ readVendored: targets.readVendored }),
    exports: createExportsService({
      pickFolder: (opts) =>
        deps.dialogs.pickExportFolder === undefined
          ? deps.dialogs.pickDirectory(opts)
          : deps.dialogs.pickExportFolder(opts),
      onWritten: (path) => {
        lastExportFolder = dirname(path);
      },
    }),
    thumbnails: createThumbnailService({ projectFs: active, resizePng: deps.resizePng }),
    project: {
      async openRoot(path) {
        if (!isAbsolute(path)) return { ok: false, reason: 'The project path must be absolute.' };
        const info = await statOrNull(path);
        if (info === null || !info.isDirectory()) {
          return { ok: false, reason: `${path} is not a directory.` };
        }
        const file = await statOrNull(join(path, PROJECT_FILE));
        if (file === null || !file.isFile()) {
          return { ok: false, reason: `${path} does not contain ${PROJECT_FILE}.` };
        }
        return open(path);
      },
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
        return open(path);
      },
      async closeRoot() {
        currentRoot = null;
        scoped = null;
      },
      async currentRoot() {
        return currentRoot;
      },
    },
    fs,
  };
}
