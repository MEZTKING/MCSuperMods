# Plan: Live world generation

**Status: draft (2026-11-22).** Brief ids B574–B595; [ADR 0119](adr/0119-live-worldgen-preview.md) (Proposed). Starts after vanilla parity 3 batch 2 closes (B544) and the Showcase closes (B572). Nothing after Wave 0 starts before the spike B574 has reported.

Working plan for the user's request of 2026-11-22: "Can we make custom world generations if not make it an option. Everything should be visible live". Custom world generation already exists as data (fact WF7); what is missing is seeing it. That message is also the agreement DESIGN [Open Question 15](DESIGN.md#18-open-questions) and reserve brief B84 waited for ([ADR 0023](adr/0023-structure-and-climate-previews.md)), and it sets a standing user rule, **Everything visible live**, recorded in ADR 0119 D1, `docs/HANDOFF.md` and `docs/ROADMAP.md`. Written 2026-11-22 by the orchestrator at 30b3fed (branch `ccr-d077e76e-4gnbx2`). Every "today" claim below was checked against the code at that commit (fact table WF1–WF22); every claim about speed, parity with the game and what deepslate does with real vanilla files is a spike question (WS1–WS18) or carries "(verify at implementation)".

## In plain words

- **What you can make.** A world of your own: its land (hills, towering peaks, floating islands, caves only, flat, nothing at all), its biomes and where they lie, what the ground is made of, and what grows and is buried in it. All of this can be made today, as worldgen elements and through the Dimension flow; this plan makes it an offer a beginner can find (**Make a world** on Home, five Creator flows) and, above all, makes it visible.
- **What you see.** While you edit a dimension, a world type, noise settings, a density function or a biome, the preview panel shows a **map** of that world from above (biomes, or the height of the land as shading) and a **side cut** through it, redrawn after every edit: a rough picture at once, the sharp one a moment later. You choose the seed and where to look, drag and zoom, and can lay it beside the vanilla world of the same seed (**Compare with vanilla**).
- **Walk in it.** Try it gains a ground, **My world generation**: the land around you is made by your own dimension or world type, with its surface blocks and, where the preview can, its trees, plants and ores. Edit the world while standing in it and the land changes.
- **How it is made.** MSM does not run Minecraft. It uses deepslate's worldgen code (MIT, by Misode, already inside the app) to work out the same numbers from the same files the game reads: your project's files, and for everything vanilla, the worldgen files inside your own Minecraft jar, read on your machine as your textures are. Nothing of Mojang's is shipped, exported or sent anywhere.
- **Honest.** Biomes and the shape of the land are checked against the real game. Trees, plants and ores are placed "about right" and say so. Caves made by carvers and buildings (structures) are not drawn in the first version, and the view says that too. Play stays the real check.
- **Everything visible live.** The same rule is applied to the whole app: an audit lists every kind that still has no live view, with the brief or ROADMAP line that will give it one.
- **What it is not.** No terrain painting, no editing blocks of a generated world in the app, no running the game's own generator, no vanilla files in the repository or the installer.
- **Build first:** the spike and the audit; then the engine and the jar reading; then the map; then the Try it ground; flows, clips and tests last.

## What exists to build on

Checked at 30b3fed. "As is" means used without change; "missing" names what this plan builds.

| Piece | Today | Reuse as is | Missing |
|---|---|---|---|
| Worldgen as data | 14 worldgen kinds, each lowering 1:1 to a JSON file; Biome, Placed Feature, Tree and Dimension Type Studios; the Dimension flow with seven terrains (WF7, WF14, WF15) | All of it: the preview reads what these lower to | A Studio for noise settings and world presets is not in this plan (schema forms stay) |
| Preview panel | Routes on `previewKind`; dimensions and world presets show the 2D climate map (WF8) | The panel, its lazy loading, the 2D canvas route outside the WebGL gate | Map, side cut and value views for eight more kinds |
| deepslate | 0.27.2 with `deepslate/worldgen`: `NoiseChunkGenerator`, `RandomState`, `NoiseRouter`, `DensityFunction`, `MaterialSystem`, `Aquifer`, biome sources, structure placement (WF1, WF2) | As the terrain and biome engine | Two density function types of the newer target, two surface rule types, three surface conditions; every feature, placement modifier and carver; the flat generator (WF3–WF5) |
| Vanilla worldgen files | Not in the repository; the jar extraction keeps only placed features from `data/` (WF9, WF16) | The extraction, its cache and its "set up your Minecraft folder" banner | The worldgen and dimension folders, cache schema 4, a bulk read |
| Try it grounds | Grid, Flat world, Quick world, From my world over a 48 by 32 by 48 area; a ground is a palette and an index array (WF10, WF11) | `GroundBlocks`, `loadGround`, the picker, the vanilla-blocks-as-props rule | A ground made by the project's own generator, updated on edit |
| Try it speed | Full build about 0.3 s; 22–38 frames a second on grounds under SwiftShader (WF12) | The baseline | Whether a taller or wider area is affordable (WS13) |
| Workers | Try it's script worker (a `blob:` worker) and the plugin sandbox workers run under the production CSP (ADR 0085 findings) | The pattern | A worldgen worker with a request protocol |
| Reference | `docs/reference/vanilla-worldgen/` (notes, measured tables, a region reader), `tools/run-fabric-server`, the target's `feature-order.json` (WF16, WF19) | For the spike's measurements and the feature order | A standing parity fixture |
| Showcase | Clip grounds `grid`, `flat`, `quick` (WF17) | The clip player | A `generated` clip ground and the world clips |
| Game modes plan | Void, flat and sky island world types and a void ground are its B551 and B558 (WF20) | Its world types, once landed | See "Overlaps" |

## The live surfaces

### (a) The preview panel

One new preview kind, `worldgen_map`, drawn on a 2D canvas (so it works without WebGL and is testable headlessly). The climate map stays as a tab ("Climate") beside it. Every view redraws after an edit: 150 ms after the last change a coarse picture is asked for, then finer passes replace it; a newer edit cancels older work (ADR 0119 D5, budgets D14).

| Kind | View | Notes |
|---|---|---|
| `minecraft:dimension` | **Map** (Biomes, Height), **Side cut**, **Climate** | Noise generator: full. Flat generator: its layers as a column and a flat map. Debug generator: a line saying it is only in the game. |
| `minecraft:worldgen/world_preset` | The same, with one tab per dimension the preset names | Vanilla dimensions it names come from the jar. |
| `minecraft:worldgen/noise_settings` | Map and Side cut inside a host | Host picker **Seen in**: a project dimension that uses these settings, else a plain host (these settings with one biome). |
| `minecraft:worldgen/density_function` | **Value map**: a slice from above at a chosen height, or a side cut; a colour ramp, the value under the mouse | Host picker for functions that read the router; none needed for self-contained ones. |
| `minecraft:worldgen/noise` | Value map of the noise alone | No host. |
| `minecraft:worldgen/biome` | The host's map with this biome lit and the rest dimmed, its share of the view, **Find it** (jumps to the nearest cell) | Host picker: dimensions and presets whose biome source can choose it. |
| `minecraft:worldgen/multi_noise_biome_source_parameter_list` | Map (Biomes) in a plain host | |
| `minecraft:worldgen/material_rule`, `material_condition` | Side cut and a "top blocks" map in a host, the blocks this rule sets lit | Host picker. |
| `minecraft:worldgen/flat_level_generator_preset` | Layer column | Also offered as a Try it ground through its dimension. |
| `minecraft:worldgen/feature`, `placed_feature` | **Scatter**: a patch of flat land from above with this feature placed by its modifiers; **Walk in it** | Approximate (WL3); wave 4. |
| `minecraft:worldgen/block_state_provider` | A strip of sample picks | Wave 4. |
| `msm:biome_addition` | The host's Scatter and Try it ground with the addition on or off | Wave 4. |
| `minecraft:worldgen/carver` | A line: "Carved caves show only in the game" | Limit WL4; reserve B593. |
| `minecraft:dimension_type` | The Side cut of a dimension that uses it draws its lowest and highest block lines | The sky is already a Try it choice. |
| Structures (`structure_set`) | Markers on the Map where a structure may start | Wave 4, approximate (WL5). |

Every view names what it could not draw, by type and in plain words ("This world uses `upscale`, which the preview cannot work out yet; that part is left flat"), in the panel's notes; silence is not allowed (ADR 0085 D5's rule).

### (b) Try it ground "My world generation"

A fifth ground in the picker. The user picks a project dimension or world preset (default: the element open in the editor, else the first one), the seed and a position. The ground is a window cut from the generated world: the area's 48 by 48 blocks around the position, and 32 blocks of height placed so the surface at the centre sits a third of the way up; **Move up** and **Move down** shift the window, **Make the land around me** recentres it on the player. If WS13 gives a go, this ground alone uses a larger area (64 by 64, up to 96 high, 16 chunks); otherwise the window stays and tall land is cut at the top with a line saying so (WL8).

Stages, each shown as soon as it is ready: terrain (stone, water, air), then the surface rules (grass, sand, snow), then features of the chosen subset (trees, plants, ores, the project's biome additions). An edit to any worldgen element the ground reads regenerates it in place within the budget and keeps the player's position (lifted to the new surface if buried); blocks the user placed are kept where they still fit and counted in one "What happened" line when they are not. Vanilla blocks are props, as in every ground (ADR 0085 L10); project blocks named by surface rules and features are the real project blocks.

### (c) Controls

- **Seed**: a text box (numbers, or words hashed the way the game hashes a typed seed, WS17) and a dice button. One seed per project, shared by the panel and the ground, kept with the app's view preferences (never in the project file). **Seed of one of my worlds** reads a save's seed where the reader can (WS17).
- **Position**: drag to pan, wheel or buttons to zoom (1 pixel to 1, 4 or 16 blocks), X and Z boxes, **Go to spawn** (0, 0), a height slider for slices. **Walk in it** on the map opens Try it on the ground at that seed and place; **Show on the map** in Try it does the reverse.
- **Compare with vanilla**: a toggle. Beside or under a swipe line, the vanilla world of the same seed and place: the overworld for a noise world, or the vanilla settings the element started from when it names one. Needs the jar; without it the toggle is off with the set-up link.

### (d) An option for beginners

A Home tile **Make a world** (Very easy: under Make) and five Creator flows from one starter, each with a live map in the wizard's preview that follows the answers, and a clip candidate for the Showcase.

| Flow | Questions | Makes | Live clip candidate |
|---|---|---|---|
| **Islands** | Size of the islands, how much sea, biomes (a list), trees (few, many) | A world preset, an overworld dimension, noise settings written by MSM (not a copy of vanilla's), a biome list | The camera flies low over sea and islands; caption "Your own seed makes your own islands." |
| **Tall mountains** | How tall, how jagged, snow line, biomes | The same, with a peaks terrain of MSM's own | A slow rise up a cliff face to the peaks |
| **One biome everywhere** | Which biome (vanilla, or one of the project's), land shape (vanilla's, hills, flat) | A preset with a fixed biome source | A walk through an endless cherry grove |
| **Caves only** | Roof or open top, what the rock is, lava or water lakes, glow | A preset with cave terrain and a dimension type without sky light | A torch-lit walk through a cavern |
| **Empty sky with a start island** | Island shape, biome | A void preset; **the start island, chest and kit are the game modes plan's** (its Skyblock flow, B551 and B557). Before that plan lands this flow makes the empty world only and says where the island will come from; after it, the flow hands over to Skyblock. | The island alone in the sky, the camera circling |

The flows write their own noise settings and density functions from MSM's own recipes, so they preview without the jar; "like the overworld" choices name vanilla settings and need the jar to preview (the game itself always has them). The Dimension flow gains the same live map in its wizard and a **Walk in it** line at its end.

### (e) The "everything visible live" audit

The rule (ADR 0119 D1): every kind that makes something a player can see or hear has a live view in the app, in the preview panel, in its Studio or in Try it, that follows edits within a time budget; a kind with nothing to see is listed as exempt with the reason; a brief that adds a kind names its live view or adds its audit line.

The table below is the orchestrator's reading at 30b3fed from `previewKind`, the Studios' preview files and ADR 0085. It is grouped; brief **B575** checks every one of the kinds in the running app and writes the full per-kind table to `docs/LIVE-VIEW-AUDIT.md`, which the close links from `docs/COVERAGE-AUDIT.md`.

| Group | Has a live view today | No live view yet | Follow-up |
|---|---|---|---|
| Worldgen (14 kinds) | Dimension and world preset: climate map only | Biome, feature, placed feature, noise settings, density function, noise, carver, flat preset, parameter list, block state provider, material rule and condition | This plan (B582, B585); carver: limit WL4, reserve B593 |
| Structures | Structure template (3D); pieces in the Structure Studio | Jigsaw assembly from a start pool; structure and structure set in a world; processor lists | Markers in B585; ROADMAP line "Live views 4: assembled structures" |
| Resource pack | Model, block definition, item definition (3D); equipment through the armour preview | Font (sample text), sounds (a play button per event, to be checked), shader and post effect, waypoint style, atlas and pack settings (exempt) | ROADMAP line "Live views 3: looks" |
| Blocks and items | `msm:block` (type preview, Try it), `msm:item` (Try it, item preview), `msm:particle` (Particle preview, Try it), `msm:fluid` and portals (Try it) | `msm:effect` (icon and chip only), `msm:potion` (bottle colour), `msm:creative_tab` (a mock-up of the tab), `msm:loot_addition`, `msm:mod` (exempt) | ROADMAP lines "Live views 2" and "Live views 3" |
| Entities and models | Geo model, animation, entity, vehicle (3D); traders and village jobs (Try it merchant mock-up) | Mob variants of vanilla animals (wolf, cat, pig, cow, chicken, frog and the rest), villager type looks | ROADMAP line "Live views 3: looks" |
| Controls | `msm:hud` (HUD preview), `msm:key_bind` (Try it) | — | — |
| Rules and scripts | Rule books and scripts (Try it's "What happened"), `msm:command` (Try it's chat box) | `msm:game_rule`, `msm:stat` (exempt unless the audit finds a view worth having) | Audit decides |
| Data pack | Recipe (the grid is the editor) | Loot table (a **Roll it** list), advancement (the tab as a tree), tag (the resolved members), predicate and item modifier (tried on a sample), enchantment (tooltip and level table), dialog (mock-up screen), damage type and chat type (a sample line), painting, banner pattern, trim pattern and material, pot pattern (on their models), jukebox song and instrument (play), trades and trade sets (merchant mock-up), function (what Try it's command reader understands of it), timeline, world clock, trial spawner, test kinds and providers (exempt or audit decides) | ROADMAP lines "Live views 2: data" and "Live views 3: looks" |

Follow-up batches, added to ROADMAP as ideas (each needs its own short plan; none is in this plan's briefs): **Live views 2: data** (loot rolls, advancement tree, tag members, predicates on a sample, enchantment table, dialogs, sample lines); **Live views 3: looks** (painting, banner, trim, pot pattern, mob variants, font, potion and effect, creative tab, shader on a still frame, sounds); **Live views 4: assembled structures** (jigsaw assembly, structures in the generated ground).

## Fact table (WF1 to WF22)

Read from the code at 30b3fed.

| # | Fact | Where |
|---|---|---|
| WF1 | deepslate is pinned at 0.27.2 in the pnpm catalogue and used by the app, `@msm/interop` and the structures plugin; MIT, by Misode. | `pnpm-workspace.yaml`, `app/package.json`, `node_modules/.pnpm/deepslate@0.27.2/.../LICENSE` |
| WF2 | `deepslate/worldgen` exports `NoiseChunkGenerator` (`buildTerrain`, `getBaseHeight`, `computeBiome`), `RandomState(settings, seed: bigint)`, `NoiseRouter`, `NoiseGeneratorSettings.fromJson`, `NoiseSettings`, `DensityFunction`, `MaterialSystem` with `MaterialRule` and `MaterialCondition`, the older `SurfaceSystem`, `Aquifer`, `Heightmap`, `WorldgenRegistries` (`NOISE`, `DENSITY_FUNCTION`, `NOISE_SETTINGS`, `MATERIAL_RULE`, `MATERIAL_CONDITION`, `BIOME`), `BiomeSource` (multi noise, fixed, checkerboard, the End), `Climate`, and `structure/` (`StructureSet`, `StructurePlacement`, `StructureTemplatePool`, `WorldgenStructure`). | `lib/worldgen/*.d.ts` |
| WF3 | Its density function parser knows every type in the 26.3 target's `worldgen/density_function_type` registry. The 26.4 target's registry adds `domain_warp` and `upscale`, which it does not know, and no longer lists `interpolated`. | `lib/worldgen/DensityFunction.js`; `packages/targets/mc-26.3|mc-26.4/vendor/mcmeta/registries.json` |
| WF4 | `MaterialSystem` parses rule types `block`, `sequence`, `condition` and condition types `above_preliminary_surface`, `biome`, `noise_threshold`, `not`, `stone_depth`, `vertical_gradient`, `water`, `y_above`, and reads named rules and conditions (both are registries in both targets). Both targets also list rule types `bandlands` and `ore_vein` and condition types `hole`, `steep` and `temperature`, which it does not parse. | `lib/worldgen/MaterialSystem.js`; the same registries |
| WF5 | deepslate has no features, placement modifiers, carvers or flat generator, and places no structure pieces. | `lib/worldgen/` |
| WF6 | Both targets: chunk generators `debug`, `flat`, `noise`; biome sources `checkerboard`, `fixed`, `multi_noise`, `the_end`; parameter lists `nether` and `overworld`; 19 placement modifier types; carver types `canyon` and `cave`; structure placements `concentric_rings`, `dimension_origin`, `random_spread`. | The same registries |
| WF7 | The worldgen plugin contributes 14 kinds (biome, feature, placed feature, dimension, world preset, noise settings, density function, noise, carver, flat preset, parameter list, block state provider, material condition, material rule), each lowering 1:1 to JSON; only dimension and world preset declare a `previewKind` (`climate_map`). | `packages/plugins/worldgen/src/kinds/` |
| WF8 | `PreviewPanel` routes on `ElementKind.previewKind` (a string in the plugin API, so a new value needs no API change); `ClimateMap.tsx` is a lazy 2D canvas and already imports `Climate` from `deepslate/worldgen`. | `app/src/renderer/src/preview/`, `packages/plugin-api/src/contributions.ts` |
| WF9 | The jar extraction keeps models, block and item definitions, block and item textures, the English lang file and `data/minecraft/worldgen/placed_feature/*.json`; nothing else from `data/`. The cache is `<msmHome>/cache/assets/<version>/`, schema 3; an entry over 16 MB is skipped. | `packages/interop/src/minecraft-install/extract.ts`, `cache.ts` |
| WF10 | Try it's area is 48 by 32 by 48 (`AREA_SIZE_X|Y|Z`); grounds are `grid`, `flat`, `quick`, `world`; a ground is `GroundBlocks` (a palette of state strings and a `Uint16Array`), built with `GroundBuilder`, which takes a size; `LocalWorldSource.loadGround(kind, ground)` copies it in. Quick worlds use MSM's own value noise. | `packages/sim/src/types.ts`, `grounds/`, `local-source.ts` |
| WF11 | The app side keeps `GroundChoice`, the picker's words and the user's presets; From my world reads an area in main through `@msm/interop` `world/` (region, chunk, level, area). | `app/src/renderer/src/tryit/grounds.ts`, `GroundPicker.tsx`; `packages/interop/src/world/` |
| WF12 | Measured for Try it: chunk size 8; full build about 0.3 s; under SwiftShader 33–38 frames a second at 640 by 360, grounds 22–38. | ADR 0085 findings D11 |
| WF13 | `app.asar` 29.8 of 32 MB, renderer 16.7 of 18 MB; stop lines 31 and 17.5 MB; the next asar reserve is gzip (ADR 0079 D4). | `docs/HANDOFF.md` |
| WF14 | Worldgen Studios: Biome, Placed Feature, Tree, Dimension Type. Noise settings, density functions, world presets and dimensions use the schema form. | `app/src/renderer/src/studios/worldgen/` |
| WF15 | The Dimension flow offers seven terrains; six name vanilla noise settings by id (`minecraft:overworld`, `amplified`, `floating_islands`, `caves`, `nether`, `end`), the seventh is flat. | `packages/plugins/library/src/starters/dimension.ts` |
| WF16 | The targets vendor mcmeta registries, vanilla-mcdoc and `worldgen/feature-order.json`; no vanilla worldgen JSON is in the repository. | `packages/targets/mc-*/vendor/` |
| WF17 | A showcase clip's ground is `grid`, `flat` or `quick`. | `app/src/renderer/src/showcase/clip.ts` |
| WF18 | Home's tiles are data (`MakeTileAction`), hidden when their flow is not offered. | `app/src/renderer/src/components/home/tiles.ts` |
| WF19 | The reference pack holds notes, measured tables and a region reader for the user's own worlds, with no game code; `tools/run-fabric-server` starts a real server. | `docs/reference/vanilla-worldgen/README.md`, `tools/` |
| WF20 | The game modes plan owns the void, flat and sky island world types (`msm:world_setup`, ADR 0114), the start structure and a void Try it ground (B551, B558). | `docs/PLAN-game-modes.md` |
| WF21 | On both targets `worldgen/feature` and `worldgen/carver` are the folders (they replace `configured_*`), and biome colours and spawns are attributes. | `docs/HANDOFF.md` "Earlier lessons" |
| WF22 | The level reader gives world names; it does not read a seed today. | `packages/interop/src/world/level.ts` |

## Spike questions (WS1 to WS18)

For B574, on both targets unless said. Times are the median and worst of five on the CI-class machine, in a Web Worker in the real app where the question says "in the app", else in Node.

- **WS1 Loading.** Does deepslate 0.27.2 load vanilla's own noise settings (overworld, large biomes, amplified, nether, end, caves, floating islands), density functions, noises and named surface rules from the jar's files? A walker lists every `type` value in those files against what the parsers know (WF3, WF4), and every field a parser silently ignores.
- **WS2 Biome map speed.** A 256 by 256 map at one sample per 4 blocks, and its 64 by 64 coarse pass, in the app's worker: overworld, a fixed biome, the fixture dimension.
- **WS3 Height speed.** Heights for the same map (`getBaseHeight` per sample against a coarser grid with shading); the cost of the side cut (256 wide, full height).
- **WS4 Terrain speed.** `buildTerrain` with the surface pass per chunk, for 9 and for 16 chunks, at heights 256 and 384; memory in the worker.
- **WS5 Biome parity.** Against a real 26.3 world from `tools/run-fabric-server` for seeds 0, 1, 12345 and one large negative seed: at least 1,000 biome cells a seed read from the region files.
- **WS6 Terrain parity.** For the same worlds, at least 500 columns a seed in fully generated chunks: the solid, water and air profile below what features add, and the top four surface blocks. Report the exact-match rate and the largest height error; this sets the tolerance of ADR 0119 D13.
- **WS7 Aquifers and noise caves.** Whether underground water, lava and noise caves match in the same columns.
- **WS8 The newer target.** WS1, WS5 and WS6 on 26.4; which vanilla files use `domain_warp` and `upscale`; whether a small fixture dimension isolating each type lets its behaviour be learned from the generated world alone (clean room).
- **WS9 The overworld's biome list.** Whether the points of the `overworld` and `nether` parameter lists are in the jar's data files. If not, the routes: the runtime's dev mode writing the resolved list through vanilla's own accessor on the user's first Play (reserve B592), or none (Compare shows vanilla land with one biome colour and says so). No route may ship the list.
- **WS10 Adding types.** Whether a missing type can be added from outside deepslate (a parser hook, a pre-pass that swaps the node, a subclass), or whether `@msm/terrain` needs its own parser front that hands the rest to deepslate.
- **WS11 The jar.** Paths, count and inflated size of the worldgen, dimension, dimension type and worldgen tag files per version; added extraction time; what a cache schema bump does to a user who extracted before (silent re-extract or a prompt).
- **WS12 The worker.** A Vite module worker chunk against a `blob:` worker under `msm-app://` and the production CSP; passing typed arrays; the weight deepslate's worldgen module adds to `app.asar` and the renderer beyond what `ClimateMap` already pulls in.
- **WS13 A bigger area.** Try it with a 64 by 64 by 64 and a 64 by 96 by 64 area for one ground: build time, frames a second under SwiftShader, memory, and what in `@msm/sim` assumes `AREA_SIZE_*`.
- **WS14 The cost of an edit.** From a changed noise settings field to a new coarse map: parsing, building `RandomState`, sampling; what can be kept between edits (noises by seed, unchanged functions).
- **WS15 Features.** Counts of feature types and placement modifier types across the jar's biomes, to fix the first subset; whether the sim's tree growing can run from the worker.
- **WS16 Structure starts.** Whether `StructureSet` and `StructurePlacement` give start chunks for the targets' structure set files.
- **WS17 Seeds.** How a typed word becomes a seed (by observation: two worlds), and whether a save's seed can be read with the existing level reader.
- **WS18 A newer deepslate.** Whether a release newer than 0.27.2 exists with the missing types and is older than the two-week rule allows (verify at implementation); the cost of moving the structures plugin and interop with it.

## Limits (WL1 to WL14)

| # | Limit | Why | What users see | Mitigation |
|---|---|---|---|---|
| WL1 | **A preview, not the game's generator.** | MSM runs deepslate's code, not Minecraft's. | A **Preview** tag on the map and the ground's strip. | Checked against real worlds (D13); Play is the real check. |
| WL2 | **Vanilla parts need your Minecraft jar.** | Mojang's files are never shipped. | Without the jar: project-only worlds draw; anything naming a vanilla file shows the set-up banner. | The flows write their own terrain files. |
| WL3 | **Trees, plants and ores are about right, not block for block.** | Feature code is the game's; MSM places by the data's modifiers with its own shapes. | An "about right" line; counts per chunk near the game's. | Play. |
| WL4 | **Carved caves and ravines are not drawn.** | Carvers are code with no data to read. | A line in the notes; noise caves are drawn. | Reserve B593. |
| WL5 | **Buildings are not drawn; markers show where one may start.** | Piece assembly is the game's. | Markers "may start here" for spread placements. | ROADMAP "Live views 4". |
| WL6 | **Some types cannot be drawn yet.** | Types deepslate lacks and the spike could not learn (WF3, WF4, WS8). | The type is named, and what was drawn instead. | Added type by type. |
| WL7 | **The vanilla overworld's biome layout may be missing in Compare.** | Its list may not be in the jar's data (WS9). | Vanilla land in one colour, with the reason. | Reserve B592. |
| WL8 | **The ground is a window.** | Try it's area is small by design. | 48 by 48 blocks, 32 high (or the size WS13 allows); tall land is cut. | Move up, Move down, Make the land around me. |
| WL9 | **Old chunks are not blended.** | Blending needs an existing world. | — | — |
| WL10 | **No mobs, light or weather from the biome.** | Try it's limits (ADR 0085). | As in every ground. | — |
| WL11 | **A slow computer draws the sharp picture later.** | Work is stepped, never skipped. | The coarse picture stays longer. | Zoom out, smaller map. |
| WL12 | **The seed is the view's, not a world's.** | The game picks a seed per world. | The seed box. | Seed of one of my worlds (if WS17). |
| WL13 | **Debug worlds are only in the game.** | Nothing to learn from them. | A line. | — |
| WL14 | **The audit's other kinds wait.** | This plan builds worldgen's views only. | `docs/LIVE-VIEW-AUDIT.md`. | Live views 2, 3 and 4. |

## Rules for every brief

The rules of `docs/PLAN-vanilla-parity-3.md` "Rules for every brief" apply (clean room, no new dependency, git worktrees in the scratchpad with the given identity and no `git config`, disk and Gradle limits, one owner per shared file per wave, notes for the plan, exit criteria, plain words, models), with these additions:

- **Clean room for worldgen (user, 2026-11-22).** Only `javap` signatures of Mojang classes; never a method body. deepslate's source (MIT) may be read and used. A type deepslate lacks is written from the file format's field names and from what a real world generated from a small fixture shows; if that is not enough, it becomes limit WL6, not a guess.
- **Vanilla worldgen JSON comes only from the user's own client jar at runtime**, cached under `<msmHome>/cache/`, as textures are. It is never committed, bundled, exported, written into a project or sent to the AI helper. Tests that need it run only where a jar is present (the `engine-mod` CI job) and skip elsewhere; every other test uses the self-contained fixture.
- **Version facts live in `packages/targets`.** The engine is keyed by type id and folder key, never by version; which types and folders a version has comes from the target (`TargetFacts`, the vendored registries). No brief writes a version literal outside `packages/targets`.
- **Stubs first.** B576 makes every shared registration point: the package `packages/terrain` (`@msm/terrain`), its line in `tools/check-deps/layers.json`, `pnpm-lock.yaml`, the engine's public interface file, the app folder `app/src/renderer/src/terrain/` with its stub files, the `worldgen_map` line in `PreviewPanel.tsx`'s kind list, the `generated` entry of `GROUND_KINDS`, the fixture folder, the parity class and the skipped e2e spec. No later brief edits the lockfile or `layers.json`.
- **IPC.** Only B577 edits `app/src/shared/`, `app/src/preload/` and `app/src/main/`.
- **Off the main thread.** No brief samples noise on the renderer's main thread; a test in B580 fails if the engine is imported outside the worker entry and the tests.
- **Honest views.** Every view names what it left out (limits WL3–WL7) in the notes; a view that silently draws something else is refused at review.
- **Size.** App briefs run `pnpm build` and `node tools/check-size/index.ts` and report `app.asar`, the renderer and the new chunks; this plan's code is budgeted at 0.3 MB of `app.asar` in all (set by B574 after WS12); the stop lines stay 31 MB and 17.5 MB.
- **Models.** Opus (`claude-opus-5-5`) at medium effort; B574, B578 and B581 at high effort; Sonnet (`claude-sonnet-5-5`) for B576 and the guide half of B590.

## Overlaps with other work

- **Vanilla parity 3 batch 2** must be closed (B544): its B540 owns Try it and the sim, its B539 the library and the `examples/` mirror.
- **Showcase** must be closed (B572): B588 edits `showcase/clip.ts` and `showcases.ts`.
- **Game modes** ([`docs/PLAN-game-modes.md`](PLAN-game-modes.md), also waiting for B544). Shared files: `packages/sim/src/grounds/ground.ts`, `tryit/grounds.ts`, `GroundPicker.tsx` (its B558 against this plan's B584), the library's starter index and `components/home/tiles.ts` (its B557 against B586), `showcases.ts` (B557 against B588). **Recommendation: this plan first**, because it is the user's newest request, has no new kinds and no runtime code, and gives the game modes plan's sky island and void worlds a real map and ground to show. If the main session runs the two side by side, waves 0 to 3 here touch none of those files; B584, B586 and B588 then take turns with B557 and B558 (whichever merges second rebases). The fifth flow (Empty sky with a start island) is the bridge: it never builds the island itself.
- **ADR number:** 0119. **Brief ids:** B574–B595. **Versions:** no plugin API change is planned (WF8); if B574 finds the target needs a new fact (the worldgen data folders or the supported type lists), B577 adds it as plugin API 1.22.0, after the game modes plan's 1.21.0 or before it with the numbers swapped by the main session. No Script API change.

## Waves

At most five executors at once and at most two engine-mod executors; no file in two briefs of one wave.

| Wave | Briefs (parallel) | Engine-mod briefs | Depends on |
|---|---|---|---|
| 0 | B574 spike; B575 the live view audit | B574 (the real server) | B544, B572 |
| 1 | B576 scaffold and stubs; then B577 jar reading and IPC | none | B574 reported |
| 2 | B578 engine: registries, biomes, terrain, surface; B579 fixture and measured expectations; B580 worker and client | B579 | B576, B577 |
| 3 | B581 engine: missing types and the parity test; B582 the map in the preview panel; B583 engine: features and additions | none | wave 2 |
| 4 | B584 Try it ground; B585 value maps, Compare, Scatter, markers; B586 flows, templates, examples, tile | none | wave 3 |
| 5 | B587 live maps in the Creator and the Studios; B588 showcase clips; B589 e2e; B590 AI helper, guide, changelog | none | wave 4 |
| 6 | B591 close (main session) | none | all |
| reserve | B592 the biome list from the runtime's dev mode (only on WS9); B593 carvers (only if a clean-room description holds); B594 a bigger Try it area in the sim (only on WS13's go with sim changes); B595 structures in the ground | B592 | B574 |

## Briefs

### B574 Spike: deepslate against the real game (wave 0; Opus, high effort; one session)

- **Owner files:** throwaway only: a scratch folder outside the repository for the server world and the extracted vanilla files (never committed); `app/e2e/terrain-spike.spec.ts` and `packages/interop/test/terrain-spike/` while measuring, deleted before the report; evidence (numbers, tables, pictures of MSM's own maps; no vanilla file) into `docs/reference/spikes/b574/`.
- **Scope:** WS1–WS18. A real world per seed from `tools/run-fabric-server` on both targets (chunks loaded by `forceload`, the server stopped cleanly), read with `@msm/interop` `world/` or the reference pack's `region.py`. deepslate fed from the files of the Loom cache's jar, in Node and in the app's worker.
- **Exit criteria:** a report answering WS1–WS18 per target with numbers; the list of unsupported types and silently ignored fields; go or no-go for ADR 0119 D3 (deepslate as the engine), D8's area size, D13's tolerance and D14's budgets, and for each reserve; the jar path list for B577; the feature subset for B583; the interface B576 should stub; throwaway files deleted; `pnpm lint`, `pnpm typecheck` green.

### B575 The live view audit (wave 0; Opus)

- **Owner files:** new `docs/LIVE-VIEW-AUDIT.md`.
- **Scope:** every kind the session's plugins contribute (count them from the contributions, never from this plan), one row each: what a player sees or hears of it, its live view today (preview panel, Studio preview, Try it, none), whether that view follows an edit and how fast (checked in the running app under `xvfb-run`), and a verdict: has one, needs one (with the batch: this plan, Live views 2, 3 or 4), or exempt with the reason. Also the non-kind surfaces: the Creator's steps, the AI helper's proposed changes, Very easy's My things.
- **Exit criteria:** the table covers every kind (a count line matching the contributions); each "needs one" has a batch; no source file changed.

### B576 Scaffold and stubs (wave 1; Sonnet; after B574 reports)

- **Owner files:** new `packages/terrain/` (made the way `packages/sim` was: `package.json` with `deepslate: "catalog:"` and `@msm/plugin-api`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, `src/api.ts`); `tools/check-deps/layers.json`; `pnpm-lock.yaml`; `app/package.json` (the workspace dependency); new `app/src/renderer/src/terrain/` with stub `worker.ts`, `client.ts`, `files.ts`, `WorldMap.tsx`, `SideCut.tsx`, `ValueMap.tsx`, `CompareView.tsx`, `Scatter.tsx`, `controls.tsx`, `view-store.ts`; `app/src/renderer/src/preview/PreviewPanel.tsx` (the `worldgen_map` entry and its lazy route to `WorldMap`, nothing else); `packages/sim/src/grounds/ground.ts` (`'generated'` in `GROUND_KINDS`) and the switch arms that the new member forces, each a "not yet" line; new `fixtures/worldgen-parity/README.md`; a stub parity class in `engine-mod/parity/`; new skipped `app/e2e/worldgen-live-path.spec.ts`.
- **Scope:** `src/api.ts` fixes the engine's interface as B574 reported it: `WorldgenFiles` (registry folder key to id to JSON, project over vanilla), `TerrainWorld` (made from files, a dimension or preset id, and a seed), `sampleBiomes`, `sampleHeights`, `sampleSlice`, `sampleValues`, `buildColumns` (to a `GroundBlocks`-shaped result), `unsupported()` (types and fields left out), and the worker's request and answer messages with a generation token. Every stub throws "not yet".
- **Exit criteria:** `pnpm i`, lint, typecheck, `node tools/check-deps/index.ts`, all tests green; the app builds and behaves as before (the climate map still shows).

### B577 Jar reading and IPC (wave 1; Opus; after B576)

- **Owner files:** `packages/interop/src/minecraft-install/extract.ts`, `cache.ts` and their tests; `app/src/shared/platform.ts`; the preload and main files that serve vanilla cache reads (find with `grep -rn "cached vanilla asset" app/src`); their tests; `packages/targets/*/src/target.ts` and `packages/plugin-api/src/target.ts` only if B574 asked for a new fact.
- **Scope:** ADR 0119 D4 and D10. The extraction keeps the jar's worldgen, dimension, dimension type and worldgen tag JSON (the folder names from the target's data folder keys, the path list from B574); cache schema 4 with the re-extract behaviour B574 measured; one IPC call that returns all cached worldgen files of a version in one answer; the files stay under `<msmHome>/cache/` and are in no export, project write or AI helper context (a test for each).
- **Exit criteria:** interop and app tests green, among them: a fake jar round trip, the schema bump, "no vanilla worldgen file in any exporter's output", "the AI helper's context builder never reads the worldgen cache"; lint, typecheck, `pnpm build`, check-size.

### B578 Engine: registries, biomes, terrain and surface (wave 2; Opus, high effort)

- **Owner files:** `packages/terrain/src/registries.ts` (files into deepslate's registries, project over vanilla, a fresh registry set per world so two worlds never share state), `world.ts` (`TerrainWorld`: dimension or preset to generator, biome source and settings; noise, flat and "only in the game" for debug), `sample.ts` (biomes, heights, slices, values, progressive passes), `columns.ts` (terrain and surface into `GroundBlocks`-shaped windows), `unsupported.ts` (the walker of WS1), `flat.ts` (the flat generator from its layers); tests under `packages/terrain/test/` with fixture files written by hand (no vanilla file).
- **Scope:** ADR 0119 D3, D4, D6. Pure, with no DOM and no Node, deterministic for the same files and seed. Every type or field it cannot honour is in `unsupported()`, never dropped silently.
- **Exit criteria:** package tests green (the same input twice gives the same bytes; a project file overrides a vanilla id; an unknown type is reported and the rest still draws; flat layers stack as the flat ground does); the speeds of WS2–WS4 re-measured in Node and reported; lint, typecheck, check-deps.

### B579 Fixture and measured expectations (wave 2; Opus; engine-mod)

- **Owner files:** `fixtures/worldgen-parity/` (a project `worldgen_parity` with self-contained dimensions written from scratch, each isolating a group of types: plain noise terrain, splines, the cache and blend markers, aquifers, each surface condition and rule type, a fixed, a checkerboard and a multi noise biome source, a flat world; its lowered data per target; `expectations.json`); the parity class in `engine-mod/parity/` and its build wiring; the CI step in `.github/workflows/ci.yml` (`engine-mod` job only).
- **Scope:** ADR 0119 D13. A GameTest loads each fixture dimension on the real server for three seeds, reads the biome at 200 cells and the block column at 100 columns a dimension and seed, and checks them against `expectations.json`; `-PupdateWorldgenParity` rewrites the file. The numbers are observations of worlds made from MSM's own files. In the `engine-mod` job only, a second step runs the engine over the Loom cache jar's vanilla settings against a freshly generated vanilla world (WS5, WS6) and reports the match rate; it writes nothing to the repository.
- **Exit criteria:** `./gradlew -p parity build` and the GameTests green on both versions; `expectations.json` committed; the vanilla step prints its rates; no vanilla file in the diff.

### B580 Worker and client (wave 2; Opus)

- **Owner files:** `app/src/renderer/src/terrain/worker.ts`, `client.ts` (requests with tokens, cancel on a newer one, a small result cache keyed by the files' hash, seed and region, coarse then fine passes), `files.ts` (the project's lowered worldgen files from the session, re-lowering only the edited element, laid over the vanilla files from B577's call), `view-store.ts` (the seed, position, zoom and mode per project in the view preferences); tests under `app/test/terrain/`.
- **Scope:** ADR 0119 D5, D9 (the stored part), D14. Coded against `src/api.ts` with a fake engine until B578 merges; the worker form WS12 chose.
- **Exit criteria:** app tests green (a newer request cancels an older; the cache answers a repeated view without the worker; an edit to one element re-lowers one element; nothing imports `@msm/terrain` outside the worker entry); `pnpm build`, check-size with the worker chunk reported.

### B581 Engine: the missing types and the parity test (wave 3; Opus, high effort)

- **Owner files:** `packages/terrain/src/extensions/` (one file per type B574 said can be learned: of `domain_warp`, `upscale`, `bandlands`, `ore_vein`, `hole`, `steep`, `temperature`), `packages/terrain/src/extensions/index.ts`; `packages/terrain/test/parity.test.ts`.
- **Scope:** ADR 0119 D3 and D13. Each type by the seam WS10 chose, written from the format and from B579's fixture worlds; a type that could not be learned stays in `unsupported()` and becomes a WL6 line. The parity test plays `fixtures/worldgen-parity/expectations.json` through the engine on both targets at the tolerance B574 set.
- **Exit criteria:** the parity test green on both targets; the list of types still unsupported handed to the close; lint, typecheck.

### B582 The map in the preview panel (wave 3; Opus)

- **Owner files:** `app/src/renderer/src/terrain/WorldMap.tsx`, `SideCut.tsx`, `controls.tsx`, new `terrain/colours.ts` (biome colours as the climate map picks them, a height shading), `terrain/hosts.ts` (the Seen in picker's choices); `packages/plugins/worldgen/src/kinds/index.ts` (`previewKind: 'worldgen_map'` for dimension, world preset, noise settings, biome, parameter list, flat preset, material rule and condition); `app/src/renderer/src/preview/ClimateMap.tsx` only to sit as a tab; tests under `app/test/components/terrain/`.
- **Scope:** ADR 0119 D7, D9, D10: Map (Biomes, Height), Side cut, the Climate tab, seed and position controls, drag and zoom, hover (biome, height, position), the notes with what was left out, the banner without the jar, the Preview tag. 2D canvas only.
- **Exit criteria:** app tests green (an edit asks for a coarse pass within the debounce; the notes list an unsupported type from a fake engine; without vanilla files a project-only dimension draws and a vanilla-naming one shows the banner; keyboard pan and zoom); `pnpm build`, check-size.

### B583 Engine: features and additions (wave 3; Opus)

- **Owner files:** `packages/terrain/src/features/` (placement modifiers, the feature subset from WS15, `additions.ts` for `msm:biome_addition`, `order.ts` reading the target's feature order), tests.
- **Scope:** ADR 0119 D6 (the approximate level). Placement by the data's own modifiers; shapes are MSM's own (the Quick world tree and the sim's project trees where WS15 allows); every feature type outside the subset is reported.
- **Exit criteria:** package tests green (counts per chunk within the range a modifier chain allows; the same seed gives the same placements; an unknown feature type is reported); lint, typecheck.

### B584 Try it ground "My world generation" (wave 4; Opus)

- **Owner files:** `packages/sim/src/grounds/ground.ts` and new `grounds/generated.ts` (the window choice, keeping placed blocks); `app/src/renderer/src/tryit/grounds.ts`, `GroundPicker.tsx`, `session-source.ts` (regenerate on a worldgen edit); tests in `packages/sim/test/` and `app/test/components/tryit/`.
- **Scope:** ADR 0119 D8: the ground of section (b), its staged arrival, Move up, Move down, Make the land around me, Show on the map, the strip's line and the limits lines; the area size WS13 allowed (if that needs sim changes beyond a per-ground size, stop and report for reserve B594).
- **Exit criteria:** sim and app tests green (a ground from the fixture dimension matches the engine's columns; an edit regenerates and keeps the player standing; placed blocks kept or counted); Try it's own tests and e2e `tryit-path` green; frame rate and build time reported; check-size.

### B585 Value maps, Compare, Scatter and markers (wave 4; Opus)

- **Owner files:** `app/src/renderer/src/terrain/ValueMap.tsx`, `CompareView.tsx`, `Scatter.tsx`, new `terrain/markers.ts`; `packages/plugins/worldgen/src/kinds/index.ts` (`previewKind` for density function, noise, feature, placed feature, block state provider, carver); the blocks-items kind file for `msm:biome_addition`'s `previewKind` (find with `grep -rn BIOME_ADDITION_KIND packages/plugins/blocks-items/src/kinds`); tests.
- **Scope:** ADR 0119 D7 (the rest of the table) and D9's Compare with vanilla, with WL7's wording when the biome list is missing.
- **Exit criteria:** app tests green; Compare is off with the banner when no jar is set up; check-size.

### B586 Flows, templates, examples and the tile (wave 4; Opus)

- **Owner files:** new `packages/plugins/library/src/starters/custom-world.ts` and its index line; new examples file `packages/plugins/library/src/examples/worlds.ts` and its index line; worldgen templates under `packages/plugins/worldgen/src/templates/`; the `examples/` mirror (`UPDATE_GOLDENS=1` once); `app/src/renderer/src/components/home/tiles.ts`; `app/src/renderer/src/studios/very-easy.ts` if the picks live there (find it); tests.
- **Scope:** ADR 0119 D11: the five flows of section (d) with terrain files of MSM's own, one example each, the tile **Make a world**; the fifth flow's bridge wording, and its hand-over to Skyblock when the games plugin is present.
- **Exit criteria:** library and exporter tests green (every flow's output loads in a vanilla data pack with zero problems on both targets; no flow output names a file MSM would have had to copy from vanilla); each flow's world previews without the jar through the engine in a test; goldens updated once, then a clean run; counts handed to the close.

### B587 Live maps in the Creator and the Studios (wave 5; Opus)

- **Owner files:** `app/src/renderer/src/components/creator/CreatorPreview.tsx`; `app/src/renderer/src/studios/worldgen/BiomeStudio.tsx`, `PlacedFeatureStudio.tsx`, `TreeFeatureStudio.tsx`, `DimensionTypeStudio.tsx` (a **See it on the map** and **Walk in it** line each); tests.
- **Scope:** the wizard's preview shows the map for world and dimension flows and follows each answer; the Studios link to the map of a host and to the ground.
- **Exit criteria:** app tests green; check-size.

### B588 Showcase clips (wave 5; Opus)

- **Owner files:** `app/src/renderer/src/showcase/clip.ts` (`ClipGround` gains `generated` with an example dimension, a seed and a place), `clip-player.ts` (loading it), `showcases.ts` (the world cards), `app/test/showcase/`.
- **Scope:** ADR 0119 D12: one card per flow whose clip keeps the Showcase's budgets; a card whose ground is too slow under SwiftShader shows its still and is listed for the close.
- **Exit criteria:** `showcases.test.ts` plays every new clip on both targets; the gallery's "one clip at a time" tests green.

### B589 e2e (wave 5; Opus)

- **Owner files:** `app/e2e/worldgen-live-path.spec.ts`.
- **Scope:** open the fixture project; the dimension's map has more than one colour; change a noise settings number and the picture changes within the budget; change the seed; the side cut; a density function's value map; Try it on My world generation, a block of the surface under the player, an edit regenerating the ground; Very easy: Make a world, the Islands flow to its end with the map following; without vanilla files, the banner on a vanilla-naming dimension.
- **Exit criteria:** green three runs in a row and in the full e2e run; the `app/CLAUDE.md` e2e line handed to the close.

### B590 AI helper, guide and changelog (wave 5; Opus for the AI part, Sonnet for the guide)

- **Owner files:** the AI helper's tool and prompt files for worldgen (find with `grep -rln worldgen packages/ai/src`); `docs/guide/worldgen.md`, new `docs/guide/live-world.md`, `docs/guide/README.md`, `docs/site/.vitepress/config.ts`, `docs/guide/try-it`'s page for the new ground (find it), `CHANGELOG.md` `[Unreleased]`.
- **Scope:** the helper can name the flows and says the map shows its changes (no vanilla worldgen file ever enters its context); the guide: the map, the side cut, the controls, Compare, the ground, the flows, limits WL1–WL14 in plain words, labels from the code.
- **Exit criteria:** `@msm/ai` tests green; the docs site builds; labels match.

### B591 Close (wave 6; main session)

- ADR 0119 reviewed against the merged code, accepted with findings (WS answers, measured speeds and match rates, the types still unsupported); DESIGN section 8 (the preview panel's map, Try it's ground) and Open Question 15 (the outcome); ROADMAP (the add-on section ticked, Milestone Log, the Live views 2–4 ideas kept); HANDOFF; `docs/COVERAGE-AUDIT.md` linking `docs/LIVE-VIEW-AUDIT.md`; root `CLAUDE.md` (status, the golden rule line "Everything visible live", the package in the directory map), `app/CLAUDE.md`, `packages/plugins/CLAUDE.md`, a new `packages/terrain/CLAUDE.md`; this plan deleted, its fact table and limits moved into the ADR.

### Reserves

- **B592 The biome list from the runtime's dev mode (only if WS9 says the list is not in the jar; engine-mod).** Owner files: a dev-mode-only class in `engine-mod/src/main/java/dev/mcsupermods/runtime/dev/` and its seam per version, the app's reader in main. The runtime, in dev mode only, writes the resolved parameter lists it gets from vanilla's own registry accessors to the managed instance's folder; the app reads that file as it reads a save. Never shipped, exported or committed.
- **B593 Carvers (only if a description from observation holds).** Owner files: `packages/terrain/src/carvers/`.
- **B594 A bigger Try it area (only on WS13's go with sim changes).** Owner files: `packages/sim/src/types.ts` and what assumes `AREA_SIZE_*`.
- **B595 Structures in the ground.** Owner files: `packages/terrain/src/structures/`; start markers become placed pieces for template pools of the project.

## Very easy wording

- Tile and flows: "Make a world", "Islands", "Tall mountains", "One biome everywhere", "Caves only", "Empty sky with a start island", "How big are the islands?", "How much sea?", "How tall?", "Which biome?".
- Map: "Map", "Biomes", "Height", "Side cut", "Climate", "Seed", "Roll a new seed", "Seed of one of my worlds", "Go to spawn", "Seen in", "Find it", "Compare with vanilla", "Walk in it", "Preview", "Drawing…".
- Ground: "My world generation", "The land your own world makes, around where you stand.", "Move up", "Move down", "Make the land around me", "Show on the map", "Trees, plants and ores are about right here; the game places them exactly.", "Carved caves and buildings show only in the game."
- Without the jar: "This world uses Minecraft's own land files. Set up your Minecraft folder to see it here."

## Notes from implementation

- **B575** (2026-11-22): `docs/LIVE-VIEW-AUDIT.md` written. The contributions give **118 kinds** (resourcepack 13, datapack 62, structures 5, worldgen 14, blocks-items 11, models-anim 2, entities 4, scripting 4, rules 1, controls 2): has one 28; needs one 81 (this plan 14, Live views 2 34, Live views 3 30, Live views 4 3); exempt 9. 42 kinds checked in the built app under `xvfb-run` with SwiftShader; measured from Apply to a changed preview: climate map 0.20–0.25 s, recipe 16 ms, particle 9 ms, potion 34–105 ms, block model 68–146 ms; Try it opens in 0.76 s and lowers 300 ms after an edit. Against the grouped table above: `msm:effect` has a live view (the Effect Studio's Preview); dimension types, the merchant kinds, `lang`, commands, keys and fluids have one through their Studios or Try it; `minecraft:sounds` has no play button anywhere outside Try it; functions are not run by Try it; game rules, statistics, the two test kinds and the two context providers are exempt; timelines and world clocks go to Live views 3. This plan's 14 rows: the 12 worldgen kinds without a view today, `msm:biome_addition` and `worldgen/structure_set` (markers). The Creator's 9 mob, 4 vehicle, particle, fluid, villager and sound flows show no live view of what they make; the AI helper's proposals are JSON only (Live views 3). For the close: root `CLAUDE.md` says 115 kinds and 55 Creator flows; the code has 118 and 57.
- **B574** (2026-11-22): spike report and evidence in [`docs/reference/spikes/b574/`](reference/spikes/b574/README.md) (README with WS1–WS18, `results/`, `spike-src/`, one picture). Real worlds from the vanilla server, seeds 0, 1, 12345 and -7046235981325167892 on 26.3 and 26.4-snapshot-7, with eight test dimensions of MSM's own over vanilla's overworld noise settings. **deepslate 0.27.2 is a go with ten fixes F1–F10** in `@msm/terrain`: renames `chunk_surface_level` and `add_stone_depth` (deepslate reads other names), a placeholder for 26.4's missing `default_block`, 26.4 `upscale` (linear) mapped onto `interpolated`, the `interval_select` fix of 0.27.3, our own full-chunk surface pass with a biome per cell (deepslate's covers one z row and one biome), the walker for silently parsed unknown types, `multi_noise` presets reported, one world per worker (static registries), a per-chunk cell grid for interpolation (3.7 times faster). Parity on 26.3: biome cells 100.0 % of 169,680 in the test dimensions; terrain cells 98.7–98.9 % same class, surface height exact 88.6–93.5 %, top four blocks 91.8–94.6 %; misses are carvers (0.66–0.81 % of cells), structures' terrain adaptation, `bandlands`/`steep`, 0.10–0.14 % real density errors; aquifers and noise caves match (fluid differs in 0.28–0.36 % of cells). The Nether's land is exact in height. **Approximate:** the End on both targets (biomes 41–61 %, heights exact 51 %), and 26.4's biome layout (67 % of cells: a code change of the snapshot, not in the data). The overworld and Nether parameter lists are not in the jar (WS9: reserve B592 go). Learned on 26.4 from a fixture of MSM's own: `upscale` linear, nearest (lower corner) and cosine, `domain_warp` with constant offsets; function offsets 82 % (not yet). Speeds in an Electron worker: coarse biome map 82–85 ms, full 256² 1.33–1.37 s, side cut 0.79–0.86 s, 9 chunks of ground 1.67–1.87 s (with the spike patch), an edit to a coarse map about 225 ms; **the Height map misses by about ten times** (needs a column cache of height-independent parts in B578). Bigger Try it area: no-go (B594 holds). Size: the worker carries its own deepslate copy, about 0.30 MB: budget 0.45 MB or move `ClimateMap` into the worker. Jar paths for B577: the README's WS11 list (1,271 / 1,325 files, 2.0 MB; no `data/minecraft/dimension/`); feature subset for B583 and the `api.ts` interface for B576 in the README. Seeds: a number is itself, other text is Java's `String.hashCode`; the seed is in `data/minecraft/world_gen_settings.dat`, not `level.dat`. Structure starts: 136 of 136 `random_spread` starts where deepslate predicts. A plugin API fact is needed (data folders and approximate parts per target). deepslate 0.27.3 (2026-11-16) is usable from 2026-11-30 and fixes only `interval_select`. New limits: structures' terrain adaptation, the End, 26.4's biome layout.
