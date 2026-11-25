/**
 * The `Target` contract: one Minecraft version's facts.
 *
 * Every version-specific value MSM uses is a field of {@link TargetFacts} (data) or
 * {@link Target} (data plus hooks), and targets are only implemented in `packages/targets`.
 * No other package hard-codes a version number.
 *
 * @packageDocumentation
 */

import type { Json, JsonObject, ResourceLocation } from './json';
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
  /**
   * What the host does with the element when it applies the report: `update` replaces the
   * element's data with {@link MigrationChange.data}, `remove` deletes the element. Absent
   * means `update` when `data` is present and an informational entry otherwise. Since 1.0.0.
   */
  kind?: 'update' | 'remove';
  /**
   * The element's new data. Absent means the change is informational (or a `remove`): the
   * host leaves the element's data as it is. Since 1.0.0.
   */
  data?: Json;
  /**
   * What was done inside the element, one entry per value the migration touched, in the order
   * it did them (ADR 0136 D3). Absent on hooks written before 1.29.0 and on changes that only
   * inform. A host maps a validation problem's path through these entries, so that a value the
   * migration moved is not reported as a new problem at its new place. Since 1.29.0.
   */
  details?: MigrationDetail[];
}

/**
 * What a migration step did to one value inside an element (ADR 0136 D3). Since 1.29.0.
 *
 * @example
 * ```ts
 * const detail: MigrationDetail = {
 *   op: 'drop',
 *   path: '/default_block',
 *   before: { Name: 'minecraft:stone' },
 *   changeId: 'formats:minecraft:resource/worldgen/noise_settings#/default_block',
 * };
 * ```
 */
export interface MigrationDetail {
  /**
   * The kind of step: `rename-id` replaced an id with its new name, `drop` removed a field,
   * `move` moved a value to another place (see {@link MigrationDetail.from}), `set` gave a field
   * a value the newer version requires. Since 1.29.0.
   */
  op: MigrationDetailOp;
  /**
   * Where the value is after the step, as an RFC 6901 JSON pointer into the element's data
   * (`''` is the whole data). For `drop`, where the value was. Since 1.29.0.
   */
  path: string;
  /**
   * For `move` only: the RFC 6901 pointer the value was at before the step, so a host can map a
   * path from before the move to after it. Since 1.29.0.
   */
  from?: string;
  /** The value before the step; absent for `set` on a field that did not exist. Since 1.29.0. */
  before?: Json;
  /** The value after the step; absent for `drop`. Since 1.29.0. */
  after?: Json;
  /** The {@link TargetChange.id} this step answers. Since 1.29.0. */
  changeId: string;
  /**
   * One plain sentence for the user, in British English, when the change set has one; a host
   * otherwise words the entry from a template for its `op`. Since 1.29.0.
   */
  sentence?: string;
}

/**
 * The kinds of {@link MigrationDetail.op}. Since 1.29.0.
 */
export type MigrationDetailOp = 'rename-id' | 'drop' | 'move' | 'set';

/**
 * A value a migration dropped, kept so moving back can put it again (ADR 0136 D7). The host saves
 * these with the report. On a move back it puts a value back when the element exists, the parent
 * object at {@link MigrationReverse.path} exists and the key is absent; otherwise it lists the
 * value as not put back ("element gone", "place taken"). Since 1.29.0.
 */
export interface MigrationReverse {
  /** The element the value was dropped from. Since 1.29.0. */
  elementId: ResourceLocation;
  /** Where the value was, as an RFC 6901 JSON pointer into the element's data. Since 1.29.0. */
  path: string;
  /** The value as it was before the move. Since 1.29.0. */
  value: Json;
  /**
   * A hash of the element's data just after the move, so a host can tell an element edited since
   * the move from one left as moved. The host computes it, with one function for writing and
   * checking; the API does not fix the function. Since 1.29.0.
   */
  afterHash: string;
}

/**
 * One thing to check in the game after a move, from a change-set entry that touches the project
 * (ADR 0136 D12). Since 1.29.0.
 */
export interface MigrationInGameCheck {
  /** The {@link TargetChange.id} whose {@link TargetChange.inGameCheck} this is. Since 1.29.0. */
  changeId: string;
  /** What to check, one plain sentence in British English. Since 1.29.0. */
  check: string;
  /** The project's elements the check concerns, when it concerns some. Since 1.29.0. */
  elementIds?: ResourceLocation[];
}

/**
 * The outcome of migrating a project from one target to another. {@link Target.migrateFrom}
 * returns it without touching the project; the host applies every change as one undo step.
 */
export interface MigrationReport {
  /** Every change the migration applied. */
  changes: MigrationChange[];
  /** Anything the migration could not handle automatically and the user must review. */
  problems: Problem[];
  /**
   * What to check in the game after the move: the change set's checks for the changes that touch
   * this project. Absent when the hook has none. Since 1.29.0.
   */
  inGameChecks?: MigrationInGameCheck[];
  /**
   * Every value the migration dropped, so moving back can put it again (ADR 0136 D7). The host
   * saves them with the report. Absent when nothing was dropped or the hook predates 1.29.0.
   * Since 1.29.0.
   */
  reverses?: MigrationReverse[];
}

/**
 * What a target records about how Minecraft changed since the target before it (ADR 0136 D2):
 * the generated part written by the target tools from both targets' vendored data and the
 * curated part written by a person, merged. Lives only in target packages; read through
 * {@link TargetFacts.changes}. Since 1.29.0.
 */
export interface TargetChangeSet {
  /** The id of the target this one follows: {@link Target.previous}. Since 1.29.0. */
  from: string;
  /** The id of the target that carries this set. Since 1.29.0. */
  to: string;
  /** The pins of both ends' vendored data the set was computed from. Since 1.29.0. */
  refs: {
    /** The older target's vanilla-mcdoc commit and mcmeta prefix. */
    from: TargetChangeRefs;
    /** This target's vanilla-mcdoc commit and mcmeta prefix. */
    to: TargetChangeRefs;
  };
  /** Every change, sorted by {@link TargetChange.id}. Since 1.29.0. */
  changes: TargetChange[];
  /**
   * What the newer version adds, as counts by kind and registry (such as `ids:block`); the list
   * itself is kept outside the set and read when needed. Since 1.29.0.
   */
  additions: Record<string, number>;
  /**
   * Minecraft's own data and resource pack files that were added, removed, moved or changed
   * since {@link from} (ADR 0136 D11): paths and the kind of change only, never a file's
   * contents. A host tells a mod that replaces or adds to one of them "Minecraft changed this
   * one too". Absent when the target tools had no file index for both ends. Since 1.30.0.
   */
  vanillaFiles?: VanillaFileChanges;
}

/**
 * The vanilla files that changed between two targets (ADR 0136 D11, B823): every path under
 * `data/` and `assets/` of the game's own packs, as the target tools compared them from the
 * file trees of both versions (`source` `mcmeta-trees`). Each list is sorted by code point. A
 * path is the file's path in the game's jar and in a pack, so a lowered
 * {@link OutputFile.path} (`data/minecraft/loot_table/chests/simple_dungeon.json`) is compared
 * with it as it is. Since 1.30.0.
 *
 * @example
 * ```ts
 * const files: VanillaFileChanges = {
 *   from: 'mc-<older>',
 *   to: 'mc-<newer>',
 *   refs: { from: '<older version>', to: '<newer version>' },
 *   leftOut: ['data/*​/structure/**​/*.nbt'],
 *   added: ['data/minecraft/recipe/new_block.json'],
 *   removed: [],
 *   moved: { 'assets/minecraft/textures/gui/old.png': 'assets/minecraft/textures/gui/new.png' },
 *   changed: ['data/minecraft/loot_table/chests/simple_dungeon.json'],
 * };
 * ```
 */
export interface VanillaFileChanges {
  /** The older target's id. Since 1.30.0. */
  from: string;
  /** The newer target's id. Since 1.30.0. */
  to: string;
  /** The Minecraft version each end's file list was read for. Since 1.30.0. */
  refs: {
    /** The older end's version. */
    from: string;
    /** The newer end's version. */
    to: string;
  };
  /**
   * The paths never compared, as patterns in which `<name>` stands for any text: structure
   * templates, which change with the data version in every release. Since 1.30.0.
   */
  leftOut: string[];
  /** Files only the newer version has (not counting {@link moved} ones). Since 1.30.0. */
  added: string[];
  /** Files only the older version had (not counting {@link moved} ones). Since 1.30.0. */
  removed: string[];
  /**
   * Files the newer version keeps unchanged under another path: the older path to the newer.
   * Since 1.30.0.
   */
  moved: Record<string, string>;
  /** Files at the same path whose contents changed. Since 1.30.0. */
  changed: string[];
}

/**
 * The vendored data pins of one end of a {@link TargetChangeSet}. Since 1.29.0.
 */
export interface TargetChangeRefs {
  /** The vanilla-mcdoc commit: {@link TargetFacts.mcdocRef}. */
  mcdoc: string;
  /** The mcmeta version prefix: {@link TargetFacts.mcmetaRef}. */
  mcmeta: string;
}

/**
 * One change in Minecraft between a target and the one before it (ADR 0136 D2). Since 1.29.0.
 *
 * @example
 * ```ts
 * const change: TargetChange = {
 *   id: 'formats:minecraft:resource/worldgen/noise_settings#/default_block',
 *   area: 'formats',
 *   what: 'field-removed',
 *   registry: 'minecraft:resource',
 *   subject: 'minecraft:resource/worldgen/noise_settings',
 *   field: '/default_block',
 *   handling: 'auto',
 *   source: 'mcdoc',
 * };
 * ```
 */
export interface TargetChange {
  /**
   * Stable id: `${area}:${subject}`, followed by `#${field}` for a field. Since 1.29.0.
   */
  id: string;
  /** Which part of the game changed. Since 1.29.0. */
  area: TargetChangeArea;
  /** What happened. Since 1.29.0. */
  what: TargetChangeWhat;
  /**
   * The registry the subject is a member of, or the dispatcher it is a member of for a data
   * format (`minecraft:resource`). Since 1.29.0.
   */
  registry?: string;
  /**
   * What changed: a registry member, a dispatcher member
   * (`minecraft:resource/worldgen/noise_settings`), a command path, a block, a file. Since
   * 1.29.0.
   */
  subject: string;
  /**
   * The field, for a change below the subject: an RFC 6901 pointer below the subject for a data
   * format, the property name for a block state. Since 1.29.0.
   */
  field?: string;
  /** The value or shape before, when one is recorded (a removed id's new name is in `to`). Since 1.29.0. */
  from?: Json;
  /** The value or shape after, when one is recorded. Since 1.29.0. */
  to?: Json;
  /** For a removed id: the registries that still hold it. Since 1.29.0. */
  stillIn?: string[];
  /**
   * Who acts: `auto`, a migration step does it; `manual`, the user must; `none`, only news.
   * Since 1.29.0.
   */
  handling: TargetChangeHandling;
  /** Where the change was found. Since 1.29.0. */
  source: TargetChangeSource;
  /**
   * From the diff tool only: a likely rename, split, merge or field move with its evidence. A
   * candidate is never applied by a migration until a person confirms it in the curated part.
   * Since 1.29.0.
   */
  candidate?: TargetChangeCandidate;
  /** Curated only: the plain sentence for the user, in British English. Since 1.29.0. */
  sentence?: string;
  /** Curated only: how the user can make the change by hand. Since 1.29.0. */
  hint?: string;
  /** Curated only: what to check in the game when the change touches a mod. Since 1.29.0. */
  inGameCheck?: string;
}

/**
 * The areas of {@link TargetChange.area}: ids in registries, data formats, commands, block
 * states, pack formats and folders, what players need, the Java side, and the vanilla files that
 * changed. Since 1.29.0.
 */
export type TargetChangeArea =
  | 'ids'
  | 'formats'
  | 'commands'
  | 'block-states'
  | 'packs'
  | 'players'
  | 'java'
  | 'vanilla-files';

/**
 * The kinds of {@link TargetChange.what}. Registries: `registry-moved`, `member-removed`,
 * `member-renamed`. Data formats: `type-added`, `type-removed`, `type-changed`,
 * `field-removed`, `field-addedRequired`, `field-addedOptional`, `field-madeOptional`,
 * `field-madeRequired`, `field-retyped`. Commands: `root-removed`, `path-removed`,
 * `argument-changed`. Block states: `property-added`, `property-removed`, `values-changed`,
 * `default-changed`. Packs and other facts: `value-changed`. Vanilla files: `file-changed`.
 * Since 1.29.0.
 */
export type TargetChangeWhat =
  | 'registry-moved'
  | 'member-removed'
  | 'member-renamed'
  | 'type-added'
  | 'type-removed'
  | 'type-changed'
  | 'field-removed'
  | 'field-addedRequired'
  | 'field-addedOptional'
  | 'field-madeOptional'
  | 'field-madeRequired'
  | 'field-retyped'
  | 'root-removed'
  | 'path-removed'
  | 'argument-changed'
  | 'property-added'
  | 'property-removed'
  | 'values-changed'
  | 'default-changed'
  | 'value-changed'
  | 'file-changed';

/**
 * The values of {@link TargetChange.handling}. Since 1.29.0.
 */
export type TargetChangeHandling = 'auto' | 'manual' | 'none';

/**
 * The values of {@link TargetChange.source}: the vendored registries, mcdoc, command tree, block
 * states or version file, mcmeta's file trees, or a person (`curated`). Since 1.29.0.
 */
export type TargetChangeSource =
  | 'registries'
  | 'mcdoc'
  | 'commands'
  | 'blocks'
  | 'version'
  | 'mcmeta-trees'
  | 'curated';

/**
 * A likely rename, split, merge or field move the diff tool found (ADR 0136 D11), never applied
 * until confirmed. Since 1.29.0.
 */
export interface TargetChangeCandidate {
  /** What the tool thinks happened. */
  kind: 'rename' | 'split' | 'merge' | 'field-move';
  /** The id or pointer the subject likely became. */
  to: string;
  /** How alike the names are, from 0 to 1. */
  name: number;
  /** How the newer shape compares with the older: the same, wider, narrower, alike, different, or no shape to compare. */
  shape: 'same' | 'superset' | 'subset' | 'similar' | 'differs' | 'none';
  /** Set when more than one candidate fits as well. */
  ambiguous?: true;
}

/**
 * Keys of {@link TargetFacts.folders}`.resource`: the resource pack folders whose names a target
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
 * Keys of {@link TargetFacts.folders}`.data`: the data pack folders whose names a target supplies.
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
 * - `villager_trade`: villager trades. Since 1.8.0 (ADR 0060).
 * - `trade_set`: trade sets, the pools of trades a villager level draws from. Since 1.8.0
 *   (ADR 0060).
 * - `wolf_variant`: wolf variants. Since 1.9.0 (ADR 0064 D5).
 * - `cat_variant`: cat variants. Since 1.9.0 (ADR 0064 D5).
 * - `pig_variant`: pig variants. Since 1.9.0 (ADR 0064 D5).
 * - `cow_variant`: cow variants. Since 1.9.0 (ADR 0064 D5).
 * - `chicken_variant`: chicken variants. Since 1.9.0 (ADR 0064 D5).
 * - `frog_variant`: frog variants. Since 1.9.0 (ADR 0064 D5).
 * - `zombie_nautilus_variant`: zombie nautilus variants. Since 1.9.0 (ADR 0064 D5).
 * - `wolf_sound_variant`: wolf sound variants. Since 1.9.0 (ADR 0064 D5).
 * - `cat_sound_variant`: cat sound variants. Since 1.9.0 (ADR 0064 D5).
 * - `pig_sound_variant`: pig sound variants. Since 1.9.0 (ADR 0064 D5).
 * - `cow_sound_variant`: cow sound variants. Since 1.9.0 (ADR 0064 D5).
 * - `chicken_sound_variant`: chicken sound variants. Since 1.9.0 (ADR 0064 D5).
 * - `instrument`: instruments (goat horns). Since 1.9.0 (ADR 0064 D5).
 * - `enchantment_provider`: enchantment providers. Since 1.9.0 (ADR 0064 D5).
 * - `trial_spawner`: trial spawner configurations. Since 1.9.0 (ADR 0064 D5).
 * - `timeline`: timelines. Since 1.9.0 (ADR 0064 D5).
 * - `world_clock`: world clocks. Since 1.9.0 (ADR 0064 D5).
 * - `decorated_pot_pattern`: decorated pot patterns. Since 1.19.0 (ADR 0106 D1).
 * - `block_transformer`: block transformers (what axes, shovels and hoes do to blocks). Since
 *   1.19.0 (ADR 0106 D1).
 * - `test_environment`: GameTest environments. Since 1.19.0 (ADR 0106 D1).
 * - `test_instance`: GameTest instances. Since 1.19.0 (ADR 0106 D1).
 * - `sulfur_cube_archetype`: sulfur cube archetypes. Since 1.19.0 (ADR 0106 D1).
 * - `context_int_provider`: named whole-number providers, such as compost chances. Since
 *   1.19.0 (ADR 0106 D1).
 * - `context_float_provider`: named decimal-number providers, such as cooking speeds. Since
 *   1.19.0 (ADR 0106 D1).
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
  | 'worldgen'
  | 'villager_trade'
  | 'trade_set'
  | 'wolf_variant'
  | 'cat_variant'
  | 'pig_variant'
  | 'cow_variant'
  | 'chicken_variant'
  | 'frog_variant'
  | 'zombie_nautilus_variant'
  | 'wolf_sound_variant'
  | 'cat_sound_variant'
  | 'pig_sound_variant'
  | 'cow_sound_variant'
  | 'chicken_sound_variant'
  | 'instrument'
  | 'enchantment_provider'
  | 'trial_spawner'
  | 'timeline'
  | 'world_clock'
  | 'decorated_pot_pattern'
  | 'block_transformer'
  | 'test_environment'
  | 'test_instance'
  | 'sulfur_cube_archetype'
  | 'context_int_provider'
  | 'context_float_provider';

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
  /**
   * Biome environment attribute ids the host's Biome Studio and climate map read from a
   * biome's `attributes` map, with their namespace. Optional (added within 0.5.0); a target
   * without it gets no attribute-based colours or spawn lists.
   */
  biomeAttributes?: BiomeAttributeFacts;
  /**
   * Whether noise settings (`worldgen/noise_settings`) have the `default_block` field, which
   * is required where it exists. A target whose schema removed the field sets `false`, so the
   * worldgen plugin's `defaultDataFor` and templates leave it out there. Absent means `true`
   * (the field exists). Since 1.0.0 (ADR 0036 D8).
   */
  noiseSettingsDefaultBlock?: boolean;
  /**
   * Vanilla's placed feature order: per decoration step name (a {@link featureSteps} entry),
   * the namespaced ids of the vanilla placed features that step runs, in the order the game's
   * feature sorter puts them, over every vanilla biome (the overworld's, then the Nether's and
   * the End's). A biome that lists two of these in one step against this order can close a
   * "Feature order cycle" with vanilla biomes; an added feature runs after all of them.
   * Ids only, no vanilla file. Optional: a target without it skips the checks that need it,
   * and a plugin reading it must handle its absence. Since 1.17.0 (ADR 0097 D1).
   */
  vanillaFeatureOrder?: Readonly<Record<string, readonly string[]>>;
  /**
   * The bounds of a dimension type's height: the lowest `min_y`, the highest block y
   * (`min_y + height - 1` may not pass it) and the step `min_y` and `height` are multiples of.
   * Optional: a target without it skips the height checks. Since 1.18.0 (ADR 0100 D5).
   */
  dimensionHeight?: DimensionHeightFacts;
  /**
   * Every environment attribute id the game's `environment_attribute` registry lists, with its
   * namespace (for example `minecraft:visual/sky_color`), sorted. The keys a dimension type's
   * or biome's `attributes` map may hold; Studios show only these. Optional: a target without
   * it skips the attribute checks. Since 1.18.0 (ADR 0100 D5).
   */
  environmentAttributes?: readonly string[];
  /**
   * What the host's live world generation preview needs from this target: the client jar's
   * data folders it reads vanilla's worldgen files from, and the parts it can only draw
   * approximately here. Optional: a target without it has no live map of vanilla files (a
   * world made only of project files still draws). Since 1.21.0 (ADR 0119 D16).
   */
  terrainPreview?: TerrainPreviewFacts;
}

/**
 * A part of the world generation preview that is approximate on a target
 * ({@link TerrainPreviewFacts.approximate}): `biome_layout` where the target places biomes in a
 * way the data files do not describe, `end` where the End's land and biomes are not drawn as in
 * the game. Since 1.21.0 (ADR 0119 D6, D16).
 */
export type TerrainPreviewApproximatePart = 'biome_layout' | 'end';

/** The live world generation preview's facts ({@link WorldgenFacts.terrainPreview}). Since 1.21.0. */
export interface TerrainPreviewFacts {
  /**
   * The folders under `data/minecraft/` of the client jar whose JSON files the host extracts
   * into its local cache for the preview (for example `worldgen/noise_settings`,
   * `dimension_type`, `tags/worldgen/biome`), sorted. Each holds files of one registry, in
   * subfolders too; a file's id is `minecraft:` plus its path below the folder without `.json`.
   * The files stay in the user's local cache: never bundled, exported or sent anywhere.
   */
  dataFolders: readonly string[];
  /** The parts the preview labels as approximate on this target; empty when none. */
  approximate: readonly TerrainPreviewApproximatePart[];
}

/** The height bounds of a dimension type ({@link WorldgenFacts.dimensionHeight}). Since 1.18.0. */
export interface DimensionHeightFacts {
  /** The lowest `min_y` a dimension type may have. */
  minY: number;
  /** The highest block y: `min_y + height - 1` may not be above it. */
  maxY: number;
  /** `min_y` and `height` are whole multiples of this, and `height` is at least this. */
  step: number;
}

/**
 * Biome environment attribute ids (keys of a biome's `attributes`), with their namespace.
 * Added within 0.5.0.
 */
export interface BiomeAttributeFacts {
  /**
   * The colour attributes a biome commonly sets, in display order, for example the sky, fog
   * and water fog colours. Their plain value is an RGB colour.
   */
  colours: readonly string[];
  /** The sky colour attribute; one of {@link colours}. */
  skyColour: string;
  /** The attribute holding the biome's natural mob spawns (`spawns_by_category`, `spawn_costs`). */
  naturalMobSpawns: string;
}

/**
 * Block facts of a target: the names the `msm:block` definition format accepts for the
 * vanilla block set types and wood types a block family borrows its sounds and behaviour from.
 * The names are MSM's own, identical across targets where the game allows; how each maps to a
 * game constant is the runtime's concern, not a target fact. Since 1.10.0 (ADR 0067 D2, D9).
 */
export interface BlockFacts {
  /**
   * The block set type names a `door`, `trapdoor`, `button` or `pressure_plate` block's
   * `set_type` takes, in lower case (for example `wood`, `iron` or `stone`). A set type picks
   * vanilla's open and close sounds, whether hands open it, whether arrows press buttons and
   * which entities press plates. Since 1.10.0.
   */
  setTypes: readonly string[];
  /**
   * The wood type names a `fence_gate` block's `wood_type` takes, in lower case (for example
   * `oak` or `bamboo`), the game's wood type constants. A wood type picks the gate's open and
   * close sounds. Since 1.10.0.
   */
  woodTypes: readonly string[];
  /**
   * The namespaced sound event ids a container block (`msm:container`) plays by default when it
   * opens and closes (for example `minecraft:block.barrel.open`). Optional: a target without
   * them leaves the defaults to the runtime. Since 1.12.0 (ADR 0074 D7).
   */
  containerSounds?: { open: string; close: string };
  /**
   * The namespaced vanilla recipe type ids a machine block (`msm:machine`) may take in its
   * `recipe_types` (for example `minecraft:smelting`), besides its own machine recipes.
   * Optional: a target without them skips the checks that need them. Since 1.12.0 (ADR 0075
   * D7).
   */
  machineRecipeTypes?: readonly string[];
  /**
   * The default looks and sounds of a portal block (the `portal` block type): the namespaced
   * sound event ids it plays while idle (`ambientSound`), when an entity travels through it
   * (`travelSound`) and when an entity steps in (`triggerSound`), and the namespaced particle
   * type id it shows by default (`particle`, an option-less particle type such as
   * `minecraft:portal`). Optional: a target without them leaves the defaults to the runtime and
   * skips the checks that need them. Since 1.13.0 (ADR 0077 D7).
   */
  portal?: { ambientSound: string; travelSound: string; triggerSound: string; particle: string };
  /**
   * The environment attribute a bed block's `rule` follows, by MSM rule name: `bed` and
   * `straw_bed`, each mapped to the namespaced `environment_attribute` id that decides sleeping,
   * spawn setting and exploding per dimension (for example `minecraft:gameplay/bed_rule`).
   * Optional: a target without them skips the checks that need them. Since 1.17.0 (ADR 0094 D2,
   * D12).
   */
  bedRules?: Readonly<Record<string, string>>;
  /**
   * The sixteen dye colour names in the game's order (`white` first, `black` last), the values
   * a bed's `colour` takes and the colours a sign's text may be dyed. Optional. Since 1.17.0
   * (ADR 0094 D2, D12).
   */
  dyeColours?: readonly string[];
  /**
   * The namespaced block tag ids a `stem` block uses by default: `soil`, the blocks the stem
   * grows on, and `fruitSoil`, the blocks its fruit may grow onto (vanilla's melon stem's tags).
   * Optional: a target without them leaves the defaults to the runtime. Since 1.17.0 (ADR 0094
   * D2, D12).
   */
  stemTags?: { soil: string; fruitSoil: string };
  /**
   * The namespaced vanilla block model ids the block type lowerings name as `parent` (for
   * example `minecraft:block/template_torch`), each present in the target's client jar. The
   * user's own client jar supplies them; MSM never bundles them. Optional: a target without them
   * skips the checks that need them. Since 1.17.0 (ADR 0094 D10, D12).
   */
  modelTemplates?: readonly string[];
  /**
   * The namespaced particle type id a `torch` block shows when it names none (an option-less
   * particle type such as `minecraft:flame`). Optional: a target without it leaves the default
   * to the runtime. Since 1.17.0 (ADR 0094 D2, D12).
   */
  defaultTorchParticle?: string;
  /**
   * How the game registers a liquid: `two_fluids`, a source fluid and a flowing one
   * (`<namespace>:flowing_<path>` beside `<namespace>:<path>`), or `one_fluid`, a single fluid
   * whose state says whether it is a source. Lowering writes the flowing id into a project
   * fluid's tags only with `two_fluids`; the Fluid Studio words its notes by it. Informational:
   * the runtime keeps its own seam. Optional: a target without it is treated as `one_fluid`.
   * Since 1.18.0 (ADR 0099 D4).
   */
  fluidModel?: 'two_fluids' | 'one_fluid';
  /**
   * The namespaced fluid tag ids a project fluid joins by its `behaves_like`, so entities treat
   * it as vanilla's liquid ({@link FluidTagFacts}). Optional: a target without it leaves a
   * fluid in no tag. Since 1.18.0 (ADR 0099 D1, D4).
   */
  fluidTags?: FluidTagFacts;
  /**
   * Every vanilla block sound name of the target, bare (no namespace) and sorted (for example
   * `stone`, `wood` or `amethyst_cluster`): with {@link BlockFacts.soundModel} `sound_type` the
   * game's sound type constants in lower case, with `block_sound_set` the ids of the game's
   * `block_sound_set` registry without `minecraft:`. The names differ between targets (one
   * target may call a set `amethyst` where another calls it `amethyst_block`). The block
   * validators read these, not the format's own list, to check a block's `sound_type`.
   * Optional: a target without them skips the check. Since 1.19.0 (ADR 0105 D5).
   */
  soundTypes?: readonly string[];
  /**
   * How the game gives a block its sounds: `sound_type`, a fixed object built into the block
   * (a block's own sounds are built by the runtime), or `block_sound_set`, an entry of the
   * synchronised world registry `block_sound_set` that the block names by key (a block's own
   * sounds are a data file `data/<namespace>/block_sound_set/<path>.json` written by lowering,
   * read when a world loads, so a change needs the world opened again). Optional: a target
   * without it is treated as `sound_type`. Since 1.19.0 (ADR 0105 D1, D5, as amended after the
   * spike).
   */
  soundModel?: 'sound_type' | 'block_sound_set';
  /**
   * Each vanilla sound set's own events, volume and pitch ({@link SoundSetFacts}), keyed by the
   * bare names of {@link BlockFacts.soundTypes}. Lowering fills in the events, volume and pitch a
   * block's own sounds leave out from its `sound_type`'s set, where the game cannot do it itself
   * (`soundModel` `block_sound_set`: the block's own entry is all the game reads). Optional: a
   * target without them leaves those events out (silent), and the validators warn. Since 1.19.0
   * (ADR 0105 D1, D5).
   */
  soundSetEvents?: Readonly<Record<string, SoundSetFacts>>;
  /**
   * Vanilla's own tool and item pairs on vanilla blocks ({@link VanillaPairFacts}), so the
   * validators warn when a project pair on a vanilla block replaces one. Optional: a target
   * without them skips the warning. Since 1.19.0 (ADR 0105 D4, D5).
   */
  vanillaPairs?: VanillaPairFacts;
  /**
   * The namespaced block tag ids vanilla's growing and climbing plants survive on, by plant
   * ({@link PlantSoilFacts}): the default `soil` of a `column_plant` or `dripleaf` without its
   * own, offered by the Studio. Optional: a target without them leaves the defaults to the
   * runtime. Since 1.19.0 (ADR 0103 D5).
   */
  plantSoils?: PlantSoilFacts;
  /**
   * The namespaced ids of vanilla's cauldron blocks, sorted (for example `minecraft:cauldron`
   * and `minecraft:water_cauldron`): the empty cauldron and every filled one. A fluid's cauldron
   * companion `<namespace>:<path>_cauldron` may not take one of these ids, and the Fluid Studio
   * lists them. Optional: a target without them skips the check. Since 1.20.0 (ADR 0108 D6).
   */
  cauldrons?: readonly string[];
}

/**
 * One vanilla sound set ({@link BlockFacts.soundSetEvents}): the namespaced sound event id of each
 * event the set plays, and its volume and pitch. An event the set leaves out is silent in vanilla
 * too (a cactus flower has no step sound). Since 1.19.0 (ADR 0105 D1, D5).
 */
export interface SoundSetFacts {
  /** The sound when the block breaks. */
  break?: string;
  /** The sound when an entity walks on the block. */
  step?: string;
  /** The sound when the block is placed. */
  place?: string;
  /** The sound while a player mines the block. */
  hit?: string;
  /** The sound when an entity falls onto the block. */
  fall?: string;
  /** The set's volume (vanilla's default 1). */
  volume: number;
  /** The set's pitch (vanilla's default 1). */
  pitch: number;
}

/**
 * Vanilla's pairs on vanilla blocks ({@link BlockFacts.vanillaPairs}): each a map from the
 * namespaced id of the block used on to the namespaced id of the block it turns into. Block
 * state properties are left out (the game copies or sets them). A data pack may change the
 * strip, flatten and till pairs (the `block_transformer` registry); these are the game's own.
 * Since 1.19.0 (ADR 0105 D4, D5).
 */
export interface VanillaPairFacts {
  /** An axe strips a log or wood (for example `minecraft:oak_log` to `minecraft:stripped_oak_log`). */
  strip: Readonly<Record<string, string>>;
  /** A shovel flattens a block into a path (for example `minecraft:dirt` to `minecraft:dirt_path`). */
  flatten: Readonly<Record<string, string>>;
  /** A hoe tills a block (for example `minecraft:dirt` to `minecraft:farmland`). */
  till: Readonly<Record<string, string>>;
  /**
   * Honeycomb waxes a block (for example `minecraft:copper_block` to
   * `minecraft:waxed_copper_block`); an axe takes the wax off again, the reverse pair.
   */
  wax: Readonly<Record<string, string>>;
  /**
   * A block ages into the next stage over time (for example `minecraft:copper_block` to
   * `minecraft:exposed_copper`); an axe scrapes it back one stage, the reverse pair.
   */
  age: Readonly<Record<string, string>>;
}

/**
 * The block tags of vanilla's growing and climbing plants ({@link BlockFacts.plantSoils}), each
 * a namespaced block tag id without `#` (for example `minecraft:supports_cactus`). Since 1.19.0
 * (ADR 0103 D5).
 */
export interface PlantSoilFacts {
  /** The blocks sugar cane grows on (`column_plant` `cane`). */
  cane: string;
  /** The blocks that count as water beside a sugar cane's soil, besides water itself. */
  caneWater: string;
  /** The blocks a cactus grows on (`column_plant` `cactus`). */
  cactus: string;
  /** The blocks that hold a cactus flower although they would not otherwise (a support override). */
  cactusFlower: string;
  /** The blocks bamboo and its shoot grow on (`column_plant` `bamboo`). */
  bamboo: string;
  /** The blocks a big dripleaf grows on (`dripleaf` `big`). */
  bigDripleaf: string;
  /** The blocks a small dripleaf grows on (`dripleaf` `small`). */
  smallDripleaf: string;
  /** The blocks kelp may not stand on (a kelp-like `growing_plant`). */
  notKelp: string;
  /**
   * The tag naming vanilla's cave vine blocks (other tags include it: climbing, and the plants
   * bees help grow). Not a soil: a cave-vine-like plant may join it.
   */
  caveVines: string;
}

/**
 * The fluid tags of a target ({@link BlockFacts.fluidTags}), per `behaves_like` value; `none`
 * joins no tag. Since 1.18.0 (ADR 0099 D4).
 */
export interface FluidTagFacts {
  /**
   * The tags of a water-like fluid (for example `minecraft:water`, and the tag the swimming pose
   * follows where the game has one), each a vanilla fluid tag.
   */
  water: readonly string[];
  /** The tags of a lava-like fluid (for example `minecraft:lava`). */
  lava: readonly string[];
}

/**
 * How one MSM command argument type reads in the game's command tree: the Brigadier parser id
 * and the parser's properties, as the vendored command tree writes an argument node. Since
 * 1.17.0 (ADR 0096 D1, D6).
 */
export interface CommandArgumentFacts {
  /** The namespaced parser id (for example `brigadier:integer` or `minecraft:entity`). */
  parser: string;
  /**
   * The parser's fixed properties (for example `{ type: 'word' }` for a one-word string, or
   * `{ amount: 'single', type: 'players' }` for one player). Absent when the parser takes none.
   * Range limits (`min`, `max`) are the command's own and never appear here.
   */
  properties?: Readonly<Record<string, string>>;
  /**
   * True when the argument names an id of a registry the game does not send to players (a
   * structure, an advancement, a recipe): the parser takes any id (a key type) and the game
   * checks it only when the command runs, so a typing player gets no completions from the
   * registry. A registry-checked parser over such a registry would disconnect every player.
   * Absent means false. Since 1.20.0 (ADR 0111 D2, as amended after the spike).
   */
  keyOnly?: boolean;
}

/**
 * Command facts of a target: the vanilla command names a project command may not take, and how
 * MSM's argument types map to the game's parsers. Since 1.17.0 (ADR 0096 D6).
 */
export interface CommandFacts {
  /**
   * Every literal at the root of the game's command tree, sorted (for example `give`, `tp`,
   * `xp`), including the aliases that are their own literals. A project command's `name` or
   * alias must not be one of them.
   */
  vanillaNames: readonly string[];
  /**
   * MSM's argument type names, each mapped to the game's parser and properties: the twelve of
   * 1.17.0 (`integer`, `number`, `word`, `text`, `boolean`, `player`, `players`, `entity`,
   * `position`, `block_position`, `item`, `block`), then (since 1.20.0, ADR 0111 D2) the 32 the
   * game takes on every built-in target and sends to players' command trees: `dimension`,
   * `time`, `team_colour`, `hex_colour`, `rotation`, `angle`, `uuid`, `objective`,
   * `score_holder`, `score_holders`, `item_predicate`, `block_predicate`, `effect`,
   * `enchantment`, `biome`, `biome_or_tag`, `structure`, `structure_or_tag`, `entity_type`,
   * `particle`, `game_mode`, `text_component`, `int_range`, `identifier`, `team`, `slot`, `nbt`,
   * `message`, `dialog`, `loot_table`, `advancement` and `recipe`. The record's order is that
   * order. `text` and `message` take the rest of the line, so only the last argument may have
   * them.
   */
  argumentTypes: Readonly<Record<string, CommandArgumentFacts>>;
  /**
   * The exact command forms the game kits' lowering writes (ADR 0113 D8), each a template of
   * literal words and placeholders: `<name>` is required, `[name]` is optional and written only
   * together with every optional placeholder before it. The lowering replaces each placeholder
   * with ready command text (a name, a number, a position, a text component, a whole command
   * after `run`) and never adds words of its own, so a form that changes between versions
   * changes here only. Optional: a target without them cannot lower the game kits, and an
   * external plugin reading them must handle their absence. Since 1.22.0.
   */
  forms?: Readonly<Record<CommandFormName, string>>;
  /**
   * Pieces of command text the game types put into a placeholder of a form (ADR 0132, measured
   * by B720): an inline item modifier, a trader's offer. Templates as in {@link forms}; each
   * filled fragment is ready text for one placeholder (`trade_offer`, joined by commas, fills
   * `summon_trader`'s `<offers>`; `lodestone_tracker_modifier` fills `item_modify_entity`'s
   * `<item_modifier>`). Optional, as {@link forms}. Since 1.27.0.
   */
  fragments?: Readonly<Record<CommandFragmentName, string>>;
}

/**
 * The names of the command fragments in {@link CommandFacts.fragments}: `trade_offer` (one
 * offer of a trader, one item bought), `trade_offer_two` (two items bought) and
 * `lodestone_tracker_modifier` (an inline `set_components` item modifier that points a compass
 * at a position in a dimension). Since 1.27.0.
 */
export type CommandFragmentName = 'trade_offer' | 'trade_offer_two' | 'lodestone_tracker_modifier';

/**
 * The names of the command forms in {@link CommandFacts.forms} (ADR 0113 D8): the `team`,
 * `scoreboard`, `bossbar`, `title` (action bar), `worldborder`, `place`, `forceload`, `loot` and
 * `random` lines the game kits write. Since 1.22.0.
 *
 * Since 1.26.0 also the forms Rules writes for games (`if_entity`, `if_score_run`,
 * `set_world_spawn`, `spawn_point`, `set_fire`; ADR 0115) and every other line the game kits
 * write: `function`, `tag`, `kill`, `execute` (`in`, `as`, `as ... at ... if predicate`,
 * `unless data storage`, `unless score`, `if score ... if score`, `in ... if block`, `store
 * result score`, each ending `run <command>`), `data modify storage`, `scoreboard players
 * remove`, `setblock`, `summon`, `tp`, `gamemode`, `defaultgamemode`, `difficulty`, `gamerule`,
 * `give`, `item replace entity`, `effect give`, `tellraw` and `dialog show`. A target that lists
 * forms lists every name.
 *
 * Since 1.27.0 also the lines the community game types write (ADR 0132), each run on a dedicated
 * server of both built-in targets by the B720 spike: `attribute` (base set, modifier add and
 * remove, get), `trigger` (bare, add, set), `time query gametime`, `execute store result storage
 * ... int <scale> run`, `function ... with storage`, `data modify storage ... set from entity` and
 * `from block`, `data get entity` and `storage`, `loot replace block`, `execute on attacker`,
 * `at`, `as ... at`, `if entity ... run`, `if items entity`, `if block ... if block`, `unless
 * block`, the four score comparisons (`if`/`unless score ... <comparison> ...`, alone or after
 * `as`), `execute store result score ... if entity`, `scoreboard players operation` and
 * `reset`, `item modify entity`, `clear`, `effect clear`, `fill`, `team empty`, `advancement
 * revoke ... only`, the item drop `summon minecraft:item` and the still trader `summon
 * minecraft:villager` with its offers.
 */
export type CommandFormName =
  | 'team_add'
  | 'team_colour'
  | 'team_friendly_fire'
  | 'team_see_invisible_friends'
  | 'team_name_tags'
  | 'team_collision'
  | 'team_death_messages'
  | 'team_prefix'
  | 'team_suffix'
  | 'team_display_name'
  | 'team_join'
  | 'team_leave'
  | 'objective_add'
  | 'objective_display'
  | 'objective_render_type'
  | 'objective_number_format'
  | 'objective_display_name'
  | 'objective_auto_update'
  | 'score_set'
  | 'score_add'
  | 'score_get'
  | 'score_enable'
  | 'score_display_name'
  | 'score_number_format'
  | 'bossbar_add'
  | 'bossbar_max'
  | 'bossbar_value'
  | 'bossbar_colour'
  | 'bossbar_style'
  | 'bossbar_players'
  | 'bossbar_visible'
  | 'bossbar_name'
  | 'bossbar_remove'
  | 'bossbar_store_value'
  | 'actionbar'
  | 'worldborder_set'
  | 'worldborder_set_over_seconds'
  | 'worldborder_center'
  | 'worldborder_warning_distance'
  | 'place_template'
  | 'place_structure'
  | 'forceload_add'
  | 'forceload_remove'
  | 'forceload_query'
  | 'loot_spawn'
  | 'loot_give'
  | 'loot_insert'
  | 'random_value'
  | 'random_roll'
  | 'if_entity'
  | 'if_score_run'
  | 'set_world_spawn'
  | 'spawn_point'
  | 'set_fire'
  | 'run_function'
  | 'tag_add'
  | 'tag_remove'
  | 'kill'
  | 'in_run'
  | 'as_run'
  | 'as_at_if_predicate_run'
  | 'unless_storage_run'
  | 'storage_set_value'
  | 'unless_score_run'
  | 'if_score_if_score_run'
  | 'in_if_block_run'
  | 'store_result_score_run'
  | 'score_remove'
  | 'setblock'
  | 'summon'
  | 'teleport'
  | 'game_mode'
  | 'default_game_mode'
  | 'difficulty'
  | 'game_rule'
  | 'give'
  | 'item_replace_entity'
  | 'effect_give'
  | 'tellraw'
  | 'dialog_show'
  | 'attribute_base_set'
  | 'attribute_modifier_add'
  | 'attribute_modifier_remove'
  | 'attribute_get'
  | 'trigger'
  | 'trigger_add'
  | 'trigger_set'
  | 'time_query_gametime'
  | 'store_result_storage_run'
  | 'function_with_storage'
  | 'storage_set_from_entity'
  | 'storage_set_from_block'
  | 'data_get_entity'
  | 'data_get_storage'
  | 'loot_replace_block'
  | 'on_attacker_run'
  | 'at_run'
  | 'as_at_run'
  | 'if_entity_run'
  | 'if_items_run'
  | 'if_block_if_block_run'
  | 'unless_block_run'
  | 'if_score_compare_run'
  | 'unless_score_compare_run'
  | 'as_if_score_compare_run'
  | 'as_unless_score_compare_run'
  | 'store_result_score_if_entity'
  | 'score_operation'
  | 'score_reset'
  | 'item_modify_entity'
  | 'clear'
  | 'effect_clear'
  | 'fill'
  | 'team_empty'
  | 'advancement_revoke_only'
  | 'summon_item'
  | 'summon_trader';

/**
 * The kind of value a game rule holds: vanilla's two. Since 1.20.0 (ADR 0111 D5).
 */
export type GameRuleKindName = 'boolean' | 'integer';

/**
 * Game rule facts of a target: what the `msm:game_rule` kind and its validators check against.
 * Since 1.20.0 (ADR 0111 D5, D8, as amended after the spike).
 */
export interface GameRuleFacts {
  /** The kinds of value a game rule may hold, `boolean` and `integer`. */
  kinds: readonly GameRuleKindName[];
  /**
   * The categories of the game rule screen, bare and in the game's order (for example `player`,
   * `mobs` and `misc`); a game rule's `category` is one of them.
   */
  categories: readonly string[];
  /**
   * Every vanilla game rule id without `minecraft:`, sorted (for example `keep_inventory`). A
   * project game rule always has its own namespace, so these never clash; the Studio shows them
   * beside the project's rules.
   */
  vanillaNames: readonly string[];
  /**
   * The vanilla game rules the community game types set (ADR 0132), each set and read back on a
   * dedicated server by the B720 spike, sorted (for example `block_drops`, `immediate_respawn`
   * and `pvp`). Every name is one of {@link vanillaNames}; the older camel-case names (such as
   * `doTileDrops`) are refused by `gamerule`. Optional: absent where they have not been
   * measured. Since 1.27.0.
   */
  forGames?: readonly string[];
}

/**
 * How a statistic's number is shown: vanilla's formatters of a custom statistic. Since 1.20.0
 * (ADR 0111 D6).
 */
export type StatFormatName = 'default' | 'distance' | 'time';

/**
 * Statistic facts of a target: what the `msm:stat` kind and its validators check against, and
 * how a statistic is named as a scoreboard criterion. Since 1.20.0 (ADR 0111 D6, D8, as amended
 * after the spike).
 */
export interface StatFacts {
  /** The formatters a statistic may use, `default`, `distance` and `time`. */
  formats: readonly StatFormatName[];
  /**
   * What a custom statistic's scoreboard criterion starts with, followed by its namespace, a
   * dot and its path: `minecraft.custom:` gives `minecraft.custom:<namespace>.<path>`.
   */
  criterionPrefix: string;
  /** Every vanilla custom statistic id without `minecraft:`, sorted (for example `jump`). */
  vanillaCustomStats: readonly string[];
}

/**
 * How a `minecraft:fixed_placement` placement modifier lists its positions on a target: a list
 * of absolute `[x, y, z]` positions, all placed, stacked or in other chunks. A placed feature
 * runs only where its biome's features run, which a flat world without a solid layer never
 * does, so it cannot place a start platform in a void world (B547 Y6, Y8). Since 1.22.0 (ADR 0113
 * D8).
 */
export interface FixedPlacementShapeFacts {
  /** The placement modifier type, namespaced (`minecraft:fixed_placement`). */
  type: string;
  /**
   * The fewest positions the list may hold: `0` where an empty list loads, `1` where the game
   * refuses an empty list and with it the whole data pack.
   */
  minPositions: number;
}

/**
 * World facts of a target: what the game kits' world types and start lower against (ADR 0113
 * D8, ADR 0114). Since 1.22.0.
 */
export interface WorldFacts {
  /**
   * Every structure placement type, namespaced and sorted (for example
   * `minecraft:dimension_origin`, which has no fields and places one start in chunk 0 0 of every
   * dimension whose generator uses the set, its piece's bottom at `start_height - 1` and its
   * rotation random).
   */
  structurePlacements: readonly string[];
  /**
   * The vanilla void biome, namespaced (`minecraft:the_void`): empty spawn lists, and its own
   * stone start platform when the flat generator's `features` is true.
   */
  voidBiome: string;
  /** The vanilla noise settings of floating islands, namespaced (`minecraft:floating_islands`). */
  floatingIslandsSettings: string;
  /**
   * The vanilla noise settings of an End-like world, namespaced. Absent where it has not been
   * measured in the game.
   */
  endLikeSettings?: string;
  /** How `minecraft:fixed_placement` lists its positions. */
  fixedPlacementShape: FixedPlacementShapeFacts;
  /**
   * The advancement criterion trigger that fires on a player's first tick after being placed,
   * namespaced (`minecraft:tick`): with a reward function, the vanilla first-join pattern, once
   * per player.
   */
  firstJoinCriterion: string;
}

/**
 * Scoreboard and team facts of a target: what the `msm:team` and `msm:objective` kinds and their
 * validators check against (ADR 0113 D4, D5, D8). Since 1.22.0.
 */
export interface ScoreboardFacts {
  /**
   * The plain objective criteria measured in the game, sorted (for example `dummy` and
   * `health`). A project statistic's criterion comes from {@link StatFacts.criterionPrefix}.
   */
  criteria: readonly string[];
  /**
   * The team criteria measured in the game, sorted: each is followed by a dot and one of
   * {@link teamColours} (`killedByTeam.red` counts the deaths of a player killed by a member of
   * a red team, whatever the victim's own team; `teamkill.blue` counts the kills a player makes
   * of members of a blue team). Optional: absent where they have not been measured. Since
   * 1.27.0 (ADR 0132, the B720 spike K1).
   */
  teamCriteria?: readonly string[];
  /**
   * The custom statistic criteria the game types read, measured in the game, sorted (for
   * example `minecraft.custom:minecraft.deaths`, which counts as `deathCount` does, and
   * `minecraft.custom:minecraft.leave_game`, one more at each leaving). Any custom statistic
   * makes a criterion with {@link StatFacts.criterionPrefix}; these are the ones whose timing is
   * known. Optional. Since 1.27.0 (ADR 0132, the B720 spike K1).
   */
  customStatCriteria?: readonly string[];
  /**
   * The statistic types, bare and sorted (for example `mined`): the criterion
   * `minecraft.<type>:<namespace>.<path>` counts that statistic of one id, such as
   * `minecraft.mined:minecraft.stone`.
   */
  statTypes: readonly string[];
  /**
   * The display slots, in this order: `list`, `sidebar`, `below_name`, then
   * `sidebar.team.<colour>` for each of {@link ScoreboardFacts.teamColours}, shown only to the
   * players of a team of that colour.
   */
  displaySlots: readonly string[];
  /** The objective render types (`integer`, `hearts`). */
  renderTypes: readonly string[];
  /**
   * The number format keywords (`blank`; `fixed`, followed by a text component; `styled`,
   * followed by a style).
   */
  numberFormats: readonly string[];
  /** The team colours, in the game's order (`black` to `white`, sixteen on every target). */
  teamColours: readonly string[];
  /** The values of a team's `nametagVisibility` (for example `hideForOtherTeams`), sorted. */
  nameTagVisibility: readonly string[];
  /** The values of a team's `collisionRule` (for example `pushOwnTeam`), sorted. */
  collisionRules: readonly string[];
  /** The values of a team's `deathMessageVisibility`, sorted. */
  deathMessageVisibility: readonly string[];
}

/**
 * Entity facts of a target: vanilla names the mob definition format checks against. Since 1.11.0
 * (ADR 0070 D7, ADR 0071 D4).
 */
export interface EntityFacts {
  /**
   * The item ids a mob's `msm:ranged_attack` may fire as its `projectile`, namespaced (for
   * example `minecraft:arrow` or `minecraft:snowball`): the vanilla items that can be shot as a
   * projectile (the game's projectile items, such as arrows, eggs, snowballs, throwable potions,
   * charges and tridents). The list differs between targets when the game adds a projectile
   * item. Since 1.11.0.
   */
  projectileItems: readonly string[];
  /**
   * The namespaced entity type tag the vanilla saddle equips (for example
   * `minecraft:can_equip_saddle`); lowering adds a saddled mount's entity id to it. Since
   * 1.11.0.
   */
  saddleTag: string;
  /**
   * The namespaced sound event ids vanilla's merchants play while trading
   * ({@link TradeSoundFacts}); `yes` is the default `trade_sound` of an `msm:trader`. Optional:
   * a target without them leaves the defaults to the runtime. Since 1.18.0 (ADR 0098 D1, D5).
   */
  tradeSounds?: TradeSoundFacts;
  /**
   * Every vanilla block that already has a point of interest type, by the namespaced point of
   * interest type id (for example `minecraft:librarian` to `['minecraft:lectern']`, or
   * `minecraft:home` to the beds): the job sites and the other points of interest (beds, bells,
   * bee homes, portals). A villager profession's `job_site` may not be one of these blocks
   * (`entities.job-site-taken`). The keys are the target's `point_of_interest_type` registry.
   * Optional: a target without it skips the check. Since 1.18.0 (ADR 0098 D2, D5).
   */
  vanillaJobSites?: Readonly<Record<string, readonly string[]>>;
  /**
   * Every vanilla trade set, by namespaced id (for example `minecraft:mason/level_3` or
   * `minecraft:wandering_trader/common`), with how many trades it can draw and how many of those
   * only villagers can offer ({@link VanillaTradeSetFacts}). An `msm:trader` naming a set whose
   * `villagerOnly` is true is warned that it gets fewer offers or none. Optional: a target
   * without it skips the checks. Since 1.18.0 (ADR 0098 D1, D5, as amended after the spike).
   */
  vanillaTradeSets?: Readonly<Record<string, VanillaTradeSetFacts>>;
  /**
   * The bare ids of vanilla's villager types, sorted (for example `plains` and `taiga`): the
   * looks villagers take from their biome. A project villager type has its own namespace, so it
   * never replaces one; the Villager type Studio lists them. Optional: a target without them
   * skips the listing. Since 1.20.0 (ADR 0107 D6).
   */
  villagerTypes?: readonly string[];
}

/**
 * The sounds of vanilla's merchant screen ({@link EntityFacts.tradeSounds}), namespaced sound
 * event ids. Since 1.18.0 (ADR 0098 D1).
 */
export interface TradeSoundFacts {
  /** Played when a trade is made or an offer can be taken (for example `minecraft:entity.villager.yes`). */
  yes: string;
  /** Played when an offer cannot be taken or the trader refuses (for example `minecraft:entity.villager.no`). */
  no: string;
  /** The idle sound while a player has the screen open (for example `minecraft:entity.villager.trade`). */
  trading: string;
}

/**
 * One vanilla trade set ({@link EntityFacts.vanillaTradeSets}). Since 1.18.0 (ADR 0098 D1, as
 * amended after the spike).
 */
export interface VanillaTradeSetFacts {
  /** The number of distinct villager trades the set can draw from, its trade tags resolved. */
  trades: number;
  /**
   * The number of those trades carrying a `merchant_predicate` on the villager's variant (a
   * biome type): they give a mob that is not a villager no offer.
   */
  villagerOnlyTrades: number;
  /** True when `villagerOnlyTrades` is above 0: a project trader gets fewer offers from the set. */
  villagerOnly: boolean;
}

/**
 * Particle facts of a target: what the particle definition format and the particle validators
 * check against. Since 1.14.0 (ADR 0080 D9).
 */
export interface ParticleFacts {
  /**
   * The namespaced vanilla particle types that take options (for example `minecraft:dust` or
   * `minecraft:block`): the game's particle types whose spawns carry extra fields, as opposed to
   * option-less types such as `minecraft:flame`. A field that needs an option-less type (an
   * effect's `particle`, a leaves block's `falling_particle`, a portal's particle, a plain id in
   * `spawn_particle`) may not name one of these; an options object must name one of these or an
   * option-less type. The list differs between targets when the game adds or removes such a
   * type. Since 1.14.0.
   */
  withOptions: readonly string[];
  /**
   * The folder under `assets/<namespace>/` that holds particle description files
   * (`<folder>/<path>.json`, listing the sprites a particle type draws), for example
   * `particles`. A single path segment. Since 1.14.0.
   */
  descriptionFolder: string;
  /**
   * The folder under the textures folder ({@link TargetFacts.folders}`.resource.textures`) that
   * holds particle pictures, so the sprite `<namespace>:<name>` is the file
   * `assets/<namespace>/<textures>/<folder>/<name>.png`, for example `particle`. A single path
   * segment. Since 1.14.0.
   */
  textureFolder: string;
}

/**
 * The game rules a test world sets, by their registry ids without a namespace (the names the
 * `/gamerule` command takes, for example `keep_inventory`). Since 1.15.0 (ADR 0084 D10).
 */
export interface DevGameRuleFacts {
  /** The rule that makes the time of day advance; set to false to stop the clock. */
  advanceTime: string;
  /** The rule that makes the weather change; set to false to stop it. */
  advanceWeather: string;
  /** The rule that lets mobs spawn naturally; set to false to stop natural spawning. */
  spawnMobs: string;
  /** The rule that keeps a player's inventory on death. */
  keepInventory: string;
}

/**
 * Facts the host's test-in-game tools need: the game rules of the test world and which data
 * pack folders are read only when a world is loaded. Since 1.15.0 (ADR 0084 D10).
 */
export interface DevFacts {
  /** The game rules a test world sets. */
  gameRules: DevGameRuleFacts;
  /**
   * The folders under `data/<namespace>/` whose registries the game loads with the world, not
   * on `/reload`: world generation folders (such as `worldgen/biome`), `dimension`,
   * `dimension_type`, `enchantment`, `damage_type`, the mob variant folders and the like.
   * A change to a file in one of them takes effect only when the world is opened again. Paths
   * of one or two segments separated by `/`, sorted, without tag folders.
   */
  worldDataFolders: readonly string[];
}

/**
 * The default keys of the runtime's own controls (ADR 0088 D5): the key mappings the runtime
 * registers in its "MSM Vehicles" category when a project has at least one vehicle. Each value
 * is a name from {@link ControlFacts.keyNames}. Since 1.16.0 (ADR 0088 D9).
 */
export interface RuntimeKeyFacts {
  /** The vehicle's main weapon (a weapon with `key` `fire`). */
  fire: string;
  /** The vehicle's second weapon (a weapon with `key` `second`). */
  second: string;
  /** The vehicle's horn. */
  horn: string;
  /** Going down in a flying or hovering vehicle. */
  descend: string;
}

/**
 * Control facts of a target: the key names the game knows and the defaults of its own
 * controls, for key bind definitions, the vehicle keys and the Key bind Studio. Dumped from the
 * running client, never typed from memory. Since 1.16.0 (ADR 0088 D9).
 */
export interface ControlFacts {
  /**
   * Every valid key name (the game's input constant names), sorted: keyboard keys such as
   * `key.keyboard.r` and `key.keyboard.left.alt`, mouse buttons such as `key.mouse.left` and
   * `key.mouse.4`, and {@link ControlFacts.unboundKey}.
   */
  keyNames: readonly string[];
  /** The name of "no key" (an unbound control), for example `key.keyboard.unknown`. */
  unboundKey: string;
  /**
   * Each vanilla control (its translation key, such as `key.jump`) to its default key name.
   * A control whose default is {@link ControlFacts.unboundKey} has no key. The control names
   * differ between targets when the game renames a control.
   */
  vanillaKeys: Readonly<Record<string, string>>;
  /**
   * The vanilla controls of {@link ControlFacts.vanillaKeys} that are pressed together with a
   * modifier key (the debug key combinations), sorted. Their key pressed alone does something
   * else, so a default key equal to one of theirs is not a clash.
   */
  vanillaCombinations: readonly string[];
  /**
   * The key name of each keyboard code, indexed by code from 0 up. Codes are USB HID usage ids
   * (SDL scancodes: 4 is the A key), not the codes of a browser's `KeyboardEvent.keyCode`; a host
   * maps a `KeyboardEvent.code` to its usage id and looks the name up here. Unknown codes name
   * {@link ControlFacts.unboundKey}.
   */
  keyboardNamesByCode: readonly string[];
  /**
   * The key name of each mouse button code, indexed by code from 0 up. Buttons start at 1 (the
   * left button); 0 is not a button.
   */
  mouseNamesByCode: readonly string[];
  /** The default keys of the runtime's own vehicle controls. */
  runtimeKeys: RuntimeKeyFacts;
}

/**
 * Vehicle facts of a target: what the `msm:vehicle` format and its validators check against.
 * Since 1.16.0 (ADR 0090 D13).
 */
export interface VehicleFacts {
  /**
   * The movement modes a vehicle may use (ADR 0090 D3), such as `ground` or `air`, in the order
   * a host shows them.
   */
  modes: readonly string[];
  /**
   * The highest `max_speed` a vehicle may have, in blocks a tick (ADR 0090 D4): the driver's
   * client moves the vehicle and the server accepts moves up to about this speed.
   */
  maxSpeed: number;
}

/**
 * Item facts of a target: names the definition format checks against the game's own
 * constants. Since 1.1.0 (ADR 0042 D4).
 */
export interface ItemFacts {
  /**
   * The vanilla armour material names of the target's game version, in lower case (the
   * game's armour material constants, for example `iron` or `turtle_scute`). The
   * `blocks-items.unknown-armor-material` validator checks an `msm:armor` material given by
   * name against this list.
   */
  armorMaterials: readonly string[];
  /**
   * The vanilla compost chance providers of the target, keyed by the chance as the editor
   * shows it (for example `30%`) and valued with the `context_int_provider` id the
   * `minecraft:compostable` component's `layers` field takes. Optional: absent means the
   * target offers no friendly compost chances. Since 1.8.0 (ADR 0060 D4, D8).
   */
  compostProviders?: Record<string, string>;
  /**
   * How the target's vanilla bow and crossbow item definitions show the pull, so a custom bow
   * or crossbow can animate the same way (scaled by its draw speed). Without it they show one
   * model. Since 1.3.0.
   */
  rangedPull?: RangedPullFacts;
  /**
   * The data components (unprefixed ids, for example `enchantments`) whose value names an
   * element or tag of a data pack registry (an enchantment, a jukebox song, a trim material, a
   * mob variant). The runtime can apply such an `msm:components` entry only late, for a fixed
   * list, so the `blocks-items.passthrough-needs-data-pack` validator warns about the others.
   * Since 1.4.0 (ADR 0050).
   */
  dataPackComponents?: readonly string[];
  /**
   * The numbers of each vanilla tool as its tooltip shows them, by tier (`wooden`, `stone`,
   * `copper`, `iron`, `golden`, `diamond`, `netherite`) and tool type (`sword`, `pickaxe`,
   * `axe`, `shovel`, `hoe`, `spear`). The Creator's Stats tab shows them for a tool of a
   * vanilla tier. Since 1.4.0 (ADR 0050).
   */
  vanillaTools?: Readonly<Record<string, Readonly<Record<string, VanillaToolStats>>>>;
}

/** One vanilla tool's numbers (ADR 0050). Since 1.4.0. */
export interface VanillaToolStats {
  /** Attack damage, the player's base of 1 included. */
  attackDamage: number;
  /** Attacks per second, the player's base of 4 included. */
  attackSpeed: number;
  durability: number;
  /** Mining speed on the blocks it is made for; absent for swords and spears. */
  miningSpeed?: number;
  enchantability: number;
}

/** The pull animation facts of vanilla's `items/bow.json` and `items/crossbow.json`. Since 1.3.0. */
export interface RangedPullFacts {
  /** The boolean property that is true while the item is in use, for example `minecraft:using_item`. */
  usingItem: string;
  bow: {
    /** The numeric property counting use ticks, for example `minecraft:use_duration`. */
    useDuration: string;
    /** The `range_dispatch` scale of vanilla's bow. */
    scale: number;
    /** The thresholds of the `_pulling_1` and `_pulling_2` models. */
    thresholds: readonly [number, number];
  };
  crossbow: {
    /** The numeric pull property, for example `minecraft:crossbow/pull`. */
    pull: string;
    /** The thresholds of the `_pulling_1` and `_pulling_2` models. */
    thresholds: readonly [number, number];
    /** The select property of the loaded charge, for example `minecraft:charge_type`. */
    chargeType: string;
    /** Its cases for an arrow and a firework rocket. */
    arrow: string;
    rocket: string;
  };
}

/**
 * Fabric toolchain versions of a target. Since 0.6.0 (`minecraftDependency` is new in 0.6.0,
 * `gradle` in 0.8.0).
 */
export interface FabricFacts {
  /** Fabric Loader version, for example `0.<minor>.<patch>`. */
  loader: string;
  /** Fabric API version, as published on the Fabric Maven, for example `0.<n>.<n>+<game version>`. */
  api: string;
  /** Fabric Loom (Gradle plugin) version. */
  loom: string;
  /**
   * The version range written as the `minecraft` dependency in `fabric.mod.json`, for example
   * `~<game version>`.
   */
  minecraftDependency: string;
  /**
   * The Gradle version the ejected Java project's wrapper uses, written into
   * `gradle/wrapper/gradle-wrapper.properties` as `gradle-<version>-bin.zip`, for example
   * `<major>.<minor>.<patch>`. It equals the version of the wrapper the host serves with the
   * project. Required since 0.8.0 (ADR 0034).
   */
  gradle: string;
  /**
   * The Fabric API jar as published on Modrinth, for modpack exports that list it as a
   * download (`.mrpack`). The same bytes as on the Fabric Maven. Since 1.3.0 (ADR 0046 D7);
   * a target without it cannot export a `.mrpack`.
   */
  apiModrinth?: ModrinthFileFacts;
}

/** One file of a Modrinth project version. Since 1.3.0 (ADR 0046). */
export interface ModrinthFileFacts {
  /** The Modrinth version id (8 characters). */
  versionId: string;
  /** The file's name, for example `fabric-api-<version>.jar`. */
  fileName: string;
  /** Its `https://cdn.modrinth.com/` download URL. */
  url: string;
  /** SHA-1 as 40 lower-case hex characters. */
  sha1: string;
  /** SHA-512 as 128 lower-case hex characters. */
  sha512: string;
  /** Size in bytes. */
  size: number;
}

/**
 * GeckoLib facts of a target: the GeckoLib build the content jar depends on and nests for
 * animated entities. Since 0.7.0 (ADR 0030).
 */
export interface GeckolibFacts {
  /** GeckoLib version, for example `<major>.<minor>.<patch>`. */
  version: string;
  /** GeckoLib's mod id, written as the key of its entry in `fabric.mod.json` `depends`. */
  modId: string;
  /** The version range written into `fabric.mod.json` `depends`, for example `>=<version>`. */
  dependency: string;
  /**
   * The jar's file name, used as the nested jar's name under `META-INF/jars/`, for example
   * `geckolib-fabric-<game version>-<version>.jar`.
   */
  fileName: string;
  /** Where the host downloads the jar from. */
  url: string;
  /** SHA-512 of the jar as 128 lower-case hex characters, checked after download. */
  sha512: string;
  /** The Modrinth version id of this build, for the Modrinth Maven and the Modrinth API. */
  modrinthVersionId?: string;
}

/**
 * One block, item or entity definition handed to a {@link JavaProjectGenerator}. Since 0.8.0
 * (ADR 0034).
 */
export interface DefinitionInput {
  /** The definition's id as a resource location, for example `<namespace>:ruby_ore`. */
  id: string;
  /**
   * The definition file's path in the content jar, for example
   * `msm/<namespace>/block/ruby_ore.json`.
   */
  path: string;
  /** The parsed definition (runtime definition format 1), as the content jar holds it. */
  definition: JsonObject;
}

/**
 * Everything a {@link JavaProjectGenerator} needs to write one ejected Java project. Built by
 * the `java-project` exporter from the lowered output files. Since 0.8.0 (ADR 0034).
 */
export interface JavaProjectInput {
  /** The mod id, taken from the project's `fabric.mod.json`. */
  modId: string;
  /** The Java package of the generated sources, derived by the exporter, for example `com.example.ruby`. */
  javaPackage: string;
  /** The simple name of the generated mod initialiser class, for example `RubyMod`. */
  modClassName: string;
  /** Block definitions (`msm/<namespace>/block/*.json`), in a stable order. */
  blocks: DefinitionInput[];
  /** Item definitions (`msm/<namespace>/item/*.json`), in a stable order. */
  items: DefinitionInput[];
  /** Entity definitions (`msm/<namespace>/entity/*.json`), in a stable order. */
  entities: DefinitionInput[];
  /**
   * Status effect definitions (`msm/<namespace>/effect/*.json`), in a stable order. Optional:
   * absent means the same as an empty array, so generators written for earlier versions
   * and hosts that do not set it keep working. Since 1.6.0 (ADR 0055).
   */
  effects?: DefinitionInput[];
  /**
   * The sound event keys the project's resource pack defines, namespaced (for example
   * `<namespace>:<key>`), sorted, without the `minecraft` namespace, collected from every
   * `assets/<namespace>/sounds.json`. Generators that emit Java register one sound event per
   * key. Optional: absent means the same as an empty array, so generators written for earlier
   * versions and hosts that do not set it keep working. Since 1.7.0 (ADR 0057).
   */
  soundEvents?: string[];
  /**
   * The project's biome addition definitions (`msm/<namespace>/biome_addition/*.json`), in a
   * stable order, for generators that emit the `BiomeModifications` calls. Optional: absent
   * means the same as an empty array, so generators written for earlier versions and hosts
   * that do not set it keep working. Since 1.8.0 (ADR 0060).
   */
  biomeAdditions?: DefinitionInput[];
  /**
   * The project's loot addition definitions (`msm/<namespace>/loot_addition/*.json`), in a
   * stable order, for generators that emit the loot table `MODIFY` listener. Optional: absent
   * means the same as an empty array. Since 1.8.0 (ADR 0060).
   */
  lootAdditions?: DefinitionInput[];
  /**
   * The project's potion definitions (`msm/<namespace>/potion/*.json`), in a stable order, for
   * generators that register potions. Optional: absent means the same as an empty array.
   * Since 1.9.0 (ADR 0063 D7).
   */
  potions?: DefinitionInput[];
  /**
   * The project's particle definitions (`msm/<namespace>/particle/*.json`), in a stable order,
   * for generators that register particle types and their client providers. Optional: absent
   * means the same as an empty array. Since 1.14.0 (ADR 0080 D11).
   */
  particles?: DefinitionInput[];
  /**
   * The project's command definitions (`msm/<namespace>/command/*.json`), in a stable order,
   * for generators that register the commands with Brigadier. Optional: absent means the same
   * as an empty array. Since 1.18.0 (ADR 0096 D6).
   */
  commands?: DefinitionInput[];
  /**
   * The project's creative tab definitions (`msm/<namespace>/creative_tab/*.json`), in a stable
   * order, for generators that register the tabs and list their members. Optional: absent means
   * the same as an empty array. Since 1.18.0 (ADR 0096 D6).
   */
  creativeTabs?: DefinitionInput[];
  /**
   * The project's rules for vanilla blocks (`msm/<namespace>/vanilla_block_rules/*.json`), in a
   * stable order, for generators that register the strip, flatten, till, wax, age and burn pairs
   * on vanilla blocks. Optional: absent means the same as an empty array. Since 1.20.0 (ADR 0105
   * D4, ADR 0112 D3).
   */
  vanillaBlockRules?: DefinitionInput[];
  /**
   * The project's villager profession definitions (`msm/<namespace>/villager_profession/*.json`),
   * in a stable order, for generators that register the job site points of interest and the
   * professions. Optional: absent means the same as an empty array. Since 1.20.0 (added
   * 2026-11-22 within 1.20.0; ADR 0098 D5, ADR 0112 D3).
   */
  villagerProfessions?: DefinitionInput[];
  /**
   * The project's fluid definitions (`msm/<namespace>/fluid/*.json`), in a stable order, for
   * generators that register the fluids with their liquid blocks, buckets, mixing rules,
   * cauldrons and bottles. Optional: absent means the same as an empty array. Since 1.20.0 (added
   * 2026-11-22 within 1.20.0; ADR 0099 D4, ADR 0108, ADR 0112 D3).
   */
  fluids?: DefinitionInput[];
  /**
   * The project's villager type definitions (`msm/<namespace>/villager_type/*.json`), in a stable
   * order, for generators that register the types and their biomes. Optional: absent means the
   * same as an empty array. Since 1.20.0 (added 2026-11-22 within 1.20.0; ADR 0107, ADR 0112 D3).
   */
  villagerTypes?: DefinitionInput[];
  /**
   * The project's game rule definitions (`msm/<namespace>/game_rule/*.json`), in a stable order.
   * Optional: absent means the same as an empty array. Since 1.20.0 (added 2026-11-22 within
   * 1.20.0; ADR 0111 D5, ADR 0112 D3).
   */
  gameRules?: DefinitionInput[];
  /**
   * The project's statistic definitions (`msm/<namespace>/stat/*.json`), in a stable order.
   * Optional: absent means the same as an empty array. Since 1.20.0 (added 2026-11-22 within
   * 1.20.0; ADR 0111 D6, ADR 0112 D3).
   */
  stats?: DefinitionInput[];
  /** `true` when the project has entities and the target has {@link TargetFacts.geckolib} facts. */
  geckolib: boolean;
}

/**
 * One text file a {@link JavaProjectGenerator} writes. Since 0.8.0 (ADR 0034).
 */
export interface GeneratedFile {
  /** Path relative to the ejected project's root, with `/` separators, for example `src/main/java/<package path>/RubyMod.java`. */
  path: string;
  /** The file's contents as UTF-8 text. */
  contents: string;
}

/**
 * Generates the version-specific Java sources and resources of an ejected project (the
 * `java-project` exporter, ADR 0033). The generated Java names one Minecraft version's
 * classes, so the generator is a target fact. Since 0.8.0 (ADR 0034).
 */
export interface JavaProjectGenerator {
  /**
   * Generates the Java sources and resources of the ejected project. Pure and deterministic:
   * the same input always yields the same files in the same order.
   *
   * @param input - The mod's identity and its parsed definitions.
   * @returns The generated files, relative to the project root.
   * @throws Error - When a definition cannot be generated; the message names the definition.
   *   The exporter reports it as `export.java-generation-failed` and writes nothing.
   */
  generate(input: JavaProjectInput): GeneratedFile[];
}

/**
 * Whether a target describes a released game version or a snapshot. Snapshot targets are shown
 * with a badge and are never the default for new projects. Since 1.0.0.
 */
export type TargetChannel = 'release' | 'snapshot';

/**
 * One Minecraft version's facts as plain data: what every plugin-facing function
 * ({@link ElementKind.lower}, {@link ProjectValidator.validate}, templates, starters and
 * examples) receives. Hosts and exporters work with the full {@link Target}, which adds the
 * hooks. Since 1.0.0 (these fields were on `Target` before).
 *
 * This interface is the documented home of every target data field.
 */
export interface TargetFacts {
  /** Target id: `mc-` followed by the Minecraft version, such as `mc-<version>`. */
  id: string;
  /** The Minecraft version this target describes, as the game names it. */
  mcVersion: string;
  /**
   * `release` for a released game version, `snapshot` for a development snapshot. Snapshot
   * targets are shown with a badge and are never the default for new projects. Since 1.0.0.
   */
  channel: TargetChannel;
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
  /**
   * Fabric toolchain versions, used by the content jar exporter and the Java eject. Optional,
   * since a future non-Fabric target may lack it; every MSM target from Phase 4 sets it.
   */
  fabric?: FabricFacts;
  /**
   * GeckoLib facts, used by the content jar exporter and the host's GeckoLib download when a
   * project has animated entities. Optional, since a target may lack a GeckoLib build; the
   * exporter reports a problem when a project with entities is exported for such a target.
   * A {@link GeckolibFacts} object since 0.7.0 (a version string before).
   */
  geckolib?: GeckolibFacts;
  /**
   * Item facts, such as the vanilla armour material names. Optional: a target without them
   * skips the checks that need them. Since 1.1.0 (ADR 0042 D4).
   */
  items?: ItemFacts;
  /**
   * Block facts: the set type and wood type names block families take, (since 1.12.0) the
   * container sounds and machine recipe types, and (since 1.13.0) the portal looks. Optional: a target without them skips the checks
   * that need them. Since 1.10.0 (ADR 0067 D9).
   */
  blocks?: BlockFacts;
  /**
   * Entity facts: the projectile item ids ranged mobs may fire and the saddle tag mounts join.
   * Optional: a target without them skips the checks that need them. Since 1.11.0 (ADR 0070 D7,
   * ADR 0071 D4).
   */
  entities?: EntityFacts;
  /**
   * Particle facts: the vanilla particle types that take options and the resource pack folders
   * of particle descriptions and pictures. Optional: a target without them skips the checks that
   * need them, and an external plugin reading them must handle their absence. Since 1.14.0
   * (ADR 0080 D9).
   */
  particles?: ParticleFacts;
  /**
   * Facts for testing a project in the game: the test world's game rules and the data folders
   * read only when a world loads. Optional: a target without them cannot drive the host's Play
   * and Reload, and an external plugin reading them must handle their absence. Since 1.15.0
   * (ADR 0084 D10).
   */
  dev?: DevFacts;
  /**
   * Control facts: the key names, vanilla's default bindings, the keyboard and mouse code
   * tables and the runtime's own vehicle keys. Optional: a target without them skips the checks
   * that need them, and an external plugin reading them must handle their absence. Since 1.16.0
   * (ADR 0088 D9).
   */
  controls?: ControlFacts;
  /**
   * Vehicle facts: the movement modes and the speed cap. Optional: a target without them skips
   * the checks that need them. Since 1.16.0 (ADR 0090 D13).
   */
  vehicles?: VehicleFacts;
  /**
   * Command facts: the vanilla command names and the parsers behind MSM's argument types.
   * Optional: a target without them skips the checks that need them, and an external plugin
   * reading them must handle their absence. Since 1.17.0 (ADR 0096 D6).
   */
  commands?: CommandFacts;
  /**
   * Game rule facts: the kinds and categories a project game rule may take and vanilla's own
   * rule names. Optional: a target without them skips the checks that need them. Since 1.20.0
   * (ADR 0111 D5, D8).
   */
  gameRules?: GameRuleFacts;
  /**
   * Statistic facts: the formatters a project statistic may use, its scoreboard criterion and
   * vanilla's own custom statistics. Optional: a target without them skips the checks that need
   * them. Since 1.20.0 (ADR 0111 D6, D8).
   */
  stats?: StatFacts;
  /**
   * World facts: the structure placements, the void biome, the floating-island noise settings,
   * the `fixed_placement` shape and the first-join criterion the game kits lower against.
   * Optional: a target without them skips the checks that need them, and an external plugin
   * reading them must handle their absence. Since 1.22.0 (ADR 0113 D8).
   */
  worlds?: WorldFacts;
  /**
   * Scoreboard facts: objective criteria, display slots, render types, number formats, team
   * colours and the team options' values. Optional: a target without them skips the checks that
   * need them. Since 1.22.0 (ADR 0113 D8).
   */
  scoreboard?: ScoreboardFacts;
  /**
   * The sixteen dye colours as the game draws them on banners and shields: dye name (as in
   * {@link BlockFacts.dyeColours}, without a namespace) to `#rrggbb` in lower case, the colour a
   * white pattern layer is multiplied by. Measured on screen (ADR 0121 D5, the B619 spike, 3S6),
   * because not every version has an accessor for it. Optional: a target without it leaves a
   * view that needs the values to say so, and an external plugin reading it must handle its
   * absence. Since 1.25.0.
   */
  dyes?: Readonly<Record<string, string>>;
  /**
   * The exact JSON forms the game types write into data pack files (ADR 0132, measured by the
   * B720 spike): advancement criteria, the loot condition that tests an entity's type and a loot
   * entry. A JSON string whose whole text is `<name>` is a placeholder the lowering replaces
   * with a JSON value (a string, or a whole object such as the filled `entity_is_type`); nothing
   * else is added, so a form that changes between versions changes here only. On every
   * built-in target an advancement's `entity` or `killing_entity` condition is one loot
   * condition, not a list, and an entity predicate is a map keyed by sub-predicate type; a
   * wrong form stops the server loading the whole data pack. Optional: a target without them
   * cannot lower the game types, and an external plugin reading them must handle their absence.
   * Since 1.27.0.
   */
  dataForms?: Readonly<Record<DataFormName, Json>>;
  /**
   * How Minecraft changed since {@link Target.previous} (ADR 0136 D2): the generated and curated
   * change set a target's migration and the host's upgrade report read. Absent on a target with
   * no previous target or whose change set is not written yet. Since 1.29.0.
   */
  changes?: TargetChangeSet;
}

/**
 * The names of the JSON forms in {@link TargetFacts.dataForms} (ADR 0132):
 *
 * - `entity_is_type`: the loot condition "this entity is of type `<entity_type>`", which fills
 *   `<entity_condition>` below;
 * - `player_killed_entity`: the advancement criterion that fires for a player who kills an
 *   entity matching `<entity_condition>` (the killer's reward runs as the killer);
 * - `consume_item_with_data`: the criterion that fires when a player finishes eating or drinking
 *   an `<item>` whose `minecraft:custom_data` matches `<custom_data>` (SNBT text);
 * - `player_head_of_this`: a loot entry giving the player head of the entity the loot is made
 *   for (`this`).
 *
 * Since 1.27.0.
 */
export type DataFormName =
  | 'entity_is_type'
  | 'player_killed_entity'
  | 'consume_item_with_data'
  | 'player_head_of_this';

/**
 * One Minecraft version, contributed by a `@msm/target-mc-<version>` package: the
 * {@link TargetFacts} plus the hooks hosts and exporters call. A `Target` is assignable to
 * `TargetFacts`, so a host passes it to any plugin-facing function as it is.
 *
 * @example
 * ```ts
 * const target: Target = {
 *   id: 'mc-<version>',
 *   mcVersion: '<version>',
 *   channel: 'release',
 *   // ...the remaining TargetFacts fields
 *   migrateFrom: (previous, project) => ({ changes: [], problems: [] }),
 * };
 * ```
 */
export interface Target extends TargetFacts {
  /**
   * The id of the target this one follows (ADR 0136 D2), the end its {@link TargetFacts.changes}
   * and {@link Target.migrateFrom} start from. Names a target the host knows; following
   * `previous` from any target never comes back to it. Absent on the oldest target. Since 1.29.0.
   */
  previous?: string;
  /**
   * The Java generator of the `java-project` exporter (ADR 0033). Optional: a target without
   * it or {@link Target.loadJavaProject} cannot eject a Java project, and the exporter reports
   * a problem. Since 0.8.0; since 1.24.0 a target may give {@link Target.loadJavaProject}
   * instead.
   */
  javaProject?: JavaProjectGenerator;
  /**
   * Loads the Java generator of the `java-project` exporter on first use, so a host can keep
   * the generator's code out of its start-up bundle (ADR 0126). Optional. A host that ejects
   * uses {@link Target.javaProject} when it is present and calls this otherwise; a target
   * without either cannot eject a Java project. A target that sets both resolves to the same
   * generator. The promise rejects when the generator cannot be loaded; the exporter reports
   * that as `export.java-generation-failed` and writes nothing. Since 1.24.0.
   *
   * @example
   * ```ts
   * loadJavaProject: () => import('./java-project/index').then((m) => m.javaProjectGenerator),
   * ```
   *
   * @returns The target's generator.
   */
  loadJavaProject?(): Promise<JavaProjectGenerator>;
  /**
   * Works out how to move a project written for `previous` to this target.
   *
   * Pure: returns the changes without mutating `project`; the host applies them as one undo
   * step (an `update` change replaces an element's data, a `remove` change deletes it). Omit
   * the hook when no migration is needed.
   *
   * @param previous - The target the project was written for.
   * @param project - The project to migrate; read only.
   * @returns What would change and what needs the user's attention.
   */
  migrateFrom?(previous: Target, project: Project): MigrationReport;
}
