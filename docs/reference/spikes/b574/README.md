# B574 spike: deepslate against the real game (live world generation)

Answers WS1 to WS18 of [`docs/PLAN-live-worldgen.md`](../../../PLAN-live-worldgen.md) for ADR 0119, measured on 2026-11-22 on this cloud machine (4 cores, 15 GB) for the targets 26.3 and 26.4-snapshot-7. Nothing here is built, linted or shipped.

Clean room: no Mojang method body was read; deepslate 0.27.2 (MIT) was read and its code adapted in `spike-src/`. Vanilla worldgen JSON was read from the Loom cache's client jars into the scratchpad at run time and deleted afterwards; no vanilla file, listing or game screenshot is kept here. The real worlds were made by the vanilla dedicated server (cached in `~/.cache/msm-fabric-server`), with MSM's own data pack of test dimensions (`spike-src/make_pack.py`, `make_fixture.py`), read with the reference pack's `region.py`, and deleted.

## What was run

- **Worlds:** seeds 0, 1, 12345 and -7046235981325167892 on each target. Per seed: six spots in the overworld, two in the Nether and the End, and two in each of MSM's eight test dimensions (`b574:clim_temperature`, `clim_humidity`, `clim_continentalness`, `clim_erosion`, `clim_depth`, `clim_weirdness`: nine biomes on one climate parameter each; `clim_mix`: 24 points of MSM's own; `checker`: a checkerboard), all over vanilla's own overworld noise settings. Each spot was `forceload`ed (2 by 2 chunks, which gives 6 by 6 full chunks and rings at the `terrain` and biome statuses), polled with `execute if loaded`, saved and stopped. One world took 60 to 220 s.
- **Comparison** (`spike-src/parity.mjs`): biome cells of every chunk that has them (about 6,000 a dimension and seed, 1,077,000 in all), and 16 columns in each of up to 24 `terrain` and 24 `full` chunks a dimension and seed (49,152 columns in all), as solid, water, lava and air, plus the top four blocks.
- **Speeds:** Node 24 (`speed.mjs`, `heights.mjs`) and a Web Worker in Electron 45.2.2 (Chrome 156) made from a `blob:` URL under the app's production CSP (`electron-main.mjs`; the page is `file://`, not `msm-app://`). Median and worst of five unless said. The servers and other runs shared the 4 cores during some Node runs, so Node numbers are pessimistic.
- `results/` holds every number below; `pictures/clim-mix-map.png` is a biome map and side cut drawn by the spike engine (MSM's own list over seed 0).

## The fixes deepslate 0.27.2 needs (found by WS1, proven by WS5 to WS8)

| # | Gap in 0.27.2 | Effect if left | What B578 does |
|---|---|---|---|
| F1 | The router field is `chunk_surface_level` in both targets; deepslate reads `preliminary_surface_level`. | `above_preliminary_surface` and the surface depth go wrong. | Rename in a pre-pass. |
| F2 | `y_above` and `water` conditions carry `add_stone_depth`; deepslate reads `add_surface_depth` (23 + 2 uses). | Those conditions ignore stone depth. | Rename in a pre-pass. |
| F3 | 26.4 noise settings have no `default_block` (the rule list ends with a `block` rule). | deepslate fills with an unnamed block. | Fill with a placeholder when absent; the rules decide. |
| F4 | 26.4 `upscale` (30 uses: final density, surface level, caves, ore veins). | Parsed as constant 0: flat nothing. | `upscale` with all axes `interpolate_linear` and equal x and z cells becomes deepslate's `interpolated` (exact, see WS8). |
| F5 | `interval_select` keeps one function too few (fixed in 0.27.3). | Cave entrances and 2D spaghetti lose their last band. | A pre-pass into nested `range_choice` (spike: changes about 5 % of underground air cells in 200 columns; no change in the parity sample), or 0.27.3. |
| F6 | `buildSurface` walks only the first z row and uses one biome for the chunk. | Surface rules wrong off the slice and at every biome border. | Our own surface pass over all 256 columns with a biome per cell (`engine.mjs` `buildChunk`). |
| F7 | Unknown types parse silently: density functions to 0, rules to "nothing", conditions to "false". | Silent wrong pictures. | The walker of WS1 reports them (`unsupported()`). |
| F8 | `multi_noise` with `preset` is not read (no parameter list registry). | Throws "At least one point is required". | Report and draw one biome (WS9). |
| F9 | Registries are static globals. | Two worlds in one worker would share them. | One world at a time per worker; refilling all registries takes 0.4 ms. |
| F10 | `interpolated` caches corners in an unbounded `Map` with string keys (32 % of the fill time). | Slow, and memory grows with every sample. | A per-chunk cell grid (spike: numeric keys alone made the fill 3.7 times faster, 866 to 236 ms a chunk, identical results). |

## WS1 Loading

Both targets: all 7 noise settings (overworld, large biomes, amplified, nether, end, caves, floating islands), 55 density functions, 64 or 65 noises, 42 or 44 named rules and 8 named conditions load with F1 to F4 (`results/ws1-loading.json`). Every type in those files (`results/ws1-walker.json`):

- **Unsupported, both targets:** rule types `bandlands` (2 uses), `ore_vein` (2); conditions `hole` (6), `steep` (5); `temperature` is not used by vanilla's files; chunk generators `flat` (4 presets) and `debug` (1); `multi_noise` `preset` (`minecraft:overworld`, `minecraft:nether`).
- **Unsupported, 26.4 only:** density function `upscale` (30 uses; handled by F4). `domain_warp` is in the registry but no vanilla file uses it.
- **Fields read by no parser:** `add_stone_depth` (F2), router `chunk_surface_level` (F1); `debug_functions`, `disable_mob_generation` and `spawn_target` of noise settings (not terrain: fine to ignore, but listed). No field is ignored inside density functions or noises.
- There is no `data/minecraft/dimension/` in either jar: the vanilla dimensions are inline in `worldgen/world_preset/*.json`.

## WS2 Biome map speed

| | Node 26.3 | Worker 26.3 | Worker 26.4 | Budget |
|---|---|---|---|---|
| Coarse 64 x 64, multi noise | 122 / 234 ms | 85 / 115 ms | 82 / 108 ms | 250 ms |
| Full 256 x 256, multi noise | 1,909 / 2,012 ms | 1,367 / 1,656 ms | 1,331 / 1,542 ms | 2 s |
| Full 256 x 256, fixed biome | 0.1 ms | 0.4 / 1 ms | 0.4 / 1 ms | |

The cost is the climate sampling, not the list: 24, 2,000 and 8,000 points of MSM's own take 1.9, 1.6 and 2.0 s for the full map in Node.

## WS3 Height speed

- deepslate's `getBaseHeight`: 6.4 ms a column (64 x 64 = 26 s). A density-only top search with the F10 cache: 10.6 ms a column at 16-block spacing, 1.5 ms at 4-block spacing (shared cells): 64 x 64 took 6 s. **The Height map misses its budget by about ten times.**
- `chunk_surface_level` (one value a column): 256 x 256 in 100 ms (Node) or 370 to 455 ms (worker), but 16 blocks off the real surface at the median (24 at p90, 134 at worst): usable only as a labelled first pass.
- **Side cut** 256 wide, full height (384): Node 1,008 / 1,415 ms; worker 794 to 861 / 880 to 1,277 ms (budget 1 s); every 4th column 207 ms.

## WS4 Terrain speed

- Stock deepslate in Node: 9 chunks fill 9.2 s, fill and surface 18 s (with a biome looked up for every block), 16 chunks 35 s.
- With F10 (spike patch) and biomes cached per cell, in the worker: **9 chunks 1.67 to 1.87 s median, 1.94 to 2.27 s worst; 16 chunks 2.49 to 2.98 s.** Budget 1.5 s: about 25 % over before the cell grid of F10 and before limiting the fill to the window's height (Try it's window is 32 of 384 blocks; the surface pass needs only the column above it). Memory: 12 MB of heap for 9 chunks in Node.
- Height 256 was not measured separately (vanilla's settings are 384 high); the fill scales with the height.

## WS5 Biome parity

| Target | Test dimensions (6 climate + mix, 4 seeds) | Checkerboard | End (`the_end` source) |
|---|---|---|---|
| 26.3 | **100.0 %** of 169,680 cells (worst dimension 99.87 %) | 100.0 % of 24,576 | 61.0 % of 24,076 |
| 26.4 | **66.8 %** | 67.9 % | 41.0 % |

- 26.3: deepslate's climate sampler and lookup are exact; the few misses are single cells on borders.
- 26.4: the stored biomes differ although every climate file is unchanged (`results/` and `spike-src/jitter.mjs`): on the checkerboard every observed cell is found within 6 quarts horizontally of deepslate's (borders become ragged), and on the climate dimensions only 69 % are found even within 6 quarts. So 26.4-snapshot-7 changes biome placement in code, not in data; it cannot be learned from the jar's files.
- The End: wrong on both targets (main island heights off by 1 to 7 blocks in 37 % of columns, outer islands mostly wrong, biomes 41 to 61 %). Not resolved in the spike.
- The vanilla overworld and Nether could not be compared: their parameter lists are not in the jar (WS9).

## WS6 Terrain parity

Pre-feature `terrain` chunks (26.3; 26.4 is the same within 0.4 points):

| | Cells same class | Surface height exact | off 1 | off 2 to 7 | off 8+ | Top four blocks exact | Columns exact | Columns exact ignoring carved cells |
|---|---|---|---|---|---|---|---|---|
| Overworld | 98.9 % | 93.5 % | 2.1 % | 2.5 % | 1.8 % | 94.6 % | 43.1 % | 72.6 % |
| Test dimensions | 98.7 % | 88.6 % | 4.6 % | 4.9 % | 1.8 % | 91.8 % | 38.0 % | 73.0 % |
| Nether | 94.8 % | 100.0 % | 0 | 0 | 0 | 99.8 % | 53.7 % | 97.5 % |
| End | 87.5 % | 50.8 % | 12.7 % | 28.5 % | 8.0 % | 98.4 % | 21.4 % | 91.1 % |

(1,536 columns a row, 10,752 for the test dimensions; `results/summary.json`.) What the misses are:

- **Carvers** (the game has air or fluid where the preview has stone): 0.66 % of all cells in the overworld and 0.81 % in the test dimensions (1.6 to 1.8 % of the cells 8 or more blocks underground), 5.1 % in the Nether, 12 % in the End (where part of it is the End's own error). The `terrain` status already holds the carvers.
- **Structures' terrain adaptation** (the beardifier is 0 in deepslate): land raised to a village's level over sea, seen in the test dimensions, which use vanilla biomes and so get vanilla structures.
- **Surface rules:** `bandlands` (badlands terracotta) and `steep` give most of the top-four misses; in full chunks features change the top (68.9 to 72.5 % exact).
- **Real density errors** (stone in the game, not in the preview): 0.10 to 0.14 % of cells (0.36 % in the End).

Tolerance proposed for ADR 0119 D13 (fixture of MSM's own files, own biomes without carvers or structures): biome cells 99.5 %; cell class 99 %; surface height exact 95 % and within one block 98 %; top four blocks 95 % where every type is supported. The vanilla CI step reports its rates against the table above and fails only below: biome 99.5 % (26.3), cell class 98 %, height exact 85 %.

## WS7 Aquifers and noise caves

Drawn and matching. Of all `terrain` cells (26.3), 0.36 % (test dimensions) and 0.28 % (overworld) differ in the fluid only (water, lava or air where both are open), and 0.10 % and 0.14 % are solid in the game but open in the preview, which bounds noise-cave and aquifer-barrier errors. Underground lava differs in 0.1 % of cells (2 % in the Nether, where carvers dominate).

## WS8 The newer target

- WS1, WS5 and WS6 on 26.4: above. Terrain matches 26.3's rates once `upscale` is mapped (F4); biomes do not (WS5).
- `upscale` is used by 9 vanilla files (30 uses), always with `interpolate_linear`; `domain_warp` by none.
- A fixture of MSM's own (`spike-src/make_fixture.py`: one plain terrain and five variants; 2,304 columns each, `results/fixture-26.4.json`) learned by observation alone:
  - `upscale` `interpolate_linear`: equals deepslate's `interpolated` (100 %).
  - `upscale` `nearest_neighbor`: the value at the cell's lower corner (100 %; rounding 34 %, the centre 16 %).
  - `upscale` `interpolate_cosine`: a lerp eased by (1 - cos(pi t)) / 2 (100 %; plain lerp 60 %).
  - `domain_warp` with constant offsets: the input sampled at (x + offset_x, y + offset_y, z + offset_z) (100 %; the opposite sign 3 %).
  - `domain_warp` with a function as offset: 82 % exact, within 2 blocks everywhere: not learned yet.
  - `interpolate_cubic` and `b_spline_cubic` were not tried (no vanilla use).
- So: learnable from a small fixture for linear, nearest and cosine `upscale` and constant warps; the rest stays limit WL6 until B581 adds fixture cases.

## WS9 The overworld's and Nether's biome lists

Not in the jar: `worldgen/multi_noise_biome_source_parameter_list/overworld.json` and `nether.json` hold only `{"preset": ...}`. Without reserve B592, Compare draws the vanilla overworld and Nether land with one biome colour and says so; land shape, aquifers and noise caves do not depend on the list and still draw (WS6), and surface rules then use that one biome. The spike drew surfaces from the biomes it read back from the world. **Reserve B592: go** (the only route to a vanilla biome layout; no route ships the list).

## WS10 Adding types

From outside deepslate, without forking it:

- `DensityFunction.fromJson(obj, inputParser)` takes the parser for children as an argument, and deepslate's classes are exported, so `@msm/terrain` can own a **parser front**: it handles its own types (`upscale`, `domain_warp`, later others) as subclasses of `DensityFunction` (they need `compute`, `mapChildren` and `range` so `RandomState`'s visitor wires their noises) and hands every other node to deepslate with itself as `inputParser`. Named functions go through the registry, which we fill with our front.
- Field renames and lossless rewrites (F1 to F5) are a JSON **pre-pass** before parsing.
- Rules and conditions have no hook (`MaterialRule.fromJson` recurses into itself): new ones (`bandlands`, `ore_vein`, `hole`, `steep`, `temperature`) need our own rule front for the whole rule tree, compiling to deepslate's `compile(context)` shape.
- The surface pass is ours anyway (F6).

## WS11 The jar

`data/minecraft/` paths for B577, both targets (counts and inflated bytes 26.3 / 26.4; `results/jar.json`):

- Terrain (needed for the map and ground): `worldgen/noise_settings` (7), `worldgen/density_function` (55), `worldgen/noise` (64 / 65), `worldgen/material_rule` (42 / 44), `worldgen/material_condition` (8), `worldgen/biome` (67 / 68), `worldgen/world_preset` (7), `worldgen/multi_noise_biome_source_parameter_list` (2), `worldgen/flat_level_generator_preset` (9), `dimension_type` (4): 265 / 269 files, 0.73 / 0.74 MB.
- Features, carvers and structures (waves 3 and 4): `worldgen/feature` (240 / 261), `worldgen/placed_feature` (273 / 299, already extracted today), `worldgen/block_state_provider` (8), `worldgen/carver` (4), `worldgen/structure` (52), `worldgen/structure_set` (21), `worldgen/template_pool` (245), `worldgen/processor_list` (40), `tags/worldgen/{biome,feature,flat_level_generator_preset,structure,world_preset}` (123 / 126).
- All of them: 1,271 / 1,325 files, 2.02 / 2.09 MB inflated, largest 53.5 KB (under the 16 MB entry cap). No `data/minecraft/dimension/`.
- Added extraction time: 28 to 29 ms median, 30 to 51 ms worst (fflate over the whole jar with a filter), plus writing the files.
- A cache schema bump (3 to 4): `readAssetCacheInfo` rejects any other `schemaVersion`, so the cache counts as missing and the user sees the existing set-up banner and extracts again with one click (`App.tsx` `extractAssets`); nothing re-extracts silently today. B577 decides whether to re-extract silently when the jar found before is still there.

## WS12 The worker

- The production CSP is `worker-src 'self' blob:`. A `blob:` worker running deepslate worked in Electron 45.2.2 under that CSP. A Vite module worker chunk (`?worker`, `worker.format: 'es'`) is already used under `msm-app://` by Monaco's language workers, so both routes work; **use a Vite module worker** (its own chunk, testable, no source string).
- Typed arrays: the spike passed plain JSON in and out; nothing blocks transferring `Uint16Array`s (B580).
- Weight (esbuild, minified): `deepslate/worldgen` barely tree-shakes: `Climate` alone is 254 KB (73 KB gzip), the whole engine set 270 KB (78 KB gzip), the spike's worker bundle with the engine code 299 KB. Since a Vite worker is bundled apart from the renderer (verify at implementation), the worker carries its own copy: about **0.30 MB in `app.asar`** for deepslate plus the engine, before `@msm/terrain`'s own features. The 0.3 MB budget of D14 is too tight; **0.45 MB** is realistic, or 0.3 MB if `ClimateMap` moves into the same worker and drops its own copy.

## WS13 A bigger area

- Not measured in the app (it needs the sim's `AREA_SIZE_*` changed, outside this brief). What assumes them: `packages/sim/src/types.ts` (the constants), `grounds/ground.ts` (2 uses), `world/sim-world.ts` (2), `entities/spawn.ts` (10), `entities/sim-entity.ts` (4), `player/collide.ts` (9), `player/pick.ts` (4), and `app/src/renderer/src/showcase/clip.ts` (9). Try it's renderer reads the size from its grid (`TryItGrid.sizeX/Y/Z`).
- Estimates from B565 and B385 (48 x 32 x 48 = 73,728 cells, full rebuild about 0.3 s, 22 to 38 frames a second under SwiftShader): 64 x 64 x 64 is 3.6 times the cells (full rebuild about 1.1 s) and 64 x 96 x 64 5.3 times; the top surface alone grows 1.8 times. Terrain for 16 chunks takes 2.5 to 3.0 s (WS4).
- **No-go for the first version**: the ground stays a 48 x 32 x 48 window aligned to whole chunks (9 chunks); reserve B594 measures in the app.

## WS14 The cost of an edit

From a changed noise settings field to a new coarse biome map (Node): parse 0.1 ms, refill every registry 0.4 ms, `new RandomState` 75 / 126 ms, coarse 64 x 64 biomes 149 / 190 ms: **about 225 ms**, inside 250 ms with nothing kept. Keep between edits: the `RandomState` when no noise, density function or router changed (sea level, rules, default blocks); the noise instances by id, seed and file hash; parsed functions by file hash (deepslate builds them lazily from the registry).

## WS15 Features

Across 67 / 68 biomes and 273 / 299 placed features (`results/features.json`): by biomes using them, `ore` 61, `spring_feature` 60, `simple_block` 58, `geode`, `monster_room`, `underwater_magma`, `disk`, `multiface_growth`, `freeze_top_layer` 56, `lake` 55, `block_column` 45, `random_selector` 40; inside selectors `tree` (91 configured), `simple_block` (65), `fallen_tree` (30). Placement modifiers by use: `biome` 2,727, `in_square` 2,659, `count` 2,239, `height_range` 1,978, `block_predicate_filter` 812, `rarity_filter` 692, `heightmap` 678, `offset` 479, `surface_relative_threshold_filter` 167, `environment_scan` 75, `surface_water_depth_filter` 43, `noise_threshold_count` 20, `random_chance` 10, `noise_based_count` 8, `count_on_every_layer` 8, `cuboid` 5, `randomly_selected` 2, `fixed_placement` 1 (18 types in both registries, not 19 as WF6 says).

- **First subset for B583:** feature types `tree`, `fallen_tree`, `simple_block`, `block_column`, `ore`, `scattered_ore`, `disk`, `freeze_top_layer`, `no_op`, and the selectors `random_selector`, `weighted_random_selector`, `simple_random_selector`, `random_boolean_selector`, `sequence` (needed to reach the trees); every placement modifier type, with `block_predicate_filter`, `environment_scan` and `surface_relative_threshold_filter` approximate. Left out first: `geode`, `monster_room`, `lake`, `spring_feature`, `underwater_magma`, `multiface_growth`, `fossil`, `huge_fungus`, the speleothem, coral, end, nether and vegetation-patch types.
- The sim has no tree growing (`tick/growth.ts`: "would become a tree in the game"). Quick world's oak shape (`grounds/quick.ts`) is pure and runs in a worker, but B583 draws trees from a tree's own trunk and foliage fields, with MSM's own shapes.

## WS16 Structure starts

deepslate's `StructureSet` and `StructurePlacement` put every `random_spread` start the game references at a chunk they predict: **136 of 136** (26.4, seeds 12345 and -7046235981325167892; read from the chunks' `structures.References`, because no chunk the spike read held an entry in `structures.starts`). The 2 `concentric_rings` starts (strongholds) were not checked: their placement needs the biome source, so not for the vanilla overworld without B592. The 26.3 worlds were dumped before this was added; the placement code and files are the same.

## WS17 Seeds

- By observation on both targets: text that is a whole number in range is that number (`-42` gives -42); any other text is Java's `String.hashCode` of it as a 32-bit number (`hello world` gives 1794106052, `B574 spike` -94177738, `99999999999999999999` 1260560192); the console's `/seed` agrees.
- The seed is in `data/minecraft/world_gen_settings.dat`, compound `data`, long `seed`, not in `level.dat`; the existing `readLevelSummary` does not read it. "Seed of one of my worlds" needs a small reader of that file (NBT, deepslate/nbt), in `@msm/interop` `world/` (B577 or B580).

## WS18 A newer deepslate

0.27.3 exists (published 2026-11-16; usable under the two-week rule from 2026-11-30). It fixes `interval_select` (F5) and adds the `dimension_origin` placement; it has none of `upscale`, `domain_warp`, `bandlands`, `ore_vein`, `hole`, `steep`, `temperature`, and keeps F1, F2, F6 and F10. Moving the catalogue pin from 0.27.2 to 0.27.3 changes two files of `lib/worldgen` only (`DensityFunction.js`, `structure/StructurePlacement.js`), so the structures plugin and interop are not affected (verify at implementation with their tests). Recommended once eligible; F5's pre-pass covers the time before.

## Go or no-go

| Decision | Verdict |
|---|---|
| ADR 0119 D3, deepslate as the engine | **Go**, with F1 to F10 in `@msm/terrain` (pre-pass, parser front, own surface pass, own cell-grid fill, one world a worker). |
| D6 levels on 26.3 | Biomes of noise worlds, land shape, aquifers, noise caves, surface of the supported types, flat, fixed and checkerboard sources: **as in the game, checked**. The End (terrain and the `the_end` source): **approximate** until fixed. |
| D6 levels on 26.4 | Land shape as on 26.3 (with F4). **Biome layout approximate** (67 % of cells): a code change of the snapshot, labelled as such; re-measure on the next 26.4 build. |
| D8, a bigger ground area | **No-go** for the first version: 48 x 32 x 48, aligned to 3 x 3 chunks; B594 stays in reserve. |
| D13 tolerance | As in WS6 (fixture: 99.5 / 99 / 95 / 98 / 95 %; vanilla CI step: 99.5 % biomes on 26.3, 98 % cells, 85 % heights). |
| D14, coarse map 250 ms | **Go** (82 to 85 ms median, 108 to 115 ms worst in the worker). |
| D14, full map 2 s | **Go for Biomes** (1.33 to 1.37 s median, 1.54 to 1.66 s worst). **No-go for Height as drafted** (about 10 times over): B578 adds a per-column cache of the parts of the density that do not depend on height and a cell-grid search; until it meets 2 s, Height shades from a coarser grid and says "Drawing…" longer. |
| D14, side cut 1 s | **Go**, at the edge (0.79 to 0.86 s median, up to 1.28 s worst): coarse every 4th column first (0.2 s). |
| D14, ground 1.5 s | **Go with conditions**: 1.67 to 1.87 s median today for 9 full chunks with the spike's patch; F10's cell grid and filling only the window's height bring it under. |
| D14, size 0.3 MB | **Raise to 0.45 MB**, or keep 0.3 MB by moving `ClimateMap` into the worker. |
| Plan stop rule | Not triggered: only the Height map misses by an order of magnitude, and it has a route. |
| Reserve B592 (biome list from the dev mode) | **Go**: the only route to vanilla's overworld and Nether layouts. |
| Reserve B593 (carvers) | **Hold**: carvers make 0.8 % of cells and are code; the data gives only their configuration. |
| Reserve B594 (bigger area) | **Hold** (WS13). |
| Reserve B595 (structures in the ground) | **Hold**; WS16 shows start chunks are exact, so the markers of B585 can be. |
| D16, a plugin API fact | **Needed**: which jar data folders a target has (the list above, per target) and which parts are approximate on a target (26.4's biome layout), so `@msm/terrain` holds no version literal. B577 adds it as plugin API 1.22.0 (or the number the main session gives). |

## Interface for B576 (`packages/terrain/src/api.ts`)

```ts
/** Registry folder key ('worldgen/noise_settings', 'dimension_type', 'tags/worldgen/biome', ...) to id to JSON. */
export type WorldgenFileMap = Readonly<Record<string, Readonly<Record<string, unknown>>>>;
/** Project files laid over vanilla's (the jar cache's), in data pack order: a project id replaces vanilla's. */
export interface WorldgenFiles { readonly vanilla: WorldgenFileMap | null; readonly project: WorldgenFileMap; }
/** What the target says (plugin API fact): data folders, types the game has, parts approximate on it. */
export interface TerrainTargetFacts { readonly dataFolders: readonly string[]; readonly approximate: readonly ('biome_layout' | 'end')[]; }
export type TerrainSource = { readonly dimension: string } | { readonly preset: string; readonly dimension: string };
export interface TerrainWorldInput { readonly files: WorldgenFiles; readonly source: TerrainSource; readonly seed: bigint; readonly facts: TerrainTargetFacts; }
export interface Unsupported {
  readonly kind: 'density_function' | 'material_rule' | 'material_condition' | 'biome_source' | 'chunk_generator' | 'feature' | 'placement' | 'carver' | 'field' | 'file';
  readonly type: string;          // e.g. 'minecraft:bandlands', or 'multi_noise.preset'
  readonly where: string;         // the file id it was found in
  readonly drawnInstead: string;  // plain words for the notes
}
export interface TerrainWorld {
  readonly generator: 'noise' | 'flat' | 'debug';
  readonly minY: number; readonly height: number; readonly seaLevel: number;
  readonly biomesKnown: boolean;  // false when a multi_noise preset is missing (WS9)
  unsupported(): readonly Unsupported[];
}
export function createTerrainWorld(input: TerrainWorldInput): TerrainWorld;
/** x0, z0 in blocks; step in blocks (multiple of 4 for biomes); y for biomes and value maps. */
export interface MapRegion { readonly x0: number; readonly z0: number; readonly width: number; readonly depth: number; readonly step: number; readonly y?: number; }
export interface PaletteGrid { readonly palette: readonly string[]; readonly cells: Uint16Array; }
export function sampleBiomes(world: TerrainWorld, region: MapRegion): PaletteGrid;
export function sampleHeights(world: TerrainWorld, region: MapRegion, kind: 'surface' | 'ocean_floor'): Int16Array;
export interface SliceRegion { readonly axis: 'x' | 'z'; readonly at: number; readonly from: number; readonly to: number; readonly step: number; readonly yStep: number; }
export function sampleSlice(world: TerrainWorld, region: SliceRegion): PaletteGrid;
export function sampleValues(world: TerrainWorld, fn: string | unknown, region: MapRegion | SliceRegion): Float32Array;
/** A window as Try it's GroundBlocks: size, palette and a Uint16Array in x, z, y order (as `@msm/sim`'s ground). */
export interface ColumnWindow { readonly x0: number; readonly z0: number; readonly y0: number; readonly sizeX: number; readonly sizeY: number; readonly sizeZ: number; }
export type ColumnStage = 'terrain' | 'surface' | 'features';
export function buildColumns(world: TerrainWorld, window: ColumnWindow, stage: ColumnStage): { readonly size: { x: number; y: number; z: number }; readonly palette: readonly string[]; readonly blocks: Uint16Array; readonly notes: readonly Unsupported[] };
/** The worker protocol: a newer token cancels older work; answers come coarse first. */
export type TerrainRequest =
  | { readonly type: 'world'; readonly token: number; readonly input: TerrainWorldInput; readonly filesHash: string }
  | { readonly type: 'biomes' | 'heights' | 'slice' | 'values' | 'columns'; readonly token: number; readonly filesHash: string; readonly pass: 'coarse' | 'fine'; readonly region: MapRegion | SliceRegion | ColumnWindow; readonly fn?: string | unknown; readonly stage?: ColumnStage }
  | { readonly type: 'cancel'; readonly token: number };
export interface TerrainAnswer { readonly token: number; readonly type: TerrainRequest['type']; readonly pass: 'coarse' | 'fine'; readonly ms: number; readonly data: PaletteGrid | Int16Array | Float32Array | ReturnType<typeof buildColumns>; readonly notes: readonly Unsupported[]; }
/** How a typed seed becomes a number (WS17). */
export function seedFromText(text: string): bigint;
```

## Limits found (for the plan's WL table)

- WL15 (new): **structures' terrain adaptation** (villages raise or cut land) is not drawn; the beardifier is 0.
- WL16 (new): **the End** is approximate on both targets.
- WL17 (new): **26.4-snapshot-7's biome layout** is approximate (a code change of the snapshot).
- WL6 gains: `domain_warp` with function offsets, `upscale` cubic modes, `bandlands`, `ore_vein`, `hole`, `steep`, `temperature` until B581 adds them by fixture.
