package dev.mcsupermods.runtime.gametest.spike4;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.LiquidBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.FlowingFluid;

/** B470 spike (throwaway): vanilla's LiquidBlock with a public constructor; counts entityInside calls per entity type. */
public class Spike4LiquidBlock extends LiquidBlock {
    public static final Map<String, AtomicInteger> INSIDE = new ConcurrentHashMap<>();

    public Spike4LiquidBlock(FlowingFluid fluid, Properties properties) {
        super(fluid, properties);
    }

    @Override
    protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier effects, boolean intersects) {
        INSIDE.computeIfAbsent(BuiltInRegistries.BLOCK.getKey(this).getPath() + "/" + BuiltInRegistries.ENTITY_TYPE.getKey(entity.getType()).getPath()
                + (level.isClientSide() ? "/client" : "/server"), k -> new AtomicInteger()).incrementAndGet();
        super.entityInside(state, level, pos, entity, effects, intersects);
    }
}
