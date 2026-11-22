package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.BlockType;
import dev.mcsupermods.runtime.registry.container.BlockEntityHooks;
import dev.mcsupermods.runtime.registry.container.MsmWaterloggedContainerBlock;
import dev.mcsupermods.runtime.registry.types.MsmWaterloggedBlock;
import java.util.Optional;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockBehaviour;

/**
 * Waterlogging (ADR 0094 D7): a {@code block}, {@code pillar}, {@code horizontal} or {@code directional} block with
 * {@code msm:waterloggable} becomes an {@link MsmWaterloggedBlock}, or, with {@code msm:container} or {@code msm:machine}
 * (ADR 0104 D3, B513; limit Q8 lifted), an {@link MsmWaterloggedContainerBlock} that keeps its block entity, menu, hopper
 * faces and comparator. The other types that vanilla waterlogs (slabs, stairs, walls, fences, panes, trapdoors, ladders,
 * lanterns, chains, signs, candles, sea pickles, scaffolding) keep vanilla's own property; the parser refuses the
 * component on them. A double chest is vanilla's chest family and always has vanilla's {@code waterlogged} property
 * ({@code StorageExtras}, tried before this). A block that also weathers is made by {@code Weathering.blockFor}, which is
 * tried first.
 */
public final class Waterlogging {
    private Waterlogging() {}

    /**
     * The waterlogged block for {@code definition}, or empty when it is not waterloggable; called from the registrar
     * before the block is registered, after {@code Weathering.blockFor} and {@code StorageExtras.blockFor}.
     */
    public static Optional<Block> blockFor(Identifier id, BlockDefinition definition, BlockBehaviour.Properties props) {
        if (!waterloggable(definition)) {
            return Optional.empty();
        }
        return Optional.of(BlockEntityHooks.wantsBlockEntity(definition)
                ? new MsmWaterloggedContainerBlock(id, definition, props)
                : new MsmWaterloggedBlock(id, definition, props));
    }

    /** Whether {@code definition} is built with the {@code waterlogged} property of ADR 0094 D7 (containers and machines too). */
    public static boolean waterloggable(BlockDefinition definition) {
        return definition.components().waterloggable().isPresent() && BlockType.WATERLOGGABLE_TYPES.contains(definition.type());
    }
}
