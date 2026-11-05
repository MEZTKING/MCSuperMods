package dev.mcsupermods.runtime.loader;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;
import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import dev.mcsupermods.runtime.components.BlockComponents;
import dev.mcsupermods.runtime.components.ItemComponents;
import dev.mcsupermods.runtime.events.Action;
import dev.mcsupermods.runtime.events.EventDefinition;
import dev.mcsupermods.runtime.events.Events;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Stream;
import net.minecraft.resources.Identifier;

/**
 * Parses definition files with the Codecs. Pure: it touches no registry, so JUnit runs it over the
 * shared conformance corpus without a game bootstrap.
 *
 * <ol>
 *   <li>{@code format} is required; a major version above {@link #FORMAT} is rejected.</li>
 *   <li>Unknown top-level and component keys are warnings (newer minor additions).</li>
 *   <li>The Codec decodes the file; an error there means the file is not registered.</li>
 *   <li>Events that failed on their own are errors; the definition registers without them.</li>
 *   <li>Event ids named by components or {@code trigger_event} must be declared.</li>
 * </ol>
 */
public final class DefinitionParser {
    /** The definition format this runtime reads. */
    public static final int FORMAT = 1;

    private DefinitionParser() {}

    public static ParseResult<BlockDefinition> parseBlock(JsonElement json) {
        return parse(json, BlockDefinition.KEYS, BlockComponents.KEYS, BlockDefinition.CODEC,
                def -> new Refs(def.events(), def.components().eventReferences()));
    }

    public static ParseResult<ItemDefinition> parseItem(JsonElement json) {
        return parse(json, ItemDefinition.KEYS, ItemComponents.KEYS, ItemDefinition.CODEC,
                def -> new Refs(def.events(), def.components().eventReferences()));
    }

    private record Refs(Events events, Stream<String[]> componentRefs) {}

    private static <T> ParseResult<T> parse(JsonElement json, List<String> keys, List<String> componentKeys, Codec<T> codec,
            Function<T, Refs> refs) {
        if (!(json instanceof JsonObject object)) {
            return new ParseResult<>(Optional.empty(), List.of("top level must be an object"), List.of());
        }
        String formatError = checkFormat(object);
        if (formatError != null) {
            return new ParseResult<>(Optional.empty(), List.of(formatError), List.of());
        }
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        for (String key : object.keySet()) {
            if (!keys.contains(key)) {
                warnings.add("unknown top-level key '" + key + "' ignored");
            }
        }
        if (object.get("components") instanceof JsonObject components) {
            for (String key : components.keySet()) {
                if (!componentKeys.contains(key)) {
                    warnings.add("unknown component '" + key + "' ignored");
                }
            }
        }
        DataResult<T> result = codec.parse(StrictJsonOps.INSTANCE, object);
        if (result.error().isPresent()) {
            errors.add(result.error().get().message());
            return new ParseResult<>(Optional.empty(), List.copyOf(errors), List.copyOf(warnings));
        }
        T definition = result.getOrThrow();
        Refs r = refs.apply(definition);
        errors.addAll(r.events().errors());
        r.componentRefs().forEach(ref -> {
            Identifier id = Identifier.tryParse(ref[1]);
            if (id == null || !r.events().contains(id)) {
                errors.add("components: " + ref[0] + " names event " + ref[1] + ", which is not declared in events (or was dropped)");
            }
        });
        for (Map.Entry<Identifier, EventDefinition> e : r.events().byId().entrySet()) {
            for (Action action : e.getValue().actions()) {
                if (action instanceof Action.TriggerEvent t && !r.events().contains(t.event())) {
                    errors.add("events: " + e.getKey() + ": trigger_event names event " + t.event()
                            + ", which is not declared in events (or was dropped)");
                }
            }
        }
        return new ParseResult<>(Optional.of(definition), List.copyOf(errors), List.copyOf(warnings));
    }

    /** Returns an error message, or null when {@code format} is 1. */
    private static String checkFormat(JsonObject object) {
        JsonElement format = object.get("format");
        if (format == null) {
            return "format: missing (expected " + FORMAT + ")";
        }
        if (!(format instanceof JsonPrimitive p) || !p.isNumber() || p.getAsDouble() != Math.rint(p.getAsDouble())) {
            return "format: must be an integer, got " + format;
        }
        double value = p.getAsDouble();
        if (value > FORMAT) {
            return "format " + p.getAsNumber() + " is newer than this runtime reads (" + FORMAT + "); update msm_runtime";
        }
        if (value < FORMAT) {
            return "format: " + p.getAsNumber() + " is not a known format (expected " + FORMAT + ")";
        }
        return null;
    }
}
