# Getting started

This guide takes you from installing MCSuperMods to seeing your own content in Minecraft. You make a "Ruby Ore" resource and data pack from the **Custom ore** starter, look at it with the forms and the preview, install it into the game, and then build a small data pack from the **Functions** starter.

You need Windows 10 or 11 and Minecraft Java Edition 26.3, the version MCSuperMods currently targets. You do not need to write JSON or code.

## 1. Install MCSuperMods

1. Open the [Releases page](https://github.com/MEZTKING/MCSuperMods/releases) and download the newest `MCSuperMods-<version>-win-x64.exe`.
2. Run it. The installer is not signed yet, so Windows SmartScreen warns on the first run: choose **More info**, then **Run anyway**.
3. Start MCSuperMods from the Start menu.

MCSuperMods updates itself: a few seconds after start-up it looks for a newer release, downloads it in the background and offers **Restart to update**. You can turn this off in **Settings → Updates**, and check by hand with **Help → Check for Updates…**.

Starters and the Examples gallery come with the first release after 0.2.1. To run the very latest code instead, see [Try it](../../README.md#try-it) in the README.

## 2. First launch: tell MCSuperMods where Minecraft is

The window has a toolbar at the top, the element list on the left, the editor in the middle and a dock on the right with **Preview** and **Problems** tabs. With no project open, the list says "No project is open. Use New or Open."

Choose **Settings** on the toolbar (or **File → Settings…**).

**Game locations.** MCSuperMods looks for the official launcher (`%APPDATA%\.minecraft`), Prism Launcher and the CurseForge app on its own. Under **Install packs into** every game folder and launcher instance it found is listed with its launcher, Minecraft version and mod loader. Pick the one you play with; installs go there.

- If you use the official launcher in an unusual folder, set it under **Official launcher folder** (**Browse…**, then **Save folder**).
- A portable Prism, MultiMC, PolyMC or a moved CurseForge folder is added under **Other launchers**.
- A new instance has no game folder until it has run once. If a row says "Start the instance once so its game folder exists.", launch it once from its launcher and close it.

The README section [Using Prism Launcher or the CurseForge app](../../README.md#using-prism-launcher-or-the-curseforge-app) has every detail.

**Vanilla assets.** The 3D preview draws your models with the game's own textures. MCSuperMods never ships Mojang files; it copies them from the Minecraft you installed. Under **Vanilla assets** choose **Extract vanilla assets**. If it cannot find Minecraft 26.3, start that version once in any launcher, then try again.

Close Settings.

## 3. Create a project from the Custom ore starter

1. Click the small arrow next to **New** on the toolbar and choose **New from starter…** (or **File → New Project from Starter…**).
2. The **New project** dialog lists the starters under Blank, Packs and Themed content. Choose **Custom ore**; its badges show that it fills both a resource pack and a data pack.
3. Choose **Choose folder and create** and create a new, empty folder, for example `Documents\MCSuperMods\ruby_ore`. The folder name becomes your project's **namespace**, the prefix of every id in it: here `ruby_ore`.

The project opens and is already saved. Because a pack cannot add new blocks or items yet (that comes in Phase 4), the Custom ore starter turns the existing emerald ore into "Ruby Ore" and the emerald into "Ruby".

The element list shows two namespaces:

- `ruby_ore`: the `pack` (pack description), the models `block/ruby_ore` and `item/ruby`, the recipe `ruby_block`, the item tag `gems` and the advancements `root` and `get_ruby`;
- `minecraft`: the vanilla things the pack replaces: the `emerald_ore` blockstate, the `emerald` item definition, the `en_us` language file and the `blocks/emerald_ore` loot table.

The two textures, `ruby_ore.png` and `ruby.png`, are placeholders drawn by MCSuperMods.

## 4. Look around and edit with forms

Select an element in the list. The middle area has two tabs:

- **Form**: a form built from Minecraft's own data definitions, with drop-downs, number fields and id pickers that only offer valid values. Some kinds have a dedicated view: recipes show a crafting grid, tags a list, functions a command editor with completion.
- **Raw JSON**: the same element as text, for when you know exactly what you want. Both tabs edit the same data.

Every element from a starter has a **Notes** box above the editor that explains its fields and what to change. Click **Notes** to fold it away.

Try a few edits (the steps below assume the starter's names, so undo the first edit afterwards, or read "Sapphire" for "Ruby"):

1. Select `minecraft:en_us` and change `Ruby` to `Sapphire`.
2. Select `minecraft:blocks/emerald_ore` and change the drop count from 1–2 to 2–4.
3. Select `ruby_ore:ruby_block` and look at the recipe grid: eight emeralds (rubies) around a block of redstone.

**Undo** and **Redo** (Ctrl+Z, Ctrl+Shift+Z) on the toolbar step back and forward through every change, including whole starter or example copies.

## 5. Preview

Select `ruby_ore:block/ruby_ore` or `minecraft:emerald_ore` and open the **Preview** tab on the right: the block turns in 3D with the ruby ore texture. If the preview says "Vanilla assets not found — set your Minecraft folder.", go back to step 2 and extract the vanilla assets.

To use your own texture, paint a 16×16 PNG named `ruby_ore.png`, choose **Import assets** on the toolbar, pick the namespace `ruby_ore` and **Block textures (textures/block)**, then the file. It replaces the placeholder and the preview updates. `ruby.png` goes into **Item textures (textures/item)** the same way. See [Replacing the placeholders](templates-and-examples.md#replacing-the-placeholders).

## 6. Problems

The **Problems** tab on the right shows a count, for example **Problems (0)**. MCSuperMods checks every element against the definitions of the game version you target, and every command line in functions, while you type.

- Click a problem to jump to the element and field.
- Errors block export and install, so a broken pack never reaches your game. Warnings do not.
- Saving is never blocked: you can save half-finished work and fix it later.

Try it: in `ruby_ore:ruby_block`, change the result id to `minecraft:rubyy`. A problem about the unknown id appears; undo the change (Ctrl+Z) and it goes away.

## 7. Save

Press **Save** on the toolbar or Ctrl+S. The project is a folder of small JSON files (one per element) plus your textures, so it works well with Git and backups. Open it again later with **Open** (Ctrl+O).

## 8. Install into Minecraft

The toolbar's **Install** menu names the current target, for example "Install to: Prism Launcher — My Instance (MC 26.3)". Use **Change target** in that menu to pick a different instance without opening Settings.

1. **Install → Resource pack to the resourcepacks folder.** The resource pack zip is written into that game folder's `resourcepacks`.
2. **Install → Data pack to a world…** Pick a world in the list. Close that world in Minecraft first if it is open. The data pack zip is written into the world's `datapacks` folder.

If the instance runs a different Minecraft version from your project, MCSuperMods warns but still installs.

You can also export zips without installing: **Export .zip** and its arrow on the toolbar, or **File → Export Resource Pack…**, **Export Data Pack…** and **Export Both…**.

## 9. Try it in Minecraft

1. Start Minecraft 26.3 from the launcher you chose.
2. **Options → Resource Packs**: move your pack (described as "ruby_ore: emerald ore becomes ruby ore") to the selected side, then **Done**.
3. Open the world you installed the data pack into, with cheats allowed (or open it to LAN with cheats on). Run `/reload` and then `/datapack list`: the enabled packs include your data pack zip as `file/...`.
4. Check the results:
   - `/give @s minecraft:emerald_ore`, place it and look: it shows your ruby ore texture, and its name is **Ruby Ore**.
   - Mine it with an iron pickaxe: it drops **Ruby** items (more with Fortune). Picking up the first one shows the advancement toast **Red Gold**, in the new tab **Gem Collector**.
   - Put a block of redstone in the middle of a crafting table and eight rubies around it: the result is the **Block of Ruby**.
5. If something is missing, open the game log (`%APPDATA%\.minecraft\logs\latest.log` for the official launcher, or the instance's `logs` folder) and look for lines mentioning `ruby_ore`.

To undo the reskin in a world, disable the resource pack and remove the data pack zip from the world's `datapacks` folder.

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
5. Check **Problems (0)**, save, then **Install → Data pack to a world…** and pick a world (closed in Minecraft).
6. In the world, with cheats on:
   - `/reload`: chat shows "my_functions loaded. Run /function my_functions:greet" and a **Jumps** sidebar appears;
   - jump a few times: the score counts up;
   - stand on a gold block: you run faster;
   - `/function my_functions:greet` says hello; `/function #my_functions:all` runs every function in your tag.

The [templates list](templates-and-examples.md#all-templates) has 66 element templates to start from: recipes, loot tables, advancements, predicates, enchantments, dialogs and more. The Recipe pack and Custom music disc starters, and the 34 commented examples under **Help → Examples…**, are described in [Templates, starters and examples](templates-and-examples.md).

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
- [Known limitations](../../README.md#known-limitations) in the README.
- [Structures](structures.md) and [Worldgen](worldgen.md): jigsaw structures, custom biomes and World Types.
- The [roadmap](../ROADMAP.md): real custom blocks and items come next.
