# Sample machines project

A kitchen-sink MCSuperMods project for containers and machines (ADRs 0074 to 0076), namespace `msm_sample_machines`: an `msm:mod`, nine blocks (six storage blocks and three machines), one loot table, one function that places a loot crate and seven one-line `say` functions. The textures are the library's placeholder pictures and the holder has a small cube model of its own. It works on **26.3** and on **26.4**. Its siblings are `fixtures/sample-mod/` (blocks and items) and `fixtures/sample-creatures/` (mobs).

`packages/exporters/test/sample-machines.golden.test.ts` checks it on every run: the folder equals the project built in code, every element validates with zero problems, and the content jar exports for both targets with its SHA-256 pinned per target. `sample-machines.java.golden.test.ts` pins the Java project export of 26.3. The vanilla data pack keeps the `say` functions, the chest loot table and the mining tags, and leaves out the four grinder recipes and the nine block loot tables (they name mod-only things); `place_loot_crate` is kept with a warning because it names a mod block. This README is the one file in the folder that is written by hand; the test leaves it alone.

CI's `engine-mod` job exports the project with the real runtime and starts a headless Fabric server on 26.3 and on 26.4 (`tools/run-fabric-server`). The server must log `[msm_runtime] registered 9 block entity type(s) and 3 machine recipe type(s)` and `registered 9 block(s) and 9 item(s) from 9 definition file(s); 0 error(s), 0 warning(s)`. The server draws nothing and opens no screen, so how the blocks look and how their screens feel is left to the in-game check below.

## Contents

| Element | Kind | What it shows |
|---|---|---|
| `msm_sample_machines:mod` | mod metadata | `fabric.mod.json`: id `msm_sample_machines` |
| `msm_sample_machines:crate` | block | a directional storage block with the chest screen, 3 rows (27 slots); opens with the barrel sound; `on_open` says `The crate is opened.` and `on_close` says `The crate is closed.`; the front picture changes while it is open |
| `msm_sample_machines:small_crate` | block | a horizontal chest with 1 row (9 slots); open picture on the front |
| `msm_sample_machines:keep_crate` | block | a directional 3-row chest that keeps its contents when broken (like a shulker box); chest open and close sounds |
| `msm_sample_machines:hopper_box` | block | a pillar with the hopper screen (5 slots); comparators switched off |
| `msm_sample_machines:dispenser_box` | block | a directional block with the dispenser screen (3 by 3 slots) |
| `msm_sample_machines:holder` | block | no screen: right-click puts one item in, right-click with an empty hand takes it out; 1 slot; `on_open` says `The holder is used.` on each use; its own cube model |
| `msm_sample_machines:grinder` | block | a horizontal machine burning fuel with its own recipe type, default time 40 ticks (2 seconds); four recipes: cobblestone to gravel, gravel to flint (20 ticks, experience 1), bone to 4 bone meal, two wool of any colour to 4 string; says `The grinder starts.` and `The grinder finishes.` |
| `msm_sample_machines:fast_furnace` | block | a horizontal machine using vanilla smelting recipes at speed 2 (raw iron in 100 ticks instead of 200); says `The fast furnace finishes.` |
| `msm_sample_machines:redstone_grinder` | block | a horizontal machine powered by redstone instead of fuel; uses the grinder's recipes; blast furnace screen; the comparator reads the progress; light 15 while working; says `The redstone grinder finishes.` |
| `msm_sample_machines:chests/crate_loot` | loot table | 3 diamonds and 5 bread, fixed |
| `msm_sample_machines:place_loot_crate` | function | places a crate whose contents come from the loot table (`setblock ~ ~ ~ msm_sample_machines:crate{LootTable:"msm_sample_machines:chests/crate_loot"} replace`) |
| `msm_sample_machines:say/*` | functions | `crate_opened`, `crate_closed`, `holder_used`, `grinder_started`, `grinder_finished`, `fast_furnace_finished`, `redstone_grinder_finished`: each is one `say` line that tells you its event ran |

All content is original work written for MCSuperMods; the project contains no Mojang files.

## In-game check (Windows, Minecraft Java 26.3 and 26.4)

Do the whole list twice, once per version.

- **26.3:** the 26.3 content jar, Fabric Loader 0.20.1 or newer and Fabric API 0.165.2+26.3 (or newer for 26.3). The jar contains `msm_runtime`; do not install it separately.
- **26.4:** the 26.4 jar (the app exports it when the project target is 26.4), with Fabric Loader 0.20.1 and Fabric API 0.165.4+26.4 (the 26.4 target's facts). The jar contains `msm_runtime` only.

**Get the jar**, either way:

- from the latest CI run: Actions, CI, the run, Artifacts, then unzip the sample machines jar; or
- from the app: copy this folder outside the repository, open it in MCSuperMods, choose the target and export the Fabric mod jar (runtime nested, the default).

**Install it** with Prism Launcher as described in `fixtures/sample-mod/README.md`, with `msm_sample_machines.jar` in place of `msm_sample_mod.jar`. Create a new **Creative** world with cheats on. All blocks are in the **Functional Blocks** creative tab except the **Sample Redstone Grinder**, which is in **Redstone Blocks**. Or use `/give @s msm_sample_machines:crate` (and the same for the other names).

Things you meet here that are limits of this feature, not faults, are marked "known limit". Report them only if they look different from what is written.

### Loading

| Check | Expected |
|---|---|
| Title screen, **Mods** | `MSM Sample Machines` and `MSM Runtime` |
| `logs/latest.log` | The lines `[msm_runtime] registered 9 block entity type(s) and 3 machine recipe type(s)` and `registered 9 block(s) and 9 item(s) from 9 definition file(s); 0 error(s), 0 warning(s)`, and nothing at warning or error level from `msm_runtime` |
| Creative tab **Functional Blocks** | Sample Crate, Sample Small Crate, Sample Keeping Crate, Sample Hopper Box, Sample Dispenser Box, Sample Holder, Sample Grinder and Sample Fast Furnace |
| Creative tab **Redstone Blocks** | Sample Redstone Grinder |

### Storage blocks

Place each block and right-click it.

| Check | Expected |
|---|---|
| Sample Crate: right-click | The chest screen opens with 3 rows. The title is the block's name, `Sample Crate`. The chat line `The crate is opened.` appears |
| Sample Crate: close the screen | The chat line `The crate is closed.` appears |
| Sample Crate: the pictures | While the screen is open (ask a friend, or watch from a second window) the front shows the open picture; it returns to the closed one when the screen closes. Only the block's picture changes: there is no lid animation (known limit) |
| Sample Crate: sound | The barrel's open and close sounds (the default) |
| Sample Crate: put things in, break it, pick up | The contents drop out as items |
| Sample Small Crate | The chest screen with 1 row (9 slots); the open picture shows while it is open |
| Sample Keeping Crate: fill it, break it in **Survival** with a pickaxe | The contents do not spill; they stay inside the dropped block, like a shulker box, and its tooltip shows the contents |
| Sample Keeping Crate: break it in **Creative** | A full block drops (the contents kept), without your mining it twice |
| Sample Keeping Crate: place the kept block again | The contents are back |
| Sample Keeping Crate: put a shulker box or another Sample Keeping Crate in it | Refused, in the screen and through a hopper, as vanilla's shulker box refuses containers |
| Sample Keeping Crate: sound | The chest's own open and close sounds |
| Sample Hopper Box | The hopper screen with 5 slots; it is a pillar, so it lies along the face you click |
| Sample Hopper Box: a comparator beside it | No signal, however full the box is (comparators are switched off on purpose) |
| Sample Hopper Box: a hopper above it, items in the hopper | Items fall into the box; a hopper below it draws them out |
| Sample Crate with a comparator beside it | The signal grows with how full the crate is, like a chest; report if it differs from a vanilla barrel holding the same items |
| Sample Dispenser Box | The dispenser screen (3 by 3 slots). It does not shoot items when powered: it only stores them (known limit; it is a container, not a dispenser) |
| Sample Crate with a hopper pointing into it, or out of it | Items move in and out as with a vanilla chest |

### The holder

| Check | Expected |
|---|---|
| Right-click the Sample Holder with a stack of cobblestone | One stack goes in (up to the item's stack limit), and the chat line `The holder is used.` appears |
| Look at the holder | It looks the same as before; it does not show what it holds (known limit, C9: nothing is drawn by a block entity) |
| Right-click it again with an empty hand | The stack comes back to your inventory (or drops at your feet if your inventory is full), and the chat line appears again |
| Right-click with a different item while it holds one | Nothing goes in: it has one slot |
| Break the holder while it holds something | The item drops |
| Hopper above and below | Items go in and out as with a one-slot container |

### Machines

The grinder, the fast furnace and the redstone grinder use the furnace screen. Where a screen is the vanilla furnace or blast furnace, the title is the block's name, not "Furnace".

**Sample Grinder** (fuel):

| Check | Expected |
|---|---|
| Right-click | The furnace screen opens with the title `Sample Grinder` |
| Put cobblestone in the top slot with no fuel | Nothing happens |
| Put coal in the fuel slot | The flame lights, the arrow fills over about 2 seconds, the chat line `The grinder starts.` appears, and the front changes to the lit picture |
| Wait | A gravel appears in the output slot and the line `The grinder finishes.` appears. The front returns to the unlit picture when the fuel runs out |
| Gravel in the input | Flint in 1 second (20 ticks), and 1 experience point when you take it out |
| A bone | 4 bone meal |
| One wool, of any colour | Nothing (two are needed) |
| Two wool, of any colour (also mixed colours) | 4 string |
| An item with no recipe (a stick) | Stays in the input and nothing happens |
| Smelt something a vanilla furnace smelts (raw iron) | Nothing: the grinder uses only its own recipes (known limit: it does not smelt) |
| Shift-click an item from your inventory | It goes to the input slot, or the fuel slot for fuel. It may flicker for a moment before the server corrects it (known limit, C10: the client guesses with the vanilla furnace rules) |
| The recipe book button (the green book in the screen) | It lists vanilla smelting recipes only; the grinder's own recipes are not in the book (known limit, C11) |
| A hopper above | Feeds the input; a hopper beside it feeds the fuel; a hopper below draws the output only, never the input or the fuel |
| Break it while it works | The input, fuel and output drop |
| Place it facing different ways | The front faces you; a lit machine shows the lit picture on the front |

**Sample Fast Furnace** (fuel, vanilla smelting recipes at twice the speed):

| Check | Expected |
|---|---|
| Put raw iron and coal in | The iron ingot is ready in about 5 seconds (100 ticks), against 10 seconds in a vanilla furnace. Compare the two side by side |
| Put in sand, a raw cod, a cobblestone | Glass, cooked cod and stone: the vanilla furnace recipes work; blasting and smoking recipes do not (only smelting is listed) |
| Experience | Taking out an iron ingot gives the same experience as a vanilla furnace |
| The recipe book | The vanilla smelting recipes appear and can be clicked to fill the grid (this is vanilla's own book) |
| The line `The fast furnace finishes.` | Appears when an item is done |
| Compare with a vanilla furnace | The arrow and the flame behave the same, only faster |

**Sample Redstone Grinder** (redstone power, grinder recipes):

| Check | Expected |
|---|---|
| Right-click | The blast furnace screen opens with the title `Sample Redstone Grinder` |
| Put cobblestone in, with no redstone nearby | Nothing happens: the fuel slot is not used |
| Put a block of redstone, a lever or a powered rail next to it, or switch a lever on | The arrow fills (about 2 seconds), the front changes to the lit picture, the block gives light 15, and the line `The redstone grinder finishes.` appears with gravel in the output |
| A comparator beside it | The signal grows as the arrow fills (comparator reads the progress), and is 0 when idle |
| Put gravel and a bone in | It does flint and bone meal, the same as the grinder |
| Raw iron | Nothing: it uses the grinder's recipes only, not smelting |
| Switch the power off in the middle of a recipe | Report what the arrow does (it should not keep grinding) |
| Shift-click | The same as the Sample Grinder |
| A hopper below | Draws the output |

### Loot crate

| Check | Expected |
|---|---|
| Stand in a clear spot and run `/function msm_sample_machines:place_loot_crate` | A Sample Crate appears at your feet, facing its default direction (the function writes no facing) |
| Open it | 3 diamonds and 5 bread, in random slots; the loot is made when you first open it |
| Close it and open it again | The same contents; nothing is added a second time |
| Break it | The contents drop |
| Run the function again somewhere else | A fresh crate with fresh loot |

### Saving, commands and the world

| Check | Expected |
|---|---|
| Fill a crate and a grinder mid-recipe, save and quit, load the world | The crate keeps its items; the grinder keeps its input, its fuel, its progress and the flame |
| `/data get block <x> <y> <z>` on a crate | `Items` lists the slots; on a machine it also shows `lit_time_remaining`, `cooking_time_spent` and the others |
| `/setblock ~ ~ ~ msm_sample_machines:crate` then right-click | A working crate (an empty one) |
| Run `/reload` with a machine working | Recipes reload; the machine carries on. Adding a new machine or changing a layout needs a game restart (known limit, C2) |

### Modpack and servers

Machines and containers are read from the jar on each side, so the client and the server must have the same jar.

| Check | Expected |
|---|---|
| A dedicated Fabric server on the same version with the jar in `mods`, and your client with the same jar, joined together | Joins without errors; screens, recipes and the open and lit pictures work as in single player |
| Server jar one build older than the client | Report what you see; this is not supported (known limit, C14: update both together) |
| Two players at one crate | Both see the same contents; changes show for both at once, and the open picture stays until both have closed it |
| A modpack with the jar and another mod that moves items by pipe (if you have one) | The pipes reach the crates through the same faces as hoppers |
| Vanilla data pack built from the project, on a vanilla server | The world loads without errors; the machine recipes and the machine blocks are left out of it (they need the jar) |

### On 26.4 specifically

| Check | Expected |
|---|---|
| Title screen, **Mods** | `MSM Sample Machines` and `MSM Runtime` |
| Everything above | Looks and behaves like 26.3 |
| `logs/latest.log` | The same two lines about block entity types and blocks, and nothing at warning or error level from `msm_runtime` |

Things only the game client can confirm, and worth reporting if they look wrong: the title and layout of each screen, the open and lit pictures and when they change, the sounds, the flicker when shift-clicking into a machine, the recipe book button, how the holder looks, the contents of a kept crate, the experience a machine pays, and anything that differs between 26.3 and 26.4.

## Changing the sample

Do not edit the generated files by hand. Change the elements in `packages/exporters/test/sample-machines.golden.test.ts`, then regenerate this folder and the pinned hashes, and commit the changes on purpose:

```sh
UPDATE_GOLDENS=1 pnpm --filter @msm/exporters test
```

To build the jar with the real runtime locally and run the headless server check as CI does (JDK 25 on `JAVA_HOME`; the paths must be absolute because the test runs in `packages/exporters`):

```sh
cd engine-mod && ./gradlew build && cd ..
MSM_RUNTIME_JAR="$(ls "$PWD"/engine-mod/build/libs/msm_runtime-*.jar | grep -v sources)" \
  MSM_SAMPLE_MACHINES_OUT="$PWD/build/sample-machines" \
  pnpm --filter @msm/exporters exec vitest run test/sample-machines.golden.test.ts
node tools/run-fabric-server/index.ts --jar build/sample-machines/msm_sample_machines.jar --facts build/sample-machines/fabric-facts.json
```

`MSM_SAMPLE_MACHINES_JAVA_OUT` writes the ejected Java project; it builds with its own `./gradlew build`.

This README is not generated and is kept as it is.
