# Your first mod

This page is for your very first time. In about fifteen minutes you make a small Fabric mod with a new material, "Ruby", and a full set of ruby tools and armour, then play with it in Minecraft. You do not write any code or JSON: you answer a few questions and MCSuperMods makes the files.

MCSuperMods shows a short version of these steps the first time it starts (**Welcome to MCSuperMods**). Open it again any time with **Help → Your First Mod…** or "Your first mod…" in the command palette (Ctrl+Shift+P).

## What you need

- Windows 10 or 11 and MCSuperMods installed ([Getting started](getting-started.md), step 1).
- Minecraft Java Edition 26.3, the version MCSuperMods makes mods for by default.
- [Prism Launcher](https://prismlauncher.org/), started once. You can test with the official launcher too, but with Prism MCSuperMods sets up a test game and starts it for you.

## 1. Tell MCSuperMods where Minecraft is (once)

1. Choose **Settings** on the toolbar.
2. Under **Game locations**, pick the game folder or launcher instance you play with. If none fits, that is fine: step 5 can make a test instance.
3. Under **Vanilla assets**, choose **Extract vanilla assets**. This copies the game's own textures from your Minecraft so the 3D preview can draw them. If it cannot find Minecraft 26.3, start that version once in any launcher and try again.
4. Close Settings.

## 2. Make a project

A project is one mod: a folder that holds everything you make for it.

1. Choose **New** on the toolbar.
2. Create a new, empty folder, for example `Documents\MCSuperMods\ruby_mod`, and choose it. The folder name becomes the mod's **namespace**, the part before the colon in ids such as `ruby_mod:ruby_sword`.

The element list on the left now holds one element, `pack`, which every project has.

## 3. Make a ruby gear set with the Creator

1. Choose **Create…** on the toolbar.
2. Under **Gear**, pick **Gear set**.
3. Fill in the first fields:
   - **Material name**: `Ruby`.
   - **Colour**: a red you like. The Creator tints its placeholder textures with it.
   - **Where the material comes from**: keep the new ore with a storage block, so rubies are found in the world.
4. Leave everything else as it is for now. Look at the tabs on the right: **Items** shows every new item, **Recipes** how each one is crafted, **Armour** the armour on a figure, **Stats** the numbers in words, **Elements** everything that will be added.
5. Choose **Create**.

The element list fills with your new ore, ruby, ruby block, tools, armour, recipes, tags and names. Everything the Creator made is ordinary content: you can open any element and change it. If you do not like the result, **Edit → Undo** takes the whole set back in one step.

## 4. Check it and save

- The **Problems** tab on the right should say there are no errors. Errors (red) stop the export; warnings (yellow) do not.
- Choose **Save** (Ctrl+S).

## 5. Play with it in Minecraft

1. Open the **Export** menu (the arrow next to **Export .zip**) and choose **Test in Minecraft…**.
2. The dialog says which game it will use:
   - With a Prism Launcher instance that has Fabric for Minecraft 26.3, choose **Install and launch**. MCSuperMods copies your mod and Fabric API into the instance and starts it.
   - If no game fits, choose **Create test instance**. MCSuperMods makes the Prism instance **MCSuperMods Test (26.3)** with Fabric; then choose **Install and launch**. Prism downloads the game the first time, which takes a few minutes.
   - With the official launcher, choose **Install**, then start the Fabric profile for 26.3 yourself.
3. In the game, make a new Creative world and search the inventory for "ruby". Mine the ruby ore underground in a Survival world, and craft a ruby pickaxe from the recipes.

If something is missing in the game, see [Blocks and items, Troubleshooting](blocks-and-items.md#troubleshooting).

## 6. Change something and test again

1. Select any ruby element, for example `ruby_sword`, and choose **Edit in Creator** above its editor.
2. Change the **Colour**, or add pieces under **Pieces** (a bow, a shield, horse armour).
3. Choose **Create**: it applies the change as one step, "Update Gear set", which one Undo takes back. Then choose **Test in Minecraft…** again and restart the game.

Pieces you changed by hand are kept unless you choose to overwrite them ([The Creator](creator.md)).

## 7. Share your mod

Open the **Export** menu and choose **Fabric mod (.jar)…**, then save the jar. Players put it in their `mods` folder; they need Fabric Loader and Fabric API, like for any Fabric mod. MCSuperMods puts its small runtime inside your jar, so nothing else is needed.

## Where to go next

- Replace the placeholder textures with your own pictures: [Replacing the placeholders](creator.md#replacing-the-placeholders).
- More things to make with a few questions: weapons, food, totems, enchantments, paintings, music discs, mobs ([The Creator](creator.md)).
- A tour of the whole window, forms and Studios: [Getting started](getting-started.md).
- Let the AI helper build or explain things for you, with your own Anthropic key: [The AI helper](ai-helper.md).
- Blocks and items in detail: [Blocks and items](blocks-and-items.md); animated mobs: [Entities and models](entities-and-models.md).
