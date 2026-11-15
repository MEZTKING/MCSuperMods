package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.registry.MsmBlock;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.resources.Identifier;
import net.minecraft.util.RandomSource;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.ScheduledTickAccess;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SimpleWaterloggedBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.BooleanProperty;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.level.material.Fluids;

/**
 * A {@code block}, {@code pillar}, {@code horizontal} or {@code directional} block with {@code msm:waterloggable} (ADR 0094
 * D7): every behaviour of {@link MsmBlock} plus vanilla's {@code waterlogged} property through
 * {@link SimpleWaterloggedBlock}, whose own methods fill and empty it with a bucket (the runtime never overrides
 * {@code canPlaceLiquid}, F11). Placed in water it starts waterlogged; a waterlogged block holds a water source, so the
 * water stays (and flows) when the block is broken. Never a container or machine: the parser drops the component there
 * (limit Q8).
 */
public class MsmWaterloggedBlock extends MsmBlock implements SimpleWaterloggedBlock {
    public static final BooleanProperty WATERLOGGED = BlockStateProperties.WATERLOGGED;

    public MsmWaterloggedBlock(Identifier id, BlockDefinition definition, Properties properties) {
        super(id, definition, Setup.of(definition), properties);
        registerDefaultState(defaultBlockState().setValue(WATERLOGGED, false));
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
        super.createBlockStateDefinition(builder);
        builder.add(WATERLOGGED);
    }

    @Override
    public BlockState getStateForPlacement(BlockPlaceContext context) {
        BlockState state = super.getStateForPlacement(context);
        return state == null ? null : withWater(state, context);
    }

    /** {@code state} waterlogged when the placing position holds water (a source or flowing, as vanilla's blocks). */
    static BlockState withWater(BlockState state, BlockPlaceContext context) {
        return state.setValue(WATERLOGGED, context.getLevel().getFluidState(context.getClickedPos()).getType() == Fluids.WATER);
    }

    @Override
    protected BlockState updateShape(BlockState state, LevelReader level, ScheduledTickAccess ticks, BlockPos pos, Direction direction,
            BlockPos neighbourPos, BlockState neighbourState, RandomSource random) {
        if (state.getValue(WATERLOGGED)) {
            ticks.scheduleTick(pos, Fluids.WATER, Fluids.WATER.getTickDelay(level)); // the held water spreads
        }
        return super.updateShape(state, level, ticks, pos, direction, neighbourPos, neighbourState, random);
    }

    @Override
    protected FluidState getFluidState(BlockState state) {
        // the still water source (defaultFluidState compiles on 26.3 and 26.4; getSource changed between them)
        return state.getValue(WATERLOGGED) ? Fluids.WATER.defaultFluidState() : super.getFluidState(state);
    }
}
