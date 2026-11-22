package dev.mcsupermods.runtime.registry.fluid;

import dev.mcsupermods.runtime.events.CooldownMap;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.events.TickLimiter;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.LiquidBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.FlowingFluid;
import net.minecraft.world.level.redstone.Orientation;

/**
 * The liquid block of a project fluid (ADR 0099 D1): vanilla's {@code LiquidBlock} (flow, buckets, pickup sound, the
 * fluid's own entity effects through {@code super}) plus {@code on_entity_inside}. The event fires on the server only,
 * at most every {@link FluidDefinition#INSIDE_COOLDOWN_TICKS} ticks for the same entity however many of the fluid's
 * blocks it touches, under the shared tick cap (ADR 0061 D4), with the entity as the actor (self, and other when living;
 * ADR 0058 D1) and offsets from the block it is in.
 *
 * <p>Mixing (ADR 0108 D1 as amended after B525): with {@code mixing} set, {@link #onPlace} and {@link #neighborChanged}
 * run {@link FluidMixing}'s own check and, when nothing mixed, only schedule the fluid tick; vanilla's own liquid checks
 * ({@code super}) never run, so 26.3 and 26.4 behave alike. Without {@code mixing} both stay vanilla's (26.3 lava-like
 * fluids then still make obsidian and cobblestone with water, 26.4 ones do not; ADR 0099 findings).
 */
public final class MsmLiquidBlock extends LiquidBlock {
    /** Where every entity's cooldown is kept: one entry per entity and dimension, not per block. */
    private static final BlockPos ANY_BLOCK = BlockPos.ZERO;

    private final Identifier id;
    private final FluidDefinition definition;
    /** {@code on_entity_inside} cooldowns per dimension and entity. Server thread only. */
    private final CooldownMap insideCooldowns = new CooldownMap();

    MsmLiquidBlock(FlowingFluid fluid, Properties properties, Identifier id, FluidDefinition definition) {
        super(fluid, properties);
        this.id = id;
        this.definition = definition;
    }

    public Identifier id() {
        return id;
    }

    public FluidDefinition definition() {
        return definition;
    }

    /** The fluid this block holds (the source fluid; on 26.3 also the flowing one's partner). */
    public FlowingFluid fluid() {
        return fluid;
    }

    @Override
    protected void onPlace(BlockState state, Level level, BlockPos pos, BlockState old, boolean movedByPiston) {
        if (!FluidMixing.hasRules(this)) {
            super.onPlace(state, level, pos, old, movedByPiston);
        } else if (!FluidMixing.mix(this, level, pos, state)) {
            scheduleFluidTick(state, level, pos);
        }
    }

    @Override
    protected void neighborChanged(BlockState state, Level level, BlockPos pos, Block block, Orientation orientation, boolean movedByPiston) {
        if (!FluidMixing.hasRules(this)) {
            super.neighborChanged(state, level, pos, block, orientation, movedByPiston);
        } else if (!FluidMixing.mix(this, level, pos, state)) {
            scheduleFluidTick(state, level, pos);
        }
    }

    private void scheduleFluidTick(BlockState state, Level level, BlockPos pos) {
        level.scheduleTick(pos, state.getFluidState().getType(), fluid.getTickDelay(level));
    }

    @Override
    protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier effects,
            boolean intersects) {
        super.entityInside(state, level, pos, entity, effects, intersects);
        fireInside(level, pos, entity);
    }

    /**
     * {@code on_entity_inside} for an entity in this fluid or in its cauldron ({@link MsmCauldronBlock}): one cooldown
     * per entity for both, under the shared tick cap; server only.
     */
    void fireInside(Level level, BlockPos pos, Entity entity) {
        var event = definition.onEntityInside();
        if (event.isPresent() && level instanceof ServerLevel server
                && insideCooldowns.tryFire(server.dimension(), ANY_BLOCK, entity.getUUID(), server.getGameTime(),
                        FluidDefinition.INSIDE_COOLDOWN_TICKS)
                && TickLimiter.tryFire(server)) {
            EventRunner.fire(id, definition.events(), event.get(), EventContext.forBlockActor(server, pos, entity));
        }
    }
}
