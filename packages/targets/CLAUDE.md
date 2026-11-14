# packages/targets — Minecraft version targets

Phase 2 code complete: `mc-26.3/` with `Target.folders.resource` and `folders.data` (plugin-api 0.3.0, ADR 0017), the vendored command tree and block states, and the `@msm/targets` aggregator in `all/` (ADR 0013). Phase 3 (plugin-api 0.5.0, ADR 0022): `dataVersion` 5023, data folders `structure`, `dimension`, `worldgen`, and `worldgen` facts: `featureSteps` (the eleven decoration steps) and `biomeAttributes` (`WorldgenFacts.biomeAttributes`: the `minecraft:visual/*` colour attributes, `skyColour`, `naturalMobSpawns` = `minecraft:gameplay/natural_mob_spawns`), verified against the vendored mcdoc and mcmeta. Phase 4 code complete (plugin-api 0.6.0, ADR 0027): `fabric` facts loader 0.20.1, Fabric API 0.165.2+26.3, Loom 1.19.3 (verified 2026-11-05) and `minecraftDependency` `~26.3`, the only source of these versions for the exporter and `tools/run-fabric-server`. Phase 5 code complete (plugin-api 0.7.0, ADR 0030): `geckolib` facts (GeckoLib 5.5.7, `>=5.5.7`, jar file name, Modrinth CDN URL, SHA-512, version id `kSxHvs99`; verified 2026-11-05), read by the exporter, the app's download and CI. Phase 6 code complete (plugin-api 0.8.0, ADR 0034): `fabric.gradle` 9.8.2 (equals the engine-mod wrapper, checked by a test) and `javaProject`, the 26.3 Java generator in `mc-26.3/src/java-project/` (ADR 0033 D3; goldens from the runtime's GameTest definitions). Phase 7 (plugin-api 1.0.0, ADRs 0036, 0037): `channel` on every target and the second target `mc-26.4/` (snapshot `26.4-snapshot-7`, no `geckolib`, no `javaProject`, `migrateFrom` from 26.3). Also in 1.x: `worldgen.noiseSettingsDefaultBlock` (26.3 `true`, 26.4 `false`: 26.4 dropped `default_block`; a worldgen test ties it to each vendored schema; ADR 0036 D8) and `items.armorMaterials` (the nine vanilla armour material names, both targets, verified with `javap`; ADR 0042). The 26.3 Java generator also covers armour, custom tool materials, weapons, consumables, totems and the `msm:components` passthrough (ADRs 0042, 0044), status effects (`ModEffects`, `effect/MobEffectBase` mirroring `MsmMobEffect`: `on_start` from `onEffectAdded`, `on_tick` and `on_end` at `END_SERVER_TICK`; ADR 0055 D10), throwables (`item/ThrowableItem`, `entity/ThrownItemEntity` as `<mod id>:thrown_item`, `ThrownItemRenderer`; ADR 0056 D7), the `damage` and `heal` actions, project sound events (`ModSounds`, registered first, written only when `soundEvents` is non-empty; ADR 0057 D5), potions (`ModPotions`, after `ModEffects` and before blocks and items, one vanilla `Potion` per definition named `name` else `<ns>.<path>`, an effect neither vanilla (`VANILLA_MOB_EFFECTS`, tied to the vendored registry by a test) nor the project's fails generation where the runtime skips the potion, written only when `potions` is non-empty; ADR 0063 D8), mob sounds (ADR 0057 D6), step events carrying the stepper with a per-dimension cooldown (ADR 0058 D1), a client entrypoint with entities or throwables (GeckoLib only with entities), additions to vanilla content (ADR 0060 D9: `ModWorldgen` with one guarded `BiomeModifications` modification per feature or spawn, `ModLoot` decoding embedded pools with `LootPool.CODEC` in `LootTableEvents.MODIFY` for built-in tables only, both registered last; block item `msm:components` through `VanillaComponents`), and the triggers of ADR 0061 D6 (item `hurtEnemy`, `useOn`, `inventoryTick`; block `playerWillDestroy`, `setPlacedBy`, `randomTick`, `entityInside`; entity `customServerAiStep` and `finalizeSpawn`; `TickLimiter` with 2,000 firings per tick and the `(game time + entity id) % interval` rule, `CooldownMap`; `run_function` in an entity's own events runs as the player when there is one, else as the mob, ADR 0061 finding of 2026-11-14). Block types and plants (ADRs 0067, 0068; `java-project/block-types.ts`): the 14 building and redstone types, crops, saplings and leaves, the generated `BlockStripping.java` and the leaves tint in the client entrypoint; `TargetFacts.blocks` lists the set and wood type names (plugin-api 1.10.0). A project without these generates byte-identical Java.

## Purpose

One package per Minecraft version, `@msm/target-mc-<version>`, holding every version-specific fact and its vendored schema and registry data. This is the only place in the repo where version facts live. Support policy (ADR 0037 D1): the current release and the next version's snapshots (release when it lands): `mc-26.3` (`channel: 'release'`) and `mc-26.4` (`channel: 'snapshot'`).

## Contents

- `mc-26.3/src/target.ts`: the `Target` object (`packFormats` as `{ major, minor }`, `mcdocRef` commit sha, `mcmetaRef` prefix, Java version, `folders.resource` and `folders.data` checked against the Spyglass URI binder; `fabric`/`geckolib` from Phases 4/5).
- `mc-26.3/src/vendored.ts`: URLs of the vendored files (incl. `mcmetaCommands`, `mcmetaBlocks`; keys mirrored by the app's `VENDORED_KEYS`); consumers read them, core and schemas never do.
- `mc-26.3/vendor/vanilla-mcdoc/`: Spyglass symbol export, `LICENSE`, `SOURCE.json` (ADR 0005).
- `mc-26.3/vendor/mcmeta/`: `version.json`, `registries.json`, `commands.json` (pretty-printed, about 583 kB), `blocks.json`, `SOURCE.json` (ADR 0006).
- `mc-26.3/CHANGES.md`: verified facts with sources, and what Mojang changed that affected us.
- `mc-26.4/`: same layout; `src/removed-ids.ts` (registry → ids removed since 26.3, moved registries, ids still registered elsewhere, known renames) and `src/migrate.ts` (`migrateFrom`: `target.removed-id` with element and RFC 6901 path, renames applied only when the mcdoc shape matches, `target.no-migration-path` from an unknown target).
- `all/src/index.ts` (`@msm/targets`): `builtInTargets` (newest first by `mcVersion`, snapshots included), `releaseTargets`, `defaultTargetId` (the first `release` target, never a snapshot), `targetById`, `targetFacts` (hooks stripped, safe to `structuredClone`), `readVendoredJson`. The only way code outside this tree reaches a target; plugin and exporter `src/` may not import it (tests only). The app's main build bundles every target's vendored data into `out/main/vendor/`.

## Conventions

- Data only, plus small hooks; no general logic.
- Every field is documented on the `Target` type in `@msm/plugin-api`.
- Vendored data is regenerated only by `tools/sync-mcdoc` and `tools/sync-mcmeta`; never edit it by hand.
- vanilla-mcdoc has no tags: pin a commit sha. mcmeta refs are the tags `<version>-summary` / `<version>-registries`.
- Registry ids in `registries.json` have no namespace; consumers add `minecraft:`.
- Mark every unverified value "(verify at implementation)"; record verified ones with date and source in `CHANGES.md`.
- Target changes are handled at lowering time; moving a project to another target goes through that target's `migrateFrom` (pure; the host applies the report as one undo step).
- The target id is `mc-` plus `mcVersion` up to the first `-` (`26.4-snapshot-7` → `mc-26.4`); that key also names the runtime jar.
- The removed-id table is data, never hand-guessed: `mc-26.4/test/removed-ids.test.ts` recomputes the diff of both vendored `registries.json` files and the mcdoc shape of each rename.

## Do / Don't

- Do add a version by copying the previous folder, updating facts and pins, re-running both sync scripts, and running the tests.
- Do re-pin a snapshot target (and at release: `mcVersion`, `channel: 'release'`, GeckoLib) with `sync-mcmeta` and `sync-mcdoc`, then both target test suites, the removed-id test (update `removed-ids.ts` to the new diff) and `UPDATE_GOLDENS=1` for the plugin and exporter goldens of that target.
- Do keep the real-data tests: schema load and coverage (zero unsupported nodes in Phase 2 and Phase 3 kinds), loot validation and the mcfunction service over the vendored data.
- Don't let version facts leak into any other package (`tools/check-deps` enforces this).
- Don't add pre-26.1 targets in v1.

## Commands

- `pnpm --filter "@msm/target-*" test`
- `node tools/sync-mcdoc/index.ts --ref <sha> --out packages/targets/mc-<version>/vendor/vanilla-mcdoc`
- `node tools/sync-mcmeta/index.ts --version <version> --out packages/targets/mc-<version>/vendor/mcmeta`

## Read next

- [DESIGN §9 Targets and Exporters](../../docs/DESIGN.md#9-targets-and-exporters)
- [DESIGN §17 Risks and Mitigations](../../docs/DESIGN.md#17-risks-and-mitigations)
- [ADR 0005](../../docs/adr/0005-vanilla-mcdoc-pinning-and-loading.md), [ADR 0006](../../docs/adr/0006-mcmeta-refs.md), [ROADMAP](../../docs/ROADMAP.md)
