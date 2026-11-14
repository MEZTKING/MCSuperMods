package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.components.BlockComponents;
import dev.mcsupermods.runtime.events.CooldownMap;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.events.TickLimiter;
import dev.mcsupermods.runtime.loader.BlockDefinition;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.BooleanProperty;

/**
 * The behaviour every {@code msm/<ns>/block/*.json} definition shares, whatever block class carries it (ADR 0067 D4):
 * events, triggers, the step and inside cooldowns, light and redstone. One instance per block. The block class
 * overrides the vanilla callback, calls {@code super} where vanilla needs it and delegates here; the methods are named
 * after those callbacks and never call vanilla themselves.
 */
public final class BlockBehaviourDriver {
    /** Present only on blocks with {@code msm:redstone} events: the last seen neighbour power. */
    public static final BooleanProperty POWERED = BlockStateProperties.POWERED;

    private final Identifier id;
    private final BlockDefinition definition;
    private final boolean tracksPower;
    private final int emit;
    private final int light;
    /** {@code msm:on_step} cooldowns per dimension, position and entity. Server thread only. */
    private final CooldownMap stepCooldowns = new CooldownMap();
    /** {@code msm:on_entity_inside} cooldowns per dimension, position and entity (ADR 0061 D2). Server thread only. */
    private final CooldownMap insideCooldowns = new CooldownMap();

    public BlockBehaviourDriver(Identifier id, BlockDefinition definition) {
        this.id = id;
        this.definition = definition;
        BlockComponents c = definition.components();
        this.tracksPower = c.reactsToRedstone();
        this.emit = c.emit();
        this.light = c.lightEmitter().map(BlockComponents.LightEmitter::level).orElse(0);
    }

    public Identifier id() {
        return id;
    }

    public BlockDefinition definition() {
        return definition;
    }

    /** True when the block carries {@link #POWERED} ({@code msm:redstone} with events). */
    public boolean tracksPower() {
        return tracksPower;
    }

    /** The {@code msm:light_emitter} level, 0 without the component. */
    public int lightLevel() {
        return light;
    }

    // msm:on_interact

    /** {@code useWithoutItem}: {@code PASS} without {@code msm:on_interact}, else fires on the server and succeeds. */
    public InteractionResult useWithoutItem(Level level, BlockPos pos, Player player) {
        var interact = definition.components().onInteract();
        if (interact.isEmpty()) {
            return InteractionResult.PASS;
        }
        if (level instanceof ServerLevel server) {
            EventRunner.fire(id, definition.events(), interact.get().event(), EventContext.forBlock(server, pos, player));
        }
        return InteractionResult.SUCCESS;
    }

    // msm:on_step

    /** {@code stepOn}, before {@code super}. */
    public void stepOn(Level level, BlockPos pos, Entity entity) {
        var step = definition.components().onStep();
        if (step.isPresent() && level instanceof ServerLevel server
                && stepCooldowns.tryFire(server.dimension(), pos, entity.getUUID(), server.getGameTime(), step.get().cooldownTicks())) {
            // ADR 0058 D1: the stepper is the event's player or entity, and its other entity when living.
            EventRunner.fire(id, definition.events(), step.get().event(), EventContext.forBlockStep(server, pos, entity));
        }
    }

    // msm:on_break (ADR 0061 D2): playerWillDestroy runs in every game mode, before the block is removed.

    /** {@code playerWillDestroy}, before {@code super}. */
    public void playerWillDestroy(Level level, BlockPos pos, Player player) {
        var onBreak = definition.components().onBreak();
        if (onBreak.isPresent() && level instanceof ServerLevel server) {
            EventRunner.fire(id, definition.events(), onBreak.get().event(), EventContext.forBlock(server, pos, player));
        }
    }

    // msm:on_place (ADR 0061 D2): the placer, a player or another entity, is the actor; it may be null.

    /** {@code setPlacedBy}, after {@code super}. */
    public void setPlacedBy(Level level, BlockPos pos, LivingEntity placer) {
        var onPlace = definition.components().onPlace();
        if (onPlace.isPresent() && level instanceof ServerLevel server) {
            EventRunner.fire(id, definition.events(), onPlace.get().event(), EventContext.forBlockActor(server, pos, placer));
        }
    }

    // msm:on_random_tick (ADR 0061 D2): the registrar sets Properties.randomTicks() only with the component.

    /** {@code randomTick}, after {@code super}. */
    public void randomTick(ServerLevel level, BlockPos pos, RandomSource random) {
        var onTick = definition.components().onRandomTick();
        if (onTick.isEmpty()) {
            return;
        }
        float chance = onTick.get().chance();
        if (chance <= 0 || (chance < 1 && random.nextFloat() >= chance)) {
            return;
        }
        if (TickLimiter.tryFire(level)) {
            EventRunner.fire(id, definition.events(), onTick.get().event(), EventContext.forBlock(level, pos, null));
        }
    }

    // msm:on_entity_inside (ADR 0061 D2): per entity cooldown, the step actor rule (ADR 0058 D1), the shared tick cap.

    /** {@code entityInside}, after {@code super}. */
    public void entityInside(Level level, BlockPos pos, Entity entity) {
        var inside = definition.components().onEntityInside();
        if (inside.isPresent() && level instanceof ServerLevel server
                && insideCooldowns.tryFire(server.dimension(), pos, entity.getUUID(), server.getGameTime(), inside.get().cooldownTicks())
                && TickLimiter.tryFire(server)) {
            EventRunner.fire(id, definition.events(), inside.get().event(), EventContext.forBlockActor(server, pos, entity));
        }
    }

    // msm:redstone

    /** {@code isSignalSource}: a constant {@code emit} above 0. */
    public boolean isSignalSource() {
        return emit > 0;
    }

    /** {@code getSignal}: the constant {@code emit} on every side. */
    public int getSignal() {
        return emit;
    }

    /**
     * {@code onPlace}, after {@code super}. Placement is not a neighbour update: records the current power without
     * firing an event.
     */
    public void onPlace(Block block, BlockState state, Level level, BlockPos pos, BlockState oldState) {
        if (tracksPower && !oldState.is(block) && level instanceof ServerLevel) {
            boolean powered = level.hasNeighborSignal(pos);
            if (powered != state.getValue(POWERED)) {
                level.setBlock(pos, state.setValue(POWERED, powered), Block.UPDATE_CLIENTS);
            }
        }
    }

    /** {@code neighborChanged}, after {@code super}: updates {@link #POWERED} and fires the transition's event. */
    public void neighborChanged(BlockState state, Level level, BlockPos pos) {
        if (!tracksPower || !(level instanceof ServerLevel server)) {
            return;
        }
        boolean powered = level.hasNeighborSignal(pos);
        if (powered == state.getValue(POWERED)) {
            return;
        }
        level.setBlock(pos, state.setValue(POWERED, powered), Block.UPDATE_CLIENTS);
        BlockComponents.Redstone redstone = definition.components().redstone().orElseThrow();
        (powered ? redstone.onPowered() : redstone.onUnpowered()).ifPresent(event ->
                EventRunner.fire(id, definition.events(), event, EventContext.forBlock(server, pos, null)));
    }
}
