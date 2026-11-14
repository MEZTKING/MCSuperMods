# Sample rules project

A kitchen-sink MCSuperMods project for Rules, behaviour made without code (ADR 0082), and the checklist for one-click Play and Reload (ADR 0084), namespace `msm_sample_rules`: an `msm:mod`, two blocks, two items and a mob, and five rule books. The pictures are the library's placeholder pictures; nothing in the folder is a Mojang file. It works on **26.3** and on **26.4**. Its siblings are `fixtures/sample-mod/` (blocks and items), `fixtures/sample-script/` (scripts) and `fixtures/sample-creatures/` (mobs).

`packages/exporters/test/sample-rules.golden.test.ts` checks it on every run: the folder equals the project built in code, every element validates with zero problems, the project expands (the rule books become events on their subjects and generated scripts) with zero problems, the plugins' validators report nothing, the three generated scripts type-check, and the content jar exports for both targets with its SHA-256 pinned per target. The jar holds the five definitions (`msm/msm_sample_rules/`), each rule's event on its subject, and the three generated scripts as JavaScript (`msm/msm_sample_rules/script/rules/<book>.js`). The two plain rules compile to ordinary actions; the others need a script. `sample-rules.java.golden.test.ts` pins the Java project export of 26.3: the plain rules are in it as events, the generated scripts and the two `run_script` events are left out (`export.scripts-not-ejected`; the app lists those rules as `rules.not-in-eject`). The vanilla packs carry nothing of the rules (they need the Fabric mod jar; the app says so with `rules.needs-jar`), and the data pack leaves out the two blocks' loot tables (`export.mod-only-reference`). This README is the one file in the folder that is written by hand; the test leaves it alone.

A headless Fabric server with the content jar starts on 26.3 and on 26.4 and logs `[msm_runtime] registered 2 block(s) and 5 item(s) from 5 definition file(s); 0 error(s), 0 warning(s)`, `[msm_runtime] registered 1 entity type(s) and 0 mob effect(s)` and `[msm_runtime] loaded 3 script(s); 0 error(s)`, with nothing from `msm_runtime` at warning or error level. The ejected 26.3 project builds with its own `./gradlew build` and starts without `msm_runtime` (with GeckoLib, which the eject uses for the mob).

## Contents

| Element | Kind | What it shows |
|---|---|---|
| `msm_sample_rules:mod` | mod metadata | `fabric.mod.json`: id `msm_sample_rules` |
| `msm_sample_rules:ruby` | item | the reward of most rules; Ingredients tab |
| `msm_sample_rules:chime_block` | block | a blue block; drops itself; Functional Blocks tab |
| `msm_sample_rules:lucky_block` | block | an amber block; drops itself; Functional Blocks tab |
| `msm_sample_rules:rally_horn` | item | a green horn, one per stack; Tools and Utilities tab |
| `msm_sample_rules:sentinel` | mob | a calm slate-grey biped (the library's preset) that wanders and looks at players; drawn by the runtime's own renderer (`renderer: vanilla`), so it needs no GeckoLib; spawn egg "Sentinel Spawn Egg" |
| `msm_sample_rules:chime_block_rules` | rule book | **Ring the chime** (plain): when a player uses the Chime Block, play a chime at the block and give the player one Ruby |
| `msm_sample_rules:lucky_block_rules` | rule book | **Try your luck** (logic), with the player counter `lucky_uses`: when a player uses the Lucky Block, only if the player is sneaking: add 1 to the counter; with a 50 per cent chance give one Ruby and play the level-up sound at the player, otherwise show "No luck this time." above the hotbar; then say in the chat "You have used the lucky block N times." |
| `msm_sample_rules:rally_horn_rules` | rule book | **Rally the players nearby** (logic): when a player uses the Rally Horn (at most once every 2 seconds), for each player within 16 blocks: Speed for 10 seconds and "Rally!" above the hotbar; wait 2 seconds; then tell the player who used it "The rally is over." |
| `msm_sample_rules:sentinel_rules` | rule book | **Keep watch** (plain): every 5 seconds while a Sentinel is alive, play a bell at it, send 5 end rod sparkles and give it Glowing for 3 seconds |
| `msm_sample_rules:world_rules` | rule book | **Stone sometimes hides a ruby** (a vanilla thing as subject): when a player breaks Stone, with a 20 per cent chance drop one Ruby there. **Welcome**: when a player joins, show the title "Welcome" with "to the MSM sample rules" under it and play a chime at the player. **No rain in the day**: every 10 seconds, if it is raining and it is day, set the weather to clear for 300 seconds and tell every player "The rain stops. Time of day: N" |
| `block/*`, `item/*`, `entity/sentinel*` | models and animations | cubes and flat items over the placeholder pictures; the Sentinel's biped model, idle and walk |

The generated event ids are `msm_sample_rules:chime_block_rules_block_used`, `lucky_block_rules_block_used`, `rally_horn_rules_item_used` and `sentinel_rules_mob_every` (subject id, `_rules_`, trigger). All content is original work written for MCSuperMods; the project contains no Mojang files.

## In-game check (Windows, Minecraft Java 26.3 and 26.4)

Do the whole list twice, once per version. Part 1 checks the rules with the exported jar, part 2 Play and Reload from the app.

- **26.3:** the 26.3 content jar, Fabric Loader 0.20.1 or newer and Fabric API 0.165.2+26.3 (or newer for 26.3). The jar contains `msm_runtime`; do not install it separately.
- **26.4:** the 26.4 jar (the app exports it when the project target is 26.4), with Fabric Loader 0.20.1 and Fabric API 0.165.4+26.4 (the 26.4 target's facts). The jar contains `msm_runtime` only.

Things you meet here that are limits of the feature, not faults, are marked "known limit" with their number from the limits table of the plan (R1 to R22, `docs/PLAN-blocks-and-play.md`; they move into ADRs 0082 and 0084 when the batch closes). Report them only if they look different from what is written.

### Part 1: the rules

**Get the jar**, either way:

- from the latest CI run: Actions, CI, the run, Artifacts, then unzip the sample rules jar; or
- from the app: copy this folder outside the repository, open it in MCSuperMods, choose the target and export the Fabric mod jar (runtime nested, the default).

**Install it** with Prism Launcher as described in `fixtures/sample-mod/README.md`, with `msm_sample_rules.jar` in place of `msm_sample_mod.jar`. Create a new **Creative** world with cheats on (a superflat world is easiest). Give yourself the things: `/give @s msm_sample_rules:chime_block`, `/give @s msm_sample_rules:lucky_block`, `/give @s msm_sample_rules:rally_horn`, `/give @s msm_sample_rules:sentinel_spawn_egg`.

#### Loading

| Check | Expected |
|---|---|
| Title screen, **Mods** | `MSM Sample Rules` and `MSM Runtime` |
| `logs/latest.log` (Prism: the instance's **Minecraft Log**) | `[msm_runtime] registered 2 block(s) and 5 item(s) from 5 definition file(s); 0 error(s), 0 warning(s)` and `registered 1 entity type(s) and 0 mob effect(s)`; after the world opens `loaded 3 script(s); 0 error(s)`; nothing at warning or error level from `msm_runtime`; no `dev mode` line (this is not the managed test instance) |
| Joining the world | The title **Welcome** with **to the MSM sample rules** under it, and a chime |
| Creative tabs | Chime Block and Lucky Block in **Functional Blocks**; Rally Horn in **Tools and Utilities**; Ruby in **Ingredients**; the Sentinel Spawn Egg with the spawn eggs |

#### Blocks and items

Use the blocks with an **empty hand** (right-click); holding a block would place it instead.

| Check | Expected |
|---|---|
| Place the **Chime Block** and right-click it | A chime at the block, and one Ruby in your inventory, every time |
| Place the **Lucky Block** and right-click it standing up | Nothing happens (the rule runs only while you sneak) |
| Sneak and right-click the Lucky Block about ten times | Each time the chat says `You have used the lucky block N times.`, counting up from 1; about half the times you get a Ruby and the level-up sound, the other times "No luck this time." above the hotbar (any mix is fine: it is a coin toss each time) |
| Leave the world, come back, sneak and use the Lucky Block | The count goes on from where it was: counters are saved with the world, one per player (known limit R18) |
| Hold the **Rally Horn** and right-click | You get Speed for 10 seconds and "Rally!" above the hotbar; 2 seconds later the chat says `The rally is over.`; using it again within 2 seconds does nothing |
| Break and replace the blocks | Each drops itself |

#### The Sentinel

| Check | Expected |
|---|---|
| Use the Sentinel Spawn Egg on the ground | A slate-grey figure that wanders slowly and looks at you |
| Watch it for 20 seconds | Every 5 seconds: a bell sound at it, a few white end rod sparkles, and a glowing outline for 3 seconds (the outline shows through walls); so it glows 3 seconds, then not for 2 |
| `/kill @e[type=msm_sample_rules:sentinel]` | The bells stop |

#### Vanilla stone, joining and the weather

| Check | Expected |
|---|---|
| `/gamemode survival`, then break 20 Stone blocks with a pickaxe (`/give @s minecraft:iron_pickaxe`; `/fill ~2 ~ ~2 ~6 ~3 ~6 minecraft:stone` makes some) | Each drops cobblestone as usual; about one in five also drops a Ruby (from 0 to 10 Rubies in 20 blocks is not a fault). Other blocks never drop a Ruby |
| `/time set noon`, then `/weather rain` | Within 10 seconds the rain stops and the chat says `The rain stops. Time of day: 6000` (or the time it is then) |
| `/time set midnight`, then `/weather rain`, and wait 30 seconds | It keeps raining (the rule runs in the day only) |
| A second player joins (see Two players) | They see the Welcome title too |

#### Vanilla packs and the Java project

| Check | Expected |
|---|---|
| In the app, export the vanilla data pack and the resource pack | The export says "Rules are not in vanilla packs: they need the Fabric mod jar. Export the Fabric mod jar to play with your rules." (known limit R8); in an unmodded game the packs load and do nothing of the rules |
| In the app (26.3 target), **Export Java project** | The dialog lists the five rules that need a script ("Try your luck", "Rally the players nearby", "Stone sometimes hides a ruby", "Welcome", "No rain in the day") as not in the Java project (known limit R9); "Ring the chime" and "Keep watch" are in it as events |
| Build that project with its `gradlew build` and play it with GeckoLib installed | The Chime Block and the Sentinel behave as above; the Lucky Block, the Rally Horn, Stone, joining and the weather do nothing of the rules |

#### In the app

| Check | Expected |
|---|---|
| Open each rule book | Every rule reads as a sentence; no warnings on any card; the Lucky Block's book shows the counter `lucky_uses` |
| Open the Chime Block, the Lucky Block, the Rally Horn and the Sentinel in their Studios | Each has a **Rules** section listing its rules, and "From rules" events that cannot be edited there (known limit R20) |
| Advanced mode, a book's **What this becomes** | The plain books show events only; the others show the event and the generated script |

#### Two players

| Check | Expected |
|---|---|
| A dedicated Fabric server on the same version with the jar in `mods`, your client with the same jar, joined | Joins without errors; the server log has the `msm_runtime` lines above and no `dev mode` line. Everything above works as in single player |
| A second player within 16 blocks while you use the Rally Horn | Both get Speed and "Rally!"; only you get "The rally is over." |
| The second player 30 blocks away | They get nothing |
| The second player uses the Lucky Block while sneaking | Their count starts at 1: counters are per player |

### Part 2: Play and Reload (from the app)

Needs Prism Launcher installed and signed in to a Microsoft account (known limit R6). Copy this folder outside the repository and open it in MCSuperMods. Choose the target (26.3, then 26.4 for the second pass). Close Minecraft before you start.

#### Play

| Check | Expected |
|---|---|
| The toolbar | **Play** and **Reload** buttons and a chip "Game not running"; Reload is off |
| Press **Play** (or `F5`) the first time | One progress line; the app creates the managed test instance in Prism and starts it. The game goes straight into a flat creative world named "MCSuperMods test (msm_sample_rules)" (known limit R17: the runtime makes the world). If the game asks about accessibility first, report it |
| In the test world | The Welcome title; a 21 by 21 smooth stone test area with the sign "MCSuperMods test area", a lever, a button, a pressure plate, redstone dust, a small water pool, grass and farmland and a fenced pen; chests by the spawn with one stack of every item of the project (Ruby, Chime Block, Lucky Block, Rally Horn, Sentinel Spawn Egg), also in the hotbar (the first nine items go there); time stands at noon, the weather does not change by itself and no mobs spawn |
| The chip | "In the test world"; Reload is on |
| `logs/latest.log` | `[msm_runtime] dev mode for msm_sample_rules (singleplayer test world)` once |
| Check every rule of part 1 here | Works the same (the weather rule: `/weather rain` stops within 10 seconds, as time stands at noon) |

#### Reload in place

| Check | Expected |
|---|---|
| In the app, change the chime sound of "Ring the chime" (say to a bell), save, press **Reload** (`Ctrl+R`) | Within a few seconds the chat says `MCSuperMods: reloaded (1 changes)` (or the number of files changed); the Chime Block now rings a bell. The game does not restart |
| Change "No luck this time." to other words, Reload, sneak-use the Lucky Block | The new words; the counter keeps its value (the generated script was replaced, the world kept) |
| Change "Keep watch" to every 2 seconds, Reload | "Restart needed": the interval is part of the Sentinel's trigger, not its event (known limits R2 and R16) |
| Change the Ruby's picture (Picture to texture, or paint it), Reload | A short resource loading screen, then the new picture (known limit R15) |

#### Restart needed

| Check | Expected |
|---|---|
| Add a rule "When a player breaks the Chime Block, show a message", Reload | The chip shows "Restart needed" with the reason in words (a new trigger on the Chime Block; known limit R2); the in-place part still reloads |
| Press **Restart** | The game saves, quits, the jar is replaced and the game starts again into the same test world; the new rule works. If it takes longer than 30 seconds the app says "Close Minecraft, then press Play again." (known limit R7) |
| Add a new block, Reload | "Restart needed": "You added a new block: ..." (known limit R1) |
| Delete the new rule and the new block, Reload | "Restart needed": the Chime Block loses a trigger and a file is removed (known limits R2 and R4) |
| Press **Play** while the game is open | The game restarts with the new jar into the same world |

#### Test worlds, other worlds and closing

| Check | Expected |
|---|---|
| Play menu, **New test world**, then Play | The old world folder is kept as `msm-test-msm_sample_rules-old-1` in the instance's `saves`; the new world is fresh, and the lucky count starts at 1 again (known limit R18) |
| Leave to the title screen and open another world of the instance | The chip says "In another world"; Reload is off (known limit R14) |
| Close Minecraft from its window | After about 10 seconds the chip says "Game not running" |
| Play menu, **Open the test instance's folder** | Opens the instance's game folder, with `msm-dev/` inside |
| Your other Prism instances and worlds | Untouched: no `msm-dev/` in them (ADR 0084 D9) |

#### On 26.4 specifically

| Check | Expected |
|---|---|
| Everything above, with the project target set to 26.4 | Behaves like 26.3; Play creates a separate managed instance for 26.4 |
| `logs/latest.log` | The same `msm_runtime` lines, and nothing at warning or error level from `msm_runtime` |
| Java project | The eject is for 26.3 only |

Things only the game can confirm, and worth reporting if they look wrong: the sounds and where they play, the titles and the chat and hotbar lines, the Sentinel's glow and sparkles, the Ruby drops from Stone, the rain stopping, the first Prism start, the jar being replaced on Restart (Windows keeps open jars locked), the resource loading screen on a picture reload, and anything that differs between 26.3 and 26.4. CI checks the server side on both versions (this sample's server check and the runtime's dev mode GameTests) and the client side of Play with the runtime's own client GameTest, but not with Prism.

## Changing the sample

Do not edit the generated files by hand. Change the elements in `packages/exporters/test/sample-rules.golden.test.ts`, then regenerate this folder and the pinned hashes, and commit the changes on purpose:

```sh
UPDATE_GOLDENS=1 pnpm --filter @msm/exporters test
```

To build the jar with the real runtime locally and run the headless server check as CI does (JDK 25 on `JAVA_HOME` and first on `PATH`; the paths must be absolute because the test runs in `packages/exporters`; add `-Pmc=26.4` and `MSM_TARGET_ID=mc-26.4` for 26.4):

```sh
cd engine-mod && ./gradlew assemble && cd ..
MSM_RUNTIME_JAR="$(ls "$PWD"/engine-mod/build/libs/msm_runtime-*.jar | grep -v sources)" \
  MSM_SAMPLE_RULES_OUT="$PWD/build/sample-rules" \
  pnpm --filter @msm/exporters exec vitest run test/sample-rules.golden.test.ts
node tools/run-fabric-server/index.ts --jar build/sample-rules/msm_sample_rules.jar \
  --facts build/sample-rules/fabric-facts.json \
  --expect-line '[msm_runtime] loaded 3 script(s); 0 error(s)'
```

`MSM_SAMPLE_RULES_JAVA_OUT` (an absolute folder) writes the ejected 26.3 Java project with `sample-rules.java.golden.test.ts`; it builds with its own `./gradlew build`, and its jar starts with `node tools/run-fabric-server/index.ts --jar <jar> --facts build/sample-rules/fabric-facts.json --no-runtime --extra <GeckoLib jar>`.

This README is not generated and is kept as it is.
