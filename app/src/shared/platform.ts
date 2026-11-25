/**
 * The `PlatformAdapter`: every piece of OS access the renderer needs, behind one interface so
 * that a Tauri port stays possible (ADR 0007). The main process implements it over Node; the
 * preload exposes it to the renderer over typed IPC.
 *
 * @packageDocumentation
 */

import type { AiEvent, AiKeyTestResult, AiSettings, AiStartRequest, AiToolResult } from '@msm/ai';
import type { Modpack, ModpackMod, ProjectFileSystem } from '@msm/core';
// Type-only: the service itself runs in main (ADR 0014); these are plain MSM shapes.
import type { JavaProjectScan } from '@msm/exporters';
import type { Json, Problem } from '@msm/plugin-api';
import type { McfunctionCompletion, McfunctionProblem } from '@msm/schemas/mcfunction';
// Type-only: the AI helper's protocol (ADR 0041); the SDK itself runs only in main.
import type { AiPicturesPlatform } from './ai-pictures';

/** The mcfunction IPC's payload types, for the renderer (which may not import Spyglass). */
export type { McfunctionCompletion, McfunctionProblem };

import type {
  MenuCommand,
  MinecraftProgress,
  PluginCapability,
  UpdateStatus,
  VendoredKeyName,
} from './ipc-channels';
import type { RecoveryNotice } from './recovery-notice';

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

/**
 * What MSM makes for a run (ADR 0133 D2): a managed launcher instance by its purpose (the
 * marker's `purpose`: the test instance, Plain without mods, a modpack's, a map's) or a local
 * server.
 */
export type ManagedKind = 'test' | 'plain' | 'pack' | 'map' | 'server';

/** The kinds in {@link ManagedKind}, in the order Settings lists them. */
export const MANAGED_KINDS: readonly ManagedKind[] = ['test', 'plain', 'pack', 'map', 'server'];

/**
 * "Ask before making an instance" (ADR 0133 D3): the first time for each kind (the default),
 * always, or never.
 */
export type InstanceAskSetting = 'first-time' | 'always' | 'never';

/** The offer card's settings (ADR 0133 D3). */
export interface InstanceSettings {
  ask: InstanceAskSetting;
  /**
   * The kinds MSM now makes by itself: the user ticked "Do this by itself next time", or (with
   * `first-time`) one of that kind was made after the card.
   */
  madeByItself: ManagedKind[];
}

/**
 * The local server's settings (ADR 0133 D7; vetoable defaults the user has not answered yet:
 * white list off, online mode on).
 */
export interface LocalServerSettings {
  /** `white-list` in `server.properties`. Default `false`: anyone who can reach it joins. */
  whiteList: boolean;
  /** `online-mode`. Default `true`: players sign in with their Microsoft account. */
  onlineMode: boolean;
}

/** World backups before installing into a world (ADR 0102 D1). */
export interface WorldBackupSettings {
  /** Whether a data pack install into a world first zips the whole world. Default `true`. */
  beforeInstall: boolean;
  /** How many backups to keep per world; the oldest beyond it are deleted. Default 5. */
  keep: number;
}

/** The backup a data pack install made (ADR 0102 D3: the install message names it). */
export interface WorldBackupRef {
  /** The backup zip. Absolute, under `<msmHome>/backups/`. */
  path: string;
  /** `<YYYY-MM-DD_HH-mm-ss>.zip`. */
  fileName: string;
  /** The location folder under `backups/` (`<launcher>-<instance|default>-<hash>`). */
  location: string;
  /** The world's folder name under `saves/`. */
  worldDir: string;
}

/** One backup zip in Settings > World backups. */
export interface WorldBackupEntry {
  fileName: string;
  /** Absolute path of the zip. */
  path: string;
  /** Size in bytes. */
  size: number;
  /** ISO 8601 modification time of the zip. */
  createdAt: string;
}

/** The backups of one world, newest first. */
export interface WorldBackupGroup {
  /** The location folder under `backups/`. */
  location: string;
  /** The game location's name when it is still found, else the folder name. */
  locationName: string;
  /** Whether that game location is still found (Restore needs it). */
  available: boolean;
  worldDir: string;
  backups: WorldBackupEntry[];
}

/** Everything in `<msmHome>/backups/`. */
export interface WorldBackupList {
  /** `<msmHome>/backups`. Absolute. */
  folder: string;
  groups: WorldBackupGroup[];
}

/** Which backup to restore. */
export interface WorldBackupRestoreRequest {
  location: string;
  worldDir: string;
  fileName: string;
}

/** World backups (ADR 0102 D3), served by main. */
export interface WorldBackupsPlatform {
  list(): Promise<WorldBackupList>;
  /**
   * Unpacks a backup beside its world as `<world-dir>-restored-<stamp>` in the same `saves/`
   * folder, never over the live world. Resolves the new folder's name and path.
   */
  restore(request: WorldBackupRestoreRequest): Promise<{ dir: string; path: string }>;
  /** Opens `<msmHome>/backups/` in the file manager (created when missing). */
  openFolder(): Promise<void>;
}

/** Worlds a map can be made from: one game folder (ADR 0116 D2). */
export interface MapWorldSource {
  /** `msm-play` for the managed Play instance, else the game location's id. */
  id: string;
  /** The instance or location name. */
  name: string;
  /** Whether this is the managed Play instance (its test and game worlds). */
  managed: boolean;
  /** Its worlds, most recently changed first. */
  worlds: WorldInfo[];
}

/** What {@link MapsPlatform.exportMap} writes. */
export interface MapExportRequest {
  targetId: string;
  /** A {@link MapWorldSource.id} from {@link MapsPlatform.listWorlds}. */
  sourceId: string;
  /** A world folder of that source. */
  worldDir: string;
  /** "Keep my player data": players' files and `level.dat_old` go into the map too. */
  keepPlayerData: boolean;
  /** The world folder name inside the map (also the file name). */
  mapName: string;
  /** A world zip's data pack, written to `datapacks/<fileName>`. */
  dataPack?: { fileName: string; data: Uint8Array } | undefined;
  /** A world zip's resource pack, written as `resources.zip`. */
  resourcePack?: Uint8Array | undefined;
  /**
   * For a project that needs the jar: a `.mrpack` with this `modrinth.index.json` text, the jars
   * under `overrides/mods/` and the world under `overrides/saves/` (ADR 0046 D4, ADR 0116 D2).
   */
  mrpack?: { index: string; jars: { fileName: string; data: Uint8Array }[] } | undefined;
}

/** Why a world entry was not copied into a map. */
export type MapLeftOutReason = 'lock' | 'dev-pack' | 'player-data' | 'replaced';

/** A written map. */
export interface MapExportResult {
  /** The map file. */
  path: string;
  kind: 'world-zip' | 'mrpack';
  /** Zip entries written. */
  entries: number;
  /** Top-most world entries left out, sorted by path. */
  leftOut: { path: string; reason: MapLeftOutReason }[];
}

/** A structure-block save of a managed instance world (ADR 0116 D3). */
export interface StructureSaveInfo {
  /** The world's folder name. */
  world: string;
  /** `<namespace>:<path>`, the name typed into the structure block. */
  id: string;
  size: number;
  /** ISO 8601. */
  lastModified: string;
}

/** Export as a map and builds from the game (ADR 0116 D2, D3), served by main. */
export interface MapsPlatform {
  /** The managed instance's worlds (first, even with none) and every game location's. */
  listWorlds(targetId: string): Promise<MapWorldSource[]>;
  /** Asks where to save, then writes the map; `null` when cancelled. */
  exportMap(request: MapExportRequest): Promise<MapExportResult | null>;
  /** The structure-block saves of the managed instance's worlds for `targetId`. */
  listStructureSaves(targetId: string): Promise<StructureSaveInfo[]>;
  /** One save's `.nbt` bytes. */
  readStructureSave(targetId: string, world: string, id: string): Promise<Uint8Array>;
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
  /**
   * The AI helper's model, effort per mode, fallback switch and default run limits (ADR 0041
   * D7). Main always fills it in (`DEFAULT_AI_SETTINGS` when unset); optional for the same
   * reason as {@link launchers}. The API key is never part of the settings (D1).
   */
  ai?: AiSettings;
  /**
   * World backups before installing into a world (ADR 0102 D1). Main always fills it in;
   * optional for the same reason as {@link launchers}.
   */
  backups?: WorldBackupSettings;
  /**
   * The offer card's settings (ADR 0133 D3). Main always fills it in; optional for the same
   * reason as {@link launchers}.
   */
  instances?: InstanceSettings;
  /**
   * The local server's settings (ADR 0133 D7). Main always fills it in; optional for the same
   * reason as {@link launchers}.
   */
  localServers?: LocalServerSettings;
}

/**
 * One recently opened or created project, as stored in `settings.json` (`recentProjects`,
 * newest first, at most `RECENT_PROJECTS_MAX` entries).
 */
export interface RecentProject {
  /** The project folder. Absolute. */
  root: string;
  /** The project's `name` from `msm.project.json`, else the folder name. */
  name: string;
  /** ISO 8601 time the project was last opened or created. */
  openedAt: string;
}

/** A {@link RecentProject} plus whether its folder still holds `msm.project.json`. */
export interface RecentProjectView extends RecentProject {
  /** Checked when the list is read. */
  exists: boolean;
}

/**
 * What a Your mods card shows of a recent mod (ADR 0128 D4), read from its folder without
 * opening it (`main/platform/recent-summary.ts`).
 */
export interface RecentProjectSummary {
  /** How many things it has, counted as Home's My things counts them. */
  things: number;
  /** Its `pack.png`, else its first item or block texture (PNG bytes), else `null`. */
  picture: Uint8Array | null;
  /** Where the picture came from. */
  pictureFrom: 'pack' | 'texture' | null;
  /**
   * The target id the mod is made for (the first of `targets` in `msm.project.json`); absent
   * when the file names none (ADR 0136 D5: Home's "Made for Minecraft X").
   */
  target?: string;
}

/** A partial settings update: fields left out keep their stored value. */
export interface AppSettingsPatch {
  minecraftDir?: string | null | undefined;
  updates?: UpdateSettings | undefined;
  /** Replaces all three lists of manually added launcher folders. */
  launchers?: LauncherSettings | undefined;
  /** The new install target; `null` clears it (back to the official launcher). */
  installTarget?: GameLocationRef | null | undefined;
  /** Replaces the AI helper settings (main cleans and clamps them). */
  ai?: AiSettings | undefined;
  /** Replaces the world backup settings. */
  backups?: WorldBackupSettings | undefined;
  /** Replaces the offer card's settings (main cleans them). */
  instances?: InstanceSettings | undefined;
  /** Replaces the local server's settings. */
  localServers?: LocalServerSettings | undefined;
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
  /** The jar the files came from (schema 4). */
  jarPath: string;
  /**
   * The `data/minecraft/` folders kept for the world generation preview (schema 4) and the live
   * views (schema 5, {@link LIVE_VIEW_DATA_FOLDERS}; schema 6, {@link LOOKS_DATA_FOLDERS}), sorted.
   */
  dataFolders: string[];
  fileCount: number;
  /** The total size of the cached files in bytes (schema 6): the cache size reported. */
  byteCount: number;
  extractedAt: string;
  /** 8 since every mob and GUI texture (ADR 0129 D4); 7 added the structure templates (B636). */
  schemaVersion: 8;
}

/** Why an object of the launcher's asset store could not be read (ADR 0121 D3). */
export type AssetObjectFailureView =
  /** No launcher MSM found holds the version, or its store has no `assets/` folder. */
  | 'not_set_up'
  /** The version JSON or its asset index is missing or unreadable. */
  | 'no_index'
  /** The index does not list the key. */
  | 'not_listed'
  /** The key is not one MSM reads, or the file lies outside the store. */
  | 'not_allowed'
  /** Larger than 16 MB. */
  | 'too_large'
  /** Listed, but the file is not there. */
  | 'missing';

/**
 * The answer of `minecraft:assetObject`: the bytes of one object of the user's own asset store
 * (vanilla's `sounds.json`, a sound, a unifont archive), read on demand and never cached, copied
 * or exported; or why not.
 */
export type AssetObjectAnswer =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; reason: AssetObjectFailureView };

/**
 * Mirrors `WorldgenFileMap` in `@msm/terrain` (ADR 0119 D4): registry folder key
 * (`worldgen/noise_settings`, `dimension_type`, `tags/worldgen/biome`, ...) to id
 * (`minecraft:overworld`) to the file's JSON.
 */
export type WorldgenFileMapView = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

/**
 * One resolved biome parameter list (B592; `@msm/terrain`'s `resolvePreset` reads it): `biomes`
 * is a palette of biome ids, and each point is the index of its biome in it, then min and max of
 * temperature, humidity, continentalness, erosion, depth and weirdness, then the offset, all as the
 * game's quantized whole numbers (the data pack value times 10,000), in the list's own order.
 */
export interface ResolvedBiomeListView {
  readonly biomes: readonly string[];
  readonly points: readonly (readonly number[])[];
}

/**
 * The resolved biome parameter lists of vanilla's `multi_noise` presets (ADR 0119 D4, reserve
 * B592), by preset id (`minecraft:overworld`, `minecraft:nether`): written by the runtime's dev
 * mode into the managed Play instance on the user's machine, read by main, never exported, written
 * into a project or sent to the AI helper.
 */
export type ResolvedBiomeListsView = Readonly<Record<string, ResolvedBiomeListView>>;

/**
 * Every cached vanilla worldgen file of one version in one answer (ADR 0119 D4), for the live
 * world generation preview. The files come from the user's own client jar, stay in the local
 * cache and are never exported, written into a project or sent to the AI helper.
 */
export interface VanillaWorldgenFiles {
  /** The installed version the cache came from. */
  version: string;
  /** Folder key to id to JSON, over the target's `worldgen.terrainPreview.dataFolders`. */
  files: WorldgenFileMapView;
  fileCount: number;
  /** From the runtime's dev mode after a Play of this version (B592); `null` before, or unreadable. */
  resolvedBiomeLists: ResolvedBiomeListsView | null;
}

/**
 * The sorts of vanilla thing {@link VanillaNames} names (ADR 0124 D3, B656): blocks, items,
 * entity types, biomes, effects, enchantments, potions and sound subtitles.
 */
export const VANILLA_NAME_SORTS = [
  'blocks',
  'items',
  'entityTypes',
  'biomes',
  'effects',
  'enchantments',
  'potions',
  'subtitles',
] as const;

/** One sort of {@link VANILLA_NAME_SORTS}. */
export type VanillaNameSort = (typeof VANILLA_NAME_SORTS)[number];

/**
 * The English names of a target's vanilla things from the `en_us.json` of the user's own client
 * jar in the local asset cache (ADR 0124 D3, B656; `minecraft:names`), for the search's vanilla
 * layer and, later, the ThingPicker. Nothing of it is bundled, stored beyond the cache, exported
 * or written into a project. The text is raw: the search tokenises and folds it.
 *
 * Each sort maps an id (`minecraft:stone`) to its name; `potions` maps a potion id to the name
 * of its bottle (`item.minecraft.potion.effect.<id>`); `subtitles` maps the tail of a subtitle
 * key (`entity.zombie.ambient` of `subtitles.entity.zombie.ambient`), which for most sounds is
 * the sound event's path, to the subtitle (the jar has no names of sound events or particles).
 */
export type VanillaNames = { version: string } & Record<
  VanillaNameSort,
  Readonly<Record<string, string>>
>;

/** One heading of a guide page in {@link GuideIndex} (ADR 0124 D14). */
export interface GuideSection {
  /** The page name (the file name without `.md`, such as `vehicles`). */
  page: string;
  /** 1 for the page title, 2 for `##`, 3 for `###`, 4 for `####`. */
  level: 1 | 2 | 3 | 4;
  /** The heading's text without Markdown marks. */
  heading: string;
  /** The heading's anchor as the docs site writes it (`change-a-block-s-type`, no `#`). */
  anchor: string;
  /**
   * The anchor GitHub gives the heading, when it differs (`script-api-16` beside
   * `script-api-1-6`): some of the guide's links are written this way.
   */
  alias?: string;
  /** The first sentence under the heading, or empty when it opens with a table or code. */
  sentence: string;
}

/** The guide's pages and headings (ADR 0124 D14, B656; `guide:index`), built by main once. */
export interface GuideIndex {
  /** Every page, sorted by name, with its `#` title (the page name when it has none). */
  pages: { page: string; title: string }[];
  sections: GuideSection[];
}

/** One guide page's Markdown (`guide:page`). */
export interface GuidePage {
  page: string;
  markdown: string;
}

/** The user guide inside the app (ADR 0124 D14), served by main. */
export interface GuidePlatform {
  /** The headings and first sentences of every page. */
  index(): Promise<GuideIndex>;
  /** One page's Markdown; rejects for a name that is not a page of the guide. */
  page(page: string): Promise<GuidePage>;
}

/**
 * The `data/minecraft/` folders of the client jar the live views read (ADR 0120 D11; the jar path
 * list of the spike B600, 2S4), kept in the local cache beside the target's world generation
 * folders: loot tables, advancements, predicates, enchantments and their providers, damage and
 * chat types, dialogs, trial spawners, block transformers, the two number provider folders, and
 * the tags of the registries the views name. Block tags and the worldgen folders come with the
 * target's `worldgen.terrainPreview.dataFolders`, so they are not repeated here.
 *
 * Not a version fact: it names what the views read, by registry folder. A jar without one of
 * these folders extracts nothing for it, and the view says the file was not found. The files
 * stay in the user's cache: never committed, bundled, exported, written into a project or sent
 * to the AI helper.
 */
export const LIVE_VIEW_DATA_FOLDERS: readonly string[] = Object.freeze([
  'advancement',
  'block_transformer',
  'chat_type',
  'context_float_provider',
  'context_int_provider',
  'damage_type',
  'dialog',
  'enchantment',
  'enchantment_provider',
  'loot_table',
  'predicate',
  'tags/banner_pattern',
  'tags/damage_type',
  'tags/dialog',
  'tags/enchantment',
  'tags/entity_type',
  'tags/fluid',
  'tags/game_event',
  'tags/instrument',
  'tags/item',
  'tags/painting_variant',
  'tags/point_of_interest_type',
  'tags/potion',
  'tags/timeline',
  'trial_spawner',
]);

/**
 * The `data/minecraft/` folders of the client jar the looks and sounds views read (ADR 0121 D3;
 * the B619 spike's list for B621), kept in the local cache beside {@link LIVE_VIEW_DATA_FOLDERS}
 * from schema 6: the mob variants and sound variants, the sulfur cube archetypes, paintings,
 * banner, trim and pot patterns, trim materials, jukebox songs, instruments, timelines and world
 * clocks, and `block_sound_set` (the snapshot target only; a jar without it extracts nothing for
 * it). Tags of paintings, banner patterns and instruments are already among the live views'
 * folders.
 *
 * Not a version fact, for the reason {@link LIVE_VIEW_DATA_FOLDERS} gives; the files stay in the
 * user's cache and are never committed, bundled, exported, written into a project or sent to
 * the AI helper.
 */
export const LOOKS_DATA_FOLDERS: readonly string[] = Object.freeze([
  'banner_pattern',
  'block_sound_set',
  'cat_sound_variant',
  'cat_variant',
  'chicken_sound_variant',
  'chicken_variant',
  'cow_sound_variant',
  'cow_variant',
  'decorated_pot_pattern',
  'frog_variant',
  'instrument',
  'jukebox_song',
  'painting_variant',
  'pig_sound_variant',
  'pig_variant',
  'sulfur_cube_archetype',
  'timeline',
  'trim_material',
  'trim_pattern',
  'wolf_sound_variant',
  'wolf_variant',
  'world_clock',
  'zombie_nautilus_variant',
]);

/**
 * The cached vanilla files of some `data/minecraft/` folders of one version, in one answer (the
 * live views' bulk read by folder, ADR 0120 D11). The files come from the user's own client jar,
 * stay in the local cache and are never exported, written into a project or sent to the AI
 * helper.
 */
export interface VanillaDataFiles {
  /** The installed version the cache came from. */
  version: string;
  /** Folder key (as asked) to id (`minecraft:<path below the folder>`) to JSON. */
  folders: WorldgenFileMapView;
  fileCount: number;
}

/**
 * The answer of `minecraft:structureTemplates` (ADR 0122, Live views 4; B636): some vanilla
 * structure templates of one version by id, as the bytes the user's own jar stores them (gzipped
 * NBT), read from the local cache (schema 7). They stay in the cache and the renderer's memory:
 * never exported, written into a project or sent to the AI helper.
 */
export interface VanillaStructureTemplates {
  /** The installed version the cache came from. */
  version: string;
  /** Id (`minecraft:<path>`) to the file's bytes. */
  templates: Record<string, Uint8Array>;
  /** Ids the jar has no template for. */
  missing: string[];
  /** Ids whose cached file was refused: too large, not NBT, or outside the cache folder. */
  refused: string[];
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
  /**
   * `true` when an older cache of this version exists (an older schema, or a folder list the
   * target no longer has) and the jar it came from is still there: the app then extracts again
   * by itself, without the set-up banner (ADR 0119 D4). Read a missing field as `false`.
   */
  cacheOutdated?: boolean;
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
  /** Display name: `Data.LevelName` from `level.dat`, or the folder name when unreadable. */
  name: string;
  /** ISO 8601 modification time of `level.dat`. */
  lastModified: string;
}

/**
 * A world Try it can copy an area from (ADR 0087): a save in the `saves/` folder of a game
 * folder the app knows.
 */
export interface TryItWorldInfo {
  /** Opaque id for {@link TryItWorldsPlatform.readArea}: `<game folder id>/<world folder>`. */
  id: string;
  /** `Data.LevelName`, or the folder name. */
  name: string;
  /** The world's folder name under `saves/`. */
  folder: string;
  /** The game folder or launcher instance it is in; `selected` for the install target. */
  gameFolder: { id: string; name: string; selected: boolean };
  /** ISO 8601: `Data.LastPlayed`, else the modification time of `level.dat`. */
  lastPlayed: string | null;
  /** `Data.Version.Name`: the game version that last saved the world. */
  versionName: string | null;
  dataVersion: number | null;
  /** `false` when the world was saved before the 1.18 chunk layout (or `level.dat` is unreadable). */
  readable: boolean;
  /** The world's `icon.png` (at most 256 KiB), or `null`. */
  icon: Uint8Array | null;
  /**
   * The world's seed as a decimal string, from `data/minecraft/world_gen_settings.dat` (B574
   * WS17), or `null` when that file is missing, of an older layout or unreadable.
   */
  seed: string | null;
}

/** Where a Try it area is centred: the world spawn, or a typed block X and Z. */
export type TryItAreaCentre = 'spawn' | { x: number; z: number };

/** What {@link TryItWorldsPlatform.readArea} takes. */
export interface TryItAreaRequest {
  worldId: string;
  centre: TryItAreaCentre;
}

/**
 * Mirrors `WorldArea` in `@msm/interop` (ADR 0087 D5): a 48 x 32 x 48 area of a save's
 * Overworld. `palette[0]` is `minecraft:air`; `blocks` is indexed
 * `(y * size.z + z) * size.x + x`.
 */
export interface TryItWorldArea {
  format: 1;
  world: string;
  dataVersion: number;
  origin: { x: number; y: number; z: number };
  size: { x: 48; y: 32; z: 48 };
  palette: string[];
  blocks: Uint16Array;
  skipped: { blockEntities: number; entities: number; missingChunks: number };
  warnings: string[];
}

/** Try it's worlds (ADR 0087), read-only and served by main. */
export interface TryItWorldsPlatform {
  /** Worlds in every known game folder's `saves/`, most recently played first. */
  listWorlds(): Promise<TryItWorldInfo[]>;
  /**
   * Reads the area of a listed world. Rejects with a message containing
   * `tryit.<code>: <sentence>`; codes `unknown-world`, `no-level-dat`, `unreadable-level-dat`,
   * `old-format`, `read-failed`, `too-many-states`.
   */
  readArea(request: TryItAreaRequest): Promise<TryItWorldArea>;
}

/** Ids the project declares per Spyglass symbol category, for the mcfunction checker. */
export type McfunctionProjectIds = Record<string, string[]>;

/** How Test in Minecraft can use the selected game location (ADR 0026 D5). */
export type TestInMinecraftMode = 'launch' | 'install-only' | 'blocked';

/** The launchers Test in Minecraft can start. */
export type LaunchableLauncher = 'prism' | 'multimc';

/** What Test in Minecraft would do for a target, read before running it. */
export interface TestInMinecraftStatus {
  /** The target's Minecraft version and Fabric versions. */
  mcVersion: string;
  loader: string;
  api: string;
  /** The selected game location, or `null` when there is none. */
  location: GameLocationView | null;
  /** `launch`: install and start the launcher; `install-only`; `blocked`. */
  mode: TestInMinecraftMode;
  /** Why it is blocked, or for `install-only` how to start the game; else `null`. */
  reason: string | null;
  /** For `launch`: the launcher program found, or `null` (then the jar is installed only). */
  launcherProgram: string | null;
  /** The managed instance's name, `MCSuperMods Test (<mc version>)`. */
  managedInstanceName: string;
  /** Whether the selected location is the managed instance. */
  managedInstanceSelected: boolean;
  /** Whether a Prism Launcher data folder exists to create the managed instance in. */
  canCreateInstance: boolean;
}

/** What a Test in Minecraft run did. */
export interface TestInMinecraftResult {
  /** The content jar's path in `mods/`. */
  jarPath: string;
  /** `true` when an earlier copy MSM installed was replaced. */
  replaced: boolean;
  /**
   * Jars MSM installed earlier for other projects or modpacks, removed so only this project
   * runs (sorted file names). Files MSM did not install are never touched.
   */
  removed: string[];
  /** Fabric API: downloaded and installed, MSM's copy already there, or the user's own copy. */
  fabricApi: 'installed' | 'present' | 'user-copy';
  /** Fabric API's file name in `mods/`. */
  fabricApiFile: string;
  /** Whether the launcher was started. */
  launched: boolean;
  /** How to start the game when it was not launched; otherwise `null`. */
  note: string | null;
}

/** What a modpack test run did (ADR 0046 D5). */
export interface ModpackTestResult {
  /** The `mods/` folder written to. */
  modsDir: string;
  /** File names installed or kept: the member jars and the extra mods, sorted. */
  installed: string[];
  /** Jars MSM installed earlier that are not in this modpack and were removed, sorted. */
  removed: string[];
  fabricApi: 'installed' | 'present' | 'user-copy';
  fabricApiFile: string;
  launched: boolean;
  note: string | null;
}

// ---- One-click Play and Reload (ADR 0084). ----

/**
 * One lowered file Play and Reload compare (ADR 0084 D6): an `OutputFile` of the expanded
 * project with the element it came from. Play and Reload must send the same set, lowered the
 * same way, so equal files hash equal; scripts are sent as lowered (`.ts`), main transpiles
 * them for the overlay.
 */
export interface PlayOutputFile {
  /** The jar path: `assets/...`, `data/...` or `msm/...`. */
  path: string;
  /** Bytes, or a JSON value (hashed and written as sorted, 2-space JSON). */
  contents: Uint8Array | Json;
  /** The element id the file came from, to name it in restart reasons. */
  elementId?: string;
}

/** One item for the test world's chests and hotbar. */
export interface PlaySetupItem {
  /** `namespace:path` of an item, a block item or a spawn egg. */
  id: string;
  /** The stack size, 1 when absent. */
  count?: number;
}

/**
 * Play my game (ADR 0116 D1): how a new `msm-game-<ns>` world is made, from the project's world
 * setup. The runtime adds structures on, a random seed and commands on; no test area, chests or
 * game rule changes.
 */
export interface PlayGameSettings {
  /** The world preset id: the world setup's own id `<ns>:<path>`, its chosen preset, or `minecraft:normal`. */
  preset: string;
  gameMode: 'survival' | 'creative' | 'adventure' | 'spectator';
  difficulty: 'peaceful' | 'easy' | 'normal' | 'hard';
}

/** Which world a Play, Restart or Start over is for: the test world or the game (ADR 0116 D1). */
export type PlayWorldKind = 'test' | 'game';

/** What Play (and Restart) needs from the renderer. */
export interface PlayInput {
  targetId: string;
  modId: string;
  /** The content jar, built as the export dialog's defaults. */
  jar: Uint8Array;
  /** The lowered project's files (see {@link PlayOutputFile}). */
  outputs: PlayOutputFile[];
  /** The project's namespaces, its own first (it names the test world `msm-test-<ns>`). */
  namespaces: string[];
  /** Project items, block items and spawn eggs in the order to show them; the first nine go in the hotbar. */
  items: PlaySetupItem[];
  /**
   * Play my game: open or make `msm-game-<ns>` with these settings instead of the test world
   * (`items` are then not used). Absent: the test world.
   */
  game?: PlayGameSettings;
}

/** What Reload needs from the renderer. */
export interface ReloadInput {
  targetId: string;
  modId: string;
  /** The lowered project's files, the same set and lowering as at Play. */
  outputs: PlayOutputFile[];
  /**
   * The content jar as Play would build it now, so a change to `fabric.mod.json` or the
   * runtime is found. Without it those are assumed unchanged (the mod id is still compared).
   */
  jar?: Uint8Array;
  /** Display names by element id, for restart reasons ("You added a new block: Ruby Lamp."). */
  names?: Record<string, string>;
}

/** Why a Play, Restart, Reload or New test world did not happen. */
export type PlayFailureCode =
  /** No Prism Launcher data folder: show the one-time setup panel. */
  | 'no-prism'
  /** A folder named like the managed instance exists without MSM's marker. */
  | 'instance-not-managed'
  /** The running game did not close within 30 seconds of the quit request. */
  | 'game-not-closing'
  /** The installed jar is locked by a game MSM cannot talk to. */
  | 'jar-locked'
  /** Reload: nothing was installed with Play yet. */
  | 'not-played'
  /** Reload: the game is not in the test world. */
  | 'not-in-world'
  /** New test world: the game is running. */
  | 'game-running'
  /** Reload: a script could not be transpiled. */
  | 'script-error'
  /** Another Play or Reload is running. */
  | 'busy'
  /** The input is not usable (no namespace, a bad item id). */
  | 'bad-input'
  /** Anything else; `message` says what. */
  | 'failed';

/** A failed Play, Reload or New test world, in plain words. */
export interface PlayFailure {
  ok: false;
  code: PlayFailureCode;
  message: string;
}

/** What a Play or Restart did. */
export type PlayResult =
  | {
      ok: true;
      /** The managed instance's name, `MCSuperMods Test (<mc>)`. */
      instanceName: string;
      /** `true` when the instance was created by this Play. */
      instanceCreated: boolean;
      /** The instance's game folder (for "Open the test instance's folder"). */
      gameDir: string;
      /** The world's folder name, `msm-test-<namespace>` or, for Play my game, `msm-game-<namespace>`. */
      world: string;
      /** `true` when the running game was asked to quit first. */
      restarted: boolean;
      /** Whether Prism Launcher was started. */
      launched: boolean;
      /** How to start the game when it was not launched; otherwise `null`. */
      note: string | null;
      fabricApi: 'installed' | 'present' | 'user-copy';
      /** Items left out of the chests because they are full. */
      itemsLeftOut: number;
      /** The play request's sequence number. */
      seq: number;
    }
  | PlayFailure;

/** Why a restart is needed, in plain words (ADR 0084 D6). */
export interface PlayRestartReason {
  /** The `@msm/interop` reason code (`new-definition`, `file-removed`, ...). */
  reason: string;
  /** The jar path concerned. */
  path: string;
  /** For a rename: the old path. */
  from?: string;
  /** The definition kind (`block`, `item`, `entity`, ...). */
  kind?: string;
  elementId?: string;
  /** One or two sentences for the user. */
  text: string;
}

/** What a Reload did. */
export type ReloadResult =
  | {
      ok: true;
      /** `reload` in place, `reopen` the world (world data changed), or `none` (nothing pending). */
      action: 'reload' | 'reopen' | 'none';
      /** The request's sequence number, or `null` when none was written. */
      seq: number | null;
      /** Files written or removed since what the game shows (the chat's "N changes"). */
      changes: number;
      /** Whether resource pack files changed (the game reloads its resources too). */
      assets: boolean;
      /** Files by group, compared with the installed jar. */
      counts: {
        data: number;
        scripts: number;
        events: number;
        assets: number;
        worldData: number;
        removed: number;
      };
      /** What needs a restart; empty when nothing does. */
      restart: PlayRestartReason[];
      /** A plain summary line. */
      message: string;
    }
  | PlayFailure;

/** What New test world did. */
export type TestWorldResult =
  | {
      ok: true;
      /** The old world's new folder name, or `null` when there was no test world yet. */
      renamedTo: string | null;
    }
  | PlayFailure;

/**
 * Where the game is, for the status chip (ADR 0084 D7): no Prism Launcher, not running,
 * starting (Prism started, title screen or loading), in the test world, in the game world of
 * Play my game (ADR 0116 D1), or in another world.
 */
export type PlayGameState =
  | 'no-prism'
  | 'not-running'
  | 'starting'
  | 'test-world'
  | 'game-world'
  | 'other-world';

/** The Play status, read by main from the managed instance's `status.json`. */
export interface PlayStatus {
  targetId: string;
  mcVersion: string;
  /** `MCSuperMods Test (<mc>)`. */
  instanceName: string;
  /** `ready`, `missing` (created on the first Play) or `no-prism`. */
  instance: 'ready' | 'missing' | 'no-prism';
  /** The managed instance's game folder, when it exists. */
  gameDir: string | null;
  state: PlayGameState;
  /** The test world's folder name from `dev.json`, or `null` before the first Play. */
  testWorld: string | null;
  /** The world open in the game, or `null`. */
  world: string | null;
  /**
   * The open world's seed as the runtime reports it (a decimal string; Play my game's is
   * random), or `null` outside a world or from an older runtime.
   */
  seed: string | null;
  /** The outcome of the last request the game handled, or `null`. */
  handled: { seq: number; ok: boolean; message?: string } | null;
  /** Whether Reload can run now (the game is in the test world or the game world). */
  canReload: boolean;
  /** The last Reload's restart reasons, until the next Play. */
  restartNeeded: PlayRestartReason[];
  /** The chip's words: "Game not running", "Starting…", "In the test world", "Restart needed", ... */
  label: string;
  /** What runs now, or `null`. */
  busy: 'play' | 'reload' | 'restart' | null;
  /** The one progress line while busy ("Installing the mod…"), else `null`. */
  progress: string | null;
}

/** One-click Play and Reload (ADR 0084), served by main. */
export interface PlayPlatform {
  /** The managed instance and the game for `targetId`; also makes it the polled target. */
  status(targetId: string): Promise<PlayStatus>;
  /**
   * Saves nothing (the renderer saves first): creates the managed instance when missing,
   * installs the jar and Fabric API, writes the dev files and starts Prism Launcher. When the
   * game runs it is asked to quit first (up to 30 seconds).
   */
  play(input: PlayInput): Promise<PlayResult>;
  /** Writes what reloads in place with a reload or reopen request; lists restart reasons. */
  reload(input: ReloadInput): Promise<ReloadResult>;
  /** Quits the running game, installs and starts it again (the same as {@link play}). */
  restart(input: PlayInput): Promise<PlayResult>;
  /**
   * Renames `saves/msm-test-<namespace>` (or, with `kind` `game`, Play my game's
   * `msm-game-<namespace>`: "Start over") to `...-old-<n>`; the next Play creates a fresh world.
   */
  newWorld(targetId: string, namespace: string, kind?: PlayWorldKind): Promise<TestWorldResult>;
  /** Subscribes to status changes (every second while a window is focused, and after each operation). */
  onStatus(listener: (status: PlayStatus) => void): () => void;
}

// ---- Instances for anything (ADR 0133). ----

/** A server to join on launch (`--server <host>:<port>`, B760 N3). */
export interface InstanceServerAddress {
  host: string;
  port: number;
}

/**
 * What the user asked for, as the renderer names it (ADR 0133 D1). Main makes the run recipe
 * from it with `recipeFor` in `@msm/interop`; worlds to copy are named by the later briefs'
 * own requests, never by a path from the renderer.
 */
export type InstanceAction =
  /** Play and Test in Minecraft: the test world in the test instance. */
  | { kind: 'test'; join?: InstanceServerAddress }
  /** Play my game: the game world in the test instance. */
  | { kind: 'game'; join?: InstanceServerAddress }
  /** A game that plays without mods, in the Plain instance (its world: {@link InstancePlainRequest}). */
  | { kind: 'plain' }
  /** Test a modpack in its own instance (its Modrinth mods: B767). */
  | { kind: 'modpack'; name: string; modIds: string[] }
  /** Open an exported map (its world: {@link InstanceOpenMapRequest}, B767). */
  | { kind: 'map'; name: string }
  /** A local server for the project (`localServer`). */
  | { kind: 'server' };

/** The project's facts a recipe needs. */
export interface InstanceProjectFacts {
  /** The project's first namespace. */
  namespace: string;
  /** The content jar's mod id, or `null` when the project has no jar. */
  modId: string | null;
  /** Whether the project plays without mods (a data-pack-only game or map). */
  playsWithoutMods: boolean;
}

/** What `instances.plan` (and `launch`) take. */
export interface InstancePlanRequest {
  targetId: string;
  action: InstanceAction;
  project: InstanceProjectFacts;
}

/** A content jar the renderer built, by its mod id. */
export interface InstanceJar {
  modId: string;
  data: Uint8Array;
}

/** What `instances.ensure` takes: the plan's request plus the content jars it names. */
export interface InstanceEnsureRequest extends InstancePlanRequest {
  jars: InstanceJar[];
  /** "Do this by itself next time" was ticked on the card (ADR 0133 D3). */
  remember?: boolean;
}

/** A run recipe as the renderer sees it: no paths (ADR 0133 D1). */
export interface InstanceRecipeView {
  purpose: 'test' | 'game' | 'plain' | 'modpack' | 'map' | 'server';
  /** The project's namespace, or the modpack's or map's name. */
  owner: string;
  mcVersion: string;
  channel: 'release' | 'snapshot';
  /** The Java feature release the game needs. */
  java: number;
  loader: { kind: 'none' | 'fabric' | 'quilt' | 'neoforge' | 'forge'; version: string | null };
  /** Where it runs: the instance's or the server's name (before the taken-name rule). */
  place: { kind: 'instance' | 'server'; name: string };
  /** The mod files it holds, by role. */
  mods: { role: 'content' | 'fabric-api' | 'extra'; fileName: string }[];
  /** The resource pack files it holds. */
  resourcePacks: string[];
  /** The world it opens: `copied` when MSM copies it, otherwise the game makes it. */
  world: { folder: string; copied: boolean } | null;
  join: InstanceServerAddress | null;
}

/** Why an instance or local server step did not happen. */
export type InstanceFailureCode =
  /** The step belongs to a later brief of ADR 0133's plan. */
  | 'not-yet'
  /** No Prism Launcher data folder was found. */
  | 'no-launcher'
  /** The project needs its mod for this (a game played without mods). */
  | 'needs-mod'
  /** The target has no Fabric versions. */
  | 'no-fabric'
  /** The request is not usable. */
  | 'bad-input'
  /** Another step on the same launcher folder or server is running. */
  | 'busy'
  /** The instance or server is not there (make it first), or the id is not one of MSM's. */
  | 'not-found'
  /** A folder of that name is not MSM's, or a file in the way is not MSM's. */
  | 'not-managed'
  /** Every name up to `-99` is taken. */
  | 'no-free-name'
  /** The local server is running (stop it first). */
  | 'running'
  /** The local server is not running. */
  | 'not-running'
  /** The Minecraft EULA is not accepted for this server yet. */
  | 'eula-needed'
  /** No Java program, or none new enough. */
  | 'no-java'
  /** The server's port and the next ones are taken. */
  | 'port-taken'
  /** A download failed or was not what was expected. */
  | 'download-failed'
  /** The Fabric server launcher in the folder or cache changed since its first download. */
  | 'launcher-changed'
  /** Anything else; `message` says what. */
  | 'failed';

/** A failed instance or local server step, in plain words (never thrown, as Play's). */
export interface InstanceFailure {
  ok: false;
  code: InstanceFailureCode;
  message: string;
}

/** Where an action would run, and whether the offer card shows (ADR 0133 D3). */
export interface InstancePlan {
  ok: true;
  recipe: InstanceRecipeView;
  kind: ManagedKind;
  /** The card's heading and sentences (`describeRecipe`). */
  title: string;
  sentences: string[];
  /** The launcher the instance is made in, or `null` for a server or when none is found. */
  launcher: 'prism' | null;
  /** MSM's existing instance or server for this recipe, or `null` when it must be made. */
  existing: { id: string; name: string } | null;
  /** Whether the card shows before anything is made (the ask setting and the kinds made by themselves). */
  ask: boolean;
}

/** What `instances.plan` answers. */
export type InstancePlanResult = InstancePlan | InstanceFailure;

/** What `instances.ensure` did. */
export type InstanceEnsureResult =
  | {
      ok: true;
      /** The id `list`, `remove` and `showInFolder` know it by. */
      id: string;
      /** The instance's folder name (the launcher's instance id, the name shown). */
      name: string;
      created: boolean;
      updated: boolean;
      /** The instance's game folder (paths only under More options). */
      gameDir: string;
      /** Mod files MSM wrote or kept. */
      mods: string[];
    }
  | InstanceFailure;

/** One instance or server MSM made, for Settings' "Instances MSM made" (B764). */
export interface ManagedThing {
  /** `instance:<folder path>` or `server:<folder path>`. */
  id: string;
  kind: ManagedKind;
  /** The folder name: the launcher's instance id or the server's folder. */
  name: string;
  /** The project's namespace, or the modpack's or map's name, or `null` (test, Plain). */
  owner: string | null;
  mcVersion: string;
  loader: { kind: 'none' | 'fabric' | 'quilt' | 'neoforge' | 'forge'; version: string | null };
  /** The launcher it is in, or `null` for a server. */
  launcher: 'prism' | 'multimc' | 'polymc' | null;
  /** The folder (shown only under More options). */
  path: string;
  /** A server: whether the user accepted the Minecraft EULA for it. */
  eulaAccepted: boolean | null;
  /** A server: whether it runs now. */
  running: boolean;
}

/** What `instances.remove` and `instances.showInFolder` answer. */
export type InstanceDoneResult = { ok: true } | InstanceFailure;

/** What `instances.launch` (and Play without mods, Open a map) did. */
export type InstanceLaunchResult =
  | {
      ok: true;
      /** The instance's folder name. */
      name: string;
      /** Whether the launcher was started. */
      launched: boolean;
      /** How to start the game when the launcher was not started; otherwise `null`. */
      note: string | null;
    }
  | InstanceFailure;

/**
 * Play without mods (B766): the Plain instance on a copy of the project's game world, made by the
 * map export's plan (the project's packs in, the dev pack out).
 */
export interface InstancePlainRequest {
  targetId: string;
  project: InstanceProjectFacts;
  /** The test instance's world to copy (default `msm-game-<namespace>`). */
  world?: string;
  /** The project's data pack, written to the copy's `datapacks/<fileName>` (B766). */
  dataPack?: { fileName: string; data: Uint8Array } | undefined;
  /** The project's resource pack, written as the copy's `resources.zip` (B766). */
  resourcePack?: Uint8Array | undefined;
}

/** Open in my launcher after Export as a map (B767): the map's world from a listed source. */
export interface InstanceOpenMapRequest {
  targetId: string;
  project: InstanceProjectFacts;
  /** The map's name (its instance's owner). */
  mapName: string;
  /** A `maps.listWorlds` source id and one of its world folders. */
  sourceId: string;
  worldDir: string;
  /** The content jars, when the map needs its mod. */
  jars: InstanceJar[];
  /** "Keep my player data", as the map was exported (B766; default off). */
  keepPlayerData?: boolean | undefined;
  /** A map without mods: the project's data pack, as in the exported map (B766). */
  dataPack?: { fileName: string; data: Uint8Array } | undefined;
  /** A map without mods: the project's resource pack, as `resources.zip` (B766). */
  resourcePack?: Uint8Array | undefined;
}

/** A CurseForge profile file (B768): the content jars and Fabric API for its app's import. */
export interface InstanceCurseForgeRequest {
  targetId: string;
  project: InstanceProjectFacts;
  jars: InstanceJar[];
}

/** What a file-writing step answers: the saved path, or `null` when the save was cancelled. */
export type InstanceFileResult = { ok: true; path: string | null } | InstanceFailure;

/** Instances for anything (ADR 0133), served by main. */
export interface InstancesPlatform {
  /** The recipe for an action, its card sentences, what exists and whether to ask. Never writes. */
  plan(request: InstancePlanRequest): Promise<InstancePlanResult>;
  /**
   * Makes or brings up to date the managed instance of an action (Prism Launcher), one at a
   * time per launcher folder. Writes only inside folders with MSM's marker (D5).
   */
  ensure(request: InstanceEnsureRequest): Promise<InstanceEnsureResult>;
  /** Every instance and server MSM made, in the known launcher folders and the servers folder. */
  list(): Promise<ManagedThing[]>;
  /** Moves one of {@link list}'s folders to the recycle bin (after the renderer's question). */
  remove(id: string): Promise<InstanceDoneResult>;
  /** Shows one of {@link list}'s folders in the file manager. */
  showInFolder(id: string): Promise<InstanceDoneResult>;
  /** Starts the launcher on the action's instance, joining its server or opening its copied world. */
  launch(request: InstancePlanRequest): Promise<InstanceLaunchResult>;
  /**
   * Play without mods (B766): copies the game world into the Plain instance (made or brought up to
   * date) and starts Prism on it. `needs-mod` for a project that needs its mod; `not-found` (in
   * words: press Play my game once first) when the game has no world yet.
   */
  playPlain(request: InstancePlainRequest): Promise<InstanceLaunchResult>;
  /**
   * Open this map: a map without mods opens in the Plain instance on a copy of its world (B766);
   * a map that needs its mod gets its own instance (B767; answers `not-yet` until then).
   */
  openMap(request: InstanceOpenMapRequest): Promise<InstanceLaunchResult>;
  /** A CurseForge profile file (B768); answers `not-yet` until then. */
  curseForgeProfile(request: InstanceCurseForgeRequest): Promise<InstanceFileResult>;
}

/** The local server's state, read from its log (ADR 0133 D7), never from its exit status. */
export type LocalServerState =
  | 'stopped'
  | 'preparing'
  | 'starting'
  | 'downloading'
  | 'running'
  | 'stopping'
  | 'eula-needed'
  | 'port-taken'
  | 'crashed';

/** What `localServer.prepare`, `start` and `restart` take. */
export interface LocalServerRequest {
  targetId: string;
  project: InstanceProjectFacts;
  /** The content jars (none for a game that plays without mods). */
  jars: InstanceJar[];
}

/** The user's acceptance of the Minecraft EULA, from their own tick (ADR 0133 D8). */
export interface LocalServerEulaAcceptance {
  accepted: true;
  /** ISO 8601 time of the tick. */
  at: string;
}

/** The local server MSM looks after, for the server panel (B769). */
export interface LocalServerStatus {
  state: LocalServerState;
  /** The state in plain words ("Running", "Starting…", "Stopped"). */
  label: string;
  /** The server last prepared or started in this run, or `null`. */
  server: {
    folder: string;
    /** The name shown. */
    name: string;
    targetId: string;
    mcVersion: string;
    owner: string;
    port: number;
    eulaAccepted: boolean;
    /** The folder (shown only under More options). */
    path: string;
  } | null;
  /** The Java found for it, or why none. */
  java: { ok: true; version: string | null; path: string } | { ok: false; message: string } | null;
  /** The one progress line while busy ("Downloading the Fabric server launcher…"), else `null`. */
  progress: string | null;
  /** What happened last, in plain words, or `null`. */
  message: string | null;
  /** Addresses people on the same network join at (`<ip>:<port>`), while it runs. */
  addresses: string[];
  /** How many log lines were seen so far (the next line's number). */
  logSeq: number;
}

/** What the local server steps answer. */
export type LocalServerResult = { ok: true; status: LocalServerStatus } | InstanceFailure;

/** Log lines kept in memory: `lines[0]` is line number `from`; `next` is the next number. */
export interface LocalServerLog {
  from: number;
  next: number;
  lines: string[];
}

/** The local server (ADR 0133 D7, D8), served by main. One runs at a time. */
export interface LocalServerPlatform {
  status(): Promise<LocalServerStatus>;
  /**
   * Makes or updates the server folder (downloads the Fabric server launcher once, with
   * progress in the status) and looks for Java. Only while no server runs.
   */
  prepare(request: LocalServerRequest): Promise<LocalServerResult>;
  /** Records the user's tick on the EULA for one server folder. Only while it is stopped. */
  acceptEula(folder: string, acceptance: LocalServerEulaAcceptance): Promise<LocalServerResult>;
  /** Prepares, checks the port and starts the server. A second start while one runs is refused. */
  start(request: LocalServerRequest): Promise<LocalServerResult>;
  /** Writes `stop` to the server and ends it after a time-out. */
  stop(): Promise<LocalServerResult>;
  /** Stops the running server, prepares it again with the new jars and starts it. */
  restart(request: LocalServerRequest): Promise<LocalServerResult>;
  /** The kept log lines from line number `since`. */
  log(since: number): Promise<LocalServerLog>;
  /** Subscribes to status changes; returns an unsubscribe function. */
  onStatus(listener: (status: LocalServerStatus) => void): () => void;
}

/** One remembered modpack (ADR 0046 D2). */
export interface ModpackListEntry {
  /** The modpack folder (absolute). */
  root: string;
  /** Its name, or `null` when the file is missing or unreadable. */
  name: string | null;
  /** Whether the folder still holds a readable `msm.modpack.json`. */
  found: boolean;
}

/** One member project as main sees it on disk. */
export interface ModpackMemberView {
  /** The path as written in the modpack. */
  path: string;
  /** The resolved project folder (absolute). */
  root: string;
  /** Whether it holds `msm.project.json`. */
  found: boolean;
  /** The project's name and target id from `msm.project.json`, when readable. */
  name: string | null;
  targetId: string | null;
}

/** A modpack read from disk, with its members resolved. */
export interface ModpackView {
  root: string;
  modpack: Modpack;
  members: ModpackMemberView[];
}

/** A pinned Modrinth file plus what its version requires, for "Add mod from Modrinth…". */
export interface ModrinthModLookup {
  file: ModpackMod;
  versionNumber: string;
  /** Project ids the version requires, for the user to add. */
  requiredProjects: string[];
}

/**
 * A pinned mod that has a Fabric build for the version asked (ADR 0136 D9): the SHA-1 of the
 * pinned file it answers for and the newest build's file (a modpack `mods` entry without its
 * title, which the pinned entry keeps).
 */
export interface ModrinthModUpdate {
  from: string;
  file: Omit<ModpackMod, 'title'>;
  versionNumber: string;
}

/** One file of a member project's read-only snapshot (project-relative POSIX path). */
export interface ProjectSnapshotFile {
  path: string;
  data: Uint8Array;
}

/**
 * One TypeScript diagnostic of a script (ADR 0031 D5): `line` is 0-based, `start` and `end`
 * are UTF-16 columns within that line (a diagnostic spanning lines ends at the line's end),
 * and `offset` is the range in UTF-16 offsets of the whole source.
 */
export interface ScriptDiagnostic {
  /** Syntax diagnostics are errors; semantic diagnostics are warnings. */
  severity: 'error' | 'warning';
  /** `typescript.syntax` or `typescript.semantic`. */
  code: 'typescript.syntax' | 'typescript.semantic';
  /** TypeScript's own diagnostic number (`2339` for TS2339). */
  tsCode: number;
  message: string;
  line: number;
  start: number;
  end: number;
  offset: { start: number; end: number };
}

/** What {@link PlatformAdapter.scripting}`.transpile` returns. */
export type ScriptTranspileOutcome = { js: string } | { problems: ScriptDiagnostic[] };

/** The Gradle wrapper files a Java project export copies (ADR 0033 D2). */
export interface GradleWrapperFiles {
  /** `gradle/wrapper/gradle-wrapper.jar`. */
  jar: Uint8Array;
  /** The `gradlew` shell script. */
  gradlew: string;
  /** The `gradlew.bat` script. */
  gradlewBat: string;
}

/** One file of an export tree: a `/`-separated relative path and its bytes. */
export interface ExportTreeFile {
  path: string;
  data: Uint8Array;
}

/**
 * The outcome of {@link PlatformAdapter.exports}`.writeTree`: the tree's root folder and the
 * number of files written, or `folder-not-empty` when the root already holds files (nothing
 * is written then).
 */
export type WriteTreeResult =
  | { ok: true; root: string; count: number }
  | { ok: false; reason: 'folder-not-empty'; root: string };

/**
 * A third-party plugin's manifest, `msm-plugin.json` (ADR 0035 D2), as main validated it.
 * `main` and `schemas` are relative paths inside the plugin folder.
 */
export interface PluginManifest {
  manifestVersion: 1;
  /** `/^[a-z][a-z0-9.-]*$/`; its first `.`-separated segment is the plugin's namespace. */
  id: string;
  name: string;
  /** The plugin's own version (semver). */
  version: string;
  /** The plugin API range the plugin needs, such as `^1.0.0`. */
  apiVersion: string;
  /** The single-file bundle. */
  main: string;
  /** mcdoc symbol exports (mcdoc-cli format); empty when the plugin has none. */
  schemas: string[];
  /** The contribution points the bundle uses. */
  capabilities: PluginCapability[];
  description?: string | undefined;
  author?: string | undefined;
  licence?: string | undefined;
  homepage?: string | undefined;
}

/** One folder under `<msmHome>/plugins/`, with its manifest when it is valid. */
export interface ExternalPluginEntry {
  /** The manifest's `id`, or the folder name when the manifest is unusable. */
  id: string;
  /** The folder name (one path segment). */
  folder: string;
  /** The validated manifest, or `null` (then `problems` says why). */
  manifest: PluginManifest | null;
  /** `plugin.manifest-invalid` problems; empty for a usable manifest. */
  problems: Problem[];
}

/** What the renderer needs to start a plugin: its manifest, bundle text and schema exports. */
export interface ExternalPluginBundle {
  manifest: PluginManifest;
  /** The `main` bundle as UTF-8 text. */
  main: string;
  /** Each `schemas` file's text, in manifest order. */
  schemas: string[];
}

/**
 * Whether an Anthropic API key is stored (ADR 0041 D1). The renderer sees only the last four
 * characters of the key, never the key.
 */
export interface AiKeyStatus {
  set: boolean;
  /** The key's last four characters, or `null` when no key is stored. */
  tail: string | null;
  /** Whether `safeStorage` can encrypt on this system; saving a key needs it. */
  encryptionAvailable: boolean;
}

/** The AI helper's main-process services (ADR 0041 D1, D3). */
export interface AiPlatform {
  /** Whether a key is stored, its tail and whether encryption is available. */
  keyStatus(): Promise<AiKeyStatus>;
  /**
   * Encrypts and stores the key (at most 512 characters). Rejects with "Encrypted storage is
   * not available on this system, so the key cannot be saved." when `safeStorage` cannot encrypt.
   */
  setKey(key: string): Promise<void>;
  /** Deletes the stored key. */
  clearKey(): Promise<void>;
  /** Makes one tiny request with the stored key; failures carry the SDK error class. */
  testKey(): Promise<AiKeyTestResult>;
  /**
   * Starts a run. Resolves once the run has started; its events arrive through
   * {@link onEvent}, ending with `done` (`no_key` when no key is stored). Rejects when the
   * conversation already has a run or the run id is in use.
   */
  start(request: AiStartRequest): Promise<void>;
  /** Cancels a run; it ends with `done { reason: 'cancelled' }`. Unknown ids are ignored. */
  cancel(runId: string): Promise<void>;
  /** Answers a `tool_request` event of run `runId`. Unknown run or request ids are ignored. */
  toolResult(runId: string, result: AiToolResult): Promise<void>;
  /** Starts the conversation afresh with the current settings model (cancels its run). */
  newConversation(conversationId: string): Promise<void>;
  /** Forgets the conversation (cancels its run). */
  dropConversation(conversationId: string): Promise<void>;
  /** Subscribes to run events; returns an unsubscribe function. */
  onEvent(listener: (runId: string, event: AiEvent) => void): () => void;
}

/** What the app shows by itself when it starts ({@link PlatformAdapter.app}). */
export type LaunchNotice = 'welcome' | 'whats-new' | null;

/** Host services for the renderer. */
export interface PlatformAdapter {
  app: {
    info(): Promise<{ version: string; electron: string; platform: string }>;
    /**
     * What to show by itself on this launch: `'welcome'` on a brand-new install (no settings
     * yet), `'whats-new'` once after the app version changed since the last launch, else
     * `null` (also in test runs). Records the running version.
     */
    launchNotice(): Promise<LaunchNotice>;
  };
  dialogs: {
    /**
     * Shows a folder picker. With `purpose: 'project'` (creating or opening a project) it
     * opens in the parent folder of the last project folder chosen, and remembers the new
     * choice's parent (`lastProjectParent` in settings).
     */
    pickDirectory(opts: {
      title: string;
      mustBeEmpty?: boolean;
      purpose?: 'project';
    }): Promise<string | null>;
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
     * directory, the install target, the last save location or the last export folder (also a
     * written Java project) are allowed.
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
    /**
     * Every cached vanilla worldgen file of `mcVersion` in one answer (ADR 0119 D4), or `null`
     * when the cache is not set up or the version's target has no `worldgen.terrainPreview`.
     */
    readWorldgenFiles(mcVersion: string): Promise<VanillaWorldgenFiles | null>;
    /**
     * The cached vanilla files of `folders` (each one the cache holds: the live views' and the
     * world generation folders) in one answer (ADR 0120 D11), or `null` when the cache is not
     * set up for the version. Throws for a folder the cache does not keep.
     */
    readDataFiles(mcVersion: string, folders: readonly string[]): Promise<VanillaDataFiles | null>;
    /**
     * The English names of `targetId`'s vanilla things from the cached `en_us.json` (ADR 0124
     * D3, B656), or `null` when the cache is not set up for the target's version. The preload
     * always provides it; optional so that test doubles written before it may omit it.
     */
    readNames?(targetId: string): Promise<VanillaNames | null>;
    /**
     * One object of the launcher's asset store of `mcVersion` by its index key (ADR 0121 D3,
     * B621): `minecraft/sounds.json`, `minecraft/sounds/**.ogg`, `minecraft/font/unifont*.zip` or
     * `minecraft/font/include/unifont*.json`, at most 16 MB, read on demand from the user's own
     * Minecraft folder and never cached, copied or exported. The preload always provides it;
     * optional so that test doubles written before it may omit it.
     */
    readAssetObject?(mcVersion: string, key: string): Promise<AssetObjectAnswer>;
    /**
     * Some vanilla structure templates of `mcVersion` by id (`minecraft:<path>`, at most 256 ids)
     * as the bytes the jar stores (ADR 0122, B636), from the local cache (schema 7); `null` when
     * the cache is not set up for the version. Throws for an id that is not a vanilla template
     * id. The preload always provides it; optional so that test doubles written before it may
     * omit it.
     */
    readStructureTemplates?(
      mcVersion: string,
      ids: readonly string[],
    ): Promise<VanillaStructureTemplates | null>;
    /** Writes a resource pack zip into `<gameDir>/resourcepacks/` of the selected location. */
    installResourcePack(fileName: string, data: Uint8Array): Promise<{ path: string }>;
    /** Lists worlds in `<gameDir>/saves/` of the selected location, most recently played first. */
    listWorlds(): Promise<WorldInfo[]>;
    /**
     * Writes a data pack zip into `<gameDir>/saves/<worldDir>/datapacks/` of the selected
     * location, after backing up the world when `backups.beforeInstall` is on (ADR 0102 D1);
     * `backup` names that backup (absent or `null` when none was made).
     */
    installDataPack(
      worldDir: string,
      fileName: string,
      data: Uint8Array,
    ): Promise<{ path: string; backup?: WorldBackupRef | null | undefined }>;
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
  /** Writing several export files into one folder the user picked (combined and plugin exports). */
  exports: {
    /** Shows a folder picker; returns the chosen absolute folder, or `null` when cancelled. */
    pickFolder(title: string): Promise<string | null>;
    /**
     * Writes export files into a folder returned by {@link pickFolder} in this session. Names
     * are single `.zip` file names or structure paths `<namespace>/<path>.nbt` (or `.schem`);
     * missing subfolders are created and each file is replaced atomically.
     */
    writeFiles(
      folder: string,
      files: { name: string; data: Uint8Array }[],
    ): Promise<{ paths: string[] }>;
    /**
     * The `msm_runtime` jar the Fabric content jar nests (ADR 0026 D4), for the target named
     * by `targetId` (ADR 0038 D4): the packaged app's `resources/runtime/msm_runtime-mc-<mc>.jar`,
     * or in development the newest `msm_runtime-*+mc<mc>.jar` in `engine-mod/build/libs/`.
     * `null` when there is none or the target is unknown.
     */
    runtimeJar(targetId: string): Promise<Uint8Array | null>;
    /**
     * The GeckoLib jar the Fabric content jar nests for projects with entities (ADR 0029 D4),
     * for the target named by `targetId`: the cached copy in the download cache, or downloaded
     * once from the target's `geckolib.url` and checked against its SHA-512. `null` when it is
     * not cached and cannot be downloaded (offline, bad hash, no GeckoLib facts).
     */
    geckolibJar(targetId: string): Promise<Uint8Array | null>;
    /**
     * Writes a file tree into a folder returned by {@link pickFolder} in this session (the
     * Java project export, ADR 0033 D4). Every path starts with the same first segment, the
     * tree's root folder (`<mod_id>`), which must not exist or must be empty; segments are
     * `[A-Za-z0-9_.-]+` without `.` or `..`, at most 16 deep, at most 4096 files. Each file is
     * written atomically; `gradlew` at the root is made executable.
     */
    writeTree(folder: string, files: ExportTreeFile[]): Promise<WriteTreeResult>;
    /**
     * The Gradle wrapper (ADR 0033 D2): the packaged app's
     * `resources/runtime/gradle-wrapper/`, or in development `engine-mod/gradle/wrapper/` and
     * `engine-mod/gradlew{,.bat}`. `null` when any file is missing.
     */
    gradleWrapper(): Promise<GradleWrapperFiles | null>;
    /**
     * Shows a folder picker and reads the chosen ejected Java project, only reading (ADR 0136
     * D8, B822): the build files, `msm.export.json` and the JSON and function files under
     * `src/main/resources/data` and `assets`, with the `.java` files counted, never read.
     * `null` when cancelled. The preload always provides it; optional so that test doubles
     * written before it may omit it.
     */
    scanJavaProject?(title: string): Promise<JavaProjectScan | null>;
  };
  /**
   * The TypeScript service for scripts (ADRs 0031 D2 and D5), run in main and loaded on first
   * use. Results are memoised per source.
   */
  scripting: {
    /** Transpiles a script to ES5 CommonJS; returns the JavaScript or its syntax errors. */
    transpile(source: string, name: string): Promise<ScriptTranspileOutcome>;
    /**
     * Checks a script against `typings` (the generated `msm-runtime.d.ts`) and the curated
     * lib set of ADR 0032 D5: syntax diagnostics as errors, semantic ones as warnings.
     */
    check(source: string, name: string, typings: string): Promise<ScriptDiagnostic[]>;
  };
  /**
   * Test in Minecraft (ADR 0026 D5): installs the content jar and Fabric API into a Fabric game
   * location's `mods/` folder and starts Prism Launcher or MultiMC on it. Fabric versions come
   * from the target named by `targetId`.
   */
  /**
   * Modpacks (ADR 0046): the remembered list, the modpack files, member snapshots for builds
   * and Modrinth lookups. Optional so that older test doubles may omit it.
   */
  modpacks?: {
    list(): Promise<ModpackListEntry[]>;
    /** Asks for a new, empty folder, writes a new modpack there and remembers it; `null` when cancelled. */
    create(name: string, targetId: string): Promise<ModpackView | null>;
    /** Asks for a folder holding `msm.modpack.json` and remembers it; `null` when cancelled. */
    addExisting(): Promise<ModpackView | null>;
    /** Forgets a modpack (its files stay). */
    forget(root: string): Promise<void>;
    read(root: string): Promise<ModpackView>;
    /** Writes the modpack file (validated) and returns the new view. */
    write(root: string, modpack: Modpack): Promise<ModpackView>;
    /**
     * Adds a project: `projectRoot` (an open or recent project) or, when `null`, one the user
     * picks. The member path is relative to the modpack when possible. `null` when cancelled.
     */
    addProject(root: string, projectRoot: string | null): Promise<ModpackView | null>;
    /** The read-only snapshot of member `path` (`msm.project.json`, `content/`, `assets/`). */
    readProject(root: string, path: string): Promise<ProjectSnapshotFile[]>;
    /** Looks a mod up on Modrinth for `gameVersion` and pins its newest Fabric file. */
    lookupMod(input: string, gameVersion: string): Promise<ModrinthModLookup>;
    /**
     * Asks Modrinth once (`POST /v2/version_files/update`) which pinned files, by SHA-1, have a
     * Fabric build for `gameVersion` (ADR 0136 D9). Only on the user's click (**Check my
     * mods**). Files without a build are absent from the answer.
     */
    checkMods(sha1s: string[], gameVersion: string): Promise<ModrinthModUpdate[]>;
  };
  testInMinecraft: {
    /** What a run would do with the selected location. */
    status(targetId: string): Promise<TestInMinecraftStatus>;
    /**
     * Creates (or updates) the managed Prism instance `MCSuperMods Test (<mc version>)`, makes
     * it the install target and returns the new status.
     */
    createInstance(targetId: string): Promise<TestInMinecraftStatus>;
    /**
     * Installs `data` as `mods/<modId>.jar` (replacing only a copy MSM installed), makes sure
     * Fabric API is present (downloaded and checked when missing) and starts the launcher
     * when the location allows it.
     */
    run(targetId: string, modId: string, data: Uint8Array): Promise<TestInMinecraftResult>;
    /**
     * Installs every member jar as `mods/<modId>.jar` and every extra mod (downloaded once,
     * SHA-512 checked), removes jars MSM installed that are not in the modpack, makes sure
     * Fabric API is present and starts the launcher when the location allows it (ADR 0046 D5).
     */
    runModpack(
      targetId: string,
      jars: { modId: string; data: Uint8Array }[],
      mods: ModpackMod[],
    ): Promise<ModpackTestResult>;
    /** Asks for a launcher program and stores it; returns its path, or `null` when cancelled. */
    pickLauncherProgram(launcher: LaunchableLauncher): Promise<string | null>;
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
    /** The current status (a renderer that subscribes late, or reloads, starts from it). */
    current(): Promise<UpdateStatus>;
    /** Subscribes to status changes; returns an unsubscribe function. */
    onStatus(listener: (status: UpdateStatus) => void): () => void;
  };
  project: {
    openRoot(path: string): Promise<RootResult>;
    createRoot(path: string): Promise<RootResult>;
    closeRoot(): Promise<void>;
    currentRoot(): Promise<string | null>;
    /**
     * The folder Very easy's name-only New creates projects in (ADR 0083 D6): the parent of the
     * last project folder chosen when there is one, else `<Documents>/MCSuperMods`. Optional so
     * that test doubles may omit it.
     */
    defaultParent?(): Promise<string>;
    /** The recent projects, newest first, each checked for `msm.project.json`. */
    recent(): Promise<RecentProjectView[]>;
    /**
     * Opens a project from the recent list. Main refuses a root that is not in the list or
     * has no `msm.project.json`; the outcome is the same as {@link openRoot}.
     */
    openRecent(root: string): Promise<RootResult>;
    /** Removes one entry from the recent list (matching by normalised path). */
    removeRecent(root: string): Promise<void>;
    /**
     * The picture and thing count of a mod in the recent list (ADR 0128 D4). Main refuses a
     * root that is not in the list. Optional so that test doubles may omit it.
     */
    recentSummary?(root: string): Promise<RecentProjectSummary>;
    /** Empties the recent list. */
    clearRecent(): Promise<void>;
  };
  /** File access scoped to the current project root. Rejects when no root is open. */
  fs: ProjectFileSystem;
  /**
   * Third-party plugins in `<msmHome>/plugins/` (ADR 0035). The preload always provides it;
   * optional so that test doubles written before Phase 7 may omit it (no external plugins).
   */
  plugins?: {
    /** Every plugin folder (sorted by folder name) with its manifest or problems. */
    list(): Promise<ExternalPluginEntry[]>;
    /**
     * Reads one plugin's bundle and schema files. Rejects with a message starting with
     * `plugin.too-large` or `plugin.manifest-invalid` when they cannot be served.
     */
    read(id: string): Promise<ExternalPluginBundle>;
    /** Creates `<msmHome>/plugins/` when missing and opens it in the OS file manager. */
    openFolder(): Promise<void>;
  };
  /**
   * The AI helper (ADR 0041). The preload always provides it; optional so that test doubles
   * written before the helper may omit it.
   */
  ai?: AiPlatform;
  /**
   * AI pictures (ADR 0093). The preload always provides it; optional so that test doubles
   * written before it may omit it.
   */
  aiPictures?: AiPicturesPlatform;
  /**
   * One-click Play and Reload (ADR 0084). The preload always provides it; optional so that
   * test doubles written before it may omit it.
   */
  play?: PlayPlatform;
  /**
   * Try it's worlds (ADR 0087). The preload always provides it; optional so that test doubles
   * written before it may omit it.
   */
  tryItWorlds?: TryItWorldsPlatform;
  /**
   * World backups (ADR 0102). The preload always provides it; optional so that test doubles
   * written before it may omit it.
   */
  worldBackups?: WorldBackupsPlatform;
  /**
   * Export as a map and builds from the game (ADR 0116 D2, D3). The preload always provides
   * it; optional so that test doubles written before it may omit it.
   */
  maps?: MapsPlatform;
  /**
   * The user guide inside the app (ADR 0124 D14). The preload always provides it; optional so
   * that test doubles written before it may omit it.
   */
  guide?: GuidePlatform;
  /**
   * Instances for anything (ADR 0133). The preload always provides it; optional so that test
   * doubles written before it may omit it.
   */
  instances?: InstancesPlatform;
  /**
   * The local server (ADR 0133 D7). The preload always provides it; optional so that test
   * doubles written before it may omit it.
   */
  localServer?: LocalServerPlatform;
}

/** The renderer's side of the window close round trip ({@link MsmBridge.onCloseRequest}). */
export interface CloseRequestHandlers {
  /**
   * Reports held-back edits; resolves whether the project has unsaved changes once they have
   * landed (a Rules edit reaches the project asynchronously).
   */
  report(): boolean | Promise<boolean>;
  /** Saves the project; resolves `true` once it is saved, `false` when saving failed. */
  save(): Promise<boolean>;
}

/** What the preload exposes as `window.msm`: the adapter plus window-level events. */
export interface MsmBridge extends PlatformAdapter {
  /** Subscribes to application-menu commands; returns an unsubscribe function. */
  onMenu(listener: (command: MenuCommand) => void): () => void;
  /**
   * Subscribes to "Open Recent" choices from the application menu (the project root);
   * returns an unsubscribe function.
   */
  onMenuOpenRecent(listener: (root: string) => void): () => void;
  /**
   * Subscribes to plugin exporters chosen under File > More Exports (the exporter id);
   * returns an unsubscribe function. Optional for older test doubles.
   */
  onMenuPluginExport?(listener: (id: string) => void): () => void;
  /** Tells the main process which plugin exporters File > More Exports lists. */
  setMenuPluginExports?(entries: { id: string; label: string; enabled: boolean }[]): void;
  /** Subscribes to asset extraction progress; returns an unsubscribe function. */
  onMinecraftProgress(listener: (progress: MinecraftProgress) => void): () => void;
  /** Tells the main process whether there are unsaved changes (for the close prompt). */
  setDirty(dirty: boolean): void;
  /**
   * Answers the window's close requests (the window's X, File > Exit, Restart to update):
   * `report` reports held-back edits and returns whether the project has unsaved changes,
   * `save` saves and resolves whether it was saved. Returns an unsubscribe function. Optional
   * for older test doubles; without it main decides by the last {@link setDirty}.
   */
  onCloseRequest?(handlers: CloseRequestHandlers): () => void;
  /** Tells the main process the renderer has rendered (smoke mode). */
  smokeReady(): void;
  /**
   * Once after main started the window's page again because it stopped (B870), what to tell
   * the user; otherwise `null`. Optional for older test doubles.
   */
  recoveryNotice?(): Promise<RecoveryNotice | null>;
  /**
   * `true` when the app runs in smoke mode (`MSM_SMOKE=1`). The renderer then sets
   * `window.msmNoMonaco` so headless smoke runs skip Monaco. Optional so test doubles may omit it.
   */
  readonly isSmoke?: boolean;
  /**
   * `true` when an end-to-end run asks every More options to start open
   * (`MSM_E2E_MORE_OPTIONS=open`, ADR 0130); people always start with them closed.
   */
  readonly moreOptionsOpen?: boolean;
}
