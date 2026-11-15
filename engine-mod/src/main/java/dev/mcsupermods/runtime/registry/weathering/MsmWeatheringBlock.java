package dev.mcsupermods.runtime.registry.weathering;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.registry.MsmBlock;
import dev.mcsupermods.runtime.registry.types.MsmWaterloggedBlock;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.state.BlockState;

/**
 * A weathering {@code block}, {@code pillar}, {@code horizontal} or {@code directional} block (ADR 0094 D8): every behaviour
 * of {@link MsmBlock}, aging through {@link Weathering.Ageing}. {@link Waterlogged} is the same for a block that is also
 * {@code msm:waterloggable} (as vanilla's copper grates). Never a container or machine.
 */
public class MsmWeatheringBlock extends MsmBlock implements Weathering.Ageing {
    private final Weathering.Stage stage;

    public MsmWeatheringBlock(Identifier id, BlockDefinition definition, Weathering.Stage stage, Properties properties) {
        super(id, definition, Setup.of(definition), properties);
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

    /** A weathering block that also holds water ({@code msm:waterloggable}, ADR 0094 D7); the water is kept as it ages. */
    public static class Waterlogged extends MsmWaterloggedBlock implements Weathering.Ageing {
        private final Weathering.Stage stage;

        public Waterlogged(Identifier id, BlockDefinition definition, Weathering.Stage stage, Properties properties) {
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
}
