package dev.mcsupermods.runtime.registry.weathering;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.registry.types.MsmFenceGateBlock;
import net.minecraft.world.level.block.state.properties.WoodType;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.state.BlockState;

/**
 * A weathering fence gate ({@code type: "fence_gate"} with {@code msm:weathering}): an {@link MsmFenceGateBlock} that
 * ages, keeping its facing, open, powered and in-wall state. Ages through {@link Weathering.Ageing} at vanilla copper's rate, keeping every state property (ADR 0104 D1;
 * measured at B503, X6).
 */
public class MsmWeatheringFenceGateBlock extends MsmFenceGateBlock implements Weathering.Ageing {
    private final Weathering.Stage stage;

    public MsmWeatheringFenceGateBlock(Identifier id, BlockDefinition definition, Weathering.Stage stage, WoodType woodType, Properties properties) {
        super(id, definition, woodType, properties);
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
