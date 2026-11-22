package dev.mcsupermods.runtime.registry.container;

import dev.mcsupermods.runtime.components.BlockComponents;
import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.BlockType;
import dev.mcsupermods.runtime.registry.weathering.Weathering;
import java.util.Optional;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockBehaviour;

/**
 * The block classes of storage 2 that are not {@link MsmContainerBlock} (ADR 0104 D4 and its amendment after B503): a
 * chest with {@code double: true} is an {@link MsmDoubleChestBlock} (vanilla's chest family), or, with
 * {@code msm:weathering}, an {@link MsmDoubleChestBlock.Weathers}. The registrar asks here after {@code Weathering} (which
 * leaves double chests to this class) and before {@code Waterlogging}. Per-player chests stay {@link MsmContainerBlock}s
 * (or their waterlogged and weathering subclasses) that open {@link PlayerStores}; the first call registers that
 * attachment type.
 */
public final class StorageExtras {
    private StorageExtras() {}

    /** The block for a definition with a double chest layout; empty for every other block. */
    public static Optional<Block> blockFor(Identifier id, BlockDefinition definition, BlockBehaviour.Properties props) {
        PlayerStores.register(); // at start-up, so saved stores load whatever blocks the project has now
        boolean doubleChest = definition.components().container().map(BlockComponents.Container::doubleChest).orElse(false);
        if (!doubleChest || !definition.type().shaped() || definition.components().machine().isPresent()) {
            return Optional.empty();
        }
        BlockBehaviour.Properties chest = props.noOcclusion(); // vanilla's chest shape is smaller than a cube
        Optional<BlockComponents.Weathering> weathering = definition.components().weathering();
        if (weathering.isPresent() && BlockType.WEATHERING_TYPES.contains(definition.type())) {
            Weathering.declare(id, weathering.get());
            return Optional.of(new MsmDoubleChestBlock.Weathers(id, definition, Weathering.stage(id, weathering.get()), chest));
        }
        return Optional.of(new MsmDoubleChestBlock(id, definition, chest));
    }
}
