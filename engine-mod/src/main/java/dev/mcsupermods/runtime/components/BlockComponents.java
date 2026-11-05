package dev.mcsupermods.runtime.components;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.floatAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;
import net.minecraft.resources.Identifier;

/** Runtime block components ({@code ::msm::definition::BlockComponents}). */
public record BlockComponents(
        Optional<Breakable> breakable,
        Optional<LightEmitter> lightEmitter,
        Optional<OnInteract> onInteract,
        Optional<OnStep> onStep,
        Optional<Redstone> redstone) {

    public static final List<String> KEYS = List.of("msm:breakable", "msm:light_emitter", "msm:on_interact", "msm:on_step", "msm:redstone");
    public static final BlockComponents NONE = new BlockComponents(Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty());

    public static final Codec<BlockComponents> CODEC = RecordCodecBuilder.create(i -> i.group(
            optional("msm:breakable", Breakable.CODEC).forGetter(BlockComponents::breakable),
            optional("msm:light_emitter", LightEmitter.CODEC).forGetter(BlockComponents::lightEmitter),
            optional("msm:on_interact", OnInteract.CODEC).forGetter(BlockComponents::onInteract),
            optional("msm:on_step", OnStep.CODEC).forGetter(BlockComponents::onStep),
            optional("msm:redstone", Redstone.CODEC).forGetter(BlockComponents::redstone)).apply(i, BlockComponents::new));

    /** Every event id a component names, with the component for messages. */
    public Stream<String[]> eventReferences() {
        Stream.Builder<String[]> out = Stream.builder();
        onInteract.ifPresent(c -> out.add(new String[] {"msm:on_interact", c.event().toString()}));
        onStep.ifPresent(c -> out.add(new String[] {"msm:on_step", c.event().toString()}));
        redstone.ifPresent(c -> {
            c.onPowered().ifPresent(e -> out.add(new String[] {"msm:redstone.on_powered", e.toString()}));
            c.onUnpowered().ifPresent(e -> out.add(new String[] {"msm:redstone.on_unpowered", e.toString()}));
        });
        return out.build();
    }

    /** Whether the block tracks its powered state (it has {@code on_powered} or {@code on_unpowered}). */
    public boolean reactsToRedstone() {
        return redstone.map(r -> r.onPowered().isPresent() || r.onUnpowered().isPresent()).orElse(false);
    }

    /** Constant signal strength, 0 when absent. */
    public int emit() {
        return redstone.map(Redstone::emit).orElse(0);
    }

    /** How hard the block is to break; absent means hardness 1.5, resistance 6 and no tool needed. */
    public record Breakable(float hardness, float resistance, boolean requiresTool) {
        public static final Breakable DEFAULT = new Breakable(1.5f, 6.0f, false);
        public static final Codec<Breakable> CODEC = RecordCodecBuilder.create(i -> i.group(
                optional("hardness", floatAtLeast(-1), 1.5f).forGetter(Breakable::hardness),
                optional("resistance", floatAtLeast(0), 6.0f).forGetter(Breakable::resistance),
                optional("requires_tool", Codec.BOOL, false).forGetter(Breakable::requiresTool)).apply(i, Breakable::new));
    }

    /** Light level 0 to 15. */
    public record LightEmitter(int level) {
        public static final Codec<LightEmitter> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("level", intRange(0, 15)).forGetter(LightEmitter::level)).apply(i, LightEmitter::new));
    }

    /** Fires an event when a player uses the block. */
    public record OnInteract(Identifier event) {
        public static final Codec<OnInteract> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("event", ID).forGetter(OnInteract::event)).apply(i, OnInteract::new));
    }

    /** Fires an event when an entity steps on the block, at most once per {@code cooldownTicks} per entity. */
    public record OnStep(Identifier event, int cooldownTicks) {
        public static final Codec<OnStep> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("event", ID).forGetter(OnStep::event),
                optional("cooldown_ticks", intAtLeast(0), 0).forGetter(OnStep::cooldownTicks)).apply(i, OnStep::new));
    }

    /** Constant signal source ({@code emit}) and events on neighbour-update power transitions. */
    public record Redstone(int emit, Optional<Identifier> onPowered, Optional<Identifier> onUnpowered) {
        public static final Codec<Redstone> CODEC = RecordCodecBuilder.create(i -> i.group(
                optional("emit", intRange(0, 15), 0).forGetter(Redstone::emit),
                optional("on_powered", ID).forGetter(Redstone::onPowered),
                optional("on_unpowered", ID).forGetter(Redstone::onUnpowered)).apply(i, Redstone::new));
    }
}
