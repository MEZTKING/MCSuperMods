package dev.mcsupermods.runtime.loader.types;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.closed;
import static dev.mcsupermods.runtime.loader.MsmCodecs.floatRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.listOfLength;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.mcsupermods.runtime.loader.BlockType;
import dev.mcsupermods.runtime.loader.MsmCodecs;
import java.util.List;
import java.util.Optional;
import net.minecraft.resources.Identifier;

/**
 * The own fields of the growing, climbing and potted plant types {@code growing_plant}, {@code column_plant},
 * {@code multiface}, {@code dripleaf} and {@code flower_pot} (ADR 0103 D1, D2 and its amendment after the spike;
 * {@code ::msm::definition::GrowingPlantFields} and its siblings, B506). Defaults are the mcdoc's; the numbers marked
 * "verify at implementation" there are vanilla's as measured by B503. Each type is closed at the top level, as the types
 * of {@link PlantFields}. The rules the mcdoc cannot express ({@code grows_into} only with a small dripleaf,
 * {@code tilt_ticks} only with a big one, {@code min_height} not above {@code max_height}) refuse the file with an error
 * naming the field.
 */
public final class GrowingPlantFields {
    private GrowingPlantFields() {}

    /** {@code ::msm::definition::GrowthDirection}. */
    public enum GrowthDirection {
        UP("up"),
        DOWN("down");

        static final Codec<GrowthDirection> CODEC = MsmCodecs.named("growth direction", values(), GrowthDirection::id);

        private final String id;

        GrowthDirection(String id) {
            this.id = id;
        }

        public String id() {
            return id;
        }
    }

    /** {@code soil}: 1 to 16 block ids or {@code #}-prefixed block tags. */
    static final Codec<List<BlockType.IdOrTag>> SOIL = listOfLength(BlockType.IdOrTag.CODEC, 1, 16);

    /**
     * Berries on a growing plant (mcdoc {@code PlantBerries}), as cave vines bear glow berries.
     *
     * @param light light level of a block with berries; default 14, as cave vines (verify at implementation)
     */
    public record Berries(Identifier item, int light) {
        public static final int DEFAULT_LIGHT = 14;
        static final Codec<Berries> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("item", ID).forGetter(Berries::item),
                optional("light", intRange(0, 15), DEFAULT_LIGHT).forGetter(Berries::light)).apply(i, Berries::new)),
                List.of("item", "light"));
    }

    /**
     * A growing plant (ADR 0103 D1): the element is the tip, its strand the companion {@code <path>_plant}.
     *
     * @param maxAge the age a newly placed tip starts from, 0 to 25 (vanilla's fixed range; amendment after the spike)
     * @param bonemealGrowth blocks added per bone meal; empty: vanilla's for the strand shape
     * @param climbableSetting {@code climbable} as written; {@link #climbable()} applies the default
     * @param soil the blocks or tags the base needs; empty: any sturdy face, as vanilla's strands
     */
    public record GrowingPlant(GrowthDirection direction, int maxAge, float growthChance, Optional<BlockType.BonemealGrowth> bonemealGrowth,
            boolean needsWater, Optional<Berries> berries, Optional<Boolean> climbableSetting, Optional<List<BlockType.IdOrTag>> soil)
            implements BlockType.Extension {
        public static final int DEFAULT_MAX_AGE = 25;
        public static final float DEFAULT_GROWTH_CHANCE = 0.14f;
        static final MapCodec<GrowingPlant> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                optional("direction", GrowthDirection.CODEC, GrowthDirection.UP).forGetter(GrowingPlant::direction),
                optional("max_age", intRange(0, 25), DEFAULT_MAX_AGE).forGetter(GrowingPlant::maxAge),
                optional("growth_chance", floatRange(0, 1), DEFAULT_GROWTH_CHANCE).forGetter(GrowingPlant::growthChance),
                optional("bonemeal_growth", BlockType.BonemealGrowth.CODEC).forGetter(GrowingPlant::bonemealGrowth),
                optional("needs_water", Codec.BOOL, false).forGetter(GrowingPlant::needsWater),
                optional("berries", Berries.CODEC).forGetter(GrowingPlant::berries),
                optional("climbable", Codec.BOOL).forGetter(GrowingPlant::climbableSetting),
                optional("soil", SOIL).forGetter(GrowingPlant::soil)).apply(i, GrowingPlant::new));

        /** Whether entities climb the strand: as written, else true unless {@code needs_water} (kelp is not climbed). */
        public boolean climbable() {
            return climbableSetting.orElse(!needsWater);
        }
    }

    /** {@code ::msm::definition::ColumnPlantStyle}. */
    public enum ColumnPlantStyle {
        CANE("cane", 3),
        CACTUS("cactus", 3),
        BAMBOO("bamboo", 16);

        static final Codec<ColumnPlantStyle> CODEC = MsmCodecs.named("column plant style", values(), ColumnPlantStyle::id);

        private final String id;
        private final int defaultMaxHeight;

        ColumnPlantStyle(String id, int defaultMaxHeight) {
            this.id = id;
            this.defaultMaxHeight = defaultMaxHeight;
        }

        public String id() {
            return id;
        }

        /** Vanilla's height: 3 for sugar cane and cactus, 16 for bamboo (verify at implementation). */
        public int defaultMaxHeight() {
            return defaultMaxHeight;
        }
    }

    /**
     * A column plant (ADR 0103 D1).
     *
     * @param maxHeightSetting {@code max_height} as written; {@link #maxHeight()} applies the style's default
     * @param minHeightSetting {@code min_height} as written; {@link #minHeight()} applies the default
     * @param soil the blocks or tags the column stands on; empty: vanilla's tags for the style
     *     ({@code TargetFacts.blocks.plantSoils})
     * @param needsWaterNearbySetting {@code needs_water_nearby} as written; {@link #needsWaterNearby()} applies the default
     * @param touchDamageSetting {@code touch_damage} as written; {@link #touchDamage()} applies the default
     */
    public record ColumnPlant(ColumnPlantStyle style, Optional<Integer> maxHeightSetting, Optional<Integer> minHeightSetting,
            Optional<List<BlockType.IdOrTag>> soil, Optional<Boolean> needsWaterNearbySetting, Optional<Float> touchDamageSetting)
            implements BlockType.Extension {
        /** The lowest height a vanilla bamboo stalk stops at, as measured by B503 (verify at implementation). */
        public static final int BAMBOO_MIN_HEIGHT = 12;
        static final MapCodec<ColumnPlant> CODEC = RecordCodecBuilder.<ColumnPlant>mapCodec(i -> i.group(
                required("style", ColumnPlantStyle.CODEC).forGetter(ColumnPlant::style),
                optional("max_height", intRange(1, 32)).forGetter(ColumnPlant::maxHeightSetting),
                optional("min_height", intRange(1, 32)).forGetter(ColumnPlant::minHeightSetting),
                optional("soil", SOIL).forGetter(ColumnPlant::soil),
                optional("needs_water_nearby", Codec.BOOL).forGetter(ColumnPlant::needsWaterNearbySetting),
                optional("touch_damage", floatRange(0, 100)).forGetter(ColumnPlant::touchDamageSetting)).apply(i, ColumnPlant::new))
                .flatXmap(ColumnPlant::check, DataResult::success);

        private static DataResult<ColumnPlant> check(ColumnPlant plant) {
            if (plant.minHeightSetting.isPresent() && plant.minHeightSetting.get() > plant.maxHeight()) {
                return DataResult.error(() -> "min_height: " + plant.minHeightSetting.get() + " is above max_height "
                        + plant.maxHeight());
            }
            return DataResult.success(plant);
        }

        /** The highest the column grows by itself: as written, else 3 (cane, cactus) or 16 (bamboo). */
        public int maxHeight() {
            return maxHeightSetting.orElse(style.defaultMaxHeight());
        }

        /**
         * The lowest height a column may stop at (each stops at a random height from this to {@link #maxHeight()}): as
         * written, else {@link #maxHeight()}, or for bamboo 12 (at most {@link #maxHeight()}).
         */
        public int minHeight() {
            return minHeightSetting.orElse(style == ColumnPlantStyle.BAMBOO ? Math.min(BAMBOO_MIN_HEIGHT, maxHeight()) : maxHeight());
        }

        /** Whether the base needs water beside it: as written, else true for {@code cane}. */
        public boolean needsWaterNearby() {
            return needsWaterNearbySetting.orElse(style == ColumnPlantStyle.CANE);
        }

        /** Damage to an entity touching the column: as written, else 1 for {@code cactus} and 0 otherwise. */
        public float touchDamage() {
            return touchDamageSetting.orElse(style == ColumnPlantStyle.CACTUS ? 1f : 0f);
        }
    }

    /**
     * A multiface plant (ADR 0103 D1), as glow lichen.
     *
     * @param light light level; default 7, as glow lichen (verify at implementation)
     */
    public record Multiface(int light, boolean spreads, boolean waterloggable) implements BlockType.Extension {
        public static final int DEFAULT_LIGHT = 7;
        static final MapCodec<Multiface> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                optional("light", intRange(0, 15), DEFAULT_LIGHT).forGetter(Multiface::light),
                optional("spreads", Codec.BOOL, true).forGetter(Multiface::spreads),
                optional("waterloggable", Codec.BOOL, true).forGetter(Multiface::waterloggable)).apply(i, Multiface::new));
    }

    /** {@code ::msm::definition::DripleafSize}. */
    public enum DripleafSize {
        BIG("big"),
        SMALL("small");

        static final Codec<DripleafSize> CODEC = MsmCodecs.named("dripleaf size", values(), DripleafSize::id);

        private final String id;

        DripleafSize(String id) {
            this.id = id;
        }

        public String id() {
            return id;
        }
    }

    /**
     * A dripleaf (ADR 0103 D1 and its amendment): a big leaf on its stem {@code <path>_stem}, or a small two-block plant
     * that bone meal turns into {@code grows_into}.
     *
     * @param growsInto the big dripleaf element a small one grows into; present exactly when {@code size} is small
     * @param tiltTicksSetting {@code tilt_ticks} as written (big only); {@link #tiltTicks()} applies the default
     */
    public record Dripleaf(DripleafSize size, Optional<Identifier> growsInto, Optional<List<Integer>> tiltTicksSetting)
            implements BlockType.Extension {
        /** Ticks to a partial tilt, to a full tilt and to dropping the entity, as measured by B503 (verify at implementation). */
        public static final List<Integer> DEFAULT_TILT_TICKS = List.of(2, 10, 10);
        static final MapCodec<Dripleaf> CODEC = RecordCodecBuilder.<Dripleaf>mapCodec(i -> i.group(
                required("size", DripleafSize.CODEC).forGetter(Dripleaf::size),
                optional("grows_into", ID).forGetter(Dripleaf::growsInto),
                optional("tilt_ticks", listOfLength(intRange(1, 1200), 3, 3)).forGetter(Dripleaf::tiltTicksSetting))
                .apply(i, Dripleaf::new))
                .flatXmap(Dripleaf::check, DataResult::success);

        private static DataResult<Dripleaf> check(Dripleaf leaf) {
            if (leaf.size == DripleafSize.SMALL && leaf.growsInto.isEmpty()) {
                return DataResult.error(() -> "grows_into: missing (a small dripleaf names the big dripleaf it grows into)");
            }
            if (leaf.size == DripleafSize.BIG && leaf.growsInto.isPresent()) {
                return DataResult.error(() -> "grows_into: only for size 'small' (a big dripleaf grows taller instead)");
            }
            if (leaf.size == DripleafSize.SMALL && leaf.tiltTicksSetting.isPresent()) {
                return DataResult.error(() -> "tilt_ticks: only for size 'big' (a small dripleaf does not tilt)");
            }
            return DataResult.success(leaf);
        }

        /** Ticks to a partial tilt, to a full tilt and to dropping the entity: as written, else {@code [2, 10, 10]}. */
        public List<Integer> tiltTicks() {
            return tiltTicksSetting.orElse(DEFAULT_TILT_TICKS);
        }
    }

    /**
     * A project flower pot (ADR 0103 D2 and its amendment): its own block class with its own plant-to-pot map; each
     * listed plant gets the companion {@code <pot path>_<plant path>}.
     *
     * @param plants the plants the pot takes, 1 to 64
     */
    public record FlowerPot(List<Identifier> plants) implements BlockType.Extension {
        static final MapCodec<FlowerPot> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                required("plants", listOfLength(ID, 1, 64)).forGetter(FlowerPot::plants)).apply(i, FlowerPot::new));
    }

    /** The own top-level field names of the type {@code typeId}, in a stable order. */
    public static List<String> fields(String typeId) {
        return switch (typeId) {
            case "growing_plant" -> List.of("direction", "max_age", "growth_chance", "bonemeal_growth", "needs_water", "berries",
                    "climbable", "soil");
            case "column_plant" -> List.of("style", "max_height", "min_height", "soil", "needs_water_nearby", "touch_damage");
            case "multiface" -> List.of("light", "spreads", "waterloggable");
            case "dripleaf" -> List.of("size", "grows_into", "tilt_ticks");
            case "flower_pot" -> List.of("plants");
            default -> throw new IllegalArgumentException("not a growing plant type: " + typeId);
        };
    }

    /** The codec of the type's own fields, reading them from the definition's top level (closed, as {@link PlantFields}). */
    public static MapCodec<? extends BlockType.Fields> codec(String typeId) {
        MapCodec<? extends BlockType.Fields> codec = switch (typeId) {
            case "growing_plant" -> GrowingPlant.CODEC;
            case "column_plant" -> ColumnPlant.CODEC;
            case "multiface" -> Multiface.CODEC;
            case "dripleaf" -> Dripleaf.CODEC;
            case "flower_pot" -> FlowerPot.CODEC;
            default -> throw new IllegalArgumentException("not a growing plant type: " + typeId);
        };
        return PlantFields.closedTopLevel(typeId, fields(typeId), codec);
    }
}
