# engine-mod/ — Fabric runtime mod

Status: Phases 4 and 5 code complete, awaiting the in-game checks (`fixtures/sample-mod/README.md`, `fixtures/sample-mob/README.md`). Runtime v1 (B93) reads ADR 0025 format 1 blocks and items; Phase 5 entities (B113, ADR 0028): Codecs for `msm/<ns>/entity/*.json`, `MsmEntity` with six goal types, triggers, `play_animation`, spawn eggs, natural spawns, GeckoLib bridge. Phase 6 scripting (B130, B133; ADRs 0031, 0032): Rhino 1.9.2 nested (`include`), script API v1 with nine events, `run_script` action; 89 JUnit tests (corpus and the script API contract) and 60 GameTests (22 scripting) pass in `./gradlew build`, also with `-PwithoutGeckolib` (entities then log one error each and register nothing). CI job `engine-mod` also starts headless servers (`tools/run-fabric-server`) with the sample mod and the sample mob (runtime and GeckoLib nested). `mod_version` 0.5.0 equals `app/package.json` (`app/test/runtime-version.test.ts`). This file describes intent and conventions.

## Purpose

`msm_runtime`: the Fabric mod that reads `msm/` definitions from every loaded mod jar and turns them into blocks, items and entities with component-driven behaviour. Java package `dev.mcsupermods.runtime`.

## Contents

- `build.gradle.kts`, `gradle.properties` (versions), `settings.gradle.kts` — Gradle, Kotlin DSL.
- `src/main/java/dev/mcsupermods/runtime/`
  - `loader/` — `DefinitionScanner` (scan `msm/` in all mods), `DefinitionParser` (pure; format, warnings, Codecs), `MsmCodecs`, `StrictJsonOps`, `BlockDefinition`, `ItemDefinition`, `EntityDefinition`.
  - `components/` — component records and Codecs aligned with `packages/schemas/mcdoc/msm/`; `Goal` (dispatch on `type`, decoded one by one).
  - `events/` — `Action` (dispatch on `type`, incl. `run_script`), `Events` (per-event decoding), `EventRunner` (depth 16), `AnimationTarget`.
  - `registry/` — `MsmRegistrar`, `MsmEntityRegistrar`, driver classes `MsmBlock`, `MsmItem`, `MsmEntity`; GeckoLib only in `MsmGeoEntity` behind `GeckolibEntities` (touched after `isModLoaded("geckolib")`).
  - `goals/` — `FollowTypesGoal`. `client/` — `MsmRuntimeClient` (client entrypoint), `GeckolibRenderers`, `MsmGeoModel`.
  - `scripting/` (ADRs 0031, 0032) — `ScriptHost` (per server: load on `SERVER_STARTING`, reload on `END_DATA_PACK_RELOAD`; sealed shared standard objects, a scope per script, `require` of `msm:runtime` and relative ids, schedules, rate-limited errors, off-hand suppression), `ScriptBridges` (Fabric events), `ScriptApi` (the `msm` tree and `describe()`), `ScriptType`/`HostObject` (read-only wrappers), `ScriptWorld`, `ScriptEntity`, `ScriptPlayer`, `ScriptPos`, `BlockRef`, `ItemRef`, `ScriptEvents`, `MsmContextFactory` (sandbox, 2000 ms budget), `ScriptScanner`.
- `src/test/` — JUnit 5 over `../packages/schemas/mcdoc/msm/conformance/definition/`; `ScriptApiContractTest` reads `../packages/plugins/scripting/api/script-api-v1.json` in place.
- `src/gametest/` — Fabric GameTests; `resources/msm/msm_test/` holds the kitchen-sink definitions and hand-written ES5 scripts (`script/`), `assets/msm_test/geckolib/` a test model, `data/msm_runtime_gametest/gametest/structure/arena.snbt` the movement arena.
- GeckoLib (ADR 0029 D6): Modrinth Maven `exclusiveContent`; `compileOnly` + `gametestCompileOnly` + `localRuntime`; never in the jar, only `suggests` in `fabric.mod.json`.

## Conventions

- Java 25; Mojang names only (no Yarn, no Parchment).
- Fabric Loom 26.1+ non-remapping variant (verify at implementation).
- Fabric API events over Mixins; every Mixin needs a justification comment.
- Definitions parsed via Codecs aligned with MSM mcdoc; a schema change updates the Codecs and the corpus together.
- Registries are touched only during init; reloadable data stays in data packs.
- The script API grows only through `script-api-v1.json` first; the contract test fails until `ScriptApi` matches.
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
