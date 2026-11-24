# Drawing pictures

MCSuperMods draws pictures for you. Every texture the Creator, a starter, an example, Surprise me or the AI helper makes is drawn in a Minecraft-like style: a few shades of each colour that lean warm where the light falls and cool in the shadow, light from the top left, clumpy texture instead of flat colour, a dark outline round items, and bricks, boards, bark and leaves that look like what they are. The same drawing is on offer for any picture field through **Draw…**, so you can pick the look yourself.

The pictures are MCSuperMods' own drawings. They are never copied, traced, recoloured or learned from Minecraft's textures, and no Minecraft picture is read to make them (to draw on Minecraft's own pictures instead, see [Start from a Minecraft texture](#start-from-a-minecraft-texture)). They work without a key and without the internet. See [Limits](#limits) for what drawing does not do.

## Draw a picture

**Draw it for me** sits beside **Make it with AI** on these picture fields:

- the **Creator's** picture fields, including mob skins;
- the **Block Studio**'s picture rows and texture slots, and the **Item Studio**'s picture rows;
- the **Particle Studio**, where the button draws all four frames in one step ([Particles](particles.md#pictures));
- the **texture painter**, where a pick replaces the picture on the canvas as one painter step;
- **New texture…**, under **Start from** ([New texture from a drawn picture](#new-texture-from-a-drawn-picture));
- the **Mob Studio**'s **Draw its skin** and the **Villager look Studio**'s pictures, each with **Make it with AI** beside it.

Once a key for AI pictures is set, the **Draw it for me** window also offers **Make it with AI instead**.

The **Draw it for me** window says "MCSuperMods draws it here in a Minecraft-like style, without a key or the internet. You can paint over it afterwards." and asks for a **Colour**, then shows six variations. Its **More options** asks the rest:

- **What is it?** Tiles with a small picture and a name: a sword, planks, leaves, an ore and so on. The list is cut down to what fits the field: a block texture offers block pictures, an item field offers items, an effect icon offers icons. The tile that matches the field's name is chosen to begin with. A skin field offers **Skin**.
- **Colour.** A colour well, ten theme swatches (Ruby, Frost, Ember, Moss, Sky, Void, Sun, Coral, Amber and Storm, the same ones Surprise me uses) and, where the field knows it, **The thing's colour**. In the Creator the field knows the colour you gave the thing, and the window starts on it.
- **Second colour**, for pictures that have one (the spots of a spawn egg, the ring of a disc, the produce on a crop). It reads "Its own colour until you pick one." and **Its own colour** puts it back.
- **Finish**, for pictures that come in more than one: **Gem**, **Metal** or **Rough** for blocks; **Drop**, **Heart**, **Star**, **Flame** or **Swirl** for effect icons; and the coat of a skin: **Fur**, **Scales**, **Smooth**, **Stone** or **Slime**.
- **Detail**: **Smooth**, **Normal** or **Rough**, how much speckle the shading has.

Six variations are shown at once (a particle shows "4 frames" under each). They are the same picture with six different seeds. Click one, then **Use this picture**. **New looks** shows six more; **Cancel** closes the window and changes nothing. If nothing can be drawn at the field's size, the window says "Nothing can be drawn at W by H pixels yet. Paint it or choose a picture instead."

Each pick is one undo step: **Edit > Undo** puts the old picture back, or removes a new one. A picture drawn for an empty slot becomes a new texture and the slot names it.

Without opening **More options**, the thing being drawn is chosen from where you are, so you only pick the **Colour** and one of the six variations. **More options** also says where the picture is saved.

## Blocks drawn by Blockloom

Stone, cobblestone, bricks, ores (on stone or deepslate), dirt, grass (top and side), sand, gravel, planks, logs (bark and the cut end), leaves and the plain block are drawn by **Blockloom**: the recipes of Blockloom, a texture maker made alongside MCSuperMods, built into MCSuperMods so they work offline, without Blockloom itself and without a key. Every other picture (items, tools, armour, skins, plants, crops, doors, pillars, particles, patterns) is drawn as described above, whichever style you choose.

For those blocks the **Draw it for me** window adds **Describe it**, a box for a few words about the block. The six variations follow your words as you type:

- **Name a block** to draw that block instead: stone, cobblestone, deepslate, gravel, bricks, stone bricks, nether bricks, mud bricks, obsidian, dirt, grass, sand, snow, ice, moss, planks, log, leaves, netherrack, end stone, prismarine, terracotta, glass or stained glass, wool and concrete in the sixteen colours, iron, gold, diamond, emerald, redstone, lapis, netherite or copper blocks (copper also exposed, weathered or oxidized), or a gold, diamond, redstone, emerald, copper or lapis ore. A named block brings its own colours.
- **Add effects**: mossy (or overgrown), cracked, glowing, frosted (or icy), ancient (or weathered), charred (or burnt), gilded, flecks (or veins), crystals (or gems), wet and flowers. Several can go together.
- **Name a colour**: a colour next to crystals, gems, veins, flecks or glow colours them ("tiny cyan crystals"); any other colour tints the whole block ("blue stone").

For example "mossy cobblestone with cyan crystals", "cracked deepslate with glowing amber veins" or "frosted oak planks". Words that name nothing leave the picture as it is. **Detail** picks Blockloom's finish: **Smooth**, **Normal** (balanced) or **Rough** (rugged). **Colour** tints the block; a grey keeps the block's own colours, a grass side keeps its own green and dirt, an ore's colour chooses which ore is drawn (cyan a diamond-like ore, red a redstone-like one), and a deepslate ore gets crystals and flecks in the colour. Each picture keeps a note of the words, block, seed and Blockloom's version inside its PNG file, so it can be drawn again; Minecraft ignores the note.

### Block picture style

**Settings > Pictures > Block picture style** chooses who draws those blocks: **Blockloom** (the default) or **Classic**, the earlier, simpler look of MCSuperMods' own recipes. The same choice sits under the Draw window's **More options**, and the variations change at once. It applies everywhere MCSuperMods draws a block for you: the Draw window, the Creator and every flow, starter and example you make, the gallery's pictures, Try it's drawn ground and the AI helper's pictures. Pictures already in your project keep their look until you draw them again. Classic draws exactly what it drew before; it has no **Describe it** box.

## Where the pictures come from

The recipes are grouped in families:

- **Blocks** (some drawn by Blockloom, see [Blocks drawn by Blockloom](#blocks-drawn-by-blockloom)): stone, polished stone, cobblestone, bricks, pillars, ores (stone or deepslate), storage blocks, planks, logs and bark, leaves, doors and trapdoors, saplings and crops, portals, dirt, grass, sand and gravel, the growing plants (a kelp- or vine-like strand with its berries, a cane, cactus or bamboo stalk, a lichen over a face, a dripleaf's leaf and stem) and a flower pot's clay, and a plain tile. They tile, so a wall of them has no seams, and they have no outline.
- **Items**: gems, ingots, discs, spawn eggs, tools, weapons, bows and crossbows with their pulling pictures, shields, bottles, totems, fruit, seeds and produce, a banner pattern item, a pottery sherd and a glider. Items have a dark outline.
- **Worn and mob pictures**: the armour layers, horse and wolf armour, a banner pattern on banners and shields (drawn pale, since the game dyes it), armour trim layers (in eight greys the game recolours with each trim material), glider wings, a decorated pot face, and skins painted on a model's boxes.
- **Icons and particles**: the effect icon and the four particle looks (spark, orb, puff and leaf).

Each picture is decided by what it is, its colours, finish, detail and a number called the seed. The same choices always give the same picture, and a different seed gives a different one. Creator flows and examples pick a seed from the picture's own path, so two swords in one project differ, and the same project always draws the same pictures. Nothing is stored in the project but the PNG.

## Draw a skin

The Entity Studio has **Draw its skin** beside the texture picker . It draws the mob's skin on the boxes of its own model: each face is shaded by the way it faces, with eyes on the face and a second colour for the belly and spots. The window asks for the coat (**Fur**, **Scales**, **Smooth**, **Stone** or **Slime**), **Colour**, **Second colour** and **Detail**, then shows six variations; **Use this skin** writes the picture over the texture the mob names, or makes a new one in the mob's namespace and names it, as one undo step. See [Entities and models](entities-and-models.md#the-entity-studio).

The button is greyed out, with the reason beside it, when there is nothing to draw on: "Choose a model first.", "The model is not part of this project.", "This model's faces are mapped one by one" (the model gives each face its own place on the picture, so there are no boxes to shade) or "This model has no boxes to draw on." Use **Draw…** on the texture for an even coat instead.

## Particle frames

In the Particle Studio, **Draw frames…** draws all four frames of a spark, orb, puff or leaf in one step, in your colour, and replaces the frame list. One **Undo** brings the old frames back ([Particles](particles.md#pictures)).

## New texture from a drawn picture

**New texture…** (the brush beside the namespace's assets heading) asks **Start from**: **Blank** or **Drawn picture**. With a drawn picture the button reads **Draw…**; you pick the look in the same window, and the picture opens in the texture painter to change before you **Save**. Paintings start blank: "Paintings start blank."

## Start from a Minecraft texture

You can also start from one of Minecraft's own textures and draw on it. **Start from a Minecraft texture…** sits beside **Draw…** in the texture painter, in the Block and Item Studios' picture rows and texture slots, in the Mob Studio beside **Draw its skin** and on each frame of the Particle Studio; **New texture…** offers it under **Start from** as **A Minecraft texture** (the button then reads **Pick…**).

It opens a picker of the textures in your own Minecraft. They are listed by name, made from the file names (Stone, Stone bricks, Full (heart)), in the folders **Blocks**, **Items**, **Mobs**, **Particles**, **GUI** and **Paintings**, with a search box and small pictures drawn pixel-sharp as they come into view. Ids such as `minecraft:block/stone` show only inside a **More options**. A moving texture (water, lava, fire) says **Moving**. Pick one and it becomes the start of your own picture: in the painter it replaces the canvas at its own size as one painter step (**Undo** in the painter takes it back), and elsewhere it is written as one undo step.

A moving texture is a strip of frames, one under another. It opens as the whole strip, as the painter shows any strip. When you save it while it is still a strip, MCSuperMods writes its own `.png.mcmeta` beside it with the same frame timing, so it moves in the game too.

The pictures come from your own Minecraft: MCSuperMods reads them from the game you set up in **Settings** (the same files the previews use) at the moment you pick, and ships none. Without the Minecraft folder set up, the picker says "Minecraft's textures come from your own Minecraft: set up the Minecraft folder first." with **Set up Minecraft folder**, which opens Settings. What you save is your own picture in your own project.

## Change a Minecraft texture

**Change a Minecraft texture** changes how Minecraft itself looks: a resource pack that repaints stone, dirt, a sword or a mob. It is a Home tile under **Looks and sounds**, an action in the command palette (Ctrl+Shift+P) and a result of the search ("minecraft texture", "change how dirt looks", "edit stone texture").

It opens the same picker. The texture you pick opens in the painter, titled for example "Change how Stone looks in Minecraft". Paint it and **Save**: MCSuperMods saves it in your project at the same place as the game's own (`assets/minecraft/textures/block/stone.png`), in one undo step, so the resource pack replaces the game's picture with yours. **Undo** removes it again. If your project already changes that texture, the painter opens on your version instead.

The resource pack export and **Install** carry your picture; turn the pack on in Minecraft's **Resource Packs** screen to see it. Previews of your own blocks and items that use the texture show your version.

## Draw it for me

Wherever a picture can be made, **Draw it for me** draws it. Pick the **Colour**, pick one of the six variations and **Use this picture**. The mod's own things are already drawn when you make them ([Plain words and More options](more-options.md)); this is for choosing another look afterwards.

## Drawing, painting, Picture to texture and Make with AI

Five ways to get a picture, which you can mix:

- **Draw…** makes a picture in the Minecraft-like style from a recipe. It works offline and costs nothing.
- **Paint this texture** (the texture editor) changes any picture pixel by pixel. Paint over a drawn picture to restyle it ([Replacing the placeholders](creator.md#replacing-the-placeholders)).
- **Start from a Minecraft texture** begins from one of the textures of your own Minecraft ([Start from a Minecraft texture](#start-from-a-minecraft-texture)).
- **Picture to texture** turns a picture of your own into a texture ([Picture to texture](creator.md#picture-to-texture)). It does not make the picture look like Minecraft.
- **Make with AI** makes a picture from a description with your own key, Retro Diffusion by default ([AI pictures](ai-pictures.md)). It starts from MCSuperMods' drawing of the same thing, checks each result's outline and colour against that drawing, and falls back to the drawing when the service gets it wrong. Its clean-up uses the same shades as drawn pictures. It is on offer wherever **Draw…** is, and also for paintings, armour layers and banner and pot patterns in the painter and **New texture…**.

## Limits

- **Vanilla-like, not vanilla.** Drawn pictures are in the same style, not the same pixels: the drawing never copies, recolours or learns from Minecraft's textures. To start from Minecraft's own picture, use [Start from a Minecraft texture](#start-from-a-minecraft-texture), which reads it from your own game when you ask.
- **Paintings keep their placeholder landscape.** A painting is your own picture, so the Painting flow's default picture is unchanged. Choose your own with **Choose picture…**, or **Make with AI** with a key.
- **Vanilla mob variant skins are an even coat.** A wolf, cat or pig variant drawn by a flow has fur shading but no eyes or markings in place, because their layout belongs to Minecraft's own models. Paint it or use Picture to texture.
- **Draw a skin needs a model with boxes.** A model that maps its faces one by one gives the button greyed out (see above).
- **Nothing is redrawn by itself.** Projects you made before keep their pictures. Only what flows make from now on is drawn, and **Draw…** or **Edit in Creator** redraws one on request.
- **Some sample pictures stay flat.** A few pictures in the repository's sample fixtures are made by tests with the old flat patterns and are unchanged. Everything a flow, starter or example makes is drawn.
- **16 by 16 only.** Drawn pictures are the size of Minecraft's own: 16 by 16 for blocks and items, with the worn, icon and particle sizes of the game. There are no high-resolution drawn pictures.
- **Only particles are animated.** A drawn portal surface is one picture and does not swirl.
- **A trim layer drawn on its own does not recolour.** The Armour trim flow writes the palette file that tells the game which greys to swap for the trim material's colours; a new trim layer drawn by the AI helper or with **Draw…** has none, so it keeps its greys. Use the flow, or add the palette yourself.

## Where next

- [The Creator](creator.md): the flows that draw their pictures.
- [Blocks and items](blocks-and-items.md): the Block and Item Studios.
- [AI pictures](ai-pictures.md): pictures from a description.
