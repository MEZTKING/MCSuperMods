# Sample mobs and commands project

A kitchen-sink MCSuperMods project for batch 2 of vanilla parity 3 (ADRs 0107 to 0111, ADR 0112 D4), namespace `msm_sample_mobs`: an `msm:mod`, a merchant who remembers how you treat it, a bed villagers sleep in, a villager look for swamps, maple syrup and hot tar that turn into blocks where they meet water or lava and have cauldrons (and the syrup a bottle), eleven mobs with a fish bucket, hovering, phasing, swooping, roosting, collecting, digging, playing dead, bartering, a dash and a right-shoulder pet, a larch boat and its chest boat, two commands with the new argument types and a dialog, two game rules, two statistics, a creative tab in its own order, and a script for the six new events. The pictures are MCSuperMods' own (the library's placeholder and preset skins, the art generator's boat, robe and bed pictures, and liquids and buckets drawn by the golden test); the bottle uses vanilla's potion picture and the cauldrons vanilla's cauldron pictures, both named and taken from your own game, never bundled; nothing in the folder is a Mojang file. It works on **26.3** and on **26.4**. Its siblings are `fixtures/sample-villagers-and-fluids/` (vanilla parity 2, batch 2) and `fixtures/sample-plants-and-storage/` (vanilla parity 3, batch 1).

`packages/exporters/test/sample-mobs-and-commands.golden.test.ts` checks it on every run: the folder equals the project built in code, every element validates with zero problems, the project expands with no problems and the plugins' validators report nothing at all on either target, the script type-checks, and the content jar exports for both targets with no errors or warnings and its SHA-256 pinned per target. The vanilla data pack keeps the trades, the dialog, the cauldrons' loot tables and the vanilla tags it joins, and leaves out the boats' recipes and the blocks' loot tables (they name the mod's own items, `export.mod-only-reference`). `sample-mobs-and-commands.java.golden.test.ts` checks the Java project eject (26.3): everything, the merchant's trader and the owl's shoulder riding included (since eject 2c), but the script with `/tally`'s `run_script` action (scripts are never ejected).

To get a jar for the headless server check, run the golden test with `MSM_RUNTIME_JAR=<a built msm_runtime jar>` and `MSM_SAMPLE_MOBS_COMMANDS_OUT=<folder>` (and `MSM_TARGET_ID=mc-26.4` for 26.4): it writes `msm_sample_mobs.jar` and `fabric-facts.json` (2 blocks, 16 items, 12 entity types, 1 script) there. `MSM_SAMPLE_MOBS_COMMANDS_JAVA_OUT=<folder>` with the Java golden writes the ejected project with the Gradle wrapper. The parity GameTests (`engine-mod/parity`: `SampleMobsAndCommandsParityTest` on both content jars and the 26.3 ejected jar, `SampleMobsAndCommandsScriptParityTest` on the content jars) run in CI.

## Contents

| Element | Kind | What it shows |
|---|---|---|
| `mod` | mod metadata | `fabric.mod.json`: id `msm_sample_mobs` |
| `kind_merchant` | mob, trader | sells bread for 10 emeralds and cooked beef for 20 (`kind_merchant/level_1`, two trades of its own); **remembers you**: hitting it raises your prices, a **poppy** given as a gift lowers them; vanilla's **demand**; restocks at a **barrel** nearby |
| `straw_mat` | bed | a project bed **villagers claim and sleep in**, as vanilla's beds |
| `fen` | villager look | villagers born or spawned in **swamps and mangrove swamps** wear green robes with a hem (zombie villagers too) |
| `maple_syrup` | fluid, water-like | tinted brown; a source beside lava becomes a **honeycomb block**, flowing syrup **brown terracotta**; a **cauldron in three levels** (`maple_syrup_cauldron`) and a **bottle** (`maple_syrup_bottle`: food and Speed) |
| `hot_tar` | fluid, lava-like | light 10; a source beside water becomes **blackstone**, flowing tar **basalt**; a **full-only cauldron** (`hot_tar_cauldron`), no bottle |
| `pond_carp` | mob, swims | a **water bucket takes it** (`pond_carp_bucket`) with its name and health, and lets it out again |
| `ember_wisp` | mob, hovers | **floats about 4 blocks** over the ground |
| `shade` | mob, phases | charges at pigs and **passes through walls** while it charges |
| `dusk_swooper` | mob, flies | **circles high, then dives** at what it hunts |
| `cave_flitter` | mob, flies | **hangs upside down under a block** when it has nothing to do; wakes when hurt or a player comes near |
| `trinket_magpie` | mob | given an item, it **collects ones like it** for you (or to a note block it heard) |
| `truffle_hog` | mob | **digs** moss and wool for the sniffer's loot |
| `pond_newt` | mob | **plays dead** below half its health, regenerating, and gets up again |
| `gold_haggler` | mob | **barters** gold ingots, from your hand or the ground, for the piglin's loot |
| `dune_runner` | mob, rideable | a mount whose jump bar is a **dash** forward (cooldown 2 seconds) |
| `perch_owl` | mob, tameable | sits on your **right shoulder only** |
| `larch_planks`, `larch_boat` | block, item | a **boat** and its **chest boat** (`larch_chest_boat`), crafted from larch planks as vanilla's |
| `signal` | command | `/signal <dimension> <time> <colour> <rotation> <uuid> <item predicate> <block predicate> [note]` (operators): shows the **dialog** `welcome` and gives a compass |
| `tally` | command | `/tally <count> <team colour> <effect> <game mode> <range> <entity type>`: the script says what was typed and the game rules, and adds the count to **Carp caught** |
| `welcome` | dialog | the notice `/signal` opens |
| `calm_nights`, `merchant_bonus` | game rules | on/off (off), and a number from 0 to 5 (2) |
| `carp_caught`, `distance_hopped` | statistics | a count, and a distance |
| `mobs_tab` | creative tab | lists the carp bucket, the syrup bottle, the chest boat, the boat and vanilla's water bucket **in that order**, then the rest |
| `mob_notes` | script | a chat line for each of `item.picked_up`, `player.ate`, `item.crafted`, `player.slept`, `player.woke` and `player.advancement`, and `/tally` |
| `entity/*` | models, animations | the library's mob presets (biped, quadruped, bird, fish, flyer) |

All content is original work written for MCSuperMods; the project contains no Mojang files.

## In-game check (Windows, Minecraft Java 26.3 and 26.4)

Do the whole list on **26.3** and on **26.4**, in **singleplayer**; the shoulder pet and the merchant's prices also on a **dedicated server** with two players. Use the Fabric Loader and Fabric API versions the app shows for each target. The jar contains `msm_runtime`; do not install it separately.

**Get the jar**, either way:

- from the latest CI run: Actions, CI, the run, Artifacts, then unzip `msm-sample-mobs-commands-mc26.3` or `msm-sample-mobs-commands-mc26.4` (the ejected 26.3 jar is in `msm-ejected-jars-mc26.3`; it needs GeckoLib beside it); or
- from the app: copy this folder outside the repository, open it in MCSuperMods, choose the target and export the Fabric mod jar (runtime nested, the default).

**Install it** with Prism Launcher as described in `fixtures/sample-mod/README.md`, with `msm_sample_mobs.jar` in place of `msm_sample_mod.jar`. For the server, put the same jar and Fabric API in the server's `mods` folder. Create a new **Creative** world with cheats on; a superflat world is easiest. Spawn mobs with their spawn eggs (in the **Sample Mobs** tab or by searching). Switch to Survival (`/gamemode survival`) where a check says so.

### Loading

| Check | Expected |
|---|---|
| Title screen, **Mods** | `MSM Sample Mobs and Commands` and `MSM Runtime` |
| `logs/latest.log` (on the server its console) | `[msm_runtime] registered 2 block(s) and 16 item(s) from 25 definition file(s); 0 error(s), 0 warning(s)`, `registered 12 entity type(s) and 0 mob effect(s)`, `registered 2 fluid cauldron(s) and 1 fluid bottle(s)`, `registered 1 villager type(s)`, `registered 2 boat type(s)`, `registered 2 game rule(s)`, `registered 2 statistic(s)`, `loaded 1 script(s); 0 error(s)`; nothing at warning or error level from `msm_runtime`, no `NoClassDefFoundError` |
| Creative inventory, the **Sample Mobs** tab | first the Bucket of Pond Carp, the Bottle of Maple Syrup, the Larch Boat with Chest, the Larch Boat and a water bucket, then the Straw Mat; every item with a picture and its name |

### Traders and villagers

| Check | Expected |
|---|---|
| Open the **Kind Merchant** | Bread for 10 emeralds, cooked beef for 20 |
| Hit it once (Survival), open it again; a second player opens it | Your prices are higher (12 and 25); the other player's are not |
| Give it a **poppy** (use it on the merchant), open it | Your prices are back down; one poppy was taken |
| Buy all its bread, wait a day near a **barrel** | It walks to the barrel and restocks there; heavy trading raised the bread's price, which settles after the restock |
| Place a **Straw Mat** in a village at night | A villager claims it and sleeps in it |
| Summon villagers in a swamp (`/summon villager` there, or breed two) | They wear the **fen** robes; zombie villagers there too |

### Fluids

| Check | Expected |
|---|---|
| Pour **Maple Syrup** beside lava; let flowing syrup reach lava | A honeycomb block where the source was; brown terracotta where it flowed |
| Pour **Hot Tar** beside water | Blackstone at the source, basalt where it flowed; it glows (light 10) |
| A syrup bucket on an empty cauldron, then glass bottles | Three levels, a bottle each; the bottles fill it back; an empty bucket takes a full one. Note the colour of the syrup in the cauldron (it may show untinted) |
| Drink a **Bottle of Maple Syrup** | Food and Speed; a glass bottle is left |
| A hot tar bucket on an empty cauldron, then a glass bottle | Full at once, like lava; the bottle does nothing |

### Mobs

| Check | Expected |
|---|---|
| A water bucket on a **Pond Carp** (name it first with a name tag) | It goes into a Bucket of Pond Carp; emptying the bucket lets it out with its name |
| An **Ember Wisp** | It floats about four blocks over the ground and does not fall |
| A **Shade** and a pig behind a wall | It charges through the wall and hits the pig, and comes out of the wall |
| A **Dusk Swooper** and a pig | It circles high and dives at the pig |
| A **Cave Flitter** under a roof | It hangs upside down under a block; it lets go when hit or when you walk up |
| Give a **Trinket Magpie** an emerald, drop emeralds nearby | It brings them to you (or to a note block you played) |
| A **Truffle Hog** on moss | Now and then it digs up torchflower seeds or a pitcher pod |
| Hit a **Pond Newt** hard | It lies on its side, mobs ignore it, it regains health and gets up |
| Give a **Gold Haggler** a gold ingot, or drop one | It takes it and drops some of the piglin's barter loot |
| Ride a **Dune Runner**, hold and release jump | A dash forward; the bar waits two seconds before the next one |
| Tame a **Perch Owl** (wheat seeds), walk near it | It sits on your **right** shoulder; with a parrot already on your right shoulder it does not |

### Boats

| Check | Expected |
|---|---|
| Craft a **Larch Boat** from five larch planks, then a chest boat from it and a chest | Both craft as vanilla's |
| Place both on water, ride, open the chest boat | They float and paddle as vanilla's, drawn with the larch pictures; the chest opens |

### Commands, rules, statistics and the script

| Check | Expected |
|---|---|
| `/signal minecraft:the_nether 2d ff8800 90 0 <your UUID> #minecraft:planks minecraft:stone hello` | The **Mobs and commands** dialog opens and you get a compass; a wrong dimension, time, colour or UUID is refused with vanilla's error |
| `/tally 3 red minecraft:speed creative 1..5 minecraft:pig` | "Tally: 3 red minecraft:speed creative minecraft:pig; calm false, bonus 2, carp caught 3." |
| `/gamerule msm_sample_mobs:merchant_bonus 9`, then `5`; the game rule screen | 9 is refused, 5 is taken; the screen shows **Calm nights** and **Merchant bonus** with their descriptions |
| `/scoreboard objectives add carp minecraft.custom:msm_sample_mobs.carp_caught`, `/tally ...` again; the Statistics screen | The score counts; **Carp caught** and **Distance hopped** are listed |
| Pick up an item, eat, craft planks, sleep the night, earn an advancement | "You picked up ...", "You ate ...", "You crafted ...", "Sleep well.", "Good morning.", "Well done: ..." |

Report anything that differs, with the version, singleplayer or server, and a screenshot.
