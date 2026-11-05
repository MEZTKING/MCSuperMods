# engine-mod/ — Fabric runtime mod

Status: Phases 4 to 6 code complete, awaiting the in-game checks (`fixtures/sample-mod/README.md`, `fixtures/sample-mob/README.md`, `fixtures/sample-script/README.md`). Runtime v1 (B93) reads ADR 0025 format 1 blocks and items; Phase 5 entities (B113, ADR 0028): Codecs for `msm/<ns>/entity/*.json`, `MsmEntity` with six goal types, triggers, `play_animation`, spawn eggs, natural spawns, GeckoLib bridge. Phase 6 scripting (B130, B133; ADRs 0031, 0032): Rhino 1.9.2 nested (`include`), script API v1 with nine events, `run_script` action, global `require` in the contract (`ScriptApi.FUNCTIONS`, B141); `parity/` (B131, B139; ADR 0033) is a separate GameTest build run against content and ejected jars; 138 JUnit tests (corpus, parser and the script API contract) and 78 GameTests (22 scripting, 6 armour and tool materials, 12 gear in `MsmGearGameTest`) pass in `./gradlew build`, also with `-PwithoutGeckolib` (entities then log one error each and register nothing). CI job `engine-mod` also starts headless servers (`tools/run-fabric-server`) with the sample mod, the sample mob (runtime and GeckoLib nested) and the sample script, builds the ejected samples and runs the parity GameTests four times; `parity/gradle.properties` Fabric facts must equal this folder's (`tools/check-deps`). `mod_version` 0.6.0 equals `app/package.json` (`app/test/runtime-version.test.ts`). This file describes intent and conventions.

## Purpose

`msm_runtime`: the Fabric mod that reads `msm/` definitions from every loaded mod jar and turns them into blocks, items and entities with component-driven behaviour. Java package `dev.mcsupermods.runtime`.

## Contents

- `build.gradle.kts`, `settings.gradle.kts` — Gradle, Kotlin DSL; `-Pmc=<mc>` (default `default_mc`) selects the Minecraft version (ADR 0038).
- `gradle.properties` — shared facts: `default_mc`, `mod_version`, Rhino, JUnit, `geckolib_compile_fallback_version_id`; its `minecraft_version`, `loader_version`, `loom_version` and `fabric_api_version` only mirror `versions/<default_mc>.properties` for `tools/check-deps` (the build fails if they differ).
- `versions/<mc>.properties` — per-version facts (ADR 0038 D1): `minecraft_version`, `loader_version`, `loom_version`, `fabric_api_version`, `geckolib_version` and `geckolib_modrinth_version_id` (both blank when no GeckoLib build exists: the bridge then compiles against the fallback jar and GeckoLib never runs), `minecraft_dependency` (the `fabric.mod.json` range; a snapshot needs the `-` form, such as `>=26.4- <26.5-`). The jar is `build/libs/msm_runtime-<mod_version>+mc<mc>.jar`.
- `src/mc/<mc>/java`, `src/mc/<mc>/gametest` — version overlays (ADR 0038 D2), added to the main and gametest source sets for the selected version only. They hold only seams, one implementation per version with the same class name: `registry/BlockSounds` (26.3 `SoundType`, 26.4 `block_sound_set` keys), `client/EntityRendererRegistration` (26.4 passes `BuiltInClientRegistries.ENTITY_RENDERER`), GameTest `BlockSoundCheck` and `EquipSoundCheck` (26.4 `Equippable.equipSound()` is an `Optional`).
- `src/main/java/dev/mcsupermods/runtime/`
  - `loader/` — `DefinitionScanner` (scan `msm/` in all mods), `DefinitionParser` (pure; format, warnings, Codecs), `MsmCodecs`, `StrictJsonOps`, `BlockDefinition`, `ItemDefinition`, `EntityDefinition`.
  - `components/` — component records and Codecs aligned with `packages/schemas/mcdoc/msm/`; `Goal` (dispatch on `type`, decoded one by one). Items (ADR 0042, B181): `msm:armor` (`Armor`, `ArmorSlot`, `ArmorMaterialSpec` = vanilla `ArmorMaterialName` or `CustomArmorMaterial`), `msm:tool` with `ToolTierSpec` (vanilla `ToolTier` or `ToolMaterialSpec`) and optional `attack_damage`/`attack_speed`; `MsmCodecs.nameOrObject` decodes the string-or-struct unions, `TAG_ID` the `#`-prefixed tag references. `MsmRegistrar.armor` calls `humanoidArmor(material, type)`, `tool` builds `new ToolMaterial(...)` for a custom tier; `enchantment_value: 0` removes `enchantable` (vanilla rejects 0); two of `msm:tool`, `msm:armor`, `msm:ranged_weapon`, `msm:shield` on one item are an error and none applies. Gear (ADR 0044, B187): `msm:consumable` (`food(FoodProperties, Consumable)` or `consumable`, `use_cooldown`, delayed `use_remainder`), `msm:ranged_weapon`, `msm:shield` (delayed `blocks_attacks` on a plain `MsmItem`), `msm:death_protection`, tool types `spear` (`SPEAR_CONSTANTS` from vanilla) and `mace`, armour slots `horse`/`wolf`, `msm:components` (`ComponentPassthrough`: static `RegistryOps`, `DELAYED` list through `delayedComponent`, else a load error), action `apply_effect` (`EventContext.other`).
  - `events/` — `Action` (dispatch on `type`, incl. `run_script`), `Events` (per-event decoding), `EventRunner` (depth 16), `AnimationTarget`.
  - `registry/` — `MsmRegistrar`, `MsmEntityRegistrar`, driver classes `MsmBlock`, `MsmItem` (`useWithEvent` shared by `MsmBowItem`, `MsmCrossbowItem`, `MsmMaceItem`), `MsmEntity`; GeckoLib only in `MsmGeoEntity` behind `GeckolibEntities` (touched after `isModLoaded("geckolib")`).
  - `goals/` — `FollowTypesGoal`. `client/` — `MsmRuntimeClient` (client entrypoint), `GeckolibRenderers`, `MsmGeoModel`.
  - `scripting/` (ADRs 0031, 0032) — `ScriptHost` (per server: load on `SERVER_STARTING`, reload on `END_DATA_PACK_RELOAD`; sealed shared standard objects, a scope per script, `require` of `msm:runtime` and relative ids, schedules, rate-limited errors, off-hand suppression), `ScriptBridges` (Fabric events), `ScriptApi` (the `msm` tree and `describe()`), `ScriptType`/`HostObject` (read-only wrappers), `ScriptWorld`, `ScriptEntity`, `ScriptPlayer`, `ScriptPos`, `BlockRef`, `ItemRef`, `ScriptEvents`, `MsmContextFactory` (sandbox, 2000 ms budget), `ScriptScanner`.
- `src/test/` — JUnit 5 over `../packages/schemas/mcdoc/msm/conformance/definition/`; `ScriptApiContractTest` reads `../packages/plugins/scripting/api/script-api-v1.json` in place.
- `src/gametest/` — Fabric GameTests; `resources/msm/msm_test/` holds the kitchen-sink definitions and hand-written ES5 scripts (`script/`), `assets/msm_test/geckolib/` a test model, `data/msm_runtime_gametest/gametest/structure/arena.snbt` the movement arena.
- GeckoLib (ADR 0029 D6): Modrinth Maven `exclusiveContent`; `compileOnly` + `gametestCompileOnly` + `localRuntime`; never in the jar, only `suggests` in `fabric.mod.json` (left empty for a version without GeckoLib).
- `parity/` — the parity GameTest build (ADR 0033 D5): same `-Pmc` handling over `../versions/` (default `../gradle.properties` `default_mc`), overlay `parity/src/mc/<mc>/java` (`ParitySounds`), jar `msm_parity_tests-<version>+mc<mc>.jar`; its `gradle.properties` Fabric keys only mirror this folder's.

## Conventions

- Java 25; Mojang names only (no Yarn, no Parchment).
- Fabric Loom 26.1+ non-remapping variant (verify at implementation).
- Fabric API events over Mixins; every Mixin needs a justification comment.
- Definitions parsed via Codecs aligned with MSM mcdoc; a schema change updates the Codecs and the corpus together.
- Registries are touched only during init; reloadable data stays in data packs.
- The script API grows only through `script-api-v1.json` first; the contract test fails until `ScriptApi` matches.
- Log with the mod-id prefix; no reflection on definitions.
- Versions: shared code never names a class that exists in one Minecraft version only; a difference goes behind a seam in `src/mc/<mc>/` (every version implements every seam), and a call that compiles on every version (such as the six-argument `Block.getDrops`) needs no seam. Adding a version: `versions/<mc>.properties`, the overlay folders, a CI matrix entry.
- Every session: append an entry to `docs/DEVLOG.md` (`## YYYY-MM-DD — <agent> — <topic>`, then What / Decisions / Next).

## Do / Don't

- Do keep the runtime free of any app dependency; it must work with hand-written `msm/` files.
- Don't hardcode content.
- Don't add Kotlin.

## Commands

- `JAVA_HOME=<jdk 25> ./gradlew build` (default version, runs JUnit and the GameTests); `./gradlew build -Pmc=26.4` for another version (the jars of both stay side by side in `build/libs/`)
- `./gradlew test` (JUnit only; the corpus test reads the schemas package in place)
- `./gradlew runGameTest` (headless GameTest server; `-PwithoutGeckolib` runs without GeckoLib) / `./gradlew runClient`; both take `-Pmc`
- `./gradlew -p parity build [-Pmc=<mc>]` (the parity GameTest jar)
- CI job `engine-mod` is a matrix over the versions (`.github/workflows/ci.yml`; keep it equal to `versions/`)

## Read next

- [10. Engine Mod (Runtime)](../docs/DESIGN.md#10-engine-mod-runtime)
- [11. Behaviour Model](../docs/DESIGN.md#11-behaviour-model-components-and-events)
- [12. Scripting and Escape Hatches](../docs/DESIGN.md#12-scripting-and-escape-hatches)
- ROADMAP: Phase 4 onwards (`../docs/ROADMAP.md`)
