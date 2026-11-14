# packages/sim — Try it simulation

`@msm/sim` is MCSuperMods' own, approximate simulation of a project's blocks, player and rules for the Try it view (ADR 0085, plan `docs/PLAN-test-world.md`). B386 made the scaffold and `src/types.ts`; the briefs B387–B391 fill it in.

## Purpose

It turns a project's lowered files into a small world (48 by 48 by 32 blocks) that the view draws and the player walks in, and it says out loud everything it does not handle. It is a preview, not the game: whatever it cannot do is logged, never skipped silently.

## Contents

- `src/types.ts`: the interfaces the view and the simulation share: `BlockState`, `Box`, `BlockShapes`, `SimFiles`, `WorldSource` (ADR 0085 D14), `SimLog`, the events and actions, and `AREA_SIZE_X/Y/Z`.
- `src/index.ts`: the public exports.
- `test/`: Vitest tests, run with `pnpm --filter @msm/sim test`.
- Planned: `src/world/` and `src/blocks/` (B387), `src/player/` (B388), the rules and ticking (B391).

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
