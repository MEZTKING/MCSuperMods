# Changelog

What changed in each MCSuperMods release, for people who use the app. The app shows the section for its version under **Help > What's New…**, and each GitHub release carries the same text.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning](https://semver.org/); before 1.0, a minor version can change how projects behave.

## [Unreleased]

Nothing yet since 1.5.5.

## [1.5.5] - 2026-11-23

### Added

- **Play in more places.** A damage type's live view plays the hurt sound it gives a player, and a sound picked in a rule has a small Play button beside it.
- **Search everything.** A bar headed "What do you want to make?" on Home and in the empty editor, a "Search or make anything" field on the toolbar, and Edit > Search… (Ctrl+K, Cmd+K on a Mac) find flows, starters, examples, your own things, Minecraft's things, settings, commands and guide pages, even misspelt or in American spelling. A result can be made at once (**Make this**), added to your mod, opened or shown in the guide; the palette (Ctrl+Shift+P) is ranked by the same search.
- **The AI helper searches the library first.** It finds the starter or flow that fits your words, with the answers your words gave, before it builds; **Ask the helper** in search opens it with your words ready to send.
- **Adventure mode lists for items.** The Item Studio has an **Adventure mode** section with **Can break** and **Can place on**: pick the blocks (your own or Minecraft's) or whole groups of blocks a player in Adventure mode may break with the item or use it on, for adventure maps. The item's tooltip shows the lines the game adds.
- **Pick game pieces by name in the Rule book.** A rule's loot table, structure, team, score, timer, area or magic block now opens a picker with your things and Minecraft's, by name; **Make a new one** makes the piece and puts it in the rule in one step you can undo.
- **Plugins can be found by search.** A plugin's own search words are checked when it loads; Settings > Plugins says whether they passed.
- **The AI helper's panel says chats are not saved**, and See it names things and renames the way the cards do.
- **Set on fire** in Rules: a new step in the Mobs group sets a mob on fire for the seconds you give ("set the mob on fire for 5 seconds"). Players are not lit, as no Minecraft command can do that.
- **Items that start enchanted or never wear out.** The Item Studio's **Tool and durability** section has **Never wears out** and **Starts with enchantments** (any enchantment, Minecraft's or your own, with its level), and shows the item's tooltip as the game will. The Weapon and Gear set flows ask the same: **Never wears out**, **Starts with an enchantment** and **Enchantment level**.
- **Frost Walker's ice path for your own enchantments.** The Enchantment flow can make boots enchantments (**Goes on: Boots**) and has the effect **Freeze water under the wearer (as Frost Walker)**; the new example **Frost boots enchantment** shows how it is written.

- **The AI helper says what it is doing and what it costs.** One state line tells you what is happening ("Thinking… (4 s)", "Making it…", "Your turn: choose what to do with the plan.") and offers at most one button. There is no Chat or Build switch any more, and an empty panel offers four example asks. A first-time **Set up the AI helper** card has three steps (**1. Get a key**, **2. Paste it here**, **Save and check**), says what a first question costs on your model, and checks the key at once; the same card is in Settings. A big ask shows a plan with **Make all of it**, **One at a time**, **Change the plan** and **Leave this out**.
- **Look before you add.** What the helper makes waits in a tray as cards, one for each thing, with a picture and a **Keep** tick (Easy adds **Files behind this**; Advanced keeps the file list, **Before and after**, **Apply** and **Discard**). **Add to my mod** puts it in, **Show me** opens it, **Undo** takes it out again and **Put back** returns it. **See exactly what is sent** shows what goes with a question.
- **Ask the helper** on a line of Things to fix attaches that problem in plain words, and failures are one sentence with one button (**Check my key**, **Try again**, **Keep going**, **New chat**). The guide page is rewritten around these screens, with a table of what each sentence means.
- **AI pictures are exact now.** Make with AI no longer sends a bare description: it names what the thing is (a helmet, a chestplate, a sword, an ore…), how Minecraft draws it and your colour, starts Retro Diffusion from MCSuperMods' own drawing of that thing, and checks every picture's outline and colour before you see it. A picture that does not look like the thing is tried once more, and then you get MCSuperMods' drawing with a plain line instead of a wrong picture. The pieces of a set (a gear set's armour, a wood set) are made with one seed and one palette so they match. The words sent and the price of each request show before anything is made, with **Try again** and **Use MSM's drawing** beside the results.
- **Make with AI everywhere you make a picture**: mob skins (**Make a skin with AI** beside **Draw a skin**), villager looks, paintings, armour layers, banner, shield and pot patterns, particle frames and every picture field of the Creator, and **New texture…** can start **Made with AI**. In Very easy mode, **Draw it for me** offers **Make it with AI instead** once a key is set. Retro Diffusion is the recommended service; the guide says where to get a key and what it costs.
- **Your data shows live.** Loot tables, predicates, item modifiers, enchantments, advancements, dialogs, damage and chat types, tags, functions, block transformers and rules for vanilla blocks now have a live view in the **Preview** tab, drawn again a moment after every edit. Each is tagged **Preview** and says how close it is to the game (**As in the game, checked**, **About right** or **Only in the game**), and names every part it could not work out.
- **Roll it** for loot tables: one roll at a **Seed** (**Roll again** for another) and **The odds** of every item over many rolls, for a situation you pick under **What happens to it?** ("Mining a block with a Fortune III pickaxe", "A mob killed by a player" and more, with **Advanced** for the details). Extra drops roll Minecraft's table **Without your additions** and **With your additions** side by side (also in the Extra drops Studio's **With and without**); enchantment providers and trial spawners roll too. A roll is MCSuperMods' own; the odds are checked against the game.
- **Try it on** for predicates (**Yes**, **No** or **Only the game knows**, beside every part) and item modifiers (the item **Before** and **After**); enchantments show their tooltip, **Levels**, **The enchanting table**, **What it goes on**, **Cannot be combined with** and **What it does**; advancements their **Advancement tab** as a tree with the criteria as a checklist; dialogs their screen, where each button says what it would do; damage types their death lines and chat types a chat line.
- **Everything in it** for tags, beside the Tag Studio's list: every member with tags inside tags opened up, optional and missing entries marked, and **What changed** against Minecraft's own tag.
- **Functions in Try it**: the Function editor marks each line **Runs in Try it** or **Only in the game** with the reason, and **Run in Try it** (with **Values for the macro lines**) runs the function at you in Try it. Try it's chat box runs `/function` and many of the game's own commands (`/give`, `/setblock`, `/fill`, `/summon`, `/execute`, `/scoreboard` and more), and your load and tick functions run there.
- **Block transformers and vanilla block rules** show the block before and after with the tool; the Vanilla block rules Studio's **Try it here** tells you how to try them in Try it, where the vanilla block is a prop that changes as your rules say.
- **The Creator's Live tab** draws the live view of each thing a flow makes, and mobs, vehicles, particles, liquids, effects, potions, traders, blocks, items and mob skins as their Studios show them; flows whose main thing is not a block or item open on it. **See it** in the AI helper's review shows the same for what the helper proposes, before anything is added.
- **The AI helper** knows which data has a live view, tells you to look at its **Preview** (or **See it**) to check what it made, and tells the views' limits in plain words. It never claims to have seen a view.
- User guide: a new page, **Live views of your data**, and the Try it page covers the game's own commands and your functions in the chat box.
- **Hear every sound.** A **Play** button beside every sound you pick (the Studios' sound fields, the Block Studio's **How it sounds**, the sound slots of Rules, the Creator's song field, the sounds form) and on every event and file of a **Sounds** element's **Preview** plays it as the game picks it: the files by their weights, at the event's volume and pitch, one sound at a time (**Stop**). Minecraft's own sounds are read from your Minecraft folder when you press it, never copied; without the folder the button offers **Find my Minecraft**.
- **Looks live.** Fonts (a line you type under **Type to try it**, at GUI scales 1 to 4), particle sprites, waypoint styles on the locator bar, timelines and world clocks as a **Day strip**, paintings on a wall beside a player, banner patterns **On a banner** and **On a shield** in the colours you pick, armour trims on the armour figure, pot patterns on a pot's four sides, music disc songs (**Play**, a time line and the stated length against the file's) and goat horn calls (**Play the call** and the range as a circle) now draw in the **Preview** tab.
- **Mob variants on bodies.** Wolf, cat, pig, cow, chicken and frog variants are drawn on MSM's own stand-in bodies, turning (**Wild**, **Tame** and **Angry** for wolves, **Grown-up** and **Baby**), with where they appear in words; the zombie nautilus shows its picture flat with its parts named. Sound variants play each sound, and a **Sulfur cube** is drawn at **Small**, **Middle** or **Big** with the path of a hit. The **Villager look Studio** and **Profession Studio** dress a villager at each level from **Novice** to **Master**.
- **Potions, effects and creative tabs** draw in their Studios' **Preview**: the bottles and tipped arrow in the potion's colour, the effect's icon frame and swirl, and the tab as a creative inventory page with its things in order.
- **Shaders and post effects**: a shader program says whether it compiles for the app's graphics, with the compiler's lines against yours, and where it does, runs **Before** and **After** on MSM's own test picture; a post effect shows its passes as a diagram and runs on the same picture. Minecraft's core shaders are a compile check only.
- **Particles and sounds** in My things (Very easy): a card for each particle and sound of your mod, with **Play**, each opening its view. The Creator's **Live** tab shows the looks for the Music disc, Goat horn, Banner pattern, Armour trim, Pot pattern, Creative tab and Villager look flows.
- **The AI helper** knows which looks and sounds have a live view, sends you to **Preview** (or **See it**) to check them and tells their limits in plain words.
- User guide: **Live views of your data** gains **Looks and sounds** and its limits; Block sounds gains **Hear a sound**; Very easy mode covers **Particles and sounds**.
- **Make a game.** A new tile on Home (under **Games**) and a **Games** group in the Creator with eight flows: **Skyblock** (a start island in empty sky with its chest, extra wandering trader trades, recipes for sand and gravel, goals, and if you like a generator of your own), **One block** (a magic block that turns into the next block phase after phase), **Sky islands**, **Lucky block**, **Adventure map** (start mode, a welcome, game rules, checkpoints and goals), **Arena game** (teams, defeats on the sidebar, a round timer and an arena rebuilt each round), **Race** and **Goals**. Each has a finished example under **Games** in Help > Examples…. Everything but the lucky block works in a plain data pack.
- **The pieces of a game** have Studios of their own, each with a live view: how the world starts (**Empty sky**, **Floating islands**, **Flat**, **As normal** or **My own world type**, a start island placed when the first player joins, the game mode, difficulty, game rules and what new players get, with the map of the world), one blocks, teams, scores on the sidebar, timers on the boss bar or above the hotbar, and areas that can be rebuilt. The Structure Studio's **Chests and containers** sets a chest's loot table and items.
- **Rules for games**: steps to give or drop from a loot table, place a structure, **Pick one at random**, join and leave teams, set and add to scores, start and stop timers, reset an area, set the world spawn, a player's spawn point and the world border; checks and readings for areas, teams, scores and timers; and the moments **A player enters the area**, **A player leaves the area**, **A timer ends** and **The one block is broken**.
- **Play my game** in the Play menu plays your game in a world of its own (its World Type, game mode and difficulty, commands on, the seed beside the chip); **Start over** makes a fresh one. Minecraft's experimental settings screen is answered for you there.
- **Export as a Map…** (File) saves a world as a map with your packs inside, players' data left out unless you choose **Keep my player data**, or as a `.mrpack` with the mod when the project needs it. **Bring builds from my test worlds** (Import Structure…) imports what you saved with a structure block in the worlds of Play and Play my game.
- **Try it** has two grounds for games, **Empty sky** (your start island, holding what new players get) and **One of my buildings**, and a **Your game** panel with the boss bar, the sidebar, your team, the magic block's phase and **Rebuild now**; your game's functions run there.
- **The AI helper** knows the games kinds, the eight game flows, Play my game, maps and their limits.
- User guide: new pages **Game modes** and **Maps**; Rules, Playing and testing, Try it, Structures, Worldgen, the Creator and Very easy mode cover games.

### Fixed

- An item's `minecraft:enchantments` in `msm:components` (Advanced) is now applied in the game; before, the mod left it out with a load error.
- AI pictures' clean-up no longer turns a flat area into stripes or speckles of different shades.
- The AI pictures' outline check now fails a round blob for every armour piece, tool, bow, ingot and gem: it also compares the corners, points and gaps where MCSuperMods' drawing differs from a plain oval. MCSuperMods' drawn leggings now have a clear gap between the legs (the Gear set and Glowshard leggings icons change with them).
- An item can carry `minecraft:block_transformer` through `msm:components` (naming a block transformer of your data pack, or Minecraft's `minecraft:axe`, `shovel` or `hoe`): using it changes blocks as the transformer says. Before, the game refused it at load.
- Try it's first-run card no longer says commands do not run there: it says your functions and most of the game's own commands run in the chat box, and that `/spreadplayers` and the forms Try it does not know run only in the game.

- Five data pack forms that stop a real Minecraft server from starting are now refused before export, with plain words: a predicate or item modifier file that is a list or a bare id, a time check without its clock, a damage tag named without `#`, and a block transformer state in the old `{Name}` form.
- The function checker no longer breaks on valid lines that use a fake player name such as `#count` in a score (`execute if score`, `scoreboard players get` and `operation`, `team join`, a score in `tellraw`), a named random sequence, a `place jigsaw` target, or a block or particle from your own mod; these lines now check cleanly, and if the checker ever stops early it says so as a note instead of failing.
- Structures made in MCSuperMods now appear in the game. Before, every exported structure template (in data packs, mod jars and `.nbt` exports) loaded without an error but placed nothing but air, because its blocks were written in an older form that this Minecraft no longer reads. Structures you imported keep working, and old structure files still import.

## [1.5.4] - 2026-11-22

A test build: everything since 1.5.3, with the Showcase, the rest of vanilla parity 3 batch 2's work, and live world generation: the world map, value maps, Scatter and Compare with vanilla, the Creator's Map tab, the Studios' **See it on the map** and **Walk in it**, Try it's **My world generation** ground, the **Make a world** flows and three world cards in the Showcase.

### Added

- **The Creator draws your world while you answer**: the world flows and the Dimension flow open their live preview on a new **Map** tab, which shows the world your answers make (biomes, height, a side cut, the climate) and follows every answer, before anything is added to your mod.
- **See it on the map** and **Walk in it** in the Biome, Placed Feature, Tree and Dimension Type Studios: the live map of a world of yours that uses the element (**Seen in** when there are several), and Try it's **My world generation** ground on it.
- **Walk in it** under the world map in the preview panel opens Try it on your world at the map's seed and place.
- **See what you can make** has three new cards, now thirteen: **A world of islands**, **A world of tall mountains** and **A world of caves**, with clips that look round land made from the Coral Isles, Frost Peaks and Ember Caverns examples; **Make this** opens the Islands, Tall mountains or Caves only flow.
- **Minecraft's own biomes on the live map**: after you have pressed **Play** once, the world map, **Compare with vanilla** and Try it's **My world generation** show the biomes of Minecraft's own overworld and Nether where a world uses them (before that, their land is drawn in one colour and the notes say "Vanilla's biomes show here after you have pressed Play once."). The list is read from your own game on your computer and is never exported or sent anywhere.
- **The AI helper** knows the five Make a world flows and their answers, says that the map and the ground show its changes, and tells the limits of the preview in plain words. It never receives Minecraft's own world files.
- User guide: a new page, **The live world map**, and the worldgen, Try it, Creator, Very easy and See what you can make pages cover the world flows, the map and the ground.
- **Every kind of world generation now shows live** in the preview panel: noises and density functions as a **Value map** (**From above** at a chosen **Height**, or a **Side cut**); features, placed features, block providers and world additions as **Scatter** on a small patch of land (**From above**, **From the side**, with a count, and **The addition is on** to compare); **Structures** marks where spread-out structures may start; **Compare with vanilla** draws vanilla's world beside yours. Carvers say that carved caves show only in the game.
- **Try it: My world generation**: walk in a window of your own world (48 by 48 blocks, 32 high) around a place and seed you choose. It comes in stages (land, surface, then trees, plants and ores, which are about right) and is made again in place when you edit, keeping your placed blocks where it can. **Move up**, **Move down**, **Make the land around me** and **Show on the map**.
- **Make a world** on Home: five flows (**Islands**, **Tall mountains**, **One biome everywhere**, **Caves only**, **Empty sky with a start island**) each make a world type to choose in Minecraft's Create New World, with five examples (Coral Isles, Frost Peaks, Endless Blossom, Ember Caverns, Cloud Realm). The empty sky's start island comes with Skyblock; until then, play it in Creative.
- **Live world map** (a preview): a dimension, world preset, noise setting, biome, biome list, flat preset or surface rule now shows a map in the preview panel, worked out from your files the way the game does it and redrawn as you edit: **Biomes**, **Height**, **Side cut** and, for dimensions and presets, **Climate**. Choose the **Seed** (type one, **Roll a new seed**, or **Seed of one of my worlds**), move with **X**, **Z**, **Go to spawn**, zoom, drag or the keys, and hover for the biome and height. **Seen in** shows a part inside one of your dimensions or a plain world built around it; a biome lights up with its share of the view and **Find it**. Minecraft's own world files are read from your game and never exported. Notes say what is only about right (the End, and biome borders on 26.4-snapshot-7) and what is not drawn yet (carved caves, buildings, trees and ores on the map).
- **See what you can make**: ten cards that show what a mod can do, each with a short moving picture: a set of wood, a pet, plants that grow, a machine, a vehicle, a portal, sparkles, a trader, a liquid of your own and a lucky block made with Rules. They are on **Home** in Very easy mode (with no mod open, and in a new mod until it has things; after that behind **Show what you can make**), in a strip at the top of **New project**, and in **Help > Examples…** beside a showcased example (**What it looks like**). The palette has "Showcase: see what you can make". See [See what you can make](docs/guide/showcase.md).
- **Make this** on a card opens the Creator on the flow that makes that thing, so you make your own with your own name and colour; with no mod open in Very easy it first asks **What is your mod called?**, already filled in ("Elm Mod"). **See the example** opens the finished example as a new mod, or copies it into the open one.
- The moving pictures are drawn live by **Try it** from the examples themselves: nothing is filmed or downloaded, every clip carries a **Preview** tag, plays no sound and says in its caption what only happens in the game. Minecraft's own blocks in a clip are MCSuperMods' drawings and plain cubes.
- Only one clip moves at a time: the card under the mouse or with keyboard focus, else the first one in view. Press a card's picture to play or pause it; **Pause clips** stops them all. If your computer asks for reduced motion, or with the new setting **Play showcase clips** (Help > Settings, **Showcase**) off, cards show still pictures until you press one. A computer without WebGL shows drawn pictures and "This computer cannot show moving pictures here.", and both buttons still work.
- The Java project export now also includes traders (their levels, restocks, reputation, demand, work sites and **On trade** event) and shoulder pets, so no mob part is left out of it any more.
- **The AI helper** knows vanilla parity 3 batch 2: trader reputation, demand and work sites, villager looks and homes, fish buckets, hovering and phasing flight, the six habits and the dash, both shoulders, liquid mixing, cauldrons and bottles, boats, the 44 command argument types, hand-ordered tabs, game rules, statistics, the new Rules triggers, steps, checks and **What the player typed**, Script API 1.7, the **Villager look** and **Game rule** flows and every new answer, and the limits in plain words. Its schema reading of a mob now shows the fields of every goal and event action.
- User guide: a new **Boats** page, and the villagers and traders, fluids, mob behaviours, commands and tabs (with game rules and statistics), rules, scripting (Script API 1.7), eject, Creator, Try it and templates pages cover batch 2.
- The sample project `fixtures/sample-mobs-and-commands` (a merchant that remembers you, a villager look, two liquids with cauldrons and a bottle, eleven mobs with the new habits, larch boats, two commands, game rules, statistics and a hand-ordered tab) has an in-game checklist, and the guide now says that a colour code is typed without the `#`, where a boat can be placed and what a roosting mob saves.

### Changed

- A roosting mob that hangs when idle now always roosts within about eight seconds under a ceiling (still at a random moment before that).
- A yes-or-no game rule with lowest or highest values is now an error (the game refuses it), not a warning.
- The download is about 5 MB smaller: the Minecraft facts MCSuperMods carries are stored compressed.
- The AI helper no longer says that prices never change, that fluids cannot mix or fill cauldrons, that a player carries one shoulder pet, or that traders, storage, shoulder pets and fluids are left out of the Java project.

### Fixed

- **Upgrade project target** to 26.4-snapshot-7 now removes `default_block` from noise settings (as elements and written inside dimensions and world presets), which that version does not have; before, the upgraded project's export stopped on it.

- Java project export: the warning about events it leaves out now names all six such events, not two.
- The Command Studio's colour argument says "such as ff8800, without the #".
- Java project export: a command now checks every typed value before it runs, as in the Fabric mod jar, so a dimension that does not exist is refused instead of the command running anyway.

## [1.5.3] - 2026-11-22

A test build: everything since 1.5.2, with the drawn pictures and vanilla parity 3 (the Showcase on Home and New project comes in a later build).

### Added

- **Drawn pictures in a Minecraft-like style**: every picture the Creator, the starters, the examples and Surprise me make is now drawn by MCSuperMods in a style close to Minecraft's: a few shades of each colour that lean warm in the light and cool in the shadow, light from the top left, clumpy texture, a dark outline round items, and bricks, planks, bark, leaves, ores, tools and armour that look like what they are. The pictures are MCSuperMods' own drawings, never copied or recoloured from Minecraft's textures. They need no key and no internet. See [Drawing pictures](docs/guide/pictures.md).
- **Draw…** beside **Make with AI** (Very easy mode: **Draw it for me**) on the Creator's picture fields, the Block and Item Studios' pictures and texture slots, the texture painter and **New texture…**: pick what it is, a **Colour**, a **Second colour**, a **Finish** and the **Detail**, look at six variations, press **New looks** for six more and **Use this picture**. One **Undo** puts the old picture back. In the Creator it starts on the colour you chose for the thing (**The thing's colour**). The Particle Studio's **Draw frames…** draws all four frames at once, and **New texture…** can **Start from** a **Drawn picture**.
- **Draw a skin** in the Entity Studio (Very easy mode: **Draw its skin**) draws a skin on the boxes of the mob's own model, as **Fur**, **Scales**, **Smooth**, **Stone** or **Slime**. It is greyed out, with the reason, for a model whose faces are mapped one by one.
- The AI helper draws its textures with the same recipes (it can ask for any of 80 kinds of picture, a second colour, a finish and a seed), and AI pictures' clean-up uses the same shades as drawn pictures.
- **Try it** draws Minecraft's terrain (stone, dirt, grass, sand, gravel, cobblestone) and wood (planks, logs, leaves) as MCSuperMods' own pictures when your Minecraft folder is not set up, instead of plain coloured cubes. Other blocks stay plain cubes, and the panel still says so.
- **Plants that grow**: four new block types in the Block Studio's **Type** section (group **Plants**): **Grows in long strands** (like kelp, weeping, twisting and cave vines, with glowing berries if you like), **Grows tall like sugar cane** (a cane, a cactus that hurts or a bamboo-like stalk with leaves and a shoot), **Spreads over any side** (like glow lichen) and **Tips when you stand on it** (a big and a small dripleaf). They grow with random ticks and bone meal, need the ground they grow on and drop as vanilla's do. The Creator's new **Cave plants** and **Desert plants** flows and Very easy's **Grows in long strands** and **Grows tall like sugar cane** make them. See [Growing and climbing plants](docs/guide/block-types-and-plants.md#growing-and-climbing-plants).
- **Flower pots of your own**: **A flower pot** takes the vanilla and project plants it lists (**Plants it takes**); vanilla's own pot is not changed, and a potted plant can name your pot. The Creator's **Flower pot** flow and Very easy's **A flower pot** make one.
- **More blocks age like copper**: rods (a lightning rod), buttons, pressure plates, fences, fence gates, walls and containers, which keep their items as they age. Lightning now scrapes project blocks back as it scrapes copper. The **Copper set** flow offers the six new pieces and a chest that joins into a double chest.
- **Storage 2**: a chest can be a **Double chest** (two side by side join into one of six rows), **Different for every player** (each player's own contents, like an ender chest), and containers and machines can **Hold water**. The **Storage crate** flow asks for the first two. See [Containers and machines](docs/guide/containers-and-machines.md).
- **Block sounds of your own**: the Block Studio's **How it sounds** section gives a block its own breaking, walking, placing, mining and landing sounds (Minecraft's or your own), with volume and pitch, and doors, trapdoors, buttons and plates their own open, close, press and release sounds and rules (**Own door sounds**). The **Sound type** list holds every sound type of the Minecraft version. The **Wood set** flow asks for **Door and trapdoor sounds** and takes an **Own door sound** file. On Minecraft 26.4 a change shows after the world is opened again. See [Block sounds](docs/guide/sounds.md).
- **Shovels and hoes on your blocks**: the components `msm:flattenable` (a shovel makes a path) and `msm:tillable` (a hoe tills it), beside stripping.
- **Rules for vanilla blocks**: a new **Vanilla block rules** Studio says what an axe, a shovel, a hoe and honeycomb turn Minecraft's own blocks into, how they age and how they burn, and warns when a rule replaces one Minecraft already has. It needs the Fabric mod jar; ageing vanilla blocks works on Minecraft 26.3 only. See [Rules for vanilla blocks](docs/guide/adding-to-vanilla.md#rules-for-vanilla-blocks).
- **Four flows that work in plain vanilla packs**: **Banner pattern** (a pattern for the loom with its banner and shield pictures and the pattern item), **Armour trim** (a trim drawn in greys the game recolours, its smithing template and copy recipe), **Glider** (wings to glide with, as an elytra) and **Pot pattern** (a decorated pot face and its sherd). Very easy's **Make a painting** is now **Make a painting or pattern**, **Make armour** offers the trim and **Make an item** the glider.
- **More data and resource pack files**: pot patterns, block transformers, test environments and test instances, sulfur cube kinds, whole-number and decimal-number providers, screen effects (post effects), shader programs and waypoint styles, each with a template and an example. **Import assets** has a **Shaders** folder for `.vsh`, `.fsh` and `.glsl` files, which are copied as they are and not checked.
- **Templates and examples**: 15 more block templates (the plants, a flower pot, a double chest, a chest for every player, a block and a door with their own sounds, a copper-like rod, rules for vanilla blocks) and 22 more examples (274 templates, 67 starters, 186 examples in all). The sample project `fixtures/sample-plants-and-storage` has an in-game checklist.
- **Try it**: the new plants grow with **Grow** (one bone meal), pots take their plants, double chests open as one 54-slot mock-up, own sounds show as captions, and a new **Lightning** tool scrapes blocks that age.
- **The AI helper** knows the new plant types, pots, storage options, own sounds and set types, rules for vanilla blocks, the new data kinds and the seven new flows, and draws 14 more kinds of picture (94 in all: strands, stalks, lichens, dripleaves, pots, pattern items, sherds, gliders, banner and shield patterns, trim layers, glider wings and pot faces).
- The Java project export includes the new plants, pots, the six new ageing types, lightning, the storage options, own sounds and set types, and flattening and tilling. Rules for vanilla blocks are not in it yet.
- Plugin API 1.19.0: `BlockFacts.soundTypes`, `soundModel`, `vanillaPairs`, `plantSoils` and `soundSetEvents`.
- **Traders that remember you**: a trader can keep a standing with each player (**Remembers how you treat it**): hits raise its prices for that player, trades and gifts lower them, and it forgets slowly each day. **Prices rise with demand** after heavy trading, and **Restocks at** sends it to a work site block to restock. Villagers sleep in your own beds, and a **Villager look** (a new Studio) dresses villagers born in the biomes you list.
- **Liquids that mix, fill cauldrons and go into bottles**: a liquid can have **Mixing** rules (what its source and flowing blocks become next to water, lava or another of your liquids, so you can make your own cobblestone-like generators), a **Cauldron** that fills in levels and a **Bottle** you drink, with food and effects.
- **Mobs 2**: fish and other swimmers can be **caught in a bucket** (it keeps the name and health); two pets per player can ride on the shoulders; mobs can **hover**, **fly through walls while charging**, **swoop** and **roost** upside down; and six habits: **Collects items** (for its owner or to a note block), **Digs up items**, **Plays dead**, **Barters**, and a **Dash** for mounts. New sections **Bucket** and **Habits** in the Mob Studio.
- **Boats of your own**: an item can be **A boat** (or a **Raft**) with **Has a chest boat**, drawn and steered like Minecraft's boats, crafted from your planks and placed by dispensers.
- **Commands, game rules and statistics**: commands take 44 kinds of argument (dimensions, times, colours, biomes, items, loot tables and more); a mod can have its own **game rules** (on or off, or a number) and **statistics** (a count, a distance or a time), each with its own Studio; creative tabs can list their items **In your own order**.
- **Rules 2**: six new triggers (**A player crafts**, **picks up**, **eats**, **goes to sleep**, **wakes up**, **gets an advancement**), the steps **Open a dialog**, **Add to a statistic** and **Set a game rule**, the conditions **The game rule is** and **The statistic is at least**, and **What the player typed** for a command's arguments. Events can **open a dialog** too.
- **Try it** draws slabs, stairs, doors, fences, gates, trapdoors, buttons, pressure plates, crops, leaves, walls, panes, cauldrons, glass and more with MCSuperMods' own shapes when your Minecraft folder is not set up, instead of the missing-picture pattern.
- **New Creator flows and answers**: **Villager look** (new clothes for the villagers of a biome) and **Game rule** (a world setting of your own, which can greet joining players and count it); the Wandering merchant can remember how you treat it, raise prices with demand, restock at its work site and barter for gold; the Pet can sit on either shoulder, bring you items and dig things up; the Water mob can be caught in a bucket and play dead; the Flying mob can float like a ghast or fly through walls like a vex, swoop and roost; the Mount can dash; a Fluid can fill cauldrons and bottles and mix with water; the Wood set has boats; a Custom command can have its own game rule; a Creative tab can be in your own order. 9 more examples (195 in all), 57 flows, 98 kinds of drawn picture (boats and villager clothes).
- **Try it** shows trader prices that follow your standing and demand, fish buckets, shoulder pets, hovering mobs, boats, cauldrons and bottles, and liquids mixing, and draws Minecraft's vanilla block pictures as plain colours instead of the missing-picture pattern.
- The Java project export also includes village jobs, liquids with mixing, cauldrons and bottles, villager looks, game rules, statistics, rules for vanilla blocks, all 44 command argument types, hand-ordered tabs, opening dialogs, boats, fish buckets, mount storage, hovering, phasing, the dash, the six habits and project beds as villager homes. Traders and shoulder pets are not in it yet.
- Script API 1.7 (`World.gameRule`, `setGameRule`, `Player.stat`, `addStat`, `openDialog`, the events `item.crafted`, `item.picked_up`, `player.ate`, `player.slept`, `player.woke`, `player.advancement`, and `args` on a command's own event) and plugin API 1.20.0.

### Changed

- Projects you made before keep the pictures they have: nothing is redrawn by itself. Only what flows, starters and examples make from now on is drawn. Paintings keep their placeholder landscape, vanilla mob variant skins get an even coat, and drawn pictures are 16 by 16.
- **Ages over time, like copper** in the Block Studio is now **Ages like copper (over time)**.
- A double chest has no **Holds water** switch: it always holds water, as Minecraft's chests do, and says so.
- Limits that stay: a project pot holds only the plants it lists, and plants vanilla pots with a model of their own look flat in it; copper golems do not wax or scrape project blocks; project rods do not attract lightning; a chest for every player is one store per block id; machines cannot age; new block types, pots and companions need a game restart (Play says **Restart needed**), and none of this is in vanilla packs.

## [1.5.2] - 2026-11-21

### Added

- **Vehicles**: make cars, tanks, planes, helicopters, hovercraft and boats. Players place one from its item, get in, drive with W, A, S and D and pick it up by hitting it while sneaking. A vehicle can need fuel, hold ammunition, fire a cannon from a turret that follows the look (R and V), take damage and be repaired, carry a chest's worth of items, be painted and sound a horn (H). The Creator's **Car**, **Tank**, **Plane** and **Boat** flows (group **Vehicles**), **Make a vehicle** in Very easy mode, eight templates and the **Vehicle Studio** make them. A vehicle needs the Fabric mod jar and a restart the first time. It is not in a Java project or a vanilla pack. See [Vehicles](docs/guide/vehicles.md).
- **Keys of your own**: a **Key bind Studio** adds a key to Minecraft's **Controls** screen that runs events when pressed, held or let go. G is "Quick actions" in Minecraft 26.3, so a key on G warns about the clash. See [Keys and the screen](docs/guide/keys-and-hud.md).
- **Things on the screen**: a **HUD Studio** makes bars, rows of icons and numbers (mana, stamina, a score, coordinates, a vehicle's fuel) with a preview of a drawn screen, shown and changed from events, Rules and scripts. Vehicles show a small dashboard of their own.
- **Rules for keys, vehicles and the screen**: **A player presses a key**, **lets go of a key**, **holds a key**, **Someone gets in the vehicle**, **gets out**, **The vehicle fires**, **is destroyed**, **Every few seconds while the vehicle is driven**, **Show on screen**, **Hide from the screen**, **Show a number on screen**, and readings for a vehicle's fuel, damage and ammunition. **Make an explosion** is now a plain step.
- **Script API 1.5**: `player.showHud`, `hideHud` and `setHud`, `entity.vehicle`, `passengers`, `isVehicle` and `asVehicle()`, a `Vehicle` type (fuel, damage taken, ammunition, driver), and the events `key.pressed`, `key.released`, `vehicle.mounted`, `vehicle.dismounted`, `vehicle.fired` and `vehicle.destroyed`.
- **Try it** drives your vehicles and presses your keys, and draws your on-screen elements. Weapons, storage, paints, explosions and sounds are said as "Only in Minecraft".
- The events editor gains **Explode**, **Show / Hide a HUD element** and **Set a HUD element's value**.
- Plugin API 1.16.0 and 1.17.0: `TargetFacts.controls` and `TargetFacts.vehicles`, and Creator groups.
- **Twenty more block types**: beds (sixteen colours, bed or sleeping bag rule), cakes eaten a slice at a time, berry bushes, tall plants, potted plants, vines, sea pickles, carpets, snow-like layers, cocoa-like pods, candles, ladders, torches (with their wall form), lanterns, chains, rods, signs and hanging signs, stems that grow a fruit and scaffolding. Pick them in the Block Studio's **Type** section, from 25 new templates, or from the Creator's new **Lights**, **Bed**, **Cake** and **Copper set** flows. The **Wood set** also makes signs and hanging signs, the **Stone set** can age like copper and the **Crop** flow can make a **Bush with berries**. Villagers do not use project beds, and project layers never melt. See [Block types, families and plants](docs/guide/block-types-and-plants.md).
- **Waterlogging, ageing like copper and waxing**: a block can hold water, and a block can age through four stages with a waxed copy that honeycomb makes and an axe undoes. The Block Studio has **Can stand in water** and **Ages over time, like copper** with **Make the next stage**, **Make a waxed copy** and **Make the whole set**.
- **Bags and bundles**: an item can be **A bag that holds things** (a chest, hopper or dispenser window that opens from the hand and keeps its contents in the item) or **Works like a bundle**. The Creator has a **Backpack** flow and Very easy mode a pick, **A bag that holds things**. Bags never go into other bags or shulker boxes. See [Bags and bundles](docs/guide/blocks-and-items.md#bags-and-bundles).
- **Commands and creative tabs of your own**: a **Command Studio** (the name and other names, the words after it, who can use it, an event or a function to run, a message back) and a **Creative Tab Studio**, with the Creator's **Custom command** and **Creative tab** flows, three templates and two examples. In Very easy mode, **Make your mod do something**. A command named like a vanilla command is not registered, text typed by players reaches a function as it is, and functions run with operator rights. See [Commands and creative tabs](docs/guide/commands-and-tabs.md).
- **Rules for placing, explosions, commands and riding**: **A player places a block** with **Stop the placing**, **Something explodes** with **Stop the explosion** and **Keep the blocks safe**, **A player types the command**, **A player gets on something** and **gets off something**, the steps **Ride something** and **Get off**, the checks **Someone is riding**, **Something is facing a way** and **What caused it**, **The way it faces** and the place **In front of here**.
- **Script API 1.6**: the events `block.place`, `world.explosion` and `command`, `entity.ride` and `dismount`, `world.itemsNear` with `DroppedItem`, and `item.contents`. Placing and explosions need two small hooks into Minecraft's code (the first Mixins of the runtime). See [Script API 1.6](docs/guide/scripting.md#script-api-16).
- **A sample for all of it**: `fixtures/sample-vanilla-blocks` has one block of each new type, ageing sets, bags, a bundle, two commands, two creative tabs, a script and a rule book.
- Plugin API 1.17.0: target facts for bed rules, dye colours, stem tags, the vanilla block model templates, command names and argument types, and the vanilla placed feature order. Worldgen reports `worldgen.vanilla-feature-order` when two vanilla features are the wrong way round.

- **Surprise me**: not sure what to make? The new first tile on Home (also a button on Home with no mod open, **File > Surprise Me…** and the command palette) makes a small random mod in a theme such as Ruby, Frost or Void: an ore or a set of tools and armour, then a few of a block, a weapon, a food, a mob or pet, a potion or effect, a plant, sparkles and a portal, and sometimes a rule. You see it all first, with pictures, then **Make it**, **Roll again** or **Change theme**. The seed is shown, so the same seed always gives the same mod. It is one step, so **Undo** takes it all back; with no mod open it starts a new one named after the theme.
- **AI pictures**: make textures from a description with **Make with AI** (in Very easy mode **Make it with AI**) on the Block, Item and Particle Studios' pictures, the Creator's picture fields and the texture painter. Pick an image service in **Settings > AI pictures** (Retro Diffusion, made for pixel art, or OpenAI) and paste your own key; it is stored encrypted and only the description you type is sent, never your project files. Each round makes four pictures, shown as drawn and cleaned up into Minecraft style (16 or 32 pixels, a few shades a colour, a clear background and an outline for items); pick one, and one **Undo** takes it back. The Creator and **Surprise me** gain a **Use AI pictures** switch (off by default) that makes each new block and item picture when you press **Create** or **Make it**, keeping the built-in picture where a request fails. The service bills your account for each picture.
- **Pick for me** in the Creator fills in every question with random answers that work.
- **More Home tiles**, now under headings: **Make a chest or machine**, **Make a recipe**, **Make sparkles**, **Make a magic wand**, **Make a world or biome**, **Make a building**, **Change drops and trades**, **Change how Minecraft looks**, **Make a painting** and **Make a sound or music**. Every Creator page can now be reached from Home, and the recipe, building, biome and resource pack starters are added to your mod in one click.

- **Try it shows what happens**: your rules and events run when you use, break and step on your blocks, mobs spawn and wander, particles and portals show, and **What happened** lists each step, with what only Minecraft can do said as "Only in Minecraft".
- **Scripts run in Try it**: your project's scripts answer clicks, breaking, placing, commands and chat in the preview, in a closed-off sandbox. What only the game can do is said as "Only in Minecraft", and a script that runs for more than 2 seconds (an endless loop) is stopped and started again. Rules with checks, chances, repeats and waits now say each step under the rule's name in **What happened**, and an error names the rule and the step it stopped at.
- **Try it worlds**: start the test area on a **Grid**, a **Flat world**, a **Quick world** you shape yourself, or a piece of one of your own saved worlds (**From my world**, read only, never changed).
- A **Try it** page in the user guide: how to open it, the keys, the tools and the clock, mobs, particles and portals, **What happened**, and the full list of what Try it cannot show. The link on Try it's first-run card opens it.
- **Skies and rules of your own**: a **Dimension Type Studio** sets a dimension's sky picture and sky, fog, cloud and sunrise colours (with a small preview of the sky), the sun, moon and stars, light, a fixed time of day or the day and night clock, the rules (beds, respawn anchors, piglins, monsters burning, fast lava, water evaporating, raids) and the height. The **Dimension** flow's new answer **Give it its own sky and rules** copies the chosen sky into a dimension type of your own with your sky and fog colours, time of day and beds. Templates **Moon dimension type** and **Nether-like dimension type**. Plugin API 1.18.0.
- **Traders**: a mob can sell things through the villager trading screen. The Entity Studio's **Trader** section (**Trades with players**, **Levels**, **Restocks**, **On trade**, **Trade sound**, **Trades from**) and its trade editor (**Price**, **Product**, **Uses before restocking**, **Trading XP**) set the trades of each of up to five levels, or borrow a vanilla villager's list. The Creator's **Wandering merchant** flow and the Very easy tile **Make a trader** make one from a few questions. The merchant levels up as you trade and restocks twice a day or never.
- **Village jobs**: a new profession for vanilla villagers, with a job site block of your own, the apron villagers and zombie villagers wear, trades for five levels and its own work sound. The **Profession Studio** edits it and the Creator's **Village job** flow makes one, with its workbench block. In Very easy mode My things shows a **Village job** card.
- **Mobs that carry things**: the **Storage** section gives a mob a chest's worth of slots (**Size**, **Needs a chest put on it first**), opened by sneaking and using it or with the inventory key while riding. The Mount flow gains **Carries a chest**.
- **Shoulder pets**: the **Shoulder** section makes a tamed small animal jump onto its owner's shoulder, and off again when the owner is hurt, sneaks, sleeps, rides, swims or flies. The Pet flow gains **Rides on your shoulder**.
- **Fluids**: liquids of your own with a bucket. The **Fluid Studio** (**Preview**, **Liquid**, **Flow**, **Pictures**, **Something inside**) and the Creator's **Fluid** flow make a liquid that behaves like water, lava or neither, with a colour, vanilla's moving pictures or your own, a flow speed and reach, new sources from two pools, an effect on whoever is in it, a bucket and, if you choose, lakes. Works on Minecraft 26.3 and the 26.4 snapshot, the second through a small runtime hook. In Very easy mode **Make a block** offers **Fluid** and My things a **Liquid** card.
- **Try it** shows a merchant screen for your traders (nothing is paid or given), pours your fluids from their buckets (they do not flow), and has a **Sky** choice that shows a dimension type's sky colour. Storage, shoulder pets and village jobs are said as "Only in Minecraft".
- New templates **Wandering merchant**, **Pack mule**, **Shoulder pet**, **Village job**, **Water-like fluid** and **Lava-like fluid**, the examples **Village blacksmith job**, **Oil well** and **Roadside merchant**, and a sample, `fixtures/sample-villagers-and-fluids`. See [Villagers, traders and pets that carry things](docs/guide/villagers-and-traders.md), [Fluids](docs/guide/fluids.md) and [A sky and rules of your own](docs/guide/worldgen.md#a-sky-and-rules-of-your-own-dimension-types).
- Plugin API 1.18.0 also adds trade sounds, vanilla job sites and trade sets, and the fluid model and tags to the target facts.
- Not in the Java project export or the vanilla packs: traders, village jobs, storage, shoulder pets and fluids need the Fabric mod jar.

- **World backups**: before MCSuperMods installs a data pack into one of your worlds, it saves a copy of the whole world first and keeps the last five for each world. **Settings > World backups** turns it off or on, sets how many to keep, and restores a backup next to the world (never over it).
- **A warning before renaming or removing something you already exported**: MCSuperMods remembers which blocks, items, mobs and other things have left it in an export, an install, Test in Minecraft or Play. Renaming or removing one of them now warns that worlds already using it lose those blocks, items or mobs; you can still go on.

### Changed

- **Updates install when you close MCSuperMods.** A downloaded update now also installs quietly the next time you close the app, so the new version is there when you start it again. **Restart to update** still installs it straight away. Unsaved changes are asked about first, and **Cancel** keeps the app open without installing.
- Plugin API 1.18.0 declares the command and creative tab definitions a Java project generator receives (`JavaProjectInput.commands` and `creativeTabs`).

## [1.5.1] - 2026-11-14

### Added

- **Try it** (F6, or the Try it button next to Play): a small test area inside MCSuperMods. Walk or fly around, place and break your blocks and see every state (stairs, doors, fences, slabs), open doors and press buttons, grow crops with **Grow**, light blocks with **Power**, hatch your mobs from their spawn eggs and watch them wander, and see your particles and portals. It needs no Minecraft, changes as you edit, and lists under **What happened** what only the real game can show. It is a preview, not the game: press **Play in Minecraft** for the real check.
- The AI helper knows the block types, their textures and loot presets, seeds with their own item id, and the Wood set, Stone set, Crop and Tree flows.
- **Your own sounds work in the game**: every key of a project's `sounds.json` is now a registered sound event, so in MCSuperMods' own fields (the **Play sound** action, an effect's or throwable's sound, mob sounds, `world.playSound` in scripts) you write the plain key, and the pickers list the project's sounds before the vanilla ones. In vanilla fields keep writing `{ "sound_id": "..." }`. A new sound key needs a game restart.
- **Mob sounds**: the Mob Studio's new **Sounds** section sets the **Ambient sound**, **Hurt sound**, **Death sound** and **Step sound** of a mob, and the **Ambient interval (ticks)**.
- **Blocks that react to mobs**: the actions of an **On step** event now apply to whatever stepped on the block, mob or player (`self` is the stepper, `run_function` runs as it), so a jump pad launches pigs too. The step cooldown is counted per dimension.
- **Script commands**: `world.runCommand` and `world.runFunction` accept a position and run there (without one, at the world spawn point), and `entity.runCommand` and `entity.runFunction` run as and at the entity.
- The Java project export writes `ModSounds.java` for the project's sounds and the mob sound overrides.
- Plugin API 1.7.0: `JavaProjectInput.soundEvents`, the project's sound event keys for Java project generators.
- **Block shapes**: the Block Studio's new **Shape** section gives a block an outline and collision other than a full cube. Pick a preset (**Bottom half**, **Top half**, carpet, pillar, **Plant (cross)**) or **Custom boxes** (up to 16 boxes in pixels), or use **From model** to read the boxes from the block's model in one undoable step; the picture beside the section draws them. **Walk-through** lets players and mobs pass through (like plants) and **See-through** lets light and the view through like glass: no suffocation, no hidden neighbour faces, no mob spawns on top. How a texture draws (solid, cut-out or see-through) still comes from its pixels. Templates **Half block**, **Plant (cross)** and **Glass-like block**, and the sample mod's `ruby_slab`, `ruby_sprout` and `ruby_glass`. Two new warnings in **Problems**: `blocks-items.model-not-cube` (a block with a non-cube model of your own but no shape) and `blocks-items.transparent-texture-on-solid-block` (a see-through texture on a block that is not see-through). The Java project export writes the shapes too. Rotation, stairs, real slabs, doors, fences and crops are not part of this yet; the guide's **Block shapes** section lists them.
- **Villager trades**: new data kinds `villager_trade`, `trade_set` and the villager trade tag, and the Creator's **Villager trade** flow (group **Worlds**) add a trade to a profession of the vanilla villagers, with four trade templates, an example for each of the three kinds and a fletcher trade in the sample data pack. A new trade is a candidate that villagers can offer, not a guarantee.
- **Ore that generates**: the Custom ore flow and starter have a new **World** step. With **Generate in the world** (on by default) the ore generates underground in every overworld biome of newly generated chunks, with your **Vein size**, **Veins per chunk**, **Lowest height** and **Highest height**; the Scripted ore starter's ruby ore generates too. Projects made before are unchanged until you reopen them with **Edit in Creator**. The ore replaces stone and deepslate.
- **World additions**: a new element kind (sidebar **World additions**, template **Ore in the overworld**) adds placed features and natural mob spawns to vanilla biomes and biome tags without replacing any vanilla file, edited in the **World addition** Studio (**Biomes**, **Features** with their step, **Spawns**). Only newly generated chunks get the features.
- **Extra drops**: a new element kind (sidebar **Extra drops**, template **Extra mob drop**) adds drops to vanilla mob, block and chest loot tables on top of their usual drops, edited in the **Extra drops** Studio (tables suggested by **Mobs**, **Blocks** or **Chests**, simple drop rows with a count, a chance and **Only when a player kills it**), and the Creator's new **Extra drop** flow (group **Worlds**). Extra drops come back after `/reload`; a world data pack that replaces the whole table wins.
- **Fuel and compost**: the Item Studio's new **Fuel and compost** section (and the Block Studio's **Block item** section) makes your items burn in a furnace (**Burns in a furnace**, **Burn time (seconds)**) and go in a composter (**Compost chance**, 30% to 100%).
- **Ten new triggers** in a **Triggers** part of the Events editor: for items **On hit**, **On use on a block**, **While held** and **While worn**; for blocks **On break**, **On place**, **On random tick** and **On entity inside**; for mobs **On tick** and **On spawn**. Repeating triggers run at most every 5 ticks, and together at most 2,000 times per server tick. Scripts reach every trigger through `run_script`.
- **Saved data for scripts**: `entity.data` (so `player.data`) and `msm.storage` keep values across `/reload`, closing the world, death and travel between dimensions, separately for each namespace (keys up to 64 characters, 16 KiB per entity and 1 MiB per world for each namespace).
- Templates **Fuel item**, **Life-steal sword (item triggers)**, **Bounce pad (block triggers)**, **Ore in the overworld** and **Extra mob drop**, and the examples **Ore that generates**, **Zombie drops a ruby**, **Fuel log**, **Life-steal sword**, **Night-vision helmet** and **Script: kill counter**.
- **Problems** checks the new content: a spawn whose largest group is below its smallest, a placed feature that would generate twice in a biome, an extra drop's item that does not exist, a pool that is not a valid loot pool (every pool is checked against the vanilla loot pool of the project's Minecraft version), **While worn** on an item that is not armour, **On entity inside** on a full solid block, and a note when a fast repeating trigger runs a function or a script.
- The Java project export writes world additions (`ModWorldgen.java`), extra drops (`ModLoot.java`), components on block items and the ten triggers.
- Plugin API 1.8.0: the data folders `villager_trade` and `trade_set`, biome and loot additions and compost providers for plugins.
- **Potions and brewing**: a new element kind (sidebar **Potions**) adds real potions to the game, of your own status effects or vanilla ones, with a brewing ingredient and base potion, a longer version (redstone dust, id `long_<name>`) and a stronger one (glowstone dust, id `strong_<name>`), and splash and lingering bottles; tipped arrows come with the lingering potion. Your potions are in the creative inventory and work with `/give`, loot tables and potion tags. The export writes up to 15 brewing recipes and the four item names. Potions need the Fabric mod jar: the vanilla packs leave them and their brewing recipes out (a brewing recipe naming a potion the game does not know would stop the whole data pack loading) and warn once (`blocks-items.potion-needs-jar`). New guide chapter **Potions and brewing**.
- **Potion Studio**: the potion's names and ids, its effects (time, level, faint, particles, icon), the brewing ingredient, the longer and stronger versions, splash and lingering, and the brewing chain as steps. The Effect Studio's new **Potion** section lists the potions of the effect and has **Make a potion**, one undoable step. **Problems** reports a potion naming an effect that does not exist, two potions brewed from the same ingredient and base, and a version id that another potion already has.
- **Creator flows**: **Potion** (group **Magic**), with a new effect of its own or a vanilla one, its brewing ingredient and its versions; the **Status effect** flow's **How players get it** gains **A brewed potion**; **Mob skin** (group **Mobs**) gives a wolf, cat, pig, cow, chicken or frog a new skin with placeholder textures of the right size, in a biome you pick or everywhere; **Goat horn** (group **Gear**) adds a goat horn call with a vanilla sound or your own `.ogg`, its length and range, a recipe and, if you like, goats dropping it. Mob skins and goat horns work in vanilla packs.
- **New data kinds**: skins for wolves, cats, pigs, cows, chickens, frogs and zombie nautiluses; sound variants for cats, pigs, cows and chickens; goat horn instruments; enchantment providers; timelines and world clocks; fonts and texture atlases in the resource pack; and tags for banner patterns, dialogs, instruments, points of interest, potions, timelines, features and superflat presets. Each has a sidebar heading of its own and an example in the gallery. Wolf sound variants and trial spawners are left out until the schema data they are checked against is updated.
- **Script API 1.1** (runtime 1.5.0 or later): `player.inventory` (read, set, count, find and remove items, change item components), `entity.equipment` and `setEquipment`, item names, durability and components, experience, hunger and game mode, titles and the action bar, boss bars (`msm.bossBars`, 32 per namespace), damage of a type with an attacker, raycasts up to 128 blocks, teleports to other dimensions, `msm.players()` and `msm.getWorld()`, and six events: `player.tick` (with an interval of at least 5 ticks), `player.respawn`, `player.leave`, `player.changeDimension`, `player.chat` (cancellable) and `entity.damaged` (the health actually lost, after armour; it fires once for a killing blow too, before `entity.death`); `entity.hurt` gains `source` and `direct`. A block placed event, changing damage amounts, commands and creative tabs of your own are not possible yet.
- Templates **Potion of a custom effect**, **Potion with longer and stronger versions**, **Brewing recipe**, **Brewing recipe: splash potion**, **Wolf variant**, **Cat variant**, **Goat horn instrument**, **Icon font**, **Full set bonus** and **Boss bar countdown**, and 30 new examples, among them **Potion of the custom effect**, **Brewed with your own item**, **Snowy wolf skin**, **Custom goat horn**, **Script: full set bonus**, **Script: teleport staff** and **Script: boss fight bar**.
- The Java project export writes potions (`ModPotions.java`).
- Plugin API 1.9.0: `JavaProjectInput.potions` and the data folders of the new data kinds.
- **Block types**: the Block Studio's new **Type** section turns a block into a log or pillar, a block that faces the player (four or six ways), a slab, stairs, wall, fence, fence gate, door, trapdoor, button, pressure plate or pane, each a real vanilla block class that connects, turns, opens and stacks like vanilla's. **Textures** name each face in words and the Studio draws the generated models; **Own models (instead of the made ones)** replaces them. Doors, trapdoors, buttons and plates take a **Set type** (wood, cherry, bamboo, crimson, warped, iron, copper, gold, stone, polished blackstone) and fence gates a **Wood type**; a block can burn (`msm:flammable`) and an axe can strip it (`msm:strippable`).
- **Crops, saplings and leaves**: crops with 1 to 15 growth stages, seeds of their own, produce and villager farming; saplings that grow a tree of your project through bone meal, a two-by-two tree and a tree near flowers; leaves that decay, drop saplings, sticks and an extra item, and take a biome foliage, grass, dry foliage or one-colour tint (shown in the game only). A block's item can have its own id (a crop's seeds).
- **Tree Studio**: the worldgen feature of type `minecraft:tree` opens in a Studio with **Trunk**, **Leaves**, **Below the trunk** and **Decorators** sections, and a new template **Tree for a sapling**.
- **Creator flows** **Wood set**, **Stone set**, **Crop** and **Tree** (group **Blocks**) make whole families with recipes, tags, stripping, burning, composting and, if you choose, trees and wild crops that generate in newly generated chunks; the Simple block flow has **When placed**. The Creator previews a set as a row of blocks.
- 18 templates (a block of each type, plus **Tree for a sapling**), 4 starters, 6 examples (a wood set, a stone set, a crop, a tree, a machine-like block and a vault door) and 15 new placeholder patterns; **Problems** checks the new types (18 `blocks-items` codes).
- The Java project export writes the block types, crops, saplings and leaves, stripping, a client entrypoint for tinted leaves and block item ids of their own.
- Plugin API 1.10.0: `TargetFacts.blocks` (`BlockFacts`: the set type and wood type names).
- **Mob bases and movement**: the Entity Studio's new **Kind of mob** section (**Creature**, **Farm animal**, **Pet**, **Monster**, **Flying creature**, **Water creature**, **Fish**, **Ambient**) and **Base** (plain mob, animal or monster), and a **Movement** section: **Walks**, **Flies** (with **Flying speed** and **Hovers in place when idle**), **Swims (lives in water)** (with **Dries out after (ticks)** and **Breathes air**) or **Walks and swims**. A new spawn rule for animals and one for water animals.
- **Ranged attacks**: the **Ranged attack** section (**Shoots projectiles**: arrows, snowballs, fire charges, wind charges, eggs or a throwable of your project) and the **Ranged attack** goal, with **Circles its target**; new goals **Tempted by items**, **Panic when hurt** and **Leap at target**.
- **Pets, babies and mounts**: **Taming** (food, chance, **Health once tamed**, sit, follow, defend, **On tame**), **Breeding** (food, **Baby size**, **Grows up after (ticks)**, **On breed**) and **Riding** (saddle, **Who can steer**, **Ridden speed**, **Jump strength**, **Riders**, **Saddle bone**, **Set the seat position**, **On mount**). A mob that can be tamed breeds only once it is tamed, as wolves and cats do.
- **Variants and boss bars**: **Variants** gives a mob several skins picked at random by weight or by biome (inherited by babies), and **Boss bar** shows a bar with a colour, a style, a range and sky and fog effects; boss music plays only in the End. The preview has a **Variant** switcher and **Show as a baby**.
- **State animations**: **Sit animation**, **Fly animation**, **Swim animation** and **Shoot animation** in the Entity Studio's **Appearance**.
- **Mobs without GeckoLib, and mobs on 26.4**: the new **Renderer** setting (**Automatic (GeckoLib when present)**, **GeckoLib only**, **Built-in renderer**) lets the runtime draw a mob itself from the same model and animation files. Mobs now export, register and render on the 26.4 snapshot; a project whose mobs all use the built-in renderer needs no GeckoLib download. It plays plain numbers with linear or smooth keyframes; Molang, other easings and sound or particle keyframes are left out (a warning names them).
- **Creator flows** **Pet**, **Farm animal**, **Mount**, **Flying mob**, **Water mob** and **Boss** (group **Mobs**), six preset models (four-legged, bird, fish, round flyer, two-legged and cube creature) with animations and placeholder skins, **Extra variants** (and a **Hostile archer** behaviour for the **Custom mob** flow). Every mob flow is available on both Minecraft versions.
- 7 mob templates (**Pet**, **Farm animal**, **Mount**, **Flying creature**, **Fish**, **Archer**, **Boss**), 6 starters, 7 examples (a tameable pet, a rideable flying mount, an archer with a throwable, a fish school with biome variants, a boss with a boss bar and a mob drawn without GeckoLib) and the sample project `fixtures/sample-creatures` with an in-game checklist for 26.3 and 26.4.
- The Java project export writes all of the above for 26.3: bases, movement, ranged attacks, taming, breeding, riding, variants and boss bars.
- The AI helper knows the bases, movement, the new components and goals, the renderer and the six mob flows.
- Plugin API 1.11.0: `TargetFacts.entities` (`EntityFacts`: the projectile items a mob may fire and the saddle tag).
- **Containers**: the Block Studio's new **Inventory** section (**Holds items**: **Storage**) gives a block slots: a **Chest** of 1 to 6 rows, a **Hopper (5 slots)**, a **Dispenser (3 by 3)** or a holder without a window (**No screen (holder)**), with **Keep contents when broken** for a 3-row chest (a shulker-box crate), **Hoppers can use it**, **Comparators read it**, open and close sounds and the events **On open** and **On close**. Players get the vanilla windows; a container fills from a loot table on its first opening.
- **Machines**: **Holds items** **Machine** makes a block with an input, a fuel and an output slot and a **Recipes** table of its own (ingredient, count, result, time, experience), or one that uses **Smelting**, **Blasting**, **Smoking** and **Campfire cooking** recipes faster or on a redstone signal. **Power** (**Fuel**, **Redstone signal**, **Always**), **Speed**, **Default time (seconds)**, **Screen**, **Comparator**, **Light while working** and the events **On start** and **On finish**. The textures **Front when open** and **Front when working** and the `open` and `lit` models change the look.
- **Creator flows** **Storage crate** and **Machine** (group **Blocks**), 8 templates (**Storage crate**, **Small crate (1 row)**, **Item holder**, **Hopper box**, **Dispenser box**, **Grinder machine**, **Fast furnace**, **Redstone machine**), 2 starters, 3 examples (**Loot crate in a structure**, **Ore crusher**, **Shulker crate**) and the sample project `fixtures/sample-machines`.
- **Script API 1.2** (runtime 1.6.0 or later): `world.getContainer(pos)` returns a container with `size`, `get`, `set`, `count` and `add`, for MCSuperMods containers and machines and for vanilla chests, barrels, hoppers and furnaces.
- **Problems** checks the new content: a layout field on the wrong layout, keep contents on anything but a 3-row chest, an event the block does not declare, a block with both a container and a machine, an unknown recipe type or item, and machine recipes on a block that is no machine. Machine recipes and the crafting recipes and loot tables of these blocks stay out of vanilla data packs. New guide page [Containers and machines](docs/guide/containers-and-machines.md).
- The Java project export writes containers and machines for 26.3 (`ModBlockEntities.java`, `ModRecipes.java`, block entity classes and the machine recipe classes). The AI helper knows the new components and flows.
- Plugin API 1.12.0: `BlockFacts.containerSounds` and `BlockFacts.machineRecipeTypes` in `TargetFacts.blocks`.
- **Portals**: the Block Studio's new block type **Portal** (section **Portal**: **Frame**, **Travel**, **Looks**) makes a portal like the Nether's: players build a frame of a block or tag you choose, light it with an item of your choice (flint and steel by default) or by an event, and step in to reach a dimension of your own, the Nether or the End, and back. It has a **Scale** (**8:1 like the Nether** or any number), **Arrive** (**In a linked portal**, which finds or builds an exit portal, or **On the ground**), a delay and cooldown, **Players only**, **Wobble and overlay**, particles (coloured dust in a colour of your choice), sounds and an **On travel** event. The new action **Light a portal (light_portal)** lights a portal from any event.
- **Creator flows**: the **Portal** flow (group **Worlds**) makes the portal, its frame block with a recipe and, if you like, a new dimension with a travel function; the **Dimension** flow gains **A portal (needs the Fabric mod jar)** under **How to get there**, and its **Key colour** is now **Key or portal colour**.
- 3 templates (**Portal to the Nether**, **Portal to the End**, **Trigger-lit portal**), 1 starter, 1 example (**Two-way sky portal**), 2 new placeholder patterns and the sample project `fixtures/sample-portals`; **Problems** checks portals (ten `blocks-items` codes). Portals need the Fabric mod jar: the vanilla packs keep the dimension and the travel function, and leave out the frame block's recipe and loot. New guide chapter **Portals**.
- The Java project export writes portals for 26.3. The AI helper knows the Portal flow and templates.
- Plugin API 1.13.0: `BlockFacts.portal` in `TargetFacts.blocks` (the Nether portal's sounds and particle).
- **Particles of your own**: a new element kind (sidebar **Particles**) adds a particle type to the game, drawn from one to 64 frame pictures with its size, lifetime, movement, tint, fade, spin, glow and collision. It works anywhere a particle can be named: the **Spawn particle** action, a block's ambient particles, an effect's particle, a portal's particles, leaves, scripts and `/particle`. Particles need the Fabric mod jar on the client and the server.
- **Particle Studio**: **Pictures** (reorder, paint, add a frame, **Split a strip into frames** as one undoable step, **Animation**), **Life and size**, **Movement**, **Colour and light** and a live **Preview** (**Burst**, **Stream**) that follows the game's rules.
- **Ambient particles**: the Block Studio's new **Ambient particles** section makes a block show a particle by itself, with a chance, a count, a place, a velocity and optional block states, on every type except portals.
- **Better Spawn particle**: a **Kind** (**A particle**, **Coloured dust**, **Block pieces**, **Item pieces**), **Motion X/Y/Z** for an exact velocity and **Show from far away**; up to 1000 particles per action. Project particles come first in every particle picker.
- **Retexture a vanilla particle**: a resource pack template (sidebar **Particle pictures**) gives a vanilla particle a picture of your own, in a plain resource pack.
- **Creator flow** **Particle** (group **Magic**): a spark, orb, puff, leaf or your own picture, with its size, life, movement, glow and fade, shown around a new block, sent by a new item or made alone.
- 5 templates (**Glowing spark**, **Falling petal**, **Smoke puff**, **Block with ambient particles**, **Retexture a vanilla particle**), 1 starter, 3 examples (**Blue flame**, **Drifting ember**, **Firefly jar**), 4 placeholder patterns and the sample project `fixtures/sample-particles`. **Problems** checks particles (lifetime range, clashing descriptions, particle types that need options, unknown or invalid options, a frame picture that is missing).
- **Script API 1.3** (runtime 1.7.0 or later): `world.spawnParticle` takes vanilla particle options objects (dust, block and item particles) and the options `motion` and `force`.
- **Script API 1.4** (runtime 1.8.0 or later): `world.dayTime`, `world.isRaining`, `world.isThundering`, `world.setWeather`, `world.explode`, `world.dropItem`, `world.breakBlock` and `entity.remove()`. Time 0 is sunrise, 6000 noon, 13000 nightfall and 18000 midnight; weather is server-wide and reads `false` in the Nether and the End.
- The Java project export writes particles for 26.3. The AI helper knows the particle kind, the flow, ambient particles and the two new Script API levels.
- Plugin API 1.14.0: `TargetFacts.particles` (`ParticleFacts`: the 22 particle types that take options and the description and picture folders) and `JavaProjectInput.particles`.
- **Rules**: behaviour without code. A new element kind, the rule book (`msm:rules`), holds rules written as sentences: **When** something happens (43 moments for blocks, containers, machines, portals, items, thrown items, mobs, effects, players, the world and "any" block, item or mob), **Only if** conditions hold (16, including chances, counters, the time and the weather), **Do** steps (36: give and take items, heal, hurt, teleport, launch, titles and messages, effects, place and remove blocks, spawn mobs, drop items, explosions, weather, sounds, particles, boss bars, counters, and **If ... otherwise ...**, **Repeat**, **For each player** and **Wait**). Rules compile to ordinary events when plain and to a generated script when they need logic, and need the Fabric mod jar. Exporting a vanilla pack says so (`rules.needs-jar`); the Java project export lists rules that need a script (`rules.not-in-eject`).
- **Rule book Studio** with sentence cards, counters, a thing picker with your things first and Minecraft's pictures, and, in Advanced mode, **What this becomes**. A **Rules** section in the Block, Item, Mob and Effect Studios shows and adds the rules of the thing; the Events editor shows **From rules** and offers **Turn into rules** for a hand-made event, as one undo step.
- Six templates in the category **Rules** (**Welcome message**, **Jump pad**, **Lucky block**, **Healing spring**, **Click counter**, **Mob drops a reward**), the examples **Rules: a lucky block** and **Rules: a guard mob**, the sample project `fixtures/sample-rules`, and the AI helper writes rule books.
- **Very easy mode**, a third mode beside Easy and Advanced and the start for a new install: Home with 13 "Make something" tiles, **My things** (Edit in Creator, Rename, Duplicate, Delete), **Things to fix** in plain words with **Show me** and **Fix it**, a new mod that asks only for a name, and **Share my mod**. The Welcome asks **How do you want to work?**
- **Play and Reload**: **Play** (F5) saves, builds the mod and starts it in a managed Prism instance, in a flat Creative test world with a test area and chests of everything you made; **Reload** (Ctrl+R) sends changes to the running game; **Restart needed** lists in words what only a restart can read, and **Restart** does it. The menu has **New test world** and **Open the test instance's folder**. The runtime has a dev mode for the managed instance only; it is off on servers and in your other instances.
- New guide pages **Rules**, **Very easy mode** and **Playing and testing**; the first mod, Creator, scripting and Java project pages mention them.
- Plugin API 1.15.0: `PluginContributions.projectExpanders` (plugins can patch elements before lowering) and `TargetFacts.dev` (the game rules and world data folders the test world uses).

### Changed

- **Reload in Game** is Ctrl+R (Cmd+R on a Mac) and **Play** is F5. The app window's own reload moved to Ctrl+Shift+R (**View > Reload Window**).
- Mob events run `run_function` as the mob when no player is involved (**On tick**, **On spawn**, and **On hurt** and **On death** without a player), so `@s` in those functions is the mob; before, they ran as the server and had no `@s`.
- The AI helper writes plain sound keys inside MCSuperMods' own data, `{ "sound_id" }` in vanilla data, and uses `entity.runCommand` to run something "as" a creature.
- The guide chapters on blocks and items, entities, scripting and the Java project export describe the above, including the new **Block shapes** and **Triggers** sections, and a new chapter, **Adding to vanilla**, covers world additions, extra drops, fuel and compost and villager trades with their limits.
- The AI helper knows world additions, extra drops, fuel and compost, the new triggers and saved script data.
- The guide chapters on status effects, the Creator, adding to vanilla, scripting, the Java project export and templates and examples describe potions, the new flows, the new data kinds and Script API 1.1.
- A new guide chapter, **Block types, families and plants**, and updated chapters on blocks and items, the Creator and templates and examples describe the types, the four flows, burning and stripping, what the vanilla packs leave out and the limits (no signs or boats, sounds of door sets are vanilla's, stripping only by players, leaf tint only in the game, villagers farm only on farmland, tree shapes are vanilla's).
- A new guide chapter, **Mob behaviours**, and updated chapters on entities and models, the Creator, Minecraft versions, the Java project export and templates and examples describe the mob parts, the renderer choice, mobs on 26.4 and the limits (ridden mobs move on the rider's game, the built-in renderer plays fewer animation features, mobs with a brain are out of reach, there is no held bow pose, spawn caps are shared with vanilla mobs, boss music only in the End, and the base needs a restart to change).
- A new guide chapter, **Particles**, and updated chapters on blocks and items, the Creator, status effects, portals, scripting and templates and examples describe the particle kind, the Studio, the flow, ambient particles, what the vanilla packs leave out, the limits and Script API 1.3 and 1.4.

### Fixed

- A crop (and any other block whose generated models stand in for a texture) no longer reports a false `blocks-items.type-needs-appearance` error.
- **Vanilla data packs of mixed projects load**: a vanilla server refuses a whole data pack when one of its recipes, loot tables, advancements, tags, worldgen or other files names a block, item, effect, potion or mob that only the Fabric mod jar adds (a block's own loot table was enough). The vanilla data pack and the data half of **Both packs into a folder…** now leave such files out and say which in **Problems** (`export.mod-only-reference`), make tag entries naming them optional, and keep functions with a warning (`export.mod-only-function`); the Fabric mod jar keeps everything. Work in progress (ADR 0066).
- In the Studios, clearing a value inside a row of a list (for example turning a potion effect's **Particles** switch back on) now removes it; before, the old value stayed.
- The Java project export of a walk-through block (**Block shapes**) wrote a block properties line that did not compile.
- After a script cancels an interaction, the game sends the player's inventory, the six neighbours of a placement and a broken block's block entity again, and clears an item cooldown, so the client no longer shows results the server refused.

## [1.4.0] - 2026-11-13

### Added

- **Status effects of your own**: the Creator's **Status effect** flow (new **Magic** group) makes an effect with its name, colour, icon, stat changes and what it does every few seconds (heal, hurt, particles or a function), plus a drink or a throwable flask that gives it. The new **Effect Studio** edits effects by hand: category, colour, particle, sound, stat changes per level and events when the effect starts, while it is active and when it ends. Three effect templates; paint the 18 by 18 icon with **Paint icon** or **New texture…** and the kind **Effect icon**. Custom effects work in drinks, food, totems, **Apply effect** and `/effect`; they cannot be brewed.
- **Throwables**: the Creator's **Throwable** flow (under **Gear**) makes a ball, a knife you pick up again, a boomerang that comes back to your inventory or a bomb, with its damage, speed, weight and what happens on a hit. Any item can be thrown through the Item Studio's new **Throwable** section (damage, speed, gravity, hold to throw, what happens after the throw, hit events); dispensers throw them too. A **Throwable item** template and the **Frost bomb** and **Script: scripted effect** examples.
- **Hurt** and **Heal** actions for every event, and scripts can check and remove effects (`hasEffect`, `effectLevel`, `removeEffect`) and see the entity a thrown item hit (`e.other`).
- The Creator's **Card** tab previews a status effect (icon, name in its colour, a table per level) and a throwable (its picture, a sketch of the throw, damage and what happens after).
- The Java project export writes status effects (`ModEffects.java`) and throwables (`ThrownItemEntity.java`).
- The AI helper knows status effects and throwables and the new placeholder pictures (ball, knife, boomerang, flask, effect icon).
- **Dimensions** in the Creator (new **Worlds** group): pick the terrain, the biome and the sky, and travel there and back with a key item or a command.
- **Drag and drop textures**: drag a texture from the assets onto an item, block or model in the sidebar or onto the live preview to use it (one Undo puts the old one back); drop pictures from your computer on the window to open Picture to texture with them.
- **Picture to texture** has more options: turn and mirror, fit the whole picture instead of cropping, brightness, contrast, colourfulness and hue, and a dark or coloured outline; several pictures go in a tray where one click switches between them.
- **Wishlist** (Help menu): when the AI helper cannot build something exactly, it builds the closest version, says what is missing and adds it to the project's Wishlist; add your own wishes and copy the open ones to ask for them.
- **Real pushes**: scripts can read an entity's `velocity` and `look` and call `setVelocity` and `addVelocity`, and events have a **Launch (push)** action, so launchers, jump pads and dashes move you smoothly instead of in small teleports.
- Functions can name the project's own dimensions (`execute in`) without a warning.
- **Problems** reports a sound of your project's `sounds` element written as a plain string in a vanilla sound field (such as a jukebox song's sound), which the game cannot load, and says to write it as `{ "sound_id": "..." }`.
- Exporters from plugins are also under **File → More Exports**, as in the toolbar's **More exports**.
- Plugin API 1.5.0: the Creator group `worlds`. Plugin API 1.6.0: the Creator group `magic` and the status effects of a project for Java project generators.

### Changed

- Worldgen: a placed feature used in different steps of a biome is now a warning, not a feature order cycle error; only a real cycle inside one step is an error, as in the game.

### Fixed

- **Test in Minecraft** loaded the mods of every project tested before in the same instance; now only the project you test (and Fabric API) runs. Mods you added yourself stay.
- The Music disc flows' discs with your own song failed to load in the game: the song now names its sound in the form the game accepts.
- The Java project export left out `Actions.java` for a project whose only events were on items or blocks; it is now written whenever a definition declares events.

## [1.3.0] - 2026-11-07

### Added

- **Your own song on a music disc**: the Music disc flow's **Song file** takes an `.ogg`; the disc plays it and the jukebox's playing time comes from the file.
- Custom armour materials take an optional `body` armour value for horse and wolf armour (it was always the chestplate value).
- The Creator's **Stats** tab shows the real numbers of a vanilla-tier tool: attack damage, attacks per second, durability, mining speed and enchantability.
- **Problems** warns about an `msm:components` entry (such as `minecraft:enchantments`) that names a data pack entry the game cannot apply when it loads items.
- Plugin API 1.4.0: `audio` starter parameters (`AudioStarterParameter`), `ItemFacts.dataPackComponents` and `ItemFacts.vanillaTools`.

## [1.2.0] - 2026-11-07

### Added

- **New texture…**: paint a texture from a blank picture, sized for an item, a block, an armour layer or a painting. Undo removes it again.
- **Picture to texture** (File menu, palette, and the picture button by a namespace's assets): paste a screenshot, drop or choose any picture (PNG, JPEG, GIF, BMP, WebP), crop it, scale it smooth or sharp, make the background transparent and reduce the colours, then add it as an item, block, armour, mob skin or painting texture, or touch it up in the painter first. Old 64 by 32 player skins become the 64 by 64 layout.
- **Player skins on mobs**: the Custom mob's new **Skin** field wears a player skin (64 by 64 with its hat and sleeves layer, or an old 64 by 32 one), and **Arms** offers slim 3-pixel arms.
- **Screenshots for the AI helper**: paste, drop or attach up to four pictures to a message, or to **New project with the AI helper…**, and the helper builds what it sees.

### Changed

- Better placeholder art: thicker pickaxe, axe, shovel and hoe heads with two-tone wooden handles, a panelled storage block, a shaded ingot and grain on the worn armour layers.

## [1.1.0] - 2026-11-06

Easier to use, a live preview beside the form, painting, and modpacks. Projects from 1.0.0 open unchanged; your current view stays as it was until you switch to Easy mode.

### Added

- **Easy and Advanced mode**: Easy mode (the default for new installs) lists what you made first, sets from the Creator under their own names, and folds the technical files away; Advanced mode shows everything and Raw JSON. Switch on the toolbar or under **View**.
- **Easier navigation**: search the element list, fold groups, and read plain group names such as Items, Recipes and Armour looks.
- **Live preview beside the form** for items, blocks, armour (on a figure, with parts you can show, hide and jump to), recipes, models, structures and mobs, redrawn as you edit.
- **New project with the AI helper…**: describe your mod and the AI helper builds it in a new project.
- **Paint textures** inside MCSuperMods: the brush on a texture's row opens a pixel editor with pencil, eraser, fill, colour picker, zoom and undo; saving is one undoable step.
- Custom bows and crossbows show the pull while drawn or charged, as vanilla ones do, and the Creator draws the frames. A warning names any pulling model a bow or crossbow of your own is missing.
- **Modpacks** (**File → Modpacks…**): group your projects into modpacks, add mods from Modrinth by name or link, export a modpack as a Modrinth `.mrpack` for Prism Launcher or the Modrinth app, and test all its mods together in Minecraft. Projects stay in their own folders; one project can be in several modpacks. **Update mods** fetches the right version of each Modrinth mod after you change the modpack's Minecraft version.
- Plugins can say which Minecraft versions their templates, starters and examples work on, and MCSuperMods hides them on the others.

## [1.0.0] - 2026-11-06

MCSuperMods 1.0: everything from 0.7.0, with the plugin platform and the second Minecraft version finished and documented. Projects from 0.7.0 open unchanged.

### Added

- **Your first mod**: a welcome on the first start that walks you through making a ruby tools and armour mod and testing it in Minecraft, with a matching guide page. Open it again with **Help → Your First Mod…**.
- Guide pages for plugins and for Minecraft versions (including Upgrade Project Target), and automated tests that load a sample plugin and upgrade a project to the snapshot target.
- Exporters from third-party plugins are offered under **More exports** in the menu next to **Export .zip** and in the command palette; one with options asks for them first.

### Fixed

- Copying an example now says when it merged entries into language files or tags the project already had.
- Building a plugin made with `tools/new-plugin --external` on Windows failed with "the mcdoc export has no types"; the build steps now work on any drive.

## [0.7.0] - 2026-11-06

### Added

- **AI helper.** An optional assistant in a third tab next to **Preview** and **Problems** (toolbar **AI helper**, **View → AI Helper** or Ctrl+Shift+A). It uses your own Anthropic API key, which you add under **Settings → AI helper**; MCSuperMods keeps it encrypted and usage is billed to your Anthropic account. In **Chat** it answers questions about your project and proposes small edits; in **Build** it makes whole content from one prompt, showing a plan first (**Build all**, **Step through** or **Revise**). Nothing changes until you review the proposed changes, keep or drop each one, and press **Apply**; one Undo takes everything back. Each run has limits you can change under **Run limits**, a **Stop** button and a line with the tokens used and the approximate cost. **Explain** on a problem and **Ask AI** in the editor start a question with the context filled in. The app works as before without a key. See the new guide page "AI helper".
- **The Creator.** **Create…** on the toolbar (also **File → Create…**) makes a finished piece of content from a few questions, with a live preview of the items, blocks, recipes, worn armour and stats as you type: a **Gear set** of tools and armour from one material, a **Weapon**, a **Consumable**, a **Totem**, an **Enchantment**, a **Painting** (with your own picture), a **Music disc**, a **Simple block**, a **Food**, **Custom ore**, a **Custom mob** or a **Scripted behaviour** item. **Create** adds everything in one undoable step. **Edit in Creator** reopens a set with the same answers and keeps the pieces you changed by hand unless you choose **Overwrite**.
- **Armour.** Helmets, chestplates, leggings and boots with a vanilla or your own armour material, and the new **equipment** element for how armour looks when worn.
- **Custom tool materials.** Tools with your own durability, mining speed, attack bonus and enchantability, mining like a chosen vanilla tier, and optional attack damage and speed.
- **Weapons, consumables and totems.** Spears, maces, bows, crossbows and shields; food and drinks with effects, items with a cooldown, and totems that save their holder from death; horse and wolf armour. The Events editor has a new **Apply effect** action. These, and other vanilla item components, are set in the Item Studio's **Advanced (all fields)** or **Raw JSON**, or made by the Creator.
- **Starter wizards.** **Custom ore**, **Custom mob** and the new **Custom sword** starter ask a few questions (name, colour, tier and more) in a step-by-step **New project** dialog before they create the project.
- **A second Minecraft version.** New projects can target Minecraft 26.4 (a snapshot) as well as 26.3: choose it under **Minecraft version** in the **New project** dialog. **File → Upgrade Project Target…** moves a project to another version and shows what changes first; the status bar shows the project's version. Mobs cannot be exported for 26.4 yet, because GeckoLib has no build for it.
- **Plugins made by other people.** MCSuperMods loads plugins from `.msm/plugins` in your home folder, in a sandbox without network or file access. **Settings → Plugins** lists them as loaded, refused or failed, with **Open plugins folder**; changes take effect after restarting MCSuperMods. Each release now carries the plugin API package (`msm-plugin-api-1.2.0.tgz` for this one) for plugin authors.
- More content: 125 element templates (armour, weapons, drinks, totems, equipment and painting variant tags among them), 24 project starters and 71 examples.

### Changed

- **Help → Examples…** and starters copied into a project now add missing lines to language files and tags that already exist, instead of skipping them, and never add a second `pack.mcmeta` or mod element.
- The toolbar buttons Undo, Redo, Add namespace, Import assets, AI helper and Settings show icons only (their names appear as tooltips), so the toolbar fits on one line.

### Fixed

- A project whose only data pack content comes from a plugin's element (for example the sample **Greeting**) can now export its data pack; before, **Export** said the project had no data pack content.

## [0.6.1] - 2026-11-05

### Added

- **What's new.** After an update, MCSuperMods shows what changed in the new version once. You can open it again at any time from **Help > What's New…** or the command palette ("What's new…"), and from the update banner before you restart.
- **Update notifications.** With **Check for updates automatically** on (Settings > Updates), MCSuperMods checks a few seconds after it starts and then every six hours. A new version shows the banner "Version X is available, downloading…" on its own, then "Version X is ready" with **Restart to update**, plus a Windows notification once the download has finished.

### Changed

- **New project**, **New from starter**, **Open project** and **Open as new project** in the Examples gallery now open their folder picker where you last chose a project folder, instead of the default folder every time.

### Fixed

- A new version published while MCSuperMods was already open was only found by **Help > Check for Updates…**; the app now looks again every six hours and tells you without a click. Copies of 0.6.0 and older still check only once at start-up, so restart the app (or use **Help > Check for Updates…**) to get this version.

## [0.6.0] - 2026-11-05

### Added

- **Scripting with TypeScript.** Add a script from a template under **Scripts** (or start from the **Scripted ore** starter) and edit it in the **Script Studio**, a TypeScript editor that completes the `msm` API as you type and checks each script as you go. Scripts react to block, item and mob events, schedule work and define new actions.
- A block, item or mob event can call a script with the new `run_script` action.
- Scripts travel in the Fabric mod jar and run on the server in a sandbox: no access to Java, files or the network, and at most two seconds per call.
- **Export Java project (eject).** **File > Export Java Project…** writes your blocks, items and mobs as a standalone Fabric Gradle project with generated Java, which builds with `./gradlew build` and JDK 25. It is one-way, and scripts are not included.
- The ejected projects are tested to behave the same as the Fabric mod jar (parity tests).
- More content: 116 element templates, 13 starters and 69 examples.

## [0.5.0] - 2026-11-05

### Added

- **Custom mobs.** A new entity kind with health, speed, goals (wander, melee attack, flee, follow and more), natural spawning in chosen biomes, a spawn egg and events, including `play_animation`.
- **Blockbench import.** **File > Import Blockbench Model…** reads a `.bbmodel` project (Blockbench 4 and 5) or Blockbench's `.geo.json` and `.animation.json` exports; the model, its animations and texture appear under **Models and animations**.
- **Entity Studio** to set up a mob: model, texture, animations, stats, goals, spawning and events.
- **Animated preview.** The **Preview** tab plays the model's animations.
- Mobs export in the same Fabric mod jar, which carries GeckoLib (downloaded once on the first export with mobs).
- **Separate runtime and GeckoLib (for modpacks)** leaves both out of the jar for modpacks that already have them.
- The **Custom mob** starter (an animated Ruby Golem).

## [0.4.0] - 2026-11-05

### Added

- **Custom blocks and items.** New blocks and items with behaviour (components and events such as dropping items, playing sounds or giving effects), edited in the **Block Studio** and **Item Studio**.
- **Export Fabric mod jar.** **File > Export Fabric Mod Jar…** (or **Fabric mod (.jar)…** in the Export menu) makes one jar with your blocks, items, resources and data, plus the small `msm_runtime` mod that runs them.
- **Test in Minecraft.** **File > Test in Minecraft…** copies the jar into a Prism Launcher or MultiMC instance with Fabric, adds Fabric API when missing and starts the game. **Create test instance** makes a ready instance when you have none.

### Changed

- The **Custom ore** starter now adds a real Ruby Ore block, a Ruby item and a Block of Ruby, instead of reusing vanilla blocks.

## [0.3.0] - 2026-11-05

### Added

- **Structures.** **File > Import Structure…** reads `.nbt` structure files and Sponge `.schem` schematics; **More Exports** writes them back out. The **Structure Studio** shows a 3D preview and edits size, palette and jigsaws; the **Template Pool Studio** edits jigsaw pools.
- **Worldgen.** Custom biomes (with colour pickers in the **Biome Studio**), configured and placed features, structure sets, dimensions, World Types, noise settings and the other worldgen kinds, plus a climate map.
- Project checks that find broken references between elements before you export.
- Worldgen starters: **Custom biome**, **Jigsaw village-style structure** and **Custom biome with a jigsaw structure**.
- **Install Data Pack…** shows each world's real name.
- **File > Open Recent** and a recent projects list on the start screen.

### Fixed

- **Help > Check for Updates…** says when no release has been published yet, instead of claiming the app is up to date.

## [0.2.2] - 2026-11-04

### Added

- **Templates and examples.** A template for every element kind in **Add element**, grouped by category with a filter box.
- Project starters under **New from starter…**, such as **Custom ore**, **Recipe pack**, **Custom music disc** and **Functions**.
- An examples gallery under **Help > Examples…** that opens an example as a new project or copies it into yours in one undoable step.

## [0.2.1] - 2026-11-04

### Fixed

- The **Game locations** list in Settings no longer hides rows or scrolls sideways with long paths.
- A hint now appears when the official launcher folder is really a launcher instance, with a button to select that instance.

## [0.2.0] - 2026-11-04

### Added

- **Data Pack Studio.** Recipes (with the **Recipe Studio**), loot tables, advancements, predicates, item modifiers and tags (with the tag editor), and more data kinds as forms.
- A **function editor** for `.mcfunction` files that shows problems and completes commands as you type.
- Export a data pack, or both packs together, and install a data pack into a world.
- **References and renaming.** Go to definition, find usages and rename an element everywhere in one step (F2).
- A command palette (Ctrl+Shift+P).
- Animated texture preview.
- **Prism Launcher, MultiMC and CurseForge support.** Install packs into a launcher instance and read preview textures from any launcher's copy of the game.
- **In-app updates.** The installed Windows app downloads new versions in the background and installs them when you choose **Restart to update**.

### Fixed

- **Help > Check for Updates…** gives a short, friendly message instead of a long technical error.

## [0.1.0] - 2026-11-04

### Added

- First release: the **Resource Pack Studio**. Import textures, edit block and item models, blockstates, language files, sounds and `pack.mcmeta` in guided forms or as Raw JSON, with a live 3D preview.
- Export a resource pack as a `.zip`, or install it straight into your Minecraft `resourcepacks` folder.
- Windows installer (unsigned, so Windows SmartScreen warns on the first run).

[Unreleased]: https://github.com/MEZTKING/MCSuperMods/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/MEZTKING/MCSuperMods/releases/tag/v0.7.0
[0.6.1]: https://github.com/MEZTKING/MCSuperMods/releases/tag/v0.6.1
[0.6.0]: https://github.com/MEZTKING/MCSuperMods/releases/tag/v0.6.0
[0.5.0]: https://github.com/MEZTKING/MCSuperMods/releases/tag/v0.5.0
[0.4.0]: https://github.com/MEZTKING/MCSuperMods/releases/tag/v0.4.0
[0.3.0]: https://github.com/MEZTKING/MCSuperMods/releases/tag/v0.3.0
[0.2.2]: https://github.com/MEZTKING/MCSuperMods/releases/tag/v0.2.2
[0.2.1]: https://github.com/MEZTKING/MCSuperMods/releases/tag/v0.2.1
[0.2.0]: https://github.com/MEZTKING/MCSuperMods/releases/tag/v0.2.0
[0.1.0]: https://github.com/MEZTKING/MCSuperMods/releases/tag/v0.1.0
