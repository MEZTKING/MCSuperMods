package dev.mcsupermods.runtime.registry.weathering;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.registry.types.MsmButtonBlock;
import net.minecraft.world.level.block.state.properties.BlockSetType;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.state.BlockState;

/**
 * A weathering button ({@code type: "button"} with {@code msm:weathering}): an {@link MsmButtonBlock} that ages,
 * keeping its face, facing and powered state; a pressed button that changes stage still lets go
 * ({@link Weathering#afterChange}). Ages through {@link Weathering.Ageing} at vanilla copper's rate, keeping every state property (ADR 0104 D1;
 * measured at B503, X6).
 */
public class MsmWeatheringButtonBlock extends MsmButtonBlock implements Weathering.Ageing, Weathering.Pressed {
    private final Weathering.Stage stage;
    private final int pressTicks;

    public MsmWeatheringButtonBlock(Identifier id, BlockDefinition definition, Weathering.Stage stage, BlockSetType setType, int pressTicks, Properties properties) {
        super(id, definition, setType, pressTicks, properties);
        this.stage = stage;
        this.pressTicks = pressTicks;
    }

    @Override
    public Weathering.Stage weatheringStage() {
        return stage;
    }

    /** The ticks the button stays pressed; read by {@link Weathering#afterChange} when a pressed button changes stage. */
    @Override
    public int pressedTicks() {
        return pressTicks;
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
