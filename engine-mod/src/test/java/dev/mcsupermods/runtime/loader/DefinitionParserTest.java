package dev.mcsupermods.runtime.loader;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonParser;
import dev.mcsupermods.runtime.components.BlockComponents;
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
        assertEquals(new ItemComponents.Tool(ItemComponents.ToolType.SWORD, ItemComponents.ToolTier.NETHERITE), c.tool().orElseThrow());
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
}
