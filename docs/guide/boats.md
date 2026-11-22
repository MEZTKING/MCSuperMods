# Boats

A **boat** of your own is an item that places a boat on water, as Minecraft's oak or cherry boats do: you paddle it, two can ride it, it slides on ice and it breaks back into its item. A boat can come with a **chest boat** beside it, and it can be a **raft**, shaped like the bamboo raft. Boats are drawn exactly like Minecraft's, with the pictures of your wood.

A boat is an item with the **Boat** part (`msm:boat`). It needs the **Fabric mod jar** and works on both Minecraft versions, 26.3 and the 26.4 snapshot; a vanilla pack leaves it out ([Vanilla packs](#vanilla-packs)).

## Make a boat

There are three ways:

- the Creator's **Wood set** flow, with the answer **Has boats** (off by default): it makes `<wood>_boat` and `<wood>_chest_boat` with their item pictures, the boat pictures drawn by MCSuperMods in your wood colour, the recipes and the tags. The boats need the set's planks, so keep **Planks** among **Blocks in the set**;
- **Add element** (Ctrl+N), the template **Boat and chest boat**: a boat you paddle and ride as vanilla boats, with a chest boat beside it. It is drawn as an oak boat until you give it your own wood pictures, and it is crafted from your wood planks, so make a wood set of the same name for them;
- the example **Willow boats**.

Selecting a boat opens the Item Studio.

## The Boat section

In the Item Studio, **Boat** has a switch, **A boat (rides on water, as Minecraft's boats do)**. Switched on, using the item on water places the boat. Boats stack to one.

- **Has a chest boat** adds a chest boat, `<wood>_chest_boat`, where `<wood>` is the boat's name without "_boat" (`maple_boat` gives `maple_chest_boat`). Its item is in the same creative tab as the boat. **Chest boat name** is its name; empty gives the boat's name with " with Chest".
- **Raft (shaped like the bamboo raft)** makes it a raft; its chest companion is then `<wood>_chest_raft`.
- **Wood pictures (empty: named after this boat's wood)** names the wood whose pictures it is drawn with. Naming one of Minecraft's woods, such as `minecraft:oak`, borrows its boat pictures from your game.
- **Boat picture (128 by 64)**, **Chest boat picture (128 by 128)** and **Chest boat item picture**. The game reads the boat pictures from a fixed place, `textures/entity/boat/<wood>.png` and `textures/entity/chest_boat/<wood>.png`: a picture stored elsewhere is copied there in the same undo step, and **Copy the pictures to where the game looks** does it for older pictures. The boat item's own picture is the item's model, as for any item.

MCSuperMods writes the boat's recipe (five of `<wood>_planks` in a U, as vanilla's), the chest boat's recipe (the boat and a chest), and puts them in the `#minecraft:boats` and `#minecraft:chest_boats` tags, so anything that takes a vanilla boat takes yours.

A boat item cannot also be a tool, a weapon, armour, a shield, a throwable, food, a drink, a bag or a bundle: each of those uses the item in its own way.

## How it behaves

A boat of yours is Minecraft's boat under your name: paddling, speed, ice, two seats, mobs that get in, breaking it with a few hits, and the chest boat's chest screen are all vanilla's. A dispenser places it on water, as it does vanilla's boats. It floats on Minecraft's water and on a water-like [fluid](fluids.md) of yours.

A boat is placed only where its whole box touches no block, which is Minecraft's own rule: aim at open water (or open ground), not at a spot against a wall or a bank. If nothing happens when you use the item, move a block away and try again.

## Problems

**Problems** says, in plain words: a chest boat whose name another thing in your mod already has (rename one), a boat whose planks are missing (the recipe cannot be made: make `<wood>_planks`, as the Wood set does), a boat or chest boat with no picture (it is drawn with the missing-picture pattern: draw it, or name a Minecraft wood), boat pictures or a chest boat name on an item that is not a boat or has no chest boat (they are left out), a boat with another use of its own, and a boat that stacks to more than one. In Very easy mode they appear in **Things to fix**.

## Vanilla packs

A boat is not in the resource or data pack exports: it needs the runtime. Its items, recipes and tag entries are mod-only; the export says so. The [Java project export](eject.md) (Minecraft 26.3) includes boats and chest boats, with their renderers.

## Check it in Try it

[Try it](try-it.md) places your boats and chest boats on water as the preview's water vehicles, with two seats, and a hit picks them up. They are drawn as wood-coloured boxes the size of an oak boat, not with your pictures, and they do not move with the game's boat physics.

## The in-game check

Press **Play** (or export the Fabric mod jar) and, in a creative world:

1. Find the boat and the chest boat in their tab, place them on water and ride them; check your pictures from the side and from above.
2. Open the chest boat's chest while riding and while standing beside it.
3. Craft both from the recipes, and put a boat in a dispenser facing water.
4. A boat on a pool of your water-like fluid. On 26.4 a boat may slow near the edge of the pool's source blocks: say so if it does.
5. The log: `[msm_runtime]` says `registered N boat type(s)`, and on the client `boat renderers for N boat type(s)`.

## Limits

- **Boats need the Fabric mod jar.** They are an entity type and a renderer of the runtime, not something a vanilla pack can hold.
- **A new boat needs a restart.** Boats are registered when the game starts; Play restarts it for you.
- **A boat and a raft of the same wood share one look.** The first one decides it, and the game log says so.
- **Looks are in-game checks.** How the pictures sit on the boat is best checked in the game.

## Where next

- [Fluids](fluids.md) for a liquid your boats float on.
- [Block types and plants](block-types-and-plants.md) for the Wood set's other blocks.
- The other chapters are listed in the [user guide](/).
