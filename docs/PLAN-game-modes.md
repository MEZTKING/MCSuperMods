# Plan: Game modes and maps

**Status: draft (2026-11-22).** Starts after vanilla parity 3 closes (B544). Nothing here runs before that close, and nothing after Wave 0 starts before the spike B547 has reported. Brief ids B547–B564; ADRs 0113–0117 (Proposed).

Working plan for the ROADMAP idea "Whole game modes and maps" (user, 2026-11-22: "eventually you should be able to make something like a custom skyblock etc and more with all these tools"), under the golden rule of 2026-11-14 (anything that can be made in vanilla Minecraft Java must be possible through MSM; a gap is a bug). Written 2026-11-22 by the orchestrator at 9ce013f (branch `ccr-d077e76e-4gnbx2`). Every "today" claim below was checked against the code at that commit (fact table G1–G22); every claim about the game is a spike question (Y1–Y16) or carries "(verify at implementation)". Vanilla parity 3 batch 2 (game rules, statistics, the "Open a dialog" step, the advancement trigger, fluid mixing, traders 2, mobs 2, boats) is assumed merged when this plan starts (fact G20).

Decisions live in [ADR 0113](adr/0113-game-kits-plugin-and-kinds.md) (the games plugin and its six kinds, all lowered to plain data pack files), [ADR 0114](adr/0114-void-and-island-worlds-and-the-start-structure.md) (void, flat and sky island world types, the start structure, spawn, generators), [ADR 0115](adr/0115-rules-3-for-games.md) (Rules steps, conditions, values and triggers for loot, structures, teams, scores, timers and areas, and the function bridge), [ADR 0116](adr/0116-play-my-game-map-export-and-builds-from-the-game.md) (Play my game, export as a map, builds from the game, chests in the Structure Studio) and [ADR 0117](adr/0117-game-modes-flows-studios-try-it-and-tests.md) (flows, Studios, Very easy, Try it grounds, fixture, tests).

## In plain words

- **What you can make.** A Skyblock: a world of empty sky, a small island at the spawn with a chest (a lava bucket and ice, so the classic cobblestone generator can be built), extra trades, recipes and loot for what the sky lacks, and goals in the advancement screen. A one-block world: one block at the spawn that turns into the next block each time you break it, in phases, with chests and mobs now and then. Worlds of floating islands. Lucky blocks. Adventure maps: your buildings, areas that react when a player walks in, checkpoints, a welcome dialog, game rules and goals, and a button that packs the finished world into a file other people can open. Minigames: arenas that rebuild themselves, teams with colours, scores in the sidebar, timers on the boss bar.
- **How it is made.** The vanilla way: a world type and biome in a data pack, a structure file for the island, functions that run once when the world starts and when each player first joins, scoreboards, teams, boss bars and advancements. Almost everything works in plain data packs without the Fabric mod; only Rules (and so lucky blocks, which need a block of your own) need the mod jar.
- **What already works today.** Much of it, by hand: world presets, flat presets, dimensions, biomes, structure files imported from the game, structure sets, functions on the load and tick tags, advancements, loot tables, trades and recipes all exist as kinds (G1–G9). What is missing is the glue: nothing places a structure once at the spawn, nothing gives a new player a kit, there are no kinds for teams, scores, timers or areas, Rules cannot react to areas or timers, Play cannot open a world of your own world type, Try it has no empty sky to stand in, and there is no way to ship a finished map.
- **What it is not.** No new game mode beyond vanilla's four, no change to what vanilla's lava and water make (a liquid of your own can mix into any block, from vanilla parity 3), no terrain editor or world painting inside the app (you build in the game and bring the build back), no multiplayer in Try it, no server hosting.
- **Build first:** the spike; then the format and the kinds; then Rules, Play my game and the map export; flows and Try it last.

## What MSM can make today

Checked at 9ce013f. "Today, by hand" means every file of the experience can be written with existing kinds and the result runs in the game; "a flow is missing" means it works by hand but there is no Creator flow, Very easy pick or Try it ground; "a real gap" names something no existing kind, flow or Studio can produce.

| Experience | Verdict | What works today | What is missing | Evidence |
|---|---|---|---|---|
| **Skyblock** (void world, island at the spawn, chests, cobblestone generator, extra trades, recipes and loot, goals) | Today, by hand; a flow is missing; three real gaps | A void world type: a `minecraft:worldgen/world_preset` whose overworld is a `minecraft:dimension` with the `minecraft:flat` generator, no layers and a biome (G1, G2); a project biome with mob spawns (Biome Studio). The island: build it in the game, save it with a structure block, import the `.nbt` (G5); chest contents are carried in the file. Placing it once: a load function with a storage flag and `place template` (functions and the `#minecraft:load` tag, G9). The generator: vanilla lava and water make cobblestone in any world, with nothing to add. Trades: `villager_trade`, `trade_set`, the Villager trade and Wandering merchant flows (G19). Recipes: Recipe Studio. Loot: a loot table element with the vanilla id replaces vanilla's (G19). Goals: advancements (schema form, G9). | (1) No schema for vanilla's `dimension_origin` structure placement, so the worldgen route to a structure at the origin cannot be edited in a form (G7). (2) The Structure Studio cannot set a chest's loot table or items (G6). (3) Play always makes a flat creative test world with a test area, so a Skyblock cannot be played with one click (G16). Also: no Try it ground with empty sky (G18), no start kit or first-join hook short of hand-written advancements, no flow. | G1–G9, G16, G18, G19 |
| **One block** | Today, by hand; a flow is missing | A tick function testing `execute if block <pos> air`, `random value`, `setblock` (with a chest's `LootTable`), `summon` and a scoreboard for the phase (functions, G9). Rules can do part of it with the jar (`any_block_broken`, `block_is`, `place_block`, `chance`, counters, G11), clumsily: no weighted pick. | No kind or flow; Try it does not run functions (G18), so it cannot be previewed. | G9, G11, G18 |
| **Sky islands** | As a dimension: today, with a flow. As the main world: today by hand; a flow is missing | The Dimension flow's terrain "Floating islands over the void" and "End-like islands" (G3), reached by a key, function or portal. A world preset naming those noise settings for the overworld is possible by hand (G1). | No flow answer "make it the world type"; no start island. | G1, G3 |
| **Lucky blocks** | Today, with Rules (an example); a flow is missing | The example "Rules: a lucky block" (`library/src/examples/rules.ts`): a project block, a rule book with `chance`, `drop_item`, `spawn_mob` and a counter (G14). Needs the Fabric mod jar (vanilla packs cannot add a block). | No Creator flow; no Rules step for a loot table roll, placing a structure or a weighted pick (`run_command` by hand) (G11). | G11, G13, G14 |
| **Adventure maps** (structures, Rules, dialogs, game rules, statistics, advancements) | The pieces today, by hand; two real gaps | Structures from the game (`.nbt`, `.schem`, G5), jigsaw structures, Rules (jar), dialog kind (G9) and, after vanilla parity 3, "Open a dialog", own game rules and statistics, the advancement trigger (G20); vanilla game rules by `/gamerule` in a function (G10); advancements as goals. `run_command` covers `spawnpoint`, `tp`, `gamemode` (G11). | (1) No way to ship a map: no export of a world folder with the packs inside (G17). (2) Rules have no "a player enters an area" trigger or "in an area" condition (G11). Also: Reload works only in the test world (G16), so editing logic inside a map world needs a restart; adventure-mode `can_break` and `can_place_on` have no UI (raw components); no flow. | G5, G9–G11, G16, G17, G20 |
| **Minigame kits** (arenas, teams, scoreboards, timers) | Today by hand with functions; real gaps for Rules and the app | `/team`, `/scoreboard`, `/bossbar`, `/worldborder`, `/schedule`, `/place template` and `/clone` in functions; Rules `run_command`, `wait`, `world_every`, `show_boss_bar` (G11, G21). | (1) No kinds for teams, scoreboard objectives, timers or areas: everything is command text. (2) Rules counters are script data, not scoreboard objectives: the sidebar and functions cannot see them (G12). (3) No arena reset step, no team or score step or condition (G11). Try it is single player (limit M14). No flow. | G11, G12, G21 |

## Gaps: confirmed open, and dropped

| Gap | State | Evidence | Where |
|---|---|---|---|
| A place for "how the world starts": world type, start structure, spawn, game mode, game rules at start, kit for new players, welcome | Open | G9, G16 (nothing but hand-written functions) | ADR 0113 D2, ADR 0114 |
| Void, flat-of-air and sky island world types as one answer | Open (by hand today) | G1–G4 | ADR 0114 D1 |
| Placing a structure once at the spawn | Open (by hand; no schema for `dimension_origin`) | G7, G22 | ADR 0114 D2 |
| Kit and message for each new player, once | Open | G9, G11 (`player_joined` fires on every join) | ADR 0113 D2 |
| One block | Open (by hand) | G9, G11 | ADR 0113 D3 |
| Teams, scoreboard objectives, timers, areas as kinds | Open | G12, G21 | ADR 0113 D4–D7 |
| Rules: loot table rolls, placing a structure, weighted pick, teams, scores, timers, areas, spawns, world border | Open | G11 | ADR 0115 |
| Play in the project's own world type | Open | G16 | ADR 0116 D1 |
| Exporting a finished world as a map | Open | G17 | ADR 0116 D2 |
| Bringing structure-block saves from the test world into the project | Open (only by finding the file by hand) | G5, G16 | ADR 0116 D3 |
| Chest contents and loot tables in the Structure Studio | Open | G6 | ADR 0116 D4 |
| Try it: empty sky, a structure as the ground, one block, a generator, areas, timers, teams, sidebar | Open | G18 | ADR 0117 D4 |
| Creator flows and Very easy picks for games | Open | G14, G15, G22 | ADR 0117 D2, D3 |
| Changing what vanilla lava and water make (ore generators) | **Dropped** | Vanilla has no data for it. A liquid of the project's own mixes into any block (ADR 0108, vanilla parity 3): the Skyblock flow offers that instead. | Guide note |
| Custom game modes beyond survival, creative, adventure and spectator | **Dropped** | Vanilla has four; adventure plus `can_break`/`can_place_on` and game rules cover maps. | — |
| Writing `level.dat` (game mode, cheats, spawn) | **Dropped here** | Not needed: the setup sets game mode, game rules, difficulty and spawn by commands in game; level.dat stays the world's own (ADR 0116 D2). | — |
| Multiplayer in Try it; hosting a server | **Dropped** | Try it simulates one player (ADR 0085); servers are outside MSM's scope (DESIGN section 1). | — |
| A terrain or block editor in the app | **Dropped** | Build in the game, bring it back (ADR 0116 D3); a voxel editor is a separate idea, not parity. | — |
| Lucky blocks in vanilla packs | **Dropped** | Vanilla packs cannot add blocks; lucky blocks need the jar (limit M1). | — |

## Fact table (G1 to G22)

Read in this repository at 9ce013f on 2026-11-22. No game jar was opened in this session.

| # | Fact | Source |
|---|---|---|
| G1 | Worldgen kinds: tier A `worldgen/biome`, `worldgen/feature`, `worldgen/placed_feature`, `dimension`, `worldgen/world_preset`; tier B `noise_settings`, `density_function`, `noise`, `carver`, `flat_level_generator_preset`, `multi_noise_biome_source_parameter_list`, `block_state_provider`, `material_condition`, `material_rule` | `packages/plugins/worldgen/src/kinds/registries.ts` |
| G2 | Templates "World preset", "Superflat preset", "Single-biome dimension", "Multi-noise overworld"; none for a void world | `worldgen/src/templates/dimensions.ts`, `advanced.ts` |
| G3 | The Dimension flow's terrain choices include "Floating islands over the void", "End-like islands" and "Completely flat" (flat layers of vanilla blocks); it makes a dimension reached by a key, a function or a portal, never a world type | `packages/plugins/library/src/starters/dimension.ts` |
| G4 | The Custom biome flow makes a world preset ("World Type") with its biome | `library/src/starters/custom-biome.ts` |
| G5 | Structures plugin kinds `minecraft:structure_template` (JSON lowered to `.nbt`; `block_entities` and `entities` kept as SNBT; over 48 per axis is a warning), `template_pool`, `structure`, `structure_set`, `processor_list`; importers for `.nbt` and Sponge `.schem` | `packages/plugins/structures/src/kinds/`, `nbt/structure-template.ts`, `importers.ts` |
| G6 | The Structure Studio shows size, palette, a jigsaw table, Replace from file and exports; it does not edit blocks or block entities (chest contents, loot tables) | `app/src/renderer/src/studios/structures/StructureStudio.tsx` |
| G7 | Vendored registries list structure placements `concentric_rings`, `dimension_origin` and `random_spread` on both targets; the vendored mcdoc dispatcher `minecraft:structure_placement` has only `concentric_rings` and `random_spread`, so `dimension_origin` falls to `%unknown` | `packages/targets/mc-26.{3,4}/vendor/mcmeta/registries.json`, `vendor/vanilla-mcdoc/symbols.json` |
| G8 | Placement modifier `fixed_placement` on both targets, its `positions` field changes shape at 26.4 (an mcdoc union `until 26.4` / `since 26.4`); feature `void_start_platform` on both | same files |
| G9 | Data kinds: `function` (the Function starter wires `#minecraft:load` and `#minecraft:tick`), `advancement` (schema form, templates incl. a root), `loot_table`, `predicate`, `recipe`, `tag`, `item_modifier`, generic registries incl. `dialog`, `villager_trade`, `trade_set`; no advancement Studio | `packages/plugins/datapack/src/kinds/`, `templates/` |
| G10 | 59 vanilla game rules in the vendored registry, among them `respawn_radius`, `keep_inventory`, `spawn_wandering_traders`, `advance_time`; `TargetFacts.gameRules.vanillaNames` (plugin API 1.20.0); dialog types `notice`, `confirmation`, `multi_action`, `dialog_list`, `server_links` | `mc-26.3/src/target.ts`, `vendor/mcmeta/registries.json` |
| G11 | Rules: 56 triggers (incl. `world_started`, `world_every`, `player_joined` on every join, `any_block_broken`), 44 steps (incl. `place_block`, `spawn_mob`, `drop_item` of one item id, `run_function`, `run_command`, `show_boss_bar`, `wait`, `repeat`, `if`, counters), 19 conditions, values incl. `random`, `player_position`, `player_count`. No trigger for areas or timers; no step for loot tables, structures, teams, scoreboard objectives, world spawn or world border; no weighted pick | `packages/plugins/rules/src/catalogue/` |
| G12 | Rules counters are script data (`DataStore` over `ScriptDataAttachment`, persisted since B144), not scoreboard objectives | `rules/src/compile/script.ts`, `engine-mod/.../scripting/DataStore.java` |
| G13 | Rules compile to generated scripts that the runtime runs (Fabric mod jar); Script API `runCommand` returns the command's result count | ADR 0082; `packages/plugins/scripting/api/msm-runtime.d.ts` |
| G14 | No starter for a game, a void world, one block, lucky blocks, maps or minigames; lucky blocks exist only as the example "Rules: a lucky block" | `library/src/starters/`, `library/src/examples/rules.ts` |
| G15 | Home tiles "Make a world or biome", "Make a building", "Change drops and trades" in group `worlds`; `CreatorGroup` is `gear`, `blocks`, `food`, `mobs`, `vehicles`, `scripts`, `worlds`, `magic` | `app/src/renderer/src/components/home/tiles.ts`, `packages/plugin-api/src/library.ts` |
| G16 | Play's test world: preset `WorldPresets.FLAT`, creative, easy, no structures, fixed seed; the setup function stops time and weather and mob spawning, builds a test area and chests; Reload only in the test world (`canReload: state === 'test-world'`) | `engine-mod/.../client/dev/DevWorldSettings.java`, `packages/interop/src/fabric/setup-function.ts`, `app/src/main/platform/play.ts` |
| G17 | No world or map export (exporters: vanilla packs, content jar, Java project, structure `.nbt`/`.schem`, modpacks of ADR 0046); world backups zip a whole world (ADR 0102); interop reads `level.dat` names and chunks only | `app/src/main/platform/world-backups.ts`, `packages/interop/src/nbt/level-dat.ts`, `world/` |
| G18 | Try it grounds `grid`, `flat`, `quick`, `world` in a 48 x 32 x 48 area; no empty or structure ground; functions are not run (commands logged); fluids do not flow (limit Q29) | `packages/sim/src/grounds/ground.ts`, `sim/src/types.ts`, `sim/src/commands/run.ts`, `sim/src/fluids/area.ts` |
| G19 | Trades: generic `villager_trade`, `trade_set`; flows Villager trade, Wandering merchant; loot additions to vanilla tables only in the jar (Extra drop flow); an element with a vanilla id replaces the vanilla file | `datapack/src/kinds/generic.ts`, `library/src/starters/extra-drop.ts`, `docs/COVERAGE-AUDIT.md` 1.1 |
| G20 | Vanilla parity 3 batch 2 adds `msm:game_rule`, `msm:stat`, the "Open a dialog" step, "A player gets an advancement", fluid mixing for project fluids (vanilla lava and water unchanged), argument types incl. `objective` and score holders | ADRs 0108 and 0111 with their findings at B544 (the vanilla parity 3 plan is deleted) |
| G21 | Scoreboard, teams, boss bars: commands in functions; boss bars and titles also from scripts (ADR 0065) and the Rules step `show_boss_bar` | `docs/COVERAGE-AUDIT.md` 1.3 |
| G22 | The Jigsaw structure flow places a village of huts in forests by `random_spread`; nothing places a structure once | `library/src/starters/jigsaw-structure.ts` |

## Spike questions (Y1 to Y16)

Answered by B547 on both versions (26.3 and 26.4-snapshot-7) by observation: GameTests on a dedicated GameTest server, client GameTests for what needs a client (world creation, the world list), data packs written by the spike. Signatures by `javap` only; no Mojang method body read.

- **Y1** `dimension_origin` structure placement: its fields (expected the common `salt`, `frequency`, `exclusion_zone`, `locate_offset`, verify), whether it places a jigsaw structure exactly once at chunk 0, 0 of the dimension, at what height with an absolute `start_height`, and whether "Generate structures: off" skips it.
- **Y2** Where a player spawns in a flat world with no layers: with and without a structure at the origin, with `respawn_radius` 0; whether the world spawn lands on an island placed by Y1 or needs `setworldspawn`.
- **Y3** The function route: a `#minecraft:load` function in a new world, `forceload add` and `place template` in the same tick or scheduled a tick later; a storage flag (`data modify storage <ns>:games ...`) keeping it to once per world across restarts and `/reload`.
- **Y4** First join, once per player: an advancement with the `minecraft:tick` criterion and a reward function (the vanilla pattern) on both versions; it runs before or after the player is placed; it survives death and rejoining.
- **Y5** Void Nether and End: a flat void `the_nether` and `the_end`; whether the dragon fight, the exit portal and the gateways still appear in a void End; how a player reaches the End with no stronghold (an End portal frame in the start structure filled with eyes: does it light?).
- **Y6** A flat generator with `layers: []` decodes on both versions; the `void_start_platform` feature appears only with `minecraft:the_void`; a project biome with no features gives a clean void.
- **Y7** Mob spawning on a player-built platform in the void: `minecraft:the_void`'s spawn lists (expected empty), a project biome with plains-like spawners, wandering traders arriving, phantoms.
- **Y8** `fixed_placement` on both versions (the 26.4 shape change, G8): a placed feature at one fixed position, as an alternative to Y1 for small starts.
- **Y9** The one-block loop: a tick function at one position, `random value`, `setblock` with a chest and its loot table in 26.x block entity syntax, `summon` above, the broken block's own drops kept; cost per tick measured.
- **Y10** Teams, objectives, the sidebar and boss bars: `team add`/`modify` options, `scoreboard objectives add` with display names and `numberformat`, `bossbar` from a function, per version, checked against the vendored command tree (`@msm/schemas/mcfunction`).
- **Y11** Areas: a `location_check` predicate with position ranges in `execute if predicate`, tags for "entered" and "left" in a tick function, cost for 64 areas and 20 players (by mock players).
- **Y12** Area reset: `place template` of a template up to 48 per axis, several templates for larger arenas, entities in the box removed first; `clone` from a stored copy as the alternative.
- **Y13** The function bridge: a data pack function running a project command (`msm:command`) as a player, so a function can fire Rules; it parses at `/reload` and runs (expected: mod commands are on the server dispatcher before functions load).
- **Y14** A world copied out of the managed instance, its `datapacks/` holding the exported data pack and `resources.zip` the resource pack, opened in a fresh vanilla instance: the pack enabled, the resource prompt shown; the same world in a modpack's `overrides/saves/` installed by Prism (verify Prism copies it).
- **Y15** Play my game: `createFreshLevel` with a project world preset from the content jar's data, and, for a data-only project, with the dev data pack in the world folder before the world is made (enabled at creation, so its world preset is listed); survival, structures on.
- **Y16** Adventure mode: `can_break` and `can_place_on` components given by `/give` and by loot tables on both versions (26.x component syntax, verify).

## Limits (M1 to M16)

| # | Limit | Why | What users see | Mitigation |
|---|---|---|---|---|
| M1 | **Rules and lucky blocks need the Fabric mod jar.** | Rules run in the runtime (G13); vanilla packs cannot add blocks. | Info on vanilla pack exports, as today. | The games kinds lower to data pack files and work without it. |
| M2 | **A world type in a vanilla data pack is offered only when the pack is added at world creation.** | Vanilla reads world presets from the packs chosen on the Create World screen. | The guide says how; the map export ships a world already made. | Play my game does it for you. |
| M3 | **The start structure is placed at the first join, by a function** (default; the worldgen route by Y1 is Advanced). | Works with "Generate structures" off and in old worlds. | A short moment of void before the island appears (measured in Y3). | Advanced: "Place it while the world generates". |
| M4 | **One start structure piece is at most 48 blocks per axis.** | Vanilla's structure block limit (G5). | Larger islands are a jigsaw of pieces. | The validator warns as today. |
| M5 | **Vanilla lava and water make what they make.** | No data for it. | Custom generators use a liquid of the project's own (ADR 0108). | Skyblock flow answer. |
| M6 | **One block: up to four positions per world.** | A tick test per position (Y9 cost). | More are refused. | Validator. |
| M7 | **Teams and objectives are made when the world loads and never removed by MSM.** | Vanilla keeps them in the world's scoreboard. | Renaming one leaves the old one in old worlds. | Guide note; a "remove old" line is offered in the Studio. |
| M8 | **Areas are boxes.** | `location_check` position ranges. | No round or shaped areas. | Several boxes per area. |
| M9 | **Timers tick in whole seconds.** | One scoreboard step a second (ADR 0113 D6). | No tenths. | None. |
| M10 | **Rules counters and scoreboard objectives are different things.** | Counters are script data (G12). | The sidebar shows objectives only. | Rules steps for scores (ADR 0115). |
| M11 | **Map export copies a world as it is** and leaves out player data, advancements and statistics. | A map starts fresh for each player (ADR 0116 D2). | The author's inventory is not in the map. | Option "Keep my player data". |
| M12 | **A map that needs the jar ships as a modpack.** | Vanilla worlds cannot carry mods. | One `.mrpack` with the world inside. | ADR 0046's modpack export. |
| M13 | **Play my game is one world per project and target.** | As the test world (ADR 0084). | Start over renames the old one. | As New test world. |
| M14 | **Try it is single player and 48 x 32 x 48.** | ADR 0085. | Teams and scores shown for the one player; larger islands cut at the edge. | Play. |
| M15 | **Try it shows functions' effects through the kinds, not by running functions.** | Try it does not run functions (G18). | The games kinds are drawn and played by the sim; hand-written functions are still only logged. | Play. |
| M16 | **Builds come from the game.** | No block editor in the app. | Build, save with a structure block, bring it in. | ADR 0116 D3. |

## Rules for every brief

The rules of `docs/HANDOFF.md` "Rules for every brief" (moved there from the vanilla parity 3 plan at its close, B544) apply unchanged (clean room, no new dependency, git worktrees in the scratchpad with the given identity and no `git config`, disk and Gradle limits, stubs first, one owner per shared file per wave, notes for the plan, exit criteria, Try it line, plain words, models), with these names changed:

- **Stubs first.** B548 makes every shared registration point: the new plugin `packages/plugins/games` (`@msm/plugin-games`, made with `tools/new-plugin`), its stub kinds, its entry in the app's built-in plugin list, the empty Studio entries, `packages/sim/src/games/` stubs, the parity class, the fixture README and the skipped e2e specs.
- **Format.** Only B549 edits `packages/schemas/mcdoc/msm/games.mcdoc` (new) and the vanilla overlay; `rules.mcdoc` belongs to B553. Run `node tools/build-msm-mcdoc/index.ts --check`.
- **Plugin API.** Only B550 edits `packages/plugin-api/src/` and the target facts (plugin API 1.21.0).
- **IPC.** One brief per wave owns `app/src/shared/` and `app/src/preload/` (B554 in wave 2, B556 in wave 3).
- **Data packs first.** Everything the games kinds lower to must load in a vanilla data pack with zero problems on both targets (the exporters' library test); a line that needs the jar is a Rules line, never a games kind line.
- **Models.** Opus at medium effort; B547 at high effort; Sonnet for B548 and the guide half of B561.

## Overlaps with other work

- Vanilla parity 3 must be closed (B544); this plan reads its kinds (`msm:game_rule`, `msm:stat`, dialogs, fluid mixing).
- The next client batch (custom screens, renderers) is independent; no shared files.
- **ADR numbers:** 0113–0117. **Brief ids:** B547–B564. **Versions:** plugin API 1.21.0; no Script API change (Rules compile to `runCommand`, G13).

## Waves

| Wave | Briefs (parallel) | Engine-mod briefs | Depends on |
|---|---|---|---|
| 0 | B547 spike; then B548 scaffold and stubs | B547, then B548 (parity stub only) | B544; B548 after B547 reports |
| 1 | B549 format; B550 plugin API 1.21.0 and facts | none | B548 |
| 2 | B551 games: world setup and start; B552 games: one block, teams, objectives, timers, areas; B553 Rules 3; B554 Play my game | B554 | B549, B550 |
| 3 | B555 app: Games Studios and chests; B556 map export and builds from the game | none | wave 2 (B556 after B554) |
| 4 | B557 flows, templates, examples, tiles; B558 Try it | none | waves 2–3 |
| 5 | B559 fixture, parity and CI; B560 e2e | B559 | waves 2–4 |
| 6 | B561 AI helper, guide, changelog; then B562 close | none | all |
| reserve | B563 function bridge by a runtime command (only if Y13 fails); B564 Play my game for data-only projects by a server-made world (only if Y15 fails for the dev data pack) | B563, B564 | B547 |

Order: the spike first (every route depends on it), then the frozen shapes, then lowering beside Rules and Play my game (independent files), the app on top, flows and Try it once the kinds lower, tests last.

## Briefs

### B547 Spike: void worlds, start structures, first join, one block, teams, areas and maps (wave 0; Opus, high effort; one session)

- **Owner files:** throwaway `engine-mod/src/gametest/java/dev/mcsupermods/runtime/gametest/spike6/` (one class per question) with data pack resources under `engine-mod/src/gametest/resources/spike6/`, temporary `fabric.mod.json` entries (removed before the report), throwaway client GameTests for world creation (Y2, Y5, Y14, Y15); evidence into `docs/reference/spikes/b547/` (new; README line in `docs/reference/spikes/README.md` is the main session's). Nothing in `src/main`.
- **Scope:** Y1–Y16 on both versions: void world types decoded and made; a jigsaw structure with `dimension_origin` placement; spawn positions; the load route with forceload and a storage flag; the first-join advancement; void Nether and End; mob spawns on a platform; `fixed_placement`; a one-block loop for 1,000 breaks (cost per tick); teams, objectives, sidebar, boss bars; 64 areas with 20 mock players; area reset by `place template`; a function running a project command; a world copied with packs and opened in a clean instance (client GameTest), and the `.mrpack` route checked by reading Prism's import code path documentation (verify) or by hand on the user's machine (then a note); `createFreshLevel` with a project preset; `can_break` from `/give`.
- **Exit criteria:** a report answering Y1–Y16 per version with evidence (log lines, counts, screenshots named per version); the exact command and JSON forms that worked (for B550's facts and B551/B552's lowering); go or no-go for ADR 0114 D2's Advanced worldgen route, ADR 0115 D5 (the bridge; else reserve B563), ADR 0116 D1 for data-only projects (else reserve B564); the spike code deleted; `./gradlew build` green on both versions.

### B548 Scaffold and stubs (wave 0; Sonnet; after B547 reports)

- **Owner files:** new `packages/plugins/games/` (from `node tools/new-plugin games`: `package.json`, `src/index.ts`, `src/kinds/index.ts` with stub kinds `msm:world_setup`, `msm:one_block`, `msm:team`, `msm:objective`, `msm:timer`, `msm:area` (not registered until B549's schema refs exist), `src/lowering/` empty modules `world-setup.ts`, `start.ts`, `one-block.ts`, `team.ts`, `objective.ts`, `timer.ts`, `area.ts`, `src/validators.ts` empty list, `test/` smoke test, `CLAUDE.md` at most 55 lines); the app's built-in plugin list (the one file that lists `@msm/plugin-rules`; find with `grep -rn "plugin-rules" app/src --include=*.ts`); `tools/check-deps` allow-list line if it needs one; `app/src/renderer/src/studios/games/` empty Studio entries (`msm.games.world-setup`, `one-block`, `team`, `objective`, `timer`, `area`) and their registry lines; `packages/sim/src/games/index.ts` stub; `engine-mod/parity/src/main/java/dev/mcsupermods/parity/SampleGameModesParityTest.java` (filter `sample_game_modes_*`, no tests yet) and its entry; `fixtures/sample-game-modes/README.md`; skipped `app/e2e/games-path.spec.ts`, `maps-path.spec.ts`.
- **Scope:** wiring only; takes B547's renames.
- **Exit criteria:** lint, typecheck, tests green; `pnpm build`; `./gradlew -p parity build` green; the new plugin passes `tools/check-deps` (only `@msm/plugin-api` and `@msm/schemas`).

### B549 Format: the games kinds and the vanilla overlay (wave 1; Opus)

- **Owner files:** new `packages/schemas/mcdoc/msm/games.mcdoc` and its line in `symbols.json` (through `tools/build-msm-mcdoc`); a vanilla overlay for the `minecraft:structure_placement` dispatcher case `dimension_origin` (fields as B547 measured) in `packages/schemas/` (new `mcdoc/msm/vanilla-overlay.mcdoc` read by the adapter in `packages/schemas/src/`, or the adapter mechanism B504 used for the `concrete` node; the brief picks one and says which); `packages/schemas/test/` cases for each kind (valid and invalid); `packages/plugins/games/src/kinds/index.ts` (schema refs; the kinds registered).
- **Scope:** the frozen shapes of ADR 0113 D2–D7 with the defaults and ranges ADR 0113 lists; the overlay so a `structure_set` with `dimension_origin` has a full form with zero unsupported nodes.
- **Exit criteria:** `node tools/build-msm-mcdoc/index.ts --check`; schemas tests; the targets' coverage test still at zero unsupported nodes; games plugin tests (each kind's default data validates on both targets).

### B550 Plugin API 1.21.0 and target facts (wave 1; Opus)

- **Owner files:** `packages/plugin-api/src/library.ts` (`CreatorGroup` gains `'games'`), `src/target.ts`, `version.ts`, `package.json` version, CHANGELOG lines, README version table; `packages/targets/mc-26.3/src/target.ts`, `mc-26.4/src/target.ts`, their tests and `CHANGES.md`; `packages/targets/all/test/`.
- **Scope:** ADR 0113 D8 facts as B547 measured: `TargetFacts.worlds` (`structurePlacements`, `voidBiome`, `floatingIslandsSettings`, `endLikeSettings`, `fixedPlacementShape`, `firstJoinCriterion`), `TargetFacts.scoreboard` (vanilla criteria names, display slots incl. the team-coloured sidebars, render types, number formats, team colours, name tag visibility and collision values), `TargetFacts.commands.forms` (the exact `team`, `scoreboard`, `bossbar`, `worldborder`, `place template`, `forceload`, `loot`, `random` forms the lowering writes, per version). Anything B547 did not measure stays out of the facts and is "(verify at implementation)" in `CHANGES.md`.
- **Exit criteria:** `pnpm --filter "@msm/target-*" test`, `@msm/plugin-api` tests; `tools/check-deps`; plugin API 1.21.0 declared; built-in plugins still declare `^1.0.0`.

### B551 Games plugin: world setup and the start (wave 2; Opus)

- **Owner files:** `packages/plugins/games/src/lowering/world-setup.ts`, `start.ts`, new `world-type.ts`, `first-join.ts`; `src/validators-world-setup.ts`; `src/templates/world-setup.ts`; their tests and goldens.
- **Scope:** ADR 0113 D2 and ADR 0114 D1–D6: the world types (void, flat, sky islands, vanilla, a project preset) lowered to `world_preset`, `dimension` and a sky biome; the start structure by the first-join function (default) or by `dimension_origin` (Advanced, on B547's go); spawn; game mode, difficulty and game rules at world start, once (storage flag); the new player's kit, message, dialog and effects by the first-join advancement; the world type's lang (`generator.<ns>.<path>`, verify the key at implementation); the `#minecraft:normal` world preset tag; validators (one `msm:world_setup` per project, the start structure exists, the spawn inside the structure's box, game rule names from `TargetFacts.gameRules`, a Nether or End choice of void warns that the End needs a frame in the start).
- **Exit criteria:** games tests and goldens on both targets; the exporters' library test loads a void Skyblock's vanilla data pack with zero problems on both targets; `mcfunction` lines checked by `@msm/schemas/mcfunction` (zero errors).

### B552 Games plugin: one block, teams, objectives, timers and areas (wave 2; Opus)

- **Owner files:** `packages/plugins/games/src/lowering/one-block.ts`, `team.ts`, `objective.ts`, `timer.ts`, `area.ts`, new `shared-functions.ts` (the plugin's `load` and `tick` function and tag merging); `src/validators-pieces.ts`; `src/templates/pieces.ts`; their tests and goldens.
- **Scope:** ADR 0113 D3–D7: the one-block tick function and phases; teams and objectives made at load if missing; timers on a `<ns>.msm_timers` objective with their boss bar or action bar; areas as `location_check` predicates with entered and left tags and reset functions; validators (at most four one-block positions, phase weights above zero, area boxes ordered, reset structures exist and fit, timer seconds 1 to 86,400, objective criteria from the facts).
- **Exit criteria:** as B551; a sample of each kind loads in a vanilla data pack on both targets.

### B553 Rules 3 for games (wave 2; Opus)

- **Owner files:** `packages/plugins/rules/src/catalogue/triggers.ts`, `steps.ts`, `conditions.ts`, `values.ts`, `types.ts`; `packages/plugins/rules/src/compile/`; `packages/plugins/rules/src/expander.ts` (or the file holding `rulesExpander`; the signal command); `packages/schemas/mcdoc/msm/rules.mcdoc`; `packages/plugins/rules/src/sentence.ts`; tests and goldens.
- **Scope:** ADR 0115 D1–D6: steps "Drop from a loot table", "Give from a loot table", "Place a structure", "Pick one at random", "Join a team", "Leave the team", "Set a score", "Add to a score", "Start a timer", "Stop a timer", "Reset an area", "Set the world spawn", "Set the player's spawn point", "Set the world border"; conditions "The player is in the area", "The player is on the team", "The score is at least", "The timer is running"; values "The score of", "Time left on the timer", "Players on the team"; triggers "A player enters the area", "A player leaves the area", "A timer ends", "The one block is broken"; the function bridge (one hidden project command per project, made by the expander, used by the games kinds' functions to fire these triggers).
- **Exit criteria:** rules tests and compiler goldens; every new step's command text passes `@msm/schemas/mcfunction` on both targets; the AI `kind_schema` numbers reported for B561.

### B554 Play my game (wave 2; Opus)

- **Owner files:** `engine-mod/src/main/java/dev/mcsupermods/runtime/client/dev/DevWorldSettings.java`, `DevClient.java`, `engine-mod/src/main/java/dev/mcsupermods/runtime/dev/DevSetup.java`, their JUnit tests, a client GameTest `MsmPlayMyGameClientGameTest` (new) and its `fabric.mod.json` entry; `packages/interop/src/fabric/dev-session.ts` (`PlayRequest.kind`, `preset`, `gameMode`), `setup-function.ts`; `app/src/main/platform/play.ts`; `app/src/shared/` and `app/src/preload/` Play lines; `app/src/renderer/src/components/play/PlayControls.tsx`, `app/src/renderer/src/store/play-store.ts`; their tests.
- **Scope:** ADR 0116 D1: a second Play mode "Play my game" opening or making `msm-game-<ns>` with the world setup's world type (from the content jar, or from the dev data pack placed before creation per Y15), game mode and difficulty, structures on, a random seed shown in the status, no test area, chests or game rule changes; Reload allowed in it; "Start over" renames it as New test world does.
- **Exit criteria:** JUnit, the client GameTest on both versions (a void world with an island made and joined), `./gradlew build` both versions and `-PwithoutGeckolib`; app tests; e2e `play-path` still green with the fake launcher.

### B555 App: Games Studios and chests in the Structure Studio (wave 3; Opus)

- **Owner files:** `app/src/renderer/src/studios/games/` (World Setup, One Block, Team, Objective, Timer and Area Studios, shared pickers); `app/src/renderer/src/studios/structures/StructureStudio.tsx` and a new `studios/structures/ContainersSection.tsx`; `app/src/renderer/src/studios/very-easy.ts` (section lists for the new Studios); their tests.
- **Scope:** ADR 0117 D1 and ADR 0116 D4: the six Studios with Very easy sections; the Structure Studio's "Chests and containers" list (each block entity with an inventory: its loot table picker, its items, a seed), editing the SNBT through `deepslate` already in the structures plugin (no new dependency: the renderer calls the structures plugin's helpers).
- **Exit criteria:** app tests, `pnpm build`, `node tools/check-size/index.ts` (stop above 31 MB asar or 17.5 MB renderer), lint, typecheck.

### B556 Map export and builds from the game (wave 3; Opus)

- **Owner files:** new `packages/interop/src/world/map-export.ts` (the world copy plan: what goes in, what is left out) and `packages/interop/src/fabric/structure-saves.ts` (structure-block saves of the managed instance's worlds, path per B547, verify); `app/src/main/platform/map-export.ts` (new; reuses the zip streaming of `world-backups.ts` by import, and `modpacks.ts`' export for the `.mrpack`); `app/src/shared/` and `app/src/preload/` map export and structure saves lines; `app/src/renderer/src/components/ExportMapDialog.tsx` (new), `ImportFilesDialog.tsx` (a "From my test worlds" tab); the menu line in `app/src/main/menu.ts`; their tests.
- **Scope:** ADR 0116 D2–D3: "Export as a map…" (pick a world of the managed instance or of a launcher instance through `WorldPickerDialog`; the project's data pack into `datapacks/`, its resource pack as `resources.zip`, the dev data pack and runtime overlays removed; player data, advancements, statistics and `session.lock` left out unless "Keep my player data"; a project needing the jar exports a `.mrpack` with the world under `overrides/saves/`); "Bring builds from my test worlds" lists the structure-block saves and imports them as structure templates.
- **Exit criteria:** interop and app tests (a fixture world folder in, the zip's file list out); `pnpm build`, check-size; lint, typecheck.

### B557 Flows, templates, examples and tiles (wave 4; Opus)

- **Owner files:** new `packages/plugins/library/src/starters/skyblock.ts`, `one-block.ts`, `sky-islands.ts`, `lucky-block.ts`, `adventure-map.ts`, `arena-game.ts`, `race.ts`, `goals.ts` and their lines in `starters/index.ts`; `library/src/examples/games.ts` (new) and its line in `examples/index.ts`; art recipes in `library/src/art/recipes/` (island blocks are vanilla; the lucky block, the flag and timer icons); `app/src/renderer/src/components/home/tiles.ts` (the tile "Make a game" and its Very easy picks); the `examples/` mirror (`UPDATE_GOLDENS=1`); library tests.
- **Scope:** ADR 0117 D2–D3: the eight flows with their questions and Very easy picks; island structure templates drawn by the flow from parameters (no Mojang file: blocks are named, not copied); each flow's goals as advancements.
- **Exit criteria:** library tests; every flow's vanilla packs load with zero problems on both targets (lucky block: jar only); `checkArtRules` on every new picture; the contact sheet updated.

### B558 Try it for games (wave 4; Opus)

- **Owner files:** `packages/sim/src/games/` (new modules `setup.ts`, `one-block.ts`, `generator.ts`, `areas.ts`, `timers.ts`, `teams.ts`), `packages/sim/src/grounds/` (new `void.ts`, `structure.ts`; `GROUND_KINDS` in `ground.ts`), `packages/sim/test/`; `app/src/renderer/src/tryit/GroundPicker.tsx`, `grounds.ts`, new `tryit/games/` (sidebar and timer looks, area outlines); `fixtures/sim-parity/` game scenarios.
- **Scope:** ADR 0117 D4.
- **Exit criteria:** sim and app tests; e2e `tryit-path` green.

### B559 Fixture, parity and CI (wave 5; Opus)

- **Owner files:** new `fixtures/sample-game-modes/` (a Skyblock with a one block, two teams, a sidebar objective, a timer, two areas with a reset, a lucky block rule book, goals), `packages/exporters/test/sample-game-modes.golden.test.ts`, `engine-mod/parity/src/main/java/dev/mcsupermods/parity/SampleGameModesParityTest.java`, `.github/workflows/ci.yml` (export, server check and parity for the fixture, on both content jars and as vanilla packs).
- **Scope:** ADR 0117 D5: parity tests on the real server (the island placed once at the first mock join, the kit given once, the one block refilled through phases, a timer ending and firing its rule, an area entered and reset, scores in the sidebar slot, the lucky block rule).
- **Exit criteria:** parity green on both versions; the vanilla pack run green; the fixture README lists the in-game checks.

### B560 e2e (wave 5; Opus)

- **Owner files:** `app/e2e/games-path.spec.ts`, `maps-path.spec.ts` (unskipped), the `app/CLAUDE.md` e2e list line.
- **Scope:** in Very easy, make a Skyblock through "Make a game", see Things to fix empty, open Try it on the void ground; make an arena game and check its files; export a map from a fake world.
- **Exit criteria:** both specs green with the full e2e run.

### B561 AI helper, guide and changelog (wave 6; Sonnet for the guide, Opus for the AI part)

- **Owner files:** `packages/ai/src/`, `packages/ai/test/`, `app/src/renderer/src/ai/schema-summary.ts` (allowances for the new kinds and Rules counts); new `docs/guide/game-modes.md` and `docs/guide/maps.md` with their sidebar lines; `docs/guide/rules.md`, `playing-and-testing.md`, `structures.md`, `worldgen.md`, `creator.md`, `very-easy.md`, `try-it.md`; `CHANGELOG.md` `[Unreleased]`; status lines as the parity 3 guide briefs did.
- **Scope:** labels from the code; limits M1–M16 in plain words; the M2 note (adding a world type pack at world creation) and the M5 note (generators from a liquid of your own).
- **Exit criteria:** guide labels match the app (the guide test if one exists); AI tests.

### B562 Close (wave 6; main session)

- Review ADRs 0113–0117 against the merged code; findings; Y1–Y16 into the ADRs; DESIGN sections touched (7 plugins, 8 editors, 9 exporters, 13 interop, the Rules catalogue section) and a new section at the end only if the kinds need one; ROADMAP (the idea becomes a delivered batch), coverage audit rows, HANDOFF, DEVLOG; this plan deleted.

### B563 Reserve: the function bridge by a runtime command (only if Y13 fails)

- **Owner files:** `engine-mod/src/main/java/dev/mcsupermods/runtime/commands/` a new `MsmSignalCommand.java` (`/msm_signal <ns:id>` at permission 2, firing the event of that id), its GameTest; `packages/plugins/rules/src/compile/` and `packages/plugins/games/src/lowering/shared-functions.ts` switched to it.

### B564 Reserve: Play my game for data-only projects by a server-made world (only if Y15 fails for the dev data pack)

- **Owner files:** `engine-mod/src/main/java/dev/mcsupermods/runtime/client/dev/DevClient.java` (create the world through the integrated server with the pack enabled), `packages/interop/src/fabric/dev-session.ts`; the client GameTest of B554.

## Creator flows, Very easy picks and Try it grounds

| Flow | Very easy pick (under "Make a game") | Questions | Makes | Try it ground |
|---|---|---|---|---|
| Skyblock | "Skyblock" | Island shape (classic corner island with a tree, round, tiny, my own structure); what is in the chest (lava bucket and ice, plus seeds and a sapling by default); mobs spawn on my islands (yes); Nether and End (as normal, or empty sky too); extra trades for the wandering trader; a custom generator (off; on asks for a liquid of my own and what it makes with water); goals (on) | `msm:world_setup` (void), a structure template, a sky biome, trade set, recipes, goals | Void ground with the island in the middle |
| One block | "One block" | Phases (Plains, Underground, Deep dark, Nether, Ocean, End: vanilla blocks only), breaks per phase, chests now and then, mobs now and then, in an empty world or in a normal one | `msm:world_setup` (void) and `msm:one_block` | Void ground with the block |
| Sky islands | "Sky islands" | Islands like the End's or floating islands with land; biomes; a start island (off) | `msm:world_setup` (sky islands) | Quick ground of the chosen terrain |
| Lucky block | "Lucky block" | What can happen (items from a loot table, a mob, an explosion, a small building, an effect), how often each, its look | a block, a loot table, a rule book (jar) | Flat ground with blocks to break |
| Adventure map | "Adventure map" | Start game mode (adventure), spawn, a welcome (message or dialog), checkpoints (areas that set the spawn point), game rules (no mob griefing, keep inventory, ...), goals | `msm:world_setup` (vanilla or my own world type), areas, a dialog, rules | Structure ground from a chosen building, or From my world |
| Arena game | "Arena game" | Teams (2 to 4, colours), the arena (a box of a chosen size, or my own structure), round length, score to win, the kit, rebuild after each round | teams, an objective on the sidebar, a timer, an area with a reset, a rule book or functions | Structure ground of the arena |
| Race | "Race" | Start, checkpoints and finish (areas), count up or down, best time on the sidebar | areas, a timer, an objective | Flat ground with outlined areas |
| Goals | "Goals" | A list of goals picked from: get an item, craft an item, defeat a mob, visit a dimension or biome, reach a height; a picture for the tab | an advancement tab | None (the goals list shows in "What happened") |

## Very easy wording

- World: "Make a game", "How my world starts", "Empty sky", "Floating islands", "Flat", "As normal", "My own world type", "Start island", "Where players start", "Start as" (game mode), "Game rules when the world starts", "What new players get", "Welcome message", "Welcome screen" (a dialog), "Place it while the world generates" (Advanced).
- One block: "The magic block", "Phases", "Breaks in this phase", "Chests now and then", "Mobs now and then".
- Pieces: "Team", "Colour", "Hurt your own team", "Score", "Show in the sidebar", "Timer", "Show on the boss bar", "When the time is up", "Area", "Rebuild from", "Rebuild now".
- Rules: "Drop from a loot table", "Give from a loot table", "Place a building", "Pick one at random", "Join a team", "Leave the team", "Set a score", "Add to a score", "Start a timer", "Stop a timer", "Rebuild an area", "Set where everyone starts", "Set where this player respawns", "Set the world border", "The player is in the area", "The player is on the team", "The score is at least", "The timer is running", "A player walks into the area", "A player walks out of the area", "The time is up", "The magic block is broken".
- Play and export: "Play my game", "Start over", "Export as a map…", "Keep my player data", "Bring builds from my test worlds".

## Notes from implementation

None yet.
