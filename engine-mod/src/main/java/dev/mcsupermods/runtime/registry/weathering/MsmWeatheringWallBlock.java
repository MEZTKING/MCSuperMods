package dev.mcsupermods.runtime.registry.weathering;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.registry.types.MsmWallBlock;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.state.BlockState;

/**
 * A weathering wall ({@code type: "wall"} with {@code msm:weathering}): an {@link MsmWallBlock} that ages, keeping
 * its sides, post and water. Ages through {@link Weathering.Ageing} at vanilla copper's rate, keeping every state property (ADR 0104 D1;
 * measured at B503, X6).
 */
public class MsmWeatheringWallBlock extends MsmWallBlock implements Weathering.Ageing {
    private final Weathering.Stage stage;

    public MsmWeatheringWallBlock(Identifier id, BlockDefinition definition, Weathering.Stage stage, Properties properties) {
        super(id, definition, properties);
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
