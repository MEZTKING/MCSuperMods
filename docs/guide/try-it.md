# Try it

**Try it** is a small test area inside MCSuperMods. You walk or fly around in it, put down and break your blocks, see how they look in every state, open your doors, grow your crops, hatch your mobs and watch your particles. It opens at once, needs no Minecraft, no launcher and no account, and it changes as you edit.

It is a preview, not the game. A strip across the top always says **Preview, not the real game.**, with a **Play in Minecraft** button for the real check ([Playing and testing](playing-and-testing.md)). Walking is roughly right, mobs only wander, commands are checked and logged but not carried out in the world, your scripts run in a closed-off sandbox with the game's own parts left out, and redstone, survival and world generation are not there. The full list is under [Limits](#limits).

## What it is

- An area of 48 by 48 blocks, 32 high. It starts on a plain grid floor; you can start on a flat world, a quick landscape or an area of one of your own worlds instead ([Grounds](#grounds)). You stand in the middle.
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
| T or / | Open the chat box (/ starts a command) |
| F6 | Open Try it |

The same list is under **Keys** beside the picture.

Right click or C uses a door, trapdoor, fence gate or button you point at, even while you hold a block; sneak (hold Shift) to place against it instead. With a spawn egg in the hand it hatches the mob; with a block it places the block. A block is not placed where it would be inside you or a mob ("… was not placed: you or a mob stand where it would go.").

There is no sprinting. Sneaking is slower walking and does not stop you at an edge. Flying stops when you land. Invisible walls stand at the edge of the area, and a ceiling 8 blocks above it.

## The hotbar and the picker

The hotbar holds your project's blocks first, then the spawn eggs of your mobs, then your vehicles and the buckets of your fluids, in the order of their ids. **Choose…** (or E) opens the picker for the selected slot: **Your blocks, spawn eggs and vehicles** (a fluid's bucket is listed there, not its liquid block), and **Minecraft blocks, for looks only**, with a **Find** box. Minecraft's blocks need your Minecraft folder ([Getting started](getting-started.md#2-first-launch-tell-mcsupermods-where-minecraft-is)); without it the picker says "Set up your Minecraft folder to place Minecraft's own blocks as props." with **Set it up**.

When you change a block in its Studio, Try it picks the change up a moment later: a new name, picture, shape or model shows in the hotbar and in the placed blocks, and the blocks stay where they are. A block you delete from the project is taken out of the area ("<Name> is no longer in the project; it was taken out of the preview.").

## The tools and the clock

Beside the picture:

- **Grow** (or G) moves the crop, sapling, berry bush, pod or stem you point at up one stage ("<Name> grew to stage N of M", then "<Name> is fully grown"). A sapling never becomes a tree here.
- **Power** (or P) turns the `powered` picture of the block you point at on or off, or its `lit` picture when it has no `powered` one ("<Name> is now powered"). It changes that block's own picture only: nothing travels to other blocks.
- **Water** puts water into the block you point at, or takes it out, when that block can hold water ([Waterlogging](#climbing-and-water)).
- **Explode** sets off an explosion at the block you point at. It breaks the blocks within 2.5 blocks. Your place and explosion rules hear it when they have no condition, or only "caused by".
- **Time and commands**, a small panel beside the picture, has **Time-lapse a day**, **Chat** and the list of your project's commands. **Time-lapse a day** lets one whole in-game day of ageing go by at once, so blocks that weather change stage ([Climbing and water](#climbing-and-water)). The panel also says how many blocks here can age.
- **Clear the area** removes every block and mob and says "You cleared the area."
- The **Clock**: **Pause** and **Go on**, **Step** (one twentieth of a second while paused) and **Speed** (from a quarter of normal speed to 8 times).
- **Smaller picture (faster)** draws at half the size. It is on by default when your computer draws without a graphics card.

Doors, trapdoors and fence gates open and close with C. Iron and gold doors and trapdoors do not open by hand ("Iron Door does not open by hand; it needs a redstone signal"). Buttons let go after 1.5 seconds (wooden ones) or 1 second, or after their own press time. Pressure plates stay pressed while you or a mob stand on them and let go 1 second after (weighted plates half a second).

Slabs, stairs, walls, fences, panes, doors and the other block types place and join as their type says ([Block types, families and plants](block-types-and-plants.md)): a slab becomes a double slab, stairs turn their corners and fences join their neighbours.

## Grounds

What the area stands on. Choose it in the first-run card (**Start on:**) or with **Change ground…** under **Ground** in the side panel. Changing the ground replaces the whole area, so when you have placed blocks or hatched mobs, Try it asks first (**Replace the area** or **Keep my area**). **Clear the area** takes away what you placed and brings the ground back as it was loaded.

- **Grid**: MCSuperMods' own floor, with nothing in the way of your blocks. The default.
- **Flat world**: bedrock, two layers of dirt and grass, like a superflat world.
- **Quick world**: a small landscape you set up:
  - **Shape**: Flat, Gentle hills, Island in water or Valley.
  - **Layers, top to bottom**: a block (chosen in the picker) and a thickness for each. The thickest layer stretches with hills and valleys (it says "(stretches)"); on flat land the layers stack exactly.
  - **Water**: on or off, and its **Level**. Grass and dirt by the water turn to sand.
  - **Trees**: None, A few or Many. Simple oak trees of MCSuperMods' own shape, only on grass, dirt and similar soil above the water.
  - **Seed**: the same seed always makes the same world; **New seed** picks another.
  - **Presets**: Classic flat, Island, Hills and Sandbox. **Save as my preset** keeps your settings under a name, on this computer for you, not in the project.
- **From my world**: an area copied from one of your own saves. Pick a world from the list (its picture, name, game folder and when it was last played; worlds that cannot be read are greyed out with the reason), then the centre: **The world spawn**, or **Here:** with a block X and Z. The area is 48 by 48 around the centre and 32 high, from 8 blocks below the ground there. Your save is only read, never changed, and a world that is open in Minecraft can still be read. What was left out (chests' contents, signs, mobs, chunks not generated yet) is listed in **What happened**.

Minecraft's blocks in a ground are props (see [Limits](#limits)). With your Minecraft folder set up they show their real pictures; without it the terrain (stone, dirt, grass, sand, gravel, cobblestone) and the wood (planks, logs, leaves) show as MCSuperMods' own drawn pictures and other blocks are plain coloured cubes, and the panel says so with a **Set it up** link. Water and lava are always drawn as plain see-through blocks.

## Signs, beds and the new blocks

The block types added with the vanilla parity batch ([Block types, families and plants](block-types-and-plants.md)) work in Try it like this:

- **Cakes.** Each use eats one slice, until the cake is gone. **Candles** are lit by hand, and sea pickles and layers stack as you place more of them on the same block.
- **Berry bushes.** Using one picks the berries.
- **Tall plants and beds** are placed as two halves, and you can lie in a bed.
- **Vines, cocoa pods and stems.** A stem grows its fruit next to it, one stage at a time with **Grow**.
- **Torches and signs on walls**, **hanging signs** (sneak while placing for the attached look), **lanterns**, **chains** and **rods** place and turn as their type says.
- **Scaffolding** places in rows and columns, at most six blocks out from its support.
- **Signs.** Using a sign opens the sign writing screen, marked **Mock-up**: **Line 1** to **Line 4**, **Colour**, **Glowing**, **Wax it** and **Done**. **Done** writes the text onto the sign, and a plaque shows how it reads. It is a mock-up of the game's own screen.

## Climbing and water

- You climb **ladders**, **vines**, **scaffolding** and every block in `#minecraft:climbable`: walk into one and hold Space to go up, sneak to hold on.
- **Waterlogging.** Placing a block that can hold water into water gives a waterlogged block, the **Water** tool puts water into such a block or takes it out, and breaking leaves still leaves the water.
- **Weathering.** A block that ages changes stage on its random ticks, which is slow (about half an hour of real time for a stage), or at once with **Time-lapse a day**. A block at a lower stage within 4 blocks stops it. Waxed blocks never age.

## Bags

An item with an inventory opens a mock-up bag screen when you use it: rows of slots, or the hopper shape (one row of five) or the dispenser shape (three by three). The bag's own hotbar slot is locked while it is open. A bag that **opens only while you sneak** says so when you use it without sneaking. Items do not move in the preview. Bundles are said out loud in **What happened**; they are not opened.

## The chat box

Press **T**, or **/** to start a command, or use **Chat** in the **Time and commands** panel. The player is named Player and counts as an operator.

Your project's commands are checked the way the game checks them, with its messages and the `<--[HERE]` pointer where a line goes wrong. A command that reads runs in the game's order:

1. its function (only in Minecraft),
2. the command's event,
3. scripts that listen for it (only in Minecraft),
4. the feedback.

A Rules command trigger runs its own event first, then says the event it calls, for example "Ran /greet's event "wave" too.". Commands are logged in **What happened**, not shown in the area.

## Mobs, particles and portals

- **Mobs.** Hatch a mob from its spawn egg. It wanders: it stands for 2 to 6 seconds, walks for 1 to 4 seconds in a random direction (about 2.5 blocks a second at a speed of 0.25) and stops at walls. Flyers hover 1.5 to 4 blocks above the ground; swimmers stand still; amphibians walk. A plate over each nearby mob shows its name and "wanders only in the preview". A hit removes it at once. At most 24 mobs fit in the area. Mobs play their walk animation (fly for flyers) while they move and their idle animation otherwise, as in the Entity Studio's preview. A mob without a model is drawn as a box of its size.
- **Particles.** A block's **Ambient particles** play near it (within 32 blocks of you), and your own particles look as in the Particle Studio. Minecraft's particles are small dots (dust in its colour). Particles pass through blocks. At most 500 are shown at once.
- **Portals.** A portal block shows its picture and particles, but does not take you anywhere, and is placed as a plain block, without a frame ("<Name> is lit in its frame and takes you to another dimension; the preview places it as a plain block").

## Traders, fluids and skies

- **Traders.** Use a mob that has **Trades with players** and a **Merchant** screen opens, marked as a mock-up, with its level and an experience bar, each offer's price, second price and product, and **Out of stock** with a cross when an offer is used up. Click an offer to trade once; Shift and click trades until it runs out; **Esc** or **E** closes. The trader levels up at the villager's thresholds (or your own **Trading XP to reach the next level**), draws the next level's offers, restocks once per half day of the area's clock (**Time-lapse a day** moves it) unless **Restocks** is **Never**, and runs **On trade** after each trade. A monster refuses to trade at night, by the area's own time of day, which starts at 1000 and moves with the clock. **In the preview nothing is paid and nothing is given.** Prices that change with demand or reputation, babies, angry and ridden mobs, the game's own lead, name tag and egg uses, trades borrowed from vanilla villagers that the preview cannot read, villagers taking your job at its workbench, mob storage and shoulder pets are said once in **What happened**, not shown.
- **Fluids.** A fluid's bucket is in the hotbar and the picker. Using it pours **one source block** of the fluid where a block would go: drawn with its still picture on top, the flowing picture's quarter on the sides and its colour (a coloured see-through pane when it has no pictures). **The fluid does not flow in the preview**; the log says how it flows in the game, in words ("spreading a block every 0.25 seconds, up to 7 blocks out, finding a way down 4 blocks away, and two sources side by side make a new one"), and says that the bucket empties and fills again, and the light it gives. You walk through a fluid as through air; each thing standing in it runs **While a mob or player is in it** at most every 10 ticks, and the log says how it would swim, drown or burn in the game.
- **Skies.** When your project has a dimension type of its own that a dimension uses, the side panel has **Sky**: **The preview's own**, or "<Name>'s sky". It shows that dimension's **sky colour** behind the area. There is no sun, moon, clouds, stars or night in the preview, and the other settings of the type (fog, light, time, beds) are only in the game.

## Vehicles

Your vehicles are in the hotbar after your mobs. Use a vehicle item to place it where the floor allows its `places_on` (ground, water or anywhere) and a free box. Then:

| Keys | What they do |
|---|---|
| C or right click on it | Get in (always the driver's seat) |
| Shift | Get out |
| W A S D | Drive |
| Space and Left Alt | Climb and descend (hovering vehicles) |
| X or left click | Hit it (1 damage) |
| Shift + X | Pick it up |

A panel **Vehicle** shows **Speed**, **Health** and **Fuel**, with **Get in**, **Get out**, **Fill the tank** and **Repair** for the game's fuel and repair items, which are rarely in the hotbar. Driving follows the same numbers as the game's physics (a test pins both against one file). The camera sits in the driver's seat, or at the vehicle's third-person distance. A surface vehicle without a turret turns your look with it.

What only the game does is said once per vehicle type in **What happened**: weapons and firing, storage, paints, explosions, immunity, ram damage, engine and horn sounds, the dashboard, and vehicles being solid. Firing is logged, not shown.

## Keys and the screen

A key of your own does its events when you press it in Try it: the key bind's **When it works**, cooldown and repeat interval apply. The list under **Keys** adds "<Name> (your key)". A key on one of Try it's own keys (Z, X, C and so on) wins, and a line says so. Presses are ignored while a screen is open, and a refused press writes a "skipped" line saying why. The game's R, V and H in a vehicle say "Only in Minecraft".

Your on-screen elements are drawn over the picture at the game's automatic GUI scale, laid out by the same rules as the HUD Studio. **Set by rules** values, the player's x, y and z, and a vehicle's fuel, health and speed are real. The player's health, food and air show 20, armour and level 0, and a vehicle's ammunition and reload, scores and saved data are said once and show only what a step sets. The vehicle dashboard shows weapons always ready.

## Scripts and logic rules

**Scripts.** Your project's scripts run in Try it, in a sandboxed worker that has no network, no files and no timers of its own. They hear the events the preview fires: a right click on a block, breaking, placing, using an item, using a mob, an explosion from the **Explode** tool, a mob's death (after a hit), commands and chat from the chat box, the server and player ticks, and the start of the area. A script that cancels a click, a break or a place decides it, as in the game.

- What the script does shows in **What happened** under the script's name: blocks it sets, particles, sounds, items it gives you, and what it stores.
- A script's message shows as `The script <id> says to you: "..."` in **What happened**, and as a chip above the hotbar. It does not go in the chat box.
- A member that needs the game is said once as "Only in Minecraft: <Member>, used by the script <id>" and does nothing.
- Events the preview never fires are said once per script, with the reason: a mob's hurt and damage (mobs have no health here), respawn, leaving, dimension changes, keys and vehicles.
- The effects of `run_script` and of events you cannot cancel show a moment after the event's other actions, a few milliseconds later. This is an approximation.
- A call that runs for more than 2 seconds is stopped. **What happened** says "... ran for more than 2 seconds (an endless loop?), so the preview stopped the scripts and started them again; their waiting msm.schedule calls were dropped."
- What a script stores is kept while the project is open, also when the scripts start again.

**Logic rules.** A rule with checks, chances, repeats, waits or "for each player" runs in the same sandbox and says its steps in **What happened** under the rule's name, for example `Rule "Try your luck" checked its "if": true, so its "then" steps ran.`

- The steps are named by what they are, not by a number: "only if", "if" (then or otherwise), chance, repeat, "for each player", wait. A step after a wait says so ("waits 2 seconds (40 ticks of the preview's clock)", "waited 2 seconds and goes on").
- A chance follows **Run every time**: with it on, a chance always comes up; otherwise it is decided by a seeded roll, the same each time you open Try it, not the game's own random.
- "For each player" only ever finds you, so it runs for 1 player.
- A tick rule whose "only if" is false says so once, not every tick.
- An error stops only that rule and names it and the step it reached: `Rule "<name>" failed after its wait of 2 seconds: ...`
- What the rule did is said under its name: "gave you 1 Ruby", "played sound ...", "says to you", "set ... at x, y, z", "showed 4 ... particles", "set its counter ... to ...". A rule step the preview cannot do is said as "Only in Minecraft: <Member>, used by rule "<name>"".
- The "Mob drops a reward" template cannot be seen running here, because Minecraft's own zombies cannot be spawned in Try it. Use **Play**.

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
| **Walking is approximate** | Walking, jumping and flying feel close, not identical. There is no sprinting, no flowing water, no ice and no slime. Ladders, vines and scaffolding can be climbed. |
| **Mobs only wander** | No attacks, targets, taming, breeding, riding or boss fights. A hit removes a mob; there is no health or death. |
| **Commands and explosions are logged** | The chat box checks your commands and runs their events, but the result is a line in **What happened**, not something in the area. Functions and scripts that listen for a command run only in the game. An explosion breaks blocks; its damage, pushing, drops, fire, sound and smoke are only in the game. |
| **Vehicles and keys are rough** | Vehicles drive by our own simulation and fire nothing you can see; keys and on-screen elements follow the rules above, with the exceptions listed there. |
| **Scripts and rules run in a sandbox** | Your scripts and your rules run (see [Scripts and logic rules](#scripts-and-logic-rules)), but what needs the game (health, other worlds, anything outside the area) is said as "Only in Minecraft" and does nothing. A call that runs for more than 2 seconds is stopped. Events the preview never fires (hurt, damage, respawn, leaving, dimension changes, keys on vehicles) do not reach your scripts. Their effects can show a moment after the event's other actions. A chance in a rule follows **Run every time**, or a seeded roll, not the game's random. Use **Play** for the real check. |
| **No redstone** | **Power** changes one block's own picture; nothing travels along dust, and powering a block runs nothing. |
| **No light, shadows or liquids that flow** | A glowing block looks the same lit or unlit around it: light is not drawn, its level is only said. Water and lava in a ground are drawn as plain see-through blocks. Water does not flow, and you walk through it as through air. A fluid of your own pours as one block and stays where you pour it; how it flows, swims, drowns and burns are said, not shown. |
| **Traders pay nothing** | The merchant screen is a mock-up: no emeralds are taken, nothing is given, and prices do not change with demand or reputation. Villagers taking a job, mob storage and shoulder pets are only said. |
| **Only the sky colour** | The **Sky** choice shows a dimension type's sky colour, not its sun, moon, clouds, fog, light, time or rules. |
| **Nothing checks support** | Torches, vines and pods can float, and you cannot stand on scaffolding, which does not fall when what holds it is broken. |
| **Ageing and waxing** | Doors age half by half. Honeycomb waxing and axe scraping are only in the game. |
| **Signs and bags** | Glowing ink is drawn as a box. Bundles are not opened, and bags move no items. |
| **Other rule parts** | Rule conditions and steps Try it does not know are said as "Only in Minecraft" and run only in the game. Local `^` coordinates count from the feet. |
| **No survival** | No health, hunger, damage, armour, mining speed, tool wear, drops or loot. Blocks break at once and drop nothing. |
| **Growth only with Grow** | Crops and saplings grow only when you use **Grow**. Saplings never become trees, leaves never fall and crops plant on anything. |
| **Minecraft's blocks are props** | They are drawn and solid, nothing more: chests do not open and pistons do not move. |
| **Containers and machines are mock-ups** | Using one opens a plain window marked **Mock-up** with its title and slots (chest rows, the hopper's five, the dispenser's three by three, a machine's input, fuel and output), not Minecraft's own menu. No items move and nothing is smelted; the close button, Esc or E closes it. |
| **Portals do not take you anywhere** | There are no other dimensions here, and frames are not checked. |
| **Minecraft's looks need your Minecraft folder; its sounds are captions** | Minecraft's pictures are never shipped with MCSuperMods. Without your Minecraft folder, project blocks that build on Minecraft's models use MCSuperMods' own simple shapes, Minecraft's blocks cannot be placed, and the Minecraft blocks of a ground show the terrain and wood as MCSuperMods' own drawn pictures (not Minecraft's) and the rest as plain coloured cubes. Your project's own sounds play; Minecraft's sounds show only as a caption marked "(plays in the game only)". |
| **Needs WebGL** | Without it, Try it says so and offers **Play in Minecraft**. |
| **A small area that is not saved** | 48 by 48 blocks, 32 high, so it stays fast on any computer. Placing stops at the edge, and the area is cleared when you close the project. |
| **Animations as in the preview** | Mobs move as in the Entity Studio's preview: smooth steps are straight lines and Molang counts as 0. GeckoLib plays more in the game. |
| **Pictures** | Animated pictures show their first frame; pictures larger than 16 by 16 are cut down to 16 by 16. |
| **Other plugins' blocks** | A block from a third-party plugin is drawn from its files, but its own behaviour does not run. |
| **Grounds from your worlds** | Only the Overworld, and only saves from Minecraft 1.18 on (open an older world once in 1.18 or later). Chests' contents, signs and other block entities, and mobs and items, are not copied. Another mod's blocks are left out. Its Minecraft blocks are props like any other. |
| **Quick worlds are not Minecraft's world generation** | Their hills, islands, valleys and trees are MCSuperMods' own simple shapes, made to look natural around your blocks, not to match a real seed. |

The tests check what Try it does (counts, states, what you point at), and that it draws something, not exactly how it looks. If a picture looks wrong in Try it but right in the game, the game is right.
