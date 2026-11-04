# ADR 0009: Phase 1 validation gate: MSM structural validator; Spyglass checker deferred

## Context

DESIGN said every lowered JSON file is "validated with Spyglass" ([Pipeline](../DESIGN.md#9-targets-and-exporters)) and that Phase 1 adds the Spyglass `Service` ([ADR 0005](0005-vanilla-mcdoc-pinning-and-loading.md)). Investigation on 2026-11-04 against `@spyglassmc/json` 0.3.61 and `@spyglassmc/java-edition` 0.3.70 found:

- The JSON checker is `json.checker.index(mcdocType)(jsonNode, checkerCtx)`. It needs a full `core.CheckerContext`: a `MetaRegistry` with the JSON parsers and checkers registered, a `SymbolUtil` whose `mcdoc` and `mcdoc/dispatcher` categories hold every type's `typeDef`, plus `fs`, `logger`, `config` and roots.
- `#[since]` and `#[until]` are not built into `@spyglassmc/mcdoc`. They are registered by `registerMcdocAttributes(meta, commands, release)` in `@spyglassmc/java-edition`, and `je.initialize` unconditionally fetches the mcmeta version list and summaries and registers `@vanilla-mcdoc` as a downloaded dependency.
- A bare checker without java-edition therefore validates against the fields of every version; with java-edition it needs network access or a hand-built externals and cache layer.

That plumbing is one to two weeks against an internal API ([risk 2](../DESIGN.md#17-risks-and-mitigations)), for Phase 1 kinds whose schemas use only simple constructs.

## Decision

- Phase 1 validates with MSM's own structural validator in `@msm/schemas`: `validateJson(value, node, options) -> SchemaProblem[]`. It walks the version-gated `SchemaNode` model: struct, list, string, number, boolean, enum, literal, union, reference and dispatcher, plus the Phase 1 additions tuple, primitive arrays, template and concrete, and map `keyType`.
- It runs live in the editor (Problems panel) and as the export gate on every lowered JSON output file that declares `OutputFile.schema`.
- Registry-id checks (`#[id]`) use the vendored mcmeta registries plus project ids, and report warnings, not errors. Schema violations are errors.
- Problem codes use the `schema.*` prefix.
- Dispatcher keys are accepted with or without the `minecraft:` prefix. An enum discriminator value that has no dispatcher member (such as the item model type `empty`) is valid and adds no fields.
- No `@spyglassmc/*` runtime package is added in Phase 1.
- Phase 2 adds `@spyglassmc/core`, `@spyglassmc/mcdoc` and `@spyglassmc/json`, which mcfunction support needs regardless. If the Spyglass checker replaces our validator, it does so behind the same `validateJson` signature.

**Research note for Phase 2.** Populate a `SymbolUtil` from the vendored symbol export (the `mcdoc` and `mcdoc/dispatcher` categories, with `data.typeDef`), register `since`/`until` attribute handlers ourselves for the target's `mcVersion`, and never call `je.initialize`. This keeps validation offline and pinned to the target's `mcdocRef`.

## Consequences

- This narrows DESIGN's "validated with Spyglass" deliberately. DESIGN [Schema System](../DESIGN.md#6-schema-system-mcdoc), [Pipeline and Validation gate](../DESIGN.md#9-targets-and-exporters) and [Testing Strategy](../DESIGN.md#16-testing-strategy) now say "validated against the schema model derived from vanilla-mcdoc".
- Validation and forms share one model, so a construct the form generator understands is also validated, and an unsupported construct is visible in both.
- Our validator is less complete than Spyglass (no resource-location existence checks beyond registries and project ids, no string-format parsers such as NBT paths). The Raw JSON tab shows our diagnostics, not Spyglass's, in Phase 1.
- ADR 0005's statement that Phase 1 adds the Spyglass `Service` is superseded on that point; ADR 0005 otherwise stands.

## Status

Accepted (2026-11-04). Implemented in Phase 1 (`validateJson`, `createRegistryIndex`). Amended in Phase 2 (2026-11-04) by [ADR 0014](0014-mcfunction-diagnostics-with-spyglass.md): Spyglass is adopted for mcfunction only, `validateJson` remains the JSON gate, and the research note is applied only to JSON and NBT inside commands; adopting the Spyglass JSON checker is DESIGN [Open Question 13](../DESIGN.md#18-open-questions).
