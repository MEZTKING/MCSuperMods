package dev.mcsupermods.runtime.scripting;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;
import com.mojang.serialization.JsonOps;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.EcmaError;
import org.mozilla.javascript.Scriptable;
import org.mozilla.javascript.ScriptableObject;

/**
 * Saved script data (ADR 0062 D1, D3, D4) without a game: {@link ScriptJson} value conversion in a Rhino context of
 * the runtime's settings, and {@link ScriptData} keys, limits, immutability and its saved form.
 */
class ScriptDataTest {
    private Context cx;
    private ScriptableObject scope;

    @BeforeEach
    void enter() {
        cx = new MsmContextFactory(MsmContextFactory.DEFAULT_BUDGET_MS).enterContext();
        scope = cx.initSafeStandardObjects(null, true);
    }

    @AfterEach
    void exit() {
        cx.close();
    }

    private Object eval(String source) {
        return cx.evaluateString(scope, source, "test.js", 1, null);
    }

    private String json(String source) {
        return ScriptJson.fromScript(eval(source)).toString();
    }

    private String rejected(String source) {
        EcmaError e = assertThrows(EcmaError.class, () -> ScriptJson.fromScript(eval(source)), source);
        assertEquals("TypeError", e.getName(), source);
        return e.getErrorMessage();
    }

    // ---- script to JSON ------------------------------------------------------------------------------------

    @Test
    void jsonValuesConvert() {
        assertEquals("{\"a\":1,\"b\":[true,null,\"x\",0.5,-3],\"c\":{\"d\":{}},\"e\":[]}",
                json("({ a: 1, b: [true, null, 'x', 0.5, -3], c: { d: {} }, e: [] })"));
        assertEquals("\"text\"", json("'te' + 'xt'"));
        assertEquals("null", json("null"));
        assertEquals("3", json("1.5 * 2"), "an integral number has no fraction");
        assertEquals("1.0E21", json("1e21"), "beyond the safe integers a number stays a double");
        assertEquals("{\"0\":\"zero\",\"k\":2}", json("({ 0: 'zero', k: 2 })"));
        assertEquals("{\"x\":1}", json("var o = Object.create(null); o.x = 1; o"));
    }

    @Test
    void nonJsonValuesAreTypeErrors() {
        assertTrue(rejected("undefined").contains("value is undefined"));
        assertTrue(rejected("NaN").contains("value is NaN"));
        assertTrue(rejected("[1, Infinity]").contains("value[1] is Infinity"));
        assertTrue(rejected("({ f: function () {} })").contains("value.f is a function"));
        assertTrue(rejected("({ a: { b: undefined } })").contains("value.a.b is undefined"));
        assertTrue(rejected("new Date(0)").contains("is a Date object"));
        assertTrue(rejected("/x/").contains("not a JSON value"));
        assertTrue(rejected("Symbol('s')").contains("a symbol"));
        assertTrue(rejected("var a = [1]; a[3] = 2; a").contains("value[1] is an empty array slot"));
        assertTrue(rejected("var c = { n: [] }; c.n.push(c); c").contains("a cycle"));
        assertTrue(rejected("var d = []; for (var i = 0; i < 200; i++) d = [d]; d").contains("nested more than 128 levels"));
    }

    @Test
    void sharedButAcyclicObjectsAreFine() {
        assertEquals("[{\"a\":1},{\"a\":1}]", json("var s = { a: 1 }; [s, s]"));
    }

    // ---- JSON to script ------------------------------------------------------------------------------------

    @Test
    void jsonBecomesFreshScriptValues() {
        JsonElement stored = JsonParser.parseString("{\"list\":[1,2.5,{\"x\":\"y\"}],\"n\":null,\"t\":true,\"7\":\"seven\"}");
        Object first = ScriptJson.toScript(cx, scope, stored);
        Object second = ScriptJson.toScript(cx, scope, stored);
        assertTrue(first instanceof Scriptable && first != second, "a fresh object on every read");
        ScriptableObject.putProperty(scope, "v", first);
        assertEquals("1|2.5|y|null|true|seven|number|true",
                Context.toString(eval("[v.list[0], v.list[1], v.list[2].x, String(v.n), v.t, v[7], typeof v.list[0], Array.isArray(v.list)].join('|')")));
        eval("v.list.push(4)");
        assertEquals(3, ((com.google.gson.JsonObject) stored).getAsJsonArray("list").size(), "the stored JSON is untouched");
        assertNull(ScriptJson.toScript(cx, scope, JsonParser.parseString("null")));
    }

    // ---- ScriptData ----------------------------------------------------------------------------------------

    @Test
    void setGetRemoveAndNamespaces() {
        ScriptData d = ScriptData.EMPTY
                .with("a", "count", new JsonPrimitive(1), ScriptData.ENTITY_LIMIT_BYTES, "entity.data")
                .with("a", "name", new JsonPrimitive("x"), ScriptData.ENTITY_LIMIT_BYTES, "entity.data")
                .with("b", "count", new JsonPrimitive(2), ScriptData.ENTITY_LIMIT_BYTES, "entity.data");
        assertEquals(Map.of("a", "{\"count\":1,\"name\":\"x\"}", "b", "{\"count\":2}"), d.texts());
        assertEquals(List.of("count", "name"), d.keys("a"));
        assertEquals(List.of(), d.keys("c"));
        assertEquals(new JsonPrimitive(2), d.get("b", "count"));
        assertFalse(d.has("b", "name"));
        assertSame(d, d.without("a", "missing"), "removing a missing key changes nothing");
        ScriptData removed = d.without("b", "count");
        assertEquals(Map.of("a", "{\"count\":1,\"name\":\"x\"}"), removed.texts(), "an emptied namespace is dropped");
        assertTrue(removed.without("a", "count").without("a", "name").isEmpty());
        assertEquals(2, d.texts().size(), "values are immutable");
    }

    @Test
    void keysOfAtMost64Characters() {
        String ok = "k".repeat(64);
        assertTrue(ScriptData.EMPTY.with("a", ok, new JsonPrimitive(1), 100, "entity.data").has("a", ok));
        ScriptData.LimitException e = assertThrows(ScriptData.LimitException.class,
                () -> ScriptData.EMPTY.with("a", ok + "k", new JsonPrimitive(1), 100, "entity.data"));
        assertTrue(e.getMessage().contains("65 characters, more than 64"), e.getMessage());
        assertThrows(ScriptData.LimitException.class, () -> ScriptData.EMPTY.without("a", ok + "k"));
    }

    @Test
    void sizeLimitIsTheNamespacesUtf8TextAndKeepsTheOldValue() {
        // {"k":"<n chars>"} is n + 8 bytes.
        ScriptData d = ScriptData.EMPTY.with("a", "k", new JsonPrimitive("x".repeat(92)), 100, "entity.data");
        assertEquals(100, ScriptData.size(d.texts().get("a")), "exactly at the limit is allowed");
        ScriptData.LimitException e = assertThrows(ScriptData.LimitException.class,
                () -> d.with("a", "k", new JsonPrimitive("é".repeat(47)), 100, "entity.data"));
        assertEquals("entity.data of namespace a would hold 102 bytes, over its limit of 100; the old value stays", e.getMessage());
        assertEquals(new JsonPrimitive("x".repeat(92)), d.get("a", "k"), "old value kept");
        assertTrue(d.with("b", "k", new JsonPrimitive("x".repeat(92)), 100, "entity.data").has("b", "k"),
                "each namespace has its own limit");
        assertEquals(16 * 1024, ScriptData.ENTITY_LIMIT_BYTES);
        assertEquals(1024 * 1024, ScriptData.WORLD_LIMIT_BYTES);
    }

    @Test
    void savedFormIsNamespaceToJsonTextAndRoundTrips() {
        ScriptData d = ScriptData.EMPTY.with("b", "v", JsonParser.parseString("{\"x\":[1,\"<&>\"]}"), 1000, "msm.storage")
                .with("a", "n", JsonParser.parseString("null"), 1000, "msm.storage");
        JsonElement saved = ScriptData.CODEC.encodeStart(JsonOps.INSTANCE, d).getOrThrow();
        assertEquals("{\"a\":\"{\\\"n\\\":null}\",\"b\":\"{\\\"v\\\":{\\\"x\\\":[1,\\\"<&>\\\"]}}\"}", saved.toString());
        ScriptData loaded = ScriptData.CODEC.parse(JsonOps.INSTANCE, saved).getOrThrow();
        assertEquals(d, loaded);
        assertEquals(JsonParser.parseString("{\"x\":[1,\"<&>\"]}"), loaded.get("b", "v"));
    }

    @Test
    void unreadableSavedTextReadsAsEmptyAndIsReplacedOnSet() {
        ScriptData d = ScriptData.of(Map.of("a", "not json {", "b", "[1]"));
        assertEquals(List.of(), d.keys("a"));
        assertFalse(d.has("b", "0"));
        assertEquals("{\"k\":1}", d.with("a", "k", new JsonPrimitive(1), 100, "entity.data").texts().get("a"));
    }
}
