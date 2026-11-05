# packages/exporters — Exporters

Phase 2 code complete: `runExport` (collect, lower, merge assets, validate JSON and text, write), deterministic fflate zips, memory/folder/zip sinks, and `vanilla-packs` as `resourcePackExporter` (id `vanilla-packs`) and `dataPackExporter` (id `vanilla-packs-data`) from `createVanillaPacksExporter` (ADR 0015). Phase 3: structure templates lower to `data/<ns>/structure/*.nbt` inside the data pack; the `.nbt` and `.schem` folder exports are plugin exporters of `@msm/plugin-structures` run by the app (ADR 0021); `sample-worldgen.golden.test.ts` pins `fixtures/sample-worldgen` (zip SHA-256, `.nbt` round trip, chain walk in `test/chain-walk.ts`, validators). Phase 4 code complete: `fabric-content-jar` (`createFabricContentJarExporter({ loadRuntimeJar })`, option `separateRuntime`, nested `META-INF/jars/msm_runtime-<version>.jar`, `fabric.mod.json` synthesised or completed; ADR 0026); `sample-mod.golden.test.ts` pins `fixtures/sample-mod` (jar SHA-256, definitions valid; with `MSM_RUNTIME_JAR` writes the jar CI's headless server loads). Phase 5 code complete: projects with entities depend on GeckoLib and nest it from `loadGeckolibJar` (`export.geckolib-missing`, `export.no-geckolib-target`; ADR 0029 D4); `sample-mob.golden.test.ts` pins `fixtures/sample-mob` (with `MSM_RUNTIME_JAR` and `MSM_GECKOLIB_JAR` writes the jar for CI's server check). Phase 6 code complete: the content jar transpiles scripts through an injected `transpileScript` (`.ts` becomes `.js`; `export.transpiler-missing`) and a jar with scripts depends on `msm_runtime >=` the later of the runtime version and `SCRIPT_RUNTIME_MINIMUM` 0.6.0 (ADR 0032 D4); `sample-script.golden.test.ts` pins `fixtures/sample-script` (with `MSM_RUNTIME_JAR` and `MSM_SAMPLE_SCRIPT_OUT` writes the jar for CI's server check); `java-project` (`createJavaProjectExporter({ loadGradleWrapper })`, ADR 0033) with the Java sources from `Target.javaProject`; `sample-mod.java.golden.test.ts` and `sample-mob.java.golden.test.ts` pin the ejected trees (with `MSM_SAMPLE_MOD_JAVA_OUT` / `MSM_SAMPLE_MOB_JAVA_OUT` write them for `./gradlew build`).

## Purpose

`@msm/exporters` turns lowered output into files a player or developer can use. It is the last step of the pipeline: collect elements → lower against target → validate → write.

## Contents

| Exporter | Phase | Output |
|---|---|---|
| `vanilla-packs/` | 1–2 | Resource pack zip, data pack zip, or both zips in one folder (`combinedFileNames`: `<slug>-<target id>-resources.zip`, `-data.zip`) |
| `fabric-content-jar/` | 4 | Jar with `assets/`, `data/`, `msm/`, `fabric.mod.json`; nested `msm_runtime` jar; optional nested GeckoLib |
| `java-project/` | 6 | Eject: Gradle project (`files.ts`: Gradle files, README, licence notes), `src/main/resources/` (`fabric.mod.json` with entrypoints, `assets/`, `data/`), Java from the target's generator; no dependency on `msm_runtime`; scripts and `run_script` left out (`export.scripts-not-ejected`) |

Shared modules in `src/`: `run-export.ts`, `zip.ts`, `sinks.ts`, `assets.ts` (asset allow-list: `textures/`, `sounds/`, `font/`, `texts/`; `.png.mcmeta` sidecars get schema `resource:texture_meta`), `manifest.ts`, `problem-codes.ts` (`export.*`).

## Conventions

- Exporters consume `OutputFile[]` from the lowering pipeline, never elements directly. Source may not import `@msm/targets`, `@msm/target-*` or any `@msm/plugin-*` but `@msm/plugin-api` (Biome); tests may use `@msm/targets` and the built-in plugins (`resourcepack`, `datapack`, `structures`, `worldgen`, `blocks-items`, `models-anim`, `entities`, `scripting`, `library`) (dev dependency only; ADRs 0013, 0017, 0020).
- Output is deterministic (stable file ordering, fixed zip timestamps) so builds are reproducible and diffable.
- Every exporter has a golden test on a sample project (`vanilla-packs`: SHA-256 of the `fixtures/sample-resourcepack`, `sample-datapack` and `sample-worldgen` zips, identical across timezones).
- `test/library.test.ts` builds every library starter and example per target, reloads, validates and exports both packs with zero problems, and pins the `examples/` mirror (`UPDATE_GOLDENS=1` rewrites it).
- The validation gate runs before anything is written: `validateJson` for outputs with `schema` (ADR 0009), the injected `validateText` for outputs with `language` (`mcfunction`; ADR 0014). Errors block; warnings pass; no validator gives `export.language-unchecked` info.
- The data exporter synthesises `pack.mcmeta` from `packFormats.data` when absent; a combined export is two runs into two sinks, not a third exporter.
- Zips: entries sorted by path, level 6, `os: 0`, timestamp `new Date(2000, 0, 1)` (local-time constructor, ADR 0013).
- The runtime jar is nested by default; "separate runtime" is an option for modpack makers. Projects with entities (`msm/<ns>/entity/`) also depend on GeckoLib (`Target.geckolib`) and nest it from `loadGeckolibJar` unless `separateRuntime` is set (ADR 0029 D4; `export.geckolib-missing`, `export.no-geckolib-target`).
- The `java-project` eject is one-way and includes a README in the generated project. Its source names no Minecraft class: the Java comes from `Target.javaProject` (`export.no-java-project-target`, `export.java-generation-failed`); the wrapper comes from the host (`export.gradle-wrapper-missing`, info).
- Content jars write each `msm`-layer `language: 'typescript'` file as its transpiled `.js` (ADR 0031 D5); transpile problems carry the script's path and block the jar.

## Do / Don't

- Do write a manifest (`msm.export.json`) into each output listing target, version and plugins.
- Do take version facts (pack formats, Fabric versions) from the target.
- Don't embed Mojang assets.
- Don't know about editors or UI.
- Append an entry to `docs/DEVLOG.md` each session.

## Commands

- `pnpm --filter @msm/exporters test` (includes the three sample-project zip SHA-256 goldens and the library test)
- `pnpm typecheck` and `pnpm lint` from the repository root

## Read next

- [DESIGN §9 Targets and Exporters](../../docs/DESIGN.md#9-targets-and-exporters)
- [DESIGN §10 Engine Mod (Runtime)](../../docs/DESIGN.md#10-engine-mod-runtime)
- [DESIGN §12 Scripting and Escape Hatches](../../docs/DESIGN.md#12-scripting-and-escape-hatches)
- [ROADMAP, Phases 1, 4 and 6](../../docs/ROADMAP.md)
