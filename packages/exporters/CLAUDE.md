# packages/exporters — Exporters

Phase 1 code complete: `runExport` (collect, lower, merge assets, validate, write), deterministic fflate zips, memory/folder/zip sinks and the `vanilla-packs` exporter. `fabric-content-jar` and `java-project` follow in Phases 4 and 6.

## Purpose

`@msm/exporters` turns lowered output into files a player or developer can use. It is the last step of the pipeline: collect elements → lower against target → validate → write.

## Contents

| Exporter | Phase | Output |
|---|---|---|
| `vanilla-packs/` | 1 | Resource pack zip, data pack zip, or combined folder |
| `fabric-content-jar/` | 4 | Jar with `assets/`, `data/`, `msm/`, `fabric.mod.json`; nested `msm_runtime` jar; optional nested GeckoLib |
| `java-project/` | 6 | Eject: Gradle project with generated Java, no dependency on `msm_runtime` |

Shared modules in `src/`: `run-export.ts`, `zip.ts`, `sinks.ts`, `assets.ts` (asset allow-list: `textures/`, `sounds/`, `font/`, `texts/`), `manifest.ts`, `problem-codes.ts` (`export.*`).

## Conventions

- Exporters consume `OutputFile[]` from the lowering pipeline, never elements directly. Source may not import `@msm/targets`, `@msm/target-*` or any `@msm/plugin-*` but `@msm/plugin-api` (Biome); tests may use `@msm/targets` and `@msm/plugin-resourcepack` (ADR 0013).
- Output is deterministic (stable file ordering, fixed zip timestamps) so builds are reproducible and diffable.
- Every exporter has a golden test on a sample project (`vanilla-packs`: SHA-256 of the `fixtures/sample-resourcepack` zip).
- The schema validation gate (`validateJson`, ADR 0009) runs before anything is written; a failure blocks the export.
- Zips: entries sorted by path, level 6, `os: 0`, timestamp `new Date(2000, 0, 1)` (local-time constructor, ADR 0013).
- The runtime jar is nested by default; "separate runtime" is an option for modpack makers.
- The `java-project` eject is one-way and includes a README in the generated project.

## Do / Don't

- Do write a manifest (`msm.export.json`) into each output listing target, version and plugins.
- Do take version facts (pack formats, Fabric versions) from the target.
- Don't embed Mojang assets.
- Don't know about editors or UI.
- Append an entry to `docs/DEVLOG.md` each session.

## Commands

- `pnpm --filter @msm/exporters test` (includes the sample-project zip SHA-256 golden)
- `pnpm typecheck` and `pnpm lint` from the repository root

## Read next

- [DESIGN §9 Targets and Exporters](../../docs/DESIGN.md#9-targets-and-exporters)
- [DESIGN §10 Engine Mod (Runtime)](../../docs/DESIGN.md#10-engine-mod-runtime)
- [DESIGN §12 Scripting and Escape Hatches](../../docs/DESIGN.md#12-scripting-and-escape-hatches)
- [ROADMAP, Phases 1, 4 and 6](../../docs/ROADMAP.md)
