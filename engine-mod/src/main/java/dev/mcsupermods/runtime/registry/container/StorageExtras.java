package dev.mcsupermods.runtime.registry.container;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import java.util.Optional;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockBehaviour;

/**
 * The block classes of double chests and per-player storage (ADR 0104 D4, D5 and its amendment after B503). A stub from
 * B505: the registrar asks here after weathering and before waterlogging; B513 fills it in.
 */
public final class StorageExtras {
    private StorageExtras() {}

    /** The block for a definition with a double or per-player chest layout; empty for every other block (always, until B513). */
    public static Optional<Block> blockFor(Identifier id, BlockDefinition definition, BlockBehaviour.Properties props) {
        return Optional.empty();
    }
}
