# Drawing pictures

MCSuperMods draws pictures for you. Every texture the Creator, a starter, an example, Surprise me or the AI helper makes is drawn in a Minecraft-like style: a few shades of each colour that lean warm where the light falls and cool in the shadow, light from the top left, clumpy texture instead of flat colour, a dark outline round items, and bricks, boards, bark and leaves that look like what they are. The same drawing is on offer for any picture field through **Draw…**, so you can pick the look yourself.

The pictures are MCSuperMods' own drawings. They are never copied, traced, recoloured or learned from Minecraft's textures, and no Minecraft picture is read to make them. They work without a key and without the internet. See [Limits](#limits) for what drawing does not do.

## Draw a picture

**Draw…** sits beside **Make with AI** on these picture fields (in Very easy mode it reads **Draw it for me**):

- the **Creator's** picture fields, including mob skins;
- the **Block Studio**'s picture rows and texture slots, and the **Item Studio**'s picture rows;
- the **Particle Studio**, where the button reads **Draw frames…** and draws all four frames in one step ([Particles](particles.md#pictures));
- the **texture painter**, where a pick replaces the picture on the canvas as one painter step;
- **New texture…**, under **Start from** ([New texture from a drawn picture](#new-texture-from-a-drawn-picture)).

The **Draw a picture** window (Very easy: **Draw it for me**) says "MCSuperMods draws it here in a Minecraft-like style, without a key or the internet. You can paint over it afterwards." and asks:

- **What is it?** Tiles with a small picture and a name: a sword, planks, leaves, an ore and so on. The list is cut down to what fits the field: a block texture offers block pictures, an item field offers items, an effect icon offers icons. The tile that matches the field's name is chosen to begin with. A skin field offers **Skin**.
- **Colour.** A colour well, ten theme swatches (Ruby, Frost, Ember, Moss, Sky, Void, Sun, Coral, Amber and Storm, the same ones Surprise me uses) and, where the field knows it, **The thing's colour**.
- **Second colour**, for pictures that have one (the spots of a spawn egg, the ring of a disc, the produce on a crop). It reads "Its own colour until you pick one." and **Its own colour** puts it back.
- **Finish**, for pictures that come in more than one: **Gem**, **Metal** or **Rough** for blocks; **Drop**, **Heart**, **Star**, **Flame** or **Swirl** for effect icons; and the coat of a skin: **Fur**, **Scales**, **Smooth**, **Stone** or **Slime**.
- **Detail**: **Smooth**, **Normal** or **Rough**, how much speckle the shading has.

Six variations are shown at once (a particle shows "4 frames" under each). They are the same picture with six different seeds. Click one, then **Use this picture**. **New looks** shows six more; **Cancel** closes the window and changes nothing. If nothing can be drawn at the field's size, the window says "Nothing can be drawn at W by H pixels yet. Paint it or choose a picture instead."

Each pick is one undo step: **Edit > Undo** puts the old picture back, or removes a new one. A picture drawn for an empty slot becomes a new texture and the slot names it.

In **Very easy mode** the window is shorter. The thing being drawn is chosen from where you are, so you only pick the **Colour** and one of the six variations.

## Where the pictures come from

The recipes are grouped in families:

- **Blocks**: stone, polished stone, cobblestone, bricks, pillars, ores (stone or deepslate), storage blocks, planks, logs and bark, leaves, doors and trapdoors, saplings and crops, portals, dirt, grass, sand and gravel, and a plain tile. They tile, so a wall of them has no seams, and they have no outline.
- **Items**: gems, ingots, discs, spawn eggs, tools, weapons, bows and crossbows with their pulling pictures, shields, bottles, totems, fruit, seeds and produce. Items have a dark outline.
- **Worn and mob pictures**: the armour layers, horse and wolf armour, and skins painted on a model's boxes.
- **Icons and particles**: the effect icon and the four particle looks (spark, orb, puff and leaf).

Each picture is decided by what it is, its colours, finish, detail and a number called the seed. The same choices always give the same picture, and a different seed gives a different one. Creator flows and examples pick a seed from the picture's own path, so two swords in one project differ, and the same project always draws the same pictures. Nothing is stored in the project but the PNG.

## Draw a skin

The Entity Studio has **Draw a skin** beside the texture picker (Very easy: **Draw its skin**). It draws the mob's skin on the boxes of its own model: each face is shaded by the way it faces, with eyes on the face and a second colour for the belly and spots. The window asks for the coat (**Fur**, **Scales**, **Smooth**, **Stone** or **Slime**), **Colour**, **Second colour** and **Detail**, then shows six variations; **Use this skin** writes the picture over the texture the mob names, or makes a new one in the mob's namespace and names it, as one undo step. See [Entities and models](entities-and-models.md#the-entity-studio).

The button is greyed out, with the reason beside it, when there is nothing to draw on: "Choose a model first.", "The model is not part of this project.", "This model's faces are mapped one by one" (the model gives each face its own place on the picture, so there are no boxes to shade) or "This model has no boxes to draw on." Use **Draw…** on the texture for an even coat instead.

## Particle frames

In the Particle Studio, **Draw frames…** draws all four frames of a spark, orb, puff or leaf in one step, in your colour, and replaces the frame list. One **Undo** brings the old frames back ([Particles](particles.md#pictures)).

## New texture from a drawn picture

**New texture…** (the brush beside the namespace's assets heading) asks **Start from**: **Blank** or **Drawn picture**. With a drawn picture the button reads **Draw…**; you pick the look in the same window, and the picture opens in the texture painter to change before you **Save**. Paintings start blank: "Paintings start blank."

## Draw it for me in Very easy mode

Wherever a picture can be made in Very easy mode, **Draw it for me** replaces **Draw…**. Pick the **Colour**, pick one of the six variations and **Use this picture**. The mod's own things are already drawn when you make them ([Very easy mode](very-easy.md)); this is for choosing another look afterwards.

## Drawing, painting, Picture to texture and Make with AI

Four ways to get a picture, which you can mix:

- **Draw…** makes a picture in the Minecraft-like style from a recipe. It works offline and costs nothing.
- **Paint this texture** (the texture editor) changes any picture pixel by pixel. Paint over a drawn picture to restyle it ([Replacing the placeholders](creator.md#replacing-the-placeholders)).
- **Picture to texture** turns a picture of your own into a texture ([Picture to texture](creator.md#picture-to-texture)). It does not make the picture look like Minecraft.
- **Make with AI** makes a picture from a description with your own key ([AI pictures](ai-pictures.md)). Its clean-up uses the same shades as drawn pictures.

## Limits

- **Vanilla-like, not vanilla.** The pictures are in the same style, not the same pixels. MCSuperMods never copies, recolours or learns from Minecraft's textures. To get an exact look, paint it, use Picture to texture or Make with AI.
- **Paintings keep their placeholder landscape.** A painting is your own picture, so the Painting flow's default picture is unchanged. Choose your own with **Choose picture…**.
- **Vanilla mob variant skins are an even coat.** A wolf, cat or pig variant drawn by a flow has fur shading but no eyes or markings in place, because their layout belongs to Minecraft's own models. Paint it or use Picture to texture.
- **Draw a skin needs a model with boxes.** A model that maps its faces one by one gives the button greyed out (see above).
- **Nothing is redrawn by itself.** Projects you made before keep their pictures. Only what flows make from now on is drawn, and **Draw…** or **Edit in Creator** redraws one on request.
- **Some sample pictures stay flat.** A few pictures in the repository's sample fixtures are made by tests with the old flat patterns and are unchanged. Everything a flow, starter or example makes is drawn.
- **16 by 16 only.** Drawn pictures are the size of Minecraft's own: 16 by 16 for blocks and items, with the worn, icon and particle sizes of the game. There are no high-resolution drawn pictures.
- **Only particles are animated.** A drawn portal surface is one picture and does not swirl.

## Where next

- [The Creator](creator.md): the flows that draw their pictures.
- [Blocks and items](blocks-and-items.md): the Block and Item Studios.
- [AI pictures](ai-pictures.md): pictures from a description.
