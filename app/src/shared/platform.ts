/**
 * The `PlatformAdapter`: every piece of OS access the renderer needs, behind one interface so
 * that a Tauri port stays possible (ADR 0007). The main process implements it over Node; the
 * preload exposes it to the renderer over typed IPC.
 *
 * @packageDocumentation
 */

import type { ProjectFileSystem } from '@msm/core';
import type { MenuCommand, MinecraftProgress, VendoredKeyName } from './ipc-channels';

/** The outcome of opening or creating a project root. */
export type RootResult = { ok: true } | { ok: false; reason: string };

/** A file-type filter for open and save dialogs. */
export interface FileFilter {
  name: string;
  extensions: string[];
}

/** A file the user picked, read by main. */
export interface PickedFile {
  /** Absolute path on disk. */
  path: string;
  /** The file name (last path segment). */
  name: string;
  data: Uint8Array;
}

/** Application settings, persisted in `<msmHome>/settings.json`. */
export interface AppSettings {
  /** The user's chosen Minecraft game directory, or `null` to use the detected one. */
  minecraftDir: string | null;
}

/** {@link AppSettings} plus what main detected. */
export interface AppSettingsView extends AppSettings {
  /** The launcher's default game directory when it exists, otherwise `null`. */
  detectedMinecraftDir: string | null;
}

/** Mirrors `AssetCacheInfo` in `@msm/interop` (contents of the cache's `cache.json`). */
export interface AssetCacheInfoView {
  version: string;
  jarSha1: string;
  fileCount: number;
  extractedAt: string;
  schemaVersion: 1;
}

/** What main knows about the Minecraft installation for one version. */
export interface MinecraftStatus {
  /** The game directory in use (setting, else detected default), or `null` when none exists. */
  minecraftDir: string | null;
  /** Installed versions with a client jar. */
  installed: { id: string }[];
  /** The installed version whose jar serves `mcVersion`, if any. */
  chosen: { id: string } | null;
  /** The extracted-asset cache for `mcVersion`, if complete. */
  cache: AssetCacheInfoView | null;
}

/** Host services for the renderer. */
export interface PlatformAdapter {
  app: { info(): Promise<{ version: string; electron: string; platform: string }> };
  dialogs: {
    pickDirectory(opts: { title: string; mustBeEmpty?: boolean }): Promise<string | null>;
    confirmDiscard(message: string): Promise<boolean>;
    /** Shows an open dialog and returns the chosen files' bytes (32 MB cap per file). */
    pickFiles(opts: { title: string; filters?: FileFilter[] | undefined }): Promise<PickedFile[]>;
    /** Shows a save dialog, writes `data` to the chosen path and returns it, or `null`. */
    saveFile(opts: {
      title: string;
      defaultName: string;
      filters?: FileFilter[] | undefined;
      data: Uint8Array;
    }): Promise<string | null>;
  };
  shell: {
    /**
     * Reveals a file in the OS file manager. Only paths under the project root, the Minecraft
     * directory or the last save location are allowed.
     */
    showItemInFolder(path: string): Promise<void>;
  };
  targets: {
    /** Reads one vendored data file of a built-in target. */
    readVendored(targetId: string, key: VendoredKeyName): Promise<Uint8Array>;
  };
  settings: {
    get(): Promise<AppSettingsView>;
    set(settings: AppSettings): Promise<void>;
  };
  minecraft: {
    status(mcVersion: string): Promise<MinecraftStatus>;
    /** Extracts preview assets from the client jar into the cache (ADR 0011). */
    extract(mcVersion: string): Promise<AssetCacheInfoView>;
    /** Reads a cached vanilla asset by jar path, or `null` when it is not cached. */
    readAsset(mcVersion: string, path: string): Promise<Uint8Array | null>;
    /** Lists cached jar paths starting with `prefix`, sorted. */
    listAssets(mcVersion: string, prefix: string): Promise<string[]>;
    /** Writes a resource pack zip into `<minecraftDir>/resourcepacks/`. */
    installResourcePack(fileName: string, data: Uint8Array): Promise<{ path: string }>;
  };
  thumbnails: {
    /** A PNG thumbnail of a project texture (`assets/...png`), at most `size` pixels square. */
    get(assetPath: string, size: number): Promise<Uint8Array>;
  };
  project: {
    openRoot(path: string): Promise<RootResult>;
    createRoot(path: string): Promise<RootResult>;
    closeRoot(): Promise<void>;
    currentRoot(): Promise<string | null>;
  };
  /** File access scoped to the current project root. Rejects when no root is open. */
  fs: ProjectFileSystem;
}

/** What the preload exposes as `window.msm`: the adapter plus window-level events. */
export interface MsmBridge extends PlatformAdapter {
  /** Subscribes to application-menu commands; returns an unsubscribe function. */
  onMenu(listener: (command: MenuCommand) => void): () => void;
  /** Subscribes to asset extraction progress; returns an unsubscribe function. */
  onMinecraftProgress(listener: (progress: MinecraftProgress) => void): () => void;
  /** Tells the main process whether there are unsaved changes (for the close prompt). */
  setDirty(dirty: boolean): void;
  /** Tells the main process the renderer has rendered (smoke mode). */
  smokeReady(): void;
  /**
   * `true` when the app runs in smoke mode (`MSM_SMOKE=1`). The renderer then sets
   * `window.msmNoMonaco` so headless smoke runs skip Monaco. Optional so test doubles may omit it.
   */
  readonly isSmoke?: boolean;
}
