# Very easy mode

Very easy mode is for making a mod with no code and no files to look at. You pick what to make from big tiles, answer a few questions, press **Play** and see it in Minecraft. Everything is in plain words: no ids, no JSON, no file lists.

There are three modes, and you can change between them at any time without losing anything:

| Mode | What it is |
|---|---|
| **Very easy** | Big picture tiles, Play and plain words. No code and no files to look at. |
| **Easy** | Your things first, the files behind them folded away, the forms only. |
| **Advanced** | Every file, kind ids and Raw JSON. |

The first time MCSuperMods starts, the Welcome asks **How do you want to work?** and starts in Very easy; you can choose Easy or Advanced there. After that, use the row **Very easy · Easy · Advanced** in the toolbar, or **View > Very Easy Mode**, **Easy Mode** or **Advanced Mode**. The older switch beside the row still toggles Easy and Advanced. Your choice is remembered.

Nothing is hidden for good. Very easy only hides things: a hand-made event, a technical element or a file you made in Advanced mode still exists and still runs. If something in your mod happens and you cannot see why, switch to Easy or Advanced to look.

## The Very easy window

The toolbar has only what you need: **Home**, Undo, Redo, **Play** and **Reload** with the game's status, **Share my mod**, the AI helper, Help and the mode row. There is no sidebar, no Problems tab and no target in the status bar. Anything wrong appears in **Things to fix**.

## Start a new mod

On Home, **Start a new mod** asks one question: **What is your mod called?** Press **Start** and the mod is saved in a folder of that name in `Documents/MCSuperMods`. Under the question it says where: "It is saved in …". **Change folder** picks another place. You never see a namespace or an id; MCSuperMods makes them from the name. **Open a mod** opens one you made before, and **Your mods** lists the recent ones.

## Make something

With a mod open, Home shows **Make something** with these tiles:

| Tile | What it opens |
|---|---|
| **Make a block** | A block, an ore, stone bricks, a crate or a machine |
| **Make an item** | Something to throw, a totem, a music disc or a horn |
| **Make a tool or weapon** | A sword, a whole set of tools, or a new enchantment |
| **Make armour** | Helmet, chestplate, leggings and boots of a new material |
| **Make food** | Something to eat or drink |
| **Make a mob** | A new creature, a flying or swimming one, or a boss |
| **Make a pet or animal** | A pet to tame, a farm animal or something to ride |
| **Make a plant or tree** | A crop to grow, a tree, or a whole set of wood |
| **Make a potion or effect** | A potion to brew, a new effect, or sparkles |
| **Make a portal** | A portal frame, or a whole new world to travel to |
| **Make things happen** | Rules: when something happens, do something. No code needed. |
| **Paint a picture** | Draw a new picture, pixel by pixel |
| **Build with the AI helper** | Say what you want and let the AI helper build it |

Most tiles open the [Creator](creator.md) on the right question page, or on its list of pages when a tile offers several. **Make things happen** opens your [rule book](rules.md); the first time it makes one. A tile whose pages do not exist for your Minecraft version is not shown.

## My things

Below the tiles, **My things** has a card for each thing you made: a set from the Creator (a gear set is one card), or a loose block, item, mob, effect, potion, portal or rule book, with its picture. Choose a card to open it in its editor; the editor shows the parts that matter and keeps the rest away. A **Rules** section comes first in the block, item, mob and effect editors, so the quickest way to make a thing do something is to open it and add a rule ([Rules](rules.md)).

A card's menu has:

- **Edit in Creator**, for a set made in the Creator;
- **Rename**, which changes the name players see, never the id;
- **Duplicate**, which makes a copy named "… (copy)";
- **Delete**, which removes the whole set.

Each is one step, so **Undo** takes it back.

## Things to fix

When something stops your mod from playing, **Things to fix (N)** lists it in plain words, with the thing's name: for example a picture that is missing, or a step in a rule that cannot work. Each line has:

- **Show me**, which opens the thing at the right place;
- **Fix it**, where one click can fix it, for example **Paint the picture** to open the painter on the missing picture or **Remove this step** for a rule step.

If there is nothing to fix it says "Everything is ready to play." Less serious notes are folded under **Tips**. A problem MCSuperMods has no words for yet reads "Something in <thing> needs fixing", with **Show details** for the original message.

If a mistake stops the mod from being built, **Play** and **Share my mod** send nothing to the game and say so here.

## Play and Reload

**Play** saves your mod, builds it and starts Minecraft in a test world with your things in chests and in your hotbar. **Reload** sends later changes to the running game. Both are in the Very easy toolbar. The whole story, including Restart, is in [Playing and testing](playing-and-testing.md).

## Share my mod

**Share my mod** builds the Fabric mod jar with the usual settings and saves it where you choose. It then says: "Your mod is saved. Give the file to friends: they put it in their mods folder." **Where is it?** shows the file. Friends need Fabric Loader and Fabric API, like for any Fabric mod; the jar carries MCSuperMods' small runtime, so nothing else is needed. (The same file is **Fabric mod (.jar)…** in the Export menu in the other modes; see [Blocks and items](blocks-and-items.md#export-a-fabric-mod-jar).)

## What Very easy leaves out

Very easy shows the question pages and the sections that matter and hides the rest of a Studio: the events editor and the triggers, the Advanced switch, Raw JSON and element ids. A few ids can still appear inside the sections that are shown. If you need a field that is hidden, switch to Easy.

## Where next

- [Rules](rules.md) to make things happen.
- [Playing and testing](playing-and-testing.md) for Play, Reload and the test world.
- [The Creator](creator.md) for every question page.
- [The AI helper](ai-helper.md) to describe what you want.
