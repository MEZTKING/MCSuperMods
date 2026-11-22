package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.types.GrowingPlantFields;
import dev.mcsupermods.runtime.registry.BlockBehaviourDriver;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
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
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.BonemealSource;
import net.minecraft.world.level.block.SmallDripleafBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;
import net.minecraft.world.phys.BlockHitResult;

/**
 * A small dripleaf ({@code type: "dripleaf"}, {@code size: "small"}; ADR 0103 D1 and its amendment): vanilla's
 * {@link SmallDripleafBlock} (two halves, facing, waterlogging, vanilla's soil rule on
 * {@code #minecraft:supports_small_dripleaf}), placed by a double-high item. Vanilla's bone meal turns it into vanilla's
 * big dripleaf (B503), so ours is our own rule: bone meal turns it into the {@code grows_into} element, a stem with its
 * leaf on top, two to four blocks high as there is room (air or water) above (verify at implementation). A
 * {@code grows_into} that is not a registered project big dripleaf leaves bone meal without effect (the validators
 * report it).
 */
public class MsmSmallDripleafBlock extends SmallDripleafBlock implements DrivenBlock {
    /** The highest a small dripleaf grows into (our own number; verify at implementation). */
    static final int MAX_GROWN_HEIGHT = 4;

    private final BlockBehaviourDriver driver;
    private final Identifier growsInto;

    MsmSmallDripleafBlock(Identifier id, BlockDefinition definition, Properties props) {
        super(props);
        this.driver = new BlockBehaviourDriver(id, definition);
        this.growsInto = ((GrowingPlantFields.Dripleaf) definition.typeFields()).growsInto().orElseThrow();
    }

    @Override
    public BlockBehaviourDriver driver() {
        return driver;
    }

    /** The big dripleaf it grows into, when that is a registered project big dripleaf with its stem. */
    public Optional<MsmBigDripleafBlock> bigLeaf() {
        return BuiltInRegistries.BLOCK.getValue(growsInto) instanceof MsmBigDripleafBlock big && big.stem().isPresent()
                ? Optional.of(big) : Optional.empty();
    }

    @Override
    public boolean isValidBonemealTarget(LevelReader level, BlockPos pos, BlockState state, BonemealSource source) {
        return bigLeaf().isPresent();
    }

    @Override
    public boolean isBonemealSuccess(Level level, RandomSource random, BlockPos pos, BlockState state, BonemealSource source) {
        return true;
    }

    @Override
    public void performBonemeal(ServerLevel level, RandomSource random, BlockPos pos, BlockState state, BonemealSource source) {
        Optional<MsmBigDripleafBlock> found = bigLeaf();
        if (found.isEmpty()) {
            return;
        }
        MsmBigDripleafBlock big = found.get();
        BlockPos lower = state.getValue(HALF) == DoubleBlockHalf.UPPER ? pos.below() : pos;
        Direction facing = state.getValue(FACING);
        int height = 2;
        int wanted = 2 + random.nextInt(MAX_GROWN_HEIGHT - 1);
        while (height < wanted && room(level, lower.above(height))) {
            height++;
        }
        BlockState leafState = big.defaultBlockState().setValue(BlockStateProperties.HORIZONTAL_FACING, facing);
        for (int i = 0; i < height; i++) {
            BlockPos at = lower.above(i);
            boolean water = level.getFluidState(at).is(FluidTags.WATER) && level.getFluidState(at).isSource();
            BlockState placed = (i == height - 1 ? leafState : big.stemFor(leafState)).setValue(BlockStateProperties.WATERLOGGED, water);
            level.setBlock(at, placed, Block.UPDATE_CLIENTS);
        }
        for (int i = 0; i < height; i++) {
            level.updateNeighborsAt(lower.above(i), level.getBlockState(lower.above(i)).getBlock());
        }
    }

    private static boolean room(LevelReader level, BlockPos at) {
        BlockState state = level.getBlockState(at);
        return level.isInsideBuildHeight(at) && (state.isAir() || state.is(net.minecraft.world.level.block.Blocks.WATER)
                && state.getFluidState().isSource());
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
