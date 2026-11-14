# Plan: block types, families, crops, saplings and trees

Working plan for coverage audit backlog B2 (block families and states) together with B12 (crops, saplings and trees). Written 2026-11-14 by the orchestrator. Decisions live in [ADR 0067](adr/0067-block-types-and-states.md), [ADR 0068](adr/0068-crops-saplings-trees-and-leaves.md) and [ADR 0069](adr/0069-block-family-flows.md) (all Proposed); this file holds the briefs, waves and the fact table. It is deleted at close (history goes to `DEVLOG.md`, findings into the ADRs).

## Fact table

Verified 2026-11-14 with `javap` (JDK 25, `/root/jdk/jdk-25.0.5+8`) over `~/.gradle/caches/fabric-loom/minecraftMaven/net/minecraft/minecraft-merged-deobf/<v>/minecraft-merged-deobf-<v>.jar` for 26.3 and 26.4-snapshot-7, the data and assets inside them, the cached Fabric API module jars and both targets' vendored `registries.json`. Scratch notes in the session scratchpad `plan-blocks/` (not kept). Nothing from the jars is committed.

| # | Fact | 26.3 | 26.4-snapshot-7 |
|---|---|---|---|
| F1 | Family constructors: `StairBlock(BlockState, Properties)` (protected), `SlabBlock`, `WallBlock`, `FenceBlock`, `RotatedPillarBlock` `(Properties)`, `FenceGateBlock(WoodType, Properties)`, `DoorBlock`/`TrapDoorBlock`/`PressurePlateBlock` `(BlockSetType, Properties)` (protected), `ButtonBlock(BlockSetType, int, Properties)` (protected), `WeightedPressurePlateBlock(int, BlockSetType, Properties)` (protected), `IronBarsBlock(Properties)` (protected) | as listed | identical |
| F2 | `SlabBlock.canPlaceLiquid` parameter | `Fluid` | `FluidState` (do not override) |
| F3 | `BlockSetType` constructor and constants | `(String, boolean x3, Sensitivity, SoundType, SoundEvent x8)`; OAK, SPRUCE, ..., IRON, COPPER, GOLD, STONE, POLISHED_BLACKSTONE, CHERRY, CRIMSON, WARPED, BAMBOO; private name map and Codec | `(boolean x3, Sensitivity, ResourceKey<BlockSoundSet>, SoundEvent x8)`; DEFAULT_WOOD, IRON, COPPER, GOLD, STONE, POLISHED_BLACKSTONE, CHERRY, CRIMSON, WARPED, BAMBOO; no map, no Codec |
| F4 | `WoodType` | `(String, BlockSetType, SoundType, SoundType, SoundEvent, SoundEvent)`; 13 constants OAK to BAMBOO | `(String, BlockSetType, ResourceKey<BlockSoundSet> x2, SoundEvent x2)`; same 13 constants |
| F5 | `CropBlock(Properties)` protected; overridable `getAgeProperty`, `getMaxAge`, `getBaseSeedId`, `getShape`, `mayPlaceOn` (`#supports_crops`), `getBonemealAgeIncrease`, `createBlockStateDefinition`; `isMaxAge` final | as listed | identical |
| F6 | `SaplingBlock(TreeGrower, Properties)` protected; `mayPlaceOn` from `VegetationBlock` (`#supports_vegetation`) | as listed | identical |
| F7 | `TreeGrower` constructor | `(String, WeightedList<ResourceKey<Feature>> x3, ResourceKey<Feature>)`, puts itself into a static name map | `(WeightedList x3, ResourceKey)`, no name |
| F8 | `TreeGrower.growTree` looks up `Registries.FEATURE` in `ServerLevel.registryAccess()` at grow time; empty `Optional` means no tree | yes | yes |
| F9 | `LeavesBlock(AmbientLeavesBlockSoundPlayer, Properties)`, `TintedParticleLeavesBlock(float, Properties)`, `UntintedParticleLeavesBlock(float, ParticleOptions, AmbientLeavesBlockSoundPlayer, Properties)`; decay reads `#logs` | as listed | ambient player parameters are `Optional<...>` |
| F10 | Client tint: Fabric `BlockColorRegistry.register(List<BlockTintSource>, Block...)`; `BlockTintSources.foliage/grass/dryFoliage/constant` | fabric-rendering-v1 27.2.0 | 29.1.1, same signature |
| F11 | Stripping: `block_transformer` data registry (`axe`, `hoe`, `shovel`), item component `minecraft:block_transformer` (one holder); no Fabric `StrippableBlockRegistry` | yes | yes |
| F12 | Flammability: Fabric `FlammableBlockRegistry` (fabric-content-registries-v0 15.0.7); no fire-odds tags | yes | (verify at implementation that the 26.4 Fabric API build has the same class) |
| F13 | `DoubleHighBlockItem`, `BlockItem` | present | present |
| F14 | Vanilla model parents for every family (list in ADR 0067 context) | present | present |
| F15 | Loot shapes: `condition`, `modifier`; `minecraft:match_block` with `state`; predicates `minecraft:tool/can_shear`, `can_silk_touch` | yes | identical files |
| F16 | Villagers harvest any `CropBlock` at max age on `FarmlandBlock`; replant `#villager_plantable_seeds` `BlockItem`s | yes | (verify at implementation) |
| F17 | Vendored registries: 10 trunk placer types, 12 foliage placer types, 11 tree decorator types; `block_transformer`; 26.4 adds `block_sound_set` | yes | yes |
| F18 | Tree feature `oak.json`: `below_trunk_provider: "minecraft:soil_beneath_tree"`, leaves state `distance: 7, persistent: false` | yes | identical |

## Rules for every brief

- Read root `CLAUDE.md`, the scoped `CLAUDE.md` of the area, the latest `docs/DEVLOG.md` entry and the ADRs named in the brief. Version facts live only in `packages/targets`; engine-mod uses Mojang names, Java 25, Fabric events over Mixins; a 26.3/26.4 difference goes behind a seam in `engine-mod/src/mc/<mc>/` (every version implements every seam).
- A format change moves the mcdoc, the corpus (`packages/schemas/mcdoc/msm/conformance/definition/`), the runtime Codecs and the generator together; the briefs below split them into ordered waves, and each brief keeps its own package green.
- Commits carry no `Co-Authored-By`, `Claude-Session` or other credit lines. Each executor works in its own worktree folder with a unique name in the scratchpad, commits on its branch, and appends a DEVLOG entry.
- Exit criteria always include, for the touched packages: `pnpm lint`, `pnpm typecheck`, the package tests; for engine-mod `JAVA_HOME=/root/jdk/jdk-25.0.5+8 ./gradlew build` and `./gradlew build -Pmc=26.4` (both run the GameTests; also `-PwithoutGeckolib` once for runtime briefs). App briefs also run `node tools/check-size/index.ts` after `pnpm build` (asar budget, audit L15).
- Parallel briefs in one wave never touch the same file; ownership is listed per brief. A brief that needs a file owned by another brief in the same wave stops and reports.
- Executors: Opus (`claude-opus-5-5`) at medium effort; Sonnet for B281 docs.

## Waves

| Wave | Briefs (parallel) | Depends on |
|---|---|---|
| 1 | B258 format, B259 plugin API 1.10.0 and target facts, B260 runtime driver refactor | none |
| 2 | B261 runtime Codecs, B262 lowering: building types | B258; B259 (B262) |
| 3 | B263 runtime: building types, B264 lowering: plants and loot presets, B265 validators, B266 templates | B260, B261 (B263); B262 (B264–B266) |
| 4 | B267 runtime: doors, trapdoors, buttons, plates, B268 app: Block Studio types, B269 exporters and registry views: `blockItemId`, B270 worldgen: tree template and Tree Studio | B263 (B267); B262, B265 (B268); B264 (B269); B258 (B270) |
| 5 | B271 runtime: crops, saplings, leaves, client tint, B272 app: plant sections and Creator previews, B273 library: Wood set and Stone set | B267 (B271); B268, B264, B270 (B272); B264, B266, B269 (B273) |
| 6 | B274 eject: building and redstone types, B275 library: Crop and Tree flows, examples | B267 (B274); B273 (B275) |
| 7 | B276 eject: plants, B277 e2e: families path | B271, B274 (B276); B272, B275 (B277) |
| 8 | B278 sample mod, parity tests and CI, B279 AI helper prompt and summaries | B276 (B278); B275 (B279) |
| 9 | B280 guide, changelog, status lines; B281 close (orchestrator) | all |

## Briefs

### B258 Format: block types, plants, block item id (wave 1)

- **Purpose:** the definition and element format of ADR 0067 D1, D2, D3, D7 and ADR 0068 D2, D3, D4, D6.
- **Owner files:** `packages/schemas/mcdoc/msm/definition.mcdoc`, `packages/schemas/mcdoc/msm/element.mcdoc`, `packages/schemas/mcdoc/msm/symbols.json` (regenerated with `tools/build-msm-mcdoc`), new corpus files `packages/schemas/mcdoc/msm/conformance/definition/block-type-*.json` and `conformance/element/block-type-*.json`, `packages/schemas/test/*` where the corpus count or symbol list is pinned.
- **Scope:** `type` enum (17 values) on `BlockCommon`; dispatch struct per type (closed); `item.id`; components `msm:flammable` and `msm:strippable`; element-only `textures` (per-type keys), `models`, loot presets `crop` and `leaves` with `crop_drops` and `leaves_drops`, `wooden`, `villager_plantable`. Field docs in British English, defaults stated as in the ADRs. At least one valid and one invalid corpus case per type and per new field (wrong type field for type, `stage_heights` length checked only by the validator, out-of-range `max_age`).
- **Exit criteria:** `pnpm --filter @msm/schemas test` green; a block without `type` validates byte-identically (existing corpus untouched); every new case passes or fails as named.
- **Out of scope:** lowering, runtime Codecs (B261), validators (B265).

### B259 Plugin API 1.10.0 and target block facts (wave 1)

- **Owner files:** `packages/plugin-api/src/target.ts`, `packages/plugin-api/src/version.ts`, `packages/plugin-api/package.json`, `packages/plugin-api/CHANGELOG.md` (if present), `packages/targets/mc-26.3/src/target.ts`, `packages/targets/mc-26.4/src/target.ts`, `packages/targets/mc-26.3/CHANGES.md`, `packages/targets/mc-26.4/CHANGES.md`, `packages/targets/*/test/target.test.ts`, `packages/targets/all/test/*`.
- **Scope:** `BlockFacts { setTypes; woodTypes }` ("Since 1.10.0"), `TargetFacts.blocks?`; both targets list the MSM names of ADR 0067 D2 (identical lists; the Java mapping is runtime's). A target test checks every family tag name of ADR 0067 D6 and ADR 0068 D3, D4, D6 (block and item) against the vendored `registries.json` `tag/block`/`tag/item` (or the vanilla tag list available to the target tests; if the vendored data has no tag ids, record "(verify at implementation)" and list the ones read from the jars in `CHANGES.md` with date and source). Built-in plugins keep `^1.0.0`.
- **Exit criteria:** `pnpm --filter @msm/plugin-api test`, `pnpm --filter "@msm/target-*" test`, `pnpm typecheck` green; `tools/check-deps` passes.

### B260 Runtime: extract the block behaviour driver (wave 1)

- **Owner files:** `engine-mod/src/main/java/dev/mcsupermods/runtime/registry/MsmBlock.java`, new `registry/BlockBehaviourDriver.java`.
- **Scope:** move event dispatch, triggers, the two cooldown maps, step and inside actors, light and redstone emission helpers out of `MsmBlock` into `BlockBehaviourDriver` (one instance per block, built from `Identifier` and `BlockDefinition`), with methods named after the vanilla callbacks (`useWithoutItem`, `stepOn`, `playerWillDestroy`, `setPlacedBy`, `randomTick`, `entityInside`) so the family classes of B263 and B267 can delegate. `MsmBlock` keeps its overrides and calls the driver. No behaviour change.
- **Exit criteria:** every existing GameTest (193 per variant) and JUnit test passes on 26.3, 26.3 without GeckoLib and 26.4; no new public behaviour; the DEVLOG entry lists the moved members.
- **Out of scope:** any new type.

### B261 Runtime: Codecs for types and plants (wave 2; after B258)

- **Owner files:** `engine-mod/src/main/java/dev/mcsupermods/runtime/loader/BlockDefinition.java`, `loader/DefinitionParser.java`, `loader/MsmCodecs.java`, `components/BlockComponents.java`, new `loader/BlockType.java` (enum and per-type records), `engine-mod/src/test/java/**` corpus test if it pins counts.
- **Scope:** decode `type` and the per-type fields (closed per type), `item.id`, `msm:flammable`, `msm:strippable`; the component-per-type table of ADR 0067 D3 as data (`BlockType.allows(component)`); a disallowed component is a parse warning-level load error that drops the component (as `while_worn`). Registration does not change yet: an unknown non-`block` type registers as today's `MsmBlock` and logs "type not supported yet" (removed by B263).
- **Exit criteria:** the JUnit corpus test passes over the new `block-type-*` cases (valid decode, invalid rejected); all GameTests unchanged.

### B262 Lowering: building types (wave 2; after B258, B259)

- **Owner files:** `packages/plugins/blocks-items/src/lowering/block.ts`, new `src/lowering/types/` (`index.ts` dispatch table for all 17 types, `blockstates.ts`, `models.ts`, `tags.ts`, one module per building type; stub modules `crop.ts`, `sapling.ts`, `leaves.ts` that write only the definition and a single-variant blockstate), new `src/lowering/block-item.ts` (`blockItemId(element)`), `src/lowering/shared.ts`, `src/index.ts` exports (only the export lines for these modules), goldens `test/fixtures/<target>/expected/block/type-*`, `test/lowering.golden.test.ts` (new cases appended).
- **Scope:** ADR 0067 D5, D6, D7: blockstates per type in vanilla's shape (variants or multipart, `uvlock` and rotations as vanilla's own files), generated models parented on the vanilla templates (F14) from `textures`, or `models` slots, item model definitions, `self` loot per type (slab double, door lower half), the always-written tags, `wooden` editor field; `item.id` handling for every type (name key, item model path). Strip all editor fields. Pure, golden-tested on both targets.
- **Exit criteria:** `pnpm --filter @msm/plugin-blocks-items test` green with goldens for every building type on `mc-26.3` and `mc-26.4`; a block without `type` lowers byte-identically (existing goldens unchanged); every output validates through the schema gate (`OutputFile.schema` set).
- **Out of scope:** plant lowering (B264), validators (B265), templates (B266).

### B263 Runtime: rotation and building families (wave 3; after B260, B261)

- **Owner files:** `registry/MsmBlock.java`, `registry/MsmRegistrar.java`, new `registry/types/` (`BlockTypes.java` factory, `MsmStairBlock`, `MsmSlabBlock`, `MsmWallBlock`, `MsmFenceBlock`, `MsmFenceGateBlock`, `MsmPaneBlock`), new `registry/BlockExtras.java` (flammable registration, `UseBlockCallback` stripping), `MsmRuntime.java` (one registration line), new GameTest `engine-mod/src/gametest/java/.../MsmBlockTypeGameTest.java`, new definitions `src/gametest/resources/msm/msm_test/block/type_*.json` and their data (`data/msm_test/tags/block/*.json` as needed; new files only).
- **Scope:** ADR 0067 D3 (component table enforced at registration), D4 for `pillar`, `horizontal`, `directional` (property via thread-local, placement, `rotate`, `mirror`, rotated `msm:shape` boxes precomputed per state, `msm:redstone` together with facing), `slab`, `stairs` (dependency order, base errors), `wall`, `fence`, `fence_gate` (vanilla `WoodType` constant by name), `pane`; vanilla `Properties` per family read from `Blocks.<clinit>` and recorded in the DEVLOG; `msm:flammable`, `msm:strippable`. Remove B261's "type not supported yet" for these types.
- **GameTests (at least):** pillar axis from the clicked face; horizontal facing towards the placer and rotated shape; directional up and down; slab bottom, top, double (two items on break), waterlogged slab; stairs straight and inner corner next to another stair, base delegation; wall post and connection to a wall and to a stone block; fence connecting to a project wooden fence (tag) and not to a non-wooden fence; fence gate opens on use and fits a wall; pane connecting to glass; stripping with a vanilla axe (state, axis, item damage) and no stripping with a stick; `FlammableBlockRegistry` odds read back; a disallowed `msm:redstone` on stairs dropped with a load error; stairs naming an unknown base skipped with an error.
- **Exit criteria:** new and existing GameTests pass on all three variants; startup log lists each type count.

### B264 Lowering: crops, saplings, leaves, loot presets (wave 3; after B262)

- **Owner files:** `src/lowering/types/crop.ts`, `sapling.ts`, `leaves.ts`, new `src/lowering/types/loot-presets.ts`, goldens `test/fixtures/<target>/expected/block/plant-*`, new test file `test/plants.golden.test.ts`.
- **Scope:** ADR 0068 D3, D4, D6: stage blockstates and `crop` models (repeat textures for fewer stages), `cross` sapling model, leaves model and item tint, the `crop` and `leaves` loot presets in vanilla's shapes (F15), tags of each plant type, `villager_plantable`.
- **Exit criteria:** golden tests on both targets; loot outputs pass the loot schema of each target; plugin tests green.

### B265 Validators for types and plants (wave 3; after B262)

- **Owner files:** new `packages/plugins/blocks-items/src/validators-types.ts`, `src/index.ts` (registration of the new validators only), new `test/validators-types.test.ts`; `src/validators.ts` only for the `model-not-cube` exemption of family types (a one-function change, listed in the DEVLOG).
- **Scope:** codes of ADR 0067 D8 and ADR 0068 D7, against target facts (`blocks.setTypes`, `blocks.woodTypes`) and project elements; vanilla block and feature ids from the target's vendored data (verify at implementation which vendored file lists configured feature ids; if none, accept any `minecraft:` id with an info).
- **Exit criteria:** one positive and one negative test per code; plugin tests green.

### B266 Templates per type (wave 3; after B262)

- **Owner files:** new `packages/plugins/blocks-items/src/templates/block-types.ts`, `src/templates/index.ts`, `test/templates.test.ts` (new cases appended).
- **Scope:** the 17 templates of ADR 0069 D4 with vanilla textures by id and vanilla trees (`minecraft:oak` for the sapling template), category "Blocks". Each validates and lowers on both targets with no problems.
- **Exit criteria:** template tests green on both targets; template count updated where pinned.

### B267 Runtime: doors, trapdoors, buttons, pressure plates (wave 4; after B263)

- **Owner files:** `registry/types/BlockTypes.java`, new `registry/types/MsmDoorBlock.java`, `MsmTrapDoorBlock.java`, `MsmButtonBlock.java`, `MsmPressurePlateBlock.java`, `MsmWeightedPressurePlateBlock.java`, `registry/MsmRegistrar.java` (door item), new seam `src/mc/26.3/java/.../registry/BlockSetTypes.java` and `src/mc/26.4/java/.../registry/BlockSetTypes.java`, new GameTest seam check `src/mc/<mc>/gametest/.../BlockSetTypeCheck.java`, new GameTest `MsmRedstoneTypeGameTest.java`, new test definitions `type_door_*.json` etc.
- **Scope:** ADR 0067 D2 set types, `press_ticks`, `weighted_max`, `DoubleHighBlockItem`, on_interact after the vanilla toggle.
- **GameTests:** door places both halves, opens on use (wood) and not by hand (iron), opens with a redstone signal, drops one item from either half; trapdoor opens and is waterloggable; button emits for `press_ticks` and an arrow presses a wooden button only; plate powers with an item entity (wood) and only mobs/players (stone); weighted plate signal grows with item count; seam check maps `wood` to `OAK` (26.3) and `DEFAULT_WOOD` (26.4).
- **Exit criteria:** all GameTests on three variants.

### B268 App: Block Studio types (wave 4; after B262, B265)

- **Owner files:** `app/src/renderer/src/studios/blocks-items/BlockStudio.tsx`, `blocks-items-model.ts`, new `studios/blocks-items/block-type-model.ts` and `BlockTypeSection.tsx`, new `TexturesSection.tsx`, `app/test/studios/blocks-items/*` (new test files), `app/src/renderer/src/session/schema-context.ts` (`blockHasItem` and the item id through `blockItemId`).
- **Scope:** ADR 0069 D5 for the building types: Type picker (one undoable change, drops the old type's fields), per-type fields with target facts for set and wood types, texture slots in words, previews of the generated models through `preview/bundle-source.ts`; the registry view counts `item.id`.
- **Exit criteria:** app unit tests green; `check-size` within budget; labels recorded for B280.

### B269 Exporters and registry views: `blockItemId` everywhere (wave 4; after B264)

- **Owner files:** `packages/exporters/test/library.test.ts` (its id collection), `packages/exporters/src/vanilla-packs/mod-only.ts` only if a helper needs the item id (ADR 0066 D2), `packages/targets/mc-26.3/src/java-project/read.ts` (reading `item.id` for the generator, no new Java), tests next to them.
- **Scope:** every place that assumed block item id equals block id uses the definition's `item.id` or `blockItemId`; a test project with a crop and seeds proves the seeds id is mod-only in the vanilla pack (recipe naming the seeds left out, tag entry made optional).
- **Exit criteria:** exporters tests green; the vanilla data pack of the test project matches ADR 0066's rules.

### B270 Worldgen: tree template and Tree Studio (wave 4; after B258)

- **Owner files:** `packages/plugins/worldgen/src/templates/features.ts` (new "Tree for a sapling" template), new `app/src/renderer/src/studios/worldgen/TreeFeatureStudio.tsx` and `tree-model.ts`, `app/src/renderer/src/studios/worldgen/studios.tsx` (registration), tests.
- **Scope:** ADR 0068 D5: Studio for `minecraft:worldgen/feature` elements of type `minecraft:tree` (other types keep the form): trunk and foliage placer pickers from the target's vendored registries, trunk, foliage and below-trunk providers (inline block or reference such as `minecraft:soil_beneath_tree`), leaves' `distance` and `persistent` filled in for project leaves, decorators list.
- **Exit criteria:** worldgen plugin and app tests green; the template validates and lowers on both targets.

### B271 Runtime: crops, saplings, leaves, client tint (wave 5; after B267)

- **Owner files:** `registry/types/BlockTypes.java`, new `registry/types/MsmCropBlock.java`, `MsmSaplingBlock.java`, `MsmLeavesBlock.java` (or two leaf classes), `registry/MsmRegistrar.java` (block item id), new seams `src/mc/<mc>/java/.../registry/TreeGrowers.java` and `Leaves.java` with GameTest seam checks, `client/MsmRuntimeClient.java` (tint registration), new `registry/SaplingCheck.java` (`SERVER_STARTED` warning), new GameTest `MsmPlantGameTest.java`, new definitions `type_crop_*`, `type_sapling_*`, `type_leaves_*`, `type_log_*`, and `src/gametest/resources/data/msm_test/worldgen/feature/test_tree.json` plus its tags.
- **Scope:** ADR 0068 D2, D3, D4, D6, D8.
- **GameTests:** custom `max_age` 3 and 7 state ranges; a random tick under light grows one stage (driven through `randomTick` with a fixed random); bonemeal raises the age within `bonemeal_growth`; placement only on the soil tag; seeds item places the crop and picks block returns the seeds; loot at max age gives produce and seeds, below max only seeds; a farmer villager harvests a mature crop on farmland (or record "(verify at implementation)" if the GameTest is unstable); sapling bonemealed to growth places the project tree (log and leaves present), a 2x2 mega tree when configured, a sapling naming a missing feature does not grow and the start-up warning is logged once; leaves with no log nearby decay after random ticks, player-placed leaves persist, leaves drop the sapling with a fixed loot seed and themselves with shears; the client tint registration compiles on both versions (not run).
- **Exit criteria:** all GameTests on three variants; `item.id` clash is a load error.

### B272 App: plant sections and Creator previews (wave 5; after B268, B264, B270)

- **Owner files:** new `studios/blocks-items/PlantSection.tsx`, `plant-model.ts`, `BlockTypeSection.tsx` (adds the plant types; owned by B268 in wave 4, so this wave only), `app/src/renderer/src/components/creator/` preview parts for block sets (new files `SetPreview.tsx`), tests.
- **Scope:** crop stages with a stage slider in the preview, stage heights, soil, produce and seeds; sapling tree link (opens the Tree Studio, offers "New tree" from the template); leaf tint picker with the in-game-only note; the Creator's row-of-blocks preview.
- **Exit criteria:** app tests green; `check-size` within budget.

### B273 Library: Wood set and Stone set flows (wave 5; after B264, B266, B269)

- **Owner files:** new `packages/plugins/library/src/starters/wood-set.ts`, `stone-set.ts`, `src/starters/index.ts`, `src/assets/png.ts` (new placeholder patterns), `src/content/bundle.ts` (shared helpers only if needed), tests `packages/plugins/library/test/*` (new files), `packages/exporters/test/library.test.ts` expectations only through `UPDATE_GOLDENS=1` mirror updates in `examples/`.
- **Scope:** ADR 0069 D1 (Wood set, Stone set), D2, D3; recipes in vanilla's shapes with `group`, tags, strippable, flammable, compost, the optional "Grows in the world" placed feature and biome addition.
- **Exit criteria:** both flows build for both targets with zero problems in `library.test.ts` (the Wood set's leaves and sapling need B271 only in game, not in tests); reopen test (untouched, edited and removed members); the library vanilla server packs still load (CI); `check-size` within budget.

### B274 Eject: building and redstone types (wave 6; after B267)

- **Owner files:** `packages/targets/mc-26.3/src/java-project/blocks.ts`, new `java-project/block-types.ts`, new templates in `java-project/templates/` (stripping callback, flammable registration), `packages/targets/mc-26.3/test/java-project.test.ts` and its goldens (new cases).
- **Scope:** ADR 0067 D10 for every type of ADR 0067; goldens taken from the runtime's own GameTest definitions (as earlier ejects).
- **Exit criteria:** target tests green; the ejected sample project of B278 compiles in CI.

### B275 Library: Crop and Tree flows, Simple block options, examples (wave 6; after B273)

- **Owner files:** new `starters/crop.ts`, `starters/tree.ts`, `starters/simple-block.ts` (new options), `starters/index.ts`, `src/examples/blocks-items.ts` (or a new `examples/block-types.ts` plus `examples/index.ts`), `src/assets/png.ts`, tests, `examples/` mirror via `UPDATE_GOLDENS=1`.
- **Scope:** ADR 0069 D1 (Crop, Tree), D4 examples.
- **Exit criteria:** library and exporters tests green on both targets; counts recorded.

### B276 Eject: plants (wave 7; after B271, B274)

- **Owner files:** `java-project/block-types.ts`, `java-project/client.ts` (tint registration in the generated client entrypoint), `java-project/mod.ts` if the `SERVER_STARTED` check needs a hook, tests and goldens.
- **Scope:** ADR 0068 D8.
- **Exit criteria:** target tests green; ejected sample compiles in CI (B278).

### B277 e2e: families path (wave 7; after B272, B275)

- **Owner files:** new `app/e2e/families-path.spec.ts`.
- **Scope:** Creator "Wood set" with a chosen colour, preview shows the set, Create, Block Studio of the stairs shows type and textures, change one texture, reopen in Creator keeps the edit, export the Fabric mod jar (contains the blockstates, models, `msm/<ns>/block/*` with types, tags), export the vanilla data pack (warnings `export.mod-only-reference`, pack still written), Undo removes the set; Crop flow creates the seeds and produce.
- **Exit criteria:** spec green under `xvfb-run -a`; full e2e suite green.

### B278 Sample mod, parity tests and CI (wave 8; after B276)

- **Owner files:** `fixtures/sample-mod/content/msm_sample_mod/**` (new elements only: a `maple` wood set, `ruby_bricks` stone set with wall, `ruby_berries` crop with seeds), `fixtures/sample-mod/assets/**` (new placeholder PNGs), `fixtures/sample-mod/README.md` (in-game checklist), new `engine-mod/parity/src/main/java/dev/mcsupermods/parity/SampleModBlockTypesParityTest.java`, `packages/exporters/test/*golden*` for the sample mod zip hashes, `.github/workflows/ci.yml` only if a new parity run is needed.
- **Scope:** black-box parity tests through commands on the content jar and the ejected jar: placement states (`setblock` with states and `execute if block`), slab double loot, door halves, fence connections, stripping by a fake player if available (else record as an in-game check), crop loot at max age, sapling grows to the project tree with bonemeal, leaves decay. Checklist for the user: leaf tint, render of every family, the Creator sets, crops and villagers.
- **Exit criteria:** parity runs green on 26.3 content, 26.3 ejected and 26.4 content in CI; negative run (wrong sample) fails.

### B279 AI helper prompt and summaries (wave 8; after B275)

- **Owner files:** `packages/ai/src/system-prompt.ts`, `packages/ai/src/tools/*` summaries that list block fields or item ids, `packages/ai/test/*`.
- **Scope:** ADR 0069 D6; the summaries use `blockItemId`; scripted-client scenario "make a maple wood set" builds through `add_starter` with zero blocking problems.
- **Exit criteria:** `@msm/ai` and app AI tests green.

### B280 Guide, changelog and status lines (wave 9; Sonnet)

- **Owner files:** new `docs/guide/block-types-and-plants.md`, `docs/guide/README.md`, `docs/site/.vitepress/config.ts` (sidebar), `docs/guide/blocks-and-items.md` (link), `docs/guide/creator.md` (four flows), `CHANGELOG.md` `[Unreleased]`, scoped `CLAUDE.md` status lines (root, app, engine-mod, plugins, targets, exporters) with counts recomputed from the plugins' contributions.
- **Exit criteria:** UI labels match the code; no emojis; root `CLAUDE.md` at most 70 lines, scoped ones at most 55.

### B281 Close (orchestrator, wave 9)

- Accept ADRs 0067–0069 with a Findings section each; DESIGN §10 and §11 (and §8 for the Studio, §9 for the facts) gain plain statements, 19 H2 headings kept; ROADMAP batch ticked with a Milestone Log row and follow-ups (signs, boats, own set-type sounds, copper weathering, stems and bushes, flower pots); coverage audit B2, B12, L5 marked closed; HANDOFF rewritten; this plan deleted; one full clean-worktree `turbo run test --force --concurrency=4` before the push to `main`.

## Vanilla pack safety (ADR 0066)

No new rule is needed: every type registers mod-only ids, so recipes, loot tables, tree features and placed features naming them are left out of the vanilla data pack with `export.mod-only-reference`, and every tag entry (including behaviour tags such as `minecraft:wooden_fences` and `minecraft:logs`) becomes `required: false`. The one change is that a block item can now have its own id (ADR 0068 D2): B268 (app registry view) and B269 (library test, eject reader) make `blockItemId` the source, so a seeds item counts as mod-only. The CI library check loads the vanilla data pack of every new starter and example on a vanilla server of both targets (ADR 0066 D8). If ADR 0066 is still Proposed when this batch starts, B269 rebases on the exporters move and does not edit `mod-only.ts` beyond the item id.

## Limits found

1. **Signs and hanging signs** need a block entity type that accepts the block and a client sign material keyed by a registered `WoodType`; 26.4 removed `WoodType`'s registration map. Client code and a seam (audit L3). Not in this batch.
2. **Boats and chest boats** need an entity type, a client renderer and a model layer (L3). Not in this batch.
3. **Own door, trapdoor, button and plate sounds** need a custom `BlockSetType`, whose constructor takes a `SoundType` on 26.3 and a `block_sound_set` data registry key on 26.4. Set types are vanilla presets in this batch.
4. **Stripping cannot be added through data:** vanilla's axe stripping is the `block_transformer` registry entry `minecraft:axe`, which a data pack can only replace whole (that would ship Mojang's list), and Fabric API no longer has a strippable registry. The runtime strips through `UseBlockCallback` for any item whose `minecraft:block_transformer` names `minecraft:axe`; dispensers and other mods that call the transformer directly do not see our logs.
5. **Leaf and grass tint is client code** (`BlockColorRegistry`): the runtime's first client block hook; untestable in CI (L16). Tint sources are vanilla's four and constants only. Untinted, pre-coloured leaves work with no client code.
6. **Sapling trees resolve late:** `TreeGrower` holds feature keys that the server looks up when the sapling grows (safe timing), so a missing feature cannot be detected at registration; the runtime warns once at server start and the sapling silently does not grow, as in vanilla.
7. **Tree shapes are vanilla's:** trunk and foliage placer types are code registries; data can only combine and tune the 10 trunk and 12 foliage placers and 11 decorators.
8. **Stairs need their base registered first:** a base block from another mod that registers after `msm_runtime` cannot be used.
9. **Villagers farm only crops on farmland** (`HarvestFarmland` checks `FarmlandBlock`), so a crop with a custom soil is never farmed by villagers.
10. **Flammability needs code** (no fire-odds tags); done through Fabric `FlammableBlockRegistry` at start-up, so it follows the registry freeze (L1).
11. **Not in this batch:** copper weathering and waxing, stems with attached fruit, berry bushes, double plants, cocoa, nether wart, flower pots, ladders, torches, lanterns, chains, waterlogging for plain and facing blocks.

## Notes from implementation

- B261: `MsmRegistrar.registerBlock` logs "type '<t>' not supported yet" and "item.id not supported yet"; B263, B267 and B271 remove the lines for the types they register, B271 the `item.id` one.
- B261: the format and Codec allow `bonemeal_growth.min` > `max`; B265 reports it (error) and B271 swaps the bounds defensively.
- B261: `stage_heights` keeps any length; B271 falls back to vanilla's ramp when the length is not `max_age + 1` (B265 already warns).
- B261: `BlockType.allows` holds the ADR 0067 D3 table; defaults: stairs base `minecraft:stone`, crop `max_age` 7, soil `#minecraft:supports_crops`, bone meal 2..5, sapling soil `#minecraft:supports_vegetation`, leaves particle chance 0.01, button press 30 ticks (wooden) or 20.
- B259: vanilla has no `pressure_plates` or `stone_pressure_plates` item tag (ADR 0067 D6).
- B262: model slot names per type are `BLOCK_TYPE_MODEL_SLOTS` in `blocks-items/src/lowering/types/index.ts` (B265 validates them; required slots left empty take the first model; generated model suffixes are in the header comment there). Plant stubs (`crop`, `sapling`, `leaves`) use a provisional `default` slot and `ownModelFallback`, which B264 replaces. Door item model uses the `bottom` texture (no `textures.item` yet); a wall's `top`/`bottom` have no effect (vanilla's wall templates take one `wall` texture). Use `blockItemId` wherever a block's item id is needed (B268, B269).
- B264: plant model slots: crop `stage0`..`stage15` (stage models spread over ages by `floor(a*k/n)`), sapling `sapling`, leaves `leaves`; hooks `generateFromData`, `itemTextureFromData`, `itemTints` on `TypeLowering`; reusable exports `cropMaxAge`, `CROP_*`, `SAPLING_TAGS`, `LEAVES_*`, `plantLootTable` (B271, B276). Crop item falls back to the last stage texture and leaves item tint cannot be turned off yet (no format fields; candidates for a later `textures.item` and `item_tint`). Seed items reuse the block's display name.
- B265: 18 `blocks-items.*` codes in `validators-types.ts` (`BLOCK_TYPE_PROBLEM_CODES`, `SHAPED_BLOCK_TYPES`); typed blocks are exempt from `missing-model` and (non-shaped types) `model-not-cube`. Possible additions: gap in `stageN` slots, `loot: "crop"` on a non-crop type.
- B266: 17 templates in `templates/block-types.ts` (45 in blocks-items, 168 in all); wooden types use tool `axe` with `requires_tool: false`.
