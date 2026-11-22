# ADR 0119: Live world generation, and the rule "Everything visible live"

## Context

The user asked on 2026-11-22: "Can we make custom world generations if not make it an option. Everything should be visible live".

Custom world generation exists as data: the worldgen plugin has 14 kinds, each lowering 1:1 to the JSON the game reads ([ADR 0022](0022-worldgen-element-model-and-validators.md)), with Biome, Placed Feature, Tree and Dimension Type Studios and the Dimension flow ([ADR 0051](0051-dimension-creator-flow.md)). What a user cannot do is see it. The preview panel shows a climate map for dimensions and world presets, which plots biomes in climate space, not in the world ([ADR 0023](0023-structure-and-climate-previews.md)); Try it's grounds are a grid, a flat world, MSM's own Quick world and a copy of an area of a save ([ADR 0087](0087-try-it-worlds.md)); nothing generates the project's own terrain.

ADR 0023 deferred a noise-sampled biome and terrain map to reserve brief B84 and DESIGN [Open Question 15](../DESIGN.md#18-open-questions), pending the user's agreement, with one open point: whether reading vanilla worldgen JSON from the user's own client jar fits "never bundle Mojang assets". The message above is that agreement. The user also restated the clean-room rule the same day: only `javap` signatures, never Mojang method bodies; vanilla worldgen JSON is read from the user's own client jar at runtime, cached, never exported or bundled, as textures are.

Facts at 30b3fed (the fact table WF1–WF22 in [`docs/PLAN-live-worldgen.md`](../PLAN-live-worldgen.md)): deepslate 0.27.2 (MIT, Misode) is already bundled and its `deepslate/worldgen` module has `NoiseChunkGenerator`, `RandomState`, `NoiseRouter`, `DensityFunction`, `MaterialSystem`, `Aquifer`, the four biome sources and structure placement. Read against the targets' vendored registries, its density function parser knows every type of the 26.3 target and lacks `domain_warp` and `upscale` of the 26.4 target; its surface system lacks the rule types `bandlands` and `ore_vein` and the conditions `hole`, `steep` and `temperature` on both; it has no features, placement modifiers, carvers or flat generator. Whether it matches a real world, and how fast it is in a worker, is not known: that is the spike B574 (questions WS1–WS18).

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
- **What deepslate lacks is added by type id** inside `@msm/terrain`, clean room: from the file format's field names and from what a real world generated from a small fixture shows, never from a Mojang method body. deepslate's source may be read. A type that cannot be learned that way is not guessed: it is reported (D6) and listed as a limit. The seam (a parser hook, a pre-pass or our own parser front) is the spike's WS10; moving to a newer deepslate release that has a type is preferred where one exists (verify at implementation; WS18).
- **Version facts stay in `packages/targets`.** The engine is keyed by type id and data folder key. Which types and folders a version has comes from the target; `@msm/terrain` holds no version literal.

### D4 Input: the project's lowered files over the user's vanilla files

- The engine reads **lowered files**, as Try it does (ADR 0085 D3): what the export would hold. Worldgen kinds lower 1:1, so the map re-lowers only the edited element.
- Vanilla ids resolve from the jar cache, with the project's files laid over them in data pack order, so a project file with a vanilla id replaces vanilla's, as in the game.
- The jar extraction (ADR 0011) is extended to the jar's worldgen, dimension, dimension type and worldgen tag JSON; the asset cache moves to schema 4. The exact path list is WS11's.
- The overworld's and the Nether's biome parameter lists may not be data in the jar (WS9). MSM never ships such a list. If it is missing, the vanilla world in Compare is drawn with one biome colour and says so; reserve B592 lets the runtime's dev mode write the resolved list, obtained through vanilla's own accessors on the user's machine, to the managed instance, where the app reads it like a save.

### D5 Live, off the main thread

Sampling runs in a Web Worker of the renderer, never on its main thread. A view asks for a region; the worker answers in passes, coarse first, each replacing the last; a newer request cancels older work by a token; results are cached by the hash of the files read, the seed and the region. A view asks again 150 ms after the last edit.

### D6 Fidelity levels

As ADR 0085 D5, each part has one level, and the level is shown:

- **As in the game, checked (D13):** the biome layout of a noise world, the shape of the land (the final density, the default block and fluid, sea level, aquifers and noise caves if WS7 holds), the surface rules of the supported types, flat worlds, fixed, checkerboard and End biome sources.
- **Approximate, and labelled so:** features: trees, plants, ores and the project's biome additions, placed by the data's own placement modifiers in the target's feature order, with MSM's own shapes and its own random sequence, so they stand "about there", not at the game's exact blocks; structure start markers.
- **Not drawn, and always said:** carvers, structure pieces, blending with old chunks, the debug generator, any type the engine does not support, mob spawns, light.

Every view lists what it left out by name in its notes. Silence is not allowed.

### D7 The preview panel

One new preview kind `worldgen_map` (a string in the plugin API; no API change), drawn on a 2D canvas outside the WebGL gate: **Map** (Biomes, or Height as shading), **Side cut**, and the existing **Climate** map as a tab, for dimensions, world presets, noise settings, biomes, parameter lists, flat presets and surface rules; a **Value map** for density functions and noises; a **Scatter** view for features and placed features. A kind that is not a world by itself is shown inside a host the user picks (**Seen in**): a project dimension that uses it, or a plain host made around it. The full table is section (a) of the plan.

### D8 The Try it ground "My world generation"

Try it gains a fifth ground: a window of the world the chosen project dimension or world preset generates, at the view's seed and position. It arrives in stages (terrain, surface, features), regenerates in place on any edit to a worldgen element it reads, keeps the player's position and the blocks the user placed where they still fit, and says what was lost. The window is Try it's area (48 by 48 blocks, 32 high) with **Move up**, **Move down** and **Make the land around me**; this ground uses a larger area only if the spike measures it as affordable (WS13). Vanilla blocks are props as in every ground; the strip and the "about right" lines carry D6's labels.

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
- The tolerance (exact-match rate of columns and biome cells) is set by the spike's WS5–WS7 and recorded here at the close.

### D14 Budgets, and the go or no-go

Draft numbers; B574 measures and sets the final ones, which the close records:

- **First picture:** a coarse map (64 by 64 samples) within 250 ms of the debounce ending; the full 256 by 256 map within 2 s; a side cut within 1 s.
- **Ground:** terrain and surface for the area within 1.5 s; features within 3 s; an edit shows new land within 2 s.
- **Size:** 0.3 MB of `app.asar` for all new code, under the stop lines of 31 MB and 17.5 MB.
- **No-go routes:** if deepslate is too slow, the map samples coarser and the ground stays at the smaller window; if it does not match the game on a type, that type moves to "not drawn"; if it fails to load vanilla's overworld at all on a target, Compare is dropped for that target and project-only worlds remain; if the speeds miss by an order of magnitude, the plan stops after the spike and comes back to the user.

### D15 Order

This plan runs after vanilla parity 3 batch 2 (B544) and the Showcase (B572) close, and before the game modes plan, whose world types then get a real map and ground; the shared files and the turn-taking are in the plan's "Overlaps".

### D16 No plugin API in this ADR

Third-party kinds are drawn only if they lower to worldgen files the engine understands. A target fact is added (as a plugin API minor) only if the spike shows the engine needs one.

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
- `app.asar` is at 29.8 of 32 MB; this plan, vanilla parity 3 batch 2 and the game modes plan all draw on the same margin, so the gzip reserve of ADR 0079 D4 may be needed before this plan's wave 4.
- The rule of D1 binds every later brief and creates three follow-up batches.
- DESIGN section 8 (the preview panel and Try it) and Open Question 15 are updated now for the decision and again at the close for what was built.

## Status

Proposed (2026-11-22). The working plan is [`docs/PLAN-live-worldgen.md`](../PLAN-live-worldgen.md) (B574–B595); nothing after its wave 0 starts before the spike B574 has reported. Decided by the orchestrator on the user's request and open to the user's veto: the new package `@msm/terrain` (D3); features only "about right", carvers and structure pieces not drawn in the first version (D6); the ground as a window of Try it's area (D8); the committed expectations of the parity fixture (D13); the draft budgets and no-go routes (D14); running before the game modes plan (D15); the reserve that lets the runtime's dev mode write the biome list on the user's machine (D4); and the reach of the rule in D1, with its exempt list.
