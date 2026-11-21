package dev.mcsupermods.runtime.loader;

import dev.mcsupermods.runtime.registry.fluid.FluidDefinition;
import java.util.List;
import java.util.Map;
import net.minecraft.resources.Identifier;

/**
 * Parses {@code msm/<namespace>/fluid/<path>.json} definitions (ADR 0099 D1, {@code ::msm::definition::Fluid}). A stub
 * until B475: it reads no definition, so no fluid is registered and no error is reported.
 */
public final class FluidParser {
    /** The scanner's kind folder. */
    public static final String KIND = "fluid";

    private FluidParser() {}

    /**
     * The fluid definitions among {@code definitions} that parse, by id in scan order; problems are added to
     * {@code errors} and {@code warnings}, each starting with the file it concerns. Always empty until B475.
     */
    public static Map<Identifier, FluidDefinition> parseAll(List<RawDefinition> definitions, List<String> errors, List<String> warnings) {
        return Map.of();
    }
}
