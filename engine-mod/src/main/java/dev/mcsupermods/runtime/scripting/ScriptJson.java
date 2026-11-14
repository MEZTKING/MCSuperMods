package dev.mcsupermods.runtime.scripting;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;
import java.math.BigInteger;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Map;
import java.util.Set;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.Function;
import org.mozilla.javascript.NativeArray;
import org.mozilla.javascript.NativeObject;
import org.mozilla.javascript.ScriptRuntime;
import org.mozilla.javascript.Scriptable;
import org.mozilla.javascript.ScriptableObject;
import org.mozilla.javascript.Symbol;
import org.mozilla.javascript.Undefined;

/**
 * Script values to JSON and back for saved script data (ADR 0062 D1). JSON values are strings, finite numbers,
 * booleans, {@code null}, arrays and plain objects ({@code {}} literals and {@code Object.create(null)}) of these;
 * anything else ({@code undefined}, {@code NaN}, {@code Infinity}, functions, symbols, BigInts, dates, script API
 * objects, array holes, cycles) is a {@code TypeError} naming where it was found. Both directions copy: the script
 * never holds a reference into stored data.
 *
 * <p>Nesting is limited to {@value #MAX_DEPTH} levels, below the default nesting limit of Gson's reader (255), so
 * every value that can be saved can be read back.
 */
final class ScriptJson {
    /** Containers nested deeper than this are a {@code TypeError}. */
    static final int MAX_DEPTH = 128;
    /** Integral numbers up to this magnitude are stored without a fraction ({@code 3}, not {@code 3.0}). */
    private static final double MAX_SAFE_INTEGER = 9007199254740991.0;

    private ScriptJson() {}

    /** A copy of a script value as JSON; a {@code TypeError} when it is not a JSON value. */
    static JsonElement fromScript(Object value) {
        return from(value, "value", 0, Collections.newSetFromMap(new IdentityHashMap<>()));
    }

    private static JsonElement from(Object v, String path, int depth, Set<Object> open) {
        if (v == null) {
            return JsonNull.INSTANCE;
        }
        if (Undefined.isUndefined(v) || v == Scriptable.NOT_FOUND) {
            throw ScriptRuntime.typeError(path + " is undefined, which is not a JSON value");
        }
        if (v instanceof Boolean b) {
            return new JsonPrimitive(b);
        }
        if (v instanceof CharSequence s) {
            return new JsonPrimitive(s.toString());
        }
        if (v instanceof BigInteger) {
            throw ScriptRuntime.typeError(path + " is a BigInt, which is not a JSON value");
        }
        if (v instanceof Number n) {
            double d = n.doubleValue();
            if (!Double.isFinite(d)) {
                throw ScriptRuntime.typeError(path + " is " + ScriptRuntime.toString(d) + ", which is not a JSON value");
            }
            if (d == Math.rint(d) && Math.abs(d) <= MAX_SAFE_INTEGER) {
                return new JsonPrimitive((long) d);
            }
            return new JsonPrimitive(d);
        }
        if (v instanceof NativeArray || (v instanceof NativeObject && v.getClass() == NativeObject.class)) {
            if (depth >= MAX_DEPTH) {
                throw ScriptRuntime.typeError(path + " is nested more than " + MAX_DEPTH + " levels deep");
            }
            if (!open.add(v)) {
                throw ScriptRuntime.typeError(path + " refers back to an object that contains it (a cycle)");
            }
            try {
                return v instanceof NativeArray a ? array(a, path, depth, open) : object((NativeObject) v, path, depth, open);
            } finally {
                open.remove(v);
            }
        }
        throw ScriptRuntime.typeError(path + " is " + describe(v) + ", which is not a JSON value");
    }

    private static JsonArray array(NativeArray a, String path, int depth, Set<Object> open) {
        JsonArray out = new JsonArray();
        long length = a.getLength();
        for (long i = 0; i < length; i++) {
            Object e = i <= Integer.MAX_VALUE ? a.get((int) i, a) : Scriptable.NOT_FOUND;
            String at = path + "[" + i + "]";
            if (e == Scriptable.NOT_FOUND) {
                throw ScriptRuntime.typeError(at + " is an empty array slot, which is not a JSON value");
            }
            out.add(from(e, at, depth + 1, open));
        }
        return out;
    }

    private static JsonObject object(NativeObject o, String path, int depth, Set<Object> open) {
        JsonObject out = new JsonObject();
        for (Object id : o.getIds()) {
            Object e;
            String key;
            if (id instanceof Integer i) {
                key = Integer.toString(i);
                e = o.get(i, o);
            } else if (id instanceof CharSequence s) {
                key = s.toString();
                e = o.get(key, o);
            } else {
                continue; // symbol keys are not part of JSON
            }
            out.add(key, from(e, path + "." + key, depth + 1, open));
        }
        return out;
    }

    private static String describe(Object v) {
        if (v instanceof Function) {
            return "a function";
        }
        if (v instanceof Symbol) {
            return "a symbol";
        }
        if (v instanceof Scriptable s) {
            return "a " + s.getClassName() + " object";
        }
        return "a " + v.getClass().getSimpleName();
    }

    /**
     * A fresh script value for a JSON value, made in {@code scope}: JSON {@code null} is Java {@code null} (a script
     * {@code null}), numbers are doubles, arrays and objects are new script arrays and plain objects.
     */
    static Object toScript(Context cx, Scriptable scope, JsonElement json) {
        if (json == null || json.isJsonNull()) {
            return null;
        }
        if (json instanceof JsonPrimitive p) {
            if (p.isBoolean()) {
                return p.getAsBoolean();
            }
            if (p.isNumber()) {
                return p.getAsDouble();
            }
            return p.getAsString();
        }
        if (json instanceof JsonArray a) {
            Object[] values = new Object[a.size()];
            for (int i = 0; i < values.length; i++) {
                values[i] = toScript(cx, scope, a.get(i));
            }
            return cx.newArray(scope, values);
        }
        Scriptable obj = cx.newObject(scope);
        for (Map.Entry<String, JsonElement> e : json.getAsJsonObject().entrySet()) {
            Object value = toScript(cx, scope, e.getValue());
            int index = arrayIndex(e.getKey());
            if (index >= 0) {
                ScriptableObject.putProperty(obj, index, value);
            } else {
                ScriptableObject.putProperty(obj, e.getKey(), value);
            }
        }
        return obj;
    }

    /** {@code "12"} as 12 (so {@code o[12]} finds it, as for a script's own object), else -1. */
    private static int arrayIndex(String key) {
        int n = key.length();
        if (n == 0 || n > 10 || (n > 1 && key.charAt(0) == '0')) {
            return -1;
        }
        long value = 0;
        for (int i = 0; i < n; i++) {
            char c = key.charAt(i);
            if (c < '0' || c > '9') {
                return -1;
            }
            value = value * 10 + (c - '0');
        }
        return value < Integer.MAX_VALUE ? (int) value : -1;
    }
}
