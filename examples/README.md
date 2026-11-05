# MCSuperMods examples

Ordinary MSM projects generated from the built-in templates and samples library (`@msm/plugin-library`, ADR 0020). The same content is in the app: Help > Examples… opens the Examples gallery, and the New project dialog lists the starters.

| Folder | Namespace | What it holds |
|---|---|---|
| `all-kinds/` | `msm_examples` | One commented example for every element kind of the resource pack, data pack, structures, worldgen, blocks and items, entities, models and animations and scripting plugins (59 examples in one project) |
| `blocks-items/` | `msm_examples` | The blocks and items behaviour examples: the Sturdy pickaxe (a tool with its recipe) and the Beacon stone (an event chain that runs a function) |
| `entities/` | `msm_examples` | The entity behaviour examples: the Brute (a hostile mob that attacks players) and the Meadow Hopper (natural spawning in a biome tag and a biome), each with its geo model, animations, skin and spawn egg texture |
| `scripts/` | `msm_examples` | The script behaviour examples: Script: scheduled effects (an `msm.schedule` chain of particles over two seconds) and Script: action handler (the Chime Block, whose use event calls a script through a `run_script` action, and the script that defines that handler) |
| `starters/custom_ore/` | `msm_starter` | The Custom ore starter: a real Ruby Ore block that drops rubies, the Ruby item and a Block of Ruby, with textures, models, a loot table, recipes, an item tag, advancements and the mod metadata |
| `starters/custom-sword/` | `msm_starter` | The Custom sword starter with its default answers: the Ruby Sword (a diamond-tier `msm:item` sword with 1561 durability), its handheld model and texture, a recipe of two emeralds over a stick, its English name and the mod metadata |
| `starters/recipe_pack/` | `msm_starter` | The Recipe pack starter: shaped, shapeless, smelting, blasting and stonecutting recipes, an item tag and an advancement |
| `starters/music_disc/` | `msm_starter` | The Custom music disc starter: a jukebox song, its sound event, disc model and texture, and a function that gives the disc |
| `starters/function_starter/` | `msm_starter` | The Functions starter: load and tick functions, the vanilla function tags and a function tag of its own |
| `starters/custom_biome/` | `msm_starter` | The Custom biome starter: the Amber Woods biome with its own tree and ore, and a World Type that uses it |
| `starters/jigsaw_structure/` | `msm_starter` | The Jigsaw village-style structure starter: a hamlet of a hut, streets and lamp posts built from three structure templates and four template pools, with its structure set and biome tag |
| `starters/worldgen_pack/` | `msm_starter` | The Custom biome with a jigsaw structure starter: both of the above, with hamlets generating in Amber Woods too (also saved as `fixtures/sample-worldgen/`) |
| `starters/custom_mob/` | `msm_starter` | The Custom mob starter: the animated Ruby Golem with its GeckoLib model, animations, skin and spawn egg texture, natural spawning in forests, a loot table dropping emeralds, a death function and the mod metadata |
| `starters/scripted_ore/` | `msm_starter` | The Scripted ore starter: the Custom ore content plus three scripts: sneak-using ruby ore gives a bonus ruby, a `run_script` action on the Block of Ruby's step event calls a script handler that heals the player, and joining players are greeted |
| `starters/gear-set/` | `msm_starter` | The Gear set starter with its default answers: Ruby Ore that drops rubies, a Block of Ruby, a custom-material sword, pickaxe, axe, shovel and hoe, a custom-material helmet, chestplate, leggings and boots drawn by the `ruby_armor` equipment asset and its two 64x32 layer textures, crafting recipes, the repair tag, the vanilla tool and armour tags, English names and the mod metadata |
| `starters/simple-block/` | `msm_starter` | The Simple block starter with its default answers: Ruby Tiles (a pickaxe-mined block that drops itself), its model and texture, a recipe of four stone and its English name |
| `starters/food/` | `msm_starter` | The Food starter with its default answers: the Ruby Apple (`msm:food`, 4 hunger, 0.6 saturation), its model and texture, a recipe of an apple and sugar and its English name |
| `starters/scripted-item/` | `msm_starter` | The Scripted behaviour starter with its default answers: the Ruby Wand, whose use event calls a script through a `run_script` action, and the generated script that heals the player |

The Custom ore, Custom sword, Gear set, Simple block, Food, Custom mob and Scripted behaviour starters are wizards in the app (New project asks for a name, colours and a few numbers), and all but Custom sword are also Creator flows; the folders here hold their default answers.

Every element carries notes (`meta.notes`) explaining its fields; the app shows them above the editor.

## Opening an example

1. Copy the folder somewhere outside this repository, so your edits do not change the mirror.
2. In MCSuperMods choose File > Open Project… and pick the copied folder.
3. Export the resource pack and data pack as usual and try them in game. Structure templates export as `.nbt` files in the data pack; a World Type appears on the Create New World screen only when the data pack is enabled there. New blocks and items (`msm:block`, `msm:item`, in `all-kinds/`, `blocks-items/`, `starters/custom_ore/`, `starters/custom-sword/`, `starters/gear-set/`, `starters/simple-block/`, `starters/food/` and `starters/scripted-item/`) and new mobs (`msm:entity`, in `all-kinds/`, `entities/` and `starters/custom_mob/`) work only from the Fabric mod jar export, installed with Fabric Loader and Fabric API; mobs also need GeckoLib, which the jar nests unless you keep it separate. Scripts (`msm:script`, in `all-kinds/`, `scripts/`, `starters/scripted_ore/` and `starters/scripted-item/`) run only from the Fabric mod jar export, through `msm_runtime`; the Java project export leaves them out.

The textures are generated placeholders, not Mojang assets, drawn from these patterns (`packages/plugins/library/src/assets/png.ts`, tinted from one colour):

| Pattern | Size | Used for |
|---|---|---|
| `plain` | 16x16 | Blocks (storage blocks, Simple block), smithing templates |
| `ore` | 16x16 | Ore blocks |
| `gem` | 16x16 | Gems, the Scripted behaviour item |
| `disc` | 16x16 | Music discs |
| `egg` | 16x16 | Spawn eggs, foods |
| `sword`, `pickaxe`, `axe`, `shovel`, `hoe` | 16x16 | Handheld tools |
| `helmet`, `chestplate`, `leggings`, `boots` | 16x16 | Armour item icons |
| `ingot` | 16x16 | Ingots |
| `armor_layer_1`, `armor_layer_2` | 64x32 | Worn armour (`entity/equipment/humanoid/` and `humanoid_leggings/`) |

The music disc plays the vanilla `records/cat` track until you import your own `.ogg` and point the sound event at it.

## Regenerating

These folders are generated. Do not edit them by hand: change the library in `packages/plugins/library/src/`, then run

```sh
UPDATE_GOLDENS=1 pnpm --filter @msm/exporters exec vitest run test/library.test.ts
```

`packages/exporters/test/library.test.ts` fails when the folders drift from the library. It also loads every starter and example with the real plugins, validates every element, checks every function and exports both packs (and, for projects with blocks, items, entities or scripts, the Fabric mod jar) with zero problems for each built-in target. `biome.json` here turns off formatting of the generated JSON, which MSM writes in its own stable format.
