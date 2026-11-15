package dev.mcsupermods.runtime.registry.weathering;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.registry.types.MsmDoorBlock;
import net.minecraft.world.level.block.state.properties.BlockSetType;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;
import dev.mcsupermods.runtime.registry.BlockExtras;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.ScheduledTickAccess;
import net.minecraft.world.level.block.state.BlockState;

/**
 * A weathering door ({@code type: "door"} with {@code msm:weathering}): an {@link MsmDoorBlock} that ages. Only the lower half random-ticks (vanilla's {@code changeOverTime} sets it); the upper half follows it into the next stage through {@link #updateShape}, and waxing and scraping turn both halves ({@link Weathering#replace}), keeping facing, hinge, open and powered. Ages through {@link Weathering.Ageing} (ADR 0094 D8).
 */
public class MsmWeatheringDoorBlock extends MsmDoorBlock implements Weathering.Ageing {
    private final Weathering.Stage stage;

    public MsmWeatheringDoorBlock(Identifier id, BlockDefinition definition, Weathering.Stage stage, BlockSetType setType, Properties properties) {
        super(id, definition, setType, properties);
        this.stage = stage;
    }

    @Override
    public Weathering.Stage weatheringStage() {
        return stage;
    }

    @Override
    protected boolean isRandomlyTicking(BlockState state) {
        return super.isRandomlyTicking(state) || (Weathering.ages(stage.id()) && state.getValue(HALF) == DoubleBlockHalf.LOWER);
    }

    @Override
    protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
        super.randomTick(state, level, pos, random);
        if (state.getValue(HALF) == DoubleBlockHalf.LOWER) {
            Weathering.randomTick(this, state, level, pos, random);
        }
    }

    /**
     * The upper half follows its lower half into the next stage: when the block below becomes the lower half of this
     * door's {@code next}, the upper half becomes that door's upper half (vanilla's door would otherwise vanish, its
     * lower half no longer being this block).
     */
    @Override
    protected BlockState updateShape(BlockState state, LevelReader level, ScheduledTickAccess ticks, BlockPos pos, Direction direction,
            BlockPos neighbourPos, BlockState neighbourState, RandomSource random) {
        if (direction == Direction.DOWN && state.getValue(HALF) == DoubleBlockHalf.UPPER && !neighbourState.is(this)
                && neighbourState.hasProperty(HALF) && neighbourState.getValue(HALF) == DoubleBlockHalf.LOWER
                && Weathering.next(stage.id()).filter(neighbourState::is).isPresent()) {
            return BlockExtras.copyProperties(state, neighbourState.getBlock().defaultBlockState());
        }
        return super.updateShape(state, level, ticks, pos, direction, neighbourPos, neighbourState, random);
    }
}
