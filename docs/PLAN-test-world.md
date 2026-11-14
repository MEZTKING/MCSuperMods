# Plan: Try it, an in-app test area

Working plan for the user's request of 2026-11-14: "Test inside the app — a built-in test view in MCSuperMods where you can walk around, place your blocks, see mobs and particles, without launching Minecraft at all." Written 2026-11-14 by the orchestrator. Decisions live in [ADR 0085](adr/0085-try-it-in-app-test-area.md) (Proposed). This file holds the fact table, the limits, the rules for every brief, the briefs B385–B403 in ten waves over four slices, the overlaps with the particles batch (`PLAN-particles.md`) and the Rules and Play batch (`PLAN-blocks-and-play.md`), and an empty "Notes from implementation" that the main session appends to. It is deleted at close (history goes to `DEVLOG.md`, the fact table and limits into ADR 0085's findings).

Nothing here starts before the user has seen ADR 0085's vetoable defaults, and nothing after B385 starts before B385's numbers pass the go thresholds (ADR 0085 D11).

## In plain words

- **What it is.** A small flat test area inside MCSuperMods. You walk or fly around, put down and break your blocks, see how they look in every state, and later spawn your mobs, see your particles and watch which of your rules run. It opens at once, needs no Minecraft, no launcher and no account, and changes as you edit.
- **What it is not.** It is not Minecraft. Movement is roughly right, mobs only wander, and commands, redstone, survival, loot and world generation are not there. The view always says "Preview, not the real game." and always has the Play in Minecraft button for the real check.
- **Why not show the real game inside the app.** The real game cannot be shipped inside MSM or shown in its window (Mojang's licence, and it draws in its own window); that is what Play does. Running a hidden real server and drawing its world ourselves was weighed carefully: it would give real behaviour, but needs Java, a large download, a long start and the same restarts as Play, and the half you look at would still be our approximation. It is put aside, not thrown away.
- **Build first:** slice 1, "Look and place" (B385–B392).

## Fact table

Checked 2026-11-14 against the sources at a522189 (the session branch), deepslate 0.27.2's type declarations in `node_modules`, the built `app/out` of the current tree and the Loom-cached Fabric API jars. Nothing from Mojang's jars was read for this plan.

| # | Fact | Source |
|---|---|---|
| T1 | deepslate 0.27.2 `StructureRenderer(gl: WebGLRenderingContext, structure: StructureProvider, resources, { facesPerBuffer?, chunkSize?, useInvisibleBlockBuffer? })` has `setStructure`, `updateStructureBuffers(chunkPositions?: vec3[])`, `drawStructure(view)`, `drawOutline(view, pos)`, `drawGrid(view)`; `ChunkBuilder` takes `chunkSize` as a number or a `vec3`. A single chunk can be rebuilt after a block change. | `deepslate/lib/render/StructureRenderer.d.ts`, `ChunkBuilder.d.ts` |
| T2 | The app uses it today with `chunkSize: 16` and `useInvisibleBlockBuffer: false` over an immutable `Structure` and an orbit camera. | `app/src/renderer/src/preview/PreviewCanvas.tsx` |
| T3 | deepslate draws no light levels (faces are shaded by direction), no block entities except its hard-coded special renderers for vanilla ids (chests, signs, beds and the like), and crops atlas tiles to 16 by 16 (ADR 0010). | `SpecialRenderer.js`, ADR 0010 |
| T4 | Model parents resolve through project elements, the extracted client-jar cache, then seven MSM-authored fallback parents; without a client jar vanilla textures are the missing-texture checker. | `preview/model-chain.ts`, `fallback-models.ts`, ADR 0010, ADR 0011 |
| T5 | The geo renderer is raw WebGL 1 (one program, one draw call per bone, nearest filtering) with gl-matrix; it plays keyframes linearly, `catmullrom` as linear and Molang as 0. Both renderers take a WebGL 1 context; whether they can share one without state clashes is not known (B385). | `preview/geo/renderer.ts`, DESIGN §8 |
| T6 | `particle-sim.ts` is the TypeScript twin of the runtime's `ParticleLook` (frame, size, colour, alpha, roll, movement without collision), checked against `fixtures/particle-look/golden.json`; `ParticlePreview.tsx` draws it in 2D. | `app/src/renderer/src/studios/blocks-items/` |
| T7 | Lazy chunks today: `PreviewCanvas` 17.9 kB, `GeoCanvas` 19.6 kB, shared deepslate code `parts` 452 kB, gl-matrix `vec3` 5.2 kB. | `app/out/renderer/assets` |
| T8 | `app.asar` is 26.9 MB of 32 MB after the portal batch; the particles and Rules batches estimate under 0.4 MB each. Re-measure before B389. | ADR 0079 findings, both plans |
| T9 | WebGL detection is `hasWebGL()`; e2e paths get WebGL from SwiftShader with `--use-angle=swiftshader --enable-unsafe-swiftshader`. Whether a packaged Electron on a Windows machine with a blocked GPU still falls back to SwiftShader without that flag: verify at implementation (B385). | `preview/webgl.ts`, `app/e2e/entities-path.spec.ts` |
| T10 | The app has no Java discovery and downloads only Fabric API (`packages/interop/src/fabric/download.ts`); the Fabric server launcher and Mojang server jar downloads exist only in the dev tool `tools/run-fabric-server`. | grep over `packages/interop/src`, `app/src/main` |
| T11 | Fabric API `fabric-events-interaction-v0` 5.3.15 has `net.fabricmc.fabric.api.entity.FakePlayer` with a `FakePlayerPacketListener$FakeConnection` (packets are dropped). | Loom cache jar listing |
| T12 | Block types (ADR 0067, 0068, 0077): `block`, `pillar`, `horizontal`, `directional`, `slab`, `stairs`, `wall`, `fence`, `fence_gate`, `door`, `trapdoor`, `button`, `pressure_plate`, `pane`, crops, saplings, leaves, `portal`; the runtime uses vanilla's classes for their behaviour; lowering writes their blockstates from a pure table per type. | ADRs, `@msm/plugin-blocks-items` |
| T13 | Triggers and actions as in the Rules plan's F12 and F13; Rules compile to event patches and one generated script per book at lowering time (ADR 0082 D3); scripts are TypeScript transpiled to ES5 in main. | `PLAN-blocks-and-play.md` |
| T14 | `sandbox` in the app already names the plugin sandbox (`app/src/renderer/src/plugins/sandbox/`); `F5` is Play and `Ctrl+R` Reload (ADR 0084); `F6` is free (grep of `shortcuts.ts`; verify against `main/menu.ts` at implementation). | sources |
| T15 | Package dependency rules are a table in `tools/check-deps/layers.json`; `@msm/app` may import anything. | `tools/check-deps` |
| T16 | Stub classes `MsmDevClientGameTest` and `MsmDevModeGameTest` already exist from B362; GameTest entry points are listed in `engine-mod/src/gametest/resources/fabric.mod.json`. | `engine-mod/src/gametest` |

## Limits

The hard limits of Try it. They go into ADR 0085's findings and the guide page at close.

| # | Limit | Why | What users see | Mitigation |
|---|---|---|---|---|
| L1 | **A pass in Try it is not a pass in the game.** | It runs MSM's own simulation, not Minecraft (ADR 0085 D1). | The permanent strip and the Play button. | Shared scenarios (D10); "Only in Minecraft" lines. |
| L2 | **Movement is approximate.** | Our own collision and movement code; Minecraft's is client code we do not copy. | Walking, jumping and flying feel close, not identical; no water, ladders, ice or slime. | Labelled on the first-run card. |
| L3 | **Mobs only wander.** | Mob behaviour is vanilla goals in the runtime (ADR 0070). | No attacks, targets, taming, breeding, riding or boss fights. | Name plate label; Play. |
| L4 | **No commands or functions.** | No command engine outside the game. | "Only in Minecraft: run function …" in the log. | None. |
| L5 | **No scripts or logic Rules until slice 4, and then only a subset of the Script API.** | Scripts run on Rhino against the real game (ADR 0031). | Plain rules run from slice 3; rules with conditions, loops or waits log "Only in Minecraft" until slice 4. | Slice 4; the log names the rule. |
| L6 | **No redstone.** | Vanilla's signal rules are not rebuilt. | A "Power" tool toggles a block's own `powered` or `lit` picture; nothing travels along dust. | Play's test area has a lever, dust and a plate. |
| L7 | **No light, shadows or liquids.** | deepslate draws neither (T3); liquid flow is game code. | A glowing block looks the same lit or unlit around it. | Stated in the guide. |
| L8 | **No survival.** | Health, hunger, damage, armour, mining speed, durability, drops and loot are not simulated (D6). | Blocks break at once; no drops; effects are a chip. | Stated; Play. |
| L9 | **Growth is by tool and a fast clock.** | Vanilla's random tick odds and light rules are not rebuilt. | "Grow" steps a crop or sapling; trees do not grow into structures. | Stated. |
| L10 | **Vanilla blocks are props.** | Their behaviour is Mojang's code. | Drawn and solid only; chests do not open, pistons do not move. | The picker says "for looks". |
| L11 | **Screens are mock-ups.** | Container and machine screens are vanilla's menus in the game (ADR 0074). | A plain grid with the title and slots; no moving items, no smelting. | Labelled "Mock-up". |
| L12 | **Portals do not travel.** | No dimensions in the area. | Look and particles; stepping in logs "would travel to …". Frame lighting is not checked. | Play. |
| L13 | **Vanilla looks need the client jar; vanilla sounds cannot be played.** | Mojang assets are never bundled (ADR 0011); sound files are not in the client jar. | Without the jar: project blocks on MSM fallback parents only; vanilla sounds are a caption. | Banner to the Minecraft folder setting. |
| L14 | **Needs WebGL.** | The renderers are WebGL. | A message and the Play button when there is none. | SwiftShader where Chromium provides it (T9). |
| L15 | **Small area, not saved.** | 48 by 48 by 32 for speed in software rendering; a saved area invites building in it. | Placement stops at the edge; the area clears with the project. | "Clear the area". |
| L16 | **Animations as the app previews them.** | Molang is 0, easings are linear (T5), as the runtime's vanilla renderer; GeckoLib plays more. | The same notice as the geo preview. | None. |
| L17 | **Looks are checked by tests at most as "something was drawn".** | SwiftShader output differs between machines; no picture goldens. | A drawing bug can reach the user first. | State readouts in e2e; unit tests of geometry inputs. |
| L18 | **Third-party plugin kinds are drawn only through files the simulation knows.** | No simulation contribution point (D16). | A plugin's block with its own runtime behaviour is a prop. | Later, if asked. |
| L19 | **Two implementations can drift.** | `@msm/sim` restates part of the runtime in TypeScript. | A state or rule could differ from the game. | Scenarios run on both sides in CI (D10); new runtime behaviours get a level at review. |

## Rules for every brief

- Read root `CLAUDE.md`, the scoped `CLAUDE.md` of the area, the latest `docs/DEVLOG.md` entry, ADR 0085, this plan's "Notes from implementation" and, for files shared with the other plans, their notes. Version facts live only in `packages/targets`: `@msm/sim` takes names that differ by version (set types, wood types, registries) from `TargetFacts` and holds none itself; its movement numbers are named constants in one file with a comment that they are approximations.
- **Clean room.** No Mojang code is read for this batch. Behaviour is written from what MSM's own definitions and lowering say and from the game's observable behaviour; numbers (speeds, press times) may match the game's, method bodies are never transcribed. No Mojang texture, model or GUI picture is bundled; vanilla looks come only from the user's client jar at runtime (ADR 0011).
- **No new dependency.** deepslate and gl-matrix are already there. A brief that wants another library stops and reports.
- **Say it out loud.** Any trigger, action, component or state the simulation does not handle produces a log line through `SimLog.onlyInMinecraft(...)`; a silent no-op is refused at review (ADR 0085 D5).
- **Worktrees.** Each executor works in its own git worktree in the scratchpad (`<scratchpad>/wt-B<nnn>`, from the commit the orchestrator names), builds and tests there, commits on its own branch, does not push and does not merge. Commits carry no `Co-Authored-By`, `Claude-Session` or other credit lines and are authored as the user (HANDOFF).
- **Disk.** Check `df -h` before building; delete build outputs (`app/out`, `app/dist`, `engine-mod/build`, `engine-mod/.gradle`, `node_modules/.cache`) before reporting.
- **Stubs first.** B386 makes the package scaffold, the lockfile change, the `layers.json` line, the GameTest stub and its entry point, the fixture folder and the empty e2e spec, so no later brief edits `pnpm-lock.yaml`, `tools/check-deps/layers.json` or `engine-mod/src/gametest/resources/fabric.mod.json`.
- **One owner per shared file per wave.** Parallel briefs in one wave never touch the same file; a brief that needs another's file stops and reports.
- **Other batches first on shared files.** See "Overlaps" below; the "after" lines name the briefs that must be merged first.
- **Notes.** Each executor ends its report with "Notes for the plan" (names, signatures, labels, test ids, measured sizes and what a later brief must change); the main session appends them to "Notes from implementation". Executors do not edit this file. Each executor appends one DEVLOG entry in its commit.
- **Exit criteria** always include `pnpm lint`, `pnpm typecheck` and the touched packages' tests; app briefs also `pnpm build` and `node tools/check-size/index.ts`, reporting `app.asar` and the new chunks' sizes (stop and report above 31 MB, or when this batch's chunks pass 0.4 MB in all); engine-mod briefs `JAVA_HOME=/root/jdk/jdk-25.0.5+8 ./gradlew build`, `-Pmc=26.4` and `-PwithoutGeckolib`.
- **Plain words.** Labels are British English, no emojis, no ids in Very easy; they go into the notes for the guide brief.
- Executors: Opus (`claude-opus-5-5`) at medium effort; Sonnet (`claude-sonnet-5-5`) for B386 and B402. A stuck brief is rerun on Opus at high effort.

## Waves

| Slice | Wave | Briefs (parallel) | Depends on |
|---|---|---|---|
| 1 | 0 | B385 measurements (go or no-go); B386 scaffold and stubs | none; B386 may run beside B385 but is merged only on "go" |
| 1 | 1 | B387 sim world and blocks; B388 sim player; B389 view renderer | B385 go, B386 |
| 1 | 2 | B390 Try it view, controls and entry points; B391 sim clock, growth and tools | B387–B389; Rules B371, B376, B378 (B390) |
| 1 | 3 | B392 e2e, guide page, slice 1 close | B390, B391; Rules B379, B383 |
| 2 | 4 | B393 sim entities; B394 particles and portal looks in the view | slice 1; particles batch closed (B361) |
| 2 | 5 | B395 mobs in the view | B393, B394 |
| 3 | 6 | B396 sim triggers and actions; B397 parity fixture and runtime scenarios | slice 2; Rules batch closed (B384) |
| 3 | 7 | B398 "What happened", sounds, chips, item use, mock-up screens | B396 |
| 3 | 8 | B399 e2e and sim side of the parity test | B397, B398 |
| 4 | 9 | B400 script worker and Script API shim; then B401 logic Rules in the log | slice 3 used by the user; Rules B370 |
| all | 10 | B402 guide, changelog, status lines, AI helper knowledge; B403 close | all |

## Briefs

### B385 Measurements: can the area run (wave 0; Opus; time-boxed to one session)

- **Purpose:** ADR 0085 D11's go or no-go, before anything is built.
- **Owner files:** none committed. A throwaway page under the scratchpad that imports the app's `preview/asset-source`, `model-chain` and `geo/renderer` through the app's Vite config (or a temporary route in a worktree that is discarded).
- **Scope:** a mutable `StructureProvider` of 48 by 32 by 48 with a one-block floor and 2,000 random blocks from a fixture project plus fallback-parent cubes; `StructureRenderer` with `chunkSize` 8 and 16; a first-person camera moving on a fixed path; one block changed per frame with `updateStructureBuffers([chunk])`. Measure under Electron with `--use-angle=swiftshader --enable-unsafe-swiftshader` and, if the machine has one, a hardware GPU: frames per second at 640 by 360 and 960 by 540, single-chunk rebuild time, full build time, memory. Draw twelve geo models (`fixtures/sample-mob`) in the **same** WebGL context after deepslate's pass and record whether state clashes appear (depth, blend, bound program, attribute arrays) and what resetting costs; if it cannot be shared, measure a second transparent canvas stacked on top. Check T9 (what Electron does without the flag on a machine with no usable GPU) as far as a cloud machine allows and say what stays unknown for Windows.
- **Exit criteria:** a table of the numbers in the notes; a plain "go", "go with a smaller area (size)" or "no-go" against the thresholds (20 frames a second under SwiftShader at 640 by 360; rebuild under 16 ms); the chosen chunk size and the shared-context answer; nothing committed.
- **Out of scope:** any product code.

### B386 Scaffold and stubs (wave 0; Sonnet; merged only after B385 says go)

- **Owner files:** new `packages/sim/` (`package.json` named `@msm/sim` with dependencies `@msm/plugin-api` and `@msm/core` only, `tsconfig.json` in the project references, `src/index.ts`, `src/types.ts`, `CLAUDE.md` of at most 55 lines, one placeholder test), root `tsconfig` references and `pnpm-lock.yaml`, `tools/check-deps/layers.json` (`"@msm/sim": ["@msm/plugin-api", "@msm/core"]`), `app/package.json` (workspace dependency on `@msm/sim`), `engine-mod/src/gametest/resources/fabric.mod.json` and new empty `engine-mod/src/gametest/java/dev/mcsupermods/runtime/gametest/MsmSimParityGameTest.java`, new `fixtures/sim-parity/README.md`, new empty `app/e2e/tryit-path.spec.ts` (a skipped test naming B392).
- **Scope:** `src/types.ts` fixes the interfaces the wave 1 briefs build against in parallel: `BlockState { name: string; properties: Readonly<Record<string, string>> }`, `Box` (six numbers in block units), `BlockShapes { collision(state): readonly Box[]; outline(state): readonly Box[] }`, `SimFiles` (the lowered output files by path, text or bytes), `WorldSource` (ADR 0085 D14: `subscribe(listener)` for `blockChanged`, `entities`, `effect` and `log` events; `act(action)` for `move`, `place`, `break`, `use`, `tool`), `SimLog` with `onlyInMinecraft(what: string, origin?)`, and the area's size constants. British English doc comments on every export.
- **Exit criteria:** `pnpm i --frozen-lockfile` clean after the lockfile change; `pnpm lint` (check-deps knows the package), `pnpm typecheck`, `pnpm test` green; the three engine-mod variants build with the GameTest count unchanged.
- **Out of scope:** behaviour.

### B387 Sim: world and blocks (wave 1)

- **Owner files:** new `packages/sim/src/world/` (`sim-world.ts`: dense palette storage, `get`, `set`, bounds, change events by chunk), `packages/sim/src/blocks/` (`catalogue.ts`: builds a `BlockCatalogue` from `SimFiles` and `TargetFacts`: each block's type, properties and default state from its `msm` definition and lowered blockstate, its `msm:shape` or type shapes as `BlockShapes`, whether hands open it from its set type; `placement.ts`: the state a block takes when placed, by type, from the face clicked, the hit point and the look direction; `neighbours.ts`: fence, wall, pane and stairs-corner connections and door halves updated when a neighbour changes; `interact.ts`: door, trapdoor and gate toggling, button press start), tests beside them.
- **Scope:** every type of T12 except `portal` (a plain translucent block here; B394 gives it its look). A block with a definition the catalogue cannot read is a prop with one log line. Vanilla blocks are props with a full-cube shape unless the client-jar blockstate says the model is not a full cube, in which case the shape is still a full cube (L10). Unknown properties fall back to the default state (ADR 0085 D4). Pure and deterministic.
- **Tests:** a table test per type for placement (each face, both halves, each look direction), connections (a row, a corner, a T, removal), door halves and hinge side, default-state fallback, props; a catalogue test over `fixtures/sample-mod` lowered on both targets.
- **Exit criteria:** `@msm/sim` tests green; every type has at least six placement cases; no Node, DOM or app import (check-deps).
- **Out of scope:** ticking (B391), entities, events.

### B388 Sim: player (wave 1)

- **Owner files:** new `packages/sim/src/player/` (`controller.ts`: position, velocity, on-ground, walk, jump, fly, step at 20 ticks a second with interpolation values for drawing; `collide.ts`: box against `BlockShapes` sweep; `pick.ts`: ray against outline boxes, returning block, face and hit point, reach 4.5 blocks; `constants.ts`: the named numbers with the "approximation" comment), tests.
- **Scope:** walking on full blocks, slabs and stairs (step-up of 0.6), not falling off the area's edge (an invisible wall), flying toggled by a key, no sprinting, sneaking as slower walking without edge safety. Works against the `BlockShapes` interface only, so it does not wait for B387.
- **Tests:** deterministic step tests (walk into a wall, up a slab, off a block and land, jump height within a tolerance of 1.25 blocks, fly up and down, the edge wall), pick tests on a door's two boxes and a slab.
- **Exit criteria:** `@msm/sim` tests green; a 1,000-tick scripted run gives the same end position twice.

### B389 App: the view's renderer (wave 1)

- **Owner files:** new `app/src/renderer/src/tryit/render/` (`world-structure.ts`: a `StructureProvider` over a block grid with dirty chunks; `TryItCanvas.tsx`: the canvas, deepslate `StructureRenderer` with B385's chunk size, the first-person camera from player interpolation values, the outline of the picked block, the MSM grid floor drawn as lines and a flat tinted quad (no texture file), the render loop that stops when hidden or unfocused, the "Smaller picture" scale; `resources.ts`: resources for the catalogue's blocks through the existing `preview/asset-source` and `model-chain`), `app/src/renderer/src/preview/index.ts` (only if an export is missing), tests under `app/test/components/tryit/`.
- **Scope:** drawing only, behind props (`grid`, `camera`, `picked`), so it runs against a hand-made grid before B387 lands. Re-prepares resources when definitions or textures change without losing the grid. The chunk is lazy (`React.lazy`), as `PreviewCanvas`.
- **Tests:** `world-structure` unit tests (dirty chunk bookkeeping, bounds); a component test that the lazy boundary shows the no-WebGL message under happy-dom.
- **Exit criteria:** app tests green; `pnpm build`; check-size reported with the new chunk's size; no change to the existing preview's behaviour (its tests untouched and green).
- **Out of scope:** input, hotbar, entry points (B390).

### B390 App: Try it view, controls and entry points (wave 2; after B387–B389 and Rules B371, B376, B378)

- **Owner files:** new `app/src/renderer/src/tryit/` (`TryItView.tsx`: the strip "Preview, not the real game." with the Play button (`PlayControls` from B376, or "Test in Minecraft…" when Play is unavailable), the first-run card, the canvas, the hotbar and the picker, the tools "Grow", "Power" and "Clear the area", the keys list; `session-source.ts`: lowers the expanded project for the current target through the session (debounced, per changed element), builds `SimFiles`, drives a `LocalWorldSource` from `@msm/sim`; `input.ts`: pointer lock, WASD, space, double space or `F` for flying, left and right click, number keys, and a key for every mouse action; `tryit-store.ts`; `state-readout.tsx`: a visually hidden element `tryit-state` with position, selected thing, placed block count and the last log line, for tests), `packages/sim/src/local-source.ts` (the `WorldSource` over world, catalogue and player), `components/Toolbar.tsx` (the Try it button next to Play in all three modes), `components/EditorArea.tsx` (the view), `shortcuts.ts` and `app/src/main/menu.ts` (View > Try it, `F6`), the palette command, tests.
- **Scope:** ADR 0085 D4, D7, D12, D13. Vanilla props appear in the picker only when the client jar is set. The strip cannot be dismissed. Very easy wording as ADR 0083 D7.
- **Tests:** unit tests of `session-source` (an edit swaps a definition and keeps the world; a removed block leaves the world with a log line; a state that no longer exists falls back), of `input` (each key maps to an action), of the view (strip and Play button present in every mode; the card shows once), of the menu and shortcut.
- **Exit criteria:** app tests green; `pnpm build`; check-size reported; `xvfb-run -a pnpm --filter @msm/app smoke` green.
- **Out of scope:** mobs, particles, events.

### B391 Sim: clock, growth and tools (wave 2)

- **Owner files:** new `packages/sim/src/tick/` (`clock.ts`: 20 ticks a second, pause and step; `timers.ts`: button release after its press time, pressure plates pressed while the player's or a mob's box rests on them, weighted plates as pressed or not; `growth.ts`: the Grow tool steps a crop's or sapling's age property to the next stage and logs "only in Minecraft" for a sapling at its last stage; `power.ts`: the Power tool toggles `powered` or `lit` when the block has the property and logs otherwise), tests.
- **Scope:** L6 and L9 as written. Leaves do not decay. No random ticks.
- **Exit criteria:** `@msm/sim` tests green, including a button of 30 and of 20 ticks and a plate entered and left.

### B392 e2e, guide page and slice 1 close (wave 3; after B390, B391, Rules B379 and B383)

- **Owner files:** `app/e2e/tryit-path.spec.ts`, new `docs/guide/try-it.md` with its sidebar entry in `docs/site/.vitepress/config.ts`, `docs/guide/README.md` (one index line), `CHANGELOG.md` (`[Unreleased]`).
- **Scope:** the e2e path under SwiftShader (the `WEBGL_ARGS` of `entities-path`): create a project with a block, a slab and a door; open Try it with `F6`; the strip and the Play button are there; select the block by number key, place it by key, the readout's count goes up and the canvas is mounted (the existing preview paths assert no drawn pixels; this brief tries one `readPixels` "not all one colour" check through the readout and keeps it only if it is stable over ten runs under SwiftShader, saying which in the notes); place the door, use it, the readout shows `open=true`; edit the block's texture in the Studio, return, the count is unchanged; break it; "Clear the area" resets. The guide page: what it is, the keys, the tools and the limits table in plain words (L1–L15).
- **Exit criteria:** the e2e path green three times in a row under `xvfb-run -a`; the docs site builds with no dead link; the full e2e suite green. The orchestrator then reports slice 1 to the user before slice 2 starts.

### B393 Sim: entities (wave 4)

- **Owner files:** new `packages/sim/src/entities/` (`catalogue.ts`: mobs from `msm` entity definitions in `SimFiles`: size, scale, movement mode, model and animation ids; `sim-entity.ts`: position, yaw, velocity, gravity and collision through `collide.ts`; `wander.ts`: a seeded random walk on the floor that stops at walls and the edge, hovering for flyers, standing still for swimmers with one log line "swims only in Minecraft"; `spawn.ts`: spawn at a picked block, a cap of 24 entities, remove by a hit), `local-source.ts` (entity snapshots at 20 ticks a second with a `walking` flag), tests.
- **Exit criteria:** `@msm/sim` tests green; a seeded 600-tick run is repeatable; no entity leaves the area.
- **Out of scope:** AI of any kind (L3).

### B394 App: particles and portal looks (wave 4; after the particles batch is closed)

- **Owner files:** new `app/src/renderer/src/tryit/render/particles.ts` (camera-facing quads from `particle-sim.ts` states and the project's particle textures, at most 500 alive; reads `studios/blocks-items/particle-sim.ts` and `particle-frames.ts` without changing them), `tryit/render/portal.ts` (the portal block's translucent picture with its frames), `tryit/ambient.ts` (blocks with `msm:ambient_particles` emit by their `chance` and `count` near the player), `TryItCanvas.tsx` (the two passes), tests.
- **Scope:** particles defined by the project (`msm:particle`); a vanilla particle id shows a small neutral dot with a log line once per id (no Mojang sprite sheets are read in this slice). Collision of particles is off (as `particle-sim`).
- **Exit criteria:** app tests green (emission counts over a seeded minute; the cap holds); check-size reported.

### B395 App: mobs in the view (wave 5; after B393, B394)

- **Owner files:** new `app/src/renderer/src/tryit/render/mobs.ts` (bakes each mob's geo model once through `preview/geo/geometry.ts` and `subject.ts`, draws snapshots with `idle` or `walk` keyframes through `preview/geo/renderer.ts` in the shared context or on the stacked canvas as B385 decided, name plate "wanders only in the preview"), `TryItCanvas.tsx`, `TryItView.tsx` (spawn eggs in the hotbar and picker), tests; `preview/geo/*` only to export what is missing, with no behaviour change.
- **Exit criteria:** app tests green; the e2e path gains "spawn a mob, the readout shows one entity, remove it" in this brief; the geo preview's own tests and e2e paths untouched and green.

### B396 Sim: triggers and actions (wave 6; after the Rules batch is closed)

- **Owner files:** new `packages/sim/src/events/` (`definitions.ts`: events, trigger components, cooldown, chance, interval and hand from the lowered definitions; `triggers.ts`: fires block `on_interact`, `on_break`, `on_place`, `on_step`, `on_entity_inside`, item `on_use` and `on_use_on_block`, mob `on_spawn`, `on_interact` and `on_death` (removal by hit), from the actions of `local-source`; `actions.ts`: `set_block_state`, `give_item` (to a simple hotbar inventory), `trigger_event`, `play_animation`, `spawn_particle` and `play_sound` as effects for the view, `apply_effect`, `damage`, `heal` and `launch` as log lines and chips (launch moves the player or mob by its vector), `light_portal`, `run_function` and `run_script` through `onlyInMinecraft`; `trace.ts`: the "What happened" entries with their origin (element id, event id, rule key when the event id is a generated `_rules_` one)), `local-source.ts`, tests.
- **Scope:** exactly the trigger and action lists of the format at the Rules batch's close (read `EVENT_FIELDS` and the action schema; every one of them is either handled or logged, with a test that walks the schema's action list and fails on an unhandled name). Chance uses a seeded generator; "always" and "never" switches for tests and for a "Run every time" option in the view.
- **Exit criteria:** `@msm/sim` tests green; the schema-walk test passes; plain Rules from `@msm/plugin-rules`' examples run through lowering and fire here.

### B397 Parity fixture and runtime scenarios (wave 6)

- **Owner files:** `fixtures/sim-parity/` (`project/` a small fixture project with one block of each type and three events; `scenarios.json`: `format: 1`, each scenario a list of steps (`place`, `use`, `step_on`, `wait`, `break`) and expectations (block states at positions, fired triggers in order, actions in order); `README.md` with the regeneration command), `engine-mod/src/gametest/java/dev/mcsupermods/runtime/gametest/MsmSimParityGameTest.java` (plays each scenario with a GameTest helper player; checks, or with `-PupdateSimParity` rewrites, the expectations), `engine-mod/build.gradle.kts` only for that property and the fixture's path.
- **Scope:** at least 30 scenarios covering every placement table of B387 that vanilla decides (stairs, slabs, doors, trapdoors, gates, facing types, pillars, connections), button and plate timing and the trigger order of B396. The fixture's content jar is built as the other fixtures' are. Clean room: the test observes states, it does not read vanilla code.
- **Exit criteria:** the three engine-mod variants green with the new tests counted; the expectations are the runtime's on 26.3 and identical on 26.4 (a difference is recorded in the notes and split by target in the file).

### B398 App: "What happened", sounds, chips, item use and mock-up screens (wave 7; after B396)

- **Owner files:** new `app/src/renderer/src/tryit/` files `WhatHappened.tsx` (the panel of ADR 0085 D8 with links to the rule card, event or Studio), `effects.ts` (project sounds through the app's existing sound preview path; vanilla sounds as captions, L13), `Chips.tsx`, `MockScreen.tsx` (containers by rows and layout, machines by their three slots, labelled "Mock-up", MSM-drawn frames only), `TryItView.tsx`, tests.
- **Exit criteria:** app tests green: each trace entry kind renders its sentence; "Only in Minecraft" lines are visible, never collapsed by default; check-size reported.

### B399 e2e and the sim side of the parity test (wave 8; after B397, B398)

- **Owner files:** new `packages/sim/test/sim-parity.test.ts` (lowers `fixtures/sim-parity/project` and plays `scenarios.json` through `@msm/sim`; any mismatch fails with the scenario name), `app/e2e/tryit-path.spec.ts` (a rule "when used, give an item and play a sound": the panel shows the sentence; a `run_function` action shows an "Only in Minecraft" line), `.github/workflows/ci.yml` only if the sim test needs a step the workspace test run does not already give.
- **Exit criteria:** every scenario passes on both sides; a deliberately wrong expectation fails both tests (checked by hand, then reverted); e2e green three times in a row. The orchestrator reports slice 3 to the user; slice 4 waits for the user's word.

### B400 Script worker and Script API shim (wave 9; after Rules B370 and the user's go-ahead)

- **Owner files:** new `packages/sim/src/script/` (`shim.ts`: the Script API surface from `packages/plugins/scripting/api/script-api-v1.json` implemented over the simulation where it can be (`msm.events.on` for the events B396 fires, `msm.actions.define`, `msm.schedule`, `world.setBlock`, `getBlock`, `spawnParticle`, `playSound`, `player.sendMessage`, `giveItem`, data stores in memory) and `onlyInMinecraft` for every other member, generated from the JSON so a new API member cannot be silently missing), new `app/src/renderer/src/tryit/script-worker.ts` (a Web Worker that runs the transpiled ES5 scripts from the session's scripting service with no network and no DOM, a 2,000 ms budget per call enforced by terminating and restarting the worker, messages to and from the shim), tests.
- **Scope:** ADR 0085 D9 slice 4. Check the production Content Security Policy allows the worker as built (as the plugin sandbox worker does; no `unsafe-eval` is added: if the scripts cannot be run without it, stop and report).
- **Exit criteria:** `@msm/sim` and app tests green; a test walks the API JSON and fails on a member that is neither implemented nor logged; `fixtures/sample-script` runs with its unsupported calls logged; an endless loop is stopped and reported in the panel.

### B401 Logic Rules in the log (wave 9; after B400)

- **Owner files:** `packages/sim/src/events/trace.ts`, `app/src/renderer/src/tryit/WhatHappened.tsx`, tests.
- **Scope:** `run_script` bridges of ADR 0082 D3 call the worker; `// rule:<key>` markers map a script step or error back to its rule card; waits use the simulation's clock.
- **Exit criteria:** the Rules plugin's logic examples run in Try it with each step named in the panel; a script error names the rule.

### B402 Guide, changelog, status lines, AI helper knowledge (wave 10; Sonnet)

- **Owner files:** `docs/guide/try-it.md` (mobs, particles, rules, the full limits table), `docs/guide/first-mod.md` and `very-easy.md` (one paragraph each pointing to Try it and to Play for the real check), `CHANGELOG.md`, the status lines of root `CLAUDE.md`, `docs/CLAUDE.md` and `app/CLAUDE.md`, the AI helper's knowledge in `packages/ai/src/system-prompt.ts` (what Try it can and cannot show, so the helper never tells a user that Try it proved a behaviour).
- **Exit criteria:** the docs site builds; labels match the code (the notes list them); line limits of the `CLAUDE.md` files hold.

### B403 Close (orchestrator)

- ADR 0085 to Accepted with findings from the notes (this plan's fact table and limits); DESIGN §8 (a "Try it" subsection), §14, §15, §16 and the ROADMAP; ADR 0083 D4's toolbar list; HANDOFF; a clean-worktree full test run; this file deleted.

## Overlaps with the batches in flight

- **Particles (`PLAN-particles.md`, B346–B361; B356 and B358–B361 still open at a522189).** Try it reads `particle-sim.ts`, `particle-frames.ts` and `fixtures/particle-look` and changes none of them; B394 starts only after the particles batch is closed, so the twin and its golden are settled. If B356 finds a client GameTest route, it changes nothing here: Try it has no client code in the runtime.
- **Rules and Play (`PLAN-blocks-and-play.md`, B362–B384).** Shared files and their order: `components/Toolbar.tsx`, `components/EditorArea.tsx`, `App.tsx`, `shortcuts.ts`, `app/src/main/menu.ts` (B378 first, then B390); `components/play/PlayControls.tsx` (B376 makes it, B390 places it and does not edit it); the expanded project in the session (B371 first; `session-source.ts` reads it and does not change `project-session.ts`); `app/e2e` and the guide's index and sidebar (B379 and B383 first, then B392); `engine-mod/src/gametest/resources/fabric.mod.json` (B386 only after B362, already merged, and not in the same wave as any Rules brief that edits it; none is planned); `engine-mod/build.gradle.kts` (particles B356 first, then B397); `.github/workflows/ci.yml` (particles B359 and Rules B381 first, then B399); `packages/plugins/scripting/api/script-api-v1.json` is read by B400 after B370 and never edited here.
- **Wording.** ADR 0084 calls the real flat world "the test world". Try it's area is always "the test area in the app" or "Try it" in labels and docs, never "test world", so the two cannot be mixed up. This file keeps the request's working title in its name only.
- **Order of work.** Slice 1's sim briefs (B385–B389, B391) touch no file of either batch and may run beside them. Everything that touches the app shell waits for the Rules batch's wave 5. The recommended order is: finish particles, finish Rules and Play, let the user try Play on Windows, then merge slice 1.

## Notes from implementation

(empty; appended by the main session as briefs merge)

- B385 (see the previous commit): **go**, with conditions. Measured under SwiftShader (Electron 45.2.2, ANGLE SwiftShader, a shared machine at load 10-37 on 4 cores, so frame rates are pessimistic): 48x32x48 area with 4,304 blocks at 640x360: plain deepslate `drawStructure` about 16 fps (fails 20); with per-chunk frustum culling about 24 fps (22-29 of 144 meshes drawn); with 12 animated mobs in the same context about 23 fps; 320x180 ("Smaller picture") 43-47 fps; 960x540 does not reach 20. Single-block rebuild at chunk 8: median 1.1-1.5 ms (chunk 16 fails: 8-12 ms median, p95 up to 77). Full build about 0.3 s. Memory: page about 215-250 MB, GPU process 110-140 MB. Mobs share deepslate's context only with a GL reset (the geo renderer turns `CULL_FACE` off and never restores it; deepslate enables it only in its constructor): re-enable cull face (back), blend (`SRC_ALPHA`, `ONE_MINUS_SRC_ALPHA`) and depth (`LEQUAL`) and disable attribute arrays before each deepslate draw (about 2 microseconds). **B389:** `chunkSize: 8`; own frustum culling through deepslate's renderer internals (`chunkBuilder.getChunk`, `setShader`, `setTexture`, `prepareDraw`, `drawMesh`; cast like `PreviewCanvas`), opaque meshes first; real `BlockFlags` (`asset-source.ts` marks every block non-opaque, which halves the frame rate); during a partial rebuild `getBlocks()` returns only the dirty chunks' blocks; rebuild neighbour chunks when the block sits on a chunk face. **B395:** reset GL state after the mob pass and draw the geo grid with `{extent: 0}`. **T9:** Electron here has no WebGL without `--enable-unsafe-swiftshader` or `--use-angle=swiftshader`; `app/src/main` sets neither (orchestrator decision pending: affects the existing previews too; Windows behaviour with a blocked GPU unknown). Re-measure on a quiet machine and a hardware GPU before or during B389. Probe sources kept at `<scratchpad>/probe-b385/`. Follow-ups worth doing before Try it: the geo renderer's `CULL_FACE` leak, and real opacity flags in the existing structure preview (why large templates preview slowly).
