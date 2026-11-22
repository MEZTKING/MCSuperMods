package dev.mcsupermods.runtime.loader;

import static dev.mcsupermods.runtime.loader.MsmCodecs.closed;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import net.minecraft.resources.Identifier;

/**
 * Parses {@code msm/<namespace>/stat/<path>.json} definitions (ADR 0111 D6 as amended after the spike,
 * {@code ::msm::definition::Stat}). Pure: no registry is touched, so JUnit runs it over the conformance corpus.
 * {@code format} is required (another value than 1 is an error); the struct is closed, so an element-only key
 * ({@code display_name}), an unknown key ({@code unit}) or a {@code formatter} other than {@code default},
 * {@code distance} and {@code time} is an error and no statistic is registered. {@code registry.MsmStats} (B533)
 * registers each in {@code custom_stat} and keeps the registered {@code Identifier} instance (B525: a fresh instance
 * throws).
 */
public final class StatParser {
    /** The scanner's kind folder. */
    public static final String KIND = "stat";

    private StatParser() {}

    /** {@code StatFormatter}: vanilla's formatters of a custom statistic (B525). */
    public enum Formatter {
        /** A count, shown as it is. */
        DEFAULT,
        /** Centimetres, shown as metres or kilometres. */
        DISTANCE,
        /** Ticks, shown as seconds, minutes, hours or days. */
        TIME;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        public static final Codec<Formatter> CODEC = MsmCodecs.named("formatter", values(), Formatter::serialName);
    }

    /**
     * A statistic definition v1.
     *
     * @param formatter how the number is shown (default {@link Formatter#DEFAULT})
     */
    public record Stat(Formatter formatter) {
        public static final List<String> KEYS = List.of("format", "formatter");

        public static final Codec<Stat> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                optional("formatter", Formatter.CODEC, Formatter.DEFAULT).forGetter(Stat::formatter)).apply(i, Stat::new)), KEYS);
    }

    /** The scoreboard criterion of statistic {@code id} (B525): {@code minecraft.custom:<ns>.<path>}. */
    public static String criterion(Identifier id) {
        return "minecraft.custom:" + id.getNamespace() + "." + id.getPath();
    }

    /** The language key of its name (B525): {@code stat.<ns>.<path>} (a path with {@code /}: verify at implementation). */
    public static String translationKey(Identifier id) {
        return "stat." + id.getNamespace() + "." + id.getPath();
    }

    /**
     * The statistic definitions among {@code definitions} that parse, by id in scan order; problems are added to
     * {@code errors} and {@code warnings}, each starting with the file it concerns.
     */
    public static Map<Identifier, Stat> parseAll(List<RawDefinition> definitions, List<String> errors, List<String> warnings) {
        Map<Identifier, Stat> out = new LinkedHashMap<>();
        for (RawDefinition raw : definitions) {
            if (!raw.kind().equals(KIND)) {
                continue;
            }
            ParseResult<Stat> result = parse(raw.json());
            result.errors().forEach(e -> errors.add(raw.describe() + ": " + e));
            result.warnings().forEach(w -> warnings.add(raw.describe() + ": " + w));
            result.definition().ifPresent(def -> out.put(raw.id(), def));
        }
        return out;
    }

    /** Parses one statistic file. */
    public static ParseResult<Stat> parse(JsonElement json) {
        if (!(json instanceof JsonObject object)) {
            return new ParseResult<>(Optional.empty(), List.of("top level must be an object"), List.of());
        }
        String formatError = CommandParser.checkFormat(object);
        if (formatError != null) {
            return new ParseResult<>(Optional.empty(), List.of(formatError), List.of());
        }
        DataResult<Stat> decoded = Stat.CODEC.parse(StrictJsonOps.INSTANCE, object);
        if (decoded.error().isPresent()) {
            return new ParseResult<>(Optional.empty(), List.of(decoded.error().get().message()), List.of());
        }
        return new ParseResult<>(Optional.of(decoded.getOrThrow()), List.of(), List.of());
    }
}
