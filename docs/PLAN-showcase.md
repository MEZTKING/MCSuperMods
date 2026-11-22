# Plan: Showcase with live clips

**Status: draft (2026-11-22).** Brief ids B565–B573; [ADR 0118](adr/0118-showcase-with-live-clips.md) (Proposed). Nothing after Wave 0 starts before the measuring brief B565 has reported. Recommended order: beside vanilla parity 3 batch 2, as below ("Where it sits in order").

Working plan for the ROADMAP idea "Showcase for new users" (user, 2026-11-22: "you should show a showcase at the main page or new project on what is possible to make with a live clip of each, so new users may know where to start"). Written 2026-11-22 by the orchestrator at c0086f8 (branch `ccr-d077e76e-4gnbx2`). Every "today" claim below was checked against the code at that commit (fact table W1–W18); everything about speed in the real app is a measuring question (Z1–Z13) for B565.

## In plain words

- **What new users see.** On Home (the first screen of Very easy) and in the New project dialog, a row of cards: "A set of wood", "A pet", "Plants that grow", "A machine", "A vehicle", "A portal", "Sparkles", "A trader", "A liquid of your own", "Rules: a lucky block". Each card has a short moving picture of that thing in a small test area (a door opening, onions growing, a tank driving, a portal shimmering), one sentence in plain words, and **Make this**, which opens the Creator on the matching flow, so the user makes their own version with their own name and colour. **See the example** opens the finished example instead.
- **How the pictures move.** Nothing is filmed. Each clip is drawn live by Try it's own renderer (the in-app preview of ADR 0085) from the example's own files, with a short script: where the camera goes, what is placed, broken or used, and a caption or two. So clips cost no download, always show what the current version really makes, and never show Mojang's pictures: the blocks are MSM's drawn art (ADR 0092), and the user's own extracted game pictures when they have set them up.
- **Kind to the computer.** Only one clip moves at a time: the card under the mouse or keyboard focus, or else the first card in view. The others show a still picture. With "reduce motion" turned on in the system, or the new setting **Play showcase clips** turned off, every card shows a still. Without WebGL, a card shows a drawn picture of the example's things and its sentence.
- **Honest.** Every clip carries a small **Preview** tag, plays no sound, and says in its caption what only happens in the game ("Tame it with sweet berries in the game").
- **What it is not.** No video files, no screen recordings, no showcases from third-party plugins (the list is the app's, like Home's tiles), no new examples (the first ten are examples that exist today), no change to Try it or `@msm/sim` unless a measurement shows a missing seam (reserve B573), no clips in the Easy and Advanced empty editor area.
- **Later.** Skyblock, One block, Lucky block (as a flow) and the other game modes join when the game modes plan lands (its B557 adds their lines to the showcase list).

## What exists to build on

Checked at c0086f8. "As is" means used without change; "missing" names what this plan builds.

| Piece | Today | Reuse as is | Missing |
|---|---|---|---|
| Home | Very easy only; with no mod: a heading, Start a new mod, Open a mod, Surprise me, Your mods; with a mod: the Make tiles and My things (W1) | The layout, the no-mod Start a new mod path (name only), Surprise me's "no mod open: start one" pattern | A Showcase section on both Home states |
| Home tiles | `MakeTileAction` (`flows`, `surprise`, `rules`, `paint`, `ai`), 27 tiles, hidden when a flow is unavailable (W2) | **Make this** is a `MakeTileAction`, opened by the same handler (`openTile`) | Nothing |
| New project dialog | Starters by category with the wizard; Very easy uses the name-only `NewModDialog` (W3) | Selecting a starter and continuing to its wizard | A Showcase strip above the starter list; Make this selects the flow's starter |
| Examples gallery | Search, kind filter, a detail pane that builds the bundle, Open as new project, Copy into my project (W4) | Open as new project and Copy (for **See the example**) | The clip in the detail pane of a showcased example |
| Library | 186 examples and 67 starters (55 Creator flows); pure, deterministic bundles; no picture, clip or showcase field in `ExampleProject` (W5, W6) | The ten examples below, unchanged | Nothing in the library (D3 of ADR 0118: the list lives in the app) |
| A bundle as a project | `bundlePreviewProject`, `bundleAssetReader` (`preview/bundle-source.ts`), `withTypedBlockModels` (W7) | As is | A small cached "example to lowered files" helper |
| Lowering | `lowerProjectAsync` with the project expanders (Rules compile here); the session lowers through it (W8) | As is | Nothing (or one public session method, B566) |
| Try it's area | `TryItArea` (files, target, seed, rule books, scripts) over `LocalWorldSource`; `toSimFiles` (W8, W10) | As is: the clip player drives one area | A clip player that steps it by script |
| Try it's renderer | `TryItScene` (WebGL check, lazy `TryItCanvas`, the no-WebGL message); drawing only, the camera a per-frame value, `active`, `smaller`, `onFrameDrawn` right after a frame, loses its context on unmount (W9) | As is: a clip is one `TryItScene` with a scripted camera | Nothing, unless Z5 or Z13 fail (reserve B573) |
| Grounds and looks | Grid, flat and quick grounds; terrain and wood drawn from the art recipes without the jar; project blocks from their own pictures on fallback parents; vanilla props need the jar (W10, W11) | As is | Nothing |
| Speed | SwiftShader 320 by 180: 43–52 fps, grounds 22–38, a full build about 0.3 s (W12) | As the clip budget's baseline | Mount-to-first-frame and context churn are unmeasured (Z2, Z4) |
| Sizes | `app.asar` 29.8 of 32 MB, renderer 16.7 of 18 MB; stop lines 31 and 17.5 (W13) | — | A budget for the new code: 0.1 MB in all |
| e2e | 42 spec files (39 running); WebGL from SwiftShader flags per spec; a `readPixels` "more than one colour" check (W14) | The flags and the check | `showcase-path.spec.ts` |
| Reduced motion, in-view | Nothing in the renderer uses `prefers-reduced-motion` or `IntersectionObserver` (W15) | — | Both, in the showcase folder only |
| Pictures without WebGL | Surprise me shows a thing's pictures from its bundle (`pngDataUrl`) (W18) | `pngDataUrl` | A drawn still made of the example's pictures |

## The first showcases

Ten cards, in this order (beginner-first: blocks, creatures and plants before machines and logic). Each is backed by an example that exists today and builds on both targets (`supports: hasFabric` where marked, both targets are Fabric). Make this opens the flow named; the Rules card opens the example, because an empty Rule book teaches nothing.

| # | Card (plain words) | Example (id, file) | Make this | Clip (about 8 to 12 seconds, looping) |
|---|---|---|---|---|
| 1 | **A set of wood** "Logs, planks, stairs, a door and a tree of your own." | `example_msm_wood_set` (Elm wood set; `library/src/examples/block-types.ts`) | flow `wood-set` | Quick ground, flat, a few trees. A small elm hut stands (setup); planks and a slab are placed; the door opens and shuts; the camera pans slowly round. |
| 2 | **A pet** "An animal you tame, that follows you and has babies." | `example_msm_tameable_pet` (Tameable fox-like pet; `entities.ts`) | flow `pet` | Quick ground, hills. Two are hatched from the spawn egg and wander; caption "Tame it with sweet berries in the game." |
| 3 | **Plants that grow** "A crop you plant, grow and eat." | `example_msm_crop` (Onion crop; `block-types.ts`) | flow `crop` | Flat ground with farmland and water props. Onions are planted in a row and grow stage by stage (the Grow tool); the camera dollies along the row. |
| 4 | **A machine** "A block that works on items, fed by hoppers." | `example_msm_ore_crusher` (Ore crusher; `containers.ts`) | flow `machine` | A hopper, the crusher and a chest in a chain (setup); the crusher's front lights (Z11); caption "It crushes ore into ingots in the game." |
| 5 | **A vehicle** "Something to drive, with seats and a horn." | `example_msm_vehicle` (Vehicles: a tank battle; `vehicles.ts`, `hasFabric`) | flows `VEHICLE_FLOW_IDS` (the vehicle picker) | Flat ground. The player gets in, the tank drives forward and turns; camera behind (Z7). |
| 6 | **A portal** "A doorway to a new world of your own." | `example_msm_sky_portal` (Two-way sky portal; `portals.ts`, `hasFabric`) | flow `portal` | The frame is built block by block, then the portal fills (Z8) and shimmers with its dust; caption "It takes you to the sky world in the game." |
| 7 | **Sparkles** "Particles of your own, on blocks and wands." | `example_msm_firefly_jar` (Firefly jar; `particles.ts`) | flow `particle` | Jars on fences glow with fireflies; the spark wand is used and a burst rises. |
| 8 | **A trader** "Someone who sells you things for emeralds." | `example_msm_roadside_merchant` (Roadside merchant; `villagers-and-fluids.ts`) | flow `wandering-merchant` (`TRADER_FLOW_ID`) | Quick ground by a road of path props; the merchant stands by its bell and turns; caption "Sells bread and apples, then saddles and leads." |
| 9 | **A liquid of your own** "A liquid with its own bucket, lakes and feel." | `example_msm_fluid` (Oil well; `villagers-and-fluids.ts`, `hasFabric`) | flow `fluid` | Quick ground, sand. A pit is dug, oil is poured from its bucket (Z12); caption "It flows slowly in the game." |
| 10 | **Rules: a lucky block** "Make things happen without code: break it and see." | `example_msm_rules` (Rules: a lucky block; `rules.ts`) | **See the example** as the main button (opens it as a new mod, or copies it into the open one and shows the Rule book) | Three lucky blocks; one is broken, the rule runs with "Run every time" (W17); the caption shows the "What happened" lines ("Rule 'Lucky break' ran", "Dropped 3 Lucky Coin") (Z9). |

Spare examples if one fails its measurement: `example_vehicles_seaside` (vehicle), `example_msm_ember_vines` (plants), `example_msm_cottage_furniture` (blocks), `example_msm_copper_roof` (blocks that age), `example_msm_rules_guard_mob` (Rules).

**Join later:** Skyblock, One block, Lucky block (the flow), Sky islands, Arena game (the game modes plan, B557 and B558, once the void ground exists); a stone set, a gear set and Surprise me itself (a card that rolls a surprise and plays the first thing it makes) are follow-ups.

## Fact table (W1 to W18)

Read in this repository at c0086f8 on 2026-11-22.

| # | Fact | Source |
|---|---|---|
| W1 | Home is shown only in Very easy: `App.tsx` passes `home` to the editor area when `veryEasy`; the no-mod state has the heading "Make your own Minecraft mod", `home-new`, `home-open`, `home-surprise` and up to six recent mods; with a mod, `MakeTiles` then `MyThings`. Easy and Advanced show the empty editor text instead. | `components/home/Home.tsx`, `App.tsx` (about line 2356), `components/EditorArea.tsx` |
| W2 | `MakeTileAction`: `flows` (`flowIds`, optional `starterIds`, `picks`), `surprise`, `rules`, `paint`, `ai`; 27 tiles under eight headings (`TILE_GROUPS`); `TRADER_FLOW_ID` `wandering-merchant`, `VEHICLE_FLOW_IDS` car, tank, plane, boat; the mob flow id is `custom_mob`. | `components/home/tiles.ts` |
| W3 | `NewProjectDialog` lists starters by category (`blank`, `pack`, `content`), runs `StarterWizard` for a starter with parameters and calls `onCreate({ starterId, targetId, values })`; `NewModDialog` (same file) asks only for a name (ADR 0083 D6). | `components/NewProjectDialog.tsx`, `App.tsx` (about line 2614) |
| W4 | `ExamplesDialog`: search over title, kind, category and tags, a kind filter, a detail pane that builds the bundle with `previewBundle` for namespace `my_project`, `onOpenAsProject`, `onCopy`. No pictures. | `components/ExamplesDialog.tsx` |
| W5 | `ExampleProject` and `ProjectStarter` (`id`, `title`, `description`, `kind`, `category`, `tags`, `requiresKinds`, `supports`, `build`; starters also `parameters`, `creator`) have no picture, clip or showcase field. Plugin API 1.20.0 is B527's; 1.21.0 is the game modes plan's (B550). | `packages/plugin-api/src/library.ts` |
| W6 | The ten examples of the table exist with those ids; vehicles, portal and fluid examples are `supports: hasFabric`. | `packages/plugins/library/src/examples/` |
| W7 | `bundlePreviewProject(project, bundle)` and `bundleAssetReader(bundle, readProjectAsset)`; `withTypedBlockModels(bundle)`. | `app/src/renderer/src/preview/bundle-source.ts`, `components/creator/set-preview.ts` |
| W8 | `lowerProjectAsync(project, registry, target, { plugins })` expands first (Rules compile there); `tryit/session-source.ts` has `toSimFiles(files)` and `TryItArea` (options `files`, `target`, `seed`, `vanillaBlockstates`, `ruleBooks`, `scripts`) with its particle field, ambient particles, mob field, `SimClock` and effects. | `packages/core/src/lowering/lower-project-async.ts`, `app/src/renderer/src/tryit/session-source.ts` |
| W9 | `TryItScene` checks `hasWebGL()`, lazy-loads `TryItCanvas`, shows `NO_WEBGL_MESSAGE` and its children otherwise. `TryItCanvas` is drawing only: `grid`, `camera` (a value or a per-frame function), `files`, `folders`, `vanilla` (`null` without the jar), `particles`, `mobs`, `vehicles`, `fluids`, `sky`, `smaller`, `active`, `onFrame`, `onFrameDrawn` (called right after a frame is drawn, line 894), `label`; it runs only while visible and focused, at most 60 fps, and loses its WebGL context on unmount (line 368). | `tryit/render/TryItScene.tsx`, `tryit/render/TryItCanvas.tsx` |
| W10 | `LocalWorldSource`: `act(PlayerAction)` with `move`, `place`, `break`, `use`, `hit`, `interact`, `useVehicle`, `hitVehicle`, `clear`, `tool`; `tick()`, `loadGround(kind, ground)`, `setChanceMode`, `player.teleport(position)`; grounds `flatGround()`, `quickWorld(options)` (shapes flat, hills, island, valley; trees none, few, many); the area 48 by 32 by 48; seeded and deterministic. | `packages/sim/src/local-source.ts`, `types.ts`, `grounds/`, `player/controller.ts` |
| W11 | Without the client jar, terrain and wood ground blocks are drawn from the art recipes (`tryit/render/fallback-colours.ts`, ADR 0092 D16), other vanilla blocks are one-colour cubes, project blocks draw from their own pictures on MSM's fallback parents (`tryit/blocks2/`, `blocks3/fallback-parents.ts`); vanilla parents and props come from the user's extracted jar (ADR 0011, ADR 0085 T4, L13). | as named |
| W12 | ADR 0085 D11 measured, SwiftShader on a loaded 4-core machine: 640 by 360 33–38 fps, 320 by 180 43–52, grounds 22–38 (island the slowest, about 17 under heavy load), a single-block rebuild 1.1–1.5 ms, a full build about 0.3 s, page memory 215–250 MB, GPU process 110–140 MB; Smaller picture is on by default under SwiftShader. | ADR 0085 findings, ADR 0092 findings D16 |
| W13 | `app.asar` 29.8 of 32 MB, renderer 16.7 of 18 MB at B523; briefs stop above 31 MB or 17.5 MB (the gzip reserve of ADR 0079 D4 is next); the Try it chunks about 0.39 MB (B401). | `tools/check-size/index.ts`, HANDOFF, ADR 0085 D11 |
| W14 | 42 e2e spec files (three are B526's skipped placeholders); WebGL comes from `WEBGL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']` in each spec that draws (`tryit-path`, `entities-path`, `art-path`, `creator-path`, `families-path`); `tryit-path` reads pixels with `readPixels` and checks "more than one colour"; without the flags the cloud machine's Electron has no WebGL (ADR 0085 D12 finding). | `app/e2e/` |
| W15 | No renderer code reads `prefers-reduced-motion` or uses `IntersectionObserver`. | `grep` over `app/src/renderer/src` |
| W16 | `TryItEffects` plays project sounds through Web Audio from their bytes; Minecraft's sounds are captions. | `tryit/effects.ts` |
| W17 | Rule books reach the area as `ruleBooks`; logic rules compile to scripts run in the script worker (`tryit/script-worker.ts`, transpiled by the session's scripting service in main); `setChanceMode` gives "Run every time" or a seeded roll. | `tryit/session-source.ts`, ADR 0085 findings D9 |
| W18 | Surprise me shows each thing's pictures from its bundle with `pngDataUrl` (`components/wizard/wizard-model.ts`). | `components/surprise/SurpriseDialog.tsx` |

## Measuring questions (Z1 to Z13)

Answered by B565 in the real app under SwiftShader (`WEBGL_ARGS`), on mc-26.3 and mc-26.4, with numbers.

- **Z1** Lowering each of the ten examples in memory (`bundlePreviewProject` over an empty project, then `lowerProjectAsync` with the plugins): time, file count, problems (expected none) and the size of the cached `SimFiles`.
- **Z2** Time from mounting a clip (lazy chunk loaded) to its first drawn frame at 320 by 180 with Smaller picture. Go at 1.5 s or less, acceptable to 3 s (the still stays up until then), no-go above 3 s.
- **Z3** Frame rate of each clip at 320 by 180 with Smaller picture. Go at 24 fps or more; no-go below 15 (then the default becomes "play on click", ADR 0118 D13).
- **Z4** Context churn: mounting and unmounting clips 50 times, cycling through all ten: no "Too many active WebGL contexts" warning, page memory back within 20 MB of the start, no growth of the GPU process.
- **Z5** A still from the live canvas: `canvas.toDataURL('image/png')` called inside `onFrameDrawn` returns the drawn frame (not blank) without `preserveDrawingBuffer`; its cost.
- **Z6** Whether `place`, `use` and `break` need the player within reach of the position (if yes, the clip player teleports the player before each step with `player.teleport`) and whether the player's own body ever blocks or shows in the picture.
- **Z7** Vehicles: whether `useVehicle` then `move` with `forward` and a changing `yaw` drives and turns the tank, and which camera the clip needs (the view's third-person vehicle camera in `tryit/vehicles/camera.ts`, read only, or the script's own keyframes).
- **Z8** Portals: whether the clip's setup can put lit portal blocks in place through the ground palette, and whether the portal pass animates them and the ambient particles appear.
- **Z9** Rules: whether the lucky block's rule book needs the script worker (counters are script data); time from load to the first rule run; which of its actions show as "Only in Minecraft" with "Run every time".
- **Z10** Crops: planting the produce on farmland by `use` with the produce item, and the Grow tool's `tool` action through the stages.
- **Z11** Machines: whether the crusher's lit front can be shown by the Power tool or only by a set state in the setup.
- **Z12** Fluids: pouring by `use` with the project bucket item into a dug pit.
- **Z13** Sound: whether a `TryItArea` can be made silent without a change in `tryit/` (for example by not wiring its sound output), so a clip never plays a sound.

## Limits (U1 to U13)

| # | Limit | Why | What users see | Mitigation |
|---|---|---|---|---|
| U1 | **A clip is the preview, not the game.** | It is Try it's simulation (ADR 0085 D1). | A **Preview** tag on every clip. | Captions say what only happens in the game; Play is one step away after Make this. |
| U2 | **Mobs only wander.** | ADR 0085 L3. | Pets and traders wander or stand. | The caption names what they do in the game. |
| U3 | **No screens in clips.** | Try it's screens are HTML mock-ups beside the canvas (ADR 0085 L11). | No merchant or machine screen. | Captions. |
| U4 | **Vanilla blocks look plain without the game's pictures.** | Mojang's pictures are never shipped (ADR 0011). | Terrain and wood are MSM's drawn art; other vanilla blocks are one colour. | With the jar extracted, the user's own pictures draw, on their machine only. Clips prefer project blocks and terrain. |
| U5 | **One clip moves at a time.** | One WebGL context; speed under software rendering. | The others show stills. | Hover or focus moves the live clip. |
| U6 | **The first still is drawn, not taken from the clip.** | A frame can only be taken once a clip has played. | Until then, a card shows the example's pictures on a tinted ground. | Taken frames are kept for the session; nothing is written to disk. |
| U7 | **No sound.** | Clips play by themselves; sound would startle. | Silent clips. | Try it plays the example's sounds. |
| U8 | **Needs WebGL.** | The renderer is WebGL (ADR 0085 L14). | A drawn still and the sentence. | Make this and See the example still work. |
| U9 | **A clip follows its example.** | It is drawn from the example's files. | If an example changes, its clip changes. | `showcases.test.ts` plays every clip on both targets in CI. |
| U10 | **Plugins cannot add showcases.** | The list is the app's (ADR 0118 D3). | Only built-in examples have clips. | A plugin contribution later, if a plugin asks. |
| U11 | **A card shows only where its example works.** | Examples carry `supports`. | With a mod open, the mod's target decides; without one, the default target. | — |
| U12 | **Not in Easy and Advanced's empty editor area.** | Kept small; those modes reach it through New project and the palette. | — | The palette's "Showcase: see what you can make". |
| U13 | **A slow computer plays clips slower.** | The script steps by simulation ticks, never skipping. | A clip may take longer than 12 seconds. | Smaller picture is always on in clips. |

## Rules for every brief

The rules of `docs/PLAN-vanilla-parity-3.md` "Rules for every brief" apply (clean room, no new dependency, git worktrees in the scratchpad with the given identity and no `git config`, disk limits, one owner per shared file per wave, notes for the plan, exit criteria, plain words, models), with these additions:

- **App only.** No brief edits `packages/`, `engine-mod/`, `fixtures/`, `examples/` or `app/src/shared/`, `app/src/preload/`, `app/src/main/`. A brief that needs any of them stops and reports.
- **Try it and the sim are read only.** No brief edits `app/src/renderer/src/tryit/` or `packages/sim/` (vanilla parity 3's B540 owns them in its wave 12). A missing seam found by B565 goes to reserve B573, which runs only after B540 has merged.
- **No library content.** Clips use the examples as they are; a clip that needs a different example picks a spare from the table. New examples belong to a library brief of another plan (they change the `examples/` mirror, B539's in batch 2).
- **Shared docs.** `CHANGELOG.md`, `app/CLAUDE.md`'s e2e list, `docs/site/.vitepress/config.ts` (the guide sidebar), ROADMAP, HANDOFF and DESIGN are the close's (B572), unless the brief says otherwise.
- **Size.** App briefs run `pnpm build` and `node tools/check-size/index.ts` and report `app.asar`, the renderer and the new chunks; the showcase's own code stays within 0.1 MB in all; the stop lines stay 31 MB and 17.5 MB.
- **Models.** Opus (`claude-opus-5-5`) at medium effort; B565 at high effort; Sonnet (`claude-sonnet-5-5`) for B571.

## Where it sits in order

- **Owner files do not meet vanilla parity 3 batch 2's.** Batch 2's remaining waves (9 to 14, B528–B544) own the runtime, the entities, blocks-items, scripting and rules plugins, the eject, the Studios (`studios/`), the library's starters and examples and the `examples/` mirror, Try it and the sim (B540), the batch 2 fixture and `ci.yml` (B541), three e2e specs and the `app/CLAUDE.md` e2e line (B542), the AI helper, eight guide pages, the guide sidebar and the changelog (B543). This plan owns a new `app/src/renderer/src/showcase/` folder, `components/home/Home.tsx`, `components/NewProjectDialog.tsx`, `components/ExamplesDialog.tsx`, `App.tsx` (the props and the Make this handler only), `commands/built-in-commands.ts`, `store/preferences.ts`, `components/SettingsDialog.tsx`, their tests, a new e2e spec and new guide pages. None is in a batch 2 owner list.
- **Recommendation: run it beside batch 2**, starting now (batch 2 is in wave 9, mostly runtime and plugin work), in **one extra executor slot at a time** (the engine-mod limit of two is untouched: this plan has no engine-mod brief). Waves 0 to 3 (B565–B569) can run during batch 2's waves 9 to 12; B570 and B571 after B540 has merged (the e2e run then covers both, and Try it's code is settled); the close B572 after B543, so the changelog, the sidebar and the `app/CLAUDE.md` lines are added once. If batch 2's executors are all busy on the same machine and e2e under SwiftShader would slow them, run B570 after B542 instead.
- **Why not after:** the showcase is the first thing a new user sees, it waits on nothing in batch 2 (its ten examples exist), and it is small (nine briefs, no runtime). **The risk of running beside:** B540 may change `TryItArea` or `TryItCanvas` under B566 and B568; B566 adds a contract test over the members it uses (W8, W9), and B569 re-runs the showcase tests after B540 merges.
- **Before the game modes plan.** The game modes plan starts after B544; its B557 (flows and tiles) should add the Skyblock, One block and Lucky block clips to `showcase/showcases.ts` and its B558 the void ground they play on (the main session adds that file to B557's owner list when it reviews this draft).
- **ADR number:** 0118. **Brief ids:** B565–B573. **Versions:** no plugin API or Script API change.

## Waves

| Wave | Briefs (parallel) | Depends on |
|---|---|---|
| 0 | B565 measures | none (beside batch 2 wave 9 or later) |
| 1 | B566 clip format, player and example files | B565 reported |
| 2 | B567 the ten clips; B568 cards, gallery, stills, one live clip | B566 |
| 3 | B569 Home, New project, Examples, Make this, setting, palette | B567, B568 |
| 4 | B570 e2e; B571 guide | B569; B540 merged (B570); B543 not running (B571's sidebar line) |
| 5 | B572 close (main session) | all; B543 merged |
| reserve | B573 Try it seams (only if Z5, Z6, Z7 or Z13 fail) | B540 merged |

## Briefs

### B565 Measures in the real app (wave 0; Opus, high effort; one session)

- **Owner files:** throwaway only: `app/test/showcase-spike/` (Vitest over the sim and lowering, Z1, Z6–Z12) and `app/e2e/showcase-spike.spec.ts` (Z2–Z5, Z13, with `WEBGL_ARGS`), mounting a temporary page through a test-only route or a Vitest browser-free stand-in as the brief finds simplest; evidence into `docs/reference/spikes/b565/` (new; the README line in `docs/reference/spikes/README.md` is the main session's). Nothing under `app/src/` is committed.
- **Scope:** Z1–Z13 on mc-26.3 and mc-26.4 for the ten examples of "The first showcases"; for each failed one, try its spare.
- **Exit criteria:** a report answering Z1–Z13 per target with numbers (times as median and worst of five, frame rates, memory before and after, screenshots of each clip's first and middle frame named per target); the action sequence that worked for each clip (positions, actions, ticks), for B567; go or no-go for ADR 0118 D13's budgets and for reserve B573 (which seam, why); the throwaway files deleted; `pnpm lint`, `pnpm typecheck` green.

### B566 Clip format, player and example files (wave 1; Opus)

- **Owner files:** new `app/src/renderer/src/showcase/clip.ts` (types `ShowcaseClip`, `ClipGround`, `ClipBlock`, `ClipStep`, `ClipCaption`, `CameraKey`; `validateClip(clip)` returning problems), `camera-path.ts` (smooth interpolation of eye, yaw and pitch between keys; yaw the short way round), `clip-player.ts` (`ClipPlayer`: builds a `TryItArea` from the example's files, loads the ground and the setup, steps the area by fixed ticks, sends each step's action at its tick, teleports the player first when Z6 says so, gives the camera pose and the captions for a time, `restart()` by `clear` and setup again, silent per Z13), `example-files.ts` (`exampleFiles(example, target, deps)`: the bundle for namespace `showcase` through `bundlePreviewProject` and `withTypedBlockModels`, lowered with the plugins, as `SimFiles` plus an asset reader from `bundleAssetReader`; cached by example id and target), `showcases.ts` with the type of the list, `SHOWCASES` holding clip 1 (A set of wood) only, and `showcasesFor(target, examples)` (hides a card whose example is not offered); tests `app/test/showcase/clip.test.ts`, `camera-path.test.ts`, `clip-player.test.ts`, `example-files.test.ts`, and `tryit-contract.test.ts` (fails when a `TryItArea`, `TryItScene`, `LocalWorldSource` or grounds member this folder uses disappears or changes shape). `app/src/renderer/src/session/project-session.ts` only if lowering a bundle needs a public method the session does not have: then one method `lowerBundle(builder, target)` and its test.
- **Scope:** ADR 0118 D4, D5. The clip format, as data, with ids written relative to the example (`./elm_planks` becomes `showcase:elm_planks`); setup blocks and spawns before the first frame; steps are player actions (`place`, `break`, `use`, `interact`, `useVehicle`, `move`, `tool`) or `set` (a block state put in place by the clip, for portals and lit fronts, never shown as a player action); captions with a start and an end; `stillAt` (the time the still is taken); a loop of at most 12 seconds; chance mode "Run every time". Stepping is by ticks from the clip's own time, never the wall clock.
- **Exit criteria:** app tests green; clip 1 plays to its end on both targets with no problem line and every step giving the "What happened" line the clip expects; `validateClip` rejects an unknown id, a step after the end, a camera key out of the area and a loop over 12 seconds; lint, typecheck, `pnpm build`, check-size reported.

### B567 The ten clips (wave 2; Opus)

- **Owner files:** `app/src/renderer/src/showcase/showcases.ts` (clips 2 to 10, the order, each card's words and Make this), `app/test/showcase/showcases.test.ts`.
- **Scope:** the table "The first showcases", using B565's action sequences; a spare example where B565 said no-go. Words in plain British English with no ids (they also show in Very easy). Make this as a `MakeTileAction` (`flows` with the flow ids; `VEHICLE_FLOW_IDS` for the vehicle), or `{ type: 'example' }` for the Rules card.
- **Exit criteria:** `showcases.test.ts`: every clip passes `validateClip`; every example id and flow id exists in the session library on both targets; every clip plays to its end on both targets with no problem or unexpected "Only in Minecraft" line; each clip's subject (its first project block or mob) is inside the camera's view at `stillAt` (by `frustumPlanes` and `boxInFrustum` from `tryit/render/camera.ts`, read only); app tests, lint, typecheck green.

### B568 Cards, gallery, stills and one live clip (wave 2; Opus)

- **Owner files:** new `app/src/renderer/src/showcase/ShowcaseGallery.tsx` (a labelled section with the cards in a wrapping row, a heading passed in, and **Pause clips**), `ShowcaseCard.tsx` (picture area, title, sentence, **Make this**, **See the example**, the **Preview** tag, a play or pause button on the picture), `ClipView.tsx` (the lazy chunk: `TryItScene` with `smaller`, the clip player's camera as a per-frame value, captions over the picture, the still taken in `onFrameDrawn` at `stillAt`), `live-clip.ts` (which card plays: the hovered or focused card, else the first card fully in view by `IntersectionObserver`; none when `prefers-reduced-motion: reduce`, the setting is off, the window is hidden, or another view covers the gallery), `drawn-still.ts` (a still made with the 2D canvas from up to three of the example's pictures, scaled by whole numbers without smoothing, on a tint taken from the first picture), `still-cache.ts` (taken stills by clip, target and whether the jar is present, in memory only); tests `app/test/showcase/gallery.test.tsx`, `live-clip.test.ts`, `drawn-still.test.ts`, `still-cache.test.ts`. Uses `showcases.ts` read only (its own fixture clips in tests).
- **Scope:** ADR 0118 D6–D9, D11. At most one `ClipView` mounted at a time; a card that stops playing keeps the last taken still; with reduced motion, a card shows its taken still if there is one, else its drawn still, and its play button plays the clip once; without WebGL (`hasWebGL()` false) no `ClipView` is ever mounted. Keyboard: Tab reaches each card's buttons; focus on a card plays it; Space or Enter on the picture plays or pauses. Each picture has an accessible name ("Clip: A set of wood").
- **Exit criteria:** app tests (the policy with a fake observer and fake media queries; never two live clips; reduced motion and no WebGL never mount one; the drawn still is byte-stable for the same pictures); lint, typecheck, `pnpm build`, check-size with the new chunks reported (`ClipView` and the gallery within 0.1 MB with B566's files).

### B569 Home, New project, Examples, Make this, the setting and the palette (wave 3; Opus)

- **Owner files:** `app/src/renderer/src/components/home/Home.tsx`, `components/NewProjectDialog.tsx`, `components/ExamplesDialog.tsx`, `App.tsx` (the showcase props and the Make this and See the example handlers only), `commands/built-in-commands.ts` (palette `showcase`, only if it needs no `app/src/shared/` change; otherwise left out and said), `store/preferences.ts` (`showcaseClips`, default on), `components/SettingsDialog.tsx` (the switch **Play showcase clips**, find its section by its neighbours); their tests under `app/test/components/` (find with `ls app/test/components`).
- **Scope:** ADR 0118 D1, D10. Home with no mod: **See what you can make** under the buttons; Home with a mod: the same section between the Make tiles and My things, open while the mod has no things, folded to a **Show what you can make** link after that (the fold remembered in preferences). New project dialog: a strip **See what you can make** above the starter list; Make this selects the flow's starter and goes on to its wizard; See the example opens the example as a new project (the dialog's host does what the Examples gallery does). Very easy with no mod: Make this asks for the mod's name (`NewModDialog`, prefilled from the card, "Elm Mod"), creates it and then opens the flow, as Surprise me does with no mod. Examples gallery: a showcased example's detail pane shows its clip card (the same `ShowcaseCard`, without Make this when no flow is named). Re-run `app/test/showcase/` after B540 merges, if it merged during this wave.
- **Exit criteria:** app tests green (Home both states, the fold, the dialog strip selecting a starter, the Very easy no-mod path, the setting turning clips off, the gallery's detail pane); `pnpm build`, check-size reported; lint, typecheck green.

### B570 e2e (wave 4; Opus; after B540 has merged)

- **Owner files:** new `app/e2e/showcase-path.spec.ts`.
- **Scope:** with `WEBGL_ARGS` and `MSM_E2E_NEW_INSTALL=1`: Very easy's Home shows ten cards; hovering a card mounts exactly one canvas and its picture has more than one colour (`readPixels` as `tryit-path`); hovering another still leaves one canvas; Make this on "A set of wood" asks for a name and opens the Creator on the Wood set flow; `page.emulateMedia({ reducedMotion: 'reduce' })` shows stills and no canvas until the play button; the setting off shows no canvas. In Advanced: the New project dialog's strip, Make this on "Plants that grow" opening the Crop wizard. Without the WebGL flags: drawn stills and sentences, Make this still works.
- **Exit criteria:** the spec green three runs in a row and with the full e2e run; the `app/CLAUDE.md` e2e line text handed to the close in the notes.

### B571 Guide (wave 4; Sonnet; not while B543 runs)

- **Owner files:** new `docs/guide/showcase.md`; `docs/guide/very-easy.md` and `docs/guide/first-mod.md` (one paragraph each); `docs/site/.vitepress/config.ts` (the sidebar line), only when B543 is not running, else the line goes to the close.
- **Scope:** what the cards are, Make this and See the example, one clip at a time, reduced motion and the setting, without WebGL; limits U1–U13 in plain words; labels from the code.
- **Exit criteria:** labels match the app (the guide label test, if one covers these pages); the docs site builds (`pnpm --filter` the site's build, as the guide briefs ran it).

### B572 Close (wave 5; main session)

- Review ADR 0118 against the merged code; findings (Z1–Z13 answers, measured sizes and frame rates, what moved); the ADR accepted with findings or amended; DESIGN section 8 (Home, New project, Examples) and a line in the Try it section; ROADMAP (the idea becomes a delivered item, Milestone Log row); HANDOFF; `app/CLAUDE.md` (the `showcase/` folder and the e2e list line); `CHANGELOG.md` `[Unreleased]`; the guide sidebar line if B571 could not add it; root `CLAUDE.md` status (e2e count); this plan deleted, its fact table and limits moved into the ADR.

### B573 Reserve: Try it seams (only if Z5, Z6, Z7 or Z13 fail; after B540 has merged; Opus)

- **Owner files:** only what B565 names, from: `app/src/renderer/src/tryit/render/TryItCanvas.tsx` (a `preserveDrawingBuffer` or `onCapture` prop, for Z5), `tryit/session-source.ts` (a `silent` option on `TryItArea`, for Z13), `packages/sim/src/local-source.ts` or `packages/sim/src/vehicles/` (a scripted position or a vehicle input the clip can send, for Z6 and Z7), with their tests.
- **Exit criteria:** Try it unchanged for its own users (its tests and e2e `tryit-path` green); the clip that needed the seam plays.

## Very easy wording

- Gallery: "See what you can make", "Show what you can make", "Pause clips", "Play", "Pause", "Preview".
- Cards: "Make this", "See the example", and the ten titles and sentences of "The first showcases".
- Setting: "Play showcase clips" ("Moving pictures on Home and in New project. Off shows still pictures.").
- Without WebGL: "This computer cannot show moving pictures here." under the drawn still.

## Notes from implementation

None yet.
