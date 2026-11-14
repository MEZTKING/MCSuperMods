package dev.mcsupermods.runtime.loader;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.closed;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import net.minecraft.resources.Identifier;

/**
 * Biome addition v1 ({@code ::msm::definition::BiomeAddition}, ADR 0060 D2): placed features and natural spawns added
 * to the selected biomes when a server starts. At least one of {@code features} and {@code spawns} is required; every
 * struct is closed (an unknown key is an error, as in the MSM mcdoc).
 *
 * @param biomes   biome ids and {@code #}-prefixed biome tags; the addition applies to their union
 * @param features empty when absent
 * @param spawns   empty when absent
 */
public record BiomeAdditionDefinition(int format, List<String> biomes, List<Feature> features, List<Spawn> spawns) {
    public static final List<String> KEYS = List.of("format", "biomes", "features", "spawns");

    /** {@code GenerationStep.Decoration} in lower case; each maps onto the vanilla constant of the same name. */
    public enum Step {
        RAW_GENERATION, LAKES, LOCAL_MODIFICATIONS, UNDERGROUND_STRUCTURES, SURFACE_STRUCTURES, STRONGHOLDS, UNDERGROUND_ORES,
        UNDERGROUND_DECORATION, FLUID_SPRINGS, VEGETAL_DECORATION, TOP_LAYER_MODIFICATION;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        public static final Codec<Step> CODEC = MsmCodecs.named("generation step", values(), Step::serialName);
    }

    /** A biome id, or a biome tag written {@code #ns:path}. */
    public static final Codec<String> BIOME = Codec.STRING.validate(s -> Identifier.tryParse(s.startsWith("#") ? s.substring(1) : s) != null
            ? DataResult.success(s)
            : DataResult.error(() -> "invalid biome or biome tag '" + s + "'"));

    /** {@code ::msm::definition::BiomeFeature}. */
    public record Feature(Identifier feature, Step step) {
        public static final Codec<Feature> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("feature", ID).forGetter(Feature::feature),
                required("step", Step.CODEC).forGetter(Feature::step)).apply(i, Feature::new)), List.of("feature", "step"));
    }

    /** {@code ::msm::definition::BiomeSpawn}; {@code min_group} above {@code max_group} is an error at registration. */
    public record Spawn(Identifier entity, EntityDefinition.Category category, int weight, int minGroup, int maxGroup) {
        public static final Codec<Spawn> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("entity", ID).forGetter(Spawn::entity),
                required("category", EntityDefinition.Category.CODEC).forGetter(Spawn::category),
                required("weight", intAtLeast(1)).forGetter(Spawn::weight),
                required("min_group", intAtLeast(1)).forGetter(Spawn::minGroup),
                required("max_group", intAtLeast(1)).forGetter(Spawn::maxGroup)).apply(i, Spawn::new)),
                List.of("entity", "category", "weight", "min_group", "max_group"));
    }

    private static <A> Codec<List<A>> nonEmpty(Codec<A> codec) {
        return MsmCodecs.nonEmptyList(codec);
    }

    private static final Codec<BiomeAdditionDefinition> FIELDS = RecordCodecBuilder.create(i -> i.group(
            required("format", intRange(1, 1)).forGetter(BiomeAdditionDefinition::format),
            required("biomes", nonEmpty(BIOME)).forGetter(BiomeAdditionDefinition::biomes),
            optional("features", nonEmpty(Feature.CODEC)).forGetter(d -> d.features().isEmpty() ? Optional.empty() : Optional.of(d.features())),
            optional("spawns", nonEmpty(Spawn.CODEC)).forGetter(d -> d.spawns().isEmpty() ? Optional.empty() : Optional.of(d.spawns())))
            .apply(i, (format, biomes, features, spawns) -> new BiomeAdditionDefinition(format, biomes, features.orElse(List.of()),
                    spawns.orElse(List.of()))));

    /** The closed top level, then the union rule: {@code features} or {@code spawns} must be present. */
    public static final Codec<BiomeAdditionDefinition> CODEC = closed(FIELDS, KEYS).validate(d -> d.features().isEmpty() && d.spawns().isEmpty()
            ? DataResult.error(() -> "features: missing (at least one of features and spawns is required)")
            : DataResult.success(d));
}
