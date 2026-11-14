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
  | 'world_clock';

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
   * Block facts: the set type and wood type names block families take. Optional: a target
   * without them skips the checks that need them. Since 1.10.0 (ADR 0067 D9).
   */
  blocks?: BlockFacts;
}

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
   * The Java generator of the `java-project` exporter (ADR 0033). Optional: a target without
   * it cannot eject a Java project, and the exporter reports a problem. Since 0.8.0.
   */
  javaProject?: JavaProjectGenerator;
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
