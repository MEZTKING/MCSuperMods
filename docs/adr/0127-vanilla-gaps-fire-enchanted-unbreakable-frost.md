# ADR 0127: Set on fire, items that start enchanted or never wear out, and Frost Walker's effect

## Context

The search spike (B650) found four things vanilla Minecraft Java can make that MSM had no plain way to make, recorded in `COVERAGE-AUDIT.md` at the B654 merge; under the vanilla parity rule each is a bug:

1. **Set on fire from a rule.** No Rules step lights a mob. The Enchantment flow's "Set the target on fire" works only on a hit with the enchanted weapon.
2. **An item that starts enchanted.** The `msm:components` passthrough ([ADR 0044](0044-gear-weapons-and-consumables.md) D1) accepts vanilla's `minecraft:enchantments`, but the runtime decodes passthrough components while mods initialise, before the enchantment registry (a data pack registry) exists, so it logged a load error and left the item plain; the validator warned (`blocks-items.passthrough-needs-data-pack`, [ADR 0050](0050-passthrough-data-pack-check.md)).
3. **A Frost Walker-like effect.** Vanilla's Frost Walker is a data-driven enchantment (`minecraft:location_changed` with `minecraft:replace_disk`), so a project `minecraft:enchantment` could already do it, but no flow, template or example showed how, and the Enchantment flow's fixed effect list had no such choice.
4. **Unbreakable.** `minecraft:unbreakable` (`{}` since 1.21.5) already decoded through `msm:components` over the static registries, but only under Advanced (all fields): no field or flow question offered it.

What was checked first (2026-11-23, at ab00f17): the vendored vanilla-mcdoc of both targets types `enchantments` and `stored_enchantments` as `EnchantmentLevels` (enchantment id to a level of 1 to 255) and `unbreakable` as an empty struct; `Fire` is a `short` of the entity base (ticks of fire); both targets' command trees have `data merge entity`; in 26.3 loot conditions are discriminated by `type` (no longer `condition`), damage tag predicates take `#` tags, and the simple block state provider is `minecraft:simple` with a state of `id` and `properties`. No vanilla command sets a player on fire: `data` cannot change a player.

## Decision

### D1 Rules step `set_on_fire` ("Set on fire"), compiled to `data merge entity`

A step in the Do picker's Mobs group, `set {who} on fire for {seconds}` (`who` defaults to the mob; `seconds` 0 to 1000, a number or a reading). It compiles to the rule book's script as `target.runCommand("data merge entity @s {Fire:<ticks>s}")` for each one the "who" names, with the ticks the seconds times 20, from 1 to 32767 (a literal worked out at compile time, a reading at run time). The command text is a Rules fallback form `set_fire` (`compile/games.ts`, [ADR 0115](0115-rules-3-for-games.md) D1's mechanism), checked by the offline function checker on both targets with every other form. Players are skipped: no command lights a player, and a runtime Script API member was not added for it (the smallest route is data only; a player can still be lit by placing fire with Place a block, or by a Fire Aspect weapon). Format: an additive step id in `rules.mcdoc`'s step lists; no format version change.

Live view: the rule's sentence on its card ("set the mob on fire for 5 seconds"); in Try it the step's command is one "Only in Minecraft" line in What happened (the preview does not burn mobs).

### D2 `minecraft:enchantments` waits for the data packs

The runtime's `ComponentPassthrough.DELAYED` and the plugin's `DELAYED_PASSTHROUGH_COMPONENTS` gain `enchantments`: the component is decoded through `Item.Properties.delayedComponent` once data packs are loaded, so an `msm:item` may start enchanted with vanilla or project enchantments. `stored_enchantments` stays undelayed (no ask for it yet) and keeps its warning. The GameTest `passthroughStartsEnchantedAndRejectsDynamicHolder` (`MsmGearGameTest`, on `enchanted_blade.json`) checks the level, the unbreakable component and the still-rejected `stored_enchantments`.

### D3 Plain fields and flow questions

- **Item Studio**, "Tool and durability": **Never wears out** (`minecraft:unbreakable`) and **Starts with enchantments** (rows of an enchantment, vanilla or the project's, and a level), both written into `msm:components` (`ItemWearFields.tsx`, `item-wear-model.ts`); the field goes when nothing is left in it. Live view: the tooltip under the fields, drawn as the game draws it (name, each enchantment with its level in Roman numerals, "Unbreakable"), following every edit.
- **Weapon** flow (group Stats) and **Gear set** flow (group Pieces, on every tool, weapon and armour piece): **Never wears out**, **Starts with an enchantment** (a choice of 17 vanilla enchantments or none) and **Enchantment level** (1 to 10), shared in `@msm/plugin-library` `content/wear.ts`. Live view: the Creator's preview of the made item (its element and notes), and the Item Studio's tooltip once made.

No new MSM component or format field: both are vanilla components in the existing passthrough.

### D4 Frost Walker's effect in the Enchantment flow and an example

The Enchantment flow gains the target **Boots** (`#minecraft:enchantable/foot_armor`, slot `feet`) and the effect **Freeze water under the wearer (as Frost Walker)**: vanilla's two effect components, `minecraft:location_changed` (a disk of still water under a wearer on the ground and not riding turns to frosted ice, radius 3 at level I and one more per level, at most 16) and `minecraft:damage_immunity` (magma blocks and campfires do not burn the feet), written for the 26.3 data format (`freezeWaterEffects` in `starters/enchantment.ts`). The library example **Frost boots enchantment** (`example_msm_frost_boots`, Rime Step) uses the same effects; it is data and works in a vanilla data pack. Live view: the enchantment's existing data live view (the enchanting table and Try it on, ADR 0120); the freezing itself happens only in the game.

## Consequences

- Rules has 62 steps; the AI helper's Rules prompt names `set_on_fire` (its pinned hash moves; the prompt stays within 99,000 characters).
- The library has 201 examples; the Weapon and Gear set flows have three more questions each; the Enchantment flow one more target and one more effect.
- A project that already had `minecraft:enchantments` in `msm:components` now gets it applied in the game where before it was dropped with a warning.
- Version facts: the fire NBT key, the component shapes and the 26.3 data format of the Frost Walker effects are written in the library and the rules plugin, not in `packages/targets`, as the existing Enchantment flow and Rules forms already do; a target whose format moves gets them through the targets' forms or the library's per-target content when it does.
- In-game checks (verify at implementation): a mob lit by the step burns for the seconds given; an item from the Weapon flow with Sharpness starts enchanted and with Never wears out loses no durability; Rime Step boots freeze water on both targets.

## Status

Accepted (2026-11-23) as the orchestrator's brief's recommended route, a vetoable default (the user's standing "take the recommended option").
