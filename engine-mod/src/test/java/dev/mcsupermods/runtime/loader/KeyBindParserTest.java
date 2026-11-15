package dev.mcsupermods.runtime.loader;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.minecraft.resources.Identifier;
import org.junit.jupiter.api.Test;

/** {@link KeyBindParser} and {@link KeyBindDefinition}'s defaults and name rules (ADR 0088 D3, B409, B413). */
class KeyBindParserTest {
    private static ParseResult<KeyBindDefinition> parse(String json) {
        return KeyBindParser.parse(JsonParser.parseString(json));
    }

    private static KeyBindDefinition clean(String json) {
        ParseResult<KeyBindDefinition> result = parse(json);
        assertEquals(List.of(), result.errors(), "errors");
        assertEquals(List.of(), result.warnings(), "warnings");
        return result.definition().orElseThrow();
    }

    @Test
    void aMinimalKeyBindTakesTheDefaults() {
        KeyBindDefinition def = clean("{\"format\": 1, \"default_key\": \"key.keyboard.r\"}");
        assertEquals("key.keyboard.r", def.defaultKey());
        assertEquals("keys", def.category());
        assertEquals(KeyBindDefinition.When.ALWAYS, def.when());
        assertEquals(0, def.cooldownTicks());
        assertEquals(10, def.holdIntervalTicks());
        assertTrue(def.vehicle().isEmpty());
        assertTrue(def.events().byId().isEmpty());
        assertTrue(def.onPress().isEmpty() && def.onRelease().isEmpty() && def.whileHeld().isEmpty());
        assertFalse(def.unbound());
    }

    @Test
    void namesFollowTheLoweringRule() {
        Identifier id = Identifier.fromNamespaceAndPath("mymod", "abilities/dash");
        KeyBindDefinition def = clean("{\"format\": 1, \"default_key\": \"key.keyboard.unknown\", \"category\": \"magic/spells\"}");
        assertTrue(def.unbound());
        assertEquals("key.mymod.abilities.dash", def.translationKey(id));
        assertEquals(Identifier.fromNamespaceAndPath("mymod", "magic/spells"), def.categoryId(id));
        assertEquals("key.category.mymod.magic.spells", KeyBindDefinition.categoryKey(def.categoryId(id)));
        KeyBindDefinition named = clean("{\"format\": 1, \"default_key\": \"key.mouse.4\", \"name\": \"key.mymod.custom\"}");
        assertEquals("key.mymod.custom", named.translationKey(id));
    }

    @Test
    void anUndeclaredTriggerEventIsAnErrorButTheKeyRegisters() {
        ParseResult<KeyBindDefinition> result = parse("""
                {"format": 1, "default_key": "key.keyboard.k", "msm:on_press": "a:missing",
                 "events": {"a:held": {"actions": [{"type": "trigger_event", "event": "a:gone"}]}}, "msm:while_held": "a:held"}""");
        assertTrue(result.definition().isPresent());
        assertEquals(2, result.errors().size(), result.errors().toString());
        assertTrue(result.errors().get(0).contains("msm:on_press names event a:missing"), result.errors().toString());
        assertTrue(result.errors().get(1).contains("trigger_event names event a:gone"), result.errors().toString());
    }

    @Test
    void playAnimationIsDroppedWithAWarning() {
        ParseResult<KeyBindDefinition> result = parse("""
                {"format": 1, "default_key": "key.keyboard.k", "msm:on_press": "a:p",
                 "events": {"a:p": {"actions": [{"type": "play_animation", "animation": "wave"}]}}}""");
        assertEquals(List.of(), result.errors());
        assertEquals(1, result.warnings().size(), result.warnings().toString());
        assertTrue(result.definition().orElseThrow().events().get(Identifier.parse("a:p")).orElseThrow().actions().isEmpty());
    }

    @Test
    void aVehicleWithoutAVehicleWhenIsIgnoredWithAWarning() {
        ParseResult<KeyBindDefinition> result = parse("{\"format\": 1, \"default_key\": \"key.keyboard.k\", \"vehicle\": \"a:tank\"}");
        assertEquals(List.of(), result.errors());
        assertEquals(1, result.warnings().size());
        assertEquals(Optional.empty(), result.definition().orElseThrow().vehicle());
        KeyBindDefinition driving = clean("{\"format\": 1, \"default_key\": \"key.keyboard.k\", \"vehicle\": \"a:tank\", \"when\": \"driving\"}");
        assertEquals(Optional.of(Identifier.parse("a:tank")), driving.vehicle());
    }

    @Test
    void aNameThatIsNotAKeyNameWarns() {
        ParseResult<KeyBindDefinition> result = parse("{\"format\": 1, \"default_key\": \"r\"}");
        assertTrue(result.definition().isPresent());
        assertEquals(1, result.warnings().size());
        assertTrue(result.warnings().get(0).startsWith("default_key"), result.warnings().toString());
    }

    @Test
    void anInvalidCategoryIsAnError() {
        ParseResult<KeyBindDefinition> result = parse("{\"format\": 1, \"default_key\": \"key.keyboard.k\", \"category\": \"Big Keys\"}");
        assertTrue(result.definition().isEmpty());
        assertTrue(result.errors().get(0).contains("category"), result.errors().toString());
    }

    @Test
    void parseAllKeepsOnlyKeyBindsAndPrefixesProblems() {
        JsonObject good = JsonParser.parseString("{\"format\": 1, \"default_key\": \"key.keyboard.k\"}").getAsJsonObject();
        JsonObject bad = JsonParser.parseString("{\"format\": 2, \"default_key\": \"key.keyboard.k\"}").getAsJsonObject();
        List<RawDefinition> raws = List.of(
                new RawDefinition("m", "key_bind", Identifier.parse("m:good"), good),
                new RawDefinition("m", "key_bind", Identifier.parse("m:bad"), bad),
                new RawDefinition("m", "item", Identifier.parse("m:item"), good));
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        Map<Identifier, KeyBindDefinition> out = KeyBindParser.parseAll(raws, errors, warnings);
        assertEquals(List.of(Identifier.parse("m:good")), List.copyOf(out.keySet()));
        assertEquals(1, errors.size());
        assertTrue(errors.get(0).contains("m:bad") || errors.get(0).contains("bad"), errors.toString());
        assertEquals(List.of(), warnings);
    }
}
