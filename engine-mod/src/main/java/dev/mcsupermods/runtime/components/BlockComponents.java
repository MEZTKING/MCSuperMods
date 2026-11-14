package dev.mcsupermods.runtime.components;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.floatAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.floatRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import dev.mcsupermods.runtime.loader.MsmCodecs;
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
        Optional<Redstone> redstone,
        Optional<Shape> shape,
        Optional<OnBreak> onBreak,
        Optional<OnPlace> onPlace,
        Optional<OnRandomTick> onRandomTick,
        Optional<OnEntityInside> onEntityInside) {

    public static final List<String> KEYS = List.of("msm:breakable", "msm:light_emitter", "msm:on_interact", "msm:on_step", "msm:redstone",
            "msm:shape", "msm:on_break", "msm:on_place", "msm:on_random_tick", "msm:on_entity_inside");
    public static final BlockComponents NONE = new BlockComponents(Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(),
            Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty());

    public static final Codec<BlockComponents> CODEC = RecordCodecBuilder.create(i -> i.group(
            optional("msm:breakable", Breakable.CODEC).forGetter(BlockComponents::breakable),
            optional("msm:light_emitter", LightEmitter.CODEC).forGetter(BlockComponents::lightEmitter),
            optional("msm:on_interact", OnInteract.CODEC).forGetter(BlockComponents::onInteract),
            optional("msm:on_step", OnStep.CODEC).forGetter(BlockComponents::onStep),
            optional("msm:redstone", Redstone.CODEC).forGetter(BlockComponents::redstone),
            optional("msm:shape", Shape.CODEC).forGetter(BlockComponents::shape),
            optional("msm:on_break", OnBreak.CODEC).forGetter(BlockComponents::onBreak),
            optional("msm:on_place", OnPlace.CODEC).forGetter(BlockComponents::onPlace),
            optional("msm:on_random_tick", OnRandomTick.CODEC).forGetter(BlockComponents::onRandomTick),
            optional("msm:on_entity_inside", OnEntityInside.CODEC).forGetter(BlockComponents::onEntityInside))
            .apply(i, BlockComponents::new));

    /** Every event id a component names, with the component for messages. */
    public Stream<String[]> eventReferences() {
        Stream.Builder<String[]> out = Stream.builder();
        onInteract.ifPresent(c -> out.add(new String[] {"msm:on_interact", c.event().toString()}));
        onStep.ifPresent(c -> out.add(new String[] {"msm:on_step", c.event().toString()}));
        redstone.ifPresent(c -> {
            c.onPowered().ifPresent(e -> out.add(new String[] {"msm:redstone.on_powered", e.toString()}));
            c.onUnpowered().ifPresent(e -> out.add(new String[] {"msm:redstone.on_unpowered", e.toString()}));
        });
        onBreak.ifPresent(c -> out.add(new String[] {"msm:on_break", c.event().toString()}));
        onPlace.ifPresent(c -> out.add(new String[] {"msm:on_place", c.event().toString()}));
        onRandomTick.ifPresent(c -> out.add(new String[] {"msm:on_random_tick", c.event().toString()}));
        onEntityInside.ifPresent(c -> out.add(new String[] {"msm:on_entity_inside", c.event().toString()}));
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

    /** Fires an event when a player is about to break the block ({@code playerWillDestroy}, ADR 0061 D2), in any game mode. */
    public record OnBreak(Identifier event) {
        public static final Codec<OnBreak> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                required("event", ID).forGetter(OnBreak::event)).apply(i, OnBreak::new)), List.of("event"));
    }

    /** Fires an event when the block is placed ({@code setPlacedBy}, ADR 0061 D2); the placer, when there is one, is self. */
    public record OnPlace(Identifier event) {
        public static final Codec<OnPlace> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                required("event", ID).forGetter(OnPlace::event)).apply(i, OnPlace::new)), List.of("event"));
    }

    /**
     * Fires an event on a random tick with probability {@code chance} (ADR 0061 D2); the block gets random ticks only
     * with this component.
     */
    public record OnRandomTick(Identifier event, float chance) {
        public static final Codec<OnRandomTick> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                required("event", ID).forGetter(OnRandomTick::event),
                optional("chance", floatRange(0, 1), 1.0f).forGetter(OnRandomTick::chance)).apply(i, OnRandomTick::new)),
                List.of("event", "chance"));
    }

    /** Fires an event while an entity is inside the block, at most once per {@code cooldown_ticks} per entity (ADR 0061 D2). */
    public record OnEntityInside(Identifier event, int cooldownTicks) {
        public static final Codec<OnEntityInside> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                required("event", ID).forGetter(OnEntityInside::event),
                optional("cooldown_ticks", intAtLeast(5), 20).forGetter(OnEntityInside::cooldownTicks)).apply(i, OnEntityInside::new)),
                List.of("event", "cooldown_ticks"));
    }

    /** Constant signal source ({@code emit}) and events on neighbour-update power transitions. */
    public record Redstone(int emit, Optional<Identifier> onPowered, Optional<Identifier> onUnpowered) {
        public static final Codec<Redstone> CODEC = RecordCodecBuilder.create(i -> i.group(
                optional("emit", intRange(0, 15), 0).forGetter(Redstone::emit),
                optional("on_powered", ID).forGetter(Redstone::onPowered),
                optional("on_unpowered", ID).forGetter(Redstone::onUnpowered)).apply(i, Redstone::new));
    }

    /**
     * Outline and collision shape (ADR 0059 D1, {@code ::msm::definition::Shape}): pixel boxes
     * {@code [x1, y1, z1, x2, y2, z2]} from 0 to 16 (1 to 16 boxes), {@code collision} (default true) and
     * {@code see_through}. The struct is closed: the editor-only {@code preset} is an error here.
     *
     * @param boxes the boxes; empty means the full cube
     * @param seeThroughSetting {@code see_through} as written; {@link #seeThrough()} applies the default
     */
    public record Shape(Optional<List<List<Float>>> boxes, boolean collision, Optional<Boolean> seeThroughSetting) {
        public static final List<String> KEYS = List.of("boxes", "collision", "see_through");
        public static final List<Float> FULL_CUBE = List.of(0f, 0f, 0f, 16f, 16f, 16f);

        private static final Codec<List<Float>> BOX = floatRange(0, 16).listOf().validate(box -> box.size() == 6
                ? DataResult.success(box)
                : DataResult.error(() -> "a box has 6 numbers [x1, y1, z1, x2, y2, z2], not " + box.size()));
        private static final Codec<List<List<Float>>> BOXES = BOX.listOf().validate(list -> !list.isEmpty() && list.size() <= 16
                ? DataResult.success(list)
                : DataResult.error(() -> "expected 1 to 16 boxes, not " + list.size()));

        public static final Codec<Shape> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                optional("boxes", BOXES).forGetter(Shape::boxes),
                optional("collision", Codec.BOOL, true).forGetter(Shape::collision),
                optional("see_through", Codec.BOOL).forGetter(Shape::seeThroughSetting)).apply(i, Shape::new)), KEYS);

        /** The boxes to build, the full cube when {@code boxes} is absent. */
        public List<List<Float>> boxesOrFullCube() {
            return boxes.orElse(List.of(FULL_CUBE));
        }

        /**
         * Whether the block is see-through: {@code see_through} when written, else true when {@code boxes} is
         * present and is not the single full cube (the plugin's {@code isSeeThroughBlock} rule).
         */
        public boolean seeThrough() {
            return seeThroughSetting.orElseGet(() -> boxes.isPresent()
                    && !(boxes.get().size() == 1 && isFullCube(boxes.get().getFirst())));
        }

        /** Numeric comparison, so {@code -0} counts as {@code 0} as in TypeScript. */
        private static boolean isFullCube(List<Float> box) {
            for (int n = 0; n < 6; n++) {
                if (box.get(n).floatValue() != FULL_CUBE.get(n).floatValue()) {
                    return false;
                }
            }
            return true;
        }
    }
}
