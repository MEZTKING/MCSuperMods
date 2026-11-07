# ADR 0050: Edit-time check for passthrough components that need data packs

## Context

`msm:components` (ADR 0044 D1) passes vanilla item data components through. The runtime decodes them while mods initialise, before data packs load, so a value that names an element or tag of a data pack registry (an enchantment, a mob variant, a banner pattern) cannot be decoded then. Six components are decoded late (`ComponentPassthrough.DELAYED`: `jukebox_playable`, `provides_trim_material`, `trim`, `damage_resistant`, `blocks_attacks`, `damage_type`); any other such entry is a load error and the item registers without it. Nothing warned while editing: ADR 0044 listed "a validator for passthrough holders outside the delayed list" as a follow-up.

## Decision

- **D1 Fact.** `ItemFacts.dataPackComponents?: readonly string[]` (plugin API 1.4.0, additive) lists, per target, the data components whose value names a data pack registry entry. The built-in targets derive it from their vendored vanilla-mcdoc (components whose schema has an `id` attribute naming one of the game's data pack registries); each target's tests derive it again and must agree, so an mcdoc sync cannot leave it stale. 26.3 and 26.4-snapshot-7 list the same 24 components.
- **D2 Validator.** `blocks-items.passthrough-needs-data-pack` (warning) flags each `msm:components` entry in that list that is not one of the runtime's late components (`DELAYED_PASSTHROUGH_COMPONENTS` in `@msm/plugin-blocks-items`, kept equal to the Java list by a test that reads `ComponentPassthrough.java`). It is a warning, not an error: the jar still exports and the rest of the item works.

## Consequences

- An `enchantments` or `painting/variant` entry is flagged where it is written, with a hint to use a loot table, a recipe result or a command instead.
- Growing the runtime's late list means updating the Java set and the TypeScript list together; the parity test fails until they agree.

## Status

Accepted (2026-11-07); closes the ADR 0044 follow-up.
