# packages/sim — Try it simulation

`@msm/sim` is MCSuperMods' own, approximate simulation of a project's blocks, player and rules for the Try it view ([ADR 0085](../../docs/adr/0085-try-it-in-app-test-area.md), accepted with findings at close B403; its fact table and limits L1–L24 are there; grounds in ADR 0087). All four slices are merged (B386–B401): world, blocks, player, clock and tools, mobs that wander, triggers and actions, grounds, scripts and logic rule steps; slices 1 and 2 shipped in 1.5.1, the rest in the 1.5.2 draft. Follow-ups are in `docs/ROADMAP.md` "Try it, the in-app test area".

## Purpose

It turns a project's lowered files into a small world (48 by 48 by 32 blocks) that the view draws and the player walks in, and it says out loud everything it does not handle. It is a preview, not the game: whatever it cannot do is logged, never skipped silently.

## Contents

- `src/types.ts`: the interfaces the view and the simulation share: `BlockState`, `Box`, `BlockShapes`, `SimFiles`, `WorldSource` (ADR 0085 D14), `SimLog`, the events and actions, and `AREA_SIZE_X/Y/Z`.
- `src/world/`: `SimWorld` (the grid, 8-block chunks, change listeners) (B387).
- `src/blocks/`: `buildCatalogue` (block definitions from the lowered files, shapes, states), `placeBlock`, `breakBlock`, `useBlock`, neighbour updates (B387).
- `src/player/`: `PlayerController` (movement, collision, picking); the movement numbers in `constants.ts` (B388).
- `src/tick/`: `SimClock`, `BlockTimers` (buttons, plates), the Grow and Power tools (B391).
- `src/entities/`: `buildEntityCatalogue`, `EntityWorld` (spawn, wander, hit; at most 24) (B393).
- `src/events/`: triggers and actions (B396): `definitions.ts` (`TRIGGER_SPECS`, `readEventDefinitions`, `readScripts`, `ruleBooksFrom`), `triggers.ts` (`TriggerEngine` in the runtime's click and tick order, `ChanceMode` random, always or never, `blockSteppedOn(pos, actor)` for plates and `on_step`, `fireOwned`), `actions.ts` (`SIM_ACTIONS`: each action runs, is an effect or chip, or is said; `SimInventory`), `trace.ts` (`SimTrace`, the "What happened" entries with their origin, `pos`, `ranEvent` and `ruleStep`). `test/events/schema-walk.test.ts` fails on a trigger or action neither handled nor said.
- `src/grounds/`: what the area starts with (B405, ADR 0087 D1): `GroundBlocks` (a palette of state strings and one index per cell, the shape of the world reader's `WorldArea`), `flatGround`, `quickWorld` (shapes, layers, water, trees, seed; pure and seeded) and `QUICK_PRESETS`; `LocalWorldSource.loadGround` copies one into the world.
- `src/vehicles/`: `physics.ts` (the twin of the runtime's `VehiclePhysics`, pinned to `fixtures/vehicle-physics/golden.json`), `catalogue.ts`, `VehicleWorld` (place, get in and out, drive, fuel, damage, pick-up) (B428).
- `src/controls/`: `KeyBindEngine`, `SimHud`, `dashboardRows` (B429).
- `src/blocks/types2/`: the twenty block types of ADR 0094 and their `_wall`/`_attached` companions (`catalogue.ts`, `placement.ts`, `shapes.ts`, `use.ts`, `signs.ts`), climbing (`climb.ts`), the Water and Explode tools (`tools.ts`), place and explosion rules read from the generated Rules script (`script-events.ts`, `world-events.ts`), all held by `Types2Area` (`area.ts`, `LocalWorldSource.parity2`); `src/blocks/weathering.ts` ages `msm:weathering` blocks and runs "Time-lapse a day" (B463).
- `src/commands/`: the project's `msm:command`s (`catalogue.ts`), a typed line read as the runtime's Brigadier tree reads it (`parse.ts`) and run (`run.ts`: function only in Minecraft, event, `command` listeners, feedback) (B463).
- `src/items/`: `bags.ts`, bag screens opened from the hand with `on_open`/`on_close`; bundles are said (B463).
- `src/traders/`: batch 2's merchants (B483, ADR 0101 D5): `catalogue.ts` (the project's `msm:trader` levels, restock, `trade_sound`, `on_trade`, trade sets and villager trades, professions said), `merchant.ts` (`Merchant`: offers per level, XP at 10/70/150/250 or `xp_to_next`, level-up, shift-click until out of stock, restock per half day) and `area.ts` (`TraderArea`: the runtime's click order, monsters refusing at night by the area's own time of day, `on_trade`; nothing is paid or given; storage, shoulder pets and professions are said).
- `src/fluids/`: `catalogue.ts` (`msm:fluid` definitions, the model's texture variables, defaults by `behaves_like` as the runtime; each fluid's liquid block joins the block catalogue as `liquid`; `flowWords` says the game's flow in words) and `area.ts` (`FluidArea`: a bucket pours a source that does not flow, `on_entity_inside` at most every 10 ticks for each thing inside) (B483).
- `src/script/`: scripts in Try it (B400): `shim.ts` (`createScriptRuntime`, the Script API built from `script-api-v1.json`, every member not implemented says it is only in Minecraft; self-contained, serialised into the app's script worker), `bridge.ts` (`ScriptBridge`: events to the scripts, `ask` for cancellable ones, applies blocks, effects, messages, items, stores), `protocol.ts`, `runner.ts` (`ScriptRunner`, `inProcessRunner`), `sources.ts`, `api.ts` (`apiMembers`); `rule-steps.ts` (B401: `instrumentRuleScript` hooks a generated Rules script's `// rule:<key>` lines into the shim's `msm:try-it`, so each step of a logic rule is said by the rule).
- `src/local-source.ts`: `LocalWorldSource`, the one `WorldSource` the app's `tryit/` view uses: owns the world, catalogues, player, mobs and timers; `act`, `tick`, `pointedAt`, `setFiles` (keeps the world), the 200-line log (B390).
- `src/index.ts`: the public exports (one line per module, sorted).
- `test/`: Vitest tests, run with `pnpm --filter @msm/sim test`; `test/lower-fixture.ts` lowers a fixture project for tests; `test/sim-parity.test.ts` plays `fixtures/sim-parity/scenarios.json` (63 scenarios, both targets, chance `always`) as `MsmSimParityGameTest` does on the real server, and the vitest include also runs `fixtures/sim-parity/lower.test.ts` (`UPDATE_SIM_PARITY_MOD=1` rewrites the fixture's lowered content).

## Rules

- Dependencies: `@msm/plugin-api` and `@msm/core` only (`tools/check-deps/layers.json`). No Node, DOM, Electron or app imports; the package runs in the renderer and in plain Vitest.
- Pure and deterministic: the same files and the same actions give the same world. No `Date`, no `Math.random` without a seeded source passed in.
- Version-specific names (set types, wood types, registries) come from `TargetFacts` (`packages/targets`); this package holds none (golden rule). Movement numbers are named constants in one file, commented as approximations.
- Clean room: no Mojang code is read. Behaviour comes from MSM's own definitions and lowering and from the game's observable behaviour.
- Say it out loud: every trigger, action, component or state not handled calls `SimLog.onlyInMinecraft(...)` (ADR 0085 D5).
- Every behaviour of ADR 0085 D5's first level needs a scenario in `fixtures/sim-parity/scenarios.json` (D10), also played by `MsmSimParityGameTest`.
- British English in comments and labels; no emojis.

## Commands

- `pnpm --filter @msm/sim test`
- `pnpm typecheck` and `pnpm lint` at the root.
