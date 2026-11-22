# worldgen-parity

Parity fixture for the live world generation preview (ADR 0119 D13; plan brief B579). It holds the MSM project `worldgen_parity` once per target, its lowered data pack, and `expectations.json`: what the real game makes of those files, measured by a GameTest. B581 plays the same file through `@msm/terrain` at D13's tolerances. No vanilla file is ever committed here.

## What is here

- `mc-26.3/` and `mc-26.4/`: the project (`msm.project.json`, `content/`, plugins `msm.datapack` and `msm.worldgen`) and `lowered/data/`, the data pack MSM's export writes for it (worldgen, dimension, dimension type, tag and rule kinds lower one element to one file; no `pack.mcmeta`). Two projects because a project has one target: 26.4's noise settings have no `default_block`, 26.4 has `upscale` and `domain_warp` and no `interpolated`.
- `make_fixture.py`: writes both projects and their lowered data (`python3 fixtures/worldgen-parity/make_fixture.py` from the repository root; `--table` prints the table below). Every file is MSM's own, written from the data format (the targets' vendored mcdoc), never copied from vanilla.
- `expectations.json`: per target, per dimension, per seed (0, 12345, -7046235981325167892): the stored biome of 200 quart cells (`biomeCells`, quart x, y, z scattered over 2,048 blocks each way and the dimension's height) and 100 whole block columns (`columns`, block x and z: 25 in each of the chunks (0, 0), (-55, 66), (68, 27) and (45, -56)), each column from `minY` up as runs of block palette index and length. About 1.3 MB: 21 dimensions and 40,410 runs on 26.3, 29 dimensions and 44,616 runs on 26.4.
- `check_real_world.py`: checks the GameTest's way of measuring against an ordinary world (below).

Self-contained: own noises, named density functions, noise settings, named rules and conditions, six biomes (no carvers, no features), a biome tag, two dimension types (y 0 to 127; y -64 to 127). The game's surface code reads three noise ids by name; the project defines them with values of its own (`minecraft:surface`, `minecraft:surface_secondary`, `minecraft:clay_bands_offset`), so no world here depends on a vanilla file and the engine needs no jar to play it. Blocks are vanilla block ids (not files).

## The dimensions

Each isolates one group of types (namespace `worldgen_parity`):

| Dimension | Isolates | Targets |
|---|---|---|
| `aquifers` | aquifers (barrier, floodedness, spread, lava, exclusion, surface level) in caves below sea level, a world from y -64 | mc-26.3, mc-26.4 |
| `condition_hole` | the hole condition | mc-26.3, mc-26.4 |
| `condition_steep` | the steep condition on tall, steep land | mc-26.3, mc-26.4 |
| `condition_temperature` | the temperature condition over biomes near freezing on tall land | mc-26.3, mc-26.4 |
| `flat` | a flat generator: layers stacked from the bottom, an air layer, its biome | mc-26.3, mc-26.4 |
| `functions_choice` | min, max, range_choice, interval_select (its last function too), lerp, sign | mc-26.3, mc-26.4 |
| `functions_rounding` | floor, ceil, round, truncate (with and without multiple), sqrt, log, pow, div, reciprocal | mc-26.3, mc-26.4 |
| `functions_shape` | abs, square, cube, half_negative, quarter_negative, squeeze, clamp, negate | mc-26.3, mc-26.4 |
| `functions_space` | shift_a, shift_b, shift, noise shift fields, distance_to_point, gradient on x and z with tiling, slice | mc-26.3, mc-26.4 |
| `markers` | cache, interpolated (26.3) or upscale with linear axes (26.4), blend_alpha, blend_offset, blend_density, beardifier, old_blended_noise | mc-26.3, mc-26.4 |
| `plain` | noise terrain: gradient, noise, add, mul, constant, a named function, sea level, default block and fluid; one fixed biome | mc-26.3, mc-26.4 |
| `plain_legacy` | the same land with legacy_random_source true | mc-26.3, mc-26.4 |
| `rule_bandlands` | the bandlands rule | mc-26.3, mc-26.4 |
| `rule_ore_vein` | the ore_vein rule underground | mc-26.3, mc-26.4 |
| `rules_biome` | the biome condition by list and by tag, a named rule and a named condition, over a checkerboard | mc-26.3, mc-26.4 |
| `rules_depth` | sequence, condition, block; stone_depth (floor, ceiling, offset, surface depth, secondary range), y_above (multiplier, add_stone_depth), water, not | mc-26.3, mc-26.4 |
| `rules_noise` | noise_threshold (2D and 3D), vertical_gradient, a y_above relative to sea level | mc-26.3, mc-26.4 |
| `rules_preliminary` | above_preliminary_surface over the router chunk_surface_level (find_top_surface) | mc-26.3, mc-26.4 |
| `source_checkerboard` | a checkerboard biome source (scale 2, four biomes) | mc-26.3, mc-26.4 |
| `source_multi_noise` | a multi_noise biome source with a list of its own over the router's climate functions (depth from height) | mc-26.3, mc-26.4 |
| `spline` | spline with a nested spline, named functions as coordinates | mc-26.3, mc-26.4 |
| `upscale_b_spline` | upscale, every axis b_spline_cubic (cells 8, 4, 8) | mc-26.4 |
| `upscale_cosine` | upscale, every axis interpolate_cosine (cells 8, 4, 8) | mc-26.4 |
| `upscale_cubic` | upscale, every axis interpolate_cubic (cells 8, 4, 8) | mc-26.4 |
| `upscale_linear` | upscale, every axis interpolate_linear (cells 8, 4, 8) | mc-26.4 |
| `upscale_mixed` | upscale with a mode and cell size of its own on each axis | mc-26.4 |
| `upscale_nearest` | upscale, every axis nearest_neighbor (cells 8, 4, 8) | mc-26.4 |
| `warp_constant` | domain_warp with constant offsets | mc-26.4 |
| `warp_function` | domain_warp with functions as offsets | mc-26.4 |

## How it is measured

`engine-mod/parity`'s `WorldgenParityTest` (`msm_parity_tests:worldgen_parity_test_measures_every_dimension`). The parity jar carries this version's `lowered/data/` as mod data, `expectations.json` and its target id. The GameTest server makes no level of a data pack dimension and its world has one fixed seed, so for each dimension and seed the test parses the dimension with the server's registries and builds a level of its own whose `getSeed()` is that seed (the version seam `WorldgenLevels`; only vanilla constructors and methods are called). The level's own chunk pipeline makes the four column chunks to the `terrain` status (land, aquifers and surface; no carvers or features in the fixture). Biome cells come from fresh chunks after the generator's biome step alone; on every run the test checks that step against the level's own column chunks, cell by cell. Without `MSM_WORLDGEN_PARITY_WRITE` the measurements must equal the target's section exactly.

```sh
cd engine-mod
./gradlew -p parity worldgenParity [-Pmc=26.4]                         # check (about 1 minute warm)
./gradlew -p parity worldgenParity [-Pmc=26.4] -PupdateWorldgenParity  # rewrite this version's section
```

The task runs `tools/run-fabric-server` on a production GameTest server with the parity jar as both the mod and the tests (it needs `node` and JDK 25). After changing `make_fixture.py`, run it, then the task with `-PupdateWorldgenParity` on both versions. CI's `engine-mod` job runs the check on every version.

## Checked against real worlds (B579)

`check_real_world.py` makes the same dimensions in an ordinary world of the plain vanilla dedicated server with a given seed and compares the column chunks with `expectations.json`. On 2026-11-22, every dimension, 100 columns each: 26.3 with seed 0 (21 dimensions) and 26.4-snapshot-7 with seed -7046235981325167892 (29 dimensions) gave no miss. The only differences were grass under water or lava that random ticks had turned to dirt while the world ran (the script counts them apart: 23 and 17 columns in `aquifers`, 0 to 5 elsewhere). The project also loads in MSM with no problem, validates against the targets' schemas with none, and MSM's data pack export of it equals `lowered/data/` file for file (checked with the exporters' test helpers the same day).

```sh
JAVA_HOME=<jdk 25> python3 fixtures/worldgen-parity/check_real_world.py --target mc-26.3 --minecraft 26.3 \
  --pack-format 121 --seed 0 --dims plain,rules_biome,aquifers --work <scratch folder>
```

The pack format is the target's data pack format (`packages/targets`); the server jar is the one `tools/run-fabric-server` caches. Delete the work folder afterwards.
