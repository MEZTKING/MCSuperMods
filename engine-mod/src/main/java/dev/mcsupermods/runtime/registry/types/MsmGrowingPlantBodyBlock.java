package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.types.GrowingPlantFields;
import dev.mcsupermods.runtime.registry.BlockBehaviourDriver;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.EmptyBlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.BonemealSource;
import net.minecraft.world.level.block.CaveVines;
import net.minecraft.world.level.block.GrowingPlantBodyBlock;
import net.minecraft.world.level.block.GrowingPlantHeadBlock;
import net.minecraft.world.level.block.KelpPlantBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * The strand of a growing plant, the companion {@code <path>_plant} of an {@link MsmGrowingPlantHeadBlock} (ADR 0103 D1,
 * ADR 0094 D3): vanilla's {@link GrowingPlantBodyBlock} (a water plant's: {@link Water}, vanilla's {@link KelpPlantBlock})
 * naming the element as its tip. Bone meal on the strand grows the tip, or with {@code berries} ripens this block; a use
 * picks its berries; pick block gives the element's item (or the berry).
 */
public class MsmGrowingPlantBodyBlock extends GrowingPlantBodyBlock implements DrivenBlock {
    private final MsmGrowingPlantHeadBlock head;
    private final MsmGrowingPlantHeadBlock.Rules rules;

    /** The strand of {@code head}, a dry tip or a {@link MsmGrowingPlantHeadBlock.Water} tip. */
    static Block create(Identifier id, BlockDefinition definition, Block head, Properties props) {
        GrowingPlantFields.GrowingPlant fields = (GrowingPlantFields.GrowingPlant) definition.typeFields();
        MsmGrowingPlantHeadBlock.SETUP.set(fields.berries().isPresent());
        try {
            return head instanceof MsmGrowingPlantHeadBlock.Water water ? new Water(id, definition, water, props)
                    : new MsmGrowingPlantBodyBlock(id, definition, (MsmGrowingPlantHeadBlock) head, fields, props);
        } finally {
            MsmGrowingPlantHeadBlock.SETUP.remove();
        }
    }

    private MsmGrowingPlantBodyBlock(Identifier id, BlockDefinition definition, MsmGrowingPlantHeadBlock head,
            GrowingPlantFields.GrowingPlant fields, Properties props) {
        super(props, MsmGrowingPlantHeadBlock.direction(fields), bodyShape(fields), false);
        this.head = head;
        this.rules = new MsmGrowingPlantHeadBlock.Rules(this, id, definition);
        if (rules.berries()) {
            registerDefaultState(defaultBlockState().setValue(CaveVines.BERRIES, false));
        }
    }

    /** The shape of a vanilla block's default state (vanilla's own shape, read from the block, not copied). */
    static VoxelShape shapeOf(Block block) {
        return block.defaultBlockState().getShape(EmptyBlockGetter.INSTANCE, BlockPos.ZERO);
    }

    private static VoxelShape bodyShape(GrowingPlantFields.GrowingPlant fields) {
        return shapeOf(fields.direction() == GrowingPlantFields.GrowthDirection.UP ? Blocks.TWISTING_VINES_PLANT
                : fields.berries().isPresent() ? Blocks.CAVE_VINES_PLANT : Blocks.WEEPING_VINES_PLANT);
    }

    @Override
    public BlockBehaviourDriver driver() {
        return rules.driver;
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
        super.createBlockStateDefinition(builder);
        if (Boolean.TRUE.equals(MsmGrowingPlantHeadBlock.SETUP.get())) {
            builder.add(CaveVines.BERRIES);
        }
    }

    @Override
    protected GrowingPlantHeadBlock getHeadBlock() {
        return head;
    }

    @Override
    protected BlockState updateHeadAfterConvertedFromBody(BlockState body, BlockState headState) {
        return MsmGrowingPlantHeadBlock.Rules.copyBerries(body, super.updateHeadAfterConvertedFromBody(body, headState));
    }

    @Override
    protected boolean canSurvive(BlockState state, LevelReader level, BlockPos pos) {
        return rules.soil.isPresent() ? head.rules().survives(level, pos, growthDirection) : super.canSurvive(state, level, pos);
    }

    @Override
    public boolean isValidBonemealTarget(LevelReader level, BlockPos pos, BlockState state, BonemealSource source) {
        return rules.berries() ? !GrowingPlantTypes.hasBerries(state) : super.isValidBonemealTarget(level, pos, state, source);
    }

    @Override
    public boolean isBonemealSuccess(Level level, RandomSource random, BlockPos pos, BlockState state, BonemealSource source) {
        return rules.berries() || super.isBonemealSuccess(level, random, pos, state, source);
    }

    @Override
    public void performBonemeal(ServerLevel level, RandomSource random, BlockPos pos, BlockState state, BonemealSource source) {
        if (rules.berries()) {
            MsmGrowingPlantHeadBlock.Rules.ripen(level, pos, state);
        } else {
            super.performBonemeal(level, random, pos, state, source);
        }
    }

    @Override
    protected ItemStack getCloneItemStack(LevelReader level, BlockPos pos, BlockState state, boolean includeData) {
        return rules.berries() ? rules.berryStack() : super.getCloneItemStack(level, pos, state, includeData);
    }

    @Override
    protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
        return rules.use(state, level, pos, player, super.useWithoutItem(state, level, pos, player, hit));
    }

    // Events and triggers: delegated to the driver after vanilla's own behaviour (ADR 0067 D3, D4).

    @Override
    public void stepOn(Level level, BlockPos pos, BlockState state, Entity entity) {
        rules.driver.stepOn(level, pos, entity);
        super.stepOn(level, pos, state, entity);
    }

    @Override
    public BlockState playerWillDestroy(Level level, BlockPos pos, BlockState state, Player player) {
        rules.driver.playerWillDestroy(level, pos, player);
        return super.playerWillDestroy(level, pos, state, player);
    }

    @Override
    public void setPlacedBy(Level level, BlockPos pos, BlockState state, LivingEntity placer, ItemStack stack) {
        super.setPlacedBy(level, pos, state, placer, stack);
        rules.driver.setPlacedBy(level, pos, placer);
    }

    @Override
    protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
        super.randomTick(state, level, pos, random);
        if (level.getBlockState(pos).is(this)) {
            rules.driver.randomTick(level, pos, random);
        }
    }

    @Override
    protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier effects,
            boolean intersects) {
        super.entityInside(state, level, pos, entity, effects, intersects);
        rules.driver.entityInside(level, pos, entity);
    }

    /** Client: {@code msm:ambient_particles} (ADR 0080 D6), after vanilla's own. */
    @Override
    public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
        super.animateTick(state, level, pos, random);
        rules.driver.animateTick(state, level, pos, random);
    }

    /** The strand of a water plant: vanilla's {@link KelpPlantBlock} naming the element as its tip. */
    public static class Water extends KelpPlantBlock implements DrivenBlock {
        private final MsmGrowingPlantHeadBlock.Water head;
        private final MsmGrowingPlantHeadBlock.Rules rules;

        Water(Identifier id, BlockDefinition definition, MsmGrowingPlantHeadBlock.Water head, Properties props) {
            super(props);
            this.head = head;
            this.rules = new MsmGrowingPlantHeadBlock.Rules(this, id, definition);
            if (rules.berries()) {
                registerDefaultState(defaultBlockState().setValue(CaveVines.BERRIES, false));
            }
        }

        @Override
        public BlockBehaviourDriver driver() {
            return rules.driver;
        }

        @Override
        protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
            super.createBlockStateDefinition(builder);
            if (Boolean.TRUE.equals(MsmGrowingPlantHeadBlock.SETUP.get())) {
                builder.add(CaveVines.BERRIES);
            }
        }

        @Override
        protected GrowingPlantHeadBlock getHeadBlock() {
            return head;
        }

        @Override
        protected BlockState updateHeadAfterConvertedFromBody(BlockState body, BlockState headState) {
            return MsmGrowingPlantHeadBlock.Rules.copyBerries(body, super.updateHeadAfterConvertedFromBody(body, headState));
        }

        @Override
        protected boolean canSurvive(BlockState state, LevelReader level, BlockPos pos) {
            return rules.soil.isPresent() ? head.rules().survives(level, pos, growthDirection) : super.canSurvive(state, level, pos);
        }

        @Override
        public boolean isValidBonemealTarget(LevelReader level, BlockPos pos, BlockState state, BonemealSource source) {
            return rules.berries() ? !GrowingPlantTypes.hasBerries(state) : super.isValidBonemealTarget(level, pos, state, source);
        }

        @Override
        public boolean isBonemealSuccess(Level level, RandomSource random, BlockPos pos, BlockState state, BonemealSource source) {
            return rules.berries() || super.isBonemealSuccess(level, random, pos, state, source);
        }

        @Override
        public void performBonemeal(ServerLevel level, RandomSource random, BlockPos pos, BlockState state, BonemealSource source) {
            if (rules.berries()) {
                MsmGrowingPlantHeadBlock.Rules.ripen(level, pos, state);
            } else {
                super.performBonemeal(level, random, pos, state, source);
            }
        }

        @Override
        protected ItemStack getCloneItemStack(LevelReader level, BlockPos pos, BlockState state, boolean includeData) {
            return rules.berries() ? rules.berryStack() : super.getCloneItemStack(level, pos, state, includeData);
        }

        @Override
        protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
            return rules.use(state, level, pos, player, super.useWithoutItem(state, level, pos, player, hit));
        }

        @Override
        public void stepOn(Level level, BlockPos pos, BlockState state, Entity entity) {
            rules.driver.stepOn(level, pos, entity);
            super.stepOn(level, pos, state, entity);
        }

        @Override
        public BlockState playerWillDestroy(Level level, BlockPos pos, BlockState state, Player player) {
            rules.driver.playerWillDestroy(level, pos, player);
            return super.playerWillDestroy(level, pos, state, player);
        }

        @Override
        public void setPlacedBy(Level level, BlockPos pos, BlockState state, LivingEntity placer, ItemStack stack) {
            super.setPlacedBy(level, pos, state, placer, stack);
            rules.driver.setPlacedBy(level, pos, placer);
        }

        @Override
        protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
            super.randomTick(state, level, pos, random);
            if (level.getBlockState(pos).is(this)) {
                rules.driver.randomTick(level, pos, random);
            }
        }

        @Override
        protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier effects,
                boolean intersects) {
            super.entityInside(state, level, pos, entity, effects, intersects);
            rules.driver.entityInside(level, pos, entity);
        }

        @Override
        public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
            super.animateTick(state, level, pos, random);
            rules.driver.animateTick(state, level, pos, random);
        }
    }
}
