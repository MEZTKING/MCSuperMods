package dev.mcsupermods.runtime.scripting;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * The script API contract (ADR 0032 D1): {@link ScriptApi#describe()}, the member tree the host installs, has exactly
 * the types, members, events and globals of {@code packages/plugins/scripting/api/script-api-v1.json}, which also
 * generates the app's {@code msm-runtime.d.ts}. Compared: type names and {@code extends}, member names and kinds,
 * required and total parameter counts of methods (over all overloads), namespaces recursively, and per event its type,
 * {@code cancellable} and Fabric API {@code source}. Inherited members are resolved through {@code extends} on both
 * sides ({@code Player extends Entity}, every event type extends {@code GameEvent}).
 */
class ScriptApiContractTest {
    private static final Path API = Path.of(System.getProperty("msm.script.api",
            "../packages/plugins/scripting/api/script-api-v1.json"));

    private static JsonObject json;
    private static ScriptApi.Description java;

    @BeforeAll
    static void read() throws IOException {
        try (Reader r = Files.newBufferedReader(API, StandardCharsets.UTF_8)) {
            json = JsonParser.parseReader(r).getAsJsonObject();
        }
        java = ScriptApi.describe();
    }

    @Test
    void versionIsOne() {
        assertEquals(1, json.get("version").getAsInt(), "script API version");
    }

    @Test
    void typesMatch() {
        JsonObject types = json.getAsJsonObject("types");
        assertEquals(new TreeSet<>(types.keySet()), new TreeSet<>(java.types().keySet()), "type names");
        for (String name : types.keySet()) {
            JsonObject type = types.getAsJsonObject(name);
            ScriptApi.TypeDescription described = java.types().get(name);
            String parent = type.has("extends") ? type.get("extends").getAsString() : null;
            assertEquals(parent, described.extendsType(), name + " extends");
            assertEquals(jsonMembers(type.getAsJsonObject("members")), javaMembers(described), name + " members");
        }
    }

    @Test
    void inheritedMembersResolveThroughExtends() {
        JsonObject types = json.getAsJsonObject("types");
        for (String name : types.keySet()) {
            assertEquals(jsonAllMembers(types, name), javaAllMembers(name), name + " members including inherited ones");
        }
        assertTrue(javaAllMembers("Player").containsAll(javaAllMembers("Entity")), "Player has every Entity member");
        assertTrue(javaAllMembers("Player").contains("asPlayer") && javaAllMembers("Player").contains("give"),
                "Player has Entity.asPlayer and its own give");
    }

    @Test
    void globalsMatch() {
        JsonObject globals = json.getAsJsonObject("globals");
        assertEquals(new TreeSet<>(globals.keySet()), new TreeSet<>(java.globals().keySet()), "global names");
        for (String name : globals.keySet()) {
            assertEquals(jsonMembers(globals.getAsJsonObject(name).getAsJsonObject("members")), javaMembers(java.globals().get(name)),
                    "global " + name);
        }
    }

    @Test
    void eventsMatch() {
        JsonObject events = json.getAsJsonObject("events");
        assertEquals(new TreeSet<>(events.keySet()), new TreeSet<>(java.events().keySet()), "event names");
        for (String name : events.keySet()) {
            JsonObject event = events.getAsJsonObject(name);
            ScriptApi.EventDescription described = java.events().get(name);
            assertEquals(event.get("type").getAsString(), described.type(), name + " type");
            assertEquals(event.get("cancellable").getAsBoolean(), described.cancellable(), name + " cancellable");
            assertEquals(event.get("source").getAsString(), described.source(), name + " source");
            assertNotNull(java.types().get(described.type()), name + ": type " + described.type() + " is not described");
            assertTrue(javaAllMembers(described.type()).contains("world"), name + ": " + described.type() + " does not extend GameEvent");
            assertEquals(described.cancellable(), javaAllMembers(described.type()).contains("cancel"),
                    name + ": cancel() exists exactly when the event is cancellable");
        }
    }

    @Test
    void everyEventHasAnOnOverload() {
        JsonArray overloads = json.getAsJsonObject("globals").getAsJsonObject("msm").getAsJsonObject("members")
                .getAsJsonObject("events").getAsJsonObject("members").getAsJsonObject("on").getAsJsonArray("overloads");
        Set<String> names = new TreeSet<>();
        for (JsonElement o : overloads) {
            String literal = o.getAsJsonObject().getAsJsonArray("params").get(0).getAsJsonObject().get("type").getAsString();
            names.add(literal.substring(1, literal.length() - 1));
        }
        assertEquals(new TreeSet<>(java.events().keySet()), names, "msm.events.on overloads");
    }

    // ---- canonical forms -------------------------------------------------------------------------------

    /** {@code name -> "property"}, {@code "method(required..total)"} or {@code "namespace{...}"}. */
    private static Map<String, String> jsonMembers(JsonObject members) {
        Map<String, String> out = new TreeMap<>();
        for (String name : members.keySet()) {
            JsonObject m = members.getAsJsonObject(name);
            String kind = m.get("kind").getAsString();
            out.put(name, switch (kind) {
                case "method" -> {
                    int min = Integer.MAX_VALUE;
                    int max = 0;
                    if (m.has("overloads")) {
                        for (JsonElement o : m.getAsJsonArray("overloads")) {
                            JsonArray params = o.getAsJsonObject().getAsJsonArray("params");
                            min = Math.min(min, required(params));
                            max = Math.max(max, params.size());
                        }
                    } else {
                        JsonArray params = m.getAsJsonArray("params");
                        min = required(params);
                        max = params.size();
                    }
                    yield "method(" + min + ".." + max + ")";
                }
                case "namespace" -> "namespace" + jsonMembers(m.getAsJsonObject("members"));
                default -> kind;
            });
        }
        return out;
    }

    private static int required(JsonArray params) {
        int n = 0;
        for (JsonElement p : params) {
            JsonObject param = p.getAsJsonObject();
            if (!(param.has("optional") && param.get("optional").getAsBoolean())) {
                n++;
            }
        }
        return n;
    }

    private static Map<String, String> javaMembers(ScriptApi.TypeDescription type) {
        Map<String, String> out = new TreeMap<>();
        type.members().forEach((name, m) -> out.put(name, switch (m.kind()) {
            case "method" -> "method(" + m.minParams() + ".." + m.maxParams() + ")";
            case "namespace" -> "namespace" + javaMembers(m.namespace());
            default -> m.kind();
        }));
        return out;
    }

    private static Set<String> jsonAllMembers(JsonObject types, String name) {
        Set<String> out = new LinkedHashSet<>();
        JsonObject type = types.getAsJsonObject(name);
        assertNotNull(type, "JSON extends an unknown type " + name);
        if (type.has("extends")) {
            out.addAll(jsonAllMembers(types, type.get("extends").getAsString()));
        }
        out.addAll(type.getAsJsonObject("members").keySet());
        return new TreeSet<>(out);
    }

    private static Set<String> javaAllMembers(String name) {
        Set<String> out = new TreeSet<>();
        ScriptApi.TypeDescription type = java.types().get(name);
        assertNotNull(type, "the host extends an unknown type " + name);
        if (type.extendsType() != null) {
            out.addAll(javaAllMembers(type.extendsType()));
        }
        out.addAll(type.members().keySet());
        return out;
    }
}
