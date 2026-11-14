package dev.mcsupermods.runtime.registry.container;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.registry.MsmBlock;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.block.EntityBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;

/**
 * An {@link MsmBlock} with a block entity (ADR 0074 D2): shapes, facing, redstone and events stay in {@code MsmBlock} and
 * {@code BlockBehaviourDriver}. {@link MsmBlock#create} builds one when {@link BlockEntityHooks#wantsBlockEntity} says so.
 * Until containers exist (B314) no block entity is made.
 */
public class MsmContainerBlock extends MsmBlock implements EntityBlock {
    public MsmContainerBlock(Identifier id, BlockDefinition definition, Setup setup, Properties properties) {
        super(id, definition, setup, properties);
    }

    @Override
    public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
        return null; // B314: the container's block entity
    }
}
