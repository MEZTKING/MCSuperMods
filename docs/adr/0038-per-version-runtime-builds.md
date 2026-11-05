# ADR 0038: Per-version `msm_runtime` builds

## Context

`msm_runtime` compiles against one Minecraft version named in `engine-mod/gradle.properties` (`minecraft_version=26.3`, with Loader, Loom, Fabric API, GeckoLib and Rhino versions beside it); `engine-mod/parity/` repeats the Fabric versions in its own `gradle.properties`. The runtime uses Mojang names on unobfuscated jars (non-remapping Loom), so most of its code is version independent, but a few places name 26.3 facts: `MsmSoundType` maps the 40 `SoundType` fields of the 26.3 jar, `MsmRegistrar` carries the iron-tier tool values, `GeckolibRenderers` and `MsmEntityRegistrar` note Fabric API widenings of private vanilla members, and `makeMockServerPlayerInLevel` (three GameTests) is deprecated for removal. The 26.4 snapshot adds a `block_sound_set` registry, which suggests block sound types became data driven. The app stages one jar (`app/build/runtime/msm_runtime.jar`, packaged as `resources/runtime/msm_runtime.jar`) and the content jar nests it for every project regardless of target. A second target ([ADR 0037](0037-second-target-mc-26.4-and-target-upgrade.md)) therefore needs a second runtime build, and the content jar must nest the one for the project's target.

## Decision

**D1. One Gradle build, parametrised by `-Pmc=<version>`.** `engine-mod/versions/<mc>.properties` holds the per-version facts (`minecraft_version`, `loader_version`, `loom_version`, `fabric_api_version`, `geckolib_version`, `geckolib_modrinth_version_id` (blank when none exists), `minecraft_dependency`); `gradle.properties` keeps the shared ones (`mod_version`, Rhino, JUnit, `default_mc=26.3`). `settings.gradle.kts` and `build.gradle.kts` read the selected file (`-Pmc`, default `default_mc`). `./gradlew build` builds 26.3 as today; `./gradlew build -Pmc=26.4` builds the 26.4 runtime. Both run the JUnit tests and the GameTests.

**D2. Source overlays.** `src/main/java` stays the shared source. Version-specific code lives in `src/mc/<mc>/java` (added to the main source set for the selected version only) behind small package-private seams: a `VersionBridge` (or one seam per concern, such as `SoundTypes`, `ToolMaterials`, `SpawnEggTabs`) with one implementation per overlay. The shared code never references a class that exists in only one version; a class that exists in both but behaves differently gets a seam. GameTests follow the same rule with `src/mc/<mc>/gametest`. The spike (B151) decides which seams 26.4 needs; the expectation is few.

**D3. Jar naming and metadata.** The jar is `msm_runtime-<mod_version>+mc<mc>.jar` (Fabric semver build metadata: `1.0.0+mc26.4`), `fabric.mod.json` carries `"version": "<mod_version>+mc<mc>"` and the version's `minecraft` dependency range; `depends.msm_runtime >=<version>` in content jars is unchanged, because build metadata does not take part in ordering. GeckoLib stays optional (`suggests`); a version without a GeckoLib build compiles the GeckoLib bridge against the newest available GeckoLib jar (`compileOnly`) and runs its GameTests with `-PwithoutGeckolib` semantics.

**D4. The app ships one jar per target.** `app/scripts/stage-runtime.mjs` stages every `engine-mod/build/libs/msm_runtime-*+mc*.jar` as `app/build/runtime/msm_runtime-mc-<mc>.jar`; `electron-builder.yml` ships the folder `runtime/`; `platform/runtime-jar.ts` resolves the jar by target id (packaged `resources/runtime/msm_runtime-<target id>.jar`; in development the newest matching jar in `engine-mod/build/libs/`); `exports:runtimeJar` takes the target id; a missing jar for the project's target is `export.runtime-missing` as today. The release workflow builds every version listed in `engine-mod/versions/` before packaging; `--require` fails when any is missing.

**D5. Parity and CI.** `engine-mod/parity/` reads the same `versions/<mc>.properties` through `-Pmc`. The CI `engine-mod` job becomes a matrix over the versions in `engine-mod/versions/` (26.3 and 26.4): build, JUnit, GameTests, the sample exports for that target (the golden tests take the target from `MSM_TARGET_ID`), the headless server checks and, for 26.3, the ejected builds and parity runs; 26.4 runs parity on the content jars only until its Java generator is confirmed. The jobs run in parallel so the wall time does not double.

## Consequences

- Adding a version is one properties file, an overlay folder if a seam is needed, and a matrix entry.
- A user's content jar for 26.4 nests the 26.4 runtime; a jar exported for 26.3 keeps working with the 26.3 runtime. The "Separate runtime" option continues to require the matching runtime in the modpack.
- Gradle's configuration cache is keyed per `-Pmc` value; two builds in one checkout use `build/` once each (sequentially) or are run from CI's separate jobs.
- The GameTest count is reported per version in the Milestone Log.

## Status

Proposed (2026-11-05). B151 (spike) records the compile errors against 26.4-snapshot-7, the seams needed, whether Loom 1.19.3 accepts the snapshot and which `minecraft` range loads on the snapshot server; B159 implements D1–D3 and D5; B160 implements D4. Accepted at Phase 7 close.
