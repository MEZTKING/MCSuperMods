# ADR 0042: Armour, equipment assets and custom tool materials in the definition format

## Context

The user's Creator request ([ADR 0043](0043-creator-guided-flows.md)) needs a "Gear set" flow that makes a whole material set, armour included. The MSM definition format v1 ([ADR 0025](0025-msm-definition-format-v1.md)) has no armour: `ItemComponents` in `packages/schemas/mcdoc/msm/definition.mcdoc` holds `msm:food`, `msm:tool`, `msm:durability` and `msm:on_use` only, and `msm:tool.tier` is the closed enum `wood | stone | copper | iron | diamond | gold | netherite`, mapped by the runtime (`MsmRegistrar.tool`) and the Java generator (`packages/targets/mc-26.3/src/java-project/items.ts`) onto the vanilla `ToolMaterial` constants with fixed iron-tier attack values per tool type. Checked on 2026-11-05 with `javap` over the Loom-cached 26.3 jar and the vendored 26.3 data:

- `net.minecraft.world.item.equipment.ArmorMaterial` is a record `(int durability, Map<ArmorType, Integer> defense, int enchantmentValue, Holder<SoundEvent> equipSound, float toughness, float knockbackResistance, TagKey<Item> repairIngredient, ResourceKey<EquipmentAsset> assetId)` with `createAttributes(ArmorType)`; `ArmorType` is `HELMET, CHESTPLATE, LEGGINGS, BOOTS, BODY` with `getDurability(int)`; `ArmorMaterials` holds `LEATHER, COPPER, CHAINMAIL, IRON, GOLD, DIAMOND, TURTLE_SCUTE, NETHERITE, ARMADILLO_SCUTE`; `Item.Properties.humanoidArmor(ArmorMaterial, ArmorType)`, `repairable(Item | TagKey<Item>)`, `equippable(EquipmentSlot)`; `EquipmentAssets.ROOT_ID` and `createId(String)`.
- `net.minecraft.world.item.ToolMaterial` is a record `(TagKey<Block> incorrectBlocksForDrops, int durability, float speed, float attackDamageBonus, int enchantmentValue, TagKey<Item> repairItems)` with the seven constants; `Item.Properties.sword/pickaxe/axe/shovel/hoe(ToolMaterial, float attackDamage, float attackSpeed)`.
- Armour rendering is data driven: the item's `minecraft:equippable` component names an `asset_id` in the `equipment` registry (`assets/<ns>/equipment/<name>.json`, type `::java::assets::equipment::Equipment`: `layers.humanoid[]` and `layers.humanoid_leggings[]` of `{ texture }`, textures under `textures/entity/equipment/humanoid/` and `humanoid_leggings/`; `trim_overrides` since 26.3). The 26.3 registries list `equipment` and the `equippable`, `repairable`, `enchantable`, `max_damage` component types.
- The resourcepack plugin has no `minecraft:equipment` kind; textures are ordinary assets.
- The block side already lowers tiers to vanilla tags (`mineable/<tool>`, `needs_<tier>_tool`, `incorrect_for_<tier>_tool`; `lowering/tools.ts`) and the validator `blocks-items.unknown-tool-tier` checks a tier against the target's `incorrect_for_<tier>_tool` block tag.

## Decision

**D1. `msm:armor` item component.** Spelled `armor` because MSM component ids follow the game's identifiers (`armor` attribute, `ArmorType`), while UI text and docs say "armour". Added to `ItemComponents` in `definition.mcdoc`, format stays `1` (additive):

```mcdoc
enum(string) ArmorSlot { Helmet = "helmet", Chestplate = "chestplate", Leggings = "leggings", Boots = "boots" }
/// Vanilla armour materials by name (checked against the target's `armorMaterials` facts).
enum(string) ArmorMaterialName { Leather = "leather", Copper = "copper", Chainmail = "chainmail", Iron = "iron", Gold = "gold", Diamond = "diamond", Netherite = "netherite", TurtleScute = "turtle_scute", ArmadilloScute = "armadillo_scute" }
struct ArmorMaterial {
	/// Base durability; each slot multiplies it as vanilla does (helmet 11, chestplate 16, leggings 15, boots 13; verify at implementation).
	durability: int @ 1..,
	defense: struct { helmet: int @ 0.., chestplate: int @ 0.., leggings: int @ 0.., boots: int @ 0.. },
	enchantment_value: int @ 0..,
	toughness: float @ 0..,
	knockback_resistance: float @ 0..1,
	/// Defaults to the generic armour equip sound.
	equip_sound?: #[id="sound_event"] string,
	/// An item tag whose members repair the piece.
	repair_items?: #[id(registry="item", tags="required")] string,
	/// The equipment asset (`assets/<ns>/equipment/<name>.json`) drawn when worn.
	equipment_asset: #[id="equipment"] string,
}
struct Armor {
	slot: ArmorSlot,
	material: (ArmorMaterialName | ArmorMaterial),
}
```

`msm:durability` on an armour piece overrides the material's per-slot durability, as it does for tools; `msm:armor` with `msm:tool` on one item is a validator error (`blocks-items.component-conflict`). Lowering writes nothing extra for armour: the runtime registers the item with `Item.Properties.humanoidArmor(material, type)` (vanilla's `equippable`, `attribute_modifiers`, `max_damage`, `repairable` and `enchantable` components follow from it). Element data stays the same as the definition plus `model` and `display_name` ([ADR 0025](0025-msm-definition-format-v1.md) D4).

**D2. `minecraft:equipment` kind.** `@msm/plugin-resourcepack` gains the vanilla kind `minecraft:equipment` (schema `::java::assets::equipment::Equipment`, folder `equipment`, lowered to `assets/<ns>/equipment/<path>.json`), so an armour set is ordinary elements: the four `msm:item` pieces, one `minecraft:equipment` element and two texture assets (`textures/entity/equipment/humanoid/<name>.png`, `humanoid_leggings/<name>.png`). The validator `blocks-items.unknown-equipment-asset` warns when `equipment_asset` names neither a project element of that kind nor a vanilla asset of the target. The generic form edits the equipment element; no Studio.

**D3. Custom tool materials.** `msm:tool.tier` becomes `(ToolTier | ToolMaterial)`:

```mcdoc
struct ToolMaterial {
	durability: int @ 1..,
	/// Mining speed multiplier (iron is 6).
	speed: float @ 0..,
	/// Added to each tool type's base attack damage (iron is 2).
	attack_damage_bonus: float,
	enchantment_value: int @ 0..,
	/// The block tag this material cannot mine for drops, such as `#minecraft:incorrect_for_iron_tool`.
	incorrect_blocks_for_drops: #[id(registry="block", tags="required")] string,
	repair_items?: #[id(registry="item", tags="required")] string,
}
struct Tool {
	type: ToolType,
	tier: (ToolTier | ToolMaterial),
	/// Overrides the type's base attack damage (sword 3, axe 6, pickaxe 1, shovel 1.5, hoe -2).
	attack_damage?: float,
	/// Overrides the type's base attack speed (sword -2.4, axe -3.1, pickaxe -2.8, shovel -3.0, hoe -1.0).
	attack_speed?: float,
}
```

A custom material's mining level is whatever its `incorrect_blocks_for_drops` tag says, so a "ruby" tier that mines like diamond points at `#minecraft:incorrect_for_diamond_tool`, and a project may define its own block tag for a new level. `msm:breakable.min_tier` on blocks keeps the vanilla tier enum in this ADR (a block that *requires* a custom tier would need a `needs_<tier>_tool`-style tag and a `minecraft:tag/block` element; recorded as a follow-up). The validator `blocks-items.unknown-tool-tier` applies only to the enum form.

**D4. Target facts.** `TargetFacts.items?: { armorMaterials: string[] }` (plugin API 1.x additive): the vanilla `ArmorMaterials` constant names of that version, written in each target package with the `javap` source noted; `blocks-items.unknown-armor-material` (error) checks the enum form against it, and a target without the fact skips the check.

**D5. Runtime.** `ItemComponents.Armor` and `ToolMaterialSpec` records with Codecs aligned with D1 and D3; `MsmRegistrar.armor(props, armor)` builds the vanilla material (a constant by name, or `new ArmorMaterial(...)` with `ArmorType` defense map, the sound holder from `BuiltInRegistries.SOUND_EVENT` or `SoundEvents.ARMOR_EQUIP_GENERIC`, `TagKey.create(Registries.ITEM, repairItems)` or an empty tag, `ResourceKey.create(EquipmentAssets.ROOT_ID, Identifier.parse(asset))`) and calls `humanoidArmor(material, type)`; `tool()` builds `new ToolMaterial(...)` for the object form and applies `attack_damage`/`attack_speed` overrides over the type's base values. Mojang names as above, 26.3; every class that differs on 26.4 goes behind a seam in `src/mc/<mc>/` ([ADR 0038](0038-per-version-runtime-builds.md) D2; B151's table did not list `ArmorMaterial` or `ToolMaterial` as changed, verify at implementation). GameTests: an armour piece is registered with the `equippable` component in the right slot, its attribute modifiers carry the defence, toughness and knockback resistance, its durability matches the material and slot, `msm:durability` overrides it; a custom tool material mines at its speed and refuses drops for its tag; the eject generator and the parity GameTests cover the same facts on `fixtures/sample-mod`, which gains a ruby helmet and a ruby-tier pickaxe.

**D6. Java eject.** `java-project/items.ts` emits `ArmorMaterial` and `ToolMaterial` constants in `ModItems.java` for object-form materials, `humanoidArmor` for armour and the attack overrides; the equipment element is a plain asset file in the ejected `src/main/resources/`.

**D7. Textures and models.** The library's placeholder generator ([ADR 0020](0020-templates-starters-examples.md)) gains hand-drawn 16x16 silhouettes `pickaxe`, `axe`, `shovel`, `hoe`, `helmet`, `chestplate`, `leggings`, `boots`, `ingot` next to the existing `sword` and `gem`, and two 64x32 humanoid armour layer patterns (`armor_layer_1` for helmet, chestplate and boots; `armor_layer_2` for leggings) tinted from one colour; all written from scratch, never Mojang assets. Tools use the `minecraft:item/handheld` parent, armour items `minecraft:item/generated`.

**D8. Rejected.** *A `msm:equippable` mirror of the vanilla component:* MSM components describe intent (a helmet of a material), the runtime derives the vanilla components. *Armour without the equipment kind, generated from the item:* the asset is shared by four pieces and a user may want to edit layers; one element per file keeps "everything is an element". *Reusing vanilla equipment assets only:* custom armour must look custom; the texture generator makes placeholders the user replaces.

## Consequences

- Definition format 1 grows additively; the conformance corpus gains valid and invalid armour and material cases and the runtime's JUnit corpus test, the Codecs and the generator move together.
- 60 kinds (`minecraft:equipment`); new validator codes `blocks-items.unknown-armor-material`, `blocks-items.unknown-equipment-asset`, `blocks-items.component-conflict`; plugin API 1.x gains `TargetFacts.items` (additive, [ADR 0036](0036-plugin-api-1.0-and-compatibility-policy.md) D1).
- `fixtures/sample-mod/` grows (helmet, equipment element, two layer textures, a custom-tier pickaxe) and its SHA-256 goldens, the server check and the parity tests change.
- The Gear set flow and the AI helper's `add_starter` get real armour; the Custom sword starter may adopt `attack_damage` and `attack_speed` later without a format change.
- Follow-up recorded in the ROADMAP: blocks that require a custom tier (`min_tier` as a tag).

## Status

**Accepted (2026-11-06, shipped in 0.7.0).** Implemented by B180 (schema, plugins, targets), B181 (runtime), B182 (eject, sample mod, parity). `enchantment_value: 0` means "not enchantable": the game rejects 0, so the runtime and the generator build the material with 1 and remove the `enchantable` component. 26.4 has the same armour and tool API as 26.3; the only difference met, `Equippable.equipSound()` returning an `Optional`, is a GameTest-only seam. Without `repair_items` the repair tag is the unfilled `<ns>:msm_repairs/<item path>`. The sample mod's equipment element is `ruby_armor` (ids are unique across kinds). Originally proposed (2026-11-05). Amended the same day by [ADR 0044](0044-gear-weapons-and-consumables.md) D5: `ArmorSlot` gains `horse` and `wolf` (0.8.0, B186–B187), using the equipment layers `horse_body` and `wolf_body`. Record here: the 26.3 and 26.4 class differences found, the per-slot durability multipliers verified from `ArmorType.getDurability`, and whether `#[id(registry=..., tags="required")]` is the right mcdoc attribute for a tag-only string in the vendored symbol format. B180 (2026-11-05): `tags="required"` is the vendored format's own attribute for a `#`-prefixed tag reference (vanilla-mcdoc uses it 11 times on 26.3); `tools/build-msm-mcdoc` exports it and `validateJson` accepts it without a normaliser change (the registry index checks `#x` against `tag/<registry>` as a warning; the `#` prefix itself is enforced by the runtime Codec, not by `validateJson`). `javap` over the Loom-cached 26.3 and 26.4-snapshot-7 jars: `ArmorMaterials` has the same nine constants on both, and `ArmorType` unit durabilities are helmet 11, chestplate 16, leggings 15, boots 13 (body 16) on both.
