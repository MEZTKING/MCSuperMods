# Changelog

All changes to the `@msm/plugin-api` surface. The package follows semver; every breaking change is a major bump with a migration note.

## 0.5.0 — 2026-11-04

Structures and worldgen surface (ADR 0022). `API_VERSION` is `0.5.0`. Built-in plugins declare `^0.5.0`.

- `ElementKind.registry?: string`: the registry the ids of a kind's elements belong to (without `minecraft:`), for example `structure` for structure templates. Defaults to the kind id without `minecraft:`; set it only when the two differ.
- `ProjectValidator`, `ValidationInput` and `ValidationRegistry`: cross-element checks a plugin runs over the whole project (`id`, `kinds`, pure `validate(input)` returning `Problem[]`). The input holds every element, the target and a registry lookup (`has`, `ids`) over vanilla and project ids; no Node or DOM types.
- `PluginContributions.validators?: ProjectValidator[]`: host-run; their problems join the project's problems, so errors block export.
- `DataFolderKey` gains `structure` (structure template `.nbt` files), `dimension` and `worldgen` (the parent of the world generation registry folders, to which worldgen kinds append `/<registry>`, as tag kinds do with `tags`).
- `Target.dataVersion: number`: the game's data version, written as `DataVersion` into structure and schematic files.
- `Target.worldgen: WorldgenFacts` with `featureSteps`: the biome feature decoration step names in game order.

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
