# ADR 0105: Own block sounds and set types, and strip, flatten, till, age and burn pairs

## Context

A project block picks one of vanilla's `SoundType` constants (`sound_type`, an enum "to verify at implementation" in `definition.mcdoc`, fact H7); doors, trapdoors, buttons and pressure plates pick one of ten vanilla `BlockSetType` constants (`BlockSetTypes` seam, fact H6; [ADR 0067](0067-block-types-and-states.md) D11 never builds one). Vanilla has a sound set per material, and on 26.4 sound sets are a data registry (`block_sound_set`, a world data folder on 26.4 only), so "my own block sounds" and "my own door sounds" are vanilla things MSM cannot make (coverage audit B2: "own sounds remain").

Vanilla also pairs blocks for tools: an axe strips logs and scrapes copper, a shovel makes a path, a hoe tills soil, honeycomb waxes. MSM has `msm:strippable` and `msm:flammable` for project blocks only ([ADR 0067](0067-block-types-and-states.md)), no flattening or tilling, and nothing for vanilla blocks (coverage audit "Vanilla content modification", fact H8). Fabric's content registries do these on 26.3 (F34 of ADR 0101); they are absent on 26.4, where the runtime already uses a `UseBlockCallback` route for stripping and reflection for flammability.

## Decision

- **D1 Own block sounds.** `msm:block` gains `sounds?: { break, step, place, hit, fall, volume?, pitch? }`, each a vanilla or project sound event; `sound_type` stays and is the default for the events not given. On 26.3 the runtime builds a `SoundType` from them; on 26.4 the lowering writes a `block_sound_set` data entry under the block's id and the block names it, as the spike finds possible (X10: whether a frozen block can name a data entry that loads later; if not, 26.4 uses the nearest `sound_type` and warns, limit N8).
- **D2 Own set types.** `set_type` takes a vanilla name (as now) or an object `{ sounds: { open, close, press?, release? }, can_open_by_hand?: boolean, arrows_press?: boolean, plate_sensitivity?: "everything" | "mobs" }`, built per element on both versions behind the `BlockSetTypes` seam (X11).
- **D3 Flattening and tilling project blocks.** Block components `msm:flattenable { into }` (shovel, as dirt into a path) and `msm:tillable { into, drops? }` (hoe, as dirt into farmland), beside `msm:strippable`; same route as stripping.
- **D4 Pairs for vanilla blocks.** A new addition kind `msm:vanilla_block_rules` (like the additions of [ADR 0060](0060-adding-to-vanilla-content.md)) lists pairs on vanilla blocks: `strip`, `flatten`, `till`, `age` (copper-like `next`), `wax`, and `burn` (`{ burn_odds, spread_odds }`). 26.3 uses Fabric's content registries; 26.4 the existing `UseBlockCallback` and `Flammability` routes, extended (X12); if neither works for a pair on 26.4, the reserve brief B546 adds a version-only Mixin. A pair that overrides a vanilla pair warns, from `TargetFacts.blocks.vanillaPairs`. Fabric mod jar only (limit N9).
- **D5 Target facts.** Plugin API 1.19.0: `BlockFacts.soundTypes` (the vanilla names; the validator reads these instead of the mcdoc enum's comment), `BlockFacts.soundModel` (`"sound_type"` 26.3, `"block_sound_set"` 26.4), `BlockFacts.vanillaPairs` (from B503's dumps), each verified per target.

## Consequences

- Project blocks and doors can sound like themselves; the Sounds section and the Wood set flow offer it.
- Vanilla blocks can be given tool pairs and burning rules; a new addition Studio.
- 26.4's data-driven sounds make the two targets differ in what the lowering writes; the target fact keeps that in `packages/targets`.

## Amendment after the spike (B503, 2026-11-22)

Measured on both versions (evidence in `docs/reference/spikes/b503/`). These win over D1 and D4 where they differ.

- **D1 on 26.4: possible, fixed per world load.** `block_sound_set` is a synchronised world registry, not a reloadable one: the lowering writes `data/<ns>/block_sound_set/<path>.json` (`volume`, `pitch`, `break_sound`, `step_sound`, `place_sound`, `hit_sound`, `fall_sound`) and the block names it by key. A change needs the world opened again (limit N8 reworded), and a missing entry is silent in the game, so the runtime logs a warning for it. `SoundType` does not exist on 26.4.
- **D2.** Own set types work unregistered on both versions behind `BlockSetTypes`; the constructors differ (26.3 takes a name and a `SoundType`, 26.4 a `BlockSoundSet` key).
- **D4 corrected.** Fabric's content registries on 26.3 have no strip, flatten or till registry (only flammability, oxidising and waxing). Strip, flatten, till and wax for vanilla blocks use one `UseBlockCallback` route on both versions, which runs before the item's own transformer; burn uses the existing `Flammability` routes; `age` uses `OxidizableBlocksRegistry` on 26.3, and on 26.4 (where vanilla's maps are immutable and oxidised copper does not random-tick) the reserve brief B546's version-only Mixin, which must also make the vanilla state random-tick. Vanilla's own strip, flatten and till pairs are data (`block_transformer/{axe,shovel,hoe}.json`), so `vanillaPairs` reads them there.

- **Format as frozen (B506).** D1's field is `block_sounds` (a `portal` already has a top-level `sounds`, ADR 0077 D1): `{ break, step, place, hit, fall, volume? 0..10, pitch? 0.25..4 }`. D2's object gains `base` (a vanilla set type, default `wood`, the source of every unset default) and `can_open_by_wind_charge` (default `can_open_by_hand`); all four sounds are optional (a button or plate uses only `press` and `release`). D4's burn rules use `msm:flammable`'s `burn_odds` and `ignite_odds` (0..300) instead of `spread_odds`.

## Status

Proposed (2026-11-22). Vetoable defaults: `sound_type` stays the default for missing events; own set types as an object in the same field; one addition kind for all vanilla pairs; warnings, not errors, for overriding a vanilla pair.
