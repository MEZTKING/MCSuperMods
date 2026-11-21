# Sample villagers and fluids project

A kitchen-sink MCSuperMods project for batch 2 of the vanilla parity plan (ADRs 0098 to 0100), namespace `msm_sample_villagers`: an `msm:mod`, a trader mob with trade sets of its own and one of vanilla's, a new job for villagers with its job site block and apron, a pack mule whose storage needs a chest, a pet that sits on your shoulder, a water-like and a lava-like fluid with their buckets, and the Glow Moon, a dimension with a type of its own. The mobs use the library's preset models (biped, quadruped, bird) and are drawn by the runtime's vanilla renderer, so the jar needs no GeckoLib on either version. The pictures are MCSuperMods' own (preset skins and placeholder pictures, and the apron, liquids and buckets drawn by the golden test); nothing in the folder is a Mojang file. It works on **26.3** and on **26.4**. Its siblings are `fixtures/sample-vanilla-blocks/` (batch 1), `fixtures/sample-creatures/` (mobs) and `fixtures/sample-portals/` (a project dimension).

`packages/exporters/test/sample-villagers-and-fluids.golden.test.ts` checks it on every run: the folder equals the project built in code, every element validates with zero problems, the project expands with no problems and the plugins' validators report nothing at all (no warnings, no notes) on either target, and the content jar exports for both targets with zero problems and its SHA-256 pinned per target. The jar holds the definitions under `msm/msm_sample_villagers/` (1 block, 3 entities, 2 fluids, 1 villager profession), the liquid blocks' models naming the `still` and `flowing` pictures, the buckets' item models, the five trade sets lowering makes for the job (`glassblower/level_1` to `level_5`), the job site entry in `#minecraft:acquirable_job_site` and the fluid tags (`#minecraft:water` and `#minecraft:lava`, with the `flowing_` fluids on 26.3 and `#minecraft:swimmable` on 26.4), all written as optional entries. The vanilla data pack keeps the trades, trade sets, trade tags, the Glow Moon and its type, and those tag entries; it leaves out the bench's loot table (`export.mod-only-reference`). The Java project export leaves batch 2 out (a warning per profession and fluid; the trader, storage and shoulder components are stripped), so this sample has no Java golden. This README is the one file in the folder that is written by hand; the test leaves it alone.

To get a jar for the headless server check, run the golden test with `MSM_RUNTIME_JAR=<a built msm_runtime jar>` and `MSM_SAMPLE_VILLAGERS_OUT=<folder>` (and `MSM_TARGET_ID=mc-26.4` for 26.4): it writes `msm_sample_villagers.jar` and `fabric-facts.json` (1 block, 4 items, 3 entities) there.

## Contents

| Element | Kind | What it shows |
|---|---|---|
| `mod` | mod metadata | `fabric.mod.json`: id `msm_sample_villagers` |
| `pedlar` | mob, trader | a purple wanderer who trades through the villager trading screen when you use it with an empty hand. Level 1 (`pedlar/level_1`): 6 **glow berries** for 1 emerald (3 uses), 1 emerald for 10 **wheat** (4 uses); level 2 (`pedlar/level_2`, at 10 trading XP): a **name tag** for 5 emeralds (2 uses); level 3 (at 30 XP): vanilla's wandering trader common wares (`minecraft:wandering_trader/common`). Each wheat or glow berry trade earns 5 XP, each name tag 10. Its offers refill twice a day; it does not trade as a baby, while fleeing or while ridden; it keeps its offers, XP and level when the world is saved. Spawn egg only |
| `pedlar/glow_berries`, `pedlar/wheat`, `pedlar/name_tag` | villager trades | the pedlar's three trades |
| `pedlar/level_1`, `pedlar/level_2` | trade sets | the pedlar's own levels (all of their trades offered) |
| `glassblower` | villager profession | a **new job for vanilla villagers**: a villager without a job that finds a **Glassblower Bench** takes it, wears a **blue apron** (villagers and zombie villagers) and works with the mason's sound. Level 1 offers both of the job's own trades: 1 emerald for 12 **sand**, 4 **glass** for 1 emerald; levels 2 to 5 draw two of a mason's trades at that level. Breaking the bench loses the job (before the first trade) |
| `glassblower_bench` | block | the job site: a wooden bench with a pale top; drops itself; in Functional Blocks |
| `glassblower/1/sand`, `glassblower/1/glass` | villager trades | the job's own two first-level trades |
| `glassblower/level_1` to `glassblower/level_5` | villager trade tags | what each level draws from (the trade sets of the same names are made by lowering) |
| `pack_mule` | mob, animal | tamed with **apples** (one in four), ridden with a **saddle** by its owner; **storage of three rows** once a **chest** is used on it. Its owner opens it by using it while sneaking, or with the inventory key while riding. The contents and the chest are saved and dropped when it dies. Spawn egg only |
| `sugar_glider` | mob, animal | a small pet tamed with **sweet berries** (one in three); once tamed it follows you, sits when you use it, and **jumps onto your shoulder** when you stand still near it. It jumps down when you are hurt, sneak, sleep, ride, swim, glide or change dimension, and stays off for five seconds; one shoulder pet at a time. Spawn egg only |
| `brine` | fluid, water-like | a **pale teal liquid** (light pictures under the tint `#3aa69c`) that flows, makes sources and drains like water: you swim in it, drown in it and are put out when burning; anyone in it **glows** for three seconds (`on_entity_inside`). Its bucket is **Bucket of Brine** |
| `molten_amber` | fluid, lava-like | an **orange liquid** with **light 12** that sets you on fire and hurts as lava does; it flows one block every 10 ticks, loses 2 levels a block (so it reaches 3 blocks) and makes no new sources. Its bucket is **Bucket of Molten Amber** |
| `glow_moon_sky` | dimension type | a **violet sky** with **stars by day**, the sun standing still low in the sky, no sleeping (beds still set your spawn), no raids |
| `glow_moon` | dimension | a flat world of end stone over bedrock, of type `glow_moon_sky` |
| `entity/*`, `entity/*_animations` | models, animations | the preset models of the three mobs |
| `block/glassblower_bench` | model | the bench: top, sides and bottom |

All content is original work written for MCSuperMods; the project contains no Mojang files.

## In-game check (Windows, Minecraft Java 26.3 and 26.4)

Do the whole list four times: on **26.3** and on **26.4**, each in **singleplayer** and on a **dedicated server** (join it from the same game). Use the Fabric Loader and Fabric API versions the app shows for each target. The jar contains `msm_runtime`; do not install it separately.

**Get the jar**, either way:

- from the latest CI run: Actions, CI, the run, Artifacts, then unzip `msm-sample-villagers-mc26.3` or `msm-sample-villagers-mc26.4`; or
- from the app: copy this folder outside the repository, open it in MCSuperMods, choose the target and export the Fabric mod jar (runtime nested, the default).

**Install it** with Prism Launcher as described in `fixtures/sample-mod/README.md`, with `msm_sample_villagers.jar` in place of `msm_sample_mod.jar`. For the server, put the same jar and Fabric API in the server's `mods` folder. Create a new **Creative** world with cheats on; a superflat world is easiest. Switch to Survival (`/gamemode survival`) where a check says so.

### Loading

| Check | Expected |
|---|---|
| Title screen, **Mods** | `MSM Sample Villagers and Fluids` and `MSM Runtime` |
| `logs/latest.log` (Prism: the instance's **Minecraft Log**; on the server its console) | `[msm_runtime] registered 1 block(s) and 4 item(s) from 7 definition file(s); 0 error(s), 0 warning(s)`, `registered 3 entity type(s)`, `registered 2 fluid(s)`, `registered 1 villager profession(s)`; nothing at warning or error level from `msm_runtime`, and no `NoClassDefFoundError` or `Mixin apply failed` anywhere |
| Creative inventory: Spawn Eggs, Functional Blocks, Tools and Utilities | **Pedlar**, **Pack Mule** and **Sugar Glider Spawn Egg**; the **Glassblower Bench**; **Bucket of Brine** and **Bucket of Molten Amber** |
| Hover over each item | The names above, no `item.msm_sample...` keys |

### The pedlar (trading, levels, restock)

| Check | Expected |
|---|---|
| Place a Pedlar from its egg, then use it with an empty hand (Survival, with a few emeralds and 20 wheat) | The villager trading screen titled **Pedlar** with two offers: 6 glow berries for 1 emerald, 1 emerald for 10 wheat, and an experience bar |
| Trade wheat twice | You get 2 emeralds and some experience orbs; the trade sound plays; the bar fills and the pedlar reaches **level 2**: a name tag for 5 emeralds appears |
| Buy both name tags | The pedlar reaches **level 3**: several of the wandering trader's wares appear |
| Buy the glow berries three times, close and reopen | The glow berry offer is crossed out (used up) |
| `/time add 12000`, then reopen | The glow berries can be bought again (restocked) |
| Save and quit, reload the world, use the pedlar | The same offers, level and experience as before |
| Hit the pedlar, then use it while it runs | No screen while it flees |

### The glassblower (a vanilla villager taking the job, the apron, restocking)

| Check | Expected |
|---|---|
| Place a **Glassblower Bench** near an unemployed villager (a villager spawn egg; no other job site nearby) | Within a minute the villager walks to the bench, green particles show, and it wears a **blue apron** over its clothes |
| Use the villager | A screen titled **Glassblower** with two offers: 1 emerald for 12 sand, 4 glass for 1 emerald |
| Trade until it levels up | Level 2 offers two mason's trades, as a mason villager would |
| Use up an offer, then wait for the villager to work at its bench (by day) | It plays the mason's work sound at the bench and the offer **restocks** (at most twice a day, as with any job) |
| Break the bench before trading with a new glassblower | The villager loses the job and the apron |
| Turn a glassblower into a zombie villager (a zombie on Hard, or `/summon zombie_villager ~ ~ ~ {VillagerData:{profession:"msm_sample_villagers:glassblower",level:1,type:"minecraft:plains"}}`) | The zombie villager wears the same blue apron |

### The pack mule (storage)

| Check | Expected |
|---|---|
| Place a Pack Mule, feed it apples until hearts show, then use it while sneaking | Nothing opens: it has no chest yet |
| Use a chest on it | The chest is taken (one only), with the chest sound |
| Use it while sneaking | A chest screen of **three rows**; put a few items in and close |
| Put a saddle on it, ride it, press the inventory key (E) | The same chest screen opens from the saddle |
| Save and quit, reload | The items are still there |
| Kill it (Survival) | The items and the chest drop |
| As a second player (on the server) who did not tame it, sneak and use it | The store does not open for them |

### The sugar glider (shoulder pet)

| Check | Expected |
|---|---|
| Place a Sugar Glider, feed it sweet berries until tamed, stand still near it | It walks to you and **jumps onto your shoulder**, and turns with you as you look round |
| Take damage (a fall of a few blocks), sneak, swim, sleep or ride a boat | It jumps down each time and does not come back for about five seconds |
| Change dimension (a Nether portal) | It stays behind, off your shoulder |
| A second tamed sugar glider | Only one sits on your shoulder at a time |
| On the server, another player watching | They see the glider on your shoulder, moving with you |

### Brine and molten amber (fluids)

| Check | Expected |
|---|---|
| Pour a Bucket of Brine on flat ground | A pale teal liquid that spreads seven blocks, slopes towards holes, and is drawn still on top and moving on the flowing sides (no purple and black squares) |
| Pour two brine sources one block apart | The gap fills with a new source; an empty bucket takes brine back |
| Swim in brine, stay under until out of air | You swim as in water, the screen is underwater-like, you drown when out of air, and you **glow** while in it |
| Walk into brine while burning | The fire goes out |
| Pour a Bucket of Molten Amber | An orange liquid that glows (light 12), spreads only 3 blocks and slowly (one block every half second), makes no new sources |
| Step into molten amber (Survival) | You catch fire and are hurt as in lava |
| A dispenser with each bucket, powered twice | It pours the source, keeps the empty bucket, then takes the source back into it |
| Let brine flow into lava, and molten amber into water | Note what forms: mixing with project fluids differs per version (a known limit) |

### The Glow Moon (the dimension's sky)

| Check | Expected |
|---|---|
| `/execute in msm_sample_villagers:glow_moon run tp @s 0 5 0` | A flat world of end stone under a **violet sky** with **stars by day** and the sun standing still low in the sky |
| Try to sleep in a bed there | You cannot sleep, but the bed sets your spawn |
| `/time set night` | The sky does not change (fixed time) |

Report anything that differs, with the version, singleplayer or server, and a screenshot.
