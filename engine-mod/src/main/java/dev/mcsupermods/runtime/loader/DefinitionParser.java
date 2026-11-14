package dev.mcsupermods.runtime.loader;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;
import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import dev.mcsupermods.runtime.components.BlockComponents;
import dev.mcsupermods.runtime.components.EffectComponents;
import dev.mcsupermods.runtime.components.EntityComponents;
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
 *   <li>Entities: goals that failed on their own are errors; the entity registers without them.</li>
 *   <li>Blocks and items: {@code play_animation} actions are dropped with a warning (ADR 0028 D4).</li>
 *   <li>Items: two or more of {@code msm:tool}, {@code msm:armor}, {@code msm:ranged_weapon} and {@code msm:shield}
 *       are an error; the item registers without them (ADR 0042 D1, ADR 0044 D3).</li>
 *   <li>Items: {@code msm:throwable} with {@code msm:armor}, {@code msm:ranged_weapon}, {@code msm:shield},
 *       {@code msm:consumable}, {@code msm:food} or a {@code mace} tool is an error; none of them is applied
 *       (ADR 0056 D2).</li>
 *   <li>Effects: {@code play_animation} actions are dropped with a warning (ADR 0055 D3).</li>
 *   <li>Biome and loot additions (ADR 0060 D2, D3): closed throughout, so an unknown top-level key is an error, not a
 *       warning; they have no components and no events.</li>
 * </ol>
 */
public final class DefinitionParser {
    /** The definition format this runtime reads. */
    public static final int FORMAT = 1;

    private DefinitionParser() {}

    public static ParseResult<BlockDefinition> parseBlock(JsonElement json) {
        ParseResult<BlockDefinition> result = parse(json, BlockDefinition.KEYS, BlockComponents.KEYS, BlockDefinition.CODEC,
                def -> new Refs(def.events(), def.components().eventReferences(), List.of()));
        return dropPlayAnimation(result, BlockDefinition::events, BlockDefinition::withEvents);
    }

    public static ParseResult<ItemDefinition> parseItem(JsonElement json) {
        ParseResult<ItemDefinition> result = parse(json, ItemDefinition.KEYS, ItemComponents.KEYS, ItemDefinition.CODEC,
                def -> new Refs(def.events(), def.components().eventReferences(), List.of()));
        return dropThrowableConflicts(dropExclusiveTogether(dropPlayAnimation(result, ItemDefinition::events, ItemDefinition::withEvents)));
    }

    /** A mob effect definition (ADR 0055 D2); {@code play_animation} is dropped with a warning, as for blocks and items. */
    public static ParseResult<EffectDefinition> parseEffect(JsonElement json) {
        ParseResult<EffectDefinition> result = parse(json, EffectDefinition.KEYS, EffectComponents.KEYS, EffectDefinition.CODEC,
                def -> new Refs(def.events(), def.components().eventReferences(), List.of()));
        return dropPlayAnimation(result, EffectDefinition::events, EffectDefinition::withEvents);
    }

    /**
     * {@code msm:throwable} with a component that owns right-click or the item class (ADR 0056 D2): an error, and
     * neither the throwable nor those components are applied. Runs after {@link #dropExclusiveTogether}, so the
     * exclusive set is already settled.
     */
    private static ParseResult<ItemDefinition> dropThrowableConflicts(ParseResult<ItemDefinition> result) {
        if (result.definition().isEmpty()) {
            return result;
        }
        ItemDefinition def = result.definition().get();
        List<String> conflicts = def.components().throwableConflicts();
        if (conflicts.isEmpty()) {
            return result;
        }
        List<String> all = new ArrayList<>(List.of("msm:throwable"));
        all.addAll(conflicts);
        List<String> errors = new ArrayList<>(result.errors());
        String names = String.join(", ", all.subList(0, all.size() - 1)) + " and " + all.getLast();
        errors.add("components: " + names + " on one item; " + (all.size() == 2 ? "neither" : "none") + " is applied");
        return new ParseResult<>(Optional.of(def.withComponents(def.components().withoutThrowableConflicts())), List.copyOf(errors),
                result.warnings());
    }

    /**
     * More than one of {@code msm:tool}, {@code msm:armor}, {@code msm:ranged_weapon} and {@code msm:shield} on one
     * item: an error, and none of them is applied (ADR 0042 D1, ADR 0044 D3).
     */
    private static ParseResult<ItemDefinition> dropExclusiveTogether(ParseResult<ItemDefinition> result) {
        if (result.definition().isEmpty()) {
            return result;
        }
        ItemDefinition def = result.definition().get();
        List<String> present = def.components().exclusivePresent();
        if (present.size() < 2) {
            return result;
        }
        List<String> errors = new ArrayList<>(result.errors());
        String names = String.join(", ", present.subList(0, present.size() - 1)) + " and " + present.getLast();
        errors.add("components: " + names + " on one item; " + (present.size() == 2 ? "neither" : "none") + " is applied");
        return new ParseResult<>(Optional.of(def.withComponents(def.components().withoutExclusive())), List.copyOf(errors),
                result.warnings());
    }

    /** A biome addition (ADR 0060 D2). */
    public static ParseResult<BiomeAdditionDefinition> parseBiomeAddition(JsonElement json) {
        return parseClosed(json, BiomeAdditionDefinition.CODEC);
    }

    /** A loot addition (ADR 0060 D3); the pools stay JSON until a loot table load decodes them. */
    public static ParseResult<LootAdditionDefinition> parseLootAddition(JsonElement json) {
        return parseClosed(json, LootAdditionDefinition.CODEC);
    }

    /** Format check, then a closed Codec: every problem is an error and nothing is applied. */
    private static <T> ParseResult<T> parseClosed(JsonElement json, Codec<T> codec) {
        if (!(json instanceof JsonObject object)) {
            return new ParseResult<>(Optional.empty(), List.of("top level must be an object"), List.of());
        }
        String formatError = checkFormat(object);
        if (formatError != null) {
            return new ParseResult<>(Optional.empty(), List.of(formatError), List.of());
        }
        DataResult<T> result = codec.parse(StrictJsonOps.INSTANCE, object);
        if (result.error().isPresent()) {
            return new ParseResult<>(Optional.empty(), List.of(result.error().get().message()), List.of());
        }
        return new ParseResult<>(Optional.of(result.getOrThrow()), List.of(), List.of());
    }

    public static ParseResult<EntityDefinition> parseEntity(JsonElement json) {
        return parse(json, EntityDefinition.KEYS, EntityComponents.KEYS, EntityDefinition.CODEC,
                def -> new Refs(def.events(), def.components().eventReferences(), def.components().goalErrors()));
    }

    private record Refs(Events events, Stream<String[]> componentRefs, List<String> otherErrors) {}

    private static <T> ParseResult<T> dropPlayAnimation(ParseResult<T> result, Function<T, Events> events,
            java.util.function.BiFunction<T, Events, T> withEvents) {
        if (result.definition().isEmpty()) {
            return result;
        }
        List<String> warnings = new ArrayList<>(result.warnings());
        T def = result.definition().get();
        int before = warnings.size();
        Events kept = events.apply(def).withoutPlayAnimation(warnings);
        if (warnings.size() == before) {
            return result;
        }
        return new ParseResult<>(Optional.of(withEvents.apply(def, kept)), result.errors(), List.copyOf(warnings));
    }

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
        errors.addAll(r.otherErrors());
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
