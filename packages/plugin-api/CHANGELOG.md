# Changelog

All changes to the `@msm/plugin-api` surface. The package follows semver; every breaking change is a major bump with a migration note.

## 1.10.0 — 2026-11-14

Block types and families (ADR 0067 D2, D9). `API_VERSION` is `1.10.0`. Additive: plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `BlockFacts { setTypes: readonly string[]; woodTypes: readonly string[] }`: the block set type names a door, trapdoor, button or pressure plate takes (`set_type`) and the wood type names a fence gate takes (`wood_type`), in lower case. The names are MSM's; how each maps to a game constant is the runtime's concern.
- `TargetFacts.blocks?: BlockFacts`. Optional; a target without it skips the checks that need it.

### Migration from 1.9.0

None. A plugin that reads `blocks` should declare `^1.10.0` and treat an absent value as "no names to check against"; plugins written earlier ignore it.

## 1.9.0 — 2026-11-14

Potions and the data kinds sweep (ADRs 0063 D7 and 0064 D5). `API_VERSION` is `1.9.0`. Additive: plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `DataFolderKey` gains seventeen keys: `'wolf_variant'`, `'cat_variant'`, `'pig_variant'`, `'cow_variant'`, `'chicken_variant'`, `'frog_variant'`, `'zombie_nautilus_variant'`, `'wolf_sound_variant'`, `'cat_sound_variant'`, `'pig_sound_variant'`, `'cow_sound_variant'`, `'chicken_sound_variant'`, `'instrument'`, `'enchantment_provider'`, `'trial_spawner'`, `'timeline'` and `'world_clock'`, so `Target.folders.data` has seventeen more required entries. `ResourceFolderKey` is unchanged.
- `JavaProjectInput.potions?: DefinitionInput[]`: the project's `msm/<namespace>/potion/*.json` definitions, in a stable order, for generators that register potions. Optional; absent means none.

### Migration from 1.8.0

A target (or a test fixture building a `Target`) must add the seventeen keys to `folders.data`, because `Record<DataFolderKey, string>` is exhaustive; each maps to the folder of the same name. A generator that reads `potions` should declare `^1.9.0` and treat an absent value as empty; generators written earlier ignore it.

## 1.8.0 — 2026-11-13

Additions to vanilla content (ADR 0060). `API_VERSION` is `1.8.0`. Additive: plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `DataFolderKey` gains `'villager_trade'` and `'trade_set'`, so `Target.folders.data` has two more required entries.
- `JavaProjectInput.biomeAdditions?` and `lootAdditions?: DefinitionInput[]`: the project's `msm/<namespace>/biome_addition/*.json` and `loot_addition/*.json` definitions, in a stable order, for generators that emit the `BiomeModifications` calls and the loot table listener. Optional; absent means none.
- `ItemFacts.compostProviders?: Record<string, string>`: the compost chance as the editor shows it (`30%`) mapped to the vanilla `context_int_provider` id for the `minecraft:compostable` component. Optional.

### Migration from 1.7.0

A target (or a test fixture building a `Target`) must add `villager_trade` and `trade_set` to `folders.data`, because `Record<DataFolderKey, string>` is exhaustive; the vanilla names are `villager_trade` and `trade_set`. A generator that reads the new input fields should declare `^1.8.0` and treat absent values as empty; generators written earlier ignore them.

## 1.7.0 — 2026-11-13

Project sound events (ADR 0057). `API_VERSION` is `1.7.0`. Additive: plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `JavaProjectInput.soundEvents?: string[]`: the namespaced sound event keys of the project's `assets/<namespace>/sounds.json` files, sorted, without the `minecraft` namespace, for generators that register sound events. Optional; absent means none.

### Migration from 1.6.0

None. A generator that reads `soundEvents` should declare `^1.7.0` and treat an absent value as empty; generators written earlier ignore the field.

## 1.6.0 — 2026-11-13

Status effects and throwables (ADRs 0055 and 0056). `API_VERSION` is `1.6.0`. Additive: plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `JavaProjectInput.effects?: DefinitionInput[]`: the project's status effect definitions (`msm/<namespace>/effect/*.json`), in a stable order, for generators that emit mob effect classes. Optional; absent means none.
- `CreatorGroup` gains `'magic'`: the Creator lists the Status effect flow under "Magic".

### Migration from 1.5.0

None. A generator that reads `effects` should declare `^1.6.0` and treat an absent value as empty; generators written earlier ignore the field. A host older than 1.6.0 does not know the `magic` group: a plugin whose flow uses it should declare `^1.6.0`.

## 1.5.0 — 2026-11-07

Worlds in the Creator (ADR 0051). `API_VERSION` is `1.5.0`. Additive.

- `CreatorGroup` gains `'worlds'`: the Creator lists dimension flows under "Worlds".

### Migration from 1.4.0

None. A host older than 1.5.0 does not know the `worlds` group: a plugin whose flow uses it should declare `^1.5.0`.

## 1.4.0 — 2026-11-07

Sound files in starters (ADR 0049). `API_VERSION` is `1.4.0`. Additive: plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `ItemFacts.vanillaTools?` with `VanillaToolStats` (`attackDamage`, `attackSpeed`, `durability`, `miningSpeed?`, `enchantability`): each vanilla tool's tooltip numbers by tier and type, for the Creator's Stats.
- `ItemFacts.dataPackComponents?: readonly string[]`: the data components whose value names a data pack registry entry (ADR 0050), for the `msm:components` validator.
- `AudioStarterParameter` (`type: 'audio'`, `default: null`, `maxBytes?` (absent means 8 388 608 bytes)): a sound the user picks, passed to `build` as an Ogg Vorbis `data:` URL string (`data:audio/ogg;base64,...`) or `null`. The host checks the Ogg signature, the Vorbis identification header and the size before passing it. A member of the `StarterParameter` union; the built-in Music disc flow reads it.

### Migration from 1.3.0

None. A host older than 1.4.0 does not know `audio` parameters: plugins that declare one should declare `^1.4.0`.

## 1.3.0 — 2026-11-06

Modpacks (ADR 0046). `API_VERSION` is `1.3.0`. Additive: plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `ItemFacts.rangedPull?: RangedPullFacts` (`usingItem`, `bow` `{ useDuration, scale, thresholds }`, `crossbow` `{ pull, thresholds, chargeType, arrow, rocket }`): how vanilla's bow and crossbow item definitions show the pull, so custom ones animate the same way scaled by their draw speed.
- `FabricFacts.apiModrinth?: ModrinthFileFacts` (`versionId`, `fileName`, `url`, `sha1`, `sha512`, `size`): the target's Fabric API jar on Modrinth, which a modpack export lists as a download (ADR 0046 D7).

### Migration from 1.2.0

None.

## 1.2.0 — 2026-11-06

Gear, weapons and consumables (ADR 0044). `API_VERSION` is `1.2.0`. Additive: plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `ImageStarterParameter` (`type: 'image'`, `default: null`, `maxBytes?` (absent means 1 048 576 bytes), `maxSize?` (largest width and height in pixels)): a picture the user picks, passed to `build` as a PNG `data:` URL string or `null` in `BundleContext.values` (already a `Json`, so the `values` type is unchanged). The host checks the PNG signature, size and dimensions before passing it (ADR 0044 D7). It is a member of the `StarterParameter` union: the host's wizard renders it as a file picker (PNG only) with a thumbnail, and the built-in Painting flow reads it.

### Migration from 1.1.0

None. Hosts that switch over `StarterParameter['type']` must handle `'image'`; a starter declaring an image parameter must build a placeholder for `null`.

## 1.1.0 — 2026-11-06

Armour facts and the Creator (ADRs 0042, 0043). `API_VERSION` is `1.1.0`. Additive: every change is an optional field or a new type, so plugins declaring `^1.0.0` load unchanged and built-in plugins keep declaring `^1.0.0`.

- `TargetFacts.items?: ItemFacts` with `armorMaterials: readonly string[]`: the vanilla armour material names of the target (ADR 0042 D4). A target without it skips the checks that need it.
- `ProjectStarter.creator?: StarterCreatorInfo` (`group: CreatorGroup`, `blurb: string`; `CreatorGroup` is `'gear' | 'blocks' | 'food' | 'mobs' | 'scripts'`): lists the starter in the host's Creator as a guided flow (ADR 0043 D1).
- `SetStarterParameter` (`type: 'set'`, `choices`, `default: string[]`, `min?`): a parameter whose value is a subset of a fixed list, passed to `build` as a `string[]` in `BundleContext.values` (already a `Json`, so the `values` type is unchanged). It is a member of the `StarterParameter` union; the host's wizard renders it as a list of checkboxes.
- `ElementMeta.creator?: ElementCreatorMeta` (`flowId`, `setId`, `values`, `generatedId`): written by the host on elements the Creator made, kept through load and save by `@msm/core` (ADR 0043 D4).

### Migration from 1.0.0

None. Hosts that switch over `CreatorGroup` or over `StarterParameter['type']` must handle every member (`'set'` is new).

## 1.0.0 — 2026-11-06

The first stable API (ADR 0036). `API_VERSION` is `1.0.0`. Built-in plugins and `tools/new-plugin` declare `^1.0.0`. The package gains a publishable build (`tsup`: `dist/index.js` ES module, `dist/index.cjs`, `dist/index.d.ts`) and a tarball attached to every release.

### Compatibility policy

From 1.0.0 the package follows semver as plugin authors expect:

- 1.x releases only add optional fields and new contribution points. A plugin written for 1.0 keeps loading in every 1.x host.
- A change that removes or narrows anything (a member, a union, a parameter type, a return type a host relies on) is 2.0.0, with a migration note here.
- A deprecated member stays for at least one minor release and is marked `@deprecated` with its replacement.
- The host keeps the semver check: `registerPlugin` refuses a plugin whose `apiVersion` range excludes `API_VERSION` (`Plugin <id> requires plugin API <range>, but this build provides <version>`); for external plugins the manifest's `apiVersion` is checked before any plugin code runs (ADR 0035).

### Changes

- `MaybePromise<T>` (`T | Promise<T>`). `ElementKind.lower`, `ElementTemplate.data`, `ProjectStarter.build`, `ExampleProject.build` and `ProjectValidator.validate` return a `MaybePromise`, so a sandboxed plugin whose functions resolve through a worker can return a Promise. Built-ins keep returning values; hosts await every result. `@msm/core` adds `lowerProjectAsync`; the synchronous `lowerProject` reports a Promise result as `lowering.async-not-supported`.
- `TargetFacts`: the data fields of a target (`id`, `mcVersion`, `channel`, `java`, `packFormats`, `mcdocRef`, `mcmetaRef`, `folders`, `dataVersion`, `worldgen`, `fabric?`, `geckolib?`). `Target extends TargetFacts` adds the hooks `javaProject?` and `migrateFrom?`. Plugin-facing functions receive a `TargetFacts`: `ElementKind.lower(element, target)`, `ValidationInput.target`, `TemplateContext.target`, `BundleContext.target`. `ExporterInput.target` stays a full `Target`.
- `TargetFacts.channel: TargetChannel` (`'release' | 'snapshot'`, required): snapshot targets are shown with a badge and are never the default for new projects.
- `TemplateContext.target` and `BundleContext.target` (required): templates, starters and examples read target facts (for example `target.worldgen` or `target.geckolib`) instead of hard-coding a version.
- `supports?(target: TargetFacts): boolean` on `ElementTemplate`, `ProjectStarter` and `ExampleProject`: the host hides an entry that returns `false` for the project's target; an entry without it must work on every target.
- `ProjectStarter.parameters?: StarterParameter[]` and `BundleContext.values: Readonly<Record<string, Json>>` (required; every declared parameter present, defaults filled in by the host; empty for starters without parameters and for examples). `StarterParameter` is a union of `StringStarterParameter` (`pattern?`, `maxLength?`), `NumberStarterParameter` (`min?`, `max?`, `step?`), `BooleanStarterParameter`, `ColourStarterParameter` (`#rrggbb`) and `ChoiceStarterParameter` (`choices`), each with `id`, `label`, `description?`, `default` and `group?` (the wizard step, ADR 0040). `build` must be pure in `values` as it is in `namespace`.
- `ElementKind.defaultDataFor?: (target: TargetFacts) => MaybePromise<Json>` (optional, ADR 0036 D8): per-target starting data for kinds whose valid data differs between targets. When present the host uses it instead of `defaultData` for new elements, for `TemplateContext.kindDefault` and for starters.
- `WorldgenFacts.noiseSettingsDefaultBlock?: boolean` (optional, ADR 0036 D8): whether noise settings have the required `default_block` field; absent means `true`. The first target fact a `defaultDataFor` reads, so per-target data comes from facts and never from a version literal.
- `MigrationChange.data?: Json` (the element's new data; absent means informational) and `MigrationChange.kind?: 'update' | 'remove'`. `Target.migrateFrom` stays pure: it returns the report and never mutates the project; the host applies the changes as one undo step.
- Packaging: `exports` keeps pointing at `src/` inside the workspace (TypeScript project references and Vitest resolve the source); `publishConfig` points the packed package at `dist/` (`exports` with `import` and `require` conditions, `main`, `module`, `types`), with `files`, `repository`, `homepage` and `publishConfig.access: public`. `pnpm --filter @msm/plugin-api build` writes `dist/`; `pnpm --filter @msm/plugin-api pack:tarball` writes `dist/msm-plugin-api-<version>.tgz`.

### Migration from 0.8.0

- Declare `^1.0.0`. Plugins declaring `^0.8.0` no longer load, because `1.0.0` is outside a `^0.8.0` range.
- Code that calls `lower`, `data`, `build` or `validate` must await the result (or, where only built-ins can reach the call, handle a Promise explicitly). Implementations need no change: returning a value is still valid.
- A target must set `channel`.
- A function typed against `Target` that only reads data can take a `TargetFacts`; a `Target` is assignable to `TargetFacts`, so callers need no change.
- Hosts that build a `TemplateContext` or a `BundleContext` (the app, library tests, the `examples/` mirror) must pass `target`, and bundles must pass `values` (`{}` for starters without parameters and for examples).

## 0.8.0 — 2026-11-05

Gradle fact, Java project generator and the `typescript` output language (ADR 0034). `API_VERSION` is `0.8.0`. Built-in plugins and `tools/new-plugin` declare `^0.8.0`.

- `FabricFacts.gradle: string` (required): the Gradle version the ejected Java project's wrapper uses.
- `Target.javaProject?: JavaProjectGenerator` with `JavaProjectInput` (`modId`, `javaPackage`, `modClassName`, `blocks`, `items`, `entities`, `geckolib`), `DefinitionInput` (`id`, `path`, `definition`) and `GeneratedFile` (`path`, `contents`): the version-specific Java generator the `java-project` exporter calls. `generate` is pure and deterministic and may throw an `Error` naming the definition, which the exporter reports as `export.java-generation-failed`.
- `OutputFile.language` documents the value `typescript` (script sources the host checks and the content jar exporter transpiles) alongside `mcfunction`. No type change.

### Migration from 0.7.0

- Plugins only need the range change: declare `^0.8.0`. Plugins declaring `^0.7.0` no longer load, because `0.8.0` is outside a `^0.7.0` range (0.x minors are breaking under semver).
- A target that sets `fabric` must add `gradle`. `javaProject` is optional.

## 0.7.0 — 2026-11-05

GeckoLib target facts (ADR 0030). `API_VERSION` is `0.7.0`. Built-in plugins and `tools/new-plugin` declare `^0.7.0`.

- `GeckolibFacts` (`version`, `modId`, `dependency`, `fileName`, `url`, `sha512`, optional `modrinthVersionId`) and `Target.geckolib?: GeckolibFacts`, replacing the placeholder `geckolib?: string`. The content jar exporter writes `modId` and `dependency` into `fabric.mod.json` `depends` and nests the jar as `META-INF/jars/<fileName>` when a project has entities; the host downloads it from `url` and checks `sha512`. Still optional on the type: a target may lack a GeckoLib build.

### Migration from 0.6.0

- Plugins only need the range change: declare `^0.7.0`. Plugins declaring `^0.6.0` no longer load, because `0.7.0` is outside a `^0.6.0` range (0.x minors are breaking under semver).
- Code that reads `Target.geckolib` gets a `GeckolibFacts` object instead of a version string; read `target.geckolib?.version` for the old value.
- A target that sets `geckolib` must supply the whole object.

## 0.6.0 — 2026-11-05

Mergeable outputs, exporter options and Fabric target facts (ADR 0027). `API_VERSION` is `0.6.0`. Built-in plugins declare `^0.6.0`.

- `OutputFile.merge?: OutputMergeMode` (`'tag' | 'object'`): outputs at the same layer and path merge instead of conflicting when every one of them declares the same mode and the same `schema`. `tag` merges tag files (union of `values` in first-seen order; a string and an `{ id }` entry with the same id count once; `replace: true` when any input says so). `object` merges flat JSON objects such as language files; the same key with different values is a `lowering.merge-conflict` error naming both elements. A file without `merge` meeting any other file at its path, mixed modes and differing schemas stay conflicts. The host merges (`@msm/core` `mergeOutputFiles`), so exporters receive merged files. The `minecraft:lang` and `minecraft:tag/<registry>` kinds of the built-in plugins declare `merge`.
- `ExporterOption` (`{ id, label, description?, type: 'boolean', default: boolean }`) and `Exporter.options?: ExporterOption[]`: options the export dialog renders. Only booleans in 0.6.0.
- `ExporterInput.options: Record<string, Json>`: the value of every declared option, with defaults filled in by the host; empty when the exporter declares none.
- `FabricFacts` and `Target.fabric?: FabricFacts`: `loader`, `api`, `loom` and the new `minecraftDependency` (the `minecraft` range written into `fabric.mod.json`). Still optional on the type.

### Migration from 0.5.0

- Plugins only need the range change: declare `^0.6.0`. Plugins declaring `^0.5.0` no longer load, because `0.6.0` is outside a `^0.5.0` range (0.x minors are breaking under semver).
- Code that builds an `ExporterInput` itself (tests, hosts) must pass `options` (`{}` when the exporter declares none).
- A target that sets `fabric` must add `minecraftDependency`.

## 0.5.0 — 2026-11-04

Structures and worldgen surface (ADR 0022). `API_VERSION` is `0.5.0`. Built-in plugins declare `^0.5.0`.

- `ElementKind.registry?: string`: the registry the ids of a kind's elements belong to (without `minecraft:`), for example `structure` for structure templates. Defaults to the kind id without `minecraft:`; set it only when the two differ.
- `ProjectValidator`, `ValidationInput` and `ValidationRegistry`: cross-element checks a plugin runs over the whole project (`id`, `kinds`, pure `validate(input)` returning `Problem[]`). The input holds every element, the target and a registry lookup (`has`, `ids`) over vanilla and project ids; no Node or DOM types.
- `PluginContributions.validators?: ProjectValidator[]`: host-run; their problems join the project's problems, so errors block export.
- `DataFolderKey` gains `structure` (structure template `.nbt` files), `dimension` and `worldgen` (the parent of the world generation registry folders, to which worldgen kinds append `/<registry>`, as tag kinds do with `tags`).
- `Target.dataVersion: number`: the game's data version, written as `DataVersion` into structure and schematic files.
- `Target.worldgen: WorldgenFacts` with `featureSteps`: the biome feature decoration step names in game order.
- Later within 0.5.0 (additive, no version change): optional `WorldgenFacts.biomeAttributes` (`BiomeAttributeFacts`: `colours`, `skyColour`, `naturalMobSpawns`), the biome environment attribute ids the host's Biome Studio and climate map read. Targets without it get no attribute-based colours or spawn lists.

### Migration from 0.4.0

- `Target.dataVersion` and `Target.worldgen` are required, and `Target.folders.data` must supply the three new keys. Every target must add them; MSM's own targets do. There are no third-party targets yet.
- `ElementKind.registry` and `PluginContributions.validators` are optional; existing plugins need no change for them.
- Plugins declaring `^0.4.0` no longer load, because `0.5.0` is outside a `^0.4.0` range (0.x minors are breaking under semver); declare `^0.5.0`.

## 0.4.0 — 2026-11-04

Templates and samples library surface (ADR 0020). `API_VERSION` is `0.4.0`. Built-in plugins declare `^0.4.0`.

- `ElementTemplate` and `TemplateContext` (`src/library.ts`): an entry of the host's "New element" picker (`id`, `kind`, `title`, `description`, `category`, optional `prefix`, `defaultName`, `fixedName`, `defaultNamespace`) whose pure `data(context)` builds the starting data from the new element's id, namespace and path, the project namespace, every project namespace and the kind's `defaultData`.
- `ProjectStarter`, `ExampleProject`, `ContentBundle` (`ContentBundleElement`, `ContentBundleAsset`) and `BundleContext`: starters for the host's "New project" dialog and entries of its Examples gallery. Each builds a self-contained bundle of elements (with optional `notes` and `tags`, which become `meta.notes` and `meta.tags`) and generated assets (`Uint8Array` bytes under `assets/<namespace>/`) for a namespace. `requiresKinds` lets the host hide entries whose kinds are not registered.
- `PluginContributions.elementTemplates`, `projectStarters` and `examples`: optional, host-interpreted. A template's `kind` must be one of the contributing plugin's own kinds; starters and examples may use any registered kind.

### Migration from 0.3.0

- No interface changed incompatibly; the new fields are optional.
- Plugins declaring `^0.3.0` no longer load, because `0.4.0` is outside a `^0.3.0` range (0.x minors are breaking under semver); declare `^0.4.0`.

## 0.3.0 — 2026-11-04

Phase 2 (Data Pack Studio) surface. `API_VERSION` is `0.3.0`. Built-in plugins declare `^0.3.0`.

- `OutputFile.language?: string`: a text language id the export validation gate may check, such as `mcfunction`; omitted for JSON and binary files. Text files carry their contents as UTF-8 bytes.
- `Problem.range?: { start: number; end: number }`: UTF-16 code unit offsets (start inclusive, end exclusive) within the string at `path`, or within `file` for problems in text output files.
- `DataFolderKey` and `Target.folders.data`: vanilla folder names under `data/<namespace>/` for `recipe`, `loot_table`, `advancement`, `predicate`, `item_modifier`, `function`, `tags` (the parent of the per-registry tag folders, to which tag kinds append `/<registry>`), `enchantment`, `damage_type`, `dimension_type`, `chat_type`, `jukebox_song`, `banner_pattern`, `painting_variant`, `trim_material`, `trim_pattern` and `dialog`. Every value is a single path segment.

### Migration from 0.2.0

- `Target.folders.data` is required. Every target must supply all seventeen `DataFolderKey` entries alongside `folders.resource`.
- Plugins declaring `^0.2.0` no longer load, because `0.3.0` is outside a `^0.2.0` range; declare `^0.3.0`.
- `OutputFile.language` and `Problem.range` are optional; existing plugins and hosts need no change for them.

## 0.2.0 — 2026-11-04

Phase 1 (Resource Pack Studio) surface. `API_VERSION` is `0.2.0`. Built-in plugins declare `^0.2.0`.

- `OutputFile.schema?: string`: the mcdoc type path (for example `::java::assets::model::Model`) or `resource:<category>` dispatcher reference the export validation gate checks the file against; omitted for binary files.
- `ElementKind.defaultData?: D`: data for newly created elements.
- `ElementKind.hiddenPaths?: string[]`: RFC 6901 pointers into `data` that the schema-driven form hides because lowering owns them.
- `ElementKind.previewKind?: string`: a host-interpreted preview hint (`model`, `block_definition`, `item_definition`).
- `Problem.file?: string`: a project-relative or export-relative file path, for load and export problems.
- `ExporterInput.meta: { msmVersion: string; plugins: string[] }`: facts for export metadata such as `msm.export.json`.
- `ResourceFolderKey` and `Target.folders.resource`: vanilla folder names under `assets/<namespace>/` (`sounds_file` is a file name). Data pack folders arrive in Phase 2.
- `isProjectRelativePath(path)` and `assertProjectRelativePath(path)`: shared project-relative POSIX path validation (empty paths, a leading `/`, backslashes and empty, `.` or `..` segments are rejected).

### Migration from 0.1.0

- `Target.folders` is required. Every target must supply `folders.resource` with all eight `ResourceFolderKey` entries.
- `ExporterInput.meta` is required. Hosts that call exporters must pass it; exporters may ignore it.
- `assertProjectRelativePath` now also lives in `@msm/plugin-api`. `@msm/core` keeps its copy for now and will re-export this one; new code should import it from `@msm/plugin-api`.
- Plugins declaring `^0.1.0` no longer load, because `0.2.0` is outside a `^0.1.0` range; declare `^0.2.0`.

## 0.1.0 — 2026-11-04

Initial surface. `API_VERSION` is `0.1.0`.

- JSON: `Json`, `JsonObject`, `ResourceLocation`.
- IR types (behaviour lives in `@msm/core`, ADR 0008): `ElementMeta`, `Element`, `Asset`, `Namespace`, `Project`.
- Output: `OutputLayer`, `OutputFile`, `OutputSink`.
- Problems: `ProblemSeverity`, `Problem`, `ProblemReporter`.
- Targets: `PackFormat`, `MigrationChange`, `MigrationReport`, `Target` (`fabric` and `geckolib` optional until Phases 4 and 5).
- Contributions: `ElementKind`, `EditorContribution`, `ExporterInput`, `Exporter`, `ImportedFile`, `ImportResult`, `Importer`, `Command`, `PluginContributions`.
- Plugins: `Plugin`, `PluginDefinitionError`, `definePlugin` (validates the id and a non-empty `apiVersion`, then shallow-freezes the plugin; semver ranges are evaluated by `@msm/core`).
- `API_VERSION`.
