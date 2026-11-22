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

## Status

Proposed (2026-11-22). Vetoable defaults:
- the first-join route as the default;
- a project sky biome with plains-like spawns in void worlds;
- the default Skyblock chest;
- Nether and End as normal unless chosen;
- no change to vanilla's lava and water.
