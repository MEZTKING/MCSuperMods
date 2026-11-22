package dev.mcsupermods.runtime.loader.types;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.TAG_ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.closed;
import static dev.mcsupermods.runtime.loader.MsmCodecs.floatRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.listOfLength;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.DynamicOps;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.MapLike;
import com.mojang.serialization.RecordBuilder;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.BlockType;
import dev.mcsupermods.runtime.loader.MsmCodecs;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;
import net.minecraft.resources.Identifier;

/**
 * The own fields of the plant and food block types {@code cake}, {@code berry_bush}, {@code tall_plant},
 * {@code potted_plant}, {@code vine}, {@code sea_pickle}, {@code carpet}, {@code layers}, {@code cocoa} and
 * {@code candle} (ADR 0094 D1, D2, D4, D5; {@code ::msm::definition::CakeFields} and its siblings, B443). Defaults are
 * the mcdoc's. Each type is closed at the top level, as {@code portal}: a key that is neither a common block key nor one
 * of the type's own fields is an error naming the key (the TypeScript side's {@code schema.unknown-field}), so a
 * {@code candles} count on a candle or {@code layers} on layers fails the file instead of being ignored.
 */
public final class PlantFields {
    private PlantFields() {}

    /** {@code cake}'s food per slice (mcdoc {@code CakeFood}); default vanilla's slice, 2 and 0.1. */
    public record CakeFood(int nutrition, float saturation) {
        public static final CakeFood DEFAULT = new CakeFood(2, 0.1f);
        static final Codec<CakeFood> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("nutrition", intRange(1, 20)).forGetter(CakeFood::nutrition),
                required("saturation", floatRange(0, 2)).forGetter(CakeFood::saturation)).apply(i, CakeFood::new)),
                List.of("nutrition", "saturation"));
    }

    /**
     * A cake (ADR 0094 D2, D5).
     *
     * @param onEat the event fired after a slice is eaten, with the player as self and other
     */
    public record Cake(CakeFood food, Optional<Identifier> onEat) implements BlockType.Extension {
        static final MapCodec<Cake> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                optional("food", CakeFood.CODEC, CakeFood.DEFAULT).forGetter(Cake::food),
                optional("on_eat", ID).forGetter(Cake::onEat)).apply(i, Cake::new));
    }

    /** An inclusive count range {@code [min, max]}; {@link #low()} and {@link #high()} order a reversed pair. */
    public record CountRange(int min, int max) {
        static final Codec<CountRange> CODEC = listOfLength(intRange(0, 64), 2, 2)
                .xmap(l -> new CountRange(l.get(0), l.get(1)), r -> List.of(r.min(), r.max()));

        public int low() {
            return Math.min(min, max);
        }

        public int high() {
            return Math.max(min, max);
        }
    }

    /** {@code berry_bush}'s harvest counts (mcdoc {@code BerryHarvest}); default ripe 1–2, full 2–3 (measured at B440). */
    public record BerryHarvest(CountRange ripe, CountRange full) {
        public static final BerryHarvest DEFAULT = new BerryHarvest(new CountRange(1, 2), new CountRange(2, 3));
        static final Codec<BerryHarvest> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("ripe", CountRange.CODEC).forGetter(BerryHarvest::ripe),
                required("full", CountRange.CODEC).forGetter(BerryHarvest::full)).apply(i, BerryHarvest::new)), List.of("ripe", "full"));
    }

    /**
     * A berry bush (ADR 0094 D2, D5).
     *
     * @param berry the item a harvest drops and pick block gives (often the bush's own block item)
     * @param hurts whether entities inside are slowed and hurt when they move, as vanilla's bush
     */
    public record BerryBush(Identifier berry, BerryHarvest harvest, boolean hurts) implements BlockType.Extension {
        static final MapCodec<BerryBush> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                required("berry", ID).forGetter(BerryBush::berry),
                optional("harvest", BerryHarvest.CODEC, BerryHarvest.DEFAULT).forGetter(BerryBush::harvest),
                optional("hurts", Codec.BOOL, true).forGetter(BerryBush::hurts)).apply(i, BerryBush::new));
    }

    /** {@code ::msm::definition::TallPlantBonemeal}. */
    public enum TallPlantBonemeal {
        NONE("none"),
        DROP_COPY("drop_copy");

        static final Codec<TallPlantBonemeal> CODEC = MsmCodecs.named("tall plant bonemeal", values(), TallPlantBonemeal::id);

        private final String id;

        TallPlantBonemeal(String id) {
            this.id = id;
        }

        public String id() {
            return id;
        }
    }

    /** A plant two blocks high (ADR 0094 D2); {@code bonemeal} default {@code drop_copy}, as tall flowers. */
    public record TallPlant(TallPlantBonemeal bonemeal) implements BlockType.Extension {
        static final MapCodec<TallPlant> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                optional("bonemeal", TallPlantBonemeal.CODEC, TallPlantBonemeal.DROP_COPY).forGetter(TallPlant::bonemeal))
                .apply(i, TallPlant::new));
    }

    /**
     * A plant in a flower pot (ADR 0094 D2, ADR 0103 D2); {@code plant} is the block inside.
     *
     * @param potSetting {@code pot} as written: a project {@code flower_pot}; {@link #pot()} applies the default
     */
    public record PottedPlant(Identifier plant, Optional<Identifier> potSetting) implements BlockType.Extension {
        /** Vanilla's empty flower pot, the default {@code pot}. */
        public static final Identifier VANILLA_POT = Identifier.withDefaultNamespace("flower_pot");
        static final MapCodec<PottedPlant> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                required("plant", ID).forGetter(PottedPlant::plant),
                optional("pot", ID).forGetter(PottedPlant::potSetting)).apply(i, PottedPlant::new));

        /** The empty pot: as written, else vanilla's {@code minecraft:flower_pot}. */
        public Identifier pot() {
            return potSetting.orElse(VANILLA_POT);
        }
    }

    /** A vine (ADR 0094 D2); {@code spreads} default true. */
    public record Vine(boolean spreads) implements BlockType.Extension {
        static final MapCodec<Vine> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                optional("spreads", Codec.BOOL, true).forGetter(Vine::spreads)).apply(i, Vine::new));
    }

    /** A cocoa-like pod (ADR 0094 D2, D5; B443); {@code support} is a block tag, without {@code #}. */
    public record Cocoa(Identifier support) implements BlockType.Extension {
        public static final Identifier DEFAULT_SUPPORT = Identifier.withDefaultNamespace("supports_cocoa");
        static final MapCodec<Cocoa> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                optional("support", TAG_ID, DEFAULT_SUPPORT).forGetter(Cocoa::support)).apply(i, Cocoa::new));
    }

    /** The fields of {@code sea_pickle}, {@code carpet}, {@code layers} and {@code candle}: none of their own. */
    public record Plain() implements BlockType.Extension {
        public static final Plain INSTANCE = new Plain();
    }

    /** The own top-level field names of the type {@code typeId}, in a stable order. */
    public static List<String> fields(String typeId) {
        return switch (typeId) {
            case "cake" -> List.of("food", "on_eat");
            case "berry_bush" -> List.of("berry", "harvest", "hurts");
            case "tall_plant" -> List.of("bonemeal");
            case "potted_plant" -> List.of("plant", "pot");
            case "vine" -> List.of("spreads");
            case "cocoa" -> List.of("support");
            default -> List.of();
        };
    }

    /** The codec of the type's own fields, reading them from the definition's top level (closed, see the class doc). */
    public static MapCodec<? extends BlockType.Fields> codec(String typeId) {
        MapCodec<? extends BlockType.Fields> codec = switch (typeId) {
            case "cake" -> Cake.CODEC;
            case "berry_bush" -> BerryBush.CODEC;
            case "tall_plant" -> TallPlant.CODEC;
            case "potted_plant" -> PottedPlant.CODEC;
            case "vine" -> Vine.CODEC;
            case "cocoa" -> Cocoa.CODEC;
            default -> MapCodec.unit(Plain.INSTANCE);
        };
        return closedTopLevel(typeId, fields(typeId), codec);
    }

    /**
     * {@code codec}, failing first on any top-level key outside {@link BlockDefinition#KEYS} (the common keys and every
     * type's fields; another type's fields are already refused by {@code BlockType.SPEC_CODEC}); {@code own} names the
     * type's own fields in the message. Shared with {@link GrowingPlantFields}.
     */
    static <A> MapCodec<A> closedTopLevel(String typeId, List<String> own, MapCodec<A> codec) {
        return new MapCodec<>() {
            @Override
            public <T> Stream<T> keys(DynamicOps<T> ops) {
                return codec.keys(ops);
            }

            @Override
            public <T> DataResult<A> decode(DynamicOps<T> ops, MapLike<T> input) {
                List<String> unknown = input.entries()
                        .map(e -> ops.getStringValue(e.getFirst()).result().orElse(String.valueOf(e.getFirst())))
                        .filter(k -> !BlockDefinition.KEYS.contains(k))
                        .sorted()
                        .toList();
                if (!unknown.isEmpty()) {
                    return DataResult.error(() -> String.join(", ", unknown) + ": unknown field for type '" + typeId + "' ("
                            + (own.isEmpty() ? "it has no fields of its own" : "its fields are " + String.join(", ", own)) + ")");
                }
                return codec.decode(ops, input);
            }

            @Override
            public <T> RecordBuilder<T> encode(A input, DynamicOps<T> ops, RecordBuilder<T> prefix) {
                return codec.encode(input, ops, prefix);
            }

            @Override
            public String toString() {
                return "PlantFields[" + typeId + "]";
            }
        };
    }
}
