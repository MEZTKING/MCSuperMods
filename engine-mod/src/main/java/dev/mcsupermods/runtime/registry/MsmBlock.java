package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.components.BlockComponents;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.loader.BlockDefinition;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.BooleanProperty;
import net.minecraft.world.level.redstone.Orientation;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * Driver class for every {@code msm/<ns>/block/*.json} definition: dispatches game callbacks to
 * the definition's components. Vanilla {@code Block} overrides cover every v1 component, so no
 * Mixin is needed.
 */
public class MsmBlock extends Block {
    /** Present only on blocks with {@code msm:redstone} events: the last seen neighbour power. */
    public static final BooleanProperty POWERED = BlockStateProperties.POWERED;

    /** The state definition is built inside {@code super(...)}, before fields exist; this carries the choice in. */
    private static final ThreadLocal<Boolean> TRACKS_POWER = ThreadLocal.withInitial(() -> false);

    private final Identifier id;
    private final BlockDefinition definition;
    private final boolean tracksPower;
    private final int emit;
    /** {@code msm:shape} (ADR 0059 D3): the outline for every state; null without the component (vanilla's full cube). */
    private final VoxelShape shape;
    /** {@code msm:shape} {@code see_through}: light passes, faces between two of these blocks are skipped. */
    private final boolean seeThrough;
    /** Last step tick per dimension, position and entity, for {@code msm:on_step} cooldowns. Server thread only. */
    private final Map<StepKey, Long> lastStep = new HashMap<>();

    private record StepKey(ResourceKey<Level> dimension, long pos, UUID entity) {}

    public static MsmBlock create(Identifier id, BlockDefinition definition, Properties properties) {
        TRACKS_POWER.set(definition.components().reactsToRedstone());
        try {
            return new MsmBlock(id, definition, properties);
        } finally {
            TRACKS_POWER.remove();
        }
    }

    private MsmBlock(Identifier id, BlockDefinition definition, Properties properties) {
        super(properties);
        this.id = id;
        this.definition = definition;
        BlockComponents c = definition.components();
        this.tracksPower = c.reactsToRedstone();
        this.emit = c.emit();
        this.shape = c.shape().map(MsmBlock::voxelShape).orElse(null);
        this.seeThrough = c.shape().map(BlockComponents.Shape::seeThrough).orElse(false);
        if (tracksPower) {
            registerDefaultState(stateDefinition.any().setValue(POWERED, false));
        }
    }

    public Identifier id() {
        return id;
    }

    public BlockDefinition definition() {
        return definition;
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
        if (TRACKS_POWER.get()) {
            builder.add(POWERED);
        }
    }

    /**
     * The union of the pixel boxes; the full cube when {@code boxes} is absent. Each axis is ordered first (the format
     * does not require {@code x1 <= x2}), so a box written corner to corner either way is the same box.
     */
    static VoxelShape voxelShape(BlockComponents.Shape spec) {
        VoxelShape out = Shapes.empty();
        for (var b : spec.boxesOrFullCube()) {
            out = Shapes.or(out, Block.box(
                    Math.min(b.get(0), b.get(3)), Math.min(b.get(1), b.get(4)), Math.min(b.get(2), b.get(5)),
                    Math.max(b.get(0), b.get(3)), Math.max(b.get(1), b.get(4)), Math.max(b.get(2), b.get(5))));
        }
        return out.optimize();
    }

    /** The {@code BlockBehaviour.Properties} that {@code msm:shape} needs (ADR 0059 D3); unchanged without it. */
    static Properties shapeProperties(Properties props, BlockComponents components) {
        if (components.shape().isEmpty()) {
            return props;
        }
        BlockComponents.Shape spec = components.shape().get();
        if (!spec.collision()) {
            props = props.noCollision(); // also clears canOcclude, as for vanilla plants
        }
        if (spec.seeThrough()) {
            // The predicates vanilla glass sets (Blocks.GLASS), plus isViewBlocking (vanilla derives it from isSuffocating).
            // isValidSpawn never: no mob spawns on a glass-like block, as on glass.
            props = props.noOcclusion()
                    .isValidSpawn((state, level, pos, type) -> false)
                    .isSuffocating((state, level, pos) -> false)
                    .isViewBlocking((state, level, pos, box) -> false)
                    .isRedstoneConductor((state, level, pos) -> false);
        }
        return props;
    }

    // msm:shape

    @Override
    protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
        return shape != null ? shape : super.getShape(state, level, pos, context);
    }

    // Collision: vanilla's getCollisionShape returns getShape, or nothing after Properties.noCollision().

    @Override
    protected VoxelShape getVisualShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
        return seeThrough ? Shapes.empty() : super.getVisualShape(state, level, pos, context);
    }

    @Override
    protected boolean propagatesSkylightDown(BlockState state) {
        return seeThrough || super.propagatesSkylightDown(state);
    }

    @Override
    protected float getShadeBrightness(BlockState state, BlockGetter level, BlockPos pos) {
        return seeThrough ? 1.0f : super.getShadeBrightness(state, level, pos);
    }

    @Override
    protected boolean skipRendering(BlockState state, BlockState adjacent, Direction direction) {
        // The glass rule (HalfTransparentBlock): no face between two blocks of the same definition.
        return (seeThrough && adjacent.is(this)) || super.skipRendering(state, adjacent, direction);
    }

    // msm:on_interact

    @Override
    protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
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

    @Override
    public void stepOn(Level level, BlockPos pos, BlockState state, Entity entity) {
        var step = definition.components().onStep();
        if (step.isPresent() && level instanceof ServerLevel server) {
            long now = server.getGameTime();
            int cooldown = step.get().cooldownTicks();
            StepKey key = new StepKey(server.dimension(), pos.asLong(), entity.getUUID());
            Long last = lastStep.get(key);
            if (last == null || now - last >= cooldown || now < last) {
                if (lastStep.size() > 1024) {
                    lastStep.values().removeIf(t -> now - t >= cooldown);
                }
                lastStep.put(key, now);
                // ADR 0058 D1: the stepper is the event's player or entity, and its other entity when living.
                EventRunner.fire(id, definition.events(), step.get().event(), EventContext.forBlockStep(server, pos, entity));
            }
        }
        super.stepOn(level, pos, state, entity);
    }

    // msm:redstone

    @Override
    protected boolean isSignalSource(BlockState state) {
        return emit > 0;
    }

    @Override
    protected int getSignal(BlockState state, BlockGetter level, BlockPos pos, Direction direction) {
        return emit;
    }

    @Override
    protected void onPlace(BlockState state, Level level, BlockPos pos, BlockState oldState, boolean movedByPiston) {
        super.onPlace(state, level, pos, oldState, movedByPiston);
        // Placement is not a neighbour update: record the current power without firing an event.
        if (tracksPower && !oldState.is(this) && level instanceof ServerLevel) {
            boolean powered = level.hasNeighborSignal(pos);
            if (powered != state.getValue(POWERED)) {
                level.setBlock(pos, state.setValue(POWERED, powered), UPDATE_CLIENTS);
            }
        }
    }

    @Override
    protected void neighborChanged(BlockState state, Level level, BlockPos pos, Block neighbour, Orientation orientation,
            boolean movedByPiston) {
        super.neighborChanged(state, level, pos, neighbour, orientation, movedByPiston);
        if (!tracksPower || !(level instanceof ServerLevel server)) {
            return;
        }
        boolean powered = level.hasNeighborSignal(pos);
        if (powered == state.getValue(POWERED)) {
            return;
        }
        level.setBlock(pos, state.setValue(POWERED, powered), UPDATE_CLIENTS);
        BlockComponents.Redstone redstone = definition.components().redstone().orElseThrow();
        (powered ? redstone.onPowered() : redstone.onUnpowered()).ifPresent(event ->
                EventRunner.fire(id, definition.events(), event, EventContext.forBlock(server, pos, null)));
    }
}
