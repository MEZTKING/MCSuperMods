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
| `msm_sample_data:fletcher/1/emerald_spectral_arrow` | villager trade | `data/msm_sample_data/villager_trade/fletcher/1/emerald_spectral_arrow.json` |
| `minecraft:fletcher/level_1` | villager trade tag | `data/minecraft/tags/villager_trade/fletcher/level_1.json` |
| `msm_sample_data:pack` | pack metadata | `pack.mcmeta` |

- The **Ruby Block** recipe is eight emeralds around a block of redstone; the result is a block of redstone named "Ruby Block". The pattern is chosen so it does not clash with a vanilla recipe.
- The advancement `msm_sample_data:root` is granted by crafting that recipe (`minecraft:recipe_crafted`); its reward is 10 experience and a roll of `chests/ruby_vault`.
- `#minecraft:load` runs `msm_sample_data:load` on every `/reload`, which says that the pack loaded.
- The item modifier adds one to three items to the stack, but only while the player is sneaking (it uses the predicate as its condition).
- The villager trade sells four spectral arrows for two emeralds. The tag `minecraft:fletcher/level_1` lists it without `replace`, so it is merged into vanilla's tag and the three vanilla novice fletcher trades stay. A novice fletcher draws two trades from the four (ADR 0060 D5), so about half of all fletchers offer it: a candidate, not a certainty.

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
| Place a fletching table next to a few unemployed villagers (or `/summon minecraft:villager ~ ~ ~ {VillagerData:{profession:"minecraft:fletcher",level:1,type:"minecraft:plains"}}` several times) and open their trades | About half of the novice fletchers offer 4 spectral arrows for 2 emeralds; the others show only vanilla trades |

3. Open `.minecraft/logs/latest.log` (`%APPDATA%\.minecraft\logs\latest.log`) and check that there is no `Failed to load`, `Couldn't parse` or other error line mentioning `msm_sample_data`. Report any such line.

## Headless server check (villager trade)

The scripted, CI-run form of this check is `tools/run-fabric-server/vanilla-datapack.ts` (the `engine-mod` job runs it on every push); the manual steps below stay for reference. The trade is plain data, so a vanilla dedicated server proves it (no Fabric, no runtime). Export the data pack zip with `MSM_SAMPLE_DATAPACK_OUT=<folder> pnpm --filter @msm/exporters exec vitest run test/sample-datapack.golden.test.ts` (it writes `msm-sample-data-pack-mc-26.3.zip` and `server-facts.json`), put the zip into `world/datapacks/` of a fresh server folder with the 26.3 server jar, start it with JDK 25 and run on its console:

```
datapack list enabled
difficulty hard
gamerule max_entity_cramming 0
forceload add 0 0
setblock 0 200 0 minecraft:barrier
setblock 4 200 0 minecraft:barrier
summon minecraft:zombie 4 201 0 {NoAI:1b,Invulnerable:1b,PersistenceRequired:1b,Tags:["msm_killer"]}
summon minecraft:villager 0 201 0 {NoAI:1b,VillagerData:{profession:"minecraft:fletcher",level:1,type:"minecraft:plains"}}   (40 times)
execute as @e[type=minecraft:villager] run damage @s 1000 minecraft:mob_attack by @e[tag=msm_killer,limit=1]
execute if entity @e[type=minecraft:zombie_villager,nbt={Offers:{Recipes:[{sell:{id:"minecraft:spectral_arrow",count:4},buy:{id:"minecraft:emerald"}}]}}]
execute if entity @e[type=minecraft:zombie_villager,nbt={Offers:{Recipes:[{sell:{id:"minecraft:arrow"}}]}}]
```

A villager draws its trades only when they are first needed; a zombie kill on hard turns it into a zombie villager that keeps them, which forces the draw without a player. Expected: the pack is listed as enabled, the log has no `Failed to load`, `Couldn't load tag` or other error line, and both tests pass with a count above zero (the new trade is in `minecraft:fletcher/level_1`, and the vanilla arrow trade is still there). With 40 villagers and a one-in-two chance each, a false failure is negligible. Recorded run (2026-11-14, 26.3): 40 zombie villagers, 23 with the new trade, 21 with the vanilla arrow trade (`gamerule max_entity_cramming 0` keeps the 40 villagers on one block alive).

## Changing the sample

Edit it in MCSuperMods (or keep the files exactly as MSM saves them: the golden test fails otherwise), then rerun the exporter golden with `UPDATE_GOLDENS=1` and commit the new hashes on purpose:

```sh
UPDATE_GOLDENS=1 pnpm --filter @msm/exporters test
```
