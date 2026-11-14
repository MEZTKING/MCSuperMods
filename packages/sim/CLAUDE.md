# packages/sim — Try it simulation

`@msm/sim` is MCSuperMods' own, approximate simulation of a project's blocks, player and rules for the Try it view (ADR 0085, plan `docs/PLAN-test-world.md`). Slice 1 (B386–B395) is done and shipped in 1.5.1: world, blocks, player, clock and tools, and mobs that wander; triggers and actions come with slice 3 (B396, `TODO(B396)` markers in `local-source.ts`).

## Purpose

It turns a project's lowered files into a small world (48 by 48 by 32 blocks) that the view draws and the player walks in, and it says out loud everything it does not handle. It is a preview, not the game: whatever it cannot do is logged, never skipped silently.

## Contents

- `src/types.ts`: the interfaces the view and the simulation share: `BlockState`, `Box`, `BlockShapes`, `SimFiles`, `WorldSource` (ADR 0085 D14), `SimLog`, the events and actions, and `AREA_SIZE_X/Y/Z`.
- `src/world/`: `SimWorld` (the grid, 8-block chunks, change listeners) (B387).
- `src/blocks/`: `buildCatalogue` (block definitions from the lowered files, shapes, states), `placeBlock`, `breakBlock`, `useBlock`, neighbour updates (B387).
- `src/player/`: `PlayerController` (movement, collision, picking); the movement numbers in `constants.ts` (B388).
- `src/tick/`: `SimClock`, `BlockTimers` (buttons, plates), the Grow and Power tools (B391).
- `src/entities/`: `buildEntityCatalogue`, `EntityWorld` (spawn, wander, hit; at most 24) (B393).
- `src/grounds/`: what the area starts with (B405, ADR 0087 D1): `GroundBlocks` (a palette of state strings and one index per cell, the shape of the world reader's `WorldArea`), `flatGround`, `quickWorld` (shapes, layers, water, trees, seed; pure and seeded) and `QUICK_PRESETS`; `LocalWorldSource.loadGround` copies one into the world.
- `src/local-source.ts`: `LocalWorldSource`, the one `WorldSource` the app's `tryit/` view uses: owns the world, catalogues, player, mobs and timers; `act`, `tick`, `pointedAt`, `setFiles` (keeps the world), the 200-line log (B390).
- `src/index.ts`: the public exports (one line per module, sorted).
- `test/`: Vitest tests, run with `pnpm --filter @msm/sim test`; `test/lower-fixture.ts` lowers a fixture project for tests.

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
