# The live world map

When you make a world of your own, you see it while you make it. Every world generation element (a dimension, a World Type, noise settings, a density function, a biome, a feature and the rest) shows a live picture in the **Preview** tab: a **Map** of the world from above, a **Side cut** through it, a **Value map** or a **Scatter**. The picture is drawn again a moment after every edit, a rough one at once and the sharp one a little later. You can also walk in your world in [Try it](try-it.md#my-world-generation).

MCSuperMods does not run Minecraft for this. It works the world out from the same files the game reads: your project's files and, for anything vanilla, the world generation files inside your own Minecraft, read on your computer as your textures are. Nothing of Minecraft's is shipped with MCSuperMods, written into your project, exported or sent to the AI helper. The land's shape, its water, its noise caves and the surface blocks are worked out as the game does it and checked against real worlds; trees, plants and ores are about right; carved caves and buildings are not drawn. Every picture carries a **Preview** tag ("Worked out by MSM from your files, not made by the game. Play is the real check.") and lists what it left out under the picture. The full list is under [Limits](#limits).

To make a world in a few questions, use **Make a world** on Home or the Creator's world flows ([Worldgen](worldgen.md#make-a-world-in-a-few-questions)).

## Open the map

Select a world generation element in the sidebar and open the **Preview** tab. What you see depends on the kind:

| Kind | What the Preview shows |
|---|---|
| Dimension, World Type (world preset) | The **Map**, with the tabs **Biomes**, **Height**, **Side cut** and **Climate**. A World Type has a **Dimension** list for each dimension it names. |
| Noise settings, biome, biome parameter list, flat level preset, surface rule and condition | The same map, **Seen in** a world (see [Seen in](#seen-in)). A biome is lit on the map; a surface condition puts glowstone where it is true. |
| Density function, noise | A **Value map** ([Value maps](#value-maps)). |
| Feature, placed feature, block state provider, biome addition | A **Scatter** on a patch of land ([Scatter](#scatter)). |
| Carver | One line: "Carved caves show only in the game. A carver cuts caves and ravines into the land after it is made; the preview draws the land without them." |
| Dimension type | Its lines on the **Side cut** of a world that uses it, from its Studio's **See it on the map**. |

The map is a 2D picture, so it works without WebGL.

## The map

- **Biomes**: each biome in its own colour (its grass colour or sky colour when set). Hover the map to see the biome and the height there: "X 120, Z -48: minecraft:forest, land at y 71".
- **Height**: the land shaded by height. It is shaded from fewer samples first ("Height is shaded from one sample every 16 blocks."), then more finely.
- **Side cut**: a slice through the world from its lowest block to its highest, block by block. **Cut** chooses **West to east** or **North to south**; the dark line is the sea level. Hover to see the block at a place.
- **Climate**: for dimensions and World Types whose biomes are chosen by climate, the climate map as before (see [Worldgen](worldgen.md#the-climate-map)).

While a picture is being drawn, **Drawing…** shows beside the tabs. Each edit is seen about a sixth of a second after you stop typing.

## Seed and place

These controls sit above the map:

- **Seed**: type a number, or words (the game turns words into a number the same way and the line under the box says which: "The game makes 1234 of these words."). **Roll a new seed** picks another. **Seed of one of my worlds** lists your saves (from the game folders in Settings) and takes the seed of the one you choose. The seed belongs to the view, not to your project: it is kept on this computer for this project, and Try it's ground uses the same one.
- **X** and **Z**: the block at the middle of the map. **Go to spawn** goes back to 0, 0.
- **+** and **−** zoom between 1, 4 and 16 blocks a pixel. You can also drag the map, use the mouse wheel, or the arrow keys and + and - when the map has focus.
- **Walk in it** (for a world of your project): "Opens Try it on this world, at this seed and place." See [Try it: My world generation](try-it.md#my-world-generation).

## Seen in

Noise settings, biomes, surface rules and other parts are not a world on their own. The map shows them inside a world:

- **Seen in** lists the dimensions and World Types of your project that use the part.
- When none does, the map makes a plain world around it in memory, such as "A plain world: this biome everywhere on the overworld's land" or "A plain world with these settings and one biome". Nothing is added to your project.

A biome's map says "This biome covers 12.5 % of the view." and **Find it** moves the map to the nearest place where it lies ("Not in this view. Zoom out or move the map to look further." when there is none).

## Value maps

A density function or a noise shows a **Value map**: blue below 0, orange above, white around 0. In a final density, above 0 is solid ground.

- **From above** at a chosen **Height** (a slider), or **Side cut**.
- The range in view ("In view: lowest -0.62, highest 1.04.") and the value under the mouse.
- A density function is **Seen in** a world of your project that uses it, or **On its own**: a plain world whose land is the function, so you see what it makes.
- A noise is shown alone, at a scale of 1 on every axis.

## Scatter

A feature, a placed feature, a block state provider or a biome addition shows a **Scatter**: a patch of flat land 48 by 48 blocks (grass over dirt and stone) with what the feature places lit and the land dimmed, **From above** or **From the side**, with a count of what was placed.

- A placed feature follows its own placement rules (count, spread, height, biome and the rest). A feature on its own is placed four times a chunk on the surface, an ore eight times through the stone, and the notes say so.
- A block state provider shows a strip of **Sample picks** and how often each block comes up.
- A biome addition is drawn in the first of its biomes; **The addition is on** switches it off and on so you can compare.
- "Nothing was placed in this patch. Its rules may keep it to other places (a biome, a height, the block below), or it is rare: try another seed or move the patch."

Trees, plants and ores are about right here: the game places them exactly.

## Structures

**Structures** (a switch under the map) marks where a spread-out structure (a structure set with `random_spread` placement) may start in the view, for example "3 places in this view where a structure may start." Hover a mark to see which set and chunk. Whether a structure really starts there is the game's: its biome check, the land and its pieces. Structures placed in rings around the world's middle are not marked, and the notes say so.

## Compare with vanilla

**Compare with vanilla** (a switch under the map) draws vanilla's world beside yours, at the same seed and place: vanilla's overworld, Nether or End, or the overworld on the vanilla land setting your world names. It needs your Minecraft folder: without it the switch is off and the map says "Compare with vanilla needs Minecraft's own land files. Set up your Minecraft folder to see vanilla's world beside yours."

Vanilla's overworld and Nether choose their biomes from a list that is not in Minecraft's files, so Compare draws their real land in one colour and says "Vanilla's biomes show here after you have pressed Play once. Until then its land is drawn in one colour." Reading that list from the test game is not in this version yet, so for now they stay one colour after Play too.

## In the Creator and the Studios

- **The Creator**: a flow that makes a world (the five world flows and the Dimension flow) opens its live preview on a **Map** tab, first. The map draws the world your answers make and follows each answer; nothing is added until **Create** ([The Creator](creator.md#make-a-world)).
- **The Studios**: the Biome, Placed Feature, Tree and Dimension Type Studios have a line with **See it on the map** (**Hide the map** closes it) and **Walk in it**. The map shows a world of yours that uses the element, with **Seen in** when there are several; when none does, it says "No world of yours uses this yet. Use it in a world of your own (a biome of a dimension or a world type) to see it on the map; the Preview shows it on its own."

## Walk in it

**Walk in it**, on the map or in the Studios, opens [Try it](try-it.md) on the ground **My world generation** at the map's seed and place. In Try it, **Show on the map** goes back the other way: it opens the world in the editor with the map on the place where you stand.

## Without your Minecraft folder

A world made only of your project's files draws in full. The Make a world flows write their own land files, so their maps draw without Minecraft at all (except **Like the overworld**, which uses the overworld's own land). When a picture needs one of Minecraft's own world files, the map shows instead: "This world uses Minecraft's own land files. Set up your Minecraft folder to see it here." with **Set up Minecraft folder** ([Getting started](getting-started.md)).

## What the notes say

Under each picture, **What this view leaves out** lists in plain words what the picture could not draw or draws only about right, for example:

- "This world uses `upscale` (in my_mod:terrain), which the preview cannot work out yet. Nothing: it counts as 0 where it is used." Every part the preview cannot work out is named by its type and where it is, with what was drawn instead.
- "noise_settings is missing (named in my_mod:world). Nothing: the file is missing."
- "About right: the bands of terracotta are there and move as in the game, but their colours are the preview's own." The same for ore veins (which of their blocks are ore) and the temperature condition (the game's cooling high up is not drawn).
- "Carved caves and buildings show only in the game." and "Trees, plants and ores are not drawn here." on the map.

## Limits

| What | In plain words |
|---|---|
| **A preview, not the game** | MCSuperMods works the world out itself from your files; it does not run Minecraft's generator. The land's shape, water, noise caves and surface blocks are checked against real worlds. Press **Play** for the real check. |
| **Vanilla parts need your Minecraft folder** | Minecraft's own world files are never shipped. Without them, worlds made from your project's files still draw; anything naming a vanilla file shows the set-up line. |
| **Trees, plants and ores are about right** | They are placed by your files' own rules, with MCSuperMods' own shapes, so they stand about where the game puts them, not block for block. Some kinds of feature are not drawn yet; the notes name them. |
| **Carved caves are not drawn** | Caves and ravines cut by carvers show only in the game. Noise caves are drawn. |
| **Buildings are not drawn** | Structures are only marked where they may start. Land the game raises or cuts around a building is not drawn either. |
| **Some parts cannot be drawn yet** | A type the preview cannot work out is named, with what was drawn instead. A few are drawn about right: the colours of badlands bands, which blocks of an ore vein are ore, the cold high up in a temperature check, and a biome check in a surface rule right at a biome border. |
| **Vanilla's overworld and Nether biomes** | Their biome list is not in Minecraft's files, so they show their real land with one biome. The notes say the biomes show after you have pressed **Play** once; reading the list from the test game comes in a later version. |
| **The End is about right** | Its biomes and land are close, not exact: "The End is about right here." |
| **Biome borders on 26.4-snapshot-7** | That snapshot moves biome borders in a way the files do not show: "Biome borders are about right on this version." The land itself is checked. |
| **The ground is a window** | Try it's ground is 48 by 48 blocks and 32 high; taller land is cut. Use **Move up**, **Move down** and **Make the land around me**. |
| **Old chunks are not blended** | The preview always draws a new world. |
| **No mobs, light or weather** | As in every Try it ground. |
| **A slow computer draws later** | The rough picture stays longer; zoom out for a quicker one. |
| **The seed is the view's** | The game picks a seed for each world. Use **Seed of one of my worlds** to see one of yours. |
| **Debug worlds** | "Debug worlds are only in the game." |
| **Other kinds** | This page is about world generation. Some other kinds of element still have no live picture; they are listed in the [live view audit](https://github.com/MEZTKING/MCSuperMods/blob/main/docs/LIVE-VIEW-AUDIT.md). |

## Where next

- [Worldgen](worldgen.md): biomes, features, World Types and dimension types, and the Make a world flows.
- [Try it](try-it.md#my-world-generation): the ground **My world generation**.
- [The Creator](creator.md#make-a-world): the five world flows and their questions.
