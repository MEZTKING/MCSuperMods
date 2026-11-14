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
    LEAVES("leaves", List.of("tint", "particle_chance", "falling_particle")),
    PORTAL("portal", List.of("frame", "frame_block", "igniter", "destination", "return_to", "travel", "sounds", "particles", "on_travel"));

    /**
     * Components allowed only on {@link #BLOCK}, {@link #PILLAR}, {@link #HORIZONTAL} and {@link #DIRECTIONAL} (ADR 0067 D3;
     * {@code msm:container}, ADR 0074 D1, and {@code msm:machine}, ADR 0075 D1: only the {@code MsmBlock} family can carry
     * a block entity).
     */
    public static final List<String> SHAPED_ONLY_COMPONENTS = List.of("msm:shape", "msm:redstone", "msm:container", "msm:machine");

    /**
     * The only components a {@link #PORTAL} may carry (ADR 0077 D1); any other is an error and is not applied. The
     * plugin's {@code PORTAL_COMPONENTS} lists the same keys.
     */
    public static final List<String> PORTAL_COMPONENTS = List.of("msm:breakable", "msm:light_emitter", "msm:on_break", "msm:on_place",
            "msm:on_random_tick", "msm:on_entity_inside");

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
     * {@code msm:redstone}, {@code msm:container} (ADR 0074 D1) and {@code msm:machine} (ADR 0075 D1) only on the {@link #shaped()} types; every other component (breaking, light, triggers,
     * {@code msm:flammable}, {@code msm:strippable}) on every type but {@link #PORTAL}, which allows only
     * {@link #PORTAL_COMPONENTS} (ADR 0077 D1).
     */
    public boolean allows(String key) {
        if (this == PORTAL) {
            return PORTAL_COMPONENTS.contains(key);
        }
        return shaped() || !SHAPED_ONLY_COMPONENTS.contains(key);
    }

    /** The per-type fields of one definition; {@link None} for a type without fields of its own. */
    public sealed interface Fields permits None, Stairs, FenceGate, Opening, Button, PressurePlate, Crop, Sapling, Leaves, Portal {}

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

    /**
     * A block id or a {@code #}-prefixed tag ({@code #[id="block"] string | #[id(registry=..., tags="required")] string}).
     *
     * @param id the block or item id, or the tag id without {@code #}
     * @param tag whether {@code id} names a tag
     */
    public record IdOrTag(Identifier id, boolean tag) {
        public static final Codec<IdOrTag> CODEC = MsmCodecs.ID_OR_TAG.xmap(
                s -> s.startsWith("#") ? new IdOrTag(Identifier.parse(s.substring(1)), true) : new IdOrTag(Identifier.parse(s), false),
                IdOrTag::toString);

        @Override
        public String toString() {
            return tag ? "#" + id : id.toString();
        }
    }

    /**
     * A portal (ADR 0077 D1): the frame rule's frame, the igniter, the two dimensions and the looks.
     *
     * @param frame the frame block or block tag, read at use time (tags reload with {@code /reload})
     * @param frameBlockSetting {@code frame_block} as written; {@link #frameBlock()} applies the default
     * @param igniter the item or item tag that lights the frame; empty for {@code igniter: false} (only the
     *     {@code light_portal} action lights it); default {@code minecraft:flint_and_steel}
     * @param destination the dimension the portal leads to
     * @param returnTo the dimension a portal in {@code destination} leads back to; default {@code minecraft:overworld}
     * @param onTravel the event fired after arrival, with the traveller as self and other (B336)
     */
    public record Portal(IdOrTag frame, Optional<Identifier> frameBlockSetting, Optional<IdOrTag> igniter, Identifier destination,
            Identifier returnTo, PortalTravel travel, PortalSounds sounds, PortalParticles particles, Optional<Identifier> onTravel)
            implements Fields {
        public static final IdOrTag DEFAULT_IGNITER = new IdOrTag(Identifier.withDefaultNamespace("flint_and_steel"), false);
        public static final Identifier DEFAULT_RETURN_TO = Identifier.withDefaultNamespace("overworld");

        /** {@code IgniterItem | #tag | false}: {@code false} is no igniter; {@code true} is an error. */
        private static final Codec<Optional<IdOrTag>> IGNITER = Codec.either(Codec.BOOL, IdOrTag.CODEC).comapFlatMap(
                either -> either.map(
                        b -> b ? DataResult.error(() -> "must be an item id, an item #tag or false") : DataResult.success(Optional.<IdOrTag>empty()),
                        ref -> DataResult.success(Optional.of(ref))),
                opt -> opt.<com.mojang.datafixers.util.Either<Boolean, IdOrTag>>map(com.mojang.datafixers.util.Either::right)
                        .orElse(com.mojang.datafixers.util.Either.left(false)));

        static final MapCodec<Portal> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                required("frame", IdOrTag.CODEC).forGetter(Portal::frame),
                optional("frame_block", ID).forGetter(Portal::frameBlockSetting),
                optional("igniter", IGNITER, Optional.of(DEFAULT_IGNITER)).forGetter(Portal::igniter),
                required("destination", ID).forGetter(Portal::destination),
                optional("return_to", ID, DEFAULT_RETURN_TO).forGetter(Portal::returnTo),
                optional("travel", PortalTravel.CODEC, PortalTravel.DEFAULT).forGetter(Portal::travel),
                optional("sounds", PortalSounds.CODEC, PortalSounds.DEFAULT).forGetter(Portal::sounds),
                optional("particles", PortalParticles.CODEC, PortalParticles.DEFAULT).forGetter(Portal::particles),
                optional("on_travel", ID).forGetter(Portal::onTravel)).apply(i, Portal::new));

        /**
         * The block exits are built of: {@code frame_block}, else the {@code frame} block; empty for a tag {@code frame}
         * without {@code frame_block} (a load error; exits then fall back to {@code surface} arrival, B336).
         */
        public Optional<Identifier> frameBlock() {
            return frameBlockSetting.isPresent() ? frameBlockSetting : frame.tag() ? Optional.empty() : Optional.of(frame.id());
        }
    }

    /** {@code ::msm::definition::PortalArrival}. */
    public enum PortalArrival {
        /** Find or build a linked exit portal (default). */
        PORTAL("portal"),
        /** Land on the first standing spot at the target column; build nothing. */
        SURFACE("surface");

        public static final Codec<PortalArrival> CODEC = MsmCodecs.named("arrival", values(), PortalArrival::id);
        private final String id;

        PortalArrival(String id) {
            this.id = id;
        }

        public String id() {
            return id;
        }
    }

    /**
     * {@code ::msm::definition::PortalTravel} (closed).
     *
     * @param scale the destination's scale against {@code return_to}; empty: from the two dimension types
     * @param delayTicks survival players' delay; empty: the gamerule {@code players_nether_portal_default_delay}
     * @param cooldownTicks the cooldown on the arrived entity; empty: vanilla's
     */
    public record PortalTravel(Optional<Double> scale, PortalArrival arrival, Optional<Integer> delayTicks, Optional<Integer> cooldownTicks,
            boolean playersOnly, boolean overlay) {
        public static final PortalTravel DEFAULT = new PortalTravel(Optional.empty(), PortalArrival.PORTAL, Optional.empty(), Optional.empty(),
                false, true);
        public static final List<String> KEYS = List.of("scale", "arrival", "delay_ticks", "cooldown_ticks", "players_only", "overlay");
        public static final double MIN_SCALE = 0.00001;
        public static final double MAX_SCALE = 30000000;
        private static final Codec<Double> SCALE = Codec.DOUBLE.validate(d -> d >= MIN_SCALE && d <= MAX_SCALE && Double.isFinite(d)
                ? DataResult.success(d)
                : DataResult.error(() -> "out of range: " + d + " (expected " + MIN_SCALE + ".." + (long) MAX_SCALE + ")"));
        static final Codec<PortalTravel> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                optional("scale", SCALE).forGetter(PortalTravel::scale),
                optional("arrival", PortalArrival.CODEC, PortalArrival.PORTAL).forGetter(PortalTravel::arrival),
                optional("delay_ticks", intRange(0, 32767)).forGetter(PortalTravel::delayTicks),
                optional("cooldown_ticks", intRange(0, 32767)).forGetter(PortalTravel::cooldownTicks),
                optional("players_only", Codec.BOOL, false).forGetter(PortalTravel::playersOnly),
                optional("overlay", Codec.BOOL, true).forGetter(PortalTravel::overlay)).apply(i, PortalTravel::new)), KEYS);
    }

    /**
     * A portal sound setting ({@code #[id="sound_event"] string | false}).
     *
     * @param off {@code false} was written: no sound
     * @param sound the sound event; empty with {@code off} false means the default sound
     */
    public record PortalSound(boolean off, Optional<Identifier> sound) {
        public static final PortalSound DEFAULT = new PortalSound(false, Optional.empty());
        public static final PortalSound OFF = new PortalSound(true, Optional.empty());
        static final Codec<PortalSound> CODEC = Codec.either(Codec.BOOL, ID).comapFlatMap(
                either -> either.map(
                        b -> b ? DataResult.error(() -> "must be a sound event id or false") : DataResult.success(OFF),
                        id -> DataResult.success(new PortalSound(false, Optional.of(id)))),
                s -> s.sound().<com.mojang.datafixers.util.Either<Boolean, Identifier>>map(com.mojang.datafixers.util.Either::right)
                        .orElse(com.mojang.datafixers.util.Either.left(false)));
    }

    /** {@code ::msm::definition::PortalSounds} (closed). */
    public record PortalSounds(PortalSound ambient, PortalSound travel) {
        public static final PortalSounds DEFAULT = new PortalSounds(PortalSound.DEFAULT, PortalSound.DEFAULT);
        public static final List<String> KEYS = List.of("ambient", "travel");
        static final Codec<PortalSounds> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                optional("ambient", PortalSound.CODEC, PortalSound.DEFAULT).forGetter(PortalSounds::ambient),
                optional("travel", PortalSound.CODEC, PortalSound.DEFAULT).forGetter(PortalSounds::travel)).apply(i, PortalSounds::new)), KEYS);
    }

    /**
     * {@code ::msm::definition::PortalParticles} (closed).
     *
     * @param type a particle type without options; empty: the target's portal particle
     * @param color set: coloured dust of this RGB colour instead of {@code type}
     * @param count particles per animation tick; 0 none
     */
    public record PortalParticles(Optional<Identifier> type, Optional<Integer> color, int count) {
        public static final int DEFAULT_COUNT = 4;
        public static final PortalParticles DEFAULT = new PortalParticles(Optional.empty(), Optional.empty(), DEFAULT_COUNT);
        public static final List<String> KEYS = List.of("type", "color", "count");
        static final Codec<PortalParticles> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                optional("type", ID).forGetter(PortalParticles::type),
                optional("color", intRange(0, 0xFFFFFF)).forGetter(PortalParticles::color),
                optional("count", intRange(0, 16), DEFAULT_COUNT).forGetter(PortalParticles::count)).apply(i, PortalParticles::new)), KEYS);
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
            case PORTAL -> Portal.CODEC;
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
            if (type == PORTAL) {
                // A portal is closed at the top level too (ADR 0077 D1): every runtime that reads the type knows all its
                // keys, so an editor-only field such as textures or an unknown key is an error, not a warning.
                List<String> unknown = input.entries()
                        .map(e -> ops.getStringValue(e.getFirst()).result().orElse(String.valueOf(e.getFirst())))
                        .filter(k -> !BlockDefinition.KEYS.contains(k))
                        .sorted()
                        .toList();
                if (!unknown.isEmpty()) {
                    return DataResult.error(() -> String.join(", ", unknown) + ": unknown field for type 'portal' (expected the block"
                            + " fields format, type, sound_type, loot_table, item, components, events and its own fields "
                            + String.join(", ", PORTAL.fields) + ")");
                }
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
