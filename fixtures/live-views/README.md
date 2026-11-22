# live-views

Parity fixture for batch 2 of the live views, data (ADR 0120 D9; plan brief B607). It holds the MSM project `live_views` (`msm.project.json`, `content/`, plugin `msm.datapack`), its lowered data pack (`lowered/data/`) and `expectations.json`: what the real server did with those files on each target, measured by the parity GameTest `LiveViewsDataParityTest` in `engine-mod/parity/`. `@msm/sim`'s `live-views-parity.test.ts` (B613) plays the same file through MSM's own evaluators, and `@msm/exporters`' `test/live-views-fixture.test.ts` checks that the project loads with no problem and that MSM's export of it equals `lowered/data/` file for file on every built-in target. No vanilla file is ever committed here.

## What is here

- `make_fixture.py`: writes the project and `lowered/` (`python3 fixtures/live-views/make_fixture.py` from the repository root). Every file is MSM's own, written from the data format (the targets' vendored mcdoc and the findings of the spike B600), never copied from vanilla. The data pack format is the same on both targets, so one project (target 26.3) serves both; the export test exports it for each.
- `content/` (132 elements, namespace `live_views` unless named): 32 loot tables, 10 wool block tables (vanilla ids `minecraft:blocks/<colour>_wool` with the fixture's own pools, so they can be rolled by mining), 19 predicates, 12 item modifiers, 17 tags (item, block, entity type, enchantment and function tags; `minecraft:logs` merged into, `minecraft:wool` replaced, `minecraft:curse` merged into, `minecraft:load` running the fixture's load function), 3 enchantments, 19 advancements (a tab with every frame, a hidden one, one without a display, a root without a display, a hidden root), 5 dialogs (notice with every body and input type, confirmation, multi-action, dialog list, server links), 3 damage types, a chat type, a trial spawner, a block transformer and 9 functions.
- `expectations.json`: per target, per section, per case (about 125 KB a target; below).

The tags `with_missing`, `names_missing`, `cycle_a` and `cycle_b` are broken on purpose (a missing required tag, a tag naming it, a cycle): the server logs `Couldn't load tag ...` for each and drops them, and MSM's export warns about the missing ids. Those are the only problems MSM reports.

## What is measured

| Section | How | Cases |
|---|---|---|
| `loot` | `loot insert <chest> loot <table>` as a mock player, 10,000 rolls | every entry type B600 checked (`item`, `empty`, `tag` with and without `expand`, `loot_table`, `alternatives`, `group`, `sequence`), pool `rolls`, two pools, table modifiers; `set_count` (with `add`, from uniform, binomial, weighted list and number dispatcher), `limit_count`, `set_damage`, `enchant_with_levels` and `enchant_randomly` (over every enchantment and over the fixture's own), `set_item`, `discard`, a modifier and a condition named by id, `sequence` |
| `mined` | `loot insert <chest> mine <pos> mainhand`, the mock player holding nothing, a diamond pickaxe, Fortune I to III or Silk Touch | `apply_bonus` (all three formulas), `table_bonus`, `random_chance_with_enchanted_bonus` (from a tool: no effect), `match_tool` with Silk Touch, `match_block`, and the explosion tables without an explosion |
| `killed` | `loot insert <chest> kill` on a zombie with a `DeathLootTable`, by the player with Looting 0, 1 and 3, and from the console (no killer) | `enchanted_count_increase` (with and without `limit`), `killed_by_player`, `random_chance_with_enchanted_bonus` |
| `exploded` | the block blown up 2,000 times (`Level.explode`, the block cause at power 2 and 4, the TNT cause at 4), the apples dropped counted | `explosion_decay` (entry and table), `survives_explosion` |
| `predicates` | `execute store success ... if predicate`, 10,000 times for random ones, once otherwise | `random_chance`, `all_of`, `any_of`, `inverted`, ids, `int_value_check`, `weather_check` (rain and clear, 150 ticks after the change), `time_check` (ticks 1,000, 13,000, 25,000), `entity_properties` (type, sneaking), `entity_scores`, `location_check` (biome, height), and what a command source lacks (`match_tool`, `killed_by_player`, `survives_explosion`, `table_bonus`, `damage_source_properties`) |
| `modifiers` | `item modify block <chest> container.0 <id>` | the stack before and after (`ItemStack` as JSON): `set_name`, `set_lore`, `set_damage`, `set_enchantments`, `set_count`, `furnace_smelt`, `set_components`, `sequence`, a failing condition, an id |
| `enchantments` | the registry | each fixture enchantment's max level, weight, anvil cost, cost window per level and name per level (keys and colour only); the enchanting table's picks among the fixture's own enchantments at costs 1 to 40 (10,000 draws each, a fixed seed) |
| `tags` | the registries after loading | members, sorted, or `null` for a dropped tag |
| `functions` | each function run as a fresh mock player at a spot of the arena | its scores (objectives `lv_*`), tags (`lv_*`), inventory, effects and the blocks of the box x 0 to 5, y 0 to 2, z -1 to 1 from the spot |
| `advancements` | the server's tree | parent, sorted children, root, frame, hidden, column (`x`) |
| `registries` | the registries | the fixture's ids per registry (dialogs, damage and chat types, trial spawner, block transformer, loot tables, predicates, item modifiers, functions), the death lines of its damage types and its chat type's decoration (keys, argument counts, style), and the load function's score |

Every case carries the `situation` it was measured in, in the shape of `@msm/sim`'s `Situation` (`context`, `tool`, `block`, `thisEntity` with `flags` and `scores`, `killer` with `player` and `weapon`, `explosion` with `power` and `decays`, `weather`, `time`, `biome`, `position`). Positions hold only the height (x and z 0): GameTests are placed at random x and z on every start. The `context` ids are MSM's reading of which context each command uses (`minecraft:chest` for `loot ... loot`, `minecraft:block` for `mine`, `minecraft:entity` for `kill`, `minecraft:command` for `execute if predicate`).

A roll's outcome is counted per item key: the item id, and ` worn=<n>` when it is damaged (n is the damage in twentieths of the durability, rounded down). `items` gives, per key, how many rolls had each total count of it (the counts of a key add up to the rolls); `enchantments` gives how many rolls had a stack with each `<id>=<level>` (enchantments and stored enchantments alike).

Not recorded: the rows (`y`) of advancement nodes, since the game orders siblings anew on every server start (B600's 2L5: positions are about right); anything resolved from the game's language file (names are kept as translation keys).

## Tolerance

Rates of random outcomes (each item and count, each enchantment, each predicate's yes, each enchanting pick) may differ from the recorded ones by B600's 2L1 tolerance, 2 percentage points (3 for explosions), or by five standard deviations of the difference of two samples of those sizes where that is larger (two runs of the game differ by chance too; at a rate of one half and 10,000 rolls that is 3.5 points). Everything else must be equal. MSM's own checks against these expectations (B609, B610, B613) use 2L1's tolerance with at least 100,000 seeded rolls.

## Running it

```sh
cd engine-mod
./gradlew -p parity liveViewsParity [-Pmc=26.4]                          # check (about 1.5 minutes warm)
./gradlew -p parity liveViewsParity [-Pmc=26.4] -PupdateLiveViewsParity  # rewrite this version's sections
```

The task builds the fixture jar (`liveViewsFixtureJar`: `lowered/data/` as the mod `msm_live_views_fixture`, so its wool tables, tag changes and load function are never active in another parity run) and runs `tools/run-fabric-server` on a production GameTest server with it as the mod and the parity jar's `live_views_data_parity_test_*` tests (it needs `node` and JDK 25). After changing `make_fixture.py`, run it, then the task with `-PupdateLiveViewsParity` on both versions. CI's `engine-mod` job runs the check on every version.

## Rules

- No vanilla file is ever committed here. Vanilla's own tables are compared only where a jar is present (the `engine-mod` CI job).
- A part a view shows as "checked" needs a case in `expectations.json`; a part without one is "about right" at best.
- Any registry file that fails to parse stops the server start, and a predicate or item modifier file must be one JSON object (B600): keep `make_fixture.py`'s files within what both servers load.
