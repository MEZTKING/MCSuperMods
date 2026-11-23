# `@msm/plugin-games`

Plugin id `msm.games`. Game modes: custom skyblock and more (ADRs 0113 to 0117; plan `docs/PLAN-game-modes.md`).
Scaffold from B548; B549 registered the six kinds (schemas in `@msm/schemas` `games.mcdoc`; lowering to nothing until B551 and B552).

## Layout

- `src/index.ts`: the plugin; `contributes.elementKinds` holds the six kinds.
- `src/kinds/index.ts`: `GAMES_KIND_IDS` and `gamesKinds`: `msm:world_setup`, `msm:one_block`, `msm:team`,
  `msm:objective`, `msm:timer`, `msm:area` (schemas `MSM_SCHEMA_REFS.*`, folders as the id's path, default data).
- `src/lowering/`: one empty module per kind (`world-setup.ts`, `start.ts`, `one-block.ts`, `team.ts`, `objective.ts`,
  `timer.ts`, `area.ts`). B551 fills `world-setup.ts`, `start.ts` (and `world-type.ts`, `first-join.ts`); B552 the rest
  and `shared-functions.ts`.
- `src/validators.ts`: `gamesValidators`, empty. B551 and B552 add `validators-world-setup.ts` and `validators-pieces.ts`.
- `test/`: kinds registered, default data valid on both targets.

## Rules

- Everything lowers to data pack files that load in a vanilla pack on both targets; a line that needs the jar is a
  Rules line, never a games kind line (plan, "Rules for every brief").
- Imports only `@msm/plugin-api` and `@msm/schemas` in `src/`; tests may use `@msm/targets`.
- Version facts come from `target.*` (plugin API 1.22.0 adds the games facts, B550), never hard-coded.
- Only B549 edits `games.mcdoc`; only B550 edits `packages/plugin-api/src/`.

## Commands

- `pnpm --filter @msm/plugin-games test`
