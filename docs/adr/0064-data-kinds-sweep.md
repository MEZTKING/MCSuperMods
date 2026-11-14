# ADR 0064: Data kinds sweep

## Context

Several vanilla data folders have no MSM kind, so a project cannot add a wolf skin, a goat horn, a trial spawner or an icon font without leaving the editor (coverage audit backlog B11). Facts read on 2026-11-14 (the working plan is deleted at close and its findings live in this ADR; sources: data files in the Loom-cached 26.3 and 26.4 jars, the vendored mcdoc, this repository):

- Vanilla-mcdoc on both targets has `minecraft:resource` schemas for every kind below: the seven mob variants (`wolf`, `cat`, `pig`, `cow`, `chicken`, `frog`, `zombie_nautilus`), five sound variants (`wolf`, `cat`, `pig`, `cow`, `chicken`), `instrument`, `enchantment_provider`, `trial_spawner`, `timeline`, `world_clock`, `atlas` and `font`.
- Each has its data folder in both jars with the same name as the registry, and the sampled files are byte-identical between 26.3 and 26.4. Timelines exist in 26.3 (four timelines, two clocks, four timeline tags).
- Shapes: a wolf variant is `{ assets: { wild, tame, angry }, baby_assets: {...}, spawn_conditions }`; cat, cow, pig and chicken variants are `{ asset_id, baby_asset_id, model?, spawn_conditions }`; frog and zombie nautilus are `{ asset_id, model?, spawn_conditions }`; `spawn_conditions` is `[{ priority, condition?: { type: "minecraft:biome", biomes } }]`. Sound variants and `instrument.sound_event` name sound events by string in vanilla files; whether their codec also takes the inline `{ sound_id }` form: (verify at implementation, `javap -c` of the codecs).
- Tag registries with vanilla tags but no MSM tag kind: `banner_pattern`, `dialog`, `instrument`, `point_of_interest_type`, `potion`, `timeline`, `worldgen/feature`, `worldgen/flat_level_generator_preset` (eight; `villager_trade` was added by [ADR 0060](0060-adding-to-vanilla-content.md)). 26.4 adds `block_sound_set`, absent on 26.3.
- The targets already name the resource folders `atlases` and `font` with no kind. `sulfur_cube_archetype` differs between versions (12 and 13 entries); `slot_source` has a schema but no registry on either.

## Decision

- **D1 Generic kinds** (`GENERIC_DATA_REGISTRIES`, schema `resource:<name>`, one default each): the seven mob variants and five sound variants, `instrument`, `enchantment_provider`, `trial_spawner`, `timeline`, `world_clock`. Sixteen kinds, files only, valid in vanilla packs.
- **D2 Resource pack:** kinds `minecraft:atlas` and `minecraft:font` in `@msm/plugin-resourcepack`; one template "Icon font" (a bitmap provider over a project texture).
- **D3 Tags:** the eight registries above join `TAG_REGISTRIES`.
- **D4 Not worth it now** (stated so nobody expects them): `sulfur_cube_archetype` (differs per version), `test_environment`, `test_instance`, `block_transformer`, the two context providers, `slot_source`, the 26.4-only `block_sound_set` and its tag (wait for the 26.4 re-pin), shaders, post effects, waypoint styles, particle definitions (audit B14).
- **D5 Plugin API 1.9.0 (additive):** `DataFolderKey` gains the sixteen keys; both targets gain the folders. `ResourceFolderKey` is unchanged. Shared with [ADR 0063](0063-potions-and-brewing.md) D7.
- **D6 Creator flows, data only.** "Mob skin" (default, vetoable name; group "Mobs"): animal (wolf, cat, pig, cow, chicken, frog), textures (tinted placeholders of the right size; Picture to texture as elsewhere; never a Mojang file), where it appears (chosen biomes with a higher priority, or everywhere mixed in). "Goat horn" (default, vetoable name; group "Gear"): sound (a project sound as `{ sound_id }`, subject to the codec finding above), length, range, a recipe whose result is `minecraft:goat_horn` with the `minecraft:instrument` component, optionally the `regular_goat_horns` tag so goats drop it.
- **D7 Templates:** one each for wolf variant, cat variant, instrument, trial spawner, and two brewing recipes (the existing `minecraft:recipe` kind validates them); none for the rest (asar budget).
- **D8 No runtime and no eject change.** Putting `minecraft:instrument` in `ComponentPassthrough.DELAYED` is deferred: the recipe route needs no code. The proof that the files load is the headless vanilla data pack check.

## Consequences

- The kind list grows from 52-plus to 16 more generic kinds, two resource kinds and eight tag kinds; the asar budget is watched (`node tools/check-size/index.ts`).
- A kind whose vanilla files fail validation against the schema is dropped and reported, not relaxed.
- Plugin API 1.9.0 is additive and shared with the potions ADR.
- Mob skins and goat horns work in vanilla packs; no jar is needed.

## Status

Proposed (2026-11-14). Defaults the user may veto: the flow names "Mob skin" and "Goat horn"; the choice of which registries are in and out (D1, D4).

Open finding to record before acceptance: the sound-variant and instrument codec forms.
