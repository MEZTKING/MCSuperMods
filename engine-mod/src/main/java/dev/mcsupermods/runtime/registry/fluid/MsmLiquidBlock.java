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
import net.minecraft.world.level.block.LiquidBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.FlowingFluid;

/**
 * The liquid block of a project fluid (ADR 0099 D1): vanilla's {@code LiquidBlock} (flow, buckets, pickup sound, the
 * fluid's own entity effects through {@code super}) plus {@code on_entity_inside}. The event fires on the server only,
 * at most every {@link FluidDefinition#INSIDE_COOLDOWN_TICKS} ticks for the same entity however many of the fluid's
 * blocks it touches, under the shared tick cap (ADR 0061 D4), with the entity as the actor (self, and other when living;
 * ADR 0058 D1) and offsets from the block it is in.
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
    protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier effects,
            boolean intersects) {
        super.entityInside(state, level, pos, entity, effects, intersects);
        var event = definition.onEntityInside();
        if (event.isPresent() && level instanceof ServerLevel server
                && insideCooldowns.tryFire(server.dimension(), ANY_BLOCK, entity.getUUID(), server.getGameTime(),
                        FluidDefinition.INSIDE_COOLDOWN_TICKS)
                && TickLimiter.tryFire(server)) {
            EventRunner.fire(id, definition.events(), event.get(), EventContext.forBlockActor(server, pos, entity));
        }
    }
}
