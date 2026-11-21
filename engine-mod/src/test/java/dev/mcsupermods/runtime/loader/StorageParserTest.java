package dev.mcsupermods.runtime.loader;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonParser;
import dev.mcsupermods.runtime.loader.StorageParser.Storage;
import java.util.List;
import java.util.Optional;
import net.minecraft.resources.Identifier;
import org.junit.jupiter.api.Test;

/**
 * {@link StorageParser}: {@code msm:storage} and {@code msm:shoulder_riding} through the entity parser, their defaults
 * and their closed fields (ADR 0098 D3, D4, B479).
 */
class StorageParserTest {
    private static String entity(String base, String components) {
        return "{\"format\": 1, \"category\": \"creature\"" + (base == null ? "" : ", \"base\": \"" + base + "\"")
                + ", \"size\": {\"width\": 0.6, \"height\": 0.9},"
                + " \"components\": {\"msm:animated_model\": {\"model\": \"a:entity/m\", \"texture\": \"a:entity/m\"}, " + components + "}}";
    }

    private static ParseResult<EntityDefinition> parse(String base, String components) {
        return DefinitionParser.parseEntity(JsonParser.parseString(entity(base, components)));
    }

    private static ParseResult<EntityDefinition> storage(String storage) {
        return parse(null, "\"msm:storage\": " + storage);
    }

    private static void refused(ParseResult<EntityDefinition> result, String part) {
        assertFalse(result.errors().isEmpty(), "no error");
        assertTrue(result.errors().stream().anyMatch(e -> e.contains(part)), part + " not in " + result.errors());
        assertTrue(result.definition().isEmpty(), "a broken component was applied");
    }

    @Test
    void anEmptyStoreTakesTheDefaults() {
        ParseResult<EntityDefinition> result = storage("{}");
        assertEquals(List.of(), result.errors());
        assertEquals(List.of(), result.warnings(), "msm:storage is a known component now");
        Storage storage = result.definition().orElseThrow().components().storage().orElseThrow();
        assertEquals(3, storage.rows());
        assertEquals(27, storage.slots());
        assertFalse(storage.needsChest());
        assertEquals(Optional.empty(), storage.openSound());
        assertEquals(Optional.empty(), storage.closeSound());
        assertTrue(result.definition().get().components().shoulderRiding().isEmpty(), "no shoulder without the component");
    }

    @Test
    void everyFieldIsRead() {
        Storage storage = storage("{\"rows\": 6, \"needs_chest\": true, \"open_sound\": \"minecraft:block.barrel.open\","
                + " \"close_sound\": \"minecraft:block.barrel.close\"}").definition().orElseThrow().components().storage().orElseThrow();
        assertEquals(6, storage.rows());
        assertEquals(54, storage.slots());
        assertTrue(storage.needsChest());
        assertEquals(Optional.of(Identifier.parse("minecraft:block.barrel.open")), storage.openSound());
        assertEquals(Optional.of(Identifier.parse("minecraft:block.barrel.close")), storage.closeSound());
    }

    @Test
    void brokenStoresAreRefusedNamingTheField() {
        refused(storage("{\"rows\": 0}"), "rows");
        refused(storage("{\"rows\": 7}"), "rows");
        refused(storage("{\"hoppers\": true}"), "hoppers");
        refused(storage("{\"needs_chest\": \"chest\"}"), "needs_chest");
        refused(storage("{\"open_sound\": 1}"), "open_sound");
        refused(storage("true"), "msm:storage");
    }

    @Test
    void theShoulderComponentIsAnEmptyObject() {
        ParseResult<EntityDefinition> result = parse("animal", "\"msm:shoulder_riding\": {}, \"msm:tameable\": {\"items\": [\"minecraft:bone\"]}");
        assertEquals(List.of(), result.errors());
        assertEquals(List.of(), result.warnings(), "msm:shoulder_riding is a known component now");
        assertTrue(result.definition().orElseThrow().components().shoulderRiding().isPresent());
        refused(parse("animal", "\"msm:shoulder_riding\": {\"side\": \"left\"}"), "side");
        refused(parse("animal", "\"msm:shoulder_riding\": {\"cooldown_ticks\": 40}"), "cooldown_ticks");
        refused(parse("animal", "\"msm:shoulder_riding\": true"), "msm:shoulder_riding");
    }

    @Test
    void bothSitBesideTheTraderInTheSecondGroup() {
        ParseResult<EntityDefinition> result = parse("animal", "\"msm:storage\": {\"rows\": 1}, \"msm:shoulder_riding\": {},"
                + " \"msm:tameable\": {\"items\": [\"minecraft:bone\"]},"
                + " \"msm:trader\": {\"trade_sets\": [{\"trade_set\": \"minecraft:wandering_trader/common\"}]}");
        assertEquals(List.of(), result.errors());
        var components = result.definition().orElseThrow().components();
        assertEquals(1, components.storage().orElseThrow().rows());
        assertTrue(components.shoulderRiding().isPresent());
        assertTrue(components.trader().isPresent());
        assertTrue(components.tameable().isPresent());
    }
}
