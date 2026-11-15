package dev.mcsupermods.runtime.hud;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.Action;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.loader.HudDefinition;
import dev.mcsupermods.runtime.loader.HudParser;
import dev.mcsupermods.runtime.loader.LoadReport;
import dev.mcsupermods.runtime.loader.RawDefinition;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalInt;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;

/**
 * HUD elements on the server (ADR 0089 D1 to D6): the {@code hud} definitions, their index list and its hash, and the
 * show, hide and set entry points that the actions ({@link #action}), scripts and Rules use. Values are computed by
 * {@link HudValues} and sent by {@link HudSync}. Both sides read the same definitions at initialisation (the client
 * draws from {@link #ordered()}), which is why a new element needs a restart (plan limit V5) and the dev overlay refuses
 * HUD files.
 */
public final class HudServer {
    private static volatile Map<Identifier, HudDefinition> definitions = Map.of();
    private static volatile List<Identifier> ids = List.of();
    private static volatile List<HudDefinition> ordered = List.of();
    private static volatile Map<Identifier, Integer> index = Map.of();
    private static volatile int hash = hashOf(List.of());
    /** Unknown ids and player-less actions already logged, so each is logged once. */
    private static final Set<String> LOGGED = ConcurrentHashMap.newKeySet();

    private HudServer() {}

    /**
     * Parses the scanned {@code hud} definitions and returns {@code report} with the HUD elements registered and any
     * errors and warnings; called once from {@code MsmRuntime.onInitialize}, after the vehicles (an element's
     * {@code vehicle} must be one). Also warns once for every {@code show_hud}, {@code hide_hud} and {@code set_hud}
     * action in any definition's events that names an element which is not registered.
     */
    public static LoadReport init(LoadReport report) {
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        Map<Identifier, HudDefinition> parsed = HudParser.parseAll(report.definitions(), errors, warnings);
        parsed.forEach((id, def) -> def.vehicle().ifPresent(vehicle -> {
            if (!report.vehicles().contains(vehicle)) {
                warnings.add("HUD element " + id + ": vehicle " + vehicle + " is not a vehicle type of this game; it never shows");
            }
        }));
        warnings.addAll(unknownReferences(report.definitions(), parsed.keySet()));
        errors.forEach(message -> MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, message));
        warnings.forEach(message -> MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, message));
        install(parsed);
        HudSync.register();
        return report.withHudElements(ids, errors, warnings);
    }

    private static void install(Map<Identifier, HudDefinition> parsed) {
        Map<Identifier, HudDefinition> sorted = new LinkedHashMap<>();
        List<Identifier> list = new ArrayList<>(parsed.keySet());
        list.sort(HudParser.BY_STRING);
        Map<Identifier, Integer> byId = new HashMap<>();
        List<HudDefinition> defs = new ArrayList<>();
        for (Identifier id : list) {
            sorted.put(id, parsed.get(id));
            byId.put(id, defs.size());
            defs.add(parsed.get(id));
        }
        definitions = java.util.Collections.unmodifiableMap(sorted);
        ids = List.copyOf(list);
        ordered = List.copyOf(defs);
        index = Map.copyOf(byId);
        hash = hashOf(ids);
    }

    /**
     * The 32-bit hash of a HUD id list that the payload carries (ADR 0089 D3): Java's {@code String.hashCode} of the ids
     * joined by {@code \n} in the sorted order.
     */
    public static int hashOf(List<Identifier> sortedIds) {
        StringBuilder text = new StringBuilder();
        for (Identifier id : sortedIds) {
            if (!text.isEmpty()) {
                text.append('\n');
            }
            text.append(id);
        }
        return text.toString().hashCode();
    }

    /** The registered HUD ids, sorted by id as a string: element {@code i}'s index is its position here. */
    public static List<Identifier> ids() {
        return ids;
    }

    /** The definitions in index order. */
    public static List<HudDefinition> ordered() {
        return ordered;
    }

    /** The definitions by id, in index order. */
    public static Map<Identifier, HudDefinition> definitions() {
        return definitions;
    }

    public static Optional<HudDefinition> definition(Identifier id) {
        return Optional.ofNullable(definitions.get(id));
    }

    /** Element {@code id}'s index, if it is registered. */
    public static OptionalInt index(Identifier id) {
        Integer i = index.get(id);
        return i == null ? OptionalInt.empty() : OptionalInt.of(i);
    }

    /** The hash of {@link #ids()}. */
    public static int hash() {
        return hash;
    }

    /** Shows element {@code id} to {@code player} (also one with {@code starts_hidden}); false for an unknown id. */
    public static boolean show(ServerPlayer player, Identifier id) {
        return visible(player, id, true);
    }

    /** Hides element {@code id} from {@code player} until it is shown again; false for an unknown id. */
    public static boolean hide(ServerPlayer player, Identifier id) {
        return visible(player, id, false);
    }

    private static boolean visible(ServerPlayer player, Identifier id, boolean visible) {
        OptionalInt i = known(id);
        if (i.isEmpty()) {
            return false;
        }
        HudSync.setVisible(player, i.getAsInt(), visible);
        return true;
    }

    /**
     * Sets element {@code id}'s value for {@code player} to a number; false for an unknown id or a value that is not
     * finite. For a synced source the next computed value that differs replaces it.
     */
    public static boolean set(ServerPlayer player, Identifier id, double value) {
        OptionalInt i = known(id);
        if (i.isEmpty() || !Double.isFinite(value)) {
            return false;
        }
        HudSync.set(player, i.getAsInt(), value);
        return true;
    }

    /** Sets element {@code id}'s value for {@code player} to a text (cut to 256 characters); false for an unknown id. */
    public static boolean set(ServerPlayer player, Identifier id, String value) {
        OptionalInt i = known(id);
        if (i.isEmpty()) {
            return false;
        }
        HudSync.set(player, i.getAsInt(), HudValues.text(value));
        return true;
    }

    /** What {@code player} was last sent for element {@code id} (a Double, a String or null). */
    public static Object sentValue(ServerPlayer player, Identifier id) {
        OptionalInt i = index(id);
        return i.isEmpty() ? null : HudSync.sent(player, i.getAsInt());
    }

    private static OptionalInt known(Identifier id) {
        OptionalInt i = index(id);
        if (i.isEmpty() && LOGGED.add("unknown " + id)) {
            MsmRuntime.LOGGER.error("[{}] {} is not a HUD element of this game; showing, hiding or setting it does nothing", MsmRuntime.MOD_ID,
                    id);
        }
        return i;
    }

    /**
     * Runs a {@code show_hud}, {@code hide_hud} or {@code set_hud} action of {@code owner}'s event (ADR 0089 D6) for the
     * event's player; without one it does nothing and logs once per owner and action type.
     */
    public static void action(Identifier owner, Action action, EventContext ctx) {
        if (!(ctx.player() instanceof ServerPlayer player)) {
            if (LOGGED.add("no player " + owner + " " + action.type().serialName)) {
                MsmRuntime.LOGGER.warn("[{}] {}: {} has no player in this event and does nothing", MsmRuntime.MOD_ID, owner,
                        action.type().serialName);
            }
            return;
        }
        switch (action) {
            case Action.ShowHud a -> show(player, a.hud());
            case Action.HideHud a -> hide(player, a.hud());
            case Action.SetHud a -> a.value().ifLeft(n -> set(player, a.hud(), n)).ifRight(t -> set(player, a.hud(), t));
            default -> {}
        }
    }

    /** Warnings for HUD actions in any definition's events that name an element which is not registered. */
    static List<String> unknownReferences(List<RawDefinition> raws, Set<Identifier> known) {
        List<String> out = new ArrayList<>();
        for (RawDefinition raw : raws) {
            if (!(raw.json() instanceof JsonObject object) || !(object.get("events") instanceof JsonObject events)) {
                continue;
            }
            Set<String> unknown = new TreeSet<>();
            for (Map.Entry<String, JsonElement> event : events.entrySet()) {
                if (!(event.getValue() instanceof JsonObject e) || !e.has("actions") || !e.get("actions").isJsonArray()) {
                    continue;
                }
                for (JsonElement a : e.getAsJsonArray("actions")) {
                    if (!(a instanceof JsonObject action) || !action.has("type") || !action.has("hud") || !action.get("hud").isJsonPrimitive()) {
                        continue;
                    }
                    String type = action.get("type").getAsString();
                    if (!type.equals("show_hud") && !type.equals("hide_hud") && !type.equals("set_hud")) {
                        continue;
                    }
                    Identifier id = Identifier.tryParse(action.get("hud").getAsString());
                    if (id != null && !known.contains(id)) {
                        unknown.add(id.toString());
                    }
                }
            }
            for (String id : unknown) {
                out.add(raw.describe() + ": events name HUD element " + id + ", which is not registered; those actions do nothing");
            }
        }
        return out;
    }
}
