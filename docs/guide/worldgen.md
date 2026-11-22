# Worldgen

This guide shows how to make a world of your own in a few questions, make a custom biome with its own features, reach it through a World Type, and see it all live on a map. It assumes you know the basics from [Getting started](getting-started.md). Structures (jigsaw pieces, pools and structure sets) have their own guide: [Structures](structures.md).

Worldgen elements are listed in the sidebar's **Worldgen** group, with their registry in front of the name (`biome`, `placed_feature`, `world_preset`, `dimension` and so on). Biome and world preset tags are in the **Tags** group.

Every worldgen element shows live in the **Preview** tab: dimensions and World Types as a map of the world from above and a side cut, density functions and noises as a value map, features as a scatter on a patch of land, redrawn as you edit. [The live world map](live-world.md) explains it, and [Try it](try-it.md#my-world-generation) lets you walk in your world.

## Make a world in a few questions

**Make a world** on Home (in Very easy mode) and the Creator's **Worlds** group offer five flows. Each makes a **World Type**: you choose it under **More > World Type** when you create a world in Minecraft.

| Flow | Questions | What you get |
|---|---|---|
| **Islands** | **How big are the islands?** (Small: a short swim apart, Medium, Large: room for a village), **How much sea?** (A little: mostly land, Some: about half sea, Lots: islands far apart), **What grows on the islands?** (one or more of Grass and woods, Flowers, Cherry blossom, Jungle, Sand and dry grass, Snow, Mushrooms (no monsters)), **Trees** (Few, Many) | Islands in the sea, with beaches and deep ocean between them |
| **Tall mountains** | **How tall?** (Tall: up to about height 180, Very tall: about height 240, As tall as the world allows: about height 290), **How jagged?** (Smooth and rounded, Rugged, Jagged: sharp spikes and cliffs), **Where does the snow start?** (Low: snow on the high hills too, Halfway up, Only on the highest peaks, No snow), **What grows on the mountains?** (Meadows, Cherry blossom, Pine woods, Snowy pine woods, Bare stone, Windswept hills) | Towering peaks, each biome on its own mountains from the coldest to the warmest |
| **One biome everywhere** | **Which biome?** (thirteen, from Cherry grove to Mushroom fields (no monsters)), **What shape is the land?** (Gentle hills, Flat land, Like the overworld (its preview needs Minecraft's own files)) | The whole world is that biome, with its plants, trees and mobs |
| **Caves only** | **Roof or open top?** (A roof of rock over everything, Open to the sky, with land on top), **What is the rock?** (Stone, Deepslate: darker and harder, Tuff, Andesite, Blackstone), **Lakes at the bottom** (Water, Lava, No lakes), **What glows?** (Glowstone on the cave roofs, Shroomlight on the cave roofs, Nothing glows: bring torches) | Caverns and tunnels, with a dimension type of its own that has no daylight under a roof |
| **Empty sky with a start island** | **Which biome?** (Plains, Forest, Cherry grove, Snowy plains, Desert, Mushroom fields (no monsters)) | An empty world of sky |

Every flow also asks for a **Name** (the World Type's name on Create New World). The land of each world is MCSuperMods' own recipe (its own noises, density functions and noise settings, not a copy of Minecraft's), so the Creator's **Map** tab draws it while you answer, without your Minecraft folder; only **Like the overworld** uses the overworld's own land and needs your Minecraft folder to preview. The Nether and the End of these World Types are vanilla's.

Good to know:

- **Empty sky with a start island**: the start island, its chest and the things you start with come from the Skyblock flow; until MCSuperMods has it, this makes the empty world only. Players start in the air and fall: play it in Creative, or build a start island with the Structure Studio.
- **Caves only** with a roof: players start on top of the rock roof and dig down.
- Each flow has an example under **Help > Examples…**, category **Worlds**: Coral Isles, Frost Peaks, Endless Blossom, Ember Caverns and Cloud Realm. Three of them are cards in [See what you can make](showcase.md).
- The templates **Noise settings: islands**, **Noise settings: tall mountains**, **Noise settings: caves only** and **Noise settings: empty sky** (category **Worldgen (advanced)**) are the same land on their own, to build on.

## Start from a starter

Click the arrow next to **New** and choose **New from starter…**. Under Themed content there are two biome starters:

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
- **See it on the map** opens a live map of a world of yours that uses the biome (**Hide the map** closes it), and **Walk in it** opens it in [Try it](try-it.md#my-world-generation). The Placed Feature, Tree and Dimension Type Studios have the same line ([The live world map](live-world.md#in-the-creator-and-the-studios)).
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

**Vanilla's order.** The vanilla biomes in your world's biome list (for example a world preset that mixes your biome with vanilla ones, or any world where your biome sits beside vanilla biomes) take part in the game's sort as well. Vanilla runs its own placed features in a fixed order within each step (ores from dirt and gravel down to emerald, pumpkins before sugar cane, and so on), so when you reuse vanilla placed features, keep them in the step and order vanilla uses, as the starters do. MCSuperMods knows vanilla's order for each target and reports `worldgen.vanilla-feature-order` as a warning when one of your biomes lists two vanilla placed features the other way round ("Vanilla runs X before Y … Swap them."), or when your biomes, with one of your own placed features between vanilla ones, make a loop with vanilla's order. It is a warning, not an error, because a dimension that holds only your own biomes never meets vanilla's lists; any world that also has vanilla biomes stops with "Feature order cycle".

**Adding a feature moves vanilla's seeds.** Every placed feature in a step has a number there, and the game gives each feature a placement seed from that number. A feature you add takes a number, so the vanilla features after it in that step get different seeds: the same world seed decorates a little differently with your mod installed (other trees, flowers and ore veins in new chunks). This is true of every mod that adds features, Fabric ones included; it is not a bug. A placed feature nothing uses reports `worldgen.placed-feature-unused`.

## The climate map

Select a world preset or a dimension whose biome source is `multi_noise` with an explicit biome list, open the **Preview** tab and choose **Climate**. The climate map shows which biome wins at each point of the climate space. No vanilla assets are needed.

- Choose the **Horizontal axis** and **Vertical axis** from temperature, humidity, continentalness, erosion, depth and weirdness (temperature against humidity by default).
- The **Fixed parameters** sliders set the other four.
- Hover the map to see which biome wins there; the list below it gives each biome's colour (its grass colour or sky colour when set).
- For a world preset with several such dimensions, **Dimension** picks one.

The climate map shows the climate points only, not real terrain: the game's noise decides where each climate actually occurs. To see where your biomes really lie, use the **Biomes** tab beside it ([The live world map](live-world.md)).

## A sky and rules of your own (dimension types)

A **dimension type** says what a dimension is like to be in: the colour of its sky and fog, whether the sun, moon and stars move or stand still, how bright it is, whether beds work, whether water evaporates, how tall it is. Every dimension points at one. Until now your dimensions borrowed a vanilla one (the overworld's, the nether's or the end's); now you can make your own.

There are three ways:

- the Creator's **Dimension** flow has the answer **Give it its own sky and rules** (off by default). Switched on, it asks for **Sky colour**, **Fog colour**, **Time of day** (**As the chosen sky has it**, **Always day: the sun stands at noon** or **Always night: moon and stars**) and **Beds** (**As the chosen sky has them**, **Beds explode here** or **Beds work: sleep at night and set your spawn**), and adds a dimension type `<id>_type` copied from the **Sky and rules** you picked, with your changes, for the dimension to use. Switched off, nothing changes;
- **Add element** (Ctrl+N), the templates **Moon dimension type** (a black starry sky, the sun standing still low in the sky, no clouds, no sleeping, though beds still set your spawn) and **Nether-like dimension type** (no sky and a bedrock ceiling, red fog, fast lava, water that evaporates, beds that explode, working respawn anchors and one block here for eight in the overworld), both under **Dimensions**;
- any element of the kind `dimension_type`, edited in the **Dimension Type Studio**.

The Dimension Type Studio has seven sections. Only the settings your Minecraft version has are shown; anything else stays in **Advanced**.

- **Sky**: a small swatch of the sky, then **Sky colour**, **Fog colour**, **Cloud colour**, **Sunrise colour**, **Cloud height**, **Sun angle**, **Moon angle**, **Star angle**, **Star brightness**, **Sky hidden above** and the **Ambient particles** of the dimension.
- **Light**: **Ambient light**, **Sky light**, **Ceiling (a roof of bedrock)**, **Light on block sides** and the light colours.
- **Time**: **Time of day** is **Day and night (follows the clock)** or **Fixed: the sun stands still**, with the clock and timelines the day uses.
- **Rules**: **Beds** is **As usual**, **Beds work: sleep at night and set your spawn**, **Beds explode when used** or **No sleeping, but beds set your spawn**; then yes-or-no switches: **Respawn anchors work**, **Piglins turn into zombies**, **Monsters burn in daylight**, **Lava flows fast**, **Water evaporates**, **Raids can start**, **Pillager patrols**, **Portals spawn zombified piglins**, **Snow golems melt** and **Fire burns out faster**.
- **Height**: **Lowest block (min y)**, **Height**, **Logical height** (how high portals and chorus fruit reach) and **Distance scale** (one block here is this many blocks in the overworld, as 8 in the nether).
- **Spawning**: the monster spawn light levels and the block light limit.
- **Advanced**: every field of the type.

**Problems** checks the height in plain words: the lowest block and the height must be multiples of 16 within the game's limits, the height must be at least 16, and the logical height may not be above the height. A setting that your version of Minecraft does not know is an error, because the game refuses the whole data pack; the message says to pick one the Studio lists.

A dimension type is a data pack file, so it works in a vanilla data pack and in the mod. A new dimension, as always, is loaded when a world opens.

**There is no gravity, and no sky picture, per dimension.** Vanilla has no such setting in its data. To make a moon feel light, add a [rule](rules.md) that gives players the **Slow Falling** or **Jump Boost** effect while they are in the dimension (the **Give an effect** step with the condition **The dimension is**). [Try it](try-it.md) shows only the sky colour, in the side panel's **Sky** choice.

## Other worldgen elements

Dimensions (**Multi-noise overworld**, **Single-biome dimension**) and the elements under **Worldgen (advanced)** (noise settings, density functions, noise, carvers, flat level presets, multi-noise parameter lists, block state providers, material conditions and rules) use the general form with templates. Each template is a minimal valid file to build on, and each shows live in the **Preview** tab ([The live world map](live-world.md)). To get players into a dimension of your own, use the Creator's Dimension or Portal flow: a key item, a portal block (Fabric mod jar) or a travel function (see [Portals](portals.md)).

## Check it in the game

The full in-game check of the sample biome, World Type and hamlet is in the [sample worldgen README](https://github.com/MEZTKING/MCSuperMods/blob/main/fixtures/sample-worldgen/README.md#in-game-check-windows-minecraft-java-263): install or copy the data pack, choose the World Type when creating a world, then `/locate biome` and `/locate structure`, and look for `Feature order cycle` and other errors in `latest.log`.

## Where next

- [The live world map](live-world.md): the map, the side cut, value maps, Scatter, Compare with vanilla and the limits.
- [Structures](structures.md): jigsaw structures and how they generate.
- [Templates, starters and examples](templates-and-examples.md).
- [Known limitations](https://github.com/MEZTKING/MCSuperMods/blob/main/README.md#known-limitations).
