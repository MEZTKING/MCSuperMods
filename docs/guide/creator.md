# The Creator

The **Creator** makes a finished piece of content from a few questions: a whole set of tools and armour, one weapon, a food or drink, a totem, an enchantment, a status effect, a potion, a throwable, a goat horn, a painting, a music disc, a block, a mob (a pet, a farm animal, a mount, a flying or water mob, a boss or an animated mob of your own), a new skin for a vanilla animal, a dimension, a villager trade, an extra drop for a vanilla mob, block or chest, or a scripted item. You answer in a form on the left and watch the result on the right; **Create** adds every element, texture, recipe, tag and name it needs to the open project in one step that a single Undo takes back. Later, **Edit in Creator** reopens the set with the same answers, so you can change the colour or add a piece without losing the changes you made by hand.

The Creator uses the same flows as the project starters ([Templates, starters and examples](templates-and-examples.md#project-starters)), but adds to the project you have open instead of making a new one. Its results are ordinary elements: every form, Studio and **Raw JSON** works on them as on anything else.

## Open the Creator

Open or create a project first (a blank one from **New** on the toolbar is fine). Then use one of:

- **Create…** on the toolbar;
- **File → Create…**;
- "Create with the Creator…" in the command palette (Ctrl+Shift+P);
- **or Create something with the Creator** in the empty editor area, or in the **New project** dialog while a project is open.

The dialog (title **Create**) lists the flows under the headings **Gear**, **Blocks**, **Food**, **Mobs**, **Magic**, **Scripts** and **Worlds**. A flow the project's Minecraft version cannot make is listed under **Not available** with the reason. Pick a flow to open its form (the title becomes **Create: <flow>**); **Back to the flows** returns to the list.

When the project has more than one namespace, choose where the new content goes in **Namespace**.

## The flows

Every flow asks for a name and a colour first. Ids come from the name: "Sapphire" in the Gear set gives `sapphire`, `sapphire_sword`, `sapphire_helmet` and so on. The colour tints the placeholder textures the Creator draws (see [Replacing the placeholders](#replacing-the-placeholders)). The fields are grouped as in the form; empty or out-of-range fields show a message under them and **Create** stays disabled until they are fixed.

Flows that make new items or blocks need the **Fabric mod jar** export ([Blocks and items](blocks-and-items.md#export-a-fabric-mod-jar)); **Enchantment**, **Painting**, **Villager trade**, **Mob skin** and **Goat horn** work in plain data and resource packs. **Potion** needs the Fabric mod jar too ([Potions and brewing](potions.md#vanilla-packs)). **Extra drop** and the Custom ore's world generation also need the Fabric mod jar ([Adding to vanilla](adding-to-vanilla.md)).

| Flow | Group | What it makes | Fields |
|---|---|---|---|
| **Gear set** | Gear | Tools and armour of one new material, with recipes, the worn armour look and the vanilla tags | **Material**: **Material name**, **Colour**, **Where the material comes from** (a new ore with a storage block, or only an ingot). **Pieces**: **Pieces** (sword, pickaxe, axe, shovel, hoe, helmet, chestplate, leggings and boots by default; also spear, mace, bow, crossbow, shield, horse armour and wolf armour), **How pieces are made** (**Craft from scratch**, or upgrade iron, golden, diamond, netherite or copper gear at a smithing table), **Also an armour trim material**. **Tools**: **Tier** (a vanilla tier, or **Custom (set the numbers below)** with **Tool durability**, **Mining speed**, **Attack damage bonus**, **Tool enchantability** and **Mines like**). **Armour**: **Armour stats** (like a vanilla material, or custom with **Armour durability**, the armour points of each piece, **Toughness** and **Knockback resistance**). |
| **Weapon** | Gear | One sword, spear, mace, bow, crossbow or shield | **Weapon**: **Weapon name**, **Colour**, **Type**. **Stats**: **Material tier**, **Durability**, **Set damage and speed yourself** with **Attack damage** and **Attack speed**. **Ranged** (bows and crossbows): **Draw speed**, **Arrow speed**, **Arrow damage multiplier**. **Shield**: **Seconds before blocking**, **Damage blocked**. **Recipe**: **Crafted from**. |
| **Totem** | Gear | An item that saves its holder from death, like a totem of undying | **Totem**: **Totem name**, **Colour**. **Effects**: **Clear other effects first** and up to three effects, each with seconds and level. **Recipe**: **Crafted from**. |
| **Enchantment** | Gear | A new enchantment, offered at the enchanting table | **Enchantment**: **Enchantment name**, **Goes on**, **Highest level**. **Effect**: **What it does** (extra damage, knockback, fire, a mob effect on the target, durability or mining speed), **Mob effect on hit**. **Offering**: **Rarity**, **Cannot be combined with**, **Offered at the enchanting table**. |
| **Throwable** | Gear | An item you throw: a ball, a knife you pick up again, a boomerang or a bomb | **Item**: **Name**, **Colour**, **Style**, **Stack size**. **Throw**: **Damage**, **Speed**, **Weight**, **Hold to throw**. **Hit**: **When it hits** (nothing more, an effect on the mob hit, a knock into the air, a block placed, or a burst) with **Effect**, **Effect: seconds**, **Block to place** or **Burst damage**. **Recipe**: **Crafted from**. |
| **Custom ore** | Blocks | An ore that drops gems, the gem item and a storage block, generating underground in the overworld | **Ore**: **Gem name**, **Colour**, **Pickaxe needed**, **Add a storage block**. **Drops**: **Fewest gems per ore**, **Most gems per ore**. **World**: **Generate in the world** (on by default), **Vein size**, **Veins per chunk**, **Lowest height**, **Highest height**. |
| **Simple block** | Blocks | One block with its own hardness, tool, light and drops | **Block**: **Block name**, **Colour**, **Texture**, **When placed** (**The same every way**, **Turns to face the player** or **Placed like a log**), **Light level**. **Mining**: **Hardness**, **Mined with**, **Tool tier needed for drops**, **Drops itself when mined**. **Recipe**: **Crafted from**. |
| **Wood set** | Blocks | A whole kind of wood: log, wood, stripped log and wood, planks, stairs, slab, fence, fence gate, door, trapdoor, button, pressure plate, leaves and a sapling that grows a tree of its own, with recipes, tags, stripping and burning | **Wood**: **Wood name**, **Wood colour**, **Leaf colour**. **Members**: **Blocks in the set**, **Kind of wood**, **Fence gate sounds**. **Tree**: **Leaf colour in the world**, **Tree shape**, **Grows in the world**, **Biomes**, **Trees per chunk**. **Pictures**: a PNG for each texture. |
| **Stone set** | Blocks | A stone with its stairs, slab and wall and, if you choose, a button, pressure plate, polished stone, bricks and a pillar, with crafting and stonecutting recipes | **Stone**: **Stone name**, **Colour**, **Pickaxe needed**, **Stone crafted from**. **Members**: **Blocks in the set**. **Pictures**. |
| **Crop** | Blocks | A crop that grows in stages on farmland, from its own seeds or from its produce, with loot, composting, villager farming and wild patches | **Crop**: **Crop name**, **Produce colour**, **Plant colour**, **Growth stages**. **Harvest**: **Planted from**, **Seeds name**, **Hunger restored**, **Saturation**, **Most produce per harvest**. **Farming**: **Seeds in a composter**, **Produce in a composter**, **Villagers plant it**. **World**: **Wild plants in the world**, **Biomes**, **One patch in this many chunks**. **Pictures**. |
| **Tree** | Blocks | A sapling and the tree it grows, from a new log and leaves or vanilla ones | **Tree**: **Tree name**, **Tree shape**. **Blocks**: **Trunk**, **Leaves**, **Wood colour**, **Leaf colour**, **Leaf colour in the world**. **World**: **Grows in the world**, **Biomes**, **Trees per chunk**. **Pictures**. |
| **Storage crate** | Blocks | A crate with a chest window of 1, 3 or 6 rows that can keep its contents when broken | **Crate**: **Crate name**, **Size**, **Keep contents when broken**, **Look**, **Colour**. **Recipe**: **Crafted from**. **Pictures**: **Front**, **Front when open**. |
| **Machine** | Blocks | A machine with a power, a speed and up to three recipes of its own | **Machine**: **Machine name**, **Colour**, **Power**, **Speed**. **Recipes**: **Also takes vanilla recipes**, **First recipe**, **Second recipe**, **Third recipe**. **Crafting**: **Crafted from**. **Pictures**: **Front**, **Front when working**, **Sides and back**, **Top and bottom**. |
| **Painting** | Blocks | A painting of your own picture, 1 by 1 to 4 by 4 blocks | **Painting**: **Title**, **Author**, **Size**. **Picture**: **Picture** (a PNG you pick, or a placeholder landscape), **Placeholder colour**. |
| **Dimension** | Worlds | A world of its own, with a key or a command to get there | **World**: **Dimension name**, **Terrain**, **Biome**, **Sky and rules**. **Travel**: **How to get there** (a key item, or a command only for vanilla packs), **Key colour**. |
| **Villager trade** | Worlds | A trade that a vanilla villager or the wandering trader may offer | **Villager**: **Villager** (a profession or **Wandering trader**), **Level**. **Trade**: **The villager** (sells or buys the item), **Item**, **Number of items**, **Number of emeralds**, **Uses before restocking**, **Villager experience per trade**. |
| **Extra drop** | Worlds | An extra item in the loot of a vanilla mob, block or chest; the vanilla drops stay | **Where**: **Drops from**, **Only when a player kills the mob**. **Drop**: **Item**, **Fewest items**, **Most items**, **Chance in per cent**. |
| **Music disc** | Blocks | A jukebox song with its own music disc | **Song**: **Song name**, **Artist**, **Song file** (your `.ogg`), **Length in seconds**, **Comparator signal**. **Disc**: **Label colour**, **Disc** (a new music disc item, or music disc 13 with a new look for vanilla packs). |
| **Food** | Food | Something to eat | **Food**: **Food name**, **Colour**. **Eating**: **Hunger restored**, **Saturation**, **Can be eaten when not hungry**. **Recipe**: **Crafted from**. |
| **Consumable** | Food | A food with effects, a potion-like drink or a charm | **Item**: **Name**, **Colour**, **Kind** (food, drink or charm). **Using**: **Hunger restored**, **Saturation**, **Can be eaten when not hungry**, **Seconds to eat or drink**, **Cooldown in seconds**, **Leaves a glass bottle**. **Effects**: two effects with seconds, level and chance. **Recipe**: **Crafted from**. |
| **Custom mob** | Mobs | An animated mob with behaviour, spawning, a spawn egg and drops | **Mob**: **Mob name**, **Skin colour**, **Skin** (a player skin PNG), **Arms**, spawn egg colours. **Behaviour**: **Health**, **Walking speed**, **Behaviour** (peaceful, neutral, hostile or **Hostile archer**). **Variants**: **Extra variants**. **Spawning**: **Spawns in**. |
| **Pet** | Mobs | An animal you tame, that sits, follows and defends you and has babies | **Mob**: **Pet name**, **Model**, **Colour**, **Skin picture**. **Behaviour**: **Taming food**, **Sits when told**, **Defends you**, **Can have babies**, **Breeding food**, **Health**, **Speed**. **Variants**: **Extra variants** with **Variant 1 colour**, **Variant 1 picture**, **Variant 1 appears in** and so on. **Spawning**: **Spawns in**. |
| **Farm animal** | Mobs | An animal you breed with a food, with babies and drops | **Mob**: **Animal name**, **Model**, **Colour**, **Skin picture**. **Behaviour**: **Breeding food**, **Baby size**, **Drops**, **Most drops**, **Can be ridden**, **Health**, **Speed**. **Variants**, **Spawning**. |
| **Mount** | Mobs | A mob you ride and steer, on the ground or in the air | **Mob**: **Mount name**, **Model**, **Colour**, **Skin picture**. **Behaviour**: **Needs a saddle**, **Speed**, **Jump strength**, **Only its owner can ride it**, **Flying**, **Health**. **Variants**, **Spawning**. |
| **Flying mob** | Mobs | A mob that flies and hovers: friendly, neutral, hostile or shooting | **Mob**: **Mob name**, **Model**, **Colour**, **Skin picture**. **Behaviour**: **Behaviour**, **Projectile**, **Flying speed**, **Health**. **Variants**, **Spawning**. |
| **Water mob** | Mobs | A fish, a dolphin-like swimmer or an amphibian | **Mob**: **Mob name**, **Model**, **Colour**, **Skin picture**. **Behaviour**: **Kind**, **Behaviour**, **Health**. **Variants**, **Spawning**. |
| **Boss** | Mobs | A large monster with a boss bar that darkens the sky | **Mob**: **Boss name**, **Model**, **Size**, **Colour**, **Skin picture**. **Behaviour**: **Attacks**, **Melee damage**, **Drops**, **Health**. **Boss bar**: **Boss bar colour**, **Boss bar style**, **Darkens the sky**. |
| **Status effect** | Magic | A status effect of your own with its icon, and a drink, a throwable flask or a brewed potion that gives it | **Effect**: **Name**, **Colour**, **Good or bad**. **Behaviour**: **What it does** (nothing extra, heals, hurts, shows particles or runs a function), **Amount**, **Every how many seconds**, **Stronger levels act faster**, **Particles**. **Stats**: **Stat change 1** and **Stat change 2** with their amounts per level. **Getting it**: **How players get it**, **Seconds it lasts**, **Level**, **Crafted from**, **Brewed from**. |
| **Potion** | Magic | A potion for the brewing stand of a new effect or a vanilla one, with longer, stronger, splash and lingering versions and tipped arrows | **Potion**: **Name**. **Effect**: **Effect** (a new effect of its own, or a vanilla effect), **Colour**, **Stat change 1** and **Stat change 2** with their amounts per level (new effect only), **Seconds it lasts**, **Level**. **Brewing**: **Brewed from**, **Ingredient**. **Versions**: **Longer version**, **Longer version: seconds**, **Stronger version**, **Stronger version: seconds**, **Splash potion**, **Lingering potion and tipped arrows**. |
| **Mob skin** | Mobs | A new skin for a vanilla wolf, cat, pig, cow, chicken or frog, with placeholder textures of the right size | **Skin**: **Name**, **Animal**, **Colour**. **Where**: **Where it appears** (**In a biome** or **Everywhere**), **Biome**. |
| **Goat horn** | Gear | A goat horn with a call of its own | **Horn**: **Name**, **Sound** (one of the eight vanilla calls), **Sound file** (your own `.ogg`), **Seconds per blow**, **Heard from (blocks)**. **Getting it**: **Crafted from** (or **No recipe**), **Goats drop it**. |
| **Scripted behaviour** | Scripts | An item whose use runs a script you can open and change | **Item**: **Item name**, **Colour**, **Cooldown in seconds**. **Behaviour**: **What it does when used** (heal, launch upward, strike lightning, give an effect) and its numbers. |

Some notes on the Gear set:

- The armour pieces share one equipment element, `<namespace>:<material>_armor`, with the worn textures `textures/entity/equipment/humanoid/<material>.png` and `humanoid_leggings/<material>.png` (and `horse_body/`, `wolf_body/` for horse and wolf armour). See [Armour](blocks-and-items.md#armour).
- A vanilla **Tier** gives the tools the numbers of that material; **Custom** makes a tool material of its own, which mines what **Mines like** mines ([Custom tool materials](blocks-and-items.md#custom-tool-materials)).
- **Armour stats** "Like iron" (and so on) copies iron's numbers into a material of the set's own, so the pieces keep their own look instead of drawing iron armour.
- Upgrading at a smithing table adds a smithing template item, made from four of the material around paper, and one smithing recipe per piece instead of the crafting recipes.

## The live preview

The right side of the dialog previews what **Create** would add, rebuilt a moment after each change. The tabs:

- **Items** and **Blocks**: a card per item or block with its texture and name; the chosen one is shown in 3D.
- **Recipes**: a picture of every recipe (crafting grid, furnace, stonecutter, smithing table).
- **Armour**: the armour on a figure in 3D, the two worn texture layers, and the horse and wolf armour layers when the set has them. The figure is a preview aid; the game is the reference.
- **Stats**: the numbers in words: durability, mining speed, armour points, attack damage and speed (for a vanilla tier, "of a vanilla <tier> <type>"), arrow speed, how long eating takes, and a table of the effects a consumable, totem or charm gives.
- **Card** (Enchantment, Painting, Status effect and Throwable): the enchantment's tooltip and its values per level; the painting on a wall at its size in blocks, with a note when the picture's proportions do not fit (the game then stretches it); the status effect's icon, its name in the colour of its kind (blue for good and neutral, red for bad), what it does and a table of its stat changes and how often it acts at levels I to IV; the throwable's picture, a sketch of a level throw from eye height with how far it lands, its damage and what happens after the throw and on a hit. The Status effect flow opens on this tab.
- **Elements**: everything that will change, grouped as **Will be created**, **Will be replaced**, **Will be added to**, **Will be removed**, **Kept your edits**, **Already in the project (skipped)**, **Unchanged** and **No longer used (left in the project)**. A row marked **Already exists** is an element of the same id that the project already has; the Creator leaves it alone.

The 3D views need WebGL; without it the cards and tables still work.

## Pick a picture

The **Painting** flow's **Picture** field takes a PNG of your own. Choose **Choose picture…** and pick the file; the field shows a thumbnail and its size ("PNG image, 32 by 16 pixels"), and the **Card** tab shows it on the wall. **Replace…** picks another, **Remove image** goes back to the placeholder landscape. The picture should have the proportions of the painting's **Size**, 16 pixels per block or more, at most 256 by 256 pixels and 1 MB; a file that is not a PNG or is too large shows the reason under the field and the previous picture stays. The picture is copied into the project as it is, without scaling.

## Create and Undo

Choose **Create**. The dialog closes, the sidebar shows the new elements and a message says how much changed, for example "Create Gear set: <n> element(s) and file(s) changed. Undo reverts them in one step." Everything the Creator added is one step: **Undo** (toolbar, **Edit → Undo** or Ctrl+Z) takes it all back, textures included, and **Redo** puts it back.

The Creator never adds a second `pack.mcmeta` or mod metadata element to a project that has one, and it adds to language files and tags that already exist (missing names and entries only) instead of replacing them.

## Edit in Creator

Every element a flow made remembers the flow and the answers. Select one of them, for example the helmet of a Gear set, and choose **Edit in Creator** at the top of the editor. The Creator opens on that set's flow (title **Edit: <flow>**) with the answers you gave, on the **Elements** tab.

Change what you like: another colour, another tier, a piece more or less. **Create** then applies the change as one step named "Update <flow>", which one Undo takes back, old textures included.

**The kept-edits rule.** The Creator compares each element of the set with what it made at the time:

- an element you have not changed is replaced by the new version (**Will be replaced**), or stays as it is when the new answers make the same thing (**Unchanged**);
- an element you changed by hand, for example a sword whose attack damage you set in **Raw JSON**, is left alone and listed under **Kept your edits**. Open **Your version and the Creator's** to compare them, and tick **Overwrite** to take the Creator's version after all;
- a renamed element is still recognised and updated under its new id;
- a piece you untick is removed when you have not changed it, and kept (under **Kept your edits**) when you have;
- a texture you replaced with your own is kept the same way; one the new answers no longer use stays in the project (**No longer used (left in the project)**).

## Make a status effect or a throwable

The **Status effect** flow (under **Magic**) and the **Throwable** flow (under **Gear**) are explained step by step, with the Effect Studio, effect icons and the limits, in [Status effects and throwables](effects-and-throwables.md). Both need the Fabric mod jar. A status effect's icon is an 18 by 18 placeholder badge in its colour at `textures/mob_effect/<name>.png`; paint over it like any other placeholder.

## Make a potion

The **Potion** flow (under **Magic**) makes a potion for the brewing stand, of a new effect with its icon or of a vanilla effect, with longer and stronger versions brewed with redstone and glowstone dust, and splash and lingering bottles with tipped arrows. [Potions and brewing](potions.md) explains it with the Potion Studio, the ids of the versions and the limits. The Status effect flow's **A brewed potion** makes one for its effect. Potions need the Fabric mod jar.

## Make a mob

The **Custom mob** flow makes an animated mob with a player skin; the **Pet**, **Farm animal**, **Mount**, **Flying mob**, **Water mob** and **Boss** flows (all under **Mobs**) add taming, breeding, riding, flying, swimming and a boss bar, each with a ready-made **Model** (four-legged, bird, fish, round flyer, two-legged or cube creature), its animations and a placeholder skin of your **Colour** or your own **Skin picture**. **Extra variants** (0 to 3; every flow but **Boss**) give the mob other skins, each with its own colour, picture and **Variant n appears in** (anywhere, or a biome group). They work on both Minecraft versions: on the 26.4 snapshot the mobs are drawn by the runtime's built-in renderer and need no GeckoLib. [Mob behaviours](mob-behaviours.md) explains what each answer sets and the limits; open the result in the Entity Studio to go further.

## Make a mob skin or a goat horn

The **Mob skin** flow (under **Mobs**) and the **Goat horn** flow (under **Gear**) add to vanilla mobs and items with data only, so they work in plain packs; [Adding to vanilla](adding-to-vanilla.md#mob-skins) explains both.

## Make a block family or a plant

The **Wood set**, **Stone set**, **Crop** and **Tree** flows (under **Blocks**) make whole families: stairs, slabs, doors and the rest, crops with seeds and produce, and trees with a sapling. Their **Blocks** preview tab shows "The whole set, left to right" as a row of block models, and the recipes appear as crafting grids. Every member is an ordinary block you can open in the Block Studio and edit; [Block types, families and plants](block-types-and-plants.md) explains the types, the fields and the limits.

## Make a crate or a machine

The **Storage crate** and **Machine** flows (under **Blocks**) make a block that holds items: a crate with a chest window of 1, 3 or 6 rows, or a grinder-like machine with recipes of your own, a power and a speed. Each creates with its untouched defaults and zero problems, and opens in the Block Studio's **Inventory** section for the rest. [Containers and machines](containers-and-machines.md) explains the answers and the limits. Both need the Fabric mod jar.

## Make a dimension

The **Dimension** flow (under **Worlds**) makes a new world to visit. Pick the **Terrain** (hills like the overworld, towering amplified peaks, floating islands, one big cave with a roof, nether-like caverns, end-like islands, or completely flat), the **Biome** (one biome everywhere, such as a cherry grove or a desert, or the overworld's mix) and the **Sky and rules** (the overworld sky, always dark, the nether haze or the end sky). **Create** adds the dimension and a travel function. With a key item (the default, which needs the Fabric mod jar), use the key to go there and use it again to come back; each trip lands you on solid ground near where you stand. In vanilla packs, run `/function <namespace>:<name>/travel` instead. The game loads new dimensions when a world opens, so reopen your world after adding one. Floating islands and end-like terrain can have no ground nearby; then the game says it could not find a spot, and you stay where you are.

## Add to vanilla content

Three flows change what the game already has instead of making something new; [Adding to vanilla](adding-to-vanilla.md) explains them with their limits:

- **Custom ore** (under **Blocks**): with **Generate in the world** on (the default), the ore generates underground in every overworld biome through a world addition, a placed feature and an ore feature. Only newly generated chunks get it. Untick it for an ore without generation.
- **Extra drop** (under **Worlds**): an extra item from a zombie, a skeleton, a block such as gravel or a chest such as a dungeon's, with a count and a chance. The vanilla drops stay, and a world's own data pack that replaces the table wins.
- **Villager trade** (under **Worlds**): a trade for a villager profession and level, or the wandering trader. It joins the villager's list of possible trades, so it is a candidate, not a guarantee.

## Add your own song

The **Music disc** flow's **Song file** takes your music as an Ogg Vorbis file (`.ogg`, at most 16 MB). Choose **Choose song…** and pick it; the field shows its length and whether it is mono or stereo ("Ogg Vorbis, 2:05, stereo"). **Create** stores it as `sounds/<song id>.ogg`, the disc plays it, and the jukebox's playing time is the song's length, so **Length in seconds** is only used without a file. A mono file fades with distance from the jukebox, like the vanilla discs; a stereo one plays at the same volume everywhere. Other formats (MP3, WAV) must be converted to Ogg Vorbis first, for example with Audacity. **Remove sound** goes back to the vanilla "cat" record.

## Use a player skin

The **Custom mob** flow's **Skin** field takes a player skin: a PNG of 64 by 64 pixels, or an old one of 64 by 32. Choose **Choose picture…** and pick the file; the mob wears it, including its second layer (the hat, jacket, sleeves and trousers) on a 64 by 64 skin. For a slim (Alex-style) skin, set **Arms** to **Slim (3 pixels)**. An old 64 by 32 skin uses its right arm and leg for both sides, as the game used to. Leave the field empty for a placeholder in the **Skin colour**.

## Picture to texture

**File → Picture to Texture…** (also the picture button beside a namespace's assets heading, and the palette) turns a screenshot or any picture into a texture. Paste a screenshot with Ctrl+V, drop a picture on the dialog, or choose **Choose picture…** (PNG, JPEG, GIF, BMP or WebP). Pick **What it is for**: an item or a block (16 by 16), an armour layer (64 by 32), a mob skin (64 by 64) or a painting of 1 by 1 to 4 by 4 blocks. Drag over the picture to choose the part to use; the frame keeps the texture's proportions, and **Reset crop** starts again. Then:

- **Smooth (photos, screenshots)** averages the pixels; **Sharp (pixel art)** keeps hard edges, for pictures that are already pixel art.
- **Make the background transparent** removes the colour around the subject (the colour of the picture's corners), with a **Tolerance** for colours close to it.
- **Colours** reduces the picture to at most 32, 16 or 8 colours, for a cleaner pixel-art look.

**More options** turns the picture (left or right), mirrors it or turns it upside down, switches between **Fill the texture** (crop to its shape) and **Fit the whole part** (the part you drag is kept whole, with transparency around it), adjusts **Brightness**, **Contrast**, **Colourfulness** and **Hue** (**Reset colours** puts them back), and adds an **Outline**: dark like vanilla items, or a colour of your own. You can paste, drop or choose several pictures at once: they line up in a tray above the options, and a click on one switches to it (its file name becomes the texture name until you type your own); the × removes one. The preview shows the texture as it will be saved. **Add texture** adds it to the project (one **Edit → Undo** removes it); **Touch up in the painter…** opens the texture editor on it first. A skin of 64 by 32 pixels chosen for a mob skin is converted to the 64 by 64 layout. Point a model, an equipment layer or the Creator's **Skin** and **Picture** fields at the new texture to use it.

## Swap textures by dragging

To change what an item, block or model looks like, drag a texture from the namespace's assets (the mouse shows a hand over textures) and drop it on the element in the sidebar, or on the live preview beside the form. An item or block changes the model it draws with (the `layer0` texture of an item model, the `all` texture of a simple block); one **Edit → Undo** puts the old texture back. Items and blocks that use a vanilla model need a model of their own first. Pictures dropped anywhere on the window from your computer open **Picture to texture** with them in the tray.

## Replacing the placeholders

The Creator draws simple placeholder textures in the colour you choose. To change one inside MCSuperMods, choose the brush (**Paint this texture**) on its row under the namespace's assets: the texture editor has a pencil, an eraser, a fill bucket, a colour picker and the texture's own colours, zoom, and undo and redo (Ctrl+Z, Ctrl+Shift+Z). **Save** writes it, and one **Edit → Undo** brings the old picture back. To paint a new texture from a blank picture, choose the brush beside the namespace's assets heading (**New texture…**), type a **Name** and pick **What it is for** (an item or block, 16 by 16; an armour layer, 64 by 32; a status effect icon, 18 by 18; a 2 by 2 painting, 32 by 32), then **Paint…**: **Save** adds it to the project, and **Edit → Undo** removes it again. Point a model or an equipment layer at it to use it. To use a picture made elsewhere, paint a PNG with the same file name and choose **Import assets** on the toolbar, as in [Replacing the placeholders](templates-and-examples.md#replacing-the-placeholders). An imported texture counts as your edit, so **Edit in Creator** keeps it. The worn armour layers are 64 by 32 pixels in the vanilla armour layout (`humanoid` for the helmet, chestplate and boots, `humanoid_leggings` for the leggings).

## The AI helper uses the same flows

When the AI helper adds a whole piece of content, it uses these flows with the answers it chose. The elements it adds carry the same record of flow and answers, so after you apply its changes, **Edit in Creator** reopens them like a set you made yourself.

## Try it in the game

Export the **Fabric mod jar** ([Blocks and items](blocks-and-items.md#export-a-fabric-mod-jar)) or use **Test in Minecraft** ([Blocks and items](blocks-and-items.md#test-in-minecraft)); **Problems** must show no errors. In a creative world, give yourself an item with `/give @s <namespace>:<id>`. For a Gear set, put the armour on and check the look and the armour bar; for an enchantment, use `/enchant @s <namespace>:<id>` or an enchanting table; for a painting, hang paintings on a wall big enough for its size: the flow adds it to the `minecraft:placeable` tag, so the game picks it at random among the paintings that fit.
