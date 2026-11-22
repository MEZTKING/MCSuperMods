# Sample plants and storage project

A kitchen-sink MCSuperMods project for batch 1 of vanilla parity 3 (ADRs 0103 to 0105, ADR 0112 D4), namespace `msm_sample_plants`: an `msm:mod`, plants that grow in long strands, tall stalks, a glow-lichen-like moss and dripleaf-like leaves, a flower pot of its own, bronze that ages like copper on six more block types, chests that join into a double chest, that are different for every player, that hold water and that age with their contents, a block and a door with sounds of their own, loam a shovel flattens and a hoe tills, and rules for vanilla blocks. The pictures are MCSuperMods' own (the library's placeholder pictures, drawn by the golden test); the pot's item uses vanilla's flower pot picture and the potted grass vanilla's grass, both named and taken from your own game, never bundled; nothing in the folder is a Mojang file. It works on **26.3** and on **26.4**. Its siblings are `fixtures/sample-vanilla-blocks/` (vanilla parity 2, batch 1) and `fixtures/sample-villagers-and-fluids/` (vanilla parity 2, batch 2).

`packages/exporters/test/sample-plants-and-storage.golden.test.ts` checks it on every run: the folder equals the project built in code, every element validates with zero problems, the project expands with no problems and the plugins' validators report nothing at all on either target, and the content jar exports for both targets with zero problems and its SHA-256 pinned per target. The jar holds the 40 block definitions and the rules for vanilla blocks under `msm/msm_sample_plants/`, the companions' block states (`sea_ribbon_plant`, `glow_vine_plant`, `climbing_ivy_plant`, `reed_bamboo_shoot`, `wide_leaf_stem`, `clay_planter_dandelion`, `clay_planter_poppy`, `clay_planter_oak_sapling`) and, on 26.4, a `block_sound_set` entry for each block with own sounds. The vanilla data pack leaves out the loot tables (they name the project's blocks, `export.mod-only-reference`) and keeps the vanilla tags it joins with optional entries. `sample-plants-and-storage.java.golden.test.ts` checks the Java project eject (26.3): everything but the rules for vanilla blocks, which it leaves out with one `export.not-in-eject` warning. This README is the one file in the folder that is written by hand; the tests leave it alone.

To get a jar for the headless server check, run the golden test with `MSM_RUNTIME_JAR=<a built msm_runtime jar>` and `MSM_SAMPLE_PLANTS_OUT=<folder>` (and `MSM_TARGET_ID=mc-26.4` for 26.4): it writes `msm_sample_plants.jar` and `fabric-facts.json` (40 blocks, 39 items) there. `MSM_SAMPLE_PLANTS_JAVA_OUT=<folder>` with the Java golden writes the ejected project with the Gradle wrapper. The parity GameTests (`engine-mod/parity`, `SamplePlantsAndStorageParityTest` and `SamplePlantsAndStorageRulesParityTest`) run against both content jars and the 26.3 ejected jar in CI.

## Contents

| Element | Kind | What it shows |
|---|---|---|
| `mod` | mod metadata | `fabric.mod.json`: id `msm_sample_plants` |
| `sea_ribbon` | growing plant, up, lives in water | **kelp-like**: grows upward in water, a strand (`sea_ribbon_plant`) under its tip; bone meal adds one block; cannot be placed out of water |
| `glow_vine` | growing plant, down, berries | **cave-vine-like**: hangs from a ceiling and grows down; bone meal ripens its **Glow Vine Berries** (light 14 while ripe); an empty hand picks them. Its item is the berries |
| `climbing_ivy` | growing plant, up, climbable | **twisting-vine-like**: grows up in air; you can climb it |
| `dune_reed` | column plant, cane | **sugar-cane-like**: on sand or dirt beside water, grows three high |
| `spine_cactus` | column plant, cactus | **cactus-like**: on sand, grows four high, hurts by 2 (vanilla's cactus by 1), breaks with a block beside it |
| `reed_bamboo` | column plant, bamboo | **bamboo-like**: its item plants a shoot (`reed_bamboo_shoot`) that grows into a stalk with leaves |
| `glow_moss` | multiface | **glow-lichen-like**: on any face, light 7, spreads with bone meal |
| `wide_leaf`, `small_wide_leaf` | dripleaf, big and small | **dripleaf-like**: the big leaf tips when you stand on it and grows a stem (`wide_leaf_stem`) by bone meal; the small one is two blocks high and grows into the big one by bone meal |
| `clay_planter` | flower pot | a **flower pot of its own** that takes a dandelion, a poppy and an oak sapling (`clay_planter_<plant>`) and nothing else; vanilla's pot is unchanged |
| `clay_planter_grass` | potted plant | short grass (which vanilla does not pot) in the clay planter; no item |
| `bronze_<type>`, `exposed_bronze_<type>`, `waxed_bronze_<type>` | rod, button, pressure plate, fence, fence gate, wall | **bronze that ages like copper** on six more types: unaffected ages into exposed; honeycomb waxes it, an axe takes the wax off or scrapes it back; lightning scrapes it |
| `twin_crate` | horizontal, container | joins with a second one beside it into a **double chest** (one six-row menu) |
| `private_crate` | container | **different for every player**: each player sees their own three rows, as an ender chest |
| `sea_crate` | container, waterloggable | two rows that **hold water** |
| `bronze_chest`, `exposed_bronze_chest`, `waxed_bronze_chest` | horizontal, container | a joinable chest that **ages like copper with its contents** (both halves together) |
| `chime_stone` | block | breaks, steps and is placed with the **amethyst sounds** (`block_sounds`) |
| `creaky_door` | door, own set type | an iron-based door that **opens by hand** with its own sounds (iron door opening, chest closing) |
| `loam`, `loam_path`, `loam_farmland` | blocks | a **shovel flattens** loam into a path and a **hoe tills** it into farmland, dropping a stick |
| `farm_rules` | rules for vanilla blocks | an axe strips mossy cobblestone and mossy stone bricks, a shovel flattens mud into packed mud, a hoe tills a moss block into dirt and leaves a moss carpet, brown and red mushroom blocks burn (Fabric mod jar only; not in the Java project) |
| `block/*` | models | cube models of the plain blocks |

All content is original work written for MCSuperMods; the project contains no Mojang files.

## In-game check (Windows, Minecraft Java 26.3 and 26.4)

Do the whole list on **26.3** and on **26.4**, in **singleplayer**; the double chest, the private crate and the door also on a **dedicated server** with two players. Use the Fabric Loader and Fabric API versions the app shows for each target. The jar contains `msm_runtime`; do not install it separately.

**Get the jar**, either way:

- from the latest CI run: Actions, CI, the run, Artifacts, then unzip `msm-sample-plants-mc26.3` or `msm-sample-plants-mc26.4` (the ejected 26.3 jar is in `msm-ejected-jars-mc26.3`); or
- from the app: copy this folder outside the repository, open it in MCSuperMods, choose the target and export the Fabric mod jar (runtime nested, the default).

**Install it** with Prism Launcher as described in `fixtures/sample-mod/README.md`, with `msm_sample_plants.jar` in place of `msm_sample_mod.jar`. For the server, put the same jar and Fabric API in the server's `mods` folder. Create a new **Creative** world with cheats on; a superflat world is easiest. Switch to Survival (`/gamemode survival`) where a check says so.

### Loading

| Check | Expected |
|---|---|
| Title screen, **Mods** | `MSM Sample Plants and Storage` and `MSM Runtime` |
| `logs/latest.log` (on the server its console) | `[msm_runtime] registered 40 block(s) and 39 item(s) from 41 definition file(s); 0 error(s), 0 warning(s)`, `pot msm_sample_plants:clay_planter: registered 3 potted plant(s) of 3 listed`, `registered 6 vanilla block rule(s) from 1 file(s)`; nothing at warning or error level from `msm_runtime` (on 26.4 no "so the block makes no sound"), no `NoClassDefFoundError` |
| Creative inventory search `msm_sample` or by name | every block above with a picture (no purple and black squares) and its name, no `block.msm_sample...` keys |

### Plants

| Check | Expected |
|---|---|
| Dig a hole two deep, fill it with water, place a **Sea Ribbon** on the bottom, use bone meal on it twice | It grows two blocks, drawn as a strand with a tip on top, and stays in water. Placing one on dry ground does nothing |
| Place a **Glow Vine** under a block, use bone meal on it | Orange berries appear and it **glows**; an empty hand picks a **Glow Vine Berries** and the light goes out |
| Place **Climbing Ivy** on the ground, `/gamerule randomTickSpeed 100`, wait | It grows upward; you can climb it like a ladder. Set the speed back to 3 |
| A **Dune Reed** on sand beside water, a **Spine Cactus** on sand (with the fast ticks) | The reed stops at 3, the cactus at 4. Touching the cactus hurts more than vanilla's; a block beside the cactus breaks it |
| Use **Reed Bamboo** on dirt, then bone meal | A small shoot, then a stalk with leaves |
| Place **Glow Moss** on a wall and the floor, use bone meal | It hugs the faces, glows faintly (light 7) and spreads to faces nearby |
| Place a **Small Wide Leaf** on moss, use bone meal; stand on a **Wide Leaf** | The small one is two blocks high and grows into a wide leaf on a stem; standing on the wide leaf tips it and drops you after a moment, then it comes back up |
| Use a dandelion on a **Clay Planter**, then an empty hand; try an allium | The dandelion goes in and is drawn in the planter; an empty hand takes it back; the allium does not go in. Breaking a planted planter (Survival) drops the planter and the plant. Vanilla's flower pot still works as before |

### Bronze (ageing like copper, lightning)

| Check | Expected |
|---|---|
| Place each bronze type (rod, button, pressure plate, fence, fence gate, wall), `/gamerule randomTickSpeed 1000`, wait | Each turns into its **exposed** look, keeping its facing, open state and connections; the exposed and waxed ones never change |
| Honeycomb on a bronze block, then an axe; an axe on an exposed block | Waxed (wax particles), wax off, scraped back to unaffected, each with vanilla's copper particles and sounds |
| A row of exposed bronze walls, `/summon lightning_bolt` on one | The struck wall and a few neighbours go back towards unaffected; waxed ones are left alone |

### Storage

| Check | Expected |
|---|---|
| Place two **Twin Crates** side by side, open one | They join into one block with **one six-row menu** ("Large Chest"); breaking one half drops only its own items |
| Two players (server) each open the **Private Crate** and put different items in | Each sees only their own items; the block itself drops nothing it holds |
| Sneak and pour a water bucket on a **Sea Crate**, open it | It holds water and opens its **two rows**; breaking it leaves the water |
| Two **Bronze Chests** side by side with items, fast random ticks | Both halves age together into Exposed Bronze Chests and keep their items; honeycomb waxes the chest |

### Sounds and pairs

| Check | Expected |
|---|---|
| Place, walk on and break a **Chime Stone** | Amethyst sounds |
| Open and close the **Creaky Door** with your hand | It opens by hand (unlike an iron door) with the iron door sound and closes with a chest's closing sound |
| A shovel and a hoe on **Loam** (air above) | Loam Path, then Loam Farmland and a stick; nothing with a block on top |
| An axe on mossy cobblestone and mossy stone bricks, a shovel on mud, a hoe on a moss block | Cobblestone, stone bricks, packed mud, dirt and a moss carpet; vanilla's own pairs (a log stripped, dirt tilled) unchanged |
| Fire on a brown mushroom block | It burns away (vanilla's does not) |

Report anything that differs, with the version, singleplayer or server, and a screenshot.
