# ADR 0117: Game modes: flows, Studios, Very easy, Try it and tests

## Context

Every batch since ADR 0101 ships its kinds with Studios, Creator flows with Very easy picks, Try it support, a fixture with parity tests and e2e paths. Today Try it has the grounds grid, flat, quick and world in a 48 x 32 x 48 area. It does not run functions, and its fluids do not flow (fact G18). No flow or tile covers games (G14, G15).

## Decision

- **D1 Studios.** There are six new Studios: World Setup, One Block, Team, Objective, Timer and Area. The Area Studio shows the box over a Try it ground. Each has a Very easy section list. The Structure Studio gains "Chests and containers" (ADR 0116 D4).
- **D2 Flows.** There are eight Creator flows in a new group `games`: Skyblock, One block, Sky islands, Lucky block, Adventure map, Arena game, Race and Goals. Their questions were in the plan's flow table (the flows as built are in the findings below). Islands are drawn by the flow from parameters as structure templates of vanilla block names. New pictures (the lucky block, icons) come from the art generator (ADR 0092).
- **D3 Very easy.** A Home tile "Make a game" offers the eight flows as picks. Labels follow the plan's "Very easy wording" (the plan was deleted at B562; the labels as built are the app's). There are no ids in Very easy.
- **D4 Try it.** There are new grounds:
  - `void`: empty sky, with the world setup's start structure centred and the player on it, holding the kit;
  - `structure`: any project structure template as the ground.

  The sim plays the games kinds from their elements, not from functions (limit M15):
  - the one block refills by phase;
  - areas are outlined and fire enter and leave;
  - timers count on a boss bar or action bar mock-up;
  - objectives on the sidebar show in a sidebar mock-up;
  - team colours show on names;
  - adventure mode stops breaking unless `can_break` allows it;
  - a mock generator refills a broken block with cobblestone after a second when the block touches both a water and a lava prop (vanilla's rule simplified; said once in What happened).
- **D5 Tests.** `fixtures/sample-game-modes` (a Skyblock with a one block, teams, a sidebar objective, a timer, areas with a reset, a lucky block rule book and goals) has:
  - parity tests on both content jars and as vanilla packs (the island once at the first mock join, the kit once, phases, a timer ending its rule, an area reset);
  - e2e `games-path` and `maps-path`;
  - sim-parity scenarios for the one block and areas.
- **D6 Spike first.** B547 answers Y1–Y16 before anything after Wave 0 starts. Its answers can change ADRs 0113–0116, recorded as amendments.
- **D7 Facts and limits.** The plan's facts G1–G22 and limits M1–M16 move into this ADR at the close (B562), with an outcome column.

## Consequences

- Games are made in about a minute in Very easy, and seen in Try it before Play.
- Try it stays single player (limit M14).
- The size budget grows by six Studios. B555 reports `app.asar` and the renderer against the 31 and 17.5 MB stop lines.

## Findings at the close (B562, 2026-11-23)

Reviewed against the merged code of B547–B561 and their follow-ups: B551b (the generated ids in the registry view and the checker), the B557 follow-up (the Creator's Games group, the AI words, the Rules bridge known to the checker), the block_broken fix (ADR 0115), Try it running `team`, `spawnpoint` and `advancement`, and the files `app/src/renderer/src/studios/games/`, `studios/structures/ContainersSection.tsx`, `components/home/tiles.ts`, `components/creator/`, `tryit/grounds.ts`, `tryit/GroundPicker.tsx`, `tryit/games/GamesPanel.tsx`, `packages/sim/src/games/`, `grounds/void.ts`, `grounds/structure.ts`, `commands/vanilla.ts`, the library's eight game starters, `examples/games.ts` and `art/recipes/games.ts`, `packages/ai/src/prompt/games.ts`, `fixtures/sample-game-modes/`, `engine-mod/parity` `SampleGameModesParityTest`, `.github/workflows/ci.yml` and the e2e specs `games-path` and `maps-path`. The close changed only docs and ran no suite; every number is a brief's own, from its DEVLOG entry of 2026-11-22 or 2026-11-23. Reserves B563 and B564 did not run: the function bridge works as hook tags plus one signal command (Y13), and data-only projects play through Play my game from the content jar's data (Y15).

### Each decision's outcome

| Decision | Outcome |
|---|---|
| D1 Studios | Built: six lazy Studios with Very easy sections and no ids in Very easy (`very-easy-no-ids.test.tsx`), each with its live view, all labelled **About right**: World Setup ("How my world starts") the **live world map** of the world preset it lowers to, lowered in memory and laid over the project (never written); One Block "What the block turns into" (each phase's odds and the next 24 breaks from a seed, played as the lowering plays them); Team "How the team looks" (name tag, chat line, player list row); Objective "How the score looks" (the sidebar, list or below-name tag with three example scores in the number format); Timer "How the timer looks" (the boss bar or action bar at any second, and Play in real seconds); Area "Where the area is" (the box **from above and from the side** with each building at its template's size, one that reaches out marked). Changed: the Area Studio draws its own box rather than one over a Try it ground; Try it outlines the area on its games grounds. The Structure Studio has **Chests and containers** (ADR 0116 D4). |
| D2 Flows | Built: eight flows in the group `games`, in this order: Skyblock, One block, Sky islands, Lucky block, Adventure map, Arena game, Race, Goals (82 starters, 70 Creator flows). Islands, the one block's start, the arena and the lucky block's hut are structure templates drawn from vanilla block names; the art generator draws `lucky_block`, `flag` and `timer` (101 recipes). Changed: the Adventure map's checkpoints and the Race's lines use **advancements on `minecraft:location` testing the area's entity tag**, not Rules, so they work in a vanilla data pack; Sky islands' start island is **on** by default (without it the validator warns that players may fall); Skyblock keeps the End as normal; "Islands like the End's" falls back to floating islands (no `endLikeSettings`); only the Lucky block needs the jar (`supports: hasFabric`). Eight game examples (Cloud Farm, Deep Block, Blossom Isles, Star Block, Crystal Road, Four Kingdoms, Canyon Dash, Explorer) and six per-kind examples (215 examples). The Creator shows the Games group after Worlds and a **Map** tab for a world setup whose world is not "As normal"; Make a world's "Empty sky" hands over to Skyblock (ADR 0119's hook). |
| D3 Very easy | Built: Home's heading Games with the tile **Make a game** and its eight picks, each with a sentence. |
| D4 Try it | Built, wider than decided: the grounds **Empty sky** (`void`: the setup's start template centred, its base 8 up, the corner set so `start.at` lands on it) and **One of my buildings** (`structure`). The sim **runs the games kinds' own lowered functions** (limit M15 changed by ADR 0120) with `CommandState.corner`, so absolute positions are the world's; the engine gained `random`, `place template`, and later `team` (with `team=` selectors), `spawnpoint` and `advancement` (with reward functions), so 240 of 248 library and fixture function lines run (the 8 left are `/spreadplayers`). The mock first join runs the setup's own `first_join` function once per ground and after Clear the area; the panel **Your game** shows boss bars, the action bar, the sidebar, Play as, Your team (picking runs `team join`), each magic block's phase and breaks, and each area with "you are in it" and **Rebuild now**. Adventure mode breaks nothing (Try it's items carry no `can_break`), said once. The mock generator turns a cell between a water and a lava prop into cobblestone after 20 ticks, only in a project with games, said once. What the engine cannot run (`bossbar`, `gamemode`, `forceload`, `setworldspawn`, `execute if data`, `data modify`, `item replace`, `loot give`, vanilla mobs, chest loot) is drawn from the elements or said. |
| D5 Tests | Built with one change: `fixtures/sample-game-modes` is made by the library's flows in its golden test (Skyblock, One block moved beside the island, Arena game, Lucky block, plus a hand-made kit, home island area and rule book on the games pieces); `SampleGameModesParityTest` has 7 GameTests, run on the content jar and on the vanilla data pack as a mod of its own (`--no-runtime`), 7 of 7 on both versions; CI exports it, server-checks the jar and the vanilla pack, and runs both parity runs. The tests use the flows' own world positions, since GameTest structures sit millions of blocks out. e2e `games-path` and `maps-path` pass (three runs in a row). **The sim-parity scenarios for the one block and areas were not made**: `fixtures/sim-parity` plays at positions relative to an 8-block GameTest area, while the games functions use absolute world positions; the real-server parity tests and `packages/sim/test/games/` (the real lowering played in the sim) cover them. |
| D6 Spike first | Held: B547 reported on 2026-11-22 before B548 started; its answers are below and amended ADR 0116 (the experimental settings screen and the 26.x player folders) and ADR 0114 (D6 dropped). |
| D7 Facts and limits | Done at this close: below. |

Also: the AI helper's topic `packages/ai/src/prompt/games.ts` (3,463 characters) with its truth test `app/test/ai-prompt-truth.games.test.ts`; the prompt budget of [ADR 0125](0125-ai-helper-clarity.md) D7 rose to 102,000 for it and to 103,000 for the Try it commands, both confirmed at this close; guide pages `game-modes.md` and `maps.md`, with `rules.md`, `playing-and-testing.md`, `structures.md`, `try-it.md`, `creator.md`, `very-easy.md` and `worldgen.md` updated; eight CHANGELOG lines under `[Unreleased]`. Sizes: renderer 18.5 MB of 21 and first paint 4.6 of 6 (the budgets of ADR 0126 D4's amendment; this ADR's stop lines of 31 and 17.5 MB were written before it), `app.asar` 27.0 of 32 MB at B555; the six Studio chunks 3.5 to 18.3 kB, `GamesPanel` 4.8 kB, `ExportMapDialog` 4.7 kB. Runtime 851 GameTests per variant with the new client GameTest; sim 1,386 tests, games 225, rules 523, library 2,350, app 3,618 in 370 files (the briefs' last runs).

### Open items

- The Rule book Studio's pickers for the seven games slot types (ADR 0115 findings).
- Done (b35146b, 2026-11-23): `can_break` and `can_place_on` have the Item Studio's Adventure mode fields (Y16 measured the forms), and the runtime decodes both once data packs are loaded; the 26.3 eject's `VanillaComponents.DELAYED` gained them too (ADR 0127 findings).
- Advancement criteria do not trigger by themselves in Try it, so the Adventure map's checkpoints and the Race's lines need `advancement grant` typed there (a `location` trigger on an area's tag would let them play through).
- A Cloud Realm card in the Showcase now that Skyblock's start island exists (ADR 0118's follow-up).
- The fixture's in-game check (`fixtures/sample-game-modes/README.md`) on 26.3 and 26.4.

## The spike's answers (Y1 to Y16)

Measured by B547 on 2026-11-22 on both targets (26.3 and 26.4-snapshot-7) by GameTests on a dedicated server and client GameTests, signatures by `javap` only; the evidence and exact forms are in [`docs/reference/spikes/b547/README.md`](../reference/spikes/b547/README.md). Both versions behaved the same except where marked.

| # | Question | Answer |
|---|---|---|
| Y1 | `dimension_origin` | `{"type": "minecraft:dimension_origin"}` has no fields (extra keys ignored). One start at chunk 0 0 in every dimension whose generator uses the set: a flat generator must list it in `structure_overrides` (or leave the key out); `[]` skips it. Placed with flat `features: false`. A rigid one-piece jigsaw with absolute `start_height` 64 puts the piece's bottom at y 63, **turned at random** about (0, y, 0). Off with "Generate structures" off. ADR 0114 D2's Advanced route: go. |
| Y2 | Spawn in a void | World spawn with nothing: (8, -64, 8); with the origin island over (0, 0): on its top. A first join into an empty void is placed at (8.5, -64, 8.5) and the tick advancement runs before any fall. With `setworldspawn` and `respawn_radius 0`, a respawn lands at the spawn's x z on the column's highest block, not at its y. |
| Y3 | The function route | `forceload add` then `place template` in the same tick works (forceload loads at once); without a loaded chunk `place template` fails. The storage flag holds across restarts and `/reload` and travels in `data/<ns>/command_storage.dat`. |
| Y4 | First join, once | A `minecraft:tick` advancement with a reward function runs on the player's first tick, after placing, as the player; once across death, respawn and rejoin; a map without `players/` gives it again. |
| Y5 | Void Nether and End | A flat, layer-less `the_end` keeps the dragon fight, the exit portal, the egg and a gateway; pillars need the End biome's features (check in game). Frames with all 12 eyes set do not light; 11 set plus one placed by a player do. A void Nether gets a portal and platform from the game. |
| Y6 | Empty flat worlds | `layers: []` decodes. `the_void` adds its stone platform at (8, minY + 3, 8); a project biome without features is clean. A flat world of only empty or air layers runs none of its biome's features. |
| Y7 | Mobs on a platform | `the_void`: nothing spawns. Plains-like monster lists: 61 to 70 monsters in 1,200 night ticks on a 33 by 33 platform; no animals after generation; phantoms rare; wandering traders not measured. |
| Y8 | `fixed_placement` | Positions are absolute `[x, y, z]`; 26.4 refuses `[]` (the pack fails); places nothing in a void world (Y6). ADR 0114 D6: no-go in void worlds. |
| Y9 | One block | About +0.3 ms a tick per position with drops cleared; a chest with `LootTable` drops its loot when broken. |
| Y10 | Teams, objectives, boss bars | Every form in the spike's README accepted on both versions; `worldborder set <w> <n>` is ticks, `<n>s` seconds. The offline function checker threw on `#holder` scores and named random sequences (fixed 2026-11-22). |
| Y11 | Areas | `location_check` (26.x `type` key) needs `execute as … at @s if predicate`; bounds inclusive on exact coordinates. 64 areas and 20 markers: predicates +2.0 to 2.4 ms a tick, the `dx` selector +0.7 to 0.9. |
| Y12 | Area reset | `place template` places 48-cubed and larger templates and is not bound by `max_block_modifications` (`clone` is, 32,768); kill the box's entities first. Found on the way: MSM's exported structure templates placed as air on 26.x (fixed 2026-11-22). |
| Y13 | The function bridge | A data pack function running a project command works at load, after `/reload`, as the player and from the server. ADR 0115 D5: go; B563 not needed. |
| Y14 | Maps | A copied world's `datapacks/` pack is enabled on open; every world with its own world type shows the "experimental settings" screen when opened; `resources.zip` had no effect through `WorldOpenFlows.openWorld` and the `.mrpack` route was not reachable (both in-game checks). 26.x keeps players under `players/data`, `players/advancements`, `players/stats`. Structure-block saves: `<world>/generated/<ns>/structure/<path>.nbt` (a redstone pulse does not save). |
| Y15 | Play my game | `createFreshLevel` with a preset from mod data works; a folder pack placed in `saves/<world>/datapacks/` first is enabled at creation and its preset is in the registry. ADR 0116 D1 for data-only projects: go; B564 not needed. The language key of a world type: `generator.<ns>.<path>`. |
| Y16 | Adventure mode | `can_break` and `can_place_on` as one predicate or a list, by `/give`, `item replace` and loot `set_components`, work in adventure; the old `{predicates: [...]}` form is refused. 26.x loot tables use `modifier` and `condition` with `type`. |

## Fact table (G1 to G22)

Moved here from the plan at its close. The facts are as at 9ce013f, when the plan was written (2026-11-22, no game jar opened); what changed by the close: G2 the games plugin has four world setup templates (void, flat, floating islands, adventure in the normal world) and eight piece templates; G6 the Structure Studio edits chests (ADR 0116 D4); G7 the overlay gives `dimension_origin` a form (ADR 0114 D2); G11 Rules count 66 triggers, 62 steps, 25 conditions, 17 values with the games entries (ADR 0115); G14 and G15 eight game flows, the Home heading Games and the tile Make a game, `CreatorGroup` `games`; G16 Play my game opens the project's own world type and Reload works there (ADR 0116 D1); G17 maps export as a world zip or `.mrpack` (ADR 0116 D2); G18 Try it has the grounds Empty sky and One of my buildings and runs functions (ADR 0120, D4 above).

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

## Limits (M1 to M16) and their outcome

Moved here from the plan at its close; the guide's `game-modes.md` and `maps.md` and the AI helper's topic file say them in plain words.

| # | Limit | Why | What users see | Outcome at the close |
|---|---|---|---|---|
| M1 | **Rules and lucky blocks need the Fabric mod jar.** | Rules run in the runtime (G13); vanilla packs cannot add blocks. | Info on vanilla pack exports, as today. | Stands. The Lucky block flow is offered only with the jar; a vanilla data pack keeps the bridge functions, which the game drops at load. |
| M2 | **A world type in a vanilla data pack is offered only when the pack is added at world creation.** | Vanilla reads world presets from the packs chosen on the Create World screen. | The guide says how; the map export ships a world already made. | Stands; Play my game and the map export do it for the user. |
| M3 | **The start structure is placed at the first join, by a function** (default; the worldgen route by Y1 is Advanced). | Works with "Generate structures" off and in old worlds. | A short moment of void before the island appears. | Stands, without the moment of void: the first-join function runs before any fall (Y2). The Advanced route is built and warns that the game turns the piece at random. |
| M4 | **One start structure piece is at most 48 blocks per axis.** | Vanilla's structure block limit (G5). | Larger islands are a jigsaw of pieces. | Stands as the first-join route's forceloaded 48 by 48 square (`START_AREA`), checked by the validator; `place template` itself places larger templates (Y12). |
| M5 | **Vanilla lava and water make what they make.** | No data for it. | Custom generators use a liquid of the project's own (ADR 0108). | Stands: the Skyblock flow's "A generator of my own". |
| M6 | **One block: up to four positions per world.** | A tick test per position (Y9 cost). | More are refused. | Stands (`MAX_ONE_BLOCKS`, about 0.3 ms a tick each). |
| M7 | **Teams and objectives are made when the world loads and never removed by MSM.** | Vanilla keeps them in the world's scoreboard. | Renaming one leaves the old one in old worlds. | Stands; the Studios say so. The planned "remove old" line is not offered yet (follow-up). |
| M8 | **Areas are boxes.** | `location_check` position ranges. | No round or shaped areas. | Stands. |
| M9 | **Timers tick in whole seconds.** | One scoreboard step a second (ADR 0113 D6). | No tenths. | Stands (1 to 86,400 seconds). |
| M10 | **Rules counters and scoreboard objectives are different things.** | Counters are script data (G12). | The sidebar shows objectives only. | Stands; the score steps of ADR 0115 reach objectives. |
| M11 | **Map export copies a world as it is** and leaves out player data, advancements and statistics. | A map starts fresh for each player (ADR 0116 D2). | The author's inventory is not in the map. | Stands with 26.x's `players/` folders (Y14); `session.lock` and the dev data pack always out. Open: a singleplayer `level.dat` may carry the author's player (in-game check). |
| M12 | **A map that needs the jar ships as a modpack.** | Vanilla worlds cannot carry mods. | One `.mrpack` with the world inside. | Stands; the `.mrpack` carries the jar only. Prism's and the Modrinth app's import of `overrides/saves/` is an in-game check. |
| M13 | **Play my game is one world per project and target.** | As the test world (ADR 0084). | Start over renames the old one. | Stands. |
| M14 | **Try it is single player and 48 x 32 x 48.** | ADR 0085. | Teams and scores shown for the one player; larger islands cut at the edge. | Stands; the player's team is picked in the panel or joined by a function's `team join`. |
| M15 | **Try it runs the games' functions through the sim's function engine.** | Since Live views 2 (ADR 0120) Try it runs functions; commands it cannot run are said. | A command the engine does not know is named as "only in the game". | Stands as rewritten at B618; 240 of 248 library and fixture lines run since `team`, `spawnpoint` and `advancement` joined the engine. |
| M16 | **Builds come from the game.** | No block editor in the app. | Build, save with a structure block, bring it in. | Stands: Import Structure… > **From my test worlds**. |

## Status

Accepted with findings (2026-11-23, close B562; briefs B547–B561 with B551b and the follow-ups above; reserves B563 and B564 not run; the plan `docs/PLAN-game-modes.md` deleted, its fact table, spike answers and limits above). Vetoable defaults:

- the eight flows and their order;
- the `games` group and the Home tile's label "Make a game";
- the mock generator in Try it;
- checkpoints and race lines by advancements rather than Rules;
- Sky islands' start island on by default;
- the Area Studio's own box from above and the side rather than over a Try it ground;
- no sim-parity scenarios for the games pieces (the real-server parity tests instead);
- the AI helper's prompt budget at 103,000 characters (ADR 0125 D7).

Amendment (B728, ADR 0132 D10, 2026-11-25): limit M14 now reads: Try it is 48 x 32 x 48, with you and up to seven practice players. Practice players stand in as players: selectors (`@p`, `@r`, `@e` skip the dead, `@a` does not), scores, their own items, game modes, hits and knock-outs with the kill scores and the killer's advancements, `execute on attacker`, walking and falling; a round script per game type plays a round (Watch a round in Try it, the Game tab's live view). They have no client: no looking, swinging, picking up, weapon or armour damage, fall damage or hunger; scripts and Rules see only your own player; they are drawn as outlines. Larger arenas are cut at the edge; outside the area's columns a practice player stands where it is; the area's floor holds them as it holds you.
