package dev.mcsupermods.runtime.registry.weathering;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.registry.types.MsmChainBlock;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.state.BlockState;

/**
 * A weathering chain ({@code type: "chain"} with {@code msm:weathering}): an {@link MsmChainBlock} that ages, keeping its axis and water; it replaces the chain class for such definitions (B446). Ages through {@link Weathering.Ageing} (ADR 0094 D8).
 */
public class MsmWeatheringChainBlock extends MsmChainBlock implements Weathering.Ageing {
    private final Weathering.Stage stage;

    public MsmWeatheringChainBlock(Identifier id, BlockDefinition definition, Weathering.Stage stage, Properties properties) {
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
