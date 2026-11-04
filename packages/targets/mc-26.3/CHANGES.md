# Target mc-26.3 — changes and facts

Minecraft Java 26.3, released 2026-09-15 (`data_version` 5023, protocol 777).

## Verified facts

Checked on 2026-11-04.

| Fact | Value | Source |
|---|---|---|
| `mcVersion` | `26.3` | misode/mcmeta tag `26.3-summary`, `version.json` |
| Data pack format | `121.0` (`data_pack_version` 121, `data_pack_version_minor` 0) | mcmeta `version.json`; minecraft.wiki Pack format table |
| Resource pack format | `97.1` (`resource_pack_version` 97, `resource_pack_version_minor` 1) | mcmeta `version.json`; minecraft.wiki Pack format table |
| Java | 25 | DESIGN §9 |
| vanilla-mcdoc ref | commit `0ca060a4f1631f9d5eb7198cfe94c7b77a773d32` (vanilla-mcdoc has no tags; pins are commit shas) | `git ls-remote https://github.com/SpyglassMC/vanilla-mcdoc`; `vendor/vanilla-mcdoc/SOURCE.json` |
| mcmeta ref | prefix `26.3`; tags `26.3-summary` and `26.3-registries` | `git ls-remote --tags https://github.com/misode/mcmeta`; `vendor/mcmeta/SOURCE.json` |
| Resource folder names (`folders.resource`) | `model` → `models`, `block_definition` → `blockstates`, `item_definition` → `items`, `lang` → `lang`, `sounds_file` → `sounds.json`, `textures` → `textures`, `atlases` → `atlases`, `font` → `font` | `@spyglassmc/java-edition` 0.3.70 uri binder (`lib/binder/index.js`, the resource-pack `resource(...)` table that maps folders to the vanilla-mcdoc `minecraft:resource` categories; `sounds` is the file `sounds.json` directly under `assets/<namespace>/`), checked 2026-11-04 |
| Data folder names (`folders.data`) | every key maps to the folder of the same name: `recipe`, `loot_table`, `advancement`, `predicate`, `item_modifier`, `function`, `tags`, `enchantment`, `damage_type`, `dimension_type`, `chat_type`, `jukebox_song`, `banner_pattern`, `painting_variant`, `trim_material`, `trim_pattern`, `dialog` (singular since 1.21; `tags` is the parent of `tags/<registry>`, for example `tags/item`, `tags/block`, `tags/damage_type`) | `@spyglassmc/java-edition` 0.3.70 uri binder (`lib/binder/index.js`, the data-pack `resource(...)` table: `advancement`, `function`, `item_modifier`, `loot_table`, `predicate`, `recipe` and `tags/<block,entity_type,fluid,function,game_event,item>` `since: '1.21'`; `enchantment` and `jukebox_song` and `painting_variant` `since: '1.21'`; `banner_pattern` `since: '1.20.5'`; `chat_type` `since: '1.19'`; `damage_type`, `trim_material`, `trim_pattern` `since: '1.19.4'`; `dialog` `since: '1.21.6'`; `dimension_type` `since: '1.16'`; other taggable registries as `tags/<registry>` `since: '1.18'`; none has an `until` at or before 26.3), checked 2026-11-04 |
| Data folder names, Phase 3 (`folders.data.structure`, `dimension`, `worldgen`) | `structure` → `structure` (`.nbt` files), `dimension` → `dimension`, `worldgen` → `worldgen` (the parent of `worldgen/<registry>`, for example `worldgen/biome`, `worldgen/feature`, `worldgen/template_pool`) | `@spyglassmc/java-edition` 0.3.70 uri binder (`lib/binder/index.js`): `resource('structure', { since: '1.21', ext: '.nbt' })` (`resource('structures', { category: 'structure', until: '1.21', ext: '.nbt' })` before); `resource('dimension', { since: '1.16' })`; `resource('worldgen/biome', { since: '1.16.2' })`, `resource('worldgen/feature', { since: '26.3' })` (replacing `resource('worldgen/configured_feature', { since: '1.16.2', until: '26.3' })`), `resource('worldgen/carver', { since: '26.3' })` (replacing `worldgen/configured_carver`, `until: '26.3'`), `resource('worldgen/block_state_provider', { since: '26.3' })`, `resource('worldgen/material_condition', { since: '26.3' })`, `resource('worldgen/material_rule', { since: '26.3' })`, and `worldgen/placed_feature`, `structure`, `structure_set`, `template_pool`, `processor_list`, `noise_settings`, `density_function`, `noise`, `world_preset`, `flat_level_generator_preset`, `multi_noise_biome_source_parameter_list` with no `until`; checked 2026-11-04 |
| `dataVersion` | `5023` | mcmeta `version.json` (`data_version`), tag `26.3-summary`; asserted by `test/target.test.ts`; checked 2026-11-04 |
| `worldgen.featureSteps` | `raw_generation`, `lakes`, `local_modifications`, `underground_structures`, `surface_structures`, `strongholds`, `underground_ores`, `underground_decoration`, `fluid_springs`, `vegetal_decoration`, `top_layer_modification` (11, in game order) | vendored vanilla-mcdoc `::java::data::worldgen::DecorationStep` enum (values in declaration order, which follows the game's decoration step enum); asserted by `test/target.test.ts`; checked 2026-11-04 |
| `worldgen.biomeAttributes` | colours `minecraft:visual/sky_color`, `minecraft:visual/fog_color`, `minecraft:visual/water_fog_color` (sky first is `skyColour`); `naturalMobSpawns` `minecraft:gameplay/natural_mob_spawns`. The biome `effects.sky_color`, `fog_color` and `water_fog_color` fields are `until 1.21.11`; spawns moved from `spawners`/`spawn_costs` into the attribute in 26.3 | vendored vanilla-mcdoc: `minecraft:environment_attribute` dispatcher (colour members are `RGBColorAttribute`; `gameplay/natural_mob_spawns` is `MergeableAttribute<NaturalMobSpawns>`, `since 26.3`), `::java::data::worldgen::biome::BiomeEffects` field gates; mcmeta `registries.json` `environment_attribute`; asserted by `test/target.test.ts`; checked 2026-11-04 |
| Fabric Loader, Fabric API, Loom | not set (Phase 4) | (verify at implementation) |
| GeckoLib | not set (Phase 5) | (verify at implementation) |

## Vendored data

- `vendor/vanilla-mcdoc/symbols.json`: Spyglass symbol export, regenerated by `tools/sync-mcdoc`.
- `vendor/mcmeta/version.json` and `vendor/mcmeta/registries.json`: regenerated by `tools/sync-mcmeta`. Registry ids are stored without the `minecraft:` namespace.

## What changed from 26.2

- Pack formats: (verify at implementation)
- Data-driven registries and JSON formats: (verify at implementation)
- Model and asset formats: (verify at implementation)
- Fabric toolchain: (verify at implementation)
