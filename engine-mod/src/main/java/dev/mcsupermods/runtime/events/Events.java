package dev.mcsupermods.runtime.events;

import com.google.gson.JsonElement;
import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.Dynamic;
import com.mojang.serialization.JsonOps;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.minecraft.resources.Identifier;

/**
 * The {@code events} object of a definition. Each event decodes on its own: an event that fails
 * (for example an unknown action type) is dropped with an error, and the definition still
 * registers without it (ADR 0025 D4).
 *
 * @param byId   the events that decoded, by id
 * @param errors one message per dropped event
 */
public record Events(Map<Identifier, EventDefinition> byId, List<String> errors) {
    public static final Events NONE = new Events(Map.of(), List.of());

    public static final Codec<Events> CODEC = Codec.unboundedMap(Codec.STRING, Codec.PASSTHROUGH)
            .xmap(Events::decodeEach, Events::encodeEach);

    public Optional<EventDefinition> get(Identifier id) {
        return Optional.ofNullable(byId.get(id));
    }

    public boolean contains(Identifier id) {
        return byId.containsKey(id);
    }

    /**
     * These events without their {@code play_animation} actions, for definitions that have no
     * animated entity (blocks and items, ADR 0028 D4); one warning per dropped action.
     */
    public Events withoutPlayAnimation(List<String> warnings) {
        Map<Identifier, EventDefinition> out = new LinkedHashMap<>();
        byId.entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(entry -> {
            List<Action> kept = new ArrayList<>();
            for (Action action : entry.getValue().actions()) {
                if (action instanceof Action.PlayAnimation p) {
                    warnings.add("events: " + entry.getKey() + ": play_animation '" + p.animation()
                            + "' only works on entities with GeckoLib; action dropped");
                } else {
                    kept.add(action);
                }
            }
            out.put(entry.getKey(), new EventDefinition(List.copyOf(kept)));
        });
        return new Events(Map.copyOf(out), errors);
    }

    private static Events decodeEach(Map<String, Dynamic<?>> raw) {
        Map<Identifier, EventDefinition> out = new LinkedHashMap<>();
        List<String> errors = new ArrayList<>();
        raw.entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(entry -> {
            String key = entry.getKey();
            Identifier id = Identifier.tryParse(key);
            if (id == null) {
                errors.add("events: invalid event id '" + key + "'; event dropped");
                return;
            }
            DataResult<EventDefinition> result = EventDefinition.CODEC.parse(entry.getValue());
            result.result().ifPresent(e -> out.put(id, e));
            result.error().ifPresent(e -> errors.add("events: " + key + ": " + e.message() + "; event dropped"));
        });
        return new Events(Map.copyOf(out), List.copyOf(errors));
    }

    private static Map<String, Dynamic<?>> encodeEach(Events events) {
        Map<String, Dynamic<?>> out = new LinkedHashMap<>();
        events.byId.forEach((id, event) -> {
            JsonElement json = EventDefinition.CODEC.encodeStart(JsonOps.INSTANCE, event).getOrThrow();
            out.put(id.toString(), new Dynamic<>(JsonOps.INSTANCE, json));
        });
        return out;
    }
}
