# ADR 0005: Pinning and loading vanilla-mcdoc

## Context

`@msm/schemas` exposes vanilla file formats from `SpyglassMC/vanilla-mcdoc` ([Schema System](../DESIGN.md#6-schema-system-mcdoc)). DESIGN originally assumed a release tag per game version and an in-process Spyglass `Service`. Checking upstream on 2026-11-04 showed:

- vanilla-mcdoc has no tags, only branches (`main`, `generated`, snapshot branches). One tree describes many game versions through `#[since="..."]` and `#[until="..."]` attributes.
- Upstream publishes a symbol export (the `generated` branch's `symbols.json`, produced by `@spyglassmc/mcdoc-cli`) with shape `{ ref, mcdoc, "mcdoc/dispatcher" }`.
- Running a Spyglass `Service` in the renderer adds `@spyglassmc/core` and `java-edition` with file-system and worker set-up that Phase 0 does not need.

## Decision

- **Pins are commit shas.** Each target declares `mcdocRef`, a vanilla-mcdoc commit sha. The 26.3 target pins `0ca060a4f1631f9d5eb7198cfe94c7b77a773d32`.
- **Phase 0 loads the symbol export.** `tools/sync-mcdoc` checks out vanilla-mcdoc at the pinned sha and runs `@spyglassmc/mcdoc-cli` 0.1.63 `export` to produce `symbols.json`, with keys sorted.
- **Vendored in the target.** The export, the upstream `LICENSE` (MIT, SpyglassMC) and `SOURCE.json` live under `packages/targets/mc-<version>/vendor/vanilla-mcdoc/`. They are regenerated only by the sync script, never edited by hand.
- **Injected, not read.** `@msm/schemas` receives the parsed JSON (`parseVanillaMcdocSymbols`) and builds an index with `createSchemaIndex(symbols, { mcVersion })`, which filters every type, field, union member and dispatcher entry by `since`/`until` against the target's `mcVersion`. `@msm/schemas` never reads files or names a version.
- **Spyglass `Service` deferred to Phase 1.** Phase 1 adds `@spyglassmc/core`, `@spyglassmc/mcdoc` and `@spyglassmc/java-edition` for validation and injects the same type definitions into the Spyglass symbol table.

**mcdoc-cli workaround.** In mcdoc-cli 0.1.63 build mode, `project.ready()` in `@spyglassmc/core` 0.4.57 lists no root files without a file watcher, so the export comes out empty. `tools/sync-mcdoc` writes a `spyglass.json` into the temporary checkout that adds the checkout itself as an `env.dependencies` entry, which makes the files load. The result is byte-identical to the upstream `generated` branch after key sorting. Upstream's own workflow uses mcdoc-cli 0.1.48.

## Consequences

- A target pins schemas exactly and reproducibly; refreshing is one script run plus a review of the diff.
- Because one tree spans many versions, version gating in `@msm/schemas` is mandatory, and its tests cover both sides of a `since`/`until` boundary.
- The sync script depends on an upstream workaround; if a later mcdoc-cli release fixes build mode, the workaround is removed and this ADR's note is updated.
- Phase 0 has no validation of JSON against schemas; that arrives with the Spyglass `Service` in Phase 1.
- Generic mcdoc constructs (`template`, `concrete`) normalise to `unsupported` nodes in Phase 0 and are modelled in Phase 1.

## Status

Accepted (2026-11-04). Amended by [ADR 0009](0009-phase1-validation-gate.md) (2026-11-04): the Spyglass `Service` is deferred to Phase 2; Phase 1 validates with MSM's own validator over `SchemaNode`. Generic constructs are modelled in Phase 1 as planned.
