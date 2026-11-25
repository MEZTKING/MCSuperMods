# `@msm/plugin-games`

Plugin id `msm.games`. Game modes: custom skyblock and more (ADRs 0113 to 0117,
accepted with findings at close B562, 2026-11-23; the plan is deleted, its facts G1–G22, the spike's answers Y1–Y16
and limits M1–M16 are in ADR 0117). Eight kinds (the six of ADR 0113 plus `msm:game` and `msm:kit`, ADR 0132, B724) lowered only to data pack files and one language line; the round engine is `lowering/game/` (`names.ts` the generated names and 15 hook tags, `build.ts` form helpers, `round.ts`, `lobby.ts`, `roles.ts`, `win/`, `mechanics/` behind the frozen `index.ts`), kits `lowering/kit.ts`.

## Layout

- `src/index.ts`: the plugin; `elementKinds`, `elementTemplates`, `validators`, `searchData`, and the exports the app
  and tests read (`gamesGeneratedIds`, `GAMES_CHECKER_CATEGORIES`, `lowerWorldSetup`, `MAX_ONE_BLOCKS`, `MAX_TIMER_SECONDS`).
- `src/kinds/index.ts`: `GAMES_KIND_IDS` and `gamesKinds`: `msm:world_setup`, `msm:one_block`, `msm:team`,
  `msm:objective`, `msm:timer`, `msm:area` (schemas in `@msm/schemas` `games.mcdoc`, folders as the id's path).
- `src/lowering/shared-functions.ts`: the plugin's `load` and `tick` function tags (`#<ns>:msm_games/load|tick`),
  `sharedFunctionFiles`, `fillForm` over `target.commands.forms`, the generated names and the hook tags Rules attach to.
- `src/lowering/world-setup.ts`, `world-setup-files.ts`, `world-type.ts`, `start.ts`, `first-join.ts`: the world
  setup (B551): world preset, sky biome, `#minecraft:normal`, the world start behind the storage flag, the start
  structure (first join, or `dimension_origin`), the first-join advancement and kit.
- `src/lowering/one-block.ts`, `team.ts`, `objective.ts`, `timer.ts`, `area.ts`: the pieces (B552).
- `src/lowering/generated-ids.ts`: `gamesGeneratedIds(element)` by registry, for the registry view and checker (B551b).
- `src/validators-world-setup.ts`, `validators-pieces.ts` (`validators.ts` joins them); `games.generated-path`
  refuses project functions under `<ns>:msm_games/`.
- `src/templates/world-setup.ts` (4) and `pieces.ts` (8), group "Games"; `src/search.ts` (search words, B655).
- `test/game/mechanics/sim*.test.ts` over `sim-support.ts`: the mechanics played through in `@msm/sim` with practice players (B728).
- `test/`: goldens per target under `test/fixtures/<target>/`, every line through `@msm/schemas/mcfunction`, every
  JSON file through its schema, the generated ids against the lowered files, every validator code.

## Rules

- Everything lowers to data pack files that load in a vanilla pack on both targets; a line that needs the jar is a
  Rules line, never a games kind line.
- Imports only `@msm/plugin-api` and `@msm/schemas` in `src/`; tests may use `@msm/targets`.
- Version facts come from `target.*` (`worlds`, `scoreboard`, `commands.forms`, plugin API 1.22.0), never
  hard-coded; every command line goes through `fillForm` over a named form (the `execute`, `function`, `tag`,
  `kill`, `setblock`, `summon`, `tellraw` and other line forms since plugin API 1.26.0), and only `#` comment lines
  are plain text; a new command adds its form to both targets, checked by `packages/targets/all/test/games.test.ts`.
- Rules may not import this plugin: `packages/plugins/rules/src/compile/games.ts` repeats the generated names, and
  `test/generated-ids.test.ts` and the rules tests keep them in step.
- A new kind, Studio or flow names its live view (`docs/LIVE-VIEW-AUDIT.md`, section Games).

## Commands

- `pnpm --filter @msm/plugin-games test` (`UPDATE_GOLDENS=1` rewrites the goldens)
