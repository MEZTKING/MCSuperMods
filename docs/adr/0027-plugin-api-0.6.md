# ADR 0027: Plugin API 0.6.0: mergeable outputs, exporter options and Fabric target facts

## Context

Two outputs that share a layer and path are a `lowering.conflict` (core) or `export.conflict` (exporters) error. Phase 4 lowering of `msm:block` and `msm:item` needs files that many elements contribute to: language files (`assets/<ns>/lang/en_us.json`) for display names, and block tags (`data/minecraft/tags/block/mineable/pickaxe.json`, `needs_iron_tool.json`) for tool rules ([ADR 0025](0025-msm-definition-format-v1.md)). A project may also hold its own lang and tag elements for the same paths. The content-jar exporter needs a user option (separate runtime, [ADR 0026](0026-fabric-content-jar.md)), and `ExporterInput` has no options. `Target.fabric` has been a placeholder since Phase 0.

## Decision

**D1. `OutputFile.merge`.** An optional `merge?: 'tag' | 'object'` on `OutputFile`. Outputs with the same layer and path merge instead of conflicting when every one of them declares the same `merge`:

- `tag`: contents are tag files `{ replace?, values }`; the merged file has the union of `values` in first-seen order (duplicates dropped; a value written as a string and as `{ id }` counts once) and `replace: true` if any input says so;
- `object`: contents are flat JSON objects (language files); keys are merged; the same key with different values is a `lowering.merge-conflict` error naming both elements.

A file without `merge` that meets any other file at its path is still a conflict. Merged files keep `schema` (all inputs must agree; otherwise a conflict). The lang and tag kinds of the existing plugins declare `merge` on their outputs, so a user's own `en_us` element merges with generated display names. Core's lowering driver and `runExport` share one merge function in `@msm/core` (exporters already receive merged files).

**D2. Exporter options.** `Exporter.options?: ExporterOption[]`, where `ExporterOption` is `{ id, label, description?, type: 'boolean', default: boolean }` (only booleans in 0.6.0), and `ExporterInput.options: Record<string, Json>` holding the value of every declared option (defaults filled in by the host). The export dialog renders them.

**D3. `Target.fabric`.** Becomes `{ loader: string; api: string; loom: string; minecraftDependency: string }` (still optional on the type, since a future non-Fabric target may lack it). The 26.3 target sets loader 0.20.1, Fabric API 0.165.2+26.3, Loom 1.19.3 (verified 2026-11-05 against maven.fabricmc.net and the FabricMC example mod's 26.3 branch) and `minecraftDependency` `~26.3` (verify at implementation).

**D4. Version.** `API_VERSION` 0.6.0. All additions are optional, but under 0.x a minor bump is breaking for caret ranges, so every built-in plugin moves to `apiVersion: '^0.6.0'` and `tools/new-plugin` scaffolds that; `CHANGELOG.md` notes that 0.5 plugins only need the range change.

## Consequences

- Several elements may contribute to one tag or language file; conflicts are reported per key, not per file.
- Exporters with options work in the dialog and in tests the same way.
- Plugins declaring `^0.5.0` stop loading; there are no third-party plugins yet.

## Status

Accepted (2026-11-05). A content jar with `"minecraft": "~26.3"` loads on a 26.3 headless Fabric server (B99), so the D3 range works for 26.3; whether `~` also admits later 26.3.x releases as intended is to be confirmed when one exists.
