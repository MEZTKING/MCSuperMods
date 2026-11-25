# Maps

A map is a Minecraft world you share: an adventure map, a Skyblock with its island already there, an arena ready for a round. MCSuperMods saves a world of yours as one file with your project's packs inside, so a friend unpacks it and plays. Builds go the other way too: what you build in the game comes back into your project as structures.

Make the game first ([Game modes](game-modes.md)), play it with **Play my game** ([Playing and testing](playing-and-testing.md#play-my-game)) and build what the map needs in that world.

## Export as a map

1. Choose **File > Export > Export as a map…**. The project must have no errors.
2. **Worlds from** picks where the world is: the worlds of Play and Play my game come first, then every game location MCSuperMods knows (Settings, Game locations).
3. **Map name** is the name of the map's world folder and file (the project's name to start with).
4. **Keep my player data** is off by default (see below).
5. Press **Choose world…**, pick the world (your game's world is picked first) and press **Export**. Then choose where to save the file.

The message says where it was saved, for example "Saved the map as … (unzip it into a saves folder to play it)."

What the file holds:

- A project without the mod gives a world `.zip`: the world folder with your data pack in its `datapacks/` folder and your resource pack as `resources.zip`, replacing older copies of them.
- A project that needs the mod (blocks, items, mobs, rules and the rest of the Fabric mod jar) gives a Modrinth modpack, `.mrpack`, with Fabric, Fabric API, your mod and the world inside. Import it in Prism Launcher or the Modrinth app; the world is in the new instance's saves. A vanilla world cannot carry mods, which is why it is a modpack.

What is left out:

- Without **Keep my player data**, the players' inventories, advancements and statistics are left out, so every player starts fresh, as a new player of your game would. Turn it on to keep them (for a world you only want to move).
- MCSuperMods' own test files (the `msm-dev` pack) and the game's lock file are never copied.

What stays: the world's own settings, such as whether cheats are on and the seed. MCSuperMods does not change the world's settings file; your game's world setup sets the game mode, the game rules, the difficulty and the spawn when the world starts.

Good to know:

- A world that is open in Minecraft cannot be exported: leave it or close Minecraft first ("That world is open in the game. Leave it (or close Minecraft) first, then export it.").
- The map cannot be saved inside the world it is made from.
- A map whose world has a World Type of your own shows Minecraft's "experimental settings" screen each time it is opened. That is normal for a World Type from a data pack: choose to go on.
- A map is your world as it is. Try opening it yourself before you share it.

## Play a map

- A `.zip`: unzip it into the `saves` folder of a Minecraft game folder (or a launcher instance's), then open the world from Minecraft's world list.
- A `.mrpack`: import it in Prism Launcher or the Modrinth app, start the new instance and open the world.

### Open this map

**Open this map** comes beside **Export as a map** in a later version. For a map that plays without mods it will open a copy of the world you exported, with the same packs and the same choice about players' things, in the instance **MCSuperMods Plain (26.3)** (Minecraft and nothing else), and start it on that world, as **Play without mods** does for your game ([Playing and testing](playing-and-testing.md#play-without-mods)). The first time, a card says what will be made; your other instances are not touched. A map that needs its mod (a `.mrpack`) will get its own instance; until then, import the `.mrpack` as above.

## Bring builds from my test worlds

Islands, arenas and other buildings are made in the game:

1. In a world of Play or Play my game, place a structure block (`/give @s minecraft:structure_block`), set it to Save, give the build a name and press Save.
2. In MCSuperMods choose **File > Bring in a building…** and the tab **From my test worlds**. Under **Bring builds from my test worlds** every saved build is listed with its world; tick the ones you want and press **Bring builds**.

Each becomes a structure template named after the build; one that already exists is skipped, and one Undo takes the whole import back. Then use it as a start island in the World Setup Studio, to rebuild an area, or in the Structure Studio, where **Chests and containers** sets what its chests hold ([Structures](structures.md#chests-and-containers)).

To update a build after changing it in the game, save it again with the structure block and use **Replace from file…** in the Structure Studio ([Structures](structures.md#import-a-structure)).

## Limits

| What | In plain words |
|---|---|
| A map is the world as it is | Players' things are left out unless you keep them; the world's settings stay as they are. |
| A map that needs the mod is a modpack | One `.mrpack` with the mod and the world inside, for Prism Launcher or the Modrinth app. |
| The experimental settings screen | Minecraft shows it for every world with a World Type from a data pack. |
| Builds come from the game | MCSuperMods has no block editor: build in Minecraft, save with a structure block and bring it in. |
