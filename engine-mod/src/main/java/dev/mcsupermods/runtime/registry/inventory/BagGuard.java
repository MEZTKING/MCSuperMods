package dev.mcsupermods.runtime.registry.inventory;

import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.loader.ItemInventoryParser;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.OptionalInt;
import net.minecraft.core.NonNullList;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Prediction;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.SimpleContainer;
import net.minecraft.world.SimpleMenuProvider;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.ContainerInput;
import net.minecraft.world.inventory.MenuType;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.ItemContainerContents;

/**
 * The guard of one open bag menu (ADR 0095 D3; B440 S10 found ten duplication routes and this guard closes each): the
 * bag's own slot in the player's inventory is locked (any click on it, a number-key or off-hand swap that would move it,
 * a double-click gathering it), items that cannot go inside container items are refused (shulker boxes, other bags,
 * keep-contents crates), {@code stillValid} closes the menu as soon as the slot no longer holds the very stack that was
 * opened (dropped, moved by a command, the player died or left), and every change of the bag's slots is written into the
 * stack's {@code minecraft:container} at once, and once more when the menu closes. A copy made by any route therefore
 * carries the contents as of the last change and never more (limit Q14, as vanilla shulker boxes).
 *
 * <p>The four menu classes ({@link MsmItemShulkerMenu}, {@link MsmItemChestMenu}, {@link MsmItemHopperMenu},
 * {@link MsmItemDispenserMenu}) override only {@code clicked}, {@code quickMoveStack}, {@code stillValid} and
 * {@code removed} and call this class; none constructs a {@code Slot} (F7 of ADR 0074).
 */
public final class BagGuard {
    /** The off-hand button of a {@link ContainerInput#SWAP} (the F key in a screen) and the off-hand inventory index. */
    static final int OFF_HAND = Inventory.SLOT_OFFHAND;

    /** A bag menu: one of the four menu classes. */
    public interface Menu {
        BagGuard guard();
    }

    /** The bag's slots; every change is written into the bag stack at once (SimpleContainer has no listener). */
    static final class BagContainer extends SimpleContainer {
        private BagGuard guard;

        BagContainer(int size) {
            super(size);
        }

        @Override
        public void setChanged() {
            super.setChanged();
            if (guard != null) {
                guard.write();
            }
        }
    }

    private final ServerPlayer player;
    private final ItemStack bag;
    private final int inventorySlot;
    private final MsmInventoryItem item;
    private final BagContainer container;
    private final List<ItemStack> overflow;
    private boolean closed;

    private BagGuard(ServerPlayer player, ItemStack bag, int inventorySlot, MsmInventoryItem item, BagContainer container,
            List<ItemStack> overflow) {
        this.player = player;
        this.bag = bag;
        this.inventorySlot = inventorySlot;
        this.item = item;
        this.container = container;
        this.overflow = overflow;
        container.guard = this;
    }

    /**
     * Opens the menu of the bag {@code stack} held in {@code hand}; then plays the open sound and fires {@code on_open}
     * (self and other are the player). The stored contents fill the slots in order; stacks stored past the last slot (a
     * definition changed to fewer rows) stay in the stack untouched.
     */
    public static void open(ServerPlayer player, InteractionHand hand, ItemStack stack, MsmInventoryItem item) {
        int slot = hand == InteractionHand.MAIN_HAND ? player.getInventory().getSelectedSlot() : OFF_HAND;
        if (player.getInventory().getItem(slot) != stack) {
            return; // not the stack in the player's own inventory (never expected from a use)
        }
        ItemInventoryParser.Bag spec = item.bag();
        int size = spec.slots();
        ItemContainerContents stored = stack.getOrDefault(DataComponents.CONTAINER, ItemContainerContents.EMPTY);
        NonNullList<ItemStack> all = NonNullList.withSize(Math.max(size, stored.size()), ItemStack.EMPTY);
        stored.copyInto(all);
        BagContainer container = new BagContainer(size);
        for (int n = 0; n < size; n++) {
            container.getItems().set(n, all.get(n));
        }
        List<ItemStack> overflow = new ArrayList<>(all.subList(size, all.size()));
        BagGuard guard = new BagGuard(player, stack, slot, item, container, overflow);
        OptionalInt opened = player.openMenu(new SimpleMenuProvider((id, inventory, p) -> guard.menu(id, inventory),
                stack.getHoverName()));
        if (opened.isPresent() && player.containerMenu instanceof Menu menu && menu.guard() == guard) {
            playSound(player, spec.openSound(), SoundEvents.BARREL_OPEN);
            fire(player, item, spec.onOpen());
        }
    }

    private AbstractContainerMenu menu(int id, Inventory inventory) {
        ItemInventoryParser.Bag spec = item.bag();
        if (spec.shulkerMenu()) {
            return new MsmItemShulkerMenu(id, inventory, container, this);
        }
        return switch (spec.layout()) {
            case CHEST -> new MsmItemChestMenu(chestType(spec.chestRows()), id, inventory, container, spec.chestRows(), this);
            case HOPPER -> new MsmItemHopperMenu(id, inventory, container, this);
            case DISPENSER -> new MsmItemDispenserMenu(id, inventory, container, this);
        };
    }

    private static MenuType<?> chestType(int rows) {
        return switch (rows) {
            case 1 -> MenuType.GENERIC_9x1;
            case 2 -> MenuType.GENERIC_9x2;
            case 3 -> MenuType.GENERIC_9x3;
            case 4 -> MenuType.GENERIC_9x4;
            case 5 -> MenuType.GENERIC_9x5;
            case 6 -> MenuType.GENERIC_9x6;
            default -> throw new IllegalArgumentException("rows " + rows + " (expected 1..6)");
        };
    }

    /** The stack this menu was opened from. */
    public ItemStack bag() {
        return bag;
    }

    /** The player's inventory index of the bag: a hotbar index, or {@link Inventory#SLOT_OFFHAND}. */
    public int inventorySlot() {
        return inventorySlot;
    }

    /** Whether {@code stack} may go into a bag's slot: empty, or an item that fits inside container items. */
    public static boolean fits(ItemStack stack) {
        return stack.isEmpty() || stack.getItem().canFitInsideContainerItems();
    }

    private boolean isBagSlot(Slot slot) {
        return slot.container == player.getInventory() && slot.getContainerSlot() == inventorySlot;
    }

    private static boolean isSwapButton(int button) {
        return button >= 0 && button < Inventory.getSelectionSize() || button == OFF_HAND;
    }

    /**
     * Whether a click must be refused before vanilla handles it: any click on the bag's own slot; a swap whose button
     * is the bag's hotbar index or, for a bag in the off hand, the off-hand button; a double-click gathering bags of
     * this item; and a click, drag, swap or shift-click that would put an item that does not fit into a bag slot.
     */
    boolean refuses(AbstractContainerMenu menu, int slotId, int button, ContainerInput input) {
        int size = container.getContainerSize();
        boolean valid = slotId >= 0 && slotId < menu.slots.size();
        if (valid && isBagSlot(menu.getSlot(slotId))) {
            return true;
        }
        if (input == ContainerInput.SWAP && button == inventorySlot) {
            return true;
        }
        boolean intoBag = valid && slotId < size;
        return switch (input) {
            case PICKUP, QUICK_CRAFT -> intoBag && !fits(menu.getCarried());
            case SWAP -> intoBag && isSwapButton(button) && !fits(player.getInventory().getItem(button));
            case QUICK_MOVE -> valid && slotId >= size && !fits(menu.getSlot(slotId).getItem());
            case PICKUP_ALL -> menu.getCarried().is(item);
            default -> false;
        };
    }

    /** Whether a shift-click of menu slot {@code index} must do nothing (the bag's slot, or an item that does not fit). */
    boolean refusesQuickMove(AbstractContainerMenu menu, int index) {
        if (index < 0 || index >= menu.slots.size()) {
            return false;
        }
        Slot slot = menu.getSlot(index);
        return isBagSlot(slot) || index >= container.getContainerSize() && !fits(slot.getItem());
    }

    /**
     * After every click vanilla handled: anything that does not fit and still reached a bag slot goes back to the
     * player (a safety net behind {@link #refuses}), then the contents are written.
     */
    void afterClick(Player clicker) {
        for (int n = 0; n < container.getContainerSize(); n++) {
            ItemStack stack = container.getItem(n);
            if (!fits(stack)) {
                container.getItems().set(n, ItemStack.EMPTY);
                clicker.getInventory().placeItemBackInInventory(stack, Prediction.SERVER_ONLY);
            }
        }
        write();
    }

    /**
     * Whether the menu may stay open: the player is alive and the bag's slot still holds the very stack opened, not
     * emptied (vanilla's drop splits the stack and leaves the emptied original in the slot).
     */
    boolean stillValid(Player viewer) {
        return !closed && viewer == player && player.isAlive() && !player.isRemoved()
                && player.getInventory().getItem(inventorySlot) == bag && !bag.isEmpty();
    }

    /** The menu closed (the player closed it, {@code stillValid} failed, death, leaving): write, the sound, {@code on_close}. */
    void closed() {
        if (closed) {
            return;
        }
        write();
        closed = true;
        playSound(player, item.bag().closeSound(), SoundEvents.BARREL_CLOSE);
        fire(player, item, item.bag().onClose());
    }

    /** Writes the slots (and any stored overflow) into the bag stack's {@code minecraft:container}. */
    void write() {
        if (closed || bag.isEmpty() || !bag.is(item)) {
            return;
        }
        List<ItemStack> all = new ArrayList<>(container.getItems());
        all.addAll(overflow);
        int last = all.size();
        while (last > 0 && all.get(last - 1).isEmpty()) {
            last--;
        }
        bag.set(DataComponents.CONTAINER, ItemContainerContents.fromItems(all.subList(0, last)));
    }

    private static void playSound(ServerPlayer player, Optional<Identifier> id, SoundEvent fallback) {
        SoundEvent sound = id.flatMap(BuiltInRegistries.SOUND_EVENT::getOptional).orElse(fallback);
        player.level().playSound(null, player.getX(), player.getY(), player.getZ(), sound, SoundSource.PLAYERS, 0.5f,
                player.level().getRandom().nextFloat() * 0.1f + 0.9f);
    }

    private static void fire(ServerPlayer player, MsmInventoryItem item, Optional<Identifier> event) {
        if (event.isPresent() && player.level() instanceof ServerLevel level) {
            EventRunner.fire(item.id(), item.definition().events(), event.get(), EventContext.forItem(level, player));
        }
    }
}
