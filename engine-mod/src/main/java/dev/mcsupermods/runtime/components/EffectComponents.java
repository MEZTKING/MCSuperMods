package dev.mcsupermods.runtime.components;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;
import net.minecraft.resources.Identifier;

/**
 * Mob effect components ({@code ::msm::definition::EffectComponents}, ADR 0055 D2): events fired when the effect
 * starts on an entity, at an interval while it is active, and when it is removed or runs out.
 */
public record EffectComponents(Optional<OnStart> onStart, Optional<OnTick> onTick, Optional<OnEnd> onEnd) {
    public static final List<String> KEYS = List.of("msm:on_start", "msm:on_tick", "msm:on_end");
    public static final EffectComponents NONE = new EffectComponents(Optional.empty(), Optional.empty(), Optional.empty());

    public static final Codec<EffectComponents> CODEC = RecordCodecBuilder.create(i -> i.group(
            optional("msm:on_start", OnStart.CODEC).forGetter(EffectComponents::onStart),
            optional("msm:on_tick", OnTick.CODEC).forGetter(EffectComponents::onTick),
            optional("msm:on_end", OnEnd.CODEC).forGetter(EffectComponents::onEnd)).apply(i, EffectComponents::new));

    /** Every event id a component names, with the component for messages. */
    public Stream<String[]> eventReferences() {
        return Stream.of(
                onStart.map(c -> new String[] {"msm:on_start", c.event().toString()}),
                onTick.map(c -> new String[] {"msm:on_tick", c.event().toString()}),
                onEnd.map(c -> new String[] {"msm:on_end", c.event().toString()})).flatMap(Optional::stream);
    }

    /** Fires {@code event} once when the effect starts on an entity. */
    public record OnStart(Identifier event) {
        public static final Codec<OnStart> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("event", ID).forGetter(OnStart::event)).apply(i, OnStart::new));
    }

    /**
     * Fires {@code event} every {@code interval_ticks} (default 20) while the effect is active; with
     * {@code faster_per_level} the interval is divided by the level ({@code amplifier + 1}), at least 1.
     */
    public record OnTick(Identifier event, int intervalTicks, boolean fasterPerLevel) {
        public static final int DEFAULT_INTERVAL = 20;

        public static final Codec<OnTick> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("event", ID).forGetter(OnTick::event),
                optional("interval_ticks", intAtLeast(1), DEFAULT_INTERVAL).forGetter(OnTick::intervalTicks),
                optional("faster_per_level", Codec.BOOL, false).forGetter(OnTick::fasterPerLevel)).apply(i, OnTick::new));

        /** The ticks between two firings at {@code amplifier} (ADR 0055 D3): {@code max(1, interval / level)}. */
        public int interval(int amplifier) {
            if (!fasterPerLevel) {
                return intervalTicks;
            }
            return Math.max(1, intervalTicks / (Math.max(0, amplifier) + 1));
        }
    }

    /** Fires {@code event} when the effect is removed from an entity or runs out. */
    public record OnEnd(Identifier event) {
        public static final Codec<OnEnd> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("event", ID).forGetter(OnEnd::event)).apply(i, OnEnd::new));
    }
}
