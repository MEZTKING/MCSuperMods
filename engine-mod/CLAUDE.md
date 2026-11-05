# engine-mod/ — Fabric runtime mod

Status: Phase 4 code complete, awaiting the in-game check (`fixtures/sample-mod/README.md`). Runtime v1 (B93): Codec loader for ADR 0025 format 1 (ADRs 0024–0026 accepted), every Phase 4 block and item component and all six actions; 46 JUnit tests over the shared corpus and 18 GameTests pass in `./gradlew build`; CI job `engine-mod` also starts a headless server with the sample mod (`tools/run-fabric-server`), which proved the scan inside a production jar. `mod_version` 0.4.0 equals `app/package.json` (`app/test/runtime-version.test.ts`). Entities and scripting come later. This file describes intent and conventions.

## Purpose

`msm_runtime`: the Fabric mod that reads `msm/` definitions from every loaded mod jar and turns them into blocks, items and entities with component-driven behaviour. Java package `dev.mcsupermods.runtime`.

## Contents

- `build.gradle.kts`, `gradle.properties` (versions), `settings.gradle.kts` — Gradle, Kotlin DSL.
- `src/main/java/dev/mcsupermods/runtime/`
  - `loader/` — `DefinitionScanner` (scan `msm/` in all mods), `DefinitionParser` (pure; format, warnings, Codecs), `MsmCodecs`, `StrictJsonOps`, `BlockDefinition`, `ItemDefinition`.
  - `components/` — component records and Codecs, aligned with `packages/schemas/mcdoc/msm/`.
  - `events/` — `Action` (dispatch on `type`), `Events` (per-event decoding), `EventRunner` (depth 16).
  - `registry/` — `MsmRegistrar`, driver classes `MsmBlock`, `MsmItem` (`MsmEntity` in Phase 5).
  - Later: `scripting/` (Rhino, Tier 1), `client/` (GeckoLib bridge, optional).
- `src/test/` — JUnit 5 over `../packages/schemas/mcdoc/msm/conformance/definition/`.
- `src/gametest/` — Fabric GameTests; `resources/msm/msm_test/` holds the kitchen-sink definitions.

## Conventions

- Java 25; Mojang names only (no Yarn, no Parchment).
- Fabric Loom 26.1+ non-remapping variant (verify at implementation).
- Fabric API events over Mixins; every Mixin needs a justification comment.
- Definitions parsed via Codecs aligned with MSM mcdoc; a schema change updates the Codecs and the corpus together.
- Registries are touched only during init; reloadable data stays in data packs.
- Log with the mod-id prefix; no reflection on definitions.
- Every session: append an entry to `docs/DEVLOG.md` (`## YYYY-MM-DD — <agent> — <topic>`, then What / Decisions / Next).

## Do / Don't

- Do keep the runtime free of any app dependency; it must work with hand-written `msm/` files.
- Don't hardcode content.
- Don't add Kotlin.

## Commands

- `JAVA_HOME=<jdk 25> ./gradlew build` (runs JUnit and the GameTests)
- `./gradlew test` (JUnit only; the corpus test reads the schemas package in place)
- `./gradlew runGameTest` (headless GameTest server) / `./gradlew runClient`

## Read next

- [10. Engine Mod (Runtime)](../docs/DESIGN.md#10-engine-mod-runtime)
- [11. Behaviour Model](../docs/DESIGN.md#11-behaviour-model-components-and-events)
- [12. Scripting and Escape Hatches](../docs/DESIGN.md#12-scripting-and-escape-hatches)
- ROADMAP: Phase 4 onwards (`../docs/ROADMAP.md`)
