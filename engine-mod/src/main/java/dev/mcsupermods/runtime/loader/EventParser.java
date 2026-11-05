package dev.mcsupermods.runtime.loader;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import dev.mcsupermods.runtime.events.Action;
import dev.mcsupermods.runtime.events.EventDefinition;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;

/** Parses the {@code events} object of a definition (ADR 0025 D4, spike subset). */
final class EventParser {
    private EventParser() {}

    static Map<Identifier, EventDefinition> parse(JsonObject json) throws DefinitionException {
        JsonObject events = Json.object(json, "events");
        Map<Identifier, EventDefinition> out = new LinkedHashMap<>();
        if (events == null) {
            return Map.of();
        }
        for (Map.Entry<String, JsonElement> entry : events.entrySet()) {
            Identifier id = id(entry.getKey(), "event id");
            if (!entry.getValue().isJsonObject()) {
                throw new DefinitionException("event " + id + " must be an object");
            }
            JsonElement actions = entry.getValue().getAsJsonObject().get("actions");
            if (actions == null || !actions.isJsonArray()) {
                throw new DefinitionException("event " + id + ": 'actions' must be an array");
            }
            List<Action> list = new ArrayList<>();
            for (JsonElement a : actions.getAsJsonArray()) {
                if (!a.isJsonObject()) {
                    throw new DefinitionException("event " + id + ": each action must be an object");
                }
                list.add(action(a.getAsJsonObject(), id));
            }
            out.put(id, new EventDefinition(List.copyOf(list)));
        }
        return Map.copyOf(out);
    }

    private static Action action(JsonObject a, Identifier event) throws DefinitionException {
        String type = Json.requireString(a, "type");
        return switch (type) {
            case "play_sound" -> {
                Identifier sound = id(Json.requireString(a, "sound"), "sound");
                if (!BuiltInRegistries.SOUND_EVENT.containsKey(sound)) {
                    throw new DefinitionException("event " + event + ": unknown sound " + sound);
                }
                yield new Action.PlaySound(sound, (float) Json.number(a, "volume", 1.0), (float) Json.number(a, "pitch", 1.0));
            }
            // Item ids are checked when the action runs: they may name items registered later in the scan.
            case "give_item" -> new Action.GiveItem(id(Json.requireString(a, "item"), "item"), Json.integer(a, "count", 1, 1, 6400));
            default -> throw new DefinitionException("event " + event + ": unknown action type '" + type + "'");
        };
    }

    static Identifier id(String s, String what) throws DefinitionException {
        Identifier id = Identifier.tryParse(s);
        if (id == null) {
            throw new DefinitionException("invalid " + what + " '" + s + "'");
        }
        return id;
    }
}
