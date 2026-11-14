package dev.mcsupermods.runtime.loader;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonParser;
import dev.mcsupermods.runtime.components.BlockComponents;
import dev.mcsupermods.runtime.components.EffectComponents;
import dev.mcsupermods.runtime.components.ItemComponents;
import dev.mcsupermods.runtime.events.Action;
import dev.mcsupermods.runtime.events.EventDefinition;
import java.util.List;
import java.util.Optional;
import net.minecraft.resources.Identifier;
import org.junit.jupiter.api.Test;

/** Behaviour of the parser beyond the corpus: defaults, warnings and partial failures. */
class DefinitionParserTest {
    private static ParseResult<BlockDefinition> block(String json) {
        return DefinitionParser.parseBlock(JsonParser.parseString(json));
    }

    private static ParseResult<ItemDefinition> item(String json) {
        return DefinitionParser.parseItem(JsonParser.parseString(json));
    }

    private static ParseResult<EntityDefinition> entity(String extraComponents, String extra) {
        return DefinitionParser.parseEntity(JsonParser.parseString("{\"format\": 1, \"category\": \"creature\", "
                + "\"size\": {\"width\": 0.9, \"height\": 1.6}, " + extra + "\"components\": {" + extraComponents
                + "\"msm:animated_model\": {\"model\": \"t:entity/x\", \"texture\": \"t:entity/x\"}}}"));
    }

    @Test
    void entityDefaults() {
        ParseResult<EntityDefinition> result = entity("", "");
        assertEquals(List.of(), result.errors());
        assertEquals(List.of(), result.warnings());
        EntityDefinition def = result.definition().orElseThrow();
        assertEquals(EntityDefinition.Category.CREATURE, def.category());
        assertEquals(Optional.of(EntityDefinition.SpawnEgg.DEFAULT), def.spawnEgg());
        assertEquals(Optional.empty(), def.spawn());
        assertEquals(Optional.empty(), def.eyeHeight());
        assertEquals(20.0, def.components().maxHealth());
        assertEquals(dev.mcsupermods.runtime.components.EntityComponents.Movement.DEFAULT, def.components().movementOrDefault());
        assertEquals(List.of(), def.components().goals());
        assertEquals(0, def.components().animatedModel().transitionTicks());
        assertEquals(1.0f, def.components().animatedModel().scale());
        assertEquals(Optional.empty(), def.components().animatedModel().idle());
    }

    @Test
    void spawnDefaultsAndEggFalse() {
        EntityDefinition def = entity("", "\"spawn_egg\": false, \"spawn\": {\"biomes\": [\"#minecraft:is_forest\"], "
                + "\"weight\": 2, \"min_group\": 1, \"max_group\": 3}, ").definition().orElseThrow();
        assertEquals(Optional.empty(), def.spawnEgg());
        EntityDefinition.Spawn spawn = def.spawn().orElseThrow();
        assertEquals(EntityDefinition.Placement.ON_GROUND, spawn.placement());
        assertEquals(EntityDefinition.HeightmapType.MOTION_BLOCKING_NO_LEAVES, spawn.heightmap());
        assertEquals(EntityDefinition.Rule.MOB, spawn.rule());
        assertFalse(entity("", "\"spawn\": {\"biomes\": [\"#Bad Tag\"], \"weight\": 1, \"min_group\": 1, \"max_group\": 1}, ")
                .clean());
    }

    @Test
    void badGoalIsDroppedAndTheOthersStay() {
        ParseResult<EntityDefinition> result = entity("\"msm:ai_goals\": {\"goals\": [{\"type\": \"fly\"}, "
                + "{\"type\": \"wander\", \"priority\": 3}, {\"type\": \"flee\"}, {\"type\": \"look_around\"}]}, ", "");
        assertEquals(2, result.errors().size(), "errors: " + result.errors());
        assertTrue(result.errors().get(0).contains("goals[0]") && result.errors().get(0).contains("fly"), result.errors().get(0));
        assertTrue(result.errors().get(1).contains("goals[2]") && result.errors().get(1).contains("from"), result.errors().get(1));
        List<dev.mcsupermods.runtime.components.Goal> goals = result.definition().orElseThrow().components().goals();
        assertEquals(2, goals.size());
        assertEquals(new dev.mcsupermods.runtime.components.Goal.Wander(Optional.of(3), 1.0f, true), goals.get(0));
    }

    @Test
    void entityEventReferencesMustBeDeclared() {
        ParseResult<EntityDefinition> result = entity("\"msm:attack\": {\"damage\": 2, \"on_attack\": \"t:hit\"}, "
                + "\"msm:on_hurt\": {\"event\": \"t:ouch\"}, ", "");
        assertEquals(2, result.errors().size(), "errors: " + result.errors());
        assertTrue(result.definition().isPresent());
    }

    @Test
    void triggerableAnimationsCollectModelNamesAndPlayAnimationActions() {
        EntityDefinition def = DefinitionParser.parseEntity(JsonParser.parseString("""
                {"format": 1, "category": "monster", "size": {"width": 1, "height": 2},
                 "components": {"msm:animated_model": {"model": "t:entity/x", "texture": "t:entity/x", "idle": "idle", "attack": "hit"},
                                "msm:on_hurt": {"event": "t:ouch"}},
                 "events": {"t:ouch": {"actions": [{"type": "play_animation", "animation": "flinch"},
                                                   {"type": "play_animation", "animation": "spin", "controller": "extra"}]}}}
                """)).definition().orElseThrow();
        assertEquals(java.util.Map.of("msm_triggered", java.util.Set.of("idle", "hit", "flinch"), "extra", java.util.Set.of("spin")),
                def.triggerableAnimations());
    }

    @Test
    void playAnimationInBlocksAndItemsIsDroppedWithAWarning() {
        ParseResult<BlockDefinition> result = block("""
                {"format": 1, "components": {"msm:on_interact": {"event": "t:use"}},
                 "events": {"t:use": {"actions": [{"type": "play_animation", "animation": "wave"},
                                                  {"type": "give_item", "item": "minecraft:stick"}]}}}
                """);
        assertEquals(List.of(), result.errors());
        assertEquals(1, result.warnings().size());
        assertTrue(result.warnings().getFirst().contains("play_animation 'wave'"), result.warnings().getFirst());
        List<Action> actions = result.definition().orElseThrow().events().get(Identifier.parse("t:use")).orElseThrow().actions();
        assertEquals(List.of(new Action.GiveItem(Identifier.parse("minecraft:stick"), 1)), actions);
        ParseResult<ItemDefinition> itemResult = item("""
                {"format": 1, "components": {"msm:on_use": {"event": "t:use"}},
                 "events": {"t:use": {"actions": [{"type": "play_animation", "animation": "wave", "controller": "c"}]}}}
                """);
        assertEquals(1, itemResult.warnings().size());
        assertTrue(itemResult.definition().orElseThrow().events().get(Identifier.parse("t:use")).orElseThrow().actions().isEmpty());
    }

    @Test
    void blockDefaults() {
        BlockDefinition def = block("{\"format\": 1}").definition().orElseThrow();
        assertEquals(MsmSoundType.STONE, def.soundType());
        assertEquals(Optional.of(BlockDefinition.ItemSettings.DEFAULT), def.item());
        assertEquals(BlockComponents.NONE, def.components());
        assertTrue(def.events().byId().isEmpty());
        assertFalse(def.components().reactsToRedstone());
    }

    @Test
    void itemFalseMeansNoBlockItemAndItemTrueIsAnError() {
        assertEquals(Optional.empty(), block("{\"format\": 1, \"item\": false}").definition().orElseThrow().item());
        ParseResult<BlockDefinition> bad = block("{\"format\": 1, \"item\": true}");
        assertTrue(bad.definition().isEmpty());
        assertTrue(bad.errors().getFirst().contains("item"), bad.errors().toString());
    }

    @Test
    void newerFormatIsRejectedWithAnUpgradeHint() {
        ParseResult<BlockDefinition> r = block("{\"format\": 2, \"sound_type\": \"stone\"}");
        assertTrue(r.definition().isEmpty());
        assertEquals(1, r.errors().size());
        assertTrue(r.errors().getFirst().contains("format 2 is newer"), r.errors().toString());
    }

    @Test
    void unknownTopLevelKeysAndComponentsWarn() {
        ParseResult<ItemDefinition> r = item("{\"format\": 1, \"glint\": true, \"components\": {\"msm:future\": {}}}");
        assertTrue(r.clean(), r.errors().toString());
        assertEquals(List.of("unknown top-level key 'glint' ignored", "unknown component 'msm:future' ignored"), r.warnings());
    }

    @Test
    void unknownActionTypeDropsOnlyThatEvent() {
        ParseResult<BlockDefinition> r = block("""
                {"format": 1,
                 "components": {"msm:on_interact": {"event": "x:good"}},
                 "events": {
                   "x:bad": {"actions": [{"type": "explode", "power": 4}]},
                   "x:good": {"actions": [{"type": "give_item", "item": "minecraft:apple"}]}}}""");
        BlockDefinition def = r.definition().orElseThrow();
        assertEquals(1, r.errors().size());
        assertTrue(r.errors().getFirst().contains("explode"), r.errors().toString());
        assertTrue(def.events().contains(Identifier.parse("x:good")));
        assertFalse(def.events().contains(Identifier.parse("x:bad")));
    }

    @Test
    void undeclaredEventReferencesAreErrorsButTheDefinitionLoads() {
        ParseResult<BlockDefinition> r = block("""
                {"format": 1, "components": {"msm:on_step": {"event": "x:missing"}},
                 "events": {"x:a": {"actions": [{"type": "trigger_event", "event": "x:nope"}]}}}""");
        assertTrue(r.definition().isPresent());
        assertEquals(2, r.errors().size(), r.errors().toString());
    }

    @Test
    void actionDefaultsFollowD4() {
        ParseResult<BlockDefinition> r = block("""
                {"format": 1, "events": {"x:all": {"actions": [
                  {"type": "run_function", "function": "x:f"},
                  {"type": "spawn_particle", "particle": "minecraft:flame"},
                  {"type": "set_block_state", "state": "minecraft:stone"},
                  {"type": "give_item", "item": "minecraft:apple"},
                  {"type": "play_sound", "sound": "minecraft:block.note_block.bell"},
                  {"type": "trigger_event", "event": "x:all"}]}}}""");
        assertTrue(r.clean(), r.errors().toString());
        EventDefinition e = r.definition().orElseThrow().events().get(Identifier.parse("x:all")).orElseThrow();
        assertEquals(List.of(
                new Action.RunFunction(Identifier.parse("x:f")),
                new Action.SpawnParticle(Identifier.parse("minecraft:flame"), 1, 0.0f, 0.0f),
                new Action.SetBlockState("minecraft:stone", 0, 0, 0),
                new Action.GiveItem(Identifier.parse("minecraft:apple"), 1),
                new Action.PlaySound(Identifier.parse("minecraft:block.note_block.bell"), 1.0f, 1.0f),
                new Action.TriggerEvent(Identifier.parse("x:all"))), e.actions());
    }

    @Test
    void componentsDecode() {
        ItemDefinition def = item("""
                {"format": 1, "components": {
                  "msm:tool": {"type": "sword", "tier": "netherite"},
                  "msm:durability": {"max": 9},
                  "msm:food": {"nutrition": 2, "saturation": 0.1},
                  "msm:on_use": {"event": "x:e", "cooldown_ticks": 5}},
                 "events": {"x:e": {"actions": []}}}""").definition().orElseThrow();
        ItemComponents c = def.components();
        assertEquals(new ItemComponents.Tool(ItemComponents.ToolType.SWORD, ItemComponents.ToolTier.NETHERITE, Optional.empty(),
                Optional.empty()), c.tool().orElseThrow());
        assertEquals(9, c.durability().orElseThrow().max());
        assertEquals(new ItemComponents.Food(2, 0.1f, false), c.food().orElseThrow());
        assertEquals(5, c.onUse().orElseThrow().cooldownTicks());
        assertTrue(c.damageable());
    }

    @Test
    void numbersAndBooleansAreStrict() {
        assertFalse(block("{\"format\": 1, \"components\": {\"msm:breakable\": {\"requires_tool\": 1}}}").clean());
        assertFalse(block("{\"format\": 1, \"components\": {\"msm:light_emitter\": {\"level\": true}}}").clean());
        assertFalse(block("{\"format\": 1, \"components\": {\"msm:light_emitter\": {\"level\": 2.5}}}").clean());
        assertTrue(block("{\"format\": 1, \"components\": {\"msm:light_emitter\": {\"level\": 2.0}}}").clean());
    }

    @Test
    void customToolMaterialAndOverridesDecode() {
        ParseResult<ItemDefinition> result = item("""
                {"format": 1, "components": {"msm:tool": {"type": "pickaxe", "attack_damage": 9, "attack_speed": -3,
                  "tier": {"durability": 1200, "speed": 10, "attack_damage_bonus": 3.5, "enchantment_value": 12,
                    "incorrect_blocks_for_drops": "#minecraft:incorrect_for_diamond_tool", "repair_items": "#minecraft:diamond_tool_materials"}}}}""");
        assertTrue(result.clean(), result.errors() + " " + result.warnings());
        ItemComponents.Tool tool = result.definition().orElseThrow().components().tool().orElseThrow();
        assertEquals(new ItemComponents.ToolMaterialSpec(1200, 10f, 3.5f, 12, Identifier.parse("minecraft:incorrect_for_diamond_tool"),
                Optional.of(Identifier.parse("minecraft:diamond_tool_materials"))), tool.tier());
        assertEquals(Optional.of(9f), tool.attackDamage());
        assertEquals(Optional.of(-3f), tool.attackSpeed());
        // A tag reference needs the leading # (mcdoc tags="required").
        ParseResult<ItemDefinition> noHash = item("""
                {"format": 1, "components": {"msm:tool": {"type": "axe", "tier": {"durability": 1, "speed": 0,
                  "attack_damage_bonus": -1, "enchantment_value": 0, "incorrect_blocks_for_drops": "x:y"}}}}""");
        assertTrue(noHash.errors().getFirst().contains("incorrect_blocks_for_drops"), noHash.errors().toString());
        ParseResult<ItemDefinition> negative = item("""
                {"format": 1, "components": {"msm:tool": {"type": "axe", "tier": {"durability": 1, "speed": -1,
                  "attack_damage_bonus": 0, "enchantment_value": 0, "incorrect_blocks_for_drops": "#x:y"}}}}""");
        assertTrue(negative.definition().isEmpty());
        assertTrue(negative.errors().getFirst().contains("speed"), negative.errors().toString());
        ParseResult<ItemDefinition> badTier = item("{\"format\": 1, \"components\": {\"msm:tool\": {\"type\": \"axe\", \"tier\": \"ruby\"}}}");
        assertTrue(badTier.errors().getFirst().contains("unknown tool tier 'ruby'"), badTier.errors().toString());
    }

    @Test
    void armorDecodes() {
        ParseResult<ItemDefinition> vanilla = item("{\"format\": 1, \"components\": {\"msm:armor\": {\"slot\": \"chestplate\", \"material\": \"iron\"}}}");
        assertTrue(vanilla.clean(), vanilla.errors() + " " + vanilla.warnings());
        ItemComponents c = vanilla.definition().orElseThrow().components();
        assertEquals(new ItemComponents.Armor(ItemComponents.ArmorSlot.CHESTPLATE, ItemComponents.ArmorMaterialName.IRON), c.armor().orElseThrow());
        assertTrue(c.damageable());

        ParseResult<ItemDefinition> custom = item("""
                {"format": 1, "components": {"msm:armor": {"slot": "helmet", "material": {"durability": 20,
                  "defense": {"helmet": 3, "chestplate": 7, "leggings": 6, "boots": 3}, "enchantment_value": 15,
                  "toughness": 1.5, "knockback_resistance": 0.1, "equip_sound": "minecraft:item.armor.equip_diamond",
                  "repair_items": "#minecraft:diamond_tool_materials", "equipment_asset": "x:ruby"}}}}""");
        assertTrue(custom.clean(), custom.errors() + " " + custom.warnings());
        assertEquals(new ItemComponents.CustomArmorMaterial(20, new ItemComponents.Defense(3, 7, 6, 3, Optional.empty()), 15, 1.5f, 0.1f,
                Optional.of(Identifier.parse("minecraft:item.armor.equip_diamond")), Optional.of(Identifier.parse("minecraft:diamond_tool_materials")),
                Identifier.parse("x:ruby")), custom.definition().orElseThrow().components().armor().orElseThrow().material());

        assertTrue(item("{\"format\": 1, \"components\": {\"msm:armor\": {\"slot\": \"body\", \"material\": \"iron\"}}}")
                .errors().getFirst().contains("slot"));
        assertTrue(item("{\"format\": 1, \"components\": {\"msm:armor\": {\"slot\": \"boots\", \"material\": \"ruby\"}}}")
                .errors().getFirst().contains("unknown armor material 'ruby'"));
        ParseResult<ItemDefinition> noAsset = item("""
                {"format": 1, "components": {"msm:armor": {"slot": "helmet", "material": {"durability": 20,
                  "defense": {"helmet": 3, "chestplate": 7, "leggings": 6, "boots": 3}, "enchantment_value": 15,
                  "toughness": 0, "knockback_resistance": 0}}}}""");
        assertTrue(noAsset.definition().isEmpty());
        assertTrue(noAsset.errors().getFirst().contains("equipment_asset"), noAsset.errors().toString());
        ParseResult<ItemDefinition> knockback = item("""
                {"format": 1, "components": {"msm:armor": {"slot": "helmet", "material": {"durability": 20,
                  "defense": {"helmet": 3, "chestplate": 7, "leggings": 6, "boots": 3}, "enchantment_value": 15,
                  "toughness": 0, "knockback_resistance": 1.5, "equipment_asset": "x:ruby"}}}}""");
        assertTrue(knockback.errors().getFirst().contains("knockback_resistance"), knockback.errors().toString());
    }

    @Test
    void armorAndToolTogetherDropBoth() {
        ParseResult<ItemDefinition> result = item("""
                {"format": 1, "components": {"msm:armor": {"slot": "helmet", "material": "iron"},
                  "msm:tool": {"type": "sword", "tier": "iron"}, "msm:durability": {"max": 5}}}""");
        assertEquals(List.of("components: msm:armor and msm:tool on one item; neither is applied"), result.errors());
        ItemComponents c = result.definition().orElseThrow().components();
        assertEquals(Optional.empty(), c.armor());
        assertEquals(Optional.empty(), c.tool());
        assertEquals(5, c.durability().orElseThrow().max());
    }

    // ADR 0044 (B187)

    @Test
    void consumableDecodesWithDefaults() {
        ParseResult<ItemDefinition> result = item("""
                {"format": 1, "components": {"msm:consumable": {"seconds": 1.6, "animation": "drink",
                  "effects": [{"effect": "minecraft:speed", "seconds": 30}, {"effect": "minecraft:regeneration", "seconds": 5,
                  "amplifier": 1, "chance": 0.5}], "converts_to": "minecraft:glass_bottle", "cooldown_seconds": 2}}}""");
        assertTrue(result.clean(), result.errors() + " " + result.warnings());
        ItemComponents.Consumable c = result.definition().orElseThrow().components().consumable().orElseThrow();
        assertEquals(ItemComponents.ConsumeAnimation.DRINK, c.animation());
        assertEquals(new ItemComponents.ConsumeEffect(Identifier.parse("minecraft:speed"), 30, 0, 1.0f), c.effects().getFirst());
        assertEquals(600, c.effects().getFirst().ticks());
        assertEquals(0.5f, c.effects().get(1).chance());
        assertEquals(Optional.empty(), c.particles());
        assertEquals(Optional.of(Identifier.parse("minecraft:glass_bottle")), c.convertsTo());
        assertEquals(Optional.of(2.0f), c.cooldownSeconds());

        assertTrue(item("{\"format\": 1, \"components\": {\"msm:consumable\": {\"seconds\": 1, \"animation\": \"sip\"}}}")
                .errors().getFirst().contains("animation"));
        ParseResult<ItemDefinition> badChance = item("""
                {"format": 1, "components": {"msm:consumable": {"seconds": 1, "animation": "eat",
                  "effects": [{"effect": "minecraft:speed", "seconds": 1, "chance": 2}]}}}""");
        assertTrue(badChance.errors().getFirst().contains("chance"), badChance.errors().toString());
    }

    @Test
    void rangedWeaponShieldAndDeathProtectionDecode() {
        ParseResult<ItemDefinition> bow = item("{\"format\": 1, \"components\": {\"msm:ranged_weapon\": {\"type\": \"bow\", \"velocity\": 1.5}}}");
        assertTrue(bow.clean(), bow.errors().toString());
        ItemComponents c = bow.definition().orElseThrow().components();
        assertEquals(new ItemComponents.RangedWeapon(ItemComponents.RangedWeaponType.BOW, 1.0f, 1.5f, 1.0f, 1.0f), c.rangedWeapon().orElseThrow());
        assertTrue(c.damageable());
        assertTrue(item("{\"format\": 1, \"components\": {\"msm:ranged_weapon\": {\"type\": \"bow\", \"draw_speed\": 0}}}")
                .errors().getFirst().contains("draw_speed"));

        ParseResult<ItemDefinition> shield = item("{\"format\": 1, \"components\": {\"msm:shield\": {\"damage_reduction\": 0.5}}}");
        assertTrue(shield.clean(), shield.errors().toString());
        assertEquals(new ItemComponents.Shield(0.25f, 0.5f, 1.0f, Optional.empty()),
                shield.definition().orElseThrow().components().shield().orElseThrow());
        assertTrue(item("{\"format\": 1, \"components\": {\"msm:shield\": {\"bypassed_by\": \"minecraft:bypasses_shield\"}}}")
                .errors().getFirst().contains("bypassed_by"));

        ParseResult<ItemDefinition> totem = item("""
                {"format": 1, "components": {"msm:death_protection": {"clear_effects": true,
                  "effects": [{"effect": "minecraft:absorption", "seconds": 5, "amplifier": 1}]}}}""");
        assertTrue(totem.clean(), totem.errors().toString());
        assertTrue(totem.definition().orElseThrow().components().deathProtection().orElseThrow().clearEffects());
        assertTrue(item("{\"format\": 1, \"components\": {\"msm:death_protection\": {}}}").errors().getFirst().contains("effects"));
    }

    @Test
    void spearMaceAndBodyArmorDecode() {
        assertEquals(ItemComponents.ToolType.SPEAR, item("{\"format\": 1, \"components\": {\"msm:tool\": {\"type\": \"spear\", \"tier\": \"iron\"}}}")
                .definition().orElseThrow().components().tool().orElseThrow().type());
        assertEquals(ItemComponents.ToolType.MACE, item("{\"format\": 1, \"components\": {\"msm:tool\": {\"type\": \"mace\", \"tier\": \"diamond\"}}}")
                .definition().orElseThrow().components().tool().orElseThrow().type());
        assertEquals(ItemComponents.ArmorSlot.HORSE, item("{\"format\": 1, \"components\": {\"msm:armor\": {\"slot\": \"horse\", \"material\": \"gold\"}}}")
                .definition().orElseThrow().components().armor().orElseThrow().slot());
        assertEquals(ItemComponents.ArmorSlot.WOLF, item("{\"format\": 1, \"components\": {\"msm:armor\": {\"slot\": \"wolf\", \"material\": \"armadillo_scute\"}}}")
                .definition().orElseThrow().components().armor().orElseThrow().slot());
    }

    @Test
    void vanillaComponentsAreKeptAsJson() {
        ParseResult<ItemDefinition> result = item("""
                {"format": 1, "components": {"msm:components": {"minecraft:glider": {}, "use_cooldown": {"seconds": 2}}}}""");
        assertTrue(result.clean(), result.errors() + " " + result.warnings());
        var vanilla = result.definition().orElseThrow().components().vanilla();
        assertEquals(List.of(Identifier.parse("minecraft:glider"), Identifier.parse("minecraft:use_cooldown")), List.copyOf(vanilla.keySet()));
        assertEquals(JsonParser.parseString("{\"seconds\": 2}"), vanilla.get(Identifier.parse("minecraft:use_cooldown")));
        assertTrue(item("{\"format\": 1, \"components\": {\"msm:components\": {\"Bad Id\": {}}}}").errors().getFirst()
                .contains("msm:components"));
    }

    @Test
    void exclusiveComponentsDropTogether() {
        ParseResult<ItemDefinition> result = item("""
                {"format": 1, "components": {"msm:ranged_weapon": {"type": "crossbow"}, "msm:shield": {},
                  "msm:tool": {"type": "sword", "tier": "iron"}, "msm:food": {"nutrition": 1, "saturation": 0}}}""");
        assertEquals(List.of("components: msm:tool, msm:ranged_weapon and msm:shield on one item; none is applied"), result.errors());
        ItemComponents c = result.definition().orElseThrow().components();
        assertEquals(List.of(), c.exclusivePresent());
        assertTrue(c.food().isPresent());
        ParseResult<ItemDefinition> two = item("""
                {"format": 1, "components": {"msm:armor": {"slot": "helmet", "material": "iron"}, "msm:shield": {}}}""");
        assertEquals(List.of("components: msm:armor and msm:shield on one item; neither is applied"), two.errors());
    }

    @Test
    void applyEffectDecodes() {
        ParseResult<ItemDefinition> result = item("""
                {"format": 1, "components": {"msm:on_use": {"event": "x:zap"}}, "events": {"x:zap": {"actions": [
                  {"type": "apply_effect", "effect": "minecraft:speed", "seconds": 2.5},
                  {"type": "apply_effect", "effect": "minecraft:glowing", "seconds": 1, "amplifier": 2, "target": "other"}]}}}""");
        assertTrue(result.clean(), result.errors() + " " + result.warnings());
        List<Action> actions = result.definition().orElseThrow().events().get(Identifier.parse("x:zap")).orElseThrow().actions();
        assertEquals(new Action.ApplyEffect(Identifier.parse("minecraft:speed"), 2.5f, 0, Action.EffectTarget.SELF), actions.getFirst());
        assertEquals(50, ((Action.ApplyEffect) actions.getFirst()).ticks());
        assertEquals(Action.EffectTarget.OTHER, ((Action.ApplyEffect) actions.get(1)).target());
        ParseResult<ItemDefinition> bad = item("""
                {"format": 1, "events": {"x:zap": {"actions": [{"type": "apply_effect", "effect": "minecraft:speed", "seconds": 1,
                  "target": "everyone"}]}}}""");
        assertTrue(bad.errors().getFirst().contains("target"), bad.errors().toString());
    }

    @Test
    void launchDecodes() {
        ParseResult<ItemDefinition> result = item("""
                {"format": 1, "components": {"msm:on_use": {"event": "x:dash"}}, "events": {"x:dash": {"actions": [
                  {"type": "launch", "strength": 1.5},
                  {"type": "launch", "strength": 0, "direction": "up", "up": 1.2, "add": true, "target": "other"}]}}}""");
        assertTrue(result.clean(), result.errors() + " " + result.warnings());
        List<Action> actions = result.definition().orElseThrow().events().get(Identifier.parse("x:dash")).orElseThrow().actions();
        assertEquals(new Action.Launch(1.5f, Action.LaunchDirection.LOOK, 0f, false, Action.EffectTarget.SELF), actions.getFirst());
        assertEquals(new Action.Launch(0f, Action.LaunchDirection.UP, 1.2f, true, Action.EffectTarget.OTHER), actions.get(1));
        ParseResult<ItemDefinition> bad = item("""
                {"format": 1, "events": {"x:dash": {"actions": [{"type": "launch", "strength": 50}]}}}""");
        assertTrue(bad.errors().getFirst().contains("strength"), bad.errors().toString());
    }

    private static ParseResult<EffectDefinition> effect(String json) {
        return DefinitionParser.parseEffect(JsonParser.parseString(json));
    }

    @Test
    void effectDecodesWithDefaults() {
        ParseResult<EffectDefinition> minimal = effect("{\"format\": 1, \"category\": \"harmful\", \"color\": 255}");
        assertTrue(minimal.clean(), minimal.errors() + " " + minimal.warnings());
        EffectDefinition def = minimal.definition().orElseThrow();
        assertEquals(EffectDefinition.Category.HARMFUL, def.category());
        assertEquals(255, def.color());
        assertEquals(Optional.empty(), def.particle());
        assertEquals(Optional.empty(), def.sound());
        assertEquals(List.of(), def.attributeModifiers());
        assertEquals(EffectComponents.NONE, def.components());

        ParseResult<EffectDefinition> full = effect("""
                {"format": 1, "category": "beneficial", "color": 16777215, "particle": "minecraft:heart",
                  "sound": "minecraft:entity.player.levelup",
                  "attribute_modifiers": [{"attribute": "minecraft:movement_speed", "amount": 0.2, "operation": "add_multiplied_total"}],
                  "components": {"msm:on_start": {"event": "x:a"}, "msm:on_tick": {"event": "x:b"}, "msm:on_end": {"event": "x:a"}},
                  "events": {"x:a": {"actions": [{"type": "heal", "amount": 2}]},
                    "x:b": {"actions": [{"type": "damage", "amount": 1, "target": "other"}]}}}""");
        assertTrue(full.clean(), full.errors() + " " + full.warnings());
        EffectDefinition f = full.definition().orElseThrow();
        assertEquals(new EffectDefinition.Modifier(Identifier.parse("minecraft:movement_speed"), 0.2f,
                EffectDefinition.Operation.ADD_MULTIPLIED_TOTAL), f.attributeModifiers().getFirst());
        EffectComponents.OnTick tick = f.components().onTick().orElseThrow();
        assertEquals(20, tick.intervalTicks());
        assertFalse(tick.fasterPerLevel());
        assertEquals(new Action.Heal(2f, Action.EffectTarget.SELF),
                f.events().get(Identifier.parse("x:a")).orElseThrow().actions().getFirst());
        assertEquals(new Action.Damage(1f, Action.EffectTarget.OTHER),
                f.events().get(Identifier.parse("x:b")).orElseThrow().actions().getFirst());
    }

    @Test
    void tickIntervalScalesWithLevel() {
        EffectComponents.OnTick plain = new EffectComponents.OnTick(Identifier.parse("x:t"), 40, false);
        assertEquals(40, plain.interval(0));
        assertEquals(40, plain.interval(3));
        EffectComponents.OnTick faster = new EffectComponents.OnTick(Identifier.parse("x:t"), 40, true);
        assertEquals(40, faster.interval(0));
        assertEquals(20, faster.interval(1));
        assertEquals(13, faster.interval(2));
        assertEquals(1, faster.interval(200), "at least one tick");
    }

    @Test
    void effectDropsBadEventsAndPlayAnimation() {
        ParseResult<EffectDefinition> result = effect("""
                {"format": 1, "category": "neutral", "color": 0, "future": 1,
                  "components": {"msm:on_tick": {"event": "x:gone"}, "msm:on_hit": {"event": "x:a"}},
                  "events": {"x:a": {"actions": [{"type": "play_animation", "animation": "wave"}, {"type": "heal", "amount": 1}]},
                    "x:gone": {"actions": [{"type": "explode"}]}}}""");
        EffectDefinition def = result.definition().orElseThrow();
        assertTrue(result.errors().stream().anyMatch(e -> e.contains("x:gone") && e.contains("event dropped")), result.errors().toString());
        assertTrue(result.errors().stream().anyMatch(e -> e.contains("msm:on_tick names event x:gone")), result.errors().toString());
        assertTrue(result.warnings().stream().anyMatch(w -> w.contains("future")), result.warnings().toString());
        assertTrue(result.warnings().stream().anyMatch(w -> w.contains("msm:on_hit")), result.warnings().toString());
        assertTrue(result.warnings().stream().anyMatch(w -> w.contains("play_animation 'wave'")), result.warnings().toString());
        assertEquals(List.of(new Action.Heal(1f, Action.EffectTarget.SELF)),
                def.events().get(Identifier.parse("x:a")).orElseThrow().actions());
        assertFalse(effect("{\"format\": 2, \"category\": \"neutral\", \"color\": 0}").errors().isEmpty());
    }

    @Test
    void throwableDecodesWithDefaults() {
        ParseResult<ItemDefinition> result = item("{\"format\": 1, \"components\": {\"msm:throwable\": {}}}");
        assertTrue(result.clean(), result.errors() + " " + result.warnings());
        ItemComponents.Throwable t = result.definition().orElseThrow().components().throwable().orElseThrow();
        assertEquals(new ItemComponents.Throwable(1.5f, 1.0f, 0.03f, 0f, 0, ItemComponents.AfterThrow.CONSUME, 0, Optional.empty(), true,
                Optional.empty(), Optional.empty()), t);
        ParseResult<ItemDefinition> refs = item("""
                {"format": 1, "components": {"msm:throwable": {"on_hit_entity": {"event": "x:hit"}, "on_hit_block": {"event": "x:land"}}},
                  "events": {"x:hit": {"actions": [{"type": "damage", "amount": 3, "target": "other"}]}}}""");
        assertEquals(List.of("components: msm:throwable on_hit_block names event x:land, which is not declared in events (or was dropped)"),
                refs.errors());
        assertTrue(refs.definition().orElseThrow().components().throwable().isPresent());
    }

    @Test
    void throwableConflictsApplyNone() {
        ParseResult<ItemDefinition> drink = item("""
                {"format": 1, "components": {"msm:throwable": {}, "msm:consumable": {"seconds": 1, "animation": "drink"},
                  "msm:durability": {"max": 5}}}""");
        assertEquals(List.of("components: msm:throwable and msm:consumable on one item; neither is applied"), drink.errors());
        ItemComponents c = drink.definition().orElseThrow().components();
        assertTrue(c.throwable().isEmpty() && c.consumable().isEmpty());
        assertTrue(c.durability().isPresent(), "unrelated components stay");

        ParseResult<ItemDefinition> mace = item("""
                {"format": 1, "components": {"msm:throwable": {}, "msm:tool": {"type": "mace", "tier": "iron"},
                  "msm:food": {"nutrition": 1, "saturation": 0}}}""");
        assertEquals(List.of("components: msm:throwable, msm:food and msm:tool on one item; none is applied"), mace.errors());
        assertTrue(mace.definition().orElseThrow().components().tool().isEmpty());

        ParseResult<ItemDefinition> knife = item("""
                {"format": 1, "components": {"msm:throwable": {"after_throw": "drop"}, "msm:tool": {"type": "sword", "tier": "iron"},
                  "msm:on_use": {"event": "x:u"}}, "events": {"x:u": {"actions": []}}}""");
        assertTrue(knife.clean(), knife.errors() + " " + knife.warnings());
        assertTrue(knife.definition().orElseThrow().components().throwable().isPresent());
        assertTrue(knife.definition().orElseThrow().components().tool().isPresent());

        ParseResult<ItemDefinition> armour = item("""
                {"format": 1, "components": {"msm:throwable": {}, "msm:armor": {"slot": "helmet", "material": "iron"}}}""");
        assertEquals(List.of("components: msm:throwable and msm:armor on one item; neither is applied"), armour.errors());
    }

    @Test
    void entitySoundsDecodeWithDefaults() {
        assertEquals(Optional.empty(), entity("", "").definition().orElseThrow().sounds(), "absent sounds");
        EntityDefinition.Sounds empty = entity("", "\"sounds\": {}, ").definition().orElseThrow().sounds().orElseThrow();
        assertEquals(new EntityDefinition.Sounds(Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty()),
                empty, "an empty struct is valid and means vanilla's sounds");
        ParseResult<EntityDefinition> full = entity("", "\"sounds\": {\"ambient\": \"t:golem.ambient\", \"hurt\": \"entity.iron_golem.hurt\", "
                + "\"death\": \"t:golem.death\", \"step\": \"t:golem.step\", \"ambient_interval_ticks\": 20}, ");
        assertTrue(full.clean(), full.errors() + " " + full.warnings());
        EntityDefinition.Sounds sounds = full.definition().orElseThrow().sounds().orElseThrow();
        assertEquals(Optional.of(Identifier.parse("t:golem.ambient")), sounds.ambient());
        assertEquals(Optional.of(Identifier.parse("minecraft:entity.iron_golem.hurt")), sounds.hurt(), "no namespace means minecraft");
        assertEquals(Optional.of(20), sounds.ambientIntervalTicks());
        assertEquals(List.of(Identifier.parse("t:golem.ambient"), Identifier.parse("minecraft:entity.iron_golem.hurt"),
                Identifier.parse("t:golem.death"), Identifier.parse("t:golem.step")), sounds.ids());
    }

    @Test
    void entitySoundsRejectUnknownKeysAndShortIntervals() {
        ParseResult<EntityDefinition> unknown = entity("", "\"sounds\": {\"idle\": \"t:a\", \"ambient\": \"t:b\"}, ");
        assertTrue(unknown.definition().isEmpty(), "an unknown key inside sounds is an error");
        assertTrue(unknown.errors().getFirst().contains("sounds: idle: unknown field"), unknown.errors().toString());
        ParseResult<EntityDefinition> short19 = entity("", "\"sounds\": {\"ambient_interval_ticks\": 19}, ");
        assertTrue(short19.definition().isEmpty());
        assertTrue(short19.errors().getFirst().contains("ambient_interval_ticks"), short19.errors().toString());
        ParseResult<EntityDefinition> badId = entity("", "\"sounds\": {\"step\": \"Bad Id\"}, ");
        assertTrue(badId.definition().isEmpty());
        assertTrue(badId.errors().getFirst().contains("step"), badId.errors().toString());
    }

    private static BlockComponents.Shape shape(String json) {
        ParseResult<BlockDefinition> result = block("{\"format\": 1, \"components\": {\"msm:shape\": " + json + "}}");
        assertEquals(List.of(), result.errors());
        assertEquals(List.of(), result.warnings());
        return result.definition().orElseThrow().components().shape().orElseThrow();
    }

    @Test
    void shapeDecodesWithDefaults() {
        BlockComponents.Shape empty = shape("{}");
        assertEquals(Optional.empty(), empty.boxes());
        assertTrue(empty.collision());
        assertFalse(empty.seeThrough(), "no boxes: the full cube, not see-through");
        assertEquals(List.of(BlockComponents.Shape.FULL_CUBE), empty.boxesOrFullCube());

        BlockComponents.Shape slab = shape("{\"boxes\": [[0, 0, 0, 16, 8, 16]]}");
        assertEquals(List.of(List.of(0f, 0f, 0f, 16f, 8f, 16f)), slab.boxes().orElseThrow());
        assertTrue(slab.collision());
        assertTrue(slab.seeThrough(), "boxes other than the full cube default to see-through");

        BlockComponents.Shape cross = shape("{\"boxes\": [[2, 0, 2, 14, 16, 14]], \"collision\": false}");
        assertFalse(cross.collision());
        assertTrue(cross.seeThrough());

        assertFalse(shape("{\"boxes\": [[0, 0, 0, 16, 16, 16]]}").seeThrough(), "the single full cube is solid");
        assertFalse(shape("{\"boxes\": [[-0.0, 0, 0, 16, 16, 16]]}").seeThrough(), "-0 counts as 0, as in TypeScript");
        assertTrue(shape("{\"boxes\": [[0, 0, 0, 16, 16, 16]], \"see_through\": true}").seeThrough());
        assertFalse(shape("{\"boxes\": [[0, 0, 0, 16, 8, 16], [4, 8, 4, 12, 16, 12]], \"see_through\": false}").seeThrough());
        assertTrue(shape("{\"boxes\": [[0, 0, 0, 16, 16, 16], [0, 0, 0, 16, 16, 16]]}").seeThrough(),
                "two boxes are not the single full cube (the plugin's rule)");
        assertEquals(List.of(List.of(0.5f, 0f, 0f, 15.5f, 1f, 16f)), shape("{\"boxes\": [[0.5, 0, 0, 15.5, 1, 16]]}").boxes().orElseThrow());
    }

    @Test
    void shapeRejectsPresetAndBadBoxes() {
        for (String bad : List.of(
                "{\"preset\": \"slab_bottom\"}",
                "{\"boxes\": []}",
                "{\"boxes\": [[0, 0, 0, 16, 8]]}",
                "{\"boxes\": [[0, 0, 0, 16, 8, 16, 1]]}",
                "{\"boxes\": [[0, 0, 0, 16.5, 8, 16]]}",
                "{\"boxes\": [[0, -1, 0, 16, 8, 16]]}",
                "{\"collision\": 0}",
                "{\"see_through\": \"true\"}")) {
            ParseResult<BlockDefinition> result = block("{\"format\": 1, \"components\": {\"msm:shape\": " + bad + "}}");
            assertTrue(result.definition().isEmpty(), bad);
            assertTrue(result.errors().getFirst().contains("msm:shape"), result.errors().toString());
        }
        ParseResult<BlockDefinition> preset = block("{\"format\": 1, \"components\": {\"msm:shape\": {\"preset\": \"cross\"}}}");
        assertTrue(preset.errors().getFirst().contains("preset: unknown field"), preset.errors().toString());
    }
}
