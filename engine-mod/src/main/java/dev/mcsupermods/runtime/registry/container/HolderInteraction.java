package dev.mcsupermods.runtime.registry.container;

import net.minecraft.world.Container;
import net.minecraft.world.Containers;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;

/**
 * The holder's put-in and take-out (ADR 0074 D1, layout {@code none}): using the block with an item puts as much of the
 * held stack as fits into the first slot that takes it; using it with an empty hand takes the last filled slot out. Both
 * respect {@code canPlaceItem} and the slot's stack limit. The item is not drawn on the block (limit C9).
 */
public final class HolderInteraction {
    private HolderInteraction() {}

    /**
     * Moves as much of {@code held} as fits into the first slot of {@code container} that takes any of it (an empty
     * slot or one holding the same item and components), consuming it from {@code held} unless {@code player} has
     * infinite materials. Returns the number of items moved, 0 when no slot takes it.
     */
    public static int putIn(Container container, ItemStack held, Player player) {
        if (held.isEmpty()) {
            return 0;
        }
        for (int slot = 0; slot < container.getContainerSize(); slot++) {
            if (!container.canPlaceItem(slot, held)) {
                continue;
            }
            ItemStack inSlot = container.getItem(slot);
            int limit = Math.min(container.getMaxStackSize(held), held.getMaxStackSize());
            int moved;
            if (inSlot.isEmpty()) {
                moved = Math.min(held.getCount(), limit);
                container.setItem(slot, held.copyWithCount(moved));
            } else if (ItemStack.isSameItemSameComponents(inSlot, held) && inSlot.getCount() < limit) {
                moved = Math.min(held.getCount(), limit - inSlot.getCount());
                inSlot.grow(moved);
            } else {
                continue;
            }
            held.consume(moved, player);
            container.setChanged();
            return moved;
        }
        return 0;
    }

    /**
     * Takes the whole stack of the last filled slot out of {@code container} into {@code player}'s inventory (dropped
     * at the player when it is full). Returns the stack taken, empty when the container is empty.
     */
    public static ItemStack takeOut(Container container, Player player) {
        for (int slot = container.getContainerSize() - 1; slot >= 0; slot--) {
            if (!container.getItem(slot).isEmpty()) {
                ItemStack taken = container.removeItemNoUpdate(slot);
                container.setChanged();
                ItemStack given = taken.copy();
                if (!player.getInventory().add(given)) {
                    Containers.dropItemStack(player.level(), player.getX(), player.getY(), player.getZ(), given);
                }
                return taken;
            }
        }
        return ItemStack.EMPTY;
    }
}
