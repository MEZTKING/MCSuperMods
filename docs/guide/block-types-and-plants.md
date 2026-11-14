# Block types, families and plants

A plain block is a cube. MCSuperMods also makes the blocks that behave like vanilla's families: logs that turn to the face you place them against, slabs, stairs, walls, fences, gates, doors, trapdoors, buttons, pressure plates and panes, and the plants: crops that grow in stages, saplings that grow a tree of your own and leaves that decay. Each one is a real vanilla block class in the game, so it connects, turns, opens and breaks the way its vanilla relative does.

You make them in two ways:

- the Creator's flows **Wood set**, **Stone set**, **Crop** and **Tree** (group **Blocks**) build a whole family with its recipes, tags and textures in one step;
- the Block Studio's **Type** section turns a single block into one of the types, and 17 templates under **Blocks** start one (see [Templates, starters and examples](templates-and-examples.md#blocks)).

New blocks exist only in the **Fabric mod jar** export ([Blocks and items](blocks-and-items.md#export-a-fabric-mod-jar)) and need the runtime of MCSuperMods 1.5.0 or later; an older runtime registers every typed block as a plain cube. See [Vanilla packs](#vanilla-packs) for what the resource and data pack exports keep.

## The four flows

Open **Create…** on the toolbar and pick a flow under **Blocks** (see [The Creator](creator.md)). Every flow draws placeholder textures in the colours you choose, or takes a square PNG of your own for each texture under **Pictures** (16 by 16 as vanilla, up to 256 by 256). A set is one undoable step, and **Edit in Creator** on any of its members changes the answers later: members you switch off are removed only if you have not edited them.

### Wood set

A whole kind of wood. **Wood**: **Wood name** ("Maple" gives `maple_log`, `maple_planks`, `maple_tree`), **Wood colour**, **Leaf colour**. **Members**: **Blocks in the set** (log, wood, stripped log, stripped wood, planks, stairs, slab, fence, fence gate, door, trapdoor, button, pressure plate, leaves and sapling), **Kind of wood** (the sounds of every block and of the door, trapdoor, button and pressure plate: oak-like, cherry, bamboo, crimson or warped) and **Fence gate sounds** (the vanilla wood whose gate sounds the gate makes). **Tree**: **Leaf colour in the world** (**Own colours** or **Biome foliage colour**), **Tree shape**, **Grows in the world**, **Biomes** and **Trees per chunk**.

The set comes with the vanilla recipes (planks from a log, the others from planks), the vanilla tags (`logs`, `planks`, the wooden stairs, slabs, fences, doors and so on, and `logs_that_burn`), axe stripping of logs and wood, the vanilla burn odds of each member, composting for the leaves and sapling, and the tree, a sapling that grows it and, if you leave **Grows in the world** on, a placed feature and a biome addition that grow it in newly generated chunks of the biomes you pick.

### Stone set

A new stone with its **Stone name**, **Colour**, **Pickaxe needed** and **Stone crafted from**. **Blocks in the set** has the stone, stairs, slab and wall by default, and also a button, a pressure plate, polished stone (with its own stairs, slab and wall), bricks and a pillar. Crafting and stonecutting recipes come with it.

### Crop

A crop that grows on farmland. **Crop**: **Crop name**, **Produce colour**, **Plant colour**, **Growth stages** (four looks over eight stages as potatoes, eight looks as wheat, or four looks over four stages as beetroots). **Harvest**: **Planted from** is **Its own seeds (the produce is a new food)** or **The produce itself**, as carrots are; then **Seeds name**, **Hunger restored**, **Saturation** and **Most produce per harvest**. **Farming**: **Seeds in a composter**, **Produce in a composter**, **Villagers plant it**. **World**: **Wild plants in the world** puts fully grown patches in newly generated chunks of the **Biomes** you pick, **One patch in this many chunks**. The crop then also grows on grass, so a wild patch can stand where it generates.

### Tree

A sapling and the tree it grows. **Tree**: **Tree name**, **Tree shape** (**Straight, as an oak**, **Tall and branching, as a big oak**, **Forking, as an acacia**, **Wide and hanging, as a cherry** or **Two by two, as a dark oak**, which needs four saplings in a square). **Blocks**: **Trunk** and **Leaves** are new ones or vanilla ones, then **Wood colour**, **Leaf colour**, **Leaf colour in the world**. **World**: **Grows in the world**, **Biomes**, **Trees per chunk**.

The **Simple block** flow has a **When placed** question: **The same every way**, **Turns to face the player** or **Placed like a log**.

## Change a block's type

Select a block and use the **Type** section of the Block Studio. The picker offers:

| Type | What it is |
|---|---|
| **Simple block** | The plain cube (the default). |
| **Log or pillar (turns to the clicked face)** | Turns with the face you place it against. |
| **Faces the player (four ways, like a furnace)** | Its front turns towards you. |
| **Faces any way (six ways, like an observer)** | As above, up and down included. |
| **Slab**, **Stairs**, **Wall**, **Fence** | The vanilla shapes; they connect, stack and form corners. |
| **Fence gate** | Opens on use; needs a **Wood type (open and close sounds)**. |
| **Door**, **Trapdoor**, **Button**, **Pressure plate** | Redstone blocks; they need a **Set type**. |
| **Pane or bars** | Connects to other panes and walls, as glass panes. |
| **Crop**, **Sapling**, **Leaves** | The plants; see [Crops, saplings and leaves](#crops-saplings-and-leaves). |

Changing the type keeps the name, mining, sounds, item and events, and drops the fields of the old type; it is one undoable step. The type gives the block vanilla's own shape, which turns and connects with its state, so the Studio hides **Shape** for the family types, and the types with vanilla's own redstone behaviour take no redstone fields.

The fields that appear for a type:

- **Stairs**: **Base block**, whose look and strength the stairs copy (empty means stone). The base has to exist when the game starts: a block of this project or a vanilla block.
- **Door, Trapdoor, Button, Pressure plate**: **Set type** is **Wood (oak sounds)**, **Cherry wood**, **Bamboo**, **Crimson**, **Warped**, **Iron (not opened by hand)**, **Copper**, **Gold**, **Stone** or **Polished blackstone**. It picks the sounds, whether a hand opens it and what presses it. Iron and gold doors and trapdoors open only with redstone. A button has **Press time (ticks)** (empty: 30 for wood, 20 otherwise). A pressure plate has **Weighted (the signal grows with the number of entities, like gold and iron plates)** and **Entities for the full signal**.
- **Fence gate**: **Wood type (open and close sounds)**: Oak, Spruce, Birch, Acacia, Cherry, Jungle, Dark oak, Pale oak, Poplar, Crimson, Warped, Mangrove or Bamboo.
- **Fence**: **Connects to wooden fences** is **(from the sound type: yes/no)**, **Yes** or **No**. A fence connects to another fence only if both are wooden or both are not.

Doors drop one door from either half; slabs drop two when double; a door's recipe, tags and loot are made for you.

### Textures and models

Every typed block gets its models from the **Textures** section, in words: **Every face**; for a pillar **Sides (bark)** and **Ends (top and bottom)**; for the facing types **Front**, **Sides and back** and **Top and bottom**; for slabs and stairs **Top**, **Bottom** and **Sides**; **Wall**, **Fence**, **Gate**, **Trapdoor**, **Button**, **Plate**; for a door **Top half** and **Bottom half (also the item)**; for a pane **Face of the pane** and **Thin edge**. The Studio shows the generated models in the preview. Repaint a texture and every state of the block changes. **Every face** fills each texture left empty. Without it, an empty top or bottom of a slab or stairs takes the sides, and any other empty texture takes the first texture given.

The list of **Models** under the textures names each model the type needs. **Own models (instead of the made ones)** lets you give your own model for each state ("Inner corner", "Double slab", "Lower half, hinge left, open", "In the inventory", "Block item", "Stage 3"). A slot left empty shows the first model.

## Burning and stripping

Fire needs two numbers, kept in the block's `msm:flammable` component in **Advanced (all fields)** (the flows set them for you):

- `burn_odds` (0 to 300): how readily fire spreads to the block;
- `ignite_odds` (0 to 300): how readily the block burns away once alight.

Vanilla planks are 5 and 20, logs 5 and 5, leaves 30 and 60. Mojang's own source swaps the two names; MCSuperMods' names say what they do. A block with no `msm:flammable` does not burn and lava does not ignite it. Doors, trapdoors and plates of a wooden set carry it in the flows (with 0 and 0, so lava ignites them), like vanilla's.

`msm:strippable` (`into`: a block id) lets an axe turn the block into another, the way logs become stripped logs; the axis is kept when both blocks have one. Any item whose `minecraft:block_transformer` names the axe strips it, so vanilla axes, your own axes and axes of other mods work. A hoe or a shovel does not.

## Crops, saplings and leaves

**Crop** (section **Crop** in the Block Studio):

- **Last age (1 to 15; empty: 7)** is the number of stages minus one.
- **Stage textures** has **Stage N** pictures and **Add stage texture** / **Remove**; fewer pictures than stages repeat the last, as vanilla potatoes do. **Own stage heights (the outline of each stage)** takes one **Stage N height** per stage (empty: vanilla's ramp). The preview has a slider: **Stage (age N of M)**.
- **Planted on (a block or #tag; empty: #minecraft:supports_crops)**, **Bone meal grows at least**, **Bone meal grows at most**.
- **Seeds item (empty: the crop's own id)** names the item that plants the crop; with **Farmer villagers plant the seeds** villagers sow it. The item is the block's own item, so it counts as the block's item everywhere (the registry view, the AI helper, the export).
- **Crop drops (the produce when grown, the seeds before)**: **Produce (harvested when grown)**, **How many (empty: one)**, **Extra seeds when grown (Fortune adds more, as wheat)**. A crop planted from its produce (as carrots) names its own item as the produce.

**Sapling**: **Tree** is a worldgen feature of your project or a vanilla one; **New tree** makes one from the template **Tree for a sapling** and the button beside **Tree** opens it in the Tree Studio. **Two-by-two tree (empty: none)** is the tree four saplings in a square grow, **Tree near flowers (empty: the tree)** the tree grown with flowers nearby, as an oak with a bee nest, and **Planted on** the soil (empty: `#minecraft:supports_vegetation`). Bone meal and growth are vanilla's. If the tree is missing, the sapling does not grow and the game logs a warning once when the server starts.

**Leaves**: **Tint** is **None (the texture keeps its own colours)**, **Biome foliage colour (like oak leaves)**, **Biome grass colour**, **Biome dry foliage colour (like leaf litter)** or **One colour everywhere** with a **Colour**. **Falling leaf chance (0 to 1; empty: 0.01)** and **Falling particle (empty: none)** (only without a tint). **Leaves drops (now and then the sapling, sticks and an extra item; itself with shears)**: **Sapling (empty: none)**, **Sticks**, **Extra item, as apples (empty: none)**. Leaves decay when no block of the tag `minecraft:logs` is near, like vanilla; leaves a player placed stay.

## The Tree Studio

Selecting a `minecraft:tree` feature in the sidebar opens the Tree Studio; other features keep their form. It has the sections **Trunk** (**Trunk shape**, **Trunk block**), **Leaves** (**Leaves shape**, **Leaves block**), **Below the trunk** (**Ground block**, usually the registered provider that turns the soil to dirt) and **Decorators** (**Add decorator**). Each block is **One block** or **Registered provider**; **Fill in leaf state** sets the leaves' `distance` and `persistent` so project leaves behave like vanilla's. The shape lists are vanilla's placers. A tree for a sapling named `maple_tree` uses `maple_log` and `maple_leaves`.

## Problems it reports

The Problems panel checks a typed block: a component the type does not allow (**Shape** or redstone on a family block), a block without textures or models, a model clashing with a generated one, a set type or wood type that the Minecraft version does not have, stairs whose base is missing or is the stairs themselves, a stripped block that does not exist, a crop whose stage heights do not match its stages or whose bone meal range is reversed, a crop with no produce, a sapling whose tree does not exist or is not a tree, leaves that will decay because their trunk is not in `#minecraft:logs`, a tinted leaf with a falling particle, and a block item id another item already uses.

## Vanilla packs

The resource pack exports the models, blockstates and names. The vanilla data pack leaves out family blocks' data files (their recipes, loot tables, tags that need them, the tree and its placed feature): a vanilla game does not know these blocks, so the files would stop the pack loading. Those files need the Fabric mod jar. The export says what it leaves out with the warning `export.mod-only-reference`, and tag entries for your blocks become optional. See [Adding to vanilla](adding-to-vanilla.md) and [Blocks and items](blocks-and-items.md#export-a-fabric-mod-jar).

## What it cannot do

- **Signs and hanging signs**, and **boats** (with chest boats), are not made: both need client code and an entity of their own.
- **Door, trapdoor, button and plate sounds** are vanilla's: you pick a **Set type**, you cannot give a set sounds of its own.
- **Stripping only by players** with an axe: a dispenser or another mod that calls vanilla's transformer directly does not strip your logs.
- **Leaf tint is client-side**: the **Tint** shows in the game only, not in the app's preview. Tint sources are the four above or one colour.
- **Villagers farm only on farmland**: a crop with another **Planted on** soil is never farmed by villagers.
- **Tree shapes are vanilla's**: the Tree Studio combines and tunes vanilla's trunk and foliage placers and decorators; a new shape needs code.
- **Stairs need their base registered first**, so a base block from another mod that loads after MCSuperMods' runtime cannot be used.
- **Not made yet**: copper weathering and waxing, stems with attached fruit, berry bushes, double plants, cocoa, nether wart, flower pots, ladders, torches, lanterns and chains.

The other chapters are listed in the [user guide](/).
