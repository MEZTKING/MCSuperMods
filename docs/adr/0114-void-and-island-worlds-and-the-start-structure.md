# ADR 0114: Void, flat and sky island worlds, and the start structure

## Context

A Skyblock and its cousins need four things. The first is a world type of empty sky or floating islands. The second is a start island placed once at the spawn. The third is a spawn on it. The fourth is a way to make resources, which in vanilla is the cobblestone generator of lava and water. Today all four exist only by hand. The overworld can be replaced by a `world_preset` naming a flat or noise generator (facts G1–G4), and the Dimension flow already offers floating islands, but only as a separate dimension (G3). Vanilla 26.x has a structure placement `dimension_origin`, but the vendored mcdoc has no schema for it (G7). There is also `fixed_placement` (whose shape changes at 26.4, G8) and the hard-wired `void_start_platform` feature. How these behave, where players spawn and whether a void End keeps its dragon are not yet measured (Y1–Y8).

## Decision

- **D1 World types.** `msm:world_setup.world.type`:
  - `void`: a flat generator with no layers and a sky biome of the project (no features, plains-like mob spawns by default, because vanilla's `the_void` is expected to have none, Y7);
  - `flat`: given layers;
  - `sky_islands`: the floating-islands or End-like noise settings from `TargetFacts.worlds` over the overworld's biome source;
  - `vanilla`: no world preset, setup only;
  - `preset`: any project world preset.

  Each type except `vanilla` lowers to a world preset in `#minecraft:normal` with its lang name. `nether` and `end` can be `void` too. A void End warns that players need an End portal frame in the start structure (Y5).
- **D2 The start structure, placed at the first join by default.** The first player's first-join function does the placing: `forceload` the area, `place template` (or `place structure` for a jigsaw) at `start.at`, `setworldspawn` at `start.at + start.spawn`, set `respawn_radius`, set the world flag, then teleport the player. This works with "Generate structures" off, in a world made before the pack, and in vanilla packs (limit M3). `when: "world_generation"` (Advanced, "Place it while the world generates") lowers to a jigsaw structure with a `dimension_origin` structure set instead, only if B547 confirms Y1 on both versions. For that route the plugin adds a vanilla overlay schema for `dimension_origin` (B549), so a hand-made structure set can use it too.
- **D3 Chests.** Start chests come from the structure file (built in game) or from a loot table set on a container through the Structure Studio (ADR 0116 D4). The Skyblock flow's default chest holds a lava bucket, two ice, a sapling, seeds and bone meal (vetoable).
- **D4 Generators.** Vanilla's lava and water rule is used as it is. MSM adds no Mixin and no data to change what it makes, because vanilla has none (limit M5). A custom generator is a liquid of the project's own with `mixing` (ADR 0108), which the Skyblock flow offers as an answer.
- **D5 What the void lacks.** Flows add, as plain data: a wandering trader `trade_set` with sand, red sand, saplings and the like; recipes; and loot table replacements for vanilla ids where a vanilla Skyblock pack would add them (dropped by an element with the vanilla id, G19). Each is an answer the user can turn off.
- **D6 Small starts by feature.** `fixed_placement` (Y8) is used only by the One block flow's optional start platform, with its per-version shape from `TargetFacts.worlds.fixedPlacementShape`.

## Consequences

- A void Skyblock is about ten generated files, all vanilla. A vanilla pack user must add the pack on the Create World screen to see the world type (limit M2); Play my game and the map export do it for them (ADR 0116).
- Islands larger than 48 per axis must be jigsaw pieces (limit M4).
- If Y1 fails, the Advanced route is not offered, and nothing else changes.

## Findings at the close (B562, 2026-11-23)

Reviewed against the merged code of B549, B551, B557 and B558: `packages/plugins/games/src/lowering/world-type.ts`, `start.ts`, `first-join.ts`, `world-setup.ts`, `validators-world-setup.ts`, `templates/world-setup.ts`, `packages/schemas/mcdoc/msm/vanilla_overlay.mcdoc`, the library's `starters/skyblock.ts`, `one-block.ts` and `sky-islands.ts`, and the tests `packages/plugins/games/test/world-setup.test.ts` and `packages/exporters/test/games-skyblock.test.ts`. The spike's answers are in [ADR 0117](0117-game-modes-flows-studios-try-it-and-tests.md) (Y1–Y8 apply here).

### Each decision's outcome

| Decision | Outcome |
|---|---|
| D1 World types | Built: a world preset `<ns>:<path>` with its three dimensions written inline (a `dimension` file would change every world's Nether or End); `void` a flat generator with no layers (Y6) over the project sky biome `<ns>:msm_games/sky` (plains-like spawns, no features; `the_void` spawns nothing, a plains-like list 61 to 70 monsters in 1,200 night ticks on a 33 by 33 platform, Y7); `flat` the layers; `sky_islands` the floating-islands noise settings over the overworld's biomes or one chosen biome; a void Nether or End a flat generator over the Nether wastes or the End biome. Each joins `#minecraft:normal` with the language key `generator.<ns>.<path>` (Y15); `preset` adds only the project's preset to the tag; `vanilla` writes nothing. A void End warns (a frame with all 12 eyes set does not light; 11 set and the last placed by a player does, Y5) and keeps the dragon fight, exit portal, egg and a gateway (Y5); a void Nether is an info (the game makes its own portal and platform). The world map draws void, flat and sky islands, since the preset is ordinary worldgen data. |
| D2 The start structure | Built as decided. The first-join route: `forceload add` 48 by 48 from `at`, `place template`, `forceload remove`, `setworldspawn` at `at + spawn`, the flag, `tp` to the block's middle (all in one tick, Y3). A first join into an empty void is placed at (8.5, -64, 8.5) and the advancement runs before any fall (Y2), so the moment of void limit M3 feared does not show. The Advanced route "Place it while the world generates" is built (Y1 go): a one-piece rigid jigsaw and the `dimension_origin` set `<ns>:msm_games/start` (`start_height` `at.y + 1`, listed in a flat overworld's `structure_overrides`); because the game turns the piece at random about (0, y, 0) and ignores `at`'s x and z, the validator warns, and it errs on a target without `dimension_origin`. The overlay is `vanilla_overlay.mcdoc` with `DimensionOriginPlacement {}` (no fields, Y1), so a hand-made structure set with it has a form; `tools/build-msm-mcdoc` allows an MSM member of a vanilla dispatcher only from that module. |
| D3 Chests | Built: the Skyblock chest holds a lava bucket, two ice, three wheat seeds, an oak sapling and four bone meal, through a loot table named in the island chest's SNBT (with its `id`); the Structure Studio's "Chests and containers" edits any chest (ADR 0116 D4). |
| D4 Generators | As decided; the Skyblock flow's "A generator of my own" asks for a liquid of the project's own and what it makes with water (ADR 0108). Try it has a mock generator (ADR 0117 D4). |
| D5 What the void lacks | Built in the Skyblock flow: wandering trader trades (sand, red sand, two saplings, sugar cane, pumpkin seeds; added to `minecraft:wandering_trader/common`) and the recipes gravel from cobblestone and sand from gravel, each an answer that can be turned off. No vanilla loot table is replaced by default. |
| D6 Small starts by feature | **Not built.** `fixed_placement` places nothing in a void world (a flat world with empty layers runs none of its biome's features) and 26.4 refuses an empty `positions` list (Y6, Y8). The One block flow's block sits on the world setup's start template, placed at the first join like any start; `fixedPlacementShape` stays a fact no lowering uses. |

### Open items

- In game: the End's pillars in a void End need the End biome's features (Y5, unchecked); wandering traders arriving over a void platform (Y7, not measured).
- The Skyblock flow keeps the End as normal: a void End would need an End portal frame in the island, which the flow does not draw.

## Status

Accepted with findings (2026-11-23, close B562; briefs B549, B551, B557). Vetoable defaults:

- the first-join route as the default, with the worldgen route under Advanced and its random turn warned about;
- a project sky biome with plains-like spawns in void worlds;
- the default Skyblock chest;
- Nether and End as normal unless chosen (the Skyblock flow offers an empty Nether, not an empty End);
- no change to vanilla's lava and water;
- the dimensions written inline in the world preset;
- no start platform by `fixed_placement` (D6 dropped on the spike's evidence).
