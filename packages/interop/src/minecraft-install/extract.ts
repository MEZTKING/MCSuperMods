/**
 * Extracting preview assets from a client jar (ADR 0011). Only the entries previews need
 * are inflated; everything else in the jar is skipped by fflate's `filter`.
 */

import { isProjectRelativePath } from '@msm/plugin-api';
import { unzipSync } from 'fflate';

/**
 * The texture folders below `assets/minecraft/textures/` the looks and sounds views read (ADR 0121
 * D3; the B619 spike's 3S4 list): mob bodies, banner, shield, pot and equipment layers, paintings,
 * trims and palettes, effect icons, particles, font pages and the GUI sprites of the locator bar,
 * the effect frames and the creative screen. Every `.png` and `.png.mcmeta` below each, in
 * subfolders too.
 */
const LOOKS_TEXTURE_FOLDERS = [
  'entity/wolf',
  'entity/cat',
  'entity/pig',
  'entity/cow',
  'entity/chicken',
  'entity/frog',
  'entity/nautilus',
  'entity/villager',
  'entity/sulfur_cube',
  'entity/banner',
  'entity/shield',
  'entity/decorated_pot',
  'entity/equipment',
  'painting',
  'trims',
  'palettes',
  'mob_effect',
  'particle',
  'font',
  'gui/sprites/hud/locator_bar_dot',
  'gui/sprites/container/creative_inventory',
  'gui/container/creative_inventory',
] as const;

/**
 * The entries of the looks and sounds views (ADR 0121 D3, schema 6): the texture folders above,
 * the locator bar and effect frame sprites, and the asset JSON and shader files of fonts, particle
 * descriptions, waypoint styles, equipment, post effects and shaders. Sounds, `sounds.json` and
 * the unifont archives are not in the jar: they come from the launcher's asset store on demand
 * (`asset-index.ts`), never from this cache.
 */
export const LOOKS_ASSET_PATTERNS: readonly RegExp[] = Object.freeze([
  new RegExp(
    `^assets/minecraft/textures/(?:${LOOKS_TEXTURE_FOLDERS.join('|')})/.+\\.png(?:\\.mcmeta)?$`,
  ),
  /^assets\/minecraft\/textures\/gui\/sprites\/hud\/(?:locator_bar_[^/]+|effect_background[^/]*)\.png(?:\.mcmeta)?$/,
  /^assets\/minecraft\/textures\/gui\/sprites\/container\/inventory\/effect_background[^/]*\.png(?:\.mcmeta)?$/,
  /^assets\/minecraft\/(?:font|particles|waypoint_style|equipment|post_effect)\/.+\.json$/,
  /^assets\/minecraft\/shaders\/.+\.(?:vsh|fsh|glsl|json)$/,
]);

/**
 * The jar's structure templates (ADR 0122, Live views 4; the B634 spike's 4S6): every `.nbt` file
 * below `data/minecraft/structure/`, subfolders included (1,511 files and about 4.2 MB on both
 * targets, each file gzipped as the jar stores it). Kept as they are, in bulk, since schema 7; the
 * renderer reads them one template id at a time (`minecraft:structureTemplates`) and parses them
 * once. One binary pattern, not a data folder: the data folders are JSON only.
 */
export const STRUCTURE_TEMPLATE_PATTERN = /^data\/minecraft\/structure\/.+\.nbt$/;

/** The folder of the jar's structure templates, `data/minecraft/structure/`. */
export const STRUCTURE_TEMPLATE_PREFIX = 'data/minecraft/structure/';

/**
 * The largest structure template file read back from the cache, as stored (gzipped). The largest
 * vanilla file is about 80 KB (B634 4S6); the limit guards against a hostile or corrupt cache.
 */
export const STRUCTURE_TEMPLATE_MAX_BYTES = 2 * 1024 * 1024;

/** A template id's path: lower case, digits, `_`, `-`, `.` in `/`-separated parts, no `.` or `..` part. */
const TEMPLATE_PATH = /^[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)*$/;

/**
 * Whether `id` names a vanilla structure template: `minecraft:<path>` (or a bare `<path>`, read as
 * `minecraft:`), such as `minecraft:village/plains/houses/plains_small_house_1`.
 */
export function isStructureTemplateId(id: string): boolean {
  const path = id.startsWith('minecraft:') ? id.slice('minecraft:'.length) : id;
  return (
    path.length > 0 &&
    path.length <= 256 &&
    TEMPLATE_PATH.test(path) &&
    !path.split('/').some((part) => /^\.+$/.test(part))
  );
}

/**
 * The jar path of a vanilla structure template id: `minecraft:village/plains/town_centers/x` is
 * `data/minecraft/structure/village/plains/town_centers/x.nbt`.
 *
 * @throws Error When `id` is not a vanilla structure template id ({@link isStructureTemplateId}).
 */
export function structureTemplateJarPath(id: string): string {
  if (!isStructureTemplateId(id)) {
    throw new Error(`${JSON.stringify(id)} is not a vanilla structure template id.`);
  }
  const path = id.startsWith('minecraft:') ? id.slice('minecraft:'.length) : id;
  return `${STRUCTURE_TEMPLATE_PREFIX}${path}.nbt`;
}

/**
 * The jar entries previews need: vanilla models, block and item definitions, block and item
 * textures with their animation sidecars (`.png.mcmeta`), the English lang file, the vanilla
 * placed feature files, since schema 6 the looks and sounds views' entries
 * ({@link LOOKS_ASSET_PATTERNS}) and since schema 7 the structure templates
 * ({@link STRUCTURE_TEMPLATE_PATTERN}).
 */
export const PREVIEW_ASSET_PATTERNS: readonly RegExp[] = Object.freeze([
  /^assets\/minecraft\/(?:models|blockstates|items)\/.+\.json$/,
  /^assets\/minecraft\/textures\/(?:block|item)\/.+\.png$/,
  /^assets\/minecraft\/textures\/(?:block|item)\/.+\.png\.mcmeta$/,
  /^assets\/minecraft\/lang\/en_us\.json$/,
  // Vanilla placed features, read by the World addition Studio's "Make my own copy".
  /^data\/minecraft\/worldgen\/placed_feature\/[^/]+\.json$/,
  ...LOOKS_ASSET_PATTERNS,
  STRUCTURE_TEMPLATE_PATTERN,
]);

/**
 * Entries larger than this when inflated are skipped. Vanilla preview files are a few
 * kilobytes; the limit guards against a hostile or corrupt jar.
 */
export const MAX_PREVIEW_ENTRY_BYTES = 16 * 1024 * 1024;

/** One extracted jar entry. */
export interface ExtractedFile {
  /** The entry's path inside the jar, such as `assets/minecraft/models/block/stone.json`. */
  path: string;
  data: Uint8Array;
}

/** Options for {@link extractPreviewAssets}. */
export interface ExtractOptions {
  /** Entry path patterns to keep. Defaults to {@link PREVIEW_ASSET_PATTERNS}. */
  patterns?: readonly RegExp[];
  /**
   * Folders under `data/minecraft/` whose JSON files are kept as well, subfolders included:
   * the target's `worldgen.terrainPreview.dataFolders` (ADR 0119 D4, D16) and the live views'
   * folders (ADR 0120 D11), joined by {@link mergeDataFolders}. The lists come from the host;
   * this package names no folder of its own. Defaults to none.
   */
  dataFolders?: readonly string[];
}

/** The prefix of the jar's vanilla data files. */
export const VANILLA_DATA_PREFIX = 'data/minecraft/';

/** Whether `folder` is a plain relative folder such as `worldgen/noise` (`a-z`, `0-9`, `_`, `/`). */
export function isDataFolder(folder: string): boolean {
  return /^[a-z0-9_]+(?:\/[a-z0-9_]+)*$/.test(folder) && isProjectRelativePath(folder);
}

/**
 * Joins folder lists (the world generation preview's, the live views') into one sorted list
 * without duplicates, the list the cache records.
 *
 * @throws Error When a folder is not a plain relative folder name (lower case, digits, `_`, `/`).
 */
export function mergeDataFolders(
  ...lists: readonly (readonly string[] | null | undefined)[]
): string[] {
  const all = new Set<string>();
  for (const list of lists) {
    for (const folder of list ?? []) {
      if (!isDataFolder(folder)) {
        throw new Error(`${JSON.stringify(folder)} is not a data folder name.`);
      }
      all.add(folder);
    }
  }
  return [...all].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * The entry patterns of a target's data folders: every `.json` file below
 * `data/minecraft/<folder>/`, in subfolders too.
 *
 * @throws Error When a folder is not a plain relative folder name (lower case, digits, `_`, `/`).
 */
export function dataFolderPatterns(dataFolders: readonly string[]): RegExp[] {
  return dataFolders.map((folder) => {
    if (!isDataFolder(folder)) {
      throw new Error(`${JSON.stringify(folder)} is not a data folder name.`);
    }
    return new RegExp(`^data/minecraft/${folder}/.+\\.json$`);
  });
}

/**
 * Inflates the jar entries matching the patterns and returns them sorted by path. Entries
 * whose names are not safe relative paths (absolute, backslashes, `.` or `..` segments) or
 * that inflate beyond {@link MAX_PREVIEW_ENTRY_BYTES} are skipped.
 *
 * @throws Error When the bytes are not a readable zip archive.
 */
export function extractPreviewAssets(
  jar: Uint8Array,
  options: ExtractOptions = {},
): ExtractedFile[] {
  const patterns = [
    ...(options.patterns ?? PREVIEW_ASSET_PATTERNS),
    ...dataFolderPatterns(options.dataFolders ?? []),
  ];
  const entries = unzipSync(jar, {
    filter: (file) =>
      file.originalSize <= MAX_PREVIEW_ENTRY_BYTES &&
      isProjectRelativePath(file.name) &&
      patterns.some((pattern) => pattern.test(file.name)),
  });
  return Object.keys(entries)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((path) => ({ path, data: entries[path] as Uint8Array }));
}
