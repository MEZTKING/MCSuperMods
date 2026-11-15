package dev.mcsupermods.runtime.registry.weathering;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.registry.types.MsmStairBlock;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Weathering stairs ({@code type: "stairs"} with {@code msm:weathering}): {@link MsmStairBlock} that age, keeping their facing, half, shape and water. Ages through {@link Weathering.Ageing} (ADR 0094 D8).
 */
public class MsmWeatheringStairBlock extends MsmStairBlock implements Weathering.Ageing {
    private final Weathering.Stage stage;

    public MsmWeatheringStairBlock(Identifier id, BlockDefinition definition, Weathering.Stage stage, BlockState base, Properties properties) {
        super(id, definition, base, properties);
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
