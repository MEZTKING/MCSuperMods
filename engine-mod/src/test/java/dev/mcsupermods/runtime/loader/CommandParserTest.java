package dev.mcsupermods.runtime.loader;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import dev.mcsupermods.runtime.loader.CommandParser.ArgumentType;
import dev.mcsupermods.runtime.loader.CommandParser.Command;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.minecraft.resources.Identifier;
import org.junit.jupiter.api.Test;

/** {@link CommandParser}: defaults, the twelve argument types and the rules Brigadier needs (ADR 0096 D1, B443, B454). */
class CommandParserTest {
    private static ParseResult<Command> parse(String json) {
        return CommandParser.parse(JsonParser.parseString(json));
    }

    private static Command clean(String json) {
        ParseResult<Command> result = parse(json);
        assertEquals(List.of(), result.errors(), "errors");
        assertEquals(List.of(), result.warnings(), "warnings");
        return result.definition().orElseThrow();
    }

    private static void refused(String json, String part) {
        ParseResult<Command> result = parse(json);
        assertTrue(result.definition().isEmpty(), "registered: " + json);
        assertTrue(result.errors().stream().anyMatch(e -> e.contains(part)), part + " not in " + result.errors());
    }

    @Test
    void aMinimalCommandTakesTheDefaults() {
        Command def = clean("{\"format\": 1, \"name\": \"hello\"}");
        assertEquals("hello", def.name());
        assertEquals(List.of(), def.aliases());
        assertEquals(0, def.permission());
        assertEquals(List.of(), def.arguments());
        assertTrue(def.function().isEmpty() && def.event().isEmpty() && def.feedback().isEmpty());
        assertEquals(List.of("hello"), def.literals());
    }

    @Test
    void everyArgumentTypeDecodes() {
        // Eight arguments at most per command, and the greedy types (text, message) only last: one command per eight
        // other types, one per greedy type (B527: 44 types).
        List<ArgumentType> plain = new ArrayList<>();
        List<ArgumentType> seen = new ArrayList<>();
        for (ArgumentType type : ArgumentType.values()) {
            if (type.greedy()) {
                Command one = clean("{\"format\": 1, \"name\": \"g\", \"arguments\": [{\"name\": \"rest\", \"type\": \""
                        + type.serialName() + "\"}]}");
                one.arguments().forEach(arg -> seen.add(arg.type()));
            } else {
                plain.add(type);
            }
        }
        for (int from = 0; from < plain.size(); from += 8) {
            StringBuilder args = new StringBuilder();
            for (ArgumentType type : plain.subList(from, Math.min(plain.size(), from + 8))) {
                args.append(args.isEmpty() ? "" : ",").append("{\"name\": \"a_").append(type.serialName()).append("\", \"type\": \"")
                        .append(type.serialName()).append("\"}");
            }
            Command cmd = clean("{\"format\": 1, \"name\": \"c\", \"arguments\": [" + args + "]}");
            cmd.arguments().forEach(arg -> seen.add(arg.type()));
        }
        assertEquals(ArgumentType.values().length, seen.size());
        assertTrue(seen.containsAll(List.of(ArgumentType.values())));
    }

    @Test
    void fieldsDecode() {
        Command def = clean("""
                {"format": 1, "name": "gift", "aliases": ["present"], "permission": 2, "function": "go_home",
                 "feedback": "command.m.gift.feedback",
                 "arguments": [{"name": "count", "type": "integer", "min": 1, "max": 64}, {"name": "who", "type": "player", "optional": true}]}""");
        assertEquals(List.of("gift", "present"), def.literals());
        assertEquals(2, def.permission());
        assertEquals(Optional.of(Identifier.withDefaultNamespace("go_home")), def.function(), "a bare function id is minecraft:");
        assertEquals(Optional.of(1.0), def.arguments().get(0).min());
        assertEquals(Optional.of(64.0), def.arguments().get(0).max());
        assertTrue(def.arguments().get(1).optional());
    }

    @Test
    void closedFieldsAndRangesAreErrors() {
        refused("{\"format\": 1, \"name\": \"x\", \"description\": \"no\"}", "description");
        refused("{\"format\": 1, \"name\": \"x\", \"feedback_text\": \"Hi\"}", "feedback_text");
        refused("{\"format\": 1, \"name\": \"\"}", "name");
        refused("{\"format\": 1}", "name");
        refused("{\"name\": \"x\"}", "format");
        refused("{\"format\": 2, \"name\": \"x\"}", "newer");
        refused("{\"format\": 1, \"name\": \"x\", \"permission\": 5}", "permission");
        refused("{\"format\": 1, \"name\": \"x\", \"arguments\": [{\"name\": \"a\", \"type\": \"string\"}]}", "type");
        refused("{\"format\": 1, \"name\": \"x\", \"arguments\": [{\"name\": \"a\"}]}", "type");
        refused("{\"format\": 1, \"name\": \"x\", \"aliases\": [\"a\", \"b\", \"c\", \"d\", \"e\"]}", "aliases");
    }

    @Test
    void brigadierRulesRefuseTheCommand() {
        refused("{\"format\": 1, \"name\": \"Hello\"}", "lower case");
        refused("{\"format\": 1, \"name\": \"say hi\"}", "lower case");
        refused("{\"format\": 1, \"name\": \"x\", \"aliases\": [\"x-y\"]}", "aliases[0]");
        refused("{\"format\": 1, \"name\": \"x\", \"arguments\": [{\"name\": \"A\", \"type\": \"word\"}]}", "arguments[0].name");
        refused("{\"format\": 1, \"name\": \"x\", \"arguments\": [{\"name\": \"a\", \"type\": \"word\"}, {\"name\": \"a\", \"type\": \"word\"}]}",
                "earlier argument");
        refused("{\"format\": 1, \"name\": \"x\", \"arguments\": [{\"name\": \"a\", \"type\": \"word\", \"optional\": true},"
                + " {\"name\": \"b\", \"type\": \"word\"}]}", "after an optional");
        refused("{\"format\": 1, \"name\": \"x\", \"arguments\": [{\"name\": \"a\", \"type\": \"text\"}, {\"name\": \"b\", \"type\": \"word\"}]}",
                "last argument");
        refused("{\"format\": 1, \"name\": \"x\", \"arguments\": [{\"name\": \"a\", \"type\": \"integer\", \"min\": 5, \"max\": 1}]}", "above max");
    }

    @Test
    void softProblemsAreWarnings() {
        ParseResult<Command> result = parse("""
                {"format": 1, "name": "x", "aliases": ["x", "y", "y"],
                 "arguments": [{"name": "w", "type": "word", "min": 1}]}""");
        Command def = result.definition().orElseThrow();
        assertEquals(List.of(), result.errors());
        assertEquals(2 + 1, result.warnings().size(), result.warnings().toString());
        assertEquals(List.of("x", "y"), def.literals());
        assertTrue(def.arguments().get(0).min().isEmpty(), "min dropped from a word");
    }

    @Test
    void functionAndEventTogetherAndNeitherAreAllowed() {
        clean("{\"format\": 1, \"name\": \"scores\"}");
        Command both = clean("""
                {"format": 1, "name": "x", "function": "m:f", "event": "m:go", "events": {"m:go": {"actions": [{"type": "heal", "amount": 1}]}}}""");
        assertTrue(both.function().isPresent() && both.event().isPresent());
    }

    @Test
    void anUndeclaredEventIsAnErrorButTheCommandRegisters() {
        ParseResult<Command> result = parse("""
                {"format": 1, "name": "x", "event": "m:missing",
                 "events": {"m:a": {"actions": [{"type": "trigger_event", "event": "m:gone"}]}}}""");
        assertTrue(result.definition().isPresent());
        assertEquals(2, result.errors().size(), result.errors().toString());
        assertTrue(result.errors().get(0).startsWith("event:"));
    }

    @Test
    void playAnimationIsDroppedWithAWarning() {
        ParseResult<Command> result = parse("""
                {"format": 1, "name": "x", "event": "m:go",
                 "events": {"m:go": {"actions": [{"type": "play_animation", "controller": "c", "animation": "a"}, {"type": "heal", "amount": 1}]}}}""");
        assertEquals(List.of(), result.errors());
        assertEquals(1, result.warnings().size(), result.warnings().toString());
        assertEquals(1, result.definition().orElseThrow().events().get(Identifier.parse("m:go")).orElseThrow().actions().size());
    }

    @Test
    void parseAllNamesTheFileAndSkipsOtherKinds() {
        JsonObject good = JsonParser.parseString("{\"format\": 1, \"name\": \"a\"}").getAsJsonObject();
        JsonObject bad = JsonParser.parseString("{\"format\": 1, \"name\": \"B\"}").getAsJsonObject();
        List<RawDefinition> raws = List.of(
                new RawDefinition("m", "command", Identifier.parse("m:good"), good),
                new RawDefinition("m", "command", Identifier.parse("m:bad"), bad),
                new RawDefinition("m", "item", Identifier.parse("m:item"), good));
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        Map<Identifier, Command> out = CommandParser.parseAll(raws, errors, warnings);
        assertEquals(List.of(Identifier.parse("m:good")), List.copyOf(out.keySet()));
        assertEquals(1, errors.size());
        assertTrue(errors.get(0).startsWith("msm/m/command/bad.json (mod m): "), errors.get(0));
        assertFalse(errors.get(0).contains("good"));
    }
}
