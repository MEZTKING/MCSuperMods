package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.registry.BlockBehaviourDriver;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.BlockTags;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.BonemealSource;
import net.minecraft.world.level.block.SeaPickleBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;

/**
 * A sea pickle ({@code type: "sea_pickle"}, ADR 0094 D2, D4, D5): vanilla {@link SeaPickleBlock}'s one to four pickles,
 * adding pickles with the item, waterlogging, placement and shapes. Its light is our own and follows the state, as
 * vanilla's pickle measured at B440: 6, 9, 12 and 15 for one to four pickles in water, 0 out of water ({@link #light};
 * {@code msm:light_emitter} does not change it). Bone meal is our own too, because vanilla's spreads vanilla's pickle
 * (B440): on a coral block in water the clump grows to four and up to eight clumps of this block appear on coral blocks
 * in water around it.
 */
public class MsmSeaPickleBlock extends SeaPickleBlock implements DrivenBlock {
    private final BlockBehaviourDriver driver;

    public MsmSeaPickleBlock(Identifier id, BlockDefinition definition, Properties properties) {
        super(properties);
        this.driver = new BlockBehaviourDriver(id, definition);
    }

    @Override
    public BlockBehaviourDriver driver() {
        return driver;
    }

    /** The light of a state: 3 + 3 per pickle in water, 0 dry. */
    public static int light(BlockState state) {
        return state.getValue(WATERLOGGED) ? 3 + 3 * state.getValue(PICKLES) : 0;
    }

    @Override
    public void performBonemeal(ServerLevel level, RandomSource random, BlockPos pos, BlockState state, BonemealSource source) {
        if (!state.getValue(WATERLOGGED) || !level.getBlockState(pos.below()).is(BlockTags.CORAL_BLOCKS)) {
            return;
        }
        int placed = 0;
        for (int attempt = 0; attempt < 32 && placed < 8; attempt++) {
            BlockPos at = pos.offset(random.nextInt(5) - 2, random.nextInt(3) - 1, random.nextInt(5) - 2);
            if (at.equals(pos) || !level.getBlockState(at).is(Blocks.WATER) || !level.getFluidState(at).isSource()
                    || !level.getBlockState(at.below()).is(BlockTags.CORAL_BLOCKS)) {
                continue;
            }
            level.setBlock(at, defaultBlockState().setValue(WATERLOGGED, true).setValue(PICKLES, 1 + random.nextInt(MAX_PICKLES)),
                    UPDATE_CLIENTS);
            placed++;
        }
        level.setBlock(pos, state.setValue(PICKLES, MAX_PICKLES), UPDATE_CLIENTS);
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
}
