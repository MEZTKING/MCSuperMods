# Sample script project

A scripting sample for the Fabric content jar (ADRs 0031 and 0032), namespace `msm_sample_script`: an `msm:mod`, one block and one item copied from `fixtures/sample-mod` and renamed, a plain `warded_stone` block whose use a script cancels (ADR 0058), one script for each of the nine game events of the script API, an action handler that the block's `run_script` action calls, a `util` module that two scripts load with `require("./util")`, and (since ADR 0055) a status effect whose `msm:on_tick` event runs a second action handler, the script tick hook. Since ADR 0058 `on_entity_interact` tags the entity used with `Entity.runCommand` and `on_block_interact` places a sea lantern on the spark ore with `World.runCommand` at the ore's position. Since ADR 0062 two scripts keep saved data: `kill_counter` counts each player's kills in `player.data` and everyone's in `msm.storage` and tells the player both, and `start_counter` counts the world's starts in `msm.storage`. Since ADR 0065 (Script API 1.1, B255) chat commands starting with `!` show the new API (`!help` lists them; `on_player_chat` cancels every `!` message so nobody else sees it): `!kit` (inventory and item components), `!train` (experience, food, game mode), `!title` and `!clear` (titles and the action bar), `!bar`, `!bar who` and `!bar off` (a boss bar), `!look` (a raycast), `!smite` (typed damage with the player as the attacker) and `!nether` (a cross-dimension teleport); `crown_zombie` reads and sets a zombie's equipment; and one script per new event: `on_player_tick` (Luck for a player in a golden helmet, every 20 ticks), `on_player_respawn`, `on_player_leave`, `on_player_change_dimension`, `on_entity_damaged` (the damage after armour) and `on_player_chat`. The event scripts log with `msm.log.info`, so the server log shows what ran.

`packages/exporters/test/sample-script.golden.test.ts` checks it on every run:

- the folder equals the elements listed in the test saved as a project (it fails when the list changes and this folder is not regenerated);
- every element validates with zero problems, the project validators report nothing (the `run_script` handler is defined by a script), and every script parses and type-checks against the generated `msm-runtime.d.ts`;
- the content jar exports with zero problems (a stub runtime jar and the real TypeScript transpiler with the options of ADR 0031 D2), and its SHA-256 is pinned per target, built in two time zones;
- the jar holds the four definitions (two blocks, an item, an effect) and the twenty-eight scripts as `msm/msm_sample_script/script/*.js` (no `.ts`), each parsing as ES5 with no `class`, `async`, `let`, `const`, arrow or `for...of` tokens, and `fabric.mod.json` depends on `msm_runtime`.

CI's `engine-mod` job then exports this project with the real runtime nested and starts a headless Fabric dedicated server with it (`tools/run-fabric-server`). The server must log

```
[msm_runtime] registered 0 sound event(s)
[msm_runtime] registered 2 block(s) and 3 item(s) from 4 definition file(s); 0 error(s), 0 warning(s)
[msm_runtime] registered 0 entity type(s) and 1 mob effect(s)
[msm_runtime] loaded 28 script(s); 0 error(s)
```

and nothing from the runtime at warning or error level (28 scripts loaded with no error is the check that the effect's tick handler is loaded). A headless server has no players or mobs with the effect, so of the event scripts only `server.started` and `server.tick` run there; their lines appear after `Done`. The server is started twice on the same world (`--runs 2`): the first start must log `[msm_runtime] msm_sample_script:start_counter: start counter: 1` and the second `start counter: 2`, which proves `msm.storage` is saved with the world and read back after a restart. The jar is kept as the workflow artefact `msm-sample-script`. Scripts are not part of the Java project export, so this sample has one parity run, on the content jar only (ADR 0058 D4): `SampleScriptParityTest` in `engine-mod/parity/` (`tools/run-fabric-server --gametest ... --gametest-filter 'msm_parity_tests:sample_script_*'`) checks, through vanilla and Fabric API only, that using a pig tags that pig (and not the player or another pig) with `msm_sample_touched`; that using the spark ore puts a sea lantern on top of it (not at the world spawn point); and that using the warded stone with five oak doors is refused, places nothing, keeps the five doors, and sends the player its inventory and block updates for the six neighbours of the placement position (read from the packets of a listening player, `ParityEars`), while the same use of stone places a door and sends neither; and (ADR 0062) that a player who kills three pigs is told `Your kills: 1`, `2` and `3`, with the world total going up by one each time, the third kill after a real `/reload` (in a test environment of its own), so `player.data` and `msm.storage` are set, read back and kept across a reload. Since B255 it also checks every Script API 1.1 behaviour (ADR 0065), saying the `!` commands as the network handler does (`ParityEars.chat`) and reading the packets the client is sent: a `!` command does not reach another player while plain chat does; `!kit` pays two diamonds for a "Spark Blade" diamond sword with 7 damage in slot 0, a golden helmet and a shield, answers `Kit: Spark Blade (1554/1561), named "Spark Blade"; paid 2 diamonds, 3 left, the first in slot 9.` and refuses a third kit without diamonds; using a zombie with an iron sword names the sword and crowns it with a golden helmet; `!train` sets level 3, 5 points, food 10, saturation 2 and adventure mode, the game mode packet at once and the experience and food packets on the player's next tick (a test player is not ticked by the server, so the test calls `doTick`); `!title` sends times 5, 40, 10, the subtitle, the title and the action bar, `!clear` the clear packet; `!bar` shows the yellow, notched "Spark charge" bar and fills it, a respawned player is sent the bar again (remove, then add at the same progress) and gets later updates, `!bar who` still names one player, and once that player leaves (another player is told `<name> has left.`) it names none, and the last `!bar off` removes the bar; `!look` finds the stone's west face 2.5 blocks away, a zombie, and nothing upwards; `!smite` at a breeze kills it with magic damage caused by the player (kill credit, a breeze rod from the player-kill pool, the kill counter's line), and at the sky answers `Nothing to smite.`; `!nether` takes the player and a cow beside it to an obsidian floor in the Nether and both events' lines are sent; a player in a golden helmet gets Luck within 45 ticks and one in an iron helmet does not; a zombie in a diamond chestplate hit for 10 reports the reduced damage and its health to the attacker (`entity.damaged`). Fifteen tests; a run on a jar without the fourteen new scripts fails the eleven new ones. CI runs it for every Minecraft version as the fifth parity run; the report is in the artefact `parity-gametest-reports`.

## Contents

| Element | Kind | What it shows |
|---|---|---|
| `msm_sample_script:mod` | mod metadata | `fabric.mod.json`: id `msm_sample_script`, version 1.0.0, MIT |
| `msm_sample_script:spark_ore` | block | the sample mod's ruby ore, renamed: `msm:breakable` (pickaxe, iron tier), light 7, `msm:on_interact` firing `msm_sample_script:spark`, whose actions are `play_sound` and `run_script` with handler `msm_sample_script:spark`; drops itself |
| `msm_sample_script:warded_stone` | block | a plain block (obsidian look, pickaxe, Building Blocks tab) whose use `on_block_interact` cancels; drops itself |
| `msm_sample_script:spark_gem` | item | the sample mod's ruby, renamed: uncommon, Ingredients tab |
| `msm_sample_script:util` | script | exports `MOD` and `id(path)`; logs `util loaded` once, however many scripts load it |
| `msm_sample_script:on_block_interact` | script | `block.interact`: logs a main-hand use of the spark ore and places a sea lantern on it with `World.runCommand(..., e.block.pos)`; cancels a use of the warded stone |
| `msm_sample_script:on_block_break` | script | `block.break`: logs breaking the spark ore |
| `msm_sample_script:on_item_use` | script | `item.use`: logs using a spark gem |
| `msm_sample_script:on_entity_interact` | script | `entity.interact`: logs a main-hand use of any entity and tags it with `Entity.runCommand("tag @s add msm_sample_touched")` |
| `msm_sample_script:on_entity_hurt` | script | `entity.hurt`: logs a player hurting an entity that is not a player |
| `msm_sample_script:on_entity_death` | script | `entity.death`: logs a player killing an entity that is not a player |
| `msm_sample_script:on_player_join` | script | `player.join`: sends the player a chat message and logs the join |
| `msm_sample_script:on_server_started` | script | `server.started`: logs the runtime version and dimension; uses `id()` from `./util` |
| `msm_sample_script:on_server_tick` | script | `server.tick`: logs the first tick only |
| `msm_sample_script:spark_surge` | effect | beneficial, colour `#55FFFF`, no icon (the missing-texture icon shows); `msm:on_tick` every 40 ticks fires `msm_sample_script:surge`, whose one action is `run_script` with handler `msm_sample_script:surge` |
| `msm_sample_script:surge_handler` | script | `msm.actions.define("msm_sample_script:surge", ...)`: reads the holder (`e.other`) and its `effectLevel`, logs them and heals the holder by the level when hurt |
| `msm_sample_script:kill_counter` | script | `entity.death`: a kill by a player adds one to `kills` in that player's `player.data` and to `total_kills` in `msm.storage`, and sends `Your kills: <k>. Everyone's: <t>.` |
| `msm_sample_script:start_counter` | script | `server.started`: adds one to `starts` in `msm.storage` and logs `start counter: <n>` |
| `msm_sample_script:on_player_chat` | script | `player.chat`: cancels every message starting with `!` (a sample command), so it is not broadcast; answers `!help` and an unknown command with the list |
| `msm_sample_script:kit_command` | script | `!kit`: takes two diamonds (`inventory.count`, `remove`, `find`), puts a diamond sword named "Spark Blade" with 7 damage in slot 0 (`set` with an item spec, `setComponent`), a golden helmet on the head and a shield in the off hand, and reads them back (`get`, `name`, `damage`, `maxDamage`, `getComponent`) |
| `msm_sample_script:train_command` | script | `!train`: three levels and five points of experience, food 10 with saturation 2, adventure mode |
| `msm_sample_script:title_command` | script | `!title`: the title "Spark!" with the subtitle "Sample script" (in 5, stay 40, out 10 ticks) and the action bar "Sparks: ready"; `!clear` clears the title |
| `msm_sample_script:spark_bar` | script | `!bar`: shows the yellow "Spark charge" boss bar (10 notches) and fills it by a quarter; `!bar who` names who sees it; `!bar off` hides it and removes the bar when nobody sees it |
| `msm_sample_script:look_command` | script | `!look`: what you look at within 16 blocks (`Entity.raycast`): a block and its face, a mob, or nothing, with the distance |
| `msm_sample_script:smite_command` | script | `!smite`: 1000 magic damage with you as the attacker to the mob you look at, so the kill is yours |
| `msm_sample_script:nether_command` | script | `!nether`: builds a 3 by 3 obsidian floor with air above at the matching Nether coordinates (`msm.getWorld`, `setBlock`) and teleports you and every cow within 4 blocks there |
| `msm_sample_script:crown_zombie` | script | `entity.interact` on a zombie: says what it holds (`equipment`) and puts a golden helmet on a bare head (`setEquipment`) |
| `msm_sample_script:on_player_tick` | script | `player.tick` every 20 ticks: a player wearing a golden helmet gets Luck for 5 seconds |
| `msm_sample_script:on_player_respawn` | script | `player.respawn`: `Welcome back, <name>.` |
| `msm_sample_script:on_player_leave` | script | `player.leave`: tells the other players `<name> has left.` |
| `msm_sample_script:on_player_change_dimension` | script | `player.changeDimension`: `You went from <from> to <to>.` |
| `msm_sample_script:on_entity_damaged` | script | `entity.damaged`: tells the attacking player the damage after armour, its type and the health left |
| `msm_sample_script:spark_handler` | script | `msm.actions.define("msm_sample_script:spark", ...)`: logs the call and gives the player one spark gem; uses `id()` from `./util` |

All content is original work written for MCSuperMods; the project contains no Mojang files.

## In-game check (Windows, Minecraft Java 26.3)

You need the content jar, Fabric Loader 0.20.1 or newer for 26.3, and Fabric API 0.165.2+26.3 (or newer for 26.3). The jar contains `msm_runtime`; do not install the runtime separately.

**Get the jar**, either way:

- from the latest CI run: Actions → CI → the run → Artifacts → `msm-sample-script`, unzip to get `msm_sample_script.jar`; or
- from the app: copy this folder outside the repository, open it in MCSuperMods and export the Fabric mod jar (runtime nested, the default).

**Install it** as described in `fixtures/sample-mod/README.md` (Prism Launcher or the official launcher), with `msm_sample_script.jar` in place of `msm_sample_mod.jar`, and keep the game log open (Prism: the instance's **Minecraft Log**; official launcher: `%APPDATA%\.minecraft\logs\latest.log`, reopened after each step). Every script line in the log starts `[msm_runtime] msm_sample_script:<script>:`.

Create a new **Creative** world with cheats on, then check:

| Do this | Expected in chat or the game | Expected in the log |
|---|---|---|
| Start the world | Chat: `MSM Sample Script is loaded. Use the spark ore.` | `util loaded` (once), `loaded 28 script(s); 0 error(s)`, `server.started: runtime 0.5.0 in minecraft:overworld, handler msm_sample_script:spark`, `server.tick: first tick <n>`, `start counter: 1` (a new world), `player.join: <your name>` |
| Place Spark Ore (Natural Blocks tab) and right-click it | An amethyst chime; one Spark Gem in your inventory; a sea lantern appears on top of the ore (not at the world spawn) | `block.interact: <name> used spark ore at <pos>`, then `action msm_sample_script:spark: msm_sample_script:spark_ore msm_sample_script:spark at <pos>` |
| Right-click with a Spark Gem (Ingredients tab) | Nothing visible | `item.use: <name> used <count> spark gem(s)` |
| `/summon minecraft:pig ~ ~ ~2` and right-click the pig, then `/tag @e[type=pig,limit=1,sort=nearest] list` | The tag list names `msm_sample_touched` (and you have no such tag: `/tag @s list`) | `entity.interact: <name> used minecraft:pig` |
| Hit the pig (switch to Survival: `/gamemode survival`) | The pig is hurt | `entity.hurt: minecraft:pig took <amount> from <name>` |
| Kill the pig | The pig dies; chat: `Your kills: 1. Everyone's: 1.` | `entity.death: <name> killed minecraft:pig` |
| Kill two more pigs, one before and one after `/reload` | `Your kills: 2. ...` then `Your kills: 3. Everyone's: 3.` | |
| Die (`/kill @s`), respawn, kill a pig; go through a Nether portal and kill a pig or another mob there | The count goes on from where it was (4, then 5): `player.data` stays with the player | |
| Quit to the title screen, open the world again and kill a pig | The count goes on (6); the log has `start counter: 2` | `start counter: 2` |
| Mine the Spark Ore with an iron pickaxe (Survival) | It drops itself | `block.break: <name> broke spark ore at <pos>` |
| `/effect give @s msm_sample_script:spark_surge 30 1`, then `/damage @s 4` (Survival) | The effect shows (missing-texture icon, no icon was painted); health comes back two points every two seconds | `action surge: minecraft:player at level 2, health <health>` every 40 ticks while it runs |
| Place Warded Stone (Building Blocks tab), switch to **Survival**, hold 5 oak doors and right-click its top | **No door appears, not even for a moment** (no ghost door that vanishes), and you still hold 5 doors | `block.interact: <name> was refused at warded stone <pos>` |
| The same with a stack of 10 cobblestone | No cobblestone appears on the warded stone, and the stack still shows 10 | the same line |
| The same with a door on a plain stone block | The door is placed and you hold one door less (the control) | nothing from `on_block_interact` |
| `/reload` | | `util loaded` and `loaded 28 script(s); 0 error(s)` again |

### Script API 1.1 (ADR 0065)

CI proves the server side and the packets the client is sent; how titles, the action bar and boss bars look, and whether experience, hunger and game mode change without a relog, need the game. Check on 26.3 and, with the 26.4 jar, on 26.4, in **Survival** (`/gamemode survival`). A second player (another account, or a second client on a LAN world) helps for the chat and leave rows.

| Do this | Expected in the game | Expected in the log |
|---|---|---|
| Say `!help` in chat | Only you see the list of sample commands; your message itself is not shown (a second player sees nothing) | `player.chat: <name> ran !help` |
| Say `hello` | Shown as normal chat to everyone | |
| `/give @s minecraft:diamond 4`, then `!kit` | Two diamonds gone; the first hot bar slot holds a diamond sword named **Spark Blade** with a little wear on the durability bar; a golden helmet on your head; a shield in your off hand; chat `Kit: Spark Blade (1554/1561), ...` | |
| Keep the golden helmet on for a few seconds | The Luck effect appears and comes back every few seconds while you wear it; none after you take it off | `player.tick: <name> wears a golden helmet: luck for 5 seconds` |
| `/summon minecraft:zombie ~2 ~ ~ {NoAI:1b,equipment:{mainhand:{id:"minecraft:iron_sword",count:1}}}` and right-click it | Chat `This zombie holds minecraft:iron_sword and wears a new golden helmet.`; **the zombie wears a golden helmet at once** | `entity.interact: <name> used minecraft:zombie` |
| `!train` | **At once, without a relog:** the experience bar shows level 3, the hunger bar drops to 5 drumsticks, you are in Adventure mode (you cannot break blocks); chat `Trained: level 3, 5 points, food 10, saturation 2, adventure.` (`/gamemode survival` to go back) | |
| `!title` | **A large "Spark!" with "Sample script" below it**, fading in quickly, staying 2 seconds and fading out; **"Sparks: ready" above the hot bar** | |
| `!title`, then at once `!clear` | The title disappears at once | |
| `!bar`, then `!bar` again | **A yellow boss bar "Spark charge" with 10 notches** at the top of the screen, a quarter full, then half | |
| Die (`/kill @s`) and respawn | Chat `Welcome back, <name>.`; **the bar is still shown** after the respawn; `!bar` fills it further | `player.respawn: <name> in minecraft:overworld` |
| `!bar who`; then `!bar off` | `Spark charge: 1 player(s): <name>.`; the bar disappears and `Spark charge removed.` | |
| A second player says `!bar`, then leaves the world; you say `!bar who` | You are told `<name> has left.`, and `Spark charge: 0 player(s).` (or only you) | `player.leave: <name>` |
| Look at stone 3 blocks away and say `!look`; look at a mob; look at the sky | `You look at minecraft:stone (<face> face), <n> blocks away.`, then the mob's id, then `You look at nothing within 16 blocks.` | |
| `/summon minecraft:breeze ~3 ~ ~ {NoAI:1b}`, look at it and say `!smite` | The breeze dies; it drops breeze rods (a player kill); `Smitten: minecraft:breeze fell.` and `Your kills: <k>. ...` | `entity.death: <name> killed minecraft:breeze` |
| Hit a zombie wearing armour (`/summon minecraft:zombie ~2 ~ ~ {NoAI:1b,equipment:{chest:{id:"minecraft:diamond_chestplate",count:1}}}`) with the Spark Blade | Chat `minecraft:zombie took <amount> damage (minecraft:player_attack), <health> health left.`, the amount less than the sword's damage | `entity.damaged: minecraft:zombie took ...` |
| `/summon minecraft:cow ~1 ~ ~`, then `!nether` | You and the cow stand on a 3 by 3 obsidian floor in the Nether; chat `You went from minecraft:overworld to minecraft:the_nether.` and `Now in minecraft:the_nether with 1 cow(s), the first now in minecraft:the_nether.` (go back through a portal or `/execute in minecraft:overworld run tp @s ~ 100 ~`) | `player.changeDimension: <name> minecraft:overworld -> minecraft:the_nether` |

Report any change that shows only after a relog, a title or bar that looks wrong, and any command message another player can see.

Then check that the log has no line containing `[msm_runtime]` at WARN or ERROR and no `Failed to load`. Report any such line, and any row whose log line is missing.

## Changing the sample

Do not edit these files by hand. Change `SAMPLE_ELEMENTS` (and `SCRIPTS`) in `packages/exporters/test/sample-script.golden.test.ts`, then regenerate this folder and the pinned hash, and commit the changes on purpose:

```sh
UPDATE_GOLDENS=1 pnpm --filter @msm/exporters test
```

To build the jar with a real runtime locally and run the headless server check (as CI does; JDK 25 on `JAVA_HOME`; absolute paths, because the test runs in `packages/exporters`):

```sh
cd engine-mod && ./gradlew build && cd ..
MSM_RUNTIME_JAR="$(ls "$PWD"/engine-mod/build/libs/msm_runtime-*.jar | grep -v sources)" MSM_SAMPLE_SCRIPT_OUT="$PWD/build/sample-script" \
  pnpm --filter @msm/exporters exec vitest run test/sample-script.golden.test.ts
node tools/run-fabric-server/index.ts --jar build/sample-script/msm_sample_script.jar --facts build/sample-script/fabric-facts.json
```

This README is not generated and is kept as it is.
