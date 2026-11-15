package dev.mcsupermods.runtime.registry.weathering;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import java.util.Optional;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockBehaviour;

/**
 * Weathering blocks (ADR 0094 D8): a block with {@code msm:weathering} becomes the weathering class of its type. A stub
 * until B449: no definition is a weathering block.
 */
public final class Weathering {
    private Weathering() {}

    /**
     * The weathering block for {@code definition}, or empty when it is not one (then the registrar tries the next hook
     * and then {@code BlockTypes.create}); called from the registrar before the block is registered.
     */
    public static Optional<Block> blockFor(Identifier id, BlockDefinition definition, BlockBehaviour.Properties props) {
        return Optional.empty();
    }
}
