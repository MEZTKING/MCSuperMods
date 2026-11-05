package dev.mcsupermods.runtime.loader;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

/** Small typed accessors over Gson; the spike's stand-in for the Codecs B93 will add. */
final class Json {
    private Json() {}

    static JsonObject object(JsonObject parent, String key) throws DefinitionException {
        JsonElement e = parent.get(key);
        if (e == null || e.isJsonNull()) {
            return null;
        }
        if (!e.isJsonObject()) {
            throw new DefinitionException("'" + key + "' must be an object");
        }
        return e.getAsJsonObject();
    }

    static String string(JsonObject parent, String key, String fallback) throws DefinitionException {
        JsonElement e = parent.get(key);
        if (e == null || e.isJsonNull()) {
            return fallback;
        }
        if (!e.isJsonPrimitive() || !e.getAsJsonPrimitive().isString()) {
            throw new DefinitionException("'" + key + "' must be a string");
        }
        return e.getAsString();
    }

    static String requireString(JsonObject parent, String key) throws DefinitionException {
        String s = string(parent, key, null);
        if (s == null) {
            throw new DefinitionException("missing '" + key + "'");
        }
        return s;
    }

    static double number(JsonObject parent, String key, double fallback) throws DefinitionException {
        JsonElement e = parent.get(key);
        if (e == null || e.isJsonNull()) {
            return fallback;
        }
        if (!e.isJsonPrimitive() || !e.getAsJsonPrimitive().isNumber()) {
            throw new DefinitionException("'" + key + "' must be a number");
        }
        return e.getAsDouble();
    }

    static int integer(JsonObject parent, String key, int fallback, int min, int max) throws DefinitionException {
        double d = number(parent, key, fallback);
        if (d != Math.rint(d) || d < min || d > max) {
            throw new DefinitionException("'" + key + "' must be an integer from " + min + " to " + max);
        }
        return (int) d;
    }

    static boolean bool(JsonObject parent, String key, boolean fallback) throws DefinitionException {
        JsonElement e = parent.get(key);
        if (e == null || e.isJsonNull()) {
            return fallback;
        }
        if (!e.isJsonPrimitive() || !e.getAsJsonPrimitive().isBoolean()) {
            throw new DefinitionException("'" + key + "' must be true or false");
        }
        return e.getAsBoolean();
    }

    /** Checks {@code "format"}: required, and its major version must be 1. */
    static void requireFormat(JsonObject json) throws DefinitionException {
        if (!json.has("format")) {
            throw new DefinitionException("missing 'format'");
        }
        int format = integer(json, "format", 0, 1, Integer.MAX_VALUE);
        if (format > 1) {
            throw new DefinitionException("format " + format + " is newer than this runtime supports (1)");
        }
    }
}
