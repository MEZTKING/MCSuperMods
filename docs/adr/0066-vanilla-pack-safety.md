# ADR 0066: Vanilla pack safety

## Context

A project can mix vanilla data (recipes, loot tables, advancements, tags, functions) with content only the Fabric mod jar registers: `msm:block` (and its block item), `msm:item`, `msm:effect`, `msm:potion` (and its `long_` and `strong_` versions), `msm:entity` (and its spawn egg). The vanilla data pack and the combined export (both packs) package the data layer without the mod, so its files can name ids the game does not know. [ADR 0063](0063-potions-and-brewing.md) D6 and finding P8 met this for brewing recipes and left potions out of vanilla packs; the question here is the general rule.

Finding (2026-11-14; real vanilla dedicated servers on both targets, 26.3 and 26.4-snapshot-7, one pack per case, server logs read):

| Where the unknown id or `#tag` is | Outcome on a vanilla server |
|---|---|
| `recipe` (result, ingredient, `#tag` ingredient, brewing) | Whole pack fails: the server refuses to start ("Failed to load datapacks, can't proceed"); a later `/reload` is rejected entirely |
| `loot_table` (item entry, `set_potion`, `set_enchantments`, nested `loot_table` reference) | Whole pack fails |
| `advancement` (icon, trigger conditions, `rewards.loot`) | Whole pack fails |
| `predicate`, `item_modifier` | Whole pack fails |
| `villager_trade`; `trade_set` (by inference, not run) | Whole pack fails |
| `enchantment` (effects, `supported_items` tag) | Whole pack fails |
| `jukebox_song` (`sound_event`) | Whole pack fails |
| `enchantment_provider` (unknown enchantment) | Whole pack fails ("Unbound values in registry ... enchantment") |
| `dialog` (`item` body) | Whole pack fails |
| `worldgen/feature` (ore `targets` state, `block_match` rule block, `simple_block`), `worldgen/placed_feature` (inline feature) | Whole pack fails |
| `worldgen/noise_settings` (`default_block`) | Whole pack fails on 26.3; on 26.4-snapshot-7 the field no longer exists and is ignored (its inline `material_rule` blocks still fail, as below) |
| `worldgen/processor_list` (`rule` `output_state`), `worldgen/template_pool` (feature element), `worldgen/block_state_provider`, `worldgen/material_rule` (`block`), `worldgen/flat_level_generator_preset` (layer block, `display` item), `worldgen/world_preset` (flat layer) | Whole pack fails |
| `worldgen/structure` (`spawn_overrides` entity) | Whole pack fails |
| `dimension` (flat generator layer block) | Whole pack fails |
| A worldgen or dimension file naming a missing worldgen file (placed feature to feature, biome to placed feature, template pool to processor list, dimension to noise settings) | Whole pack fails ("Unbound values in registry" or "Failed to get element") |
| `worldgen/biome` (`natural_mob_spawns` entity) | Loads: one ERROR line ("Spawn data: Unknown registry key ... entity_type"), that spawn entry is dropped |
| `instrument` (`sound_event`) | Whole pack fails; a sound event, so outside the mod-only ids (see below) |
| `trial_spawner` (`spawn_potentials` entity, `loot_tables_to_eject` missing table) | Loads silently |
| Structure template (`structure/*.nbt`, palette block) | Loads; the unknown block places as air |
| Tag, plain entry | That tag is dropped with an ERROR line; every recipe or enchantment using the tag then fails the whole pack |
| Tag, `{ "id": ..., "required": false }` entry | Loads cleanly |
| Function | Only that function is dropped (ERROR line); a function calling it, also through `schedule`, loads |
| Function tag, plain entry naming a dropped function | That tag is dropped with an ERROR line, with every pack's entries merged into it (`#minecraft:tick` stops running everything) |
| Function tag, `{ "id": ..., "required": false }` entry naming a dropped function | Loads; only the function is dropped |
| Advancement `rewards.recipes`, `rewards.function` | Load silently |

The rows from `enchantment_provider` to the structure template were verified 2026-11-14 on both targets (26.3 and 26.4-snapshot-7; the configured feature folder is `worldgen/feature` on both). The function tag rows were verified 2026-11-14 on 26.3. Not probed, as no field can name a mod-only id: `damage_type`, `dimension_type`, `chat_type`, `banner_pattern`, `trim_material` (no ingredient field), `painting_variant` and the mob variant registries (texture asset ids; `spawn_conditions` biomes are vanilla), `timeline`, `world_clock`, `worldgen/density_function`.

So today any project with a block (its loot table names the block item) exports a vanilla data pack a server will not load. Sound events are outside this rule: a project sound in a vanilla field is already an error through the `sound_id` rule ([ADR 0057](0057-project-sound-events-and-mob-sounds.md) D3), and a `jukebox_song` naming a bare project key is already an error.

## Decision

- **D1 Scope.** Applies to the app session's vanilla data pack export (zip and world install) and to the data half of the combined export. Not to the Fabric mod jar, the Java eject, the resource pack or plugin exporters. The rule is pure and lives in `@msm/exporters` (`vanilla-packs/mod-only.ts`: `vanillaSafeDataFiles`, `vanillaSafeExporter`, `modOnlyIdsOf`; codes in `ExportProblemCodes`); the host computes the mod-only ids, since only it knows which kinds register what, and wraps the `vanilla-packs-data` exporter: the app session from its registry view (`dataRegistryIds`), the library test likewise for the vanilla server check. The plugin API is unchanged.
- **D2 Mod-only ids.** The ids of the runtime registries `block`, `item`, `mob_effect`, `potion`, `entity_type` that the project registers (block items, spawn eggs and potion versions included), taken from the whole project before ADR 0063's potion filter. A project tag is mod-only when it has at least one entry and every entry is a mod-only id or a mod-only tag of its registry; a `minecraft` tag is mod-only only with `replace: true`. Files left out under D3 add their ids to their registry, and the rule is applied until nothing changes (a loot table naming a left-out loot table is left out too).
- **D3 Fatal folders: leave out and warn.** A data layer file in `recipe`, `loot_table`, `advancement`, `predicate`, `item_modifier`, `villager_trade`, `trade_set`, `enchantment`, `jukebox_song`, `enchantment_provider`, `dialog`, `worldgen` (every registry below it) or `dimension` (folder names from the target) that names a mod-only id or `#tag` is left out of the vanilla data pack. A worldgen file's registry is `worldgen/<registry>` and its id the path below that, so a placed feature naming a left-out feature, a biome naming a left-out placed feature or a dimension naming a left-out biome is left out too, and a worldgen tag entry naming a left-out file becomes optional (D4). One exception: a `worldgen/biome` file is not left out for an `entity_type` id (its spawners), which the game only drops with an ERROR line. One warning per element, code `export.mod-only-reference`, naming the element, its first left-out file and that file's first offending id: "Left out of the vanilla data pack: `<file>` (and N other files) names `<id>`, which only the Fabric mod jar provides. A vanilla server would refuse the whole data pack; export the Fabric mod jar to use it."
- **D4 Tags: make optional.** In the vanilla data pack a tag entry that names a mod-only id (of the tag's registry) or a mod-only tag becomes `{ "id": ..., "required": false }`, and so does a function tag entry naming a function D5 warns about (the game drops that function, and a plain entry would drop the whole merged tag); other entries are kept as written. No warning.
- **D5 Functions: keep and warn.** A function naming a mod-only id or `#tag` is kept; one warning per element, code `export.mod-only-function`: "`<file>` (and N other files) names `<id>`, which only the Fabric mod jar provides. A vanilla server skips this function; export the Fabric mod jar to use it."
- **D6 The scan.** JSON values and object keys are walked for whole strings equal to a mod-only id or `#tag`. To avoid false positives on the project's own data: keys `recipes`, `recipe`, `recipe_id` and `function` (string or list values) are not scanned; `loot`, `loot_table`, the `value`/`name` of a `loot_table` entry, the `name` of a `reference` condition or function, and `trades` are matched only against left-out files of their registry; the `name` of a `tag` loot entry is matched as a tag. Functions are scanned token by token (comment lines and the id after the `function` command word are skipped).
- **D7 Unchanged output.** A project without mod-only ids gets the exporter itself, and files are only copied when something is left out or rewritten, so its vanilla packs are byte-identical to before.

- **D8 Checked on vanilla servers.** CI's library check (`packages/exporters/test/library.test.ts` with `MSM_LIBRARY_PACKS_OUT`, then `tools/run-fabric-server/vanilla-packs.ts`) exports the data pack of every library starter, example and `examples/` mirror project, those with `msm:` kinds included (without potions, through this rule), and loads them all on a vanilla server of each target; the functions D5 warns about are the only `Failed to load function` lines it accepts. First run 2026-11-14: 179 packs on 26.3 (51 with mod content, 165 files left out) and 162 on 26.4-snapshot-7 (34 with mod content, 121 files left out; the mirror projects with `msm:` kinds are written for 26.3), no function warned about, all loaded.

## Consequences

- A vanilla data pack from a mixed project always loads; what needs the mod is in the jar and named in the warnings. A block's loot table, a recipe for a modded item and a recipe tag of modded items are typical cases.
- ADR 0063 D6 keeps leaving potions out entirely (their brewing recipes would be left out by this rule anyway); `blocks-items.potion-needs-jar` stays.
- The scan is generic but not a schema walk: a string equal to a mod-only id in free text (a custom name) would be counted. The cost of a false positive is one file left out with a warning; the cost of a miss is a pack that does not load.
- Worldgen and dimensions are in the list (verified 2026-11-14): a modded ore feature is left out of the vanilla data pack, and so is everything that names it down to the biome and dimension. A structure template (`.nbt`) naming a modded block is not scanned: the game loads it and places air. `instrument` fails on an unknown sound event, which project sounds already cover ([ADR 0057](0057-project-sound-events-and-mob-sounds.md) D3); `trial_spawner` loads with unknown entities and loot tables, so neither is in the list.
- A worldgen file is scanned generically too, so a project worldgen id equal to a mod-only id (a biome `demo:frost` next to an effect `demo:frost`) leaves out the files that name it.

## Status

Proposed (2026-11-14).
