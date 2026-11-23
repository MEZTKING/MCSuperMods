# Block types, families and plants

A plain block is a cube. MCSuperMods also makes the blocks that behave like vanilla's families: logs that turn to the face you place them against, slabs, stairs, walls, fences, gates, doors, trapdoors, buttons, pressure plates and panes, and the plants: crops that grow in stages, saplings that grow a tree of your own, leaves that decay, plants that grow in long strands or tall stalks, and flower pots of your own. Each one is a real vanilla block class in the game, so it connects, turns, opens and breaks the way its vanilla relative does.

You make them in two ways:

- the Creator's flows **Wood set**, **Stone set**, **Crop** and **Tree** (group **Blocks**) build a whole family with its recipes, tags and textures in one step;
- the Block Studio's **Type** section turns a single block into one of the types, and templates under **Blocks** start one (a portal is a block type of its own: see [Portals](portals.md)) (see [Templates, starters and examples](templates-and-examples.md#blocks)).

The twenty furniture, light, food and plant types are described in [More plants, food, furniture and lights](#more-plants-food-furniture-and-lights), the kelp-like, vine-like, cane-like, cactus-like, bamboo-like, lichen-like and dripleaf-like plants in [Growing and climbing plants](#growing-and-climbing-plants), pots of your own in [Flower pots of your own](#flower-pots-of-your-own), with [waterlogging](#waterlogging) and [ageing like copper](#weathering-and-waxing). A block's own sounds and door sounds are in [Block sounds](sounds.md). New blocks exist only in the **Fabric mod jar** export ([Blocks and items](blocks-and-items.md#export-a-fabric-mod-jar)) and need the runtime of MCSuperMods 1.5.0 or later (1.5.1 for the twenty new types, and the runtime of this release for the growing plants, pots and the six new ageing types); an older runtime registers every typed block as a plain cube. See [Vanilla packs](#vanilla-packs) for what the resource and data pack exports keep.

## The four flows

Open **Make something…** in the toolbar's **More** menu (or a tile on Home) and pick a flow under **Blocks** (see [The Creator](creator.md)). Every flow draws its textures in the colours you choose, in a Minecraft-like style ([Drawing pictures](pictures.md)), or takes a square PNG of your own for each texture under **Pictures** (16 by 16 as vanilla, up to 256 by 256). A set is one undoable step, and **Edit in Creator** on any of its members changes the answers later: members you switch off are removed only if you have not edited them.

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
| **Cake**, **Berry bush**, **Tall plant**, **Potted plant**, **Vine**, **Sea pickle**, **Carpet**, **Layers**, **Pod on a log**, **Candle** | More plants and food; see [More plants, food, furniture and lights](#more-plants-food-furniture-and-lights). |
| **Bed**, **Ladder**, **Torch**, **Lantern**, **Chain**, **Rod**, **Sign**, **Hanging sign**, **Stem**, **Scaffolding** | Furniture, lights and signs; same section. |
| **Grows in long strands (like kelp, weeping vines and cave vines)**, **Grows tall like sugar cane (cane, cactus or bamboo)**, **Spreads over any side (like glow lichen)**, **Tips when you stand on it (like dripleaf)** | Plants that grow; see [Growing and climbing plants](#growing-and-climbing-plants). |
| **A flower pot (takes the plants you list)** | A pot of your own; see [Flower pots of your own](#flower-pots-of-your-own). |
| **Portal** | See [Portals](portals.md). |

Changing the type keeps the name, mining, sounds, item and events, and drops the fields of the old type; it is one undoable step. The type gives the block vanilla's own shape, which turns and connects with its state, so the Studio hides **Shape** for the family types, and the types with vanilla's own redstone behaviour take no redstone fields.

The fields that appear for a type:

- **Stairs**: **Base block**, whose look and strength the stairs copy (empty means stone). The base has to exist when the game starts: a block of this project or a vanilla block.
- **Door, Trapdoor, Button, Pressure plate**: **Set type** is **Wood (oak sounds)**, **Cherry wood**, **Bamboo**, **Crimson**, **Warped**, **Iron (not opened by hand)**, **Copper**, **Gold**, **Stone** or **Polished blackstone**. It picks the sounds, whether a hand opens it and what presses it. Iron and gold doors and trapdoors open only with redstone. For sounds and rules of the block's own (an iron door that opens by hand, a wooden door that clangs), use **Own door sounds** in **How it sounds** ([Block sounds](sounds.md#door-trapdoor-button-and-plate-sounds)). A button has **Press time (ticks)** (empty: 30 for wood, 20 otherwise). A pressure plate has **Weighted (the signal grows with the number of entities, like gold and iron plates)** and **Entities for the full signal**.
- **Fence gate**: **Wood type (open and close sounds)**: Oak, Spruce, Birch, Acacia, Cherry, Jungle, Dark oak, Pale oak, Poplar, Crimson, Warped, Mangrove or Bamboo.
- **Fence**: **Connects to wooden fences** is **(from the sound type: yes/no)**, **Yes** or **No**. A fence connects to another fence only if both are wooden or both are not.

Doors drop one door from either half; slabs drop two when double; a door's recipe, tags and loot are made for you.

### Textures and models

Every typed block gets its models from the **Textures** section, in words: **Every face**; for a pillar **Sides (bark)** and **Ends (top and bottom)**; for the facing types **Front**, **Sides and back** and **Top and bottom**; for slabs and stairs **Top**, **Bottom** and **Sides**; **Wall**, **Fence**, **Gate**, **Trapdoor**, **Button**, **Plate**; for a door **Top half** and **Bottom half (also the item)**; for a pane **Face of the pane** and **Thin edge**. The Studio shows the generated models in the preview. Repaint a texture and every state of the block changes. **Every face** fills each texture left empty. Without it, an empty top or bottom of a slab or stairs takes the sides, and any other empty texture takes the first texture given.

The list of **Models** under the textures names each model the type needs. **Own models (instead of the made ones)** lets you give your own model for each state ("Inner corner", "Double slab", "Lower half, hinge left, open", "In the inventory", "Block item", "Stage 3"). A slot left empty shows the first model.

## Burning and stripping

Fire needs two numbers, kept in the block's `msm:flammable` component in **Every setting** (the flows set them for you):

- `burn_odds` (0 to 300): how readily fire spreads to the block;
- `ignite_odds` (0 to 300): how readily the block burns away once alight.

Vanilla planks are 5 and 20, logs 5 and 5, leaves 30 and 60. Mojang's own source swaps the two names; MCSuperMods' names say what they do. A block with no `msm:flammable` does not burn and lava does not ignite it. Doors, trapdoors and plates of a wooden set carry it in the flows (with 0 and 0, so lava ignites them), like vanilla's.

`msm:strippable` (`into`: a block id; **Axe strips into** in the Block Studio's **Mining** section) lets an axe turn the block into another, the way logs become stripped logs; the axis is kept when both blocks have one. Any item whose `minecraft:block_transformer` names the axe strips it, so vanilla axes, your own axes and axes of other mods work.

`msm:flattenable` (`into`) lets a shovel make the block into another, as dirt into a path, and `msm:tillable` (`into`, and an optional `drops`, an item dropped once) lets a hoe till it, as dirt into farmland or rooted dirt into dirt with hanging roots. Both work only when there is air above the block and the click is not on its underside, as in vanilla. Set them in the Block Studio's **Mining** section with **Shovel flattens into**, **Hoe tills into** and **Drops once** (or in **Every setting**); the sample project's `loam` flattens into `loam_path` and tills into `loam_farmland`.

For Minecraft's own blocks, the same rules (and burning and ageing) are an element of their own: see [Rules for vanilla blocks](adding-to-vanilla.md#rules-for-vanilla-blocks).

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

## More plants, food, furniture and lights

Twenty more types make the blocks that vanilla builds from classes of their own. Pick them in the Block Studio's **Type** section (the picker groups them as **Building blocks**, **Plants** and **Furniture and lights**, and **Pick from pictures** shows every type as a tile), or start from a template (see [Templates, starters and examples](templates-and-examples.md#blocks)) or one of the Creator's flows ([Creator flows for them](#creator-flows-for-them)). Like every typed block they are real vanilla block classes in the game: a ladder climbs, a bed sleeps, a lantern hangs. They need the Fabric mod jar and the runtime of MCSuperMods 1.5.1 or later.

| Type (as the picker says it) | What it is | Fields and notes |
|---|---|---|
| **Cake (eaten a slice at a time)** | A block eaten in seven bites with an empty hand; a comparator reads what is left. | **Hunger a slice fills (1 to 20; empty: 2)**, **Saturation (0 to 2; empty: 0.1)**, **After a slice is eaten, run** (an event). It drops itself only when whole. |
| **Berry bush (picked for its berries)** | Four ages; pick the ripe bush by hand for berries and it grows back. Bees grow it. | **Berry (picked from the bush, and planted to grow a new one)** (**Use the bush's own item**), the counts of a ripe and a full bush (empty: 1 to 2 and 2 to 3, with Fortune), **Slows and hurts whoever walks through it (like sweet berry bushes)**. |
| **Tall plant (two blocks high)** | Places both halves at once; the lower half drops the item. | **Bone meal**: **Drops a copy (like tall flowers)** or **Nothing (like tall grass)**. |
| **Potted plant (a plant in a flower pot)** | A flower pot that holds a plant. It has no item unless you give it one: use the pot on the plant. | **Plant in the pot**, with **Your plants** to pick from. It drops the pot and the plant. |
| **Vine (climbs walls and spreads)** | Clings to the sides of blocks, is climbable and drops itself (no shears needed). | **Spreads over time, as vanilla's vines**. |
| **Sea pickle (one to four, glows in water)** | One to four pods; the light is 6, 9, 12 and 15 in water and 0 on dry land. | Bone meal spreads it on corals. |
| **Carpet** | A floor layer one sixteenth of a block high. | The picture, nothing else. |
| **Layers (one to eight, like snow)** | Place more on top to build it up a layer at a time. | The eighth layer is a full block. |
| **Pod on a log (like cocoa)** | Three ages, grows on the side of a log and drops more when ripe. | **Hangs on (empty: #minecraft:supports_cocoa)**: a block tag of the logs it grows on. |
| **Candle (one to four, lit with flint and steel)** | Stack up to four; light it and it gives light 3 for each lit candle. | Two pictures: **Candle** and **Lit candle (empty: the candle)**. |
| **Bed** | Two halves. Players sleep in it, set their spawn and get Sweet Dreams. | **Sleeping rule** (**Like a bed**, or **Like a sleeping bag (the straw bed rule)**) and **Bed colour** (the sixteen dye colours). |
| **Ladder** | Climbs on a wall and turns to the wall you place it against. | The picture. |
| **Torch (stands or goes on a wall)** | Light 14 with flame particles. | **Flame particle (empty: the game's torch flame)**. Makes a wall torch too (see [Companions](#companions)). |
| **Lantern (stands or hangs)** | Stands on a block or hangs under a block or a chain; light 15. | Can age like copper (see [Weathering and waxing](#weathering-and-waxing)). |
| **Chain** | Places along the face you aim at and holds up lanterns. | Can age like copper. |
| **Rod (like an end rod)** | A slim rod that points six ways, away from the face you place it on; light 14. | The rod gives off vanilla's end rod particles. |
| **Sign** | A sign you write on, standing in sixteen turns or on a wall. Both sides take text, dye, glow ink and wax. Stacks to 16. | **Wood type (sounds)**, with the 13 wood types. Makes a wall sign too. |
| **Hanging sign** | Hangs from a block or a chain, or sticks out from a wall; text on both sides. | As a sign. Makes a wall hanging sign too. |
| **Stem (grows a fruit, like melons)** | Eight ages on farmland; fully grown, it grows its fruit beside it and bends towards it. | **Fruit (grows next to the stem when it is fully grown)** (**Your blocks** to pick from), **Planted on** and **Fruit grows on** (empty: the melon stem's tags). Makes an attached stem too. |
| **Scaffolding** | Build a column from the side, extend a row up to six blocks from the top; you climb it and it falls when its support goes. | Nothing to fill in. |

### Companions

A torch, a sign, a hanging sign and a stem each register a second block of their own: the wall form of a torch, sign or hanging sign (`<id>_wall`) and the bent stem (`<id>_attached`). The Type section shows them as "Also makes: …". They have no names or items of their own and take the main block's pictures, tags and loot (a wall torch drops the torch). The ids are reserved: a block of yours named `ember_torch_wall` is refused with `blocks-items.generated-block-clash` ("makes a second block whose name is already taken. Rename one of them."), rather than crashing the game as it once did.

### Pictures and the writing screen of a sign

A sign needs one more picture: the screen you write on. Choosing the **Sign** or **Hanging sign** picture in **Textures** copies it to the project as the writing screen picture in the same undo step ("Sign picture"). A vanilla picture is never copied (MCSuperMods bundles none of Mojang's art), so until you pick a picture of your own the Problems panel says: "has no picture for the screen you write on. Pick the sign's picture again in its Textures." The Creator's **Wood set** flow writes both pictures for you.

### Creator flows for them

- **Lights** (group **Blocks**): **Lights to make** (**Torch (and its wall torch)**, **Lantern**, **Chain**, **Candle**), **Colour of the light**, **Metal colour**, **Torch flame**, **Made with** (glowstone dust, blaze powder, amethyst shard, glow ink sac or **No recipes (creative menu only)**) and **One picture for all**.
- **Bed** (group **Blocks**): **What it is** (**A bed** or **A sleeping bag**), **Blanket colour** (sixteen dyes) and **Crafting recipe**. A sleeping bag follows the straw bed rule.
- **Cake** (group **Food**): **What it is** (**A cake, iced on top** or **A pie with a crust**), **Topping colour**, **Filling colour**, **Hunger per slice**, **Saturation per slice** and **Flavour**.
- **Wood set**: the new answers **Signs** and **Hanging signs** (both on) add `maple_sign` and `maple_hanging_sign` with recipes and their writing screens.
- **Crop**: **What it is** can be **Bush with berries**; **Grows on** picks the soil.
- **Stone set**: **Make it a copper-like set that ages** (off) with **Colour it ages to**.
- **Copper set**: see [Weathering and waxing](#weathering-and-waxing).
- **Cave plants** (group **Blocks**): **Plant name**, **What it does** (**Hangs from the ceiling with glowing berries, as cave vines**, **Hangs down in long strands, as weeping vines**, **Grows up from the ground in long strands, as twisting vines**, **Grows up in water, as kelp** or **Spreads over any side of a block and glows, as glow lichen**), **Colour**, and under **Glow** the **Berry colour** and **How bright it glows**. A cave-vine-like plant's berries are an item named after the vine (`<id>_berries`) that you eat and plant.
- **Desert plants** (group **Blocks**): **Plant name**, **What it does** (**Grows tall next to water, as sugar cane**, **Spiny and grows on sand, as cactus**, **A woody stalk with leaves, as bamboo** or **A big leaf that tips when you stand on it, as big dripleaf**, which also makes the small leaf that grows into it), **Colour**, **How tall** (**As tall as the vanilla plant**, **About twice as tall** or **Shorter**) and **Crafts as the vanilla plant does** (cane into sugar, cactus into green dye, bamboo into sticks).
- **Flower pot** (group **Blocks**): see [Flower pots of your own](#flower-pots-of-your-own).

## Growing and climbing plants

Four types grow as vanilla's strand and stalk plants do. Pick them in the Type section (group **Plants**), start from a template under **Blocks: plants** or use the Creator's **Cave plants** and **Desert plants** flows (see [Creator flows for them](#creator-flows-for-them)). Each is a real plant in the game: it grows with random ticks and bone meal, needs the ground it grows on, and breaks when that goes.

### Grows in long strands

**Grows in long strands (like kelp, weeping vines and cave vines)**: the block you place is the tip; as it grows it leaves a strand behind it. Its section, **Grows in long strands**, has:

- **Grows**: **Grows up (like kelp and twisting vines)** or **Grows down (like weeping and cave vines)**;
- **Starts at age (0 to 25; empty: 25)**: it stops at age 25, so a tip placed at age 0 grows up to 26 blocks;
- **Chance to grow (0 to 1 a random tick; empty: 0.14)**, **Bone meal adds at least** and **Bone meal adds at most** (empty: Minecraft's for the strand, one for a water plant);
- **Lives in water (like kelp: placed only in water, breaks when the water goes)**: a water plant always grows up;
- **Can be climbed (like vines)**;
- **Berries (picked from the strand, like glow berries)** with **Berry item** and **Light while it has berries (0 to 15; empty: 14)**: using the strand picks the berries, and bone meal ripens them instead of growing the strand. When the berry is the plant's own item, planting it grows a new strand, as glow berries do;
- **Grows on**: blocks or block tags the strand hangs from or stands on (empty: any block with a solid face).

Pictures: **Tip (also the item)** and **Strand behind the tip (empty: the tip)**, with berries also **Tip with berries** and **Strand with berries**. The strand behind the tip is a second block, `<id>_plant` (see [Companions](#companions)).

### Grows tall like sugar cane

**Grows tall like sugar cane (cane, cactus or bamboo)**, section **Grows tall like sugar cane**:

- **Shape**: **Cane (like sugar cane, next to water)**, **Cactus (spiny, hurts when touched)** or **Bamboo (leafy, grows from a shoot)**;
- **Tallest stop (1 to 32; empty: 3, bamboo 16)** and **Shortest stop**: each stalk stops growing at a height picked between the two; bone meal can grow bamboo past its stop up to the tallest;
- **Grows on** (empty: Minecraft's blocks for the shape, such as `#minecraft:supports_sugar_cane`), **Needs water beside it (like sugar cane)** and **Hurts when touched (damage 0 to 100; empty: 1 for a cactus, 0 otherwise)**.

Bamboo starts as a shoot (a second block, `<id>_shoot`), grows leaves near its top and turns thick from the fourth block, as Minecraft's bamboo. Pictures: a cane's **Stalk (also the item)**; a cactus's **Sides (also the item)**, **Top** and **Bottom (empty: the top)**; a bamboo's **Stalk (also the item)**, **Small leaves**, **Large leaves** and **Shoot (empty: the stalk)**.

### Spreads over any side

**Spreads over any side (like glow lichen)** covers any side of the blocks around it; one block can cover several sides. Section **Spreads over any side**: **Light (0 to 15; empty: 7)**, **Spreads with bone meal** and **Holds water (placed underwater, it stays full of water)**. One **Picture**.

### Tips when you stand on it

**Tips when you stand on it (like dripleaf)**, section **Tips when you stand on it**, **Size**:

- **Big leaf (tips when you stand on it)**: it stands on a stem (a second block, `<id>_stem`); whoever stands on the leaf tips it a little, then right over, and falls through. **Starts tipping after**, **Tips right over after** and **Drops whoever stands on it after** (ticks; empty: 2, 10 and 10). Bone meal grows it a block taller. Pictures: **Leaf from above (also the item)**, **Edge of the leaf**, **Tip of the leaf when tilted** and **Stem**.
- **Small leaf (grows into a big one with bone meal)**: two blocks high; bone meal turns it into the big dripleaf you pick under **Grows into (your big dripleaves)**, which must be one of this project's. Pictures: **Leaf from above (also the item)**, **Edge of the leaf**, **Upper stem** and **Lower stem (empty: the upper stem)**.

### What the plants drop

The templates and flows give each plant vanilla's drops: vine-like strands drop only to shears or Silk Touch, or sometimes by luck; glow-lichen-like plants and small dripleaves only to shears; a cave-vine-like strand drops its berries.

## Flower pots of your own

**A flower pot (takes the plants you list)** is an empty pot of your own. Section **A flower pot**: using the pot with one of its plants puts the plant in, and Minecraft's own flower pot is not changed.

- **Plants it takes**: **Add a plant** opens a picker with **Your plants** and **Plants Minecraft pots**; **Add any other block by id** takes any other block. Pick at least one. The section counts what it makes ("It makes 3 potted plant blocks with the pot, one for each plant."): each plant becomes a potted block of its own, `<pot>_<plant>`, that takes the pot's pictures with the plant's own. Tall plants and plants without an item do not fit.
- Pictures: **Pot picture (empty: vanilla's pot)**, **Earth in the pot (empty: dirt)** and **Item picture (empty: the pot picture)**.

A **Potted plant (a plant in a flower pot)** of your own can go into your pot too: its section has **Pot (empty: Minecraft's flower pot)** with **Your pots**. Do not also list that plant under **Plants it takes**. Breaking a potted plant drops the pot and the plant. The Creator's **Flower pot** flow (group **Blocks**) makes a pot with its recipe: **Pot name**, **Colour**, **Plants it takes** (fourteen flowers, saplings, ferns, bushes and mushrooms to tick) and **Crafted from** (**Bricks, as the vanilla pot**, **Clay balls**, **Copper ingots** or **No recipe (creative menu only)**).

## Waterlogging

**Can stand in water (placed underwater, it stays full of water, like a slab)** in the Type section makes a plain block, a log or pillar, a block that faces the player or a block that faces any way hold water: use a water bucket on it, or place it in water, and it keeps its light and shape underneath. Every state is doubled with a dry and a wet form; breaking a wet block leaves a flowing source behind. Slabs, stairs, fences, walls, trapdoors, panes, ladders, lanterns, chains, candles, sea pickles, signs and scaffolding already hold water as in vanilla, and the switch is not offered for them. Rods, beds, torches and stems cannot hold water; kelp-like plants are always in water and lichen-like plants have their own **Holds water** switch. A container or machine has **Holds water (placed underwater, it fills with water and keeps its contents)**; a double chest always holds water ([Containers and machines](containers-and-machines.md#holding-water)).

## Weathering and waxing

A block can age like copper in four stages, and honeycomb can stop it. In the Block Studio, **Ages like copper (over time)** sets the **stage** (**New**, **Exposed**, **Weathered**, **Oxidised**), **Ages into** (the block of the next stage; the last stage has none) and **Waxed copy (honeycomb turns it into this)**. Three buttons build the blocks for you, each as one undo step:

- **Make the next stage** makes the next block (`exposed_<name>`, `weathered_<name>`, `oxidized_<name>`, named "Exposed X", "Oxidised X"), pictures copied from this one;
- **Make a waxed copy** makes `waxed_<id>`, which never ages;
- **Make the whole set** makes every later stage and a waxed copy of each, chained.

Give each stage its own picture afterwards: the copies start with the same ones. The Creator's **Copper set** flow (group **Blocks**) does all of it: the **Metal name** ("Tin" gives 56 blocks, 28 honeycomb recipes and `tin_ingot`), **Metal colour**, **Colour it turns**, **Make an ingot**, **Pieces** (the block, cut block, cut slab, cut stairs, door, trapdoor and bars, on by default, and **Rod, as a lightning rod**, **Button**, **Pressure plate**, **Fence**, **Fence gate**, **Wall** and **Chest that joins into a double chest**, off by default) and **Waxed copies**. The chest keeps its items as it ages and joins a chest beside it into a double chest; the fence gate makes oak gate sounds.

How it behaves in the game: a project block ages at the same rate as vanilla copper. It does not age while a neighbour (project or vanilla copper) is at an earlier stage, as copper does, so a group of blocks ages in step. Honeycomb on a block waxes it, an axe scrapes it back one stage or removes the wax, and a waxed block shows the wax sounds and particles. Lightning scrapes project blocks as it does copper: the block it strikes goes back to its first stage, and a few blocks around it go back one stage. A pressed button or plate that ages keeps being pressed until it lets go.

Weathering is offered on the plain block, log or pillar, facing blocks, slabs, stairs, doors, trapdoors, panes or bars, chains, lanterns, rods, buttons, pressure plates, fences, fence gates and walls, and on containers, which keep their items as they age ([Containers that age](containers-and-machines.md#containers-that-age)). A door ages as one block. Machines cannot age. Problems reports a stage that ages into a block that is not there, into itself or in a circle (`weathering-next-unknown`, `weathering-cycle`), stages out of order (a warning), a waxed copy that still ages or is named by two blocks, and a block that can be waxed but does not age.

## The limits of the new types

- **Villagers do not use project beds.** Players sleep in them, set their spawn and get Sweet Dreams; a villager never claims one.
- **A sleeping bag is a bed with the straw rule** and keeps a bed's look. Beds explode in the Nether and the End as vanilla's do.
- **Project layers never melt** and do not pile up in snowfall: snow does not add to them, and sun and warm light do not remove them.
- **Plants that vanilla already pots cannot be potted again** in vanilla's pot: a potted plant that names such a plant is refused; use your own sapling or berry bush, or a [pot of your own](#flower-pots-of-your-own), which may list vanilla's plants.
- **A pot of your own holds only the plants it lists** (and potted plants that name it). A plant in it is drawn from the plant's own block picture, so plants vanilla pots with a model of their own (cactus, bamboo, azalea and similar) look flat in it. Taking a plant out does not count towards "flowers potted".
- **A small dripleaf needs a big dripleaf of this project** to grow into.
- **A plant that lives in water placed by a world feature** needs a water check in that feature, or most of it breaks as it is placed (**Problems** warns).
- **Strands keep vanilla's limits**: a tip grows at most 26 blocks from age 0; bamboo keeps vanilla's leaf stages and thickness.
- **More companion ids are reserved**: `<id>_plant`, `<id>_shoot`, `<id>_stem` and `<pot>_<plant>` are refused as names of other blocks.
- **Candles cannot be put on a project cake**: candles do not make a candle cake, and the cake does not take them.
- **Project scaffolding does not join vanilla scaffolding**: its own distance counts only its own blocks.
- **A sign sounds like its wood type**: you cannot give a sign sounds of its own, and the sound type of the block is not used.
- **A rod gives vanilla's end rod particles** whatever picture it has.
- **Waxed blocks**: a waxed block must not age and belongs to one block (a second block that names it is refused). Two blocks cannot age into the same block, because the axe could not tell which to scrape back to.
- **Only the listed types age.** Copper golems do not scrape or wax project blocks. Lightning ignores waxed blocks, its walk passes only through project blocks, and project rods do not attract it: only vanilla's lightning rod does. Project blocks do not count for the Wax On and Wax Off advancements. A block in a broken chain registers but never ages.
- **Machines do not weather.** Containers and machines hold water; a double chest always does.
- **Only the first stage has shape recipes** in the Copper set flow; a stone picture you choose is used for all four stages, and the sign board uses the planks picture, the hanging sign the stripped log picture.
- **Restart needed.** New block types and companions are read when Minecraft starts: Play and Reload say **Restart needed** ([Playing and testing](playing-and-testing.md#restart-needed)).
- **Not in vanilla packs.** The resource pack keeps the models, blockstates and names; every runtime feature (these types, pots, waterlogging, ageing, lightning, own sounds) needs the Fabric mod jar, and the vanilla data pack leaves their data out (see [Vanilla packs](#vanilla-packs)).
- **Looks are in-game checks.** Pictures of the sign screen, the bed halves, the torch flame, the candle regions, the bamboo leaves, the tilting dripleaf and plants in a pot are built from vanilla's templates, so check how they look in the game; the Try it preview only approximates them ([Try it](try-it.md)).
- **In a Java project**, listed pot plants that are missing or two blocks high are skipped with a warning in the log ([Eject to a Java project](eject.md)).
- **A spawner takes a project mob** from its spawn egg, as for vanilla mobs.

## Problems it reports

The Problems panel checks a typed block: a component the type does not allow (**Shape** or redstone on a family block), a block without textures or models, a model clashing with a generated one, a set type or wood type that the Minecraft version does not have, stairs whose base is missing or is the stairs themselves, a stripped block that does not exist, a crop whose stage heights do not match its stages or whose bone meal range is reversed, a crop with no produce, a berry or a stem fruit that is not there, a potted plant that cannot go in a pot, a small dripleaf without a big dripleaf of the project to grow into (`dripleaf-grows-into-missing`, `dripleaf-grows-into-not-big`), **Grows into** on a big one or tilt timing on a small one (`dripleaf-grows-into-big`, `dripleaf-tilt-small`), a shortest stop above the tallest (`column-min-above-max`), a water plant that grows down or that a feature places without water (`water-plant-grows-down`, `water-plant-feature-dry`), bone meal settings on a plant with berries (`berries-ignore-bonemeal`), a pot plant listed twice, that does not fit or that a potted plant also pots (`pot-plant-repeated`, `pot-plant-unfit`, `pot-plant-also-potted`), a potted plant whose pot is not a flower pot (`potted-plant-pot-not-pot`), a torch particle that needs settings, a companion whose id is taken, a sign without its writing screen picture, a sapling whose tree does not exist or is not a tree, leaves that will decay because their trunk is not in `#minecraft:logs`, a tinted leaf with a falling particle, and a block item id another item already uses.

## Vanilla packs

The resource pack exports the models, blockstates and names. The vanilla data pack leaves out family blocks' data files (their recipes, loot tables, tags that need them, the tree and its placed feature): a vanilla game does not know these blocks, so the files would stop the pack loading. Those files need the Fabric mod jar. The export says what it leaves out with the warning `export.mod-only-reference`, and tag entries for your blocks become optional. See [Adding to vanilla](adding-to-vanilla.md) and [Blocks and items](blocks-and-items.md#export-a-fabric-mod-jar).

## What it cannot do

- **Boats** are not blocks: the Wood set's **Has boats** makes a boat and a chest boat of the wood as items ([Boats](boats.md)). Signs are made ([More plants, food, furniture and lights](#more-plants-food-furniture-and-lights)).
- **Stripping, flattening and tilling only by players** with the tool: a dispenser or another mod that calls vanilla's transformer directly does not strip your logs.
- **Leaf tint is client-side**: the **Tint** shows in the game only, not in the app's preview. Tint sources are the four above or one colour.
- **Villagers farm only on farmland**: a crop with another **Planted on** soil is never farmed by villagers.
- **Tree shapes are vanilla's**: the Tree Studio combines and tunes vanilla's trunk and foliage placers and decorators; a new shape needs code.
- **Stairs need their base registered first**, so a base block from another mod that loads after MCSuperMods' runtime cannot be used.
- **Crops need light**, like vanilla's crops: a crop with another soil, such as soul sand, still needs light 8 to survive and 9 to grow, so a nether wart that grows in the dark is not possible. More limits are in [the limits of the new types](#the-limits-of-the-new-types).

The other chapters are listed in the [user guide](/).
