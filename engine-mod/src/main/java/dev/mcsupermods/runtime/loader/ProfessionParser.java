package dev.mcsupermods.runtime.loader;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.closed;
import static dev.mcsupermods.runtime.loader.MsmCodecs.listOfLength;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.minecraft.resources.Identifier;

/**
 * Parses {@code msm/<namespace>/villager_profession/<path>.json} definitions (ADR 0098 D2,
 * {@code ::msm::definition::VillagerProfession}). Pure: no registry is touched, so JUnit runs it over the conformance
 * corpus. {@code format} is required (another value than 1 is an error); the struct is closed, so an element-only key
 * ({@code display_name}, {@code textures}), an unknown key ({@code max_tickets}), a missing or non-string
 * {@code job_site} or {@code trade_sets} of another length than five is an error and no profession is registered.
 * Whether the job site is a registered block without a point of interest is checked by {@code MsmProfessions}.
 */
public final class ProfessionParser {
    /** The scanner's kind folder. */
    public static final String KIND = "villager_profession";
    /** Trading levels of a villager: one trade set each. */
    public static final int LEVELS = 5;

    private ProfessionParser() {}

    /**
     * A villager profession definition v1.
     *
     * @param jobSite            the block a villager without a job takes the profession at
     * @param tradeSets          the trade sets of levels 1 to 5; empty means {@link #defaultTradeSets(Identifier)}
     * @param workSound          played while the villager works; empty means none
     * @param requestedItems     items the villager picks up and keeps
     * @param secondaryJobBlocks blocks near the job site it also works at
     */
    public record Profession(Identifier jobSite, Optional<List<Identifier>> tradeSets, Optional<Identifier> workSound,
            List<Identifier> requestedItems, List<Identifier> secondaryJobBlocks) {
        public static final List<String> KEYS = List.of("format", "job_site", "trade_sets", "work_sound", "requested_items",
                "secondary_job_blocks");

        public static final Codec<Profession> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("job_site", ID).forGetter(Profession::jobSite),
                optional("trade_sets", listOfLength(ID, LEVELS, LEVELS)).forGetter(Profession::tradeSets),
                optional("work_sound", ID).forGetter(Profession::workSound),
                optional("requested_items", ID.listOf(), List.of()).forGetter(Profession::requestedItems),
                optional("secondary_job_blocks", ID.listOf(), List.of()).forGetter(Profession::secondaryJobBlocks))
                .apply(i, Profession::new)), KEYS);

        /** The trade sets of levels 1 to 5: as written, or {@link #defaultTradeSets(Identifier)} of {@code id}. */
        public List<Identifier> tradeSetsOf(Identifier id) {
            return tradeSets.orElseGet(() -> defaultTradeSets(id));
        }
    }

    /** {@code <ns>:<path>/level_1} to {@code level_5}: the trade sets lowering writes when {@code trade_sets} is absent. */
    public static List<Identifier> defaultTradeSets(Identifier id) {
        List<Identifier> out = new ArrayList<>(LEVELS);
        for (int level = 1; level <= LEVELS; level++) {
            out.add(id.withPath(id.getPath() + "/level_" + level));
        }
        return List.copyOf(out);
    }

    /**
     * The name's language key (ADR 0098 amendment): {@code entity.<ns>.villager.<path>}, the key vanilla villagers show
     * for a profession; a {@code /} in the path is kept.
     */
    public static String nameKey(Identifier id) {
        return "entity." + id.getNamespace() + ".villager." + id.getPath();
    }

    /**
     * The profession definitions among {@code definitions} that parse, by id in scan order; problems are added to
     * {@code errors} and {@code warnings}, each starting with the file it concerns.
     */
    public static Map<Identifier, Profession> parseAll(List<RawDefinition> definitions, List<String> errors, List<String> warnings) {
        Map<Identifier, Profession> out = new LinkedHashMap<>();
        for (RawDefinition raw : definitions) {
            if (!raw.kind().equals(KIND)) {
                continue;
            }
            ParseResult<Profession> result = parse(raw.json());
            result.errors().forEach(e -> errors.add(raw.describe() + ": " + e));
            result.warnings().forEach(w -> warnings.add(raw.describe() + ": " + w));
            result.definition().ifPresent(def -> out.put(raw.id(), def));
        }
        return out;
    }

    /** Parses one villager profession file. */
    public static ParseResult<Profession> parse(JsonElement json) {
        if (!(json instanceof JsonObject object)) {
            return new ParseResult<>(Optional.empty(), List.of("top level must be an object"), List.of());
        }
        String formatError = CommandParser.checkFormat(object);
        if (formatError != null) {
            return new ParseResult<>(Optional.empty(), List.of(formatError), List.of());
        }
        DataResult<Profession> decoded = Profession.CODEC.parse(StrictJsonOps.INSTANCE, object);
        if (decoded.error().isPresent()) {
            return new ParseResult<>(Optional.empty(), List.of(decoded.error().get().message()), List.of());
        }
        return new ParseResult<>(Optional.of(decoded.getOrThrow()), List.of(), List.of());
    }
}
