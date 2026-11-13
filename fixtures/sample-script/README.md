# Sample script project

A scripting sample for the Fabric content jar (ADRs 0031 and 0032), namespace `msm_sample_script`: an `msm:mod`, one block and one item copied from `fixtures/sample-mod` and renamed, a plain `warded_stone` block whose use a script cancels (ADR 0058), one script for each of the nine game events of the script API, an action handler that the block's `run_script` action calls, a `util` module that two scripts load with `require("./util")`, and (since ADR 0055) a status effect whose `msm:on_tick` event runs a second action handler, the script tick hook. Since ADR 0058 `on_entity_interact` tags the entity used with `Entity.runCommand` and `on_block_interact` places a sea lantern on the spark ore with `World.runCommand` at the ore's position. Every script logs with `msm.log.info`, so the server log shows what ran.

`packages/exporters/test/sample-script.golden.test.ts` checks it on every run:

- the folder equals the elements listed in the test saved as a project (it fails when the list changes and this folder is not regenerated);
- every element validates with zero problems, the project validators report nothing (the `run_script` handler is defined by a script), and every script parses and type-checks against the generated `msm-runtime.d.ts`;
- the content jar exports with zero problems (a stub runtime jar and the real TypeScript transpiler with the options of ADR 0031 D2), and its SHA-256 is pinned per target, built in two time zones;
- the jar holds the four definitions (two blocks, an item, an effect) and the twelve scripts as `msm/msm_sample_script/script/*.js` (no `.ts`), each parsing as ES5 with no `class`, `async`, `let`, `const`, arrow or `for...of` tokens, and `fabric.mod.json` depends on `msm_runtime`.

CI's `engine-mod` job then exports this project with the real runtime nested and starts a headless Fabric dedicated server with it (`tools/run-fabric-server`). The server must log

```
[msm_runtime] registered 0 sound event(s)
[msm_runtime] registered 2 block(s) and 3 item(s) from 4 definition file(s); 0 error(s), 0 warning(s)
[msm_runtime] registered 0 entity type(s) and 1 mob effect(s)
[msm_runtime] loaded 12 script(s); 0 error(s)
```

and nothing from the runtime at warning or error level (12 scripts loaded with no error is the check that the effect's tick handler is loaded). A headless server has no players or mobs with the effect, so of the event scripts only `server.started` and `server.tick` run there; their lines appear after `Done`. The jar is kept as the workflow artefact `msm-sample-script`. Scripts are not part of the Java project export, so this sample has one parity run, on the content jar only (ADR 0058 D4): `SampleScriptParityTest` in `engine-mod/parity/` (`tools/run-fabric-server --gametest ... --gametest-filter 'msm_parity_tests:sample_script_*'`) checks, through vanilla and Fabric API only, that using a pig tags that pig (and not the player or another pig) with `msm_sample_touched`; that using the spark ore puts a sea lantern on top of it (not at the world spawn point); and that using the warded stone with five oak doors is refused, places nothing, keeps the five doors, and sends the player its inventory and block updates for the six neighbours of the placement position (read from the packets of a listening player, `ParityEars`), while the same use of stone places a door and sends neither. CI runs it for every Minecraft version as the fifth parity run; the report is in the artefact `parity-gametest-reports`.

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
| Start the world | Chat: `MSM Sample Script is loaded. Use the spark ore.` | `util loaded` (once), `loaded 12 script(s); 0 error(s)`, `server.started: runtime 0.5.0 in minecraft:overworld, handler msm_sample_script:spark`, `server.tick: first tick <n>`, `player.join: <your name>` |
| Place Spark Ore (Natural Blocks tab) and right-click it | An amethyst chime; one Spark Gem in your inventory; a sea lantern appears on top of the ore (not at the world spawn) | `block.interact: <name> used spark ore at <pos>`, then `action msm_sample_script:spark: msm_sample_script:spark_ore msm_sample_script:spark at <pos>` |
| Right-click with a Spark Gem (Ingredients tab) | Nothing visible | `item.use: <name> used <count> spark gem(s)` |
| `/summon minecraft:pig ~ ~ ~2` and right-click the pig, then `/tag @e[type=pig,limit=1,sort=nearest] list` | The tag list names `msm_sample_touched` (and you have no such tag: `/tag @s list`) | `entity.interact: <name> used minecraft:pig` |
| Hit the pig (switch to Survival: `/gamemode survival`) | The pig is hurt | `entity.hurt: minecraft:pig took <amount> from <name>` |
| Kill the pig | The pig dies | `entity.death: <name> killed minecraft:pig` |
| Mine the Spark Ore with an iron pickaxe (Survival) | It drops itself | `block.break: <name> broke spark ore at <pos>` |
| `/effect give @s msm_sample_script:spark_surge 30 1`, then `/damage @s 4` (Survival) | The effect shows (missing-texture icon, no icon was painted); health comes back two points every two seconds | `action surge: minecraft:player at level 2, health <health>` every 40 ticks while it runs |
| Place Warded Stone (Building Blocks tab), switch to **Survival**, hold 5 oak doors and right-click its top | **No door appears, not even for a moment** (no ghost door that vanishes), and you still hold 5 doors | `block.interact: <name> was refused at warded stone <pos>` |
| The same with a stack of 10 cobblestone | No cobblestone appears on the warded stone, and the stack still shows 10 | the same line |
| The same with a door on a plain stone block | The door is placed and you hold one door less (the control) | nothing from `on_block_interact` |
| `/reload` | | `util loaded` and `loaded 12 script(s); 0 error(s)` again |

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
