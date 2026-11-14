package dev.mcsupermods.runtime.scripting;

import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.Container;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.entity.BlockEntity;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.ScriptRuntime;

/**
 * {@code Container} (script API 1.2, ADR 0076 D5): the slots of a block entity that is a vanilla {@link Container}
 * (chests, barrels, hoppers, furnaces, dispensers, MSM containers and machines), from {@code World.getContainer}. A live
 * view: reads and writes go straight to the block entity, and every write calls {@link Container#setChanged()}, which
 * saves the chunk and updates comparators. A double chest gives the half at the position (the block entity itself).
 * Using it after the block entity is removed (the block broken or replaced, its chunk unloaded) is an {@code Error}.
 *
 * <p>Items go through {@link ScriptItems#spec} (strict validation). {@code set} and {@code add} respect
 * {@link Container#canPlaceItem} (a keep-contents crate refuses container items, a furnace's result slot refuses
 * everything) and the container's stack size ({@link Container#getMaxStackSize(ItemStack)}). {@code add} follows
 * {@code HopperBlockEntity.addItem} with no side: slots in order, a non-empty slot takes a stack of the same item and
 * components, an empty slot takes up to the stack size; but the faces of a {@code WorldlyContainer} are ignored (a
 * container with {@code hoppers: false} still takes items from a script), and a stack over its maximum is split over
 * slots rather than cut (vanilla moves one item at a time).
 */
record ScriptContainer(BlockEntity entity) {
    static final ScriptType TYPE = ScriptType.of("Container")
            .constant("size", ScriptContainer.class, (api, c) -> c.container().getContainerSize())
            .method("get", 1, 1, ScriptContainer.class, (api, c, args) ->
                    api.itemOrUndefined(c.live().getItem(c.slot(args, 0))))
            .method("set", 1, 2, ScriptContainer.class, (api, c, args) -> {
                Container container = c.live();
                int slot = c.slot(args, 0);
                ItemStack stack = ScriptValues.present(args, 1) ? ScriptItems.spec(api, args, 1) : ItemStack.EMPTY;
                if (!stack.isEmpty()) {
                    if (!container.canPlaceItem(slot, stack)) {
                        return false;
                    }
                    stack.limitSize(container.getMaxStackSize(stack));
                }
                container.setItem(slot, stack);
                container.setChanged();
                return true;
            })
            .method("count", 1, 1, ScriptContainer.class, (api, c, args) -> {
                Item item = ScriptItems.item(args, 0);
                Container container = c.live();
                int n = 0;
                for (int i = 0; i < container.getContainerSize(); i++) {
                    ItemStack stack = container.getItem(i);
                    if (stack.is(item)) {
                        n += stack.getCount();
                    }
                }
                return n;
            })
            .method("add", 1, 1, ScriptContainer.class, (api, c, args) -> {
                ItemStack stack = ScriptItems.spec(api, args, 0);
                Container container = c.live();
                ItemStack left = add(container, stack);
                return api.itemOrUndefined(left);
            });

    /** The block entity with a container at {@code pos}, or null when there is none. */
    static ScriptContainer at(ServerLevel level, BlockPos pos) {
        BlockEntity entity = level.getBlockEntity(pos);
        return entity instanceof Container ? new ScriptContainer(entity) : null;
    }

    Container container() {
        return (Container) entity;
    }

    /** The container while its block entity is still in the world; else an {@code Error}. */
    Container live() {
        if (entity.isRemoved()) {
            BlockPos p = entity.getBlockPos();
            throw ScriptRuntime.constructError("Error", "the container at " + p.getX() + " " + p.getY() + " " + p.getZ()
                    + " is gone (the block was removed or its chunk unloaded)");
        }
        return container();
    }

    /** A slot argument: an integer 0 to {@code size - 1}; anything else is a {@code RangeError}. */
    int slot(Object[] args, int i) {
        int size = container().getContainerSize();
        Object v = i < args.length ? args[i] : null;
        if (v instanceof Number n) {
            double d = n.doubleValue();
            if (d == Math.floor(d) && d >= 0 && d < size) {
                return (int) d;
            }
        }
        String shown = v instanceof Number ? Context.toString(v) : ScriptItems.describe(v);
        throw ScriptValues.rangeError("slot " + shown + " is not 0 to " + (size - 1));
    }

    /**
     * Puts {@code stack} into {@code container} as a hopper would (see the class comment) and returns what did not
     * fit (possibly empty). Calls {@code setChanged} once when anything moved.
     */
    static ItemStack add(Container container, ItemStack stack) {
        ItemStack left = stack.copy();
        boolean changed = false;
        for (int i = 0; i < container.getContainerSize() && !left.isEmpty(); i++) {
            if (!container.canPlaceItem(i, left)) {
                continue;
            }
            ItemStack there = container.getItem(i);
            int limit = container.getMaxStackSize(left);
            if (there.isEmpty()) {
                int moved = Math.min(left.getCount(), limit);
                container.setItem(i, left.copyWithCount(moved));
                left.shrink(moved);
                changed = true;
            } else if (ItemStack.isSameItemSameComponents(there, left) && there.getCount() < limit) {
                int moved = Math.min(left.getCount(), limit - there.getCount());
                there.grow(moved);
                left.shrink(moved);
                changed = true;
            }
        }
        if (changed) {
            container.setChanged();
        }
        return left;
    }
}
