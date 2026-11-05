# Blocks and items

MCSuperMods makes new blocks and items with the `msm:block` and `msm:item` element kinds, edited in the **Block Studio** and the **Item Studio**, and the mod's name and version with one `msm:mod` element. A resource or data pack cannot add blocks or items, so this content reaches the game only through the **Fabric mod jar** export. The [Custom ore](getting-started.md#3-create-a-project-from-the-custom-ore-starter) starter and the blocks and items examples ([Templates, starters and examples](templates-and-examples.md#new-blocks-and-items-need-the-mod-jar)) are good places to start.

This page is a stub: the full guide to the Block and Item Studios follows later in Phase 4.

## Export a Fabric mod jar

1. Open the arrow next to **Export .zip** on the toolbar and choose **Fabric mod (.jar)…**, or use **File → Export Fabric Mod Jar…**, or "Export Fabric mod jar…" in the command palette (Ctrl+Shift+P).
2. The **Export Fabric mod jar** dialog shows the export's options (see below). Choose **Export…**.
3. Save the file. Its name is the mod id, for example `ruby_ore.jar`.

Every error in **Problems** blocks the export and nothing is written; warnings do not. The jar holds:

- your blocks and items, as definitions under `msm/<namespace>/` that the runtime reads when the game starts;
- everything the resource and data pack exports would hold (models, textures, names, block states, loot tables, recipes, tags, advancements, functions), under `assets/` and `data/`, so players do not need the packs as well;
- `fabric.mod.json`, written from the `msm:mod` element (or with a mod id made from the project name when there is none). It depends on Fabric Loader, Fabric API, the Minecraft version you target and `msm_runtime`.

To play with it, put the jar and **Fabric API** for the same Minecraft version into the `mods` folder of an instance with **Fabric Loader**. MCSuperMods does not install mod jars for you yet.

The mod id must be unique among the mods you install, and the ids `minecraft`, `java`, `fabricloader`, `fabric-api` and `msm_runtime` are reserved: **Problems** reports them, and a mod id made from the project name gets a `mod_` prefix instead.

## Separate runtime (for modpacks)

Every exported jar needs the small `msm_runtime` mod, which registers the blocks and items and runs their behaviour. By default it is nested inside the jar (`META-INF/jars/`), so one file is all a player needs, and Fabric Loader uses the newest copy when several MCSuperMods mods carry one.

Tick **Separate runtime (for modpacks)** in the export dialog to leave it out. The jar still depends on `msm_runtime`, so the game refuses to start unless something else provides it: for example another MCSuperMods mod in the same modpack exported with the runtime nested. Use it when you put several MCSuperMods mods into one modpack and want only one copy of the runtime. MCSuperMods does not publish `msm_runtime` as a download of its own yet.
