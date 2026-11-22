# ADR 0106: Data kinds sweep 2 and the data-only flows

## Context

[ADR 0064](0064-data-kinds-sweep.md) D4 left out, as "not worth it now", `sulfur_cube_archetype`, `test_environment`, `test_instance`, `block_transformer`, the two context providers, `slot_source`, `block_sound_set`, shaders, post effects and waypoint styles; `wolf_sound_variant` waited for a vendored mcdoc that described it. The user's rule of 2026-11-14 makes each of these a gap if vanilla data or resource packs can carry it. At f6a8adc (fact H9 of [the plan](../PLAN-vanilla-parity-3.md#fact-table-h1-to-h16)):

- the 26.3 world data folders (`dev.worldDataFolders`) include `decorated_pot_pattern`, `block_transformer`, `test_environment`, `test_instance`, `sulfur_cube_archetype` and `wolf_sound_variant`, none with a kind; `decorated_pot_pattern` became data in 26.3 (the mcdoc says `since 26.3`);
- the vendored mcdoc now describes `wolf_sound_variant` for 26.1 to 26.4 (a `concrete` node over `SoundVariant`);
- `context_int_provider` and `context_float_provider` are data folders (the compost values of ADR 0060 D4 read `context_int_provider/compostable/*.json`);
- the resource side has schemas for `post_effect`, `shader` and `waypoint_style`; project assets copy only `textures`, `sounds`, `font` and `texts` (fact H10);
- `slot_source` has a schema but no folder or registry on either target, and `gpu_warnlist` and `regional_compliancies` are game-internal: not pack content.

The coverage audit's section 3 also lists data-only flows never built: armour trim pattern, banner pattern and glider ([ADR 0044](0044-gear-weapons-and-consumables.md) D8), and now the decorated pot pattern.

## Decision

- **D1 Generic data kinds** (ADR 0015's tier B, schema forms): `minecraft:decorated_pot_pattern`, `wolf_sound_variant`, `block_transformer`, `test_environment`, `test_instance`, `sulfur_cube_archetype`, `context_int_provider`, `context_float_provider`. A kind appears only on a target whose registry and folders have it (the targets list the folders; `sulfur_cube_archetype` differs between versions, so the schema of each target decides). If the schema adapter cannot read the `concrete` node, the brief adds it to `@msm/schemas` with a test.
- **D2 Resource pack kinds.** `minecraft:post_effect` and `minecraft:waypoint_style` as schema-form kinds; `minecraft:shader` for shader program JSON; raw `.vsh`, `.fsh` and `.glsl` files go through project assets under a new allowed folder `shaders` (no schema; `export.language-unchecked` info as for other text without a checker).
- **D3 Left out, stated:** `slot_source`, `gpu_warnlist`, `regional_compliancies` (no pack folder or game-internal). The 26.4 `block_sound_set` belongs to [ADR 0105](0105-block-sounds-set-types-and-vanilla-block-pairs.md).
- **D4 Four data-only Creator flows.** "Banner pattern" (the pattern, its banner and shield pictures, the item that applies it in the loom and its item tag), "Armour trim" (the trim pattern, the template item, its smithing and copy recipes, the trim layer pictures and the atlas entry), "Glider" (an item with the `glider` component, its equipment asset and wing pictures, a repair item), "Pot pattern" (the decorated pot pattern, the sherd item, its face picture and the `decorated_pot_sherds` tag). Pictures are drawn by the art generator ([ADR 0092](0092-minecraft-style-art.md)); all four work in plain vanilla packs.

## Consequences

- Every data and resource pack folder vanilla reads has a kind or a stated reason for not having one.
- Four more flows; the asar grows by their recipes and templates (checked by `tools/check-size`).
- Raw shader files are unchecked text: a mistake shows only in game (guide note).

## Status

Proposed (2026-11-22). Vetoable defaults: shaders as unchecked raw files; the four flow names; `test_environment` and `test_instance` offered as kinds although only map makers use them.
