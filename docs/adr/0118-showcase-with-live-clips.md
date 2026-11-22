# ADR 0118: A Showcase with live clips on Home and in New project

## Context

The user (2026-11-22): "you should show a showcase at the main page or new project on what is possible to make with a live clip of each, so new users may know where to start". The ROADMAP idea "Showcase for new users" (Post-1.0 Ideas) describes it.

A new user meets one of two screens:

- **Very easy's Home** ([ADR 0083](0083-very-easy-mode.md) D2). With no mod open it shows three buttons and the recent mods. With a mod open it shows 27 tiles ([ADR 0086](0086-surprise-me-random-mod.md) D8) and My things. It has no pictures of what the tiles make.
- **The New project dialog** (ADR 0020, ADR 0040), in Easy and Advanced. It is a list of starter titles.

The library has 186 examples that show finished things, but they are only reachable through Help > Examples, and only as text.

MSM can already draw a project in motion:

- **Try it** ([ADR 0085](0085-try-it-in-app-test-area.md)) renders lowered files with deepslate, the geo renderer and its own passes, over the deterministic `@msm/sim`.
- It runs at 43 to 52 frames a second at 320 by 180 under SwiftShader.
- Since [ADR 0092](0092-minecraft-style-art.md) it draws ground terrain and wood with MSM's own drawn art when the user has not extracted the game's pictures.

The facts as read before the work are in the fact table below (W1–W18), the limits in U1–U13, and the answers to the measuring questions Z1–Z13 in the findings.

We considered three ways to make the clips:

- **(a) Video files recorded in the game.** Ten clips would cost megabytes against a nearly full `app.asar` (29.8 of 32 MB). They would go stale with every version. They would show Mojang's textures, which MSM never ships (ADR 0011).
- **(b) Animated pictures made at build time from Try it.** These cost less, but still have to be shipped and still go stale. Without the user's jar they would only show drawn art, so they would look the same as (c) anyway.
- **(c) Clips drawn live in the app by Try it's renderer from each example's lowered files.** These cost no download and always match the running version. They show only MSM's art, or the user's own extracted pictures on their own machine.

We take (c).

## Decision

### D1 What and where

A **Showcase** is a gallery of cards headed **See what you can make**. Each card has four parts:

- a live clip;
- a title and one sentence in plain words;
- **Make this**;
- **See the example**.

The gallery appears in three places:

- **Very easy's Home with no mod open**, under the three buttons. This is where most new users land.
- **Home with a mod open**, between the Make tiles and My things. It is open while the mod has no things. After that it folds to a link, **Show what you can make**.
- **The New project dialog**, as a strip above the starter list.

There are two lighter entry points:

- the Examples gallery's detail pane plays the clip of a showcased example;
- the palette has "Showcase: see what you can make".

The empty editor area of Easy and Advanced is unchanged.

### D2 Live, never shipped as video

A clip is drawn while it plays:

- The renderer is one `TryItScene`, with Try it's `TryItCanvas`, used without change.
- The camera comes from the clip's script.
- The world comes from a `TryItArea` over the example's files. The example is built for the namespace `showcase` and lowered in memory with the project expanders, so Rules compile as they do on export.
- No picture, video or recorded frame is shipped.
- Vanilla blocks draw from MSM's fallbacks: drawn terrain and wood, MSM's own box models for the common block shapes, and one-colour cubes for the rest. As built, this is so even when the user's extracted jar is present (findings, "What moved"); the jar serves only what project blocks need from it.

### D3 The list belongs to the app

The showcase list is `app/src/renderer/src/showcase/showcases.ts`, as Home's tiles are `components/home/tiles.ts`:

- It names library examples by id.
- It names Creator flows through Home's own `MakeTileAction`.
- A card whose example or flow is not offered on the target is hidden.

The examples stay in the library unchanged. A clip script is presentation, not content (app rule: no starter or example content in the app).

There is no plugin API change, so the plan can run beside vanilla parity 3 batch 2, which owns plugin API 1.20.0. A `showcases` contribution for plugins is deferred until a plugin asks. It could join the game modes plan's plugin API 1.21.0 if wanted.

### D4 The clip format

A clip is typed data, checked by `validateClip`. It has these fields:

| Field | What it holds |
|---|---|
| `id` | The clip's id. |
| `title`, `sentence` | The card's words. |
| `exampleId` | The library example it is drawn from. |
| `make` | A `MakeTileAction`, or `{ type: 'example' }`. |
| `ground` | `grid`, `flat`, or `quick` with its shape, trees and seed. |
| `setup` | Block states and spawns placed before the first frame. |
| `steps` | At ticks: the player actions of `@msm/sim` (`place`, `break`, `use`, `interact`, `useVehicle`, `move`, `tool`), `look` (the player's look, which decides how a placed block faces), or `set` (a block state the clip puts in place, never shown as a player action). `move` and `look` hold until the next one. Mobs and vehicles are named by order ("the first vehicle"), since their ids exist only at run time. A step may carry what it expects: a block state, or a "What happened" line within a window of ticks. |
| `camera` | Keys of eye, yaw and pitch, eased between them, yaw the short way round; or `driver` (Try it's own vehicle camera, read only); or `follow` (keys relative to the first mob, for clips whose mob wanders). |
| `captions` | Each with a start and an end. |
| `stillAt` | The time the still picture is taken. |
| `length` | At most 12 seconds. |

Ids in a clip are written relative to the example (`./elm_planks`).

### D5 Playback

- The clip player steps the area by simulation ticks from the clip's own time, never the wall clock. A slow machine plays a clip more slowly but never differently.
- Chances use "Run every time".
- At the end, the clip clears the area, sets it up again and starts over. The still covers the picture for the two frames of that rebuild.
- A clip whose example has scripts waits for them to load before its first step (at most 10 seconds of frames, then it plays without them).
- Clips play no sound.
- Captions show over the picture. Rules clips may show the "What happened" lines of the rule they run as captions.
- Each example is lowered once per target in a session, when its card first needs it, without the Creator's `withTypedBlockModels` (finding Z1).

### D6 One clip at a time

At most one clip is live. It is chosen in this order:

1. the card under the mouse, then the card with keyboard focus;
2. then the card whose play button was pressed;
3. otherwise, the first card fully in view (`IntersectionObserver`).

A card the user paused is passed over until its play button is pressed again, and while one is paused no card starts just by being in view.

No clip plays while the window is hidden or out of focus. Every other card shows its still. Clips always draw with Smaller picture at 320 by 180. Moving the live clip unmounts the old canvas, and Try it's canvas then loses its WebGL context. **Pause clips** stops all of them.

### D7 Stills

Before a card's clip has played once in the session, the card shows a **drawn still**: up to three of the example's own pictures, scaled by whole numbers on a tint taken from the first. Once the clip has played, the frame at `stillAt` is taken from the canvas right after it is drawn and replaces the drawn still for the rest of the session. Stills are kept in memory only. Nothing is written to disk.

### D8 Reduced motion and the setting

A card never plays by itself in two cases:

- when the system asks for reduced motion (`prefers-reduced-motion: reduce`);
- when the new setting **Play showcase clips** is off (it is on by default).

In those cases the card shows its still, and its play button plays the clip once.

### D9 Without WebGL

No clip is mounted. Every card shows its drawn still, its sentence and its buttons, with the line "This computer cannot show moving pictures here."

### D10 Make this and See the example

**Make this** opens the clip's Creator flow:

- In the New project dialog, it selects the flow's starter (the first offered one when the card names several) and goes on to its wizard.
- On Home with no mod open, it asks for the mod's name (prefilled, for example "Elm Mod"), makes the mod, then opens the flow, as Surprise me does.
- In an open mod, it opens the flow as its Home tile does, through the same availability check.
- With no mod open in Easy or Advanced (the palette), it opens New project on the flow's starter.
- A card whose flow is not offered on the target falls back to **See the example**.

**See the example** opens the example:

- as a new mod when none is open;
- otherwise it copies the example into the open mod, as the Examples gallery does.

The Rules card uses **See the example** as its main button, because an empty Rule book teaches nothing.

### D11 Honest clips

- Every clip carries a **Preview** tag.
- Captions say what happens only in the game ("Tame it with sweet berries in the game").
- No clip pretends a mob does more than wander.
- No clip shows a screen.

ADR 0085 D7's rule holds: a clip cannot pass for the game.

### D12 The first ten

The first ten cards, each with the example it is drawn from:

| Card | Example |
|---|---|
| A set of wood | `example_msm_wood_set` |
| A pet | `example_msm_tameable_pet` |
| Plants that grow | `example_msm_crop` |
| A machine | `example_msm_ore_crusher` |
| A vehicle | `example_msm_vehicle` |
| A portal | `example_msm_sky_portal` |
| Sparkles | `example_msm_firefly_jar` |
| A trader | `example_msm_roadside_merchant` |
| A liquid of your own | `example_msm_fluid` |
| Rules: a lucky block | `example_msm_rules` |

No spare was needed. The clip outlines as built are in "The first ten as built" below; the measured action sequences are in `docs/reference/spikes/b565/` (`clips.json`). Skyblock, One block and the other game modes join through the game modes plan (its B557 and B558), and the world generation flows through the live world generation plan (its B588).

### D13 Budgets, and the go or no-go

The showcase's own code stays within 0.1 MB, and the stop lines stay 31 MB for `app.asar` and 17.5 MB for the renderer. B565 measures under SwiftShader and decides what happens next:

| Measure | Go | No-go, and what follows |
|---|---|---|
| Mount to first frame | 1.5 s or less (up to 3 s accepted) | Above 3 s: the default becomes "play on click" |
| Frame rate at 320 by 180 | 24 fps or more | Below 15 fps: the default becomes "play on click" |
| 50 mounts and unmounts | No context warning, and memory back within 20 MB | A missing seam goes to reserve B573 |

A missing seam in Try it or the sim, such as taking a still, keeping a clip silent, placing the player or driving a vehicle, goes to reserve B573. That reserve runs only after vanilla parity 3's B540 has merged.

### D14 Tests

- The tests live in `app/test/components/showcase/` (files outside `components/` are type-checked without the DOM library).
- `showcases.test.ts` plays every clip on both targets in Vitest. It checks four things:
  - each example and flow exists;
  - nothing logs a problem;
  - each step gives its expected line;
  - the subject is in the camera's view at `stillAt`.
- Gallery tests cover D6 to D9 with fake observers and media queries.
- The e2e spec `showcase-path` checks five things:
  - one canvas at a time;
  - a drawn picture of more than one colour;
  - Make this into the Creator;
  - reduced motion;
  - no WebGL.

## Consequences

- New users see what MSM makes before they type a name, and one click takes them to the flow that makes it.
- No download size is added, and clips cannot go stale: a changed example changes its clip, and the tests play every clip in CI.
- Home and the New project dialog gain a lazy chunk and one live WebGL context at most. A machine with a blocked GPU sees drawn stills: ADR 0085 D12's open question 3 applies here too.
- The showcase reads Try it and the sim without changing them. Their public members become a contract that `tryit-contract.test.ts` watches.
- Third-party plugins cannot add cards until a contribution point exists (D3).
- `tiles.ts` and `showcases.ts` are both app-side lists of library ids, so a flow renamed in the library must be renamed in both. Tests on both lists fail on an unknown id.

## The first ten as built

Each clip is 10 to 11 seconds (200 or 220 ticks) and loops. Positions, ticks and camera keys are in `app/src/renderer/src/showcase/showcases.ts`.

| # | Card and sentence | Example | Make this | Clip |
|---|---|---|---|---|
| 1 | **A set of wood** "Logs, planks, stairs, a door and a tree of your own." | `example_msm_wood_set` | flow `wood-set` | Quick flat ground with a few trees. A small elm hut stands; planks and slabs are placed, the door is put in, opens and shuts; the camera pans round. |
| 2 | **A pet** "An animal you tame, that follows you and has babies." | `example_msm_tameable_pet` | flow `pet` | Quick flat ground (not hills: the follow camera would sit inside one). Two Ember Foxes hatch and wander; the camera follows the first; the caption says taming happens in the game. |
| 3 | **Plants that grow** "A crop you plant, grow and eat." | `example_msm_crop` | flow `crop` | Farmland beside water. Onions are planted (the crop block, not the produce) and grown by seven rounds of the Grow tool. |
| 4 | **A machine** "A block that works on items, fed by hoppers." | `example_msm_ore_crusher` | flow `machine` | The crusher is placed under a hopper beside a chest, lit by the Power tool and put out by a `set`. |
| 5 | **A vehicle** "Something to drive, with seats and a cannon." | `example_msm_vehicle` | flows `VEHICLE_FLOW_IDS` | The tank is placed, got into, driven and steered by held moves (`strafe` steers); the driver camera. |
| 6 | **A portal** "A doorway to a new world of your own." | `example_msm_sky_portal` | flow `portal` | The frame is placed block by block and the portal filled by `set` steps (lighting is "Only in Minecraft"); its dust is the shimmer. No beacon. |
| 7 | **Sparkles** "Particles of your own, on blocks and wands." | `example_msm_firefly_jar` | flow `particle` | Firefly jars on posts; the spark wand is used twice. |
| 8 | **A trader** "Someone who sells you things for emeralds." | `example_msm_roadside_merchant` | flow `wandering-merchant` | The merchant hatches by a bell on a path road; the camera follows it. |
| 9 | **A liquid of your own** "A liquid with its own bucket, lakes and feel." | `example_msm_fluid` | flow `fluid` | A three by three pit is dug in sand and oil poured from its bucket. |
| 10 | **Rules: a lucky block** "Make things happen without code: break it and see." | `example_msm_rules` | **See the example** | Two of three lucky blocks are broken; the rule runs as a script; the captions are the rule's own lines, without numbers. |

Spares that were not needed: `example_vehicles_seaside`, `example_msm_ember_vines`, `example_msm_cottage_furniture`, `example_msm_copper_roof`, `example_msm_rules_guard_mob`.

## Findings at the close (B572, 2026-11-22)

Reviewed against the merged code of B565–B571 (`app/src/renderer/src/showcase/`, `components/home/Home.tsx`, `NewProjectDialog.tsx`, `ExamplesDialog.tsx`, `App.tsx`, `app/e2e/showcase-path.spec.ts`, `docs/guide/showcase.md`). D1 to D14 hold as amended above. Reserve B573 did not run.

### The measuring questions

Measured by B565 in the real app under SwiftShader on a loaded 4-core machine, on mc-26.3 and mc-26.4; evidence in `docs/reference/spikes/b565/`.

| # | Answer |
|---|---|
| Z1 | Every example lowers in memory with no problem on both targets: 1 to 48 ms in Node, 2 to 65 ms the first time in the renderer; 6 to 190 files, `SimFiles` of 2.8 to 66.4 kB. `withTypedBlockModels` must not be applied before lowering (53 `lowering.conflict` errors for the wood set): it is for the Creator's preview. The cache keeps the bundle too, since the pictures are not in the lowered files. |
| Z2 | Mount to first frame: 1.06 s for the first mount of a session (chunk and first lowering included), 0.15 to 0.56 s after that. **Go** (1.5 s). |
| Z3 | 42 to 55 fps at the 320 by 180 box (46.7–54.6 on 26.3, 42.4–49.1 on 26.4); 37 to 51 at 640 by 360. The loop restart rebuilds every chunk once (76 to 505 ms), hidden by the still. **Go** (24 fps). |
| Z4 | 50 mounts and unmounts: no WebGL warning, the heap back within 20 MB, the GPU process 3 to 4 MB larger (noise). The canvas's `loseContext` on unmount is enough. **Go.** |
| Z5 | `canvas.toDataURL` inside `onFrameDrawn` returns the drawn frame without `preserveDrawingBuffer`; outside it the picture is blank. 23 to 50 ms and 22 to 35 kB a still, so one still per clip per session. Taken stills are not byte-stable; only the drawn still is. |
| Z6 | `place`, `use`, `break` and `tool` have no reach check, so the player is placed once at setup. A block is not placed into the player's box. The player's body is never drawn. Placed blocks face the player's look, hence the `look` step. |
| Z7 | `use` with the vehicle item places it, `useVehicle` gets in, `move` with `forward` drives and `strafe` steers (the move's `yaw` does not). `driverCamera` works read only. |
| Z8 | Lighting a portal is "Only in Minecraft"; `set` steps put the portal blocks in place, the portal pass draws them without the jar and their dust appears. The picture itself does not move. |
| Z9 | The lucky block's rule needs the script worker; the first transpile of a session took 0.7 s, 15 ms warm. The clip waits for `area.source.scripts?.loaded`. Dropping the item and the action bar are "Only in Minecraft", so the caption is the rule's own line, not "Dropped 3 Lucky Coin". |
| Z10 | The produce item does not plant; `use` with the crop block's id does, with one "Only in Minecraft" line about the soil. The Grow tool adds one stage a use. |
| Z11 | The Power tool lights the crusher; no set state is needed for it. |
| Z12 | `break` digs the quick ground; `use` with the project bucket pours; the fluid pass draws it. Flow is "Only in Minecraft". |
| Z13 | A `TryItArea` made without `audio` is silent: no `AudioContext` over 100 mounts. Sounds become captions. |

### Sizes and speed

- `app.asar` 30.5 of 32 MB and the renderer 17.2 of 18 MB after B569 (29.8 and 16.7 at B523; vanilla parity 3 batch 2 merged in between, so the growth is not the Showcase's alone). Both are under the stop lines of 31 and 17.5 MB, by 0.5 and 0.3 MB: the next app batch starts by checking them, and the gzip reserve of ADR 0079 D4 is next.
- The Showcase's own code is within D13's 0.1 MB: the lazy `ClipView` chunk is 11 kB, the format, player and list about 15 kB minified at B566 (before clips 2 to 10), and the folder's eleven source files are 99.5 kB with their comments.
- Tests: twelve files in `app/test/components/showcase/` (the clips' own, `showcases.test.ts`, are 36 tests over both targets) and six "App showcase" tests in `App.test.tsx`; e2e `showcase-path` (three tests, 16.8 to 18.9 s, green three runs in a row; the full run 76 tests in 14.2 minutes, 43 spec files).

### What moved

- **Vanilla block states are not passed to clips.** The gallery passes the extracted jar (`vanilla`) but not `vanillaBlockstates`, so vanilla props and ground in a clip draw as MSM's fallbacks (drawn terrain and wood, plain cubes for the rest) even when the user has set up the game's pictures. D2's "from the user's extracted jar when it is present" holds for what project blocks need from it, not for vanilla blocks. We accept this: clips look the same on every computer, and Try it's per-id loading needs a stable shared map first (follow-up).
- **Fallback parents.** B565 found 19 vanilla parent models with no MSM fallback (slabs, stairs, doors, fences, gates, trapdoors, buttons, plates, leaves, crops, orientable blocks, glass). They were added to Try it itself by a separate worker (MSM's own box models), so clips and Try it draw them without the jar.
- **The vehicle card in New project picks the Car flow.** The dialog chooses the first offered starter of the card's flows; on Home the card opens the vehicle picker as the tile does. The guide says so.
- **A card whose flow is not offered falls back to See the example** (D10), instead of being hidden (D3 hides a card only when its example is not offered).
- **Script state survives the loop restart.** Clear keeps a rule's counters, so the lucky block's second loop counts on. No caption shows a number, and a test pins that; "Only in Minecraft" lines show once per area.
- **More than the plan asked:** the `look` step, the `driver` and `follow` cameras, step expectations (D4); **Hide what you can make** beside **Show what you can make**, kept as the preference `showcaseOpen`; the Examples detail pane heads the card "What it looks like"; after the user pauses a card nothing else starts by being in view (D6).
- **The pet clip is on flat ground**, not hills, and the portal clip has no beacon (it has no fallback model and its action is "Only in Minecraft").
- **Tests moved** from `app/test/showcase/` to `app/test/components/showcase/` (D14).

### Follow-ups

- Pass vanilla block states to clips once Try it has a shared, stable map of them.
- The vehicle picker for the vehicle card's Make this in New project.
- Reset script state on a loop restart, if live "What happened" lines are ever shown as captions.
- The sentences of nine cards are pinned by Vitest only (the e2e reads the wood set's).
- A hardware GPU and a PC with a blocked GPU are unmeasured (ADR 0085 D12's open question 3); the user's Windows look decides whether "plays by itself" stays the default.
- More cards: the game modes (the game modes plan's B557 and B558), world generation flows (the live world generation plan's B588), a stone set, a gear set and Surprise me itself.
- A `showcases` contribution for plugins, only if a plugin asks (D3).

## Fact table (W1 to W18)

Read in this repository at c0086f8 on 2026-11-22, before the work (moved here from the deleted plan). They describe the code the Showcase was built on, not the code after it: W1, W3, W4, W13, W14 and W15 changed with this batch (findings).

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

U4 after the close: vanilla blocks in a clip look plain even with the game's pictures set up (findings, "What moved").

## Status

Accepted with findings (2026-11-22, close B572; briefs B565–B572, reserve B573 not run; the plan is deleted, its fact table and limits are above). Vetoable defaults, for the user's look:

- the gallery on both Home states and in the New project dialog, not in Easy and Advanced's empty editor area;
- the list in the app, not a plugin contribution;
- the ten cards and their order;
- the Rules card opening the example rather than the Rule book;
- one live clip: hover or focus first, else the first card in view, playing by itself;
- silent clips;
- the **Preview** tag;
- stills kept in memory only;
- the setting **Play showcase clips**, on by default;
- the fold of the Home section once a mod has things;
- the Examples gallery's detail pane playing clips;
- vanilla blocks in clips drawn as MSM's own pictures on every computer.
