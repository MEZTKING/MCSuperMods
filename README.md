# MCSuperMods

A desktop mod maker for Minecraft Java Edition that takes you from a simple texture pack to fully animated custom mobs, without forcing you to write code.

## What it is

- **Every content layer in one project:** resource packs, data packs, structures, worldgen, custom blocks and items, and Blockbench-animated entities.
- **Fabric-first, vanilla where possible:** content that vanilla can express exports as plain resource and data packs; anything beyond that ships as a single Fabric jar.
- **For beginners and power users alike:** guided "Studio" views with live 3D preview, plus a Raw JSON tab, mcfunction and TypeScript editors, and an eject-to-Java escape hatch.
- **The Creator:** whole gear sets, weapons, food and drinks, totems, enchantments, paintings, music discs, blocks and mobs from a few questions, with a live preview and one-step Undo.
- **An optional AI helper:** with your own Anthropic API key, it explains problems, answers questions and builds content from a description, always as changes you review before applying.
- **Open and versioned:** plugins made by other people load in a sandbox, and projects can target more than one Minecraft version (26.3, and the 26.4 snapshot).

## Status

- Pre-alpha: Phase 1 (Resource Pack Studio), Phase 2 (Data Pack Studio), launcher support (Prism Launcher, CurseForge, MultiMC) and the templates and examples library are done; the in-game checks below are still to be confirmed. Windows installers are published on the [Releases page](https://github.com/MEZTKING/MCSuperMods/releases) and update themselves. Phase 3 (Structures & Worldgen) is done in code: structure import and export, jigsaw pools, custom biomes, features and World Types are in the app, and their in-game check is still to be confirmed. Phase 4 (custom blocks and items with behaviour, exported as a Fabric mod jar, plus **Test in Minecraft**) is done in code in version 0.4.0; its in-game check ([`fixtures/sample-mod/README.md`](fixtures/sample-mod/README.md)) is still to be confirmed. Phase 5 (Blockbench-animated custom mobs: Blockbench import, the Entity Studio, an animated preview and GeckoLib in the Fabric mod jar) is done in code in version 0.5.0; its in-game check ([`fixtures/sample-mob/README.md`](fixtures/sample-mob/README.md)) is still to be confirmed. Phase 6 (TypeScript scripts that run in the game, and the export of a project as a standalone Fabric Java project) is done in code in version 0.6.0; its in-game check ([`fixtures/sample-script/README.md`](fixtures/sample-script/README.md)) is still to be confirmed. Version 0.7.0 adds the AI helper, the Creator, armour, custom tool materials, weapons, consumables and totems, starter wizards, a second Minecraft version (the 26.4 snapshot) and plugins made by other people; their in-game checks are part of [`fixtures/sample-mod/README.md`](fixtures/sample-mod/README.md). Version 1.0.0 is released; 1.1.0 adds Easy and Advanced mode, a live preview beside the form, texture painting, starting a project with the AI helper and modpacks; 1.2.0 turns screenshots and pictures into textures, puts player skins on mobs and lets the AI helper read screenshots. See [The Creator](#the-creator), [AI helper](#ai-helper), [Export a Fabric mod](#export-a-fabric-mod), [Animated mobs](#animated-mobs), [Scripting](#scripting) and [Eject to a Java project](#eject-to-a-java-project).
- Installed releases update themselves: the app checks for a new version shortly after start-up and every six hours, and offers "Restart to update" once it has downloaded. **Help → What's New…** shows what changed ([`CHANGELOG.md`](CHANGELOG.md)).
- Releases will be for Windows only to begin with; Linux builds are made in CI for testing, and macOS builds are not planned for now.
- Minecraft targets: **Java 26.3** (the default) and **26.4-snapshot-7** (a snapshot, re-pinned when 26.4 is released; mobs cannot be exported for it until GeckoLib supports it). **File → Upgrade Project Target…** moves a project between them.

## Try it

The easiest way is the Windows installer from the [Releases page](https://github.com/MEZTKING/MCSuperMods/releases) (Windows SmartScreen warns because it is unsigned: More info, then Run anyway); see the [getting started guide](docs/guide/getting-started.md). To run from source instead, on Windows you need [Git](https://git-scm.com/), [Node.js](https://nodejs.org/) 24, 25 or 26 (the current LTS from `winget install OpenJS.NodeJS.LTS` works) and Minecraft Java Edition 26.3.

After installing Node.js, **close every terminal and open a new one** so Node is on your PATH; `node -v` and `npm -v` should both print a version. If they are "not recognized", the terminal predates the install: open a new one, restart Windows, or reload the PATH in the current window with `$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")`.

In PowerShell:

```powershell
git clone https://github.com/MEZTKING/MCSuperMods.git
cd MCSuperMods
npm install -g pnpm@12.16.1        # Node 25+ no longer bundles corepack; on Node 24 `corepack enable` (admin) also works
pnpm install
pnpm dev                           # opens the MCSuperMods window
```

If PowerShell reports "running scripts is disabled on this system" when you run `pnpm`, allow local scripts once with `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` and try again.

Then:

1. Open the folder `fixtures/sample-resourcepack` from the repository. It is a small sample project: a ruby block, a ruby item and their textures, all made for MCSuperMods.
2. On the toolbar choose **Install → Resource pack to the resourcepacks folder**. MCSuperMods writes the pack into your Minecraft `resourcepacks` folder (set the Minecraft folder in Settings if it was not found; to use a Prism Launcher or CurseForge instance instead, see [Using Prism Launcher or the CurseForge app](#using-prism-launcher-or-the-curseforge-app)).
3. Start Minecraft Java 26.3, open **Options → Resource Packs** and move the pack named `msm-sample-resource-pack-mc-26.3.zip` (described as "MCSuperMods sample: a held stick shows a ruby") to the selected side.
4. In a world, hold a stick: the sample pack replaces the stick's look with the ruby, so you can see that the pack is active.

The sample contains no Mojang files; its two textures are drawn by `fixtures/sample-resourcepack/tools/make-textures.mjs`.

To start a project of your own instead, click the arrow next to **New** on the toolbar and choose **New from starter…** (see [Templates and examples](#templates-and-examples)). The [user guide](docs/guide/README.md) walks through a whole first project, from Settings to Minecraft.

## Try the data pack

The data pack sample works the same way, with the app running from source as above. It uses vanilla items only, so it needs no resource pack.

1. Open the folder `fixtures/sample-datapack` from the repository. It holds a greeting function, a load function with its `#minecraft:load` tag, three recipes, an advancement, a loot table, a predicate, an item modifier and an item tag.
2. Choose **File → Install Data Pack…** and pick a world. MCSuperMods writes `msm-sample-data-pack-mc-26.3.zip` into that world's `datapacks` folder. Close the world in Minecraft first if it is open.
3. Start Minecraft Java 26.3 and open the world with cheats allowed (or open it to LAN with cheats on). Then run:
   - `/reload`: chat shows `[Server] MCSuperMods sample data pack loaded. Run /function msm_sample_data:greet`.
   - `/datapack list`: the enabled packs include `file/msm-sample-data-pack-mc-26.3.zip`.
   - `/function msm_sample_data:greet`: the game says hello, prints a green hint and gives you eight emeralds and a block of redstone.
4. Craft the recipe: put the block of redstone in the middle of a crafting table and the eight emeralds around it. The result is a block of redstone named **Ruby Block**.
5. Taking the Ruby Block out of the crafting table shows the advancement toast **Ruby Crafter**. Its reward is 10 experience and a roll of the sample loot table.
6. Open `.minecraft/logs/latest.log` (on Windows, `%APPDATA%\.minecraft\logs\latest.log`) and check that it has no `Failed to load`, `Couldn't parse` or other errors mentioning `msm_sample_data`.

More checks (loot table, item modifier, smelting) are listed in `fixtures/sample-datapack/README.md`.

## Try the worldgen sample

The worldgen sample is the **Custom biome with a jigsaw structure** starter saved as a project: a custom biome, Amber Woods, reached through a World Type of its own, and a jigsaw hamlet that generates in that biome and in every vanilla forest.

1. Copy the folder `fixtures/sample-worldgen` out of the repository and open the copy.
2. Choose **File → Export Both…**. This writes a resource pack zip (the English names) and a data pack zip.
3. Follow the in-game check in [`fixtures/sample-worldgen/README.md`](fixtures/sample-worldgen/README.md#in-game-check-windows-minecraft-java-263): the hamlet in an existing world after reopening it, then the biome in a new world with **World Type** set to **Amber Woods**.

The [Structures](docs/guide/structures.md) and [Worldgen](docs/guide/worldgen.md) guides explain how the sample is built and how to make your own.

## Templates and examples

MCSuperMods comes with ready-made content, all validated and exported in CI for every supported Minecraft version. The full lists are in [Templates, starters and examples](docs/guide/templates-and-examples.md).

- **Project starters (24).** Click the arrow next to **New** and choose **New from starter…**, or use **File → New Project from Starter…**. Pick a starter, answer its questions if it has any (starters marked **Wizard** ask for a name, colour and more, step by step), choose the **Minecraft version**, then **Choose folder and create** and an empty folder; the folder name becomes the namespace. There are a blank project, minimal resource, data and combined packs, themed projects such as **Custom ore**, **Custom sword**, **Scripted ore**, **Custom mob**, **Recipe pack**, **Custom music disc**, **Functions** and the worldgen starters, and the Creator flows (**Gear set**, **Weapon**, **Consumable**, **Totem**, **Enchantment**, **Painting**, **Music disc** and more). **New** on its own still creates a blank project.
- **Element templates (125).** **Add element** (Ctrl+N) lists a template for every element kind, grouped by category (models, blockstates, recipes, loot tables, advancements, tags, enchantments, dialogs, structures, biomes, features, dimensions, blocks, items, armour, weapons, entities, entity models and animations, scripts and more) with a filter box.
- **Examples gallery (71).** **Help → Examples…** shows one commented example for each element kind, two blocks and items, two entity and two script behaviour examples, and four themed starter projects. Search by title, kind, category or tag and read each element's notes. **Open as new project…** creates a new project from an example; **Copy into my project** adds it to the open project in one undoable step, skipping ids that already exist. The notes stay with each element and show above the editor.

Two things to know:

- **Custom ore adds a real block.** Its Ruby Ore, Ruby and Block of Ruby are new blocks and items, which a resource or data pack cannot add, so they reach the game only in the Fabric mod jar (see [Export a Fabric mod](#export-a-fabric-mod)). Emerald ore is left alone.
- **Custom mob adds a real mob.** Its Ruby Golem is a new animated entity with a spawn egg, so it too reaches the game only in the Fabric mod jar, which also carries GeckoLib (see [Animated mobs](#animated-mobs)).
- **Scripted ore adds scripts.** It is the Custom ore content plus three TypeScript scripts, which run only from the Fabric mod jar (see [Scripting](#scripting)).
- **No bundled media.** Textures are placeholders that MCSuperMods draws itself. The music disc plays the vanilla `cat` track from your own game and has its own disc model and name, attached to a vanilla disc that the `give_disc` function gives you (`/function <namespace>:give_disc`). Import your own textures and `.ogg` to replace them.

The examples are also in the repository as ordinary projects under [`examples/`](examples/README.md), for browsing on GitHub or opening with **File → Open Project…** (copy the folder elsewhere first).

## Export a Fabric mod

Projects with new blocks or items (the `msm:block` and `msm:item` kinds, for example the Custom ore starter) export as a Fabric mod: open the arrow next to **Export .zip** and choose **Fabric mod (.jar)…**, or **File → Export Fabric Mod Jar…**. The jar holds the blocks and items plus the project's resources and data, and carries the small `msm_runtime` mod inside it. Put it with **Fabric API** into the `mods` folder of an instance with **Fabric Loader** for the same Minecraft version. **Separate runtime and GeckoLib (for modpacks)** leaves `msm_runtime` (and GeckoLib, for projects with mobs) out for modpacks that already provide them. Details are in [Blocks and items](docs/guide/blocks-and-items.md); the in-game check of the mod jar is still to be confirmed.

**Test in Minecraft…** (in the **File** menu and next to **Fabric mod (.jar)…** in the Export menu) does the install for you: it copies the jar into a Prism Launcher or MultiMC instance with Fabric, adds Fabric API when missing and starts the instance. With no suitable instance, **Create test instance** makes the Prism Launcher instance **MCSuperMods Test (<version>)**. Official launcher and CurseForge locations get the install only. Only files MCSuperMods installed are ever replaced in `mods`.

## Animated mobs

New mobs (the `msm:entity` kind, for example the **Custom mob** starter) are made from a Blockbench model: choose **File → Import Blockbench Model…** and pick a `.bbmodel` project (or Blockbench's own `.geo.json` and `.animation.json` exports). The model, its animations and texture appear under **Models and animations** in the sidebar. Add an entity from the **Creature**, **Monster** or **Ambient critter** template and set it up in the **Entity Studio**: model, texture and animations, health and speed, goals such as wander, melee attack, flee and follow, natural spawning in biomes, a spawn egg, and events (including `play_animation`). The **Preview** tab plays the model's animations.

Mobs export in the same Fabric mod jar as blocks and items. They are drawn by the GeckoLib mod, which the jar nests next to `msm_runtime`; MCSuperMods downloads GeckoLib once from Modrinth on the first export with mobs and keeps it, so that export needs an internet connection. Details are in [Entities and models](docs/guide/entities-and-models.md).

## Scripting

When components and events are not enough, write a script: add one from a template under **Scripts** in **Add element** (or start from the **Scripted ore** starter) and edit it in the **Script Studio**, a TypeScript editor that completes the `msm` API as you type (`msm.events.on("block.interact", (e) => ...)`, `msm.schedule`, `msm.actions.define`) and checks each script as you go. Syntax errors block the export; type problems are warnings. A block, item or mob event can call a script through the `run_script` action. Scripts export in the Fabric mod jar: MCSuperMods transpiles them to ES5 JavaScript with TypeScript, and `msm_runtime` runs them on the server with the Rhino engine, without access to Java, files or the network and with a 2 second budget per call. The typings are also written to `.msm/msm-runtime.d.ts` in the project. Details are in [Scripting](docs/guide/scripting.md); the in-game check is [`fixtures/sample-script/README.md`](fixtures/sample-script/README.md#in-game-check-windows-minecraft-java-263).

## Eject to a Java project

**File → Export Java Project…** (also **Fabric Java project (eject)…** in the Export menu and "Export Java project…" in the command palette) writes the project's blocks, items and mobs as a standalone Fabric Gradle project with generated Java into a new folder named after the mod id. It does not depend on `msm_runtime`, builds with `./gradlew build` and JDK 25, and is one-way: edits there do not come back into MCSuperMods. Scripts are not included. CI builds the ejected sample projects and runs the same behaviour tests on them as on the Fabric mod jars. Details are in [Eject to a Java project](docs/guide/eject.md).

## The Creator

**Create…** on the toolbar (or **File → Create…**) makes a finished piece of content from a few questions and shows it as you type: a **Gear set** (tools, armour, horse and wolf armour, bows and shields of one new material, with the ore, recipes, smithing upgrades and the worn armour look), a **Weapon**, a **Consumable** (food, drinks and charms with effects), a **Totem**, an **Enchantment**, a **Painting** with your own picture, a **Music disc**, a **Simple block**, a **Food**, **Custom ore**, a **Custom mob** or a **Scripted behaviour** item. The preview tabs show the items, blocks, recipes as crafting grids, the armour on a figure, the stats in words and every element that will be made. **Create** adds it all in one undoable step; **Edit in Creator** reopens the set later and keeps the pieces you changed by hand. Details are in [The Creator](docs/guide/creator.md); armour, custom tool materials, weapons and consumables are also described in [Blocks and items](docs/guide/blocks-and-items.md).

## AI helper

The **AI helper** (toolbar **AI helper**, **View → AI Helper** or Ctrl+Shift+A) is an optional assistant in the right-hand dock. It needs your own Anthropic API key, added under **Settings → AI helper**; MCSuperMods stores it encrypted with the operating system's secure storage, and everything the helper does is billed to your Anthropic account. In **Chat** it answers questions and proposes small edits (**Explain** on a problem, **Ask AI** on an element); in **Build** it plans and makes whole content from one description. Every change waits for your review under **Proposed changes**, and **Apply** puts the kept ones in as one undoable step. Each run has limits (**Run limits**), a **Stop** button and an approximate cost line.

Privacy: nothing is sent until you press **Send**. Then your message, the conversation so far and the project content the helper reads (element JSON, ids, problems, template and version data, script typings) go to Anthropic under your key. Textures, other files and file paths are never sent, and the key never leaves MCSuperMods' main process. Details are in [The AI helper](docs/guide/ai-helper.md).

## Plugins

MCSuperMods loads plugins made by other people from `.msm/plugins/<folder>/` in your home folder, each in a sandbox without network, file or storage access; **Settings → Plugins** shows whether each loaded, was refused or failed, and **Open plugins folder** opens the folder (changes take effect after a restart). Plugins can add element kinds with forms, templates, starters, examples, validators, exporters and importers. To write one, see [`tools/new-plugin`](tools/new-plugin/README.md) and the sample in [`fixtures/sample-plugin`](fixtures/sample-plugin/README.md); the plugin API package is attached to every release as `msm-plugin-api-<version>.tgz`. The [Plugins](docs/guide/plugins.md) guide covers installing, the Settings states, trust, the manifest and troubleshooting.

## Supported Minecraft versions

| Target | Minecraft | Channel | Notes |
|---|---|---|---|
| `mc-26.3` | 26.3 | release | The default for new projects. |
| `mc-26.4` | 26.4-snapshot-7 | snapshot | Mobs cannot be exported for it until GeckoLib has a 26.4 build; no Java project export. |

MCSuperMods supports the current Minecraft release and the next version's snapshots. A snapshot target stays on the snapshot it was built against until a later MCSuperMods release moves it, to a newer snapshot or to the release when Mojang ships it; it does not follow every snapshot. Choose the version in the **New project** dialog and move a project with **File → Upgrade Project Target…** (one undoable step); see [Minecraft versions](docs/guide/targets.md).

## Using Prism Launcher or the CurseForge app

If you play through Prism Launcher or the CurseForge app instead of the official launcher, MCSuperMods can install packs straight into one of their instances and read that launcher's copy of the game for the preview textures. MultiMC and PolyMC use the same instance format as Prism and work once you add their folder.

**Where instances are found.** MCSuperMods looks in each launcher's default folder (Windows first):

| Launcher | Found automatically in | Instances | Packs and worlds go into |
|---|---|---|---|
| Official launcher | `%APPDATA%\.minecraft` (or the folder set in Settings) | (one game folder) | `.minecraft\resourcepacks`, `.minecraft\saves\<world>\datapacks` |
| Prism Launcher | `%APPDATA%\PrismLauncher`, the Scoop folder `%USERPROFILE%\scoop\persist\prismlauncher`, or `PRISMLAUNCHER_DATA_DIR` when set | `instances\<folder>` (or the instance folder set in Prism's settings) | `instances\<folder>\minecraft\resourcepacks`, `...\minecraft\saves\<world>\datapacks` (`.minecraft` in older instances) |
| CurseForge app | `%USERPROFILE%\curseforge\minecraft` | `Instances\<name>` | `Instances\<name>\resourcepacks`, `Instances\<name>\saves\<world>\datapacks` |
| MultiMC, PolyMC | not detected; add the folder by hand | `instances\<folder>` | as for Prism |

On macOS MCSuperMods also checks `~/Library/Application Support/PrismLauncher` and `~/Documents/curseforge/minecraft`; on Linux `~/.local/share/PrismLauncher` and the Prism Flatpak folder (the CurseForge app has no Linux build).

**Choosing the install target.** Open **Settings → Game locations** and pick a row under "Install packs into": each row shows the launcher, the instance name, its Minecraft version and its mod loader. The toolbar's **Install** menu names the current target ("Install to: Prism Launcher — My Instance (MC 26.3)") and its **Change target** submenu switches it without opening Settings. Both install actions, the resource pack and the data pack into a world, use the chosen target, and the world picker lists that instance's worlds. Your choice is remembered; if that instance is later deleted or renamed, MCSuperMods falls back to the official launcher folder and says so in Settings.

**Adding a launcher folder by hand.** Use **Settings → Game locations → Other launchers**:

- **Add Prism Launcher folder…** for a portable Prism (the folder holding `UserData` or `portable.txt` next to the program; pick the `UserData` folder when there is one) or a data folder in a custom place.
- **Add MultiMC folder…** for MultiMC (the folder you unzipped it into) or PolyMC (`%APPDATA%\PolyMC`).
- **Add CurseForge folder…** when you moved the CurseForge modding folder in the app's settings; pick the folder that contains `Instances`.

Added folders can be removed from the same list.

**Start the instance once.** A new instance has no game folder until it has run. If a location shows "Start the instance once so its game folder exists.", launch it once from its launcher, close it, then install again.

**Version mismatch.** When an instance runs a different Minecraft version from your project, MCSuperMods warns "This instance runs Minecraft X; the project targets Y." The warning shows in Settings and the Install menu and is repeated after an install, but it does not block the install; the pack may not load correctly in that version.

**Which jar the preview textures come from.** Preview textures are extracted from the game's client jar; MCSuperMods never bundles Mojang files. MCSuperMods looks first in the chosen target's own launcher store, then in every other launcher it knows, in this order: official launcher, Prism Launcher, MultiMC/PolyMC, CurseForge. The stores are:

- official launcher: `.minecraft\versions\<version>\<version>.jar`;
- Prism, MultiMC and PolyMC: `<launcher folder>\libraries\com\mojang\minecraft\<version>\minecraft-<version>-client.jar`;
- CurseForge: `<modding folder>\Install\versions\<version>\<version>.jar`.

So one installed copy of a version, in any launcher, is enough. **Settings → Vanilla assets** names the launcher whose jar was used. If no launcher has the project's version, start that version once in any launcher, then choose **Extract vanilla assets**.

## Known limitations

- A `resourcepacks`, `saves` or `datapacks` folder that is a symlink pointing outside the selected game folder (for example one resource pack folder shared across instances) is refused; install into each instance's own folder instead.
- The 3D preview crops each texture to 16×16 pixels, so HD textures preview cropped (exports are unaffected). Animated textures preview frame by frame.
- Rename also rewrites a matching id inside function comments and quoted text; the change is one undo step.
- Loot tables and advancements use the general form plus templates; there is no dedicated studio for them yet.
- F2 inside the function editor has not been checked on Windows; it may also trigger the editor's own rename.
- Releases are unsigned, so Windows SmartScreen warns on first install.
- The CurseForge client jar location (`Install\versions` inside the modding folder) and the way vanilla CurseForge instances are recognised come from older sources and still need confirming on a real Windows machine. If the jar is not found there, preview textures still work whenever another launcher (for example the official one) has the same version.
- MultiMC and PolyMC are never detected automatically, nor is a portable Prism; add their folders in Settings.
- There is no noise-sampled biome or terrain preview yet: the climate map shows where each biome sits in climate space, not where it lands in a real world.
- The blocks of a structure template cannot be edited in MCSuperMods: rebuild the piece in the game, save it with a structure block and use **Replace from file…**. Jigsaw block settings can be edited.
- A structure file with several random palettes is read with its first palette only.
- Test in Minecraft has not yet been checked with a real Prism Launcher on Windows; the program paths for macOS and Linux (and Scoop on Windows) are unconfirmed. If the launcher is not found, use **Choose launcher program…** in the dialog; there is no Settings control for it yet.
- Test in Minecraft launches only Prism Launcher and MultiMC; for the official launcher and CurseForge it installs the jar and you start the game yourself.
- The Block Studio has no 3D preview of the block yet; use **Go to model** to preview the model.
- `msm_runtime` is not published as a download of its own yet; with **Separate runtime and GeckoLib (for modpacks)** the modpack must provide it.
- The animated preview plays Molang expressions as 0 and smooth (catmullrom) keyframes as straight lines; the game plays them properly.
- The first Fabric mod jar export of a project with mobs needs an internet connection to download GeckoLib once.
- Custom blocks, items and mobs need Fabric: the vanilla pack exports leave them out.
- Scripts are not part of the Java project export: `msm:script` elements and `run_script` actions are left out (the export warns and the generated README lists them).
- Scripts have no saved data yet: their variables are reset by `/reload` and when the world restarts.
- The AI helper needs your own Anthropic API key and an internet connection; its conversations are not saved, and it proposes element and placeholder texture changes only (it does not export, install or import). On Linux, saving the key needs a keyring service.
- The Creator's armour preview is an approximation of the worn look; the game is the reference. Base attack damage and speed of vanilla tiers are described in words, not numbers.
- Items with armour, custom tool materials, weapons, consumables and totems have no section of their own in the Item Studio yet: edit them in **Advanced (all fields)** or **Raw JSON**, or make them with the Creator.
- The 26.4 target is a snapshot: its facts can change until 26.4 is released, mobs cannot be exported for it (no GeckoLib for 26.4 yet) and it has no Java project export.
- Plugins cannot add their own editors, commands or Minecraft versions (their kinds use the generic form), and changes to the plugins folder need a restart. Exporters from plugins are not listed in the Export menu yet.
- Scripts run on the server only, with Rhino's ES5 language level (MCSuperMods transpiles TypeScript down to it); `require("./other")` loads only scripts of the same mod and namespace, and what it returns is untyped (`any`) in the editor.

## How it works

1. Your project is a git-friendly folder of JSON elements: a version-agnostic intermediate representation (IR).
2. Plugins define element kinds; each kind **lowers** to plain files for a specific Minecraft version (a **target**).
3. Lowered output is validated against a schema model derived from the official vanilla-mcdoc schemas before anything is written.
4. Exporters then produce vanilla packs, or a Fabric **content jar** that bundles the generic `msm_runtime` mod, or an ejected standalone Fabric Java project.
5. Version churn stays inside target packages, so moving a project to a new Minecraft release does not mean rewriting it.

Details: [Architecture Overview](docs/DESIGN.md#3-architecture-overview) and [Targets and Exporters](docs/DESIGN.md#9-targets-and-exporters).

## Roadmap

| Phase | Name | Outcome |
|---|---|---|
| 0 | Foundations | Project model, schemas and app shell; CI green |
| 1 | Resource Pack Studio (v0.1) | Make and install a custom texture and model pack without touching JSON |
| 2 | Data Pack Studio (v0.2) | Recipes, loot, advancements, tags and validated mcfunctions |
| 3 | Structures & Worldgen (v0.3) | Custom biomes with custom jigsaw structures |
| 4 | Engine Mod + Blocks/Items (v0.4) | Custom blocks and items with behaviour, from one jar |
| 5 | Entities, Models, Animation (v0.5) | Blockbench-animated custom mobs |
| 6 | Scripting & Eject (v0.6) | TypeScript scripts in-game; export as a Java project |
| 7 | 1.0 (v0.7, then v1.0) | Third-party plugins, a second Minecraft target, wizards, docs site; pulled ahead in v0.7: the AI helper, the Creator, armour, weapons and consumables |

Full plan with checklists: [docs/ROADMAP.md](docs/ROADMAP.md).

## Documentation

- [User guide](docs/guide/README.md): [your first mod](docs/guide/first-mod.md) (start here), [getting started](docs/guide/getting-started.md), [structures](docs/guide/structures.md), [worldgen](docs/guide/worldgen.md), [blocks and items](docs/guide/blocks-and-items.md), [the Creator](docs/guide/creator.md), [entities and models](docs/guide/entities-and-models.md), [scripting](docs/guide/scripting.md), [eject to a Java project](docs/guide/eject.md), [the AI helper](docs/guide/ai-helper.md), [Minecraft versions](docs/guide/targets.md), [modpacks](docs/guide/modpacks.md), [plugins](docs/guide/plugins.md) and [templates, starters and examples](docs/guide/templates-and-examples.md). The same guide is published as a site at <https://meztking.github.io/MCSuperMods/>.
- [docs/DESIGN.md](docs/DESIGN.md): the authoritative design document.
- [docs/ROADMAP.md](docs/ROADMAP.md): phased delivery plan and milestone log.
- [docs/DEVLOG.md](docs/DEVLOG.md): session-by-session development log.

## Comparison

| Tool | What it does well | How MCSuperMods differs |
|---|---|---|
| MCreator | Mature, large beginner community | Forge/NeoForge-first with generated-code lock-in; MSM keeps a version-agnostic project, exports true vanilla packs, and offers an open plugin API and real code escape hatches |
| Blockbench | Best-in-class model and animation authoring | A partner, not a competitor: MSM imports `.bbmodel` files rather than re-implementing a modeller |
| Misode generators | Fast, accurate web generators for data pack files | One file at a time with no project; MSM uses the same schema ecosystem inside a full project with export and in-game testing |

More in [Users and Personas](docs/DESIGN.md#2-users-and-personas).

## Development

Requires Node 24 or later (see `.nvmrc`) and pnpm 12.16.1 via corepack.

```sh
corepack enable                     # use the pinned pnpm
pnpm i                              # install dependencies
pnpm dev                            # run the desktop app
pnpm lint                           # Biome check plus the dependency-direction check
pnpm typecheck                      # tsc -b over all project references
pnpm test                           # unit tests (Vitest)
pnpm build                          # build the app
pnpm --filter @msm/core test        # tests for one package
pnpm --filter @msm/app e2e          # Playwright golden path (Linux CI: xvfb-run -a)
pnpm --filter @msm/app dist         # Windows installer (dist:dir for an unpacked test build)
node tools/check-size/index.ts      # size budgets, after build and dist:dir
```

Vendored Minecraft data is refreshed only by `tools/sync-mcdoc` and `tools/sync-mcmeta`; each has a README with its arguments. `cd engine-mod && ./gradlew build` (JDK 25) builds the `msm_runtime` engine mod, which the app nests into Fabric mod jars; from source the app picks up the newest jar in `engine-mod/build/libs/`.

Planned stack: Electron + TypeScript + React for the app; Fabric + Java 25 for the runtime mod. See [Tech Stack](docs/DESIGN.md#14-tech-stack) and [Repository Layout](docs/DESIGN.md#15-repository-layout).

## Releasing

Releases are built by the GitHub Actions release workflow and published by hand. Do both in-game checks first ([Try it](#try-it) and [Try the data pack](#try-the-data-pack)), so the first release is known to work in Minecraft.

First release:

1. Make the `MEZTKING/MCSuperMods` repository public (Settings > General > Danger Zone > Change visibility). The in-app updater can only read releases of a public repository.
2. In Settings > Actions > General > Workflow permissions, choose **Read and write permissions** and save.
3. Set `"version"` in `app/package.json` to the release version (it is `0.0.0` today), for example `0.1.0`, and commit and push the change.
4. Push a matching tag: `git tag v0.1.0` then `git push origin v0.1.0`. The release workflow builds the Windows installer and uploads it to a draft release.
5. When the workflow has finished, open the draft under Releases and check that it has the installer `.exe`, its `.exe.blockmap`, `latest.yml` and the plugin API tarball `msm-plugin-api-<version>.tgz`. Then press **Publish release**, or run **Actions > Publish release > Run workflow** with the version: it checks those four files and publishes the draft.
6. Install on Windows from the published release. The build is unsigned, so SmartScreen warns on first run: choose **More info**, then **Run anyway**.

Every release needs a section for its version in [`CHANGELOG.md`](CHANGELOG.md), written for users: rename `## [Unreleased]` to `## [<version>] - <YYYY-MM-DD>` (and start a new empty `## [Unreleased]` above it) before tagging. The release workflow stops if the section is missing or empty; otherwise it becomes the draft release's text, which the in-app updater shows under **What's new**, and a test checks that the section for the `app/package.json` version exists.

Later releases repeat steps 3 to 5 with a higher version each time (for example `0.1.1`, then tag `v0.1.1`). The version in `app/package.json` must match the tag. `mod_version` in `engine-mod/gradle.properties` must equal it too (a test fails otherwise): the release workflow builds the `msm_runtime` mod with JDK 25 once for each Minecraft version in `engine-mod/versions/` first and ships those jars inside the app.

Releasing without git: instead of step 4, open **Actions > Release > Run workflow** on GitHub, keep the branch `main`, type the version (for example `0.3.0`) and, to release an older commit, paste its full commit SHA. The workflow creates the tag `v<version>` on that commit, checks it matches `app/package.json`, and builds into a draft release just as a tag push does. It never moves an existing tag. Leave the version empty to build an installer without releasing it. Installed copies check for the new release a few seconds after start-up and then every six hours (unless "Check for updates automatically" is off in Settings), show "Version X is available, downloading…" in a banner, download it in the background, show a Windows notification when it is ready and install it when the user chooses **Restart to update**. Only published releases are offered; drafts are not.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for building from source, the rules a change must follow, branches and pull requests, and adding a Minecraft target. Issues with ideas, questions or use cases are welcome.

## Licence

MCSuperMods is released under the [MIT Licence](LICENSE). You may use, modify and redistribute it freely, including commercially, provided the copyright notice and licence text are kept in all copies, which credits the project. The licence covers the MCSuperMods application and source code only: packs and mods you create with it are yours.

Fabric mod jars exported with mobs nest [GeckoLib](https://modrinth.com/mod/geckolib) (MIT Licence, as stated on its Modrinth page and in the `LICENSE.txt` inside the GeckoLib 5.5.7 jar; checked 2026-11-05, ADR 0029), the animated-model library by its own authors, which MCSuperMods downloads from Modrinth at export time and does not ship in its installer. GeckoLib remains under its own licence.

Fabric mod jars exported with scripts carry `msm_runtime`, which nests [Rhino](https://github.com/mozilla/rhino) 1.9.2, Mozilla's JavaScript engine, unmodified. Rhino is licensed under the [Mozilla Public License 2.0](https://www.mozilla.org/en-US/MPL/2.0/); its licence text is kept in the runtime jar as `META-INF/licenses/rhino-LICENSE.txt` (ADR 0031). Rhino remains under its own licence.

The app transpiles scripts with [TypeScript](https://github.com/microsoft/TypeScript) (Apache License 2.0), which is bundled into the app; the script editor uses the TypeScript service that ships with the Monaco editor.
