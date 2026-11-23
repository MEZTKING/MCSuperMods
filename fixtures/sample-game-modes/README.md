# Sample game modes project

A game made with the library's game flows (ADRs 0113 to 0117, accepted with findings at B562; B559), namespace `msm_sample_game_modes`: a Skyblock with a one block beside its island, two teams, points on the sidebar, a round timer, two areas with a reset, a lucky block with its rule book, a rule book on the games pieces, and goals. It works on **26.3** and on **26.4**, as the Fabric mod jar and, without the lucky block and the rules, as a vanilla data pack. Nothing in the folder is a Mojang file: the island, the arena and the hut are drawn by the flows from vanilla blocks named by id, and the lucky block's picture by MSM's art generator.

`packages/exporters/test/sample-game-modes.golden.test.ts` builds the project from the flows (`libraryStarters`: Skyblock with its default answers, One block with 10 breaks a phase, Arena game and Lucky block with their defaults) plus the hand-made changes below, and checks on every run: the folder equals that project (`UPDATE_GOLDENS=1` rewrites it; this README is the one file written by hand), every element validates with zero problems, the project expands with none and the validators report nothing above info, both rule books become scripts and the arena book lowers the function bridge (B553: the command `msm_signal_msm_sample_game_modes` and three functions), the content jar exports with zero problems (SHA-256 pinned per target), the vanilla data pack keeps every games function and only the lucky block's recipe is left out by the vanilla pack safety rule, and the resource pack holds nothing of the rules. With `MSM_RUNTIME_JAR` and `MSM_SAMPLE_GAME_MODES_OUT` it also writes `msm_sample_game_modes.jar` with `fabric-facts.json`, the vanilla data pack `msm_sample_game_modes.zip` with `packs.json`, and `msm_sample_game_modes_pack.jar` (that data pack as a Fabric mod of its own, without the bridge's three functions, which the game drops at load anyway).

CI (`.github/workflows/ci.yml`, job `engine-mod`, both versions): the export; a headless Fabric server with the content jar (`registered 1 block(s) and 1 item(s) from 2 definition file(s)`, `registered 1 command(s)`, `loaded 2 script(s); 0 error(s)`); the vanilla data pack on a vanilla server (`tools/run-fabric-server/vanilla-packs.ts`: it loads, with exactly the bridge's three functions failing to load); and the parity GameTests `SampleGameModesParityTest` (filter `msm_parity_tests:sample_game_modes_*`, 7 tests) on the content jar and on the vanilla data pack as a mod (`--no-runtime`). There is no Java project eject run: games are data pack files.

## Contents

| Element | Kind | Made by | What it is |
|---|---|---|---|
| `sky_survival` | world setup | Skyblock | the World Type **Sky Survival** (void); the start island placed once at the first player's first join with its corner at 0 64 0, the world spawn on its grass at 5 67 3; survival, normal difficulty, spawn radius 0; each new player gets a welcome, 10 seconds of slow falling and, **added for the fixture**, three bread, once; the goals tab named in the welcome |
| `sky_survival/island` | structure template | Skyblock | the classic corner island (an L of grass on dirt, an oak, a chest naming the loot table below) |
| `sky_survival/start_chest` | loot table | Skyblock | a lava bucket, two ice, three wheat seeds, an oak sapling, four bone meal |
| `wandering_trader/sky_survival_*`, `minecraft:wandering_trader/common` | villager trades, trade tag | Skyblock | sand, red sand, two saplings, sugar cane and pumpkin seeds for an emerald each, added to the wandering trader's common trades |
| `sky_survival/gravel_from_cobblestone`, `sand_from_gravel` | recipes | Skyblock | what the sky lacks |
| `sky_survival/goals/*` | advancements | Skyblock (the Goals flow's tab) | Sky Survival: get wood, cobblestone, a furnace, iron, visit the Nether |
| `one_block/magic_block` | one block | One block, **moved** | at 12 66 4, beside the island in the sky (the flow's own world setup and start are left out: a project has one world setup); six phases of 10 breaks, chests and mobs now and then, the phase's name in chat, looping |
| `arena/red`, `arena/blue` | teams | Arena game | red and blue names with a `[Red] ` or `[Blue] ` prefix, no friendly fire |
| `arena/points` | objective | Arena game | **Defeats** (`playerKillCount`) on the sidebar |
| `arena/round` | timer | Arena game | five minutes counting down on a red boss bar; its end runs `arena/round_end` |
| `arena/arena_build`, `arena/arena` | structure template, area | Arena game | a 24 by 24 stone brick arena with low mossy walls and lanterns at height 100 (from -12 100 -12 to 11 104 11); the area's reset clears mobs and items and builds it again |
| `arena/start`, `arena/round_end` | functions | Arena game | start a round (`/function msm_sample_game_modes:arena/start`): teams at random, points to 0, the arena rebuilt, everyone in with a sword, a shield and bread, the timer started; at the end the title "Round over", the winners named, the arena rebuilt |
| `sky_survival/home_island` | area | **hand-made** | the island's box (0 64 0 to 9 72 9); its reset clears mobs and items and places the island again |
| `lucky_block`, `block/lucky_block`, `lucky_block_from_gold`, `lucky_block/prizes`, `lucky_block/surprise_hut`, `lucky_block_rules`, `mod` | block, model, recipe, loot table, structure template, rule book, mod | Lucky block | the drawn lucky block (eight gold ingots round a chest); breaking it picks one outcome by weight: prizes (often), a zombie (sometimes), an explosion that breaks nothing (rarely), the hut (sometimes), Speed for 30 seconds (sometimes) |
| `arena_rules` | rule book | **hand-made** | **Players who walk into the arena join the red team** (`area_entered`); **Everyone gets a point when the round ends** (`timer_ended`); **Say so when the one block goes underground** (`one_block_broken` in phase 2: "Underground at last!" to every player) |

The games pieces lower to plain data pack files (ADR 0113 D9): the functions `msm_sample_game_modes:msm_games/...` from the plugin's own `load` and `tick` tags, the scoreboard holders `#one_block.magic_block.phase` and `.breaks` on `msm_sample_game_modes.msm_one_block`, `#arena.round` and `#arena.round.on` on `msm_sample_game_modes.msm_timers`, and the area tags `msm_sample_game_modes.area.arena.arena` and `msm_sample_game_modes.area.sky_survival.home_island`. The rule books need the Fabric mod jar export (`arena_rules` through the function bridge's command).

## Parity GameTests

`engine-mod/parity/src/main/java/dev/mcsupermods/parity/SampleGameModesParityTest.java`, 7 tests, each on the content jar and on the vanilla data pack (the run knows which by the lucky block's registration). The games functions use world positions, so the tests read and write the fixture's own positions through commands (the GameTest structures are millions of blocks away), keep chunks -1 to 0 force-loaded, and let each mock player's first join run before it acts.

| Test | Content jar | Vanilla data pack |
|---|---|---|
| `the_game_is_set_up_when_the_world_loads` | the World Type and sky biome registered, the world start's flag, normal difficulty, the goals tab, both teams (colour, prefix, no friendly fire), **Defeats** on the sidebar, the round's boss bar (300) | the same |
| `the_island_is_placed_once_and_the_kit_given_once` | after the first join: the island, its chest naming its loot table, the world spawn 5 67 3, three bread and slow falling once (still three 20 ticks later); a second player gets the kit but the island is not placed again (a grass block taken away stays away); on the island that player is tagged by the home island area, whose reset places the island again and removes a pig | the same |
| `the_one_block_refills_through_its_phases` | 20 breaks by a player, each refilled from its phase (Plains, then Underground, or a chest), the phase holder at 2, "Underground" and "Deep dark" said once each, "Underground at last!" on each of the 10 breaks of the second phase | the same, with no "Underground at last!" |
| `the_round_timer_ends_and_runs_its_end` | started by its function, the boss bar shown at 300, the holder set to 2 seconds, ended: the bar hidden, the title "Round over", the arena rebuilt by `round_end`, one point for the player from the rule book | the same, with no point |
| `the_arena_is_entered_and_reset` | the reset builds the arena; a player walking in is tagged and put on red by the rule book, walking out untagged; a dirt block and a pig left in it are removed by the next reset, the player is not | the same, with no team |
| `a_kill_scores_on_the_sidebar` | a player defeating another gets one point on **Defeats** | the same |
| `the_lucky_block_rule_fires_in_the_jar_only` | 30 breaks by a player, each with exactly one outcome (prizes, a zombie, an explosion packet, the hut's floor with its corner where the block stood, Speed), the prizes at least once | the lucky block's item is not registered and the bridge's functions are absent |

## In-game check (Windows, Minecraft Java 26.3 and 26.4)

Do the list once per version, with the content jar; then part 3 once with the vanilla data pack.

- **26.3:** the 26.3 content jar, Fabric Loader 0.20.1 or newer and Fabric API 0.165.2+26.3 (or newer for 26.3).
- **26.4:** the 26.4 content jar (the app exports it when the project target is 26.4), Fabric Loader 0.20.1 and Fabric API 0.165.4+26.4. The jar contains `msm_runtime`; do not install it separately.

Get the jar from the latest CI run (Actions, CI, the run, Artifacts, `msm-sample-game-modes-mc<version>`, which also holds the vanilla data pack zip) or from the app: copy this folder outside the repository, open it in MCSuperMods, choose the target and export the Fabric mod jar. Install it with Prism Launcher as `fixtures/sample-mod/README.md` describes. Or use **Play my game** in the app (ADR 0116), which makes the world `msm-game-msm_sample_game_modes` of this World Type for you; then skip the first row.

### Part 1: the Skyblock and the one block (survival)

| Check | Expected |
|---|---|
| Create New World, **More**, **World Type** | **Sky Survival** is listed; choose it, survival, cheats on. Opening the world again later shows the "experimental settings" screen (a world type of a data pack); choose to go on |
| The first join | You stand on the island's grass with the oak behind you, in empty sky; "Welcome to Sky Survival! Everything you need is in the chest. Do not fall!", then the goals line; slow falling for 10 seconds; three bread in your inventory |
| The chest | A lava bucket, two ice, three wheat seeds, an oak sapling, four bone meal; it fills only the first time it is opened |
| **Advancements** (L) | A **Sky Survival** tab; getting wood ticks its first goal |
| Leave and join again, or a second player joins | No second island, no second kit for you; a new player gets the welcome and the bread once and spawns on the island |
| The one block at 12 66 4 (level with the grass, five blocks east of the island) | A plains block (grass, dirt, oak log, leaves or a melon) floating in the sky; break it: a new one appears at once; now and then a chest of village loot, or a cow, sheep, chicken or pig on top |
| After 10 breaks | "Underground" in chat, and, with the jar, "Underground at last!" after each break of this phase; stone and ores now; after 10 more "Deep dark" |
| `/function msm_sample_game_modes:msm_games/area/sky_survival/home_island/reset` | The island is put back as it was at the start (the chest refills once more); mobs and dropped items on it are gone, you are not |
| The cobblestone generator | Lava and water from the chest make cobblestone; `cobblestone` crafts into gravel, gravel into sand |
| A wandering trader (`/summon minecraft:wandering_trader ~ ~ ~`) | Among its trades, sometimes, sand, red sand, saplings, sugar cane or pumpkin seeds for an emerald (a trade from the tag is a candidate, not a certainty) |

### Part 2: the arena, the teams and the timer (two players if you can)

| Check | Expected |
|---|---|
| `/function msm_sample_game_modes:arena/start` | Everyone goes on red or blue (coloured names, `[Red] ` or `[Blue] `), the arena is built at height 100 above the spawn and everyone is sent into its middle with an iron sword, a shield and eight bread; "Fight!"; a red **Round** boss bar counting down from 300 |
| The sidebar | **Defeats**, with each player's points; defeating another player adds one |
| Team mates | Cannot hurt each other |
| Walking into the arena (with the jar) | You join the red team (rule book `arena_rules`) |
| `/scoreboard players set #arena.round msm_sample_game_modes.msm_timers 3` | Three seconds later: the boss bar goes, the title **Round over**, players with 5 or more defeats are named, the arena is rebuilt (blocks you placed in it are gone); with the jar, everyone's points go up by one |
| Breaking the arena's floor, then `/function msm_sample_game_modes:msm_games/area/arena/arena/reset` | The floor is back, mobs and items in the arena are gone |

### Part 3: the lucky block (content jar only) and the vanilla data pack

| Check | Expected |
|---|---|
| `/give @s msm_sample_game_modes:lucky_block`, place it and break it, several times | Each break does one thing: prizes (iron, gold, a diamond, a golden apple, an ender pearl or cookies), a zombie, a small explosion that breaks no blocks, Speed for 30 seconds, or a cobblestone hut with a crafting table and a torch. **Look closely at the hut:** its whole floor is there, the corner where the lucky block stood included (the parity test found that corner missing; since the fix the rule places the hut a tick after the break). Report any gap |
| Eight gold ingots round a chest | Craft one lucky block |
| The vanilla data pack zip (from the artefact or the app's vanilla data pack export) in a new world's `datapacks/` folder, no mods | The world loads; Part 1 and Part 2 work the same, without "Underground at last!", without joining red on entering the arena and without the point at the round's end; no lucky block. `logs/latest.log` names three functions `msm_sample_game_modes:msm_rules/signal/...` that failed to load: expected, they call the mod jar's command (ADR 0115 D5) |
| The vanilla pack as a World Type | Create New World only lists **Sky Survival** when the pack is added on the Create New World screen's data pack list before the world is made (limit M2) |
