package dev.mcsupermods.runtime.loader;

import static dev.mcsupermods.runtime.loader.MsmCodecs.INT;
import static dev.mcsupermods.runtime.loader.MsmCodecs.closed;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;
import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import net.minecraft.resources.Identifier;

/**
 * Parses {@code msm/<namespace>/game_rule/<path>.json} definitions (ADR 0111 D5 as amended after the spike,
 * {@code ::msm::definition::GameRule}). Pure: no registry is touched, so JUnit runs it over the conformance corpus. Rules:
 *
 * <ol>
 *   <li>{@code format} is required; another value than 1 is an error and nothing is registered.</li>
 *   <li>Closed: an unknown key (an element-only {@code display_name} or {@code description}), a missing or unknown
 *       {@code kind} or an unknown {@code category} is an error and nothing is registered.</li>
 *   <li>The fields follow {@code kind} (mcdoc dispatcher {@code msm:game_rule_kind}): a {@code boolean} rule takes a
 *       boolean {@code default} (false when absent) and no {@code min} or {@code max}; an {@code integer} rule takes whole
 *       numbers. A field of the other kind, a {@code default} of the wrong type, {@code min} above {@code max} or a
 *       {@code default} outside them is an error and nothing is registered. An integer rule without {@code default}
 *       starts at 0 kept within {@code min} and {@code max}.</li>
 * </ol>
 *
 * <p>{@code registry.MsmGameRules} (B533) registers each rule with Fabric's game rule builder (B525) in its category;
 * {@code /gamerule} needs the namespace ({@code <ns>:<path>}).
 */
public final class GameRuleParser {
    /** The scanner's kind folder. */
    public static final String KIND = "game_rule";

    private GameRuleParser() {}

    /** {@code GameRuleKind}: vanilla's two kinds of value. */
    public enum Kind {
        BOOLEAN, INTEGER;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        public static final Codec<Kind> CODEC = MsmCodecs.named("kind", values(), Kind::serialName);
    }

    /** {@code GameRuleCategory}: vanilla's game rule categories (B525: {@code GameRuleCategory} of the same names). */
    public enum Category {
        PLAYER, MOBS, SPAWNING, DROPS, UPDATES, CHAT, MISC;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        public static final Codec<Category> CODEC = MsmCodecs.named("category", values(), Category::serialName);
    }

    /**
     * A game rule definition v1.
     *
     * @param kind           the kind of value
     * @param category       the game rule screen's group (default {@link Category#MISC})
     * @param booleanDefault a boolean rule's value in a new world; false for an integer rule
     * @param integerDefault an integer rule's value in a new world, within {@code min} and {@code max}; 0 for a boolean rule
     * @param min            an integer rule's lowest value; empty means none (and always for a boolean rule)
     * @param max            an integer rule's highest value; empty means none (and always for a boolean rule)
     */
    public record GameRule(Kind kind, Category category, boolean booleanDefault, int integerDefault, Optional<Integer> min,
            Optional<Integer> max) {
        public static final List<String> KEYS = List.of("format", "kind", "category", "default", "min", "max");

        /** The language key of the rule's name (B525): {@code gamerule.<ns>.<path>}. */
        public static String translationKey(Identifier id) {
            return "gamerule." + id.getNamespace() + "." + id.getPath();
        }

        /** The language key of its description: {@link #translationKey(Identifier)} followed by {@code .description}. */
        public static String descriptionKey(Identifier id) {
            return translationKey(id) + ".description";
        }
    }

    /** {@code GameRule} as written. */
    private record Raw(Kind kind, Optional<Category> category, Optional<JsonElement> defaultValue, Optional<Integer> min,
            Optional<Integer> max) {}

    private static final Codec<JsonElement> JSON = Codec.PASSTHROUGH.xmap(
            d -> d.convert(com.mojang.serialization.JsonOps.INSTANCE).getValue(),
            j -> new com.mojang.serialization.Dynamic<>(com.mojang.serialization.JsonOps.INSTANCE, j));

    private static final Codec<Raw> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
            required("kind", Kind.CODEC).forGetter(Raw::kind),
            optional("category", Category.CODEC).forGetter(Raw::category),
            optional("default", JSON).forGetter(Raw::defaultValue),
            optional("min", INT).forGetter(Raw::min),
            optional("max", INT).forGetter(Raw::max)).apply(i, Raw::new)), GameRule.KEYS);

    /**
     * The game rule definitions among {@code definitions} that parse, by id in scan order; problems are added to
     * {@code errors} and {@code warnings}, each starting with the file it concerns.
     */
    public static Map<Identifier, GameRule> parseAll(List<RawDefinition> definitions, List<String> errors, List<String> warnings) {
        Map<Identifier, GameRule> out = new LinkedHashMap<>();
        for (RawDefinition raw : definitions) {
            if (!raw.kind().equals(KIND)) {
                continue;
            }
            ParseResult<GameRule> result = parse(raw.json());
            result.errors().forEach(e -> errors.add(raw.describe() + ": " + e));
            result.warnings().forEach(w -> warnings.add(raw.describe() + ": " + w));
            result.definition().ifPresent(def -> out.put(raw.id(), def));
        }
        return out;
    }

    /** Parses one game rule file. */
    public static ParseResult<GameRule> parse(JsonElement json) {
        if (!(json instanceof JsonObject object)) {
            return new ParseResult<>(Optional.empty(), List.of("top level must be an object"), List.of());
        }
        String formatError = CommandParser.checkFormat(object);
        if (formatError != null) {
            return new ParseResult<>(Optional.empty(), List.of(formatError), List.of());
        }
        DataResult<Raw> decoded = CODEC.parse(StrictJsonOps.INSTANCE, object);
        if (decoded.error().isPresent()) {
            return new ParseResult<>(Optional.empty(), List.of(decoded.error().get().message()), List.of());
        }
        Raw raw = decoded.getOrThrow();
        Category category = raw.category().orElse(Category.MISC);
        List<String> errors = new ArrayList<>();
        if (raw.kind() == Kind.BOOLEAN) {
            raw.min().ifPresent(m -> errors.add("min: not a field of a boolean game rule"));
            raw.max().ifPresent(m -> errors.add("max: not a field of a boolean game rule"));
            boolean value = false;
            if (raw.defaultValue().isPresent()) {
                JsonElement d = raw.defaultValue().get();
                if (d instanceof JsonPrimitive p && p.isBoolean()) {
                    value = p.getAsBoolean();
                } else {
                    errors.add("default: a boolean game rule needs true or false, got " + d);
                }
            }
            if (!errors.isEmpty()) {
                return new ParseResult<>(Optional.empty(), List.copyOf(errors), List.of());
            }
            return new ParseResult<>(Optional.of(new GameRule(Kind.BOOLEAN, category, value, 0, Optional.empty(), Optional.empty())),
                    List.of(), List.of());
        }
        Optional<Integer> min = raw.min();
        Optional<Integer> max = raw.max();
        if (min.isPresent() && max.isPresent() && min.get() > max.get()) {
            errors.add("min: " + min.get() + " is above max " + max.get());
        }
        int value = Math.max(min.orElse(Integer.MIN_VALUE), Math.min(max.orElse(Integer.MAX_VALUE), 0));
        if (raw.defaultValue().isPresent()) {
            JsonElement d = raw.defaultValue().get();
            DataResult<Integer> number = INT.parse(StrictJsonOps.INSTANCE, d);
            if (number.error().isPresent()) {
                errors.add("default: an integer game rule needs a whole number, got " + d);
            } else {
                value = number.getOrThrow();
                if (min.isPresent() && value < min.get() || max.isPresent() && value > max.get()) {
                    errors.add("default: " + value + " is outside min and max");
                }
            }
        }
        if (!errors.isEmpty()) {
            return new ParseResult<>(Optional.empty(), List.copyOf(errors), List.of());
        }
        return new ParseResult<>(Optional.of(new GameRule(Kind.INTEGER, category, false, value, min, max)), List.of(), List.of());
    }
}
