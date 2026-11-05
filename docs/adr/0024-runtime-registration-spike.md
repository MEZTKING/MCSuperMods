# ADR 0024: Runtime registration spike and the engine-mod toolchain

## Context

The `msm_runtime` Fabric mod is meant to read `msm/` definitions from every loaded mod and register blocks and items from them at start-up ([Engine Mod](../DESIGN.md#10-engine-mod-runtime)). Minecraft registries freeze during start-up, so this only works if a mod can read its own and other mods' files and register entries early enough, on 26.3, with the non-remapping Loom and Mojang names. The Phase 4 plan ([PHASE4-PLAN](../PHASE4-PLAN.md)) made this the first brief (B90): if dynamic registration does not work, Phase 4 falls back to Tier 2 code generation and waves 2 to 4 are re-planned. The definition format the spike reads is [ADR 0025](0025-msm-definition-format-v1.md) D2 to D4.

## Decision

**D1. Result: dynamic registration works on 26.3.** During `ModInitializer.onInitialize` the runtime iterates `FabricLoader.getInstance().getAllMods()`, calls `ModContainer.findPath("msm")`, walks `msm/<namespace>/<kind>/**/*.json`, parses each file and registers into `BuiltInRegistries.BLOCK` and `BuiltInRegistries.ITEM` with `Registry.register`. The spike's definitions live in a second mod (the GameTest mod `msm_runtime_gametest`), so the scan reads another mod's container exactly as it will read a content jar. Five GameTests run headless on a dedicated GameTest server and pass:

| GameTest | Proves |
|---|---|
| `definitionsAreRegistered` | `msm_spike:glow_ore` is an `MsmBlock` in `BuiltInRegistries.BLOCK`; its `BlockItem` shares the id and uses `block.msm_spike.glow_ore`; `msm_spike:shard` is an `MsmItem` with max stack size 16 and rarity `rare`; no load errors |
| `placedBlockHasLightAndHardness` | the placed block has light emission 4 and block light 4 once the light engine settles, destroy speed 3.0, resistance 3.0, `requiresCorrectToolForDrops` |
| `interactionRunsEvent` | a mock survival player using the block runs `msm:on_interact`, whose event plays `minecraft:block.amethyst_block.chime` and gives two `msm_spike:shard` |
| `modDataLoadsWithoutPackMcmeta` | the test mod, which has no `pack.mcmeta`, contributes `data/minecraft/tags/block/mineable/pickaxe.json` and `data/msm_spike/loot_table/blocks/glow_ore.json`, and both load |
| (one built-in test counted by the runner) | |

A deliberate wrong assertion fails the run: `runGameTest` exits with status 1, so `./gradlew build` fails.

Log lines from the passing run (2026-11-05):

```
(msm_runtime) [msm_runtime] registered 1 block(s) and 2 item(s) from 2 definition file(s); 0 error(s)
(Minecraft) Running test environment 'minecraft:default' batch 0 (5 tests)...
(msm_runtime) [msm_runtime] spike: msm_spike:glow_ore and msm_spike:shard found in BuiltInRegistries
(msm_runtime) [msm_runtime] spike: on_interact gave 2 x msm_spike:shard
(msm_runtime) [msm_runtime] spike: placed msm_spike:glow_ore has block light 4, hardness 3.0
(msm_runtime) [msm_runtime] spike: mod data/ loaded without pack.mcmeta (tag and loot table msm_spike:blocks/glow_ore)
(Minecraft) All 5 required tests passed :)
```

**D2. Toolchain, as verified.**

| Item | Value | Note |
|---|---|---|
| Java | 25 (Temurin 25.0.5) | `options.release = 25` |
| Gradle wrapper | 9.8.2 | wrapper jar SHA-256 `3b8a2577…8e98` matches `services.gradle.org` |
| Loom | `net.fabricmc.fabric-loom` 1.19.3 (non-remapping) | the example mod's 26.3 branch uses `1.19-SNAPSHOT`; we pin the release |
| Fabric Loader | 0.20.1 | |
| Fabric API | 0.165.2+26.3 | the example mod still names 0.165.0+26.3 |
| Minecraft | `minecraft("com.mojang:minecraft:26.3")`, no mappings line | Loom's dependency is the merged, unobfuscated jar |
| GameTest | Fabric API `fabric-gametest-api-v1` 4.0.36; annotation `net.fabricmc.fabric.api.gametest.v1.GameTest` on instance methods taking `GameTestHelper`; entry point key `fabric-gametest` | |
| Test wiring | `fabricApi { configureTests { createSourceSet = true; modId = "msm_runtime_gametest"; enableGameTests = true; enableClientGameTests = false; eula = true } }` | creates the `gametest` source set and `runGameTest`, and hooks `runGameTest` into `check`, so `build` runs it |

Build layout: `settings.gradle.kts` (plugin repositories and the Loom version from `gradle.properties`; the Kotlin DSL `plugins {}` block of a build script cannot read `providers`), `build.gradle.kts`, `gradle.properties`. Mod id `msm_runtime`, package `dev.mcsupermods.runtime`, layout `loader/`, `registry/` (`MsmBlock`, `MsmItem`, `MsmRegistrar`), `events/`.

**D3. Commands.** From `engine-mod/` with `JAVA_HOME` set to a JDK 25:

- `./gradlew build` compiles, builds the jar and runs the GameTests (about 30 s warm; the first run downloads the game, about 1 GB of Gradle cache).
- `./gradlew runGameTest` runs only the GameTests; the run directory is `build/run/gameTest`.
- In this session container Maven Central sometimes answers 429; `-Dorg.gradle.internal.repository.max.retries=8` and a retry of the command got past it.

**D4. Limits found.**

- **Ids before construction.** Since 1.21.2, `BlockBehaviour.Properties.setId(ResourceKey<Block>)` and `Item.Properties.setId(ResourceKey<Item>)` must be called before the `Block` or `Item` constructor; 26.3 still throws "Block id not set" / "Item id not set" otherwise. The registrar therefore builds the `ResourceKey` first, then the properties, then the object, then registers under the same key. The default loot table key (`<ns>:blocks/<path>`) and the description id come from that key.
- **Block items.** A block item is a plain `BlockItem` with its own `Item.Properties`, `setId` with the block's id and `useBlockDescriptionPrefix()`, so its name comes from `block.<ns>.<path>` as for vanilla block items. No vanilla helper is needed.
- **Creative tabs.** Fabric API renamed the item group module: it is `fabric-creative-tab-api-v1`, `CreativeModeTabEvents.modifyOutputEvent(ResourceKey<CreativeModeTab>)` (not `ItemGroupEvents`). Vanilla's `CreativeModeTabs` keys are private, so the runtime builds keys with `ResourceKey.create(Registries.CREATIVE_MODE_TAB, id)` from the definition's id, which suits data-driven tabs. An unknown tab id never fires; B93 should check the id against the creative tab registry after start-up and warn. Tab contents are client-side and were not checked by the headless run.
- **Timing.** `onInitialize` is early enough: registries are still open, vanilla content (sound events, items) is already bootstrapped, so `play_sound` ids can be validated at load. Ids that name other `msm/` content (`give_item`) are resolved when the action runs, because the referenced item may be registered later in the scan. Blocks are registered before items so a stand-alone item cannot steal a block item's id. Fabric registry sync then carries the ids to clients; client and server need the same content jars.
- **Client side.** The spike ships no `assets/`. Expected in game: the block renders as the missing model and the item likewise, with raw language keys, until `assets/<ns>/blockstates/`, models and `assets/<ns>/items/<path>.json` exist (verify at implementation; B99 or the user's in-game check). Nothing in registration needs client code.
- **`assets/` and `data/` without `pack.mcmeta`.** A mod's `data/` loads without `pack.mcmeta` (D1). `assets/` follows the same Fabric resource loader path on the client (verify at implementation with `runClient`). The content jar does not need a `pack.mcmeta`.
- **Dev versus production paths.** In the dev run the mod roots are directories (`build/resources/...`); in a production jar `findPath` returns a zip file system path. The scanner uses only `java.nio.file` calls that work on both, but the jar case is first exercised by the headless server check in B99.
- **Parsing.** The spike parses with Gson and a small helper, not Codecs; it covers only `format`, `sound_type` (a nine-entry table), `item`, `msm:breakable`, `msm:light_emitter`, `msm:on_interact`, and the `play_sound` and `give_item` actions. B93 replaces this with Codecs aligned with the MSM mcdoc.
- **Not needed:** Mixins, access wideners, reflection.

## Consequences

- Phase 4 continues on the dynamic-registration path; the Tier 2 code-generation fallback is not needed for blocks and items.
- B93 builds on this layout and build: real Codecs, the full component and action set, more GameTests, JUnit over the conformance corpus.
- Every engine-mod build runs the GameTests, so CI (B99) needs only `./gradlew build` with JDK 25 and a Gradle cache.
- Content jars must include client assets (blockstates, models, item definitions, lang) for blocks and items to look right; the registration side needs nothing from them.

## Status

Proposed (2026-11-05). To be accepted at Phase 4 close.
