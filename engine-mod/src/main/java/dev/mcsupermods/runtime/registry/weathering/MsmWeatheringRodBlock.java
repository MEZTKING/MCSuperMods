package dev.mcsupermods.runtime.registry.weathering;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.registry.types.MsmRodBlock;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.state.BlockState;

/**
 * A weathering rod ({@code type: "rod"} with {@code msm:weathering}), as vanilla's copper lightning rod: an
 * {@link MsmRodBlock} that ages, keeping its facing. A bolt that strikes it sends it to its first stage ({@link Lightning}). Ages through {@link Weathering.Ageing} at vanilla copper's rate, keeping every state property (ADR 0104 D1;
 * measured at B503, X6).
 */
public class MsmWeatheringRodBlock extends MsmRodBlock implements Weathering.Ageing {
    private final Weathering.Stage stage;

    public MsmWeatheringRodBlock(Identifier id, BlockDefinition definition, Weathering.Stage stage, Properties properties) {
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
