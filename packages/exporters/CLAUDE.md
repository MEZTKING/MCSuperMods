# packages/exporters — Exporters

No code yet; this directory is planned for Phases 1, 4 and 6. This file describes intent and conventions.

## Purpose

`@msm/exporters` turns lowered output into files a player or developer can use. It is the last step of the pipeline: collect elements → lower against target → validate → write.

## Contents (planned)

| Exporter | Phase | Output |
|---|---|---|
| `vanilla-packs/` | 1 | Resource pack zip, data pack zip, or combined folder |
| `fabric-content-jar/` | 4 | Jar with `assets/`, `data/`, `msm/`, `fabric.mod.json`; nested `msm_runtime` jar; optional nested GeckoLib |
| `java-project/` | 6 | Eject: Gradle project with generated Java, no dependency on `msm_runtime` |

## Conventions

- Exporters consume `OutputFile[]` from the lowering pipeline, never elements directly.
- Output is deterministic (stable file ordering, fixed zip timestamps) so builds are reproducible and diffable.
- Every exporter has a golden test on the kitchen-sink sample project.
- The Spyglass validation gate runs before anything is written; a failure blocks the export.
- The runtime jar is nested by default; "separate runtime" is an option for modpack makers.
- The `java-project` eject is one-way and includes a README in the generated project.

## Do / Don't

- Do write a manifest (`msm.export.json`) into each output listing target, version and plugins.
- Do take version facts (pack formats, Fabric versions) from the target.
- Don't embed Mojang assets.
- Don't know about editors or UI.
- Append an entry to `docs/DEVLOG.md` each session.

## Commands (planned)

Not yet wired (Phase 0).

- `pnpm --filter @msm/exporters test`
- `pnpm --filter @msm/exporters build`

## Read next

- [DESIGN §9 Targets and Exporters](../../docs/DESIGN.md#9-targets-and-exporters)
- [DESIGN §10 Engine Mod (Runtime)](../../docs/DESIGN.md#10-engine-mod-runtime)
- [DESIGN §12 Scripting and Escape Hatches](../../docs/DESIGN.md#12-scripting-and-escape-hatches)
- [ROADMAP, Phases 1, 4 and 6](../../docs/ROADMAP.md)
