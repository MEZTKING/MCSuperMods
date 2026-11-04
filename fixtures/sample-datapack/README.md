# Sample data pack project

A small MCSuperMods project used for the manual in-game data pack check and as the data pack exporter golden (`packages/exporters/test/sample-datapack.golden.test.ts`, which checks every function with the mcfunction service and pins the SHA-256 of both exported zips, built in two time zones). It uses vanilla items only, so no resource pack is needed.

## Contents

| Element | Kind | Exports to |
|---|---|---|
| `msm_sample_data:greet` | function | `data/msm_sample_data/function/greet.mcfunction` |
| `msm_sample_data:load` | function | `data/msm_sample_data/function/load.mcfunction` |
| `minecraft:load` | function tag | `data/minecraft/tags/function/load.json` |
| `msm_sample_data:gems` | item tag | `data/msm_sample_data/tags/item/gems.json` |
| `msm_sample_data:ruby_block` | shaped recipe | `data/msm_sample_data/recipe/ruby_block.json` |
| `msm_sample_data:glowstone_from_gems` | shapeless recipe | `data/msm_sample_data/recipe/glowstone_from_gems.json` |
| `msm_sample_data:leather_from_rotten_flesh` | smelting recipe | `data/msm_sample_data/recipe/leather_from_rotten_flesh.json` |
| `msm_sample_data:root` | advancement (root, with display) | `data/msm_sample_data/advancement/root.json` |
| `msm_sample_data:chests/ruby_vault` | loot table | `data/msm_sample_data/loot_table/chests/ruby_vault.json` |
| `msm_sample_data:is_sneaking` | predicate | `data/msm_sample_data/predicate/is_sneaking.json` |
| `msm_sample_data:bonus_count` | item modifier | `data/msm_sample_data/item_modifier/bonus_count.json` |
| `msm_sample_data:pack` | pack metadata | `pack.mcmeta` |

- The **Ruby Block** recipe is eight emeralds around a block of redstone; the result is a block of redstone named "Ruby Block". The pattern is chosen so it does not clash with a vanilla recipe.
- The advancement `msm_sample_data:root` is granted by crafting that recipe (`minecraft:recipe_crafted`); its reward is 10 experience and a roll of `chests/ruby_vault`.
- `#minecraft:load` runs `msm_sample_data:load` on every `/reload`, which says that the pack loaded.
- The item modifier adds one to three items to the stack, but only while the player is sneaking (it uses the predicate as its condition).

All content is original work written for MCSuperMods; the project contains no Mojang files.

## In-game check (Windows, Minecraft Java 26.3)

1. In MCSuperMods, open this folder and choose **File → Install Data Pack…**, then pick a test world. The pack is written as `saves/<world>/datapacks/msm-sample-data-pack-mc-26.3.zip`.
2. Open the world with cheats allowed and run the commands below. Expected chat output is shown under each.

| Command or action | Expected |
|---|---|
| `/reload` | `[Server] MCSuperMods sample data pack loaded. Run /function msm_sample_data:greet` |
| `/datapack list` | The enabled packs include `[file/msm-sample-data-pack-mc-26.3.zip (world)]` |
| `/function msm_sample_data:greet` | `[<you>] Hello from the MCSuperMods sample data pack!`, a green hint line, then eight emeralds and one block of redstone in your inventory |
| Craft the Ruby Block (redstone block in the centre, emeralds around it) | A block of redstone named "Ruby Block"; the toast "Advancement Made! Ruby Crafter" appears |
| `/advancement grant @s only msm_sample_data:root` | Succeeds (or says you already have it) |
| `/loot give @s loot msm_sample_data:chests/ruby_vault` | One to three stacks of emeralds or blocks of redstone, sometimes a diamond |
| Hold a stack, sneak, then `/item modify entity @s weapon.mainhand msm_sample_data:bonus_count` | The stack grows by one to three; without sneaking it stays the same |
| `/execute if predicate msm_sample_data:is_sneaking` while sneaking | `Test passed` |
| Craft an emerald, diamond or amethyst shard with a flint | Two glowstone dust |
| Smelt rotten flesh in a furnace | Leather |

3. Open `.minecraft/logs/latest.log` (`%APPDATA%\.minecraft\logs\latest.log`) and check that there is no `Failed to load`, `Couldn't parse` or other error line mentioning `msm_sample_data`. Report any such line.

## Changing the sample

Edit it in MCSuperMods (or keep the files exactly as MSM saves them: the golden test fails otherwise), then rerun the exporter golden with `UPDATE_GOLDENS=1` and commit the new hashes on purpose:

```sh
UPDATE_GOLDENS=1 pnpm --filter @msm/exporters test
```
