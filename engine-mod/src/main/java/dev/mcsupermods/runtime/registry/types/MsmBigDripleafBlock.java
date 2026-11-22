package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.types.GrowingPlantFields;
import dev.mcsupermods.runtime.registry.BlockBehaviourDriver;
import java.util.List;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.FluidTags;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.ScheduledTickAccess;
import net.minecraft.world.level.block.BigDripleafBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.BonemealSource;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.Tilt;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.phys.BlockHitResult;

/**
 * A big dripleaf ({@code type: "dripleaf"}, {@code size: "big"}; ADR 0103 D1 and its amendment): the leaf, over vanilla's
 * {@link BigDripleafBlock} (its shapes by tilt, facing, waterlogging, redstone reset and the projectile tilt), standing on
 * its stem, the companion {@code <path>_stem} ({@link MsmDripleafStemBlock}). Vanilla's leaf names vanilla's stem and
 * leaf, so these are our own rules, written from what B503 observed (verify at implementation):
 * <ul>
 *   <li>Survival: the block below is this leaf, its stem, or soil ({@code #minecraft:supports_big_dripleaf}; a project
 *       dripleaf has no {@code soil} field).</li>
 *   <li>A leaf placed on a leaf turns the lower one into the stem.</li>
 *   <li>Bone meal grows the plant one block: the leaf becomes stem and a new leaf goes above it, into air or water.</li>
 *   <li>Tilting: with vanilla's {@code tilt_ticks} ({@code [2, 10, 10]}) vanilla's own; with others our own: an entity
 *       standing on the leaf makes it unstable after the first number of ticks, partly tilted after the second and fully
 *       tilted (dropping the entity) after the third; it springs back after 100 ticks, or at once when powered.</li>
 * </ul>
 */
public class MsmBigDripleafBlock extends BigDripleafBlock implements DrivenBlock {
    /** Ticks a full tilt lasts before the leaf springs back, as vanilla's (B503 X3: 98 to 100). */
    static final int FULL_TILT_TICKS = 100;
    /** The lowest height above the block's floor at which a standing entity tilts the leaf (vanilla's leaf top). */
    static final double ENTITY_DETECTION_MIN_Y = 11.0 / 16.0;

    private final BlockBehaviourDriver driver;
    private final List<Integer> tiltTicks;
    private final boolean ownTilt;

    MsmBigDripleafBlock(Identifier id, BlockDefinition definition, Properties props) {
        super(props);
        this.driver = new BlockBehaviourDriver(id, definition);
        this.tiltTicks = ((GrowingPlantFields.Dripleaf) definition.typeFields()).tiltTicks();
        this.ownTilt = !tiltTicks.equals(GrowingPlantFields.Dripleaf.DEFAULT_TILT_TICKS);
    }

    @Override
    public BlockBehaviourDriver driver() {
        return driver;
    }

    /** The ticks to unstable, to a partial tilt and to a full tilt. */
    public List<Integer> tiltTicks() {
        return tiltTicks;
    }

    /** The stem companion, once registered. */
    public Optional<Block> stem() {
        return Companions.companionOf(this);
    }

    boolean isStem(BlockState state) {
        Optional<Block> stem = stem();
        return stem.isPresent() && state.is(stem.get());
    }

    /** The stem block state for a leaf state (same facing and water). */
    BlockState stemFor(BlockState leaf) {
        return stem().map(s -> s.defaultBlockState().setValue(BlockStateProperties.HORIZONTAL_FACING, leaf.getValue(FACING))
                .setValue(BlockStateProperties.WATERLOGGED, leaf.getValue(BlockStateProperties.WATERLOGGED))).orElse(leaf);
    }

    @Override
    protected boolean canSurvive(BlockState state, LevelReader level, BlockPos pos) {
        BlockState below = level.getBlockState(pos.below());
        return below.is(this) || isStem(below) || below.is(GrowingPlantTypes.SUPPORTS_BIG_DRIPLEAF);
    }

    @Override
    protected BlockState updateShape(BlockState state, LevelReader level, ScheduledTickAccess ticks, BlockPos pos, Direction direction,
            BlockPos neighbourPos, BlockState neighbour, RandomSource random) {
        if (direction == Direction.UP && neighbour.is(this) && stem().isPresent()) {
            return stemFor(state);
        }
        return super.updateShape(state, level, ticks, pos, direction, neighbourPos, neighbour, random);
    }

    @Override
    public boolean isValidBonemealTarget(LevelReader level, BlockPos pos, BlockState state, BonemealSource source) {
        BlockState above = level.getBlockState(pos.above());
        return stem().isPresent() && (above.isAir() || above.is(Blocks.WATER) && above.getFluidState().isSource())
                && level.isInsideBuildHeight(pos.above());
    }

    @Override
    public boolean isBonemealSuccess(Level level, RandomSource random, BlockPos pos, BlockState state, BonemealSource source) {
        return true;
    }

    @Override
    public void performBonemeal(ServerLevel level, RandomSource random, BlockPos pos, BlockState state, BonemealSource source) {
        grow(level, pos, state);
    }

    /** Grows the leaf at {@code pos} one block up: it turns into stem and a new leaf goes above. */
    void grow(Level level, BlockPos pos, BlockState leaf) {
        if (stem().isEmpty()) {
            return;
        }
        BlockPos above = pos.above();
        boolean water = level.getFluidState(above).is(FluidTags.WATER) && level.getFluidState(above).isSource();
        level.setBlock(pos, stemFor(leaf), Block.UPDATE_ALL);
        level.setBlock(above, defaultBlockState().setValue(FACING, leaf.getValue(FACING)).setValue(BlockStateProperties.WATERLOGGED, water)
                .setValue(BlockStateProperties.TILT, Tilt.NONE), Block.UPDATE_ALL);
    }

    // Tilting with our own tilt_ticks.

    @Override
    protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier effects,
            boolean intersects) {
        if (!ownTilt) {
            super.entityInside(state, level, pos, entity, effects, intersects);
        } else if (!level.isClientSide() && state.getValue(BlockStateProperties.TILT) == Tilt.NONE && entity.onGround()
                && entity.getY() > pos.getY() + ENTITY_DETECTION_MIN_Y && !level.hasNeighborSignal(pos)
                && !level.getBlockTicks().hasScheduledTick(pos, this)) {
            level.scheduleTick(pos, this, tiltTicks.get(0));
        }
        driver.entityInside(level, pos, entity);
    }

    @Override
    protected void tick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
        if (!ownTilt) {
            super.tick(state, level, pos, random);
            return;
        }
        if (level.hasNeighborSignal(pos)) {
            if (state.getValue(BlockStateProperties.TILT) != Tilt.NONE) {
                tilt(level, pos, state, Tilt.NONE, SoundEvents.BIG_DRIPLEAF_TILT_UP, -1);
            }
            return;
        }
        switch (state.getValue(BlockStateProperties.TILT)) {
            case NONE -> tilt(level, pos, state, Tilt.UNSTABLE, null, tiltTicks.get(1));
            case UNSTABLE -> tilt(level, pos, state, Tilt.PARTIAL, SoundEvents.BIG_DRIPLEAF_TILT_DOWN, tiltTicks.get(2));
            case PARTIAL -> tilt(level, pos, state, Tilt.FULL, SoundEvents.BIG_DRIPLEAF_TILT_DOWN, FULL_TILT_TICKS);
            case FULL -> tilt(level, pos, state, Tilt.NONE, SoundEvents.BIG_DRIPLEAF_TILT_UP, -1);
        }
    }

    private void tilt(ServerLevel level, BlockPos pos, BlockState state, Tilt tilt, SoundEvent sound, int next) {
        level.setBlock(pos, state.setValue(BlockStateProperties.TILT, tilt), Block.UPDATE_CLIENTS);
        if (sound != null) {
            level.playSound(null, pos, sound, SoundSource.BLOCKS, 1.0f, 0.8f + level.getRandom().nextFloat() * 0.4f);
        }
        if (tilt != Tilt.NONE) {
            level.gameEvent(null, GameEvent.BLOCK_CHANGE, pos);
        }
        if (next > 0) {
            level.scheduleTick(pos, this, next);
        }
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

    /** Client: {@code msm:ambient_particles} (ADR 0080 D6), after vanilla's own. */
    @Override
    public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
        super.animateTick(state, level, pos, random);
        driver.animateTick(state, level, pos, random);
    }
}
