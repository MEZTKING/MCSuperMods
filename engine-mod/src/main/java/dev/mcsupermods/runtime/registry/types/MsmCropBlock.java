package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.BlockType;
import dev.mcsupermods.runtime.registry.BlockBehaviourDriver;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.TagKey;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.ItemLike;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.CropBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.IntegerProperty;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * A crop ({@code type: "crop"}, ADR 0068 D3): vanilla {@link CropBlock} with its own {@code age} property
 * ({@code 0..max_age}), stage heights, soil tag and bone meal range. Growth with light and farmland, trampling, bees and
 * villagers stay vanilla's (villagers farm only crops on farmland). The seeds are the block's own item, whatever its id
 * ({@code item.id}, ADR 0068 D2): {@link #getBaseSeedId} returns this block, whose item vanilla looks up.
 */
public class MsmCropBlock extends CropBlock implements DrivenBlock {
    /** The age property is needed inside {@code super(...)}, before fields exist; this carries it in. */
    private static final ThreadLocal<IntegerProperty> SETUP = new ThreadLocal<>();

    private final BlockBehaviourDriver driver;
    private final IntegerProperty age;
    private final int maxAge;
    private final VoxelShape[] shapes;
    private final TagKey<Block> soil;
    private final int bonemealMin;
    private final int bonemealMax;

    public static MsmCropBlock create(Identifier id, BlockDefinition definition, List<Integer> stageHeights, Properties properties) {
        BlockType.Crop crop = (BlockType.Crop) definition.typeFields();
        SETUP.set(IntegerProperty.create("age", 0, crop.maxAge()));
        try {
            return new MsmCropBlock(id, definition, crop, stageHeights, properties);
        } finally {
            SETUP.remove();
        }
    }

    private MsmCropBlock(Identifier id, BlockDefinition definition, BlockType.Crop crop, List<Integer> stageHeights,
            Properties properties) {
        super(properties);
        this.driver = new BlockBehaviourDriver(id, definition);
        this.age = SETUP.get();
        this.maxAge = crop.maxAge();
        this.shapes = new VoxelShape[maxAge + 1];
        for (int stage = 0; stage <= maxAge; stage++) {
            shapes[stage] = Block.box(0, 0, 0, 16, stageHeights.get(stage), 16);
        }
        this.soil = TagKey.create(Registries.BLOCK, crop.soil());
        // B261: min > max is accepted by the format (the validators report it); the bounds are swapped here.
        this.bonemealMin = Math.min(crop.bonemealGrowth().min(), crop.bonemealGrowth().max());
        this.bonemealMax = Math.max(crop.bonemealGrowth().min(), crop.bonemealGrowth().max());
    }

    /**
     * The stage heights in pixels, one per age: {@code stage_heights} when it has {@code max_age + 1} entries, else
     * vanilla's ramp ({@link BlockType.Crop#defaultStageHeight}).
     */
    public static List<Integer> stageHeights(BlockType.Crop crop) {
        List<Integer> written = crop.stageHeightsSetting().orElse(List.of());
        if (written.size() == crop.maxAge() + 1) {
            return List.copyOf(written);
        }
        Integer[] ramp = new Integer[crop.maxAge() + 1];
        for (int stage = 0; stage <= crop.maxAge(); stage++) {
            ramp[stage] = BlockType.Crop.defaultStageHeight(stage, crop.maxAge());
        }
        return List.of(ramp);
    }

    @Override
    public BlockBehaviourDriver driver() {
        return driver;
    }

    @Override
    protected IntegerProperty getAgeProperty() {
        return age != null ? age : SETUP.get(); // CropBlock's constructor sets the default age before our fields exist
    }

    @Override
    public int getMaxAge() {
        return maxAge;
    }

    @Override
    protected void createBlockStateDefinition(StateDefinition.Builder<Block, BlockState> builder) {
        builder.add(SETUP.get()); // not super: vanilla's AGE is 0..7
    }

    @Override
    protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
        return shapes[getAge(state)];
    }

    @Override
    protected boolean mayPlaceOn(BlockState state, BlockGetter level, BlockPos pos) {
        return state.is(soil);
    }

    @Override
    protected boolean isRandomlyTicking(BlockState state) {
        // Vanilla stops at the maximum age; msm:on_random_tick keeps firing there.
        return super.isRandomlyTicking(state) || driver.definition().components().onRandomTick().isPresent();
    }

    @Override
    protected int getBonemealAgeIncrease(Level level) {
        return Mth.nextInt(level.getRandom(), bonemealMin, bonemealMax);
    }

    @Override
    protected ItemLike getBaseSeedId() {
        return this; // the block's own item (item.id), or air with "item": false
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
        driver.randomTick(level, pos, random);
    }

    @Override
    protected void entityInside(BlockState state, Level level, BlockPos pos, Entity entity, InsideBlockEffectApplier effects,
            boolean intersects) {
        super.entityInside(state, level, pos, entity, effects, intersects);
        driver.entityInside(level, pos, entity);
    }
}
