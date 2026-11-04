/**
 * The `PlatformAdapter`: every piece of OS access the renderer needs, behind one interface so
 * that a Tauri port stays possible (ADR 0007). The main process implements it over Node; the
 * preload exposes it to the renderer over typed IPC.
 *
 * @packageDocumentation
 */

import type { ProjectFileSystem } from '@msm/core';
// Type-only: the service itself runs in main (ADR 0014); these are plain MSM shapes.
import type { McfunctionCompletion, McfunctionProblem } from '@msm/schemas/mcfunction';
import type { MenuCommand, MinecraftProgress, UpdateStatus, VendoredKeyName } from './ipc-channels';

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

/** Auto-update settings (ADR 0018). */
export interface UpdateSettings {
  /** Whether the installed app checks for updates shortly after start-up. Default `true`. */
  autoCheck: boolean;
}

/** The launchers MSM knows how to read (ADR 0019). */
export type LauncherKind = 'official' | 'prism' | 'multimc' | 'curseforge';

/** Mod loaders recognised in launcher instances (ADR 0019). */
export type LoaderKind = 'fabric' | 'quilt' | 'forge' | 'neoforge' | 'liteloader' | 'unknown';

/**
 * Mirrors `GameLocationRef` in `@msm/interop`: the serialisable identity of a game location,
 * stored in settings as the install target.
 */
export interface GameLocationRef {
  launcher: LauncherKind;
  /**
   * Launcher root: the `.minecraft` folder (official), the Prism/MultiMC data folder, or the
   * CurseForge modding folder. Absolute.
   */
  root: string;
  /** Instance folder name under the launcher's instances folder; absent for `official`. */
  instance?: string | undefined;
}

/** Mirrors `GameLocationProblem` in `@msm/interop`: a problem found reading a location. */
export interface GameLocationProblemView {
  code:
    | 'location.no-minecraft-component'
    | 'location.unreadable-metadata'
    | 'location.game-dir-missing'
    | 'location.unsupported-instance-type';
  message: string;
}

/** A warning about a location for the open project, such as `location.version-mismatch`. */
export interface GameLocationWarningView {
  code: string;
  message: string;
}

/**
 * Mirrors `GameLocation` in `@msm/interop` as plain JSON, plus the warnings main computed
 * against the project's Minecraft version.
 */
export interface GameLocationView {
  ref: GameLocationRef;
  /** DOM-safe id: `<launcher>:<instance|default>`, suffixed `-2`, `-3` on collision. */
  id: string;
  /** "Official launcher", or the instance's name, falling back to its folder name. */
  displayName: string;
  /** The instance's Minecraft version; `null` for the official launcher or when unknown. */
  mcVersion: string | null;
  loader: { kind: LoaderKind; version: string | null } | null;
  /** Where `resourcepacks/` and `saves/` live. Absolute. */
  gameDir: string;
  /** `<gameDir>/mods` for instances with a loader (Phase 4), otherwise `null`. */
  modsDir: string | null;
  problems: GameLocationProblemView[];
  warnings: GameLocationWarningView[];
}

/** Launcher folders the user added by hand in Settings (absolute, deduplicated, at most 16 each). */
export interface LauncherSettings {
  /** Prism Launcher data folders. */
  prismDataDirs: string[];
  /** MultiMC and PolyMC root folders. */
  multimcRoots: string[];
  /** CurseForge app modding folders (`.../curseforge/minecraft`). */
  curseForgeRoots: string[];
}

/** Application settings, persisted in `<msmHome>/settings.json`. */
export interface AppSettings {
  /** The user's chosen Minecraft game directory, or `null` to use the detected one. */
  minecraftDir: string | null;
  updates: UpdateSettings;
  /**
   * Manually added launcher folders. Main always fills it in (empty lists by default); optional
   * so that callers written before launcher support still compile.
   */
  launchers?: LauncherSettings;
  /**
   * The chosen install target; `null` means the official launcher (setting or detected). Main
   * always fills it in; optional for the same reason as {@link launchers}.
   */
  installTarget?: GameLocationRef | null;
}

/** A partial settings update: fields left out keep their stored value. */
export interface AppSettingsPatch {
  minecraftDir?: string | null | undefined;
  updates?: UpdateSettings | undefined;
  /** Replaces all three lists of manually added launcher folders. */
  launchers?: LauncherSettings | undefined;
  /** The new install target; `null` clears it (back to the official launcher). */
  installTarget?: GameLocationRef | null | undefined;
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
  schemaVersion: 2;
}

/** What main knows about the Minecraft installation for one version. */
export interface MinecraftStatus {
  /** The game directory in use (setting, else detected default), or `null` when none exists. */
  minecraftDir: string | null;
  /** Installed versions with a client jar in the selected location's launcher store. */
  installed: { id: string }[];
  /** The version in the selected location's store whose jar serves `mcVersion`, if any. */
  chosen: { id: string } | null;
  /** The extracted-asset cache for `mcVersion`, if complete. */
  cache: AssetCacheInfoView | null;
  /*
   * Launcher fields (ADR 0019). Main always sets them; they are optional so that status values
   * written before launcher support still type-check. Read a missing field as `null`, `false`
   * or `[]`.
   */
  /** The selected install target, or `null` when no location exists. */
  target?: GameLocationView | null;
  /** `true` when the stored install target was not found and main fell back to the official one. */
  targetMissing?: boolean;
  /** The client jar that serves `mcVersion` and the launcher whose store holds it, if any. */
  jar?: { versionId: string; launcher: LauncherKind } | null;
  /** Warnings for the selected target, such as `location.version-mismatch`; never blocking. */
  warnings?: GameLocationWarningView[];
}

/** Game locations main discovered, with the selected one. */
export interface GameLocationList {
  locations: GameLocationView[];
  /** The id of the selected location, or `null` when there is none. */
  selected: string | null;
}

/** A world folder under `<minecraftDir>/saves/` that contains `level.dat`. */
export interface WorldInfo {
  /** The world's folder name (one path segment). */
  dir: string;
  /** Display name: the folder name until `level.dat` is parsed (Phase 3). */
  name: string;
  /** ISO 8601 modification time of `level.dat`. */
  lastModified: string;
}

/** Ids the project declares per Spyglass symbol category, for the mcfunction checker. */
export type McfunctionProjectIds = Record<string, string[]>;

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
    /** Merges `settings` into the stored settings. */
    set(settings: AppSettingsPatch): Promise<void>;
  };
  minecraft: {
    status(mcVersion: string): Promise<MinecraftStatus>;
    /**
     * Lists every game location found (official launcher, Prism, MultiMC, CurseForge), with
     * warnings computed against `mcVersion` (ADR 0019).
     */
    listLocations(mcVersion: string): Promise<GameLocationList>;
    /** Extracts preview assets from the client jar into the cache (ADR 0011). */
    extract(mcVersion: string): Promise<AssetCacheInfoView>;
    /** Reads a cached vanilla asset by jar path, or `null` when it is not cached. */
    readAsset(mcVersion: string, path: string): Promise<Uint8Array | null>;
    /** Lists cached jar paths starting with `prefix`, sorted. */
    listAssets(mcVersion: string, prefix: string): Promise<string[]>;
    /** Writes a resource pack zip into `<gameDir>/resourcepacks/` of the selected location. */
    installResourcePack(fileName: string, data: Uint8Array): Promise<{ path: string }>;
    /** Lists worlds in `<gameDir>/saves/` of the selected location, most recently played first. */
    listWorlds(): Promise<WorldInfo[]>;
    /** Writes a data pack zip into `<gameDir>/saves/<worldDir>/datapacks/` of the selected location. */
    installDataPack(
      worldDir: string,
      fileName: string,
      data: Uint8Array,
    ): Promise<{ path: string }>;
  };
  /** The offline mcfunction checker (ADR 0014), one service per target in main. */
  mcfunction: {
    check(
      targetId: string,
      source: string,
      options: { uri: string; projectIds: McfunctionProjectIds },
    ): Promise<McfunctionProblem[]>;
    complete(
      targetId: string,
      source: string,
      offset: number,
      options: { uri: string; projectIds: McfunctionProjectIds; limit?: number },
    ): Promise<McfunctionCompletion[]>;
  };
  /** Writing several export files into one folder the user picked (combined export). */
  exports: {
    /** Shows a folder picker; returns the chosen absolute folder, or `null` when cancelled. */
    pickFolder(title: string): Promise<string | null>;
    /**
     * Writes pack files into a folder returned by {@link pickFolder} in this session. Names
     * are single `.zip` file names; each file is replaced atomically.
     */
    writeFiles(
      folder: string,
      files: { name: string; data: Uint8Array }[],
    ): Promise<{ paths: string[] }>;
  };
  thumbnails: {
    /** A PNG thumbnail of a project texture (`assets/...png`), at most `size` pixels square. */
    get(assetPath: string, size: number): Promise<Uint8Array>;
  };
  /**
   * The auto-updater (ADR 0018). Active only in the installed Windows app; elsewhere every
   * status is `disabled`.
   */
  updates: {
    /** Checks for an update now; resolves to the status once the check has finished. */
    check(): Promise<UpdateStatus>;
    /**
     * Quits and installs a downloaded update. Unsaved changes go through the usual close
     * prompt first; nothing happens when no update has been downloaded.
     */
    install(): Promise<void>;
    /** Subscribes to status changes; returns an unsubscribe function. */
    onStatus(listener: (status: UpdateStatus) => void): () => void;
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
