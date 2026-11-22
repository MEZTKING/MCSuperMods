package dev.mcsupermods.runtime.registry.weathering;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.registry.types.MsmPressurePlateBlock;
import dev.mcsupermods.runtime.registry.types.MsmWeightedPressurePlateBlock;
import net.minecraft.world.level.block.state.properties.BlockSetType;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.state.BlockState;

/**
 * A weathering pressure plate ({@code type: "pressure_plate"} with {@code msm:weathering}): an
 * {@link MsmPressurePlateBlock} that ages, keeping its powered state; {@link Weighted} is the same for a weighted plate. A
 * pressed plate that changes stage still lets go ({@link Weathering#afterChange}). Ages through {@link Weathering.Ageing} at vanilla copper's rate, keeping every state property (ADR 0104 D1;
 * measured at B503, X6).
 */
public class MsmWeatheringPressurePlateBlock extends MsmPressurePlateBlock implements Weathering.Ageing, Weathering.Pressed {
    private final Weathering.Stage stage;

    public MsmWeatheringPressurePlateBlock(Identifier id, BlockDefinition definition, Weathering.Stage stage, BlockSetType setType, Properties properties) {
        super(id, definition, setType, properties);
        this.stage = stage;
    }

    @Override
    public Weathering.Stage weatheringStage() {
        return stage;
    }

    /** Vanilla's pressed time of the plate; read by {@link Weathering#afterChange} when a pressed plate changes stage. */
    @Override
    public int pressedTicks() {
        return getPressedTime();
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

    /** A weathering weighted plate ({@code weighted_max} set): an {@link MsmWeightedPressurePlateBlock} that ages, keeping its power. */
    public static class Weighted extends MsmWeightedPressurePlateBlock implements Weathering.Ageing, Weathering.Pressed {
        private final Weathering.Stage stage;

        public Weighted(Identifier id, BlockDefinition definition, Weathering.Stage stage, int weightedMax, BlockSetType setType,
                Properties properties) {
            super(id, definition, weightedMax, setType, properties);
            this.stage = stage;
        }

        @Override
        public Weathering.Stage weatheringStage() {
            return stage;
        }

        @Override
        public int pressedTicks() {
            return getPressedTime();
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
}
