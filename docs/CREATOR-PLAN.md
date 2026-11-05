# Creator and gear plan — v0.7.0 (briefs B180–B185) and v0.8.0 (B186–B191)

Working plan for armour and custom tool materials ([ADR 0042](adr/0042-armour-and-custom-tool-materials.md)), the Creator ([ADR 0043](adr/0043-creator-guided-flows.md)) and, for 0.8.0, the other gear and content types ([ADR 0044](adr/0044-gear-weapons-and-consumables.md): weapons, consumables, totems, horse and wolf armour, enchantments, paintings, music discs, the vanilla component passthrough), the sibling of [AI-HELPER-PLAN.md](AI-HELPER-PLAN.md). `DESIGN.md` stays authoritative; when this plan and an ADR disagree, the ADR wins. Deleted when the release that ships the Creator is closed (history goes to `DEVLOG.md`).

Written 2026-11-05 by the orchestrator. Both plans run interleaved: the armour waves share no file with the AI helper waves and may run beside them; the Creator UI runs after the AI helper's renderer briefs because it reuses their changeset and touches the same app files. B154 (commit 0f44510) and B156 (commit 4eac9f6) landed on 2026-11-05 while this plan was written, so the library and app files they owned are free; B183 builds on B156's wizard model and `custom-sword.ts` as landed.

## Facts (2026-11-05)

| Fact | Value | Source |
|---|---|---|
| Armour classes (26.3) | `ArmorMaterial(int durability, Map<ArmorType,Integer> defense, int enchantmentValue, Holder<SoundEvent> equipSound, float toughness, float knockbackResistance, TagKey<Item> repairIngredient, ResourceKey<EquipmentAsset> assetId)`, `createAttributes(ArmorType)`; `ArmorType` `HELMET, CHESTPLATE, LEGGINGS, BOOTS, BODY`, `getDurability(int)`; `ArmorMaterials` `LEATHER, COPPER, CHAINMAIL, IRON, GOLD, DIAMOND, TURTLE_SCUTE, NETHERITE, ARMADILLO_SCUTE`; `Item.Properties.humanoidArmor(ArmorMaterial, ArmorType)`, `repairable(Item \| TagKey<Item>)`, `equippable(EquipmentSlot)`; `EquipmentAssets.ROOT_ID`, `createId(String)`; `Equippable.Builder` (`setAsset`, `setEquipSound`, …) | `javap` over `/root/.gradle/caches/fabric-loom/26.3/minecraft-merged.jar` |
| Tool classes (26.3) | `ToolMaterial(TagKey<Block> incorrectBlocksForDrops, int durability, float speed, float attackDamageBonus, int enchantmentValue, TagKey<Item> repairItems)`, constants `WOOD … NETHERITE`; `Item.Properties.sword/pickaxe/axe/shovel/hoe(ToolMaterial, float, float)` | same |
| Equipment assets | `assets/<ns>/equipment/<name>.json`: `{ layers: { humanoid: [{ texture }], humanoid_leggings: [{ texture }], humanoid_baby? … }, trim_overrides? }` (`::java::assets::equipment::Equipment`); `texture` is a texture id under `entity/equipment/humanoid/` and `entity/equipment/humanoid_leggings/`; registry `equipment` exists in the 26.3 registries; `EquipmentSlot` values `mainhand, offhand, head, chest, legs, feet, body, saddle` | vendored 26.3 mcdoc symbols and registries |
| Today's format | `ItemComponents` = `msm:food`, `msm:tool { type, tier }`, `msm:durability`, `msm:on_use`; `ToolTier` enum of seven; runtime `MsmRegistrar.tool` maps the enum to `ToolMaterial` constants with fixed base attack values (sword 3.0/-2.4, axe 6.0/-3.1, pickaxe 1.0/-2.8, shovel 1.5/-3.0, hoe -2.0/-1.0); `java-project/items.ts` `ITEM_COMPONENTS` and `TOOL_TIERS` mirror it; the placeholder generator has patterns `plain, ore, gem, disc, egg, sword` | repository |
| Library | `starter(...)` helper, `content/parameters.ts` (`NAME_PATTERN`, `idFromName`, `nameForms`, `rgbFromHex`), `content/bundle.ts` (`element`, `texture`, `skinTexture`), `content/entities.ts` (`bipedGeometry`); starters `custom-ore`, `custom-sword` (B156), `custom-mob`, `scripted-ore` and nine others; `ContentBundleElement` carries `notes` and `tags`; `Element.meta` has `notes`, `tags` | repository |
| Runtime tests | `MsmRuntimeGameTest.itemProperties` and friends; JUnit corpus test over `packages/schemas/mcdoc/msm/conformance/definition/`; `parity/SampleModParityTest` (11 tests) | repository |
| 26.3 gear classes (ADR 0044) | `Item.Properties`: `food(FoodProperties)`, `food(FoodProperties, Consumable)`, `useCooldown(float)`, `usingConvertsTo(Item)`, `spear(ToolMaterial, float ×9)`, `horseArmor(ArmorMaterial)`, `wolfArmor(ArmorMaterial)`, `nautilusArmor`, `jukeboxPlayable(ResourceKey<JukeboxSong>)`, `trimMaterial(ResourceKey<TrimMaterial>)`, `component(DataComponentType<T>, T)`, `delayedHolderComponent(...)`, `enchantable(int)`, `attributes(ItemAttributeModifiers)`; `BowItem(Properties)`, `CrossbowItem(Properties)`, `ProjectileWeaponItem.shootProjectile(LivingEntity, Projectile, int, float, float, float, LivingEntity)` (protected); `MaceItem(Properties)`, `createAttributes()`, `createToolProperties()`; `ShieldItem(Properties)`; `Consumable(float, ItemUseAnimation, Holder<SoundEvent>, boolean, List<ConsumeEffect>)`, `Consumables.DEFAULT_DRINK`; `ApplyStatusEffectsConsumeEffect(List<MobEffectInstance>, float)`; `DeathProtection(List<ConsumeEffect>)`; `DataComponentType.codecOrThrow()`; `MobEffect` is a code registry; vanilla items `WOODEN_SPEAR`…`NETHERITE_SPEAR`, `MACE`, `TRIDENT`, `SHIELD`, `TOTEM_OF_UNDYING` | `javap` over the 26.3 merged jar |
| 26.3 data (ADR 0044) | Component types include `consumable`, `use_cooldown`, `use_remainder`, `death_protection`, `blocks_attacks`, `weapon`, `kinetic_weapon`, `piercing_weapon`, `attack_range`, `minimum_attack_charge`, `attack_animation`, `glider`, `jukebox_playable`, `provides_trim_material`, `provides_banner_patterns`; `consume_effect_type` `apply_effects, clear_all_effects, play_sound, remove_effects, teleport_randomly`; mcdoc dispatcher `minecraft:data_component` with 127 members; item tags `spears`, `swords`, `trim_materials`, `trimmable_armor`, `enchantable/{bow, crossbow, mace, lunge, melee_weapon, sharp_weapon, weapon, armor, …}`; `tag/painting_variant` `placeable`; equipment layers `humanoid`, `humanoid_leggings`, `humanoid_baby`, `wings`, `wolf_body`, `horse_body`, `llama_body`, `happy_ghast_body`, `nautilus_body` and saddles; `recipe_type` `smithing`; generic MSM kinds already exist for `enchantment`, `damage_type`, `jukebox_song`, `banner_pattern`, `painting_variant`, `trim_material`, `trim_pattern` | vendored 26.3 registries and mcdoc; `packages/plugins/datapack/src/kinds/generic.ts` |

Unverified, "(verify at implementation)": per-slot durability multipliers (`ArmorType.getDurability`), whether `ArmorMaterial` and `ToolMaterial` are unchanged on 26.4-snapshot-7 (B151's table did not list them), the mcdoc attribute for a tag-only id string in the vendored symbol format, the vanilla item tags a tool or armour piece must join on 26.3 (`minecraft:swords`, `pickaxes`, `axes`, `shovels`, `hoes`, `head_armor`, `chest_armor`, `leg_armor`, `foot_armor`, `enchantable/*`), the humanoid armour layer UV layout for the preview geometry.

## Waves

| Wave | Brief | Owns | Depends on |
|---|---|---|---|
| A (now) | B180 format: MSM mcdoc armour and tool material, corpus, `minecraft:equipment` kind, blocks-items lowering, validators and templates, target facts, plugin API additions (`TargetFacts.items`, `ProjectStarter.creator`, `set` parameter), core `ElementMeta.creator` | `packages/schemas/mcdoc/msm/**`, `packages/schemas/src/msm/**`, `packages/schemas/test/msm-conformance.test.ts`, `packages/plugin-api/src/{target,library}.ts` and its tests and `CHANGELOG.md`, `packages/core/src/model/project.ts` and `packages/core/test/model*.test.ts`, `packages/plugins/blocks-items/**`, `packages/plugins/resourcepack/**`, `packages/targets/mc-26.3/src/target.ts`, `packages/targets/mc-26.4/src/target.ts` and their `target.test.ts`, `packages/targets/*/test/schema-coverage.test.ts` | — |
| A (now) | B181 runtime: `msm:armor`, custom tool materials, attack overrides, GameTests, 26.4 seam if needed | `engine-mod/` except `parity/`, `fixtures/sample-mod/` is **not** touched (B182) | the mcdoc text of ADR 0042 (B180 lands the corpus first; B181 reads the ADR) |
| B | B182 eject generator, sample mod fixture, parity, exporter goldens | `packages/targets/mc-26.3/src/java-project/**` and its tests and fixtures, `fixtures/sample-mod/**`, `engine-mod/parity/**`, `packages/exporters/test/sample-mod*.test.ts` and `test/fixtures/*/sample-mod*`, `tools/run-fabric-server/` (only if the server check needs a new assertion) | B180, B181 |
| C | B183 library: placeholder patterns and armour layers, the Gear set, Simple block, Food and Scripted behaviour flows, `creator` on Custom ore and Custom mob, the `set` parameter in the wizard model, mirror and counts (lockfile owner if needed) | `packages/plugins/library/**`, `examples/`, `packages/exporters/test/library.test.ts`, `app/src/renderer/src/components/wizard/**` (the `set` field only) and `app/test/components/wizard*.test.tsx`, `pnpm-lock.yaml` | B180 |
| D | B184 Creator UI: dialog, live preview, bundle asset source, humanoid armour preview, reopen rule, `meta.creator` stamping, wiring | `app/src/renderer/src/components/creator/` (new), `app/src/renderer/src/preview/**`, `app/src/renderer/src/changeset/creator-sets.ts` (new), `app/src/renderer/src/session/project-session.ts` (`applyChangeset` meta stamping only, after B172), `components/Toolbar.tsx`, `components/EditorArea.tsx`, `components/NewProjectDialog.tsx` (the welcome link only), `commands/built-in-commands.ts`, `App.tsx`, `app/test/components/creator*.test.tsx`, `app/test/preview/**`, `app/test/creator-sets.test.ts` | B183, B172, B173 |
| E | B185 Creator tests, e2e `creator-path`, guide pages, armour in the guide | `app/test/creator-scenario.test.ts`, `app/e2e/creator-path.spec.ts`, `docs/guide/creator.md` (new), `docs/guide/blocks-and-items.md` (armour and custom tiers section), `docs/guide/templates-and-examples.md` (the new starters), `docs/site/.vitepress/config.ts` (one sidebar entry, coordinated with B175) | B184 |

**Interleaving with the AI helper plan.** B180 and B181 run now, beside B170 (and beside B154 and B156, whose files they do not touch). B182 runs with AI Wave B. B183 runs once B180 has landed (with AI Wave B or C). B184 runs after B173 and reuses B172's changeset. B185 runs with B174. B175 (docs and release 0.7.0) closes both plans and depends on B185; if B184 or B185 are not green when the AI helper and armour are, 0.7.0 ships without the Creator and the Creator becomes 0.8.0 (B175 then removes the Creator from the 0.7.0 CHANGELOG section and this plan stays). B171 reserves the menu command and File item for the Creator (`creator`, "Create…") so B184 touches no main or shared file.

### Fixed names

- **Schema** (ADR 0042 D1, D3): component `msm:armor`, structs `Armor`, `ArmorMaterial`, `ToolMaterial`, enums `ArmorSlot`, `ArmorMaterialName`; `Tool.attack_damage`, `Tool.attack_speed`. Conformance files `item-armor-helmet.json`, `item-armor-custom-material.json`, `item-tool-custom-material.json`, `item-tool-attack-overrides.json` (valid); `item-armor-and-tool.json` (invalid: both components; the validator, not the schema, reports it, so it is a plugin test, not a corpus case), `item-armor-bad-slot.json`, `item-armor-material-missing-asset.json`, `item-tool-material-negative-speed.json` (invalid).
- **Kinds and codes**: `minecraft:equipment` (resourcepack plugin, folder `equipment`, category "Models" group "Equipment", template `equipment-humanoid`); validator codes `blocks-items.unknown-armor-material`, `blocks-items.unknown-equipment-asset`, `blocks-items.component-conflict`.
- **Target facts**: `TargetFacts.items?: { armorMaterials: readonly string[] }`; 26.3 and 26.4 list the nine names of the facts table (26.4: verify).
- **Plugin API** (1.1.0, additive): `ProjectStarter.creator?: { group: 'gear' | 'blocks' | 'food' | 'mobs' | 'scripts'; blurb: string }`; `StarterParameter` `type: 'set'` with `choices: { value; label }[]`, `default: string[]`, `min?: number`; `BundleContext.values` carries `string[]` for it (`ParameterValues` union grows). `ElementMeta.creator?: { flowId: string; setId: string; values: Record<string, string | number | boolean | string[]>; generatedId: string }`.
- **Runtime**: `ItemComponents.Armor(slot, material)` with `ArmorMaterialSpec` (name or record), `ItemComponents.ToolMaterialSpec`, `Tool(type, tier: ToolTierSpec, attackDamage: Optional<Float>, attackSpeed: Optional<Float>)`; `MsmRegistrar.armor(...)`; GameTests `armorHelmetProperties`, `armorCustomMaterial`, `armorDurabilityOverride`, `customToolMaterialMinesAndRefusesDrops`, `toolAttackOverrides` in `MsmRuntimeGameTest`; test definitions under `src/gametest/resources/msm/msm_test/item/` and `assets/msm_test/equipment/`.
- **Sample mod**: `sample_mod:ruby_helmet` (`msm:armor`, slot helmet, custom material, `equipment_asset: sample_mod:ruby`), `sample_mod:ruby_pickaxe` (custom `ToolMaterial` mining like diamond, `attack_speed` override), `sample_mod:ruby` equipment element, textures `textures/entity/equipment/humanoid/ruby.png` and `humanoid_leggings/ruby.png`; parity tests `rubyHelmetIsArmor`, `rubyPickaxeMaterial`.
- **Library**: patterns `pickaxe`, `axe`, `shovel`, `hoe`, `helmet`, `chestplate`, `leggings`, `boots`, `ingot` (16x16) and `armor_layer_1`, `armor_layer_2` (64x32, `armorLayerPng(layer, colour)`); starters `gear-set` ("Gear set"), `simple-block` ("Simple block"), `food` ("Food"), `scripted-item` ("Scripted behaviour") with the parameter ids of ADR 0043 D2 (`material_name`, `colour`, `material_source`, `tier`, `custom_durability`, `custom_speed`, `custom_attack_damage_bonus`, `custom_enchantment_value`, `mines_like`, `armor_base`, `armor_durability`, `defense_helmet`, `defense_chestplate`, `defense_leggings`, `defense_boots`, `toughness`, `knockback_resistance`, `pieces`); ids from `idFromName(material_name)`.
- **UI**: `CreatorDialog` (`data-testid="creator-dialog"`), flow cards `creator-flow-<id>`, group headings `creator-group-<group>`, field inputs `param-<id>` (as the wizard), preview tabs `creator-tab-items|blocks|recipes|armour|stats|elements`, element rows `creator-element-<id>` (conflict badge `creator-conflict-<id>`), kept-edits rows `creator-kept-<id>` with toggle `creator-overwrite-<id>`, buttons "Create" `creator-create`, "Cancel" `creator-cancel`; toolbar button `toolbar-creator` ("Create…"), menu File > "Create…" (`MENU_COMMANDS` `creator`, added by B171), palette id `creator` ("Create with the Creator…"), editor header button `editor-edit-in-creator` ("Edit in Creator", shown only for elements with `meta.creator`); undo labels "Create <flow title>" and "Update <flow title>".

## Verification

As in the AI helper plan: clean worktree, `pnpm install --frozen-lockfile --offline`, `npx tsc -b`, `npx biome ci .`, `node tools/check-deps/index.ts`, `node tools/build-msm-mcdoc/index.ts --check`, `node_modules/.bin/turbo run test --force`. Engine-mod briefs: `cd engine-mod && JAVA_HOME=/root/jdk/jdk-25.0.5+8 ./gradlew build` and `./gradlew build -Pmc=26.4`, `./gradlew -p parity build` for both. Library: `UPDATE_GOLDENS=1 pnpm --filter @msm/exporters test` once, then without. App: `pnpm build`, smoke, e2e, `dist:dir` and `node tools/check-size/index.ts`.

---

## Wave A

### B180 — Format: armour, custom tool materials, equipment kind, API additions

**Owns:** see the table. Must not touch `packages/plugins/library/`, `engine-mod/`, `fixtures/`, `app/`.

**Scope:**

1. `definition.mcdoc`: ADR 0042 D1 and D3 verbatim (adjust the tag-id attribute to what `tools/build-msm-mcdoc` and `validateJson` support today; if a tag-only string needs a new attribute, add it to the schema normaliser with a test and record it); `element.mcdoc` unchanged (the element spreads the definition). `node tools/build-msm-mcdoc/index.ts`; the corpus cases of the fixed names with `expected-errors.json`; `msm-conformance.test.ts` green.
2. `@msm/plugin-api` 1.1.0: `TargetFacts.items`, `ProjectStarter.creator`, `StarterParameter` `set`, `ParameterValues` with `string[]`; JSDoc, type tests, `CHANGELOG.md` entry, `API_VERSION` `1.1.0`; every built-in plugin's `^1.0.0` range still satisfies it (no plugin edits).
3. `@msm/core`: `ElementMeta.creator` (optional; `createElement` input takes it; load and save round-trip it; sorted keys), tests.
4. `@msm/plugin-resourcepack`: kind `minecraft:equipment` with its template and lowering goldens for both targets; the kind count moves to 60 wherever a test counts.
5. `@msm/plugin-blocks-items`: `lowering/item.ts` passes the new fields through to the definition (nothing else lowers for armour); `lowering/tools.ts` learns the object form (a custom material joins no `needs_<tier>` logic; `vanillaTierName` is unchanged); templates "Armour piece (helmet)" and "Tool with a custom material"; validators of the fixed names (`unknown-armor-material` against `target.items.armorMaterials`, skipped without the fact; `unknown-equipment-asset` against project `minecraft:equipment` elements plus the vanilla `equipment` registry; `component-conflict`); the `unknown-tool-tier` validator ignores the object form; tests and goldens per target.
6. Targets: `items: { armorMaterials: [...] }` on 26.3 (from the facts table, source comment) and 26.4 (same list, "(verify at implementation)" comment; B151's error table had no armour entry); schema coverage tests still report zero unsupported nodes for `msm:item` and `minecraft:equipment`.

**Acceptance:** `turbo run test --force` green; `build-msm-mcdoc --check` clean; `tsc -b`, Biome, check-deps clean; DEVLOG entry with the attribute decision and the kind and template counts (expected: 60 kinds, 119 templates).

**Out of scope:** runtime (B181), generator (B182), library (B183).

### B181 — Runtime: armour and custom tool materials

**Owns:** `engine-mod/` except `parity/`.

**Scope:**

1. `components/ItemComponents.java`: `Armor`, `ArmorMaterialSpec` (either a vanilla name mapped to `ArmorMaterials.*` or a record of ADR 0042 D1), `ToolMaterialSpec` (name or record of D3), `Tool` with the optional overrides; Codecs aligned with the mcdoc (strict, unknown keys rejected as today); the JUnit corpus test passes over B180's cases (if B180 has not landed, write the cases locally from the ADR and reconcile when it lands).
2. `MsmRegistrar`: `armor(props, armor)` per ADR 0042 D5 (`humanoidArmor(material, type)`; the repair tag `TagKey.create(Registries.ITEM, id)` or, when absent, an empty project-specific tag; equip sound by id from `BuiltInRegistries.SOUND_EVENT` with a warning and the generic sound when unknown; `ResourceKey.create(EquipmentAssets.ROOT_ID, Identifier.parse(asset))`); `tool()` builds `new ToolMaterial(...)` for the record form and applies the overrides; `msm:durability` after both. Armour and tool on one item: the runtime logs an error and registers neither component (the app's validator blocks export anyway).
3. 26.4: `./gradlew build -Pmc=26.4`; put any differing class behind a seam in `src/mc/<mc>/` (record which, if any).
4. GameTests of the fixed names with definitions under the test resources (a helmet with a custom material, a chestplate with `iron`, a durability override, a custom-material pickaxe with `incorrect_blocks_for_drops: #minecraft:incorrect_for_diamond_tool` that mines obsidian for drops at its speed and a stone-level one that does not, a sword with `attack_damage: 9`): assert the `equippable` component's slot and asset, the attribute modifiers (`armor`, `armor_toughness`, `knockback_resistance`), `max_damage`, `repairable`, mining through `BlockState.getDestroyProgress`/`isCorrectToolForDrops` (verify names), and the attack attributes.
5. `engine-mod/CLAUDE.md` contents line for the new components.

**Acceptance:** `./gradlew build` and `./gradlew build -Pmc=26.4` green with the new GameTests counted (paste counts); `-PwithoutGeckolib` unchanged; DEVLOG entry with the 26.4 findings and the verified Mojang names.

**Out of scope:** parity and the sample mod (B182).

## Wave B

### B182 — Eject generator, sample mod, parity, goldens

**Owns:** see the table.

**Scope:**

1. `java-project/items.ts`: `msm:armor` → `humanoidArmor(ArmorMaterials.X, ArmorType.Y)` or a `private static final ArmorMaterial <NAME>_ARMOR = new ArmorMaterial(...)` constant in `ModItems.java` (defense map with `Map.of(ArmorType.HELMET, n, …)`, the sound holder, the repair tag, the asset key); tool materials as `ToolMaterial` constants; attack overrides; `ITEM_COMPONENTS` updated; `onlyKeys` lists updated; generator goldens from the runtime's GameTest definitions as the existing ones.
2. `fixtures/sample-mod/`: the fixed-name elements and textures (placeholders from the library's generator, committed as PNGs as the fixture's other textures are), `README.md` in-game steps (wear the helmet: the model shows; the pickaxe mines obsidian); exporter goldens (`UPDATE_GOLDENS` where the sample tests support it, else regenerate the SHA-256 by hand and paste the diff) for both targets; the server check in `tools/run-fabric-server` asserts the registration line still appears (add an assertion for the armour item if the runtime logs item counts).
3. `parity/`: `SampleModParityTest.rubyHelmetIsArmor` (equippable slot and defence from the item's components) and `rubyPickaxeMaterial` (mining speed and drops on obsidian through a black-box check: place obsidian, break with the pickaxe through a command or the test helper, observe the drop); both pass on the content jar and the ejected jar; `./gradlew -p parity build` for 26.3 and 26.4.

**Acceptance:** generator goldens and the ejected `sample-mod` build locally (`./gradlew build` inside the exported tree, as CI does); parity 13 tests green on both jars; exporter tests green for both targets; `./gradlew -p parity build -Pmc=26.4` green; DEVLOG entry.

**Out of scope:** the library (B183).

## Wave C

### B183 — Library: patterns, flows, `creator` flags, the `set` field

**Owns:** see the table. Starts when B180 has landed.

**Scope:**

1. `assets/png.ts`: the eleven patterns of the fixed names (hand-drawn pixel masks, each a 16x16 or 64x32 boolean grid in the source with a shading rule from the base colour as the `sword` pattern does; `PLACEHOLDER_PATTERNS` and the README table updated; `armorLayerPng(layer: 1 | 2, colour)`); tests compare each pattern against a golden PNG under `test/fixtures/` and check sizes.
2. Starters per ADR 0043 D2 with the fixed parameter ids and `creator` groups: `gear-set.ts` (including `upgrade_from` of [ADR 0044](adr/0044-gear-weapons-and-consumables.md) D6: a choice of vanilla base materials, a smithing template `msm:item` with a placeholder texture and one `minecraft:recipe` of type `smithing_transform` per piece in place of the crafting recipes, validated against the target's recipe schema; the item tags and recipes checked against the target's vendored tags and recipe schema; `supports` requires `msm:item`, `msm:mod`, `minecraft:equipment`, `minecraft:recipe`, `minecraft:tag/item`, `minecraft:lang`, `minecraft:model`), `simple-block.ts`, `food.ts`, `scripted-item.ts` (script lines generated from a template string per behaviour, type-checked by the library test through the scripting plugin's typings as the Scripted ore starter is); `creator` on `custom-ore.ts` and `custom-mob.ts`; `custom-sword.ts` unchanged (it may adopt the attack overrides later). Every flow's defaults and one alternative value set build, validate with zero problems and export on every supported target (`library.test.ts`); the `examples/` mirror regenerated (`UPDATE_GOLDENS=1`), `examples/README.md` rows, counts reported (expected 18 starters).
3. Wizard: `wizard-model.ts` validates `set` (at least `min` chosen) and `ParameterField` renders it as a checkbox list (`param-<id>` on the group, `param-<id>-<value>` per box); tests.

**Acceptance:** `pnpm --filter @msm/plugin-library test`, `pnpm --filter @msm/exporters test`, `pnpm --filter @msm/app test` pass; the mirror equals the generated projects; `tsc -b`, Biome, check-deps clean; DEVLOG entry with the labels and parameter ids (B184 and B185 copy them).

**Out of scope:** the Creator UI (B184).

## Wave D

### B184 — Creator UI, live preview, reopen rule

**Owns:** see the table. Starts when B173 has landed (it shares `App.tsx`, `Toolbar.tsx`, `EditorArea.tsx` and `built-in-commands.ts` with B173, and uses B172's `changeset/`).

**Scope:**

1. `changeset/creator-sets.ts`: `bundleToChangeItems(bundle, project, { flowId, setId, values })` (reusing the AI executor's `add_starter` conversion; stamps `meta.creator`), `reopenPlan(project, flow, storedValues, newValues, target)` implementing ADR 0043 D4 (recompute the previous bundle, classify each current element as untouched, edited or missing, build items: replace, keep, remove, create; assets by bytes), `applyChangeset` in the session stamps `meta.creator` from the items (one line in `project-session.ts` after B172) and the rename command keeps `meta` (verify; add a test).
2. `preview/`: a bundle-backed `AssetSource` (textures from bundle bytes as `data:` URLs, models from bundle elements, then the project, then the vanilla cache); `preview/geo/armour.ts`: a humanoid geometry written from scratch with the vanilla humanoid armour UV layout (verify at implementation) rendered by the existing geo renderer with the layer textures (helmet, chestplate and boots from layer 1, leggings from layer 2); the recipe grid component extracted from the Recipe Studio into `components/recipe-grid/` if it is not already reusable.
3. `components/creator/`: `CreatorDialog` with the fixed test ids per ADR 0043 D3 (flow picker, fields through `ParameterField`, debounced rebuild (150 ms, latest wins), the six preview tabs, conflicts, "Create"); "Edit in Creator" on the editor header for elements with `meta.creator` (opens the dialog on that flow with the stored values; the elements tab shows the reopen plan with "Kept your edits" rows and the overwrite toggles); undo labels of the fixed names. Flows from `session.library.starters.filter((s) => s.creator)`, in groups, hidden when `supports` fails on the project's target with the reason.
4. Wiring: toolbar "Create…" (`toolbar-creator`), the menu command `creator` (reserved by B171), the palette id `creator`, the empty-project welcome line in `NewProjectDialog` ("or Create something with the Creator").
5. Tests: `creator-sets` (bundle to items with meta; reopen classification for untouched, edited, renamed, removed and new pieces; one undo step on apply); preview asset source and the armour geometry (bakes, UVs within the texture); `CreatorDialog` (flow picker lists groups; changing a field updates the elements tab within the debounce; conflicts shown; Create calls apply with the right label; Edit in Creator loads values and shows kept edits); `App.test.tsx` wiring.

**Acceptance:** `pnpm --filter @msm/app test` passes; `pnpm build`; smoke; a manual run creates a Gear set in a blank project, exports the Fabric mod jar with zero problems, edits a sword by hand, reopens the set with another colour and keeps the sword (paste the elements tab text); `dist:dir` and `node tools/check-size/index.ts` within budget; DEVLOG entry with labels and test ids.

**Out of scope:** e2e and the guide (B185).

## Wave E

### B185 — Creator tests, e2e, guide pages

**Owns:** see the table.

**Scope:**

1. `creator-scenario.test.ts`: through the real session and `creator-sets`: a Gear set with defaults applies as one undo step and the project exports resource pack, data pack and Fabric content jar (stub runtime) with zero blocking problems; reopening with a different colour replaces untouched pieces and keeps an edited one; the AI helper's `add_starter('gear-set', …)` produces items with `meta.creator` that reopen in the Creator.
2. `creator-path.spec.ts`: blank project; toolbar "Create…"; pick "Gear set"; set `material_name` to "Sapphire"; the Items tab shows nine item previews and the Armour tab renders (SwiftShader as `entities-path`); untick `hoe`; Create; the sidebar lists the sapphire pieces; Problems shows no errors; open the sword's Raw JSON and change `attack_damage` to 9; "Edit in Creator" on the helmet; change the colour; the elements tab lists the sword under "Kept your edits"; Create; the sword keeps 9 and the helmet's texture changed (compare the asset bytes through the project folder); export the Fabric mod jar and assert `msm/sapphire/item/sapphire_helmet.json` and `assets/sapphire/equipment/sapphire.json` are in the jar; Undo twice restores the blank project.
3. Guide `creator.md` (what the Creator makes, each flow and its fields, the live preview tabs, Create and Undo, Edit in Creator and the kept-edits rule, replacing placeholders, how the AI helper uses the same flows); `blocks-and-items.md` gains "Armour" and "Custom tool materials" sections (the components, the equipment element and textures, the vanilla material names, the custom tier's `mines_like`, the in-game check); `templates-and-examples.md` lists the new starters and templates; the sidebar entry.

**Acceptance:** e2e passes three times in a row (timings); every label in the guide pages exists in the code (grep); `pnpm --filter @msm/site build`; DEVLOG entry.

---

## 0.8.0 — gear, weapons and consumables (ADR 0044, briefs B186–B191)

Chosen for beginners, by value against cost (facts in the tables above; reasons in ADR 0044 D8 for what is deferred):

| Type | What ships | Runtime work | Flow | Version |
|---|---|---|---|---|
| Smithing upgrades | Gear set `upgrade_from` (template item, `smithing_transform` recipes) | none | Gear set option | 0.7.0 (B183) |
| Vanilla component passthrough | `msm:components` validated by the `minecraft:data_component` dispatcher | decoder over `codecOrThrow` with `RegistryOps`, delayed holders for `jukebox_playable`, `provides_trim_material`, `trim` | used by Music disc and trim material | 0.8.0 |
| Food with effects, drinks, charms | `msm:consumable`, action `apply_effect` | `food(FoodProperties, Consumable)`, `use_cooldown`, `use_remainder` | Consumable | 0.8.0 |
| Spear, mace | `ToolType` `spear`, `mace` | `props.spear(material, constants)`, `MsmMaceItem extends MaceItem` | Weapon; Gear set pieces | 0.8.0 |
| Bow, crossbow | `msm:ranged_weapon` | `MsmBowItem`, `MsmCrossbowItem` overriding `shootProjectile` | Weapon; Gear set pieces | 0.8.0 |
| Shield | `msm:shield` → `blocks_attacks` | component only (GameTest decides whether `ShieldItem` is needed) | Weapon; Gear set piece | 0.8.0 |
| Totem-like items | `msm:death_protection` | component only | Totem | 0.8.0 |
| Horse and wolf armour | `ArmorSlot` `horse`, `wolf` | `horseArmor`, `wolfArmor` | Gear set pieces | 0.8.0 |
| Trim material | Gear set `trim_material` (kind exists; `provides_trim_material` through the passthrough, `trim_materials` tag) | passthrough | Gear set option | 0.8.0 |
| Enchantment | kind exists; effect templates | none | Enchantment | 0.8.0 |
| Painting | kind exists; `image` parameter; `placeable` tag | none | Painting | 0.8.0 |
| Music disc item | kind and starter exist; real disc item via the passthrough | passthrough (delayed holder) | Music disc | 0.8.0 |
| Deferred | trident-style throwables and custom projectiles (thrown entity rendering), custom status effects (code registry, needs a tick hook), trim patterns (per-layer textures), banner patterns (niche), gliders (reachable through the passthrough, no flow) | — | — | post-1.0 |

### Waves

| Wave | Brief | Owns | Depends on |
|---|---|---|---|
| F | B186 format and plugins: ADR 0044 D1–D5 and D7 in the mcdoc and corpus, `msm:components` through the dispatcher, blocks-items lowering, validators (`component-conflict` sets) and templates (bow, shield, drink, totem, spear), the `apply_effect` action, `image` parameter in the plugin API, datapack `smithing_transform` template if missing | `packages/schemas/mcdoc/msm/**`, `packages/schemas/src/msm/**` and tests, `packages/plugin-api/src/library.ts` and tests and `CHANGELOG.md` (1.2.0), `packages/plugins/blocks-items/**`, `packages/plugins/datapack/src/templates/recipes.ts` and its test | B180 landed |
| F | B187 runtime: components and Codecs, passthrough decoder, `MsmBowItem`, `MsmCrossbowItem`, `MsmMaceItem`, spear constants, horse and wolf armour, `apply_effect`, GameTests, 26.4 seams | `engine-mod/` except `parity/` | B181 landed (reads ADR 0044 for the shapes) |
| G | B188 eject generator, sample mod (a bow, a drink, a charm, horse armour), parity, goldens | `packages/targets/mc-26.3/src/java-project/**` and tests, `fixtures/sample-mod/**`, `engine-mod/parity/**`, `packages/exporters/test/sample-mod*` and goldens | B182, B186, B187 |
| G | B189 library: silhouettes `bow`, `crossbow`, `shield`, `spear`, `mace`, `bottle`, `totem`, `smithing_template`, `horse_armor`, `wolf_armor` layer patterns and a painting placeholder; flows Weapon, Consumable, Totem, Enchantment, Painting, Music disc; Gear set pieces and `trim_material`; mirror and counts | `packages/plugins/library/**`, `examples/`, `packages/exporters/test/library.test.ts`, `app/src/renderer/src/components/wizard/**` (the `image` field) and its tests | B183, B186 |
| H | B190 Creator additions: the `image` field with `platform.dialogs.pickFiles` and PNG checks, previews for paintings (the image at its size), enchantments (description and level table), consumables (effects list), weapons (stats); Gear set preview of the new pieces | `app/src/renderer/src/components/creator/**`, `app/src/renderer/src/preview/**` (asset source for painting textures), `app/test/components/creator*.test.tsx` | B184, B189 |
| I | B191 tests, e2e (`creator-path` extended: a Weapon and a Painting), guide pages (Creator flows, `blocks-and-items.md` sections for weapons, consumables, totems, the passthrough), CHANGELOG, release 0.8.0 close (ADR 0044 accepted, plan deleted) | `app/test/creator-scenario.test.ts`, `app/e2e/creator-path.spec.ts`, `docs/guide/**`, `docs/site/.vitepress/config.ts`, `CHANGELOG.md`, versions, `docs/DESIGN.md`, `docs/ROADMAP.md`, ADR 0044 Status, status lines | B188, B190 |

Fixed names for 0.8.0: components `msm:components`, `msm:consumable`, `msm:ranged_weapon`, `msm:shield`, `msm:death_protection`; structs `Consumable`, `ConsumeEffect`, `RangedWeapon`, `Shield`, `DeathProtection`; tool types `spear`, `mace`; armour slots `horse`, `wolf`; action `apply_effect`; validator code `blocks-items.component-conflict` (reused; the message names the two components); runtime classes `MsmBowItem`, `MsmCrossbowItem`, `MsmMaceItem`, `ComponentPassthrough`; GameTests `bowShootsFasterArrows`, `crossbowDamageMultiplier`, `shieldBlocks`, `spearProperties`, `maceProperties`, `drinkAppliesEffects`, `charmCooldown`, `totemProtects`, `horseArmorRegistered`, `passthroughGlider`, `passthroughRejectsDynamicHolder`; starters `weapon` ("Weapon"), `consumable` ("Consumable"), `totem` ("Totem"), `enchantment` ("Enchantment"), `painting` ("Painting"), `music-disc-item` ("Music disc"; the existing `music-disc` starter stays for vanilla packs); Gear set parameter ids `upgrade_from`, `trim_material`; piece values `spear`, `mace`, `bow`, `crossbow`, `shield`, `horse_armor`, `wolf_armor`; `StarterParameter` `type: 'image'` with `maxBytes`, `maxSize`; Creator preview tabs unchanged, plus `creator-tab-card` for enchantment and painting cards; sample mod ids `sample_mod:ruby_bow`, `sample_mod:ruby_tonic`, `sample_mod:ruby_charm`, `sample_mod:ruby_horse_armor`; parity tests `rubyBowShoots`, `rubyTonicEffects`, `rubyCharmCooldown`.

Ordering: B186 and B187 start when B180 and B181 have landed (they reopen the same files), beside B183 and B184; 0.8.0 closes after 0.7.0. Whether 0.8.0 precedes the Phase 7 close (B160–B162) is the user's call at the 0.7.0 release.

## Risks

- **Mojang names on 26.4.** B151 did not probe armour (nor bows, maces, spears or consumables); B181 compiles both versions early and adds seams only where the compiler says so.
- **Tag-only ids in mcdoc.** If the vendored symbol format has no attribute for "a tag reference without `#`", B180 adds a small normaliser rule rather than widening the field to any string; the choice is recorded in ADR 0042's Status.
- **Hand-drawn silhouettes.** Eleven masks are work for an executor, not research; the test goldens pin them so later edits are deliberate.
- **Armour preview fidelity.** The humanoid geometry is a preview aid; the game is the reference (the guide says so, as it does for animations).
- **Reopen rule and generator changes.** A generator fix after a set was created makes old sets look "edited" for the changed pieces; the review shows the diff, and the user chooses. Acceptable for v1; a stored generator version in `meta.creator` is the follow-up if it bites.
- **Shared app files.** B184 waits for B173; if the AI helper slips, B184 is the one that moves, never the ownership.
