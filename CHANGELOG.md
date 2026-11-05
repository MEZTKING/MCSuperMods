# Changelog

What changed in each MCSuperMods release, for people who use the app. The app shows the section for its version under **Help > What's New…**, and each GitHub release carries the same text.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning](https://semver.org/); before 1.0, a minor version can change how projects behave.

## [Unreleased]

### Added

- **What's new.** After an update, MCSuperMods shows what changed in the new version once. You can open it again at any time from **Help > What's New…** or the command palette ("What's new…"), and from the update banner before you restart.
- **Update notifications.** With **Check for updates automatically** on (Settings > Updates), MCSuperMods checks a few seconds after it starts and then every six hours. A new version shows the banner "Version X is available, downloading…" on its own, then "Version X is ready" with **Restart to update**, plus a Windows notification once the download has finished.
- Work on version 1.0 has started: loading plugins made by other people, more templates and wizards, a second Minecraft version and a documentation site.

### Changed

- **New project**, **New from starter**, **Open project** and **Open as new project** in the Examples gallery now open their folder picker where you last chose a project folder, instead of the default folder every time.

### Fixed

- A new version published while MCSuperMods was already open was only found by **Help > Check for Updates…**; the app now looks again every six hours and tells you without a click.

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

[Unreleased]: https://github.com/MEZTKING/MCSuperMods/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/MEZTKING/MCSuperMods/releases/tag/v0.6.0
[0.5.0]: https://github.com/MEZTKING/MCSuperMods/releases/tag/v0.5.0
[0.4.0]: https://github.com/MEZTKING/MCSuperMods/releases/tag/v0.4.0
[0.3.0]: https://github.com/MEZTKING/MCSuperMods/releases/tag/v0.3.0
[0.2.2]: https://github.com/MEZTKING/MCSuperMods/releases/tag/v0.2.2
[0.2.1]: https://github.com/MEZTKING/MCSuperMods/releases/tag/v0.2.1
[0.2.0]: https://github.com/MEZTKING/MCSuperMods/releases/tag/v0.2.0
[0.1.0]: https://github.com/MEZTKING/MCSuperMods/releases/tag/v0.1.0
