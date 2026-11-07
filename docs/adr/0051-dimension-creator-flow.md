# ADR 0051: A Dimension flow in the Creator

## Context

The user asked on 2026-11-06 whether more dimensions are supported, chose "leave them for future ideas", and on 2026-11-07 asked to go ahead with the recommended next step. The worldgen plugin already has the `minecraft:dimension` kind and a "Dimension" example, but a beginner has to write a generator by hand and visit it with `/execute in … run tp`. A real portal block needs new runtime code (portal shape detection, travel, GameTests and parity), which is a larger step.

## Decision

- **D1 Flow.** A Creator flow "Dimension" (starter `dimension`, group **Worlds**) asks for a name, the **Terrain** (vanilla noise settings `overworld`, `amplified`, `floating_islands`, `caves`, `nether`, `end`, or a flat world), the **Biome** (one vanilla biome through a fixed biome source, or the overworld `multi_noise` preset) and the **Sky and rules** (the vanilla dimension types `overworld`, `overworld_caves`, `the_nether`, `the_end`). It writes no custom dimension type, whose format moves between versions.
- **D2 Travel.** A function `<id>/travel` takes the player there with `execute in <dimension> run spreadplayers ~ ~ 0 64 [under 120] false @s`, which lands on solid ground (under the roof for caves and nether-like terrain), and back to the overworld when run inside the dimension (`execute if dimension … run return run …`). With **How to get there** = a key item (the default; Fabric mod jar), an `msm:item` key runs it through `msm:on_use` and a `run_function` action with a three-second cooldown; otherwise the function alone works in vanilla packs. No runtime change.
- **D3 API.** `CreatorGroup` gains `worlds` (plugin API 1.5.0, additive).
- **D4 Commands know project dimensions.** The app's data registry list (`DATA_REGISTRY_KINDS`) includes `dimension`, so the mcfunction checker and schema references accept the project's own dimensions (`execute in <ns>:<id>` no longer warns).

## Consequences

- A beginner gets a working dimension and a way in and out in one Create; a portal block stays a later step (new runtime code).
- Floating islands and end-like terrain can leave no ground within 64 blocks; `spreadplayers` then fails with its own message and the player stays where they are (the notes say so).

## Status

Accepted (2026-11-07) on the user's "Go ahead with the recommended".
