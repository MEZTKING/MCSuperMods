# B565: Showcase measurements (Z1–Z13)

Measured 2026-11-22 for the Showcase plan (deleted at its close B572; the questions and their answers are in ADR 0118's findings) and ADR 0118, from main 9ca98af, on both targets (mc-26.3 and mc-26.4). Nothing here is built, linted or shipped. Every picture is MSM's own drawing: drawn terrain and wood and the examples' own textures (no client jar in this container, so no Mojang picture appears).

## How it was run

- **Vitest over the sim and lowering** (Z1, Z6–Z12): `spike-src/helpers.ts` builds each example for the namespace `showcase` through `bundlePreviewProject` over `createEmptyProject`, lowers it with `lowerProjectAsync(..., { plugins: builtInPlugins })` and turns it into `SimFiles` with `toSimFiles`. `spike-src/clips.test.ts` plays each clip of `spike-src/clips.ts` through a `TryItArea` with the spike player `spike-src/player.ts`, scripts transpiled by TypeScript and run by `inProcessRunner`, one tick at a time (`clock.pause()`, then `clock.step()`).
- **e2e in the real app** (Z2–Z5, Z9, Z13): a temporary line in `app/src/renderer/src/main.tsx` set `window.__b565 = () => import('./showcase-spike/harness')`. `spike-src/harness.tsx` (a lazy chunk of 15 kB) mounts one clip over the app: a `TryItScene` with `smaller`, the clip player's camera as a per-frame value, a `TryItArea` without `audio`, scripts transpiled by main's scripting service and run in Try it's Web Worker, and the still taken with `canvas.toDataURL('image/png')` inside `onFrameDrawn`. `spike-src/showcase-spike.spec.ts` drives it under `xvfb-run -a` with `WEBGL_ARGS` plus `--js-flags=--expose-gc`.
- **Machine:** the shared 4-core cloud machine, SwiftShader, device scale 1, with the parallel engine-mod briefs building: load average 6.8 at the start and 7.9 at the end of the e2e run (as ADR 0085 D11's "loaded 4-core machine").
- **Copies:** `spike-src/` holds the spike's files as they ran; the app copies were deleted. `clips.json` is the ten clip scripts as data. `results/` holds the raw numbers: `z1-lowering.json`, `sim-mc-26.3.json` and `sim-mc-26.4.json` (every step's "What happened" lines, the states at `stillAt` and at the end), `z6-reach.json`, `z7-vehicle.json`, `e2e.json` (frame times, captures, memory, process sizes, every clip's lines in the real app).

## Answers

Times are median and worst of five unless said otherwise. "Box" is the clip's size on the page; with Smaller picture the drawing buffer is half of it.

### Z1 Lowering each example in memory

No problems on either target. Without the Creator's `withTypedBlockModels`: see the note below the table.

| Example | 26.3 median / worst (ms) | 26.4 median / worst (ms) | Files | `SimFiles` (kB, JSON only) | Bundle pictures |
|---|---|---|---|---|---|
| `example_msm_wood_set` | 10.7 / 20.7 | 7.7 / 14.8 | 190 | 66.4 | 14 |
| `example_msm_tameable_pet` | 7.0 / 11.6 | 9.0 / 10.4 | 6 | 16.2 | 3 |
| `example_msm_crop` | 3.8 / 4.1 | 2.3 / 3.7 | 18 | 6.0 | 5 |
| `example_msm_ore_crusher` | 8.5 / 9.0 | 3.5 / 8.0 | 13 | 3.5 | 4 |
| `example_msm_vehicle` | 46.3 / 48.1 | 44.2 / 44.8 | 11 | 5.9 | 3 |
| `example_msm_sky_portal` | 2.4 / 2.4 | 1.9 / 2.1 | 21 | 5.2 | 2 |
| `example_msm_firefly_jar` | 1.5 / 1.5 | 1.2 / 1.3 | 9 | 3.1 | 4 |
| `example_msm_roadside_merchant` | 4.8 / 4.8 | 5.0 / 5.1 | 12 | 12.7 | 2 |
| `example_msm_fluid` | 1.0 / 1.2 | 1.7 / 3.4 | 10 (26.4: 11) | 2.8 | 3 |
| `example_msm_rules` | 2.7 / 2.8 | 2.5 / 2.9 | 9 | 7.0 | 2 |

Build plus lowering in Node (Vitest). The vehicle's time is its build (geometry), not the lowering (0.6 ms). In the renderer, the first lowering of each example took 2–47 ms on 26.3 and 2–65 ms on 26.4 (`lowerMs` in `e2e.json`).

**Do not apply `withTypedBlockModels` before lowering.** It adds the typed blocks' generated models as `minecraft:model` elements, and the typed blocks lower the same model files themselves: 53 `lowering.conflict` errors for the wood set, 4 for the crop, 2 for the crusher, 2 for the portal. That helper is for the Creator's preview, which draws from elements; a clip draws from lowered files. Textures are not in the lowered files: the clip reads them with `bundleAssetReader(bundle, ...)`, so the cache keeps the bundle as well as the `SimFiles`.

### Z2 Mount to first drawn frame (box 320 by 180, Smaller picture)

| | 26.3 | 26.4 |
|---|---|---|
| First mount in the session (the `TryItCanvas` chunk and the first lowering included) | 1,056 ms | 349 ms (chunk already loaded) |
| Each clip's first mount, lowering included | 197–518 ms | 212–440 ms |
| 50 warm mounts, all clips | median 235, worst 367 ms | median 286, worst 564 ms |
| Per clip, warm, median / worst | wood set 267/367, pet 279/345, crop 179/274, machine 204/238, vehicle 197/244, portal 196/208, sparkles 192/216, trader 265/355, fluid 277/317, rules 220/241 | wood set 298/564, pet 337/414, crop 211/212, machine 236/338, vehicle 254/268, portal 214/270, sparkles 230/290, trader 295/312, fluid 313/401, rules 304/397 |

Building the area, its ground and the setup took 10–93 ms of that (`areaMs`); the rest is preparing the pictures and the first mesh build. **Go** (all at or under 1.5 s, the first one at 1.06 s).

### Z3 Frame rate

Over each clip's whole first play after its first second (8 to 10 seconds, 395–552 frames):

| Box (drawing buffer) | 26.3 | 26.4 |
|---|---|---|
| 320 by 180 (160 by 90) | 46.7–54.6 fps; median frame 16.9–19.3 ms, 95th percentile 25.6–34.7 ms | 42.4–49.1 fps; median 18.7–21.3 ms, 95th percentile 31.1–35.0 ms |
| 640 by 360 (320 by 180), 5 seconds each | 40.5–50.9 fps | 36.9–42.8 fps |

Frames over 50 ms: 1 to 6 per clip, mostly the ground being rebuilt. **The loop restart** (clear, ground and setup again) rebuilds every chunk: the largest single rebuild in a clip that looped was 76–505 ms (`maxRebuildMs`), one visible hitch per loop. **Go** (above 24 fps everywhere).

### Z4 Context churn (50 mounts and unmounts, cycling the ten)

| | 26.3 | 26.4 |
|---|---|---|
| "Too many active WebGL contexts" or any WebGL console warning | none | none |
| JS heap after `gc()`, before → after | 46.5 → 35.2 MB | 29.4 → 35.0 MB (+5.6) |
| GPU process working set | 163 → 167 MB | 177 → 180 MB |
| Renderer (tab) process working set | 284 → 301 MB | 276 → 285 MB |

**Go** (no warning, memory back within 20 MB, the GPU process grew 3–4 MB, within noise). The canvas's `loseContext` on unmount (W9) is enough.

### Z5 A still from the live canvas

- `canvas.toDataURL('image/png')` inside `onFrameDrawn` returns the drawn frame without `preserveDrawingBuffer`: 345–2,575 distinct colours in every capture (the fluid clip's sand gives the fewest). The same call from a later task (outside `onFrameDrawn`) returns a blank picture (1 colour) every time, so the still must be taken in `onFrameDrawn`.
- Cost at a 160 by 90 buffer: the first capture of a clip median 50 / worst 167 ms (26.3), 44 / 50 ms (26.4); later captures median 23 / worst 35 ms (26.3), 29 / 47 ms (26.4). The data URL is 22–35 kB. Take one still per clip per session, not one per loop.
- Stills are not byte-stable: the capture is the first frame at or after `stillAt`, and the portal, particles and mobs draw between ticks with the wall-clock time. B568's "byte-stable" test applies to the drawn still only.
- **Go**, no seam needed.

### Z6 Reach and the player's body

- `place`, `use`, `break` and `tool` have **no reach check**: a spawn egg used 18 blocks from the player and a plank placed 59 blocks away both worked (`z6-reach.json`). No teleport before each step is needed.
- A block is **not placed into the player's or a mob's box**: "Elm Planks was not placed: you or a mob stand where it would go." The clip must stand the player away from the blocks it places.
- The player's body is **never drawn** (`TryItCanvas` has no player pass; the clip's camera is its own), and a seated rider is not drawn either.
- Where the player stands still matters: a held item's particles with no position (the spark wand's burst) appear at the player's eye; mob name plates show only within 24 blocks (`PLATE_RANGE`); ambient particles only within 32 blocks (`AMBIENT_RANGE`); placed blocks take their facing from the player's look, which comes from the last `move` (the clip needs a `look` step before placing a door or a crusher).
- **Go**, `player.teleport` once at setup is enough.

### Z7 Vehicles

- `use` with the vehicle item (`./tank`) on a block's top face places it; `useVehicle` with the first vehicle's id gets in ("You got into Tank: W and S drive, A and D steer; Shift gets out."). The id is only known at run time: the clip names "the first vehicle".
- `move` with `forward: 1` drives (6.75 blocks north in 40 ticks). **The move's `yaw` does not steer**: with the look turning 3 degrees a tick, the tank kept yaw 180. **`strafe` steers**: `strafe: 1` for 30 ticks turned it to yaw 270 (`z7-vehicle.json`). A `move` holds until the next one, so a clip sends one `move` per change, not per tick. The tank coasts after `forward: 0`.
- Camera: `driverCamera(area.source.vehicles, alpha, look)` from `tryit/vehicles/camera.ts`, used read only, follows the seat from behind and worked as is (still `mc-26.3-vehicle-t100.png`). Script keyframes are not needed for this clip.
- **Go**, no seam needed.

### Z8 Portals

- The beacon's `light_portal` action is "Only in Minecraft: light the frame of Sky Gate", so the portal cannot be filled by a player action. Six `set` steps of `./sky_gate[axis=x]` inside the frame (after the frame is placed block by block, 14 `place` steps) work, as does putting the same state in the setup; `area.source.catalogue.normalise(groundState(...))` then `area.source.world.set` takes any project state.
- The portal pass draws them without the jar (still `mc-26.3-portal-t200.png`), and their dust particles appear (456 alive, 3,216 emitted by tick 220). `sky_gate.png` has no `.mcmeta`, so the picture itself does not move; the shimmer is the particles.
- The beacon draws as the missing texture without the jar (its model is `minecraft:block/lodestone`): leave it out of the clip, or keep it only for its "Only in Minecraft" line.

### Z9 Rules

- The lucky block's rule book needs the script worker: the rule compiles to a `run_script` handler (counters are script data). Without scripts nothing runs but the trigger line.
- Time: main's TypeScript transpiled the rule script 687 ms after mount on the first use in the session (26.3) and 15 ms when warm (26.4). The rule ran at its step, tick 60, 3.5 s (26.3) and 3.2 s (26.4) after mount. With the worker the rule's steps show one tick after the trigger.
- A clip must not act before the scripts have loaded: `TryItArea` starts loading in its constructor, and a second `loadScripts()` resolves at once (same scripts), so it cannot be awaited. `area.source.scripts?.loaded` (public on `ScriptBridge`) says when; the clip player can wait for it (or start the clock only then). No seam needed.
- Lines with "Run every time": "You broke Lucky Block, which starts rule "Open a lucky block"." "Rule "Open a lucky block" ran as a script." "… set its counter lucky_blocks to 1." "… rolled its 60 per cent chance: it came up ("Run every time" is on)." "… checked its "if": true, so its "then" steps ran." "… played sound Levelup." "… says to you: "Lucky blocks opened: 1"". **Only in Minecraft:** `World.dropItem` and `Player.showActionBar` (once per area). So the plan's caption "Dropped 3 Lucky Coin" is not a line the preview gives; use "Rule 'Open a lucky block' ran" and the message.

### Z10 Crops

- `use` with the produce item `./onion` on farmland does **not** plant: "showcase:onion is not a block or a spawn egg of the project". `use` with the crop block's id `./onion_crop` on the farmland's top face plants it (as the Try it hotbar does), with one "Only in Minecraft" line: "Onion is planted only on #showcase:onion_soil; the preview plants it on anything".
- The Grow tool (`tool` `grow`) adds one stage per use ("Onion grew to stage 2 of 8"): 7 uses from age 0 to 7. The clip used 7 rounds 20 ticks apart over 8 crops (56 lines in "What happened").
- Farmland and water props in the setup are drawn as one-colour cubes without the jar.

### Z11 Machines

- The Power tool lights the crusher: "Ore Crusher is now lit" (`lit=true`, the `ore_crusher_front_lit` picture). A set state is not needed to light it; the clip turned it off again with `set` (a second Power use was not measured).
- The crusher itself draws as the missing texture without the jar (its models' parent is `minecraft:block/orientable`, see "Without the jar" below).

### Z12 Fluids

- `break` digs the quick ground's sand (props break). `use` with `./oil_bucket` against the pit floor's top face pours: "You poured Oil from Bucket of Oil at 24, 8, 24." with two "Only in Minecraft" lines ("Oil flows (spreading a block every 1 second, …); in the preview it stays where you pour it", "Bucket of Oil empties when you pour it and fills again from a source"). The fluid pass draws it (still `mc-26.3-fluid-t160.png`).

### Z13 Sound

- An area made without `audio` (W8: `audio ?? null`) shows captions only. Over all twenty clip plays and the 100 mounts no `AudioContext` was created and no media element played (the spike counted both). The portal hum and the wand's chime became captions. **Go**, no seam needed.

## Without the jar: parents that draw as the missing texture

Not one of Z1–Z13, but it decides how three clips look on a computer where the user has not set up the game's pictures. These vanilla parent models have no MSM fallback in `TRYIT_FALLBACK_MODELS`, so blocks on them draw as deepslate's magenta and black missing texture (stills `mc-26.3-wood-set-t120.png`, `crop-t200`, `machine-t100`, `sparkles-t130`):

- wood set: `block/slab`, `slab_top`, `stairs`, `inner_stairs`, `outer_stairs`, `door_*` (8), `fence_post`, `fence_side`, `fence_inventory`, `template_fence_gate*` (4), `template_orientable_trapdoor_*` (3), `button*` (3), `pressure_plate_up`, `pressure_plate_down`, `leaves`, `cube_column_horizontal`;
- crop: `block/crop`; ore crusher: `block/orientable`; sky portal: `block/nether_portal_ew`, `nether_portal_ns` (not used: the portal pass draws portals), and the beacon's whole model `minecraft:block/lodestone`; firefly jar: its whole model `minecraft:block/glass`.

Logs, planks, the pet, the tank, the portal frame, the merchant, the oil and the lucky block draw correctly. The same gap shows in Try it itself for every user without the jar (ADR 0085 L13).

## The clips as measured

All ten played to their end on both targets with no problem line, the same "What happened" lines and the same states on 26.3 and 26.4 (alive particle counts vary a little between runs: particle lifetimes are not seeded). Positions are blocks in the 48 by 32 by 48 area; flat ground's first air layer is y 4, the quick flat grounds' y 9. Ticks are simulation ticks (20 a second). `./x` is `showcase:x`. The full data, with camera keys, is `clips.json`.

| Clip | Ground and setup | Player | Steps that worked (tick: action) | Camera |
|---|---|---|---|---|
| A set of wood (200 ticks, still 120) | Quick flat, classic layers, trees few, seed 11. Setup: four `./elm_log[axis=y]` posts 3 high at (21/25, 9–11, 21/25), `./elm_planks` back and side walls, a roof of `./elm_slab[type=bottom]` at y 12 | (23.5, 9, 29.5) | 1: look yaw 180; 10–34: `place` `./elm_planks` at (22, 9, 25), (24, 9, 25), (22, 10, 25), (24, 10, 25), each on the top face of the block below; 42, 50: `place` `./elm_slab` on (22/24, 10, 25) up; 60: `use` `./elm_door` on (23, 8, 25) up (door facing north, two halves); 100: `use` (23, 9, 25) opens it; 150: shuts it | eased keys (23.5, 11.5, 33) yaw 180 pitch 12 → (30.5, 12.5, 31.5) yaw 150 → (31.5, 13, 27.5) yaw 120 |
| A pet (200, 100) | Quick flat, trees few, seed 11 | (36.5, 9, 36.5) | 5: `use` `./ember_fox_spawn_egg` on (23, 8, 24) up; 25: again on (26, 8, 25) | (24.5, 11.5, 31) yaw 180 pitch 20 → (28.5, 11.5, 31) yaw 200; the foxes wander out of this view: follow the first mob's position instead |
| Plants that grow (220, 200) | Flat. Setup: `minecraft:farmland[moisture=7]` at (20–28, 3, 24), water at (20–28, 3, 25) | (24.5, 4, 30.5) | 9–37 every 4: `use` `./onion_crop` on (21–28, 3, 24) up; 50–184: `tool` `grow` on each crop, 7 rounds 20 ticks apart | (18.5, 6, 28.5) yaw 200 pitch 25 → (28.5, 6, 28.5) yaw 160 |
| A machine (200, 100) | Flat. Setup: hopper prop at (24, 5, 24), chest prop at (25, 4, 24), oak log at (22, 4, 24) | (24.5, 4, 30.5) | 1: look yaw 180; 10: `place` `./ore_crusher` on (24, 3, 24) up (faces south); 50: `tool` `power` lights it; 180: `set` `./ore_crusher[facing=south,lit=false]` | (22.5, 6.5, 28.5) yaw 200 pitch 22 → (26.5, 6.5, 28.5) yaw 160 |
| A vehicle (220, 100) | Flat | (24.5, 4, 34.5) | 1: look yaw 180; 5: `use` `./tank` on (24, 3, 30) up; 20: `useVehicle` the first vehicle; 30: `move` forward 1; 75: forward 1, strafe 1; 105: forward 1; 135: stop (it coasts to about x 42) | `driverCamera` |
| A portal (220, 200) | Flat | (23.5, 4, 29.5) | 5–70 every 5: `place` `./sky_gate_frame`, a 4 by 5 frame at x 22–25, y 4–8, z 24 (bottom row on the grass, sides upward, top from the west post eastward); 75: `place` `./sky_gate_beacon` on (20, 3, 25); 85: `use` it ("light the frame" only in Minecraft); 87: `set` `./sky_gate[axis=x]` at x 23–24, y 5–7 | (23.5, 7, 32) yaw 180 pitch 8 → (27.5, 7, 31) yaw 155 |
| Sparkles (200, 130) | Flat. Setup: oak log posts at (21/24/27, 4, 24) with `./firefly_jar` on top | (24.5, 4, 26.5) | 1: look yaw 180; 120 and 170: `use` with `./spark_wand` on (24, 5, 24) south face (12 glow and 24 dust particles at the player's eye, sound as a caption) | (24.5, 6.5, 31) yaw 180 pitch 10 → (24.5, 6.2, 30) |
| A trader (200, 100) | Quick flat, trees few, seed 11. Setup: a `minecraft:dirt_path` road at x 22–23, z 14–34; oak log at (25, 9, 24) with `minecraft:bell[attachment=floor,facing=south]` on it | (36.5, 9, 36.5) | 5: `use` `./roadside_merchant_spawn_egg` on (24, 8, 25) up | (23, 11.5, 31) yaw 175 pitch 15 → (26, 11.5, 31) yaw 185; the merchant had wandered out of view by tick 100: follow the mob |
| A liquid of your own (220, 160) | Quick flat, layers sand 3, sandstone 3, stone 2, bedrock 1 | (24.5, 9, 29.5) | 1: look yaw 180 pitch 40; 5–37 every 4: `break` the 3 by 3 at (23–25, 8, 23–25); 51: `use` `./oil_bucket` on (24, 7, 24) up | (24.5, 12.5, 29.5) yaw 180 pitch 35 → (27.5, 12.5, 28.5) yaw 150 |
| Rules: a lucky block (200, 80) | Flat. Setup: `./lucky_block` at (22/24/26, 4, 24) | (24.5, 4, 28.5) | 1: look yaw 180; 60: `break` (24, 4, 24); 140: `break` (22, 4, 24); the scripts must have loaded first (Z9) | (24.5, 6.5, 30) yaw 180 pitch 18 → (25.5, 6.5, 29.5) yaw 170 |

Two steps in `spike-src/clips.ts` are there only as measurements: the crop clip's tick 5 uses the produce `./onion` on purpose (Z10, it plants nothing), and the machine clip's `set` of `lit=true` at tick 60 came after the Power tool had already lit it (Z11).

## Pictures

Taken at each clip's first drawn frame (`t0`) and at `stillAt`, on both targets, as `<target>-<clip>-t<tick>.png` (160 by 90): `mc-26.3-wood-set-t0`, `-t120`; `pet-t0`, `-t100`; `crop-t0`, `-t200`; `machine-t0`, `-t100`; `vehicle-t0`, `-t100`; `portal-t0`, `-t200`; `sparkles-t0`, `-t130`; `trader-t0`, `-t100`; `fluid-t0`, `-t160`; `rules-t0`, `-t80`; and the same twenty for `mc-26.4`. Kept in `stills/`: the ten `mc-26.3` stills at `stillAt` (240 kB); the others are named here only.

## Go or no-go

- **ADR 0118 D13 budgets: go on all three.** Mount to first frame 0.15–0.56 s warm and 1.06 s for the first mount of a session (go at 1.5 s); frame rate 42–55 fps at the 320 by 180 box (go at 24); 50 mounts with no context warning and memory back within 20 MB. The default stays "plays by itself".
- **Reserve B573 for its listed seams: not needed.** Z5 (the still in `onFrameDrawn`), Z6 (`player.teleport`, no reach), Z7 (`strafe` and `driverCamera`) and Z13 (no `audio`) all work with Try it and the sim as they are.
- **One seam the plan did not list:** fallback parents for the vanilla block templates above (`tryit/blocks2/fallback-parents.ts` or `blocks3/fallback-parents.ts`), so that slabs, stairs, doors, fences, gates, trapdoors, buttons, plates, leaves, crops and orientable blocks draw without the jar. It is Try it's code (B540's in wave 12), so it is B573's kind of change. Without it the wood set, crop and machine clips show missing textures on a computer without the game's pictures; the main session decides between B573 with this seam, spare examples, or clips that show only the blocks that draw.
