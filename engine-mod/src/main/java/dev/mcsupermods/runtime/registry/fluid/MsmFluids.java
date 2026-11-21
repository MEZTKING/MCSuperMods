package dev.mcsupermods.runtime.registry.fluid;

import dev.mcsupermods.runtime.loader.FluidParser;
import dev.mcsupermods.runtime.loader.RawDefinition;
import java.util.List;
import net.minecraft.resources.Identifier;

/**
 * Project fluids (ADR 0099 D1): one still and one flowing fluid per {@code fluid} definition on 26.3, one on 26.4 (the
 * {@link MsmFluid} seam), each with a liquid block and a bucket. A stub until B475: it reads no definition and registers
 * nothing. The registrar calls it after the particle types (a fluid may name them) and before the blocks (the liquid
 * block and the bucket are registered with the fluid).
 */
public final class MsmFluids {
    private MsmFluids() {}

    /**
     * Parses the scanned {@code fluid} definitions and registers their fluids; returns the ids registered. Errors and
     * warnings are added to the lists.
     */
    public static List<Identifier> register(List<RawDefinition> definitions, List<String> errors, List<String> warnings) {
        FluidParser.parseAll(definitions, errors, warnings);
        return List.of();
    }
}
