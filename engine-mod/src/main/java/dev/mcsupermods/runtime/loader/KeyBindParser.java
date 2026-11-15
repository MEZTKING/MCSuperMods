package dev.mcsupermods.runtime.loader;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;
import com.mojang.serialization.DataResult;
import dev.mcsupermods.runtime.events.Action;
import dev.mcsupermods.runtime.events.EventDefinition;
import dev.mcsupermods.runtime.events.Events;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.minecraft.resources.Identifier;

/**
 * Parses {@code msm/<namespace>/key_bind/<path>.json} definitions (ADR 0088 D3). Pure: no registry is touched. Rules:
 *
 * <ol>
 *   <li>{@code format} is required; another value than 1 is an error and nothing is registered.</li>
 *   <li>Closed ({@link KeyBindDefinition#CODEC}): an unknown key or a value out of range is an error and nothing is
 *       registered.</li>
 *   <li>Events decode one by one: an event that fails is an error and the key bind registers without it.</li>
 *   <li>{@code msm:on_press}, {@code msm:on_release}, {@code msm:while_held} and {@code trigger_event} must name a
 *       declared event; an error otherwise (the key bind still registers; firing the missing event logs an error).</li>
 *   <li>{@code play_animation} actions are dropped with a warning: the player has no animation controllers.</li>
 *   <li>{@code vehicle} with a {@code when} other than {@code in_vehicle} or {@code driving} is ignored with a
 *       warning.</li>
 *   <li>A {@code default_key} that is not a {@code key.keyboard.*} or {@code key.mouse.*} name is a warning; the client
 *       registers that key unbound. Whether the name is one vanilla knows is checked by the client, which alone has
 *       vanilla's key table.</li>
 * </ol>
 */
public final class KeyBindParser {
    /** The scanner's kind folder. */
    public static final String KIND = "key_bind";

    private KeyBindParser() {}

    /**
     * The key bind definitions among {@code definitions} that parse, by id in scan order; problems are added to
     * {@code errors} and {@code warnings}, each starting with the file it concerns.
     */
    public static Map<Identifier, KeyBindDefinition> parseAll(List<RawDefinition> definitions, List<String> errors, List<String> warnings) {
        Map<Identifier, KeyBindDefinition> out = new LinkedHashMap<>();
        for (RawDefinition raw : definitions) {
            if (!raw.kind().equals(KIND)) {
                continue;
            }
            ParseResult<KeyBindDefinition> result = parse(raw.json());
            result.errors().forEach(e -> errors.add(raw.describe() + ": " + e));
            result.warnings().forEach(w -> warnings.add(raw.describe() + ": " + w));
            result.definition().ifPresent(def -> out.put(raw.id(), def));
        }
        return out;
    }

    /** Parses one key bind file. */
    public static ParseResult<KeyBindDefinition> parse(JsonElement json) {
        if (!(json instanceof JsonObject object)) {
            return new ParseResult<>(Optional.empty(), List.of("top level must be an object"), List.of());
        }
        String formatError = checkFormat(object);
        if (formatError != null) {
            return new ParseResult<>(Optional.empty(), List.of(formatError), List.of());
        }
        DataResult<KeyBindDefinition> decoded = KeyBindDefinition.CODEC.parse(StrictJsonOps.INSTANCE, object);
        if (decoded.error().isPresent()) {
            return new ParseResult<>(Optional.empty(), List.of(decoded.error().get().message()), List.of());
        }
        KeyBindDefinition def = decoded.getOrThrow();
        List<String> errors = new ArrayList<>(def.events().errors());
        List<String> warnings = new ArrayList<>();
        Events kept = def.events().withoutPlayAnimation(warnings);
        if (!warnings.isEmpty()) {
            def = def.withEvents(kept);
        }
        Events events = def.events();
        def.eventReferences().forEach(ref -> {
            Identifier id = Identifier.tryParse(ref[1]);
            if (id == null || !events.contains(id)) {
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
        if (def.vehicle().isPresent() && !def.when().namesVehicle()) {
            warnings.add("vehicle: only used with when in_vehicle or driving (when is " + def.when().serialName() + "); ignored");
            def = def.withoutVehicle();
        }
        if (!def.defaultKey().startsWith("key.keyboard.") && !def.defaultKey().startsWith("key.mouse.")) {
            warnings.add("default_key: '" + def.defaultKey() + "' is not a key.keyboard.* or key.mouse.* name; the key starts unbound");
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
