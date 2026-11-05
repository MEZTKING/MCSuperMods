# engine-mod/ — Fabric runtime mod

Status: Phase 4 code complete, awaiting the in-game check (`fixtures/sample-mod/README.md`). Runtime v1 (B93) reads ADR 0025 format 1 blocks and items; Phase 5 entities (B113, ADR 0028): Codecs for `msm/<ns>/entity/*.json`, `MsmEntity` with six goal types, triggers, `play_animation`, spawn eggs, natural spawns, GeckoLib bridge. 78 JUnit tests over the shared corpus and 38 GameTests pass in `./gradlew build`, also with `-PwithoutGeckolib` (entities then log one error each and register nothing). CI job `engine-mod` also starts a headless server (`tools/run-fabric-server`). `mod_version` 0.4.0 equals `app/package.json` (`app/test/runtime-version.test.ts`). Scripting comes later. This file describes intent and conventions.

## Purpose

`msm_runtime`: the Fabric mod that reads `msm/` definitions from every loaded mod jar and turns them into blocks, items and entities with component-driven behaviour. Java package `dev.mcsupermods.runtime`.

## Contents

- `build.gradle.kts`, `gradle.properties` (versions), `settings.gradle.kts` — Gradle, Kotlin DSL.
- `src/main/java/dev/mcsupermods/runtime/`
  - `loader/` — `DefinitionScanner` (scan `msm/` in all mods), `DefinitionParser` (pure; format, warnings, Codecs), `MsmCodecs`, `StrictJsonOps`, `BlockDefinition`, `ItemDefinition`, `EntityDefinition`.
  - `components/` — component records and Codecs aligned with `packages/schemas/mcdoc/msm/`; `Goal` (dispatch on `type`, decoded one by one).
  - `events/` — `Action` (dispatch on `type`), `Events` (per-event decoding), `EventRunner` (depth 16), `AnimationTarget`.
  - `registry/` — `MsmRegistrar`, `MsmEntityRegistrar`, driver classes `MsmBlock`, `MsmItem`, `MsmEntity`; GeckoLib only in `MsmGeoEntity` behind `GeckolibEntities` (touched after `isModLoaded("geckolib")`).
  - `goals/` — `FollowTypesGoal`. `client/` — `MsmRuntimeClient` (client entrypoint), `GeckolibRenderers`, `MsmGeoModel`.
  - Later: `scripting/` (Rhino, Tier 1).
- `src/test/` — JUnit 5 over `../packages/schemas/mcdoc/msm/conformance/definition/`.
- `src/gametest/` — Fabric GameTests; `resources/msm/msm_test/` holds the kitchen-sink definitions, `assets/msm_test/geckolib/` a test model, `data/msm_runtime_gametest/gametest/structure/arena.snbt` the movement arena.
- GeckoLib (ADR 0029 D6): Modrinth Maven `exclusiveContent`; `compileOnly` + `gametestCompileOnly` + `localRuntime`; never in the jar, only `suggests` in `fabric.mod.json`.

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
- `./gradlew runGameTest` (headless GameTest server; `-PwithoutGeckolib` runs without GeckoLib) / `./gradlew runClient`

## Read next

- [10. Engine Mod (Runtime)](../docs/DESIGN.md#10-engine-mod-runtime)
- [11. Behaviour Model](../docs/DESIGN.md#11-behaviour-model-components-and-events)
- [12. Scripting and Escape Hatches](../docs/DESIGN.md#12-scripting-and-escape-hatches)
- ROADMAP: Phase 4 onwards (`../docs/ROADMAP.md`)
