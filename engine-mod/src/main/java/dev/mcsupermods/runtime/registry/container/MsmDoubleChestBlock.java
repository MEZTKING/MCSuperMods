package dev.mcsupermods.runtime.registry.container;

import dev.mcsupermods.runtime.components.BlockComponents;
import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.registry.BlockBehaviourDriver;
import dev.mcsupermods.runtime.registry.types.DrivenBlock;
import dev.mcsupermods.runtime.registry.weathering.Weathering;
import java.util.function.Supplier;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.util.RandomSource;
import net.minecraft.world.Container;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.MenuProvider;
import net.minecraft.world.WorldlyContainer;
import net.minecraft.world.WorldlyContainerHolder;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.InsideBlockEffectApplier;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.block.ChestBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.entity.ChestBlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;

/**
 * A chest with {@code double: true} (ADR 0104 D4 and its amendment after B503, X8): vanilla's {@link ChestBlock} family with
 * its own block entity type ({@link MsmDoubleChestBlockEntity}, registered with the block's id by
 * {@link BlockEntityHooks}; {@link #newBlockEntity} is overridden so the vanilla chest type is never made). Two placed side
 * by side join through vanilla's {@code type} state ({@code single}, {@code left}, {@code right}), share one six-row menu
 * and each half keeps and drops its own 27 slots; sneak-placing keeps them apart; comparators and hoppers work per half as
 * vanilla's. Block models per {@code type} draw it (no block entity renderer, ADR 0074 C9). It always has vanilla's
 * {@code waterlogged} property, as vanilla's chest.
 *
 * <p>The container options: {@code open_sound} and {@code close_sound} (the barrel's by default, as every MSM container),
 * {@code on_open} and {@code on_close} (once per opening of the pair), {@code comparator}, and {@code hoppers}: the block
 * is a {@link WorldlyContainerHolder}, which hoppers and Fabric's item transfer ask first, answering vanilla's container
 * for the chest (both halves when joined) with every face or, with {@code hoppers: false}, none. {@code msm:shape} and
 * {@code msm:redstone} do not apply (the chest keeps vanilla's shape); the other events and triggers go through the
 * {@link BlockBehaviourDriver}. {@link Weathers} ages like vanilla's copper chest, both halves together
 * ({@code Weathering.replace}).
 */
public class MsmDoubleChestBlock extends ChestBlock implements DrivenBlock, WorldlyContainerHolder {
    private final BlockBehaviourDriver driver;
    private final BlockComponents.Container spec;
    private final TypeBox box;

    public MsmDoubleChestBlock(Identifier id, BlockDefinition definition, Properties properties) {
        this(id, definition, definition.components().container().orElseThrow(), new TypeBox(), properties);
    }

    private MsmDoubleChestBlock(Identifier id, BlockDefinition definition, BlockComponents.Container spec, TypeBox box, Properties properties) {
        super(box, ContainerOpeners.sound(spec.openSound(), SoundEvents.BARREL_OPEN),
                ContainerOpeners.sound(spec.closeSound(), SoundEvents.BARREL_CLOSE), properties);
        this.driver = new BlockBehaviourDriver(id, definition);
        this.spec = spec;
        this.box = box;
    }

    /** The block entity type, filled once by {@link BlockEntityHooks} after the block is registered (null when its id clashed). */
    static final class TypeBox implements Supplier<BlockEntityType<? extends ChestBlockEntity>> {
        private BlockEntityType<MsmDoubleChestBlockEntity> type;

        @Override
        public BlockEntityType<MsmDoubleChestBlockEntity> get() {
            return type;
        }
    }

    @Override
    public BlockBehaviourDriver driver() {
        return driver;
    }

    public Identifier id() {
        return driver.id();
    }

    /** {@code msm:container}. */
    public BlockComponents.Container spec() {
        return spec;
    }

    /** The registered block entity type; null before registration or when its id clashed. */
    public BlockEntityType<MsmDoubleChestBlockEntity> storageType() {
        return box.type;
    }

    /** Set once by {@link BlockEntityHooks#afterBlockRegistered}. */
    void attachStorage(BlockEntityType<MsmDoubleChestBlockEntity> type) {
        box.type = type;
    }

    @Override
    public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
        return box.type == null ? null : new MsmDoubleChestBlockEntity(box.type, pos, state);
    }

    // Comparators: vanilla's per half unless comparator is false; hoppers through the holder below.

    @Override
    protected boolean hasAnalogOutputSignal(BlockState state) {
        return box.type != null && spec.comparator();
    }

    @Override
    protected int getAnalogOutputSignal(BlockState state, Level level, BlockPos pos, Direction direction) {
        return box.type == null ? 0 : super.getAnalogOutputSignal(state, level, pos, direction);
    }

    @Override
    public WorldlyContainer getContainer(BlockState state, LevelAccessor level, BlockPos pos) {
        Container chest = box.type != null && level instanceof Level l ? ChestBlock.getContainer(this, state, l, pos, true) : null;
        return new HopperFaces(chest, spec.hoppers());
    }

    @Override
    protected MenuProvider getMenuProvider(BlockState state, Level level, BlockPos pos) {
        return box.type == null ? null : super.getMenuProvider(state, level, pos);
    }

    // Events and triggers: delegated to the driver after vanilla's own behaviour (ADR 0067 D3, D4).

    @Override
    protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
        InteractionResult vanilla = box.type == null ? InteractionResult.PASS : super.useWithoutItem(state, level, pos, player, hit);
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

    /** Client: {@code msm:ambient_particles} (ADR 0080 D6), after vanilla's own. */
    @Override
    public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {
        super.animateTick(state, level, pos, random);
        driver.animateTick(state, level, pos, random);
    }

    /**
     * A double chest that weathers like vanilla's copper chest (ADR 0104 D6): its random tick asks vanilla's chance and
     * neighbour rule and {@code Weathering.replace} turns both halves into the next stage, keeping their contents.
     */
    public static class Weathers extends MsmDoubleChestBlock implements Weathering.Ageing {
        private final Weathering.Stage stage;

        public Weathers(Identifier id, BlockDefinition definition, Weathering.Stage stage, Properties properties) {
            super(id, definition, properties);
            this.stage = stage;
        }

        @Override
        public Weathering.Stage weatheringStage() {
            return stage;
        }

        @Override
        protected boolean isRandomlyTicking(BlockState state) {
            return super.isRandomlyTicking(state) || Weathering.ages(stage.id());
        }

        @Override
        protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
            super.randomTick(state, level, pos, random);
            Weathering.randomTick(this, state, level, pos, random);
        }
    }

    /** Vanilla's chest container (one half or both) seen by hoppers: every slot from every face, or none. */
    private record HopperFaces(Container chest, boolean open) implements WorldlyContainer {
        private static final int[] NONE = new int[0];

        @Override
        public int[] getSlotsForFace(Direction side) {
            if (!open || chest == null) {
                return NONE;
            }
            int[] all = new int[chest.getContainerSize()];
            for (int i = 0; i < all.length; i++) {
                all[i] = i;
            }
            return all;
        }

        @Override
        public boolean canPlaceItemThroughFace(int slot, ItemStack stack, Direction side) {
            return open && chest != null && chest.canPlaceItem(slot, stack);
        }

        @Override
        public boolean canTakeItemThroughFace(int slot, ItemStack stack, Direction side) {
            return open && chest != null;
        }

        @Override
        public int getContainerSize() {
            return chest == null ? 0 : chest.getContainerSize();
        }

        @Override
        public boolean isEmpty() {
            return chest == null || chest.isEmpty();
        }

        @Override
        public ItemStack getItem(int slot) {
            return chest == null ? ItemStack.EMPTY : chest.getItem(slot);
        }

        @Override
        public ItemStack removeItem(int slot, int count) {
            return chest == null ? ItemStack.EMPTY : chest.removeItem(slot, count);
        }

        @Override
        public ItemStack removeItemNoUpdate(int slot) {
            return chest == null ? ItemStack.EMPTY : chest.removeItemNoUpdate(slot);
        }

        @Override
        public void setItem(int slot, ItemStack stack) {
            if (chest != null) {
                chest.setItem(slot, stack);
            }
        }

        @Override
        public int getMaxStackSize() {
            return chest == null ? 64 : chest.getMaxStackSize();
        }

        @Override
        public boolean canPlaceItem(int slot, ItemStack stack) {
            return chest != null && chest.canPlaceItem(slot, stack);
        }

        @Override
        public void setChanged() {
            if (chest != null) {
                chest.setChanged();
            }
        }

        @Override
        public boolean stillValid(Player player) {
            return chest != null && chest.stillValid(player);
        }

        @Override
        public void clearContent() {
            if (chest != null) {
                chest.clearContent();
            }
        }
    }
}
