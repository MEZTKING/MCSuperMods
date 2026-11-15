package dev.mcsupermods.runtime.registry.weathering;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.registry.types.MsmTrapDoorBlock;
import net.minecraft.world.level.block.state.properties.BlockSetType;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.state.BlockState;

/**
 * A weathering trapdoor ({@code type: "trapdoor"} with {@code msm:weathering}): an {@link MsmTrapDoorBlock} that ages, keeping its facing, half, open, powered and water. Ages through {@link Weathering.Ageing} (ADR 0094 D8).
 */
public class MsmWeatheringTrapDoorBlock extends MsmTrapDoorBlock implements Weathering.Ageing {
    private final Weathering.Stage stage;

    public MsmWeatheringTrapDoorBlock(Identifier id, BlockDefinition definition, Weathering.Stage stage, BlockSetType setType, Properties properties) {
        super(id, definition, setType, properties);
        this.stage = stage;
    }

    @Override
    public Weathering.Stage weatheringStage() {
        return stage;
    }

    @Override
    protected boolean isRandomlyTicking(BlockState state) {
        return super.isRandomlyTicking(state) || Weathering.ages(stage.id());
    }

    @Override
    protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
        super.randomTick(state, level, pos, random);
        Weathering.randomTick(this, state, level, pos, random);
    }
}
