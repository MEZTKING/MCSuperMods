# MCSuperMods examples

Ordinary MSM projects generated from the built-in templates and samples library (`@msm/plugin-library`, ADR 0020). The same content is in the app: Help > Examples… opens the Examples gallery, and the New project dialog lists the starters.

| Folder | Namespace | What it holds |
|---|---|---|
| `all-kinds/` | `msm_examples` | One commented example for every element kind of the resource pack, data pack, structures, worldgen and blocks and items plugins (55 examples in one project) |
| `blocks-items/` | `msm_examples` | The blocks and items behaviour examples: the Sturdy pickaxe (a tool with its recipe) and the Beacon stone (an event chain that runs a function) |
| `starters/custom_ore/` | `msm_starter` | The Custom ore starter: a real Ruby Ore block that drops rubies, the Ruby item and a Block of Ruby, with textures, models, a loot table, recipes, an item tag, advancements and the mod metadata |
| `starters/recipe_pack/` | `msm_starter` | The Recipe pack starter: shaped, shapeless, smelting, blasting and stonecutting recipes, an item tag and an advancement |
| `starters/music_disc/` | `msm_starter` | The Custom music disc starter: a jukebox song, its sound event, disc model and texture, and a function that gives the disc |
| `starters/function_starter/` | `msm_starter` | The Functions starter: load and tick functions, the vanilla function tags and a function tag of its own |
| `starters/custom_biome/` | `msm_starter` | The Custom biome starter: the Amber Woods biome with its own tree and ore, and a World Type that uses it |
| `starters/jigsaw_structure/` | `msm_starter` | The Jigsaw village-style structure starter: a hamlet of a hut, streets and lamp posts built from three structure templates and four template pools, with its structure set and biome tag |
| `starters/worldgen_pack/` | `msm_starter` | The Custom biome with a jigsaw structure starter: both of the above, with hamlets generating in Amber Woods too (also saved as `fixtures/sample-worldgen/`) |

Every element carries notes (`meta.notes`) explaining its fields; the app shows them above the editor.

## Opening an example

1. Copy the folder somewhere outside this repository, so your edits do not change the mirror.
2. In MCSuperMods choose File > Open Project… and pick the copied folder.
3. Export the resource pack and data pack as usual and try them in game. Structure templates export as `.nbt` files in the data pack; a World Type appears on the Create New World screen only when the data pack is enabled there. New blocks and items (`msm:block`, `msm:item`, in `all-kinds/`, `blocks-items/` and `starters/custom_ore/`) work only from the Fabric mod jar export, installed with Fabric Loader and Fabric API.

The textures are generated placeholders, not Mojang assets. The music disc plays the vanilla `records/cat` track until you import your own `.ogg` and point the sound event at it.

## Regenerating

These folders are generated. Do not edit them by hand: change the library in `packages/plugins/library/src/`, then run

```sh
UPDATE_GOLDENS=1 pnpm --filter @msm/exporters exec vitest run test/library.test.ts
```

`packages/exporters/test/library.test.ts` fails when the folders drift from the library. It also loads every starter and example with the real plugins, validates every element, checks every function and exports both packs (and, for projects with blocks or items, the Fabric mod jar) with zero problems for each built-in target. `biome.json` here turns off formatting of the generated JSON, which MSM writes in its own stable format.
