# Phase 4 plan — Engine Mod + Blocks/Items (v0.4)

Working plan of the main session, kept in the repository so a later session can pick it up. `DESIGN.md` stays authoritative; when this plan and an accepted ADR disagree, the ADR wins. Removed at Phase 4 close (history goes to `DEVLOG.md`).

## Verified facts (2026-11-05)

| Fact | Value | Source |
|---|---|---|
| Java | 25 (Temurin 25.0.5 installed at `/root/jdk/jdk-25.0.5+8` in the session container) | api.adoptium.net |
| Gradle | 9.8.2 (wrapper) | FabricMC/fabric-example-mod, branch `26.3`, `gradle-wrapper.properties` |
| Loom | plugin id `net.fabricmc.fabric-loom` (non-remapping; `net.fabricmc.fabric-loom-remap` remaps), release 1.19.3 | maven.fabricmc.net plugin markers; example mod `build.gradle` |
| Fabric Loader | 0.20.1 (stable) | meta.fabricmc.net `/v2/versions/loader/26.3` |
| Fabric API | 0.165.2+26.3 | maven.fabricmc.net `fabric-api` metadata |
| Minecraft dependency | `com.mojang:minecraft:26.3`; plain `implementation` for loader and API; no mappings line | example mod `build.gradle` |
| Latest stable game version on Fabric meta | 26.3 (26.4 snapshots exist) | meta.fabricmc.net `/v2/versions/game` |

Verified by B90 (ADR 0024): `setId(ResourceKey)` is required on `Block.Properties` and `Item.Properties`; GameTest is `net.fabricmc.fabric.api.gametest.v1.GameTest` (entry point `fabric-gametest`, Loom `fabricApi { configureTests {} }`, task `runGameTest`); creative tabs are `fabric-creative-tab-api-v1` `CreativeModeTabEvents.modifyOutputEvent`; a mod's `data/` loads without `pack.mcmeta`.

Unverified, to check in the briefs: block tags for tool tiers, `SoundType` names, `ToolMaterial` names (copper), Prism `--launch`, `mmc-pack.json` components for 26.x Fabric, `assets/` loading without `pack.mcmeta` on the client, scanning `msm/` inside a production jar.

Status (2026-11-05): Wave 0 (B90, positive: no Tier 2 fallback), Wave 1 (B91, B92) and Wave 2 (B93, B94, B95) done. Next: Wave 3 (B96–B99).

## Decisions (ADR drafts)

- [ADR 0024](adr/0024-runtime-registration-spike.md): spike result and the engine-mod toolchain (written by B90).
- [ADR 0025](adr/0025-msm-definition-format-v1.md): definition format v1, MSM mcdoc, the blocks and items plugin.
- [ADR 0026](adr/0026-fabric-content-jar.md): content jar, runtime distribution, Test in Minecraft, headless check.
- [ADR 0027](adr/0027-plugin-api-0.6.md): plugin API 0.6.0 (`OutputFile.merge`, exporter options, `Target.fabric`).

## Waves

Parallel briefs in a wave never share a file; one lockfile owner per wave.

| Wave | Brief | Owns | Depends on |
|---|---|---|---|
| 0 | B90 registry-freeze spike | `engine-mod/`, ADR 0024, `.gitignore` | — |
| 1 | B91 plugin API 0.6.0, core merge, `Target.fabric` | `packages/plugin-api`, `packages/core` (lowering), `packages/exporters/src/run-export.ts`, `packages/targets/mc-26.3`, every plugin `src/index.ts` apiVersion, lang/tag lowering `merge`, `tools/new-plugin` | — |
| 1 | B92 MSM mcdoc v1 and conformance corpus | `packages/schemas` (incl. `mcdoc/msm/`), `tools/build-msm-mcdoc/` | ADR 0025 |
| 2 | B93 runtime v1 (loader, Codecs, components, actions, GameTests, JUnit over the corpus) | `engine-mod/` | B90, B92 |
| 2 | B94 `@msm/plugin-blocks-items` (kinds, lowering, validators, templates, goldens) | `packages/plugins/blocks-items/` (lockfile owner) | B91, B92 |
| 2 | B95 `fabric-content-jar` exporter | `packages/exporters/src/fabric-content-jar/`, its tests | B91 |
| 3 | B96 app: export dialog options, runtime jar resource, content-jar export wiring | `app/` (main, preload, export UI), `app/electron-builder` config | B94, B95 |
| 3 | B97 Block Studio and Item Studio | `app/src/renderer/src/studios/blocks-items/` | B94 |
| 3 | B98 real Custom ore starter, examples, `examples/` mirror | `packages/plugins/library/`, `examples/`, `packages/exporters/test/library.test.ts` | B94 |
| 3 | B99 CI and release: engine-mod job, `tools/run-fabric-server`, `fixtures/sample-mod/` kitchen sink | `.github/workflows/`, `tools/run-fabric-server/`, `fixtures/sample-mod/` | B93, B95 |
| 4 | B100 Test in Minecraft (`@msm/interop` `fabric/`, app command) | `packages/interop/src/fabric/`, app main IPC | B96 |
| 4 | B101 e2e `blocks-items-path`, guide page `guide/blocks-and-items.md` | `app/e2e/`, `docs/guide/` | B96, B97 |
| 5 | B102 close: ROADMAP ticks, Milestone Log, ADRs accepted, version 0.4.0, scoped `CLAUDE.md` status lines | docs, `app/package.json`, `engine-mod/gradle.properties` | all |

If B90 shows dynamic registration cannot work, waves 2–4 are re-planned around code generation (Tier 2) before B93 starts.

## Verification

Each brief: clean worktree, `pnpm install --frozen-lockfile --offline`, `npx tsc -b`, `npx biome ci .`, `node tools/check-deps/index.ts`, `node_modules/.bin/turbo run test --force` (run turbo directly: in this container `pnpm turbo` fails with "Exec format error"). Engine-mod briefs: `JAVA_HOME=/root/jdk/jdk-25.0.5+8 ./gradlew build` plus the GameTest task. App briefs: build and e2e. Phase close: smoke, `dist:dir`, packaged smoke, check-size.
