# MCSuperMods user guide

How to use MCSuperMods to make resource packs, data packs and Fabric mods with new blocks, items and animated mobs, including structures and custom biomes, for Minecraft Java Edition, without writing JSON or code.

| Guide | What it covers |
|---|---|
| [Getting started](getting-started.md) | Install, first launch and Settings → Game locations, a first mod from the Custom ore starter, forms and Studios, preview, problems, saving, exporting the Fabric mod jar and trying it in Minecraft, a data pack from the Functions starter, the command palette and keyboard shortcuts |
| [Structures](structures.md) | Importing a structure (`.nbt`, `.schem`), the Structure Studio, jigsaw blocks in the game, template pools and connections, making a structure generate (structure set, biome tag, existing and new worlds), exporting structures as `.nbt` and `.schem` |
| [Worldgen](worldgen.md) | The worldgen starters, how a custom biome reaches a world (world preset and World Type), the Biome Studio, configured and placed features, steps and the feature order rule, the climate map, the in-game check |
| [Blocks and items](blocks-and-items.md) | Creating blocks and items from templates, the Block Studio and Item Studio, events and the six actions, drops, display names, exporting the Fabric mod jar, the separate runtime for modpacks, installing into a Fabric game, Test in Minecraft, troubleshooting with the `[msm_runtime]` log line |
| [Entities and models](entities-and-models.md) | Importing a Blockbench model (`.bbmodel`, `.geo.json`, `.animation.json`), the Entity Studio, goals in plain words, natural spawning (biome tags and ids, weight), spawn eggs, events and `play_animation`, the animated preview and its limits, the Fabric mod jar with GeckoLib (nested by default, the one-off download, the separate option), the in-game check, troubleshooting |
| [Templates, starters and examples](templates-and-examples.md) | All 112 element templates by category (including structures, worldgen, blocks and items, entities, models and animations), the 12 project starters, the 66 examples and the Examples gallery, copying versus opening an example, why new blocks, items and mobs need the Fabric mod jar, replacing placeholder textures and the music disc sound |

More help:

- [Using Prism Launcher or the CurseForge app](../../README.md#using-prism-launcher-or-the-curseforge-app): where instances are found and how to choose the install target.
- [Known limitations](../../README.md#known-limitations).
- [`examples/`](../../examples/README.md): the examples as ordinary projects you can open with **File → Open Project…**.

The guide describes the current release. The design behind the app is in [DESIGN.md](../DESIGN.md); what comes next is in the [roadmap](../ROADMAP.md).
