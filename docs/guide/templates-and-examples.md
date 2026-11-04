# Templates, starters and examples

MCSuperMods ships three kinds of ready-made content. All of it is checked in CI: every template, starter and example validates against each supported Minecraft version and exports with zero problems.

| What | Where in the app | What you get |
|---|---|---|
| **Element templates** (99) | **Add element** (Ctrl+N) | One new element with useful starting content |
| **Project starters** (11) | **New from starter…** | A new project, already filled |
| **Examples** (56) | **Help → Examples…** | A commented project or element to open or copy |

Templates come from the resource pack, data pack, structures and worldgen plugins, starters and examples from the built-in library plugin. Third-party plugins can add their own through the same plugin API ([ADR 0020](../adr/0020-templates-starters-examples.md)).

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

## Project starters

A starter creates a whole project in an empty folder. Open the list in any of these ways:

- the arrow next to **New** on the toolbar, then **New from starter…**;
- **File → New Project from Starter…**;
- the command palette (Ctrl+Shift+P): "New project from starter…".

The **New project** dialog groups the starters (Blank, Packs, Themed content) and shows which packs each one fills. Choose one, then **Choose folder and create**, and pick an empty folder. The folder name becomes the project's namespace: a folder called `Ruby Ore` gives the namespace `ruby_ore`. The project is saved straight away.

**New** on its own (and **File → New Project…**, Ctrl+Shift+N) still creates a blank project directly.

| Starter | id | Packs | What it contains |
|---|---|---|---|
| Blank project | `blank` | resource, data | Only `pack.mcmeta`. Add elements yourself. |
| Resource pack | `resource_pack` | resource | The vanilla stick gets a new model, a placeholder texture and an English name. |
| Data pack | `data_pack` | data | A load message, a `greet` function and one crafting recipe. |
| Resource and data pack | `combined` | resource, data | Both of the above in one project. |
| Custom ore | `custom_ore` | resource, data | Emerald ore becomes "Ruby Ore" and the emerald becomes "Ruby": textures, models, a loot table, a Block of Ruby recipe, a `gems` item tag and two advancements. |
| Recipe pack | `recipe_pack` | data | Shaped, shapeless, smelting, blasting and stonecutting recipes, an item tag used as an ingredient, a crafting advancement and a load message. |
| Custom music disc | `music_disc` | resource, data | A jukebox song, its sound event, a disc model and texture, and a `give_disc` function. |
| Functions | `function_starter` | data | `load` and `tick` functions wired to `#minecraft:load` and `#minecraft:tick`, a jump scoreboard, a `greet` function and a function tag of your own. |
| Custom biome | `custom_biome` | resource, data | The Amber Woods biome with its own tree and copper ore, and a World Type of its own that lists it beside a few vanilla biomes (**More → World Type** when creating a world). |
| Jigsaw village-style structure | `jigsaw_structure` | data | A small hamlet built by jigsaw blocks: a centre hut, streets that follow the terrain and lamp posts, with four template pools, a structure set and a biome tag that places it in forests. |
| Custom biome with a jigsaw structure | `worldgen_pack` | resource, data | Both worldgen starters in one project: Amber Woods and its World Type, and hamlets that generate in Amber Woods and in every vanilla forest. |

Three starters need a word of explanation:

- **Custom ore is a reskin.** A resource or data pack cannot add new blocks or items, so until real blocks arrive in Phase 4 the starter changes how emerald ore and the emerald look, what they are called and what the ore drops. In any world where the packs are enabled, emerald ore *is* ruby ore. Phase 4 adds a starter with a real new ore block.
- **The music disc plays a vanilla track.** MCSuperMods bundles no audio, so the sound event points at the game's own `records/cat` file. The disc itself is the vanilla `music_disc_13` item carrying the new song and a name, drawn with the starter's own disc model; the `give_disc` function gives it to you (`/function <namespace>:give_disc`), because a pack cannot add a new item to the creative inventory.
- **A custom biome needs its own World Type.** A data pack cannot add a biome to the normal overworld, so the Custom biome starters add a World Type that lists the new biome. Choose it when creating a new world; existing worlds keep their biomes, although the hamlets of the jigsaw starters do appear in new chunks of an existing world.

The [Getting started](getting-started.md) guide walks through the Custom ore and Functions starters in Minecraft; the [Worldgen](worldgen.md) guide walks through the worldgen starters.

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

Copying needs an open project with a namespace of its own (the button explains why when it is disabled). The whole copy is one step: **Undo** ("Copy example …") removes it again. Elements whose ids already exist in the project are skipped and listed, never overwritten; so are placeholder files that already exist. Examples that change vanilla content (Custom ore overrides `minecraft:emerald_ore`, for example) also add elements in the `minecraft` namespace.

### All examples

There is one example for each of the 52 element kinds, plus four themed starters listed again under **Starters**. The three worldgen starters have no gallery entry; create them with **New from starter…** or open their folders under `examples/starters/`.

| Example | id | Category | Kind | What it shows |
|---|---|---|---|---|
| Block model | `example_model` | Models | `minecraft:model` | A full-cube block model with one texture on every side. |
| Blockstate with rotation | `example_block_definition` | Blockstates | `minecraft:block_definition` | A pillar blockstate that turns one model to follow the axis property. |
| Item definition by display context | `example_item_definition` | Item definitions | `minecraft:item_definition` | An item that looks different in inventories than in the hand. |
| Language file | `example_lang` | Text | `minecraft:lang` | English names for your content, and a renamed vanilla item. |
| Sound events | `example_sounds` | Sounds | `minecraft:sounds` | A new sound event that plays vanilla sound files at random. |
| Pack metadata | `example_pack_mcmeta` | Pack | `minecraft:pack_mcmeta` | The pack.mcmeta description shown in the pack lists. |
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
| Custom ore project | `starter_custom_ore` | Starters | `minecraft:block_definition` | The Custom ore starter: emerald ore reskinned as ruby ore, with loot, a recipe, a tag and advancements. |
| Recipe pack project | `starter_recipe_pack` | Starters | `minecraft:recipe` | The Recipe pack starter: one recipe of each common type and an advancement. |
| Custom music disc project | `starter_music_disc` | Starters | `minecraft:jukebox_song` | The Custom music disc starter: a jukebox song, its disc model and texture. |
| Functions project | `starter_function_starter` | Starters | `minecraft:function` | The Functions starter: load and tick functions, a scoreboard and function tags. |

## The `examples/` folder

The same examples are in the repository as ordinary MCSuperMods projects, so you can browse them on GitHub or open them with **File → Open Project…**:

| Folder | Namespace | Contents |
|---|---|---|
| `examples/all-kinds/` | `msm_examples` | The 52 per-kind examples in one project |
| `examples/starters/custom_ore/` | `msm_starter` | The Custom ore starter |
| `examples/starters/recipe_pack/` | `msm_starter` | The Recipe pack starter |
| `examples/starters/music_disc/` | `msm_starter` | The Custom music disc starter |
| `examples/starters/function_starter/` | `msm_starter` | The Functions starter |
| `examples/starters/custom_biome/` | `msm_starter` | The Custom biome starter |
| `examples/starters/jigsaw_structure/` | `msm_starter` | The Jigsaw village-style structure starter |
| `examples/starters/worldgen_pack/` | `msm_starter` | The Custom biome with a jigsaw structure starter (also saved as `fixtures/sample-worldgen/`) |

Copy a folder somewhere else before opening it, so your edits do not change the repository. See [examples/README.md](../../examples/README.md).

## Replacing the placeholders

**Textures.** Starters and examples draw 16×16 placeholder textures: ore specks, a gem, a disc or a plain colour. To use your own, paint a PNG with the same file name and choose **Import assets** on the toolbar. Pick the namespace and **Block textures** or **Item textures**, then the file. Importing a file with an existing name replaces the placeholder; the models keep pointing at it. For the Custom ore starter these are `ruby_ore.png` (block textures) and `ruby.png` (item textures); for the music disc, `my_song_disc.png` (item textures).

**The music disc sound.** Export your track as Ogg Vorbis (`.ogg`; Audacity can do this), then:

1. **Import assets** → **Sounds (sounds, Ogg Vorbis)** → pick the file, for example `my_song.ogg`. It is stored as `sounds/my_song.ogg` in the namespace.
2. Select the `sounds` element. In the event `music_disc.my_song`, change the sound's `name` from `minecraft:records/cat` to `<namespace>:my_song` (the file path under `sounds/`, without `.ogg`). Keep `stream` on: long music streams instead of loading all at once.
3. Select the jukebox song `my_song` and set `length_in_seconds` to the length of your track in seconds. The "Now playing" text is in the `en_us` language element (`Your Name - My Song`); change it there.

## Regenerating `examples/` (contributors)

The `examples/` folder is generated from `packages/plugins/library/src/`; do not edit it by hand. After changing the library, rewrite the mirror with

```sh
UPDATE_GOLDENS=1 pnpm --filter @msm/exporters exec vitest run test/library.test.ts
```

`packages/exporters/test/library.test.ts` fails in CI when the folder drifts from the library. It also builds every starter and example for each supported version, saves and reloads it, validates every element and function, and exports both packs with zero problems. Template tests live with each plugin (`packages/plugins/<plugin>/test/templates.test.ts` for `resourcepack`, `datapack`, `structures` and `worldgen`).
