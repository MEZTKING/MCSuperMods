/**
 * The `Target` contract: one Minecraft version's facts.
 *
 * Every version-specific value MSM uses is a field of {@link Target}, and targets are only
 * implemented in `packages/targets`. No other package hard-codes a version number.
 *
 * @packageDocumentation
 */

import type { ResourceLocation } from './json';
import type { Project } from './model';
import type { Problem } from './problems';

/**
 * A pack format number. Minecraft writes it as `major` or `major.minor` in `pack.mcmeta`.
 */
export interface PackFormat {
  /** The major pack format number. */
  major: number;
  /** The minor pack format number; `0` when the version has no minor format. */
  minor: number;
}

/**
 * One change applied to an element by {@link Target.migrateFrom}.
 */
export interface MigrationChange {
  /** The element that was changed. */
  elementId: ResourceLocation;
  /** Human-readable description of the change, in British English. */
  description: string;
}

/**
 * The outcome of migrating a project from one target to another.
 */
export interface MigrationReport {
  /** Every change the migration applied. */
  changes: MigrationChange[];
  /** Anything the migration could not handle automatically and the user must review. */
  problems: Problem[];
}

/**
 * Keys of {@link Target.folders}`.resource`: the resource pack folders whose names a target
 * supplies.
 *
 * - `model`: block and item models.
 * - `block_definition`: block state definitions.
 * - `item_definition`: item model definitions.
 * - `lang`: language files.
 * - `sounds_file`: the sound events file (a file name, not a folder).
 * - `textures`: texture images.
 * - `atlases`: texture atlas definitions.
 * - `font`: font definitions.
 */
export type ResourceFolderKey =
  | 'model'
  | 'block_definition'
  | 'item_definition'
  | 'lang'
  | 'sounds_file'
  | 'textures'
  | 'atlases'
  | 'font';

/**
 * Keys of {@link Target.folders}`.data`: the data pack folders whose names a target supplies.
 * Each value is a single folder name directly under `data/<namespace>/`.
 *
 * - `recipe`: recipes.
 * - `loot_table`: loot tables.
 * - `advancement`: advancements.
 * - `predicate`: predicates.
 * - `item_modifier`: item modifiers.
 * - `function`: functions (`.mcfunction` files).
 * - `tags`: the parent folder of every tag folder; tag kinds append `/<registry>`, for
 *   example `<tags>/item`.
 * - `enchantment`: enchantments.
 * - `damage_type`: damage types.
 * - `dimension_type`: dimension types.
 * - `chat_type`: chat types.
 * - `jukebox_song`: jukebox songs.
 * - `banner_pattern`: banner patterns.
 * - `painting_variant`: painting variants.
 * - `trim_material`: armour trim materials.
 * - `trim_pattern`: armour trim patterns.
 * - `dialog`: dialogs.
 * - `structure`: structure templates (`.nbt` files). Since 0.5.0.
 * - `dimension`: dimensions. Since 0.5.0.
 * - `worldgen`: the parent folder of every world generation registry folder; worldgen kinds
 *   append `/<registry>`, for example `<worldgen>/biome`, exactly as tag kinds append to
 *   `tags`. Since 0.5.0.
 */
export type DataFolderKey =
  | 'recipe'
  | 'loot_table'
  | 'advancement'
  | 'predicate'
  | 'item_modifier'
  | 'function'
  | 'tags'
  | 'enchantment'
  | 'damage_type'
  | 'dimension_type'
  | 'chat_type'
  | 'jukebox_song'
  | 'banner_pattern'
  | 'painting_variant'
  | 'trim_material'
  | 'trim_pattern'
  | 'dialog'
  | 'structure'
  | 'dimension'
  | 'worldgen';

/**
 * World generation facts of a target. Since 0.5.0.
 */
export interface WorldgenFacts {
  /**
   * The biome feature decoration step names, in the order the game runs them (the game's
   * decoration step enum). A biome's `features` list holds one list of placed features per
   * step, at the same index. Used to label steps and to bound step indices; never hard-code
   * them.
   */
  featureSteps: readonly string[];
}

/**
 * One Minecraft version's facts, contributed by a `@msm/target-mc-<version>` package.
 *
 * This interface is the documented home of every target field.
 */
export interface Target {
  /** Target id: `mc-` followed by the Minecraft version, such as `mc-<version>`. */
  id: string;
  /** The Minecraft version this target describes, as the game names it. */
  mcVersion: string;
  /** The Java feature release the game requires, for example `25`. */
  java: number;
  /** Resource pack and data pack formats written into `pack.mcmeta`. */
  packFormats: {
    /** Resource pack format. */
    resource: PackFormat;
    /** Data pack format. */
    data: PackFormat;
  };
  /** SpyglassMC/vanilla-mcdoc commit sha (40 hex chars). */
  mcdocRef: string;
  /**
   * misode/mcmeta version prefix; refs are `${mcmetaRef}-summary` and
   * `${mcmetaRef}-registries`.
   */
  mcmetaRef: string;
  /**
   * Vanilla folder names for resource packs and data packs, so lowering never hard-codes
   * them.
   */
  folders: {
    /**
     * Folder names under `assets/<namespace>/`, keyed by {@link ResourceFolderKey}.
     * `sounds_file` is a file name (directly under `assets/<namespace>/`), not a folder.
     */
    resource: Readonly<Record<ResourceFolderKey, string>>;
    /**
     * Folder names under `data/<namespace>/`, keyed by {@link DataFolderKey}. Every value is
     * a single path segment; `tags` is the parent of the per-registry tag folders and
     * `worldgen` the parent of the world generation registry folders.
     */
    data: Readonly<Record<DataFolderKey, string>>;
  };
  /**
   * The game's data version (the world and NBT format version), written as `DataVersion`
   * into structure template and schematic files. Required since 0.5.0.
   */
  dataVersion: number;
  /** World generation facts. Required since 0.5.0. */
  worldgen: WorldgenFacts;
  /** Fabric toolchain versions. Required from Phase 4. */
  fabric?: {
    /** Fabric Loader version. */
    loader: string;
    /** Fabric API version. */
    api: string;
    /** Fabric Loom (Gradle plugin) version. */
    loom: string;
  };
  /** GeckoLib version. Required when a project uses animated entities (Phase 5). */
  geckolib?: string;
  /**
   * Migrates a project written for `previous` so that it is valid for this target.
   *
   * Called when the user moves a project to this target. Omit the hook when no migration is
   * needed.
   *
   * @param previous - The target the project was written for.
   * @param project - The project to migrate.
   * @returns What changed and what needs the user's attention.
   */
  migrateFrom?(previous: Target, project: Project): MigrationReport;
}
