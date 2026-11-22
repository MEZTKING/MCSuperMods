# ADR 0119: Live world generation, and the rule "Everything visible live"

## Context

The user asked on 2026-11-22: "Can we make custom world generations if not make it an option. Everything should be visible live".

Custom world generation exists as data: the worldgen plugin has 14 kinds, each lowering 1:1 to the JSON the game reads ([ADR 0022](0022-worldgen-element-model-and-validators.md)), with Biome, Placed Feature, Tree and Dimension Type Studios and the Dimension flow ([ADR 0051](0051-dimension-creator-flow.md)). What a user cannot do is see it. The preview panel shows a climate map for dimensions and world presets, which plots biomes in climate space, not in the world ([ADR 0023](0023-structure-and-climate-previews.md)); Try it's grounds are a grid, a flat world, MSM's own Quick world and a copy of an area of a save ([ADR 0087](0087-try-it-worlds.md)); nothing generates the project's own terrain.

ADR 0023 deferred a noise-sampled biome and terrain map to reserve brief B84 and DESIGN [Open Question 15](../DESIGN.md#18-open-questions), pending the user's agreement, with one open point: whether reading vanilla worldgen JSON from the user's own client jar fits "never bundle Mojang assets". The message above is that agreement. The user also restated the clean-room rule the same day: only `javap` signatures, never Mojang method bodies; vanilla worldgen JSON is read from the user's own client jar at runtime, cached, never exported or bundled, as textures are.

Facts at 30b3fed (the fact table WF1–WF22 below): deepslate 0.27.2 (MIT, Misode) is already bundled and its `deepslate/worldgen` module has `NoiseChunkGenerator`, `RandomState`, `NoiseRouter`, `DensityFunction`, `MaterialSystem`, `Aquifer`, the four biome sources and structure placement. Read against the targets' vendored registries, its density function parser knows every type of the 26.3 target and lacks `domain_warp` and `upscale` of the 26.4 target; its surface system lacks the rule types `bandlands` and `ore_vein` and the conditions `hole`, `steep` and `temperature` on both; it has no features, placement modifiers, carvers or flat generator. Whether it matches a real world, and how fast it is in a worker, was not known when this ADR was drafted: the spike B574 (questions WS1–WS18) measured it on 2026-11-22, and its answers are in "Amendment after the spike" below, with D3, D4, D6, D8, D13, D14 and D16 changed in place. What the built code reaches is in "Findings at the close".

## Decision

### D1 The rule: everything visible live

"Everything should be visible live" (user, 2026-11-22) is a standing rule beside vanilla parity:

- Every kind that makes something a player can see or hear has a **live view** in the app: in the preview panel, in its Studio or in Try it. Live means the view follows an edit by itself, without a button, an export or the game, and shows a first picture within the time budget of D14.
- A kind with nothing to see (pack settings, an atlas list, the mod's own settings) is **exempt**, and listed as such with the reason.
- The state of every kind is kept in [`docs/LIVE-VIEW-AUDIT.md`](../LIVE-VIEW-AUDIT.md) (written by B575, linked from `docs/COVERAGE-AUDIT.md`). A kind without a live view is a gap in that audit, with the batch that closes it.
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

One new preview kind `worldgen_map` (a string in the plugin API; no API change), drawn on a 2D canvas outside the WebGL gate: **Map** (Biomes, or Height as shading), **Side cut**, and the existing **Climate** map as a tab, for dimensions, world presets, noise settings, biomes, parameter lists, flat presets and surface rules; a **Value map** for density functions and noises; a **Scatter** view for features and placed features. A kind that is not a world by itself is shown inside a host the user picks (**Seen in**): a project dimension that uses it, or a plain host made around it. The table as built is in "Findings at the close".

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

This plan runs after vanilla parity 3 batch 2 (B544) and the Showcase (B572) close, and before the game modes plan, whose world types then get a real map and ground. The files the two share (Try it's ground files, the library's starter index, Home's tiles, the showcase list) were this plan's first, so the game modes plan's B557 and B558 build on them.

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
- **New limits** (WL15 to WL17 below): structures' terrain adaptation is not drawn; the End is approximate; 26.4-snapshot-7's biome layout is approximate.
- **Other answers.** A Vite module worker (its own chunk), not a `blob:` worker (WS12). A typed seed that is a whole number in range is that number, any other text is Java's `String.hashCode` of it; a save's seed is the long `seed` in the compound `data` of `data/minecraft/world_gen_settings.dat`, not in `level.dat` (WS17), so "Seed of one of my worlds" needs a small reader in `@msm/interop` (B577). Placement modifier types number 18 on both targets, not 19. The first feature subset (WS15) is in the findings below.

## Findings at the close (B591, 2026-11-22)

Reviewed against the merged code of B576–B590 and B592: `packages/terrain/`, `app/src/renderer/src/terrain/`, `tryit/grounds.ts`, `GroundPicker.tsx` and `session-source.ts`, `showcase/`, `components/creator/CreatorPreview.tsx`, `studios/worldgen/MapLine.tsx`, `packages/sim/src/grounds/generated.ts`, `packages/interop/src/minecraft-install/` and `world/worldgen-settings.ts`, `app/src/main/platform/worldgen-biome-lists.ts`, `engine-mod`'s `dev/DevBiomeLists.java` and `parity` `WorldgenParityTest`, `fixtures/worldgen-parity/`, `app/e2e/worldgen-live-path.spec.ts` and `docs/guide/live-world.md`. D1 to D16 hold as amended above, with the outcomes below. The close changed only docs and ran `pnpm lint` and the What's New test; every number here is a brief's own, from its DEVLOG entry of 2026-11-22. Reserves B593, B594 and B595 did not run.

### Each decision's outcome

| Decision | Outcome |
|---|---|
| D1 The rule | Stands, as a golden rule line in the root `CLAUDE.md` and a rule in `docs/HANDOFF.md`. `docs/LIVE-VIEW-AUDIT.md` now counts 42 kinds with a live view, 67 that need one and 9 exempt (28, 81 and 9 before this plan). The 67 are Live views 2 to 4 (ADRs 0120–0122). |
| D2 Open Question 15 | Built. Vanilla worldgen JSON is read from the user's jar into the cache and never leaves it: tests pin that no exporter output, project file or AI helper context holds it, and that no AI helper or exporter code names the call. The fixture is written from the data format by `make_fixture.py`; the repository holds no vanilla worldgen file. |
| D3 The engine | Held: deepslate 0.27.2 wrapped in `@msm/terrain`, not forked, with the six seams and F1 to F10. More was needed than the spike found, all in our own code: see "Corrections to deepslate" below. |
| D4 Input | Held. The jar's folders are the target fact's `dataFolders`: 23 folders at B577 (1,271 files on 26.3, 1,325 on 26.4), 24 since B585 added `tags/block` (1,571 and 1,640 files). The cache records the folder list, so a changed list is extracted again without another schema bump. The biome lists come from the runtime's dev mode (B592, landed). |
| D5 Live, off the main thread | Held: a Vite module worker, lanes per view, tokens, coarse then fine passes, an LRU cache of 32 answers, a 150 ms debounce; a test fails when anything but the worker entry imports `@msm/terrain`. One world a worker became **several workers**: the map and the Try it ground share one, and Compare, the Creator, the Studios and the Showcase each make their own on first use, so no view pushes another's world out. |
| D6 Fidelity | Held per target, with one level added in practice: a type that is close but not exact is drawn and listed as "About right: …" rather than left out (`bandlands`, `ore_vein`, `temperature`). One limit is new (WL18, a surface rule's biome check near biome borders) and WL17 is wider than the spike saw. |
| D7 The preview panel | Built as one preview kind, `worldgen_map`, that picks its view by the kind's folder. All 14 worldgen kinds and `msm:biome_addition` have a view; structure sets show as markers on a world's map. The table as built is below. |
| D8 The ground | Built as decided: 48 by 32 by 48 on 3 by 3 chunks, three stages, Move up, Move down, Make the land around me, Show on the map, placed blocks kept or counted. An edit makes the land again in one `features` pass, not three stages, so trees do not vanish and come back. |
| D9 Seed, position, Compare | Built. A new view rolls a random seed; **Seed of one of my worlds** reads a save's seed through `readWorldSeed`. Compare runs in a second worker and offers vanilla's overworld, Nether and End, or the overworld on another vanilla land setting the world names. |
| D10 Without the jar, without WebGL | Held; the behaviours are listed under "Without the jar" below. The map, side cut, value map and Scatter are 2D canvases. |
| D11 Beginners | Built: the tile **Make a world** (it replaces "Make a world or biome" and keeps the Dimension flow and the Custom biome starter), five flows in the group `worlds`, five examples, four noise settings templates. Every flow draws without the jar except One biome everywhere's "Like the overworld". |
| D12 Showcase | Three world cards, not five ([ADR 0118](0118-showcase-with-live-clips.md) "Amendment: the world cards"). No card falls back to its still. |
| D13 Keeping it honest | Built: `fixtures/worldgen-parity/` (21 dimensions on 26.3, 29 on 26.4), `expectations.json`, `WorldgenParityTest`, `packages/terrain/test/parity.test.ts`, and the vanilla step in the `engine-mod` CI job. Rates are below. |
| D14 Budgets | Coarse map, full Biomes map, side cut, ground and edit: met. **Height: missed** (3.4 to 3.9 s against 2 s), shown shaded from a coarse grid first. The ground's first load after a launch went over once. Size: about 0.37 MB of the 0.45 MB. No stop rule was triggered. |
| D15 Order | Done before the game modes plan, which now builds on the `generated` ground, the tile's hand-over hook and the 13-card list. |
| D16 Plugin API 1.21.0 | Shipped by B577 (`WorldgenFacts.terrainPreview`: `dataFolders`, `approximate`). The engine's own `TerrainTargetFacts` gained optional `featureSteps` and `featureOrder` in B585, filled by the app from the target's existing `worldgen.featureSteps` and `vanillaFeatureOrder`; that was the one change to the interface the spike wrote, and it is not a plugin API change. |

### The preview panel as built

| Kind | View |
|---|---|
| `minecraft:dimension` | **Biomes**, **Height**, **Side cut**, **Climate**; the **Structures** toggle; **Compare with vanilla**; **Walk in it**. A flat world draws its layers; a debug world says it is only in the game. |
| `minecraft:worldgen/world_preset` | The same, with a **Dimension** picker (a picker, not a tab per dimension). |
| `minecraft:worldgen/noise_settings` | Map and Side cut **Seen in** a project world that uses it, else "A plain world with these settings and one biome". |
| `minecraft:worldgen/biome` | The host's map with this biome lit, its share of the view and **Find it**; the plain host is this biome everywhere on the overworld's land (needs the jar). |
| `minecraft:worldgen/multi_noise_biome_source_parameter_list` | Biomes in a plain host on the overworld's land (needs the jar). |
| `minecraft:worldgen/flat_level_generator_preset` | "A plain world with these layers": the Side cut shows the layers (there is no separate layer column). |
| `minecraft:worldgen/material_rule`, `material_condition` | Map and Side cut in a host; a plain host puts the rule on the overworld's land, and for a condition glowstone where it is true (there is no separate top-blocks map; needs the jar). |
| `minecraft:worldgen/density_function`, `noise` | **Value map**: **From above** with a **Height** slider, or **Side cut**; a blue, white and orange ramp around 0, the range in view, the value under the mouse; a function **Seen in** a world or **On its own**. |
| `minecraft:worldgen/feature`, `placed_feature` | **Scatter** on a 3 by 3 chunk patch of MSM's own flat land, **From above** or **From the side**, with a count; a lone feature is placed four times a chunk (ores eight times through the stone), and the notes say so. |
| `minecraft:worldgen/block_state_provider` | A strip of sample picks and their shares. |
| `msm:biome_addition` | Scatter in the first of its biomes the files have, with **The addition is on** to switch it off. |
| `minecraft:worldgen/carver` | The line "Carved caves show only in the game" (WL4). |
| `minecraft:dimension_type` | The Side cut of a world that uses it draws its lowest and highest block lines; the Studio has **See it on the map** and **Walk in it**. |
| `minecraft:worldgen/structure_set` | Markers "may start here" on any world's map for `random_spread` placements; other placements are named as not marked. |

Beside the panel: the Creator's **Map** tab for a flow that makes a world preset or a dimension, redrawn after every answer from the bundle held in memory; **See it on the map** and **Walk in it** in the Biome, Placed Feature, Tree and Dimension Type Studios; **Walk in it** under the map's position controls.

### Measured times

On the cloud machine the briefs ran on (4 shared cores), the app under `xvfb-run -a` with SwiftShader.

| Measure | Budget (D14) | Spike, Electron worker | Engine in Node (B578, B583, B585) | In the built app |
|---|---|---|---|---|
| Coarse map, 64 by 64 | 250 ms after the debounce | 82–85 ms | 49–54 ms | 11–81 ms after the debounce over 16 edits (B582); 39–50 ms in the e2e (B589). **Met.** |
| Full Biomes map, 256 by 256 | 2 s | 1.33–1.37 s | 642–744 ms | **Met.** |
| Height map | 2 s | about ten times over | 15.4–16.1 s at a 4-block step, 3.8–4.1 s for 128 by 128, 1.1 s for 64 by 64 | **Missed: 3.4–3.9 s to done.** It shades from one sample every `4 × zoom` blocks first, then every `2 × zoom` blocks in four bands; found heights are kept per world for panning. |
| Side cut, 256 wide, full height | 1 s | 0.79–0.86 s | 156–161 ms | 0.83–0.88 s to done, a coarse pass first. **Met.** |
| Ground, terrain and surface | 1.5 s | 1.67–1.87 s for 9 full-height chunks | 121–170 ms at y 50, 222–321 ms at y -20 (9 chunks, 32 high) | Warm: terrain 167–534 ms, surface 287–1,083 ms. **Met warm.** The first load after a launch: terrain 0.5–1.6 s, surface 0.9–2.3 s over three launches, **over the budget once (2.3 s)**. |
| Ground, features | 3 s | — | 372–649 ms with features (worst 957 ms) | Warm 637–1,578 ms; first load 1.2–3.0 s (3.02 s once). **Met warm.** |
| An edit to new land | 2 s | about 225 ms to a coarse map | a new world 125–133 ms, 4 ms when the random state is kept | 251–685 ms (B584), 770–824 ms in the e2e. **Met.** |
| Move up, Move down, Make the land around me | — | — | — | 251–1,854 ms |
| Frame rate on the ground with trees | Try it's 22–38 on grounds | — | — | 17.5–22.9 frames a second |
| Value map; Scatter | — | — | 48 ms from above, 34 ms side cut; 70 ms land with features | — |
| World clips (Showcase) | 1.5 s to the first frame, 3 s accepted | — | — | First launch 1.35–2.72 s, warm 0.56–1.41 s; 35–52 frames a second, the caves card 20–33 |

The jar: extraction takes 2 to 21 ms more (110 to 131 ms in all) and writes about 1,000 more files; reading the cached worldgen files takes 190 to 340 ms and gives 1.23 MB of compact JSON.

### Sizes

- **The plan's own code is about 0.37 MB of `app.asar`, inside the 0.45 MB of D14**: the terrain worker chunk 193.7 kB (289.0 kB at B582, before [ADR 0123](0123-gzipped-vendored-target-data.md) tree-shook deepslate), the `WorldMap` chunk 80.7 kB with the value map, Scatter, Compare, markers and deepslate's structure placement (39.2 kB at B582), `LiveMap` 2.9 kB, and about 0.1 MB across Try it, the Creator, the Showcase and the library's five flows and examples. The figure is summed from the briefs' check-size reports; no single clean build measured it at the close.
- **D14's first step did not help.** Moving `ClimateMap`'s sampling into the worker saves 409 bytes, because the renderer's deepslate chunk is shared with the 3D previews and Try it. B582 left `app.asar` at 31.03 MB and the renderer at 17.56 MB, both over their stop lines, and the second step was taken instead: ADR 0123 (vendored data gzipped, deepslate tree-shaken, the renderer budget 19 MB).
- At B587 and B588: `app.asar` 26.2 of 32 MB, the renderer 17.6 of 19 MB (stop lines 31 and 18.5 MB).

### Parity per target

| What | 26.3 | 26.4-snapshot-7 |
|---|---|---|
| Fixture, all dimensions (MSM's own files; three seeds, 200 biome cells and 100 whole columns a dimension and seed), after B581 | biomes 100 %, cells of the same class 99.93 %, surface height exact 99.94 %, top four blocks 94.7 % | biomes 97.7 % (reported: the layout is approximate), cells 99.95 %, height exact 99.95 %, top four 96.1 % |
| The same before B581's types and corrections | 95.2 %, 98.4 %, 87.4 %, 87.5 % | 94.2 %, 86.2 %, 66.8 %, 88.1 % |
| Fixture dimensions under D13's floor, reported and labelled | `rule_bandlands` top four 6.7 % (the bands move as in the game; the colours are MSM's own recipe), `rule_ore_vein` 93.0 %, `rules_biome` 92.3 % | the same, and the biome cells of every source that is not fixed: checkerboards 90.3 %, `multi_noise` 60.8 % |
| Vanilla's settings (the CI step: MSM's test dimensions over vanilla's noise settings) | biomes 100 %; cells 99.2–99.8 %, height exact 97.3–100 % for the six overworld settings dimensions and the Nether | cells and heights the same; biomes reported |
| The Nether's cells in that step | 96.8 %, reported: its cave carver (WL4); its heights are gated and pass | the same |
| The End in that step | biomes 52 %, heights 52 %, reported (WL16); the `slice` correction did not change it | the same |
| Real worlds with carvers and villages (the spike) | biome cells 100.0 % of 169,680; cells 98.7–98.9 %; height exact 88.6–93.5 %; top four 91.8–94.6 % | the land within 0.4 points of 26.3; the biome layout 67 % |
| Aquifers (the fixture's aquifer dimension, cells of the same class) | 98.01 % as deepslate binds them, 98.62 % with the aquifer noises bound, 99.06 % with the sample position corrected too | — |
| Vanilla's biome lists from a Play (B592; the game's own sampler at 3,328 cells over four seeds) | overworld 3,072 of 3,072; the Nether 250 of 256 (97.7 %; 68 of 256 before the Nether noise fix) | the same counts; the map stays labelled WL17 |
| Structure starts | `random_spread` exact in the spike's 26.4 worlds (136 of 136); B585's tests check start chunks against an independent `java.util.Random` | |

The vanilla step measures with the GameTest's own levels, which B579 checked against ordinary worlds of the vanilla dedicated server, not with a separately generated world; it gates the overworld settings dimensions and the Nether's heights.

### Corrections to deepslate, in our own code

None of these patches `node_modules`; all are in `packages/terrain/src/`.

- **Named functions were copied at every reference** (deepslate's `mapAll` maps a named function again each time it is read, so `sloped_cheese` was three nodes a corner). `fill.ts` `NoiseBinder` resolves each name once; with the per-column cache the router stays bit-identical to deepslate's on all 7 noise settings of both jars.
- **Aquifers were given unmapped functions**, so every aquifer noise was 0. `BIND_AQUIFER_NOISES` is `true` since B581, after B579 measured both ways.
- **Three corrections installed as prototype replacements** when `extensions/index.ts` is first imported: `positional-random.ts` (the x term of a position's seed wraps at 32 bits), `surface-depth.ts` (the surface depth is a whole number), `aquifer.ts` (`NoiseAquifer.computeFluid` built its samples' x from the z offset). They change deepslate for everything in the same JavaScript realm, which today is only the terrain workers and the tests that run the engine in their own thread.
- **`corrections.ts`**: `floor`, `round`, `ceil` and `truncate` default `multiple` to 1 (deepslate reads 0), and `slice` works on its axis at its coordinate (deepslate ignores it).
- **The Nether's climate noises** (B592, `world.ts`): under `legacy_random_source` the noises `minecraft:nether/temperature` and `minecraft:nether/vegetation` are made the old Nether way; deepslate does that only for the old ids. Learned by observation: the Nether's biome cells went from 68 to 250 of 256.
- The pre-pass still covers F5 (`interval_select`) until the pin moves to 0.27.3 after 2026-11-30; the corrections above must be checked against 0.27.3 then.

### What is drawn about right, and what is left out

- **Every type of both targets' registries is now parsed.** Learned exactly from the fixture: all five `upscale` modes and mixed axes, `domain_warp` with constant and with function offsets (offsets worked out at the block and moved by whole blocks: 100 % of heights, 83 % with the fraction kept), `hole`, `steep` (33 of 33 steep columns, no false one), the flat generator.
- **About right, listed as "About right: …":** `bandlands` (the band position is exact, the colours are MSM's own), `ore_vein` (where a vein runs is exact in 9,337 blocks; ore against filler is 78 %), `temperature` (below 0.15; cooling with height is not learned).
- **Features:** all 18 placement modifier types (`block_predicate_filter`, `environment_scan` and `surface_relative_threshold_filter` approximate; count noises MSM's own); feature types `tree` (all 10 trunk and 12 foliage placers, eight decorators), `fallen_tree`, `simple_block`, `block_column`, `ore`, `scattered_ore`, `disk`, `freeze_top_layer`, `no_op` and the five selectors. Named and not drawn: `geode`, `monster_room`, `lake`, `spring_feature`, `underwater_magma`, `multiface_growth`, `fossil`, `huge_fungus`, the speleothem, coral, End, Nether and vegetation-patch types, root placers and the other tree decorators.
- **Not drawn:** carvers, structure pieces and their terrain adaptation, blending, debug worlds, `concentric_rings` and `dimension_origin` markers.

### Without the jar

- A world made only of project files draws in full: the five flows (but "Like the overworld"), the fixture, the Scatter (its land is MSM's own noise world) and a noise alone.
- A view that needs a vanilla file shows the set-up banner: the banner shows when the files need the jar and the world misses a file in the `minecraft` namespace; a missing project file is named in the notes instead. The plain hosts of a biome, a parameter list and a surface rule or condition stand on the overworld's settings, so they need the jar.
- Compare with vanilla is off, with its own set-up line.
- While the banner shows, the files are read again every 5 s, so a set-up or a cache made again by itself is picked up. In the Creator and the Studios the banner's button only puts a status line that points to Settings, Game locations (follow-up).
- Showcase clips never read the jar for the land, so every computer draws the same world; a world whose biomes are vanilla's then has no trees (the islands' jungle trees), and the ground's "about right" line still shows (follow-up).
- Vanilla's overworld and Nether biomes need one Play besides the jar (WL7). The lists are asked for again every 30 s, so a Play made while the app runs shows them.

### What moved

- **Height is over its budget** and is shown coarse first (D14's own route); the floor is the splines that do not depend on height plus the base noise at every cell row the bound cannot rule out.
- **The ground's cold first load** (worker and world made, engine warming) passed 1.5 s on one launch of three.
- **B585 fixed B582's plain worlds**: the hosts of surface rules and conditions wrote `surface_rule`, which the targets do not read; they now set `material_rule` (`hosts.ts`, `views.ts`).
- **B592 landed**, so WL7 is lifted after one Play, and it fixed the Nether's noise naming in `world.ts`. The writer needs no version seam (the accessors have the same signatures on both versions); the seam is the GameTest's climate sampler. The dev mode's server side now writes one file, `<gameDir>/msm-dev/biome-lists.json` (format 1, about 0.7 MB, 7,599 points on 26.3 and 7,600 on 26.4), atomically and only when its text changed.
- **A new limit, WL18**, and a wider WL17 (below). Neither has its own line in the notes yet: this is the one place where the rule "silence is not allowed" is not met (follow-up).
- **Three world cards, not five**; one tile, not two; One biome everywhere lists 13 vanilla biomes, not the project's (a flow never reads project content); the empty sky asks only for the biome and uses `final_density` -1, not an empty flat world.
- **Not built:** the "Walk in it" line at the end of the Dimension flow (the Creator's Map tab shows the world; the guide does not mention the line); a layer column for flat presets and a top-blocks map for surface rules (the Side cut in a plain host shows both).
- **The Creator and the Studios lower with the built-in plugins' kinds**, because they hold no project session; a third-party plugin's kinds are not drawn there.
- **`migrateFrom` of `mc-26.4` now reshapes noise settings** ([ADR 0037](0037-second-target-mc-26.4-and-target-upgrade.md), amended): found when CI exported the world examples for 26.4.
- **The parity fixture has its own jar** (`msm_worldgen_parity_fixture`), loaded only by the tasks `worldgenParity` and `worldgenVanilla`, so no other parity run sees its dimensions.
- **Tests live in `app/test/components/terrain/`**, not `app/test/terrain/` (the renderer's tsconfig).
- **CI found three things the local runs did not:** terrain tests that do real engine work passed 5 s on the CI runner (explicit timeouts with the measurements in a comment; one test builds its stages lazily); GameTests read script log lines from a 1024-line ring that later lines evict (`gametest/ScriptLogs` keeps every line per host); and the 26.4 export of 26.3 mirror projects (the migration above).

### Rules that stay

The plan's additions to "Rules for every brief", for any later brief that touches `@msm/terrain` or the jar's data (Live views 4, the reserves):

- **Clean room for worldgen (user, 2026-11-22).** Only `javap` signatures of Mojang classes; never a method body. deepslate's source (MIT) may be read and adapted with the licence line kept. A type deepslate lacks is written from the format's field names and from what a real world generated from a small fixture shows; if that is not enough it becomes a limit, not a guess.
- **Vanilla worldgen JSON comes only from the user's own client jar at runtime**, cached under `<msmHome>/cache/`. It is never committed, bundled, exported, written into a project or sent to the AI helper. Tests that need it run only where a jar is present and skip elsewhere.
- **The engine is keyed by type id and folder key, never by version.**
- **No fork of deepslate, one world a worker, nothing sampled on the renderer's main thread.**
- **Honest views.** Every view names what it left out; a type shown as checked needs a fixture case.

### Tests at the close

Terrain 142 tests (7 skipped without a jar); app 2,919 in 309 files; sim 688; library 2,211; exporters 1,995; interop 185; AI 111; the runtime 845 GameTests per variant (26.3, 26.3 without GeckoLib, 26.4) with `MsmDevBiomeListsGameTest`; `WorldgenParityTest` on both versions; e2e `worldgen-live-path` (three tests, green three runs in a row; the full run 80 tests in 14.3 minutes, 44 spec files). No clean-worktree run of the whole repository was made at the close.

### The spike's answers (WS1 to WS18)

The questions were the plan's; the full answers and evidence are in [`docs/reference/spikes/b574/README.md`](../reference/spikes/b574/README.md).

| # | Question | Answer |
|---|---|---|
| WS1 | Does deepslate load vanilla's settings? | Yes with F1 to F4: 7 noise settings, 55 density functions, 64 or 65 noises, 42 or 44 named rules, 8 named conditions. |
| WS2 | Biome map speed | Coarse 82–85 ms, full 1.33–1.37 s. |
| WS3 | Height speed | About ten times over 2 s; side cut 0.79–0.86 s. |
| WS4 | Terrain speed | 9 chunks 1.67–1.87 s, 16 chunks 2.5–3.0 s, full height. |
| WS5 | Biome parity | 26.3 100.0 %; 26.4 67 %; the End 41–61 %. |
| WS6 | Terrain parity | Cells 98.7–98.9 %, height exact 88.6–93.5 %, top four 91.8–94.6 %. |
| WS7 | Aquifers and noise caves | They match; the fluid differs in 0.28–0.36 % of cells. |
| WS8 | The newer target | `upscale` linear, nearest and cosine and `domain_warp` with constant offsets learned from a fixture; the rest by B581. |
| WS9 | The overworld's biome list | Not in the jar; reserve B592 a go. |
| WS10 | Adding types | A parser front and a rule front; no hook in deepslate's rule parser. |
| WS11 | The jar | 1,271 and 1,325 files, about 2 MB; a schema bump extracts again by itself when the jar is still there. |
| WS12 | The worker | A Vite module worker with its own copy of deepslate's worldgen module. |
| WS13 | A bigger area | No-go. |
| WS14 | The cost of an edit | About 225 ms to a coarse map with nothing kept. |
| WS15 | Features | 18 placement modifier types; the first subset above; the sim has no tree growing to reuse. |
| WS16 | Structure starts | 136 of 136 `random_spread` starts. |
| WS17 | Seeds | A whole number in range is itself, other text is Java's `String.hashCode`; a save's seed is in `data/minecraft/world_gen_settings.dat`. |
| WS18 | A newer deepslate | 0.27.3 (2026-11-16) fixes `interval_select` only; usable from 2026-11-30. |

### Follow-ups

Kept in `docs/ROADMAP.md` "Live world generation" and `docs/HANDOFF.md`:

- **Notes that are missing or wrong:** a line for WL18 and for 26.4's border shift on sources that are not `multi_noise`; `generatedNotes` saying "Trees, plants and ores are about right here" when nothing grows without the jar; the guide's limits table then gains the same rows.
- **Speed:** tighter range bounds for the Perlin octaves to bring Height inside 2 s; warming the worker (make it and the first world before the first view asks) for the cold first load.
- **Walk in it:** a place in deep water lets the player sink to the area's floor (stand them on the water or pick land); the first-run card opens under the ground picker; Walk in it from a Scatter and at the end of the Dimension flow.
- **The Showcase:** a drawn still for the world cards (a small map picture; today the plain tint); a Cloud Realm card once Skyblock's start island exists.
- **The Creator and the Studios:** a host context that gives them the project session, so third-party kinds draw there; an App-level link to Settings from their banners.
- **The biome lists:** the app finds the managed instance's game folder from the last Play status of this run (`playGameDir` in `node-platform.ts`); look it up directly so the lists show after a restart without a Play.
- **Parity:** the End (cause not found); the Nether's last 2.3 % at borders; the biome lookup near borders; ore against filler in a vein; temperature cooling with height; `concentric_rings` and `dimension_origin` markers; re-measure 26.4's biome layout on the next 26.4 build.
- **Housekeeping:** deepslate 0.27.3 after 2026-11-30 (then drop the pre-pass for F5 and re-check the corrections); a project upgraded to 26.4 before the migration fix still carries `default_block` (a quick fix or a check on open); mod mirror projects on a non-default target in the library test.
- **Reserves, not run:** B593 carvers, B594 a bigger Try it area, B595 structures in the ground (Live views 4's B642 takes it over). A Studio for noise settings and world presets was never in the plan.

## Fact table (WF1 to WF22)

Read from the code at 30b3fed, before the plan's work; moved here from the plan at its close. "Since" says what the plan changed.

| # | Fact | Where | Since |
|---|---|---|---|
| WF1 | deepslate is pinned at 0.27.2 in the pnpm catalogue and used by the app, `@msm/interop` and the structures plugin; MIT, by Misode. | `pnpm-workspace.yaml`, `app/package.json` | Also `@msm/terrain`. |
| WF2 | `deepslate/worldgen` exports `NoiseChunkGenerator`, `RandomState`, `NoiseRouter`, `NoiseGeneratorSettings`, `DensityFunction`, `MaterialSystem`, `Aquifer`, `Heightmap`, `WorldgenRegistries`, `BiomeSource` (multi noise, fixed, checkerboard, the End), `Climate` and `structure/`. | `lib/worldgen/*.d.ts` | — |
| WF3 | Its density function parser knows every type in the 26.3 target's registry. The 26.4 target's registry adds `domain_warp` and `upscale` and no longer lists `interpolated`. | `lib/worldgen/DensityFunction.js`; the targets' `vendor/mcmeta/registries.json` | Both added in `extensions/`. |
| WF4 | `MaterialSystem` parses rule types `block`, `sequence`, `condition` and conditions `above_preliminary_surface`, `biome`, `noise_threshold`, `not`, `stone_depth`, `vertical_gradient`, `water`, `y_above`. Both targets also list rule types `bandlands` and `ore_vein` and conditions `hole`, `steep` and `temperature`. | `lib/worldgen/MaterialSystem.js` | All five added; our own rule front parses the whole tree. |
| WF5 | deepslate has no features, placement modifiers, carvers or flat generator, and places no structure pieces. | `lib/worldgen/` | Features, modifiers and the flat generator are ours; carvers and pieces are not drawn. |
| WF6 | Both targets: chunk generators `debug`, `flat`, `noise`; biome sources `checkerboard`, `fixed`, `multi_noise`, `the_end`; parameter lists `nether` and `overworld`; 18 placement modifier types; carver types `canyon` and `cave`; structure placements `concentric_rings`, `dimension_origin`, `random_spread`. | The same registries | — |
| WF7 | The worldgen plugin contributes 14 kinds, each lowering 1:1 to JSON; only dimension and world preset declared a `previewKind` (`climate_map`). | `packages/plugins/worldgen/src/kinds/` | All 14 declare `worldgen_map`. |
| WF8 | `PreviewPanel` routes on `ElementKind.previewKind`, a string in the plugin API; `ClimateMap.tsx` is a lazy 2D canvas. | `app/src/renderer/src/preview/` | `worldgen_map` routes to `terrain/WorldMap.tsx`; the climate map is its **Climate** tab. |
| WF9 | The jar extraction kept models, block and item definitions, block and item textures, the English lang file and `worldgen/placed_feature`; the cache was schema 3. | `packages/interop/src/minecraft-install/` | Schema 4, with the target's `dataFolders`. |
| WF10 | Try it's area is 48 by 32 by 48; grounds were `grid`, `flat`, `quick`, `world`; a ground is `GroundBlocks`. | `packages/sim/src/types.ts`, `grounds/` | `generated` added; the area is unchanged. |
| WF11 | The app side keeps `GroundChoice`, the picker's words and the user's presets; From my world reads an area in main through `@msm/interop` `world/`. | `app/src/renderer/src/tryit/` | The saves list also carries each world's seed. |
| WF12 | Try it: full build about 0.3 s; 33–38 frames a second under SwiftShader, grounds 22–38. | ADR 0085 findings | The generated ground with trees: 17.5–22.9. |
| WF13 | `app.asar` 29.8 of 32 MB, renderer 16.7 of 18 MB. | `docs/HANDOFF.md` at the time | 26.2 of 32 MB and 17.6 of 19 MB (ADR 0123). |
| WF14 | Worldgen Studios: Biome, Placed Feature, Tree, Dimension Type; the rest use the schema form. | `app/src/renderer/src/studios/worldgen/` | Each Studio has the map line; no new Studio. |
| WF15 | The Dimension flow offers seven terrains, six naming vanilla noise settings by id. | `packages/plugins/library/src/starters/dimension.ts` | Its wizard shows the Map tab; those six need the jar to preview. |
| WF16 | The targets vendor mcmeta registries, vanilla-mcdoc and `worldgen/feature-order.json`; no vanilla worldgen JSON is in the repository. | `packages/targets/mc-*/vendor/` | Still none. |
| WF17 | A showcase clip's ground was `grid`, `flat` or `quick`. | `app/src/renderer/src/showcase/clip.ts` | `generated` added. |
| WF18 | Home's tiles are data (`MakeTileAction`), hidden when their flow is not offered. | `app/src/renderer/src/components/home/tiles.ts` | `replacedBy` on a flows action (`SKYBLOCK_HAND_OVER`). |
| WF19 | The reference pack holds notes, measured tables and a region reader, with no game code; `tools/run-fabric-server` starts a real server. | `docs/reference/vanilla-worldgen/README.md`, `tools/` | The standing fixture is `fixtures/worldgen-parity/`. |
| WF20 | The game modes plan owns the void, flat and sky island world types, the start structure and a void Try it ground. | `docs/PLAN-game-modes.md` | The empty sky flow hands over to its Skyblock flow. |
| WF21 | On both targets `worldgen/feature` and `worldgen/carver` are the folders, and biome colours and spawns are attributes. | `docs/HANDOFF.md` "Earlier lessons" | — |
| WF22 | The level reader gave world names and no seed. | `packages/interop/src/world/level.ts` | `world/worldgen-settings.ts` `readWorldSeed`. |

## Limits (WL1 to WL18) and their outcome

Moved here from the plan at its close; the guide's page `live-world.md` says them in plain words.

| # | Limit | Why | What users see | Outcome at the close |
|---|---|---|---|---|
| WL1 | **A preview, not the game's generator.** | MSM runs deepslate's code, not Minecraft's. | A **Preview** tag on the map, the ground's panel and every clip. | Stands. Play is the real check. |
| WL2 | **Vanilla parts need your Minecraft jar.** | Mojang's files are never shipped. | Project-only worlds draw; anything naming a vanilla file shows the set-up banner. | Stands; see "Without the jar". Block tags also come from the jar since B585. |
| WL3 | **Trees, plants and ores are about right, not block for block.** | Feature code is the game's; MSM places by the data's modifiers with its own shapes and random sequence. | "Trees, plants and ores are about right here; the game places them exactly."; every left-out type is named. | Stands. The line also shows when nothing grows (follow-up). |
| WL4 | **Carved caves and ravines are not drawn.** | Carvers are code with no data to read. | A line in the notes and on the carver kind; noise caves are drawn. | Stands: 0.66 to 0.81 % of overworld cells, and the Nether's cells at 96.8 %. Reserve B593 did not run. |
| WL5 | **Buildings are not drawn; markers show where one may start.** | Piece assembly is the game's. | **Structures**: markers "may start here" for `random_spread`; other placements are named. | Stands. Live views 4 (its B642 takes over reserve B595). |
| WL6 | **Some types cannot be drawn yet.** | Types deepslate lacks. | The type is named, and what was drawn instead. | **Shrunk to three about-right types**: `bandlands` colours, ore against filler in an `ore_vein`, `temperature` cooling with height. Every other type of both registries is drawn. |
| WL7 | **The vanilla overworld's and Nether's biome layout needs one Play.** | Their lists are not in the jar's data. | Before a Play: vanilla land in one colour and "Vanilla's biomes show here after you have pressed Play once." | **Lifted after one Play** (B592): the overworld exact, the Nether 97.7 %. The lists are found through this run's Play status (follow-up). |
| WL8 | **The ground is a window.** | Try it's area is small by design. | 48 by 48 blocks, 32 high; tall land is cut, with a line. | Stands. Move up, Move down, Make the land around me. Reserve B594 did not run. |
| WL9 | **Old chunks are not blended.** | Blending needs an existing world. | — | Stands. |
| WL10 | **No mobs, light or weather from the biome.** | Try it's limits (ADR 0085). | As in every ground. | Stands. |
| WL11 | **A slow computer draws the sharp picture later.** | Work is stepped, never skipped. | The coarse picture stays longer. | Stands; Height is where it shows (3.4 to 3.9 s on the test machine). |
| WL12 | **The seed is the view's, not a world's.** | The game picks a seed per world. | The seed box; a new view rolls one. | Stands; **Seed of one of my worlds** is built. |
| WL13 | **Debug worlds are only in the game.** | Nothing to learn from them. | A line. | Stands. |
| WL14 | **The audit's other kinds wait.** | This plan built worldgen's views only. | `docs/LIVE-VIEW-AUDIT.md`. | Stands: 67 kinds, Live views 2 to 4. |
| WL15 | **Land shaped for buildings is not drawn.** | Structures' terrain adaptation is the game's. | A line beside WL5's. | Stands. Live views 4. |
| WL16 | **The End is approximate.** | Its biome source and land do not match the game; the cause is not found. | "The End is about right here." | Stands: biomes 52 %, heights 52 % in the vanilla step. The target fact `approximate: 'end'` goes when it is fixed. |
| WL17 | **Biome borders are approximate on 26.4-snapshot-7.** | The snapshot changes biome placement in code, not in data. | "Biome borders are about right on this version." for a `multi_noise` world. | Stands, and wider: the game stores biomes moved a cell or two at borders for every source that is not fixed (checkerboards 90.3 %, `multi_noise` 60.8 % in the fixture; 67 % over vanilla's settings). The line shows only for `multi_noise` worlds (follow-up). Re-measure on the next 26.4 build. |
| WL18 | **A surface rule's biome check is about right near biome borders** (new at B581). | The game reads a biome condition's biome from a nearby cell near borders; learning it would mean copying the game's algorithm. | Surface blocks may differ for a block or two at a border (92.3 % of the fixture's `rules_biome` columns have the right top four blocks). No line says so yet. | New. A note line is a follow-up; the parity test reports the dimension and does not gate it. |

## Status

Accepted with findings (2026-11-22, close B591; briefs B574–B592; reserves B593, B594 and B595 not run and kept as follow-ups; the plan is deleted, its fact table, limits and spike answers are above). Decided by the orchestrator on the user's request of 2026-11-22 and open to the user's veto, as vetoable defaults:

- the reach of the rule in D1 and its exempt list, and the golden rule line "Everything visible live";
- the new package `@msm/terrain` over deepslate, with corrections to deepslate installed in our own code rather than a fork or a wait for upstream (D3);
- the runtime's dev mode writing vanilla's biome lists into the managed instance on the user's machine, read by the app like a save (D4, B592);
- features only "about right", and carvers, structure pieces and land shaped for buildings not drawn (D6);
- the End and 26.4-snapshot-7's biome layout shown as approximate rather than held back, and types that are close but not exact (`bandlands` colours, ore veins, `temperature`) drawn and labelled rather than left out (D6);
- the Height map shown although it takes 3.4 to 3.9 s, shaded from a coarse grid first (D14);
- the ground as a window of Try it's area, 48 by 32 by 48 on whole chunks, with no bigger area (D8);
- one seed per project kept with the view preferences, a new view rolling a random one, and Compare with vanilla in a second worker (D9);
- the tile **Make a world** in place of "Make a world or biome", the five flows and their questions, One biome everywhere listing vanilla biomes, and the empty sky asking only for the biome until Skyblock takes it over (D11);
- three world cards in the Showcase, whose clips never read the jar (D12; ADR 0118);
- the committed expectations of the parity fixture and the tolerances, with the vanilla step gating the overworld settings and the Nether's heights only (D13);
- the size budget of 0.45 MB, of which about 0.37 MB is used (D14; the renderer's 19 MB budget is ADR 0123's);
- plugin API 1.21.0 for this plan and 1.22.0 for the game modes plan (D16);
- Upgrade project target dropping `default_block` from noise settings ([ADR 0037](0037-second-target-mc-26.4-and-target-upgrade.md), amended);
- the view's labels (Map, Biomes, Height, Side cut, Climate, Seen in, Find it, Value map, Scatter, Structures, Compare with vanilla, Walk in it, My world generation);
- the reserves left as follow-ups: carvers (B593), a bigger Try it area (B594), structures in the ground (B595, taken over by Live views 4).
