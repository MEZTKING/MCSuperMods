# MCSuperMods

A desktop mod maker for Minecraft Java Edition that takes you from a simple texture pack to fully animated custom mobs, without forcing you to write code.

## What it is

- **Every content layer in one project:** resource packs, data packs, structures, worldgen, custom blocks and items, and Blockbench-animated entities.
- **Fabric-first, vanilla where possible:** content that vanilla can express exports as plain resource and data packs; anything beyond that ships as a single Fabric jar.
- **For beginners and power users alike:** guided "Studio" views with live 3D preview, plus a Raw JSON tab, mcfunction and TypeScript editors, and an eject-to-Java escape hatch.

## Status

- Pre-alpha: Phase 1 (Resource Pack Studio), Phase 2 (Data Pack Studio), launcher support (Prism Launcher, CurseForge, MultiMC) and the templates and examples library are done; the in-game checks below are still to be confirmed. Windows installers are published on the [Releases page](https://github.com/MEZTKING/MCSuperMods/releases) and update themselves. Phase 3 (Structures & Worldgen) is done in code: structure import and export, jigsaw pools, custom biomes, features and World Types are in the app, and their in-game check is still to be confirmed. Phase 4 (custom blocks and items with behaviour, exported as a Fabric mod jar, plus **Test in Minecraft**) is done in code in version 0.4.0; its in-game check ([`fixtures/sample-mod/README.md`](fixtures/sample-mod/README.md)) is still to be confirmed. Phase 5 (Blockbench-animated custom mobs: Blockbench import, the Entity Studio, an animated preview and GeckoLib in the Fabric mod jar) is done in code; its in-game check ([`fixtures/sample-mob/README.md`](fixtures/sample-mob/README.md)) is still to be confirmed. See [Export a Fabric mod](#export-a-fabric-mod) and [Animated mobs](#animated-mobs).
- Installed releases update themselves: the app checks for a new version shortly after start-up and offers "Restart to update" once it has downloaded.
- Releases will be for Windows only to begin with; Linux builds are made in CI for testing, and macOS builds are not planned for now.
- Current Minecraft target: **Java 26.3** (with 26.2 as the previous supported release at launch).

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

- **Project starters (12).** Click the arrow next to **New** and choose **New from starter…**, or use **File → New Project from Starter…**. Pick a starter, choose **Choose folder and create** and an empty folder; the folder name becomes the namespace. There are a blank project, minimal resource, data and combined packs, and eight themed projects: **Custom ore**, **Custom mob**, **Recipe pack**, **Custom music disc**, **Functions**, **Custom biome**, **Jigsaw village-style structure** and **Custom biome with a jigsaw structure**. **New** on its own still creates a blank project.
- **Element templates (112).** **Add element** (Ctrl+N) lists a template for every element kind, grouped by category (models, blockstates, recipes, loot tables, advancements, tags, enchantments, dialogs, structures, biomes, features, dimensions, blocks, items, entities, entity models and animations and more) with a filter box.
- **Examples gallery (66).** **Help → Examples…** shows one commented example for each element kind, two blocks and items and two entity behaviour examples, and four themed starter projects. Search by title, kind, category or tag and read each element's notes. **Open as new project…** creates a new project from an example; **Copy into my project** adds it to the open project in one undoable step, skipping ids that already exist. The notes stay with each element and show above the editor.

Two things to know:

- **Custom ore adds a real block.** Its Ruby Ore, Ruby and Block of Ruby are new blocks and items, which a resource or data pack cannot add, so they reach the game only in the Fabric mod jar (see [Export a Fabric mod](#export-a-fabric-mod)). Emerald ore is left alone.
- **Custom mob adds a real mob.** Its Ruby Golem is a new animated entity with a spawn egg, so it too reaches the game only in the Fabric mod jar, which also carries GeckoLib (see [Animated mobs](#animated-mobs)).
- **No bundled media.** Textures are placeholders that MCSuperMods draws itself. The music disc plays the vanilla `cat` track from your own game and has its own disc model and name, attached to a vanilla disc that the `give_disc` function gives you (`/function <namespace>:give_disc`). Import your own textures and `.ogg` to replace them.

The examples are also in the repository as ordinary projects under [`examples/`](examples/README.md), for browsing on GitHub or opening with **File → Open Project…** (copy the folder elsewhere first).

## Export a Fabric mod

Projects with new blocks or items (the `msm:block` and `msm:item` kinds, for example the Custom ore starter) export as a Fabric mod: open the arrow next to **Export .zip** and choose **Fabric mod (.jar)…**, or **File → Export Fabric Mod Jar…**. The jar holds the blocks and items plus the project's resources and data, and carries the small `msm_runtime` mod inside it. Put it with **Fabric API** into the `mods` folder of an instance with **Fabric Loader** for the same Minecraft version. **Separate runtime and GeckoLib (for modpacks)** leaves `msm_runtime` (and GeckoLib, for projects with mobs) out for modpacks that already provide them. Details are in [Blocks and items](docs/guide/blocks-and-items.md); the in-game check of the mod jar is still to be confirmed.

**Test in Minecraft…** (in the **File** menu and next to **Fabric mod (.jar)…** in the Export menu) does the install for you: it copies the jar into a Prism Launcher or MultiMC instance with Fabric, adds Fabric API when missing and starts the instance. With no suitable instance, **Create test instance** makes the Prism Launcher instance **MCSuperMods Test (<version>)**. Official launcher and CurseForge locations get the install only. Only files MCSuperMods installed are ever replaced in `mods`.

## Animated mobs

New mobs (the `msm:entity` kind, for example the **Custom mob** starter) are made from a Blockbench model: choose **File → Import Blockbench Model…** and pick a `.bbmodel` project (or Blockbench's own `.geo.json` and `.animation.json` exports). The model, its animations and texture appear under **Models and animations** in the sidebar. Add an entity from the **Creature**, **Monster** or **Ambient critter** template and set it up in the **Entity Studio**: model, texture and animations, health and speed, goals such as wander, melee attack, flee and follow, natural spawning in biomes, a spawn egg, and events (including `play_animation`). The **Preview** tab plays the model's animations.

Mobs export in the same Fabric mod jar as blocks and items. They are drawn by the GeckoLib mod, which the jar nests next to `msm_runtime`; MCSuperMods downloads GeckoLib once from Modrinth on the first export with mobs and keeps it, so that export needs an internet connection. Details are in [Entities and models](docs/guide/entities-and-models.md).

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
| 7 | 1.0 | Third-party plugins, a second Minecraft target, docs site |

Full plan with checklists: [docs/ROADMAP.md](docs/ROADMAP.md).

## Documentation

- [User guide](docs/guide/README.md): [getting started](docs/guide/getting-started.md), [structures](docs/guide/structures.md), [worldgen](docs/guide/worldgen.md), [blocks and items](docs/guide/blocks-and-items.md), [entities and models](docs/guide/entities-and-models.md) and [templates, starters and examples](docs/guide/templates-and-examples.md).
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
5. When the workflow has finished, open the draft under Releases and check that it has the installer `.exe`, its `.exe.blockmap` and `latest.yml`. Then press **Publish release**, or run **Actions > Publish release > Run workflow** with the version: it checks those three files and publishes the draft.
6. Install on Windows from the published release. The build is unsigned, so SmartScreen warns on first run: choose **More info**, then **Run anyway**.

Later releases repeat steps 3 to 5 with a higher version each time (for example `0.1.1`, then tag `v0.1.1`). The version in `app/package.json` must match the tag. `mod_version` in `engine-mod/gradle.properties` must equal it too (a test fails otherwise): the release workflow builds the `msm_runtime` mod with JDK 25 first and ships it inside the app.

Releasing without git: instead of step 4, open **Actions > Release > Run workflow** on GitHub, keep the branch `main`, type the version (for example `0.3.0`) and, to release an older commit, paste its full commit SHA. The workflow creates the tag `v<version>` on that commit, checks it matches `app/package.json`, and builds into a draft release just as a tag push does. It never moves an existing tag. Leave the version empty to build an installer without releasing it. Installed copies check for the new release a few seconds after start-up (unless "Check for updates automatically" is off in Settings), download it in the background and install it when the user chooses **Restart to update**. Only published releases are offered; drafts are not.

## Contributing

Not open for contributions yet while the architecture settles. Issues with ideas, questions or use cases are welcome.

## Licence

MCSuperMods is released under the [MIT Licence](LICENSE). You may use, modify and redistribute it freely, including commercially, provided the copyright notice and licence text are kept in all copies, which credits the project. The licence covers the MCSuperMods application and source code only: packs and mods you create with it are yours.

Fabric mod jars exported with mobs nest [GeckoLib](https://modrinth.com/mod/geckolib) (MIT Licence), the animated-model library by its own authors, which MCSuperMods downloads from Modrinth at export time and does not ship in its installer. GeckoLib remains under its own licence.
