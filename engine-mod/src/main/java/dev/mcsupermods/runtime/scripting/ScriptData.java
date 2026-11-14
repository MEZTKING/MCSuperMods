package dev.mcsupermods.runtime.scripting;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.serialization.Codec;
import dev.mcsupermods.runtime.MsmRuntime;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * The value of the {@code msm_runtime:script_data} attachment (ADR 0062 D3): per script namespace, the JSON text of
 * one object holding that namespace's keys. Saved as {@code Map<namespace, JSON text>}, so {@code /data get} shows it
 * and the round trip is exact. Immutable: every change makes a new value (the parsed objects are kept with it and
 * never modified, so reads do not parse again).
 *
 * <p>Limits (ADR 0062 D4, defaults the user may veto): keys of at most {@value #MAX_KEY_LENGTH} characters; a
 * namespace's JSON text, in UTF-8 bytes, at most {@value #ENTITY_LIMIT_BYTES} on an entity and
 * {@value #WORLD_LIMIT_BYTES} in {@code msm.storage}. A text that cannot be read (edited by hand) reads as empty and is
 * logged once; the next {@code set} replaces it.
 */
public final class ScriptData {
    public static final int MAX_KEY_LENGTH = 64;
    public static final int ENTITY_LIMIT_BYTES = 16 * 1024;
    public static final int WORLD_LIMIT_BYTES = 1024 * 1024;

    private static final Gson GSON = new GsonBuilder().disableHtmlEscaping().serializeNulls().create();

    public static final ScriptData EMPTY = new ScriptData(Map.of(), Map.of());

    /** {@code {"<namespace>": "<JSON text>", ...}}, sorted by namespace. */
    public static final Codec<ScriptData> CODEC = Codec.unboundedMap(Codec.STRING, Codec.STRING)
            .xmap(ScriptData::of, ScriptData::texts);

    /** A change that would break a limit; the stored value is left as it was. */
    public static final class LimitException extends RuntimeException {
        LimitException(String message) {
            super(message);
        }
    }

    private final Map<String, String> texts;
    private final Map<String, JsonObject> parsed;

    private ScriptData(Map<String, String> texts, Map<String, JsonObject> parsed) {
        this.texts = texts;
        this.parsed = parsed;
    }

    /** The data of saved texts. */
    public static ScriptData of(Map<String, String> texts) {
        return texts.isEmpty() ? EMPTY : new ScriptData(Collections.unmodifiableMap(new TreeMap<>(texts)), new HashMap<>());
    }

    /** Namespace to JSON text, sorted. */
    public Map<String, String> texts() {
        return texts;
    }

    public boolean isEmpty() {
        return texts.isEmpty();
    }

    /** One namespace's object; shared, never to be modified. */
    private JsonObject values(String namespace) {
        String text = texts.get(namespace);
        if (text == null) {
            return new JsonObject();
        }
        JsonObject obj = parsed.get(namespace);
        if (obj == null) {
            try {
                JsonElement json = JsonParser.parseString(text);
                obj = json.isJsonObject() ? json.getAsJsonObject() : null;
            } catch (RuntimeException e) {
                obj = null;
            }
            if (obj == null) {
                MsmRuntime.LOGGER.error("[{}] saved script data of namespace {} is not a JSON object and reads as empty",
                        MsmRuntime.MOD_ID, namespace);
                obj = new JsonObject();
            }
            parsed.put(namespace, obj);
        }
        return obj;
    }

    /** The stored value (shared, never to be modified), or null. */
    public JsonElement get(String namespace, String key) {
        return values(namespace).get(key);
    }

    public boolean has(String namespace, String key) {
        return values(namespace).has(key);
    }

    /** The keys of a namespace in the order they were first set. */
    public List<String> keys(String namespace) {
        return List.copyOf(values(namespace).keySet());
    }

    /**
     * This data with {@code key} set to a copy of {@code value} in {@code namespace}; a {@link LimitException} when the
     * key is too long or the namespace's text would exceed {@code limitBytes}.
     */
    public ScriptData with(String namespace, String key, JsonElement value, int limitBytes, String label) {
        checkKey(key);
        JsonObject next = new JsonObject();
        values(namespace).entrySet().forEach(e -> next.add(e.getKey(), e.getValue()));
        next.add(key, value.deepCopy());
        String text = GSON.toJson(next);
        int size = size(text);
        if (size > limitBytes) {
            throw new LimitException(label + " of namespace " + namespace + " would hold " + size + " bytes, over its limit of "
                    + limitBytes + "; the old value stays");
        }
        return replaced(namespace, text, next);
    }

    /** This data without {@code key} in {@code namespace} (itself when there is no such key). */
    public ScriptData without(String namespace, String key) {
        checkKey(key);
        JsonObject current = values(namespace);
        if (!current.has(key)) {
            return this;
        }
        JsonObject next = new JsonObject();
        current.entrySet().forEach(e -> {
            if (!e.getKey().equals(key)) {
                next.add(e.getKey(), e.getValue());
            }
        });
        return replaced(namespace, next.isEmpty() ? null : GSON.toJson(next), next);
    }

    private ScriptData replaced(String namespace, String text, JsonObject obj) {
        Map<String, String> nextTexts = new TreeMap<>(texts);
        Map<String, JsonObject> nextParsed = new HashMap<>(parsed);
        if (text == null) {
            nextTexts.remove(namespace);
            nextParsed.remove(namespace);
        } else {
            nextTexts.put(namespace, text);
            nextParsed.put(namespace, obj);
        }
        return nextTexts.isEmpty() ? EMPTY : new ScriptData(Collections.unmodifiableMap(nextTexts), nextParsed);
    }

    /** A {@link LimitException} for a key longer than {@value #MAX_KEY_LENGTH} characters. */
    public static void checkKey(String key) {
        if (key.length() > MAX_KEY_LENGTH) {
            throw new LimitException("key '" + key.substring(0, 16) + "...' has " + key.length() + " characters, more than "
                    + MAX_KEY_LENGTH);
        }
    }

    /** The UTF-8 size of a text, the measure of the limits. */
    public static int size(String text) {
        return text.getBytes(StandardCharsets.UTF_8).length;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof ScriptData d && d.texts.equals(texts);
    }

    @Override
    public int hashCode() {
        return texts.hashCode();
    }

    @Override
    public String toString() {
        return "ScriptData" + texts;
    }
}
