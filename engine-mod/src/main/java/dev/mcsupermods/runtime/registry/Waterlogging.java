package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import java.util.Optional;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockBehaviour;

/**
 * Waterlogging (ADR 0094 D7): a block with {@code msm:waterloggable} becomes its waterlogged class. A stub until
 * B449: no definition is waterloggable.
 */
public final class Waterlogging {
    private Waterlogging() {}

    /**
     * The waterlogged block for {@code definition}, or empty when it is not waterloggable; called from the registrar
     * before the block is registered, after {@code Weathering.blockFor}.
     */
    public static Optional<Block> blockFor(Identifier id, BlockDefinition definition, BlockBehaviour.Properties props) {
        return Optional.empty();
    }
}
