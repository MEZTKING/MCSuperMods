package dev.mcsupermods.runtime.registry.fluid;

import java.util.function.Supplier;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.material.Fluid;
import net.minecraft.world.level.material.FluidState;

/**
 * Version seam (ADR 0038 D2, ADR 0099 D2), 26.3: the flowing fluid of a project fluid, registered as
 * {@code <ns>:flowing_<path>}; it behaves as its source {@link MsmFluid} except that it carries a {@code level} and is
 * never a source. It exists on 26.3 only; 26.4's single {@code MsmFluid} covers both states, so shared code never names
 * this class.
 */
public final class MsmFlowingFluid extends MsmFluid {
    MsmFlowingFluid(FluidDefinition definition, Pair pair, Supplier<Block> block, Supplier<Item> bucket) {
        super(definition, pair, block, bucket);
    }

    @Override
    protected void createFluidStateDefinition(StateDefinition.Builder<Fluid, FluidState> builder) {
        super.createFluidStateDefinition(builder);
        builder.add(LEVEL);
    }

    @Override
    public boolean isSource(FluidState state) {
        return false;
    }

    @Override
    public int getAmount(FluidState state) {
        return state.getValue(LEVEL);
    }
}
