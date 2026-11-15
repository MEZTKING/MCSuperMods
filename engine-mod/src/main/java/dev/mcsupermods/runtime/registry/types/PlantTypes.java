package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import java.util.function.Consumer;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockBehaviour;

/**
 * The block classes of the plant and food types {@code cake}, {@code berry_bush}, {@code tall_plant},
 * {@code potted_plant}, {@code vine}, {@code sea_pickle}, {@code carpet}, {@code layers}, {@code cocoa} and
 * {@code candle} (ADR 0094 D1, D2, D4, D5). A stub until B445: every type is refused with "not yet implemented".
 */
public final class PlantTypes {
    private PlantTypes() {}

    /**
     * The block for a definition of one of the ten types; called from {@link BlockTypes#create}.
     *
     * @param warn takes a load warning (without the file name)
     * @throws UnsupportedOperationException until B445 (the registrar reports it as a load error for the file)
     */
    public static Block create(Identifier id, BlockDefinition definition, BlockBehaviour.Properties props, Consumer<String> warn) {
        throw new UnsupportedOperationException("block type '" + definition.type().id() + "' is not yet implemented");
    }
}
