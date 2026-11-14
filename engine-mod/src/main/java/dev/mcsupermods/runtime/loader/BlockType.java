package dev.mcsupermods.runtime.loader;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.TAG_ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.context;
import static dev.mcsupermods.runtime.loader.MsmCodecs.floatRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.DynamicOps;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.MapLike;
import com.mojang.serialization.RecordBuilder;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;
import net.minecraft.resources.Identifier;

/**
 * The kind of block ({@code ::msm::definition::BlockType}, ADR 0067 D1, ADR 0068 D1): the definition's {@code type},
 * absent meaning {@link #BLOCK}. Each type owns its own top-level fields ({@code msm:block_type} dispatch, ADR 0067 D2,
 * ADR 0068 D3, D4, D6), closed per type: a field of another type is an error naming the field. The component table of
 * ADR 0067 D3 is data here ({@link #allows}).
 */
public enum BlockType {
    BLOCK("block", List.of()),
    PILLAR("pillar", List.of()),
    HORIZONTAL("horizontal", List.of()),
    DIRECTIONAL("directional", List.of()),
    SLAB("slab", List.of()),
    STAIRS("stairs", List.of("base_block")),
    WALL("wall", List.of()),
    FENCE("fence", List.of()),
    FENCE_GATE("fence_gate", List.of("wood_type")),
    DOOR("door", List.of("set_type")),
    TRAPDOOR("trapdoor", List.of("set_type")),
    BUTTON("button", List.of("set_type", "press_ticks")),
    PRESSURE_PLATE("pressure_plate", List.of("set_type", "weighted_max")),
    PANE("pane", List.of()),
    CROP("crop", List.of("max_age", "stage_heights", "soil", "bonemeal_growth")),
    SAPLING("sapling", List.of("tree", "mega_tree", "flower_tree", "soil")),
    LEAVES("leaves", List.of("tint", "particle_chance", "falling_particle"));

    /**
     * Components allowed only on {@link #BLOCK}, {@link #PILLAR}, {@link #HORIZONTAL} and {@link #DIRECTIONAL} (ADR 0067 D3;
     * {@code msm:container}, ADR 0074 D1: only the {@code MsmBlock} family can carry a block entity).
     */
    public static final List<String> SHAPED_ONLY_COMPONENTS = List.of("msm:shape", "msm:redstone", "msm:container");

    /** Every type's own top-level field names, in a stable order; the definition's known top-level keys include these. */
    public static final List<String> ALL_FIELDS;

    static {
        LinkedHashSet<String> all = new LinkedHashSet<>();
        for (BlockType t : values()) {
            all.addAll(t.fields);
        }
        ALL_FIELDS = List.copyOf(all);
    }

    public static final Codec<BlockType> CODEC = MsmCodecs.named("block type", values(), BlockType::id);

    private final String id;
    private final List<String> fields;

    BlockType(String id, List<String> fields) {
        this.id = id;
        this.fields = fields;
    }

    /** The name in the definition, such as {@code fence_gate}. */
    public String id() {
        return id;
    }

    /** This type's own top-level fields. */
    public List<String> fields() {
        return fields;
    }

    /** Whether this type keeps a fixed or rotating shape and its own {@code powered} state (ADR 0067 D3). */
    public boolean shaped() {
        return this == BLOCK || this == PILLAR || this == HORIZONTAL || this == DIRECTIONAL;
    }

    /**
     * Whether a block of this type may carry the component {@code key} (ADR 0067 D3): {@code msm:shape},
     * {@code msm:redstone} and {@code msm:container} (ADR 0074 D1) only on the {@link #shaped()} types; every other component (breaking, light, triggers,
     * {@code msm:flammable}, {@code msm:strippable}) on every type.
     */
    public boolean allows(String key) {
        return shaped() || !SHAPED_ONLY_COMPONENTS.contains(key);
    }

    /** The per-type fields of one definition; {@link None} for a type without fields of its own. */
    public sealed interface Fields permits None, Stairs, FenceGate, Opening, Button, PressurePlate, Crop, Sapling, Leaves {}

    /** A type with no fields of its own. */
    public record None() implements Fields {
        public static final None INSTANCE = new None();
    }

    /** Stairs: the block they copy, registered before them (ADR 0067 D2, D4); default {@code minecraft:stone}. */
    public record Stairs(Identifier baseBlock) implements Fields {
        public static final Identifier DEFAULT_BASE = Identifier.withDefaultNamespace("stone");
        static final MapCodec<Stairs> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                optional("base_block", ID, DEFAULT_BASE).forGetter(Stairs::baseBlock)).apply(i, Stairs::new));
    }

    /** A fence gate: the vanilla wood type whose sounds it plays. */
    public record FenceGate(WoodKind woodType) implements Fields {
        static final MapCodec<FenceGate> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                required("wood_type", WoodKind.CODEC).forGetter(FenceGate::woodType)).apply(i, FenceGate::new));
    }

    /** A door or trapdoor: the vanilla set type. */
    public record Opening(SetType setType) implements Fields {
        static final MapCodec<Opening> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                required("set_type", SetType.CODEC).forGetter(Opening::setType)).apply(i, Opening::new));
    }

    /**
     * A button.
     *
     * @param pressTicksSetting {@code press_ticks} as written; {@link #pressTicks()} applies the default
     */
    public record Button(SetType setType, Optional<Integer> pressTicksSetting) implements Fields {
        static final MapCodec<Button> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                required("set_type", SetType.CODEC).forGetter(Button::setType),
                optional("press_ticks", intRange(1, 200)).forGetter(Button::pressTicksSetting)).apply(i, Button::new));

        /** Ticks the button stays pressed: as written, else 30 for the wooden set types and 20 otherwise, as vanilla. */
        public int pressTicks() {
            return pressTicksSetting.orElse(setType.wooden() ? 30 : 20);
        }
    }

    /**
     * A pressure plate.
     *
     * @param weightedMax present: a weighted plate whose signal grows with the entity count up to this; absent: an
     *     ordinary plate
     */
    public record PressurePlate(SetType setType, Optional<Integer> weightedMax) implements Fields {
        static final MapCodec<PressurePlate> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                required("set_type", SetType.CODEC).forGetter(PressurePlate::setType),
                optional("weighted_max", intAtLeast(1)).forGetter(PressurePlate::weightedMax)).apply(i, PressurePlate::new));
    }

    /**
     * A crop (ADR 0068 D3).
     *
     * @param stageHeightsSetting {@code stage_heights} as written; its length is not checked here (the validators
     *     report a length other than {@code max_age + 1}); {@link #defaultStageHeight} gives vanilla's ramp
     * @param soil the block tag the crop is planted on, without {@code #}
     */
    public record Crop(int maxAge, Optional<List<Integer>> stageHeightsSetting, Identifier soil, BonemealGrowth bonemealGrowth)
            implements Fields {
        public static final int DEFAULT_MAX_AGE = 7;
        public static final Identifier DEFAULT_SOIL = Identifier.withDefaultNamespace("supports_crops");
        static final MapCodec<Crop> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                optional("max_age", intRange(1, 15), DEFAULT_MAX_AGE).forGetter(Crop::maxAge),
                optional("stage_heights", intRange(1, 16).listOf()).forGetter(Crop::stageHeightsSetting),
                optional("soil", TAG_ID, DEFAULT_SOIL).forGetter(Crop::soil),
                optional("bonemeal_growth", BonemealGrowth.CODEC, BonemealGrowth.DEFAULT).forGetter(Crop::bonemealGrowth))
                .apply(i, Crop::new));

        /** Vanilla's ramp: {@code 2 + 2 * stage * 7 / maxAge} pixels, rounded (16 at the last stage). */
        public static int defaultStageHeight(int stage, int maxAge) {
            return (int) Math.round(2 + 14.0 * stage / maxAge);
        }
    }

    /** Stages added by bone meal, picked from {@code min} to {@code max}; default vanilla's 2 to 5. */
    public record BonemealGrowth(int min, int max) {
        public static final BonemealGrowth DEFAULT = new BonemealGrowth(2, 5);
        static final Codec<BonemealGrowth> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                required("min", intRange(0, 15)).forGetter(BonemealGrowth::min),
                required("max", intRange(0, 15)).forGetter(BonemealGrowth::max)).apply(i, BonemealGrowth::new)), List.of("min", "max"));
    }

    /**
     * A sapling (ADR 0068 D4): configured feature ids, looked up when it grows.
     *
     * @param flowerTreeSetting {@code flower_tree} as written; {@link #flowerTree()} defaults to {@code tree}
     * @param soil the block tag the sapling is planted on, without {@code #}
     */
    public record Sapling(Identifier tree, Optional<Identifier> megaTree, Optional<Identifier> flowerTreeSetting, Identifier soil)
            implements Fields {
        public static final Identifier DEFAULT_SOIL = Identifier.withDefaultNamespace("supports_vegetation");
        static final MapCodec<Sapling> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                required("tree", ID).forGetter(Sapling::tree),
                optional("mega_tree", ID).forGetter(Sapling::megaTree),
                optional("flower_tree", ID).forGetter(Sapling::flowerTreeSetting),
                optional("soil", TAG_ID, DEFAULT_SOIL).forGetter(Sapling::soil)).apply(i, Sapling::new));

        /** The tree grown when flowers are near: {@code flower_tree}, else {@code tree}. */
        public Identifier flowerTree() {
            return flowerTreeSetting.orElse(tree);
        }
    }

    /**
     * Leaves (ADR 0068 D6).
     *
     * @param tint absent: no tint, the texture's own colours
     * @param fallingParticle the falling leaf particle of untinted leaves; absent means none
     */
    public record Leaves(Optional<Tint> tint, float particleChance, Optional<Identifier> fallingParticle) implements Fields {
        public static final float DEFAULT_PARTICLE_CHANCE = 0.01f;
        static final MapCodec<Leaves> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                optional("tint", Tint.CODEC).forGetter(Leaves::tint),
                optional("particle_chance", floatRange(0, 1), DEFAULT_PARTICLE_CHANCE).forGetter(Leaves::particleChance),
                optional("falling_particle", ID).forGetter(Leaves::fallingParticle)).apply(i, Leaves::new));
    }

    /** A leaf tint: a vanilla biome colour source or a constant RGB colour ({@code LeavesTintSource | int @ 0..16777215}). */
    public sealed interface Tint permits SourceTint, ColourTint {
        Codec<Tint> CODEC = MsmCodecs.nameOrObject(SourceTint.class,
                TintSource.CODEC.xmap(SourceTint::new, SourceTint::source),
                intRange(0, 0xFFFFFF).xmap(ColourTint::new, ColourTint::rgb));
    }

    /** A tint from the biome's colours. */
    public record SourceTint(TintSource source) implements Tint {}

    /** A constant RGB tint. */
    public record ColourTint(int rgb) implements Tint {}

    /** {@code ::msm::definition::LeavesTintSource}. */
    public enum TintSource {
        FOLIAGE("foliage"),
        GRASS("grass"),
        DRY_FOLIAGE("dry_foliage");

        public static final Codec<TintSource> CODEC = MsmCodecs.named("tint source", values(), TintSource::id);
        private final String id;

        TintSource(String id) {
            this.id = id;
        }

        public String id() {
            return id;
        }
    }

    /**
     * A vanilla block set type by its MSM name ({@code ::msm::definition::BlockSetType}, ADR 0067 D2). The Java constant
     * is a version seam (ADR 0067 D9); this enum is only the name.
     */
    public enum SetType {
        WOOD("wood", true),
        CHERRY("cherry", true),
        BAMBOO("bamboo", true),
        CRIMSON("crimson", true),
        WARPED("warped", true),
        IRON("iron", false),
        COPPER("copper", false),
        GOLD("gold", false),
        STONE("stone", false),
        POLISHED_BLACKSTONE("polished_blackstone", false);

        public static final Codec<SetType> CODEC = MsmCodecs.named("set type", values(), SetType::id);
        private final String id;
        private final boolean wooden;

        SetType(String id, boolean wooden) {
            this.id = id;
            this.wooden = wooden;
        }

        public String id() {
            return id;
        }

        /** One of the wooden set types (buttons stay pressed 30 ticks and arrows press them). */
        public boolean wooden() {
            return wooden;
        }
    }

    /**
     * A vanilla wood type by name ({@code ::msm::definition::WoodType}, ADR 0067 D2); the vanilla {@code WoodType}
     * constants have the same names on both targets.
     */
    public enum WoodKind {
        OAK("oak"),
        SPRUCE("spruce"),
        BIRCH("birch"),
        ACACIA("acacia"),
        CHERRY("cherry"),
        JUNGLE("jungle"),
        DARK_OAK("dark_oak"),
        PALE_OAK("pale_oak"),
        POPLAR("poplar"),
        CRIMSON("crimson"),
        WARPED("warped"),
        MANGROVE("mangrove"),
        BAMBOO("bamboo");

        public static final Codec<WoodKind> CODEC = MsmCodecs.named("wood type", values(), WoodKind::id);
        private final String id;

        WoodKind(String id) {
            this.id = id;
        }

        public String id() {
            return id;
        }
    }

    /** A type with its fields, as decoded from the top level of a definition. */
    public record Spec(BlockType type, Fields fields) {
        public static final Spec DEFAULT = new Spec(BLOCK, None.INSTANCE);
    }

    /** The decoder of this type's own fields. */
    @SuppressWarnings("unchecked")
    private MapCodec<Fields> fieldsCodec() {
        MapCodec<? extends Fields> codec = switch (this) {
            case STAIRS -> Stairs.CODEC;
            case FENCE_GATE -> FenceGate.CODEC;
            case DOOR, TRAPDOOR -> Opening.CODEC;
            case BUTTON -> Button.CODEC;
            case PRESSURE_PLATE -> PressurePlate.CODEC;
            case CROP -> Crop.CODEC;
            case SAPLING -> Sapling.CODEC;
            case LEAVES -> Leaves.CODEC;
            case BLOCK, PILLAR, HORIZONTAL, DIRECTIONAL, SLAB, WALL, FENCE, PANE -> MapCodec.unit(None.INSTANCE);
        };
        return (MapCodec<Fields>) codec;
    }

    /**
     * {@code type} and the fields it selects, read from the definition's top level. A field that belongs to another
     * type is an error naming the field (the dispatch struct is closed); other unknown top-level keys are left to the
     * parser, which warns about them as before.
     */
    public static final MapCodec<Spec> SPEC_CODEC = new MapCodec<>() {
        @Override
        public <T> Stream<T> keys(DynamicOps<T> ops) {
            return Stream.concat(Stream.of("type"), ALL_FIELDS.stream()).map(ops::createString);
        }

        @Override
        public <T> DataResult<Spec> decode(DynamicOps<T> ops, MapLike<T> input) {
            BlockType type = BLOCK;
            T typeValue = input.get("type");
            if (typeValue != null) {
                DataResult<BlockType> decoded = context("type", CODEC).parse(ops, typeValue);
                if (decoded.error().isPresent()) {
                    String message = decoded.error().get().message();
                    return DataResult.error(() -> message);
                }
                type = decoded.getOrThrow();
            }
            List<String> foreign = new ArrayList<>();
            for (String key : ALL_FIELDS) {
                if (!type.fields.contains(key) && input.get(key) != null) {
                    foreign.add(key);
                }
            }
            if (!foreign.isEmpty()) {
                BlockType t = type;
                String expected = t.fields.isEmpty() ? "it has no fields of its own" : "its fields are " + String.join(", ", t.fields);
                return DataResult.error(() -> String.join(", ", foreign) + ": unknown field for type '" + t.id + "' (" + expected + ")");
            }
            BlockType t = type;
            return t.fieldsCodec().decode(ops, input).map(fields -> new Spec(t, fields));
        }

        @Override
        public <T> RecordBuilder<T> encode(Spec input, DynamicOps<T> ops, RecordBuilder<T> prefix) {
            RecordBuilder<T> builder = input.type() == BLOCK ? prefix : prefix.add("type", ops.createString(input.type().id));
            return input.type().fieldsCodec().encode(input.fields(), ops, builder);
        }

        @Override
        public String toString() {
            return "BlockType.Spec";
        }
    };
}
