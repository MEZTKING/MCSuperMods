# Worldgen

This guide shows how to make a custom biome with its own features, reach it through a World Type, and check where it sits in the climate. It assumes you know the basics from [Getting started](getting-started.md). Structures (jigsaw pieces, pools and structure sets) have their own guide: [Structures](structures.md).

Worldgen elements are listed in the sidebar's **Worldgen** group, with their registry in front of the name (`biome`, `placed_feature`, `world_preset`, `dimension` and so on). Biome and world preset tags are in the **Tags** group.

## Start from a starter

Click the arrow next to **New** and choose **New from starter…**. Under Themed content there are two worldgen starters:

- **Custom biome**: the Amber Woods biome with its own tree and copper ore, a World Type that offers it, and English names for both.
- **Custom biome with a jigsaw structure**: the same biome plus a jigsaw hamlet that generates in it and in every vanilla forest. This is the project in [`fixtures/sample-worldgen/`](https://github.com/MEZTKING/MCSuperMods/blob/main/fixtures/sample-worldgen/README.md).

Element ids are unique across kinds in a project, so linked elements have different ids: the configured feature `amber_tree` and the placed feature `amber_tree_placed`, the structure `hamlet` and its structure set `hamlets`. Minecraft would allow the same name in different folders; MCSuperMods does not. Some templates start a link pointing at the new element's own id; their description says so, and you point the field at the real element after creating it.

## How a custom biome reaches a world

A data pack cannot add a biome to the normal overworld. Instead it adds a **World Type**:

1. A **world preset** (template **World preset**, category Dimensions) whose overworld uses the vanilla terrain with a `multi_noise` biome source that lists the biomes explicitly: your biome plus some vanilla ones to fill the rest of the climate.
2. A **world preset tag** `minecraft:normal` that lists the preset (template **World preset tag: normal**), so it appears under **World Type** when creating a world. Without it the Problems tab shows `worldgen.preset-not-selectable`.
3. Language entries `generator.<namespace>.<preset>` and `biome.<namespace>.<biome>` in an `en_us` language element, so the button and the F3 screen show names instead of keys (they are in the resource pack).

A biome that no dimension or world preset in the project lists reports `worldgen.biome-unreachable`; a world preset without `minecraft:overworld` reports `worldgen.preset-missing-overworld`.

Biomes only appear in **new** worlds: choose the World Type when creating the world. Structures are different and also reach new chunks of existing worlds (see [Make a structure generate](structures.md#make-a-structure-generate)).

## The Biome Studio

Select a biome to open the Biome Studio. **Advanced (all fields)** switches to the full form for anything the Studio does not show.

- **Climate**: **Temperature**, **Downfall**, **Precipitation** and **Temperature modifier**. Temperature also decides snow and the colour of grass and leaves when you do not set them.
- **Colours**: seven colour pickers, for the water, grass, foliage and dry foliage colours and the sky, fog and water fog colours, plus the **Grass colour modifier**. In Minecraft 26.3 the sky, fog and water fog colours are stored as `minecraft:visual/*` attributes of the biome, not as effects; the Studio writes them in the right place. Clear a colour to fall back to the game's default.
- **Features**: one list of placed features for each of the eleven generation steps, named from the target (Raw generation, Lakes, Local modifications, … Vegetal decoration, Top layer modification). Features run step by step and, within a step, in list order. See [Features and steps](#features-and-steps).
- **Spawns**: the mobs that spawn naturally, one list per category (monster, creature, ambient and so on), each entry with an entity, a weight and a minimum and maximum count. In 26.3 they are stored in the `minecraft:gameplay/natural_mob_spawns` attribute. **Spawn costs** follows below them.
- **Carvers**: the cave and canyon carvers.

## Features and steps

A feature is made of two elements:

- A **configured feature** says *what* to place: an ore vein, a tree, a flower patch, a single block. It uses the general form; start from the templates **Ore vein**, **Tree (oak-like)**, **Flower patch** or **Single block** (category Features).
- A **placed feature** says *where and how often*: it names a configured feature and lists placement modifiers (count, spread, height range, biome filter and so on). Start from **Ore placement**, **Tree placement** or **Patch placement**.

Select a placed feature to open the Placed Feature Studio: **Configured feature** picks the feature, **Placement modifiers** is the ordered list (choose a type and **Add modifier**; each modifier's settings appear under it), and **Used in** lists the biomes and steps that place it. Then add the placed feature to a step in the Biome Studio's **Features**.

**The feature order rule.** Minecraft sorts the placed features of every step into one global order, built from every biome in the world's biome list. Two placed features that appear together in one step of several biomes must be in the same order in all of them: if the biomes disagree (biome A lists X before Y and biome B lists Y before X, or a longer loop such as X before Y, Y before Z and Z before X across three biomes), no order fits and the game stops when the world loads with "Feature order cycle". Listing the same placed feature twice in one step of a biome is a loop too.

MCSuperMods checks this across the biomes in your project and reports `worldgen.feature-order` as an error, which disables export until you fix it (undo works).

A placed feature that is in one step in one biome and in another step in a second biome does not crash the game: the game treats each step's copy as a separate entry. It is still usually a mistake, because the feature runs at a different point of decoration in those biomes and gets a different placement seed, so MCSuperMods reports it as the warning `worldgen.feature-step-differs`, which does not block export.

Both checks treat an id without a namespace as `minecraft:`, as the game does, so `freeze_top_layer` and `minecraft:freeze_top_layer` are the same placed feature.

Vanilla biomes are not visible to the checks, but the vanilla biomes in your world's biome list (for example a world preset that mixes your biome with vanilla ones) take part in the game's sort as well. When you reuse vanilla placed features, keep them in the step and order vanilla uses, as the starters do. A placed feature nothing uses reports `worldgen.placed-feature-unused`.

## The climate map

Select a world preset or a dimension whose biome source is `multi_noise` with an explicit biome list, then open the **Preview** tab. The climate map shows which biome wins at each point of the climate space. No vanilla assets are needed.

- Choose the **Horizontal axis** and **Vertical axis** from temperature, humidity, continentalness, erosion, depth and weirdness (temperature against humidity by default).
- The **Fixed parameters** sliders set the other four.
- Hover the map to see which biome wins there; the list below it gives each biome's colour (its grass colour or sky colour when set).
- For a world preset with several such dimensions, **Dimension** picks one.

The map shows the climate points only, not real terrain: the game's noise decides where each climate actually occurs. A noise-sampled map is not available yet.

## Other worldgen elements

Dimensions (**Multi-noise overworld**, **Single-biome dimension**) and the elements under **Worldgen (advanced)** (noise settings, density functions, noise, carvers, flat level presets, multi-noise parameter lists, block state providers, material conditions and rules) use the general form with templates. Each template is a minimal valid file to build on.

## Check it in the game

The full in-game check of the sample biome, World Type and hamlet is in the [sample worldgen README](https://github.com/MEZTKING/MCSuperMods/blob/main/fixtures/sample-worldgen/README.md#in-game-check-windows-minecraft-java-263): install or copy the data pack, choose the World Type when creating a world, then `/locate biome` and `/locate structure`, and look for `Feature order cycle` and other errors in `latest.log`.

## Where next

- [Structures](structures.md): jigsaw structures and how they generate.
- [Templates, starters and examples](templates-and-examples.md).
- [Known limitations](https://github.com/MEZTKING/MCSuperMods/blob/main/README.md#known-limitations).
