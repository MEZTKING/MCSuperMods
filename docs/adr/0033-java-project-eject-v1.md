# ADR 0033: Java project eject v1 (`java-project` exporter)

## Context

Tier 2 ([Scripting and Escape Hatches](../DESIGN.md#12-scripting-and-escape-hatches)) is "Export as Fabric Java project": a one-way, deterministic, documented Gradle project with generated Java that mirrors what `msm_runtime` would have done, with no dependency on `msm_runtime` ([Targets and Exporters](../DESIGN.md#9-targets-and-exporters), exporter `java-project`). The ROADMAP asks for a CI check that the ejected kitchen-sink project builds with Gradle and for behaviour-parity GameTests against both the runtime jar and the ejected build. Facts (verified 2026-11-05, `docs/PHASE6-PLAN.md`): Gradle 9.8.2 is current and is the engine-mod wrapper (wrapper jar SHA-256 `3b8a2577…8e98`); Loom 1.19.3 is the latest 1.19 release (1.20 is alpha); Fabric Loader 0.20.1 and Fabric API 0.165.2+26.3 are the latest for 26.3; Loom 1.19.3 has the `include` configuration and `NestableJarGenerationTask`; Fabric API's gametest module runs tests on a production dedicated server when the JVM property `fabric-api.gametest` is set (`fabric-api.gametest.report-file`, `.filter`, `.verify` exist in 4.0.36). The generated Java names Mojang classes of one Minecraft version (`Identifier`, `BlockBehaviour.Properties.setId`, `FabricEntityType.Builder.createMob`), which are version facts.

## Decision

**D1. Scope of v0.6.** The eject covers everything `msm_runtime` v1 registers: `msm:block` (every component: `msm:breakable`, `msm:light_emitter`, `msm:on_interact`, `msm:on_step`, `msm:redstone`; block items and creative tabs; loot table override), `msm:item` (`msm:food`, `msm:tool`, `msm:durability`, `msm:on_use`), `msm:entity` (attributes, the six goal types including the runtime's `FollowTypesGoal` copied into the project, triggers, spawn egg, natural spawn, the GeckoLib bridge and client renderer) and every action (`run_function`, `spawn_particle`, `set_block_state`, `give_item`, `play_sound`, `trigger_event`, `play_animation`). **Scripts are not ejected**: `msm:script` elements and `run_script` actions are left out with one `export.scripts-not-ejected` warning per script naming it, and the generated README says so (a follow-up may copy the runtime's `scripting/` sources and nest Rhino). `assets/` and `data/` files are copied unchanged; `msm/` definitions do not appear in the output.

**D2. Layout of the generated project** (`<mod_id>/`, package `<java package>` = the mod id with `-` as `_`, prefixed `mod_` when it starts with a digit or is a Java keyword):

```
settings.gradle.kts, build.gradle.kts, gradle.properties, .gitignore, README.md, LICENSE-NOTES.md
gradlew, gradlew.bat, gradle/wrapper/gradle-wrapper.jar, gradle/wrapper/gradle-wrapper.properties
src/main/resources/fabric.mod.json, assets/**, data/**
src/main/java/<pkg>/<ModClass>.java            // ModInitializer: registers blocks, items, entities, tabs, spawns
src/main/java/<pkg>/ModBlocks.java, ModItems.java, ModEntities.java
src/main/java/<pkg>/block/<Name>Block.java      // one class per block with events or redstone state
src/main/java/<pkg>/item/<Name>Item.java        // one class per item with msm:on_use
src/main/java/<pkg>/entity/<Name>Entity.java    // PathfinderMob + GeoEntity, goals, triggers, controllers
src/main/java/<pkg>/entity/FollowTypesGoal.java // copied from the runtime when a follow goal exists
src/main/java/<pkg>/client/<ModClass>Client.java, entity/<Name>Model.java   // ClientModInitializer, GeoModel
src/main/java/<pkg>/Actions.java                // the six action helpers, straight-line Java with depth guard 16
msm.export.json
```

Gradle facts come from the target: `Target.fabric` (`loom`, `loader`, `api`, `minecraftDependency`, new `gradle`) and `Target.geckolib` (`implementation` and `include` of `maven.modrinth:geckolib:<modrinthVersionId>` from the Modrinth Maven, only when the project has entities). `fabric.mod.json` is the lowered one without the `msm_runtime` dependency, plus `entrypoints` `main` and `client`, with GeckoLib under `depends` when nested. The wrapper jar and scripts come from the host (`createJavaProjectExporter({ loadGradleWrapper })`, which the app serves from `engine-mod/gradle/wrapper/` in development and from the packaged `resources/runtime/gradle-wrapper/` staged by `stage-runtime.mjs`); without them the project is still written and `export.gradle-wrapper-missing` (info) tells the user to run `gradle wrapper`.

**D3. Where the Java generation lives.** The Java source generator is a target fact: `packages/targets/mc-26.3/src/java-project/` implements `Target.javaProject: JavaProjectGenerator` ([ADR 0034](0034-plugin-api-0.8.md)) and names every Mojang and Fabric class and member for 26.3 (the runtime's registrar, driver classes and GeckoLib bridge are the reference implementation and compile against the same jar). `@msm/exporters` `java-project/` owns the version-independent parts: reading the definitions from the `msm` layer, the Gradle files, the README, resource copying, the manifest, determinism and problems; it calls the target's generator with the parsed definitions. A target without `javaProject` reports `export.no-java-project-target`. The next target copies the generator folder and adjusts names, as it does with folder facts.

**D4. Determinism and one-way.** Files are written in sorted path order; content depends only on the project, the target and the MSM version in the manifest (no timestamps, no absolute paths). The app writes into `<picked folder>/<mod_id>/`, which must not exist or must be empty (`export.folder-not-empty` blocks otherwise), through a new main-process `exports.writeTree` that accepts a checked tree of relative paths (segments `[A-Za-z0-9_.-]+`, no `.`/`..`, depth at most 16, at most 4096 files). Edits to the generated project never flow back; the README says so and names the MSM version that produced it.

**D5. CI and parity.** The `engine-mod` CI job exports `fixtures/sample-mod/` and `fixtures/sample-mob/` as Java projects (the golden tests write them with `MSM_SAMPLE_MOD_JAVA_OUT` and `MSM_SAMPLE_MOB_JAVA_OUT`) and builds each with its own `./gradlew build --no-daemon` (the shared Gradle cache holds the 26.3 artefacts). Behaviour parity: `engine-mod/parity/` is a separate Gradle build (`cd engine-mod && ./gradlew -p parity build`) producing `msm_parity_tests.jar`, a GameTest mod written against the sample mods' public behaviour through vanilla APIs only (registry entries, block properties, interactions with a mock player, entity attributes and goals, spawn eggs, drops; no runtime classes). `tools/run-fabric-server --gametest <jar> --report <file>` runs a production dedicated server with `-Dfabric-api.gametest=true` and the report file; CI runs it twice per sample: with the content jar (runtime nested) and with the ejected build's jar. The same tests passing on both is the phase's exit-criterion proxy.

## Consequences

- A user who outgrows MSM gets a conventional Fabric project (Loom, Mojang names, Java 25) that builds as it stands and reads like hand-written code.
- The generator doubles the places a component's semantics are written (runtime Java and generated Java); the parity GameTests keep them equal, and every new component in later phases lands in both or is reported as not ejectable.
- CI grows by two Gradle builds and two server runs (estimated five minutes).
- Scripts remain runtime-only in v0.6.

## Status

Proposed (2026-11-05). Findings of the eject and parity spike (B131) are appended here before Wave 1; accepted at Phase 6 close.
