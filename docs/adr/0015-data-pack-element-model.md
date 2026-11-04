# ADR 0015: Data pack element model and export

## Context

Phase 2 ([ROADMAP](../ROADMAP.md)) brings data pack files into the editor: recipes, loot tables, advancements, predicates, item modifiers, functions and tags, plus data pack and combined export and installation into a world. DESIGN describes vanilla kinds as 1:1 file mappings ([Core Project Model](../DESIGN.md#4-core-project-model-ir)) and lists a "combined folder" export ([Targets and Exporters](../DESIGN.md#9-targets-and-exporters)), but fixes neither how a function's text is stored in a JSON-only project nor how tags, `pack.mcmeta` and the combined export are shaped.

Schema coverage of the Phase 2 kinds in the vendored export, counted through `createSchemaIndex` on 2026-11-04 (reachable nodes / unsupported): `resource:recipe` 2,487 / 3; `loot_table` 1,257 / 1; `advancement` 3,233 / 4; `predicate` 1,269 / 1; `item_modifier` 2,674 / 1; `enchantment` 3,004 / 13; `dimension_type` 44 / 10; `dialog` 3. Every unsupported node is an mcdoc `indexed` type or an uninstantiated `template`. Tags are `::java::data::tag::Tag<E>`, a template over the entry id type, with no `minecraft:resource` dispatcher member, so a tag schema must be instantiated per registry.

## Decision

**One plugin, 1:1 kinds.** `@msm/plugin-datapack` (plugin id `msm.datapack`) contributes vanilla kinds that each map to one `data/<ns>/<folder>/<path>.json`, lowered by one helper, `lowerJsonData(element, target, key, schema, subfolder?)`, which reads the folder from the target's `folders.data` ([ADR 0017](0017-phase2-toolchain.md)). Kinds:

- Tier A, with templates: `minecraft:recipe` (`resource:recipe`), `minecraft:loot_table`, `minecraft:advancement`, `minecraft:predicate`, `minecraft:item_modifier`, `minecraft:function`, and tag kinds `minecraft:tag/<registry>` for `block`, `item`, `entity_type`, `fluid`, `game_event`, `function`, `damage_type` and `enchantment`.
- Tier B, schema form only: `enchantment`, `damage_type`, `dimension_type`, `chat_type`, `jukebox_song`, `banner_pattern`, `painting_variant`, `trim_material`, `trim_pattern`, `dialog`, each as `minecraft:<name>` with schema `resource:<name>`.

**Functions are `{ "lines": string[] }`.** A `minecraft:function` element stores one array entry per source line, so the project stays JSON only ([Serialisation rules](../DESIGN.md#5-project-file-format)) and git diffs stay line-based. It is saved as `content/<ns>/function/<path>.json` and lowers to `data/<ns>/<function folder>/<path>.mcfunction` as UTF-8 bytes, lines joined with `\n` plus a trailing newline, with `language: 'mcfunction'` and no `schema`. Its kind schema is the MSM built-in ref `msm:function`, supplied by `@msm/schemas` as a TypeScript `SchemaNode` extension (a struct with a required `lines: string[]`); compiled MSM mcdoc replaces it behind the same ref in Phase 4.

**Tags are per-registry kinds.** Each tag kind uses schema ref `tag:<registry>`, which `@msm/schemas` resolves by instantiating `::java::data::tag::Tag` with the entry type bound to an id string of that registry that also accepts `#` tag references. The kind-folder and output folder are `tags/<registry>`. The mcdoc `indexed` construct is modelled as a dispatcher, so the tier-A kinds and the eight tag refs have no unsupported nodes.

**Dual-layer `pack.mcmeta`.** The existing `minecraft:pack_mcmeta` element lowers to two files: `pack.mcmeta` in the `resourcepack` layer with `packFormats.resource`, and `pack.mcmeta` in the `datapack` layer with `packFormats.data`. Exporters already skip layers they do not package. No new kind; one description serves both packs.

**Exporters.** `vanilla-packs` becomes a factory, `createVanillaPacksExporter(pack: 'resource' | 'data')`, with two constants: `resourcePackExporter` (id `vanilla-packs`, layers `['resourcepack']`, unchanged behaviour; `vanillaPacksExporter` remains an alias) and `dataPackExporter` (id `vanilla-packs-data`, layers `['datapack']`, synthesising `pack.mcmeta` from `packFormats.data` when absent). Zip determinism and the per-pack `msm.export.json` are unchanged ([ADR 0013](0013-phase1-toolchain-and-packaging.md)).

**Combined export is two zips in a folder the user picks** (main-session decision, 2026-11-04): `<slug>-<target id>-resources.zip` and `<slug>-<target id>-data.zip`. It is not a third exporter: the host runs both exporters into two sinks, because each exporter packages one layer set and the manifest is per pack. This is DESIGN's "combined folder". A single zip holding both packs is not built; if the user asks for it, it is one added delivery option in the export code and the Export menu.

**Install to a world.** Main lists worlds as `saves/<dir>/` folders that contain `level.dat` and writes `saves/<world>/datapacks/<file>.zip`; the renderer shows a world picker. The world folder must be one safe path segment that exists under `saves/`. Reading world names from `level.dat` NBT is left to Phase 3.

**Project registry ids.** Elements of the kinds above contribute ids to the registries `function`, `recipe`, `loot_table`, `advancement`, `predicate`, `item_modifier` and `tag/<registry>` (stored without `#`), alongside the existing `model`, `texture` and `sound`. They feed the registry index, autocomplete and the Spyglass project declarations ([ADR 0014](0014-mcfunction-diagnostics-with-spyglass.md)). `RegistryIndex.has(registry, '#x')` checks `x` against `tag/<registry>` when the index knows it and otherwise accepts it.

**Studios.** Recipe Studio (crafting grid, shapeless list, cooking family), a Tag editor and a Function editor (Monaco with Spyglass diagnostics) are curated views. Loot tables and advancements ship as the schema form plus templates in v0.2 (main-session decision, 2026-11-04); a bespoke Loot Table Studio is deferred to a later phase. Every other data kind uses the schema form.

## Consequences

- Adding a vanilla data kind needs only a kind definition and a `DataFolderKey`, no UI code.
- Function text inside a JSON array is awkward to read in raw form; the Function editor is the normal view, and the Raw JSON tab still works.
- Tag kinds multiply the kind list (eight tag kinds); the sidebar groups them under one heading.
- The resource pack golden gains the data-layer `pack.mcmeta` in lowering output, while the resource zip stays byte-identical because the resource exporter skips it.
- Writing into a world folder widens main's write access on the game directory to `saves/<world>/datapacks/`, which DESIGN [section 13](../DESIGN.md#13-interop-blockbench-nbt-minecraft-installation) already allows.
- Uninstantiated templates reached from tier-B kinds (`enchantment`, `dimension_type`) may still fall back to the inline JSON editor.

## Status

Accepted (2026-11-04).
