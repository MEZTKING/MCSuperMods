package dev.mcsupermods.runtime.loader;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;
import com.mojang.serialization.DataResult;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import net.minecraft.resources.Identifier;

/**
 * Parses {@code msm/<namespace>/hud/<path>.json} definitions (ADR 0089 D1, D2). Pure: no registry is touched. Rules:
 *
 * <ol>
 *   <li>{@code format} is required; another value than 1 is an error and nothing is registered.</li>
 *   <li>Closed ({@link HudDefinition#CODEC}): an unknown key, a value out of range, an unknown source, stat, anchor or
 *       type, or a colour that is not {@code #rrggbb} is an error and nothing is registered.</li>
 *   <li>{@code vehicle} with a {@code show} other than {@code in_vehicle} or {@code driving} is ignored with a
 *       warning.</li>
 *   <li>An {@code icons} element without {@code icon} is registered with a warning: it draws nothing.</li>
 *   <li>Fields of another type than the element's ({@code size} on a text, {@code text} on a bar) are ignored silently,
 *       as the validators leave them to the app.</li>
 * </ol>
 */
public final class HudParser {
    /** The scanner's kind folder. */
    public static final String KIND = "hud";

    /** The order of HUD ids: by {@code namespace:path} as a string (ADR 0089 D3). */
    public static final Comparator<Identifier> BY_STRING = Comparator.comparing(Identifier::toString);

    private HudParser() {}

    /**
     * The HUD element definitions among {@code definitions} that parse, sorted by id as a string (the order both sides index them
     * in, ADR 0089 D3); problems are added to {@code errors} and {@code warnings}, each starting with the file it
     * concerns.
     */
    public static Map<Identifier, HudDefinition> parseAll(List<RawDefinition> definitions, List<String> errors, List<String> warnings) {
        Map<Identifier, HudDefinition> out = new TreeMap<>(BY_STRING);
        for (RawDefinition raw : definitions) {
            if (!raw.kind().equals(KIND)) {
                continue;
            }
            ParseResult<HudDefinition> result = parse(raw.json());
            result.errors().forEach(e -> errors.add(raw.describe() + ": " + e));
            result.warnings().forEach(w -> warnings.add(raw.describe() + ": " + w));
            result.definition().ifPresent(def -> out.put(raw.id(), def));
        }
        return out;
    }

    /** Parses one HUD element file. */
    public static ParseResult<HudDefinition> parse(JsonElement json) {
        if (!(json instanceof JsonObject object)) {
            return new ParseResult<>(Optional.empty(), List.of("top level must be an object"), List.of());
        }
        String formatError = checkFormat(object);
        if (formatError != null) {
            return new ParseResult<>(Optional.empty(), List.of(formatError), List.of());
        }
        DataResult<HudDefinition> decoded = HudDefinition.CODEC.parse(StrictJsonOps.INSTANCE, object);
        if (decoded.error().isPresent()) {
            return new ParseResult<>(Optional.empty(), List.of(decoded.error().get().message()), List.of());
        }
        HudDefinition def = decoded.getOrThrow();
        List<String> warnings = new ArrayList<>();
        if (def.vehicle().isPresent() && !def.show().namesVehicle()) {
            warnings.add("vehicle: only used with show in_vehicle or driving (show is " + def.show().serialName() + "); ignored");
            def = def.withoutVehicle();
        }
        if (def.type() == HudDefinition.Type.ICONS && def.icons().icon().isEmpty()) {
            warnings.add("icon: an icons element needs an icon; it draws nothing");
        }
        return new ParseResult<>(Optional.of(def), List.of(), List.copyOf(warnings));
    }

    /** Returns an error message, or null when {@code format} is 1 (as {@code DefinitionParser}). */
    private static String checkFormat(JsonObject object) {
        JsonElement format = object.get("format");
        if (format == null) {
            return "format: missing (expected " + DefinitionParser.FORMAT + ")";
        }
        if (!(format instanceof JsonPrimitive p) || !p.isNumber() || p.getAsDouble() != Math.rint(p.getAsDouble())) {
            return "format: must be an integer, got " + format;
        }
        double value = p.getAsDouble();
        if (value > DefinitionParser.FORMAT) {
            return "format " + p.getAsNumber() + " is newer than this runtime reads (" + DefinitionParser.FORMAT + "); update msm_runtime";
        }
        if (value < DefinitionParser.FORMAT) {
            return "format: " + p.getAsNumber() + " is not a known format (expected " + DefinitionParser.FORMAT + ")";
        }
        return null;
    }
}
