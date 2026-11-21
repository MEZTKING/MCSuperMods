package dev.mcsupermods.runtime.loader;

import static dev.mcsupermods.runtime.loader.MsmCodecs.closed;
import static dev.mcsupermods.runtime.loader.MsmCodecs.floatAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.mcsupermods.runtime.events.Action;
import dev.mcsupermods.runtime.events.EventDefinition;
import dev.mcsupermods.runtime.events.Events;
import dev.mcsupermods.runtime.registry.fluid.FluidDefinition;
import dev.mcsupermods.runtime.registry.fluid.FluidDefinition.Behaviour;
import dev.mcsupermods.runtime.registry.fluid.FluidDefinition.Flow;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.minecraft.resources.Identifier;

/**
 * Parses {@code msm/<namespace>/fluid/<path>.json} definitions (ADR 0099 D1, {@code ::msm::definition::Fluid}). Pure: no
 * registry is touched, so JUnit runs it over the conformance corpus. Rules:
 *
 * <ol>
 *   <li>{@code format} is required; another value than 1 is an error and nothing is registered.</li>
 *   <li>Closed ({@link #CODEC}, {@link #FLOW_CODEC}): an unknown key, a {@code behaves_like} other than water, lava or
 *       none, a flow number, light, tint or explosion resistance out of range, or a value of the wrong type is an error
 *       and nothing is registered.</li>
 *   <li>Defaults follow {@code behaves_like} (ADR 0099 D1): water's flow 5, 4, 1 and infinite, lava's 30, 2, 2 and not
 *       infinite ({@code none} takes water's); light 0, or 15 for lava; explosion resistance 100; no tint. A
 *       {@code flow} object sets only the numbers it names.</li>
 *   <li>Events decode one by one: an event that fails is an error and the fluid registers without it;
 *       {@code on_entity_inside} and every {@code trigger_event} must name a declared event (an error otherwise; the
 *       fluid still registers, without the inside event). {@code play_animation} actions are dropped with a warning: a
 *       fluid has no animation controllers.</li>
 * </ol>
 */
public final class FluidParser {
    /** The scanner's kind folder. */
    public static final String KIND = "fluid";

    private FluidParser() {}

    static final Codec<Behaviour> BEHAVIOUR_CODEC = MsmCodecs.named("behaves_like", Behaviour.values(), Behaviour::serialName);

    /** {@code FluidFlow} as written: each number optional. */
    record RawFlow(Optional<Integer> tickDelay, Optional<Integer> slopeDistance, Optional<Integer> dropOff, Optional<Boolean> infinite) {
        static final List<String> KEYS = List.of("tick_delay", "slope_distance", "drop_off", "infinite");

        Flow resolve(Flow defaults) {
            return new Flow(tickDelay.orElse(defaults.tickDelay()), slopeDistance.orElse(defaults.slopeDistance()),
                    dropOff.orElse(defaults.dropOff()), infinite.orElse(defaults.infinite()));
        }
    }

    static final Codec<RawFlow> FLOW_CODEC = closed(RecordCodecBuilder.create(i -> i.group(
            optional("tick_delay", intRange(1, 100)).forGetter(RawFlow::tickDelay),
            optional("slope_distance", intRange(1, 8)).forGetter(RawFlow::slopeDistance),
            optional("drop_off", intRange(1, 4)).forGetter(RawFlow::dropOff),
            optional("infinite", Codec.BOOL).forGetter(RawFlow::infinite)).apply(i, RawFlow::new)), RawFlow.KEYS);

    /** {@code Fluid} as written, before the defaults. */
    record Raw(Optional<Behaviour> behavesLike, Optional<RawFlow> flow, Optional<Integer> light, Optional<Integer> tint,
            Optional<Float> explosionResistance, Optional<String> onEntityInside, Events events) {
        static final List<String> KEYS = List.of("format", "behaves_like", "flow", "light", "tint", "explosion_resistance",
                "on_entity_inside", "events");
    }

    static final Codec<Raw> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
            optional("behaves_like", BEHAVIOUR_CODEC).forGetter(Raw::behavesLike),
            optional("flow", FLOW_CODEC).forGetter(Raw::flow),
            optional("light", intRange(0, 15)).forGetter(Raw::light),
            optional("tint", intRange(0, 0xFFFFFF)).forGetter(Raw::tint),
            optional("explosion_resistance", floatAtLeast(0)).forGetter(Raw::explosionResistance),
            optional("on_entity_inside", Codec.STRING).forGetter(Raw::onEntityInside),
            MsmCodecs.optional("events", Events.CODEC, Events.NONE).forGetter(Raw::events)).apply(i, Raw::new)), Raw.KEYS);

    /**
     * The fluid definitions among {@code definitions} that parse, by id in scan order; problems are added to
     * {@code errors} and {@code warnings}, each starting with the file it concerns.
     */
    public static Map<Identifier, FluidDefinition> parseAll(List<RawDefinition> definitions, List<String> errors, List<String> warnings) {
        Map<Identifier, FluidDefinition> out = new LinkedHashMap<>();
        for (RawDefinition raw : definitions) {
            if (!raw.kind().equals(KIND)) {
                continue;
            }
            ParseResult<FluidDefinition> result = parse(raw.json());
            result.errors().forEach(e -> errors.add(raw.describe() + ": " + e));
            result.warnings().forEach(w -> warnings.add(raw.describe() + ": " + w));
            result.definition().ifPresent(def -> out.put(raw.id(), def));
        }
        return out;
    }

    /** Parses one fluid file. */
    public static ParseResult<FluidDefinition> parse(JsonElement json) {
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
        List<String> errors = new ArrayList<>(raw.events().errors());
        List<String> warnings = new ArrayList<>();
        Events events = raw.events().withoutPlayAnimation(warnings);
        Optional<Identifier> inside = Optional.empty();
        if (raw.onEntityInside().isPresent()) {
            String ref = raw.onEntityInside().get();
            Identifier id = Identifier.tryParse(ref);
            if (id == null || !events.contains(id)) {
                errors.add("on_entity_inside: names event " + ref + ", which is not declared in events (or was dropped)");
            } else {
                inside = Optional.of(id);
            }
        }
        for (Map.Entry<Identifier, EventDefinition> e : events.byId().entrySet()) {
            for (Action action : e.getValue().actions()) {
                if (action instanceof Action.TriggerEvent t && !events.contains(t.event())) {
                    errors.add("events: " + e.getKey() + ": trigger_event names event " + t.event()
                            + ", which is not declared in events (or was dropped)");
                }
            }
        }
        Behaviour behaviour = raw.behavesLike().orElse(Behaviour.WATER);
        Flow flow = raw.flow().map(f -> f.resolve(Flow.defaults(behaviour))).orElse(Flow.defaults(behaviour));
        FluidDefinition def = new FluidDefinition(behaviour, flow, raw.light().orElse(behaviour.defaultLight()), raw.tint(),
                raw.explosionResistance().orElse(FluidDefinition.DEFAULT_EXPLOSION_RESISTANCE), inside, events);
        return new ParseResult<>(Optional.of(def), List.copyOf(errors), List.copyOf(warnings));
    }
}
