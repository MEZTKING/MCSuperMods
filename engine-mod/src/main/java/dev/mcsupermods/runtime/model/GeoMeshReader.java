package dev.mcsupermods.runtime.model;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;
import dev.mcsupermods.runtime.model.GeoMesh.Bone;
import dev.mcsupermods.runtime.model.GeoMesh.BoxUv;
import dev.mcsupermods.runtime.model.GeoMesh.Cube;
import dev.mcsupermods.runtime.model.GeoMesh.Face;
import dev.mcsupermods.runtime.model.GeoMesh.FaceRect;
import dev.mcsupermods.runtime.model.GeoMesh.FaceUv;
import dev.mcsupermods.runtime.model.GeoMesh.Uv;
import dev.mcsupermods.runtime.model.GeoMesh.Vec3;
import java.io.Reader;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Reads a Bedrock geometry file (format 1.12.0; the first entry of {@code minecraft:geometry}) into a
 * {@link GeoMesh} in Java model space (ADR 0072 D1). Pure Java over Gson: no client classes, never throws.
 *
 * <p>It reads exactly what the app's preview baker reads ({@code app/src/renderer/src/preview/geo/geometry.ts},
 * B117): bones with pivots, rest rotations, parents, {@code mirror} and {@code inflate} as defaults for their
 * cubes; cubes with {@code origin}, {@code size}, box UV ({@code uv: [u, v]}) or per-face UV
 * ({@code uv: {face: {uv, uv_size, uv_rotation}}}), {@code inflate}, {@code mirror}, {@code pivot} and
 * {@code rotation}. Duplicate bones are dropped; an unknown parent or a parent cycle makes a root bone; a
 * cube without UV is dropped. Each of these adds a problem. The shared golden in {@code fixtures/geo-parity/}
 * keeps the two readers equal.
 */
public final class GeoMeshReader {
    /** Feet height of a Java model: a Bedrock y becomes {@code 24 - y}. */
    public static final float MODEL_HEIGHT = 24.0f;

    private GeoMeshReader() {
    }

    /** Reads a geometry file's text. */
    public static GeoMesh read(Reader reader) {
        JsonElement root;
        try {
            root = JsonParser.parseReader(reader);
        } catch (JsonParseException | IllegalStateException e) {
            return new GeoMesh(64, 64, List.of(), List.of("The model is not valid JSON: " + e.getMessage()));
        }
        return read(root);
    }

    /** Reads a parsed geometry file. */
    public static GeoMesh read(JsonElement root) {
        List<String> problems = new ArrayList<>();
        JsonObject geometry = firstGeometry(root);
        if (geometry == null) {
            problems.add("The model has no geometry.");
            geometry = new JsonObject();
        }
        JsonObject description = object(geometry.get("description"));
        float textureWidth = Math.max(1, num(description.get("texture_width"), 64));
        float textureHeight = Math.max(1, num(description.get("texture_height"), 64));

        // Bones by name; later duplicates are skipped.
        List<JsonObject> sources = new ArrayList<>();
        List<String> names = new ArrayList<>();
        Map<String, Integer> index = new HashMap<>();
        for (JsonElement element : array(geometry.get("bones"))) {
            if (!element.isJsonObject()) {
                continue;
            }
            JsonObject raw = element.getAsJsonObject();
            String name = string(raw.get("name"), "");
            if (index.containsKey(name)) {
                problems.add("Duplicate bone \"" + name + "\" skipped.");
                continue;
            }
            index.put(name, sources.size());
            sources.add(raw);
            names.add(name);
        }
        int[] parents = new int[sources.size()];
        for (int i = 0; i < sources.size(); i++) {
            parents[i] = -1;
            JsonElement parent = sources.get(i).get("parent");
            if (!isString(parent)) {
                continue;
            }
            Integer found = index.get(parent.getAsString());
            if (found == null || found == i) {
                problems.add("Bone \"" + names.get(i) + "\" has an unknown parent \"" + parent.getAsString() + "\".");
                continue;
            }
            parents[i] = found;
        }
        // Break parent cycles: a bone whose ancestors loop back to it becomes a root.
        for (int i = 0; i < parents.length; i++) {
            Set<Integer> seen = new HashSet<>();
            seen.add(i);
            int current = parents[i];
            while (current != -1) {
                if (!seen.add(current)) {
                    problems.add("Bone \"" + names.get(i) + "\" is part of a parent cycle; drawn as a root bone.");
                    parents[i] = -1;
                    break;
                }
                current = parents[current];
            }
        }

        List<Bone> bones = new ArrayList<>();
        for (int i = 0; i < sources.size(); i++) {
            JsonObject raw = sources.get(i);
            String name = names.get(i);
            boolean boneMirror = isTrue(raw.get("mirror"));
            float boneInflate = num(raw.get("inflate"), 0);
            List<Cube> cubes = new ArrayList<>();
            for (JsonElement element : array(raw.get("cubes"))) {
                if (!element.isJsonObject()) {
                    continue;
                }
                Cube cube = cube(element.getAsJsonObject(), boneMirror, boneInflate);
                if (cube == null) {
                    problems.add("A cube of bone \"" + name + "\" has no UV; skipped.");
                    continue;
                }
                cubes.add(cube);
            }
            Optional<String> parent = parents[i] == -1 ? Optional.empty() : Optional.of(names.get(parents[i]));
            bones.add(new Bone(name, parent, point(vec(raw.get("pivot"))), vec(raw.get("rotation")), cubes));
        }
        return new GeoMesh(textureWidth, textureHeight, bones, problems);
    }

    /** A Bedrock point in Java model space: y flipped about the feet. */
    public static Vec3 point(Vec3 bedrock) {
        return new Vec3(bedrock.x(), MODEL_HEIGHT - bedrock.y(), bedrock.z());
    }

    private static Cube cube(JsonObject raw, boolean boneMirror, float boneInflate) {
        Vec3 origin = vec(raw.get("origin"));
        Vec3 size = vec(raw.get("size"));
        float inflate = isNumber(raw.get("inflate")) ? num(raw.get("inflate"), 0) : boneInflate;
        boolean mirror = isBoolean(raw.get("mirror")) ? raw.get("mirror").getAsBoolean() : boneMirror;
        Uv uv;
        JsonElement uvElement = raw.get("uv");
        if (uvElement != null && uvElement.isJsonArray()) {
            JsonArray offset = uvElement.getAsJsonArray();
            uv = new BoxUv(num(at(offset, 0), 0), num(at(offset, 1), 0));
        } else if (uvElement != null && uvElement.isJsonObject()) {
            Map<Face, FaceRect> faces = new EnumMap<>(Face.class);
            JsonObject map = uvElement.getAsJsonObject();
            for (Face face : Face.values()) {
                FaceRect rect = faceRect(face, map.get(face.key()), size);
                if (rect != null) {
                    faces.put(face, rect);
                }
            }
            uv = new FaceUv(faces);
        } else {
            return null;
        }
        // Bedrock origin is the corner with the smallest coordinates; with y flipped, the top becomes the minimum.
        Vec3 min = new Vec3(origin.x(), MODEL_HEIGHT - origin.y() - size.y(), origin.z());
        return new Cube(min, size, inflate, mirror, point(vec(raw.get("pivot"))), vec(raw.get("rotation")), uv);
    }

    /** The per-face rectangle of one face entry, or {@code null} when the face is not drawn. */
    private static FaceRect faceRect(Face face, JsonElement element, Vec3 size) {
        if (element == null || !element.isJsonObject()) {
            return null;
        }
        JsonObject entry = element.getAsJsonObject();
        JsonElement uvElement = entry.get("uv");
        if (uvElement == null || !uvElement.isJsonArray()) {
            return null;
        }
        JsonArray uv = uvElement.getAsJsonArray();
        float u = num(at(uv, 0), 0);
        float v = num(at(uv, 1), 0);
        float[] fallback = switch (face) {
            case EAST, WEST -> new float[] {size.z(), size.y()};
            case UP, DOWN -> new float[] {size.x(), size.z()};
            case NORTH, SOUTH -> new float[] {size.x(), size.y()};
        };
        float w = fallback[0];
        float h = fallback[1];
        JsonElement uvSize = entry.get("uv_size");
        if (uvSize != null && uvSize.isJsonArray()) {
            w = num(at(uvSize.getAsJsonArray(), 0), fallback[0]);
            h = num(at(uvSize.getAsJsonArray(), 1), fallback[1]);
        }
        int rotation = (int) num(entry.get("uv_rotation"), 0);
        if (face == Face.UP || face == Face.DOWN) {
            return new FaceRect(u + w, v + h, u, v, rotation);
        }
        return new FaceRect(u, v, u + w, v + h, rotation);
    }

    private static JsonObject firstGeometry(JsonElement root) {
        if (root == null || !root.isJsonObject()) {
            return null;
        }
        JsonElement list = root.getAsJsonObject().get("minecraft:geometry");
        if (list == null || !list.isJsonArray() || list.getAsJsonArray().isEmpty()) {
            return null;
        }
        JsonElement first = list.getAsJsonArray().get(0);
        return first.isJsonObject() ? first.getAsJsonObject() : null;
    }

    static Vec3 vec(JsonElement element) {
        if (element == null || !element.isJsonArray()) {
            return Vec3.ZERO;
        }
        JsonArray array = element.getAsJsonArray();
        return new Vec3(num(at(array, 0), 0), num(at(array, 1), 0), num(at(array, 2), 0));
    }

    private static JsonElement at(JsonArray array, int i) {
        return i < array.size() ? array.get(i) : null;
    }

    private static Iterable<JsonElement> array(JsonElement element) {
        return element != null && element.isJsonArray() ? element.getAsJsonArray() : List.of();
    }

    private static JsonObject object(JsonElement element) {
        return element != null && element.isJsonObject() ? element.getAsJsonObject() : new JsonObject();
    }

    /** A finite JSON number, else the fallback (strings do not count, as in the preview). */
    static float num(JsonElement element, float fallback) {
        if (!isNumber(element)) {
            return fallback;
        }
        double value = element.getAsDouble();
        return Double.isFinite(value) ? (float) value : fallback;
    }

    private static boolean isNumber(JsonElement element) {
        return element instanceof JsonPrimitive p && p.isNumber();
    }

    private static boolean isString(JsonElement element) {
        return element instanceof JsonPrimitive p && p.isString();
    }

    private static boolean isBoolean(JsonElement element) {
        return element instanceof JsonPrimitive p && p.isBoolean();
    }

    private static boolean isTrue(JsonElement element) {
        return isBoolean(element) && element.getAsBoolean();
    }

    private static String string(JsonElement element, String fallback) {
        return isString(element) ? element.getAsString() : fallback;
    }
}
