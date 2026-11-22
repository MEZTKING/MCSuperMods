package dev.mcsupermods.runtime.gametest.spike3;

import java.util.function.Supplier;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.block.BambooSaplingBlock;
import net.minecraft.world.level.block.BigDripleafBlock;
import net.minecraft.world.level.block.BigDripleafStemBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.CactusBlock;
import net.minecraft.world.level.block.CaveVines;
import net.minecraft.world.level.block.CaveVinesBlock;
import net.minecraft.world.level.block.CaveVinesPlantBlock;
import net.minecraft.world.level.block.GrowingPlantHeadBlock;
import net.minecraft.world.level.block.KelpBlock;
import net.minecraft.world.level.block.KelpPlantBlock;
import net.minecraft.world.level.block.SugarCaneBlock;
import net.minecraft.world.level.block.TwistingVinesBlock;
import net.minecraft.world.level.block.TwistingVinesPlantBlock;
import net.minecraft.world.level.block.WeepingVinesBlock;
import net.minecraft.world.level.block.WeepingVinesPlantBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;

/**
 * B503 spike (throwaway): project plants built on vanilla's plant classes with {@code Properties} only. A {@code null}
 * link keeps vanilla's own member (the "naked" variant, to see what it names); a link overrides the one member that
 * names the partner block.
 */
public final class B503Plants {
    private B503Plants() {}

    public static final class Kelp extends KelpBlock {
        private final Supplier<Block> body;

        public Kelp(Properties p, Supplier<Block> body) {
            super(p);
            this.body = body;
        }

        @Override
        protected Block getBodyBlock() {
            return body == null ? super.getBodyBlock() : body.get();
        }
    }

    public static final class KelpPlant extends KelpPlantBlock {
        private final Supplier<Block> head;

        public KelpPlant(Properties p, Supplier<Block> head) {
            super(p);
            this.head = head;
        }

        @Override
        protected GrowingPlantHeadBlock getHeadBlock() {
            return (GrowingPlantHeadBlock) head.get();
        }
    }

    public static final class Weeping extends WeepingVinesBlock {
        private final Supplier<Block> body;

        public Weeping(Properties p, Supplier<Block> body) {
            super(p);
            this.body = body;
        }

        @Override
        protected Block getBodyBlock() {
            return body == null ? super.getBodyBlock() : body.get();
        }
    }

    public static final class WeepingPlant extends WeepingVinesPlantBlock {
        private final Supplier<Block> head;

        public WeepingPlant(Properties p, Supplier<Block> head) {
            super(p);
            this.head = head;
        }

        @Override
        protected GrowingPlantHeadBlock getHeadBlock() {
            return (GrowingPlantHeadBlock) head.get();
        }
    }

    public static final class Twisting extends TwistingVinesBlock {
        private final Supplier<Block> body;

        public Twisting(Properties p, Supplier<Block> body) {
            super(p);
            this.body = body;
        }

        @Override
        protected Block getBodyBlock() {
            return body == null ? super.getBodyBlock() : body.get();
        }
    }

    public static final class TwistingPlant extends TwistingVinesPlantBlock {
        private final Supplier<Block> head;

        public TwistingPlant(Properties p, Supplier<Block> head) {
            super(p);
            this.head = head;
        }

        @Override
        protected GrowingPlantHeadBlock getHeadBlock() {
            return (GrowingPlantHeadBlock) head.get();
        }
    }

    /** Picks the project berry when {@code berry} is set (our own small rule, written from ADR 0103 D1). */
    static InteractionResult pick(BlockState state, Level level, BlockPos pos, Supplier<Item> berry) {
        if (!state.getValue(CaveVines.BERRIES)) {
            return InteractionResult.PASS;
        }
        if (level instanceof ServerLevel) {
            Block.popResource(level, pos, new ItemStack(berry.get()));
            level.setBlock(pos, state.setValue(CaveVines.BERRIES, false), Block.UPDATE_CLIENTS);
        }
        return InteractionResult.SUCCESS;
    }

    public static final class Cave extends CaveVinesBlock {
        private final Supplier<Block> body;
        private final Supplier<Item> berry;

        public Cave(Properties p, Supplier<Block> body, Supplier<Item> berry) {
            super(p);
            this.body = body;
            this.berry = berry;
        }

        @Override
        protected Block getBodyBlock() {
            return body == null ? super.getBodyBlock() : body.get();
        }

        @Override
        protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
            return berry == null ? super.useWithoutItem(state, level, pos, player, hit) : pick(state, level, pos, berry);
        }

        @Override
        protected ItemStack getCloneItemStack(LevelReader level, BlockPos pos, BlockState state, boolean data) {
            return berry == null ? super.getCloneItemStack(level, pos, state, data) : new ItemStack(berry.get());
        }
    }

    public static final class CavePlant extends CaveVinesPlantBlock {
        private final Supplier<Block> head;
        private final Supplier<Item> berry;

        public CavePlant(Properties p, Supplier<Block> head, Supplier<Item> berry) {
            super(p);
            this.head = head;
            this.berry = berry;
        }

        @Override
        protected GrowingPlantHeadBlock getHeadBlock() {
            return (GrowingPlantHeadBlock) head.get();
        }

        @Override
        protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
            return pick(state, level, pos, berry);
        }

        @Override
        protected ItemStack getCloneItemStack(LevelReader level, BlockPos pos, BlockState state, boolean data) {
            return new ItemStack(berry.get());
        }
    }

    public static final class Cane extends SugarCaneBlock {
        public Cane(Properties p) {
            super(p);
        }
    }

    public static final class Cactus extends CactusBlock {
        public Cactus(Properties p) {
            super(p);
        }
    }

    /**
     * A bamboo shoot whose growth is vanilla's, then any vanilla bamboo it placed above is swapped for {@code stalk} with
     * the same properties (a substitution, not a rewrite of vanilla's rule).
     */
    public static final class Shoot extends BambooSaplingBlock {
        private final Supplier<Block> stalk;

        public Shoot(Properties p, Supplier<Block> stalk) {
            super(p);
            this.stalk = stalk;
        }

        @Override
        protected void growBamboo(Level level, BlockPos pos) {
            super.growBamboo(level, pos);
            if (stalk != null) {
                B503Mod.swapVanilla(level, pos.above(), net.minecraft.world.level.block.Blocks.BAMBOO, stalk.get());
            }
        }
    }

    public static final class BigLeaf extends BigDripleafBlock {
        public BigLeaf(Properties p) {
            super(p);
        }
    }

    public static final class Stem extends BigDripleafStemBlock {
        public Stem(Properties p) {
            super(p);
        }
    }
}
