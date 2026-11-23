# Block sounds

Every block makes sounds: when it breaks, when you walk on it, when you place it, while you mine it and when something lands on it. Doors, trapdoors, buttons and pressure plates also sound when they open, close, are pressed and are let go. MCSuperMods gives a block the sounds of one of Minecraft's materials by default, and you can give it sounds of its own: any of Minecraft's sounds, or sounds of your project made from your own Ogg files.

Own block sounds and door sounds are part of the Fabric mod: export the **Fabric mod jar** ([Blocks and items](blocks-and-items.md#export-a-fabric-mod-jar)) or use **Play** ([Playing and testing](playing-and-testing.md)). They need the runtime of this release.

## The sound type

The Block Studio's **Light and sound** section has **Sound type**: the material whose sounds the block makes (empty: stone; a portal: glass). The list holds every sound type of the project's Minecraft version, such as wood, grass, amethyst, glow lichen or big dripleaf. **Problems** refuses a name the version does not have (`blocks-items.sound-type-unknown`), because the game would refuse the block.

## How it sounds

The **How it sounds** section, after **Light and sound**, gives the block its own sounds. Each line is a Minecraft sound or one of this project's, picked from a list; an empty line keeps the sound type's sound for that moment:

- **When it breaks**
- **When you walk on it**
- **When you place it**
- **While you mine it**
- **When something lands on it**

**Volume (0 to 10; empty: the sound type's)** and **Pitch (0.25 to 4; empty: the sound type's)** change all five together. A pitch of 1.5 sounds higher, 0.8 lower.

A sound of your own lives in the project's **Sounds** element, made from Ogg files you import ([Your own sounds](blocks-and-items.md#your-own-sounds)). **Problems** warns when a line names a sound that is neither Minecraft's nor the project's (`blocks-items.block-sound-unknown`): nothing would play.

## Door, trapdoor, button and plate sounds

A door, trapdoor, button or pressure plate has a **Set type** in its Type section ([Block types, families and plants](block-types-and-plants.md#change-a-block-s-type)): it picks the sounds and the rules, such as whether a hand opens it. In **How it sounds**, **Own door sounds** (**Own trapdoor sounds**, **Own button sounds**, **Own plate sounds**) builds a set type for this block alone, starting from the one the Type section names ("instead of the wood set type's"):

- a door or trapdoor: **When it opens**, **When it closes**, **Opened by hand** and **Opened by a wind charge** (empty: as by hand);
- a button: **When it is pressed**, **When it is let go** and **Arrows press it**;
- a pressure plate: **When it is pressed**, **When it is let go** and **What presses it**: **Anything presses it, items too (like wooden plates)** or **Only mobs and players press it (like stone plates)**.

Anything left empty is the set type's. So an iron door that opens by hand, or a wooden door with an iron door's clang, is a set type of its own. A button made of stone lets go after 20 ticks, as a stone button does; give it **Press time (ticks)** in its Type section for another time.

The Creator's **Wood set** flow ([The Creator](creator.md)) asks **Door and trapdoor sounds**: **As the kind of wood**, **Heavy metal, as an iron door**, **Light metal, as a copper door** or **A soft thud, as a barrel**. **Own door sound** takes an Ogg Vorbis file of your own (at most 4 MB): it plays as they open, and a little lower as they close. A fence gate keeps the sounds of its **Wood type**.

## Hear a sound

Every line of **How it sounds** has a **Play** button once it names a sound: it plays the sound at the block's own volume and pitch, and for an event with several files it picks one by their weights, as the game does. Press it again (**Stop**) to stop; one sound plays at a time. **Play** is also beside every other sound you pick (the Studios' sound fields, the sound slots of Rules, the Creator's song field) and on every event and file of the **Sounds** element's **Preview** ([Live views](live-views.md#hear-every-sound)); in Very easy mode, **My things** lists your sounds under **Particles and sounds**.

Your own sounds always play. Minecraft's own sounds are read from your Minecraft folder when you press **Play**, never copied into your project; without your Minecraft folder set up, their button is off and offers **Find my Minecraft**. A sound here is heard flat: no distance, no echo and no sound category volume. Walking, landing and mining sounds are heard in the game.

## Templates and examples

**Add element** (Ctrl+N), category **Blocks**: **Block with its own sounds** (a block that sounds like amethyst, a little higher) and **Door with its own sounds** (a wooden door that opens by hand but sounds like an iron door). The sample project `fixtures/sample-plants-and-storage` has a chiming stone and a creaky door ([Templates, starters and examples](templates-and-examples.md)).

## Minecraft 26.3 and 26.4

On 26.3 the sounds are part of the block. On 26.4 a block's sounds are a data entry that the game reads when a world opens, so MCSuperMods writes one for each block with own sounds, filling the moments you leave empty from its sound type. On 26.4:

- **a change shows after the world is opened again**; the section says "On this version of Minecraft a change to these sounds shows after the world is opened again.";
- a pitch above 2 plays as 2, and a volume of 0 plays almost too quietly to hear instead of muting it: **Problems** warns about both (`blocks-items.block-sounds-range`); leave out a sound you do not want instead;
- a missing data entry is silent in the game, and the game log warns about it once at each world start.

## Problems it reports

| Code | Level | Meaning |
|---|---|---|
| `blocks-items.sound-type-unknown` | Error | **Sound type** is not one the Minecraft version has. |
| `blocks-items.block-sound-unknown` | Warning | A sound is neither Minecraft's nor one of the project's. |
| `blocks-items.block-sounds-range` | Warning | On 26.4, a pitch above 2 or a volume of 0. |
| `blocks-items.block-sounds-partial` | Warning | On a version where MCSuperMods does not know the sound type's own sounds, the moments you left empty are silent. |
| `blocks-items.set-type-field-unused` | Info | A set type field the block never uses, such as a door's press sound. |

## Limits

- **Fabric mod jar only.** Vanilla packs keep the block's models and names but not the block, so its sounds go with it.
- **Restart needed** for a new block. On 26.4 a change of sounds needs the world opened again; on 26.3 a restart.
- **Signs sound like their wood type**, and a fence gate like its **Wood type**.
- **Try it** shows own sounds as captions when you place, break and open things; walking, mining and landing sounds are only in the game ([Try it](try-it.md)).
- **Heard flat in the app.** **Play** has no distance, echo or sound category volume, and Minecraft's own sounds need your Minecraft folder set up.
- **Hear it in the game.** How a sound feels is an in-game check: Play, walk on the block, break it and open the door.

The other chapters are listed in the [user guide](/).
