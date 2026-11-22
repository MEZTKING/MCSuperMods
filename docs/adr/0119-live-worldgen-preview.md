# ADR 0119: Live world generation, and the rule "Everything visible live"

## Context

The user asked on 2026-11-22: "Can we make custom world generations if not make it an option. Everything should be visible live".

Custom world generation exists as data: the worldgen plugin has 14 kinds, each lowering 1:1 to the JSON the game reads ([ADR 0022](0022-worldgen-element-model-and-validators.md)), with Biome, Placed Feature, Tree and Dimension Type Studios and the Dimension flow ([ADR 0051](0051-dimension-creator-flow.md)). What a user cannot do is see it. The preview panel shows a climate map for dimensions and world presets, which plots biomes in climate space, not in the world ([ADR 0023](0023-structure-and-climate-previews.md)); Try it's grounds are a grid, a flat world, MSM's own Quick world and a copy of an area of a save ([ADR 0087](0087-try-it-worlds.md)); nothing generates the project's own terrain.

ADR 0023 deferred a noise-sampled biome and terrain map to reserve brief B84 and DESIGN [Open Question 15](../DESIGN.md#18-open-questions), pending the user's agreement, with one open point: whether reading vanilla worldgen JSON from the user's own client jar fits "never bundle Mojang assets". The message above is that agreement. The user also restated the clean-room rule the same day: only `javap` signatures, never Mojang method bodies; vanilla worldgen JSON is read from the user's own client jar at runtime, cached, never exported or bundled, as textures are.

Facts at 30b3fed (the fact table WF1–WF22 in [`docs/PLAN-live-worldgen.md`](../PLAN-live-worldgen.md)): deepslate 0.27.2 (MIT, Misode) is already bundled and its `deepslate/worldgen` module has `NoiseChunkGenerator`, `RandomState`, `NoiseRouter`, `DensityFunction`, `MaterialSystem`, `Aquifer`, the four biome sources and structure placement. Read against the targets' vendored registries, its density function parser knows every type of the 26.3 target and lacks `domain_warp` and `upscale` of the 26.4 target; its surface system lacks the rule types `bandlands` and `ore_vein` and the conditions `hole`, `steep` and `temperature` on both; it has no features, placement modifiers, carvers or flat generator. Whether it matches a real world, and how fast it is in a worker, was not known when this ADR was drafted: the spike B574 (questions WS1–WS18) measured it on 2026-11-22, and its answers are in "Amendment after the spike" below, with D3, D4, D6, D8, D13, D14 and D16 changed in place.

## Decision

### D1 The rule: everything visible live

"Everything should be visible live" (user, 2026-11-22) is a standing rule beside vanilla parity:

- Every kind that makes something a player can see or hear has a **live view** in the app: in the preview panel, in its Studio or in Try it. Live means the view follows an edit by itself, without a button, an export or the game, and shows a first picture within the time budget of D14.
- A kind with nothing to see (pack settings, an atlas list, the mod's own settings) is **exempt**, and listed as such with the reason.
- The state of every kind is kept in `docs/LIVE-VIEW-AUDIT.md` (written by B575, linked from `docs/COVERAGE-AUDIT.md`). A kind without a live view is a gap in that audit, with the batch that closes it.
- From now on a brief that adds a kind, a Studio or a Creator flow names its live view, or adds the audit line saying why not yet. A review asks for it as it asks "what does Try it say about this?" (ADR 0085).

This ADR builds the live views of world generation. The other gaps become the follow-up batches Live views 2, 3 and 4 in ROADMAP.

### D2 Open Question 15 is answered: the noise-sampled preview is built

MSM builds the noise-sampled biome and terrain preview. Reading vanilla worldgen JSON from the user's own client jar fits "never bundle Mojang assets": the files are read on the user's machine, from a jar the user owns, into the cache under `<msmHome>/cache/`, exactly as textures and models are ([ADR 0011](0011-client-jar-asset-extraction.md)). They are never committed to the repository, never in the installer, never written into a project or an export, and never sent to the AI helper. Vendoring those files from a third-party mirror is rejected for the same rule (see Alternatives). This supersedes the deferral in ADR 0023; the climate map stays.

### D3 The engine is deepslate's worldgen module, wrapped in `@msm/terrain`

- We reuse `deepslate/worldgen` because it is already bundled, MIT, written for exactly this and reads the same JSON; writing our own noise router would repeat it. No new dependency.
- A new pure package `@msm/terrain` (`packages/terrain/`; no DOM, no Node, no Electron; depends on `deepslate` and `@msm/plugin-api` types) holds everything around it: filling the registries from files, choosing the generator of a dimension or world preset, sampling biomes, heights, slices and values, building block columns, the flat generator, the walker that lists what cannot be honoured, the missing types and the features of D6. `@msm/sim` stays free of deepslate; the app joins the two.
- **What deepslate lacks is added by type id** inside `@msm/terrain`, clean room: from the file format's field names and from what a real world generated from a small fixture shows, never from a Mojang method body. deepslate's source may be read. A type that cannot be learned that way is not guessed: it is reported (D6) and listed as a limit.
- **The seams (as amended after B574, WS10).** deepslate is not forked. `@msm/terrain` holds (1) a JSON **pre-pass** for field renames and lossless rewrites (fixes F1 to F5 of the amendment); (2) a **parser front** for density functions: our own types are subclasses of deepslate's `DensityFunction`, every other node is handed to deepslate with our front as its child parser; (3) our own **rule front** for the whole surface rule tree, because deepslate's rule parser has no hook; (4) our own **surface pass** over all 256 columns of a chunk with a biome per cell (F6); (5) our own **cell-grid fill** in place of deepslate's unbounded interpolation cache (F10); (6) the **walker** that reports every type and field a parser would take silently (F7, F8). One world lives in a worker at a time, because deepslate's registries are static (F9). The go for deepslate as the engine holds with these ten fixes.
- **The pin.** deepslate stays at 0.27.2 until 0.27.3 (published 2026-11-16) passes the two-week rule on 2026-11-30; then the catalogue pin moves (it fixes `interval_select`, F5, and nothing else on our list). The pre-pass covers F5 until then. It is a ROADMAP housekeeping line, not a brief of this plan.
- **Version facts stay in `packages/targets`.** The engine is keyed by type id and data folder key. Which types and folders a version has comes from the target; `@msm/terrain` holds no version literal.

### D4 Input: the project's lowered files over the user's vanilla files

- The engine reads **lowered files**, as Try it does (ADR 0085 D3): what the export would hold. Worldgen kinds lower 1:1, so the map re-lowers only the edited element.
- Vanilla ids resolve from the jar cache, with the project's files laid over them in data pack order, so a project file with a vanilla id replaces vanilla's, as in the game.
- The jar extraction (ADR 0011) is extended to the jar's worldgen, dimension type and worldgen tag JSON; the asset cache moves to schema 4. The path list is WS11's (the amendment below): 1,271 files on 26.3 and 1,325 on 26.4, about 2 MB inflated, 30 ms more extraction time. The jar has no `data/minecraft/dimension/`; the vanilla dimensions are inline in its world presets. Which folders a target has is a target fact (D16).
- The overworld's and the Nether's biome parameter lists are **not** data in the jar (WS9: the two files hold only a preset name). MSM never ships such a list. Until reserve B592 lands, the vanilla overworld and Nether in Compare are drawn with their real land (shape, aquifers, noise caves) in one biome colour, and say so. **Reserve B592 is a go**: the runtime's dev mode writes the resolved list, obtained through vanilla's own accessors on the user's machine, to the managed instance, where the app reads it like a save. It is the only route to vanilla's biome layout.

### D5 Live, off the main thread

Sampling runs in a Web Worker of the renderer, never on its main thread. A view asks for a region; the worker answers in passes, coarse first, each replacing the last; a newer request cancels older work by a token; results are cached by the hash of the files read, the seed and the region. A view asks again 150 ms after the last edit.

### D6 Fidelity levels

As ADR 0085 D5, each part has one level, and the level is shown:

The levels are **per target** (as amended after B574; WS5 to WS8). Which parts are approximate on a target is a target fact (D16), so the engine holds no version literal.

- **As in the game, checked (D13), on both targets:** the shape of the land (the final density, the default block and fluid, sea level), aquifers and noise caves (WS7 holds), the surface rules of the supported types, flat worlds, fixed and checkerboard biome sources.
- **As in the game, checked, on 26.3 only:** the biome layout of a noise world (`multi_noise` with its own list): 100.0 % of 169,680 cells in the spike.
- **Approximate, and labelled so:**
  - features: trees, plants, ores and the project's biome additions, placed by the data's own placement modifiers in the target's feature order, with MSM's own shapes and its own random sequence, so they stand "about there", not at the game's exact blocks;
  - structure start markers (the start chunks of `random_spread` placements are exact, 136 of 136 in the spike; `concentric_rings` is unchecked, and a marker says "may start here" because the biome check is the game's);
  - **the End on both targets** (the `the_end` biome source and the End's land: biomes 41 to 61 %, surface height exact in 51 % of columns), until a later brief finds the cause;
  - **the biome layout of a noise world on 26.4-snapshot-7** (67 % of cells): the snapshot changes biome placement in code, not in data, so it cannot be learned from files. The map says "Biome borders are about right on this version". Re-measure on the next 26.4 build; the label goes when the target fact does.
- **Not drawn, and always said:** carvers (0.7 to 0.8 % of overworld cells), structures' terrain adaptation (land raised or cut under a village), structure pieces, blending with old chunks, the debug generator, any type the engine does not support, mob spawns, light.

Every view lists what it left out by name in its notes. Silence is not allowed.

### D7 The preview panel

One new preview kind `worldgen_map` (a string in the plugin API; no API change), drawn on a 2D canvas outside the WebGL gate: **Map** (Biomes, or Height as shading), **Side cut**, and the existing **Climate** map as a tab, for dimensions, world presets, noise settings, biomes, parameter lists, flat presets and surface rules; a **Value map** for density functions and noises; a **Scatter** view for features and placed features. A kind that is not a world by itself is shown inside a host the user picks (**Seen in**): a project dimension that uses it, or a plain host made around it. The full table is section (a) of the plan.

### D8 The Try it ground "My world generation"

Try it gains a fifth ground: a window of the world the chosen project dimension or world preset generates, at the view's seed and position. It arrives in stages (terrain, surface, features), regenerates in place on any edit to a worldgen element it reads, keeps the player's position and the blocks the user placed where they still fit, and says what was lost. The window is Try it's area (48 by 48 blocks, 32 high), **aligned to whole chunks** (3 by 3 chunks), with **Move up**, **Move down** and **Make the land around me**. A bigger area is a **no-go for the first version** (as amended after B574, WS13: 64 by 64 by 64 is 3.6 times the cells and 16 chunks of terrain take 2.5 to 3.0 s); reserve B594 holds. The engine fills only the window's height, plus the column above it that the surface pass needs. Vanilla blocks are props as in every ground; the strip and the "about right" lines carry D6's labels.

### D9 Seed, position and Compare with vanilla

One seed per project, shared by the panel and the ground, kept with the app's view preferences and never in the project file; position by dragging, zoom and boxes; **Walk in it** and **Show on the map** join the two surfaces. **Compare with vanilla** lays the vanilla world of the same seed and place beside the project's; it needs the jar.

### D10 Without the jar, without WebGL

Without the jar, a world made only of project files draws in full; a view that needs a vanilla file shows the existing set-up banner instead of a wrong picture. The flows of D11 write their own terrain files so a beginner's first world previews without the jar. The map, the side cut and the value maps need no WebGL; the ground needs it as Try it does.

### D11 An option for beginners

A Home tile **Make a world** and five Creator flows from one starter (Islands, Tall mountains, One biome everywhere, Caves only, Empty sky with a start island), each with the live map in the wizard's preview and one example. Their terrain files are MSM's own recipes, not copies of vanilla's. The fifth flow is the bridge to the game modes plan ([ADR 0114](0114-void-and-island-worlds-and-the-start-structure.md)): the start island, chest and kit are that plan's; this flow makes the empty world and hands over to Skyblock once it exists.

### D12 Showcase clips

Each flow is a Showcase card candidate ([ADR 0118](0118-showcase-with-live-clips.md)). A clip's ground gains the form `generated` (an example's dimension, a seed, a place). A card whose ground misses the Showcase's budgets under software rendering shows its still.

### D13 Keeping it honest

- A fixture `fixtures/worldgen-parity/` holds self-contained dimensions written from scratch, each isolating a group of types. A parity GameTest generates them on the real server on both versions and records biomes and block columns in `expectations.json` (observations of worlds made from MSM's own files); a Vitest test plays the same file through `@msm/terrain`. A type shown at D6's first level without a fixture case is refused at review.
- Vanilla's own settings are compared only where a jar is present: a step of the `engine-mod` CI job runs the engine over the Loom cache jar's files against a freshly generated vanilla world and reports the match rate. It writes nothing to the repository.
- **Tolerances (as amended after B574, WS5 to WS7).** The fixture (MSM's own files and biomes, without carvers or structures) passes at: biome cells 99.5 %; cells of the same class (solid, water, lava, air) 99 %; surface height exact in 95 % of columns and within one block in 98 %; the top four blocks exact in 95 % of columns where every type is supported. On a target whose biome layout is approximate (D6, D16) the fixture's `multi_noise` biome cells are reported, not gated; its fixed and checkerboard sources stay at 99.5 %. The vanilla CI step reports its rates and fails only below: biome cells 99.5 % (26.3 only, test dimensions), cells of the same class 98 %, surface height exact 85 %. The End is reported, not gated, while it is approximate.

### D14 Budgets, and the go or no-go

Set by B574's measurements in an Electron worker (as amended; the close records what the built code reaches):

- **First picture, coarse map** (64 by 64 samples) within 250 ms of the debounce ending: **go** (82 to 85 ms median, 108 to 115 ms worst; an edit to a new coarse map about 225 ms with nothing kept).
- **Full 256 by 256 map within 2 s:** **go for Biomes** (1.33 to 1.37 s median, 1.54 to 1.66 s worst). **Height is not yet inside it** (about ten times over as deepslate does it): B578 adds a per-column cache of the parts of the density that do not depend on height, and a cell-grid search. Until Height meets 2 s it shades from a coarser grid and shows "Drawing…" longer; `chunk_surface_level` alone is not used as the height (16 blocks off at the median).
- **Side cut within 1 s:** **go**, with a coarse pass first (every 4th column, 0.2 s; the full cut 0.79 to 0.86 s median, up to 1.28 s worst).
- **Ground:** terrain and surface for the area within 1.5 s: **go on two conditions**, the cell grid of F10 and filling only the window's height (1.67 to 1.87 s median today for 9 full-height chunks with the spike's patch). B578 measures; if it stays over, the ground arrives in its stages a little later and the budget is recorded as missed at the close. Features within 3 s; an edit shows new land within 2 s.
- **Size:** **0.45 MB** of `app.asar` for all new code (raised from 0.3 MB: the worker carries its own copy of deepslate's worldgen module, about 0.30 MB before `@msm/terrain`'s own code), under the stop lines of 31 MB and 17.5 MB. If B580's or B582's check-size nears a stop line, B582 moves `ClimateMap`'s sampling into the same worker, which drops the renderer's copy and brings the total back to about 0.3 MB; the gzip reserve of ADR 0079 D4 comes after that.
- **No-go routes:** if deepslate is too slow, the map samples coarser and the ground stays at the smaller window; if it does not match the game on a type, that type moves to "not drawn"; if it fails to load vanilla's overworld at all on a target, Compare is dropped for that target and project-only worlds remain; if the speeds miss by an order of magnitude, the plan stops after the spike and comes back to the user. (B574: the stop rule is not triggered; only the Height map misses by that much, and it has a route.)

### D15 Order

This plan runs after vanilla parity 3 batch 2 (B544) and the Showcase (B572) close, and before the game modes plan, whose world types then get a real map and ground; the shared files and the turn-taking are in the plan's "Overlaps".

### D16 One target fact, plugin API 1.21.0

(As amended after B574; the draft said no plugin API change.) Third-party kinds are drawn only if they lower to worldgen files the engine understands; there is still no contribution point for previews. The spike showed the engine needs one target fact, so that `@msm/terrain` and the jar reader hold no version literal: `Target.worldgen.terrainPreview` (optional; a target without it has no live map of vanilla files), with

- `dataFolders`: the `data/minecraft/` folders the jar reader keeps for this target (the list of WS11; no `dimension` on either target);
- `approximate`: the parts D6 labels as approximate on this target, from `'biome_layout'` and `'end'` (26.3: `end`; 26.4-snapshot-7: `biome_layout` and `end`).

B577 adds it as **plugin API 1.21.0**, because live world generation runs before the game modes plan (D15); that plan's B550 takes **1.22.0**. Built-in plugins still declare `^1.0.0`.

## Alternatives considered

- **Keep the climate map only.** Rejected by the user's request.
- **Run the real generator** (a local server generating chunks, read back by the world reader). It would be exact, including features, carvers and structures. It needs Java, the server jar, the EULA and tens of seconds per change (ADR 0085 alternative (d)), so it cannot be live. Kept as what the parity fixture and the CI comparison already do, not as the view.
- **Our own noise engine from scratch.** Rejected: deepslate is bundled, MIT and already reads these files; a second implementation would only add drift.
- **Vendor vanilla's worldgen JSON** from a mirror of the game's data, so the preview needs no jar. Rejected: it is Mojang's data in the installer, against "never bundle Mojang assets" and the user's word of 2026-11-22.
- **Extend Quick world instead.** It is MSM's own noise and reads none of the project's worldgen files, so it cannot show what the user edits.
- **A 3D terrain view in the preview panel.** Not now: the 2D map works without WebGL and is cheap to test; the 3D view is Try it's ground, one click away.

## Consequences

- Users see their world while they edit it, and beginners get world generation as an offer with a picture, not as fourteen JSON kinds.
- MSM takes on a second place where it can disagree with the game. D6, D13 and the notes bound it; features are approximate for good, and the view says so.
- New package `@msm/terrain`, one line in `tools/check-deps/layers.json`; a new app folder `terrain/` and a worker; the asset cache schema moves to 4 (users re-extract once); a new fixture, a parity class and a CI step; one new e2e spec; a guide page.
- The jar now also supplies data files to the app. The rule that they never leave the cache is tested (no exporter output, no project write, no AI helper context).
- `app.asar` was at 29.8 of 32 MB when this was drafted and is at 30.5 MB, the renderer at 17.2 of 18 MB, after B569; this plan (0.45 MB, D14), Live views and the game modes plan all draw on the same margin, so `ClimateMap` moving into the worker (D14) and then the gzip reserve of ADR 0079 D4 may be needed before this plan's wave 4.
- The rule of D1 binds every later brief and creates three follow-up batches.
- DESIGN section 8 (the preview panel and Try it) and Open Question 15 are updated now for the decision and again at the close for what was built.

## Amendment after the spike (B574, 2026-11-22)

Measured on 26.3 and 26.4-snapshot-7 (seeds 0, 1, 12345 and -7046235981325167892; evidence, numbers and the spike's code in [`docs/reference/spikes/b574/`](../reference/spikes/b574/README.md)). These win over the draft where they differ; D3, D4, D6, D8, D13, D14 and D16 above are changed in place.

- **D3: go, with ten fixes in `@msm/terrain`.** F1 the router field `chunk_surface_level` (deepslate reads `preliminary_surface_level`) and F2 `add_stone_depth` (deepslate reads `add_surface_depth`), renamed in the pre-pass; F3 26.4's noise settings without `default_block`, filled with a placeholder the rules replace; F4 26.4's `upscale` with linear interpolation on all axes, mapped onto deepslate's `interpolated` (exact); F5 `interval_select` keeping one function too few, rewritten into nested `range_choice` until 0.27.3; F6 our own surface pass (deepslate's walks one z row with one biome a chunk); F7 the walker, because unknown types parse silently to 0, "nothing" or "false"; F8 `multi_noise` with a `preset` reported and drawn as one biome; F9 one world a worker (static registries; refilling them takes 0.4 ms); F10 a per-chunk cell grid in place of the unbounded string-keyed interpolation cache (numeric keys alone made the fill 3.7 times faster).
- **What loads.** With F1 to F4 both targets load all 7 vanilla noise settings, 55 density functions, 64 or 65 noises, 42 or 44 named rules and 8 named conditions. Missing on both: rule types `bandlands` and `ore_vein`, conditions `hole` and `steep` (`temperature` is used by no vanilla file), the `flat` and `debug` generators, `multi_noise` presets. Missing on 26.4 only: `upscale` beyond linear, `domain_warp` (no vanilla file uses it).
- **Learned by observation on 26.4, from a fixture of MSM's own:** `upscale` `interpolate_linear` (deepslate's `interpolated`), `nearest_neighbor` (the value at the cell's lower corner), `interpolate_cosine` (a lerp eased by (1 - cos(pi t)) / 2); `domain_warp` with constant offsets (the input sampled at the position plus the offsets). Not learned: `domain_warp` with a function as offset (82 % exact), `upscale` `interpolate_cubic` and `b_spline_cubic` (not tried). They are limit WL6 until B581 adds fixture cases.
- **D6 per target.** 26.3: biome cells 100.0 % in the test dimensions; cells of the same class 98.7 to 98.9 %, surface height exact 88.6 to 93.5 %, top four blocks 91.8 to 94.6 % against worlds that hold carvers and villages; the Nether's surface height exact in every column. The misses are carvers, structures' terrain adaptation, `bandlands` and `steep`, and 0.10 to 0.14 % real density errors; aquifers and noise caves match (the fluid differs in 0.28 to 0.36 % of cells). 26.4: the land as on 26.3 within 0.4 points; the biome layout 67 %. The End: approximate on both.
- **D8: no-go for a bigger area.** 48 by 32 by 48, aligned to 3 by 3 chunks; reserve B594 holds.
- **D13 and D14:** the tolerances and budgets above.
- **D16:** `Target.worldgen.terrainPreview` as plugin API 1.21.0 in B577.
- **Reserves.** B592 (the biome list from the dev mode): **go**. B593 (carvers): **hold** (0.8 % of cells, and code, not data). B594 (a bigger area): **hold**. B595 (structures in the ground): **hold**; Live views 4's B642 takes it over.
- **New limits** (the plan's WL15 to WL17): structures' terrain adaptation is not drawn; the End is approximate; 26.4-snapshot-7's biome layout is approximate.
- **Other answers.** A Vite module worker (its own chunk), not a `blob:` worker (WS12). A typed seed that is a whole number in range is that number, any other text is Java's `String.hashCode` of it; a save's seed is the long `seed` in the compound `data` of `data/minecraft/world_gen_settings.dat`, not in `level.dat` (WS17), so "Seed of one of my worlds" needs a small reader in `@msm/interop` (B577). Placement modifier types number 18 on both targets, not 19. The first feature subset (WS15) is in the plan's B583.

## Status

Proposed (2026-11-22), amended after the spike B574 the same day. The working plan is [`docs/PLAN-live-worldgen.md`](../PLAN-live-worldgen.md) (B574–B595); wave 0 is done and wave 1 (B576, then B577) may start. Decided by the orchestrator on the user's request and open to the user's veto: the new package `@msm/terrain` (D3); features only "about right", carvers and structure pieces not drawn in the first version (D6); the ground as a window of Try it's area (D8); the committed expectations of the parity fixture (D13); the draft budgets and no-go routes (D14); running before the game modes plan (D15); the reserve that lets the runtime's dev mode write the biome list on the user's machine (D4); and the reach of the rule in D1, with its exempt list. Added by the amendment, also vetoable: the End and 26.4's biome layout shown as approximate rather than held back (D6); the size budget of 0.45 MB (D14); plugin API 1.21.0 for this plan and 1.22.0 for the game modes plan (D16); reserve B592 as a go.
