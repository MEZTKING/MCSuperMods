package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.types.GrowingPlantFields;
import dev.mcsupermods.runtime.registry.BlockBehaviourDriver;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.ScheduledTickAccess;
import net.minecraft.world.level.block.BambooStalkBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.BonemealSource;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BambooLeaves;
import net.minecraft.world.phys.BlockHitResult;

/**
 * A bamboo-like column plant ({@code type: "column_plant"}, {@code style: "bamboo"}; ADR 0103 D1 and its amendment): the
 * stalk, over vanilla's {@link BambooStalkBlock} (its shapes, thickness, leaves and stage properties), whose shoot is the
 * companion {@code <path>_shoot} ({@link MsmBambooShootBlock}). Vanilla's stalk names vanilla's bamboo (B503: a stalk of
 * ours has no height cap there, and its shoot and bone meal turn into vanilla blocks), so height, leaves, thickness, the
 * shoot and bone meal are our own rules, written from what B503 measured on vanilla's bamboo (verify at implementation):
 * <ul>
 *   <li>The item placed on soil plants the shoot; on the shoot or the stalk it adds a stalk block.</li>
 *   <li>A random tick on the top of a still-growing stalk (stage 0) grows one block up into air one time in three when
 *       the light there is at least 9, until the column reaches its stop height (from {@code min_height}, default 12, to
 *       {@code max_height}, default 16; {@link GrowingPlantTypes#stopHeight}); the block that reaches it is marked done
 *       (stage 1).</li>
 *   <li>Bone meal on any block of the column grows the top one or two blocks, up to {@code max_height}.</li>
 *   <li>Leaves from the top: large, large, small, then none (a column of two: small, none; of one: none). The new block is
 *       thick (age 1) from the fourth block up, and thickness passes down the column, as vanilla's.</li>
 *   <li>Soil: the block below is this stalk, its shoot, or soil (the {@code soil} list, else
 *       {@code #minecraft:supports_bamboo}); with {@code needs_water_nearby}, water beside the soil.</li>
 *   <li>{@code touch_damage} above 0 hurts an entity inside the block by that much.</li>
 * </ul>
 */
public class MsmBambooBlock extends BambooStalkBlock implements DrivenBlock {
    /** The column turns thick when the new block is at least this high (B503 X1; verify at implementation). */
    static final int THICK_FROM = 4;
    /** The light needed above the top to grow on a random tick, as vanilla's bamboo (verify at implementation). */
    static final int GROW_LIGHT = 9;

    private final BlockBehaviourDriver driver;
    private final GrowingPlantFields.ColumnPlant fields;

    MsmBambooBlock(Identifier id, BlockDefinition definition, Properties props) {
        super(props);
        this.driver = new BlockBehaviourDriver(id, definition);
        this.fields = (GrowingPlantFields.ColumnPlant) definition.typeFields();
    }

    @Override
    public BlockBehaviourDriver driver() {
        return driver;
    }

    /** The definition's fields. */
    public GrowingPlantFields.ColumnPlant fields() {
        return fields;
    }

    /** The shoot companion, once registered. */
    public Optional<Block> shoot() {
        return Companions.companionOf(this);
    }

    private boolean isShoot(BlockState state) {
        Optional<Block> shoot = shoot();
        return shoot.isPresent() && state.is(shoot.get());
    }

    /** Whether {@code below} (at {@code belowPos}) is soil this plant's shoot or stalk can stand on. */
    boolean isSoil(LevelReader level, BlockPos belowPos, BlockState below) {
        return GrowingPlantTypes.isSoil(below, fields.soil(), GrowingPlantTypes.SUPPORTS_BAMBOO)
                && (!fields.needsWaterNearby() || GrowingPlantTypes.waterBeside(level, belowPos));
    }

    @Override
    public BlockState getStateForPlacement(BlockPlaceContext context) {
        Level level = context.getLevel();
        BlockPos pos = context.getClickedPos();
        if (!level.getFluidState(pos).isEmpty()) {
            return null;
        }
        BlockState below = level.getBlockState(pos.below());
        if (below.is(this)) {
            return defaultBlockState().setValue(AGE, below.getValue(AGE));
        }
        if (isShoot(below)) {
            return defaultBlockState();
        }
        if (isSoil(level, pos.below(), below)) {
            return shoot().map(Block::defaultBlockState).orElse(null);
        }
        return null;
    }

    @Override
    protected boolean canSurvive(BlockState state, LevelReader level, BlockPos pos) {
        BlockState below = level.getBlockState(pos.below());
        return below.is(this) || isShoot(below) || isSoil(level, pos.below(), below);
    }

    /** Vanilla's shape update (breaking a stalk that cannot survive), then thickness passing down from the block above. */
    @Override
    protected BlockState updateShape(BlockState state, LevelReader level, ScheduledTickAccess ticks, BlockPos pos, Direction direction,
            BlockPos neighbourPos, BlockState neighbour, RandomSource random) {
        BlockState updated = super.updateShape(state, level, ticks, pos, direction, neighbourPos, neighbour, random);
        if (direction == Direction.UP && updated.is(this) && neighbour.is(this) && neighbour.getValue(AGE) > updated.getValue(AGE)) {
            return updated.setValue(AGE, neighbour.getValue(AGE));
        }
        return updated;
    }

    @Override
    protected boolean isRandomlyTicking(BlockState state) {
        return super.isRandomlyTicking(state) || driver.definition().components().onRandomTick().isPresent();
    }

    @Override
    protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
        if (state.getValue(STAGE) == STAGE_GROWING && random.nextInt(3) == 0 && level.isEmptyBlock(pos.above())
                && level.getMaxLocalRawBrightness(pos.above()) >= GROW_LIGHT) {
            int height = getHeightBelowUpToMax(level, pos) + 1;
            if (height < stopHeight(level, pos)) {
                growBamboo(state, level, pos, random, height);
            }
        }
        if (level.getBlockState(pos).is(this)) {
            driver.randomTick(level, pos, random);
        }
    }

    /** The stop height of the column through {@code pos}. */
    int stopHeight(LevelReader level, BlockPos pos) {
        return GrowingPlantTypes.stopHeight(GrowingPlantTypes.base(level, pos, this), fields.minHeight(), fields.maxHeight());
    }

    /** A random tick's growth by one block above {@code pos}, the top, in a column {@code height} blocks high. */
    @Override
    protected void growBamboo(BlockState state, Level level, BlockPos pos, RandomSource random, int height) {
        grow(state, level, pos, height, stopHeight(level, pos));
    }

    /**
     * Grows one block above the top {@code pos} of a column {@code height} high; the new block is done growing at
     * {@code doneAt} or {@code max_height}. Leaves of the top four blocks follow the new height.
     */
    private void grow(BlockState top, Level level, BlockPos pos, int height, int doneAt) {
        int newHeight = height + 1;
        int age = top.getValue(AGE) == AGE_THICK_BAMBOO || newHeight >= THICK_FROM ? AGE_THICK_BAMBOO : AGE_THIN_BAMBOO;
        int stage = newHeight >= Math.min(doneAt, fields.maxHeight()) ? STAGE_DONE_GROWING : STAGE_GROWING;
        level.setBlock(pos.above(), defaultBlockState().setValue(AGE, age).setValue(LEAVES, leaves(0, newHeight)).setValue(STAGE, stage),
                Block.UPDATE_ALL);
        for (int down = 1; down <= 3; down++) {
            BlockPos at = pos.above().below(down);
            BlockState here = level.getBlockState(at);
            if (!here.is(this)) {
                break;
            }
            BambooLeaves leaves = leaves(down, newHeight);
            if (here.getValue(LEAVES) != leaves) {
                level.setBlock(at, here.setValue(LEAVES, leaves), Block.UPDATE_CLIENTS);
            }
        }
    }

    /** The leaves of the block {@code fromTop} below the top of a column {@code height} high (our own rule from B503). */
    static BambooLeaves leaves(int fromTop, int height) {
        if (height <= 1) {
            return BambooLeaves.NONE;
        }
        if (height == 2) {
            return fromTop == 0 ? BambooLeaves.SMALL : BambooLeaves.NONE;
        }
        return switch (fromTop) {
            case 0, 1 -> BambooLeaves.LARGE;
            case 2 -> BambooLeaves.SMALL;
            default -> BambooLeaves.NONE;
        };
    }

    @Override
    protected int getHeightAboveUpToMax(BlockGetter level, BlockPos pos) {
        int count = 0;
        while (count < fields.maxHeight() && level.getBlockState(pos.above(count + 1)).is(this)) {
            count++;
        }
        return count;
    }

    @Override
    protected int getHeightBelowUpToMax(BlockGetter level, BlockPos pos) {
        int count = 0;
        while (count < fields.maxHeight() && level.getBlockState(pos.below(count + 1)).is(this)) {
            count++;
        }
        return count;
    }

    @Override
    public boolean isValidBonemealTarget(LevelReader level, BlockPos pos, BlockState state, BonemealSource source) {
        int above = getHeightAboveUpToMax(level, pos);
        int below = getHeightBelowUpToMax(level, pos);
        BlockPos top = pos.above(above);
        BlockState topState = level.getBlockState(top);
        return above + below + 1 < fields.maxHeight() && topState.is(this) && topState.getValue(STAGE) != STAGE_DONE_GROWING
                && level.getBlockState(top.above()).isAir();
    }

    @Override
    public boolean isBonemealSuccess(Level level, RandomSource random, BlockPos pos, BlockState state, BonemealSource source) {
        return true;
    }

    /** One or two blocks on the top, up to {@code max_height} (our own rule from B503's one to two a bone meal). */
    @Override
    public void performBonemeal(ServerLevel level, RandomSource random, BlockPos pos, BlockState state, BonemealSource source) {
        int times = 1 + random.nextInt(2);
        for (int i = 0; i < times; i++) {
            int above = getHeightAboveUpToMax(level, pos);
            int below = getHeightBelowUpToMax(level, pos);
            BlockPos top = pos.above(above);
            BlockState topState = level.getBlockState(top);
            int height = above + below + 1;
            if (height >= fields.maxHeight() || !topState.is(this) || topState.getValue(STAGE) == STAGE_DONE_GROWING
                    || !level.getBlockState(top.above()).isAir()) {
                return;
            }
            grow(topState, level, top, height, fields.maxHeight());
        }
    }

    @Override
    protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier effects,
            boolean intersects) {
        super.entityInside(state, level, pos, entity, effects, intersects);
        GrowingPlantTypes.hurt(level, entity, fields.touchDamage());
        driver.entityInside(level, pos, entity);
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

    /** Client: {@code msm:ambient_particles} (ADR 0080 D6), after vanilla's own. */
    @Override
    public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
        super.animateTick(state, level, pos, random);
        driver.animateTick(state, level, pos, random);
    }
}
