package dev.mcsupermods.runtime.registry.inventory;

import net.minecraft.world.Container;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.ContainerInput;
import net.minecraft.world.inventory.ShulkerBoxMenu;
import net.minecraft.world.item.ItemStack;

/**
 * A three-row chest bag's menu: vanilla's shulker box menu, whose slots already refuse items that cannot go inside container items. Overrides {@code clicked}, {@code quickMoveStack},
 * {@code stillValid} and {@code removed} only, each through {@link BagGuard} (ADR 0095 D2, D3); no {@code Slot} of
 * our own.
 */
public class MsmItemShulkerMenu extends ShulkerBoxMenu implements BagGuard.Menu {
    private final BagGuard guard;

    MsmItemShulkerMenu(int id, Inventory inventory, Container container, BagGuard guard) {
        super(id, inventory, container);
        this.guard = guard;
    }

    @Override
    public BagGuard guard() {
        return guard;
    }

    @Override
    public void clicked(int slotId, int button, ContainerInput input, Player player) {
        if (!guard.stillValid(player) || guard.refuses(this, slotId, button, input)) {
            return;
        }
        super.clicked(slotId, button, input, player);
        guard.afterClick(player);
    }

    @Override
    public ItemStack quickMoveStack(Player player, int index) {
        return guard.refusesQuickMove(this, index) ? ItemStack.EMPTY : super.quickMoveStack(player, index);
    }

    @Override
    public boolean stillValid(Player player) {
        return guard.stillValid(player) && super.stillValid(player);
    }

    @Override
    public void removed(Player player) {
        super.removed(player);
        guard.closed();
    }
}
