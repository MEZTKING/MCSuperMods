# Game modes

MCSuperMods makes whole games, not only things to put in one: a Skyblock on an island in empty sky, a one block game, a world of floating islands, a lucky block, an adventure map, an arena for teams, a race and a tab of goals. Each is a few questions away, and each is made of ordinary pieces you can open and change afterwards.

Most of a game is plain data pack files, so it works in a vanilla data pack with no mods. Only two things need the **Fabric mod jar**: [Rules](rules.md) (the lucky block is made with a rule book) and a liquid of your own (a Skyblock generator of your own). To share a finished world, see [Maps](maps.md).

## Make a game in a few questions

On Home, **Make a game** (under the heading **Games** on Home) shows eight pictures; in the [Creator](creator.md) the same flows are under **Games**. Every flow asks for a name first: the game's name is the World Type's name on Create New World and names its pieces.

| Flow | Questions | What you get |
|---|---|---|
| **Skyblock** | **The island you start on** (A corner island with a tree, A round island with a tree, A tiny island with a sapling, My own building (choose it later)), **What is in the chest** (A lava bucket and two ice (for a cobblestone generator), Seeds, A sapling, Bone meal, Bread, Mushrooms), **Mobs spawn on my islands**, **The Nether** (As normal, Empty sky too), **Extra trades for the wandering trader**, **Recipes for what the sky lacks**, **A generator of my own** (with **What is the liquid called?** and **What it makes with water**), **Goals** | A World Type of empty sky with a sky biome, the island placed when the first player joins, the chest, extra wandering trader trades, recipes for sand and gravel and a tab of goals |
| **One block** | **Phases** (Plains, Underground, Deep dark, Nether, Ocean, End), **Breaks in each phase**, **Chests now and then**, **Mobs now and then**, **Start again after the last phase**, **How my world starts** (Empty sky, or As normal, with the block high above the spawn) | One magic block that turns into the next block each time it is broken, phase after phase, with a chest or a mob now and then |
| **Sky islands** | **The islands** (Floating islands with land, Islands like the End's), **Biomes** (the overworld's biomes, or one of six), **Start island** | A World Type of islands over the void, with a start island |
| **Lucky block** | **What is the block called?**, how often each thing happens (**Prizes from a loot table**, **A mob appears** with **Which mob**, **An explosion (breaks nothing)**, **A small building appears**, **An effect** with **Which effect**: Never, Rarely, Sometimes or Often), **Colour**, **The mark on it** | A block of your own with its recipe and a rule book that picks one thing at random when it is broken. Needs the Fabric mod jar |
| **Adventure map** | **How my world starts** (As normal, Flat), **Start as** (Adventure, Survival, Creative), **Welcome** (Welcome message, Welcome screen, None) and **What the welcome says**, **Game rules when the world starts**, **Checkpoints**, **Goals** | The start of a map: players start in the mode you chose with a welcome, the game rules are set once, each checkpoint sets where players respawn, and goals mark the way. You build the map itself in the game |
| **Arena game** | **Teams** (Two teams, Three teams, Four teams), **The arena** (Small, Medium or Large), **What it is made of**, **Rebuild as soon as a round ends**, **Round length in minutes**, **Score to win**, **What new players get** | Teams, defeats on the sidebar, a round timer on the boss bar and an arena that is built afresh for each round. A round starts with `/function <namespace>:<game>/start` |
| **Race** | **Checkpoints between the start and the finish**, **Timer** (Count up: a stopwatch, Count down from a time limit), **Time limit in seconds**, **Best time on the sidebar** | A start, checkpoints and a finish as areas, the time on the action bar and the best times on the sidebar |
| **Goals** | **What is the tab called?**, **The goals** (fifteen, from Get some wood to Defeat the ender dragon), **The picture on the tab** (a flag or a timer drawn by MCSuperMods, or a Minecraft item) and **Colour of the flag or timer**, **Behind the goals** | A tab of goals in the advancements screen |

The Creator's **Map** tab draws the world of a Skyblock, a one block game in empty sky and Sky islands while you answer ([The live world map](live-world.md)), and its **Live** tab the island, the arena or the lucky block. On Home, the fifth picture of **Make a world** opens the Skyblock flow too.

For an adventure map, give the players' tools and keys the blocks they may break or use in the Item Studio's **Adventure mode** section ([Adventure mode](blocks-and-items.md#adventure-mode)).

Help > Examples… has one finished game per flow under **Games**: Cloud Farm, Deep Block, Blossom Isles, Star Block, Crystal Road, Four Kingdoms, Canyon Dash and Explorer, and one small example of each piece. **Add element** has the templates of the category **Games** (an empty sky world, a flat building world, a floating islands world, an adventure in the normal world, a one block in three phases, two teams, two scores, a countdown, a stopwatch and an arena).

## The pieces of a game

A game is made of six kinds of pieces. The list on the left shows them as **How my world starts**, **One blocks**, **Teams**, **Scores**, **Timers** and **Areas**, each with a Studio. Every Studio shows a live view that follows your edits, and in its **More options** a line **In chat or a function:** with the commands that reach the piece in the game.

### How my world starts

The **World Setup Studio**. A project has at most one.

- **Your world**: the map of the world this makes, drawn live (nothing for **As normal**, which is the game's own world).
- **The world**: **World** is **Empty sky**, **Floating islands**, **Flat** (with a **Block** and **How thick** for each layer), **As normal** or **My own world type** (one of your World Types). **Biome** is the sky's biome; **The Nether** and **The End** are **As normal** or **Empty**. Every choice but **As normal** becomes a World Type, named after the setup.
- **Start island**: **Players start on a structure of mine**, then **The structure**, **Where its corner goes** and **Where players start, on the structure** (picked on the structure seen from above). The island is placed by a function when the first player joins. Under **More options**, **Place it while the world generates** places it as the world is made instead; the game then turns it at random and nothing is placed with "Generate structures" off, so the first join is the default.
- **Players**: **Start as** (the game mode), **Difficulty** and **How far from the start players appear (blocks)**.
- **Game rules when the world starts**: Minecraft's rules and your own, set once when the world first starts.
- **What new players get**, once each: **Their kit** (**Nothing**, **These items** or **Items from a loot table**), effects, a **Welcome message**, a **Welcome screen** (one of your dialogs) and **Goals (their first advancement)**.

### One blocks

The **One Block Studio**: **The magic block** (**Where it is**, **World**, **Start over after the last phase** and **Say each phase's name in chat when it starts**) and its **Phases**, each with a **Phase name**, **Breaks in this phase**, the blocks it turns into by weight, **Chests now and then** (**Chance of a chest** and **What is in the chest**) and **Mobs now and then** (**Chance of a mob** and the mobs by weight). The live view **What the block turns into** shows each phase's odds and an example of the next breaks from a seed. At most four magic blocks a world.

### Teams, scores and timers

- The **Team Studio**: **Team name**, **Colour**, **Before names**, **After names**, and under **Playing together** **Hurt your own team**, **See team mates who are invisible**, **Name tags they see** and **Whom they push**. Its live view, **How the team looks**, shows names in the team's colour.
- The **Objective Studio** (a score): **Score name**, **What counts** (or **Or any criterion, as the game writes it**), **Where it shows** (the sidebar, the player list, below names), and **Numbers**. **How the score looks** draws a sidebar with example players.
- The **Timer Studio**: **Words shown with the time**, **Minutes** and **Seconds**, **Which way**, **Where it shows** (**Show on the boss bar**, **Show above the hotbar** or **Not shown**), **Bar colour**, and under **When it runs** **Starts**, **Starts again when the time is up** and **When the time is up, run** (a function). **How the timer looks** shows the bar at any second and can play.

Teams and scores are made when the world loads, and their settings are set again on every load.

### Areas

The **Area Studio**: **Area name**, **World**, **One corner** and **The opposite corner**, and **Rebuild from** (**Add a building**, each with a **Building** and **Its corner**). **Where the area is** shows the box **From above** and **From the side**. An area knows who walks in and out, and rebuilding it removes the mobs and dropped items in it and places its buildings again.

### Chests in your buildings

Islands, arenas and other buildings are structures. The Structure Studio's **Chests and containers** sets each chest's **Loot table**, its loot seed and its items ([Structures](structures.md#chests-and-containers)). Build them in the game and bring them in with **Bring builds from my test worlds** ([Maps](maps.md#bring-builds-from-my-test-worlds)).

## Rules for games

Rules can use every piece: give or drop what a loot table rolls, place a structure, pick one step at random, put players on teams, set and add to scores, start and stop timers, reset an area, set where everyone starts and where a player respawns, and set the world border. There are moments for walking into and out of an area, a timer ending and the magic block breaking. See [Rules: Games](rules.md#games-teams-scores-timers-and-areas). Rules need the Fabric mod jar; the pieces themselves do not.

## Play my game

**Play** opens your mod in a flat creative test world. A game wants its own world, so the Play menu has **Play my game**: it opens or makes a world of your game's World Type, with its game mode and difficulty, a random seed and commands on (so you can test with commands). The chip says **In my game**, and the seed is shown beside it as **Seed** and a number. **Reload** works there as in the test world. **Play my game** is off until the project has a world setup ("Add a world setup first (Make a game), so Minecraft knows how your world starts.").

- **Start over** keeps the old game world under a new name and makes a fresh one the next time you press **Play my game**. Close Minecraft first.
- There is one game world per project and Minecraft version.
- Minecraft shows an "experimental settings" screen whenever a world with a World Type from a data pack is opened. In **Play my game** MCSuperMods answers it for you ("I Know What I'm Doing!"), so Reload and a second Play do not wait for a click. When you open the world by hand from Minecraft's world list, choose to go on yourself.

See [Playing and testing](playing-and-testing.md#play-my-game).

## See it in Try it

[Try it](try-it.md#games) has two grounds for games: **Empty sky** (your start island in the middle, you standing where new players start and holding what they get) and **One of my buildings** (one of your structures as the ground). The panel **Your game** shows the boss bar, the text above the hotbar, the sidebar, **Play as**, **Your team**, each magic block's phase and breaks, and each area with **Rebuild now**. Your game's functions run there; what Try it cannot run is listed as "Only in Minecraft" in **What happened**.

## A World Type in a vanilla data pack

A World Type from a data pack is offered only when the pack is added while the world is made. With the data pack zip: on Minecraft's Create New World screen open "More" and "Data Packs", drop the zip on that screen (or put it in the folder "Open Pack Folder" shows), move it to the selected side and press "Done". Then "World Type" under "More" lists your game. A world made before the pack was added keeps its own land. **Play my game** and a map export do this for you.

## Generators

Lava and water always make cobblestone, stone and obsidian as Minecraft decides; nothing in a data pack changes that. For a generator that makes something else, answer **A generator of my own** in the Skyblock flow: it adds a liquid of your own whose bucket is in the chest and which makes the block you chose (obsidian, stone, basalt or mud) where water touches it ([Fluids](fluids.md)). Liquids need the Fabric mod jar.

## Check it in the game

`fixtures/sample-game-modes` in the repository is a Skyblock with a one block, an arena with teams, a score and a timer, a lucky block and rules. Its checklist is in [`fixtures/sample-game-modes/README.md`](https://github.com/MEZTKING/MCSuperMods/blob/main/fixtures/sample-game-modes/README.md#in-game-check-windows-minecraft-java-263-and-264): the island and the kit once, the phases, the round timer, the arena rebuilt, the lucky block, and the same world as a vanilla data pack.

## Limits

| What | In plain words |
|---|---|
| Rules and lucky blocks need the jar | Vanilla packs carry no rules and cannot add blocks. The pieces work in a vanilla data pack. |
| A World Type needs the pack at world creation | See [A World Type in a vanilla data pack](#a-world-type-in-a-vanilla-data-pack). **Play my game** and maps do it for you. |
| The start island comes at the first join | A moment of empty sky before it appears. **Place it while the world generates** is the other way. |
| A start island is at most 48 blocks a side | Larger islands are a jigsaw of pieces ([Structures](structures.md)). |
| Lava and water make what they make | A generator of your own is a liquid of your own (above). |
| Four magic blocks a world | More are refused. |
| Teams and scores stay in old worlds | MCSuperMods makes them when the world loads and never removes them. Renaming one leaves the old one in worlds that had it: remove it there with `/team remove` or `/scoreboard objectives remove`. |
| Areas are boxes | No round or shaped areas; use several areas. |
| Timers count whole seconds | No tenths. |
| Rules counters are not scores | Counters belong to rules; the sidebar shows scores only. Use the score steps of Rules for the sidebar. |
| A map is the world as it is | Players' inventories, advancements and statistics are left out unless you keep them ([Maps](maps.md)). |
| A map that needs the jar is a modpack | One `.mrpack` with the mod and the world inside. |
| One game world per project | **Start over** keeps the old one under a new name. |
| Try it has one player | Teams and scores are shown for you alone, and the area is 48 by 48 blocks, so a larger island is cut at the edge. |
| Try it runs your game's functions | As far as it understands their commands; the rest is "Only in Minecraft". |
| Builds come from the game | MCSuperMods has no block editor: build in Minecraft, save with a structure block and bring it in. |
