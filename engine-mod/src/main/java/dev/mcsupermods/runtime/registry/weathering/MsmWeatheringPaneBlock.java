package dev.mcsupermods.runtime.registry.weathering;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.registry.types.MsmPaneBlock;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Weathering bars ({@code type: "pane"} with {@code msm:weathering}): an {@link MsmPaneBlock} that ages, as vanilla's copper bars, keeping its connections and water. Ages through {@link Weathering.Ageing} (ADR 0094 D8).
 */
public class MsmWeatheringPaneBlock extends MsmPaneBlock implements Weathering.Ageing {
    private final Weathering.Stage stage;

    public MsmWeatheringPaneBlock(Identifier id, BlockDefinition definition, Weathering.Stage stage, Properties properties) {
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
