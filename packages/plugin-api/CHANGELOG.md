# Changelog

All changes to the `@msm/plugin-api` surface. The package follows semver; every breaking change is a major bump with a migration note.

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
