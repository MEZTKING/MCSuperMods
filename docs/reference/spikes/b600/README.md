# B600 spike: data views against the real game (live views, batch 2)

Answers 2S1 to 2S15 of [`docs/PLAN-live-views.md`](../../../PLAN-live-views.md) (batch 2) for [ADR 0120](../../../adr/0120-live-views-data.md), measured on 2026-11-22 on this cloud machine (4 cores, 15 GB) for the targets 26.3 and 26.4-snapshot-7 (Fabric reports it as 26.4-alpha.7, hence the result file names). Nothing here is built, linted or shipped.

Clean room: Mojang classes were read with `javap` signatures only (no `-c`); no method body was read. Behaviour was learned from the data's field names and from what the real game did with MSM's own fixture files. Vanilla data files were read from the Loom cache's client jars into the scratchpad at run time (for shapes, the enchantment model and the speed runs) and deleted afterwards. Nothing of Mojang's is kept here: the kept results have every resolved game string removed (keys, arguments and styles stay), the vanilla advancement positions are left out (only rates are kept), and no screenshot is kept.

## What was run

- **Server GameTests** (`spike-src/spike600/B600LootGameTest.java`, `B600DataGameTest.java`): a throwaway spike in the runtime's GameTest source set (its `fabric.mod.json` temporarily replaced by `spike-src/fabric.mod.json.spike`), `./gradlew runGameTest` with `-Pmc=26.3` and `-Pmc=26.4`. MSM's own fixture data pack (namespace `msm_b600`, written by `spike-src/make_pack.py`): 26 loot tables, 9 vanilla wool block tables overridden, 19 predicates, 10 item modifiers, 14 item tags (plus merges into `minecraft:logs`, `minecraft:wool` and `minecraft:curse`), 3 enchantments, 3 damage types, a chat type, a trial spawner, a block transformer, 19 advancements, 6 dialogs and a function.
- **Rolls:** every case 10,000 times through the game's own command, `loot insert <chest> loot|mine|kill ...`, run by `Commands.performPrefixedCommand` as a mock server player (or the console), the chest read and emptied after each roll. Block tables were rolled with `mine <pos> mainhand` holding nothing, a diamond pickaxe, Fortune I to III or Silk Touch; kill tables with `DeathLootTable` on a summoned zombie and a sword with Looting 0, 1 or 3. Explosions: the block placed and blown up 2,000 times by `Level.explode` with the block and the TNT cause at power 2 and 4, the dropped items counted.
- **Client GameTest** (`B600ClientGameTest.java`, headless Mesa EGL, `runClientGameTest`): each fixture dialog opened from the server in singleplayer and its widgets recorded (class, rectangle, label) at 854 by 480 pixels, GUI scale 2 (427 by 240); the client's advancement tree before and after granting; the advancements screen with the fixture tab.
- **Node 24** (`spike-src/*.mjs`): a throwaway loot evaluator written from field names and the observations above (`loot-eval.mjs`), compared with the game's rolls at 100,000 seeded rolls per case (`compare.mjs`); a tidy tree for advancement tabs (`tree-layout.mjs`, `tree-compare.mjs`); speeds in a `worker_threads` worker (`speed.mjs`; the app would use a Web Worker, as live worldgen's B574 measured in Electron); the command share of the library's and the fixtures' functions (`commands-share.mjs`, `tools/templates.test.ts`); the enchanting table (`enchanting-compare.mjs`); extraction time (`tools/extract.test.ts`, run as a throwaway Vitest file under `packages/sim/test/loot-spike/`, deleted).
- `results/` holds the numbers: `server-*.json` and `client-*.json` (the observations, sanitised by `tools/sanitize.mjs`), `compare-*.json`, `enchanting-*.json`, `tree-*.json`, `speed-*.json`, `2s4-extract.json`, `jar-data-folders.json`, `2s7-commands.json`, `check-size.txt`.

Both targets gave the same answers everywhere below unless a line says otherwise. The type registries and every field read here are the same on both targets.

## 2S1 Types per target, and the fixture case for each

From the vendored `registries.json` (identical on both targets): **9 pool entry types**, **20 condition types**, **42 function types**. There is **no `loot_number_provider_type` registry any more**: since 26.3 numbers are `context_int_provider` (23 types) and `context_float_provider` (28 types), each a plain number or an object whose `type` is required (vendored mcdoc `IntNumberProvider` `since 26.3`). Score and NBT providers: `context` and `fixed`, `context` and `storage`. Level-based values: `clamped`, `exponent`, `fraction`, `levels_squared`, `linear`, `lookup`. Enchantment providers: `by_cost`, `by_cost_with_difficulty`, `single`.

26.3 format facts the evaluator must read (vendored mcdoc `since 26.3`, confirmed by the server): a table, pool and entry take `modifier` (one function, a list, or a function id) and `condition` (one condition, a list, or a predicate id) where older packs had `functions` and `conditions`; a `tag` entry takes `items` (`#tag`), not `name`; a `loot_table` entry takes `value` (an id, an inline table or a list) and `expand`; `block_state_property` is gone (it is `match_block`); `time_check` needs `clock` (`minecraft:overworld`); `damage_source_properties` tag ids need `#`.

| Part | Checked on the real server (fixture case) | Not measured: about right if written from fields | Only in the game |
|---|---|---|---|
| Entries | `item`, `empty` (`empty_weight`), `tag` with and without `expand` (`tag_expand`, `tag_all`), `loot_table` (`nested`), `alternatives`, `group`, `sequence` | | `dynamic` (a block entity's contents), `slots` (a container's or entity's slots) |
| Pools | `rolls` (`rolls_uniform`), two pools and a pool `condition` (`two_pools`), table `modifier` (`table_modifier`) | `bonus_rolls`, `quality` (luck: `/loot` passes no luck, so the command cannot check them: `luck`, `luck.player2` show luck ignored) | |
| Conditions | `random_chance` (and inside `inverted`, `all_of`, `any_of`), `random_chance_with_enchanted_bonus` (`yellow_wool`, `looting`), `table_bonus` (`light_blue_wool`), `survives_explosion` (`gray_wool` exploded), `killed_by_player` (`looting`), `match_tool` with an enchantment through `minecraft:tool/can_silk_touch` (`lime_wool`); by `execute if predicate`: `weather_check`, `time_check`, `entity_properties` (type, crouching), `entity_scores`, `int_value_check`, `location_check` (position, biome), references by id | `match_block`, `float_value_check`, the rest of `match_tool`'s item predicate | `damage_source_properties` beyond the situation's damage type and tags, `enchantment_active_check` (only inside enchantment effects), `environment_attribute_check`, entity predicates on nearby entities, NBT, scores the situation does not hold |
| Functions | `set_count` (with `add`), `limit_count`, `apply_bonus` (all three formulas), `enchanted_count_increase` (with `limit`), `explosion_decay`, `set_damage`, `enchant_randomly`, `enchant_with_levels`, `sequence` (with function ids); by `item modify`: `set_name`, `set_lore`, `set_enchantments`, `furnace_smelt` (raw iron), `set_components` | `set_item`, `discard` (they change the item or the count: must be supported for the odds), `filtered`, `toggle_tooltips`, `set_custom_data`, `set_custom_model_data`, `set_attributes`, `set_banner_pattern`, `set_book_cover`, `set_fireworks`, `set_firework_explosion`, `set_instrument`, `set_potion`, `set_stew_effect`, `set_writable_book_pages`, `set_written_book_pages`, `set_ominous_bottle_amplifier`, `set_loot_table`, `set_contents`, `modify_contents`, `copy_state` | `copy_name`, `copy_components`, `copy_custom_data`, `fill_player_head` (need the killer or block entity), `exploration_map` (needs structures), `set_random_dyes`, `set_random_potion` (random over registries, not checked) |
| Numbers | int: plain, `uniform`, `binomial`, `weighted_list`, `number_dispatcher`; float: `uniform` | int and float arithmetic (`add`, `sub`, `mul`, `div`, `min`, `max`, `abs`, `negate`, `pow`, `mod`, `floor_div`, `floor_mod`, `avg`, `from_int`, `from_float`, `sqrt`, `sin`, `cos`, `ceil`, `floor`, `round`, `truncate`, `length`), `conditional`, `constant`, `enchantment_level`, level-based values other than `linear` | `score`, `storage`, `environment_attribute` |

Observed semantics B605 needs (all fit with 0 to 1.4 percentage points, see 2S2):

- A pool **expands its entries into candidates** (conditions tested then), **then picks one candidate by weight per roll**. `alternatives` keeps the first child that passes; `group` adds every child that passes (so `group` of a 50 % stone and dirt gave stone 24 %, dirt 76 %); `sequence` adds children until one fails (stone 25 %, dirt 25 %, nothing 50 %); a tag with `expand` gives one candidate per member, without it one candidate giving every member; a `loot_table` entry is one candidate that rolls the other table.
- Modifiers run entry first, then pool, then table (`table_modifier`: entry sets 3, table adds 1, always 4).
- `ore_drops`: count times (max(0, random(level + 2) - 1) + 1); `uniform_bonus_count`: count + random(level x bonusMultiplier + 1); `binomial_with_bonus_count`: count + binomial(level + extra, probability), also at level 0 (the extra trials happen without Fortune).
- `enchanted_count_increase`: count + round(level x the float provider), capped by `limit`; the level is the **attacker's** (the killer's weapon), not a tool's. `random_chance_with_enchanted_bonus` also reads the attacker: with `mine`, Fortune on the tool had no effect (10 % at every level).
- `table_bonus`: the chance at the tool's level, the last one beyond the list. `survives_explosion` and `explosion_decay`: each item kept with 1/power, **only when the explosion's cause decays drops**: a block explosion did (power 2: 49 %, power 4: 26 %); TNT did not (100 % kept: the game rule `tnt_explosion_drop_decay` is false by default; mob explosions follow their own rule, not measured). Without an explosion both pass.
- `set_damage` sets the fraction of durability **left** (0.5 gave damage 780 of 1,561). `enchant_randomly` without `options`: uniform over all enchantments (46: vanilla's 43 and the fixture's 3), then a uniform level. `enchant_with_levels` without `options`: all enchantments, treasure ones included; the modified level and the weighted picks of 2S11 reproduce it.
- A book becomes an enchanted book with stored enchantments.

## 2S2 Odds on the real server, and the time it takes

- Route: `loot insert <chest> ...` once per roll, the chest read and cleared; for predicates `execute store success storage ... if predicate` 10,000 times; for modifiers `item modify block <chest> container.0 <id>`. All from Java in a GameTest, through `Commands.performPrefixedCommand`.
- **Time per 10,000 rolls: 25 to 130 ms** for plain tables (28 ms with the command parsed once), 200 to 460 ms for `enchant_with_levels`; 10,000 predicate tests 190 to 350 ms; 2,000 explosions 1.1 to 3.0 s. The whole spike server run (95 roll cases, explosions, the rest) took about 25 s of server time; `runGameTest` with compilation 49 s on a warm Gradle. **B607's parity step should add under a minute per version to the `engine-mod` CI job.**

## 2S3 Bonus formulas, type by type

Every formula came out of the measured distributions (MSM's spike evaluator, 100,000 seeded rolls, against the game's 10,000; `results/compare-*.json`): `apply_bonus` `ore_drops` (Fortune 1 to 3), `uniform_bonus_count`, `binomial_with_bonus_count` (0 to 3), `table_bonus`, `random_chance_with_enchanted_bonus` (looting 0, 1, 3), `enchanted_count_increase` with and without `limit`, `explosion_decay` and `survives_explosion` (block cause; TNT none), `set_count` with `add`, `limit_count`, `enchant_with_levels` (book at 30, sword at 5 to 15: 15,179 and 840 combinations, each enchantment and level within 0.75 points), `enchant_randomly`. **None goes to "only in the game".** Luck (`quality`, `bonus_rolls`) cannot be checked through `/loot`, which passes no luck: about right.

## 2S4 The jar's data folders

`results/jar-data-folders.json` (every `data/minecraft/` folder with file counts and bytes, both jars) and `results/2s4-extract.json`:

- **Batch 2 needs these folders added to the extraction** (B603; the target's list, as worldgen's `dataFolders`): `advancement`, `loot_table`, `predicate`, `enchantment`, `enchantment_provider`, `damage_type`, `chat_type`, `dialog`, `trial_spawner`, `block_transformer`, `context_int_provider`, `context_float_provider` and the tag folders not yet kept: `tags/item`, `tags/entity_type`, `tags/fluid`, `tags/game_event`, `tags/damage_type`, `tags/enchantment`, `tags/painting_variant`, `tags/banner_pattern`, `tags/dialog`, `tags/instrument`, `tags/point_of_interest_type`, `tags/potion`, `tags/timeline` (`tags/block` and the worldgen tags are already kept). There is **no `tags/function` and no `item_modifier` folder in either jar.** 26.4 also has `block_sound_set` and `tags/block_sound_set` (batch 3).
- Added: **3,875 files, 2.6 MB** (26.3; 26.4: 3,965 files, 2.65 MB). Of it advancements 1,866 files and 1.31 MB (1,919 on 26.4), loot tables 1,447 and 1.06 MB, tags about 120 KB.
- **Extraction time: 179 to 237 ms median** (26.3; 152 to 203 ms on 26.4), the whole cache from 6.1 to 8.7 MB.
- Parsing every advancement takes 8 to 15 ms, every loot table 5 to 10 ms: **read in bulk by folder** (one IPC call per folder, cached in the renderer), not on demand.

## 2S5 Tags, observed

- Project files merge into vanilla's tag of the same id (`minecraft:logs` kept its 48 logs and gained stone); `replace: true` replaced it (`minecraft:wool` became stone only); the same for an enchantment tag (`minecraft:curse` gained the fixture curse).
- Tags naming tags resolve; duplicates are kept once (`dupes`).
- An optional entry (`required: false`) that is missing, item or tag, is skipped without a word.
- **A missing required entry drops the whole tag** with `Couldn't load tag <id> as it is missing following references: <id>`, and **a tag naming a dropped tag is dropped too** (`names_missing`). **A cycle drops every tag in it** (`cycle_a`, `cycle_b`, each reported as missing the other). Nothing else stops loading.
- Order across several packs (three or more) was not observed beyond vanilla plus one pack; MSM has one project pack over vanilla.

## 2S6 Speed in a worker (Node 24 `worker_threads`, median of 5)

| | 26.3 | 26.4 |
|---|---|---|
| 1,000 rolls, largest vanilla table (`chests/abandoned_camp_common_chest`, 15 KB) | 30 ms (worst 87) | about the same |
| 1,000 rolls, `chests/ancient_city` (enchantments) | 84 ms | |
| 1,000 rolls, `chests/end_city_treasure` (most `enchant_with_levels`) | **187 ms (worst 248)** | |
| Every item tag (236) resolved / the largest (339 members) | 0.9 ms / 0.05 ms | |
| Every block tag (300) / the largest (1,026 members) | 3 ms / 0.12 ms | |
| Largest advancement tab laid out (`adventure`, 47 nodes) | 0.1 to 0.7 ms | |
| Parsing all of the above from text | 28 ms | 32 ms |

The spike evaluator is unoptimised; B605's should be at least as fast. The odds of 1,000 rolls fit the 1 s budget with five times to spare, so steps of 100 or 250 rolls are enough.

## 2S7 Commands for functions in Try it

`results/2s7-commands.json`: the library's mirror (`examples/`), the fixtures and the built-in function templates hold **74 command lines** in 52 function files (2 macro lines: `$effect`, `$give`). Try it runs none of the game's own commands today.

- **With the plan's draft list: 55 of 74 lines (74 %)**. Not understood: `execute` subcommands (12: `in` with `spreadplayers` 8, `if predicate` 2, `store result score ... run data get entity`, `in ... run tp`), `scoreboard objectives add` and `setdisplay` (4), `tag` (2), `dialog show` (1).
- **With these additions: 66 lines (89 %)**: `execute if|unless predicate` (B604's evaluator), `execute store result|success score`, `execute in` and `positioned` (Try it has one dimension: another one is said), `return`, `scoreboard objectives add|remove|setdisplay` (display said), `tag`, `data get entity` (a short list of paths, `Health` first), `dialog show` (the dialog view of B611), and macro lines (`$(name)` filled from the call's arguments, which Try it's chat box already has). Left: `spreadplayers` (8, only in the game).
- 74 % is above D12's half, so **reserve B647 is not needed before B613**.

**Command list for B606:** `give`, `clear`, `setblock`, `fill` and `clone` inside the area, `summon` of project mobs, `kill`, `tp`/`teleport`, `effect`, `say`, `tellraw`, `title`, `playsound`, `particle`, `time`, `function`, `schedule`, `scoreboard players set|add|remove`, `scoreboard objectives add|remove|setdisplay`, `tag`, `return`, `data get entity` (named paths), `dialog show`, and `execute` with `as`, `at`, `positioned`, `in`, `if|unless block|score|predicate|entity`, `store result|success score` and `run`; macro lines. Everything else is said through `SimLog.onlyInMinecraft`.

## 2S8 The advancement screen and MSM's tidy tree

- **Where positions come from:** the server lays out every tab when advancements load (the positions were already set before `repositionNodes`). x is the depth among advancements that have a display: an advancement without a display is skipped and its children hang from the nearest shown ancestor (`under_nodisplay` at depth 2 under `c`). y: siblings at least 1 apart at every depth, a parent at the midpoint of its first and last child (`tab/root` at 3.25 between 1 and 5.5).
- **A tidy tree (Reingold-Tilford with contours, `spike-src/tree-layout.mjs`) given the game's sibling order reproduces the positions**: x 100 %; y on 26.3 `story` 16 of 16, `nether` 23 of 23, `end` 9 of 9, `husbandry` 31 of 31, `adventure` 43 of 47; on 26.4 the same except `adventure` 47 of 48 and `husbandry` 30 of 31 (the misses: the game spreads middle subtrees, which the spike does not); the fixture tab 15 of 15 on both.
- **The sibling order is the game's own, not the files'**: the same fixture files gave a different order on 26.3 and 26.4, and the client lays out again with its own order and only the advancements it has been sent. With MSM's order (by id) only 0 to 5 of a tab's y values match. **2L5 stands: same parents, children and depths; positions about right.**
- **Tabs:** every root with a display is a tab (`tab/root`); a root without a display (`plain/root`) is sent to the client but is no tab; a hidden root (`hidden_root/root`) is not sent until earned. The client gets an advancement when it is done or near a done one: after granting `tab/a2x` (hidden) only `tab/root`, `tab/a`, `tab/a2` and `tab/a2x` reached the client; after granting the whole tab, all of it. Hidden advancements appear only once done.
- **Frames and lines (one screenshot, not kept):** task, goal and challenge frames differ by outline; connectors are elbows (out of the parent, a vertical spine, into each child); one column is about 28 GUI pixels, one row about 26 (±1, measured from one 854 by 480 screenshot at scale 2); the tab background is the `background` texture tiled; `show_toast` toasts stack at the top right.

## 2S9 Dialogs (client GameTest, `results/client-*.json`, identical on both targets)

At 427 by 240 GUI pixels:

- **Title** centred at y 13 (9 high), with the "custom screen" info button (20 by 20) 10 pixels right of the title at y 7. **Footer** buttons at y 214 (the screen's height minus 26), 20 high.
- **Body:** a plain message 200 wide (its `width`) centred; an item body is the 16 by 16 item (with its count) and its description 200 wide 2 pixels to its right. The body starts at y 63, or at y 33 when the content is too tall, in a scrolling area that ends 33 pixels above the bottom.
- **Inputs**, 200 wide, 10 pixels apart: text (its label 13 pixels above a 20-high box), boolean (a 17-high checkbox with the label to the right), single option (a 20-high cycling button "Pick: Two"), number range (a 20-high slider "How many: 5").
- **notice:** one footer button 150 wide (a dialog without `action` gets the game's own label). **confirmation:** yes and no, 150 wide each, 8 apart, centred. **multi_action** with `columns: 2`: 150-wide cells 2 apart, rows 22 apart, a narrower button centred in its cell, a 300-wide button alone on its row; the exit button 200 wide in the footer. **dialog_list:** one 200-wide button per dialog (`button_width`) in one column, rows 22 apart, then the exit button. **server_links** with no links: empty, and no footer button without `exit_action`.

## 2S10 Death lines and chat decorations

- A damage type's `message_id` selects `death.attack.<message_id>` with the victim, `... (victim, killer)` with a killer, and `death.attack.<message_id>.item` (victim, killer, the item's name in square brackets) when the killer holds a named item. With no killer, a line whose text names a killer (`%2$s`) is shown unformatted, neither name filled in. `intentional_game_design` gives, through the combat tracker, `death.attack.<message_id>.message` with a bracketed link argument; `fall_variants` gave the plain line when the death had no fall recorded (the fall variants need a fall in the tracker: not observed). The victim's name carries a click (suggest `/tell`) and hover. Lines of the fixture's own message ids show their keys until a language file names them.
- A chat type decorates with its `translation_key` and its `parameters` in their order (`sender`, `target`, `content`), with its `style` on the whole line (the fixture's `shout`: red, bold, three arguments); the narration uses its own key and parameters.

## 2S11 Enchantments

- **Name:** the description, then for every level but a single-level enchantment's level 1 a space and `enchantment.level.<n>` (I to X); **levels 11 and up show the raw key** (the language file stops at 10). Curses (in `#minecraft:curse`) are red, the others grey.
- **Tooltip** of an enchanted sword: the name (aqua when enchanted, light purple with rarity epic), one line per enchantment, then a blank line and the main hand attribute lines. Enchantments outside vanilla's tooltip order came in a different order on the two runs.
- **Costs:** `getMinCost`/`getMaxCost` are base + per_level_above_first x (level - 1) (the fixture's 5..25, 13..33, ...).
- **The table** (`results/enchanting-*.json`; a fixed seed gave identical draws on both versions): the offered cost of each slot follows base = random(8) + 1 + shelves / 2 + random(shelves + 1) with shelves capped at 15, slot 1 max(base / 3, 1), slot 2 base x 2 / 3 + 1, slot 3 max(base, shelves x 2) (within 0.77 points); the enchantment chosen at a cost follows the modified level (cost + 1 + two random(enchantability / 4 + 1), then x (1 + (random + random - 1) x 0.15), rounded, at least 1), the highest level whose cost window holds it, weighted picks, and further picks while random(50) <= level with the level halved (within 1.33 points at every cost 1 to 40). So the level table can show which levels each cost offers, and the odds.
- **Effect components** (31) and effect types are the same on both targets (`registries.json`).

## 2S12 `trial_spawner` and `block_transformer`

Both registries exist on both targets (28 and 3 vanilla entries) with the same fields (`spike-src/tools/mcdoc.cjs` over the vendored mcdoc). Trial spawner: `spawn_range`, `total_mobs`, `total_mobs_added_per_player`, `simultaneous_mobs`, `simultaneous_mobs_added_per_player`, `ticks_between_spawn`, `spawn_potentials` (weighted entities), `loot_tables_to_eject` (weighted), `items_to_drop_when_ominous`. Block transformer: a **list** of `{block_state_provider, sound?, particle?, disallowed_faces?, loot?, drop_strategy?, transform_type?, update_from_neighbors?, consume_on_use?, item_damage_per_use?}`. The fixture's of each loaded. A block state in a provider is `{id, properties}`; the old `simple_state_provider` with `{Name}` failed the whole server start ("List is too short: 0").

## 2S13 Size

- **B602 is done** ([ADR 0123](../../../adr/0123-gzipped-vendored-target-data.md)): vendored data gzipped, the renderer budget already at 19 MB (stop line 18.5). Not repeated.
- Re-measured at 5d06bc5 (`results/check-size.txt`): **renderer 17.6 MB of 19.0**, 0.9 MB under the stop line; vendored data 607.6 kB gzipped. `app.asar` was not rebuilt (it needs `dist:dir`); ADR 0123's 26.0 of 32 MB stands.
- **No 1 MB saving is needed**: batch 2's draft 0.4 MB fits under the stop line. Where it would come from if needed: the TypeScript worker (6.6 MB), the main chunk (2.8 MB) and Monaco's editor API (2.6 MB) are the large files; none was trimmed.
- A first view's chunk: the spike evaluator minifies to 8.3 kB (3.1 kB gzipped), the tree layout to 0.8 kB. Views in lazy chunks of tens of kilobytes each are realistic.

## 2S14 Today's previews over a bundle

None imports the session store; they read through props and the blocks and items Studio host context (`BlocksItemsStudioHost`).

| Preview | Needs | To mount over a bundle |
|---|---|---|
| `preview/geo/GeoCanvas` | a resolved `GeoScene` and `ResourceFolders` | as is: `CreatorPreview` already does it |
| `studios/entities/vehicle/VehiclePreview` | `project`, `elementId`, `data`, the host's `modelPreview` | as is over `bundlePreviewProject`, with a host whose readers read the bundle |
| `studios/blocks-items/ParticlePreview` | `data`, `target`, the host's `modelPreview` | as is, with such a host |
| Fluid picture | inside `FluidStudio.tsx` (`usePicture` from the host's `thumbnail` and vanilla reader) | extract the picture into its own component |
| Effect icon, potion bottles | inside `EffectStudio.tsx`, `PotionStudio.tsx` | extract into components |
| `tryit/traders/MerchantScreen` | an `OpenMerchant` from `@msm/sim` and callbacks | a wrapper that builds the trader state from the bundle's lowered files without the Try it world |

So B615 needs one bundle-backed `BlocksItemsStudioHost` (thumbnails and readers over `bundleAssetReader`) and three small extractions.

## 2S15 Item slots with tooltips

- `components/recipe-grid/RecipeGridView.tsx`'s `Slot`: a 48-pixel square with the icon from the host's `icon(id)` (a `data:` URL) or the id as text, and the name as a plain `title`. Reusable for the look; it has no count and no tooltip.
- Try it's hotbar (`tryit/hotbar.ts`): finds a thing's picture in the lowered files (`TryItThing.texture`); reusable for project items' pictures.
- The Creator's item icons (`CreatorPreview` with the vanilla reader) give vanilla pictures.
- Missing, for B608's `ItemSlot.tsx` and `Tooltip.tsx`: the count, and the tooltip lines of 2S11 (name colour by rarity and enchantment, enchantment lines with level names, curses red, lore in dark purple italic, a custom name in italic, the attribute block named, not computed).

## Format findings for B607's fixture and the validators

- A **predicate or item modifier file must be one JSON object**: a file that is a list or a bare id stopped the server from starting ("Not a JSON object"), although the vendored mcdoc allows both at the top level (`ItemModifier`, `PredicateRef`). Inside a table, `sequence` or `all_of`, lists and ids work.
- Any registry file that fails to parse stops the GameTest server and the dedicated server.
- `time_check` needs `clock`; `damage_source_properties` tag ids need `#`; a block transformer's states are `{id, properties}`.

## The game's answers when the situation lacks something (for D4)

By `execute if predicate` from the console and from a player: `match_tool` (no tool), `killed_by_player`, `damage_source_properties`, `enchantment_active_check` answered **no**; `survives_explosion` and `table_bonus` (level 0) answered **yes**; `entity_properties` and `entity_scores` with no entity answered no; an unknown predicate id failed the command. Weather turned to rain over ticks (no straight after `weather rain`, yes 150 ticks later). The game never says "unknown": MSM's third answer is MSM's honesty about the situation, not the game's behaviour.

## Go or no-go, by ADR 0120 decision

| Decision | Verdict | Why |
|---|---|---|
| D2 one route, views as functions of files | go | No preview needs the session store (2S14) |
| D3 Roll it in `@msm/sim`, odds checked, rolls MSM's own | **go** | Every measured type within 1.43 points of 10,000 game rolls on both targets (2S1–2S3) |
| D4 situation, three answers | go | The game answers no or yes for what is missing; unknown is MSM's honest answer |
| D5 tags resolved once | go | Rules observed (2S5); every vanilla tag resolves in 3 ms |
| D6 MSM's own drawings | go | Tree about right (order is the game's), dialog proportions measured (2S8, 2S9) |
| D7 the Creator and the AI helper | go | With one bundle host and three extractions (2S14) |
| D8 functions in Try it | **go** | 74 % with the draft list, 89 % with the additions; B647 not needed first |
| D9 fixture and parity | go | 10,000 rolls cost 25 to 460 ms a case; under a minute a version in CI |
| D10 size | done by ADR 0123 | Renderer 17.6 of 19 MB; no budget change |
| D11 vanilla data from the jar | go | +3,875 files, +2.6 MB, +58 ms extraction |
| D12 budgets and no-go routes | go | 1,000 rolls 30 to 190 ms in a worker; no no-go route triggered |

**Tolerance for 2L1:** 2 percentage points per outcome (an item and its count, or yes and no) between 10,000 game rolls and MSM's odds from at least 100,000 seeded rolls (or exact). The correct models measured here stayed within 1.43 points over about 600 cells per target (about 2.9 standard deviations at p = 0.5); 2 points is about 4. Explosion cases, with 2,000 rolls, need 3 points.
