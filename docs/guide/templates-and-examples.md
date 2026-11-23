# Templates, starters and examples

MCSuperMods ships three kinds of ready-made content. All of it is checked in CI: every template, starter and example validates against each supported Minecraft version and exports with zero problems.

| What | Where in the app | What you get |
|---|---|---|
| **Element templates** (309) | **Add element** (Ctrl+N) | One new element with useful starting content |
| **Project starters** (82) | **New from starter…**, or **Create…** for the flows | A new project, already filled; the flows also add to the open project |
| **Examples** (215) | **Help → Examples…** | A commented project or element to open or copy |

Templates come from the resource pack, data pack, structures, worldgen, blocks and items, entities, models and animations, scripting, rules and games plugins, starters and examples from the built-in library plugin. Third-party plugins can add their own through the same plugin API ([ADR 0020](https://github.com/MEZTKING/MCSuperMods/blob/main/docs/adr/0020-templates-starters-examples.md)).

No starter or example contains Mojang files. Textures are small pictures that MCSuperMods draws itself in a Minecraft-like style ([Drawing pictures](pictures.md)); the music disc plays a track from your own copy of the game.

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

#### Shaders

Screen effects and shader programs work in a plain resource pack. Their `.vsh`, `.fsh` and `.glsl` files are your own, brought in with **Import assets** (folder **Shaders**); MCSuperMods copies them as they are and does not check them ([Screen effects, shaders and waypoints](adding-to-vanilla.md#screen-effects-shaders-and-waypoints)).

| Template | id | Kind | Notes |
|---|---|---|---|
| Spectator view effect | `post_effect_creeper` | `minecraft:post_effect` | Replaces what you see while spectating a creeper with your own shader, then copies the result back to the screen: add shaders/post/<name>.vsh, <name>.fsh and copy.fsh (a plain copy) to the project. Works in a plain resource pack; check the look in game. |
| Shader program | `shader_program` | `minecraft:shader` | A shader program naming your own vertex and fragment files (shaders/<name>.vsh and .fsh in the project), one sampler and no uniforms. The game does not check the GLSL until it loads. |

#### Locator bar

| Template | id | Kind | Notes |
|---|---|---|---|
| Waypoint style | `waypoint_style` | `minecraft:waypoint_style` | A locator bar dot that changes from the bow tie up close to the plain dot far away; use it with /waypoint modify <target> style set <id>. Draw your own dots under textures/gui/sprites/hud/locator_bar_dot/. |

#### Pack

| Template | id | Kind | Notes |
|---|---|---|---|
| Pack metadata | `pack` | `minecraft:pack_mcmeta` | The pack description shown in the game (pack.mcmeta). (default name `pack`) |

#### Recipes

To add a recipe, choose **Add element** (Ctrl+N), type `recipe` into **Find a template** and pick the kind of recipe below, or search for "recipe" and choose **Add to my mod** on one. A shaped recipe opens in the Recipe Studio with a 3 by 3 crafting grid: put an item in each cell and choose the result; shapeless and cooking recipes list their ingredients. Most Creator flows (a block, a food, a weapon, a gear set) ask for a crafting recipe of their own, and the **Recipe pack** starter holds one recipe of each common type. Recipes are data pack files: they work in the vanilla data pack export and in the Fabric mod jar, and in the game `/reload` reads them again.

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
| Pot pattern | `decorated_pot_pattern` | `minecraft:decorated_pot_pattern` | A decorated pot face; uses the heart sherd picture until you add your own under entity/decorated_pot/. A sherd item names it through the decorated_pot_sherds tag and its pot pattern. |
| Block transformer | `block_transformer` | `minecraft:block_transformer` | What a tool does when used on a block, tried in order: here a moss block turns into dirt with the shovel sound. Name it minecraft:shovel to change what shovels do, or point your own item at it. |
| Test environment | `test_environment` | `minecraft:test_environment` | Where map makers run game tests: clear weather and normal difficulty, for test instances that name it. |
| Test instance | `test_instance` | `minecraft:test_instance` | A game test for map makers: places a structure and waits for a test block to pass. Run it with /test run. |
| Whole-number provider | `context_int_provider` | `minecraft:context_int_provider` | A named whole number the game reads, such as a compost chance: a random number from 1 to 3. Name it after a vanilla one, such as minecraft:compostable/low, to change that value. |
| Decimal-number provider | `context_float_provider` | `minecraft:context_float_provider` | A named decimal number the game reads, such as a cooking speed: here twice as fast. Name it after a vanilla one, such as minecraft:cooking/speed_default, to change that value. |

#### Mobs

New skins for vanilla animals (see [Mob skins](adding-to-vanilla.md#mob-skins)), a trial spawner wave and a sulfur cube kind.

| Template | id | Kind | Notes |
|---|---|---|---|
| Wolf variant | `wolf_variant` | `minecraft:wolf_variant` | A wolf skin that appears in taiga biomes; uses vanilla textures until you add your own. |
| Cat variant | `cat_variant` | `minecraft:cat_variant` | A cat skin that appears in swamps; uses vanilla textures until you add your own. |
| Trial spawner | `trial_spawner` | `minecraft:trial_spawner` | A trial spawner wave of baby zombies, like the trial chambers' small melee spawner; place a trial spawner and point its block entity at this id. |
| Sulfur cube kind | `sulfur_cube_archetype` | `minecraft:sulfur_cube_archetype` | A sulfur cube that turns bouncy and light when fed slime balls, with the bouncy sounds. |

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
| Moon dimension type | `dimension_type_moon` | `minecraft:dimension_type` | A black starry sky with the sun standing still low in the sky, no clouds and no sleeping (beds still set your spawn). Point a dimension at it; vanilla has no gravity setting, so use Rules to give players Slow Falling or Jump Boost there ([A sky and rules of your own](worldgen.md#a-sky-and-rules-of-your-own-dimension-types)). |
| Nether-like dimension type | `dimension_type_nether_like` | `minecraft:dimension_type` | No sky and a bedrock ceiling, red fog, fast lava, water that evaporates, beds that explode, working respawn anchors and one block here for eight in the overworld. |

#### Worldgen (advanced)

| Template | id | Kind | Notes |
|---|---|---|---|
| Noise settings: gentle hills | `noise_settings` | `minecraft:worldgen/noise_settings` | Terrain from a height gradient plus one noise, with water at sea level and a simple grass, dirt and bedrock surface. |
| Noise settings: islands | `noise_settings_islands` | `minecraft:worldgen/noise_settings` | Islands in a sea at height 63: land rises where a stretched surface noise is high and sinks under water where it is low. Grass over dirt on land, sand under water. |
| Noise settings: tall mountains | `noise_settings_mountains` | `minecraft:worldgen/noise_settings` | Tall mountains up to about height 230 over valleys at height 80, with cliffs from a 3D noise. Grass over dirt, stone beneath. |
| Noise settings: caves only | `noise_settings_caves` | `minecraft:worldgen/noise_settings` | Solid stone from height 0 to 127 with caverns where a 3D surface noise is high, water lakes below height 20 and bedrock at the bottom. Use it with a dimension type 128 high, without sky light. |
| Noise settings: empty sky | `noise_settings_empty` | `minecraft:worldgen/noise_settings` | Nothing at all: air everywhere and no water, for a Skyblock or a world you build from scratch. |
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
| Storage crate | `msm_block_storage_crate` | `msm:block` | A crate that turns to face you and opens a 3-row chest window, with a barrel's sounds. Hoppers and comparators work on it. |
| Small crate (1 row) | `msm_block_small_crate` | `msm:block` | A one-row crate with nine slots. |
| Item holder | `msm_block_item_holder` | `msm:block` | A block with one slot and no window: use it with an item to put it in, with an empty hand to take it out. |
| Hopper box | `msm_block_hopper_box` | `msm:block` | A box with the hopper window and five slots. |
| Dispenser box | `msm_block_dispenser_box` | `msm:block` | A box with the dispenser window and nine slots. |
| Grinder machine | `msm_block_grinder_machine` | `msm:block` | A machine that burns fuel and grinds with four recipes of its own (cobblestone into gravel, gravel into flint, bones into bone meal, wool into string). |
| Fast furnace | `msm_block_fast_furnace` | `msm:block` | A machine that smelts a furnace's recipes at twice the speed. |
| Redstone machine | `msm_block_redstone_machine` | `msm:block` | A machine that works while it is powered by redstone and gives off light while working; it smelts a furnace's recipes. |
| Portal to the Nether | `msm_block_portal_nether` | `msm:block` | A portal in a frame of crying obsidian, lit with flint and steel, that leads to the Nether and back, eight to one as the Nether portal, with ember-orange dust. Category Portals. Needs the Fabric mod jar. |
| Portal to the End | `msm_block_portal_end` | `msm:block` | A portal in a frame of end stone bricks that leads to the End and back; travellers land on the ground near the same place, and the way back is a portal you build in the End. Category Portals. |
| Trigger-lit portal | `msm_block_portal_trigger_lit` | `msm:block` | A portal to the Nether in a frame of quartz blocks that no item lights: light it from an event with the **Light a portal** action. Category Portals. |
| Sleeping bag | `msm_block_sleeping_bag` | `msm:block` | A bed of two halves that you sleep in and that sets your spawn, following the straw bed rule: it works by day too. Category **Blocks: furniture and lights**. Villagers do not use project beds. |
| Pie | `msm_block_pie` | `msm:block` | A cake-like block eaten slice by slice (seven bites), with the cake sounds; a comparator reads what is left. |
| Rope ladder | `msm_block_rope_ladder` | `msm:block` | A ladder that climbs on a wall and turns to the wall you place it against. |
| Torch | `msm_block_torch` | `msm:block` | A torch for the floor and, as its own wall form, for walls, giving light 14 and flame particles. |
| Lantern | `msm_block_lantern` | `msm:block` | A lantern that stands on a block or hangs from one, giving light 15. |
| Chain | `msm_block_chain` | `msm:block` | A thin chain that places along the face you aim at and holds up lanterns. |
| Candle | `msm_block_candle` | `msm:block` | A candle you stack up to four in one block, light with flint and steel and put out with a click, giving light 3 for each lit one. |
| Wooden sign | `msm_block_wooden_sign` | `msm:block` | A sign you write on, standing on the floor in sixteen turns and, as its own wall form, on walls. Both sides take text, dye, glow ink and wax. |
| Hanging sign | `msm_block_hanging_sign` | `msm:block` | A sign that hangs from a block or a chain, or sticks out from a wall, with text on both sides. |
| Rug | `msm_block_rug` | `msm:block` | A rug one sixteenth of a block high that sits on the floor. |
| Glow rod | `msm_block_glow_rod` | `msm:block` | A slim rod that points in six directions and shines at light 14, as an end rod. |
| Scaffold | `msm_block_scaffold` | `msm:block` | A scaffolding you build up in a column and out in a row up to six blocks, that you climb and that falls when its support goes. |
| Waterlogged lamp | `msm_block_waterlogged_lamp` | `msm:block` | A glowing block that holds water and keeps its light under it. Only plain, pillar, facing and directional blocks can hold water. |
| Berry bush | `msm_block_berry_bush` | `msm:block` | A prickly bush with four ages that gives vanilla sweet berries when ripe and hurts what walks through it. Category **Blocks: plants**. |
| Tall flower | `msm_block_tall_flower` | `msm:block` | A flower two blocks high that drops one flower from the lower half and can be copied with bone meal. |
| Potted plant | `msm_block_potted_sapling` | `msm:block` | A flower pot holding a plant, which drops the pot and the plant; it needs no item of its own. |
| Glow pod (sea pickle-like) | `msm_block_sea_pickle` | `msm:block` | A cluster of one to four pods that glows brighter with each pod, 6, 9, 12 and 15 in water and not at all dry. |
| Vine | `msm_block_vine` | `msm:block` | A vine that clings to the sides of blocks, grows down, spreads slowly and is climbable. |
| Snow-like layers | `msm_block_snow_layers` | `msm:block` | A block of eight layers built up one at a time. It never melts. |
| Melon-like stem | `msm_block_melon_stem` | `msm:block` | A stem of eight ages on farmland that grows vanilla melons beside it; the bent stem is its own companion block. |
| Cocoa-like pod | `msm_block_cocoa_pod` | `msm:block` | A pod that grows through three ages on the side of a jungle log and drops more when ripe. |
| Copper-like block | `msm_block_copper_block` | `msm:block` | The first of four copper stages: it ages to vanilla exposed copper in time and honeycomb waxes it. Category **Copper**; for the whole set copy the Copper roof example. |
| Copper-like rod | `msm_block_copper_rod` | `msm:block` | A rod that faces any of six ways, as a lightning rod, and gives no light. It is the first of four copper stages: it ages to vanilla's exposed lightning rod in time, honeycomb waxes it into vanilla's waxed lightning rod, and lightning nearby scrapes it back. For a whole set, use the Copper set flow. |
| Vine with glowing berries | `msm_block_berry_vine` | `msm:block` | Category **Blocks: plants**; see [Growing and climbing plants](block-types-and-plants.md#growing-and-climbing-plants). A vine that hangs from a ceiling and grows down, bearing berries that glow at light 14 and are picked by using it, as cave vines. The berries are its block item, edible, and plant the vine. |
| Kelp-like water plant | `msm_block_water_strand` | `msm:block` | A plant that grows up in water a block at a time, as kelp: always under water, placed only in water, and broken when the water goes. |
| Weeping vine | `msm_block_hanging_strand` | `msm:block` | A climbable vine that hangs from the underside of a block and grows down a block at a time, as weeping vines. |
| Cane | `msm_block_cane` | `msm:block` | A stalk that grows three blocks tall on sand, dirt or grass with water beside it, as sugar cane. |
| Cactus | `msm_block_cactus` | `msm:block` | A spiny column that grows three blocks tall on sand and hurts whatever touches it, as cactus. |
| Bamboo-like stalk | `msm_block_bamboo_stalk` | `msm:block` | A woody stalk that grows from a shoot (the generated block <id>_shoot) to 12 to 16 blocks, with leaves near its top, as bamboo. |
| Glowing lichen | `msm_block_glowing_lichen` | `msm:block` | A thin growth that covers any side of the blocks around it, glows at light 7 and spreads with bone meal, as glow lichen. |
| Big dripleaf | `msm_block_tipping_leaf` | `msm:block` | A big leaf on a stem (the generated block <id>_stem) that tips under whoever stands on it and drops them, as big dripleaf. Bone meal grows it taller. |
| Flower pot | `msm_block_flower_pot` | `msm:block` | An empty flower pot of its own that takes the plants it lists (here four flowers); each becomes a potted block <id>_<plant>. Vanilla pots are not changed, and other plants do not go in. |
| Double chest | `msm_block_double_chest` | `msm:block` | A chest of 27 slots that joins a chest of its kind beside it into one double chest of 54, as vanilla chests do; sneak to keep them apart. Hoppers and comparators work with each half. |
| Chest for every player | `msm_block_player_chest` | `msm:block` | A chest in which every player finds their own items, as an ender chest: every chest of this kind opens the same store for that player, nothing drops when it is broken, and hoppers do not reach it. |
| Block with its own sounds | `msm_block_own_sounds` | `msm:block` | A block that sounds like amethyst when broken, walked on, placed, hit and fallen on, a little higher: each event of block_sounds replaces its sound_type event. |
| Door with its own sounds | `msm_block_door_own_sounds` | `msm:block` | A wooden door that opens by hand but sounds like an iron door: its set type is its own (set_type base wood with the iron door sounds). |

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
| Satchel | `msm_item_satchel` | `msm:item` | A bag that holds 27 stacks, as a chest: sneak and use it to open it. Its contents stay in the bag, and a bag cannot go inside another bag. |
| Pouch | `msm_item_pouch` | `msm:item` | A small bag of five slots, as a hopper: use it to open it. |
| Quiver-like bundle | `msm_item_quiver_bundle` | `msm:item` | An item that holds a mix of items, as a bundle, with open and closed pictures. |
| Boat and chest boat | `msm_item_boat` | `msm:item` | A boat you paddle and ride as vanilla boats, with a chest boat beside it. It is drawn as an oak boat until you give it your own wood pictures, and it is crafted from your wood planks: make a wood set of the same name for them. See [Boats](boats.md). |

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

#### Particles

Particles of your own (`msm:particle`) need the Fabric mod jar; see [Particles](particles.md). **Retexture a vanilla particle** is a resource pack template and works in a plain resource pack.

| Template | id | Kind | Notes |
|---|---|---|---|
| Glowing spark | `msm_particle_glowing_spark` | `msm:particle` | A small warm spark that glows in the dark, drifts slowly upwards and fades out. Use it in a spawn_particle action or as a block's ambient particle. |
| Falling petal | `msm_particle_falling_petal` | `msm:particle` | A pink petal that picks one of three cherry petal pictures, falls gently and spins as it goes. |
| Smoke puff | `msm_particle_smoke_puff` | `msm:particle` | A grey puff that rises, grows and fades out, running through vanilla's smoke pictures from large to small. |
| Block with ambient particles | `msm_block_ambient_particles` | `msm:block` | A glowing block that gives off end rod sparkles by itself, as a torch shows its flame. Swap the particle for one of your own. |
| Retexture a vanilla particle | `particle_retexture` | `minecraft:particle` | Gives a vanilla particle (flame by default) a picture of your own: add it as `textures/particle/<name>.png`. Works in a plain resource pack. |

#### Fluids

Liquids of your own (`msm:fluid`) need the Fabric mod jar; see [Fluids](fluids.md).

| Template | id | Kind | Notes |
|---|---|---|---|
| Water-like fluid | `msm_fluid_water_like` | `msm:fluid` | A green liquid that flows, makes new sources and lets you swim in it like water, with a bucket to carry it. It uses vanilla water pictures under a green tint until you give it your own. Default name `swamp_water`. |
| Lava-like fluid | `msm_fluid_lava_like` | `msm:fluid` | A glowing molten liquid that flows slowly, never makes new sources, lights up the dark and sets things on fire like lava, with vanilla lava pictures under a golden tint. Default name `molten_gold`. |
| Fluid with a cauldron and bottle | `msm_fluid_cauldron_bottle` | `msm:fluid` | A pink water-like liquid you can pour into a cauldron, which fills in three levels as water does, and scoop into bottles with a glass bottle. Drinking a bottle feeds you a little and heals you for a few seconds. |
| Fluid that mixes with water | `msm_fluid_mixing` | `msm:fluid` | A glowing molten liquid that hardens where water touches it, as lava does: a still pool turns into raw copper and a flowing stream into cobbled deepslate. It keeps a full-only cauldron, as lava does. |

#### Additions

Additions to vanilla content need the Fabric mod jar too; see [Adding to vanilla](adding-to-vanilla.md).

| Template | id | Kind | Notes |
|---|---|---|---|
| Ore in the overworld | `msm_biome_addition_overworld_ore` | `msm:biome_addition` | Generates an ore in every overworld biome, at the underground ores step. It adds the placed feature `<this id>_placed`: make that placed feature (and its feature) in the Worldgen Studio, or pick your own. Only newly generated chunks get the ore. |
| Extra mob drop | `msm_loot_addition_mob_drop` | `msm:loot_addition` | Adds a drop to the zombie: one emerald, one time in ten, only when a player kills it. The zombie keeps its usual drops. A world data pack that replaces the zombie loot table wins. |
| Rules for vanilla blocks | `msm_vanilla_block_rules` | `msm:vanilla_block_rules` | An axe scrapes the moss off mossy cobblestone and stone bricks, a shovel packs mud, a hoe turns a moss block into dirt and leaves a moss carpet, and huge mushroom blocks burn. None of these is a vanilla pair, so nothing vanilla does is replaced. Needs the Fabric mod jar. See [Rules for vanilla blocks](adding-to-vanilla.md#rules-for-vanilla-blocks). |

#### Mod

| Template | id | Kind | Notes |
|---|---|---|---|
| Mod metadata | `msm_mod` | `msm:mod` | The name, version and licence of the Fabric mod; one per project. Its name is always `mod`, and the mod id comes from the namespace. |

#### Entities

New mobs, like new blocks and items, exist only in the **Fabric mod jar** export, which carries GeckoLib when a mob needs it (see [Entities and models](entities-and-models.md) and [Mob behaviours](mob-behaviours.md)); on the 26.4 snapshot the built-in renderer draws them. The entity templates point at a model `<namespace>:entity/<name>`, an animation set `<namespace>:entity/<name>_animations` and a texture of the same name; until you import or add them, **Problems** reports them.

| Template | id | Kind | Notes |
|---|---|---|---|
| Creature | `msm_entity_creature` | `msm:entity` | A passive mob that wanders, looks at players and spawns in forests, with a spawn egg. |
| Monster | `msm_entity_monster` | `msm:entity` | A hostile mob that chases and hits players, fights back when hurt and spawns in the dark, with a spawn egg. |
| Ambient critter | `msm_entity_ambient` | `msm:entity` | A small ambient mob that runs away from players, without a spawn egg. |
| Pet | `msm_entity_pet` | `msm:entity` | A wolf-like animal you tame with bones: it sits when you right-click it with an empty hand, follows and defends you and has babies when fed cooked meat. |
| Farm animal | `msm_entity_farm_animal` | `msm:entity` | A cow-like animal that follows players holding wheat, breeds with it, has babies and runs about when hurt. |
| Mount | `msm_entity_mount` | `msm:entity` | A horse-like animal anyone can ride and steer once it wears a vanilla saddle, with a jump bar. |
| Flying creature | `msm_entity_flying` | `msm:entity` | A peaceful bee-like flyer that drifts through the air, hovers when idle and takes no fall damage. |
| Fish | `msm_entity_fish` | `msm:entity` | A small fish that swims in schools, darts away from players and dries out on land. |
| Archer | `msm_entity_archer` | `msm:entity` | A skeleton-like monster that circles players and shoots arrows from a distance. |
| Boss | `msm_entity_boss` | `msm:entity` | A large monster with a boss bar that darkens the sky; it never spawns on its own. |
| Bucket fish | `msm_entity_bucket_fish` | `msm:entity` | A small fish you catch by using a water bucket on it, as vanilla's cod and axolotls: the bucket keeps its name and health, and using the bucket lets it out with the water. When badly hurt it plays dead for a while and recovers. Spawns in rivers, with a spawn egg. The bucket's picture is reported missing until you add it. Its model and animations are named after the mob and are reported missing until you add or import them (for example from Blockbench). |
| Hovering creature | `msm_entity_hovering` | `msm:entity` | A peaceful creature that floats four blocks above the ground, as a ghast or a blaze, drifting about without falling. Spawns in meadows, with a spawn egg. Its model and animations are named after the mob and are reported missing until you add or import them (for example from Blockbench). |
| Swooping flyer | `msm_entity_swooping` | `msm:entity` | A phantom-like monster that circles high above a player, then dives and bites. Spawns in the dark, with a spawn egg. Its model and animations are named after the mob and are reported missing until you add or import them (for example from Blockbench). |
| Phasing spirit | `msm_entity_phasing` | `msm:entity` | A vex-like monster that flies at players and passes through walls while it charges. With a spawn egg; it does not spawn on its own. Its model and animations are named after the mob and are reported missing until you add or import them (for example from Blockbench). |
| Roosting flyer | `msm_entity_roosting` | `msm:entity` | A bat-like ambient flyer that hangs upside down under a block through the day and flutters about at night; it lets go when a player comes near. Spawns across the Overworld, without a spawn egg. Its model and animations are named after the mob and are reported missing until you add or import them (for example from Blockbench). |
| Item collector | `msm_entity_collector` | `msm:entity` | An allay-like flyer you tame with cookies. Give it an item and it picks up more of the same and brings them to you, or to a note block it heard play; use it with an empty hand to take the item back. Spawns in forests, with a spawn egg. Its model and animations are named after the mob and are reported missing until you add or import them (for example from Blockbench). |
| Digger | `msm_entity_digger` | `msm:entity` | A sniffer-like animal that now and then walks to a patch of dirt or moss, digs and turns up something from vanilla's sniffer digging loot. Spawns in old growth forests, with a spawn egg. Its model and animations are named after the mob and are reported missing until you add or import them (for example from Blockbench). |
| Barterer | `msm_entity_barterer` | `msm:entity` | A piglin-like mob that takes gold ingots from players (use it with one) or picks them up from the ground, looks them over and drops something from vanilla's piglin bartering loot. With a spawn egg; it does not spawn on its own. Its model and animations are named after the mob and are reported missing until you add or import them (for example from Blockbench). |
| Dashing mount | `msm_entity_dash_mount` | `msm:entity` | A camel-like animal anyone can ride once it wears a vanilla saddle. Hold the jump key to fill the bar and let go to dash forward, about seven blocks at a full bar. Spawns in deserts, with a spawn egg. Its model and animations are named after the mob and are reported missing until you add or import them (for example from Blockbench). |

#### Villagers and traders

Traders, village jobs, villager looks, pack animals and shoulder pets need the Fabric mod jar; see [Villagers, traders and pets that carry things](villagers-and-traders.md).

| Template | id | Kind | Notes |
|---|---|---|---|
| Wandering merchant | `msm_entity_wandering_merchant` | `msm:entity` | A mob that trades through the villager trading screen: it sells what vanilla's wandering trader sells, and its rarer wares unlock as you trade. Offers refill twice a day. With a spawn egg. |
| Trader who remembers you | `msm_entity_fair_trader` | `msm:entity` | A trader whose prices follow how each player treats it, as a villager's do: trades and a gift of flowers make them lower, hitting it makes them higher, and it forgets a little each day. A trade bought out costs more after the next restock, and it restocks twice a day at the nearest barrel. With a spawn egg. Its model and animations are named after the mob and are reported missing until you add or import them (for example from Blockbench). |
| Pack mule | `msm_entity_pack_mule` | `msm:entity` | An animal you tame with apples and ride with a saddle. Use a chest on it to give it three rows of storage, opened with the inventory key while riding or by using it while sneaking. |
| Shoulder pet | `msm_entity_shoulder_pet` | `msm:entity` | A small animal you tame with sweet berries. Once tamed it follows you, sits when you use it and jumps onto your shoulder when you stand still near it. |
| Village job | `msm_villager_profession` | `msm:villager_profession` | A new job for vanilla villagers: a villager without a job takes it at a job site block of your own. Five trade levels are created for you; add trades to their trade tags. |
| Villager look | `msm_villager_type` | `msm:villager_type` | A new look for vanilla villagers and zombie villagers born or spawned in the biomes you list (here the cherry grove). The pictures are drawn over the villager at entity/villager/type/ and entity/zombie_villager/type/ (64 by 64, in the villager layout) and are reported missing until you add them. It brings no trades of its own. |

#### Vehicles

Vehicles (`msm:vehicle`) need the Fabric mod jar; see [Vehicles](vehicles.md).

| Template | id | Kind | Notes |
|---|---|---|---|
| Go-kart | `msm_vehicle_go_kart` | `msm:vehicle` | A small, quick one-seater with no fuel and a horn, that grips the road and climbs half a block. Its model, texture and item picture are named after the vehicle and are reported missing until you add or import them (for example from Blockbench). |
| Car | `msm_vehicle_car` | `msm:vehicle` | A two-seat car that runs on coal or charcoal, with a horn, a boot of one row, exhaust smoke, red and blue paint and iron-ingot repairs. Its model, texture and item picture are named after the vehicle and are reported missing until you add or import them (for example from Blockbench). |
| Tank | `msm_vehicle_tank` | `msm:vehicle` | A slow, tough tank that turns on the spot, with a turret that follows your view, a cannon firing fire charges (loaded with fire charges) on the fire key and a machine gun on the second key. Repaired with iron ingots; immune to fire. Its model, texture and item picture are named after the vehicle and are reported missing until you add or import them (for example from Blockbench). |
| Biplane | `msm_vehicle_biplane` | `msm:vehicle` | A two-seat plane on coal: forwards opens the throttle, the nose follows your view, and it lifts off above half its top speed. Its model, texture and item picture are named after the vehicle and are reported missing until you add or import them (for example from Blockbench). |
| Helicopter | `msm_vehicle_helicopter` | `msm:vehicle` | A two-seat helicopter on coal that hovers in place: jump climbs, the "Vehicle: descend" key sinks, and it turns with your view. Its model, texture and item picture are named after the vehicle and are reported missing until you add or import them (for example from Blockbench). |
| Motorboat | `msm_vehicle_motorboat` | `msm:vehicle` | A quick two-seat boat that skims the water surface, with a horn and a propeller, placed on water. Its model, texture and item picture are named after the vehicle and are reported missing until you add or import them (for example from Blockbench). |
| Raft | `msm_vehicle_raft` | `msm:vehicle` | A slow raft for four with a crate of one row, placed on water. Its model, texture and item picture are named after the vehicle and are reported missing until you add or import them (for example from Blockbench). |
| Hovercraft | `msm_vehicle_hovercraft` | `msm:vehicle` | A two-seat amphibious craft that drives on land and water alike, slides in the turns and is placed on either. Its model, texture and item picture are named after the vehicle and are reported missing until you add or import them (for example from Blockbench). |

#### Controls and HUD

Keys of your own (`msm:key_bind`) and on-screen elements (`msm:hud`) need the Fabric mod jar; see [Keys and the screen](keys-and-hud.md).

| Template | id | Kind | Notes |
|---|---|---|---|
| Dash key | `msm_key_bind_dash` | `msm:key_bind` | Pressing Z dashes the player forward where they look, with a whoosh, at most once a second. Players can change the key in Controls. |
| Ability key with cooldown | `msm_key_bind_ability` | `msm:key_bind` | Pressing K gives the player Strength II for ten seconds, then the key rests for thirty seconds. Change the effect to your own ability. |
| Mana bar | `msm_hud_mana_bar` | `msm:hud` | A blue bar above the hotbar showing the player's "mana" out of 100, kept in script data. Rules and scripts fill it up and use it. |
| Stamina bar | `msm_hud_stamina_bar` | `msm:hud` | A green bar above the hotbar showing the player's "stamina" out of 100, kept in script data. Rules and scripts drain it and fill it again. |
| Coordinates text | `msm_hud_coordinates` | `msm:hud` | Shows the player's height (Y) in the top-left corner, read by their own game. Make copies with the stat set to x and z, each 10 pixels lower, for all three. |
| Score counter | `msm_hud_score_counter` | `msm:hud` | Shows the player's score in the "points" scoreboard objective in the top-right corner. Create the objective in a load function (scoreboard objectives add points dummy). |

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
| Full set bonus | `msm_script_full_set_bonus` | `msm:script` | Gives a bonus to players wearing a whole armour set: every second, a player in full golden armour gets Speed and Haste. Uses the player.tick event and entity equipment (runtime 1.5.1 or later). Change the item ids to your own armour. |
| Boss bar countdown | `msm_script_boss_bar_countdown` | `msm:script` | Shows a countdown to every player as a boss bar: using an echo shard starts 30 seconds, the bar empties and turns red near the end, and a title says when time is up. Uses msm.bossBars and titles (runtime 1.5.1 or later). |
| Help command | `msm_command_help` | `msm:command` | A command every player can use, typed as `/helpme` (or `/tips`): a chime and an answer in chat, from an event of its own. Category **Commands** ([Commands and creative tabs](commands-and-tabs.md)). |
| Hop command | `msm_command_hop` | `msm:command` | `/hop` throws the player a few blocks up and lets them float down gently. |
| Creative tab | `msm_creative_tab` | `msm:creative_tab` | A tab of its own in the creative inventory with a crafting table as its icon. Category **Creative tabs**. |
| Creative tab in your own order | `msm_creative_tab_by_hand` | `msm:creative_tab` | A tab whose items show in the order you list them, here a compass, a clock, a map and a spyglass. Change the list to your own items; items that join the tab by naming it in their "Creative tab" field follow after the list. Category **Creative tabs**. |
| On or off game rule | `msm_game_rule_switch` | `msm:game_rule` | A world setting that is on or off, on in a new world, listed under Mobs in the game rule screen and set with /gamerule <namespace>:mob_sparkles. A rule reads it with "The game rule is", a script with world.gameRule. Category **Game rules** ([Commands and creative tabs](commands-and-tabs.md#game-rules)). |
| Number game rule | `msm_game_rule_number` | `msm:game_rule` | A world setting that holds a whole number from 0 to 10, 3 in a new world, listed under Player in the game rule screen. /gamerule refuses numbers outside the range. Category **Game rules**. |
| Counted statistic | `msm_stat_counter` | `msm:stat` | A number counted for each player and shown in the Statistics screen, such as how many times something happened. A rule adds to it with "Add to a statistic"; a scoreboard objective can follow it with the criterion minecraft.custom:<namespace>.ores_found. Category **Statistics** ([Commands and creative tabs](commands-and-tabs.md#statistics)). |
| Timed statistic | `msm_stat_time` | `msm:stat` | A time counted for each player in ticks (20 a second) and shown in the Statistics screen as seconds, minutes, hours or days. Add 20 to it every second the player spends somewhere. Category **Statistics**. |
#### Rules

Rule books (`msm:rules`) give things behaviour with no code (see [Rules](rules.md)). They become events and scripts that the `msm_runtime` mod runs, so they work only in the **Fabric mod jar** export; rules with logic are not in the Java project export. The templates use only vanilla things: change the block, item or mob to your own.

| Template | id | Kind | Notes |
|---|---|---|---|
| Welcome message | `msm_rules_welcome_message` | `msm:rules` | When a player joins, shows a big welcome title, a chat message and a chime. Change the words to your own. |
| Jump pad | `msm_rules_jump_pad` | `msm:rules` | Players standing on a Slime Block are launched high into the air with a bounce sound. Change the block to your own jump pad. |
| Lucky block | `msm_rules_lucky_block` | `msm:rules` | Breaking a Sponge is a gamble: half the time it drops one to three diamonds, otherwise a zombie appears. Change the block to your own lucky block. |
| Healing spring | `msm_rules_healing_spring` | `msm:rules` | Players standing in water heal a little every second, with hearts around them. Change the block to make your own healing spot. |
| Click counter | `msm_rules_click_counter` | `msm:rules` | Counts how many times each player has used a Lever and shows the count above the hotbar. Change the block to your own. |
| Mob drops a reward | `msm_rules_mob_reward` | `msm:rules` | Zombies drop an emerald one time in ten when they die. Change the mob to your own and the item to your own reward. |

#### Games

The pieces of a game (see [Game modes](game-modes.md)): how a world starts, one blocks, teams, scores, timers and areas. They lower to data pack files only, so they work in the vanilla data pack export as well as in the Fabric mod jar. Category **Games**.

| Template | id | Kind | Notes |
|---|---|---|---|
| Empty sky world | `world_setup_empty_sky` | `msm:world_setup` | A world type of empty sky with a sky biome of your own, survival on normal; add a start island for players to stand on. |
| Flat building world | `world_setup_flat_build` | `msm:world_setup` | A flat world type of grass on dirt in creative, with the time and weather standing still and no mobs. |
| Floating islands world | `world_setup_sky_islands` | `msm:world_setup` | A world type of floating islands over the overworld's biomes, survival on normal. |
| Adventure in the normal world | `world_setup_adventure` | `msm:world_setup` | No world type of its own: players start in adventure mode on hard, keep their things when they die and get a welcome. |
| One block in three phases | `msm_games_one_block_classic` | `msm:one_block` | One block at 0 64 0 that turns into the next block each time it is broken: plains, then underground with ores, then the Nether, with a chest and an animal now and then; after the last phase it starts again. |
| Red team | `msm_games_team_red` | `msm:team` | A team with red names and a [Red] tag before them; team mates cannot hurt each other and see each other when invisible. |
| Blue team | `msm_games_team_blue` | `msm:team` | A team with blue names and a [Blue] tag before them; team mates cannot hurt each other and see each other when invisible. |
| Points on the sidebar | `msm_games_objective_points` | `msm:objective` | A score shown on the right of the screen, changed only by commands and Rules (for goals, coins or rounds won), with gold numbers. |
| Player kills in the player list | `msm_games_objective_kills` | `msm:objective` | Counts how many players each player has defeated, shown beside the names in the player list (Tab). |
| Five-minute countdown | `msm_games_timer_countdown` | `msm:timer` | Counts down from five minutes on a red boss bar at the top of the screen, started by a Rules step or a function. |
| Stopwatch for a race | `msm_games_timer_stopwatch` | `msm:timer` | Counts the seconds up to an hour above the hotbar, for races and parkour; started by a Rules step or a function. |
| Arena | `msm_games_area_arena` | `msm:area` | A 32 by 16 by 32 box of the Overworld that knows when players walk in or out; add structures under Reset to rebuild it. |

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
| Wood set (Creator: Blocks) | `wood-set` | resource, data, mod | A whole kind of wood: log, wood, stripped log and wood, planks, stairs, slab, fence, fence gate, door, trapdoor, button, pressure plate, leaves and a sapling that grows its own tree, with recipes, tags, stripping, burning, door sounds of your choice or your own and, if you choose, growth in the world. |
| Stone set (Creator: Blocks) | `stone-set` | resource, data, mod | A new stone with its stairs, slab and wall and, if you choose, a button, pressure plate, polished stone, bricks and a pillar, with crafting and stonecutting recipes. |
| Crop (Creator: Blocks) | `crop` | resource, data, mod | A crop that grows in stages on farmland, planted from its own seeds or from its produce, with loot, composting, villager farming and, if you choose, wild patches. |
| Storage crate (Creator: Blocks) | `storage-crate` | resource, data, mod | A crate with a chest window of 1, 3 or 6 rows, keeping its contents when broken, joining into a double chest or different for every player if you choose, in a wood or stone look, with a crafting recipe and a closed and open front picture. |
| Machine (Creator: Blocks) | `machine` | resource, data, mod | A grinder-like machine with a power, a speed, up to three recipes of its own and the vanilla recipe types you choose, a crafting recipe and front, working-front, side and top pictures. |
| Copper set (Creator: Blocks) | `copper-set` | resource, data, mod | A metal that ages and can be waxed: block, cut block, slab, stairs, door, trapdoor and bars and, if you choose, a rod, button, pressure plate, fence, fence gate, wall and a chest that joins into a double chest, in four stages with waxed copies, honeycomb recipes and an ingot (Tin by default). |
| Cave plants (Creator: Blocks) | `cave-plants` | resource, data, mod | A plant of the caves: vines that hang from the ceiling with glowing berries, hang down or grow up in long strands, a water plant that grows up as kelp, or a lichen that spreads over any side of a block and glows. |
| Desert plants (Creator: Blocks) | `desert-plants` | resource, data, mod | A plant that grows tall: a cane by the water, a spiny cactus, a woody bamboo stalk with leaves, or a big leaf that tips when you stand on it, with the vanilla plant's uses if you like. |
| Flower pot (Creator: Blocks) | `flower-pot` | resource, data, mod | A flower pot of your own that takes the plants you pick, in the colour you like, with its recipe. |
| Lights (Creator: Blocks) | `lights` | resource, data, mod | A torch with its wall form, a lantern, a chain and a candle of one look, with recipes. |
| Bed (Creator: Blocks) | `bed` | resource, data, mod | A bed or a sleeping bag in one of sixteen colours, with a recipe. |
| Cake (Creator: Food) | `cake` | resource, data, mod | A cake or a pie eaten a slice at a time, with a flavour recipe. |
| Backpack (Creator: Gear) | `backpack` | resource, data, mod | A bag that holds one to six rows of items, with a recipe and an optional dyed copy. |
| Custom command (Creator: Scripts) | `custom-command` | resource, mod | A command such as `/heal` that heals, gives an effect or an item or launches the player. |
| Creative tab (Creator: Scripts) | `creative-tab` | resource, mod | A creative tab of your own with a first block in it. |
| Game rule (Creator: Scripts) | `game-rule` | resource, mod | A world setting of your own that is on or off or holds a number, set with `/gamerule` and saved with each world, and if you choose a rule that greets players while it is on and counts the greetings as a statistic. |
| Portal (Creator: Worlds) | `portal` | resource, data, mod | A portal block that players light in a frame and walk through to a new dimension, the Nether or the End and back, with its frame block, igniter, scale, colour, particles and sounds; a new dimension also gets a travel function for vanilla packs. Needs the Fabric mod jar. |
| Tree (Creator: Blocks) | `tree` | resource, data, mod | A sapling that grows a tree of its own, from a new log and leaves or vanilla ones, in the shape you pick, and if you choose growing in the world. |
| Food (Creator: Food) | `food` | resource, data, mod | A new food with its own name, colour, hunger and saturation, a texture and model, and an optional recipe. |
| Weapon (Creator: Gear) | `weapon` | resource, data, mod | One sword, spear, mace, bow, crossbow or shield with its own name, colour and stats, a texture and model, and an optional recipe. |
| Consumable (Creator: Food) | `consumable` | resource, data, mod | A food with effects, a potion-like drink or a charm that gives effects when used, with a texture, model and optional recipe. |
| Totem (Creator: Gear) | `totem` | resource, data, mod | An item that saves its holder from death like a totem of undying and gives the effects you choose, with a texture, model and optional recipe. |
| Throwable (Creator: Gear) | `throwable` | resource, data, mod | An item you throw: a ball, a knife you pick up again, a boomerang that comes back or a bomb, with its damage, speed, weight and what happens when it hits, a texture and model, and an optional recipe. |
| Status effect (Creator: Magic) | `status-effect` | resource, data, mod | A new status effect with its own name, colour and icon: what it does every few seconds, the stats it changes and how players get it (a drink or a throwable flask with an optional recipe, or a brewed potion). |
| Particle (Creator: Magic) | `particle` | resource, data, mod | A particle of your own: a spark, orb, puff or leaf in four frames in your colour, or your own picture, with its size, lifetime, movement, glow and fade, shown around a new block, sent by a new item when used, or made alone for `/particle`. |
| Potion (Creator: Magic) | `potion` | resource, data, mod | A new potion for the brewing stand: the effect it gives (a vanilla one or a new one with its icon), how long and how strong, the ingredient that brews it, longer and stronger versions, and splash and lingering bottles with tipped arrows. |
| Enchantment (Creator: Gear) | `enchantment` | data | A new enchantment: what it goes on, its highest level, how rare it is and what it does, offered at the enchanting table. |
| Painting (Creator: Blocks) | `painting` | resource, data | A new painting with its title, author, size and your own picture (or a placeholder landscape), in the `minecraft:placeable` tag. |
| Banner pattern (Creator: Blocks) | `banner-pattern` | resource, data | A new banner pattern for the loom: its shape on banners and shields, and the pattern item made from paper that offers it. Works in vanilla packs. |
| Armour trim (Creator: Gear) | `armour-trim` | resource, data | A new armour trim: how it looks on worn armour in every trim material, the smithing template that applies it and the recipe that copies the template. Works in vanilla packs. |
| Glider (Creator: Gear) | `glider` | resource, data | Wings to wear on your chest and glide with, as an elytra does: how they look worn and held, how long they last, the recipe and the repair item. Works in vanilla packs. |
| Pot pattern (Creator: Blocks) | `pot-pattern` | resource, data | A new picture for decorated pots and the sherd that puts it on a pot. Works in vanilla packs. |
| Music disc (Creator: Blocks) | `music-disc-item` | resource, data, mod | A new jukebox song and a music disc that plays it: a real disc item in the Fabric mod jar, or music disc 13 with a new look in vanilla packs. |
| Villager trade (Creator: Worlds) | `villager-trade` | data | A new trade for a vanilla villager or the wandering trader: what it costs, what it gives and which profession and level offer it. A candidate among the villager's trades, not a certainty. |
| Extra drop (Creator: Worlds) | `extra-drop` | mod | An extra item in the loot of a vanilla mob, block or chest, with a count, a chance and, for mobs, whether a player must make the kill. The vanilla drops stay. |
| Mob skin (Creator: Mobs) | `mob-skin` | resource, data | A new skin for a vanilla wolf, cat, pig, cow, chicken or frog, with placeholder textures of the right size to paint over, appearing in a biome you choose or everywhere. |
| Goat horn (Creator: Gear) | `goat-horn` | resource, data | A new goat horn call: its name, a vanilla sound or your own `.ogg`, how long it plays and how far it is heard, a recipe and, if you choose, goats dropping it. |
| Dimension (Creator: Worlds) | `dimension` | resource, data, mod | A new dimension to explore: pick the terrain, the biome and the sky, and travel there and back with a key item or a portal (Fabric mod jar) or a command (vanilla packs). |
| Islands (Creator: Worlds) | `world-islands` | resource, data | A World Type of islands in the sea: how big they are, how much sea lies between them, what grows on them and how many trees. Its land is MSM's own recipe, so the live map draws it without your Minecraft files. Choose it under **More > World Type** when creating a world. |
| Tall mountains (Creator: Worlds) | `world-mountains` | resource, data | A World Type of tall mountains: how tall, how jagged, where the snow starts and what grows on them. Its land is MSM's own recipe, so the live map draws it without your Minecraft files. |
| One biome everywhere (Creator: Worlds) | `world-one-biome` | resource, data | A World Type that is one biome everywhere, over gentle hills, flat land or land like the overworld. |
| Caves only (Creator: Worlds) | `world-caves` | resource, data | A World Type that is all caves: a roof or an open top, the rock, lakes of water or lava, and what glows. It has its own dimension type without daylight under the roof. |
| Empty sky with a start island (Creator: Worlds) | `world-empty-sky` | resource, data | A World Type of empty sky, for a Skyblock: the biome of the sky. It makes the empty world only; the Skyblock flow, under Games, makes the start island, its chest and what you start with. |
| Recipe pack | `recipe_pack` | data | Shaped, shapeless, smelting, blasting and stonecutting recipes, an item tag used as an ingredient, a crafting advancement and a load message. |
| Custom music disc | `music_disc` | resource, data | A jukebox song, its sound event, a disc model and texture, and a `give_disc` function. |
| Functions | `function_starter` | data | `load` and `tick` functions wired to `#minecraft:load` and `#minecraft:tick`, a jump scoreboard, a `greet` function and a function tag of your own. |
| Custom biome | `custom_biome` | resource, data | The Amber Woods biome with its own tree and copper ore, and a World Type of its own that lists it beside a few vanilla biomes (**More → World Type** when creating a world). |
| Jigsaw village-style structure | `jigsaw_structure` | data | A small hamlet built by jigsaw blocks: a centre hut, streets that follow the terrain and lamp posts, with four template pools, a structure set and a biome tag that places it in forests. |
| Custom biome with a jigsaw structure | `worldgen_pack` | resource, data | Both worldgen starters in one project: Amber Woods and its World Type, and hamlets that generate in Amber Woods and in every vanilla forest. |
| Custom mob (Creator: Mobs) | `custom_mob` | resource, data, mod | An animated Ruby Golem that wanders forests, fights back when hit, drops emeralds and bursts into sparks when it dies: its GeckoLib model, idle, walk and attack animations, skin, spawn egg, loot table, a death function and the mod metadata. |
| Pet (Creator: Mobs) | `pet` | resource, mod | An animal you tame with a food that sits when told, follows and defends you and has babies, with a model of your choice, variants and a spawn egg. |
| Farm animal (Creator: Mobs) | `farm-animal` | resource, data, mod | An animal you breed with a food, with babies of the size you choose, drops (cooked when it burns) and, if you choose, a saddle. |
| Mount (Creator: Mobs) | `mount` | resource, data, mod | A mob you ride and steer, with or without a saddle, on the ground or in the air. |
| Flying mob (Creator: Mobs) | `flying-mob` | resource, mod | A mob that flies and hovers: peaceful, neutral, hostile or shooting a projectile at players. |
| Water mob (Creator: Mobs) | `water-mob` | resource, mod | A fish, a dolphin-like swimmer or an amphibian. |
| Boss (Creator: Mobs) | `boss` | resource, data, mod | A large monster with a boss bar that darkens the sky, melee or ranged attacks and drops. |
| Wandering merchant (Creator: Mobs) | `wandering-merchant` | resource, data, mod | A mob that trades with you: up to three wares for emeralds, optionally the wandering trader's wares at levels 2 and 3, restocking twice a day or never, with a model, skin and spawn egg. |
| Village job (Creator: Worlds) | `village-job` | resource, data, mod | A new job for villagers: the workbench block, the apron villagers and zombie villagers wear, what it buys and sells and, if you choose, the trades of a vanilla job at every level. |
| Villager look (Creator: Worlds) | `villager-look` | resource, mod | A new look for villagers and zombie villagers of the biomes you pick: clothes in your colours, drawn over the villager where the game reads them. It brings no trades of its own. |
| Fluid (Creator: Blocks) | `fluid` | resource, data, mod | A new liquid with its bucket: water-like, lava-like or neither, its colour and pictures, how fast and far it flows, what happens to someone in it and, if you choose, lakes of it in the world. |
| Car (Creator: Vehicles) | `vehicle-car` | resource, data, mod | A car to drive on the ground, with one to four seats, a horn, a boot, exhaust smoke and, if you choose, fuel: its boxed model, texture in your colour, paints, item picture and crafting recipe. |
| Tank (Creator: Vehicles) | `vehicle-tank` | resource, data, mod | A slow, tough tank that turns on the spot, with a turret that follows your view and a cannon firing exploding shells, which can need loading: its boxed model, texture in your colour, paints, item picture, the shell and crafting recipes. |
| Plane (Creator: Vehicles) | `vehicle-plane` | resource, data, mod | A biplane that takes off when it is fast enough and flies where you look, with one or two seats and fuel: its boxed model, texture in your colour, paints, item picture and crafting recipe. |
| Boat (Creator: Vehicles) | `vehicle-boat` | resource, data, mod | A motorboat that floats on water, with two to four seats, an engine or paddle sound, a horn and, if you choose, fuel: its boxed model, texture in your colour, paints, item picture and crafting recipe. |
| Skyblock (Creator: Games) | `skyblock` | resource, data | A game in a world of empty sky: a World Type of your own where players start on a small island with a chest (a lava bucket and ice for a cobblestone generator, seeds, a sapling and bone meal), placed when the first player joins, with extra wandering trader trades, recipes for sand and gravel, and goals. Works in a vanilla data pack. |
| One block (Creator: Games) | `one-block` | resource, data | A game on one magic block that turns into the next block each time it is broken, phase after phase (plains, underground, the deep dark, the Nether, the ocean, the End), with a chest and a mob now and then, in an empty sky or high above your world. Works in a vanilla data pack. |
| Sky islands (Creator: Games) | `sky-islands` | resource, data | A World Type of islands floating over the void, of the overworld's biomes or of one biome, with a start island where players begin. Works in a vanilla data pack. |
| Lucky block (Creator: Games) | `lucky-block` | resource, data, mod | A block of your own that does something random when broken: prizes from a loot table, a mob, an explosion, a small building or an effect, each as often as you choose, made with a Rule book. Needs the Fabric mod jar. |
| Adventure map (Creator: Games) | `adventure-map` | data | The start of an adventure map: adventure mode with a welcome message or screen, the game rules you pick set when the world starts, checkpoints that set where players respawn, and goals that mark the way. Build the map in the game. Works in a vanilla data pack. |
| Arena game (Creator: Games) | `arena-game` | data | Two to four teams fighting rounds in an arena, with defeats on the sidebar, a round timer on the boss bar and the arena rebuilt for each round, started with a function. Works in a vanilla data pack. |
| Race (Creator: Games) | `race` | data | A race from a start through checkpoints to a finish, timed on the action bar, with the best times on the sidebar. Works in a vanilla data pack. |
| Goals (Creator: Games) | `goals` | resource, data | A tab of goals in the advancements screen: get an item, craft something, defeat a mob, visit a place or reach a height, with a flag, a timer or an item on the tab. Works in a vanilla data pack. |
| Scripted ore | `scripted_ore` | resource, data, mod | The Custom ore starter with three scripts: sneak-using ruby ore gives a bonus ruby, standing on a block of ruby heals you through a `run_script` action, and joining players are greeted. |
| Scripted behaviour (Creator: Scripts) | `scripted-item` | resource, mod | An item that runs a script when used: it heals you, launches you upward, strikes lightning where you look or gives you an effect. The script opens in the Script Studio. |

Five starters need a word of explanation (and every starter with mod content needs the Fabric mod jar, as Custom ore does):

- **Custom ore needs the Fabric mod jar.** Its ore, ruby and Block of Ruby are new blocks and items (`msm:block`, `msm:item`), which a resource or data pack cannot add. Export the **Fabric mod jar** and install it with Fabric Loader and Fabric API; the jar carries the `msm_runtime` mod inside unless you choose a separate runtime. The resource and data pack exports still work but hold only the models, textures, names, loot tables, tags, recipes and advancements, which do nothing without the blocks and items. Nothing in the `minecraft` namespace is changed: emerald ore stays emerald ore.
- **Custom mob and the other mob starters need the Fabric mod jar.** The Ruby Golem is a new mob (`msm:entity`), drawn from its model (`msm:geo_model`) and animations (`msm:animation`) by GeckoLib on 26.3 or by the runtime's built-in renderer on the 26.4 snapshot (all mob starters offer both versions). Export the **Fabric mod jar**: it nests `msm_runtime` and, for GeckoLib mobs, GeckoLib, which MCSuperMods downloads once (see [Entities and models](entities-and-models.md#export-the-mod-jar-and-the-renderer)). Replace the placeholder skin by importing a Blockbench model of your own and choosing it in the Entity Studio.
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

The plant and storage examples show the types of [Growing and climbing plants](block-types-and-plants.md#growing-and-climbing-plants) and the storage options of [Containers and machines](containers-and-machines.md): **Ember vines with glowing berries**, **Sea ribbon** (kelp-like), **Glow moss** (lichen-like), **Dune reed** (cane), **Spine cactus**, **Reed bamboo**, **Wide leaf** (a big and a small dripleaf), **Clay planter** (a pot of its own), **Bronze fittings that age** (the six new ageing types and a chest), **Twin crate** (a double chest) and **Private crate** (a chest for every player). **Rules for vanilla blocks** shows the element of [Rules for vanilla blocks](adding-to-vanilla.md#rules-for-vanilla-blocks).

The entity examples and the mob starters use `msm:entity`, `msm:geo_model` and `msm:animation`, which also need the Fabric mod jar (with GeckoLib on 26.3 for mobs that use it). Each entity example is a complete mob with its model, animations, skin and, when it has one, spawn egg texture:

- **Wandering creature** shows the basics: a peaceful mob with wander and look goals and a spawn egg.
- **Hostile mob** shows `melee_attack` with `targets`, `msm:attack` whose `on_attack` event uses `play_animation`, and the spawn rule `monster`.
- **Natural spawning** shows `spawn` with a biome tag (`#`) and a biome id together.
- **Tameable fox-like pet** shows `msm:tameable` and `msm:breedable` on the `animal` base, with a snowy variant by biome.
- **Rideable flying mount** shows `msm:rideable` with a saddle on a mob that flies.
- **Archer with a throwable** shows `msm:ranged_attack` shooting a project item with `msm:throwable`.
- **Fish school with biome variants** shows swimming, `msm:variants` by biome and the water spawn rule.
- **Boss with a boss bar** shows `msm:boss_bar` with its colour, style and sky effects.
- **Drawn without GeckoLib** shows `renderer: vanilla`, a mob the built-in renderer draws on every target.

The script examples use `msm:script`, which runs only in the Fabric mod jar (see [Scripting](scripting.md)):

- **Script: block interaction** shows `msm.events.on("block.interact", ...)` with `e.cancel()` and `e.player.give(...)`.
- **Script: scheduled effects** shows `msm.schedule`: each step of the spiral schedules the next one.
- **Script: action handler** shows how a block event calls a script: the Chime Block's use event has a `run_script` action, and the script defines that handler with `msm.actions.define`.

### Popular ideas

The **Popular ideas** category holds seventeen complete little mods of the kinds people make most, picked from the most downloaded mods and data packs and the order beginner tutorials follow. Each one ends with the theme it is inspired by; the names are MSM's own. They need the **Fabric mod jar** export.

- **Glowshard: a whole first mod** is the tutorial route in one project: an ore that generates and glows, a tool and armour tier, an armour trim material and an advancement tab.
- **Ember drake** (a tameable flying mount that shoots fireballs), **Cottage furniture** (shaped blocks and a crate; there are no seats yet, so you cannot sit on the stool), **Camp stove** (a machine that cooks stews), **Sunken crypt** (a buried structure with loot crates, a mini-boss, a key and a vault door) and **Amber realm** (a portal to a dimension with its own biome, ore and creature) are built from the Creator flows with answers of their own.
- **Pull charm**, **Returning boomerang**, **Rocket boots**, **Orchard tree**, **Spell scrolls** and **Coordinates bar** add their behaviour with [Rules](rules.md); **Paper glider** is the vanilla `glider` component passed through `msm:components`.
- **Go-kart**, **Mini tank** and **Patchwork biplane** are interim vehicles: rideable mobs with no AI and a short script for picking up, firing or fuel, until MSM has a vehicle kind. A script cannot ask what a player rides, so they count a vehicle right under the player as theirs.
- **Willow boats** is a willow Wood set with a boat and a chest boat of its own wood, paddled as vanilla boats and crafted from willow planks ([Boats](boats.md)).

Two wishes from the research are simplified: the Orchard tree's pie is eaten whole (the **Cake** flow and the Orchard and pie example make a pie eaten a slice at a time), and the Coordinates bar shows your position and the time but not the direction you face (Rules have no reading of where a player looks).

### All examples

There is one example for each of the 124 element kinds (the six games kinds under **Game kits**), the behaviour examples (blocks and items: a tool, an event chain, a fuel log, a life-steal sword and a night-vision helmet; block types: a wood set, a stone set, a crop, a tree, a machine-like block and a vault door; growing plants and pots: ember vines with glowing berries, a sea ribbon, glow moss, a dune reed, a spine cactus, reed bamboo, a wide leaf and a clay planter; containers and machines: a loot crate in a structure, an ore crusher, a shulker crate, bronze fittings that age, a twin crate and a private crate; portals: a two-way sky portal; particles: a firefly jar; a potion brewed with your own item; entities: a hostile mob, natural spawning, a tameable pet, a rideable flying mount, an archer with a throwable, a fish school with variants, a boss with a boss bar and a mob drawn without GeckoLib; villagers: a roadside merchant with trades of its own and a fair trader who remembers you; mobs 2: a minnow you catch in a bucket, a hovering wisp that roosts and a finch that fetches and rides your shoulder; fluids 2: berry juice with a cauldron, a bottle and mixing; enchantments: frost boots that freeze water as Frost Walker does; vehicles: a seaside; scripts: scheduled effects, an action handler, a scripted effect, a kill counter, a full set bonus, a teleport staff and a boss fight bar; rules: a guard mob), seventeen **Popular ideas** (below), eight **Games**, one from each game flow (Cloud Farm, Deep Block, Blossom Isles, Star Block, Crystal Road, Four Kingdoms, Canyon Dash and Explorer), plus four themed starters listed again under **Starters**: 215 in all. The three worldgen starters, the Custom mob and Scripted ore starters and the starters added with the Creator (Custom sword, Gear set, Simple block, Food, Weapon, Consumable, Totem, Enchantment, Painting, Banner pattern, Armour trim, Glider, Pot pattern, Music disc, Scripted behaviour, Dimension, Status effect, Potion, Throwable, Villager trade, Extra drop, Mob skin, Goat horn, Pet, Farm animal, Mount, Flying mob, Water mob, Boss, Storage crate, Machine, Cave plants, Desert plants, Flower pot, Portal, Particle, Car, Tank, Plane, Boat, Wandering merchant, Village job, Villager look, Game rule, Fluid and the others) have no gallery entry; create them with **New from starter…** or open their folders under `examples/starters/`.

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
| Blue flame | `example_particle` | Particles | `minecraft:particle` | Gives vanilla's flame particle a blue picture of the project's own, in a plain resource pack. |
| Drifting ember | `example_msm_particle` | Particles | `msm:particle` | A particle type of its own: a small amber spark that twinkles, glows in the dark, floats up and fades out. Try it with /particle. |
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
| Trial spawner wave | `example_trial_spawner` | Mob variants | `minecraft:trial_spawner` | A trial spawner configuration that sends husks and baby zombies, with its own rewards. |
| Enchantment provider | `example_enchantment_provider` | Enchantments | `minecraft:enchantment_provider` | A rule that enchants gear like a level 5 to 20 enchanting table. |
| Timeline: slime moons | `example_timeline` | Time | `minecraft:timeline` | A timeline that doubles the surface slime chance every other day, added to the overworld timelines. |
| World clock | `example_world_clock` | Time | `minecraft:world_clock` | A clock of its own that timelines and dimension types can follow. |
| Pot pattern | `example_decorated_pot_pattern` | Decorations | `minecraft:decorated_pot_pattern` | A fish picture for the sides of decorated pots, drawn on fired clay. |
| Block transformer | `example_block_transformer` | Tools | `minecraft:block_transformer` | A rule that turns coarse dirt into a dirt path, as a shovel flattens grass. |
| Test environment | `example_test_environment` | Game tests | `minecraft:test_environment` | Rainy weather on hard difficulty, for game tests that name it. |
| Test instance | `example_test_instance` | Game tests | `minecraft:test_instance` | A game test that places a structure and waits for a test block to pass. |
| Sulfur cube kind | `example_sulfur_cube_archetype` | Mob variants | `minecraft:sulfur_cube_archetype` | A sulfur cube that turns hot when fed magma cream. |
| Whole-number provider | `example_context_int_provider` | Numbers the game reads | `minecraft:context_int_provider` | A named whole number the game can read: a random value from 2 to 4. |
| Decimal-number provider | `example_context_float_provider` | Numbers the game reads | `minecraft:context_float_provider` | A named decimal number the game can read: always one and a half. |
| Screen effect | `example_post_effect` | Shaders | `minecraft:post_effect` | A warm sepia tint over the whole screen, from the vanilla copy shader. |
| Waypoint style | `example_waypoint_style` | Locator bar | `minecraft:waypoint_style` | A locator bar dot that shrinks over a long way. |
| Shader program | `example_shader` | Shaders | `minecraft:shader` | A shader program definition naming the vanilla textured shaders. |
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
| Coral Isles | `example_world_coral_isles` | Worlds | `minecraft:worldgen/world_preset` | Small islands far apart in a wide sea, with many trees: jungle and savanna, from the Islands flow. |
| Frost Peaks | `example_world_frost_peaks` | Worlds | `minecraft:worldgen/world_preset` | Jagged mountains as tall as the world allows, snowy from low down, with snowy pine woods and bare stone, from the Tall mountains flow. |
| Endless Blossom | `example_world_endless_blossom` | Worlds | `minecraft:worldgen/world_preset` | A whole world of cherry grove over gentle hills and lakes, from the One biome everywhere flow. |
| Ember Caverns | `example_world_ember_caverns` | Worlds | `minecraft:worldgen/world_preset` | Deepslate caves under a roof of rock, with lava lakes at the bottom and shroomlight glowing on the cave roofs, from the Caves only flow. |
| Cloud Realm | `example_world_cloud_realm` | Worlds | `minecraft:worldgen/world_preset` | An empty sky that is all cherry grove, for a Skyblock, from the Empty sky with a start island flow; the start island comes with Skyblock. |
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
| Ember vines with glowing berries | `example_msm_ember_vines` | Blocks | `msm:block` | Vines that hang from cave ceilings and bear glowing berries you pick and eat, as cave vines, from the Cave plants flow. |
| Sea ribbon | `example_msm_sea_ribbon` | Blocks | `msm:block` | A water plant that grows up from the sea floor a block at a time, as kelp, from the Cave plants flow. |
| Glow moss | `example_msm_glow_moss` | Blocks | `msm:block` | A thin moss that covers any side of a block, glows softly and spreads with bone meal, as glow lichen, from the Cave plants flow. |
| Dune reed | `example_msm_dune_reed` | Blocks | `msm:block` | A reed that grows tall by water on sand and grass and makes sugar, as sugar cane, from the Desert plants flow. |
| Spine cactus | `example_msm_spine_cactus` | Blocks | `msm:block` | A tall spiny cactus that grows twice as high as vanilla cactus, hurts what touches it and smelts into green dye, from the Desert plants flow. |
| Reed bamboo | `example_msm_reed_bamboo` | Blocks | `msm:block` | A woody stalk that grows from a shoot, carries leaves near its top and makes sticks, as bamboo, from the Desert plants flow. |
| Wide leaf | `example_msm_wide_leaf` | Blocks | `msm:block` | A big leaf on a stem that tips under you, and a small one that bone meal grows into it, as big and small dripleaf, from the Desert plants flow. |
| Clay planter | `example_msm_clay_planter` | Blocks | `msm:block` | A flower pot of its own that takes six vanilla flowers and saplings, crafted from clay, from the Flower pot flow. |
| Bronze fittings that age | `example_msm_bronze_fittings` | Blocks | `msm:block` | A rod, a button, a pressure plate, a fence, a gate, a wall and a chest that joins into a double chest, all of a bronze that turns green as copper does, with waxed copies, from the Copper set flow. Lightning scrapes them back. |
| Loot crate in a structure | `example_msm_loot_crate` | Blocks | `msm:block` | A stone crate with a chest screen, placed in a small room by a structure template that gives it a loot table, so it fills on the first open as a dungeon chest does. |
| Ore crusher | `example_msm_ore_crusher` | Blocks | `msm:block` | A machine from the Machine flow that crushes raw iron, gold and copper into two ingots each, burning fuel, with a hopper chain that feeds it and empties it into a chest. |
| Shulker crate | `example_msm_shulker_crate` | Blocks | `msm:block` | A crate that keeps its 27 slots of items when broken and carries them in its item, as a shulker box does, from the Storage crate flow. |
| Twin crate | `example_msm_twin_crate` | Blocks | `msm:block` | A wooden crate that joins a crate beside it into one double chest of 54 slots, as vanilla chests do, from the Storage crate flow. |
| Private crate | `example_msm_private_crate` | Blocks | `msm:block` | A stone crate in which every player finds their own items, as an ender chest, from the Storage crate flow. |
| Firefly jar | `example_msm_firefly_jar` | Blocks | `msm:block` | A glowing firefly particle of its own, a glass jar that shows it by itself (ambient particles) and a spark wand that sends a burst of fireflies upwards (motion) with a cloud of coloured dust (an options object). |
| Two-way sky portal | `example_msm_sky_portal` | Blocks | `msm:block` | A portal from the Portal flow to a flat sky dimension and back, in a frame of its own block, lit with flint and steel or by using a beacon block (the **Light a portal** action), with blue dust and an `On travel` function that says a line. |
| Life-steal sword | `example_msm_life_steal_sword` | Items | `msm:item` | An iron sword that heals you by one heart each time it hits a mob. |
| Night-vision helmet | `example_msm_night_vision_helmet` | Items | `msm:item` | An iron helmet that gives night vision while you wear it. |
| Brewed with your own item | `example_msm_brewed_with_own_item` | Potions | `msm:potion` | A Moon Shard item of your own as a brewing ingredient: an awkward potion and a moon shard brew a Potion of Levitation, which vanilla does not have, with a stronger version. |
| Wandering creature | `example_msm_entity` | Entities | `msm:entity` | A peaceful mob that strolls about, looks at players and has a spawn egg, with its model, animations and textures. |
| Cube creature model | `example_msm_geo_model` | Entity models | `msm:geo_model` | A box-shaped GeckoLib model with a body and a head bone over a 64x64 texture, shown on a small mob. |
| Idle and walk animations | `example_msm_animation` | Entity animations | `msm:animation` | An idle bob and a walk cycle that swings the arms and legs of a biped model, shown on a small mob. |
| Hostile mob | `example_msm_hostile_mob` | Entities | `msm:entity` | A monster that chases and hits players, fights back when hurt and spawns in the dark. |
| Tameable fox-like pet | `example_msm_tameable_pet` | Entities | `msm:entity` | A fox-like animal you tame with sweet berries: it sits when told, follows and defends you, has babies and grows a white coat in snowy biomes. |
| Rideable flying mount | `example_msm_flying_mount` | Entities | `msm:entity` | A big round flyer you saddle and ride through the air: it flies where you look and rises while you hold jump. |
| Archer with a throwable | `example_msm_throwing_archer` | Entities | `msm:entity` | A skeleton-like monster that circles players and throws ice shards, a project item with `msm:throwable`, from a distance. |
| Fish school with biome variants | `example_msm_fish_school` | Entities | `msm:entity` | A fish that swims in schools in every ocean, orange in warm oceans and pale in cold ones, and flops and dries out on land. |
| Boss with a boss bar | `example_msm_boss_bar` | Entities | `msm:entity` | A giant monster with a red boss bar that darkens the sky and fogs the world, summoned only from its spawn egg. |
| Drawn without GeckoLib | `example_msm_vanilla_renderer` | Entities | `msm:entity` | A small creature drawn by the runtime's own renderer, never GeckoLib, so it needs no GeckoLib on any target. |
| Natural spawning | `example_msm_natural_spawn` | Entities | `msm:entity` | A creature that spawns on its own in forests and plains, using a biome tag and a biome id. |
| Script: block interaction | `example_msm_script` | Scripts | `msm:script` | A script that cancels using a lodestone with an empty hand and gives the player a compass instead. |
| Script: scheduled effects | `example_msm_script_schedule` | Scripts | `msm:script` | A script that turns using an amethyst shard into a rising spiral of particles over two seconds, one `msm.schedule` step after another. |
| Script: action handler | `example_msm_script_action` | Scripts | `msm:script` | A chime block whose use event runs a script through a `run_script` action, and the script that defines that handler. |
| Script: scripted effect | `example_msm_scripted_effect` | Scripts | `msm:effect` | An Antidote status effect whose tick event runs a script: it cures poison and heals more at higher levels. |
| Script: kill counter | `example_msm_kill_counter` | Scripts | `msm:script` | A script that counts each player's kills in saved player data and the world's total in `msm.storage`, and tells players their count when they join. |
| Script: full set bonus | `example_msm_full_set_bonus` | Scripts | `msm:script` | A script that checks the armour of every player once a second and gives Haste and Luck to those wearing a full set of golden armour. |
| Script: teleport staff | `example_msm_teleport_staff` | Scripts | `msm:script` | A script that turns a breeze rod into a teleport staff: use it to blink to the block you look at, sneak-use it to mark home or, from another dimension, to go home. |
| Script: boss fight bar | `example_msm_boss_fight_bar` | Scripts | `msm:script` | A script that summons a ravager boss with a nether star and shows its health on a boss bar to every player, with a title and a reward when it falls. |
| Rules: a lucky block | `example_msm_rules` | Rules | `msm:rules` | A lucky block and a lucky coin made with rules, no code: breaking the block is a gamble between a few coins and a silverfish, a counter keeps score, and spending a coin gives Luck. |
| Vehicles: a tank battle | `example_msm_vehicle` | Vehicles | `msm:vehicle` | A drivable tank with a turret that follows your view, a cannon, a shell crate and a reload line on the screen. |
| Controls: a dash ability | `example_msm_key_bind` | Controls and HUD | `msm:key_bind` | A key (Z by default, shown in Controls) that dashes the player forward once a second, with a charge bar on screen. |
| Controls: a score and a mana bar | `example_msm_hud` | Controls and HUD | `msm:hud` | Two HUD elements: a mana bar above the hotbar and a score line in the top-right corner, both read from the game. |
| Rules: a guard mob | `example_msm_rules_guard_mob` | Rules | `msm:rules` | A guard made with rules, no code: every five seconds it lights up each player within 12 blocks and warns them, and it calls out when hurt. |
| Vehicles: a seaside | `example_vehicles_seaside` | Vehicles | `msm:vehicle` | A motorboat with a horn, a four-seat raft with a crate and a dock block to tie them up at. |
| Command: /welcome | `example_msm_command` | Commands | `msm:command` | A server command anyone can type, `/welcome` (or `/hi`), that plays a chime and answers in chat, with no function. |
| Game rule: Sparkle trails | `example_msm_game_rule` | Commands | `msm:game_rule` | A world setting of your own, on in a new world, that a rule reads to decide whether sneaking players leave sparkles; switch it off with /gamerule. |
| Statistic: Bells rung | `example_msm_stat` | Commands | `msm:stat` | A count of your own in the Statistics screen: how many times each player has rung a bell, kept by a rule. |
| Creative tab: Curios | `example_msm_creative_tab` | Items | `msm:creative_tab` | A tab of its own in the creative inventory with a curio block in it, listed by name. |
| Cottage furniture and lights | `example_msm_cottage_furniture` | Blocks | `msm:block` | A straw bed, a lantern, a torch, a standing and a hanging sign, a potted plant, a rug and a cupboard that holds items. |
| Orchard and pie | `example_msm_orchard_pie` | Blocks | `msm:block` | A berry bush that ripens in four stages, a tall flower two blocks high and a pie eaten slice by slice, crafted from the berries. |
| Copper roof | `example_msm_copper_roof` | Blocks | `msm:block` | Roof stairs and slabs that age through four stages like copper, with waxed copies that keep their colour. |
| Adventurer's satchel | `example_msm_adventurers_satchel` | Items | `msm:item` | A satchel that holds two rows of items, a roll that works like a bundle and a creative tab for them, with recipes. |
| Server helper | `example_msm_server_helper` | Commands | `msm:command` | `/helpme` for everyone, `/hub` to jump to a lobby and `/boost` with a number for operators, with a rule book that points new players at `/helpme`. |
| Village blacksmith job | `example_msm_villager_profession` | Villagers | `msm:villager_profession` | A blacksmith job for villagers: a villager takes it at a forge block, wears a leather apron and trades coal, iron and a toolsmith's wares as it levels up ([Villagers, traders and pets that carry things](villagers-and-traders.md)). |
| Villager look: Blossom villagers | `example_msm_villager_type` | Villagers | `msm:villager_type` | Villagers born or spawned in cherry groves wear pink clothes with a cream hem and sash, and so do zombie villagers there. |
| Oil well | `example_msm_fluid` | Fluids | `msm:fluid` | Oil: a thick dark liquid that flows slowly and never refills, slows down whoever wades in, comes in a bucket and lies in lakes in deserts ([Fluids](fluids.md)). |
| Berry juice | `example_msm_berry_juice` | Blocks | `msm:fluid` | A pink juice you pour into cauldrons and scoop into bottles that feed and heal you, which sets into pink terracotta where lava touches it. |
| Frost boots enchantment | `example_msm_frost_boots` | Enchantments | `minecraft:enchantment` | A boots enchantment that freezes water under the wearer, as Frost Walker does. |
| Rules for vanilla blocks | `example_msm_vanilla_block_rules` | Blocks | `msm:vanilla_block_rules` | An axe scrapes the moss off mossy cobblestone and stone bricks, a shovel packs mud, a hoe turns a moss block into dirt, and huge mushroom blocks catch fire, all for vanilla blocks. |
| Roadside merchant | `example_msm_roadside_merchant` | Entities | `msm:entity` | A merchant by the road who sells bread and apples, then saddles and leads once you have traded with it, and rings a bell with every sale. |
| Minnow you catch in a bucket | `example_msm_bucket_minnow` | Entities | `msm:entity` | A little river fish you catch with a water bucket and let out again, which plays dead when badly hurt. |
| Hovering wisp that roosts | `example_msm_hovering_wisp` | Entities | `msm:entity` | A gentle wisp that floats four blocks above the ground at night and hangs under a block through the day, as a bat. |
| Finch that fetches and rides your shoulder | `example_msm_fetching_finch` | Entities | `msm:entity` | A small bird you tame with seeds: give it an item and it brings you more of the same, and it rides on your left shoulder, leaving the right one for another pet. |
| Fair trader who remembers you | `example_msm_fair_trader` | Entities | `msm:entity` | A travelling trader whose prices drop for players who trade with it or bring it flowers and rise for those who hit it, who restocks at a barrel and barters for gold. |
| Glowshard: a whole first mod | `example_popular_glowshard` | Popular ideas | `msm:item` | A glowing ore that generates in caves and drops shards, a block of glowshard, a sword, pickaxe, axe, shovel and hoe, a full suit of armour, an armour trim material and an advancement tab: the beginner route in one project. Inspired by: ore, tool and armour progression. |
| Ember drake | `example_popular_ember_drake` | Popular ideas | `msm:entity` | A drake hatched from its spawn egg, tamed with raw meat, saddled and flown by its owner, that shoots fireballs at monsters and at anything that hurts it. Inspired by: dragon mounts and pets. |
| Cottage furniture | `example_popular_cottage_furniture` | Popular ideas | `msm:block` | A table, a stool and a lamp with shapes of their own, and a wooden crate that holds items, all crafted from planks. You cannot sit on the stool: MSM has no seats yet. Inspired by: furniture and decoration. |
| Camp stove | `example_popular_camp_stove` | Popular ideas | `msm:block` | A stove that burns fuel and cooks a mushroom, a carrot or a pumpkin into hearty stews that leave a bowl. Inspired by: cooking and food. |
| Pull charm | `example_popular_pull_charm` | Popular ideas | `msm:rules` | A charm that, held in the off hand, pulls dropped items and experience within 8 blocks to you, made with rules and a Run a command step. Inspired by: item magnets. |
| Sunken crypt | `example_popular_sunken_crypt` | Popular ideas | `minecraft:worldgen/structure` | An underground crypt in gloomy forests and swamps, with loot crates, a Crypt Warden mini-boss with a boss bar who drops the Crypt Key, and a vault door that only the key opens. Inspired by: dungeons, loot and boss fights. |
| Amber realm | `example_popular_amber_realm` | Popular ideas | `minecraft:dimension` | A warm dimension through an amber-framed portal, filled with its own biome, with an amber ore that generates only there and an Amber Beetle that lives only there. Inspired by: new dimensions. |
| Returning boomerang | `example_popular_boomerang` | Popular ideas | `msm:item` | A boomerang that comes back to your inventory after each throw, slows and lights up the mob it hits and clatters on blocks. Inspired by: throwing weapons. |
| Paper glider | `example_popular_paper_glider` | Popular ideas | `msm:item` | A paper glider worn like an elytra, made from the vanilla glider and equippable components. Inspired by: gliders and flight. |
| Rocket boots | `example_popular_rocket_boots` | Popular ideas | `msm:item` | Iron boots that launch you upwards while you sneak, with flames and a soft landing, made with a rule. Inspired by: movement gear. |
| Orchard tree | `example_popular_orchard_tree` | Popular ideas | `msm:block` | A plum tree that grows from a sapling and in forests, whose leaves drop ripe plums now and then, and a plum pie (eaten whole: placed pies eaten in slices need a block type MSM lacks). Inspired by: farming and food. |
| Spell scrolls | `example_popular_spell_scrolls` | Popular ideas | `msm:rules` | Four one-use scrolls made with rules: Mending heals, Blinking teleports you where you look, Storms calls lightning and Frost slows the mobs around you. Inspired by: magic and spells. |
| Coordinates bar | `example_popular_coordinates_bar` | Popular ideas | `msm:rules` | Your position and the time of day above the hotbar while you hold a compass, made with one rule. Inspired by: heads-up displays. |
| Go-kart | `example_popular_go_kart` | Popular ideas | `msm:entity` | A two-seat kart you place from its item, drive with W, A, S and D, honk with a horn and pick up again by sneaking and using it. An interim vehicle: a rideable mob with a script, until MSM has a vehicle kind. Inspired by: cars and karts. |
| Mini tank | `example_popular_mini_tank` | Popular ideas | `msm:entity` | A slow armoured tank whose Firing Lever shoots an explosive shell where the driver looks, repaired with iron ingots. An interim vehicle: a rideable mob with a script, until MSM has a vehicle kind. Inspired by: tanks. |
| Patchwork biplane | `example_popular_biplane` | Popular ideas | `msm:entity` | A flying machine that burns fuel while it flies, shows a fuel gauge above the hotbar and refuels with coal. An interim vehicle: a rideable mob with a script, until MSM has a vehicle kind. Inspired by: planes and flying machines. |
| Willow boats | `example_popular_willow_boats` | Popular ideas | `msm:item` | A willow wood set with a boat and a chest boat of its own wood, paddled as vanilla boats and crafted from willow planks. Inspired by: boats of every wood. |
| Cloud Farm | `example_game_cloud_farm` | Games | `msm:world_setup` | A Skyblock on a round island with a tree, food in the chest and an empty Nether too, from the Skyblock flow. |
| Deep Block | `example_game_deep_block` | Games | `msm:one_block` | A one block game that goes underground, into the deep dark and on to the Nether, fifty breaks a phase, from the One block flow. |
| Blossom Isles | `example_game_blossom_isles` | Games | `msm:world_setup` | Islands of cherry grove floating over the void, with a start island, from the Sky islands flow. |
| Star Block | `example_game_star_block` | Games | `msm:block` | A blue lucky block with a star on it that often builds a hut, sometimes drops prizes and rarely brings a creeper, from the Lucky block flow. |
| Crystal Road | `example_game_crystal_road` | Games | `msm:world_setup` | An adventure map on flat land with a welcome screen, always day, no monsters, four checkpoints and goals, from the Adventure map flow. |
| Four Kingdoms | `example_game_four_kingdoms` | Games | `msm:team` | Four teams with bows in a large quartz arena, three-minute rounds and ten defeats to win, from the Arena game flow. |
| Canyon Dash | `example_game_canyon_dash` | Games | `msm:area` | A race through three checkpoints against a ninety-second time limit, with the best times on the sidebar, from the Race flow. |
| Explorer | `example_game_explorer` | Games | `minecraft:advancement` | A tab of goals for travellers: a desert, an ocean, the heights and the depths, the Nether and the End, with a green timer on the tab, from the Goals flow. |
| World setup: an island in the sky | `example_msm_world_setup` | Game kits | `msm:world_setup` | How a world starts: a World Type of empty sky, a tiny island placed at the first join, the spawn on it and a welcome for each new player. |
| One block: grass, then stone | `example_msm_one_block` | Game kits | `msm:one_block` | A block at 0 100 0 that turns into the next block each time it is broken: grass and wood for 50 breaks, then stone and ores, then again. |
| Team: the gold team | `example_msm_team` | Game kits | `msm:team` | A team with gold names and a star before them, whose players cannot hurt each other. |
| Objective: coins on the sidebar | `example_msm_objective` | Game kits | `msm:objective` | A score shown on the right of the screen, changed by commands and Rules. |
| Timer: a one-minute countdown | `example_msm_timer` | Game kits | `msm:timer` | One minute counting down on a blue boss bar, started when the world starts, again and again. |
| Area: a pen rebuilt on reset | `example_msm_area` | Game kits | `msm:area` | A box that knows when players walk in or out, and rebuilds its fence when reset. |
| Custom ore project | `starter_custom_ore` | Starters | `msm:block` | The Custom ore starter: a real ruby ore block, the ruby item and a block of ruby, with loot, recipes, a tag, advancements and the mod metadata. |
| Recipe pack project | `starter_recipe_pack` | Starters | `minecraft:recipe` | The Recipe pack starter: one recipe of each common type and an advancement. |
| Custom music disc project | `starter_music_disc` | Starters | `minecraft:jukebox_song` | The Custom music disc starter: a jukebox song, its disc model and texture. |
| Functions project | `starter_function_starter` | Starters | `minecraft:function` | The Functions starter: load and tick functions, a scoreboard and function tags. |

## The `examples/` folder

The same examples are in the repository as ordinary MCSuperMods projects, so you can browse them on GitHub or open them with **File → Open Project…**:

| Folder | Namespace | Contents |
|---|---|---|
| `examples/all-kinds/` | `msm_examples` | The 124 per-kind examples in one project |
| `examples/blocks-items/` | `msm_examples` | The blocks and items behaviour examples (Sturdy pickaxe, Beacon stone, Fuel log, Life-steal sword, Night-vision helmet, Brewed with your own item, Elm wood set, Shale stone set, Onion crop, Silver birch tree, Crusher, Vault door, Loot crate in a structure, Ore crusher, Shulker crate) |
| `examples/entities/` | `msm_examples` | The entity behaviour examples (Hostile mob, Natural spawning, Tameable fox-like pet, Rideable flying mount, Archer with a throwable, Fish school with biome variants, Boss with a boss bar, Drawn without GeckoLib), each with its model, animations and textures |
| `examples/scripts/` | `msm_examples` | The script behaviour examples (Script: scheduled effects, Script: action handler, Script: scripted effect, Script: kill counter, Script: full set bonus, Script: teleport staff, Script: boss fight bar) |
| `examples/popular/<name>/` | `msm_examples` | Each Popular ideas example as a project of its own: `glowshard/`, `ember_drake/`, `cottage_furniture/`, `camp_stove/`, `pull_charm/`, `sunken_crypt/`, `amber_realm/`, `boomerang/`, `paper_glider/`, `rocket_boots/`, `orchard_tree/`, `spell_scrolls/`, `coordinates_bar/`, `go_kart/`, `mini_tank/`, `biplane/` and `willow_boats/` |
| `examples/games/<name>/` | `msm_examples` | Each Games example as a project of its own: `cloud_farm/`, `deep_block/`, `blossom_isles/`, `star_block/`, `crystal_road/`, `four_kingdoms/`, `canyon_dash/` and `explorer/` |
| `examples/rules/` | `msm_examples` | The Rules examples, made without code: Rules: a lucky block and Rules: a guard mob, each with its rule book (they need the Fabric mod jar) |
| `examples/worlds/<name>/` | `msm_examples` | Each world example of the Make a world flows as a project of its own: `coral_isles/`, `frost_peaks/`, `endless_blossom/`, `ember_caverns/` and `cloud_realm/` |
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
| `examples/starters/pet/` | `msm_starter` | The Pet starter |
| `examples/starters/farm-animal/` | `msm_starter` | The Farm animal starter |
| `examples/starters/mount/` | `msm_starter` | The Mount starter |
| `examples/starters/flying-mob/` | `msm_starter` | The Flying mob starter |
| `examples/starters/water-mob/` | `msm_starter` | The Water mob starter |
| `examples/starters/boss/` | `msm_starter` | The Boss starter |
| `examples/starters/particle/` | `msm_starter` | The Particle starter |
| `examples/starters/wandering-merchant/` | `msm_starter` | The Wandering merchant starter |
| `examples/starters/village-job/` | `msm_starter` | The Village job starter |
| `examples/starters/fluid/` | `msm_starter` | The Fluid starter |
| `examples/starters/adventure-map/` | `msm_starter` | The Adventure map starter |
| `examples/starters/arena-game/` | `msm_starter` | The Arena game starter |
| `examples/starters/backpack/` | `msm_starter` | The Backpack starter |
| `examples/starters/bed/` | `msm_starter` | The Bed starter |
| `examples/starters/cake/` | `msm_starter` | The Cake starter |
| `examples/starters/copper-set/` | `msm_starter` | The Copper set starter |
| `examples/starters/creative-tab/` | `msm_starter` | The Creative tab starter |
| `examples/starters/crop/` | `msm_starter` | The Crop starter |
| `examples/starters/custom-command/` | `msm_starter` | The Custom command starter |
| `examples/starters/goals/` | `msm_starter` | The Goals starter |
| `examples/starters/lights/` | `msm_starter` | The Lights starter |
| `examples/starters/lucky-block/` | `msm_starter` | The Lucky block starter |
| `examples/starters/machine/` | `msm_starter` | The Machine starter |
| `examples/starters/one-block/` | `msm_starter` | The One block starter |
| `examples/starters/portal/` | `msm_starter` | The Portal starter |
| `examples/starters/race/` | `msm_starter` | The Race starter |
| `examples/starters/sky-islands/` | `msm_starter` | The Sky islands starter |
| `examples/starters/skyblock/` | `msm_starter` | The Skyblock starter |
| `examples/starters/stone-set/` | `msm_starter` | The Stone set starter |
| `examples/starters/storage-crate/` | `msm_starter` | The Storage crate starter |
| `examples/starters/tree/` | `msm_starter` | The Tree starter |
| `examples/starters/vehicle-boat/` | `msm_starter` | The Boat starter |
| `examples/starters/vehicle-car/` | `msm_starter` | The Car starter |
| `examples/starters/vehicle-plane/` | `msm_starter` | The Plane starter |
| `examples/starters/vehicle-tank/` | `msm_starter` | The Tank starter |
| `examples/starters/wood-set/` | `msm_starter` | The Wood set starter |
| `examples/starters/world-caves/` | `msm_starter` | The Caves only starter |
| `examples/starters/world-empty-sky/` | `msm_starter` | The Empty sky with a start island starter |
| `examples/starters/world-islands/` | `msm_starter` | The Islands starter |
| `examples/starters/world-mountains/` | `msm_starter` | The Tall mountains starter |
| `examples/starters/world-one-biome/` | `msm_starter` | The One biome everywhere starter |

Copy a folder somewhere else before opening it, so your edits do not change the repository. See [examples/README.md](https://github.com/MEZTKING/MCSuperMods/blob/main/examples/README.md).

## Replacing the placeholders

**Textures.** Starters and examples draw 16×16 textures in a Minecraft-like style: an ore, a gem, a disc, planks or a tool, from MCSuperMods' own recipes (flows draw their pictures now; see [Drawing pictures](pictures.md)). To use your own, paint a PNG with the same file name and choose **Import assets** on the toolbar. Pick the namespace and **Block textures** or **Item textures**, then the file. Importing a file with an existing name replaces the placeholder; the models keep pointing at it. For the Custom ore starter these are `ruby_ore.png` and `ruby_block.png` (block textures) and `ruby.png` (item textures); for the Switch lamp, `lamp.png` and `lamp_lit.png` (block textures); for the music disc, `my_song_disc.png` (item textures).

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
