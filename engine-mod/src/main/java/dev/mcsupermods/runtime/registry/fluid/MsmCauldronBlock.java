package dev.mcsupermods.runtime.registry.fluid;

import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.cauldron.CauldronInteraction;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.block.AbstractCauldronBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.LayeredCauldronBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.Fluid;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * The cauldron of a project fluid, {@code <ns>:<path>_cauldron} (ADR 0108 D2 and its amendment after B525), with no
 * Mixin: vanilla's cauldron classes with an empty interaction dispatcher ({@code CauldronInteraction.Dispatcher.put} is
 * not public on either version) and their own {@code useItemOn} over vanilla's public helpers
 * ({@code CauldronInteractions.fillBucket}/{@code emptyBucket}, {@code LayeredCauldronBlock.lowerFillLevel}); the
 * interactions themselves are {@link MsmCauldrons#useOnProjectCauldron}. Two shapes:
 *
 * <ul>
 *   <li>{@link Layered} ({@code levels: true}, water-like or {@code none}): vanilla's layered cauldron with levels 1 to 3
 *       ({@code level}); the bucket takes only a full one, the bottle takes or adds one level, the comparator reads the
 *       level. A water-like one puts out burning entities inside and uses a level each time (vanilla's layered
 *       behaviour); a {@code none} one does not. No rain or dripstone fills it.</li>
 *   <li>{@link Full} (no {@code levels}, and always for a lava-like fluid): full only, as lava's; the comparator reads
 *       3, and entities inside get the fluid's own effects (a lava-like one sets on fire and hurts as lava).</li>
 * </ul>
 *
 * <p>Both fire the fluid's {@code on_entity_inside} for an entity inside, with the fluid's own cooldown, drop a vanilla
 * cauldron when broken (vanilla's cauldron loot table) and pick as a cauldron. Breaking or emptying one leaves vanilla's
 * empty cauldron.
 */
public sealed interface MsmCauldronBlock permits MsmCauldronBlock.Layered, MsmCauldronBlock.Full {
    /** The interaction dispatcher every project cauldron gets: empty, so vanilla's own interactions never run on it. */
    CauldronInteraction.Dispatcher NO_INTERACTIONS = new CauldronInteraction.Dispatcher();

    /** The fluid this cauldron holds. */
    MsmFluids.Entry fluid();

    /** The cauldron as a block. */
    Block block();

    /** The state of this cauldron when full: level 3 for a layered one. */
    BlockState fullState();

    /** Whether {@code state} of this cauldron is full. */
    boolean isFullState(BlockState state);

    /** The cauldron with three levels (water-like or {@code none} fluids with {@code levels}). */
    final class Layered extends LayeredCauldronBlock implements MsmCauldronBlock {
        private final MsmFluids.Entry fluid;

        Layered(Properties properties, MsmFluids.Entry fluid) {
            super(Biome.Precipitation.NONE, NO_INTERACTIONS, properties);
            this.fluid = fluid;
        }

        @Override
        public MsmFluids.Entry fluid() {
            return fluid;
        }

        @Override
        public Block block() {
            return this;
        }

        @Override
        public BlockState fullState() {
            return defaultBlockState().setValue(LEVEL, MAX_FILL_LEVEL);
        }

        @Override
        public boolean isFullState(BlockState state) {
            return state.is(this) && state.getValue(LEVEL) == MAX_FILL_LEVEL;
        }

        @Override
        protected InteractionResult useItemOn(ItemStack stack, BlockState state, Level level, BlockPos pos, Player player, InteractionHand hand,
                BlockHitResult hit) {
            InteractionResult ours = MsmCauldrons.useOnProjectCauldron(this, stack, state, level, pos, player, hand);
            return ours != null ? ours : super.useItemOn(stack, state, level, pos, player, hand, hit);
        }

        @Override
        protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier effects, boolean intersects) {
            if (fluid.definition().behavesLike() == FluidDefinition.Behaviour.WATER) {
                super.entityInside(state, level, pos, entity, effects, intersects);
            }
            if (intersects) {
                fluid.block().fireInside(level, pos, entity);
            }
        }

        @Override
        public void handlePrecipitation(BlockState state, Level level, BlockPos pos, Biome.Precipitation precipitation) {
            // Rain and snow never fill a project cauldron.
        }

        @Override
        protected boolean canReceiveStalactiteDrip(Fluid dripping) {
            return false;
        }

        @Override
        protected ItemStack getCloneItemStack(LevelReader level, BlockPos pos, BlockState state, boolean includeData) {
            return new ItemStack(Items.CAULDRON);
        }
    }

    /** The full-only cauldron (lava-like fluids, and any fluid without {@code levels}). */
    final class Full extends AbstractCauldronBlock implements MsmCauldronBlock {
        /** How high the contents reach, in blocks (fifteen sixteenths). */
        static final double CONTENT_HEIGHT = 15.0 / 16.0;
        /** The space inside the walls up to the contents: where an entity is in the fluid. */
        private static final VoxelShape INSIDE = Block.box(2.0, FLOOR_LEVEL, 2.0, 14.0, 15.0, 14.0);

        private final MsmFluids.Entry fluid;

        Full(Properties properties, MsmFluids.Entry fluid) {
            super(properties, NO_INTERACTIONS);
            this.fluid = fluid;
        }

        @Override
        public MsmFluids.Entry fluid() {
            return fluid;
        }

        @Override
        public Block block() {
            return this;
        }

        @Override
        public BlockState fullState() {
            return defaultBlockState();
        }

        @Override
        public boolean isFullState(BlockState state) {
            return state.is(this);
        }

        @Override
        public boolean isFull(BlockState state) {
            return true;
        }

        @Override
        protected double getContentHeight(BlockState state) {
            return CONTENT_HEIGHT;
        }

        @Override
        protected int getAnalogOutputSignal(BlockState state, Level level, BlockPos pos, Direction direction) {
            return LayeredCauldronBlock.MAX_FILL_LEVEL;
        }

        @Override
        protected VoxelShape getEntityInsideCollisionShape(BlockState state, BlockGetter level, BlockPos pos, Entity entity) {
            return INSIDE;
        }

        @Override
        protected InteractionResult useItemOn(ItemStack stack, BlockState state, Level level, BlockPos pos, Player player, InteractionHand hand,
                BlockHitResult hit) {
            InteractionResult ours = MsmCauldrons.useOnProjectCauldron(this, stack, state, level, pos, player, hand);
            return ours != null ? ours : super.useItemOn(stack, state, level, pos, player, hand, hit);
        }

        @Override
        protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier effects, boolean intersects) {
            if (intersects) {
                MsmFluids.insideEffects(fluid.definition(), effects);
                fluid.block().fireInside(level, pos, entity);
            }
        }

        @Override
        protected boolean canReceiveStalactiteDrip(Fluid dripping) {
            return false;
        }

        @Override
        protected ItemStack getCloneItemStack(LevelReader level, BlockPos pos, BlockState state, boolean includeData) {
            return new ItemStack(Items.CAULDRON);
        }
    }
}
