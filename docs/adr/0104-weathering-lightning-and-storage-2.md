# ADR 0104: Weathering on more types, lightning, and storage 2

## Context

[ADR 0094](0094-remaining-vanilla-block-types-waterlogging-and-weathering.md) D8 gave copper-like ageing to eleven types (`BlockType.WEATHERING_TYPES`: block, pillar, horizontal, directional, slab, stairs, door, trapdoor, pane, chain, lantern) and left out the rest ([ADR 0101](0101-vanilla-parity-2-flows-studios-try-it-and-tests.md) limit Q7). Vanilla's copper family also has a lightning rod (a rod), bars (a pane: covered), a bulb (a block: covered), a chest (a container) and a golem statue; vanilla's lightning scrapes copper, which MSM's project copper ignores because vanilla's maps hold vanilla blocks only (limit Q6; fact H2). Containers and machines cannot hold water (limit Q8, fact H3), though vanilla's chests can. [ADR 0074](0074-containers-and-block-entities.md) D10 left out double chests and per-player storage like an ender chest, both vanilla.

## Decision

- **D1 Six more weathering types.** `rod`, `button`, `pressure_plate`, `fence`, `fence_gate` and `wall` join `WEATHERING_TYPES`, each a small subclass of its type's class that implements vanilla's change-over-time behaviour, as ADR 0094 D8's eleven do. Vanilla has no copper buttons, plates, fences, gates or walls; they are added because the mechanism is the same subclass and a set with holes would surprise users (vetoable). Waxing and scraping as ADR 0094 D9.
- **D2 Lightning scrapes project copper.** A lightning strike on or next to a project weathering block takes it (and its neighbours) back by the same rule vanilla applies to copper: as observed beside vanilla copper in the spike (B503, X5), not transcribed. The route is a Fabric event if one exists on both versions, else one head injection under DESIGN section 10's Mixin policy, with a justification comment and a GameTest. Copper golems keep vanilla's maps (limit N5).
- **D3 Containers and machines hold water.** `msm:waterloggable` is allowed with `msm:container` and `msm:machine` on the four `MsmBlock` types; the block keeps its block entity, menu and hopper faces (X7).
- **D4 Double chests.** The `chest` layout gains `double: boolean` (default false; only with `rows: 3`, as vanilla's two chests make six rows; limit N6). Two such blocks placed side by side join: a `type` state (`single`, `left`, `right`), block models for each (no block entity renderer, ADR 0074 C9 stays), one six-row menu over both halves, hoppers and comparators per half as vanilla's. Sneak-placing keeps them apart, as vanilla.
- **D5 Per-player storage.** The `chest` layout gains `per_player: boolean` (default false): each player sees their own contents, kept in a Fabric data attachment on the player per block id (as vanilla's ender chest has one store for all ender chests; limit N7), kept across death and dimension change. Not with `keep_contents` or `double`; hoppers do not reach it (as vanilla's ender chest).
- **D6 Weathering storage.** `msm:weathering` is allowed on containers (a copper-chest-like block); ageing replaces the block and keeps the block entity's contents (X13).
- **D7 Format.** Fields in the existing component groups; new block component keys go into the nested group of ADR 0074 C18.

## Consequences

- The copper family is complete apart from the golem statue (a mob-shaped block: client rendering, later).
- Containers gain three options that change their saved shape (`type` state, the player store): removing them from a used block follows ADR 0074 C7's warning.
- One Mixin more is possible (D2), with its GameTest.

## Amendment after the spike (B503, 2026-11-22)

Measured on both versions (evidence in `docs/reference/spikes/b503/`).

- **Lightning: go, no Mixin.** Fabric's `ServerEntityEvents.ENTITY_LOAD` fires for the bolt on its spawn tick before the strike; the runtime scrapes project weathering blocks from there. Vanilla's measured rule: the struck block goes to its first stage, and a few neighbours (4 to 19 cells on a 7 by 7 floor) go back one stage; with a rod, the block under it drops 0 to 3 stages (full reach: verify at implementation). Visual-only bolts cannot be told apart (no getter) and are treated alike.
- **Weathering on more types: go.** Rod, button, plate, fence, gate and wall subclasses age at vanilla copper's rate and keep every state property.
- **Waterlogged containers: go.** `MsmContainerBlock` with `SimpleWaterloggedBlock` keeps its block entity, menu, hoppers and comparator; breaking it leaves a water source.
- **Double chests: go**, as a `ChestBlock` subclass family with its own `ChestBlockEntity` type (overriding `newBlockEntity`), not `MsmContainerBlock`; one 54-slot menu, each half drops its own items.
- **Per-player storage: go**, as a persistent Fabric attachment copied on death, one entry per block id.
- **Ageing containers.** `Weathering.replace` and the random tick drop the contents; the runtime copies the whole block entity data, sets the new block with `UPDATE_SKIP_BLOCK_ENTITY_SIDEEFFECTS` and pastes it back.

## Status

Proposed (2026-11-22). Vetoable defaults: weathering on buttons, plates, fences, gates and walls although vanilla has none; lightning scraping by vanilla's observed rule; doubles only for three-row chests; one player store per block id.
