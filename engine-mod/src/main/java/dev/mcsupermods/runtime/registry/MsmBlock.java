package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.components.BlockComponents;
import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.BlockType;
import dev.mcsupermods.runtime.registry.types.DrivenBlock;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.function.UnaryOperator;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionResult;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Mirror;
import net.minecraft.world.level.block.RotatedPillarBlock;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.BooleanProperty;
import net.minecraft.world.level.block.state.properties.EnumProperty;
import net.minecraft.world.level.redstone.Orientation;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * Block class for every {@code msm/<ns>/block/*.json} definition of the types {@code block}, {@code pillar},
 * {@code horizontal} and {@code directional} (ADR 0067 D4): shapes, the POWERED property and, for the rotating types, the
 * AXIS or FACING property with placement, {@code rotate}, {@code mirror} and per-state shapes live here; events, triggers
 * and redstone are delegated to {@link BlockBehaviourDriver}. Vanilla {@code Block} overrides cover every component, so
 * no Mixin is needed.
 */
public class MsmBlock extends Block implements DrivenBlock {
    /** Present only on blocks with {@code msm:redstone} events: the last seen neighbour power. */
    public static final BooleanProperty POWERED = BlockBehaviourDriver.POWERED;
    /** {@code pillar}: the axis of the clicked face, as logs. */
    public static final EnumProperty<Direction.Axis> AXIS = BlockStateProperties.AXIS;
    /** {@code horizontal}: four ways, towards the placer, as a furnace. */
    public static final EnumProperty<Direction> HORIZONTAL_FACING = BlockStateProperties.HORIZONTAL_FACING;
    /** {@code directional}: six ways, towards the placer, as a dropper. */
    public static final EnumProperty<Direction> FACING = BlockStateProperties.FACING;

    /** The state definition is built inside {@code super(...)}, before fields exist; this carries the choice in. */
    private record Setup(boolean tracksPower, BlockType type) {}

    private static final ThreadLocal<Setup> SETUP = ThreadLocal.withInitial(() -> new Setup(false, BlockType.BLOCK));

    private final BlockBehaviourDriver driver;
    /** {@link BlockType#PILLAR}, {@link BlockType#HORIZONTAL}, {@link BlockType#DIRECTIONAL} or {@link BlockType#BLOCK}. */
    private final BlockType type;
    /** {@code msm:shape} (ADR 0059 D3): the outline for every state; null without the component (vanilla's full cube). */
    private final VoxelShape shape;
    /** {@code msm:shape} on a rotating type (ADR 0067 D3): the outline per axis or facing, precomputed. */
    private final Map<Direction.Axis, VoxelShape> shapeByAxis;
    private final Map<Direction, VoxelShape> shapeByFacing;
    /** {@code msm:shape} {@code see_through}: light passes, faces between two of these blocks are skipped. */
    private final boolean seeThrough;

    /**
     * A block of {@code type}; any type without a block class of its own ({@link BlockType#shaped()} or one not
     * registered yet) is created as a plain {@link BlockType#BLOCK}.
     */
    public static MsmBlock create(Identifier id, BlockDefinition definition, Properties properties) {
        BlockType type = definition.type().shaped() ? definition.type() : BlockType.BLOCK;
        SETUP.set(new Setup(definition.components().reactsToRedstone(), type));
        try {
            return new MsmBlock(id, definition, type, properties);
        } finally {
            SETUP.remove();
        }
    }

    private MsmBlock(Identifier id, BlockDefinition definition, BlockType type, Properties properties) {
        super(properties);
        this.driver = new BlockBehaviourDriver(id, definition);
        this.type = type;
        BlockComponents c = definition.components();
        this.seeThrough = c.shape().map(BlockComponents.Shape::seeThrough).orElse(false);
        VoxelShape base = c.shape().map(MsmBlock::voxelShape).orElse(null);
        Map<Direction.Axis, VoxelShape> byAxis = null;
        Map<Direction, VoxelShape> byFacing = null;
        if (base != null && type == BlockType.PILLAR) {
            byAxis = new EnumMap<>(Direction.Axis.class);
            for (Direction.Axis axis : Direction.Axis.values()) {
                byAxis.put(axis, voxelShape(c.shape().get(), pillarTurn(axis)));
            }
        } else if (base != null && (type == BlockType.HORIZONTAL || type == BlockType.DIRECTIONAL)) {
            byFacing = new EnumMap<>(Direction.class);
            for (Direction facing : Direction.values()) {
                byFacing.put(facing, voxelShape(c.shape().get(), facingTurn(facing)));
            }
        }
        this.shape = base;
        this.shapeByAxis = byAxis;
        this.shapeByFacing = byFacing;
        BlockState state = stateDefinition.any();
        if (driver.tracksPower()) {
            state = state.setValue(POWERED, false);
        }
        switch (type) {
            case PILLAR -> state = state.setValue(AXIS, Direction.Axis.Y);
            case HORIZONTAL -> state = state.setValue(HORIZONTAL_FACING, Direction.NORTH);
            case DIRECTIONAL -> state = state.setValue(FACING, Direction.NORTH);
            default -> {}
        }
        registerDefaultState(state);
    }

    /** The type this block was built as: {@code block}, {@code pillar}, {@code horizontal} or {@code directional}. */
    public BlockType type() {
        return type;
    }

    public Identifier id() {
        return driver.id();
    }

    public BlockDefinition definition() {
        return driver.definition();
    }

    /** The shared events, triggers and redstone behaviour (ADR 0067 D4). */
    @Override
    public BlockBehaviourDriver driver() {
        return driver;
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
        Setup setup = SETUP.get();
        if (setup.tracksPower()) {
            builder.add(POWERED);
        }
        switch (setup.type()) {
            case PILLAR -> builder.add(AXIS);
            case HORIZONTAL -> builder.add(HORIZONTAL_FACING);
            case DIRECTIONAL -> builder.add(FACING);
            default -> {}
        }
    }

    // Placement, rotate and mirror for the rotating types (ADR 0067 D4)

    @Override
    public BlockState getStateForPlacement(BlockPlaceContext context) {
        BlockState state = defaultBlockState();
        return switch (type) {
            case PILLAR -> state.setValue(AXIS, context.getClickedFace().getAxis());
            case HORIZONTAL -> state.setValue(HORIZONTAL_FACING, context.getHorizontalDirection().getOpposite());
            case DIRECTIONAL -> state.setValue(FACING, context.getNearestLookingDirection().getOpposite());
            default -> state;
        };
    }

    @Override
    protected BlockState rotate(BlockState state, Rotation rotation) {
        return switch (type) {
            case PILLAR -> RotatedPillarBlock.rotatePillar(state, rotation);
            case HORIZONTAL -> state.setValue(HORIZONTAL_FACING, rotation.rotate(state.getValue(HORIZONTAL_FACING)));
            case DIRECTIONAL -> state.setValue(FACING, rotation.rotate(state.getValue(FACING)));
            default -> state;
        };
    }

    @Override
    protected BlockState mirror(BlockState state, Mirror mirror) {
        return switch (type) {
            case HORIZONTAL -> state.rotate(mirror.getRotation(state.getValue(HORIZONTAL_FACING)));
            case DIRECTIONAL -> state.rotate(mirror.getRotation(state.getValue(FACING)));
            default -> state;
        };
    }

    /**
     * The union of the pixel boxes; the full cube when {@code boxes} is absent. Each axis is ordered first (the format
     * does not require {@code x1 <= x2}), so a box written corner to corner either way is the same box.
     */
    static VoxelShape voxelShape(BlockComponents.Shape spec) {
        return voxelShape(spec, UnaryOperator.identity());
    }

    /** The boxes, each ordered and then turned by {@code turn} (pixels, about the block centre), as one shape. */
    static VoxelShape voxelShape(BlockComponents.Shape spec, UnaryOperator<double[]> turn) {
        VoxelShape out = Shapes.empty();
        for (List<Float> b : spec.boxesOrFullCube()) {
            double[] box = turn.apply(ordered(new double[] {b.get(0), b.get(1), b.get(2), b.get(3), b.get(4), b.get(5)}));
            out = Shapes.or(out, Block.box(box[0], box[1], box[2], box[3], box[4], box[5]));
        }
        return out.optimize();
    }

    private static double[] ordered(double[] b) {
        return new double[] {Math.min(b[0], b[3]), Math.min(b[1], b[4]), Math.min(b[2], b[5]),
                Math.max(b[0], b[3]), Math.max(b[1], b[4]), Math.max(b[2], b[5])};
    }

    /** A quarter turn about Y as a model's {@code y: 90} (north to east): {@code (x, z) -> (16 - z, x)}. */
    static double[] turnY(double[] b) {
        return new double[] {16 - b[5], b[1], b[0], 16 - b[2], b[4], b[3]};
    }

    /** A quarter turn about X as a model's {@code x: 90} (north to down, up to north): {@code (y, z) -> (z, 16 - y)}. */
    static double[] turnX(double[] b) {
        return new double[] {b[0], b[2], 16 - b[4], b[3], b[5], 16 - b[1]};
    }

    /** Boxes written for axis {@code y} turned to {@code axis}, as the pillar blockstate turns its model. */
    static UnaryOperator<double[]> pillarTurn(Direction.Axis axis) {
        return switch (axis) {
            case Y -> UnaryOperator.identity();
            case Z -> MsmBlock::turnX;
            case X -> b -> turnY(turnX(b));
        };
    }

    /** Boxes written facing north turned to {@code facing}, as the facing blockstates turn their model. */
    static UnaryOperator<double[]> facingTurn(Direction facing) {
        return switch (facing) {
            case NORTH -> UnaryOperator.identity();
            case EAST -> MsmBlock::turnY;
            case SOUTH -> b -> turnY(turnY(b));
            case WEST -> b -> turnY(turnY(turnY(b)));
            case DOWN -> MsmBlock::turnX;
            case UP -> b -> turnX(turnX(turnX(b)));
        };
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
        if (shapeByAxis != null) {
            return shapeByAxis.get(state.getValue(AXIS));
        }
        if (shapeByFacing != null) {
            return shapeByFacing.get(state.getValue(type == BlockType.HORIZONTAL ? HORIZONTAL_FACING : FACING));
        }
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

    // Events, triggers and redstone: delegated to the driver (ADR 0067 D4).

    @Override
    protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
        return driver.useWithoutItem(level, pos, player);
    }

    @Override
    public void stepOn(Level level, BlockPos pos, BlockState state, Entity entity) {
        driver.stepOn(level, pos, entity);
        super.stepOn(level, pos, state, entity);
    }

    @Override
    public BlockState playerWillDestroy(Level level, BlockPos pos, BlockState state, Player player) {
        driver.playerWillDestroy(level, pos, player);
        return super.playerWillDestroy(level, pos, state, player);
    }

    @Override
    public void setPlacedBy(Level level, BlockPos pos, BlockState state, LivingEntity placer, ItemStack stack) {
        super.setPlacedBy(level, pos, state, placer, stack);
        driver.setPlacedBy(level, pos, placer);
    }

    @Override
    protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
        super.randomTick(state, level, pos, random);
        driver.randomTick(level, pos, random);
    }

    @Override
    protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier effects,
            boolean intersects) {
        super.entityInside(state, level, pos, entity, effects, intersects);
        driver.entityInside(level, pos, entity);
    }

    @Override
    protected boolean isSignalSource(BlockState state) {
        return driver.isSignalSource();
    }

    @Override
    protected int getSignal(BlockState state, BlockGetter level, BlockPos pos, Direction direction) {
        return driver.getSignal();
    }

    @Override
    protected void onPlace(BlockState state, Level level, BlockPos pos, BlockState oldState, boolean movedByPiston) {
        super.onPlace(state, level, pos, oldState, movedByPiston);
        driver.onPlace(this, state, level, pos, oldState);
    }

    @Override
    protected void neighborChanged(BlockState state, Level level, BlockPos pos, Block neighbour, Orientation orientation,
            boolean movedByPiston) {
        super.neighborChanged(state, level, pos, neighbour, orientation, movedByPiston);
        driver.neighborChanged(state, level, pos);
    }
}
