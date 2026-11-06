# Getting started

This guide takes you from installing MCSuperMods to seeing your own content in Minecraft. You make a small Fabric mod with a new "Ruby Ore" block from the **Custom ore** starter, look at it with the Studios and the preview, export it as a Fabric mod jar and try it in the game, and then build a data pack from the **Functions** starter.

You need Windows 10 or 11 and Minecraft Java Edition 26.3, the release MCSuperMods targets by default (it can also target the 26.4 snapshot; see [Minecraft versions](targets.md)). You do not need to write JSON or code.

## 1. Install MCSuperMods

1. Open the [Releases page](https://github.com/MEZTKING/MCSuperMods/releases) and download the newest `MCSuperMods-<version>-win-x64.exe`.
2. Run it. The installer is not signed yet, so Windows SmartScreen warns on the first run: choose **More info**, then **Run anyway**.
3. Start MCSuperMods from the Start menu.

MCSuperMods updates itself. A few seconds after start-up, and then every six hours, it looks for a newer release. When it finds one, a banner above the toolbar says "Version X is available, downloading…" while it downloads in the background, then "Version X is ready" with **Restart to update**, and Windows shows a notification. Nothing installs until you choose **Restart to update**. Turn the automatic checks off with **Check for updates automatically** in **Settings → Updates**; **Help → Check for Updates…** works either way.

**What's new.** The first time you start a new version, MCSuperMods shows what changed. Open it again with **Help → What's New…** or "What's new…" in the command palette; the update banner's **What's new** button shows the notes of the version being installed. The same notes are in [`CHANGELOG.md`](https://github.com/MEZTKING/MCSuperMods/blob/main/CHANGELOG.md).

New project, New from starter, Open project and the Examples gallery's **Open as new project…** open their folder picker where you last chose a project folder.

Starters and the Examples gallery come with the first release after 0.2.1. To run the very latest code instead, see [Try it](https://github.com/MEZTKING/MCSuperMods/blob/main/README.md#try-it) in the README.

## 2. First launch: tell MCSuperMods where Minecraft is

The window has a toolbar at the top, the element list on the left, the editor in the middle and a dock on the right with **Preview** and **Problems** tabs. With no project open, the list says "No project is open. Use New or Open."

Choose **Settings** on the toolbar (or **File → Settings…**).

**Game locations.** MCSuperMods looks for the official launcher (`%APPDATA%\.minecraft`), Prism Launcher and the CurseForge app on its own. Under **Install packs into** every game folder and launcher instance it found is listed with its launcher, Minecraft version and mod loader. Pick the one you play with; installs go there.

- If you use the official launcher in an unusual folder, set it under **Official launcher folder** (**Browse…**, then **Save folder**).
- A portable Prism, MultiMC, PolyMC or a moved CurseForge folder is added under **Other launchers**.
- A new instance has no game folder until it has run once. If a row says "Start the instance once so its game folder exists.", launch it once from its launcher and close it.

The README section [Using Prism Launcher or the CurseForge app](https://github.com/MEZTKING/MCSuperMods/blob/main/README.md#using-prism-launcher-or-the-curseforge-app) has every detail.

**Vanilla assets.** The 3D preview draws your models with the game's own textures. MCSuperMods never ships Mojang files; it copies them from the Minecraft you installed. Under **Vanilla assets** choose **Extract vanilla assets**. If it cannot find Minecraft 26.3, start that version once in any launcher, then try again.

Close Settings.

## 3. Create a project from the Custom ore starter

1. Click the small arrow next to **New** on the toolbar and choose **New from starter…** (or **File → New Project from Starter…**).
2. The **New project** dialog lists the 24 starters under Blank, Packs and Themed content. Choose **Custom ore**. Its badges show that it fills a resource pack, a data pack and the Fabric mod jar, and the **Wizard** badge means it asks a few questions before it creates the project. The dialog shows "Step 1 of 4"; choose **Next**.
3. **Custom ore: Ore** (step 2) asks for the **Gem name** (`Ruby`), its **Colour**, the **Pickaxe needed** to mine it (**Iron pickaxe**) and whether to **Add a storage block**. Keep the answers for this guide (the steps below assume Ruby) and choose **Next**.
4. **Custom ore: Drops** (step 3) asks for the **Fewest gems per ore** and **Most gems per ore** (1 and 2). Choose **Next**.
5. The last step, **Custom ore: Choose folder and create**, sums up your answers and has the **Minecraft version** select. Keep **Minecraft 26.3**: it is the release target, and [Minecraft versions](targets.md) explains the snapshot. **Back** returns to any earlier step.
6. Choose **Choose folder and create** and create a new, empty folder, for example `Documents\MCSuperMods\ruby_ore`. The folder name becomes your project's **namespace**, the prefix of every id in it: here `ruby_ore`.

The project opens and is already saved. The Custom ore starter adds real new content: a **Ruby Ore** block, a **Ruby** item and a **Block of Ruby**. A resource or data pack cannot add blocks or items, so these exist only in the **Fabric mod jar** export (step 8). Nothing in Minecraft itself is changed: emerald ore stays emerald ore.

The element list shows everything in the namespace `ruby_ore`:

- the blocks `ruby_ore` and `ruby_block` and the item `ruby` (kinds `msm:block` and `msm:item`);
- `mod`: the mod's name, version and licence, written to `fabric.mod.json` (the mod id is `ruby_ore`);
- the models `block/ruby_ore`, `block/ruby_block` and `item/ruby`;
- the loot table `blocks/ruby_ore` (what the ore drops), the recipes `ruby_block_from_rubies`, `ruby_from_block` and `ruby_from_smelting`, the item tag `gems`, the advancements `root` and `get_ruby`, and the `pack` description.

The three textures, `ruby_ore.png`, `ruby_block.png` and `ruby.png`, are placeholders drawn by MCSuperMods.

## 4. Look around and edit with forms

Select an element in the list. The middle area has two tabs:

- **Form**: a form built from Minecraft's own data definitions, with drop-downs, number fields and id pickers that only offer valid values. Some kinds have a dedicated view: blocks open the **Block Studio** and items the **Item Studio**, recipes show a crafting grid, tags a list, functions a command editor with completion.
- **Raw JSON**: the same element as text, for when you know exactly what you want. Both tabs edit the same data.

Every element from a starter has a **Notes** box above the editor that explains its fields and what to change. Click **Notes** to fold it away.

Try a few edits (the steps below assume the starter's names, so undo the first edit afterwards, or read "Sapphire" for "Ruby"):

1. Select `ruby_ore:ruby_ore`. In the Block Studio, under **Appearance**, change **Display name** from `Ruby Ore` to `Sapphire Ore`. Under **Mining**, **Tool** is a pickaxe and **Minimum tier** is iron; under **Light and sound**, **Light level** is 3.
2. Select `ruby_ore:blocks/ruby_ore` and change the drop count from 1–2 to 2–4.
3. Select `ruby_ore:ruby_block_from_rubies` and look at the recipe grid: nine rubies make a Block of Ruby.

**Undo** and **Redo** (Ctrl+Z, Ctrl+Shift+Z) on the toolbar step back and forward through every change, including whole starter or example copies.

## 5. Preview

Select `ruby_ore:block/ruby_ore` and open the **Preview** tab on the right: the block turns in 3D with the ruby ore texture. If the preview says "Vanilla assets not found — set your Minecraft folder.", go back to step 2 and extract the vanilla assets.

To use your own texture, paint a 16×16 PNG named `ruby_ore.png`, choose **Import assets** on the toolbar, pick the namespace `ruby_ore` and **Block textures (textures/block)**, then the file. It replaces the placeholder and the preview updates. `ruby.png` goes into **Item textures (textures/item)** the same way. See [Replacing the placeholders](templates-and-examples.md#replacing-the-placeholders).

## 6. Problems

The **Problems** tab on the right shows a count, for example **Problems (0)**. MCSuperMods checks every element against the definitions of the game version you target, and every command line in functions, while you type.

- Click a problem to jump to the element and field.
- Errors block export and install, so a broken pack never reaches your game. Warnings do not.
- Saving is never blocked: you can save half-finished work and fix it later.

Try it: in `ruby_ore:ruby_block_from_rubies`, change the result id to `ruby_ore:rubyy`. A problem about the unknown id appears; undo the change (Ctrl+Z) and it goes away.

Not sure what a problem means? If you have added an Anthropic API key under **Settings → AI helper**, each problem row has an **Explain** button that asks the optional [AI helper](ai-helper.md) to explain it and propose a fix, which you review before anything changes. The helper can also answer questions about your project and build whole content from one description; MCSuperMods works fully without it.

## 7. Save

Press **Save** on the toolbar or Ctrl+S. The project is a folder of small JSON files (one per element) plus your textures, so it works well with Git and backups. Open it again later with **Open** (Ctrl+O).

## 8. Export the Fabric mod jar

New blocks and items need the mod jar; the resource and data pack exports leave them out.

1. Open the arrow next to **Export .zip** on the toolbar and choose **Fabric mod (.jar)…** (or **File → Export Fabric Mod Jar…**, or "Export Fabric mod jar…" in the command palette).
2. The **Export Fabric mod jar** dialog has one option, **Separate runtime and GeckoLib (for modpacks)**. Leave it off: the jar then carries the small `msm_runtime` mod inside it, which reads your blocks and items when the game starts (and, for a project with mobs, GeckoLib too). See [Export a Fabric mod jar](blocks-and-items.md#export-a-fabric-mod-jar).
3. Choose **Export…** and save the file. It is named after the mod id: `ruby_ore.jar`.

Any error in **Problems** blocks the export, as for packs.

## 9. Try it in Minecraft

The jar holds the blocks, items, models, textures, names, loot tables, recipes and advancements, so you do not need to install the packs as well. MCSuperMods does not install mod jars for you yet.

1. Make a Minecraft 26.3 instance with **Fabric Loader**, for example in Prism Launcher (**Add Instance**, version 26.3, mod loader Fabric), and start it once.
2. Put **Fabric API** for 26.3 (from Modrinth or CurseForge) and your `ruby_ore.jar` into the instance's `mods` folder.
3. Start the instance and open a creative world with cheats allowed.
4. Check the results:
   - The mod list (Mod Menu, if you have it, or the game log) shows `ruby_ore`, with `msm_runtime` nested in it.
   - **Ruby Ore** is in the **Natural Blocks** creative tab, **Ruby** in **Ingredients** and **Block of Ruby** in **Building Blocks**; `/give @s ruby_ore:ruby_ore` works too. The ore glows faintly.
   - In survival, mine the ore with an iron pickaxe: it drops one or two **Ruby** (more with Fortune). With a stone pickaxe it drops nothing. Picking up the first ruby shows the advancement toast **Red Gold**, in the new tab **Gem Collector**.
   - Nine rubies in a crafting table make a **Block of Ruby**, and a Block of Ruby makes nine rubies back.
5. If something is missing, open the game log (the instance's `logs\latest.log`) and look for lines starting with `[msm_runtime]`: the runtime reports how many blocks and items it registered and any problem with a definition.

To remove the content, take `ruby_ore.jar` out of the `mods` folder. Blocks already placed in a world are lost when the mod is removed, so try it in a test world first.

## 10. A data pack: the Functions starter

Functions are lists of commands the game runs. This starter sets up the usual wiring for you.

1. Arrow next to **New** → **New from starter…** → **Functions** → **Choose folder and create**, and make an empty folder called `my_functions`.
2. The project contains:
   - `my_functions:load`: creates a scoreboard that counts jumps, shows it in the sidebar and prints a green message;
   - `my_functions:tick`: runs every tick and gives speed to every player standing on a gold block;
   - `my_functions:greet`: says hello and shows a hint above the hotbar;
   - `minecraft:load` and `minecraft:tick`: function tags that tell the game to run `load` once after loading and `tick` every tick;
   - `my_functions:all`: a function tag of your own that lists `greet`.
3. Select `my_functions:tick`. The function editor checks every command as you type and completes ids, selectors and NBT. Change `minecraft:speed` to `minecraft:jump_boost`, or `gold_block` to `diamond_block`. Type a broken command, such as `effect gve`, to see a problem appear, then undo.
4. Add your own function: choose **Add element** (Ctrl+N), type `function` into **Find a template**, choose **Function**, keep the namespace `my_functions`, name it `heal` and choose **Create**. Write a line such as `effect give @s minecraft:instant_health 1 1`. To run it with the others, select `my_functions:all` and add `my_functions:heal` to its list.
5. Check **Problems (0)**, save, then **Install → Data pack to a world…** and pick a world (close it in Minecraft first). The toolbar's **Install** menu names the current target, for example "Install to: Prism Launcher — My Instance (MC 26.3)"; use **Change target** in that menu to pick another instance. The data pack zip is written into the world's `datapacks` folder (**Install → Resource pack to the resourcepacks folder** does the same for resource packs). If the instance runs a different Minecraft version, MCSuperMods warns but still installs. To export zips without installing, use **Export .zip** and its arrow, or **File → Export Resource Pack…**, **Export Data Pack…** and **Export Both…**.
6. In the world, with cheats on:
   - `/reload`: chat shows "my_functions loaded. Run /function my_functions:greet" and a **Jumps** sidebar appears;
   - jump a few times: the score counts up;
   - stand on a gold block: you run faster;
   - `/function my_functions:greet` says hello; `/function #my_functions:all` runs every function in your tag.

The [templates list](templates-and-examples.md#all-templates) has 125 element templates to start from: recipes, loot tables, advancements, predicates, enchantments, dialogs and more. The other starters, and the 71 commented examples under **Help → Examples…**, are described in [Templates, starters and examples](templates-and-examples.md).

## Command palette and shortcuts

Press **Ctrl+Shift+P** to open the command palette and type part of a command's name: "export", "install", "examples", "rename". Every menu and toolbar action is there, including **Choose install target…**, **Toggle Raw JSON**, **Go to definition of the focused reference** and **Find usages of the selected element**.

| Shortcut | Action |
|---|---|
| Ctrl+Shift+N | New (blank) project |
| Ctrl+O | Open project |
| Ctrl+S | Save |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z or Ctrl+Y | Redo |
| Ctrl+N | Add element (template picker) |
| F2 | Rename the selected element (also updates every reference to it) |
| Ctrl+Shift+P | Command palette |

## Where next

- [Templates, starters and examples](templates-and-examples.md): every template, starter and example, and the Examples gallery.
- [Known limitations](https://github.com/MEZTKING/MCSuperMods/blob/main/README.md#known-limitations) in the README.
- [Structures](structures.md) and [Worldgen](worldgen.md): jigsaw structures, custom biomes and World Types.
- [Blocks and items](blocks-and-items.md): exporting the Fabric mod jar and the separate runtime for modpacks.
- [Entities and models](entities-and-models.md): animated mobs. Create a project from the **Custom mob** starter (a Ruby Golem with its model, animations and spawn egg), or import a model with **File → Import Blockbench Model…** and give it a body and behaviour in the Entity Studio; the Fabric mod jar then carries GeckoLib too.
- [Scripting](scripting.md): behaviour in TypeScript. Create a project from the **Scripted ore** starter, or add a script from the **Block interaction script** template under **Scripts** in **Add element**; the Script Studio completes `msm.` as you type, and the Fabric mod jar carries the scripts into the game.
- [Eject to a Java project](eject.md): **File → Export Java Project…** writes a standalone Fabric Gradle project with generated Java that no longer needs `msm_runtime`, for when you want to carry on in code.
- [Minecraft versions](targets.md): the 26.3 release and 26.4 snapshot targets, choosing one for a new project and **File → Upgrade Project Target…**.
- [Plugins](plugins.md): content kinds made by other people, installed into the plugins folder and listed under **Settings → Plugins**.
- [The AI helper](ai-helper.md): an optional assistant with your own Anthropic API key that explains problems, answers questions and builds content from a description, always as changes you review and apply in one undoable step.
- The [roadmap](https://github.com/MEZTKING/MCSuperMods/blob/main/docs/ROADMAP.md): what comes after scripting.
