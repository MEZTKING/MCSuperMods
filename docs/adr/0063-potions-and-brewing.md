# ADR 0063: Potions and brewing

## Context

A project can make a custom status effect ([ADR 0055](0055-custom-status-effects.md)) but cannot brew it: there is no way to add a potion to the game, so the effect reaches players only through a consumable, a trigger or a script (coverage audit backlog B10). Facts read on 2026-11-14 (the working plan with the full fact table is deleted at close and its findings live in this ADR; sources: `javap` over the Loom-cached merged jars for 26.3 and 26.4-snapshot-7, data files in those jars, the pinned Fabric API module jars, the vendored mcdoc, this repository):

- Brewing is data driven on both versions. There is no `PotionBrewing` class. `data/minecraft/recipe/brewing/` holds 279 recipes on 26.3 (108 `potion_*`, 108 `splash_potion_*`, 63 `lingering_potion_*`) and 292 on 26.4, of type `minecraft:brewing`: `{ input: { item, potion_contents?: { potions } }, reagent: { item }, output: { id, components } }`. The splash (gunpowder) and lingering (dragon breath) conversions and the redstone and glowstone upgrades are one recipe per potion and per bottle, not generic.
- Fabric API has no brewing registry builder on either version (only a datagen provider and an item-api mixin). Nothing is called; recipes are files.
- `potion` is a code registry (`BuiltInRegistries.POTION`; 46 entries on 26.3, 48 on 26.4; no `data/minecraft/potion/`). `Potion(String name, MobEffectInstance...)`; long and strong variants are separate entries sharing the name. Five potion tags exist.
- The item name is `<item description id>.effect.<Potion.name()>`, so one name serves `item.minecraft.{potion,splash_potion,lingering_potion,tipped_arrow}.effect.<name>`. The colour comes from the effects.
- Tipped arrows are one generic recipe (`minecraft:crafting_imbue`: a lingering potion and eight arrows). Any lingering potion works, a registered project potion included.
- Creative tabs list potions by walking the registry, so registered potions appear as potion, splash, lingering and tipped arrow without code (the in-game look is a user check).
- `brewing` and `crafting_imbue` are in the vendored `recipe_serializer` registry and in vanilla-mcdoc's recipe dispatcher on both targets, so the existing `minecraft:recipe` kind already validates them. The Recipe Studio has no brewing layout.
- Whether a recipe naming an unregistered potion is skipped or stops the data pack load: (verify at implementation).

## Decision

- **D1 Kind `msm:potion`** (default, vetoable name) in `@msm/plugin-blocks-items` (no new plugin), folder `potion`, `registry: 'potion'`. We chose a registry entry over the data-only `custom_effects` route because it gives the creative tabs, `/give`, tipped arrows, loot `set_potion`, potion tags and clean chained brewing for free.
- **D2 Runtime definition**, one file per registry entry, `msm/<ns>/potion/<path>.json` (`::msm::definition::Potion`): `{ format: 1, name?: string, effects: [{ id: #[id="mob_effect"] string, duration_ticks: int @ 1.., amplifier?: int @ 0..255, ambient?: boolean, show_particles?: boolean, show_icon?: boolean }] @ 1..8 }`. `name` defaults to `<ns>.<path>` (dots keep two mods apart).
- **D3 Element (editor) fields, stripped in lowering:** `display_name`; `brewing?: { base?: potion id (default `minecraft:awkward`, default, vetoable), reagent: item id or tag }`; `long?: { duration_ticks, reagent? (default `minecraft:redstone`, default, vetoable) }`; `strong?: { amplifier, duration_ticks, reagent? (default `minecraft:glowstone_dust`, default, vetoable) }`; `splash?` and `lingering?: boolean` (default true). Lowering writes up to three definitions (`<path>`, `long_<path>`, `strong_<path>`, the variant ids are default, vetoable; all share `name`), the brewing recipes in vanilla's shape under `data/<ns>/recipe/brewing/` (base, long and strong for each bottle kind; gunpowder and dragon breath per entry; at most 15 files), and four `en_us` keys ("Potion of X", "Splash Potion of X", "Lingering Potion of X", "Arrow of X"). Tipped arrows need no file.
- **D4 Runtime.** `DefinitionScanner.KINDS` gains `potion`; `MsmRegistrar` registers potions after effects and before blocks and items, so an item's `minecraft:potion_contents` passthrough may name a project potion without `DELAYED`. An unknown effect id is an error and that potion is skipped. `LoadReport` and the start-up line count potions. The registry freezes as for effects.
- **D5 Getting the potion** is vanilla: brewing stand, creative tabs, `/give`, loot. No custom bottle item, no instant effects, no custom colour (the colour is the effects').
- **D6 Vanilla packs.** The definition is in the `msm` layer (`export.layer-skipped`); the recipes are data and name an unregistered potion there. The app warns (`blocks-items.potion-needs-jar`, on vanilla pack export only, wording as [ADR 0050](0050-passthrough-data-pack-check.md)). Lowering a potion of vanilla effects to `custom_effects` for vanilla packs is deferred.
- **D7 Plugin API 1.9.0 (additive):** `JavaProjectInput.potions?: DefinitionInput[]` ("Since 1.9.0"); the `java-project` exporter routes `msm/<ns>/potion/`. Shared with [ADR 0064](0064-data-kinds-sweep.md) D5.
- **D8 Java eject (26.3 generator):** `ModPotions.java`, called after `ModEffects`; recipes and lang are files already.
- **D9 App.** A Potion Studio (effects list, variants, the brewing chain shown as steps, names preview). Project potions, with the `long_` and `strong_` ids, count as `potion` ids in completion and validation. The Effect Studio gains "Make a potion", which adds an `msm:potion` for that effect in one undoable change.
- **D10 Creator.** Flow "Potion" (default, vetoable name; group "Magic"): name, effect (own or vanilla), time, level, ingredient, longer and stronger versions, splash and lingering. The Status effect flow's "how players get it" gains "A brewed potion". Two templates, two examples.
- **D11 Versions.** Shared runtime code; no seam is expected (the facts above are identical on 26.4). Eject is 26.3 only, as today.
- **D12 Deferred:** brewing items that are not potions, brewing stand fuel (the `BrewingFuel` component), a Recipe Studio brewing layout, a check against vanilla ingredient pairs (needs recipe facts in the target), other mods' effects registered after ours.

## Consequences

- Format 1 grows additively by one definition kind; the corpus (prefix `potion-`), the Codecs and the eject generator move together.
- Plugin API goes from 1.8.0 to 1.9.0, additive.
- Potions need the Fabric mod export; vanilla pack export warns and carries the (dangling) recipes only.
- The guide documents the variant ids, the reagent defaults and that colour follows the effects.

## Status

Proposed (2026-11-14). Defaults the user may veto: the kind name `msm:potion`; variant ids `long_<id>` and `strong_<id>`; the default reagents and base; the flow name "Potion".

Open findings to record before acceptance: registration order and the unregistered-potion behaviour (runtime GameTests), and any version seam.
