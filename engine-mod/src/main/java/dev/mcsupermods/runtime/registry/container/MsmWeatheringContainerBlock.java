package dev.mcsupermods.runtime.registry.container;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.registry.weathering.Weathering;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.state.BlockState;

/**
 * A container that weathers like vanilla's copper chest (ADR 0104 D6, B513): every behaviour of {@link MsmContainerBlock},
 * ageing through {@link Weathering.Ageing}. Ageing, waxing, scraping and lightning go through {@code Weathering.replace},
 * which keeps the block entity's whole data (contents, custom name, lock), because vanilla's own change drops the contents
 * (measured at B503, X13). {@link Waterlogged} is the same for a container that also holds water. Made by
 * {@code Weathering.blockFor}; never a machine.
 */
public class MsmWeatheringContainerBlock extends MsmContainerBlock implements Weathering.Ageing {
    private final Weathering.Stage stage;

    public MsmWeatheringContainerBlock(Identifier id, BlockDefinition definition, Weathering.Stage stage, Properties properties) {
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

    /** A weathering container that also holds water ({@code msm:waterloggable}); the water is kept as it ages. */
    public static class Waterlogged extends MsmWaterloggedContainerBlock implements Weathering.Ageing {
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
