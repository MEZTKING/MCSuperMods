package dev.mcsupermods.runtime.dev;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * The dev session files the app writes into {@code <gameDir>/msm-dev/} (B366, {@code @msm/interop}
 * {@code fabric/dev-session.ts} and {@code setup-function.ts}), read only. Pure: no file access here, so JUnit covers the
 * parsing; callers read the text.
 */
public final class DevFiles {
    /** The dev folder inside the game folder. */
    public static final String DEV_FOLDER = "msm-dev";
    public static final String DEV_INFO_FILE = "dev.json";
    public static final String SETUP_FUNCTION_FILE = "setup.mcfunction";
    /** {@code overlay/msm/<ns>/<kind>/<path>.json} and {@code overlay/msm/<ns>/script/<path>.js}. */
    public static final String OVERLAY_FOLDER = "overlay";
    /** The format every dev file carries. */
    public static final int FORMAT = 1;
    /** Marks the lines run once, on a new world. */
    public static final String SETUP_SECTION = "# msm:setup";
    /** Marks the lines run on a new world after the setup, and on every later Play. */
    public static final String REFILL_SECTION = "# msm:refill";

    /** The start of Play my game's world folder names ({@code @msm/interop} {@code gameWorldFolder}, ADR 0116 D1). */
    public static final String GAME_WORLD_FOLDER_PREFIX = "msm-game-";

    private static final Pattern NAMESPACE = Pattern.compile("[a-z0-9_.-]{1,64}");
    private static final Pattern WORLD_FOLDER = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,127}");

    private DevFiles() {}

    /**
     * {@code dev.json}.
     *
     * @param namespaces the project's namespaces, the first its own
     * @param target     the target id
     * @param world      the test world's folder name in {@code saves/}
     * @param appVersion the app's version
     */
    public record DevInfo(List<String> namespaces, String target, String world, String appVersion) {
        public DevInfo {
            namespaces = List.copyOf(namespaces);
        }
    }

    /** The two sections of {@code setup.mcfunction}: commands only, comments and blank lines left out. */
    public record SetupFunction(List<String> setup, List<String> refill) {
        public static final SetupFunction EMPTY = new SetupFunction(List.of(), List.of());

        public SetupFunction {
            setup = List.copyOf(setup);
            refill = List.copyOf(refill);
        }
    }

    /** Parses {@code dev.json}; empty when the text is missing, not JSON, of another format or invalid (as the app's parser). */
    public static Optional<DevInfo> parseDevInfo(String text) {
        if (text == null) {
            return Optional.empty();
        }
        JsonObject obj;
        try {
            JsonElement json = JsonParser.parseString(text);
            if (!json.isJsonObject()) {
                return Optional.empty();
            }
            obj = json.getAsJsonObject();
        } catch (RuntimeException e) {
            return Optional.empty();
        }
        if (!(obj.get("format") instanceof JsonPrimitive format) || !format.isNumber() || format.getAsDouble() != FORMAT) {
            return Optional.empty();
        }
        if (!(obj.get("namespaces") instanceof JsonArray array) || array.isEmpty()) {
            return Optional.empty();
        }
        List<String> namespaces = new ArrayList<>();
        for (JsonElement ns : array) {
            Optional<String> s = string(ns);
            if (s.isEmpty() || !NAMESPACE.matcher(s.get()).matches()) {
                return Optional.empty();
            }
            namespaces.add(s.get());
        }
        Optional<String> target = string(obj.get("target"));
        Optional<String> world = string(obj.get("world"));
        Optional<String> appVersion = string(obj.get("appVersion"));
        if (target.isEmpty() || world.isEmpty() || appVersion.isEmpty() || !isWorldFolder(world.get())) {
            return Optional.empty();
        }
        return Optional.of(new DevInfo(namespaces, target.get(), world.get(), appVersion.get()));
    }

    /**
     * Splits {@code setup.mcfunction} into its sections. Lines before the first marker, comments and blank lines are left
     * out; a leading slash is kept (the dispatcher's prefixed form takes it). A missing file is {@link SetupFunction#EMPTY}.
     */
    public static SetupFunction parseSetupFunction(String text) {
        if (text == null) {
            return SetupFunction.EMPTY;
        }
        List<String> setup = new ArrayList<>();
        List<String> refill = new ArrayList<>();
        List<String> into = null;
        for (String raw : text.split("\r?\n", -1)) {
            String line = raw.strip();
            if (line.equals(SETUP_SECTION)) {
                into = setup;
            } else if (line.equals(REFILL_SECTION)) {
                into = refill;
            } else if (into != null && !line.isEmpty() && !line.startsWith("#")) {
                into.add(line);
            }
        }
        return new SetupFunction(setup, refill);
    }

    /**
     * Whether {@code worldFolder} is a Play my game world ({@code msm-game-<ns>}): a world folder name with that start and at
     * least one more character. The server side runs no setup function in one (B554).
     */
    public static boolean isGameWorldFolder(String worldFolder) {
        return isWorldFolder(worldFolder) && worldFolder.startsWith(GAME_WORLD_FOLDER_PREFIX)
                && worldFolder.length() > GAME_WORLD_FOLDER_PREFIX.length();
    }

    /** One safe folder segment, as the app writes world folder names. */
    public static boolean isWorldFolder(String name) {
        return name != null && WORLD_FOLDER.matcher(name).matches() && !name.equals(".") && !name.equals("..");
    }

    private static Optional<String> string(JsonElement json) {
        return json instanceof JsonPrimitive p && p.isString() ? Optional.of(p.getAsString()) : Optional.empty();
    }
}
