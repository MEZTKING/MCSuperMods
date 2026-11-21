package dev.mcsupermods.runtime.loader;

import java.util.List;
import java.util.Map;
import net.minecraft.resources.Identifier;

/**
 * Parses {@code msm/<namespace>/villager_profession/<path>.json} definitions (ADR 0098 D2,
 * {@code ::msm::definition::VillagerProfession}). A stub until B474: it reads no definition, so no profession is
 * registered and no error is reported.
 */
public final class ProfessionParser {
    /** The scanner's kind folder. */
    public static final String KIND = "villager_profession";

    private ProfessionParser() {}

    /** A villager profession definition v1; no fields until B474. */
    public record Profession() {}

    /**
     * The profession definitions among {@code definitions} that parse, by id in scan order; problems are added to
     * {@code errors} and {@code warnings}, each starting with the file it concerns. Always empty until B474.
     */
    public static Map<Identifier, Profession> parseAll(List<RawDefinition> definitions, List<String> errors, List<String> warnings) {
        return Map.of();
    }
}
