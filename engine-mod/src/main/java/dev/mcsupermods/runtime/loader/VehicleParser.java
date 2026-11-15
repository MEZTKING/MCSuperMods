package dev.mcsupermods.runtime.loader;

import java.util.List;
import net.minecraft.resources.Identifier;

/**
 * Parses {@code msm/<namespace>/vehicle/<path>.json} definitions (ADR 0090 D2). A stub until B412: it returns no
 * definitions and reports nothing.
 */
public final class VehicleParser {
    /** The scanner's kind folder. */
    public static final String KIND = "vehicle";

    private VehicleParser() {}

    /**
     * The ids of the vehicle definitions among {@code definitions} that parse; problems are added to {@code errors} and
     * {@code warnings}, each starting with the file it concerns.
     */
    public static List<Identifier> parseAll(List<RawDefinition> definitions, List<String> errors, List<String> warnings) {
        return List.of();
    }
}
