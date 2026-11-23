# See what you can make

**See what you can make** is a row of thirteen cards that show, in a few seconds each, what a mod can do: a set of wood, a pet, a crop, a machine, a vehicle, a portal, sparkles, a trader, a liquid, a lucky block and three worlds of your own (islands, tall mountains and caves). Each card has a picture, a sentence and two buttons. It is the quickest way to find a first thing to make, and the cards are made from the same examples as **Help → Examples…** ([Templates and examples](templates-and-examples.md#examples-gallery)).

## The thirteen cards

| Card | Its sentence | Make this opens |
|---|---|---|
| **A set of wood** | Logs, planks, stairs, a door and a tree of your own. | The Wood set flow |
| **A pet** | An animal you tame, that follows you and has babies. | The Pet flow |
| **Plants that grow** | A crop you plant, grow and eat. | The Crop flow |
| **A machine** | A block that works on items, fed by hoppers. | The Machine flow |
| **A vehicle** | Something to drive, with seats and a cannon. | The Car flow (see [Vehicles](vehicles.md) for the others) |
| **A portal** | A doorway to a new world of your own. | The Portal flow |
| **Sparkles** | Particles of your own, on blocks and wands. | The Particle flow |
| **A trader** | Someone who sells you things for emeralds. | The Wandering merchant flow |
| **A liquid of your own** | A liquid with its own bucket, lakes and feel. | The Fluid flow |
| **Rules: a lucky block** | Make things happen without code: break it and see. | Nothing: it shows **See the example** as its main button, because an empty rule book teaches nothing |
| **A world of islands** | Your own world: small sandy islands in a wide sea. | The Islands flow |
| **A world of tall mountains** | Your own world: snowy peaks as tall as the sky allows. | The Tall mountains flow |
| **A world of caves** | Your own world: caves under a roof of rock, with lava lakes. | The Caves only flow |

The three world cards come after the first ten, on the next row when the strip wraps. Their clips look slowly round land made from the examples Coral Isles, Frost Peaks and Ember Caverns ([Worldgen](worldgen.md#make-a-world-in-a-few-questions)).

A card whose flow your Minecraft version does not offer shows only **See the example**, and a card whose example does not work on your version is not shown.

## Where the cards are

- **Home, the gallery:** the thirteen cards are the first row, **Featured**, of Home's gallery of everything you can make. Under Featured comes one row for each group of guided flows (Gear, Blocks, Food, Mobs, Vehicles, Magic, Scripts, Worlds, Games) a row, **Whole mods and packs**, for the starters that are not flows, and last **More ideas**, the endless ideas (its **Show all** shows them as a growing grid). Every flow and starter has a card with a picture, a sentence, **Make this** and, where an example shows it, **See the example**. A row scrolls sideways (a sideways wheel or trackpad, the arrow keys, or the arrow buttons at its ends when you point at it); **Show all N** at its right shows the whole group as a grid, and **Back** returns. The buttons along the top of the gallery jump to a group. The Featured cards move by themselves; the other cards show a still picture, drawn when the row comes near (the example's own pictures, or a drawn picture of what the flow makes), and a card with a **Play** mark plays its clip while you point at it or move to it with Tab. However many rows there are, only one clip moves on Home at a time. See [Plain words and More options](more-options.md#everything-you-can-make).
- **Home:** the gallery. With no mod open it sits under the header and **Your mods**. With a mod open it sits between the Make tiles and **My things**: open while the mod has no things, and folded to a link after that. The link reads **Show what you can make**; once open, **Hide what you can make** folds it again, and your choice is remembered.
- **New project:** the same strip, **See what you can make**, above the starter list. It scrolls sideways.
- **Examples:** a showcased example's detail pane shows its card under **What it looks like**.
- **The last row:** **More ideas**, an endless row of mods that each start from one thing, one card each, with **Make this**, **Shuffle** and **Show all**; and above the cards, **Your mods**, your recent mods as cards ([Plain words and More options](more-options.md#more-ideas)). At most one clip moves on Home at a time, whether from these cards or from More ideas.
- **The command palette** has "Showcase: see what you can make": it opens Home with the cards showing.

## Make this

**Make this** starts the card's flow, the same one the Home tile of that name opens:

- With a mod open, the flow opens in that mod.
- With no mod, a small window asks only **What is your mod called?**, already filled in for the card (Elm Mod, Fox Mod, Onion Mod, Crusher Mod, Tank Mod, Sky Mod, Firefly Mod, Merchant Mod, Oil Mod, Island Mod, Mountain Mod or Cave Mod). Change the name if you like and press **Start**, and the flow opens once the mod is made ([Plain words and More options](more-options.md#start-a-new-mod)).

You answer the flow's few questions and **Create** adds the thing to your mod ([The Creator](creator.md)). After that, **Play** or **Try it** shows it ([Playing and testing](playing-and-testing.md), [Try it](try-it.md)).

## See the example

**See the example** shows the finished example behind the card:

- With no mod open, it opens the example as a new project.
- With a mod open, it copies the example into your mod as one step, so **Undo** takes it back. Elements whose ids already exist are skipped, never overwritten.
- For **Rules: a lucky block**, the copy opens the rule book so you can read the rule.

## What the pictures do

Every card shows a **Preview** tag. A picture is a short clip, about 8 to 12 seconds, that loops. It comes from Try it's simulation, not from the game, so it is a preview of the idea rather than a recording of Minecraft ([Try it](try-it.md)).

- **One clip moves at a time.** The others show still pictures. The card under the mouse moves, else the card with keyboard focus, else the first card fully in view. Press a card's picture to play or pause that card; its chip says **Play** or **Pause**.
- **Pause clips** stops all clips from moving by themselves, until you press a card's picture to play it once.
- **Reduced motion:** if your computer asks for less motion, no clip moves by itself. Press a card's picture to play it.
- **Setting:** in **Settings**, the **Showcase** section has **Play showcase clips** ("Moving pictures on Home and in New project. Off shows still pictures."). It is on by default; switch it off for still pictures only.
- **Without WebGL:** if your computer cannot draw moving pictures, each card shows a drawn still with the line "This computer cannot show moving pictures here." **Make this** and **See the example** still work.
- A still is drawn first and replaced by a frame of the clip once it has played. Clips and stills are drawn at the card's size on your screen (up to twice as sharp on a high-resolution screen), and pictures are scaled by whole numbers, never blurred.

## Limits

- A clip is the preview, not the game. A caption names what happens only in Minecraft, such as taming a pet or a machine crushing ore, and **Play** is one step after **Make this**.
- Mobs only wander or stand in a clip. No merchant or machine screen is shown, and clips are silent. Try it plays sounds.
- Minecraft's own blocks look plain in clips, for now even when your Minecraft folder is set up ([Getting started](getting-started.md)): terrain and wood are drawn by MCSuperMods and the rest are plain cubes. MCSuperMods never ships Minecraft's pictures. The clips prefer your kind of blocks and terrain.
- Each clip follows its example: if the example changes, so does the clip.
- The world cards' land is worked out from their example's own files, as Try it's **My world generation** ground does ([Try it](try-it.md#my-world-generation)), and never from your Minecraft, so every computer shows the same land. Trees, plants and ores are about right, and carved caves show only in the game; the captions say so ("Its jungle trees grow in the game.", "Its caves are carved in the game."). Before a world card's clip has played, its still is a drawing of that land from the clip's camera; if the land cannot be worked out on your computer, the card says "This world could not be drawn here."
- Only the built-in examples have cards; a plugin cannot add one.
- A card shows only where its example works on your Minecraft version: the open mod's version, or the default one when no mod is open.
- A slow computer plays a clip more slowly, so it may take longer than 12 seconds.
