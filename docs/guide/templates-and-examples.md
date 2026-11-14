# Templates, starters and examples

MCSuperMods ships three kinds of ready-made content. All of it is checked in CI: every template, starter and example validates against each supported Minecraft version and exports with zero problems.

| What | Where in the app | What you get |
|---|---|---|
| **Element templates** (169) | **Add element** (Ctrl+N) | One new element with useful starting content |
| **Project starters** (36) | **New from starter…**, or **Create…** for the flows | A new project, already filled; the flows also add to the open project |
| **Examples** (118) | **Help → Examples…** | A commented project or element to open or copy |

Templates come from the resource pack, data pack, structures, worldgen, blocks and items, entities, models and animations, and scripting plugins, starters and examples from the built-in library plugin. Third-party plugins can add their own through the same plugin API ([ADR 0020](https://github.com/MEZTKING/MCSuperMods/blob/main/docs/adr/0020-templates-starters-examples.md)).

No starter or example contains Mojang files. Textures are small placeholder images that MCSuperMods draws itself; the music disc plays a track from your own copy of the game.

## Element templates

Open a project, then choose **Add element** on the toolbar (or press Ctrl+N, or run "New element…" from the command palette). The dialog lists the templates under category headings.

1. Type in **Find a template** to filter the list ("loot", "tag", "model", "smelting").
2. Pick a template. Some fill in the **Name** for you (`en_us`, `pack`, `root`, `load`, `tick`) or put a folder in front of the name you type (`block/`, `item/`, `blocks/`, `chests/`).
3. Choose the **Namespace**. The Tick and Load function tags preselect `minecraft`, because the game reads `#minecraft:tick` and `#minecraft:load`.
4. Type a name and choose **Create**. The line under the name shows the id that will be created.

Templates that refer to other project content say so in their description. The child advancements, for example, point at `<namespace>:root`: create the **Root advancement** first. Model templates point at a texture with the same name as the model (`<namespace>:block/<name>`), so import a texture with that name (see [Replacing the placeholders](#replacing-the-placeholders)).

Structure and worldgen templates that point at another element (a pool's piece, a structure's start pool, a placed feature's configured feature, a dimension's biome) start that link as the new element's own id, because two elements of a project never share an id. Their description says which field to change: point it at the real element, for example `amber_tree` from `amber_tree_placed`. The [Structures](structures.md) and [Worldgen](worldgen.md) guides explain the naming.

A kind from a third-party plugin that brings no templates still appears, as one entry that starts from the kind's default content.

### All templates

The id is the template's identifier (the app uses it as `template-<id>` in tests); the kind is the element kind it creates.
#### Models

| Template | id | Kind | Notes |
|---|---|---|---|
| Block model | `block_model` | `minecraft:model` | A full cube with one texture on every side. (name starts with `block/`) |
| Column block model | `model_block_column` | `minecraft:model` | A pillar like a log: one texture on the sides and another (`<name>_top`) on both ends. (name starts with `block/`) |
| Cross block model | `model_block_cross` | `minecraft:model` | Two crossed planes, as used by flowers, saplings and other plants. (name starts with `block/`) |
| Item model | `item_model` | `minecraft:model` | A flat item drawn from one texture. (name starts with `item/`) |
| Handheld item model | `model_item_handheld` | `minecraft:model` | A flat item held like a tool or weapon (angled in the hand). (name starts with `item/`) |
| Equipment (humanoid armour) | `equipment-humanoid` | `minecraft:equipment` | How armour of one material looks when worn: textures `entity/equipment/humanoid/<name>` and `entity/equipment/humanoid_leggings/<name>`. |

#### Blockstates

| Template | id | Kind | Notes |
|---|---|---|---|
| Blockstate | `blockstate` | `minecraft:block_definition` | Which block model a block uses. |
| Facing blockstate | `blockstate_facing` | `minecraft:block_definition` | One model turned to face north, east, south or west, for blocks with a facing property. |
| Slab blockstate | `blockstate_slab` | `minecraft:block_definition` | Bottom, top and double slab models: `<name>`, `<name>_top` and `<name>_double` block models. |

#### Item definitions

| Template | id | Kind | Notes |
|---|---|---|---|
| Item definition | `item_definition` | `minecraft:item_definition` | Which model an item uses. |
| Item definition (while using) | `item_definition_condition` | `minecraft:item_definition` | Shows the `<name>_using` item model while the item is being used, like a drawn bow or a raised shield. |
| Item definition (by display context) | `item_definition_select` | `minecraft:item_definition` | Shows the `<name>_gui` item model in inventories and the normal model everywhere else. |

#### Text

| Template | id | Kind | Notes |
|---|---|---|---|
| Language file | `lang` | `minecraft:lang` | Translations, for example en_us, with sample block and item names to rename. (default name `en_us`) |

#### Sounds

| Template | id | Kind | Notes |
|---|---|---|---|
| Sounds | `sounds` | `minecraft:sounds` | Sound events of the namespace (one per namespace), starting with one event that plays vanilla sound files. (name fixed to `sounds`) |

#### Fonts

| Template | id | Kind | Notes |
|---|---|---|---|
| Icon font | `font_icons` | `minecraft:font` | A font with one icon: a bitmap glyph drawn from the texture `font/<name>.png`. Show it in text with `{"text": "\uE000", "font": "<namespace>:<name>"}`. See [Icon fonts](adding-to-vanilla.md#icon-fonts). |

#### Pack

| Template | id | Kind | Notes |
|---|---|---|---|
| Pack metadata | `pack` | `minecraft:pack_mcmeta` | The pack description shown in the game (pack.mcmeta). (default name `pack`) |

#### Recipes

| Template | id | Kind | Notes |
|---|---|---|---|
| Shaped recipe | `recipe_shaped` | `minecraft:recipe` | A crafting recipe with a fixed pattern. |
| Shapeless recipe | `recipe_shapeless` | `minecraft:recipe` | A crafting recipe whose ingredients go anywhere in the grid. |
| Smelting recipe | `recipe_smelting` | `minecraft:recipe` | A furnace recipe: one ingredient, one result. |
| Blasting recipe | `recipe_blasting` | `minecraft:recipe` | A blast furnace recipe: twice as fast as smelting, for ores and metal. |
| Smoking recipe | `recipe_smoking` | `minecraft:recipe` | A smoker recipe: twice as fast as smelting, for food. |
| Campfire recipe | `recipe_campfire_cooking` | `minecraft:recipe` | Cooks an item placed on a campfire; slow, but needs no fuel. |
| Stonecutter recipe | `recipe_stonecutting` | `minecraft:recipe` | One ingredient cut into a fixed number of results on the stonecutter. |
| Smithing upgrade recipe | `recipe_smithing_transform` | `minecraft:recipe` | A smithing table upgrade: template, base item and addition give a new item. |
| Smithing trim recipe | `recipe_smithing_trim` | `minecraft:recipe` | Applies an armour trim pattern on the smithing table. |
| Brewing recipe | `recipe_brewing` | `minecraft:recipe` | A brewing stand recipe: a potion plus an ingredient gives another potion. Names vanilla potions only. |
| Brewing recipe: splash potion | `recipe_brewing_splash` | `minecraft:recipe` | Turns a potion into its splash version with gunpowder; copy it per potion and per bottle. |

#### Loot tables

| Template | id | Kind | Notes |
|---|---|---|---|
| Block loot table | `loot_table_block` | `minecraft:loot_table` | What a block drops when broken. (name starts with `blocks/`) |
| Chest loot table | `loot_table_chest` | `minecraft:loot_table` | What a generated chest contains: weighted entries rolled a random number of times. (name starts with `chests/`) |
| Entity loot table | `loot_table_entity` | `minecraft:loot_table` | What a mob drops: more with Looting, and a rare drop only when a player kills it. (name starts with `entities/`) |
| Fishing loot table | `loot_table_fishing` | `minecraft:loot_table` | What a fishing rod catches: one weighted roll per catch. (name starts with `gameplay/`) |

#### Advancements

| Template | id | Kind | Notes |
|---|---|---|---|
| Root advancement | `advancement` | `minecraft:advancement` | A root advancement with its own tab, granted on the first tick. (default name `root`) |
| Obtain an item | `advancement_inventory_changed` | `minecraft:advancement` | Granted when the player picks up an item. Create the Root advancement first. |
| Craft a recipe | `advancement_recipe_crafted` | `minecraft:advancement` | Granted when the player crafts a given recipe. Create the Root advancement first. |
| Kill a mob | `advancement_killed_entity` | `minecraft:advancement` | Granted when the player kills a given kind of mob. Create the Root advancement first. |
| Visit a place | `advancement_location` | `minecraft:advancement` | Granted when the player stands in a given biome. Create the Root advancement first. |

#### Predicates

| Template | id | Kind | Notes |
|---|---|---|---|
| Random chance | `predicate` | `minecraft:predicate` | A reusable condition, for example a random chance. |
| Is sneaking | `predicate_sneaking` | `minecraft:predicate` | True while the entity is sneaking. |
| Is raining | `predicate_raining` | `minecraft:predicate` | True while it rains (or thunders). |
| Is night | `predicate_night` | `minecraft:predicate` | True between dusk and dawn of the day cycle. |
| In a biome | `predicate_in_biome` | `minecraft:predicate` | True when the position is in a forest biome. |

#### Item modifiers

| Template | id | Kind | Notes |
|---|---|---|---|
| Set count | `item_modifier` | `minecraft:item_modifier` | Changes an item stack, for example its count. |
| Set name | `item_modifier_set_name` | `minecraft:item_modifier` | Gives the item a custom name. |
| Add lore | `item_modifier_set_lore` | `minecraft:item_modifier` | Adds lines of lore under the item name. |
| Set enchantments | `item_modifier_set_enchantments` | `minecraft:item_modifier` | Adds enchantments at fixed levels to the item. |

#### Functions

| Template | id | Kind | Notes |
|---|---|---|---|
| Function | `function` | `minecraft:function` | A list of commands, run with /function. |
| Load function | `function_load_body` | `minecraft:function` | Sets up a scoreboard and greets players; run it from the Load function tag. (default name `load`) |
| Tick function | `function_tick_body` | `minecraft:function` | Runs for every player each game tick; run it from the Tick function tag. (default name `tick`) |

#### Function tags

| Template | id | Kind | Notes |
|---|---|---|---|
| Tick function tag | `function_tick` | `minecraft:tag/function` | Runs `<namespace>:tick` every game tick (#minecraft:tick). (default name `tick`; namespace `minecraft`) |
| Load function tag | `function_load` | `minecraft:tag/function` | Runs `<namespace>:load` when the data pack loads (#minecraft:load). (default name `load`; namespace `minecraft`) |
| Function tag | `tag_function` | `minecraft:tag/function` | A named group of functions, run with /function `#<namespace>:<name>`. |

#### Tags

| Template | id | Kind | Notes |
|---|---|---|---|
| Item tag | `tag_item` | `minecraft:tag/item` | A named group of items, used as `#<namespace>:<name>`. |
| Block tag | `tag_block` | `minecraft:tag/block` | A named group of blocks, used as `#<namespace>:<name>`. |
| Entity type tag | `tag_entity_type` | `minecraft:tag/entity_type` | A named group of entity types, used as `#<namespace>:<name>`. |
| Fluid tag | `tag_fluid` | `minecraft:tag/fluid` | A named group of fluids, used as `#<namespace>:<name>`. |
| Game event tag | `tag_game_event` | `minecraft:tag/game_event` | A named group of game events, used as `#<namespace>:<name>`. |
| Damage type tag | `tag_damage_type` | `minecraft:tag/damage_type` | A named group of damage types, used as `#<namespace>:<name>`. |
| Enchantment tag | `tag_enchantment` | `minecraft:tag/enchantment` | A named group of enchantments, used as `#<namespace>:<name>`. |
| Painting variant tag: placeable | `tag_painting_variant_placeable` | `minecraft:tag/painting_variant` | Paintings a placed painting item can pick at random (`minecraft:placeable`); add painting variant ids to `values`. (default name `placeable`; namespace `minecraft`) |
| Biome tag (has_structure) | `tag_worldgen_biome` | `minecraft:tag/worldgen/biome` | A named group of biomes, used as `#<namespace>:has_structure/<name>` in a structure's `biomes`. (name starts with `has_structure/`) |
| Structure tag | `tag_worldgen_structure` | `minecraft:tag/worldgen/structure` | A named group of structures, used as `#<namespace>:<name>`. |
| World preset tag: normal | `tag_worldgen_world_preset_normal` | `minecraft:tag/worldgen/world_preset` | Adds world presets to the create-world screen (`minecraft:normal`); add preset ids to `values`. (default name `normal`; namespace `minecraft`) |

#### Enchantments

| Template | id | Kind | Notes |
|---|---|---|---|
| Damage enchantment | `enchantment_damage` | `minecraft:enchantment` | A weapon enchantment that adds attack damage per level. |
| Protection enchantment | `enchantment_protection` | `minecraft:enchantment` | An armour enchantment that reduces incoming damage per level. |

#### Other data

| Template | id | Kind | Notes |
|---|---|---|---|
| Damage type | `damage_type` | `minecraft:damage_type` | A source of damage with its own death message and hunger cost. |
| Dimension type | `dimension_type` | `minecraft:dimension_type` | The rules of a dimension: height, light, sky and ceiling. |
| Chat type | `chat_type` | `minecraft:chat_type` | How a chat message is decorated, for example a gold announcement. |
| Jukebox song | `jukebox_song` | `minecraft:jukebox_song` | A song a music disc plays; points at a vanilla sound event until you add your own. |
| Banner pattern | `banner_pattern` | `minecraft:banner_pattern` | A banner pattern; uses a vanilla texture until you add your own. |
| Painting variant | `painting_variant` | `minecraft:painting_variant` | A painting with its size in blocks; uses a vanilla texture until you add your own. |
| Armour trim material | `trim_material` | `minecraft:trim_material` | A trim material and its colour palette; uses a vanilla palette until you add your own. |
| Armour trim pattern | `trim_pattern` | `minecraft:trim_pattern` | A trim pattern; uses a vanilla texture until you add your own. |
| Notice dialog | `dialog_notice` | `minecraft:dialog` | A message screen with one button, shown with /dialog show. |
| Confirmation dialog | `dialog_confirmation` | `minecraft:dialog` | A yes or no question; each button can run a command. |
| Goat horn instrument | `instrument` | `minecraft:instrument` | A goat horn call; uses a vanilla sound event, named by id. Give it to players with a goat horn recipe or loot. See [Goat horns](adding-to-vanilla.md#goat-horns). |

#### Mobs

New skins for vanilla animals; see [Mob skins](adding-to-vanilla.md#mob-skins).

| Template | id | Kind | Notes |
|---|---|---|---|
| Wolf variant | `wolf_variant` | `minecraft:wolf_variant` | A wolf skin that appears in taiga biomes; uses vanilla textures until you add your own. |
| Cat variant | `cat_variant` | `minecraft:cat_variant` | A cat skin that appears in swamps; uses vanilla textures until you add your own. |

#### Trades

A trade reaches a villager through the vanilla trade tag of its profession and level; see [Villager trades](adding-to-vanilla.md#villager-trades).

| Template | id | Kind | Notes |
|---|---|---|---|
| Trade: emeralds for an item | `trade_emeralds_for_item` | `minecraft:villager_trade` | The villager sells an item for emeralds. List it in a villager trade tag to add it to a villager. |
| Trade: item for emeralds | `trade_item_for_emeralds` | `minecraft:villager_trade` | The villager buys an item for emeralds. List it in a villager trade tag to add it to a villager. |
| Trade set | `trade_set` | `minecraft:trade_set` | Draws a number of trades from a trade tag. A project set with a vanilla name replaces the vanilla one. |
| Villager trade tag: fletcher, level 1 | `tag_villager_trade_fletcher` | `minecraft:tag/villager_trade` | Adds trades to novice fletchers (`minecraft:fletcher/level_1`); add trade ids to `values`. Each is a candidate, not a certainty. |

#### Structures

| Template | id | Kind | Notes |
|---|---|---|---|
| Structure template: 5×5 platform | `structure_template_platform` | `minecraft:structure_template` | A flat 5×5 stone brick platform, one block high. |
| Structure template: jigsaw hut piece | `structure_template_jigsaw_hut` | `minecraft:structure_template` | A 5×5×5 plank hut with a doorway and a jigsaw block in front of it, named `<id>_entrance` and targeting `<id>_path`. The jigsaw's pool starts as the new template's own id: change it to your template pool's id. |
| Structure template: path piece | `structure_template_path` | `minecraft:structure_template` | A 3×1×5 dirt path with a jigsaw block at each end, both named and targeting `<id>_path`. Their pool starts as the new template's own id: change it to your template pool's id. |
| Template pool | `template_pool` | `minecraft:worldgen/template_pool` | A pool with one rigid piece. Its Location starts as the new pool's own id: change it to your structure template's id. |
| Template pool: terminators | `template_pool_terminators` | `minecraft:worldgen/template_pool` | A pool that ends jigsaw chains: one piece that follows the terrain, or nothing at all. The piece's Location starts as the new pool's own id: change it to your structure template's id. |
| Jigsaw structure | `structure_jigsaw` | `minecraft:worldgen/structure` | A jigsaw structure in forests that blends into the terrain. Its start pool starts as the new structure's own id: change it to your template pool's id. |
| Structure set (random spread) | `structure_set_random_spread` | `minecraft:worldgen/structure_set` | Places one structure about once in every 34×34 chunk cell, at least 8 chunks apart. Its structure entry starts as the new set's own id: change it to your structure's id. |
| Processor list: mossify and rot | `processor_list_mossify_rot` | `minecraft:worldgen/processor_list` | Turns a fifth of the cobblestone mossy and leaves out a tenth of all blocks, for a weathered look. |
| Processor list: block ignore | `processor_list_block_ignore` | `minecraft:worldgen/processor_list` | Leaves air out of placed pieces, so the terrain they overlap is kept. |

#### Biomes

| Template | id | Kind | Notes |
|---|---|---|---|
| Temperate forest biome | `biome_temperate_forest` | `minecraft:worldgen/biome` | A mild, rainy forest of oak and birch with flowers, grass and the usual ores. |
| Desert biome | `biome_desert` | `minecraft:worldgen/biome` | A hot, dry biome without rain: dead bushes, cacti and desert wells. |

#### Features

| Template | id | Kind | Notes |
|---|---|---|---|
| Ore vein | `feature_ore_vein` | `minecraft:worldgen/feature` | A blob of ore that replaces stone and deepslate; place it with Ore placement. |
| Tree (oak-like) | `feature_tree` | `minecraft:worldgen/feature` | A small straight tree with a round crown of leaves; place it with Tree placement. |
| Flower patch | `feature_flower_patch` | `minecraft:worldgen/feature` | One flower picked by weight; Patch placement scatters it into a patch. |
| Tree for a sapling | `feature_sapling_tree` | `minecraft:worldgen/feature` | Oak's shape grown from your own log and leaves (named after this tree, such as `maple_log` and `maple_leaves` for `maple_tree`), with the soil under the trunk turned to dirt. Name it as a sapling's tree; the Block Studio's **New tree** button makes it. |
| Single block | `feature_single_block` | `minecraft:worldgen/feature` | Places one block, such as a boulder or a marker, wherever it is placed. |
| Ore placement | `placed_feature_ore` | `minecraft:worldgen/placed_feature` | Places a configured feature ten times per chunk, spread evenly from the bottom of the world to y 64. Its feature starts as this element's own id: set it to your configured feature, such as `ruby_ore` for `ruby_ore_placed`. |
| Tree placement | `placed_feature_tree` | `minecraft:worldgen/placed_feature` | Places a configured feature a few times per chunk on the surface, where an oak sapling would survive. Its feature starts as this element's own id: set it to your configured feature, such as `amber_tree` for `amber_tree_placed`. |
| Patch placement | `placed_feature_patch` | `minecraft:worldgen/placed_feature` | Scatters a configured feature into a patch on the surface, in about one chunk in four. Its feature starts as this element's own id: set it to your configured feature, such as `flowers` for `flowers_placed`. |

#### Dimensions

| Template | id | Kind | Notes |
|---|---|---|---|
| Multi-noise overworld | `dimension_multi_noise` | `minecraft:dimension` | Overworld terrain with one biome at a mild, humid climate point and vanilla biomes around it. That entry starts as this element's own id: set it to your biome, such as `amber_grove` for `amber_world`. |
| Single-biome dimension | `dimension_single_biome` | `minecraft:dimension` | Overworld terrain where every column is one biome. The biome starts as this element's own id: set it to your biome, such as `amber_grove` for `amber_world`. |
| World preset | `world_preset` | `minecraft:worldgen/world_preset` | A World Type with the vanilla overworld, nether and end; change the overworld biome source to add your biomes. |

#### Worldgen (advanced)

| Template | id | Kind | Notes |
|---|---|---|---|
| Noise settings: gentle hills | `noise_settings` | `minecraft:worldgen/noise_settings` | Terrain from a height gradient plus one noise, with water at sea level and a simple grass, dirt and bedrock surface. |
| Density function: noise | `density_function` | `minecraft:worldgen/density_function` | Samples a vanilla noise, scaled horizontally; reference it from noise settings. |
| Noise | `noise` | `minecraft:worldgen/noise` | Noise parameters with three octaves starting at a large scale. |
| Carver: caves | `carver` | `minecraft:worldgen/carver` | Cave tunnels between the bottom of the world and y 180; list it in a biome. |
| Superflat preset | `flat_level_generator_preset` | `minecraft:worldgen/flat_level_generator_preset` | A superflat preset of bedrock, stone, dirt and grass in the plains biome. |
| Multi-noise parameter list | `multi_noise_biome_source_parameter_list` | `minecraft:worldgen/multi_noise_biome_source_parameter_list` | A named parameter list using the vanilla overworld biome layout. |
| Block state provider: stone mix | `block_state_provider` | `minecraft:worldgen/block_state_provider` | Picks stone, andesite or cobblestone by weight; reference it from features. |
| Material condition: above sea level | `material_condition` | `minecraft:worldgen/material_condition` | True at and above y 63; use it in surface rules. |
| Material rule: grass and dirt | `material_rule` | `minecraft:worldgen/material_rule` | A surface rule that places bedrock at the bottom and grass over dirt on top. |

#### Blocks

New blocks, items and the mod metadata exist only in the **Fabric mod jar** export; the resource and data pack exports leave them out and carry only their models, names, loot tables and tags (see [New blocks and items need the mod jar](#new-blocks-and-items-need-the-mod-jar)).

| Template | id | Kind | Notes |
|---|---|---|---|
| Simple block | `msm_block_simple` | `msm:block` | A stone-like building block that drops itself and is mined with a pickaxe. |
| Glowing ore | `msm_block_glowing_ore` | `msm:block` | An ore that gives off light and drops itself only when mined with an iron pickaxe or better. |
| Interactive block | `msm_block_interactive` | `msm:block` | A block that chimes when used and sparkles when stepped on, with one event triggering another. |
| Half block | `msm_block_half` | `msm:block` | A fixed bottom half block (shape preset `slab_bottom`): you stand on it half a block up. It is not a stackable vanilla slab. |
| Plant (cross) | `msm_block_plant` | `msm:block` | A plant drawn as two crossed planes (shape preset `cross`): it breaks instantly, lets light through and you walk through it. |
| Glass-like block | `msm_block_glass_like` | `msm:block` | A full block you can see through, as glass: light passes and faces between two of them are hidden. It drops nothing unless you add loot. |
| Bounce pad (block triggers) | `msm_block_bounce_pad` | `msm:block` | A thin pad (shape preset `carpet`) that launches anything standing in it upwards, at most once a second per entity, and plays a sound when broken. Shows the block triggers **On entity inside** and **On break**. |
| Log or pillar | `msm_block_log` | `msm:block` | A log that turns to the face you place it against, with bark on the sides and rings on the ends. It burns, and an axe strips it into a vanilla stripped oak log. |
| Facing block | `msm_block_facing` | `msm:block` | A block that turns its front towards you when placed, as a furnace does (four directions). |
| Observer-like block | `msm_block_observer_like` | `msm:block` | A block that faces any of six directions, up and down included, as an observer does. It has no redstone behaviour of its own. |
| Slab | `msm_block_slab` | `msm:block` | A half block that sits in the bottom or top half and stacks into a double slab, which drops two. |
| Stairs | `msm_block_stairs` | `msm:block` | Stairs that form corners next to other stairs. They copy the look and behaviour of their base block, vanilla stone bricks here. |
| Wall | `msm_block_wall` | `msm:block` | A wall that connects to other walls and solid blocks and is too high to jump over. |
| Fence | `msm_block_fence` | `msm:block` | A wooden fence that connects to other wooden fences and solid blocks. It burns as planks do. |
| Fence gate | `msm_block_fence_gate` | `msm:block` | A gate that opens when used and fits between fences and walls, with oak sounds. |
| Door | `msm_block_door` | `msm:block` | A two-block-high wooden door that opens by hand or with a redstone signal. Breaking either half drops one door. |
| Trapdoor | `msm_block_trapdoor` | `msm:block` | A wooden trapdoor that opens by hand or with a redstone signal and sits in the top or bottom half of a block. |
| Button | `msm_block_button` | `msm:block` | A stone button that gives a short redstone pulse when pressed (one second, as vanilla stone buttons). Arrows do not press it. |
| Pressure plate | `msm_block_pressure_plate` | `msm:block` | A stone pressure plate that gives a redstone signal while a player or mob stands on it. Dropped items do not press it. |
| Weighted pressure plate | `msm_block_weighted_pressure_plate` | `msm:block` | A gold pressure plate whose signal grows with the number of entities on it, up to 15, as the vanilla light weighted plate. |
| Pane | `msm_block_pane` | `msm:block` | A thin pane that connects to other panes and walls, as glass panes do. Like glass, it drops nothing unless you add loot. |
| Crop | `msm_block_crop` | `msm:block` | A crop that grows through eight stages on farmland, planted from its own seeds (an item with this id plus "_seeds"). Fully grown it drops vanilla wheat and extra seeds; farmer villagers plant and harvest it. |
| Sapling | `msm_block_sapling` | `msm:block` | A sapling that grows into a vanilla oak tree, by itself or with bone meal. Point "tree" at your own tree feature to grow that instead. |
| Leaves | `msm_block_leaves` | `msm:block` | Leaves tinted with the biome foliage colour that decay away from logs. Shears or Silk Touch drop the leaves; otherwise they drop now and then a vanilla oak sapling, sticks and apples. They burn as leaves do. |

#### Items

| Template | id | Kind | Notes |
|---|---|---|---|
| Food item | `msm_item_food` | `msm:item` | Something to eat that restores hunger, shown with the bread model. |
| Tool item | `msm_item_tool` | `msm:item` | An iron-tier pickaxe with durability, shown with the iron pickaxe model. |
| Magic wand | `msm_item_wand` | `msm:item` | An item that plays a sound and spawns particles when used, once a second. |
| Tool with a custom material | `msm_item_tool_custom_material` | `msm:item` | A pickaxe of its own material: faster than iron, mines what iron mines and is repaired with iron ingots. |
| Armour piece (helmet) | `msm_item_armor_helmet` | `msm:item` | An iron helmet: armour points, durability and the worn look come from the iron material. |
| Spear | `msm_item_spear` | `msm:item` | An iron spear with vanilla's spear attacks; it joins the spears tag, so spear enchantments apply. |
| Bow | `msm_item_bow` | `msm:item` | A bow that draws faster and shoots harder-hitting vanilla arrows, shown with the bow model. |
| Shield | `msm_item_shield` | `msm:item` | Blocks attacks while raised, like a shield. The vanilla shield model draws nothing as a plain item model, so it shows the turtle scute until you add your own. |
| Drink | `msm_item_drink` | `msm:item` | A potion-like drink that gives speed and regeneration and leaves a glass bottle, shown with the honey bottle model. |
| Totem | `msm_item_totem` | `msm:item` | Saves its holder from death like a totem of undying and gives regeneration, absorption and fire resistance. |
| Throwable item | `msm_item_throwable` | `msm:item` | Thrown like a snowball: it flies as its own picture, deals a heart of damage and slows the mob it hits. |
| Fuel item | `msm_item_fuel` | `msm:item` | A lump that burns in a furnace for 40 seconds (half a piece of coal) and can be composted, shown with the charcoal model. |
| Life-steal sword (item triggers) | `msm_item_life_steal_sword` | `msm:item` | An iron sword that heals its holder by one heart on every hit and shows hearts while held. Shows the item triggers **On hit** and **While held**. |

Armour, custom tool materials, weapons, consumables and totems are explained in [Blocks and items](blocks-and-items.md#armour), throwables in [Status effects and throwables](effects-and-throwables.md#throwables-in-the-item-studio).

#### Effects

Status effects (`msm:effect`) and potions (`msm:potion`) of your own need the Fabric mod jar too. Each effect shows a blank icon until you paint `textures/mob_effect/<name>.png` (see [Effect icons](effects-and-throwables.md#effect-icons)); potions are explained in [Potions and brewing](potions.md).

| Template | id | Kind | Notes |
|---|---|---|---|
| Status effect | `msm_effect_status` | `msm:effect` | A good effect with its own colour that plays a chime and sparkles once when it starts. Give it with a drink, a throwable or the /effect command. |
| Damage over time effect | `msm_effect_damage_over_time` | `msm:effect` | A harmful effect like poison: it hurts its holder by half a heart every second, faster at higher levels. |
| Stat boost effect | `msm_effect_stat_boost` | `msm:effect` | A good effect that makes its holder 20% faster and hit 1 harder per level, removed again when the effect ends. |
| Potion of a custom effect | `msm_potion_custom_effect` | `msm:potion` | A potion of the status effect "<this id>_effect", brewed from an awkward potion and glow berries, with splash and lingering versions and tipped arrows. Make that status effect (or pick your own), and export the project as a Fabric mod. |
| Potion with longer and stronger versions | `msm_potion_long_strong` | `msm:potion` | A Haste potion brewed from an awkward potion and a honeycomb. Redstone makes it last 8 minutes, glowstone dust makes it Haste II for 1:30, like vanilla potions. Splash and lingering versions and tipped arrows included. Needs the Fabric mod export. |

#### Additions

Additions to vanilla content need the Fabric mod jar too; see [Adding to vanilla](adding-to-vanilla.md).

| Template | id | Kind | Notes |
|---|---|---|---|
| Ore in the overworld | `msm_biome_addition_overworld_ore` | `msm:biome_addition` | Generates an ore in every overworld biome, at the underground ores step. It adds the placed feature `<this id>_placed`: make that placed feature (and its feature) in the Worldgen Studio, or pick your own. Only newly generated chunks get the ore. |
| Extra mob drop | `msm_loot_addition_mob_drop` | `msm:loot_addition` | Adds a drop to the zombie: one emerald, one time in ten, only when a player kills it. The zombie keeps its usual drops. A world data pack that replaces the zombie loot table wins. |

#### Mod

| Template | id | Kind | Notes |
|---|---|---|---|
| Mod metadata | `msm_mod` | `msm:mod` | The name, version and licence of the Fabric mod; one per project. Its name is always `mod`, and the mod id comes from the namespace. |

#### Entities

New mobs, like new blocks and items, exist only in the **Fabric mod jar** export, which also carries GeckoLib (see [Entities and models](entities-and-models.md)). The entity templates point at a model `<namespace>:entity/<name>`, an animation set `<namespace>:entity/<name>_animations` and a texture of the same name; until you import or add them, **Problems** reports them.

| Template | id | Kind | Notes |
|---|---|---|---|
| Creature | `msm_entity_creature` | `msm:entity` | A passive mob that wanders, looks at players and spawns in forests, with a spawn egg. |
| Monster | `msm_entity_monster` | `msm:entity` | A hostile mob that chases and hits players, fights back when hurt and spawns in the dark, with a spawn egg. |
| Ambient critter | `msm_entity_ambient` | `msm:entity` | A small ambient mob that runs away from players, without a spawn egg. |

#### Entity models

The model templates put `entity/` in front of the name you type.

| Template | id | Kind | Notes |
|---|---|---|---|
| Cube creature model | `msm_geo_model_cube_creature` | `msm:geo_model` | A box-shaped creature with a body and a head bone over a 64x64 texture. |
| Biped model | `msm_geo_model_biped` | `msm:geo_model` | A two-legged figure (body, head, two arms, two legs) on the player skin layout of a 64x64 texture. |

#### Entity animations

| Template | id | Kind | Notes |
|---|---|---|---|
| Idle and walk animations | `msm_animation_idle_walk` | `msm:animation` | An idle bob and a walk cycle swinging the arms and legs of the biped model; name it `<name>_animations` (the template adds `entity/`). |

#### Scripts

Scripts (`msm:script`) are TypeScript that the `msm_runtime` mod runs in the game, so they too exist only in the **Fabric mod jar** export; the Java project export leaves them out (see [Scripting](scripting.md)). The templates use only vanilla ids: change the block, item and entity ids to your own.

| Template | id | Kind | Notes |
|---|---|---|---|
| Block interaction script | `msm_script_block_interaction` | `msm:script` | Right-clicking a composter with the main hand no longer composts and gives bone meal instead. |
| Entity hurt script | `msm_script_entity_hurt` | `msm:script` | An iron golem heals half of every hit back and shows heart particles. |
| Scheduled effect script | `msm_script_scheduled_effect` | `msm:script` | Using a clock plays five rising chimes with particles, half a second apart, with `msm.schedule`. |
| Action handler script | `msm_script_action_handler` | `msm:script` | A named handler for the "Run script" (`run_script`) action, using the script's own id as the handler id. |
| Full set bonus | `msm_script_full_set_bonus` | `msm:script` | Gives a bonus to players wearing a whole armour set: every second, a player in full golden armour gets Speed and Haste. Uses the player.tick event and entity equipment (runtime 1.5.0 or later). Change the item ids to your own armour. |
| Boss bar countdown | `msm_script_boss_bar_countdown` | `msm:script` | Shows a countdown to every player as a boss bar: using an echo shard starts 30 seconds, the bar empties and turns red near the end, and a title says when time is up. Uses msm.bossBars and titles (runtime 1.5.0 or later). |

## Project starters

A starter creates a whole project in an empty folder. Open the list in any of these ways:

- the arrow next to **New** on the toolbar, then **New from starter…**;
- **File → New Project from Starter…**;
- the command palette (Ctrl+Shift+P): "New project from starter…".

The **New project** dialog groups the starters (Blank, Packs, Themed content) and shows which packs each one fills. Choose one, pick the **Minecraft version** (the newest release unless you choose a snapshot; see [Minecraft versions](targets.md)), then **Choose folder and create**, and pick an empty folder. The folder name becomes the project's namespace: a folder called `Ruby Ore` gives the namespace `ruby_ore`. The project is saved straight away.

**New** on its own (and **File → New Project…**, Ctrl+Shift+N) still creates a blank project directly.

Starters with questions (a name, a colour, a tier and so on) carry the **Wizard** badge and ask them in the dialog, one step per group of questions (**Next** and **Back**), before creating the project; the **Minecraft version** select is then on the last step, which sums up your answers. **Custom sword**, for example, asks for the **Sword name**, **Blade colour**, **Material tier**, **Durability** and **Crafting ingredient**. The **Custom mob** starter needs GeckoLib and is offered only for targets that have it (not the 26.4 snapshot). Those marked "Creator: <group>" in the table are also **Creator flows**: **Create…** on the toolbar runs the same flow inside the project you have open, with a live preview and **Edit in Creator** afterwards (see [The Creator](creator.md)).

| Starter | id | Packs | What it contains |
|---|---|---|---|
| Blank project | `blank` | resource, data | Only `pack.mcmeta`. Add elements yourself. |
| Resource pack | `resource_pack` | resource | The vanilla stick gets a new model, a placeholder texture and an English name. |
| Data pack | `data_pack` | data | A load message, a `greet` function and one crafting recipe. |
| Resource and data pack | `combined` | resource, data | Both of the above in one project. |
| Custom ore (Creator: Blocks) | `custom_ore` | resource, data, mod | A real Ruby Ore block that drops one or two rubies when mined with an iron pickaxe or better, the Ruby item and a Block of Ruby: textures, models, a loot table, three recipes, a `gems` item tag, two advancements and the mod metadata; unless you untick **Generate in the world**, also the ore feature, placed feature and world addition that generate it in the overworld. |
| Custom sword | `custom-sword` | resource, data, mod | A new sword with its own name, colour, tier and durability: a handheld texture and model, a crafting recipe, its English name and the mod metadata. |
| Gear set (Creator: Gear) | `gear-set` | resource, data, mod | Tools and armour of one new material: a sword, pickaxe, axe, shovel and hoe, a helmet, chestplate, leggings and boots (optionally a spear, mace, bow, crossbow, shield, horse armour and wolf armour), the material from a new ore or as an ingot (optionally an armour trim material), recipes or smithing upgrades, the worn armour look and the vanilla tags. |
| Simple block (Creator: Blocks) | `simple-block` | resource, data, mod | One new block with its own name, colour, hardness, tool, light level and drops, a texture and model, and an optional recipe. |
| Wood set (Creator: Blocks) | `wood-set` | resource, data, mod | A whole kind of wood: log, wood, stripped log and wood, planks, stairs, slab, fence, fence gate, door, trapdoor, button, pressure plate, leaves and a sapling that grows its own tree, with recipes, tags, stripping, burning and, if you choose, growth in the world. |
| Stone set (Creator: Blocks) | `stone-set` | resource, data, mod | A new stone with its stairs, slab and wall and, if you choose, a button, pressure plate, polished stone, bricks and a pillar, with crafting and stonecutting recipes. |
| Crop (Creator: Blocks) | `crop` | resource, data, mod | A crop that grows in stages on farmland, planted from its own seeds or from its produce, with loot, composting, villager farming and, if you choose, wild patches. |
| Tree (Creator: Blocks) | `tree` | resource, data, mod | A sapling that grows a tree of its own, from a new log and leaves or vanilla ones, in the shape you pick, and if you choose growing in the world. |
| Food (Creator: Food) | `food` | resource, data, mod | A new food with its own name, colour, hunger and saturation, a texture and model, and an optional recipe. |
| Weapon (Creator: Gear) | `weapon` | resource, data, mod | One sword, spear, mace, bow, crossbow or shield with its own name, colour and stats, a texture and model, and an optional recipe. |
| Consumable (Creator: Food) | `consumable` | resource, data, mod | A food with effects, a potion-like drink or a charm that gives effects when used, with a texture, model and optional recipe. |
| Totem (Creator: Gear) | `totem` | resource, data, mod | An item that saves its holder from death like a totem of undying and gives the effects you choose, with a texture, model and optional recipe. |
| Throwable (Creator: Gear) | `throwable` | resource, data, mod | An item you throw: a ball, a knife you pick up again, a boomerang that comes back or a bomb, with its damage, speed, weight and what happens when it hits, a texture and model, and an optional recipe. |
| Status effect (Creator: Magic) | `status-effect` | resource, data, mod | A new status effect with its own name, colour and icon: what it does every few seconds, the stats it changes and how players get it (a drink or a throwable flask with an optional recipe, or a brewed potion). |
| Potion (Creator: Magic) | `potion` | resource, data, mod | A new potion for the brewing stand: the effect it gives (a vanilla one or a new one with its icon), how long and how strong, the ingredient that brews it, longer and stronger versions, and splash and lingering bottles with tipped arrows. |
| Enchantment (Creator: Gear) | `enchantment` | data | A new enchantment: what it goes on, its highest level, how rare it is and what it does, offered at the enchanting table. |
| Painting (Creator: Blocks) | `painting` | resource, data | A new painting with its title, author, size and your own picture (or a placeholder landscape), in the `minecraft:placeable` tag. |
| Music disc (Creator: Blocks) | `music-disc-item` | resource, data, mod | A new jukebox song and a music disc that plays it: a real disc item in the Fabric mod jar, or music disc 13 with a new look in vanilla packs. |
| Villager trade (Creator: Worlds) | `villager-trade` | data | A new trade for a vanilla villager or the wandering trader: what it costs, what it gives and which profession and level offer it. A candidate among the villager's trades, not a certainty. |
| Extra drop (Creator: Worlds) | `extra-drop` | mod | An extra item in the loot of a vanilla mob, block or chest, with a count, a chance and, for mobs, whether a player must make the kill. The vanilla drops stay. |
| Mob skin (Creator: Mobs) | `mob-skin` | resource, data | A new skin for a vanilla wolf, cat, pig, cow, chicken or frog, with placeholder textures of the right size to paint over, appearing in a biome you choose or everywhere. |
| Goat horn (Creator: Gear) | `goat-horn` | resource, data | A new goat horn call: its name, a vanilla sound or your own `.ogg`, how long it plays and how far it is heard, a recipe and, if you choose, goats dropping it. |
| Dimension (Creator: Worlds) | `dimension` | resource, data, mod | A new dimension to explore: pick the terrain, the biome and the sky, and travel there and back with a key item (Fabric mod jar) or a command (vanilla packs). |
| Recipe pack | `recipe_pack` | data | Shaped, shapeless, smelting, blasting and stonecutting recipes, an item tag used as an ingredient, a crafting advancement and a load message. |
| Custom music disc | `music_disc` | resource, data | A jukebox song, its sound event, a disc model and texture, and a `give_disc` function. |
| Functions | `function_starter` | data | `load` and `tick` functions wired to `#minecraft:load` and `#minecraft:tick`, a jump scoreboard, a `greet` function and a function tag of your own. |
| Custom biome | `custom_biome` | resource, data | The Amber Woods biome with its own tree and copper ore, and a World Type of its own that lists it beside a few vanilla biomes (**More → World Type** when creating a world). |
| Jigsaw village-style structure | `jigsaw_structure` | data | A small hamlet built by jigsaw blocks: a centre hut, streets that follow the terrain and lamp posts, with four template pools, a structure set and a biome tag that places it in forests. |
| Custom biome with a jigsaw structure | `worldgen_pack` | resource, data | Both worldgen starters in one project: Amber Woods and its World Type, and hamlets that generate in Amber Woods and in every vanilla forest. |
| Custom mob (Creator: Mobs) | `custom_mob` | resource, data, mod | An animated Ruby Golem that wanders forests, fights back when hit, drops emeralds and bursts into sparks when it dies: its GeckoLib model, idle, walk and attack animations, skin, spawn egg, loot table, a death function and the mod metadata. |
| Scripted ore | `scripted_ore` | resource, data, mod | The Custom ore starter with three scripts: sneak-using ruby ore gives a bonus ruby, standing on a block of ruby heals you through a `run_script` action, and joining players are greeted. |
| Scripted behaviour (Creator: Scripts) | `scripted-item` | resource, mod | An item that runs a script when used: it heals you, launches you upward, strikes lightning where you look or gives you an effect. The script opens in the Script Studio. |

Five starters need a word of explanation (and every starter with mod content needs the Fabric mod jar, as Custom ore does):

- **Custom ore needs the Fabric mod jar.** Its ore, ruby and Block of Ruby are new blocks and items (`msm:block`, `msm:item`), which a resource or data pack cannot add. Export the **Fabric mod jar** and install it with Fabric Loader and Fabric API; the jar carries the `msm_runtime` mod inside unless you choose a separate runtime. The resource and data pack exports still work but hold only the models, textures, names, loot tables, tags, recipes and advancements, which do nothing without the blocks and items. Nothing in the `minecraft` namespace is changed: emerald ore stays emerald ore.
- **Custom mob needs the Fabric mod jar with GeckoLib.** The Ruby Golem is a new mob (`msm:entity`), drawn by the GeckoLib mod from its model (`msm:geo_model`) and animations (`msm:animation`). Export the **Fabric mod jar**: it nests `msm_runtime` and GeckoLib, which MCSuperMods downloads once (see [Entities and models](entities-and-models.md#export-the-mod-jar-and-geckolib)). Replace the placeholder skin by importing a Blockbench model of your own and choosing it in the Entity Studio.
- **Scripted ore needs the Fabric mod jar too.** Its scripts (`msm:script`) run inside the game through `msm_runtime`, so they work only in the Fabric mod jar; the Java project export leaves them out. The Block of Ruby's step event calls the `guard` handler of a script through a `run_script` action (see [Scripting](scripting.md)).
- **The music disc plays a vanilla track.** MCSuperMods bundles no audio, so the sound event points at the game's own `records/cat` file. The disc itself is the vanilla `music_disc_13` item carrying the new song and a name, drawn with the starter's own disc model; the `give_disc` function gives it to you (`/function <namespace>:give_disc`), because a pack cannot add a new item to the creative inventory.
- **A custom biome needs its own World Type.** A data pack cannot add a biome to the normal overworld, so the Custom biome starters add a World Type that lists the new biome. Choose it when creating a new world; existing worlds keep their biomes, although the hamlets of the jigsaw starters do appear in new chunks of an existing world.

The [Getting started](getting-started.md) guide walks through the Custom ore starter (as a Fabric mod jar) and the Functions starter in Minecraft; the [Worldgen](worldgen.md) guide walks through the worldgen starters. [Blocks and items](blocks-and-items.md) explains the Fabric mod jar export and its separate runtime option, [Entities and models](entities-and-models.md) the Custom mob starter's kinds, and [Scripting](scripting.md) the Scripted ore starter's scripts.

## Examples gallery

Choose **Help → Examples…** (also on the arrow next to **New**, and "Examples…" in the command palette). The gallery has:

- a search box that matches title, kind, category and tags;
- a kind filter (**All kinds** or one element kind);
- the list, grouped by category;
- a detail pane with the description, every element the example adds with its notes, and the placeholder files it generates.

Every element in an example carries notes: three to six sentences naming each field and what to change. The notes stay with the element: when you select it, the editor shows them in a **Notes** box above the form. Click **Notes** to fold the box away.

### Open or copy

| Action | What it does | When to use it |
|---|---|---|
| **Open as new project…** | Asks for an empty folder and creates a new project from the example, like a starter. Works with no project open. | To explore an example on its own, or start from it. |
| **Copy into my project** | Adds the example's elements and placeholder files to the open project, in the namespace chosen under **Copy into namespace**. | To reuse one example inside your own work. |

Copying needs an open project with a namespace of its own (the button explains why when it is disabled). The whole copy is one step: **Undo** ("Copy example …") removes it again. Elements whose ids already exist in the project are skipped and listed, never overwritten; so are placeholder files that already exist. Examples that change vanilla content (the Resource pack starter's stick, for example) also add elements in the `minecraft` namespace.

### New blocks and items need the mod jar

The blocks and items examples and the Custom ore starter use the `msm:block`, `msm:item` and `msm:mod` kinds. Try them in game with the **Fabric mod jar** export, not the pack exports. Their behaviour is written as components and events:

- **Switch lamp** shows `msm:on_interact` and `msm:redstone`: using the lamp, or powering it, runs an event whose `set_block_state` action swaps it for a lit twin block, and the lit lamp swaps back. An action cannot change a block's own properties, so the lit state is a second block with no item of its own.
- **Sparkle berries** shows `msm:food` with `msm:on_use`: the use event spawns particles and plays a sound, then eating starts as usual.
- **Sturdy pickaxe** shows `msm:tool` and `msm:durability`, with a recipe whose result is the project item.
- **Beacon stone** shows an event chain: the use event plays a sound and runs `trigger_event`, and the second event spawns particles and runs a function with `run_function`. Chains nest at most 16 events deep, and an event that triggers itself is reported as a cycle.

Event ids are namespaced strings of your own (`<namespace>:lamp_turn_on`); each block or item declares its events under `events`, and its components name them.

The entity examples and the Custom mob starter use `msm:entity`, `msm:geo_model` and `msm:animation`, which also need the Fabric mod jar (with GeckoLib). Each entity example is a complete mob with its model, animations, skin and, when it has one, spawn egg texture:

- **Wandering creature** shows the basics: a peaceful mob with wander and look goals and a spawn egg.
- **Hostile mob** shows `melee_attack` with `targets`, `msm:attack` whose `on_attack` event uses `play_animation`, and the spawn rule `monster`.
- **Natural spawning** shows `spawn` with a biome tag (`#`) and a biome id together.

The script examples use `msm:script`, which runs only in the Fabric mod jar (see [Scripting](scripting.md)):

- **Script: block interaction** shows `msm.events.on("block.interact", ...)` with `e.cancel()` and `e.player.give(...)`.
- **Script: scheduled effects** shows `msm.schedule`: each step of the spiral schedules the next one.
- **Script: action handler** shows how a block event calls a script: the Chime Block's use event has a `run_script` action, and the script defines that handler with `msm.actions.define`.

### All examples

There is one example for each of the 93 element kinds, twenty-one more behaviour examples (blocks and items: a tool, an event chain, a fuel log, a life-steal sword and a night-vision helmet; block types: a wood set, a stone set, a crop, a tree, a machine-like block and a vault door; a potion brewed with your own item; entities: a hostile mob and natural spawning; scripts: scheduled effects, an action handler, a scripted effect, a kill counter, a full set bonus, a teleport staff and a boss fight bar), plus four themed starters listed again under **Starters**. The three worldgen starters, the Custom mob and Scripted ore starters and the starters added with the Creator (Custom sword, Gear set, Simple block, Food, Weapon, Consumable, Totem, Enchantment, Painting, Music disc, Scripted behaviour, Dimension, Status effect, Potion, Throwable, Villager trade, Extra drop, Mob skin, Goat horn) have no gallery entry; create them with **New from starter…** or open their folders under `examples/starters/`.

| Example | id | Category | Kind | What it shows |
|---|---|---|---|---|
| Block model | `example_model` | Models | `minecraft:model` | A full-cube block model with one texture on every side. |
| Blockstate with rotation | `example_block_definition` | Blockstates | `minecraft:block_definition` | A pillar blockstate that turns one model to follow the axis property. |
| Item definition by display context | `example_item_definition` | Item definitions | `minecraft:item_definition` | An item that looks different in inventories than in the hand. |
| Language file | `example_lang` | Text | `minecraft:lang` | English names for your content, and a renamed vanilla item. |
| Sound events | `example_sounds` | Sounds | `minecraft:sounds` | A new sound event that plays vanilla sound files at random. |
| Pack metadata | `example_pack_mcmeta` | Pack | `minecraft:pack_mcmeta` | The pack.mcmeta description shown in the pack lists. |
| Worn armour look | `example_equipment` | Models | `minecraft:equipment` | An equipment asset: how armour of one material looks on a player. |
| Atlas source | `example_atlas` | Atlases | `minecraft:atlas` | Adds a texture from a folder of its own to the block atlas, so block models can use it. |
| Icon font | `example_font` | Fonts | `minecraft:font` | A font with one icon glyph drawn from a texture, for use in chat and signs. |
| Shaped recipe with a named result | `example_recipe` | Recipes | `minecraft:recipe` | A crafting recipe whose result carries a custom name and lore. |
| Chest loot table | `example_loot_table` | Loot tables | `minecraft:loot_table` | A treasure table with weighted entries and a rare bonus roll. |
| Advancement tab | `example_advancement` | Advancements | `minecraft:advancement` | A root advancement with its own tab and a child that rewards experience. |
| Stormy night predicate | `example_predicate` | Predicates | `minecraft:predicate` | A condition that is true during a thunderstorm or at night. |
| Name and lore modifier | `example_item_modifier` | Item modifiers | `minecraft:item_modifier` | Renames the held item and adds a lore line. |
| Function with execute | `example_function` | Functions | `minecraft:function` | A function that uses scores and execute to react to the player. |
| Block tag | `example_tag_block` | Tags | `minecraft:tag/block` | A group of blocks, used in commands, predicates and other tags. |
| Item tag | `example_tag_item` | Tags | `minecraft:tag/item` | A group of items, used as a recipe ingredient or in item predicates. |
| Entity type tag | `example_tag_entity_type` | Tags | `minecraft:tag/entity_type` | A group of mobs, used in target selectors and entity predicates. |
| Fluid tag | `example_tag_fluid` | Tags | `minecraft:tag/fluid` | A group of fluids, used in location predicates. |
| Game event tag | `example_tag_game_event` | Tags | `minecraft:tag/game_event` | A group of game events, such as those a sculk sensor can hear. |
| Function tag | `example_tag_function` | Tags | `minecraft:tag/function` | A group of functions run together with /function `#<tag>`. |
| Damage type tag | `example_tag_damage_type` | Tags | `minecraft:tag/damage_type` | A group of damage types, used in damage predicates and enchantments. |
| Enchantment tag | `example_tag_enchantment` | Tags | `minecraft:tag/enchantment` | A group of enchantments, used for exclusivity and enchanting tables. |
| Villager trade tag | `example_tag_villager_trade` | Tags | `minecraft:tag/villager_trade` | A group of villager trades; vanilla villagers draw theirs from tags such as `minecraft:fletcher/level_1`. |
| Banner pattern tag | `example_tag_banner_pattern` | Tags | `minecraft:tag/banner_pattern` | A group of banner patterns, such as those a banner pattern item unlocks in the loom. |
| Dialog tag | `example_tag_dialog` | Tags | `minecraft:tag/dialog` | A group of dialogs; vanilla tags put dialogs on the pause screen and the quick actions key. |
| Instrument tag | `example_tag_instrument` | Tags | `minecraft:tag/instrument` | A group of goat horn calls, used by goats and by loot that hands out horns. |
| Point of interest tag | `example_tag_point_of_interest_type` | Tags | `minecraft:tag/point_of_interest_type` | A group of point of interest types, the job sites, beds and nests villagers and bees look for. |
| Potion tag | `example_tag_potion` | Tags | `minecraft:tag/potion` | A group of potions, used by brewing recipes and by the trader potion list. |
| Timeline tag | `example_tag_timeline` | Tags | `minecraft:tag/timeline` | A group of timelines; a dimension type runs the timelines of its tag. |
| Feature tag | `example_tag_worldgen_feature` | Tags | `minecraft:tag/worldgen/feature` | A group of configured features, such as the flowers bone meal can grow. |
| Superflat preset tag | `example_tag_worldgen_flat_level_generator_preset` | Tags | `minecraft:tag/worldgen/flat_level_generator_preset` | A group of superflat presets; minecraft:visible lists those on the Presets screen. |
| Painting variant tag | `example_tag_painting_variant` | Tags | `minecraft:tag/painting_variant` | A group of painting variants; `minecraft:placeable` lists those a placed painting can pick. |
| Biome tag | `example_tag_worldgen_biome` | Tags | `minecraft:tag/worldgen/biome` | A group of biomes, used to decide where structures generate. |
| Structure tag | `example_tag_worldgen_structure` | Tags | `minecraft:tag/worldgen/structure` | A group of structures, used by /locate, maps and explorer trades. |
| World preset tag | `example_tag_worldgen_world_preset` | Tags | `minecraft:tag/worldgen/world_preset` | A group of world presets; `minecraft:normal` lists the World Type choices. |
| Damage enchantment | `example_enchantment` | Enchantments | `minecraft:enchantment` | A sword enchantment that adds damage per level. |
| Damage type | `example_damage_type` | Damage types | `minecraft:damage_type` | A new kind of damage with its own death message key. |
| Dimension type | `example_dimension_type` | Dimensions | `minecraft:dimension_type` | The settings of a bright, short world: sky, light and height. |
| Chat type | `example_chat_type` | Chat | `minecraft:chat_type` | A gold chat format for announcements. |
| Jukebox song | `example_jukebox_song` | Music | `minecraft:jukebox_song` | A new jukebox song that plays the cat disc track. |
| Banner pattern | `example_banner_pattern` | Decorations | `minecraft:banner_pattern` | A banner pattern entry that reuses a vanilla pattern texture. |
| Painting | `example_painting_variant` | Decorations | `minecraft:painting_variant` | A one-block painting with its own placeholder picture. |
| Trim material | `example_trim_material` | Armour trims | `minecraft:trim_material` | An armour trim material that reuses the quartz colour palette. |
| Trim pattern | `example_trim_pattern` | Armour trims | `minecraft:trim_pattern` | An armour trim pattern that reuses the coast design. |
| Notice dialog | `example_dialog` | Dialogs | `minecraft:dialog` | A welcome screen with a message and an OK button, opened from a function. |
| Villager trade | `example_villager_trade` | Villager trades | `minecraft:villager_trade` | A fletcher trade selling spectral arrows for emeralds, offered to apprentice fletchers through their trade tag. |
| Trade set | `example_trade_set` | Villager trades | `minecraft:trade_set` | Draws three different trades from a villager trade tag. |
| Snowy wolf skin | `example_snowy_wolf_skin` | Mob variants | `minecraft:wolf_variant` | A frost-white wolf skin, tame and angry looks and baby textures included, for snowy taigas and groves. |
| Cat variant | `example_cat_variant` | Mob variants | `minecraft:cat_variant` | A ruby-red cat skin that stray cats can have anywhere. |
| Pig variant | `example_pig_variant` | Mob variants | `minecraft:pig_variant` | A pink-violet pig skin for cherry groves. |
| Cow variant | `example_cow_variant` | Mob variants | `minecraft:cow_variant` | An amber cow skin for meadows. |
| Chicken variant | `example_chicken_variant` | Mob variants | `minecraft:chicken_variant` | A jade-green chicken skin for flower forests. |
| Frog variant | `example_frog_variant` | Mob variants | `minecraft:frog_variant` | A sapphire frog skin for mangrove swamps. |
| Zombie nautilus variant | `example_zombie_nautilus_variant` | Mob variants | `minecraft:zombie_nautilus_variant` | A slate-grey zombie nautilus skin that can appear in any ocean. |
| Cat sound variant | `example_cat_sound_variant` | Mob sounds | `minecraft:cat_sound_variant` | A cat that purrs like the royal cat but meows like the classic one. |
| Pig sound variant | `example_pig_sound_variant` | Mob sounds | `minecraft:pig_sound_variant` | A pig that grunts like the big pig and squeals like the mini one when hurt. |
| Cow sound variant | `example_cow_sound_variant` | Mob sounds | `minecraft:cow_sound_variant` | A cow that moos like the moody cow but steps like the classic one. |
| Chicken sound variant | `example_chicken_sound_variant` | Mob sounds | `minecraft:chicken_sound_variant` | A chicken that clucks like the picky chicken. |
| Custom goat horn | `example_custom_goat_horn` | Goat horns | `minecraft:instrument` | A goat horn with its own call, length and range, crafted from a goat horn and an echo shard, that goats can drop. |
| Enchantment provider | `example_enchantment_provider` | Enchantments | `minecraft:enchantment_provider` | A rule that enchants gear like a level 5 to 20 enchanting table. |
| Timeline: slime moons | `example_timeline` | Time | `minecraft:timeline` | A timeline that doubles the surface slime chance every other day, added to the overworld timelines. |
| World clock | `example_world_clock` | Time | `minecraft:world_clock` | A clock of its own that timelines and dimension types can follow. |
| Structure template | `example_structure_template` | Structures | `minecraft:structure_template` | A small stone well, stored as JSON and exported as a structure `.nbt` file. |
| Template pool | `example_template_pool` | Structures | `minecraft:worldgen/template_pool` | A pool that picks a flower bed or nothing, as jigsaw blocks do. |
| Jigsaw structure | `example_structure` | Structures | `minecraft:worldgen/structure` | A lone tower in mountains and hills, built from one template. |
| Structure set | `example_structure_set` | Structures | `minecraft:worldgen/structure_set` | Places a small ruin across taiga biomes, spread out with `random_spread`. |
| Processor list | `example_processor_list` | Structures | `minecraft:worldgen/processor_list` | Cracks and moss stone bricks and leaves a few blocks out, for an old look. |
| Biome | `example_biome` | Worldgen | `minecraft:worldgen/biome` | A quiet meadow: no trees, flowers and grass, the usual ores and caves. |
| Configured feature | `example_feature` | Worldgen | `minecraft:worldgen/feature` | Clay pockets in dirt: an ore feature that replaces dirt with clay. |
| Placed feature | `example_placed_feature` | Worldgen | `minecraft:worldgen/placed_feature` | Scatters poppies in patches on the surface. |
| Dimension | `example_dimension` | Worldgen | `minecraft:dimension` | A new dimension where the whole world is a cherry grove. |
| World preset | `example_world_preset` | Worldgen | `minecraft:worldgen/world_preset` | A World Type with amplified terrain covered in cherry groves. |
| Noise settings | `example_noise_settings` | Worldgen (advanced) | `minecraft:worldgen/noise_settings` | Gentle hills from a height gradient plus one noise, with a simple surface. |
| Density function | `example_density_function` | Worldgen (advanced) | `minecraft:worldgen/density_function` | A reusable density function: one vanilla noise, stretched horizontally. |
| Noise | `example_noise` | Worldgen (advanced) | `minecraft:worldgen/noise` | Noise parameters: three octaves starting at a large scale. |
| Carver | `example_carver` | Worldgen (advanced) | `minecraft:worldgen/carver` | Wide cave tunnels between the bottom of the world and y 180. |
| Superflat preset | `example_flat_level_generator_preset` | Worldgen (advanced) | `minecraft:worldgen/flat_level_generator_preset` | A superflat preset: bedrock, stone, dirt and grass in the plains biome. |
| Multi-noise parameter list | `example_multi_noise_biome_source_parameter_list` | Worldgen (advanced) | `minecraft:worldgen/multi_noise_biome_source_parameter_list` | A named biome layout using the vanilla overworld parameters. |
| Block state provider | `example_block_state_provider` | Worldgen (advanced) | `minecraft:worldgen/block_state_provider` | Picks stone, andesite or cobblestone by weight. |
| Material condition | `example_material_condition` | Worldgen (advanced) | `minecraft:worldgen/material_condition` | True at and above y 63; a building block of surface rules. |
| Material rule | `example_material_rule` | Worldgen (advanced) | `minecraft:worldgen/material_rule` | A surface rule: bedrock at the bottom, grass over dirt on top. |
| Switch lamp | `example_msm_block` | Blocks | `msm:block` | A custom block that lights up when used or powered by redstone, by swapping itself for a lit twin. |
| Sparkle berries | `example_msm_item` | Items | `msm:item` | A custom food item that sparkles and chimes when you start eating it. |
| Frost bomb | `example_msm_effect` | Effects | `msm:effect` | A custom Frostbite effect that slows and chills its holder, and a throwable Frost Bomb that gives it to the mob it hits. |
| Potion of the custom effect | `example_msm_potion` | Potions | `msm:potion` | A custom Featherweight effect and its potion, brewed from an awkward potion and a feather, with a longer version and splash and lingering bottles. |
| Ore that generates | `example_msm_biome_addition` | Additions | `msm:biome_addition` | Jade ore that generates underground in every overworld biome: the ore block, its ore feature, the placed feature and the world addition that adds it to vanilla biomes. |
| Zombie drops a ruby | `example_msm_loot_addition` | Additions | `msm:loot_addition` | Zombies killed by a player sometimes drop a ruby, on top of their usual drops: a ruby item and the extra drop that adds it to the vanilla zombie loot table. |
| Mod metadata | `example_msm_mod` | Mod | `msm:mod` | The name, version, authors and licence of the Fabric mod jar. |
| Sturdy pickaxe | `example_msm_tool` | Items | `msm:item` | A custom iron-tier pickaxe with extra durability and a crafting recipe. |
| Beacon stone | `example_msm_event_chain` | Blocks | `msm:block` | A block whose use event triggers a second event that spawns particles and runs a function. |
| Fuel log | `example_msm_fuel_log` | Blocks | `msm:block` | A dense log block whose item burns in a furnace three times as long as an oak log. |
| Elm wood set | `example_msm_wood_set` | Blocks | `msm:block` | A whole wood set from the Wood set flow: logs, planks, stairs, slab, fence, gate, door, trapdoor, button, plate, foliage-tinted leaves and a sapling that grows an elm tree. |
| Shale stone set | `example_msm_stone_set` | Blocks | `msm:block` | Every member of the Stone set flow: the stone, its stairs, slab and wall, a button and pressure plate, polished shale with its own shapes, bricks and a pillar, crafted and stonecut. |
| Onion crop | `example_msm_crop` | Blocks | `msm:block` | A crop planted from its produce, as carrots: onions grow through eight stages, are eaten raw and grow wild on grass in forests. |
| Silver birch tree | `example_msm_tree` | Blocks | `msm:block` | A sapling that grows a tall branching tree of vanilla birch logs and new silver leaves, and grows in forests. |
| Crusher | `example_msm_machine_block` | Blocks | `msm:block` | A machine-like block that turns its front towards you when placed, as a furnace does. |
| Vault door | `example_msm_iron_door` | Blocks | `msm:block` | A two-block-high metal door that opens only with a redstone signal, as an iron door, with a stone button to open it. |
| Life-steal sword | `example_msm_life_steal_sword` | Items | `msm:item` | An iron sword that heals you by one heart each time it hits a mob. |
| Night-vision helmet | `example_msm_night_vision_helmet` | Items | `msm:item` | An iron helmet that gives night vision while you wear it. |
| Brewed with your own item | `example_msm_brewed_with_own_item` | Potions | `msm:potion` | A Moon Shard item of your own as a brewing ingredient: an awkward potion and a moon shard brew a Potion of Levitation, which vanilla does not have, with a stronger version. |
| Wandering creature | `example_msm_entity` | Entities | `msm:entity` | A peaceful mob that strolls about, looks at players and has a spawn egg, with its model, animations and textures. |
| Cube creature model | `example_msm_geo_model` | Entity models | `msm:geo_model` | A box-shaped GeckoLib model with a body and a head bone over a 64x64 texture, shown on a small mob. |
| Idle and walk animations | `example_msm_animation` | Entity animations | `msm:animation` | An idle bob and a walk cycle that swings the arms and legs of a biped model, shown on a small mob. |
| Hostile mob | `example_msm_hostile_mob` | Entities | `msm:entity` | A monster that chases and hits players, fights back when hurt and spawns in the dark. |
| Natural spawning | `example_msm_natural_spawn` | Entities | `msm:entity` | A creature that spawns on its own in forests and plains, using a biome tag and a biome id. |
| Script: block interaction | `example_msm_script` | Scripts | `msm:script` | A script that cancels using a lodestone with an empty hand and gives the player a compass instead. |
| Script: scheduled effects | `example_msm_script_schedule` | Scripts | `msm:script` | A script that turns using an amethyst shard into a rising spiral of particles over two seconds, one `msm.schedule` step after another. |
| Script: action handler | `example_msm_script_action` | Scripts | `msm:script` | A chime block whose use event runs a script through a `run_script` action, and the script that defines that handler. |
| Script: scripted effect | `example_msm_scripted_effect` | Scripts | `msm:effect` | An Antidote status effect whose tick event runs a script: it cures poison and heals more at higher levels. |
| Script: kill counter | `example_msm_kill_counter` | Scripts | `msm:script` | A script that counts each player's kills in saved player data and the world's total in `msm.storage`, and tells players their count when they join. |
| Script: full set bonus | `example_msm_full_set_bonus` | Scripts | `msm:script` | A script that checks the armour of every player once a second and gives Haste and Luck to those wearing a full set of golden armour. |
| Script: teleport staff | `example_msm_teleport_staff` | Scripts | `msm:script` | A script that turns a breeze rod into a teleport staff: use it to blink to the block you look at, sneak-use it to mark home or, from another dimension, to go home. |
| Script: boss fight bar | `example_msm_boss_fight_bar` | Scripts | `msm:script` | A script that summons a ravager boss with a nether star and shows its health on a boss bar to every player, with a title and a reward when it falls. |
| Custom ore project | `starter_custom_ore` | Starters | `msm:block` | The Custom ore starter: a real ruby ore block, the ruby item and a block of ruby, with loot, recipes, a tag, advancements and the mod metadata. |
| Recipe pack project | `starter_recipe_pack` | Starters | `minecraft:recipe` | The Recipe pack starter: one recipe of each common type and an advancement. |
| Custom music disc project | `starter_music_disc` | Starters | `minecraft:jukebox_song` | The Custom music disc starter: a jukebox song, its disc model and texture. |
| Functions project | `starter_function_starter` | Starters | `minecraft:function` | The Functions starter: load and tick functions, a scoreboard and function tags. |

## The `examples/` folder

The same examples are in the repository as ordinary MCSuperMods projects, so you can browse them on GitHub or open them with **File → Open Project…**:

| Folder | Namespace | Contents |
|---|---|---|
| `examples/all-kinds/` | `msm_examples` | The 93 per-kind examples in one project |
| `examples/blocks-items/` | `msm_examples` | The blocks and items behaviour examples (Sturdy pickaxe, Beacon stone, Fuel log, Life-steal sword, Night-vision helmet, Brewed with your own item, Elm wood set, Shale stone set, Onion crop, Silver birch tree, Crusher, Vault door) |
| `examples/entities/` | `msm_examples` | The two entity behaviour examples (Hostile mob, Natural spawning), each with its model, animations and textures |
| `examples/scripts/` | `msm_examples` | The script behaviour examples (Script: scheduled effects, Script: action handler, Script: scripted effect, Script: kill counter, Script: full set bonus, Script: teleport staff, Script: boss fight bar) |
| `examples/starters/custom_ore/` | `msm_starter` | The Custom ore starter |
| `examples/starters/recipe_pack/` | `msm_starter` | The Recipe pack starter |
| `examples/starters/music_disc/` | `msm_starter` | The Custom music disc starter |
| `examples/starters/function_starter/` | `msm_starter` | The Functions starter |
| `examples/starters/custom_biome/` | `msm_starter` | The Custom biome starter |
| `examples/starters/jigsaw_structure/` | `msm_starter` | The Jigsaw village-style structure starter |
| `examples/starters/worldgen_pack/` | `msm_starter` | The Custom biome with a jigsaw structure starter (also saved as `fixtures/sample-worldgen/`) |
| `examples/starters/custom_mob/` | `msm_starter` | The Custom mob starter |
| `examples/starters/scripted_ore/` | `msm_starter` | The Scripted ore starter |
| `examples/starters/custom-sword/` | `msm_starter` | The Custom sword starter |
| `examples/starters/gear-set/` | `msm_starter` | The Gear set starter |
| `examples/starters/simple-block/` | `msm_starter` | The Simple block starter |
| `examples/starters/food/` | `msm_starter` | The Food starter |
| `examples/starters/weapon/` | `msm_starter` | The Weapon starter |
| `examples/starters/consumable/` | `msm_starter` | The Consumable starter |
| `examples/starters/totem/` | `msm_starter` | The Totem starter |
| `examples/starters/enchantment/` | `msm_starter` | The Enchantment starter |
| `examples/starters/painting/` | `msm_starter` | The Painting starter |
| `examples/starters/music-disc-item/` | `msm_starter` | The Music disc starter |
| `examples/starters/scripted-item/` | `msm_starter` | The Scripted behaviour starter |
| `examples/starters/dimension/` | `msm_starter` | The Dimension starter |
| `examples/starters/status-effect/` | `msm_starter` | The Status effect starter |
| `examples/starters/throwable/` | `msm_starter` | The Throwable starter |
| `examples/starters/extra-drop/` | `msm_starter` | The Extra drop starter |
| `examples/starters/potion/` | `msm_starter` | The Potion starter |
| `examples/starters/mob-skin/` | `msm_starter` | The Mob skin starter |
| `examples/starters/goat-horn/` | `msm_starter` | The Goat horn starter |

Copy a folder somewhere else before opening it, so your edits do not change the repository. See [examples/README.md](https://github.com/MEZTKING/MCSuperMods/blob/main/examples/README.md).

## Replacing the placeholders

**Textures.** Starters and examples draw 16×16 placeholder textures: ore specks, a gem, a disc or a plain colour. To use your own, paint a PNG with the same file name and choose **Import assets** on the toolbar. Pick the namespace and **Block textures** or **Item textures**, then the file. Importing a file with an existing name replaces the placeholder; the models keep pointing at it. For the Custom ore starter these are `ruby_ore.png` and `ruby_block.png` (block textures) and `ruby.png` (item textures); for the Switch lamp, `lamp.png` and `lamp_lit.png` (block textures); for the music disc, `my_song_disc.png` (item textures).

**The music disc sound.** Export your track as Ogg Vorbis (`.ogg`; Audacity can do this), then:

1. **Import assets** → **Sounds (sounds, Ogg Vorbis)** → pick the file, for example `my_song.ogg`. It is stored as `sounds/my_song.ogg` in the namespace.
2. Select the `sounds` element. In the event `music_disc.my_song`, change the sound's `name` from `minecraft:records/cat` to `<namespace>:my_song` (the file path under `sounds/`, without `.ogg`). Keep `stream` on: long music streams instead of loading all at once.
3. Select the jukebox song `my_song` and set `length_in_seconds` to the length of your track in seconds. The "Now playing" text is in the `en_us` language element (`Your Name - My Song`); change it there.

## Regenerating `examples/` (contributors)

The `examples/` folder is generated from `packages/plugins/library/src/`; do not edit it by hand. After changing the library, rewrite the mirror with

```sh
UPDATE_GOLDENS=1 pnpm --filter @msm/exporters exec vitest run test/library.test.ts
```

`packages/exporters/test/library.test.ts` fails in CI when the folder drifts from the library. It also builds every starter and example for each supported version, saves and reloads it, validates every element and function, and exports both packs with zero problems; projects with blocks, items, entities, scripts or mod metadata are also exported as a Fabric mod jar with zero problems, and every script type-checks against the runtime typings. Template tests live with each plugin (`packages/plugins/<plugin>/test/templates.test.ts` for `resourcepack`, `datapack`, `structures`, `worldgen`, `blocks-items`, `models-anim`, `entities` and `scripting`).
