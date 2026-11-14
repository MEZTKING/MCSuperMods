package dev.mcsupermods.runtime.registry.container;

import dev.mcsupermods.runtime.components.BlockComponents;
import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.registry.MsmBlock;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.RandomSource;
import net.minecraft.world.Containers;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.EntityBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.BlockEntityTicker;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;

/**
 * An {@link MsmBlock} with a block entity (ADR 0074 D2): shapes, facing, redstone and events stay in {@code MsmBlock} and
 * {@code BlockBehaviourDriver}. {@link MsmBlock#create} builds one when {@link BlockEntityHooks#wantsBlockEntity} says so.
 *
 * <p>Containers ({@code msm:container}, B314): {@link #useWithoutItem} opens the layout's vanilla menu, or for a holder
 * ({@code none}) takes the last filled slot out with an empty hand; {@link #useItemOn} puts the held item into a holder;
 * {@code msm:on_interact} fires after either (ADR 0067 D3 order). Comparators read the barrel's formula; the scheduled
 * {@link #tick} rechecks the openers; breaking a non-empty keep-contents block in creative drops it with its contents, as
 * a shulker box does. When the block entity type could not be registered (its id clashed), the block keeps working as a
 * plain {@code MsmBlock} with no block entity.
 */
public class MsmContainerBlock extends MsmBlock implements EntityBlock {
    private final Optional<BlockComponents.Container> container;
    private BlockEntityType<MsmStorageBlockEntity> storageType;

    public MsmContainerBlock(Identifier id, BlockDefinition definition, Setup setup, Properties properties) {
        super(id, definition, setup, properties);
        this.container = definition.components().container();
    }

    /** {@code msm:container}, when the block has one. */
    public Optional<BlockComponents.Container> container() {
        return container;
    }

    /** The registered block entity type of the container; null before registration or when its id clashed. */
    public BlockEntityType<MsmStorageBlockEntity> storageType() {
        return storageType;
    }

    /** Set once by {@link BlockEntityHooks#afterBlockRegistered}. */
    void attachStorage(BlockEntityType<MsmStorageBlockEntity> type) {
        this.storageType = type;
    }

    /** Whether the block keeps its contents in its item (ADR 0074 D6) and has its block entity. */
    public boolean keepsContents() {
        return storageType != null && container.map(BlockComponents.Container::keepContents).orElse(false);
    }

    @Override
    public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
        if (storageType != null && container.isPresent()) {
            return new MsmStorageBlockEntity(storageType, pos, state, container.get());
        }
        return null; // B316: the machine's block entity
    }

    @Override
    public <T extends BlockEntity> BlockEntityTicker<T> getTicker(Level level, BlockState state, BlockEntityType<T> type) {
        return null; // containers do not tick (the opener recheck is a scheduled block tick); B316: machines
    }

    private static MsmStorageBlockEntity storage(Level level, BlockPos pos) {
        return level.getBlockEntity(pos) instanceof MsmStorageBlockEntity storage ? storage : null;
    }

    // Using the block (ADR 0074 D1)

    @Override
    protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
        MsmStorageBlockEntity storage = storage(level, pos);
        if (storage == null) {
            return super.useWithoutItem(state, level, pos, player, hit);
        }
        boolean used;
        if (storage.spec().layout() == BlockComponents.ContainerLayout.NONE) {
            used = true; // the client cannot see the contents: it predicts a use and the server decides
            if (level instanceof ServerLevel && player.getMainHandItem().isEmpty()) {
                used = !HolderInteraction.takeOut(storage, player).isEmpty();
                if (used) {
                    storage.fire(storage.spec().onOpen(), player);
                }
            } else if (level instanceof ServerLevel) {
                used = false; // an item that did not fit: only msm:on_interact below
            }
        } else {
            if (level instanceof ServerLevel) {
                player.openMenu(storage); // a locked container sends its own message and opens nothing
            }
            used = true;
        }
        InteractionResult interact = super.useWithoutItem(state, level, pos, player, hit); // msm:on_interact
        return used || interact.consumesAction() ? InteractionResult.SUCCESS : InteractionResult.PASS;
    }

    @Override
    protected InteractionResult useItemOn(ItemStack stack, BlockState state, Level level, BlockPos pos, Player player,
            InteractionHand hand, BlockHitResult hit) {
        MsmStorageBlockEntity storage = storage(level, pos);
        if (stack.isEmpty() || storage == null || storage.spec().layout() != BlockComponents.ContainerLayout.NONE) {
            return super.useItemOn(stack, state, level, pos, player, hand, hit); // menus: opened by useWithoutItem
        }
        if (!(level instanceof ServerLevel)) {
            return InteractionResult.SUCCESS;
        }
        if (HolderInteraction.putIn(storage, stack, player) == 0) {
            return InteractionResult.TRY_WITH_EMPTY_HAND; // nothing fitted: msm:on_interact only
        }
        storage.fire(storage.spec().onOpen(), player);
        super.useWithoutItem(state, level, pos, player, hit); // msm:on_interact
        return InteractionResult.SUCCESS;
    }

    // Openers: vanilla's ContainerOpenersCounter schedules this tick (the barrel's recheck, ADR 0074 D3).

    @Override
    protected void tick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
        super.tick(state, level, pos, random);
        MsmStorageBlockEntity storage = storage(level, pos);
        if (storage != null) {
            storage.recheckOpen();
        }
    }

    // Comparators (ADR 0074 D4): the barrel's formula.

    @Override
    protected boolean hasAnalogOutputSignal(BlockState state) {
        return storageType != null && container.map(BlockComponents.Container::comparator).orElse(false);
    }

    @Override
    protected int getAnalogOutputSignal(BlockState state, Level level, BlockPos pos, Direction direction) {
        return AbstractContainerMenu.getRedstoneSignalFromBlockEntity(level.getBlockEntity(pos));
    }

    @Override
    protected void affectNeighborsAfterRemoval(BlockState state, ServerLevel level, BlockPos pos, boolean movedByPiston) {
        super.affectNeighborsAfterRemoval(state, level, pos, movedByPiston);
        Containers.updateNeighboursAfterDestroy(state, level, pos);
    }

    // Breaking (ADR 0074 D5, D6)

    @Override
    public BlockState playerWillDestroy(Level level, BlockPos pos, BlockState state, Player player) {
        MsmStorageBlockEntity storage = storage(level, pos);
        if (storage != null && keepsContents() && !level.isClientSide() && player.preventsBlockDrops() && !storage.isEmpty()) {
            // Creative breaking drops no loot, so a non-empty keep-contents block drops itself with its contents, as a
            // shulker box does.
            ItemStack drop = new ItemStack(this);
            if (!drop.isEmpty()) {
                drop.applyComponents(storage.collectComponents());
                ItemEntity entity = new ItemEntity(level, pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5, drop);
                entity.setDefaultPickUpDelay();
                level.addFreshEntity(entity);
            }
        }
        return super.playerWillDestroy(level, pos, state, player);
    }
}
