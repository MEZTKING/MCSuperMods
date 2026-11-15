package dev.mcsupermods.runtime.loader;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;
import com.mojang.serialization.DataResult;
import dev.mcsupermods.runtime.events.Action;
import dev.mcsupermods.runtime.events.EventDefinition;
import dev.mcsupermods.runtime.events.Events;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import net.minecraft.resources.Identifier;

/**
 * Parses {@code msm/<namespace>/vehicle/<path>.json} definitions (ADR 0090 D2). Pure: no registry is touched. Rules:
 *
 * <ol>
 *   <li>{@code format} is required; another value than 1 is an error and nothing is registered.</li>
 *   <li>Closed throughout ({@link VehicleDefinition#CODEC}): an unknown key or a value out of range is an error and
 *       nothing is registered.</li>
 *   <li>Events decode one by one: an event that fails is an error and the vehicle registers without it.</li>
 *   <li>{@code on_place}, {@code on_mount}, {@code on_dismount}, {@code on_destroy}, {@code on_tick.event}, a weapon's
 *       {@code on_fire} and {@code trigger_event} must name a declared event; an error otherwise (the vehicle still
 *       registers; firing the missing event logs an error).</li>
 *   <li>{@code play_animation} actions are dropped with a warning: a vehicle plays {@code idle} and {@code moving} from
 *       {@code model.animations} instead (ADR 0090 D10).</li>
 *   <li>Two weapons or two paints with the same id, and a seat naming an unknown weapon, are errors; the vehicle still
 *       registers (the later duplicate and the unknown name are ignored).</li>
 * </ol>
 */
public final class VehicleParser {
    /** The scanner's kind folder. */
    public static final String KIND = "vehicle";

    private VehicleParser() {}

    /**
     * The vehicle definitions among {@code definitions} that parse, by id in scan order; problems are added to
     * {@code errors} and {@code warnings}, each starting with the file it concerns.
     */
    public static Map<Identifier, VehicleDefinition> parseAll(List<RawDefinition> definitions, List<String> errors, List<String> warnings) {
        Map<Identifier, VehicleDefinition> out = new LinkedHashMap<>();
        for (RawDefinition raw : definitions) {
            if (!raw.kind().equals(KIND)) {
                continue;
            }
            ParseResult<VehicleDefinition> result = parse(raw.json());
            result.errors().forEach(e -> errors.add(raw.describe() + ": " + e));
            result.warnings().forEach(w -> warnings.add(raw.describe() + ": " + w));
            result.definition().ifPresent(def -> out.put(raw.id(), def));
        }
        return out;
    }

    /** Parses one vehicle file. */
    public static ParseResult<VehicleDefinition> parse(JsonElement json) {
        if (!(json instanceof JsonObject object)) {
            return new ParseResult<>(Optional.empty(), List.of("top level must be an object"), List.of());
        }
        String formatError = checkFormat(object);
        if (formatError != null) {
            return new ParseResult<>(Optional.empty(), List.of(formatError), List.of());
        }
        DataResult<VehicleDefinition> decoded = VehicleDefinition.CODEC.parse(StrictJsonOps.INSTANCE, object);
        if (decoded.error().isPresent()) {
            return new ParseResult<>(Optional.empty(), List.of(decoded.error().get().message()), List.of());
        }
        VehicleDefinition def = decoded.getOrThrow();
        List<String> errors = new ArrayList<>(def.events().errors());
        List<String> warnings = new ArrayList<>();
        Events events = def.events();
        Events kept = events.withoutPlayAnimation(warnings);
        if (!warnings.isEmpty()) {
            def = def.withEvents(kept);
            events = kept;
        }
        Events declared = events;
        def.eventReferences().forEach(ref -> {
            Identifier id = Identifier.tryParse(ref[1]);
            if (id == null || !declared.contains(id)) {
                errors.add(ref[0] + " names event " + ref[1] + ", which is not declared in events (or was dropped)");
            }
        });
        for (Map.Entry<Identifier, EventDefinition> e : events.byId().entrySet()) {
            for (Action action : e.getValue().actions()) {
                if (action instanceof Action.TriggerEvent t && !events.contains(t.event())) {
                    errors.add("events: " + e.getKey() + ": trigger_event names event " + t.event()
                            + ", which is not declared in events (or was dropped)");
                }
            }
        }
        Set<String> weaponIds = new HashSet<>();
        for (VehicleDefinition.Weapon weapon : def.weapons()) {
            if (!weaponIds.add(weapon.id())) {
                errors.add("weapons: two weapons have the id '" + weapon.id() + "'; the later one is ignored");
            }
        }
        Set<String> paintIds = new HashSet<>();
        for (VehicleDefinition.Paint paint : def.model().paints()) {
            if (!paintIds.add(paint.id())) {
                errors.add("model: paints: two paints have the id '" + paint.id() + "'; the later one is ignored");
            }
        }
        for (int i = 0; i < def.seats().size(); i++) {
            for (String weapon : def.seats().get(i).weapons().orElse(List.of())) {
                if (!weaponIds.contains(weapon)) {
                    errors.add("seats[" + i + "]: weapons names '" + weapon + "', which is not a weapon of this vehicle; it is ignored");
                }
            }
        }
        return new ParseResult<>(Optional.of(def), List.copyOf(errors), List.copyOf(warnings));
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
