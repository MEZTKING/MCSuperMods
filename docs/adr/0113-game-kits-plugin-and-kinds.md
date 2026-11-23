# ADR 0113: Game kits: the games plugin and its kinds

## Context

The user (2026-11-22) wants whole experiences, "something like a custom skyblock etc and more", made with MSM's tools, under the vanilla parity rule. The game modes plan's gap analysis (facts G1–G22; the plan was deleted at its close, B562, and the facts are in [ADR 0117](0117-game-modes-flows-studios-try-it-and-tests.md)) finds that most pieces exist as kinds (world presets, dimensions, biomes, structure files and sets, functions on the load and tick tags, advancements, loot tables, trades, recipes, dialogs) but that the glue is only reachable as hand-written command text: placing a structure once, a kit for each new player, game rules set at world start, one-block loops, teams, scoreboard objectives, timers and areas. Rules counters are script data, not scoreboard objectives (G12), and Rules need the Fabric mod jar (G13), so Rules alone cannot be the answer for data pack worlds and maps.

## Decision

- **D1 A new built-in plugin.** `@msm/plugin-games` (`packages/plugins/games`, made with `tools/new-plugin`) owns six kinds. Like every built-in it uses only the public plugin API and `@msm/schemas`. Its kinds lower to plain data pack files only: functions, function tags, advancements, predicates, structure sets, world presets, dimensions, biomes and lang. Nothing it writes needs the Fabric mod jar, so a game made only of these kinds works as vanilla packs.
- **D2 `msm:world_setup`** (at most one per project; Very easy "How my world starts"):
  - `world { type: "vanilla" | "void" | "flat" | "sky_islands" | "preset", preset?, layers?, biome?, nether: "vanilla" | "void", end: "vanilla" | "void" }` (ADR 0114 D1);
  - `start? { structure, at [x, y, z] (default 0, 64, 0), spawn [x, y, z] (relative to `at`), when: "first_join" | "world_generation" }` (ADR 0114 D2);
  - `spawn_radius` (default 0);
  - `game_mode` (vanilla's four), `difficulty`;
  - `game_rules { <vanilla or project rule>: value }`, set once when the world first starts;
  - `new_player? { items: [{ item, count, slot? }] | loot_table, message?, dialog?, effects? }`, given once per player;
  - `goals?` (an advancement root, named in the welcome).

  The "once" parts use a storage flag (`<ns>:msm_games`) for the world and an advancement on the `minecraft:tick` criterion with a reward function for each player (the vanilla first-join pattern, Y4).
- **D3 `msm:one_block`**: `{ at, dimension?, phases: [{ name, breaks, blocks: [{ block, weight }], mobs?: [{ mob, weight }], mob_chance, chest_chance, chest_loot? }], loop, announce }`. It lowers to a tick function that tests the position, picks by `random value` weighted, sets the block (a chest with its loot table now and then), summons a mob above now and then, and counts breaks on a scoreboard per phase. At most four per world (limit M6).
- **D4 `msm:team`**: `{ name, colour, friendly_fire, see_invisible_friends, name_tags, collision, prefix?, suffix? }`. It is made at load if missing; options are set on every load.
- **D5 `msm:objective`**: `{ criterion (dummy, vanilla criteria, a project statistic), name, display: none | sidebar | list | below_name | sidebar.team.<colour>, render: integer | hearts, number_format? }`. It is made at load if missing. Values come from `TargetFacts.scoreboard`.
- **D6 `msm:timer`**: `{ seconds (1 to 86,400), count: down | up, show: boss_bar | action_bar | none, colour, on_end?: function, repeat, starts: manual | world_start }`. It lowers to one score on `<ns>.msm_timers`, a per-second step on the plugin's tick function (whole seconds, limit M9) and its boss bar.
- **D7 `msm:area`**: `{ dimension, from, to, reset?: { structures: [{ structure, at }] }, name }`. It lowers to a `location_check` predicate, a tick step tagging players who entered or left, and `reset` and `clear` functions (entities in the box removed, then `place template`). Areas are boxes only (limit M8).
- **D8 Facts, plugin API 1.22.0** (renumbered 2026-11-22: live world generation runs first and takes 1.21.0). `CreatorGroup` gains `games`. `TargetFacts.worlds` holds the structure placements, the void biome, the floating-island and End-like noise settings, the `fixed_placement` shape and the first-join criterion. `TargetFacts.scoreboard` holds criteria, display slots, render types, number formats, team colours, name tag visibility and collision rules. `TargetFacts.commands.forms` holds the exact command forms the lowering writes. Every value is measured by B547; anything not measured is "(verify at implementation)".
- **D9 Generated names.** Functions are generated under `<ns>:msm_games/...` and merged into one `load` and one `tick` function of the plugin, which join `#minecraft:load` and `#minecraft:tick`. The validator refuses project functions under that path.

## Consequences

- A Skyblock, one-block world, adventure map or arena can be made without the jar; the same pieces are readable by Rules (ADR 0115).
- Six new Studios (ADR 0117 D1). The kinds count grows by six.
- Teams and objectives stay in old worlds after a rename (limit M7).
- The eject carries these files as data with no Java change.

## Findings at the close (B562, 2026-11-23)

Reviewed against the merged code of B548–B552, B551b and B555: `packages/plugins/games/src/` (`kinds/index.ts`, `lowering/` with `shared-functions.ts`, `world-setup.ts`, `world-setup-files.ts`, `world-type.ts`, `start.ts`, `first-join.ts`, `one-block.ts`, `team.ts`, `objective.ts`, `timer.ts`, `area.ts` and `generated-ids.ts`, `validators-world-setup.ts`, `validators-pieces.ts`, `templates/`, `search.ts`), `packages/schemas/mcdoc/msm/games.mcdoc`, the facts of plugin API 1.22.0 in `packages/plugin-api/src/` and both targets, and the tests under `packages/plugins/games/test/`, `packages/targets/all/test/games.test.ts`, `packages/exporters/test/games-skyblock.test.ts` and `app/test/session-games-export.test.ts`. The close changed only docs and ran no suite; every number is a brief's own, from its DEVLOG entry of 2026-11-23. The spike's answers Y1–Y16, the fact table G1–G22 and the limits M1–M16 with their outcome are in [ADR 0117](0117-game-modes-flows-studios-try-it-and-tests.md).

### Each decision's outcome

| Decision | Outcome |
|---|---|
| D1 A new built-in plugin | Built: `@msm/plugin-games` (`msm.games`, made with `tools/new-plugin`), six kinds, imports only `@msm/plugin-api` and `@msm/schemas`; everything it writes is a data pack file or a resource pack language line, and every lowered line passes `@msm/schemas/mcfunction` with no error or warning on both targets. Also contributes 12 templates in the group "Games" (8 pieces, 4 world setups), search words (plugin API 1.23.0, B655) and `gamesGeneratedIds` / `GAMES_CHECKER_CATEGORIES` (B551b), which the app's registry view and function checker read so an export names no generated id as unknown. `@msm/exporters` dev-depends on it for its tests. |
| D2 `msm:world_setup` | Built, one change: **project game rules are not set by the data pack**. `gamerule <ns>:<rule>` is refused by the function checker and by the game without the jar, so `games.world-setup.project-game-rule` warns and says to set them with a rule; vanilla rules are set once at the world's start (the plan's "Data packs first" wins over D2's "vanilla or project rule"). The world start is one entry in `#<ns>:msm_games/load` behind the storage flag `<ns>:msm_games` (keys `world_setup` and `start`); `spawn_radius` is written as `gamerule respawn_radius` unless a game rule names it. The first join is the advancement `<ns>:msm_games/first_join` on `worlds.firstJoinCriterion` (`minecraft:tick`, Y4) rewarding `<ns>:msm_games/world_setup/first_join` (start, `gamemode @s`, the kit by `give`, `item replace` or `loot give`, effects, message, goals line, dialog). The kit's `items` and `loot_table` are both optional and refused together; the world type's name comes from the element's id (no name field; the Studio says "press F2"). |
| D3 `msm:one_block` | Built as decided: the holders `#<path>.phase`, `.breaks` and `.roll` on `<ns>.msm_one_block`, one `execute in <dim> if block <at> minecraft:air run function …/next` a tick, chances out of 10,000 by `random value 1..10000`, a chest with its `LootTable` (its loot drops when broken, Y9), a mob above by weight. At most four (`MAX_ONE_BLOCKS`, `games.too-many-one-blocks`); about +0.3 ms a tick per position (Y9). The hook `broken` runs from the server before the break is counted. |
| D4 `msm:team` | Built: `team add <ns>.<path>` at load, every option set on every load, with the game's own option values (`hideForOtherTeams`, `pushOwnTeam`) and the 16 chat colours plus `reset` from `TargetFacts.scoreboard`. |
| D5 `msm:objective` | Built, plus number formats `blank`, `fixed` and `styled` (the MSM dispatcher `msm:games_number_format`). The criterion check is a warning: the facts list only the three plain criteria B547 ran, plus `minecraft.<stat type>:…` and project statistics. |
| D6 `msm:timer` | Built: holders `#<path>`, `#<path>.on` and `#<path>.ticks` on `<ns>.msm_timers`, the boss bar `<ns>:msm_games/timer/<path>`, functions `start`, `stop`, `second` and `end`, the hook `ended`, the action bar `[name ]<n>s`. Added the optional `name` (a boss bar needs a title). |
| D7 `msm:area` | Built: the predicate `<ns>:msm_games/area/<path>` (`location_check`, the box's upper corner plus one, Y11), the entity tag `<ns>.area.<path>` given and taken each tick with the hooks `entered` and `left` run as the player, `clear` (every entity but players, by the `dx` selector) and, with `reset`, `reset` (`clear`, then `place template` per building). 64 areas and 20 players cost +2.0 to 2.4 ms a tick (Y11). |
| D8 Facts, plugin API 1.22.0 | Built: `CreatorGroup` `games`; `WorldFacts` (`structurePlacements`, `voidBiome`, `floatingIslandsSettings`, `fixedPlacementShape` with `minPositions` 0 on 26.3 and 1 on 26.4, `firstJoinCriterion`); `ScoreboardFacts`; `CommandFacts.forms` (49 templates with `<required>` and `[optional]` placeholders, each filled form checked on both targets). Not measured, so left out: `endLikeSettings` (on both targets; the Sky islands flow falls back to floating islands and says so). Commands with no form are written as plain text and checked (`execute`, `function`, `tag`, `kill`, `setblock`, `summon`, `tellraw`, `scoreboard players remove`), and the Rules compiler holds four fallback forms the targets do not list (ADR 0115). |
| D9 Generated names | Built differently: the plugin's `load` and `tick` are **function tags** `#<ns>:msm_games/load` and `#<ns>:msm_games/tick` (each entered once in `#minecraft:load` and `#minecraft:tick`), not functions, because lowering sees one element at a time and only tags merge; each element's function lives under `<ns>:msm_games/<kind>/<path>/`. The hooks `one_block/<path>/broken`, `timer/<path>/ended` and `area/<path>/entered` and `left` are empty merged tags, so Rules attach without touching these files. `games.generated-path` refuses project functions under `<ns>:msm_games/`. |

### Found on the way

- Two bugs outside the plan blocked B551 and B552 and were fixed on 2026-11-22 (DEVLOG): MSM's structure template writer wrote palettes as `Name`/`Properties` at the target's DataVersion, which 26.x reads as air (now `id`/`properties` from DataVersion 5006 on; the reader takes both), and the offline function checker threw on `#holder` scores and named random sequences.
- Consequences as written hold: the kinds count is 124; teams and objectives stay in old worlds (the Team and Objective Studios say so; no "remove the old one" line is offered yet); the Java eject carries the files as data with no Java change.

### Open items

- The fallback forms of the Rules compiler and the plain-text commands above belong in `TargetFacts.commands.forms` (a plugin API minor), so a version change to a command touches only `packages/targets`.
- `endLikeSettings` measured on both targets, so "Islands like the End's" draws its own terrain.
- A "remove the old one" command line in the Team and Objective Studios (limit M7's mitigation).
- The guide's `templates-and-examples.md` does not list the 12 Games templates or the game examples.

## Status

Accepted with findings (2026-11-23, close B562; briefs B548–B552 and B551b). Decided by the orchestrator under the user's rule "keep going" and open to the user's veto, as vetoable defaults:

- the kinds live in a new plugin rather than in `@msm/plugin-datapack`;
- one `msm:world_setup` per project;
- game rules at start are set once, not on every load, and only vanilla's (a project rule is set by a rule);
- a new player's things are given once, by the advancement pattern;
- at most four one-block positions;
- whole-second timers;
- teams and objectives are never removed by MSM;
- the plugin's `load` and `tick` as function tags, with empty hook tags for Rules;
- team options and display slots written with the game's own values; the timer's optional `name`.
