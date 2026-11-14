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
 *   <li>Entities: {@code msm:tameable} and {@code msm:breedable} on a {@code base} other than {@code animal} are an
 *       error; the entity registers without them (ADR 0070 D1, ADR 0071 D1, D2, as ADR 0067 D3 for block types).</li>
 *   <li>Blocks: {@code type} selects the type's own top-level fields; a field of another type is an error (closed per
 *       type), and a component the type does not allow is an error and is not applied (ADR 0067 D2, D3).</li>
 *   <li>Blocks: {@code msm:machine} with {@code msm:container} is an error and the container is not applied; a top-level
 *       {@code recipes} list (element-only) is an error (ADR 0075 D1, D8).</li>
 *   <li>Blocks and items: {@code play_animation} actions are dropped with a warning (ADR 0028 D4).</li>
 *   <li>Items: two or more of {@code msm:tool}, {@code msm:armor}, {@code msm:ranged_weapon} and {@code msm:shield}
 *       are an error; the item registers without them (ADR 0042 D1, ADR 0044 D3).</li>
 *   <li>Items: {@code msm:throwable} with {@code msm:armor}, {@code msm:ranged_weapon}, {@code msm:shield},
 *       {@code msm:consumable}, {@code msm:food} or a {@code mace} tool is an error; none of them is applied
 *       (ADR 0056 D2).</li>
 *   <li>Items: {@code msm:while_worn} without {@code msm:armor} is an error; it is not applied (ADR 0061 D1).</li>
 *   <li>Effects: {@code play_animation} actions are dropped with a warning (ADR 0055 D3).</li>
 *   <li>Biome and loot additions (ADR 0060 D2, D3): closed throughout, so an unknown top-level key is an error, not a
 *       warning; they have no components and no events.</li>
 *   <li>Potions (ADR 0063 D2): closed throughout as the additions; they have no components and no events.</li>
 * </ol>
 */
public final class DefinitionParser {
    /** The definition format this runtime reads. */
    public static final int FORMAT = 1;

    private DefinitionParser() {}

    public static ParseResult<BlockDefinition> parseBlock(JsonElement json) {
        ParseResult<BlockDefinition> result = parse(json, BlockDefinition.KEYS, BlockComponents.KEYS, BlockDefinition.CODEC,
                def -> new Refs(def.events(), def.components().eventReferences(), List.of()));
        return checkContainer(checkMachine(json,
                dropComponentsNotForType(dropPlayAnimation(result, BlockDefinition::events, BlockDefinition::withEvents))));
    }

    /**
     * The rules of {@code msm:machine} (ADR 0075 D1, D8): with {@code msm:container} on the same block it is an error and
     * the container is not applied ({@link BlockComponents#checkMachine}); a top-level {@code recipes} list is
     * element-only (lowered to data pack recipe files) and is an error here, not an unknown-key warning.
     */
    private static ParseResult<BlockDefinition> checkMachine(JsonElement json, ParseResult<BlockDefinition> result) {
        List<String> errors = new ArrayList<>(result.errors());
        List<String> warnings = result.warnings();
        if (json instanceof JsonObject object && object.has(MACHINE_RECIPES_FIELD)) {
            warnings = result.warnings().stream().filter(w -> !w.contains("'" + MACHINE_RECIPES_FIELD + "'")).toList();
            errors.add(MACHINE_RECIPES_FIELD + ": unknown field (machine recipes are element-only and lowered to data pack"
                    + " recipe files); it is ignored");
        }
        Optional<BlockDefinition> def = result.definition();
        if (def.isPresent()) {
            def = Optional.of(def.get().withComponents(def.get().components().checkMachine(errors)));
        }
        return errors.size() == result.errors().size() ? result : new ParseResult<>(def, List.copyOf(errors), warnings);
    }

    /** The element-only list of machine recipes (ADR 0075 D8), never part of a definition. */
    private static final String MACHINE_RECIPES_FIELD = "recipes";

    /** The layout rules of {@code msm:container} ({@link BlockComponents#checkContainer}, ADR 0074 D1, D6). */
    private static ParseResult<BlockDefinition> checkContainer(ParseResult<BlockDefinition> result) {
        if (result.definition().isEmpty() || result.definition().get().components().container().isEmpty()) {
            return result;
        }
        BlockDefinition def = result.definition().get();
        List<String> errors = new ArrayList<>(result.errors());
        BlockComponents checked = def.components().checkContainer(errors);
        return new ParseResult<>(Optional.of(def.withComponents(checked)), List.copyOf(errors), result.warnings());
    }

    /**
     * A component the block's type does not allow (ADR 0067 D3, {@link BlockType#allows}): an error, and that component
     * is not applied; the block still registers, as {@code msm:while_worn} without armour on an item.
     */
    private static ParseResult<BlockDefinition> dropComponentsNotForType(ParseResult<BlockDefinition> result) {
        if (result.definition().isEmpty()) {
            return result;
        }
        BlockDefinition def = result.definition().get();
        List<String> disallowed = def.components().present().stream().filter(key -> !def.type().allows(key)).toList();
        if (disallowed.isEmpty()) {
            return result;
        }
        List<String> errors = new ArrayList<>(result.errors());
        for (String key : disallowed) {
            errors.add("components: " + key + " is not allowed on type '" + def.type().id() + "'; it is not applied");
        }
        return new ParseResult<>(Optional.of(def.withComponents(def.components().without(disallowed))), List.copyOf(errors),
                result.warnings());
    }

    public static ParseResult<ItemDefinition> parseItem(JsonElement json) {
        ParseResult<ItemDefinition> result = parse(json, ItemDefinition.KEYS, ItemComponents.KEYS, ItemDefinition.CODEC,
                def -> new Refs(def.events(), def.components().eventReferences(), List.of()));
        return dropWhileWornWithoutArmor(
                dropThrowableConflicts(dropExclusiveTogether(dropPlayAnimation(result, ItemDefinition::events, ItemDefinition::withEvents))));
    }

    /**
     * {@code msm:while_worn} fires in the armour slot of {@code msm:armor} (ADR 0061 D1): without {@code msm:armor}
     * (also when an exclusive or throwable conflict dropped it) it is an error and is not applied.
     */
    private static ParseResult<ItemDefinition> dropWhileWornWithoutArmor(ParseResult<ItemDefinition> result) {
        if (result.definition().isEmpty()) {
            return result;
        }
        ItemDefinition def = result.definition().get();
        if (def.components().whileWorn().isEmpty() || def.components().armor().isPresent()) {
            return result;
        }
        List<String> errors = new ArrayList<>(result.errors());
        errors.add("components: msm:while_worn needs msm:armor (the slot it is worn in); it is not applied");
        return new ParseResult<>(Optional.of(def.withComponents(def.components().withoutWhileWorn())), List.copyOf(errors),
                result.warnings());
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

    /** A potion (ADR 0063 D2): closed, so an editor field such as {@code brewing} is an error. */
    public static ParseResult<PotionDefinition> parsePotion(JsonElement json) {
        return parseClosed(json, PotionDefinition.CODEC);
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
        return dropComponentsNotForBase(parse(json, EntityDefinition.KEYS, EntityComponents.KEYS, EntityDefinition.CODEC,
                def -> new Refs(def.events(), def.components().eventReferences(), def.components().goalErrors())));
    }

    /** {@code msm:tameable} and {@code msm:breedable} need the {@code animal} base: an error each, and it is not applied. */
    private static ParseResult<EntityDefinition> dropComponentsNotForBase(ParseResult<EntityDefinition> result) {
        if (result.definition().isEmpty()) {
            return result;
        }
        EntityDefinition def = result.definition().get();
        List<String> present = def.components().animalOnlyPresent();
        if (def.base() == EntityDefinition.Base.ANIMAL || present.isEmpty()) {
            return result;
        }
        List<String> errors = new ArrayList<>(result.errors());
        for (String key : present) {
            errors.add("components: " + key + " needs base 'animal' (base is '" + def.base().serialName() + "'); it is not applied");
        }
        return new ParseResult<>(Optional.of(def.withComponents(def.components().withoutAnimalOnly())), List.copyOf(errors),
                result.warnings());
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
