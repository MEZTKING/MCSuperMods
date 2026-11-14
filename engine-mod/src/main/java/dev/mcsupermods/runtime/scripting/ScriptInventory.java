package dev.mcsupermods.runtime.scripting;

import java.util.List;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import org.mozilla.javascript.Context;

/**
 * {@code Inventory} (ADR 0065 D2) over a {@link ServerPlayer}: numbered slots 0 to 35 (0 to 8 the hotbar) and the
 * equipment slot names ({@code mainhand} is the selected hotbar slot). {@code count}, {@code remove} and {@code find}
 * look at the numbered slots, then (except {@code find}) armour and the off hand. Writes change the server's
 * inventory; the player's open inventory menu sends the change to the client on its next broadcast, as for any
 * server-side change.
 */
final class ScriptInventory {
    private ScriptInventory() {}

    /** Numbered slots: the hotbar and the main inventory. */
    static final int SIZE = Inventory.INVENTORY_SIZE;

    /** Equipment counted after the numbered slots (the main hand is one of them). */
    private static final List<EquipmentSlot> EXTRA = List.of(EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS,
            EquipmentSlot.FEET, EquipmentSlot.OFFHAND);

    static final ScriptType TYPE = ScriptType.of("Inventory")
            .constant("size", ServerPlayer.class, (api, p) -> SIZE)
            .live("selectedSlot", ServerPlayer.class, (api, p) -> p.getInventory().getSelectedSlot())
            .method("get", 1, 1, ServerPlayer.class, (api, p, args) -> api.itemOrUndefined(get(p, slot(args, 0))))
            .method("set", 1, 2, ServerPlayer.class, (api, p, args) -> {
                Object slot = slot(args, 0);
                ItemStack stack = ScriptValues.present(args, 1) ? capped(ScriptItems.spec(api, args, 1)) : ItemStack.EMPTY;
                set(p, slot, stack);
                return null;
            })
            .method("count", 1, 1, ServerPlayer.class, (api, p, args) -> {
                Item item = ScriptItems.item(args, 0);
                int n = 0;
                for (int i = 0; i < SIZE; i++) {
                    n += count(p.getInventory().getItem(i), item);
                }
                for (EquipmentSlot s : EXTRA) {
                    n += count(p.getItemBySlot(s), item);
                }
                return n;
            })
            .method("remove", 1, 2, ServerPlayer.class, (api, p, args) -> {
                Item item = ScriptItems.item(args, 0);
                int left = ScriptValues.present(args, 1)
                        ? (int) Math.max(0, Math.min(Integer.MAX_VALUE, Math.floor(ScriptValues.number(args, 1, "count"))))
                        : Integer.MAX_VALUE;
                int removed = 0;
                for (int i = 0; i < SIZE && left > 0; i++) {
                    int taken = take(p, i, item, left);
                    removed += taken;
                    left -= taken;
                }
                for (int i = 0; i < EXTRA.size() && left > 0; i++) {
                    int taken = take(p, EXTRA.get(i), item, left);
                    removed += taken;
                    left -= taken;
                }
                return removed;
            })
            .method("find", 1, 1, ServerPlayer.class, (api, p, args) -> {
                Item item = ScriptItems.item(args, 0);
                for (int i = 0; i < SIZE; i++) {
                    if (p.getInventory().getItem(i).is(item)) {
                        return i;
                    }
                }
                return -1;
            })
            .method("setComponent", 2, 3, ServerPlayer.class, (api, p, args) -> {
                Object slot = slot(args, 0);
                var type = ScriptItems.componentType(args, 1);
                ItemStack stack = get(p, slot);
                if (stack.isEmpty()) {
                    return null;
                }
                Object value = ScriptValues.present(args, 2) ? args[2] : null;
                set(p, slot, ScriptItems.withComponent(api, stack, type, value));
                return null;
            });

    /** A slot argument: an {@code Integer} 0 to 35 or an {@link EquipmentSlot}; anything else is a {@code RangeError}. */
    static Object slot(Object[] args, int i) {
        Object v = i < args.length ? args[i] : null;
        if (v instanceof Number n) {
            double d = n.doubleValue();
            if (d == Math.floor(d) && d >= 0 && d < SIZE) {
                return (int) d;
            }
            throw ScriptValues.rangeError("slot " + Context.toString(v) + " is not 0 to " + (SIZE - 1) + " or an equipment slot name");
        }
        if (v instanceof CharSequence) {
            return ScriptItems.equipmentSlot(args, i);
        }
        throw ScriptValues.rangeError("slot " + ScriptItems.describe(v) + " is not 0 to " + (SIZE - 1) + " or an equipment slot name");
    }

    static ItemStack get(ServerPlayer p, Object slot) {
        return slot instanceof Integer i ? p.getInventory().getItem(i) : p.getItemBySlot((EquipmentSlot) slot);
    }

    static void set(ServerPlayer p, Object slot, ItemStack stack) {
        if (slot instanceof Integer i) {
            p.getInventory().setItem(i, stack);
        } else {
            p.setItemSlot((EquipmentSlot) slot, stack);
        }
    }

    /** A stack put into a slot holds at most its maximum stack size. */
    static ItemStack capped(ItemStack stack) {
        if (stack.getCount() > stack.getMaxStackSize()) {
            stack.setCount(stack.getMaxStackSize());
        }
        return stack;
    }

    private static int count(ItemStack stack, Item item) {
        return stack.is(item) ? stack.getCount() : 0;
    }

    private static int take(ServerPlayer p, Object slot, Item item, int max) {
        ItemStack stack = get(p, slot);
        if (!stack.is(item)) {
            return 0;
        }
        int taken = Math.min(max, stack.getCount());
        ItemStack rest = stack.copy();
        rest.shrink(taken);
        set(p, slot, rest.isEmpty() ? ItemStack.EMPTY : rest);
        return taken;
    }
}
