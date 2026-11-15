# ADR 0100: Dimension type and sky editing

## Context

[ADR 0051](0051-dimension-creator-flow.md) D1 keeps vanilla dimension types in the Dimension flow; the kind `minecraft:dimension_type` exists for advanced users as a schema form. The research report ranks "dimension type editing and sky effects" sixteenth (a moon-gravity feel, custom skies, fog colours, fixed time) and the coverage audit lists dimension type editing as what remains of backlog B13. All of it is data in 26.x: a `DimensionType` holds height, light, the skybox (`NONE`, `OVERWORLD`, `END`), cardinal lighting, monster settings, timelines, a default clock and an environment attribute map, and the sky, fog, cloud, sun, moon and star looks and many gameplay rules are environment attributes (plan F31: 51 attribute ids on 26.3, 52 on 26.4, which adds `visual/has_sky_occluder`). A vanilla server refuses the whole data pack when a dimension type names a mod-only particle ([ADR 0066](0066-vanilla-pack-safety.md), the particles batch).

## Decision

- **D1 A Dimension Type Studio** (worldgen plugin's Studio registry) over the existing kind, with sections **Sky** (skybox picture choice; sky, fog, cloud and sunrise colours; cloud height; sun, moon and star angles and star brightness; ambient particles), **Light** (ambient light, sky light, ceiling, cardinal lighting, block light tint), **Time** (a fixed time of day or a clock, through the target's timeline and clock fields: verify at implementation which form 26.3 and 26.4 accept), **Rules** (the `gameplay/*` attributes: bed rule, respawn anchors, piglins turning, monsters burning, fast lava, water evaporating, raids and patrols), **Height** (minimum y, height, logical height) and **Spawning** (monster light test and block light limit). Each attribute field shows only the ids the target's registry lists (`environment_attribute`), so 26.4's extra attribute appears there only. Fields not shown stay in Raw JSON.
- **D2 The Dimension flow** gains the answer "Give it its own sky and rules" (default off, keeping ADR 0051 D1's default): on, it makes a project dimension type copied from the chosen vanilla one with the user's sky colour, fog colour, fixed time choice and "beds explode here" choice, and points the dimension at it. ADR 0051 D1 is superseded only in that the flow may now make a dimension type.
- **D3 Validators** (`worldgen.*`): `dimension-height-multiple` (min y and height multiples of 16), `dimension-height-range` (within the target's bounds, a target fact), `dimension-logical-height` (not above height), `dimension-attribute-unknown` (an attribute id the target does not list), `dimension-attribute-mod-particle` (an info that the file is left out of vanilla packs when it names a project particle, ADR 0066).
- **D4 Preview.** A sky swatch (top colour to horizon fog colour, sun and moon positions at the chosen time) in the Studio and the flow; Try it shows the sky colour (ADR 0101 D5). No 3D sky.
- **D5 Plugin API 1.18.0** (additive): `WorldgenFacts.dimensionHeight?: { minY: number; maxY: number; step: number }` and `WorldgenFacts.environmentAttributes?: readonly string[]` (from the vendored registries; the Biome Studio may use them too).
- **D6 Not in this batch.** Gravity or movement changes per dimension (vanilla has none; Rules can give effects or attributes in a dimension), sky textures and shapes of our own (client code), weather per dimension beyond vanilla's attributes.

## Consequences

- No runtime code and no new kind: the work is app, validators and the flow; vanilla packs carry the result (subject to ADR 0066's fatal-folder rule).
- The Dimension flow keeps its simple default.

## Status

Proposed (2026-11-14). Defaults the user may veto: a Studio over the existing kind (D1); the flow answer off by default (D2); warnings and errors as listed (D3).
