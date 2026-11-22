# ADR 0103: Growing and climbing plants, and project flower pots

## Context

After vanilla parity 2 MSM has 38 block types ([ADR 0094](0094-remaining-vanilla-block-types-waterlogging-and-weathering.md)), but none for the plants vanilla grows in strands or stalks: kelp, weeping and twisting vines, cave vines with glow berries, sugar cane, cactus, bamboo, big and small dripleaf and glow lichen ([ADR 0101](0101-vanilla-parity-2-flows-studios-try-it-and-tests.md) limit Q10; `loader/BlockType.java`, fact H1 of [the plan](../PLAN-vanilla-parity-3.md#fact-table-h1-to-h16)). A potted plant can only go into vanilla's empty flower pot (`MsmPottedPlantBlock extends FlowerPotBlock`, limit Q5, fact H4); vanilla has the flower pot as a block in its own right, so a project pot that takes plants is a gap under the user's rule of 2026-11-14.

Vanilla groups these plants into a few shapes (verify at implementation, spike question X1): a head and body pair that grows one block at a time up or down (kelp, weeping and twisting vines, cave vines); a stalk that grows up to a height on given soils (sugar cane, cactus, and bamboo with its leaf stages and shoot); a block that sits on any face of its neighbours and spreads by bone meal (glow lichen); and the dripleaf pair (a tilting top on a stem, and a small two-block plant that grows into it).

## Decision

- **D1 Four new types instead of nine.** `type` gains:
  - `growing_plant`: fields `direction` (`up` or `down`), `max_age` (default 25, as kelp; verify at implementation), `growth_chance` (default 0.14; verify), `needs_water` (kelp-like: waterlogged by nature, survives only in water), `berries` (optional `{ item, light }`: cave-vine-like berries picked by use, the plant glowing at `light` while it has them), `climbable` (default true for vines, false for kelp), `soil` (block or tag ids the base needs; default none: any sturdy face). Registers the head under the element id and the body as the companion `<path>_plant` (vanilla's naming).
  - `column_plant`: fields `style` (`cane`, `cactus` or `bamboo`), `max_height` (default 3, as sugar cane and cactus; bamboo 16; verify), `soil` (default the vanilla tags of the style as `TargetFacts.blocks.plantSoils` lists them), `needs_water_nearby` (cane-like; default true for `cane`), `touch_damage` (cactus-like; default 1 for `cactus`, else 0), and for `bamboo` the shoot companion `<path>_shoot`.
  - `multiface`: glow-lichen-like; fields `light` (default 7, as glow lichen; verify), `spreads` (default true: bone meal spreads it), `waterloggable` (default true).
  - `dripleaf`: fields `size` (`big` or `small`); `big` registers the stem companion `<path>_stem`, tilts under a standing entity (vanilla's timing), can be grown taller with bone meal; `small` grows into the `big` element named by `grows_into`.
- **D2 Project flower pots.** A fifth new type, `flower_pot`, is an empty pot: field `plants`, the vanilla and project plants it takes (thing picker; ids of blocks with an item). For each listed plant the lowering adds a companion potted block `<pot path>_<plant path>` (vanilla's `flower_pot_cross` model with the pot's own texture and the plant's), and the runtime gives the pot its own plant-to-pot map, leaving vanilla's pot and its map alone (X4). `potted_plant` gains an optional `pot` (default vanilla's), so a project plant can be put into a project pot without being listed twice.
- **D3 Behaviour is vanilla's.** Each family extends the vanilla class the spike names (B503, X1) with the driver's events and triggers (ADR 0067 D3); growth, bone meal, survival, berries, tilting and spreading are vanilla's own behaviour over the definition's numbers. Nothing is transcribed from vanilla's code.
- **D4 Companions** follow ADR 0094 D3: reserved ids, one load report line, the validator refuses a clash (limit N2).
- **D5 Target facts.** Plugin API 1.19.0 adds `BlockFacts.plantSoils` (the vanilla tags each style survives on, from B503's observations) so the Studio and the validator offer them; version differences stay in the target.
- **D6 Not in this ADR.** Candle cakes on project cakes (vanilla pairs only its own cake); bamboo-like shapes other than vanilla's (limit N4); chorus-like plants (vanilla's chorus is an End feature with a fixed block; the existing `block` type with features covers its look but not its growth: a later batch if asked).

## Consequences

- The last everyday plants of vanilla are possible; the Creator gets "Cave plants" and "Desert plants" flows and a "Flower pot" flow ([ADR 0112](0112-vanilla-parity-3-flows-studios-eject-try-it-and-tests.md)).
- Five more types to keep on both versions; each has GameTests and parity cases.
- Project pots add one registered block per listed plant (the registry grows with the list; the Studio shows the count).

## Status

Proposed (2026-11-22). Vetoable defaults: four plant types rather than one per vanilla plant; vanilla's numbers as defaults (kelp's age, sugar cane's and cactus's height of 3, bamboo's 16, glow lichen's light 7, cactus damage 1: all "verify at implementation"); the companion names `<path>_plant`, `<path>_shoot`, `<path>_stem` and `<pot>_<plant>`; a pot lists its plants rather than taking every plant.
