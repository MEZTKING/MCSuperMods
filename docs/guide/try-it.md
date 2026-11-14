# Try it

**Try it** is a small test area inside MCSuperMods. You walk or fly around in it, put down and break your blocks, see how they look in every state, open your doors, grow your crops, hatch your mobs and watch your particles. It opens at once, needs no Minecraft, no launcher and no account, and it changes as you edit.

It is a preview, not the game. A strip across the top always says **Preview, not the real game.**, with a **Play in Minecraft** button for the real check ([Playing and testing](playing-and-testing.md)). Walking is roughly right, mobs only wander, and commands, redstone, survival and world generation are not there. The full list is under [Limits](#limits).

## What it is

- A flat floor of 48 by 48 blocks, with room for 32 blocks of height above it. You stand in the middle.
- Your project's blocks and spawn eggs are in the hotbar. Minecraft's own blocks can be placed too, for looks only.
- A clock runs the area 20 times a second, as the game does: buttons let go, pressure plates spring back, mobs wander and particles fly. You can pause it and step it.
- **What happened** lists what the area did, and what it could not do ("Only in Minecraft: …").
- Nothing is saved. The area stays while the project is open, also when you switch to a Studio and back; closing or changing the project clears it.

## Open it

- **Try it** in the toolbar, before **Play**. It is there in all three modes, Very easy included.
- **View > Try it**, or **F6**.
- **File > Try it**.
- The command palette: "Try it: walk around your blocks and mobs in the app".

The first time, a card says what is real, rough and missing here, with a link to this page. **Got it** closes it for good. Choosing a thing in the sidebar or **Home** leaves Try it; the area is kept.

Try it needs WebGL. Without it the view says "Preview unavailable: WebGL is disabled." and offers **Play in Minecraft** instead.

## Keys

Click the picture first, so it takes the keys. Every mouse action also has a key, so the area works without a mouse.

| Keys | What they do |
|---|---|
| W A S D | Walk |
| Space | Jump; while flying, go up |
| Space twice, or F | Fly, or stop flying |
| Shift | Sneak; while flying, go down |
| Mouse or arrow keys | Look around (click the picture first; Esc frees the mouse) |
| Left click or X | Break a block or hit a mob |
| Right click or C | Place, open a door, press a button or hatch a spawn egg |
| 1 to 9 | Choose a hotbar slot |
| E | Choose what is in the slot |
| G | Grow the block you point at |
| P | Power the block you point at |
| Z | Pause the clock, or start it again |
| N | Move the paused clock on by one twentieth of a second |
| F6 | Open Try it |

The same list is under **Keys** beside the picture.

Right click or C uses a door, trapdoor, fence gate or button you point at, even while you hold a block; sneak (hold Shift) to place against it instead. With a spawn egg in the hand it hatches the mob; with a block it places the block. A block is not placed where it would be inside you or a mob ("… was not placed: you or a mob stand where it would go.").

There is no sprinting. Sneaking is slower walking and does not stop you at an edge. Flying stops when you land. Invisible walls stand at the edge of the area, and a ceiling 8 blocks above it.

## The hotbar and the picker

The hotbar holds your project's blocks first, then the spawn eggs of your mobs, in the order of their ids. **Choose…** (or E) opens the picker for the selected slot: **Your blocks and spawn eggs**, and **Minecraft blocks, for looks only**, with a **Find** box. Minecraft's blocks need your Minecraft folder ([Getting started](getting-started.md#2-first-launch-tell-mcsupermods-where-minecraft-is)); without it the picker says "Set up your Minecraft folder to place Minecraft's own blocks as props." with **Set it up**.

When you change a block in its Studio, Try it picks the change up a moment later: a new name, picture, shape or model shows in the hotbar and in the placed blocks, and the blocks stay where they are. A block you delete from the project is taken out of the area ("<Name> is no longer in the project; it was taken out of the preview.").

## The tools and the clock

Beside the picture:

- **Grow** (or G) moves the crop or sapling you point at up one stage ("<Name> grew to stage N of M", then "<Name> is fully grown"). A sapling never becomes a tree here.
- **Power** (or P) turns the `powered` picture of the block you point at on or off, or its `lit` picture when it has no `powered` one ("<Name> is now powered"). It changes that block's own picture only: nothing travels to other blocks.
- **Clear the area** removes every block and mob and says "You cleared the area."
- The **Clock**: **Pause** and **Go on**, **Step** (one twentieth of a second while paused) and **Speed** (from a quarter of normal speed to 8 times).
- **Smaller picture (faster)** draws at half the size. It is on by default when your computer draws without a graphics card.

Doors, trapdoors and fence gates open and close with C. Iron and gold doors and trapdoors do not open by hand ("Iron Door does not open by hand; it needs a redstone signal"). Buttons let go after 1.5 seconds (wooden ones) or 1 second, or after their own press time. Pressure plates stay pressed while you or a mob stand on them and let go 1 second after (weighted plates half a second).

Slabs, stairs, walls, fences, panes, doors and the other block types place and join as their type says ([Block types, families and plants](block-types-and-plants.md)): a slab becomes a double slab, stairs turn their corners and fences join their neighbours.

## Mobs, particles and portals

- **Mobs.** Hatch a mob from its spawn egg. It wanders: it stands for 2 to 6 seconds, walks for 1 to 4 seconds in a random direction (about 2.5 blocks a second at a speed of 0.25) and stops at walls. Flyers hover 1.5 to 4 blocks above the ground; swimmers stand still; amphibians walk. A plate over each nearby mob shows its name and "wanders only in the preview". A hit removes it at once. At most 24 mobs fit in the area. Mobs play their walk animation (fly for flyers) while they move and their idle animation otherwise, as in the Entity Studio's preview. A mob without a model is drawn as a box of its size.
- **Particles.** A block's **Ambient particles** play near it (within 32 blocks of you), and your own particles look as in the Particle Studio. Minecraft's particles are small dots (dust in its colour). Particles pass through blocks. At most 500 are shown at once.
- **Portals.** A portal block shows its picture and particles, but does not take you anywhere, and is placed as a plain block, without a frame ("<Name> is lit in its frame and takes you to another dimension; the preview places it as a plain block").

## What happened

**What happened** lists the newest lines first: what you placed, broke, spawned and hit, what grew or was powered, and what was refused. Lines in the warning colour start with **Only in Minecraft:**. They name something your project has that Try it does not run, for example:

- "Only in Minecraft: Glow Golem's health, hurting, death and drops; a hit in the preview removes it"
- "Only in Minecraft: how the vanilla particle minecraft:dust looks; the preview shows a small dot"
- "Only in Minecraft: Maple Sapling grows into a tree"

Each is said once. Press **Play in Minecraft** to see those parts in the game. The list keeps the last 200 lines.

## Limits

Try it runs MCSuperMods' own simulation, not Minecraft. What it cannot show:

| What | In plain words |
|---|---|
| **A pass here is not a pass in the game** | Try it is our own approximation. Always check in Minecraft with **Play** before you share a mod. |
| **Walking is approximate** | Walking, jumping and flying feel close, not identical. There is no sprinting, no water, no ladders, no ice and no slime. |
| **Mobs only wander** | No attacks, targets, taming, breeding, riding or boss fights. A hit removes a mob; there is no health or death. |
| **No commands or functions** | Nothing runs commands or functions. |
| **No scripts or rules yet** | Your events, rules and scripts do not run in Try it yet; a later version runs plain rules first. Use **Play**. |
| **No redstone** | **Power** changes one block's own picture; nothing travels along dust, and powering a block runs nothing. |
| **No light, shadows or liquids** | A glowing block looks the same lit or unlit around it. There is no water or lava. |
| **No survival** | No health, hunger, damage, armour, mining speed, tool wear, drops or loot. Blocks break at once and drop nothing. |
| **Growth only with Grow** | Crops and saplings grow only when you use **Grow**. Saplings never become trees, leaves never fall and crops plant on anything. |
| **Minecraft's blocks are props** | They are drawn and solid, nothing more: chests do not open and pistons do not move. |
| **Containers and machines do not open** | Their windows are Minecraft's own menus and are not shown here. |
| **Portals do not take you anywhere** | There are no other dimensions here, and frames are not checked. |
| **Minecraft's looks need your Minecraft folder; sounds are not played** | Minecraft's pictures are never shipped with MCSuperMods. Without your Minecraft folder, project blocks that build on Minecraft's models use MCSuperMods' own simple shapes and Minecraft's blocks cannot be placed. Try it plays no sounds. |
| **Needs WebGL** | Without it, Try it says so and offers **Play in Minecraft**. |
| **A small area that is not saved** | 48 by 48 blocks, 32 high, so it stays fast on any computer. Placing stops at the edge, and the area is cleared when you close the project. |
| **Animations as in the preview** | Mobs move as in the Entity Studio's preview: smooth steps are straight lines and Molang counts as 0. GeckoLib plays more in the game. |
| **Pictures** | Animated pictures show their first frame; pictures larger than 16 by 16 are cut down to 16 by 16. |
| **Other plugins' blocks** | A block from a third-party plugin is drawn from its files, but its own behaviour does not run. |

The tests check what Try it does (counts, states, what you point at), and that it draws something, not exactly how it looks. If a picture looks wrong in Try it but right in the game, the game is right.
