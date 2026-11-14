# Adding to vanilla

Most of MCSuperMods makes new things: a block, an item, a mob. This page is about changing what the game already has without replacing its files: your ore in the normal overworld, an extra drop for a zombie, an item that burns in a furnace or goes in a composter, a new trade for a villager, a new skin for a wolf or a cow, a new goat horn call, and icons in chat text. Each addition keeps the vanilla content as it is and adds to it, so it works next to other mods that add to the same things.

| Addition | How you make it | Where it works |
|---|---|---|
| Ore and other features in vanilla biomes, and natural spawns | The Custom ore flow's **World** questions, the **Ore in the overworld** template, or a **World addition** element | Fabric mod jar only |
| Extra drops from vanilla mobs, blocks and chests | The **Extra drop** flow, the **Extra mob drop** template, or an **Extra drops** element | Fabric mod jar only |
| Fuel and compost | **Fuel and compost** in the Item Studio, or in the Block Studio's **Block item** section | Fabric mod jar only (on your own items) |
| A new villager or wandering trader trade | The **Villager trade** flow, or the trade templates and a villager trade tag | Data pack and Fabric mod jar |
| A new skin for a wolf, cat, pig, cow, chicken, frog or zombie nautilus | The **Mob skin** flow, or the **Wolf variant** and **Cat variant** templates | Data and resource pack, and Fabric mod jar |
| A new goat horn call | The **Goat horn** flow, or the **Goat horn instrument** template | Data and resource pack, and Fabric mod jar |
| Other sounds for cats, pigs, cows and chickens, enchantment providers, timelines and world clocks | Add element, by kind (see [Other data kinds](#other-data-kinds)) | Data pack and Fabric mod jar |
| Icons in text (fonts) and texture atlas sources | The **Icon font** template, or a font or atlas element | Resource pack and Fabric mod jar |

World additions and extra drops are MCSuperMods kinds (`msm:biome_addition` and `msm:loot_addition`): the `msm_runtime` mod applies them when the game starts, so they reach the game only through the **Fabric mod jar** export ([Blocks and items](blocks-and-items.md#export-a-fabric-mod-jar)). The resource and data pack exports leave them out. Trades are plain data and work in a data pack too.

## Ore that generates

The **Custom ore** flow (Creator group **Blocks**, and the Custom ore starter in **New from starter…**) has a **World** step. **Generate in the world** is on by default and adds three elements next to the ore:

- a configured feature `ore_<gem>` (for Ruby: `ore_ruby`, in the sidebar group **Worldgen**): one vein of up to **Vein size** ore blocks that replaces stone and deepslate;
- a placed feature `ore_<gem>_placed` (also under **Worldgen**): **Veins per chunk** tries in each chunk, at a random height from **Lowest height** to **Highest height** (the overworld starts at y -64);
- a world addition `<gem>_ore_generation` (sidebar group **World additions**) that adds the placed feature to every biome in `#minecraft:is_overworld` at the underground ores step, as vanilla does with its own ores.

Untick **Generate in the world** for an ore that only exists through commands and recipes; the flow then makes exactly what it made before this option existed. A project made before keeps its ore as it is until you run **Edit in Creator** on it and leave the option on. The **Scripted ore** starter generates its ruby ore in the same way. The example **Ore that generates** (Help → Examples…) shows the four elements of a jade ore with comments.

Two things to know about the ore:

- **Only new chunks get it.** The game places ores when it first generates a chunk. Land you have already explored keeps what it had, so look in a new world or travel to land you have not visited yet.
- **It replaces plain stone and deepslate.** The feature's targets name `minecraft:stone` and `minecraft:deepslate` (a `minecraft:block_match` test), not the vanilla `#minecraft:stone_ore_replaceables` and `#minecraft:deepslate_ore_replaceables` tags, so it does not replace granite, diorite, andesite or tuff yet. Edit the feature in the Worldgen Studio or **Raw JSON** to change the targets ([Worldgen](worldgen.md)).

## World additions

A **World addition** element adds placed features and natural mob spawns to biomes that already exist. Add one from the **Additions** category of **Add element** (template **Ore in the overworld**), and edit it in its Studio:

- **Biomes**: biome tags (starting with `#`, such as `#minecraft:is_overworld` or `#minecraft:is_forest`) and single biomes (such as `minecraft:plains`). The addition applies to all of them.
- **Features**: **Add feature** adds a row with a placed feature and its generation step. Ores go in `underground_ores`, flowers and grass in `vegetal_decoration`. The **Ore in the overworld** template names `<its own id>_placed`: make that placed feature and its feature in the Worldgen Studio, or point the row at one you have.
- **Spawns**: **Add spawn** adds a row with an entity type, a category (such as `monster` or `creature`), a weight and the smallest and largest group. This is how a vanilla mob, or another mod's, spawns in more biomes; your own mobs can also use the Entity Studio's **Spawning** section ([Entities and models](entities-and-models.md#spawning)).

**Advanced (all fields)** shows the same data as a plain form, and **Raw JSON** as text. **Problems** checks the biome, tag, feature and entity ids, reports a spawn whose largest group is smaller than its smallest (`blocks-items.spawn-group-size`, an error), and warns when a biome of your project already lists a placed feature that an addition adds to it again (`blocks-items.duplicate-biome-feature`), because it would generate twice.

The game reads world additions once, when a world opens. A change needs the world to be closed and opened again (or the server restarted); `/reload` does not apply it. An id the game does not know (a removed feature, a misspelt biome) is a warning in the game log after start-up, and the rest of the addition still applies.

## Extra drops

An **Extra drops** element adds drops to existing loot tables, on top of what they already drop. The quick way is the **Extra drop** flow (Creator group **Worlds**): **Drops from** picks a mob, block or chest (zombie, skeleton, creeper, stone, gravel, oak leaves, a dungeon chest and others), **Only when a player kills the mob** (mobs only), then the **Item**, **Fewest items**, **Most items** and **Chance in per cent**. The example **Zombie drops a ruby** shows a ruby that zombies sometimes drop when a player kills them.

To make one by hand, add **Extra mob drop** from the **Additions** category (one emerald from zombies, one time in ten, only when a player kills them) and edit it in the Extra drops Studio:

- **Loot tables**: the tables to add to. **Suggest tables of** narrows the suggestions to **Mobs**, **Blocks** or **Chests**, so typing `zombie` with **Mobs** offers `minecraft:entities/zombie`.
- **Drops**: each row is one drop with its item, the smallest and largest count, the chance in per cent and **Only when a player kills it**. **Add drop** adds a row. Each drop is rolled once each time the table is used.

A drop that does more (several entries, enchantment bonuses, its own functions) is a full vanilla loot pool: the row then says to edit it under **Advanced (all fields)** or in **Raw JSON**. **Problems** checks every pool against the vanilla loot pool format of the project's Minecraft version, and warns about an item that is neither a vanilla item nor one of the project's (`blocks-items.unknown-loot-item`).

What to expect in the game:

- The vanilla drops stay; the extra drops come on top.
- Extra drops follow `/reload`, without ever doubling.
- **A world's own data pack wins.** If a data pack in the world replaces the whole loot table (for example a pack that rewrites zombie drops), MCSuperMods leaves that table alone and your extra drop does not appear. This keeps the world's pack in charge, as Fabric recommends.
- A pool the game cannot read is skipped with one error in the game log, and the rest of the game loads.

## Fuel and compost

An item of your own can burn in a furnace and go in a composter. In the Item Studio's **Fuel and compost** section (for a block, in the Block Studio's **Block item** section):

- tick **Burns in a furnace** and set **Burn time (seconds)**. Coal burns for 80 seconds and smelts eight items, so 40 seconds smelts four. The shortest burn time is 0.05 seconds (one tick).
- pick a **Compost chance** (30%, 50%, 65%, 85% or 100%): how likely one item raises the composter's level. **(not compostable)** turns it off.

The export writes them as the vanilla item components `minecraft:cooking_fuel` and `minecraft:compostable`, so furnaces, smokers, blast furnaces and composters treat the item like a vanilla one. Setting the same component under **Vanilla components** as well is an error (`blocks-items.component-conflict`). The template **Fuel item** and the example **Fuel log** show both. Brewing stand fuel has no field: add `minecraft:brewing_fuel` under [Vanilla components](blocks-and-items.md#vanilla-components).

Fuel and compost values work on your own items and block items only; vanilla items keep theirs.

## Villager trades

The **Villager trade** flow (Creator group **Worlds**) adds one trade to a vanilla villager profession or to the wandering trader:

- **Villager**: the profession (Armourer, Butcher, Cartographer, Cleric, Farmer, Fisherman, Fletcher, Leatherworker, Librarian, Mason, Shepherd, Toolsmith, Weaponsmith) or **Wandering trader**; **Level**, from **Novice (level 1)** to **Master (level 5)**.
- **Trade**: **The villager** sells or buys the item, the **Item**, the **Number of items**, the **Number of emeralds**, **Uses before restocking** and **Villager experience per trade**.

It makes two elements: a villager trade (kind `minecraft:villager_trade`) and the vanilla trade tag of that villager and level, for example `minecraft:fletcher/level_1` (the wandering trader uses `minecraft:wandering_trader/common`). The tag lists only your trade and does not replace vanilla's, so the export merges it with the vanilla trades. By hand, use the templates **Trade: emeralds for an item**, **Trade: item for emeralds** and **Villager trade tag: fletcher, level 1** from the **Trades** category. The examples **Villager trade**, **Villager trade tag** and **Trade set** show each kind.

**A new trade is a candidate, not a guarantee.** A villager draws only a few trades for each level from its list (the vanilla trade set says how many). Your trade joins the list, so some villagers of that profession offer it and others do not. To guarantee it, a project **Trade set** (template **Trade set**) with the vanilla name replaces vanilla's set for that level, which changes the vanilla villagers' trades as well; that is a replacement, not an addition.

Trades work in a plain data pack as well as in the Fabric mod jar. A villager picks the offers of a level when it reaches that level, so villagers that already passed it keep the offers they have: look at new villagers, or at ones still below the level.

## Mob skins

The **Mob skin** flow (Creator group **Mobs**) gives a vanilla animal a new skin that the game picks when the animal spawns, next to its vanilla skins:

- **Skin**: **Name** (ids come from it: "Ember Coat" gives `ember_coat`), **Animal** (**Wolf**, **Cat**, **Pig**, **Cow**, **Chicken** or **Frog**) and **Colour**, the colour of the placeholder textures.
- **Where**: **Where it appears** is **In a biome**, with the **Biome** (forests, taigas, snowy taiga, savannas, plains, swamp and others), or **Everywhere**.

It makes one element of the animal's variant kind (sidebar **Wolf skins**, **Cat skins**, **Pig skins**, **Cow skins**, **Chicken skins** or **Frog skins**) and the placeholder textures under `textures/entity/<animal>/`, in the sizes the game needs: a wolf has six (wild, tame and angry, each for a grown wolf, 64 by 32 pixels, and a pup, 32 by 32); a cat, pig, cow or chicken has one for a grown animal and one for a baby; a frog has one, 48 by 48. Paint over them, keeping their size, in the texture editor or with **Picture to texture** ([The Creator](creator.md#picture-to-texture)); MCSuperMods never copies the vanilla skins.

**Which skin an animal gets.** Each skin has spawn conditions with a priority. When an animal spawns, the game takes the skins whose condition matches where it spawns, keeps those with the highest priority and picks one of them at random. **In a biome** gives your skin priority 1 in that biome, so it joins the vanilla skins of that biome (for a wolf in a snowy taiga, the snowy wolf and yours). **Everywhere** gives it priority 0 with no condition, so it is picked only where no biome skin applies. The animal must spawn in the biome you pick: wolves in forests, taigas, groves, savannas and badlands, cats in villages and swamp huts, frogs in swamps (a tadpole picks its skin when it grows up). `/summon minecraft:wolf ~ ~ ~ {variant:"<namespace>:ember_coat"}` shows the skin at once.

By hand, the templates **Wolf variant** and **Cat variant** (category **Mobs**) start from a wolf skin for taigas and a cat skin for swamps that use vanilla textures until you add your own; the other animals start from their kind's default in **Add element**. Zombie nautilus skins (sidebar **Zombie nautilus skins**) have no flow. The examples **Snowy wolf skin**, **Cat variant**, **Pig variant**, **Cow variant**, **Chicken variant**, **Frog variant** and **Zombie nautilus variant** show each kind.

## Goat horns

The **Goat horn** flow (Creator group **Gear**) adds a new call that a goat horn can play:

- **Horn**: **Name** (shown on the horn), **Sound** (one of the eight vanilla calls: **Ponder**, **Sing**, **Seek**, **Feel**, **Admire**, **Call**, **Yearn**, **Dream**), **Sound file** (your own call as an Ogg Vorbis `.ogg` file of at most 4 MB, which replaces the vanilla sound; a mono file fades with distance), **Seconds per blow** (vanilla horns take 7, and the horn then cools down as long) and **Heard from (blocks)** (vanilla horns reach 256).
- **Getting it**: **Crafted from** (any goat horn and one echo shard, amethyst shard, copper ingot, gold ingot or note block in the crafting grid make a horn with the new call; or **No recipe**) and **Goats drop it**.

It makes an instrument element (sidebar **Horn sounds**), the call's name in `en_us`, the crafting recipe, and with **Goats drop it** the vanilla tag `minecraft:regular_goat_horns`, which the export merges with vanilla's, so goats that ram a tree or stone drop your call as well as the eight vanilla ones. With a sound file it also adds a `sounds` element and the `.ogg`. `/give @s minecraft:goat_horn[minecraft:instrument="<namespace>:storm_call"]` gives the horn. The template **Goat horn instrument** (category **Other data**) and the example **Custom goat horn** show the instrument by hand.

## Other data kinds

These vanilla data kinds have no Studio: **Add element** offers each with its default content (and the form, **Advanced (all fields)** and **Raw JSON** as for any vanilla kind). They work in a plain data pack.

| Kind | Sidebar | What it does |
|---|---|---|
| `minecraft:cat_sound_variant`, `pig_sound_variant`, `cow_sound_variant`, `chicken_sound_variant` | **Cat sounds**, **Pig sounds**, **Cow sounds**, **Chicken sounds** | Another set of sounds for that animal, picked like a skin |
| `minecraft:enchantment_provider` | **Enchantment providers** | A named choice of enchantments, as the game uses for the gear some mobs spawn with |
| `minecraft:timeline` | **Timelines** | Values that change over time, following a world clock |
| `minecraft:world_clock` | **World clocks** | A clock that timelines follow |

There are also tags for eight more registries: banner patterns, dialogs, instruments, points of interest, potions, timelines, features and superflat presets (the tag kinds in **Add element**). The examples gallery has an example of each kind and tag ([Templates, starters and examples](templates-and-examples.md#all-examples)).

## Icon fonts

A resource pack can add a font: pictures that text shows as characters, for icons in chat, signs, books, titles and item names. The **Icon font** template (category **Fonts**; sidebar **Fonts**) makes a font with one icon, drawn from the texture `font/<name>.png` in the same namespace. Show it in text with `{"text": "\uE000", "font": "<namespace>:<name>"}`; each further icon is another character in the font's `chars`. An atlas element (kind `minecraft:atlas`, sidebar **Texture atlases**) adds texture sources to a vanilla atlas, for textures the game reads only through an atlas. The examples **Icon font** and **Atlas source** show both.

## What is not possible yet


These are planned for later, so nobody waits for them in this release:

- flammable blocks (fire spreading to your blocks) and block pairs: stripping a log with an axe, waxing, or copper that oxidises;
- fuel or compost values on vanilla items, and compost chances other than the five vanilla ones;
- removing vanilla features or spawns from biomes, cave carvers, new villager professions;
- a trigger when an item is crafted (`on_crafted`);
- wolf sound variants and trial spawners: the schema data MCSuperMods checks them against is out of date for the current Minecraft versions, so these kinds are left out until it is updated;
- other data kinds MCSuperMods leaves out on purpose for now: sulfur cube archetypes (they differ between Minecraft versions), test environments and test instances, block transformers, slot sources, shaders, post effects, waypoint styles and particle definitions.

## Try it in the game

1. Export the **Fabric mod jar** ([Export a Fabric mod jar](blocks-and-items.md#export-a-fabric-mod-jar)), or use **Test in Minecraft**. Mob skins, goat horns, trades and fonts also work from the vanilla data and resource packs.
2. **Ore**: create a **new** world and look at the heights you chose, for example in a cave or in spectator mode. Chunks generated before the mod was installed have no ore.
3. **Extra drops**: kill a few zombies (with a player kill when the drop asks for it); a chance of 10% needs about ten.
4. **Fuel and compost**: put the item in a furnace's fuel slot with something to smelt, and into a composter.
5. **Mob skins**: `/summon` the animal with the skin's id, then look for it where it spawns in a new chunk of the biome you chose, also as a baby.
6. **Goat horns**: craft the horn and blow it; with **Goats drop it**, let a goat ram a tree or a stone block.
7. **Fonts**: `/tellraw @s {"text": "\uE000", "font": "<namespace>:<name>"}`.
8. **Trades**: give a few new villagers the profession's workstation (a fletching table for a fletcher) and look at their offers, trading with them to reach higher levels; try several villagers, because a trade is a candidate.

When something does not appear, the runtime's summary line in the game log counts what it loaded ([Troubleshooting](blocks-and-items.md#troubleshooting)), and a missing id or a broken pool has its own warning or error line.
