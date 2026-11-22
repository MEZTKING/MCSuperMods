# ADR 0108: Fluids 2: mixing, cauldrons and bottles

## Context

[ADR 0099](0099-custom-fluids.md) D5 left out, among others, mixing rules, cauldrons, bottles, pipes and tanks, buoyancy other than water's, boats on project fluids, fog colours on 26.3 and waterlogging by a project fluid ([ADR 0101](0101-vanilla-parity-2-flows-studios-try-it-and-tests.md) limit Q25). Filtered by the user's rule (vanilla has it): vanilla has mixing (lava and water make obsidian, cobblestone or stone; lava over soul soil next to blue ice makes basalt), cauldrons (water, lava, powder snow) and bottles (the water bottle). Vanilla has no pipes or tanks, its only buoyancies are water's and lava's (which `behaves_like` gives), and only water waterlogs: those are dropped. Fog colours are client rendering (the next client batch). Boats on a water-like fluid and resource packs retexturing a fluid may already work through the fluid tag and the texture paths: the spike checks (X28, X29). At f6a8adc the runtime has no cauldron, bottle or mixing code (fact H13); 26.3 lava-like fluids mix by vanilla's rule and 26.4 does not (ADR 0099 findings).

## Decision

- **D1 Mixing.** `msm:fluid` gains `mixing?: [{ with: "water" | "lava" | <fluid id>, source?: <block>, flowing?: <block> }]`: when this fluid meets the other one, the source or flowing block it touches becomes the named block (vanilla's obsidian-versus-cobblestone distinction is the `source` and `flowing` pair; limit N16), with vanilla's fizz sound and smoke particles. Our own liquid block's checks do it on both versions (X25), replacing the 26.3-only vanilla behaviour for lava-like fluids when `mixing` is given and making 26.3 and 26.4 behave alike.
- **D2 Cauldrons.** `msm:fluid` gains `cauldron?: { levels?: boolean }`: a companion block `<path>_cauldron` (vanilla's cauldron model with the fluid's still picture and tint; three levels like water's, or full only like lava's), filled and emptied by the fluid's bucket and, with `levels`, by its bottle, with vanilla's sounds; vanilla's empty cauldron takes the bucket through its interaction map (X26). Entities inside get `on_entity_inside` as in the fluid.
- **D3 Bottles.** `msm:fluid` gains `bottle?: { food?, effects?, on_drink? }`: a companion item `<path>_bottle`, filled by a glass bottle used on a source (or a levelled cauldron), drunk like a potion with the given food, effects and event, leaving a glass bottle (X27).
- **D4 Checked, not built unless needed:** boats on water-like project fluids (X28) and resource packs retexturing a project fluid (X29); if either fails, a fix goes into B529 or B531, else a guide line says it works.
- **D5 Dropped:** pipes, tanks, other buoyancies, waterlogging by a project fluid (not vanilla); fog colours on 26.3 (client batch, limit N18).
- **D6 Target facts.** Plugin API 1.20.0: `BlockFacts.cauldrons` (vanilla's cauldron ids, for the validator's id clash check).

## Consequences

- Fluids reach vanilla's level of interaction; the Fluid flow asks three new questions.
- Two companions per fluid at most (cauldron, bottle; limit N2).
- Mixing behaves the same on both versions once `mixing` is set; without it the old per-version behaviour stays (stated in the guide).

## Amendment after the spike (B525, 2026-11-22)

Measured on both versions (evidence in `docs/reference/spikes/b525/`); these win over D1 to D4 where they differ.

- **D1 mixing: go on both versions, by the liquid block's own check.** The liquid block overrides `onPlace` and `neighborChanged`, looks at the five neighbours other than the one below, and on a match sets the rule's source or flowing block with the lava fizz (`LevelEvent.LAVA_FIZZ`). When `mixing` is set it never calls vanilla's code (which on 26.3 would still make obsidian) and schedules the fluid tick itself. Fluid-id rules are checked before tag rules (a project fluid in `#minecraft:water` would otherwise match the tag first). Liquids are compared by their legacy block (`Fluid.isSame` exists on 26.3 only). Lava falling into water (vanilla's stone) is optional, by a `spreadTo` override in the `MsmFluid` seam.
- **D2 cauldrons: go, no Mixin.** A project cauldron subclasses vanilla's layered or full-only cauldron with an empty interaction dispatcher (`Dispatcher.put` is not public) and its own `useItemOn` over vanilla's public `fillBucket`/`emptyBucket` helpers; vanilla's empty cauldron takes a project bucket or bottle through `UseBlockCallback`. The layered class puts out burning entities and uses a level each time, so only water-like fluids use it unchanged; lava-like cauldrons are full-only.
- **D3 bottles: go.** Vanilla's glass bottle fills with water from any `#minecraft:water` fluid, so the project bottle needs a `UseItemCallback` before vanilla's; the bottle is a drink (`Consumable` with the drink animation, 1.6 s default, `usingConvertsTo` the glass bottle), `finishUsingItem` the `on_drink` hook.
- **D4 boats and packs.** Vanilla boats float and glide on water-like project fluids with no change (on 26.4 a boat loses speed near the edge of a source area: verify in game). A resource pack can repaint a project fluid by replacing its picture files at their texture paths, but not by re-pointing the liquid block's model (read from the mod jar at client start).

## Status

Proposed (2026-11-22). Vetoable defaults: mixing only when listed; a cauldron with three levels only when `levels` is set; bottles only when `bottle` is set; the companion names `<path>_cauldron` and `<path>_bottle`.
