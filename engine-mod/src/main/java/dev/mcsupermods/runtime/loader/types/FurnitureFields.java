package dev.mcsupermods.runtime.loader.types;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.TAG_ID;
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
import java.util.stream.Stream;
import net.minecraft.resources.Identifier;

/**
 * The own fields of the furniture, light and sign block types {@code bed}, {@code ladder}, {@code torch}, {@code lantern},
 * {@code chain}, {@code rod}, {@code sign}, {@code hanging_sign}, {@code stem} and {@code scaffolding} (ADR 0094 D1 to
 * D6; {@code ::msm::definition::BedFields} and its siblings, B443). Defaults are the mcdoc's (the target facts of plugin
 * API 1.17.0: {@code bedRules}, {@code defaultTorchParticle}, {@code stemTags}, B444). Each type is closed at the top
 * level, as the plant types (B445): a key that is neither a common block key nor one of the type's own fields is an error
 * naming the key (the TypeScript side's {@code schema.unknown-field}), so a {@code facing} on a ladder or a
 * {@code distance} on scaffolding fails the file instead of being ignored.
 */
public final class FurnitureFields {
    private FurnitureFields() {}

    /** {@code ::msm::definition::BedRule}: which bed rule environment attribute a bed follows. */
    public enum BedRule {
        /** {@code gameplay/bed_rule}, as vanilla's beds; the default. */
        BED("bed"),
        /** {@code gameplay/straw_bed_rule}, as vanilla's straw bed. */
        STRAW_BED("straw_bed");

        static final Codec<BedRule> CODEC = MsmCodecs.named("bed rule", values(), BedRule::id);

        private final String id;

        BedRule(String id) {
            this.id = id;
        }

        public String id() {
            return id;
        }
    }

    /**
     * {@code ::msm::definition::DyeColour}, the sixteen dye colours in vanilla's order (a target fact, {@code dyeColours});
     * the names are vanilla's {@code DyeColor} names, which the registry maps to (this class stays free of game classes).
     */
    public enum BedColour {
        WHITE("white"),
        ORANGE("orange"),
        MAGENTA("magenta"),
        LIGHT_BLUE("light_blue"),
        YELLOW("yellow"),
        LIME("lime"),
        PINK("pink"),
        GRAY("gray"),
        LIGHT_GRAY("light_gray"),
        CYAN("cyan"),
        PURPLE("purple"),
        BLUE("blue"),
        BROWN("brown"),
        GREEN("green"),
        RED("red"),
        BLACK("black");

        static final Codec<BedColour> CODEC = MsmCodecs.named("dye colour", values(), BedColour::id);

        private final String id;

        BedColour(String id) {
            this.id = id;
        }

        public String id() {
            return id;
        }
    }

    /** A bed (ADR 0094 D2): {@code rule} default {@code bed}, {@code colour} default {@code white}. */
    public record Bed(BedRule rule, BedColour colour) implements BlockType.Extension {
        static final MapCodec<Bed> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                optional("rule", BedRule.CODEC, BedRule.BED).forGetter(Bed::rule),
                optional("colour", BedColour.CODEC, BedColour.WHITE).forGetter(Bed::colour)).apply(i, Bed::new));
    }

    /**
     * A torch (ADR 0094 D2): {@code particle} is the flame, a particle type without options; default the target's torch
     * particle {@code minecraft:flame} ({@code defaultTorchParticle}). Whether it has options is checked at registration.
     */
    public record Torch(Identifier particle) implements BlockType.Extension {
        public static final Identifier DEFAULT_PARTICLE = Identifier.withDefaultNamespace("flame");
        static final MapCodec<Torch> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                optional("particle", ID, DEFAULT_PARTICLE).forGetter(Torch::particle)).apply(i, Torch::new));
    }

    /** A sign or hanging sign (ADR 0094 D2, D6): the vanilla wood type whose sounds its own wood type copies. */
    public record Sign(BlockType.WoodKind woodType) implements BlockType.Extension {
        static final MapCodec<Sign> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                required("wood_type", BlockType.WoodKind.CODEC).forGetter(Sign::woodType)).apply(i, Sign::new));
    }

    /**
     * A stem (ADR 0094 D2, D3): the {@code fruit} block it grows, the block tags it is planted on ({@code soil}) and the
     * fruit grows on ({@code fruit_soil}), without {@code #}; defaults the target's melon stem tags ({@code stemTags}).
     */
    public record Stem(Identifier fruit, Identifier soil, Identifier fruitSoil) implements BlockType.Extension {
        public static final Identifier DEFAULT_SOIL = Identifier.withDefaultNamespace("supports_melon_stem");
        public static final Identifier DEFAULT_FRUIT_SOIL = Identifier.withDefaultNamespace("supports_melon_stem_fruit");
        static final MapCodec<Stem> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                required("fruit", ID).forGetter(Stem::fruit),
                optional("soil", TAG_ID, DEFAULT_SOIL).forGetter(Stem::soil),
                optional("fruit_soil", TAG_ID, DEFAULT_FRUIT_SOIL).forGetter(Stem::fruitSoil)).apply(i, Stem::new));
    }

    /** The fields of {@code ladder}, {@code lantern}, {@code chain}, {@code rod} and {@code scaffolding}: none of their own. */
    public record Plain() implements BlockType.Extension {
        public static final Plain INSTANCE = new Plain();
    }

    /** The own top-level field names of the type {@code typeId}, in a stable order. */
    public static List<String> fields(String typeId) {
        return switch (typeId) {
            case "bed" -> List.of("rule", "colour");
            case "torch" -> List.of("particle");
            case "sign", "hanging_sign" -> List.of("wood_type");
            case "stem" -> List.of("fruit", "soil", "fruit_soil");
            default -> List.of();
        };
    }

    /** The codec of the type's own fields, reading them from the definition's top level (closed, see the class doc). */
    public static MapCodec<? extends BlockType.Fields> codec(String typeId) {
        MapCodec<? extends BlockType.Fields> codec = switch (typeId) {
            case "bed" -> Bed.CODEC;
            case "torch" -> Torch.CODEC;
            case "sign", "hanging_sign" -> Sign.CODEC;
            case "stem" -> Stem.CODEC;
            default -> MapCodec.unit(Plain.INSTANCE);
        };
        return closedTopLevel(typeId, codec);
    }

    /**
     * {@code codec}, failing first on any top-level key outside {@link BlockDefinition#KEYS} (the common keys and every
     * type's fields; another type's fields are already refused by {@code BlockType.SPEC_CODEC}). As
     * {@code PlantFields.closedTopLevel}.
     */
    private static <A> MapCodec<A> closedTopLevel(String typeId, MapCodec<A> codec) {
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
                    List<String> own = fields(typeId);
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
                return "FurnitureFields[" + typeId + "]";
            }
        };
    }
}
