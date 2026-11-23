# Playing and testing

**Play** puts your mod in Minecraft with one click. **Reload** sends your next change to the game while it is running. Both work in every mode, and they are the quickest way to see what you made. This page also says when the game has to start again and why.

For a quick look without Minecraft at all, press **Try it** (F6): a small test area inside MCSuperMods where you walk around your blocks, open your doors and hatch your mobs. It is a preview, not the game, so check in Minecraft with Play before you share a mod ([Try it](try-it.md)).

For a one-off test with another launcher, or to install the mod into a world you already play, use **Test in Minecraft…** from the Export menu ([Blocks and items](blocks-and-items.md#test-in-minecraft)). Play is for trying things while you build.

## What you need

- [Prism Launcher](https://prismlauncher.org/), installed, started once and **signed in to a Microsoft account**. MCSuperMods cannot start Minecraft itself, because Minecraft needs your sign-in, and the official launcher and CurseForge cannot be told to start an instance. If the toolbar says **Prism Launcher not found**, open the panel it offers (**Get Prism Launcher**): it says how to install and sign in, and has **Find Prism** and **Choose Prism's folder…**. Once found it says "Found Prism Launcher. Press Play to start."
- A project with no errors. If a mistake stops the mod from being built, Play says "Play blocked by N error(s); nothing was sent to the game. See Problems." (the same errors are in **Things to fix**).

## Play

Press **Play** in the toolbar, **File > Play**, or **F5**. MCSuperMods saves the project, builds the mod and starts the game. The first time it also makes the test instance **MCSuperMods Test (26.3)** (or the one for the target you are using) in Prism with Fabric, Fabric API and your mod. Prism downloads Minecraft that first time, which takes a few minutes. Your other Prism instances and worlds are never touched.

The game opens by itself in a **test world**: a flat Creative world named "MCSuperMods test (your namespace)". It is made for trying things:

- time stands at noon, the weather does not change by itself, no mobs spawn and you keep your inventory when you die;
- a 21 by 21 smooth stone **test area** at the spawn, with a sign "MCSuperMods test area", a lever, a button, a pressure plate, redstone dust, a small pool of water, grass and farmland, and a fenced pen;
- **chests by the spawn** with a stack of every item of your project: items, block items and spawn eggs. The first nine are also in your hotbar.

The chip beside the buttons shows the game's state: **Game not running**, **Starting…**, **In the test world**, **In my game** (see [Play my game](#play-my-game)), **In another world** or **Restart needed**. A progress line shows "Saving the project…" and "Building the mod…".

If Minecraft was already running when you pressed Play, it restarts with the new mod and comes back to the same world. If it will not close, MCSuperMods waits about 30 seconds and then says "Close Minecraft, then press Play again."

The very first time Minecraft starts it may ask about accessibility settings before the title screen. MCSuperMods tells it to skip that screen. If you still see it, carry on through it; it does not come back.

### The Play menu

The small menu beside Play has:

- **Play my game** and **Start over**: your game in a world of its own (see [Play my game](#play-my-game)).
- **New test world**: keeps the old world under the name `msm-test-<namespace>-old-1` (and so on) in the instance, and makes a fresh one next time. Counters from your rules start again. Close Minecraft first.
- **Restart**: closes the game and starts it again with the latest mod (see below).
- **Open the test instance's folder**: opens the instance's game folder.

An entry that is off says why.

## Play my game

The test world suits trying a block, not playing a Skyblock or an adventure map. Once your project has a world setup (**Make a game** on Home, or a flow of [Game modes](game-modes.md)), **Play my game** in the Play menu plays it the way players will:

- it opens your game's own world, `msm-game-<namespace>` in the test instance, or makes it the first time: your game's World Type, its game mode and difficulty, structures on and a random seed;
- there is no test area, no chests of items and no change to time, weather or mobs; your world setup places the start island, gives the kit and sets the game rules, as it does for players;
- commands are on, so you can use them to test;
- the seed is shown beside the chip as **Seed** and a number, and the chip says **In my game**.

**Reload** works in your game's world as in the test world, and a change to the world's data reopens your game. **Restart** comes back to the world you played last.

**Start over** keeps the old game world under the name `msm-game-<namespace>-old-1` (and so on) and makes a fresh one the next time you press **Play my game**. Close Minecraft first. There is one game world per project and Minecraft version.

Minecraft shows an "experimental settings" screen each time a world with a World Type from a data pack is opened. In **Play my game** MCSuperMods answers it for you with "I Know What I'm Doing!", so a Reload that reopens the world and a second Play do not wait for a click. When you open the world yourself from Minecraft's world list, the screen asks you: choose to go on.

**Play my game** is off until the project has a world setup, and says "Add a world setup first (Make a game), so Minecraft knows how your world starts." To share the world as a map, see [Maps](maps.md).

## Reload

Change something, then press **Reload**, **File > Reload in Game** or **Ctrl+R** (Cmd+R on a Mac). MCSuperMods saves, sends what changed and the game picks it up in a few seconds without closing. The chat in the game says "MCSuperMods: reloaded (N changes)". If the changes were to the world's data (biomes, structures, dimensions), the game reopens the test world instead and says "MCSuperMods: reopened the test world (N changes)". A reopen **refills the chests** with your items, so anything you moved out of them is replaced.

Reload works while the game is in the test world or in your game's world ([Play my game](#play-my-game)); it is off when the game is not running or you are in another world.

What reloads in place:

- what an event does, and the scripts and rules on a trigger the thing already has;
- recipes, loot tables, tags, functions and the other data files;
- pictures, models and sounds (a short loading screen shows, because Minecraft reloads every resource pack; Reload only does it when a picture changed).

New land from a changed biome or structure shows only in chunks you have not visited yet.

## Restart needed

Some changes can only be read when Minecraft starts. When Reload finds one, the chip says **Restart needed** and choosing it opens a list of the reasons, in words, once each. The things that reload still reload. The reasons are:

- "You added a new block: Ruby Lamp. New blocks are only read when Minecraft starts." The same for items, mobs and the other kinds you add.
- "You changed the block X. Changes to blocks are only read when Minecraft starts." Changing more than what a thing does when something happens (its numbers, its model settings) is not an event change. A rule that gives a thing a **new** trigger (the first rule on "A player breaks the block") counts, because the trigger is part of the thing; later edits to rules on that trigger reload.
- "You renamed the block X. New names are only read when Minecraft starts."
- "You removed X. Minecraft keeps it until it starts again." Removing a file cannot be done to a running game.
- "You added a new vehicle, key or on-screen element." Vehicles, keys of your own and on-screen elements are read when Minecraft starts, so a new one always needs a restart. Their values and events reload, and so do script rules on them.
- A new block type, a torch's or sign's wall form, a new command or a new creative tab. They are read when Minecraft starts, so each says "You added a new …" and needs a restart. The events of a command that already exists reload, and so do script rules on it; a creative tab never reloads ([Block types](block-types-and-plants.md#more-plants-food-furniture-and-lights), [Commands and creative tabs](commands-and-tabs.md)).
- "You added or removed a sound. Sounds are only read when Minecraft starts."
- "Your mod's details changed" or "Your mod's id changed", from the mod's own settings.
- "MCSuperMods has a new version of its runtime" or "The Fabric API version changed".

Choose **Restart** in the dialog (or in the Play menu). The game saves, closes, the mod file is replaced and the game starts again in the same test world. On Windows the running game keeps its mod file locked, which is why a plain copy cannot be done while it is open.

## Where it works

Dev tools are on only in the test instance's single-player test world. They are off in your other instances, on servers and for friends who install the jar, so nothing in a Share my mod jar changes. MCSuperMods puts a folder `msm-dev/` in the test instance's game folder, with the files that carry your changes; nothing is written to your other Prism instances.

## World backups

Play uses its own test world, which is never backed up. When you install into one of your own worlds with **Install → Data pack to a world…**, MCSuperMods first saves a copy of the whole world as a zip, waits for it, and only then puts the data pack in. The message after the install names the backup, for example "The world was backed up first as 2026-11-21_10-05-09.zip (Settings, World backups)." If the backup cannot be made (a full disk, for example), nothing is installed and the message says why: try again, or turn backups off. Close the world in Minecraft before installing, as before.

Backups are zips in the `backups` folder of MCSuperMods' own folder (`.msm` in your user folder), one folder per game location and world, named by date and time. They never leave your computer. Resource packs, the Play test instance and exports to a folder are not backed up, because MCSuperMods does not change a world with them. Minecraft's `session.lock` file is left out of the zip, as in the game's own backups.

**Settings → World backups** has:

- the backups folder, with **Open folder**;
- **Back up a world before installing into it** (on by default);
- **Backups to keep per world** (5 by default; the oldest are deleted once a new backup has been made);
- every world's backups, newest first, each with **Restore**.

**Restore** unpacks a backup beside the world as a new world folder, `<world folder>-restored-<date and time>`, in the same `saves` folder. It never replaces the world itself, so a wrong click loses nothing. In Minecraft both worlds show in the world list with the same name; the restored one is the copy. To swap them, close Minecraft, rename the world's folder in `saves` (or move it away), then rename the restored folder to the world's old folder name. When the game location a backup came from is no longer found (an instance was removed), Restore is off for it, but the zips stay in the backups folder and can be unzipped into a `saves` folder by hand.

## Things to know

- **The world is flat on purpose.** The test world is for trying blocks, items, mobs and rules quickly. To see a biome or a structure in real terrain, make a world in Minecraft with the data pack ([Worldgen](worldgen.md), [Structures](structures.md)). A game of your own has **Play my game**.
- **Counters are saved with the world.** A new test world starts them again.
- **Rules need the jar.** Play always builds the Fabric mod jar, so rules work ([Rules](rules.md)).
- **Keyboard.** F5 plays, Ctrl+R reloads in the game and F6 opens Try it. The app window's own reload moved to **Ctrl+Shift+R** (**View > Reload Window**).
- **Use blocks with an empty hand.** While your hand holds a block (or any item) Minecraft may place it instead of using the block, and sneaking with an item in the hand skips the block's use. To try a rule on a block, empty your hand first.

## Troubleshooting

- **Play does nothing and the chip says Prism Launcher not found.** Open the panel and use **Find Prism**, or choose Prism's folder; start Prism once after installing.
- **"Play blocked by N error(s)".** Fix the errors in Problems (or **Things to fix**); nothing was sent to the game.
- **Reload is off.** The game is not in the test world or your game's world. Press Play (or **Play my game**), or leave the other world and open the test world.
- **The change did not show.** Look at the chip: **Restart needed** lists what the game only reads at start. Otherwise check `logs/latest.log` in the test instance for lines starting `[msm_runtime]`.
- **Minecraft does not close for a restart.** Close it from its own window, then press Play.
- **The first start is slow.** Prism downloads Minecraft and its libraries once.
