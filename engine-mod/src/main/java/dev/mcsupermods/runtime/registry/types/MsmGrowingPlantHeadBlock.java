package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.BlockType;
import dev.mcsupermods.runtime.loader.types.GrowingPlantFields;
import dev.mcsupermods.runtime.registry.BlockBehaviourDriver;
import java.util.List;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
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
import net.minecraft.world.level.block.CaveVines;
import net.minecraft.world.level.block.GrowingPlantHeadBlock;
import net.minecraft.world.level.block.KelpBlock;
import net.minecraft.world.level.block.NetherVines;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * The tip of a growing plant ({@code type: "growing_plant"}, ADR 0103 D1, D3 and its amendment): the element itself, whose
 * strand is the companion {@code <path>_plant} ({@link MsmGrowingPlantBodyBlock}). A dry plant is vanilla's
 * {@link GrowingPlantHeadBlock} in the {@code direction}, with the definition's {@code growth_chance}; a {@code needs_water}
 * plant is vanilla's {@link KelpBlock} ({@link Water}: waterlogged by nature, grows up into water, refuses
 * {@code #minecraft:cannot_support_kelp} without a {@code soil}). Growth, the head turning into the strand, bone meal and
 * survival are vanilla's, over these numbers (B503: vanilla's age runs 0 to 25 and is fixed, so a plant grows at most 26
 * blocks):
 * <ul>
 *   <li>{@code max_age} is how many blocks the tip may still grow when placed: 25 (the default) keeps vanilla's random
 *       start, a lower number starts the tip at age {@code 25 - max_age}</li>
 *   <li>{@code bonemeal_growth}: blocks per bone meal from {@code min} to {@code max}; default vanilla's for the shape (one
 *       for water plants, vanilla's nether-vine count for dry ones)</li>
 *   <li>{@code berries}: cave-vine-like; a new tip has them 11 times in 100, bone meal ripens them instead of growing the
 *       plant, a use picks one {@code berries.item}, pick block gives it (our own rule over vanilla's
 *       {@link CaveVines#BERRIES} property: vanilla's would give glow berries)</li>
 *   <li>{@code soil}: the base checked by our own survival rule (see {@link GrowingPlantTypes})</li>
 * </ul>
 * Climbing is {@code #minecraft:climbable}, which the lowering adds.
 */
public class MsmGrowingPlantHeadBlock extends GrowingPlantHeadBlock implements DrivenBlock {
    /** Whether the state has {@link CaveVines#BERRIES}; needed inside {@code super(...)}, before fields exist. */
    static final ThreadLocal<Boolean> SETUP = new ThreadLocal<>();

    private final Rules rules;

    /** The tip of {@code definition}: a dry plant or a water plant, with or without berries. */
    public static Block create(Identifier id, BlockDefinition definition, Properties props) {
        GrowingPlantFields.GrowingPlant fields = (GrowingPlantFields.GrowingPlant) definition.typeFields();
        SETUP.set(fields.berries().isPresent());
        try {
            return fields.needsWater() ? new Water(id, definition, props) : new MsmGrowingPlantHeadBlock(id, definition, fields, props);
        } finally {
            SETUP.remove();
        }
    }

    private MsmGrowingPlantHeadBlock(Identifier id, BlockDefinition definition, GrowingPlantFields.GrowingPlant fields, Properties props) {
        super(props, direction(fields), headShape(fields), false, fields.growthChance());
        this.rules = new Rules(this, id, definition);
        if (rules.berries()) {
            registerDefaultState(defaultBlockState().setValue(CaveVines.BERRIES, false)); // as cave vines
        }
    }

    static Direction direction(GrowingPlantFields.GrowingPlant fields) {
        return fields.direction() == GrowingPlantFields.GrowthDirection.DOWN ? Direction.DOWN : Direction.UP;
    }

    /** Vanilla's tip shape of the matching vanilla plant (cave vines, weeping or twisting vines), read from that block. */
    private static VoxelShape headShape(GrowingPlantFields.GrowingPlant fields) {
        Block like = fields.direction() == GrowingPlantFields.GrowthDirection.UP ? net.minecraft.world.level.block.Blocks.TWISTING_VINES
                : fields.berries().isPresent() ? net.minecraft.world.level.block.Blocks.CAVE_VINES
                : net.minecraft.world.level.block.Blocks.WEEPING_VINES;
        return MsmGrowingPlantBodyBlock.shapeOf(like);
    }

    /** The rules this tip follows (shared with {@link Water}). */
    Rules rules() {
        return rules;
    }

    @Override
    public BlockBehaviourDriver driver() {
        return rules.driver;
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
        super.createBlockStateDefinition(builder);
        if (Boolean.TRUE.equals(SETUP.get())) {
            builder.add(CaveVines.BERRIES);
        }
    }

    @Override
    protected Block getBodyBlock() {
        return rules.body();
    }

    @Override
    protected boolean canGrowInto(BlockState state) {
        return NetherVines.isValidGrowthState(state);
    }

    @Override
    protected int getBlocksToGrowWhenBonemealed(RandomSource random) {
        return rules.bonemealCount(random).orElseGet(() -> NetherVines.getBlocksToGrowWhenBonemealed(random));
    }

    @Override
    public BlockState getStateForPlacement(RandomSource random) {
        return rules.placed(super.getStateForPlacement(random));
    }

    @Override
    protected BlockState getGrowIntoState(BlockState state, RandomSource random) {
        return rules.grown(super.getGrowIntoState(state, random), random);
    }

    @Override
    protected BlockState updateBodyAfterConvertedFromHead(BlockState head, BlockState body) {
        return Rules.copyBerries(head, super.updateBodyAfterConvertedFromHead(head, body));
    }

    @Override
    protected boolean canSurvive(BlockState state, LevelReader level, BlockPos pos) {
        return rules.soil.isPresent() ? rules.survives(level, pos, growthDirection) : super.canSurvive(state, level, pos);
    }

    @Override
    protected boolean isRandomlyTicking(BlockState state) {
        return super.isRandomlyTicking(state) || rules.driver.definition().components().onRandomTick().isPresent();
    }

    @Override
    protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
        super.randomTick(state, level, pos, random);
        if (level.getBlockState(pos).is(this)) {
            rules.driver.randomTick(level, pos, random);
        }
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
            Rules.ripen(level, pos, state);
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

    /**
     * A water plant's tip ({@code needs_water: true}): vanilla's {@link KelpBlock}, always growing up. Vanilla's growth
     * chance is 14 in 100; another {@code growth_chance} uses our own random tick (grow one block up into water with that
     * chance while the age is below 25, the age rising by one), the rest is vanilla's.
     */
    public static class Water extends KelpBlock implements DrivenBlock {
        private final Rules rules;
        private final float growthChance;

        Water(Identifier id, BlockDefinition definition, Properties props) {
            super(props);
            this.rules = new Rules(this, id, definition);
            this.growthChance = ((GrowingPlantFields.GrowingPlant) definition.typeFields()).growthChance();
            if (rules.berries()) {
                registerDefaultState(defaultBlockState().setValue(CaveVines.BERRIES, false));
            }
        }

        Rules rules() {
            return rules;
        }

        @Override
        public BlockBehaviourDriver driver() {
            return rules.driver;
        }

        @Override
        protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
            super.createBlockStateDefinition(builder);
            if (Boolean.TRUE.equals(SETUP.get())) {
                builder.add(CaveVines.BERRIES);
            }
        }

        @Override
        protected Block getBodyBlock() {
            return rules.body();
        }

        @Override
        protected int getBlocksToGrowWhenBonemealed(RandomSource random) {
            return rules.bonemealCount(random).orElseGet(() -> super.getBlocksToGrowWhenBonemealed(random));
        }

        @Override
        public BlockState getStateForPlacement(RandomSource random) {
            return rules.placed(super.getStateForPlacement(random));
        }

        @Override
        protected BlockState getGrowIntoState(BlockState state, RandomSource random) {
            return rules.grown(super.getGrowIntoState(state, random), random);
        }

        @Override
        protected BlockState updateBodyAfterConvertedFromHead(BlockState head, BlockState body) {
            return Rules.copyBerries(head, super.updateBodyAfterConvertedFromHead(head, body));
        }

        @Override
        protected boolean canSurvive(BlockState state, LevelReader level, BlockPos pos) {
            return rules.soil.isPresent() ? rules.survives(level, pos, growthDirection) : super.canSurvive(state, level, pos);
        }

        @Override
        protected boolean isRandomlyTicking(BlockState state) {
            return super.isRandomlyTicking(state) || rules.driver.definition().components().onRandomTick().isPresent();
        }

        @Override
        protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
            if (growthChance == GrowingPlantTypes.KELP_GROWTH_CHANCE) {
                super.randomTick(state, level, pos, random);
            } else if (!isMaxAge(state) && random.nextDouble() < growthChance) {
                BlockPos next = pos.relative(growthDirection);
                if (canGrowInto(level.getBlockState(next))) {
                    level.setBlockAndUpdate(next, getGrowIntoState(state, level.getRandom()));
                }
            }
            if (level.getBlockState(pos).is(this)) {
                rules.driver.randomTick(level, pos, random);
            }
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
                Rules.ripen(level, pos, state);
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

    /** The definition's rules shared by a tip and its strand (dry or water). */
    static final class Rules {
        final Block block;
        final BlockBehaviourDriver driver;
        final GrowingPlantFields.GrowingPlant fields;
        final Optional<List<BlockType.IdOrTag>> soil;
        private Block body;

        Rules(Block block, Identifier id, BlockDefinition definition) {
            this.block = block;
            this.driver = new BlockBehaviourDriver(id, definition);
            this.fields = (GrowingPlantFields.GrowingPlant) definition.typeFields();
            this.soil = fields.soil();
        }

        boolean berries() {
            return fields.berries().isPresent();
        }

        /** The strand companion, once registered; the tip itself before (or if it failed to register). */
        Block body() {
            if (body == null) {
                Optional<Block> found = Companions.companionOf(block);
                if (found.isEmpty()) {
                    return block;
                }
                body = found.get();
            }
            return body;
        }

        Optional<Integer> bonemealCount(RandomSource random) {
            return fields.bonemealGrowth().map(g -> {
                int low = Math.min(g.min(), g.max());
                int high = Math.max(g.min(), g.max());
                return low + random.nextInt(high - low + 1);
            });
        }

        /** A newly placed tip: vanilla's random age with {@code max_age} 25, else age {@code 25 - max_age}. */
        BlockState placed(BlockState state) {
            if (state == null || fields.maxAge() == GrowingPlantFields.GrowingPlant.DEFAULT_MAX_AGE) {
                return state;
            }
            return state.setValue(AGE, MAX_AGE - fields.maxAge());
        }

        /** A newly grown tip: with berries 11 times in 100. */
        BlockState grown(BlockState state, RandomSource random) {
            return berries() ? state.setValue(CaveVines.BERRIES, random.nextFloat() < GrowingPlantTypes.BERRIES_ON_GROWTH_CHANCE) : state;
        }

        /** Our own soil rule: the block on the base side is this plant, or one of {@code soil}. */
        boolean survives(LevelReader level, BlockPos pos, Direction growth) {
            BlockState base = level.getBlockState(pos.relative(growth.getOpposite()));
            return base.is(block) || base.is(body()) || GrowingPlantTypes.matches(base, soil.orElseThrow());
        }

        ItemStack berryStack() {
            return GrowingPlantTypes.stackOf(fields.berries().orElseThrow().item());
        }

        /** A use: picks the berries when it has them, then {@code msm:on_interact}. */
        InteractionResult use(BlockState state, Level level, BlockPos pos, Player player, InteractionResult vanilla) {
            InteractionResult picked = berries() ? pick(state, level, pos, player) : vanilla;
            InteractionResult own = driver.useWithoutItem(level, pos, player);
            return picked.consumesAction() ? picked : own;
        }

        private InteractionResult pick(BlockState state, Level level, BlockPos pos, Player player) {
            if (!GrowingPlantTypes.hasBerries(state)) {
                return InteractionResult.PASS;
            }
            if (level instanceof ServerLevel server) {
                ItemStack berry = berryStack();
                if (!berry.isEmpty()) {
                    Block.popResource(server, pos, berry);
                }
                server.playSound(null, pos, SoundEvents.CAVE_VINES_PICK_BERRIES, SoundSource.BLOCKS, 1.0f,
                        0.8f + server.getRandom().nextFloat() * 0.4f);
                BlockState picked = state.setValue(CaveVines.BERRIES, false);
                server.setBlock(pos, picked, Block.UPDATE_CLIENTS);
                server.gameEvent(GameEvent.BLOCK_CHANGE, pos, GameEvent.Context.of(player, picked));
            }
            return InteractionResult.SUCCESS;
        }

        static void ripen(ServerLevel level, BlockPos pos, BlockState state) {
            level.setBlock(pos, state.setValue(CaveVines.BERRIES, true), Block.UPDATE_CLIENTS);
        }

        static BlockState copyBerries(BlockState from, BlockState to) {
            return from.hasProperty(CaveVines.BERRIES) && to.hasProperty(CaveVines.BERRIES)
                    ? to.setValue(CaveVines.BERRIES, from.getValue(CaveVines.BERRIES)) : to;
        }
    }
}
