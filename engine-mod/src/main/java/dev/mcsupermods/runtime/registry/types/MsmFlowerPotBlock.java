package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.registry.BlockBehaviourDriver;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Map;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.stats.Stats;
import net.minecraft.util.RandomSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.BlockGetter;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.level.pathfinder.PathComputationType;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * A project flower pot (ADR 0103 D2 and its amendment after B503, X4): its own block class with its own plant-to-pot map,
 * never a vanilla {@code FlowerPotBlock} (whose constructor would hand vanilla's empty pot the plant). The empty pot
 * ({@code type: "flower_pot"}, {@link #plant()} air) keeps the map; each potted block ({@code type: "potted_plant"} with
 * {@code pot} naming the project pot) holds one plant and adds itself to its pot's map when it is made
 * ({@link PotTypes#potted}). Vanilla's pot and its map are untouched.
 *
 * <p>Use is vanilla's pot's, as observed beside it ({@code MsmFlowerPotGameTest}): a plant in the map goes in from the
 * hand (one used outside creative), anything else does nothing; an empty hand takes the plant out into the hand (or the
 * inventory, or the ground) and leaves the empty pot, as does any item that does not go in; putting a plant in counts
 * vanilla's "flowers potted" statistic (taking it out does not, as vanilla's); each change sends a block change game event. Pick block gives the plant of a potted block. The shape and path-finding are vanilla's pot's,
 * asked of vanilla's own block. The loot tables (the pot, and the pot and the plant) are the lowering's.
 */
public class MsmFlowerPotBlock extends Block implements DrivenBlock {
    private final BlockBehaviourDriver driver;
    private final Block plant;
    private final MsmFlowerPotBlock emptyPot;
    /** The empty pot's plant-to-pot map; empty for a potted block. */
    private final Map<Block, MsmFlowerPotBlock> potted = new IdentityHashMap<>();

    /**
     * @param plant the plant inside; {@link Blocks#AIR} for the empty pot
     * @param emptyPot the empty pot this potted block turns back into; null for the empty pot itself
     */
    public MsmFlowerPotBlock(Identifier id, BlockDefinition definition, Block plant, MsmFlowerPotBlock emptyPot,
            Properties properties) {
        super(properties);
        this.driver = new BlockBehaviourDriver(id, definition);
        this.plant = plant;
        this.emptyPot = emptyPot;
    }

    @Override
    public BlockBehaviourDriver driver() {
        return driver;
    }

    /** The plant inside, or {@link Blocks#AIR} for the empty pot. */
    public Block plant() {
        return plant;
    }

    /** Whether this is the empty pot. */
    public boolean isEmptyPot() {
        return emptyPot == null;
    }

    /** The empty pot of this potted block, or this block when it is the empty pot. */
    public MsmFlowerPotBlock emptyPot() {
        return emptyPot == null ? this : emptyPot;
    }

    /** The empty pot's potted block for {@code plantBlock}, if one was made. */
    public Optional<MsmFlowerPotBlock> pottedFor(Block plantBlock) {
        return Optional.ofNullable(potted.get(plantBlock));
    }

    /** The empty pot's whole map, plant to potted block. */
    public Map<Block, MsmFlowerPotBlock> pottedPlants() {
        return Collections.unmodifiableMap(potted);
    }

    /** Adds a potted block to this empty pot's map; called by {@link PotTypes#potted} before it is registered. */
    void addPotted(Block plantBlock, MsmFlowerPotBlock pottedBlock) {
        potted.put(plantBlock, pottedBlock);
    }

    @Override
    protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {
        return Blocks.FLOWER_POT.defaultBlockState().getShape(level, pos, context);
    }

    @Override
    protected boolean isPathfindable(BlockState state, PathComputationType type) {
        return Blocks.FLOWER_POT.defaultBlockState().isPathfindable(type);
    }

    @Override
    protected InteractionResult useItemOn(ItemStack stack, BlockState state, Level level, BlockPos pos, Player player,
            InteractionHand hand, BlockHitResult hit) {
        MsmFlowerPotBlock into = stack.getItem() instanceof BlockItem item ? emptyPot().potted.get(item.getBlock()) : null;
        if (into == null) {
            return InteractionResult.TRY_WITH_EMPTY_HAND;
        }
        if (!isEmptyPot()) {
            return InteractionResult.CONSUME;
        }
        level.setBlock(pos, into.defaultBlockState(), Block.UPDATE_ALL);
        player.awardStat(Stats.POT_FLOWER);
        stack.consume(1, player);
        level.gameEvent(player, GameEvent.BLOCK_CHANGE, pos);
        return InteractionResult.SUCCESS;
    }

    @Override
    protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
        if (isEmptyPot()) {
            InteractionResult own = driver.useWithoutItem(level, pos, player);
            return own.consumesAction() ? own : InteractionResult.CONSUME;
        }
        ItemStack back = new ItemStack(plant);
        if (!back.isEmpty()) {
            if (player.getItemInHand(InteractionHand.MAIN_HAND).isEmpty()) {
                player.setItemInHand(InteractionHand.MAIN_HAND, back);
            } else if (!player.addItem(back)) {
                Block.popResource(level, pos, back);
            }
        }
        level.setBlock(pos, emptyPot.defaultBlockState(), Block.UPDATE_ALL); // no statistic: vanilla counts only potting
        level.gameEvent(player, GameEvent.BLOCK_CHANGE, pos);
        driver.useWithoutItem(level, pos, player);
        return InteractionResult.SUCCESS;
    }

    @Override
    protected ItemStack getCloneItemStack(LevelReader level, BlockPos pos, BlockState state, boolean includeData) {
        if (!isEmptyPot() && plant.asItem() != Items.AIR) {
            return new ItemStack(plant);
        }
        return super.getCloneItemStack(level, pos, state, includeData);
    }

    // Events and triggers: delegated to the driver after the pot's own behaviour (ADR 0067 D3, D4).

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

    /** Client: {@code msm:ambient_particles} (ADR 0080 D6). */
    @Override
    public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
        super.animateTick(state, level, pos, random);
        driver.animateTick(state, level, pos, random);
    }
}
