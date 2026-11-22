package dev.mcsupermods.runtime.loader;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID_OR_TAG;
import static dev.mcsupermods.runtime.loader.MsmCodecs.closed;
import static dev.mcsupermods.runtime.loader.MsmCodecs.listOfLength;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.minecraft.resources.Identifier;

/**
 * Parses {@code msm/<namespace>/villager_type/<path>.json} definitions (ADR 0107 D5 as amended after the spike,
 * {@code ::msm::definition::VillagerType}). Pure: no registry is touched, so JUnit runs it over the conformance corpus.
 * {@code format} is required (another value than 1 is an error); the struct is closed, so an element-only key
 * ({@code textures}), an unknown key ({@code trades}), a missing {@code biomes} or a list outside 1 to 64 biome ids or
 * {@code #}-prefixed tags is an error and no type is registered. Whether the biomes exist is only known with a world's
 * registries ({@code registry.mob.VillagerTypes}, B528, warns there).
 */
public final class VillagerTypeParser {
    /** The scanner's kind folder. */
    public static final String KIND = "villager_type";

    private VillagerTypeParser() {}

    /**
     * A villager type definition v1.
     *
     * @param biomes biome ids and {@code #}-prefixed biome tags where villagers are born and spawn with this type
     */
    public record VillagerType(List<String> biomes) {
        public static final List<String> KEYS = List.of("format", "biomes");

        public static final Codec<VillagerType> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("biomes", listOfLength(ID_OR_TAG, 1, 64)).forGetter(VillagerType::biomes)).apply(i, VillagerType::new)), KEYS);

        /** The villager picture vanilla draws for type {@code id}: {@code <ns>:textures/entity/villager/type/<path>.png}. */
        public static Identifier villagerTexture(Identifier id) {
            return Identifier.fromNamespaceAndPath(id.getNamespace(), "textures/entity/villager/type/" + id.getPath() + ".png");
        }

        /** The zombie villager picture: {@code <ns>:textures/entity/zombie_villager/type/<path>.png}. */
        public static Identifier zombieVillagerTexture(Identifier id) {
            return Identifier.fromNamespaceAndPath(id.getNamespace(), "textures/entity/zombie_villager/type/" + id.getPath() + ".png");
        }
    }

    /**
     * The villager type definitions among {@code definitions} that parse, by id in scan order; problems are added to
     * {@code errors} and {@code warnings}, each starting with the file it concerns.
     */
    public static Map<Identifier, VillagerType> parseAll(List<RawDefinition> definitions, List<String> errors, List<String> warnings) {
        Map<Identifier, VillagerType> out = new LinkedHashMap<>();
        for (RawDefinition raw : definitions) {
            if (!raw.kind().equals(KIND)) {
                continue;
            }
            ParseResult<VillagerType> result = parse(raw.json());
            result.errors().forEach(e -> errors.add(raw.describe() + ": " + e));
            result.warnings().forEach(w -> warnings.add(raw.describe() + ": " + w));
            result.definition().ifPresent(def -> out.put(raw.id(), def));
        }
        return out;
    }

    /** Parses one villager type file. */
    public static ParseResult<VillagerType> parse(JsonElement json) {
        if (!(json instanceof JsonObject object)) {
            return new ParseResult<>(Optional.empty(), List.of("top level must be an object"), List.of());
        }
        String formatError = CommandParser.checkFormat(object);
        if (formatError != null) {
            return new ParseResult<>(Optional.empty(), List.of(formatError), List.of());
        }
        DataResult<VillagerType> decoded = VillagerType.CODEC.parse(StrictJsonOps.INSTANCE, object);
        if (decoded.error().isPresent()) {
            return new ParseResult<>(Optional.empty(), List.of(decoded.error().get().message()), List.of());
        }
        return new ParseResult<>(Optional.of(decoded.getOrThrow()), List.of(), List.of());
    }
}
