package dev.mcsupermods.runtime.client.dev;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;
import dev.mcsupermods.runtime.dev.DevFiles;
import java.util.Optional;

/**
 * The client's dev files (B366, {@code @msm/interop} {@code fabric/dev-session.ts}): {@code play.json} and
 * {@code request.json} read, {@code status.json} written. Pure: no file access, so JUnit covers it. Parsers follow the
 * app's: anything missing, unreadable, of another format or invalid is empty.
 */
public final class DevClientFiles {
    public static final String PLAY_REQUEST_FILE = "play.json";
    public static final String REQUEST_FILE = "request.json";
    public static final String STATUS_FILE = "status.json";

    /** The largest safe JSON integer, as JavaScript's {@code Number.isSafeInteger}. */
    private static final double MAX_SAFE = 9_007_199_254_740_991d;
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().serializeNulls().disableHtmlEscaping().create();

    private DevClientFiles() {}

    /**
     * {@code play.json}: open (or create) {@code world} once at the title screen.
     *
     * @param game for Play my game ({@code kind: "game"}, ADR 0116 D1), how a new world is made; null for the test world
     *             ({@code kind} absent or {@code "test"})
     */
    public record PlayRequest(long seq, String world, DevWorldSettings.GameWorld game) {
        /** A test world request. */
        public PlayRequest(long seq, String world) {
            this(seq, world, null);
        }
    }

    /** What a {@link DevRequest} asks for. */
    public enum Action {
        RELOAD("reload"),
        REOPEN("reopen"),
        QUIT("quit");

        private final String json;

        Action(String json) {
            this.json = json;
        }

        public String json() {
            return json;
        }

        static Optional<Action> of(String json) {
            for (Action action : values()) {
                if (action.json.equals(json)) {
                    return Optional.of(action);
                }
            }
            return Optional.empty();
        }
    }

    /** {@code request.json}. */
    public record DevRequest(long seq, Action action, boolean assets, int changes) {}

    /** Where the game is ({@code status.json} {@code state}). */
    public enum GameState {
        TITLE("title"),
        LOADING("loading"),
        WORLD("world");

        private final String json;

        GameState(String json) {
            this.json = json;
        }

        public String json() {
            return json;
        }
    }

    /**
     * The outcome of the last handled request.
     *
     * @param message a plain-language line when {@code ok} is false, else null
     */
    public record Handled(long seq, boolean ok, String message) {}

    /**
     * {@code status.json}.
     *
     * @param world   the open world's folder name, or null outside a singleplayer world
     * @param handled the last handled request, or null before any
     * @param time    milliseconds since the epoch
     * @param runtime the runtime's version
     * @param seed    the open world's seed as a decimal string (B554: Play my game's random seed shown in the app), or
     *                null outside a world
     */
    public record Status(GameState state, String world, Handled handled, long time, String runtime, String seed) {
        /** A status without a seed. */
        public Status(GameState state, String world, Handled handled, long time, String runtime) {
            this(state, world, handled, time, runtime, null);
        }
    }

    /** Parses {@code play.json}. */
    public static Optional<PlayRequest> parsePlayRequest(String text) {
        Optional<JsonObject> obj = object(text);
        if (obj.isEmpty()) {
            return Optional.empty();
        }
        Optional<Long> seq = seq(obj.get().get("seq"));
        Optional<String> world = string(obj.get().get("world"));
        if (seq.isEmpty() || world.isEmpty() || !DevFiles.isWorldFolder(world.get())) {
            return Optional.empty();
        }
        JsonElement kind = obj.get().get("kind");
        if (kind == null || kind.isJsonNull() || "test".equals(string(kind).orElse(null))) {
            return Optional.of(new PlayRequest(seq.get(), world.get()));
        }
        if (!"game".equals(string(kind).orElse(null))) {
            return Optional.empty();
        }
        Optional<DevWorldSettings.GameWorld> game = DevWorldSettings.gameWorld(string(obj.get().get("preset")).orElse(null),
                string(obj.get().get("gameMode")).orElse(null), string(obj.get().get("difficulty")).orElse(null));
        if (game.isEmpty() || !DevWorldSettings.isGameFolder(world.get())) {
            return Optional.empty();
        }
        return Optional.of(new PlayRequest(seq.get(), world.get(), game.get()));
    }

    /** Parses {@code request.json}. */
    public static Optional<DevRequest> parseRequest(String text) {
        Optional<JsonObject> obj = object(text);
        if (obj.isEmpty()) {
            return Optional.empty();
        }
        JsonObject o = obj.get();
        Optional<Long> seq = seq(o.get("seq"));
        Optional<Action> action = string(o.get("action")).flatMap(Action::of);
        if (seq.isEmpty() || action.isEmpty() || !(o.get("assets") instanceof JsonPrimitive assets) || !assets.isBoolean()) {
            return Optional.empty();
        }
        if (!(o.get("changes") instanceof JsonPrimitive changes) || !changes.isNumber()) {
            return Optional.empty();
        }
        double n = changes.getAsDouble();
        if (n < 0 || n != Math.floor(n) || n > Integer.MAX_VALUE) {
            return Optional.empty();
        }
        return Optional.of(new DevRequest(seq.get(), action.get(), assets.getAsBoolean(), (int) n));
    }

    /**
     * The {@code handled} part of an earlier {@code status.json} (a previous run's, so the request it handled is not handled
     * again after a restart), or empty when there is none or it is invalid.
     */
    public static Optional<Handled> previousHandled(String statusText) {
        Optional<JsonObject> obj = object(statusText);
        if (obj.isEmpty() || !(obj.get().get("handled") instanceof JsonObject handled)) {
            return Optional.empty();
        }
        Optional<Long> seq = seq(handled.get("seq"));
        if (seq.isEmpty() || !(handled.get("ok") instanceof JsonPrimitive ok) || !ok.isBoolean()) {
            return Optional.empty();
        }
        return Optional.of(new Handled(seq.get(), ok.getAsBoolean(), string(handled.get("message")).orElse(null)));
    }

    /** {@code status.json} as the app's {@code devFileText}: sorted keys, 2-space indent, a final newline. */
    public static String statusText(Status status) {
        JsonObject obj = new JsonObject();
        obj.addProperty("format", DevFiles.FORMAT);
        if (status.handled() == null) {
            obj.add("handled", JsonNull.INSTANCE);
        } else {
            JsonObject handled = new JsonObject();
            if (status.handled().message() != null) {
                handled.addProperty("message", status.handled().message());
            }
            handled.addProperty("ok", status.handled().ok());
            handled.addProperty("seq", status.handled().seq());
            obj.add("handled", handled);
        }
        obj.addProperty("runtime", status.runtime());
        if (status.seed() != null) {
            obj.addProperty("seed", status.seed());
        }
        obj.addProperty("state", status.state().json());
        obj.addProperty("time", status.time());
        if (status.world() == null) {
            obj.add("world", JsonNull.INSTANCE);
        } else {
            obj.addProperty("world", status.world());
        }
        return GSON.toJson(obj) + "\n";
    }

    /** The chat line after a reload or reopen: {@code MCSuperMods: reloaded (3 changes)}. */
    public static String chatLine(Action action, int changes) {
        return chatLine(action, changes, false);
    }

    /** As {@link #chatLine(Action, int)}; a reopen in a Play my game world says "reopened your game". */
    public static String chatLine(Action action, int changes, boolean game) {
        String what = action == Action.REOPEN ? (game ? "reopened your game" : "reopened the test world") : "reloaded";
        return "MCSuperMods: " + what + " (" + changes + (changes == 1 ? " change)" : " changes)");
    }

    private static Optional<JsonObject> object(String text) {
        if (text == null) {
            return Optional.empty();
        }
        try {
            JsonElement json = JsonParser.parseString(text);
            if (json instanceof JsonObject obj && obj.get("format") instanceof JsonPrimitive format && format.isNumber()
                    && format.getAsDouble() == DevFiles.FORMAT) {
                return Optional.of(obj);
            }
        } catch (RuntimeException e) {
            // not JSON: empty
        }
        return Optional.empty();
    }

    private static Optional<Long> seq(JsonElement json) {
        if (json instanceof JsonPrimitive p && p.isNumber()) {
            double n = p.getAsDouble();
            if (n >= 1 && n <= MAX_SAFE && n == Math.floor(n)) {
                return Optional.of((long) n);
            }
        }
        return Optional.empty();
    }

    private static Optional<String> string(JsonElement json) {
        return json instanceof JsonPrimitive p && p.isString() ? Optional.of(p.getAsString()) : Optional.empty();
    }
}
