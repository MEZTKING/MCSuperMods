# packages/plugins/worldgen — `@msm/plugin-worldgen`

The worldgen kinds (14: biomes, configured and placed features, dimensions, world presets, noise settings, density functions, noises, carvers and the rest), their templates (`src/templates/`), lowering and the `worldgen.*` validators (ADR 0022). The general rules are in `packages/plugins/CLAUDE.md`; this file only adds what is particular to world generation.

## Vanilla reference pack

The user's measured facts for vanilla world generation live in `docs/reference/vanilla-worldgen/` (findings and tools only, no game code or assets):

- `docs/VANILLA-WORLDGEN-NOTES.md`: seeds, the decoration step order (`FeatureSorter`), heightmaps, surfaces, ores, trees and plants, jigsaw structures, data formats that bite;
- `docs/MEASURED-TABLES.md`: vanilla baselines (ores a chunk, plants by biome, village numbers) and the chunk sets behind them;
- `tools/feature_indices.txt`: every vanilla placed feature's step and index (171 entries).

Check templates, starters and flows against it before changing their placement or ordering. `test/reference-pack.ts` reads `feature_indices.txt` (tests only: the order is a version fact) and the template test checks that every biome template lists vanilla features in vanilla's order. The audit and its open decisions are in `docs/COVERAGE-AUDIT.md`, section "Worldgen accuracy against the reference pack".

## Rules of thumb from the pack

- A biome lists vanilla placed features as a subsequence of vanilla's step order, or a world that also has vanilla biomes can stop with "Feature order cycle".
- Trees: `count`, `in_square`, `surface_water_depth_filter` 0, `heightmap` `OCEAN_FLOOR`, `block_predicate_filter` `would_survive` of the sapling, `biome`; the soil under the trunk through `minecraft:soil_beneath_tree`.
- Ground plants (grass, berries, wild crops) use `WORLD_SURFACE_WG`; flowers, mushrooms, cane and pumpkins `MOTION_BLOCKING`. Patches filter by biome once at the centre, then spread their 32 tries with trapezoid offsets.
- Ores replace `#stone_ore_replaceables` and `#deepslate_ore_replaceables` with `tag_match` (implicit tag ids validate since the schemas fix of 2026-11-14).
- Block states in feature JSON are a string or `{ id, properties }`; structure `.nbt` palettes are `{ Name, Properties }`.

## Commands

- `pnpm --filter @msm/plugin-worldgen test`
