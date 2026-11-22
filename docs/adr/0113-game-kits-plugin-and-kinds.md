# ADR 0113: Game kits: the games plugin and its kinds

## Context

The user (2026-11-22) wants whole experiences, "something like a custom skyblock etc and more", made with MSM's tools, under the vanilla parity rule. The gap analysis in `docs/PLAN-game-modes.md` (facts G1–G22) finds that most pieces exist as kinds (world presets, dimensions, biomes, structure files and sets, functions on the load and tick tags, advancements, loot tables, trades, recipes, dialogs) but that the glue is only reachable as hand-written command text: placing a structure once, a kit for each new player, game rules set at world start, one-block loops, teams, scoreboard objectives, timers and areas. Rules counters are script data, not scoreboard objectives (G12), and Rules need the Fabric mod jar (G13), so Rules alone cannot be the answer for data pack worlds and maps.

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
- **D8 Facts, plugin API 1.21.0.** `CreatorGroup` gains `games`. `TargetFacts.worlds` holds the structure placements, the void biome, the floating-island and End-like noise settings, the `fixed_placement` shape and the first-join criterion. `TargetFacts.scoreboard` holds criteria, display slots, render types, number formats, team colours, name tag visibility and collision rules. `TargetFacts.commands.forms` holds the exact command forms the lowering writes. Every value is measured by B547; anything not measured is "(verify at implementation)".
- **D9 Generated names.** Functions are generated under `<ns>:msm_games/...` and merged into one `load` and one `tick` function of the plugin, which join `#minecraft:load` and `#minecraft:tick`. The validator refuses project functions under that path.

## Consequences

- A Skyblock, one-block world, adventure map or arena can be made without the jar; the same pieces are readable by Rules (ADR 0115).
- Six new Studios (ADR 0117 D1). The kinds count grows by six.
- Teams and objectives stay in old worlds after a rename (limit M7).
- The eject carries these files as data with no Java change.

## Status

Proposed (2026-11-22). Vetoable defaults:
- the kinds live in a new plugin rather than in `@msm/plugin-datapack`;
- one `msm:world_setup` per project;
- game rules at start are set once, not on every load;
- a new player's things are given once, by the advancement pattern;
- at most four one-block positions;
- whole-second timers;
- teams and objectives are never removed by MSM.
