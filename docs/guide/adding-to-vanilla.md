# Adding to vanilla

Most of MCSuperMods makes new things: a block, an item, a mob. This page is about changing what the game already has without replacing its files: your ore in the normal overworld, an extra drop for a zombie, an item that burns in a furnace or goes in a composter, a new trade for a villager, a new skin for a wolf or a cow, a new goat horn call, tools and fire on vanilla's own blocks, and icons in chat text. Each addition keeps the vanilla content as it is and adds to it, so it works next to other mods that add to the same things.

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
| What an axe, a shovel, a hoe, honeycomb, ageing and fire do to vanilla blocks | The **Rules for vanilla blocks** template and Studio (see [Rules for vanilla blocks](#rules-for-vanilla-blocks)) | Fabric mod jar only |
| Pot patterns, block transformers, game tests, sulfur cube kinds and named numbers | Add element, by kind (see [Other data kinds](#other-data-kinds)) | Data pack and Fabric mod jar |
| Screen effects, shader programs and locator bar dots | Add element, by kind (see [Screen effects, shaders and waypoints](#screen-effects-shaders-and-waypoints)) | Resource pack and Fabric mod jar |

World additions and extra drops are MCSuperMods kinds (`msm:biome_addition` and `msm:loot_addition`): the `msm_runtime` mod applies them when the game starts, so they reach the game only through the **Fabric mod jar** export ([Blocks and items](blocks-and-items.md#export-a-fabric-mod-jar)). The resource and data pack exports leave them out. Trades are plain data and work in a data pack too.

## Ore that generates

The **Custom ore** flow (Creator group **Blocks**, and the Custom ore starter in **New from starter…**) has a **World** step. **Generate in the world** is on by default and adds three elements next to the ore:

- a configured feature `ore_<gem>` (for Ruby: `ore_ruby`, in the sidebar group **Worldgen**): one vein of up to **Vein size** ore blocks that replaces the blocks of the vanilla `#minecraft:stone_ore_replaceables` and `#minecraft:deepslate_ore_replaceables` tags (stone, granite, diorite, andesite and deepslate), as vanilla ores do;
- a placed feature `ore_<gem>_placed` (also under **Worldgen**): **Veins per chunk** tries in each chunk, at a random height from **Lowest height** to **Highest height** (the overworld starts at y -64);
  **Vein numbers** keeps these four answers (**My own numbers below**, the default) or takes a vanilla ore's instead: **Like iron** (size 9, 10 veins, y -24 to 56), **Like gold** (size 9, 4 veins, y -64 to 32), **Like diamond** (size 4, 7 veins, deepest at y -64) or **Like coal** (size 17, 20 veins, y 0 to 192). With a preset the veins gather in the middle of the range and thin out towards its ends (a `minecraft:trapezoid` height), as vanilla's do. Vanilla spreads most ores over several placed features (iron has three bands), so one preset makes fewer ores a chunk than the vanilla ore it is named after;
- a world addition `<gem>_ore_generation` (sidebar group **World additions**) that adds the placed feature to every biome in `#minecraft:is_overworld` at the underground ores step, as vanilla does with its own ores.

Untick **Generate in the world** for an ore that only exists through commands and recipes; the flow then makes exactly what it made before this option existed. A project made before keeps its ore as it is until you run **Edit in Creator** on it and leave the option on. The **Scripted ore** starter generates its ruby ore in the same way. The example **Ore that generates** (Help → Examples…) shows the four elements of a jade ore with comments.

Two things to know about the ore:

- **Only new chunks get it.** The game places ores when it first generates a chunk. Land you have already explored keeps what it had, so look in a new world or travel to land you have not visited yet.
- **It replaces stone-like blocks, not dirt or gravel.** The feature's targets are `minecraft:tag_match` tests on the two replaceable tags, so veins also run through granite, diorite and andesite pockets, as vanilla ores do. Edit the feature in the Worldgen Studio or **Edit as raw text** to change the targets ([Worldgen](worldgen.md)).

## World additions

A **World addition** element adds placed features and natural mob spawns to biomes that already exist. Add one from the **Additions** category of **Add element** (template **Ore in the overworld**), and edit it in its Studio:

- **Biomes**: biome tags (starting with `#`, such as `#minecraft:is_overworld` or `#minecraft:is_forest`) and single biomes (such as `minecraft:plains`). The addition applies to all of them.
- **Features**: **Add feature** adds a row with a placed feature and its generation step. Ores go in `underground_ores`, flowers and grass in `vegetal_decoration`. The **Ore in the overworld** template names `<its own id>_placed`: make that placed feature and its feature in the Worldgen Studio, or point the row at one you have.
- **Spawns**: **Add spawn** adds a row with an entity type, a category (such as `monster` or `creature`), a weight and the smallest and largest group. This is how a vanilla mob, or another mod's, spawns in more biomes; your own mobs can also use the Entity Studio's **Spawning** section ([Entities and models](entities-and-models.md#spawning)).

**Every setting** shows the same data as a plain form, and **Edit as raw text** as text. **Problems** checks the biome, tag, feature and entity ids, reports a spawn whose largest group is smaller than its smallest (`blocks-items.spawn-group-size`, an error), and warns when a biome of your project already lists a placed feature that an addition adds to it again (`blocks-items.duplicate-biome-feature`): in the same step the addition does nothing there (the game skips a feature the step already has), and in another step the feature generates twice, once in each step.

**Add your own placed features, not vanilla ones.** An added feature goes to the end of its step, after the features vanilla runs later in that step. If the row names a vanilla placed feature (such as `minecraft:ore_diamond` or `minecraft:flower_plains`), vanilla biomes that list it earlier in the step now disagree with the biomes you added it to, and the world can stop with "Feature order cycle". **Problems** warns about it (`blocks-items.addition-vanilla-feature`), and the row's **Make my own copy** button makes a placed feature of your own in one undo step, with the vanilla one's configured feature and placement, and points the row at it. When the game's own file cannot be read, the copy names the configured feature and has no placement yet: open it and add where it goes (the Placed Feature Studio's templates help). Any added feature also moves the placement seeds of the vanilla features after it in that step, so the same world seed decorates a little differently with your mod ([Worldgen](worldgen.md#features-and-steps)).

The game reads world additions once, when a world opens. A change needs the world to be closed and opened again (or the server restarted); `/reload` does not apply it. An id the game does not know (a removed feature, a misspelt biome) is a warning in the game log after start-up, and the rest of the addition still applies.

## Extra drops

An **Extra drops** element adds drops to existing loot tables, on top of what they already drop. The quick way is the **Extra drop** flow (Creator group **Worlds**): **Drops from** picks a mob, block or chest (zombie, skeleton, creeper, stone, gravel, oak leaves, a dungeon chest and others), **Only when a player kills the mob** (mobs only), then the **Item**, **Fewest items**, **Most items** and **Chance in per cent**. The example **Zombie drops a ruby** shows a ruby that zombies sometimes drop when a player kills them.

To make one by hand, add **Extra mob drop** from the **Additions** category (one emerald from zombies, one time in ten, only when a player kills them) and edit it in the Extra drops Studio:

- **Loot tables**: the tables to add to. **Suggest tables of** narrows the suggestions to **Mobs**, **Blocks** or **Chests**, so typing `zombie` with **Mobs** offers `minecraft:entities/zombie`.
- **Drops**: each row is one drop with its item, the smallest and largest count, the chance in per cent and **Only when a player kills it**. **Add drop** adds a row. Each drop is rolled once each time the table is used.

A drop that does more (several entries, enchantment bonuses, its own functions) is a full vanilla loot pool: the row then says to edit it under **Every setting** or in **Edit as raw text**. **Problems** checks every pool against the vanilla loot pool format of the project's Minecraft version, and warns about an item that is neither a vanilla item nor one of the project's (`blocks-items.unknown-loot-item`).

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

- **Skin**: **Name** (ids come from it: "Ember Coat" gives `ember_coat`), **Animal** (**Wolf**, **Cat**, **Pig**, **Cow**, **Chicken** or **Frog**) and **Colour**, the colour of the drawn textures.
- **Where**: **Where it appears** is **In a biome**, with the **Biome** (forests, taigas, snowy taiga, savannas, plains, swamp and others), or **Everywhere**.

It makes one element of the animal's variant kind (sidebar **Wolf skins**, **Cat skins**, **Pig skins**, **Cow skins**, **Chicken skins** or **Frog skins**) and the drawn textures under `textures/entity/<animal>/` (an even coat, without eyes or markings), in the sizes the game needs: a wolf has six (wild, tame and angry, each for a grown wolf, 64 by 32 pixels, and a pup, 32 by 32); a cat, pig, cow or chicken has one for a grown animal and one for a baby; a frog has one, 48 by 48. Paint over them, keeping their size, in the texture editor or with **Picture to texture** ([The Creator](creator.md#picture-to-texture)); MCSuperMods never copies the vanilla skins.

**Which skin an animal gets.** Each skin has spawn conditions with a priority. When an animal spawns, the game takes the skins whose condition matches where it spawns, keeps those with the highest priority and picks one of them at random. **In a biome** gives your skin priority 1 in that biome, so it joins the vanilla skins of that biome (for a wolf in a snowy taiga, the snowy wolf and yours). **Everywhere** gives it priority 0 with no condition, so it is picked only where no biome skin applies. The animal must spawn in the biome you pick: wolves in forests, taigas, groves, savannas and badlands, cats in villages and swamp huts, frogs in swamps (a tadpole picks its skin when it grows up). `/summon minecraft:wolf ~ ~ ~ {variant:"<namespace>:ember_coat"}` shows the skin at once.

By hand, the templates **Wolf variant** and **Cat variant** (category **Mobs**) start from a wolf skin for taigas and a cat skin for swamps that use vanilla textures until you add your own; the other animals start from their kind's default in **Add element**. Zombie nautilus skins (sidebar **Zombie nautilus skins**) have no flow. The examples **Snowy wolf skin**, **Cat variant**, **Pig variant**, **Cow variant**, **Chicken variant**, **Frog variant** and **Zombie nautilus variant** show each kind.

## Goat horns

The **Goat horn** flow (Creator group **Gear**) adds a new call that a goat horn can play:

- **Horn**: **Name** (shown on the horn), **Sound** (one of the eight vanilla calls: **Ponder**, **Sing**, **Seek**, **Feel**, **Admire**, **Call**, **Yearn**, **Dream**), **Sound file** (your own call as an Ogg Vorbis `.ogg` file of at most 4 MB, which replaces the vanilla sound; a mono file fades with distance), **Seconds per blow** (vanilla horns take 7, and the horn then cools down as long) and **Heard from (blocks)** (vanilla horns reach 256).
- **Getting it**: **Crafted from** (any goat horn and one echo shard, amethyst shard, copper ingot, gold ingot or note block in the crafting grid make a horn with the new call; or **No recipe**) and **Goats drop it**.

It makes an instrument element (sidebar **Horn sounds**), the call's name in `en_us`, the crafting recipe, and with **Goats drop it** the vanilla tag `minecraft:regular_goat_horns`, which the export merges with vanilla's, so goats that ram a tree or stone drop your call as well as the eight vanilla ones. With a sound file it also adds a `sounds` element and the `.ogg`. `/give @s minecraft:goat_horn[minecraft:instrument="<namespace>:storm_call"]` gives the horn. The template **Goat horn instrument** (category **Other data**) and the example **Custom goat horn** show the instrument by hand.

## Rules for vanilla blocks

Minecraft's own blocks can get tool and fire rules of your own: an axe that scrapes the moss off mossy cobblestone, a shovel that packs mud, a hoe that turns a moss block into dirt, mushroom blocks that burn. **Add element** (Ctrl+N), category **Additions**, template **Rules for vanilla blocks**, starts with those examples; selecting the element opens the **Vanilla block rules** Studio. It says: "Rules for Minecraft's own blocks: what a tool turns them into, how they age and how they burn. They need the Fabric mod export; vanilla packs do not carry them."

Each list has **Add a block** and one row per block:

- **When you use an axe on it**: **Becomes** (an axe strips it, as logs into stripped logs; shared block states, such as which way a log lies, are kept);
- **When you use a shovel on it**: **Becomes** (as dirt into a path; only when there is air above it);
- **When you use a hoe on it**: **Becomes** and **Drops once** (as dirt into farmland; only when there is air above it; rooted dirt drops hanging roots);
- **When you use honeycomb on it**: **Becomes** (honeycomb waxes it; an axe scrapes the wax off again);
- **Ages like copper**: **Ages into** (it slowly ages into the next block, as copper; an axe scrapes it back);
- **Burns**: **Catches fire (0 to 300)** and **Burns away (0 to 300)** (Minecraft's planks are 5 and 20).

When Minecraft already pairs the block for that tool (an axe already strips an oak log), the row says "Minecraft already turns it into Stripped oak log; this rule replaces that." and **Problems** warns (`blocks-items.vanilla-pair-override`). **Problems** also warns about a block with two rules of one kind (`vanilla-rule-duplicate`; the last one wins) and a block that turns into itself (`vanilla-rule-same-block`), and notes a block of your own project (`vanilla-rule-project-block`): give it `msm:strippable`, `msm:flattenable` or `msm:tillable` instead ([Burning and stripping](block-types-and-plants.md#burning-and-stripping)). The example **Rules for vanilla blocks** shows a finished one.

Limits:

- **Rules for vanilla blocks need the Fabric mod jar**: the vanilla pack exports leave them out with the info `export.needs-jar`, and the Java project export does not include them yet (`export.not-in-eject`).
- **Ageing vanilla blocks** works on Minecraft 26.3 only, and only for blocks that already age as copper does; on 26.4 the rule is skipped with a warning in the game log.
- **Only players with the tool** use the rules; a dispenser does not.
- A data pack can also change what vanilla's axes, shovels and hoes do with a `minecraft:block_transformer` named `minecraft:axe`, `minecraft:shovel` or `minecraft:hoe` (see [Other data kinds](#other-data-kinds)); the rules here run before it.

## Other data kinds

These vanilla data kinds have no Studio: **Add element** offers each with its default content (and the form, **Every setting** and **Edit as raw text** as for any vanilla kind). They work in a plain data pack.

| Kind | Sidebar | What it does |
|---|---|---|
| `minecraft:cat_sound_variant`, `pig_sound_variant`, `cow_sound_variant`, `chicken_sound_variant` | **Cat sounds**, **Pig sounds**, **Cow sounds**, **Chicken sounds** | Another set of sounds for that animal, picked like a skin |
| `minecraft:enchantment_provider` | **Enchantment providers** | A named choice of enchantments, as the game uses for the gear some mobs spawn with |
| `minecraft:timeline` | **Timelines** | Values that change over time, following a world clock |
| `minecraft:world_clock` | **World clocks** | A clock that timelines follow |
| `minecraft:decorated_pot_pattern` | **Pot patterns** | A picture on a side of a decorated pot; a sherd item names it (the **Pot pattern** flow makes both) |
| `minecraft:block_transformer` | **Block transformers** | What a tool does when used on a block, tried in order; one named `minecraft:shovel` changes what shovels do |
| `minecraft:test_environment`, `minecraft:test_instance` | **Test environments**, **Test instances** | Game tests for map makers: where they run, and a test that places a structure and waits for a test block; run with `/test run` |
| `minecraft:sulfur_cube_archetype` | **Sulfur cube kinds** | A kind of sulfur cube and what feeding it does; its fields differ between Minecraft versions |
| `minecraft:context_int_provider`, `minecraft:context_float_provider` | **Whole-number providers**, **Decimal-number providers** | A named number the game reads, such as a compost chance or a cooking speed; one named after a vanilla one changes it |

There are also tags for eight more registries: banner patterns, dialogs, instruments, points of interest, potions, timelines, features and superflat presets (the tag kinds in **Add element**). The examples gallery has an example of each kind and tag ([Templates, starters and examples](templates-and-examples.md#all-examples)).

## Screen effects, shaders and waypoints

Three resource pack kinds change how the game draws:

| Kind | Sidebar | What it does |
|---|---|---|
| `minecraft:post_effect` | **Screen effects** | A screen effect such as the one you see while spectating a creeper (template **Spectator view effect**) |
| `minecraft:shader` | **Shader programs** | A shader program naming its vertex and fragment files (template **Shader program**) |
| `minecraft:waypoint_style` | **Waypoint styles** | A locator bar dot that changes with the distance (template **Waypoint style**); use it with `/waypoint modify <target> style set <id>` |

The shader source files themselves (`.vsh`, `.fsh` and `.glsl`) are plain files: bring them in with **Import assets** and the folder **Shaders (shaders, .vsh, .fsh and .glsl)**, with an optional folder below it such as `post`. Shader files are copied as they are; MCSuperMods does not check them, so a mistake shows only in game. The post effect template's shader names point at files you add yourself. The locator bar dot pictures go under `textures/gui/sprites/hud/locator_bar_dot/`.

## Icon fonts

A resource pack can add a font: pictures that text shows as characters, for icons in chat, signs, books, titles and item names. The **Icon font** template (category **Fonts**; sidebar **Fonts**) makes a font with one icon, drawn from the texture `font/<name>.png` in the same namespace. Show it in text with `{"text": "\uE000", "font": "<namespace>:<name>"}`; each further icon is another character in the font's `chars`. An atlas element (kind `minecraft:atlas`, sidebar **Texture atlases**) adds texture sources to a vanilla atlas, for textures the game reads only through an atlas. The examples **Icon font** and **Atlas source** show both.

## What is not possible yet


These are planned for later, so nobody waits for them in this release:

- ageing vanilla's own blocks on Minecraft 26.4 (the rules above age them on 26.3 only), and copper golems waxing or scraping a project block;
- fuel or compost values on vanilla items, and compost chances other than the five vanilla ones;
- removing vanilla features or spawns from biomes, cave carvers (new villager jobs are possible: see [Villagers and traders](villagers-and-traders.md));
- a trigger when an item is crafted (`on_crafted`);
- wolf sound variants: the game needs a step sound the schema data MCSuperMods checks them against does not have yet, so the kind is left out until that data is updated;
- slot sources, which have no data folder in either Minecraft version.

## Try it in the game

1. Export the **Fabric mod jar** ([Export a Fabric mod jar](blocks-and-items.md#export-a-fabric-mod-jar)), or use **Test in Minecraft**. Mob skins, goat horns, trades and fonts also work from the vanilla data and resource packs.
2. **Ore**: create a **new** world and look at the heights you chose, for example in a cave or in spectator mode. Chunks generated before the mod was installed have no ore.
3. **Extra drops**: kill a few zombies (with a player kill when the drop asks for it); a chance of 10% needs about ten.
4. **Fuel and compost**: put the item in a furnace's fuel slot with something to smelt, and into a composter.
5. **Mob skins**: `/summon` the animal with the skin's id, then look for it where it spawns in a new chunk of the biome you chose, also as a baby.
6. **Goat horns**: craft the horn and blow it; with **Goats drop it**, let a goat ram a tree or a stone block.
7. **Fonts**: `/tellraw @s {"text": "\uE000", "font": "<namespace>:<name>"}`.
8. **Rules for vanilla blocks**: use the tool on the vanilla block in survival, and set the burning block alight with flint and steel.
9. **Trades**: give a few new villagers the profession's workstation (a fletching table for a fletcher) and look at their offers, trading with them to reach higher levels; try several villagers, because a trade is a candidate.

When something does not appear, the runtime's summary line in the game log counts what it loaded ([Troubleshooting](blocks-and-items.md#troubleshooting)), and a missing id or a broken pool has its own warning or error line.
