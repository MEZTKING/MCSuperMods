package dev.mcsupermods.runtime.model;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;
import dev.mcsupermods.runtime.model.GeoAnimationClip.BoneChannels;
import dev.mcsupermods.runtime.model.GeoAnimationClip.Interpolation;
import dev.mcsupermods.runtime.model.GeoAnimationClip.Keyframe;
import dev.mcsupermods.runtime.model.GeoAnimationClip.Loop;
import dev.mcsupermods.runtime.model.GeoMesh.Vec3;
import java.io.Reader;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.UnaryOperator;
import java.util.regex.Pattern;

/**
 * Reads a Bedrock animation file (format 1.8.0, the file GeckoLib reads from
 * {@code assets/<ns>/geckolib/animations/}) into {@link GeoAnimationClip}s in Java model space (ADR 0072 D1).
 * Pure Java over Gson: no client classes, never throws.
 *
 * <p>It reads what the app's preview reads ({@code app/src/renderer/src/preview/geo/keyframes.ts}): channels
 * {@code rotation}, {@code position} and {@code scale} given as one vector (or one number for all three axes)
 * or as a map of keyframes by time in seconds; keyframes as vectors or as {@code pre}/{@code post} objects
 * with {@code lerp_mode} ({@code linear} or {@code catmullrom}); {@code loop} ({@code true}, {@code false},
 * {@code "hold_on_last_frame"}) and {@code animation_length}. Strings that are plain numbers are numbers;
 * any other string is Molang, read as 0 and reported once per animation. Keyframe sound, particle and
 * instruction channels are not read (the vanilla renderer has no keyframe events; ADR 0072, limit M6).
 */
public final class GeoAnimationReader {
    private static final Pattern PLAIN_NUMBER = Pattern.compile("^\\s*[-+]?(\\d+(\\.\\d*)?|\\.\\d+)([eE][-+]?\\d+)?\\s*$");

    /** Bedrock rotation keyframes keep their numbers in Java model space (see {@link GeoMesh}). */
    private static final UnaryOperator<Vec3> ROTATION = v -> v;
    /** Bedrock position keyframes point y up; Java model space points y down. */
    private static final UnaryOperator<Vec3> POSITION = v -> new Vec3(v.x(), -v.y(), v.z());
    /** Scale factors have no direction. */
    private static final UnaryOperator<Vec3> SCALE = v -> v;

    private GeoAnimationReader() {
    }

    /**
     * The clips of a file, in file order, and the problems met.
     *
     * @param clips    the animations
     * @param problems what could not be read as written, one sentence each
     */
    public record Result(List<GeoAnimationClip> clips, List<String> problems) {
        public Result {
            clips = List.copyOf(clips);
            problems = List.copyOf(problems);
        }

        /** The clip with this name, or {@code null}. */
        public GeoAnimationClip clip(String name) {
            return clips.stream().filter(c -> c.name().equals(name)).findFirst().orElse(null);
        }
    }

    /** Reads an animation file's text. */
    public static Result read(Reader reader) {
        JsonElement root;
        try {
            root = JsonParser.parseReader(reader);
        } catch (JsonParseException | IllegalStateException e) {
            return new Result(List.of(), List.of("The animation file is not valid JSON: " + e.getMessage()));
        }
        return read(root);
    }

    /** Reads a parsed animation file. */
    public static Result read(JsonElement root) {
        List<GeoAnimationClip> clips = new ArrayList<>();
        List<String> problems = new ArrayList<>();
        JsonElement animations = root != null && root.isJsonObject() ? root.getAsJsonObject().get("animations") : null;
        if (animations == null || !animations.isJsonObject()) {
            problems.add("The animation file has no animations.");
            return new Result(clips, problems);
        }
        for (Map.Entry<String, JsonElement> entry : animations.getAsJsonObject().entrySet()) {
            if (!entry.getValue().isJsonObject()) {
                continue;
            }
            JsonObject raw = entry.getValue().getAsJsonObject();
            State state = new State();
            Map<String, BoneChannels> bones = new LinkedHashMap<>();
            float last = 0;
            JsonElement rawBones = raw.get("bones");
            if (rawBones != null && rawBones.isJsonObject()) {
                for (Map.Entry<String, JsonElement> bone : rawBones.getAsJsonObject().entrySet()) {
                    if (!bone.getValue().isJsonObject()) {
                        continue;
                    }
                    JsonObject channels = bone.getValue().getAsJsonObject();
                    List<Keyframe> rotation = channel(channels.get("rotation"), state, ROTATION);
                    List<Keyframe> position = channel(channels.get("position"), state, POSITION);
                    List<Keyframe> scale = channel(channels.get("scale"), state, SCALE);
                    for (List<Keyframe> c : List.of(rotation, position, scale)) {
                        if (!c.isEmpty()) {
                            last = Math.max(last, c.getLast().time());
                        }
                    }
                    bones.put(bone.getKey(), new BoneChannels(rotation, position, scale));
                }
            }
            JsonElement loopElement = raw.get("loop");
            Loop loop = Loop.PLAY_ONCE;
            if (loopElement instanceof JsonPrimitive p && p.isBoolean() && p.getAsBoolean()) {
                loop = Loop.LOOP;
            } else if (loopElement instanceof JsonPrimitive p && p.isString()
                    && p.getAsString().equals("hold_on_last_frame")) {
                loop = Loop.HOLD_ON_LAST_FRAME;
            }
            float length = last;
            JsonElement lengthElement = raw.get("animation_length");
            if (lengthElement instanceof JsonPrimitive p && p.isNumber()) {
                double value = p.getAsDouble();
                if (Double.isFinite(value) && value >= 0) {
                    length = (float) value;
                }
            }
            if (state.molang) {
                problems.add("Animation \"" + entry.getKey() + "\" uses Molang; those values are read as 0.");
            }
            clips.add(new GeoAnimationClip(entry.getKey(), loop, length, bones, state.molang));
        }
        return new Result(clips, problems);
    }

    /** Parses one channel: a constant vector or a map of keyframes by time in seconds; empty when absent. */
    static List<Keyframe> channel(JsonElement value, State state, UnaryOperator<Vec3> space) {
        if (value == null) {
            return List.of();
        }
        List<Keyframe> frames = new ArrayList<>();
        if (value.isJsonObject() && !isPrePost(value.getAsJsonObject())) {
            for (Map.Entry<String, JsonElement> entry : value.getAsJsonObject().entrySet()) {
                Float time = time(entry.getKey());
                if (time == null) {
                    continue;
                }
                Keyframe frame = keyframe(time, entry.getValue(), state, space);
                if (frame != null) {
                    frames.add(frame);
                }
            }
            frames.sort(Comparator.comparingDouble(Keyframe::time));
            return frames;
        }
        Keyframe frame = keyframe(0, value, state, space);
        return frame == null ? List.of() : List.of(frame);
    }

    private static Float time(String key) {
        String trimmed = key.trim();
        if (trimmed.isEmpty()) {
            return 0f;
        }
        if (!PLAIN_NUMBER.matcher(trimmed).matches()) {
            return null;
        }
        double value = Double.parseDouble(trimmed);
        return Double.isFinite(value) ? (float) value : null;
    }

    private static boolean isPrePost(JsonObject object) {
        return object.has("pre") || object.has("post");
    }

    private static Keyframe keyframe(float time, JsonElement value, State state, UnaryOperator<Vec3> space) {
        if (value.isJsonObject() && isPrePost(value.getAsJsonObject())) {
            JsonObject object = value.getAsJsonObject();
            Vec3 pre = vector(object.get("pre"), state);
            Vec3 post = vector(object.get("post"), state);
            JsonElement lerp = object.get("lerp_mode");
            Interpolation interpolation = lerp instanceof JsonPrimitive p && p.isString()
                    && p.getAsString().equals("catmullrom") ? Interpolation.CATMULLROM : Interpolation.LINEAR;
            Vec3 first = pre != null ? pre : post;
            if (first == null) {
                return null;
            }
            return new Keyframe(time, space.apply(first), space.apply(post != null ? post : first), interpolation);
        }
        Vec3 v = vector(value, state);
        return v == null ? null : new Keyframe(time, space.apply(v), space.apply(v), Interpolation.LINEAR);
    }

    /** A vector value: {@code [x, y, z]}, or one number or string for all three axes; {@code null} otherwise. */
    private static Vec3 vector(JsonElement value, State state) {
        if (value == null) {
            return null;
        }
        if (value.isJsonArray()) {
            JsonArray array = value.getAsJsonArray();
            return new Vec3(scalar(at(array, 0), state), scalar(at(array, 1), state), scalar(at(array, 2), state));
        }
        if (value instanceof JsonPrimitive p && (p.isNumber() || p.isString())) {
            float n = scalar(p, state);
            return new Vec3(n, n, n);
        }
        return null;
    }

    private static JsonElement at(JsonArray array, int i) {
        return i < array.size() ? array.get(i) : null;
    }

    private static float scalar(JsonElement value, State state) {
        if (value instanceof JsonPrimitive p) {
            if (p.isNumber()) {
                double d = p.getAsDouble();
                return Double.isFinite(d) ? (float) d : 0;
            }
            if (p.isString()) {
                String s = p.getAsString();
                if (PLAIN_NUMBER.matcher(s).matches()) {
                    return (float) Double.parseDouble(s.trim());
                }
                state.molang = true;
            }
        }
        return 0;
    }

    /** Per-animation flags met while reading. */
    static final class State {
        boolean molang;
    }
}
