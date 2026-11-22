package dev.mcsupermods.runtime.gametest.spike5;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Supplier;
import net.minecraft.core.BlockPos;
import net.minecraft.core.cauldron.CauldronInteraction;
import net.minecraft.core.cauldron.CauldronInteractions;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ItemUtils;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.block.AbstractCauldronBlock;
import net.minecraft.world.level.block.LayeredCauldronBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;

/**
 * B525 spike (throwaway), X26: project cauldrons (ADR 0108 D2). {@code Dispatcher.put} is package-private on both
 * versions, so a project cauldron gets an empty {@code CauldronInteraction.Dispatcher} and does its own interactions in
 * {@code useItemOn} through vanilla's public helpers {@code CauldronInteractions.fillBucket} and {@code emptyBucket};
 * everything else goes to {@code super} (the empty dispatcher).
 */
public final class B525Cauldrons {
    private B525Cauldrons() {}

    public static final List<String> LOG = new CopyOnWriteArrayList<>();

    /** An empty dispatcher: every item gets vanilla's default interaction. */
    static final CauldronInteraction.Dispatcher NONE = new CauldronInteraction.Dispatcher();

    static void log(Level level, String what) {
        if (!level.isClientSide()) {
            LOG.add(what + " tick " + level.getGameTime());
        }
    }

    /** Three levels, like water's: filled and emptied by the fluid's bucket (whole) and bottle (one level). */
    public static final class Layered extends LayeredCauldronBlock {
        private final Supplier<Item> bucket;
        private final Supplier<Item> bottle;

        public Layered(Properties properties, Supplier<Item> bucket, Supplier<Item> bottle) {
            super(Biome.Precipitation.NONE, NONE, properties);
            this.bucket = bucket;
            this.bottle = bottle;
        }

        @Override
        protected InteractionResult useItemOn(ItemStack stack, BlockState state, Level level, BlockPos pos, Player player, InteractionHand hand,
                BlockHitResult hit) {
            int lvl = state.getValue(LEVEL);
            if (stack.is(Items.BUCKET)) {
                log(level, "layered: empty bucket at level " + lvl);
                return CauldronInteractions.fillBucket(state, level, pos, player, hand, stack, new ItemStack(bucket.get()),
                        s -> s.getValue(LEVEL) == 3, SoundEvents.BUCKET_FILL);
            }
            if (stack.is(bucket.get())) {
                log(level, "layered: full bucket at level " + lvl);
                return CauldronInteractions.emptyBucket(level, pos, player, hand, stack, defaultBlockState().setValue(LEVEL, 3),
                        SoundEvents.BUCKET_EMPTY);
            }
            if (stack.is(Items.GLASS_BOTTLE)) {
                log(level, "layered: glass bottle at level " + lvl);
                if (!level.isClientSide()) {
                    player.setItemInHand(hand, ItemUtils.createFilledResult(stack, player, new ItemStack(bottle.get())));
                    LayeredCauldronBlock.lowerFillLevel(state, level, pos);
                    level.playSound(null, pos, SoundEvents.BOTTLE_FILL, SoundSource.BLOCKS, 1.0f, 1.0f);
                }
                return InteractionResult.SUCCESS;
            }
            if (stack.is(bottle.get()) && lvl < 3) {
                log(level, "layered: project bottle at level " + lvl);
                if (!level.isClientSide()) {
                    player.setItemInHand(hand, ItemUtils.createFilledResult(stack, player, new ItemStack(Items.GLASS_BOTTLE)));
                    level.setBlockAndUpdate(pos, state.setValue(LEVEL, lvl + 1));
                    level.playSound(null, pos, SoundEvents.BOTTLE_EMPTY, SoundSource.BLOCKS, 1.0f, 1.0f);
                }
                return InteractionResult.SUCCESS;
            }
            InteractionResult r = super.useItemOn(stack, state, level, pos, player, hand, hit);
            log(level, "layered: other " + BuiltInRegistries.ITEM.getKey(stack.getItem()) + " -> super " + r);
            return r;
        }

        @Override
        protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier effects, boolean intersects) {
            super.entityInside(state, level, pos, entity, effects, intersects);
            log(level, "layered: entityInside " + BuiltInRegistries.ENTITY_TYPE.getKey(entity.getType()) + " intersects " + intersects
                    + " onFire " + entity.isOnFire());
        }
    }

    /** Full only, like lava's: filled and emptied by the fluid's bucket. */
    public static final class Full extends AbstractCauldronBlock {
        private final Supplier<Item> bucket;

        public Full(Properties properties, Supplier<Item> bucket) {
            super(properties, NONE);
            this.bucket = bucket;
        }

        @Override
        public boolean isFull(BlockState state) {
            return true;
        }

        @Override
        protected double getContentHeight(BlockState state) {
            return 0.9375;
        }

        @Override
        protected int getAnalogOutputSignal(BlockState state, Level level, BlockPos pos, net.minecraft.core.Direction direction) {
            return 3;
        }

        @Override
        protected InteractionResult useItemOn(ItemStack stack, BlockState state, Level level, BlockPos pos, Player player, InteractionHand hand,
                BlockHitResult hit) {
            if (stack.is(Items.BUCKET)) {
                log(level, "full: empty bucket");
                return CauldronInteractions.fillBucket(state, level, pos, player, hand, stack, new ItemStack(bucket.get()), s -> true,
                        SoundEvents.BUCKET_FILL_LAVA);
            }
            InteractionResult r = super.useItemOn(stack, state, level, pos, player, hand, hit);
            log(level, "full: other " + BuiltInRegistries.ITEM.getKey(stack.getItem()) + " -> super " + r);
            return r;
        }

        @Override
        protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier effects, boolean intersects) {
            super.entityInside(state, level, pos, entity, effects, intersects);
            log(level, "full: entityInside " + BuiltInRegistries.ENTITY_TYPE.getKey(entity.getType()) + " intersects " + intersects);
        }
    }
}
