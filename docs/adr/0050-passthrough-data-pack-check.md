# ADR 0050: Edit-time check for passthrough components that need data packs, vanilla tool numbers, body armour defence

## Context

`msm:components` (ADR 0044 D1) passes vanilla item data components through. The runtime decodes them while mods initialise, before data packs load, so a value that names an element or tag of a data pack registry (an enchantment, a mob variant, a banner pattern) cannot be decoded then. Six components are decoded late (`ComponentPassthrough.DELAYED`: `jukebox_playable`, `provides_trim_material`, `trim`, `damage_resistant`, `blocks_attacks`, `damage_type`); any other such entry is a load error and the item registers without it. Nothing warned while editing: ADR 0044 listed "a validator for passthrough holders outside the delayed list" as a follow-up.

## Decision

- **D1 Fact.** `ItemFacts.dataPackComponents?: readonly string[]` (plugin API 1.4.0, additive) lists, per target, the data components whose value names a data pack registry entry. The built-in targets derive it from their vendored vanilla-mcdoc (components whose schema has an `id` attribute naming one of the game's data pack registries); each target's tests derive it again and must agree, so an mcdoc sync cannot leave it stale. 26.3 and 26.4-snapshot-7 list the same 24 components.
- **D3 Vanilla tool numbers.** `ItemFacts.vanillaTools?` (with `VanillaToolStats`) gives each vanilla tool's tooltip numbers by tier and type: attack damage (1 plus the `attack_damage` modifier), attacks per second (4 plus the `attack_speed` modifier), durability, mining speed and enchantability. The built-in targets record them from misode/mcmeta's `item_components` summary of their version (read 2026-11-07; the same for 26.3 and 26.4-snapshot-7). The Creator's Stats tab shows them for a tool of a vanilla tier ("Attack damage 6, 1.6 attacks per second, durability 250, …, as a vanilla iron sword"), closing the ADR 0044 follow-up "vanilla-tier weapon numbers in the Creator Stats".
- **D4 Body armour defence.** A custom armour material's `defense` gains an optional `body` (int, 0 or more): the armour points of horse and wolf armour, which used the `chestplate` value (ADR 0044 D5) and still do without it. The runtime's `Defense` record decodes it (`bodyOrChestplate()`), the Java project generator writes it as `ArmorType.BODY`, and the Creator's Stats show it. Old definitions are unchanged; the conformance corpus has a valid and an invalid case.
- **D2 Validator.** `blocks-items.passthrough-needs-data-pack` (warning) flags each `msm:components` entry in that list that is not one of the runtime's late components (`DELAYED_PASSTHROUGH_COMPONENTS` in `@msm/plugin-blocks-items`, kept equal to the Java list by a test that reads `ComponentPassthrough.java`). It is a warning, not an error: the jar still exports and the rest of the item works.

## Consequences

- An `enchantments` or `painting/variant` entry is flagged where it is written, with a hint to use a loot table, a recipe result or a command instead.
- Growing the runtime's late list means updating the Java set and the TypeScript list together; the parity test fails until they agree.

## Status

Accepted (2026-11-07); closes the ADR 0044 follow-ups (passthrough validator, vanilla weapon numbers, `ArmorDefense.body`); for app 1.3.0.
