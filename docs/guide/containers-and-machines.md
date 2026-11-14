# Containers and machines

MCSuperMods makes blocks that hold items and blocks that work on them. A **container** is a block with slots, like a chest, a barrel, a hopper, a dispenser or a shulker box: a crate for loot, a storage box, a holder for one item. A **machine** is a block with an input, a fuel and an output slot that turns items into other items by recipes of your own, like a furnace: a grinder, a crusher, a faster furnace. Both are ordinary blocks with a Studio section, a Creator flow and templates, and both players and hoppers use them as they use vanilla blocks.

Containers and machines are part of the Fabric mod: export the **Fabric mod jar** ([Blocks and items](blocks-and-items.md#export-a-fabric-mod-jar)) or use **Test in Minecraft**. They need the runtime that ships with this release; an older runtime ignores them. The vanilla data and resource pack exports leave out what a vanilla game cannot read (see [Vanilla packs](#vanilla-packs)).

There are three ways to make one:

- the Creator's **Storage crate** or **Machine** flow (group **Blocks**);
- **Add element** (Ctrl+N) and a template under **Blocks**: **Storage crate**, **Small crate (1 row)**, **Item holder**, **Hopper box**, **Dispenser box**, **Grinder machine**, **Fast furnace** or **Redstone machine**;
- the **Inventory** section of the [Block Studio](blocks-and-items.md#the-block-studio), for a block you already have.

## Make a crate in the Creator

Open the Creator and choose **Storage crate** under **Blocks**. The defaults make a working crate called `supply_crate`: a 3-row chest that faces you when placed and is crafted from eight planks around a chest.

- **Crate**: **Crate name**, **Size** (**Small (1 row, 9 slots)**, **Medium (3 rows, 27 slots, as a chest)** or **Large (6 rows, 54 slots, as a double chest)**), **Keep contents when broken** (offered for the medium size only, see [Keep the contents](#keep-the-contents)), **Look** (**Wood (mined with an axe, as a barrel)** or **Stone (needs a pickaxe)**) and **Colour** for the placeholder pictures.
- **Recipe**: **Crafted from**, with **No recipe (creative menu only)** as the last choice.
- **Pictures**: **Front** and **Front when open**, or leave them empty for placeholders.

## Make a machine in the Creator

Choose **Machine** under **Blocks**. The defaults make a grinder: it burns fuel, grinds cobblestone into gravel, gravel into flint and a bone into four bone meal, and is crafted from a furnace.

- **Machine**: **Machine name**, **Colour**, **Power** (**Fuel**, **Redstone signal** or **Always**) and **Speed**.
- **Recipes**: **Also takes vanilla recipes** (**Smelting**, **Blasting**, **Smoking**, **Campfire cooking**) and **First recipe**, **Second recipe** and **Third recipe**, each chosen from a list such as **Cobblestone into gravel**, **Raw iron into two iron ingots** or **No recipe**. Open the result in the Block Studio to write more.
- **Crafting**: **Crafted from**.
- **Pictures**: **Front**, **Front when working**, **Sides and back** and **Top and bottom**.

## The Inventory section

Selecting a `block`, `pillar`, `horizontal` or `directional` block shows **Inventory** in the Block Studio, after **Light and sound**. **Holds items** chooses **None**, **Storage** or **Machine**. Switching is one undo step and removes the settings of the other choice, so switching back and forth loses what you wrote.

### Storage

- **Layout**: **Chest** (**Rows (1 to 6)** of nine slots), **Hopper (5 slots)**, **Dispenser (3 by 3)** or **No screen (holder)** (**Slots (1 to 9)**, no window: see [Holders](#holders)).
- **Keep contents when broken**, offered only for a **Chest** of 3 rows.
- **Hoppers can use it** (on by default) and **Comparators read it** (on by default).
- **Open sound** and **Close sound** (the barrel's by default) and the events **On open** and **On close**.

### Machine

- **Recipes it uses**: **Its own recipes**, plus any of **Smelting**, **Blasting**, **Smoking** and **Campfire cooking**.
- **Power**: **Fuel** burns fuel as a furnace does, **Redstone signal** works while the block is powered and **Always** works whenever it has an input.
- **Speed** (a multiplier: 2 is twice as fast) and **Default time (seconds)** for a recipe that does not give its own.
- **Screen**: **Furnace**, **Blast furnace** or **Smoker**, which only changes the look of the window.
- **Comparator**: **Contents**, **Progress** or **Nothing**; **Hoppers can use it**; **Light while working**; and the events **On start** and **On finish**.
- **Recipes**: a table with an ingredient (an item, a tag such as `#minecraft:wool` or a list of items), a count, the result and its count, a time in seconds and the experience paid out. Each row added or removed is one undo step.

The **Textures** section gains **Front when open** (containers) and **Front when working** (machines) for blocks that face the player, and the **Models** section gains `open` and `lit` slots. They show while a player has the container open and while the machine works.

## What the player sees

- A container opens the vanilla window of its layout: the chest screen, the hopper screen, the dispenser screen. A machine opens the furnace, blast furnace or smoker screen. Dragging, shift-clicking and the arrow and flame work as in vanilla.
- The window's title is the block's **Display name**, or the name given with an anvil.
- Hoppers put items into a container from above and take from it below. A machine takes its input from a hopper above, its fuel from hoppers at the sides (only with **Fuel** power) and gives its output to a hopper below. Turn **Hoppers can use it** off to keep hoppers away; commands and scripts still reach it.
- A comparator beside a container reads how full it is, as for a barrel; beside a machine it reads **Contents** or **Progress** as you chose.
- Breaking the block drops what it holds. A machine also drops the experience it has stored.
- A machine's experience is paid out when a player takes the output through the window. Output taken by a hopper keeps its experience in the block until a player takes an output or breaks it.

### Holders

A holder (**No screen (holder)**) has no window. Using it with an item in the hand puts the item in; using it with an empty hand takes the last stack out. It does not draw the item it holds (see [Limits](#limits)). It is useful for a pedestal or an altar whose events react to being used: **On open** runs on each use.

### Keep the contents

**Keep contents when broken** makes the crate behave like a shulker box: the block item keeps what is inside, and the crate cannot be put inside another such crate, a shulker box or a bundle. Hoppers do not put such items in either. It needs a chest of exactly 3 rows, because only the shulker box window refuses these items; the option is not offered for other layouts, and **Problems** reports `blocks-items.keep-contents-layout` if the file asks for it anyway.

### Loot in a crate

A container fills from a loot table on its first opening, as a vanilla chest does. Place one with a command such as `/setblock ~ ~ ~ <namespace>:supply_crate{LootTable:"<namespace>:chests/loot"}`. The example **Loot crate in a structure** shows it.

## Machine recipes

A machine recipe is a data file at `data/<namespace>/recipe/<machine>/<name>.json` with the machine's id as its `type`. You write them in the **Recipes** table; MCSuperMods writes the files. A recipe has an ingredient, a count (how many of the ingredient it uses), a result with a count from 1 to 99, a time and the experience. The recipe's name defaults to the result's name, with `_2` and `_3` added when two recipes give the same result. A machine takes one recipe at a time and shows the furnace arrow while it works.

A machine can also take the vanilla recipe types you tick under **Recipes it uses**: a **Fast furnace** that smelts at twice the speed is a machine that uses **Smelting** with **Speed** 2 and no recipes of its own.

## Templates, examples and scripts

The eight templates are listed under **Blocks** in [Templates, starters and examples](templates-and-examples.md#blocks). Three examples show the finished work: **Loot crate in a structure**, **Ore crusher** (a machine with three recipes and a hopper chain) and **Shulker crate**. The sample project `fixtures/sample-machines` in the repository has nine blocks with an in-game checklist.

Scripts can read and change any container, vanilla ones included, with `world.getContainer(pos)` (Script API 1.2, runtime 1.6.0 or later); see [Scripting](scripting.md#containers-and-machines-from-scripts). Container and machine events can also run a script with `run_script`.

## Vanilla packs

A machine recipe names a type that only the mod knows. A vanilla game cannot load it, and a data pack with one fails to load at all. The **Data pack** and **Combined pack** exports therefore leave machine recipes out, together with the crafting recipes and loot tables that name a block of your mod, and **Problems** lists each as `export.mod-only-reference`. Recipes of your machines that use vanilla types (smelting, say) for vanilla items stay in the pack.

## Problems it reports

| Code | Level | Meaning |
|---|---|---|
| `blocks-items.container-layout-fields` | Error | `rows` on a layout that is not a chest, or `size` on a layout that is not a holder. |
| `blocks-items.keep-contents-layout` | Error | **Keep contents when broken** on something other than a 3-row chest. |
| `blocks-items.container-event-unknown`, `blocks-items.machine-event-unknown` | Error | **On open**, **On close**, **On start** or **On finish** names an event the block does not declare. |
| `blocks-items.machine-and-container` | Error | Both a container and a machine on one block. A machine already has its three slots. |
| `blocks-items.machine-recipe-type-unknown` | Error | **Recipes it uses** names a type that is neither a machine of the project nor a cooking type. |
| `blocks-items.machine-recipe-item-unknown` | Error | A recipe names an item that is neither vanilla nor in the project. |
| `blocks-items.container-sound-unknown` | Warning | A sound that does not exist; the container is silent. |
| `blocks-items.machine-without-recipes` | Warning | The machine uses its own recipes and the project has none. |
| `blocks-items.machine-recipes-without-machine` | Warning | A block has `recipes` but is no machine, or its type cannot be one, so the recipes are not written. |
| `blocks-items.machine-time-range` | Warning | A time above 32767 ticks (see [Limits](#limits)). |
| `blocks-items.machine-fuel-unused` | Info | A machine with **Redstone signal** or **Always** power has a fuel setting that does nothing. |
| `blocks-items.component-not-for-type` | Error | A container or machine on a type that cannot have one (see [Limits](#limits)). |

## Limits

- **Vanilla windows only.** A container or machine opens one of the vanilla windows with vanilla textures. You cannot change the layout, the background or the progress bar; the title is the block's name. Windows of your own need client code that the project cannot check yet; it is on the backlog.
- **Three slots per machine.** One input, one fuel and one output. A recipe has one ingredient and one result: no byproducts, several inputs or several outputs.
- **Times and fuel stop at 32767 ticks** (about 27 minutes). The window sends 16-bit numbers, so a longer time or burn time would draw a wrong arrow or flame. The format caps a recipe time at 32767, and **Problems** warns about a **Default time (seconds)** or a recipe time above it. A fuel item that burns longer shows the wrong flame, as it does in vanilla.
- **Nothing is drawn on the block.** A holder does not show the item it holds, a chest lid does not swing, and a crate has no 3D parts of its own. Only the `open` and `lit` pictures change the look, with **Front when open** and **Front when working**.
- **The window may flicker.** The game predicts a machine's window with the furnace's rules and the server corrects it, so shift-clicking an item or putting fuel in can briefly show the wrong result before it settles.
- **The recipe book shows vanilla recipes.** The book button in a machine's window lists the furnace's recipes. Your machine recipes are not in the book or in recipe viewers such as JEI or REI; tell players the recipes some other way.
- **Keep contents needs 27 slots.** Only a 3-row chest can keep its contents (see [Keep the contents](#keep-the-contents)).
- **Only four block types.** Containers and machines are for `block`, `pillar`, `horizontal` and `directional`. Slabs, stairs, doors, fences and the other [family types](block-types-and-plants.md), crops and plants cannot be containers or machines.
- **Client and server must match.** The game reads each side's own copy of the definitions and compares only ids. In a modpack or on a server, update the client and the server with the same mod jar, or the two can disagree about a window or a recipe.
- **Fixed at start-up.** Adding a container or machine, or changing its layout or recipe types, needs a game restart. Recipes reload with `/reload`.
- **Shrinking loses items.** Lowering **Rows** or **Slots** on a block that is already in worlds deletes the items in the removed slots when the chunk loads. Removing the container or machine from a block that is in worlds drops its saved contents.
- **Many machines cost time.** Each working machine ticks like a furnace; hundreds running at once slow a server as hundreds of furnaces would.

## In the game

Export the **Fabric mod jar** or use **Test in Minecraft**; **Problems** must show no errors. Then, in a creative world:

- find the blocks in the creative inventory and place one. Open a crate, fill it, close it, break it and pick up the contents; put a hopper beside it and a comparator beside that;
- for a machine, put fuel and an input in, watch the arrow and flame, take the output and check the experience; open it with a hopper above and below it;
- for a keep-contents crate, break it with items inside and check that the block item keeps them.

## Troubleshooting

| Problem | What to do |
|---|---|
| The block is a plain block with no window | Check that the jar is in the `mods` folder and the game log's `[msm_runtime]` line counts no errors; it names a container or machine it had to drop, and why. |
| The log says a block entity type is already registered | The block's id clashes with another mod's block entity type. Rename the block. |
| The machine does nothing | Check the fuel (a **Fuel** machine), the redstone signal (a **Redstone signal** machine), and that the input matches an ingredient. The input must be at least the recipe's count. |
| The machine's recipes are missing | **Recipes it uses** has no **Its own recipes**, or the vanilla data pack was loaded instead of the mod: only the mod carries machine recipes. |
| Hoppers do nothing | **Hoppers can use it** is off, or the machine's power is not **Fuel** and the hopper is at its side. |
| A crate loses its items | **Rows** or **Slots** was lowered after items were stored (see [Limits](#limits)), or the container was removed from the block. |
| The data pack fails to load in a vanilla game | A machine recipe reached the vanilla pack. Use the project's export, which leaves it out, and look for `export.mod-only-reference` in **Problems**. |
