package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.registry.BlockBehaviourDriver;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.item.FallingBlockEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ScaffoldingBlockItem;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.ScheduledTickAccess;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.ScaffoldingBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.Fluids;
import net.minecraft.world.phys.BlockHitResult;

/**
 * Scaffolding ({@code type: "scaffolding"}, ADR 0094 D1, D2): vanilla {@link ScaffoldingBlock}'s states ({@code distance}
 * 0 to 7, {@code bottom}, {@code waterlogged}), shapes, standing on top and climbing (by {@code #minecraft:climbable},
 * which the lowering adds). Vanilla counts the distance through its own scaffolding block only (B440), so the stability
 * rule is our own, written from ADR 0094 and the B440 notes: a block standing on a sturdy face (not scaffolding) has
 * distance 0; on this scaffolding it takes the distance of the one below; otherwise it is one more than its nearest
 * horizontal neighbour of this scaffolding. At 7 it cannot stay: a block placed there falls as a falling block, and one
 * that loses its support breaks and drops its item. Only blocks of this element count (as vanilla's scaffolding counts
 * only itself). The item is {@link PlacingItem}, which builds up a column or out along a row as vanilla's does.
 */
public class MsmScaffoldingBlock extends ScaffoldingBlock implements DrivenBlock {
    /** Distance at which scaffolding can no longer stay (vanilla's {@link ScaffoldingBlock#STABILITY_MAX_DISTANCE}). */
    public static final int MAX_DISTANCE = STABILITY_MAX_DISTANCE;

    private final BlockBehaviourDriver driver;

    public MsmScaffoldingBlock(Identifier id, BlockDefinition definition, Properties properties) {
        super(properties);
        this.driver = new BlockBehaviourDriver(id, definition);
    }

    @Override
    public BlockBehaviourDriver driver() {
        return driver;
    }

    /** The stability distance of this scaffolding at {@code pos}, counting only blocks of this element (see the class doc). */
    public int distance(BlockGetter level, BlockPos pos) {
        BlockPos below = pos.below();
        BlockState under = level.getBlockState(below);
        int distance = MAX_DISTANCE;
        if (under.is(this)) {
            distance = under.getValue(DISTANCE);
        } else if (under.isFaceSturdy(level, below, Direction.UP)) {
            return 0;
        }
        for (Direction side : Direction.Plane.HORIZONTAL) {
            BlockState neighbour = level.getBlockState(pos.relative(side));
            if (neighbour.is(this)) {
                distance = Math.min(distance, neighbour.getValue(DISTANCE) + 1);
                if (distance == 1) {
                    break;
                }
            }
        }
        return distance;
    }

    /** {@code bottom}: an overhanging block (distance above 0) with no scaffolding of this element under it. */
    private boolean bottom(BlockGetter level, BlockPos pos, int distance) {
        return distance > 0 && !level.getBlockState(pos.below()).is(this);
    }

    private BlockState withDistance(BlockState state, BlockGetter level, BlockPos pos) {
        int distance = distance(level, pos);
        return state.setValue(DISTANCE, distance).setValue(BOTTOM, bottom(level, pos, distance));
    }

    @Override
    public BlockState getStateForPlacement(BlockPlaceContext context) {
        BlockPos pos = context.getClickedPos();
        Level level = context.getLevel();
        return withDistance(defaultBlockState(), level, pos)
                .setValue(WATERLOGGED, level.getFluidState(pos).getType() == Fluids.WATER);
    }

    /** Re-checks the distance on the next tick after any neighbour changes. */
    @Override
    protected BlockState updateShape(BlockState state, LevelReader level, ScheduledTickAccess ticks, BlockPos pos, Direction direction,
            BlockPos neighbourPos, BlockState neighbour, RandomSource random) {
        if (state.getValue(WATERLOGGED)) {
            ticks.scheduleTick(pos, Fluids.WATER, Fluids.WATER.getTickDelay(level));
        }
        if (!level.isClientSide()) {
            ticks.scheduleTick(pos, this, 1);
        }
        return state;
    }

    /** At {@link #MAX_DISTANCE}: a block placed there falls, a block that lost its support breaks; else the state follows. */
    @Override
    protected void tick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
        BlockState now = withDistance(state, level, pos);
        if (now.getValue(DISTANCE) == MAX_DISTANCE) {
            if (state.getValue(DISTANCE) == MAX_DISTANCE) {
                FallingBlockEntity.fall(level, pos, now);
            } else {
                level.destroyBlock(pos, true);
            }
        } else if (now != state) {
            level.setBlock(pos, now, Block.UPDATE_ALL);
        }
    }

    /**
     * The element's item, looked up each time: vanilla's scaffolding shape asks for the block's item while the state
     * caches are built, before the runtime has registered the item, and {@link Block#asItem()} would keep that empty
     * answer for good (seen in B446's GameTests: placing and pick block then failed).
     */
    @Override
    public net.minecraft.world.item.Item asItem() {
        return net.minecraft.world.item.Item.byBlock(this);
    }

    /** Using this scaffolding's own item on it goes to the item's placement redirect (see {@link PlacingItem}). */
    @Override
    protected boolean canBeReplaced(BlockState state, BlockPlaceContext context) {
        return context.getItemInHand().is(asItem());
    }

    @Override
    protected boolean canSurvive(BlockState state, LevelReader level, BlockPos pos) {
        return distance(level, pos) < MAX_DISTANCE;
    }

    /** Pick block gives the element's item (vanilla's gives nothing for project scaffolding, B440). */
    @Override
    protected ItemStack getCloneItemStack(LevelReader level, BlockPos pos, BlockState state, boolean includeData) {
        return new ItemStack(this);
    }

    // Events and triggers: delegated to the driver after vanilla's own behaviour (ADR 0067 D3, D4).

    @Override
    protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
        InteractionResult vanilla = super.useWithoutItem(state, level, pos, player, hit);
        InteractionResult own = driver.useWithoutItem(level, pos, player);
        return vanilla.consumesAction() ? vanilla : own;
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
        if (level.getBlockState(pos).is(this)) {
            driver.randomTick(level, pos, random);
        }
    }

    @Override
    protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier effects,
            boolean intersects) {
        super.entityInside(state, level, pos, entity, effects, intersects);
        driver.entityInside(level, pos, entity);
    }

    /** Client: {@code msm:ambient_particles} (ADR 0080 D6), after vanilla's own. */
    @Override
    public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
        super.animateTick(state, level, pos, random);
        driver.animateTick(state, level, pos, random);
    }

    /**
     * The item of a project scaffolding: vanilla's {@link ScaffoldingBlockItem} with the placement redirect written for
     * this element. Using it on the side of this scaffolding places a block on top of the column; on the top face, at the
     * end of the row in the direction the player faces; sneaking places against the clicked face. A row stops before its
     * distance would reach {@link #MAX_DISTANCE}, a column at the top of the world. On any other block it places as a
     * block item, unless the spot is too far from support.
     */
    public static class PlacingItem extends ScaffoldingBlockItem {
        public PlacingItem(MsmScaffoldingBlock block, net.minecraft.world.item.Item.Properties properties) {
            super(block, properties);
        }

        @Override
        public BlockPlaceContext updatePlacementContext(BlockPlaceContext context) {
            MsmScaffoldingBlock block = (MsmScaffoldingBlock) getBlock();
            BlockPos pos = context.getClickedPos();
            Level level = context.getLevel();
            if (!level.getBlockState(pos).is(block)) {
                return block.distance(level, pos) == MAX_DISTANCE ? null : context;
            }
            Direction direction;
            if (context.isSecondaryUseActive()) {
                direction = context.isInside() ? context.getClickedFace().getOpposite() : context.getClickedFace();
            } else {
                direction = context.getClickedFace() == Direction.UP ? context.getHorizontalDirection() : Direction.UP;
            }
            BlockPos.MutableBlockPos at = pos.mutable().move(direction);
            for (int steps = 0; steps < MAX_DISTANCE; ) {
                if (level.isOutsideBuildHeight(at)) {
                    return null;
                }
                BlockState there = level.getBlockState(at);
                if (!there.is(block)) {
                    return there.canBeReplaced(context) && block.distance(level, at) < MAX_DISTANCE
                            ? BlockPlaceContext.at(context, at.immutable(), direction) : null;
                }
                at.move(direction);
                if (direction.getAxis().isHorizontal()) {
                    steps++;
                }
            }
            return null;
        }
    }
}
